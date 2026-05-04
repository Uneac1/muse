import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fetch } from 'undici';
import { parseDocument } from 'htmlparser2';
import { findAll, findOne, getOuterHTML, hasChildren, isTag, textContent } from 'domutils';
import type { AnyNode, Element, ParentNode } from 'domhandler';
import type { NewspaperImage } from '../../types';

const execFileAsync = promisify(execFile);

const ARTICLE_TIMEOUT_MS = 12000;
const MAX_DETAIL_TEXT_LENGTH = 50000;

export interface ArticleHtmlCandidate {
  url: string;
  html: string;
  label: string;
}

export interface ExtractedArticleCandidate {
  url: string;
  label: string;
  html: string;
  title: string;
  summary: string;
  originalContent: string;
  images: NewspaperImage[];
  hasFulltext: boolean;
  score: number;
}

export interface ArticleExtractionResult {
  candidates: ExtractedArticleCandidate[];
  best: ExtractedArticleCandidate;
  attemptedCandidates: number;
}

type ReadableCandidateKind = 'article' | 'class-hint' | 'main' | 'dense-block' | 'paragraph-flow' | 'body';

interface ReadableCandidate {
  kind: ReadableCandidateKind;
  html: string;
  text: string;
}

export class NewspaperArticleExtractor {
  async extract(url: string, fallback?: { title?: string; summary?: string }): Promise<ArticleExtractionResult> {
    const htmlCandidates = await this.fetchHtmlCandidates(url);
    const candidates = htmlCandidates
      .map((candidate) => this.extractFromCandidate(candidate, fallback))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) throw new Error('Article html fetch returned no candidates');
    return {
      candidates,
      best,
      attemptedCandidates: htmlCandidates.length,
    };
  }

  extractFromHtml(url: string, html: string, fallback?: { title?: string; summary?: string }, label = 'inline'): ExtractedArticleCandidate {
    return this.extractFromCandidate({ url, html, label }, fallback);
  }

  async fetchHtmlCandidates(url: string): Promise<ArticleHtmlCandidate[]> {
    const primaryHtml = await this.fetchHtml(url);
    const candidates: ArticleHtmlCandidate[] = [{ url, html: primaryHtml, label: 'original' }];
    const variantUrls = this.buildArticleVariantUrls(url, primaryHtml).slice(0, 8);
    const settled = await Promise.allSettled(variantUrls.map(async (variantUrl) => ({
      url: variantUrl,
      html: await this.fetchHtml(variantUrl),
      label: this.describeArticleVariant(url, variantUrl),
    })));

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      if (!result.value.html || result.value.html.length < 200) continue;
      if (candidates.some((item) => item.url === result.value.url || item.html === result.value.html)) continue;
      candidates.push(result.value);
    }

    try {
      const readerUrl = this.buildJinaReaderUrl(url);
      const readerText = await this.fetchHtml(readerUrl);
      if (readerText && readerText.length >= 200 && !candidates.some((item) => item.html === readerText)) {
        candidates.push({ url, html: readerText, label: 'jina-reader' });
      }
    } catch {
      // Reader fallback is opportunistic; regular candidates remain valid.
    }

    return candidates;
  }

  async fetchHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ARTICLE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 muse-mail-reader/1.0',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!res.ok) throw new Error(`Article request failed: ${res.status}`);
      return await res.text();
    } catch (error: any) {
      if (process.platform === 'win32') {
        const script = `
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$headers = @{
  'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 muse-mail-reader/1.0'
  'Accept' = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}
$res = Invoke-WebRequest -UseBasicParsing -Uri '${url.replace(/'/g, "''")}' -Headers $headers -TimeoutSec 20
$res.Content
`.trim();
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
          windowsHide: true,
          timeout: 25000,
          maxBuffer: 4 * 1024 * 1024,
        });
        if (stdout.trim()) return stdout;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  extractTitleAndSummary(html: string, fallback?: { title?: string; summary?: string }): { title: string; summary: string } {
    const readerTitle = html.match(/^Title:\s*(.+)$/mi)?.[1]?.trim() || '';
    const readerSummary = html.match(/^Description:\s*([\s\S]*?)(?:\n[A-Z][A-Za-z ]+:\s|\n\n|$)/m)?.[1]?.trim() || '';
    const title =
      this.decodeEntities(readerTitle) ||
      this.decodeEntities(this.extractMetaContent(html, 'property', 'og:title')) ||
      this.decodeEntities(this.extractMetaContent(html, 'name', 'twitter:title')) ||
      this.decodeEntities(this.extractTag(html, 'title')) ||
      fallback?.title ||
      '';
    const summary =
      fallback?.summary ||
      this.decodeEntities(readerSummary) ||
      this.decodeEntities(this.extractMetaContent(html, 'name', 'description')) ||
      this.decodeEntities(this.extractMetaContent(html, 'property', 'og:description')) ||
      '';
    return { title, summary };
  }

  extractImages(html: string, articleUrl: string): NewspaperImage[] {
    const images: NewspaperImage[] = [];
    const pushImage = (url: string, alt: string, source: 'cover' | 'content', width?: number, height?: number) => {
      const absolute = this.resolveUrl(articleUrl, url);
      if (!absolute || !/^https?:\/\//i.test(absolute)) return;
      if (images.some((item) => item.url === absolute)) return;
      images.push({ url: absolute, alt: alt.trim(), width, height, source });
    };

    const ogImage = this.decodeEntities(this.extractMetaContent(html, 'property', 'og:image'));
    const twitterImage = this.decodeEntities(this.extractMetaContent(html, 'name', 'twitter:image'));
    if (ogImage) pushImage(ogImage, this.decodeEntities(this.extractMetaContent(html, 'property', 'og:image:alt')), 'cover');
    if (twitterImage) pushImage(twitterImage, this.decodeEntities(this.extractMetaContent(html, 'name', 'twitter:image:alt')), 'cover');

    const document = this.parseHtml(html);
    const imageElements = findAll((elem) => elem.name === 'img', document).slice(0, 30);
    for (const image of imageElements) {
      const src = image.attribs.src || image.attribs['data-src'] || image.attribs['data-original'] || image.attribs['data-lazy-src'];
      if (!src) continue;
      const width = Number(image.attribs.width || 0) || undefined;
      const height = Number(image.attribs.height || 0) || undefined;
      pushImage(src, this.decodeEntities(image.attribs.alt || ''), 'content', width, height);
      if (images.length >= 14) return images;
    }

    return images;
  }

  extractReadableContent(html: string, fallback = ''): string {
    const jsonLdArticle = this.extractJsonLdArticleText(html);
    if (this.hasReadableFulltext(jsonLdArticle)) return jsonLdArticle;

    const readerText = this.extractJinaReaderText(html);
    if (this.hasReadableFulltext(readerText)) return readerText;

    const document = this.parseHtml(html);
    const candidates = this.collectReadableCandidates(document)
      .map((candidate) => ({
        ...candidate,
        score: this.scoreReadableCandidate(candidate.kind, candidate.html, candidate.text),
      }))
      .sort((a, b) => b.score - a.score);
    const text = candidates[0]?.text || '';
    return this.hasReadableFulltext(text) ? text : this.cleanArticleText(fallback) || '暂时未能提取正文。';
  }

  htmlToText(html: string): string {
    const document = this.parseHtml(html);
    return this.nodeText(document);
  }

  cleanArticleText(text: string): string {
    const noisePatterns = this.getArticleNoisePatterns();

    return this.decodeEntities(text)
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        const normalizedLine = line.replace(/^-\s*/, '').trim();
        if (!line || /^share$/i.test(line) || /^comments?$/i.test(line)) return false;
        if (/^(title|url source|markdown content|published time|author|description):/i.test(normalizedLine)) return false;
        if (noisePatterns.some((pattern) => pattern.test(normalizedLine))) return false;
        if (/^-\s*$/.test(line)) return false;
        if (/^-\s+/.test(line) && normalizedLine.length <= 40) return false;
        return true;
      })
      .join('\n')
      .slice(0, MAX_DETAIL_TEXT_LENGTH)
      .trim();
  }

  hasReadableFulltext(text: string): boolean {
    const cleaned = this.cleanArticleText(text || '');
    if (!cleaned || cleaned === '暂时未能提取正文。') return false;
    const lines = cleaned.split('\n').filter((part) => part.trim());
    const paragraphs = cleaned.split(/\n{2,}/).filter((part) => part.trim().length >= 40);
    const longLines = lines.filter((part) => part.trim().length >= 80);
    const sentenceCount = (cleaned.match(/[。！？.!?]/g) || []).length;
    const shellHits = lines.filter((line) => this.isLikelyShellLine(line)).length;
    const cjkCount = (cleaned.match(/[\u3400-\u9fff]/g) || []).length;
    const lengthThreshold = cjkCount > cleaned.length * 0.25 ? 160 : 220;
    return cleaned.length >= lengthThreshold
      && (longLines.length >= 2 || paragraphs.length >= 2 || sentenceCount >= 3)
      && shellHits <= Math.max(2, Math.floor(lines.length * 0.4));
  }

  isLikelyShellLine(line: string): boolean {
    const normalized = line.replace(/^-\s*/, '').trim();
    if (!normalized) return false;
    return this.getArticleNoisePatterns().some((pattern) => pattern.test(normalized))
      || /^(open menu|menu|navigation|skip to content|about|apply|faq|share|subscribe|login|sign in|register|search)$/i.test(normalized);
  }

  extractCommentCount(html: string): number {
    const jsonLdBlocks = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
    for (const block of jsonLdBlocks) {
      const raw = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
      const count = this.findCommentCountInJson(raw);
      if (count > 0) return count;
    }
    const direct = html.match(/commentCount["']?\s*[:=]\s*["']?(\d{1,6})/i);
    return direct?.[1] ? Number(direct[1]) : 0;
  }

  decodeEntities(value: string): string {
    return value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/gi, '/')
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
  }

  extractTag(block: string, tag: string): string {
    const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim() : '';
  }

  resolveUrl(base: string, input: string): string {
    try {
      return new URL(input, base).toString();
    } catch {
      return input;
    }
  }

  private extractFromCandidate(candidate: ArticleHtmlCandidate, fallback?: { title?: string; summary?: string }): ExtractedArticleCandidate {
    const { title, summary } = this.extractTitleAndSummary(candidate.html, fallback);
    const images = this.extractImages(candidate.html, candidate.url);
    const originalContent = this.extractReadableContent(candidate.html, summary || title);
    const hasFulltext = this.hasReadableFulltext(originalContent);
    return {
      url: candidate.url,
      label: candidate.label,
      html: candidate.html,
      title: title || fallback?.title || candidate.url,
      summary,
      originalContent,
      images,
      hasFulltext,
      score: this.scoreArticleExtraction(originalContent, images, hasFulltext),
    };
  }

  private parseHtml(html: string) {
    return parseDocument(html, {
      decodeEntities: true,
      lowerCaseAttributeNames: true,
      lowerCaseTags: true,
    });
  }

  private collectReadableCandidates(document: ParentNode): ReadableCandidate[] {
    const allElements = findAll(() => true, document);
    const candidates: ReadableCandidate[] = [];
    const seen = new Set<string>();
    const push = (kind: ReadableCandidateKind, element: Element, textOverride?: string) => {
      const html = getOuterHTML(element);
      if (!html.trim() || seen.has(html)) return;
      seen.add(html);
      const text = this.cleanArticleText(textOverride || this.nodeText(element));
      if (!text) return;
      candidates.push({ kind, html, text });
    };

    for (const element of allElements) {
      if (element.name === 'article') push('article', element);
    }

    const classHints = [
      'article',
      'articlebody',
      'article-body',
      'article_content',
      'body-content',
      'content',
      'content-body',
      'entry-content',
      'main-content',
      'markdown-body',
      'post',
      'post-content',
      'rich-text',
      'story',
      'story-body',
      'text-content',
      'topic-body',
    ];
    for (const element of allElements) {
      const signature = [
        element.attribs.class || '',
        element.attribs.id || '',
        element.attribs.itemprop || '',
        element.attribs['data-testid'] || '',
        element.attribs.role || '',
      ].join(' ').toLowerCase();
      if (classHints.some((hint) => signature.includes(hint))) push('class-hint', element);
    }

    for (const element of allElements) {
      if (element.name === 'main') push('main', element);
    }

    for (const element of allElements) {
      if (element.name !== 'section' && element.name !== 'div') continue;
      const paragraphCount = findAll((child) => child.name === 'p', element).length;
      if (paragraphCount < 3) continue;
      const flowText = this.extractBlockFlowText(element);
      const textLength = this.cleanArticleText(flowText || this.nodeText(element)).length;
      if (textLength >= 300) push('dense-block', element, flowText);
    }

    const body = findOne((element) => element.name === 'body', document);
    if (body) {
      const flowText = this.extractBlockFlowText(body);
      if (flowText) push('paragraph-flow', body, flowText);
      push('body', body);
    }
    return candidates;
  }

  private extractBlockFlowText(element: Element): string {
    const blocks = findAll((child) => /^(p|h1|h2|h3|h4|blockquote|li|pre)$/i.test(child.name), element);
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const block of blocks) {
      const text = this.nodeText(block)
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || text.length < 12) continue;
      if (this.isLikelyShellLine(text)) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(text);
    }

    return lines.join('\n\n');
  }

  private nodeText(node: AnyNode): string {
    if (isTag(node) && /^(script|style|noscript|svg|iframe|nav|header|footer|aside|form|button|input|select|textarea)$/i.test(node.name)) return '';
    if (!hasChildren(node)) return this.decodeEntities(textContent(node));

    const lines: string[] = [];
    const walk = (current: AnyNode) => {
      if (isTag(current)) {
        if (/^(script|style|noscript|svg|iframe|nav|header|footer|aside|form|button|input|select|textarea)$/i.test(current.name)) return;
        if (current.name === 'br') {
          lines.push('\n');
          return;
        }
        if (current.name === 'li') lines.push('\n- ');
      }
      if (!hasChildren(current)) {
        const text = this.decodeEntities(textContent(current)).replace(/\s+/g, ' ');
        if (text.trim()) lines.push(text);
        return;
      }
      for (const child of current.children) walk(child);
      if (isTag(current) && /^(p|div|section|article|li|h1|h2|h3|h4|h5|h6|blockquote|pre)$/i.test(current.name)) {
        lines.push('\n\n');
      }
    };

    walk(node);
    return lines
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private extractJsonLdArticleText(html: string): string {
    const blocks = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    const candidates: string[] = [];
    for (const block of blocks) {
      const raw = block
        .replace(/^<script\b[^>]*>/i, '')
        .replace(/<\/script>$/i, '')
        .trim();
      try {
        const parsed = JSON.parse(this.decodeEntities(raw));
        const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
        while (stack.length > 0) {
          const item = stack.shift();
          if (!item || typeof item !== 'object') continue;
          const type = Array.isArray(item['@type']) ? item['@type'].join(' ') : String(item['@type'] || '');
          if (/Article|NewsArticle|BlogPosting|DiscussionForumPosting/i.test(type)) {
            const body = String(item.articleBody || item.text || item.description || '').trim();
            if (body) candidates.push(this.cleanArticleText(body));
          }
          for (const value of Object.values(item)) {
            if (Array.isArray(value)) stack.push(...value);
            else if (value && typeof value === 'object') stack.push(value);
          }
        }
      } catch {
        // Invalid JSON-LD should not block regular HTML extraction.
      }
    }
    return candidates.sort((a, b) => b.length - a.length)[0] || '';
  }

  private scoreArticleExtraction(text: string, images: NewspaperImage[], hasFulltext: boolean): number {
    const cleaned = this.cleanArticleText(text || '');
    const lines = cleaned.split('\n').filter((part) => part.trim());
    const longLines = lines.filter((part) => part.trim().length >= 80).length;
    const sentenceCount = (cleaned.match(/[。！？.!?]/g) || []).length;
    const shellHits = lines.filter((line) => this.isLikelyShellLine(line)).length;
    return cleaned.length
      + longLines * 240
      + sentenceCount * 80
      + Math.min(images.length, 8) * 90
      + (hasFulltext ? 10_000 : 0)
      - shellHits * 400;
  }

  private scoreReadableCandidate(kind: ReadableCandidateKind, html: string, text: string): number {
    if (!text) return Number.NEGATIVE_INFINITY;
    const paragraphs = text.split(/\n{2,}/).filter((part) => part.trim().length >= 24);
    const lines = text.split('\n').filter((part) => part.trim());
    const shortLines = lines.filter((line) => line.trim().length <= 42).length;
    const shellHits = lines.filter((line) => this.isLikelyShellLine(line)).length;
    const linkCount = (html.match(/<a\b/gi) || []).length;
    const kindBonus = kind === 'article' ? 300 : kind === 'class-hint' ? 220 : kind === 'main' ? 140 : kind === 'dense-block' ? 150 : kind === 'paragraph-flow' ? 180 : 0;
    return text.length
      + paragraphs.length * 150
      + kindBonus
      - shellHits * 220
      - shortLines * 12
      - linkCount * 5;
  }

  private extractMetaContent(html: string, attr: 'name' | 'property', key: string): string {
    const document = this.parseHtml(html);
    const targetKey = key.toLowerCase();
    const meta = findOne((element) => (
      element.name === 'meta'
      && String(element.attribs[attr] || '').toLowerCase() === targetKey
      && typeof element.attribs.content === 'string'
    ), document);
    return meta?.attribs.content?.trim() || '';
  }

  private buildArticleVariantUrls(url: string, html: string): string[] {
    const variants = new Set<string>();
    const push = (value: string) => {
      const resolved = this.resolveUrl(url, this.decodeEntities(value || '').trim());
      if (/^https?:\/\//i.test(resolved) && resolved !== url) variants.add(resolved);
    };

    const document = this.parseHtml(html);
    const links = findAll((element) => element.name === 'link', document);
    for (const link of links) {
      const rel = String(link.attribs.rel || '').toLowerCase();
      const href = link.attribs.href || '';
      if (href && (rel.includes('amphtml') || rel.includes('canonical'))) push(href);
    }

    try {
      const parsed = new URL(url);
      const originalSearch = parsed.search;
      parsed.search = originalSearch ? `${originalSearch}&output=1` : '?output=1';
      push(parsed.toString());
      parsed.search = originalSearch ? `${originalSearch}&amp=1` : '?amp=1';
      push(parsed.toString());
      parsed.search = originalSearch ? `${originalSearch}&view=article` : '?view=article';
      push(parsed.toString());
      parsed.search = originalSearch;
      parsed.pathname = parsed.pathname.replace(/\/$/, '') + '/amp';
      push(parsed.toString());
    } catch {
      // URL parsing failures are handled by the primary fetch path.
    }

    return [...variants];
  }

  private buildJinaReaderUrl(url: string): string {
    return `https://r.jina.ai/${url}`;
  }

  private extractJinaReaderText(raw: string): string {
    if (!/^Title:/m.test(raw) && !/^Markdown Content:/m.test(raw)) return '';
    const content = raw.split(/^Markdown Content:\s*$/mi).pop() || raw;
    return this.cleanArticleText(content
      .replace(/^Title:.*$/gmi, '')
      .replace(/^URL Source:.*$/gmi, '')
      .replace(/^Published Time:.*$/gmi, '')
      .replace(/^Markdown Content:\s*$/gmi, '')
      .replace(/!\[[^\]]*]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)]\([^)]+\)/g, '$1'));
  }

  private describeArticleVariant(originalUrl: string, candidateUrl: string): string {
    if (candidateUrl.includes('/amp') || /[?&]amp=/.test(candidateUrl)) return 'amp';
    if (/[?&]output=1/.test(candidateUrl)) return 'reader-output';
    if (/[?&]view=article/.test(candidateUrl)) return 'article-view';
    try {
      const original = new URL(originalUrl);
      const candidate = new URL(candidateUrl);
      if (original.hostname === candidate.hostname) return 'canonical';
    } catch {}
    return 'alternate';
  }

  private findCommentCountInJson(raw: string): number {
    try {
      const payload = JSON.parse(raw);
      const queue = Array.isArray(payload) ? [...payload] : [payload];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== 'object') continue;
        const maybe = Number((current as any).commentCount || 0);
        if (maybe > 0) return maybe;
        for (const value of Object.values(current as Record<string, unknown>)) {
          if (value && typeof value === 'object') queue.push(value);
        }
      }
    } catch {
      return 0;
    }
    return 0;
  }

  private getArticleNoisePatterns(): RegExp[] {
    return [
      /^subscribe$/i,
      /^log in$/i,
      /^sign in$/i,
      /^my account$/i,
      /^newsletters?$/i,
      /^the brief$/i,
      /^impactalpha open$/i,
      /^impactalpha latin america$/i,
      /^impact investing careers$/i,
      /^lp \/ gp$/i,
      /^climate$/i,
      /^cop watch$/i,
      /^climate tech$/i,
      /^deploy!?$/i,
      /^green infrastructure$/i,
      /^sustainable fashion$/i,
      /^open menu$/i,
      /^skip to content$/i,
      /^navigation$/i,
      /^about$/i,
      /^apply$/i,
      /^faq$/i,
      /^search$/i,
      /^share this/i,
      /^table of contents$/i,
      /^previous$/i,
      /^next$/i,
      /^related articles?$/i,
    ];
  }
}
