import { fetch } from 'undici';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  NewspaperArticle,
  NewspaperArticleDetail,
  NewspaperBriefing,
  NewspaperSection,
  NewspaperSourceStatus,
  NewspaperTopic,
} from '../types';

const execFileAsync = promisify(execFile);

interface FeedSource {
  name: string;
  url: string;
  weight: number;
  keywords?: string[];
}

interface SectionConfig {
  id: string;
  emoji: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  accent: string;
  topics: NewspaperTopic[];
  sources: FeedSource[];
}

interface ParsedSourceResult {
  source: FeedSource;
  items: NewspaperArticle[];
  error?: string;
}

interface ArticleSeed {
  url: string;
  source?: string;
  sourceUrl?: string;
  publishedAt?: string | null;
  title?: string;
  titleZh?: string;
  summary?: string;
  summaryZh?: string;
}

interface TranslationResult {
  text: string;
  mode: 'live' | 'fallback';
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const SOURCE_CACHE_TTL_MS = 20 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2500;
const ARTICLE_TIMEOUT_MS = 12000;
const TRANSLATE_TIMEOUT_MS = 4500;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 12;
const TRANSLATION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_DETAIL_TEXT_LENGTH = 16000;
const MAX_TRANSLATION_CHUNK = 900;

const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: 'tech-engineering',
    emoji: '💻',
    title: '科技与工程',
    titleEn: 'Technology & Engineering',
    description: 'AI、数据、开发、安全、云原生与硬件的高价值信号台。',
    descriptionEn: 'High-signal coverage across AI, data, software, security, cloud, and hardware.',
    accent: 'from-sky-500/25 via-cyan-500/15 to-transparent',
    topics: [
      { zh: 'AI / 机器学习 / 深度学习', en: 'AI / Machine Learning / Deep Learning' },
      { zh: '数据科学 / 大数据', en: 'Data Science / Big Data' },
      { zh: '前端开发（Web / 移动端）', en: 'Frontend (Web / Mobile)' },
      { zh: '后端开发', en: 'Backend Engineering' },
      { zh: '全栈工程', en: 'Full-stack Engineering' },
      { zh: '区块链 / Web3', en: 'Blockchain / Web3' },
      { zh: '网络安全', en: 'Cybersecurity' },
      { zh: '云计算 / DevOps', en: 'Cloud / DevOps' },
      { zh: '嵌入式 / 硬件开发', en: 'Embedded / Hardware' },
    ],
    sources: [
      { name: 'Hacker News', url: 'https://hnrss.org/frontpage', weight: 1.46, keywords: ['engineering', 'ai', 'security', 'infrastructure', 'web'] },
      { name: 'InfoQ', url: 'https://www.infoq.com/feed/', weight: 1.38, keywords: ['architecture', 'frontend', 'backend', 'cloud', 'devops'] },
      { name: 'Google Research', url: 'https://research.google/blog/rss/', weight: 1.21, keywords: ['research', 'machine learning', 'deep learning'] },
      { name: 'arXiv cs.LG', url: 'https://export.arxiv.org/rss/cs.LG', weight: 1.18, keywords: ['learning', 'model', 'dataset'] },
      { name: 'The Verge AI', url: 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml', weight: 1.15, keywords: ['ai', 'product', 'model'] },
    ],
  },
  {
    id: 'linuxdo-forum',
    emoji: '🐧',
    title: 'Linux.do 论坛',
    titleEn: 'Linux.do Forum',
    description: '独立追踪 Linux.do 社区里的热门帖子、工具讨论和高信号开发话题。',
    descriptionEn: 'A standalone board for high-signal Linux.do discussions, tools, and engineering threads.',
    accent: 'from-lime-500/25 via-emerald-500/15 to-transparent',
    topics: [
      { zh: '社区讨论', en: 'Community Threads' },
      { zh: '开源工具', en: 'Open-source Tools' },
      { zh: 'AI 工作流', en: 'AI Workflows' },
      { zh: '效率实践', en: 'Productivity Practices' },
    ],
    sources: [
      { name: 'Linux.do', url: 'https://linux.do/latest.rss', weight: 1.38, keywords: ['linux', 'opensource', 'ai', 'development', 'tooling', 'workflow'] },
    ],
  },
  {
    id: 'github-signals',
    emoji: '🐙',
    title: 'GitHub 消息',
    titleEn: 'GitHub Signals',
    description: '把 GitHub 官方产品更新、平台变更和工程消息单独聚成一个频道。',
    descriptionEn: 'A dedicated channel for GitHub product updates, platform changes, and engineering signals.',
    accent: 'from-slate-500/25 via-zinc-500/15 to-transparent',
    topics: [
      { zh: '平台更新', en: 'Platform Updates' },
      { zh: '工程博客', en: 'Engineering Blog' },
      { zh: 'Actions / CI', en: 'Actions / CI' },
      { zh: '开发者工具', en: 'Developer Tools' },
    ],
    sources: [
      { name: 'GitHub Blog', url: 'https://github.blog/feed/', weight: 1.35, keywords: ['github', 'engineering', 'copilot', 'opensource'] },
      { name: 'GitHub Changelog', url: 'https://github.blog/changelog/feed/', weight: 1.32, keywords: ['release', 'actions', 'api', 'security', 'platform'] },
    ],
  },
  {
    id: 'creative-design',
    emoji: '🎨',
    title: '创意与设计',
    titleEn: 'Creative & Design',
    description: 'UI/UX、视觉、工业与建筑设计的案例、方法与美学线索。',
    descriptionEn: 'A dense board of UI/UX, visual, industrial, and architectural design signals.',
    accent: 'from-rose-500/25 via-orange-500/15 to-transparent',
    topics: [
      { zh: 'UI / UX 设计', en: 'UI / UX Design' },
      { zh: '平面设计', en: 'Graphic Design' },
      { zh: '工业设计', en: 'Industrial Design' },
      { zh: '动画 / 游戏设计', en: 'Animation / Game Design' },
      { zh: '视觉传达', en: 'Visual Communication' },
      { zh: '建筑设计', en: 'Architecture' },
      { zh: '数字媒体艺术', en: 'Digital Media Art' },
    ],
    sources: [
      { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', weight: 1.34, keywords: ['ux', 'ui', 'design system', 'product design'] },
      { name: 'Creative Bloq', url: 'https://www.creativebloq.com/feed', weight: 1.27, keywords: ['visual', 'motion', 'brand', 'illustration'] },
      { name: 'Core77', url: 'https://www.core77.com/rss/all', weight: 1.26, keywords: ['industrial', 'product design', 'prototype'] },
      { name: 'Dezeen', url: 'https://www.dezeen.com/feed/', weight: 1.22, keywords: ['architecture', 'space', 'studio'] },
      { name: 'A List Apart', url: 'https://alistapart.com/main/feed/', weight: 1.15, keywords: ['web', 'ux', 'content design'] },
    ],
  },
  {
    id: 'business-management',
    emoji: '📊',
    title: '商业与管理',
    titleEn: 'Business & Management',
    description: '增长、产品、投资、电商与品牌的策略变化和执行细节。',
    descriptionEn: 'Growth, product, investing, commerce, and brand strategy in one compact board.',
    accent: 'from-emerald-500/25 via-lime-500/15 to-transparent',
    topics: [
      { zh: '市场营销 / 增长', en: 'Marketing / Growth' },
      { zh: '产品经理', en: 'Product Management' },
      { zh: '商业分析', en: 'Business Analysis' },
      { zh: '创业 / 投资', en: 'Startup / Investing' },
      { zh: '电商 / 跨境电商', en: 'E-commerce / Cross-border Commerce' },
      { zh: '品牌管理', en: 'Brand Management' },
    ],
    sources: [
      { name: 'a16z', url: 'https://a16z.com/feed/', weight: 1.36, keywords: ['startup', 'market', 'product', 'investment'] },
      { name: 'Lenny Newsletter', url: 'https://www.lennysnewsletter.com/feed', weight: 1.34, keywords: ['product', 'growth', 'manager', 'strategy'] },
      { name: 'Shopify Blog', url: 'https://www.shopify.com/blog.atom', weight: 1.24, keywords: ['commerce', 'ecommerce', 'retail'] },
      { name: 'Seth Godin', url: 'https://seths.blog/feed/', weight: 1.2, keywords: ['marketing', 'brand', 'positioning'] },
      { name: 'Y Combinator', url: 'https://www.ycombinator.com/blog/rss/', weight: 1.17, keywords: ['startup', 'founder', 'growth'] },
    ],
  },
  {
    id: 'society-humanities',
    emoji: '🌍',
    title: '社会与人文',
    titleEn: 'Society & Humanities',
    description: '政治、国际关系、历史、哲学和教育的解释型内容集合。',
    descriptionEn: 'Interpretive coverage of politics, international affairs, history, philosophy, and education.',
    accent: 'from-indigo-500/25 via-blue-500/15 to-transparent',
    topics: [
      { zh: '政治 / 国际关系', en: 'Politics / International Relations' },
      { zh: '社会学', en: 'Sociology' },
      { zh: '文化研究', en: 'Cultural Studies' },
      { zh: '历史', en: 'History' },
      { zh: '哲学', en: 'Philosophy' },
      { zh: '教育', en: 'Education' },
    ],
    sources: [
      { name: 'Aeon', url: 'https://aeon.co/feed.rss', weight: 1.32, keywords: ['philosophy', 'history', 'society', 'culture'] },
      { name: 'Brookings', url: 'https://www.brookings.edu/feed/', weight: 1.23, keywords: ['policy', 'international', 'education'] },
      { name: 'Open Culture', url: 'https://www.openculture.com/feed', weight: 1.16, keywords: ['culture', 'history', 'education'] },
      { name: 'Foreign Affairs', url: 'https://www.foreignaffairs.com/rss.xml', weight: 1.28, keywords: ['geopolitics', 'international', 'policy'] },
      { name: 'The Conversation', url: 'https://theconversation.com/global/articles.atom', weight: 1.18, keywords: ['society', 'education', 'culture'] },
    ],
  },
  {
    id: 'public-impact',
    emoji: '❤️',
    title: '公益与社会影响',
    titleEn: 'Public Impact',
    description: 'ESG、可持续、环保、社会创新与公共政策的行动面板。',
    descriptionEn: 'A practical board for ESG, sustainability, environment, innovation, and public policy.',
    accent: 'from-red-500/25 via-pink-500/15 to-transparent',
    topics: [
      { zh: '扶贫 / 乡村振兴', en: 'Poverty Reduction / Rural Revitalization' },
      { zh: '公益组织 / NGO', en: 'NGO / Nonprofit' },
      { zh: '可持续发展 / ESG', en: 'Sustainability / ESG' },
      { zh: '环境保护', en: 'Environmental Protection' },
      { zh: '公共政策', en: 'Public Policy' },
      { zh: '社会创新', en: 'Social Innovation' },
    ],
    sources: [
      { name: 'SSIR', url: 'https://ssir.org/site/rss', weight: 1.34, keywords: ['social innovation', 'nonprofit', 'impact'] },
      { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', weight: 1.24, keywords: ['development', 'policy', 'climate'] },
      { name: 'UNEP', url: 'https://www.unep.org/rss.xml', weight: 1.19, keywords: ['environment', 'sustainability', 'esg'] },
      { name: 'World Economic Forum', url: 'https://www.weforum.org/agenda/feed/', weight: 1.15, keywords: ['esg', 'climate', 'social impact'] },
      { name: 'ImpactAlpha', url: 'https://impactalpha.com/feed/', weight: 1.21, keywords: ['impact', 'sustainability', 'capital'] },
    ],
  },
  {
    id: 'personal-growth',
    emoji: '🧠',
    title: '个体发展与软技能',
    titleEn: 'Personal Growth & Soft Skills',
    description: '心理、认知、领导力、表达与写作内容的高密度观察台。',
    descriptionEn: 'A high-density board for psychology, cognition, leadership, communication, and writing.',
    accent: 'from-amber-500/25 via-yellow-500/15 to-transparent',
    topics: [
      { zh: '心理学', en: 'Psychology' },
      { zh: '认知科学', en: 'Cognitive Science' },
      { zh: '领导力', en: 'Leadership' },
      { zh: '沟通表达', en: 'Communication' },
      { zh: '写作 / 内容创作', en: 'Writing / Content Creation' },
    ],
    sources: [
      { name: 'Farnam Street', url: 'https://fs.blog/feed/', weight: 1.31, keywords: ['thinking', 'decision', 'leadership'] },
      { name: 'Ness Labs', url: 'https://nesslabs.com/feed', weight: 1.24, keywords: ['psychology', 'cognition', 'writing'] },
      { name: 'James Clear', url: 'https://jamesclear.com/feed', weight: 1.18, keywords: ['habit', 'behavior', 'writing'] },
      { name: 'Seth Godin', url: 'https://seths.blog/feed/', weight: 1.17, keywords: ['communication', 'writing', 'leadership'] },
      { name: 'Behavioral Scientist', url: 'https://behavioralscientist.org/feed/', weight: 1.19, keywords: ['psychology', 'behavior', 'cognition'] },
    ],
  },
];

export class NewspaperService {
  private cache: NewspaperBriefing | null = null;
  private cacheExpiresAt = 0;
  private inflight: Promise<NewspaperBriefing> | null = null;
  private sourceCache = new Map<string, { value: ParsedSourceResult; expiresAt: number }>();
  private translationCache = new Map<string, { value: string; expiresAt: number; mode: 'live' | 'fallback' }>();
  private detailCache = new Map<string, { value: NewspaperArticleDetail; expiresAt: number }>();

  async getBriefing(options?: { refresh?: boolean; limit?: number }): Promise<NewspaperBriefing> {
    const refresh = Boolean(options?.refresh);
    const limit = Math.min(MAX_LIMIT, Math.max(4, options?.limit ?? DEFAULT_LIMIT));
    const now = Date.now();

    if (!refresh && this.cache) {
      if (now < this.cacheExpiresAt) {
        return this.sliceBriefing(this.cache, limit);
      }

      this.warmBriefingInBackground();
      return this.sliceBriefing(this.cache, limit);
    }
    if (!refresh && this.inflight) {
      return this.sliceBriefing(await this.inflight, limit);
    }

    this.inflight = this.buildBriefing();
    try {
      const briefing = await this.inflight;
      this.cache = briefing;
      this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      return this.sliceBriefing(briefing, limit);
    } finally {
      this.inflight = null;
    }
  }

  private warmBriefingInBackground() {
    if (this.inflight) return;

    this.inflight = this.buildBriefing();
    this.inflight
      .then((briefing) => {
        this.cache = briefing;
        this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      })
      .finally(() => {
        this.inflight = null;
      });
  }

  async getArticleDetail(seed: ArticleSeed): Promise<NewspaperArticleDetail> {
    const key = seed.url.trim();
    if (!key) throw new Error('Article url is required');

    const cached = this.detailCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const html = await this.fetchArticleHtml(seed.url);
      const title =
        this.decodeEntities(this.extractMetaContent(html, 'property', 'og:title')) ||
        this.decodeEntities(this.extractMetaContent(html, 'name', 'twitter:title')) ||
        this.decodeEntities(this.extractTag(html, 'title')) ||
        seed.title ||
        seed.url;
      const summary =
        seed.summary ||
        this.decodeEntities(this.extractMetaContent(html, 'name', 'description')) ||
        this.decodeEntities(this.extractMetaContent(html, 'property', 'og:description'));
      const originalContent = this.extractReadableContent(html, summary || title);
      const titleTranslation = await this.translateTextDetailed(title, [], 'title');
      const summaryTranslation = summary ? await this.translateTextDetailed(summary, [], 'summary') : { text: '', mode: titleTranslation.mode };
      const bodyTranslation = await this.translateLongText(originalContent);

      const detail: NewspaperArticleDetail = {
        url: seed.url,
        source: seed.source || this.extractDomain(seed.url),
        domain: this.extractDomain(seed.url),
        sourceUrl: seed.sourceUrl,
        publishedAt: seed.publishedAt || null,
        title,
        titleZh: seed.titleZh || titleTranslation.text || title,
        summary: summary || '',
        summaryZh: seed.summaryZh || summaryTranslation.text || summary || '',
        originalContent,
        translatedContent: bodyTranslation.text,
        extractedAt: new Date().toISOString(),
        translationMode: bodyTranslation.mode === 'fallback' || titleTranslation.mode === 'fallback' ? 'fallback' : 'live',
      };

      this.detailCache.set(key, { value: detail, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
      return detail;
    } catch {
      const detail = await this.buildFallbackArticleDetail(seed);
      this.detailCache.set(key, { value: detail, expiresAt: Date.now() + Math.min(10 * 60 * 1000, DETAIL_CACHE_TTL_MS) });
      return detail;
    }
  }

  private async buildFallbackArticleDetail(seed: ArticleSeed): Promise<NewspaperArticleDetail> {
    const title = seed.title?.trim() || seed.url;
    const summary = seed.summary?.trim() || '暂时未能抓取正文，当前先展示摘要模式。';
    const providedTitleZh = seed.titleZh?.trim() || '';
    const providedSummaryZh = seed.summaryZh?.trim() || '';
    const [titleTranslation, summaryTranslation] = await Promise.all([
      this.translateTextDetailed(title, [], 'title'),
      summary ? this.translateTextDetailed(summary, [], 'summary') : Promise.resolve({ text: '', mode: 'fallback' as const }),
    ]);
    const titleZh = this.pickChineseDisplayText(providedTitleZh, titleTranslation.text, title, 'title');
    const summaryZh = this.pickChineseDisplayText(providedSummaryZh, summaryTranslation.text, summary, 'summary');
    const originalContent = [title, summary].filter(Boolean).join('\n\n');
    const translatedContent = [titleZh, summaryZh].filter(Boolean).join('\n\n');
    const translationMode = titleTranslation.mode === 'live' || summaryTranslation.mode === 'live' ? 'live' : 'fallback';

    return {
      url: seed.url,
      source: seed.source || this.extractDomain(seed.url),
      domain: this.extractDomain(seed.url),
      sourceUrl: seed.sourceUrl,
      publishedAt: seed.publishedAt || null,
      title,
      titleZh,
      summary,
      summaryZh,
      originalContent,
      translatedContent,
      extractedAt: new Date().toISOString(),
      translationMode,
    };
  }

  private sliceBriefing(briefing: NewspaperBriefing, limit: number): NewspaperBriefing {
    const sections = briefing.sections.map((section) => ({
      ...section,
      items: section.items.slice(0, limit),
      totalItems: section.items.length,
    }));

    return {
      ...briefing,
      totalItems: sections.reduce((sum, section) => sum + section.items.length, 0),
      sections,
    };
  }

  private async buildBriefing(): Promise<NewspaperBriefing> {
    const sections = await Promise.all(SECTION_CONFIGS.map((config) => this.buildSection(config)));
    return {
      generatedAt: new Date().toISOString(),
      cacheTtlMinutes: Math.round(CACHE_TTL_MS / 60000),
      totalItems: sections.reduce((sum, section) => sum + section.items.length, 0),
      totalSources: sections.reduce((sum, section) => sum + section.totalSources, 0),
      sections,
    };
  }

  private async buildSection(config: SectionConfig): Promise<NewspaperSection> {
    const sourceResults = await Promise.all(config.sources.map((source) => this.fetchSourceItems(source, config.topics)));
    const rawItems = sourceResults.flatMap((result) => result.items);
    const dedupedItems = this.deduplicateItems(rawItems).sort((a, b) => b.score - a.score).slice(0, MAX_LIMIT);
    const translatedItems = this.translateArticlesFast(dedupedItems);
    const items = translatedItems.map((item, index) => ({ ...item, rank: index + 1 }));
    const sources: NewspaperSourceStatus[] = sourceResults.map((result) => ({
      name: result.source.name,
      url: result.source.url,
      status: result.error ? 'failed' : 'ok',
      itemCount: result.items.length,
      error: result.error,
    }));
    const successCount = sources.filter((source) => source.status === 'ok').length;
    const failedSources = sources.filter((source) => source.status === 'failed').map((source) => source.name);
    const status: NewspaperSection['status'] = items.length === 0 ? 'empty' : successCount === config.sources.length ? 'ok' : 'partial';

    return {
      id: config.id,
      emoji: config.emoji,
      title: config.title,
      titleEn: config.titleEn,
      description: config.description,
      descriptionEn: config.descriptionEn,
      topics: config.topics,
      accent: config.accent,
      status,
      sourceCount: successCount,
      totalSources: config.sources.length,
      totalItems: items.length,
      sources,
      failedSources,
      items,
    };
  }

  private deduplicateItems(items: NewspaperArticle[]): NewspaperArticle[] {
    const map = new Map<string, NewspaperArticle>();
    for (const item of items) {
      const key = `${item.domain}::${item.url || item.title}`.toLowerCase();
      const existing = map.get(key);
      if (!existing || item.score > existing.score) map.set(key, item);
    }
    return [...map.values()];
  }

  private async fetchSourceItems(source: FeedSource, topics: NewspaperTopic[]): Promise<ParsedSourceResult> {
    const cached = this.sourceCache.get(source.url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const xml = await this.fetchSourceXml(source, controller.signal);
      const result = { source, items: this.parseFeed(xml, source, topics) };
      this.sourceCache.set(source.url, { value: result, expiresAt: Date.now() + SOURCE_CACHE_TTL_MS });
      return result;
    } catch (error: any) {
      const result = { source, items: [], error: error?.message || 'Feed fetch failed' };
      this.sourceCache.set(source.url, { value: result, expiresAt: Date.now() + Math.min(120000, SOURCE_CACHE_TTL_MS / 4) });
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchSourceXml(source: FeedSource, signal: AbortSignal): Promise<string> {
    try {
      const res = await fetch(source.url, {
        signal,
        headers: {
          'user-agent': 'muse-mail-newspaper/3.0',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
      });
      if (!res.ok) {
        throw new Error(`Feed request failed: ${res.status}`);
      }
      return await res.text();
    } catch (error: any) {
      if (this.shouldUseWindowsFeedFallback(source.url, error)) {
        return this.fetchFeedViaPowerShell(source.url);
      }
      throw error;
    }
  }

  private shouldUseWindowsFeedFallback(url: string, error: any) {
    return process.platform === 'win32'
      && /linux\.do/i.test(url)
      && (error?.name === 'AbortError' || /aborted/i.test(error?.message || ''));
  }

  private async fetchFeedViaPowerShell(url: string): Promise<string> {
    const script = `
$ProgressPreference='SilentlyContinue'
$res = Invoke-WebRequest -UseBasicParsing -Uri '${url.replace(/'/g, "''")}' -TimeoutSec 20
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$res.Content
`.trim();

    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      timeout: 25000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const content = stdout.trim();
    if (!content) {
      throw new Error('Windows feed fallback returned empty content');
    }
    return content;
  }

  private parseFeed(xml: string, source: FeedSource, topics: NewspaperTopic[]): NewspaperArticle[] {
    const itemBlocks = this.extractBlocks(xml, 'item');
    const entryBlocks = itemBlocks.length > 0 ? [] : this.extractBlocks(xml, 'entry');
    const blocks = itemBlocks.length > 0 ? itemBlocks : entryBlocks;
    const items = blocks.map((block): NewspaperArticle | null => {
      const title = this.decodeEntities(this.firstNonEmpty([this.extractTag(block, 'title')]));
      const url = this.extractLink(block);
      const summary = this.decodeEntities(this.stripTags(this.firstNonEmpty([
        this.extractTag(block, 'description'),
        this.extractTag(block, 'summary'),
        this.extractTag(block, 'content'),
        this.extractTag(block, 'content:encoded'),
      ]))).replace(/\s+/g, ' ').trim();
      const publishedAt = this.normalizeDate(this.firstNonEmpty([
        this.extractTag(block, 'pubDate'),
        this.extractTag(block, 'published'),
        this.extractTag(block, 'updated'),
        this.extractTag(block, 'dc:date'),
      ]));
      if (!title || !url) return null;

      const domain = this.extractDomain(url);
      const scoring = this.scoreArticle(`${title} ${summary}`.toLowerCase(), publishedAt, source, topics);
      return {
        title,
        titleZh: '',
        url,
        summary: summary.slice(0, 280),
        summaryZh: '',
        source: source.name,
        sourceUrl: source.url,
        domain,
        publishedAt,
        score: scoring.score,
        rank: 0,
        freshnessLabel: scoring.freshnessLabel,
        freshnessLabelEn: scoring.freshnessLabelEn,
        matchedKeywords: scoring.matchedKeywords,
      };
    });
    return items.filter((item): item is NewspaperArticle => item !== null);
  }

  private scoreArticle(text: string, publishedAt: string | null, source: FeedSource, topics: NewspaperTopic[]) {
    const topicTerms = [...topics.map((topic) => topic.en), ...topics.map((topic) => topic.zh), ...(source.keywords || [])]
      .flatMap((topic) => topic.toLowerCase().split(/[\s/、（）()·,&-]+/))
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);
    const matchedKeywords = [...new Set(topicTerms.filter((term) => text.includes(term)).slice(0, 6))];
    const diffHours = publishedAt ? Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3600000) : Number.POSITIVE_INFINITY;

    let freshness = 8;
    let freshnessLabel = '较早';
    let freshnessLabelEn = 'Earlier';
    if (!Number.isFinite(diffHours)) {
      freshness = 12;
      freshnessLabel = '时间未知';
      freshnessLabelEn = 'Unknown time';
    } else if (diffHours <= 12) {
      freshness = 42;
      freshnessLabel = '12 小时内';
      freshnessLabelEn = 'Within 12h';
    } else if (diffHours <= 24) {
      freshness = 34;
      freshnessLabel = '24 小时内';
      freshnessLabelEn = 'Within 24h';
    } else if (diffHours <= 72) {
      freshness = 26;
      freshnessLabel = '3 天内';
      freshnessLabelEn = 'Within 3d';
    } else if (diffHours <= 168) {
      freshness = 18;
      freshnessLabel = '7 天内';
      freshnessLabelEn = 'Within 7d';
    }

    return {
      score: Number((source.weight * 30 + matchedKeywords.length * 4 + freshness).toFixed(2)),
      freshnessLabel,
      freshnessLabelEn,
      matchedKeywords,
    };
  }

  private async translateArticles(items: NewspaperArticle[]): Promise<NewspaperArticle[]> {
    return Promise.all(items.map(async (item) => {
      const [titleZh, summaryZh] = await Promise.all([
        this.translateText(item.title, item.matchedKeywords, 'title'),
        item.summary ? this.translateText(item.summary, item.matchedKeywords, 'summary') : Promise.resolve(''),
      ]);
      return { ...item, titleZh: titleZh || item.title, summaryZh: summaryZh || item.summary };
    }));
  }

  private translateArticlesFast(items: NewspaperArticle[]): NewspaperArticle[] {
    return items.map((item) => {
      const titleZh = this.fastTranslateText(item.title, item.matchedKeywords, 'title');
      const summaryZh = item.summary ? this.fastTranslateText(item.summary, item.matchedKeywords, 'summary') : '';
      return {
        ...item,
        titleZh: titleZh || item.title,
        summaryZh: summaryZh || item.summary,
      };
    });
  }

  private fastTranslateText(text: string, matchedKeywords: string[] = [], mode: 'title' | 'summary' | 'body' = 'summary'): string {
    const trimmed = text.trim();
    if (!trimmed) return '';
    if (this.looksChinese(trimmed)) return trimmed;

    const cached = this.translationCache.get(trimmed);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const localized = this.localizeText(trimmed, matchedKeywords, mode);
    this.translationCache.set(trimmed, {
      value: localized,
      expiresAt: Date.now() + TRANSLATION_TTL_MS,
      mode: 'fallback',
    });
    return localized;
  }

  private async translateLongText(text: string): Promise<TranslationResult> {
    const trimmed = text.trim();
    if (!trimmed) return { text: '', mode: 'fallback' };
    if (this.looksChinese(trimmed)) return { text: trimmed, mode: 'live' };

    const chunks = this.chunkText(trimmed, MAX_TRANSLATION_CHUNK);
    const translatedChunks: string[] = [];
    let usedFallback = false;
    for (const chunk of chunks) {
      const translated = await this.translateTextDetailed(chunk, [], 'body');
      translatedChunks.push(translated.text);
      if (translated.mode === 'fallback') usedFallback = true;
    }
    return { text: translatedChunks.join('\n\n').trim(), mode: usedFallback ? 'fallback' : 'live' };
  }

  private async translateText(text: string, matchedKeywords: string[] = [], mode: 'title' | 'summary' | 'body' = 'summary'): Promise<string> {
    return (await this.translateTextDetailed(text, matchedKeywords, mode)).text;
  }

  private async translateTextDetailed(text: string, matchedKeywords: string[] = [], mode: 'title' | 'summary' | 'body' = 'summary'): Promise<TranslationResult> {
    const trimmed = text.trim();
    if (!trimmed) return { text: '', mode: 'fallback' };
    if (this.looksChinese(trimmed)) return { text: trimmed, mode: 'live' };

    const cached = this.translationCache.get(trimmed);
    if (cached && cached.expiresAt > Date.now()) {
      return { text: cached.value, mode: cached.mode };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
    try {
      const translated = await this.translateWithGoogleApi(trimmed, controller.signal);
      const finalText = translated.trim() || trimmed;
      const live = this.looksChinese(finalText);
      const output = live ? finalText : this.localizeText(trimmed, matchedKeywords, mode);
      this.translationCache.set(trimmed, { value: output, expiresAt: Date.now() + TRANSLATION_TTL_MS, mode: live ? 'live' : 'fallback' });
      return { text: output, mode: live ? 'live' : 'fallback' };
    } catch {
      try {
        const translated = await this.translateViaPowerShell(trimmed);
        const finalText = translated.trim() || trimmed;
        const live = this.looksChinese(finalText);
        const output = live ? finalText : this.localizeText(trimmed, matchedKeywords, mode);
        this.translationCache.set(trimmed, { value: output, expiresAt: Date.now() + TRANSLATION_TTL_MS, mode: live ? 'live' : 'fallback' });
        return { text: output, mode: live ? 'live' : 'fallback' };
      } catch {
        const output = this.localizeText(trimmed, matchedKeywords, mode);
        this.translationCache.set(trimmed, { value: output, expiresAt: Date.now() + TRANSLATION_TTL_MS, mode: 'fallback' });
        return { text: output, mode: 'fallback' };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async translateWithGoogleApi(text: string, signal: AbortSignal): Promise<string> {
    const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'zh-CN', dt: 't', q: text });
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
      signal,
      headers: { 'user-agent': 'muse-mail-newspaper/3.0' },
    });
    if (!res.ok) throw new Error(`Translation failed: ${res.status}`);
    const payload = await res.json() as any[];
    return Array.isArray(payload?.[0]) ? payload[0].map((part: any[]) => part?.[0] || '').join('') : '';
  }

  private async translateViaPowerShell(text: string): Promise<string> {
    if (process.platform !== 'win32') {
      throw new Error('PowerShell translation fallback is only available on Windows');
    }

    const script = `
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$uri = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' + [System.Uri]::EscapeDataString(@'
${text.replace(/'/g, "''")}
'@)
$res = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 8
$payload = $res.Content | ConvertFrom-Json
($payload[0] | ForEach-Object { $_[0] }) -join ''
`.trim();

    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 512 * 1024,
    });

    const output = stdout.trim();
    if (!output) {
      throw new Error('PowerShell translation fallback returned empty content');
    }
    return output;
  }

  private pickChineseDisplayText(preferred: string, translated: string, original: string, mode: 'title' | 'summary'): string {
    if (preferred && this.looksChinese(preferred)) return preferred;
    if (translated && this.looksChinese(translated)) return translated;
    return mode === 'title'
      ? `中文标题生成中：${original.slice(0, 80)}`
      : `中文摘要生成中。当前先完成抓取与翻译，稍后自动补全更自然的中文对照。`;
  }

  private localizeText(text: string, matchedKeywords: string[], mode: 'title' | 'summary' | 'body'): string {
    const phraseMap: Array<[string, string]> = [
      ['machine learning', '机器学习'],
      ['deep learning', '深度学习'],
      ['artificial intelligence', '人工智能'],
      ['open source', '开源'],
      ['developer tools', '开发者工具'],
      ['product manager', '产品经理'],
      ['public policy', '公共政策'],
      ['cognitive science', '认知科学'],
      ['cybersecurity', '网络安全'],
      ['data science', '数据科学'],
      ['frontend', '前端'],
      ['backend', '后端'],
      ['full-stack', '全栈'],
      ['blockchain', '区块链'],
      ['startup', '创业'],
      ['growth', '增长'],
      ['marketing', '营销'],
      ['brand', '品牌'],
      ['history', '历史'],
      ['culture', '文化'],
      ['philosophy', '哲学'],
      ['psychology', '心理学'],
      ['writing', '写作'],
      ['research', '研究'],
      ['engineering', '工程'],
      ['sustainability', '可持续'],
      ['innovation', '创新'],
      ['design', '设计'],
    ];
    let localized = text;
    for (const [source, target] of phraseMap.sort((a, b) => b[0].length - a[0].length)) {
      localized = localized.replace(new RegExp(source, 'gi'), target);
    }
    if (mode === 'body') return localized;
    if (this.looksChinese(localized)) return localized;
    const keywordText = matchedKeywords.length ? `关键词：${matchedKeywords.map((keyword) => this.localizeKeyword(keyword)).join('、')}。` : '';
    return mode === 'title'
      ? `自动导读：${keywordText}${text.slice(0, 90)}`
      : `自动中译摘要：${keywordText}${text.slice(0, 150)}`;
  }

  private localizeKeyword(keyword: string): string {
    const map: Record<string, string> = {
      ai: 'AI',
      learning: '学习',
      data: '数据',
      design: '设计',
      product: '产品',
      brand: '品牌',
      policy: '政策',
      communication: '沟通',
      writing: '写作',
      github: 'GitHub',
      linux: 'Linux',
    };
    return map[keyword] || keyword;
  }

  private looksChinese(text: string): boolean {
    return /[\u3400-\u9fff]/.test(text);
  }

  private extractBlocks(xml: string, tag: string): string[] {
    return xml.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')) || [];
  }

  private extractTag(block: string, tag: string): string {
    const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim() : '';
  }

  private extractLink(block: string): string {
    const direct = this.extractTag(block, 'link').trim();
    if (direct && !direct.includes('<')) return this.decodeEntities(direct);
    const atomHref = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    if (atomHref?.[1]) return this.decodeEntities(atomHref[1]);
    const guid = this.extractTag(block, 'guid').trim();
    return /^https?:\/\//i.test(guid) ? this.decodeEntities(guid) : '';
  }

  private normalizeDate(value: string): string | null {
    if (!value) return null;
    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? null : time.toISOString();
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private firstNonEmpty(values: Array<string | undefined | null>): string {
    return values.find((value) => value && value.trim()) || '';
  }

  private stripTags(value: string): string {
    return value.replace(/<[^>]+>/g, ' ');
  }

  private decodeEntities(value: string): string {
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

  private async fetchArticleHtml(url: string): Promise<string> {
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
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractMetaContent(html: string, attr: 'name' | 'property', key: string): string {
    const regex = new RegExp(`<meta[^>]+${attr}=["']${this.escapeRegExp(key)}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i');
    const reverseRegex = new RegExp(`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+${attr}=["']${this.escapeRegExp(key)}["'][^>]*>`, 'i');
    return (html.match(regex)?.[1] || html.match(reverseRegex)?.[1] || '').trim();
  }

  private extractReadableContent(html: string, fallback: string): string {
    const sanitized = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, ' ');
    const articleBlocks = [
      ...this.extractElementsByTag(sanitized, 'article'),
      ...this.extractElementsByClassHint(sanitized, ['article', 'content', 'post-content', 'entry-content', 'topic-body', 'markdown-body', 'post']),
      ...this.extractElementsByTag(sanitized, 'main'),
      ...this.extractElementsByTag(sanitized, 'body'),
    ];
    const bestBlock = articleBlocks.map((block) => ({ block, length: this.htmlToText(block).length })).sort((a, b) => b.length - a.length)[0]?.block;
    return this.cleanArticleText(this.htmlToText(bestBlock || sanitized)) || this.cleanArticleText(fallback) || '暂时未能提取正文。';
  }

  private extractElementsByTag(html: string, tag: string): string[] {
    return html.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')) || [];
  }

  private extractElementsByClassHint(html: string, hints: string[]): string[] {
    const matches: string[] = [];
    for (const hint of hints) {
      const regex = new RegExp(`<([a-z0-9]+)\\b[^>]*(class|id)=["'][^"']*${this.escapeRegExp(hint)}[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
      matches.push(...(html.match(regex) || []));
    }
    return matches;
  }

  private htmlToText(html: string): string {
    return this.decodeEntities(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|blockquote|pre)>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private cleanArticleText(text: string): string {
    const noisePatterns = [
      /^subscribe$/i,
      /^log in$/i,
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
    ];

    return text
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        const normalizedLine = line.replace(/^•\s*/, '').trim();
        if (!line || /^share$/i.test(line) || /^comments?$/i.test(line)) return false;
        if (noisePatterns.some((pattern) => pattern.test(normalizedLine))) return false;
        if (/^•\s*$/.test(line)) return false;
        if (/^•\s+/.test(line) && normalizedLine.length <= 40) return false;
        return true;
      })
      .join('\n')
      .slice(0, MAX_DETAIL_TEXT_LENGTH)
      .trim();
  }

  private chunkText(text: string, maxLength: number): string[] {
    const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    if (paragraphs.length === 0) return [text.slice(0, maxLength)];
    const chunks: string[] = [];
    let buffer = '';
    for (const paragraph of paragraphs) {
      const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (next.length <= maxLength) {
        buffer = next;
        continue;
      }
      if (buffer) chunks.push(buffer);
      if (paragraph.length <= maxLength) {
        buffer = paragraph;
        continue;
      }
      let rest = paragraph;
      while (rest.length > maxLength) {
        chunks.push(rest.slice(0, maxLength));
        rest = rest.slice(maxLength);
      }
      buffer = rest;
    }
    if (buffer) chunks.push(buffer);
    return chunks.slice(0, 24);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
