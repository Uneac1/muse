import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Languages, Loader2, RefreshCw } from 'lucide-react';
import { newspaperApi } from '../lib/api';
import type { NewspaperArticleDetail } from '../types';

function normalizeParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function timeLabel(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '时间未知';
}

function looksChinese(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

function buildChinesePreview(text: string, original: string, mode: 'title' | 'summary') {
  if (text && looksChinese(text)) return text;
  if (mode === 'title') {
    return `中文标题生成中：${original.slice(0, 80)}`;
  }
  return '中文摘要生成中。当前先展示原文摘要，后台会继续补抓正文并刷新为更完整的双语对照。';
}

function buildPreviewArticle(requestPayload: {
  url: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  title: string;
  titleZh: string;
  summary: string;
  summaryZh: string;
}): NewspaperArticleDetail | null {
  if (!requestPayload.url) return null;

  const title = requestPayload.title || requestPayload.url;
  const titleZh = buildChinesePreview(requestPayload.titleZh, title, 'title');
  const summary = requestPayload.summary || '正在补抓正文，先展示当前摘要。';
  const summaryZh = buildChinesePreview(requestPayload.summaryZh, summary, 'summary');

  return {
    url: requestPayload.url,
    source: requestPayload.source || new URL(requestPayload.url).hostname.replace(/^www\./, ''),
    domain: new URL(requestPayload.url).hostname.replace(/^www\./, ''),
    sourceUrl: requestPayload.sourceUrl || undefined,
    publishedAt: requestPayload.publishedAt || null,
    title,
    titleZh,
    summary,
    summaryZh,
    originalContent: [title, summary].filter(Boolean).join('\n\n'),
    translatedContent: [titleZh, summaryZh].filter(Boolean).join('\n\n'),
    extractedAt: new Date().toISOString(),
    translationMode: 'fallback',
  };
}

export default function NewspaperReaderPage() {
  const [searchParams] = useSearchParams();
  const [article, setArticle] = useState<NewspaperArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const requestPayload = useMemo(
    () => ({
      url: searchParams.get('url') || '',
      source: searchParams.get('source') || '',
      sourceUrl: searchParams.get('sourceUrl') || '',
      publishedAt: searchParams.get('publishedAt') || '',
      title: searchParams.get('title') || '',
      titleZh: searchParams.get('titleZh') || '',
      summary: searchParams.get('summary') || '',
      summaryZh: searchParams.get('summaryZh') || '',
    }),
    [searchParams],
  );

  useEffect(() => {
    setArticle(buildPreviewArticle(requestPayload));
    setLoading(true);
    setError(null);
  }, [requestPayload]);

  const fetchArticle = async () => {
    if (!requestPayload.url) {
      setError('缺少文章链接');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setRefreshing(true);
      const result = await newspaperApi.article(requestPayload);
      setArticle(result);
    } catch (err: any) {
      setError(err?.message || '正文抓取失败，已切换为摘要模式');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchArticle();
  }, [requestPayload.url]);

  const originalParagraphs = normalizeParagraphs(article?.originalContent || '');
  const translatedParagraphs = normalizeParagraphs(article?.translatedContent || '');
  const rowCount = Math.max(originalParagraphs.length, translatedParagraphs.length);
  const paragraphPairs = Array.from({ length: rowCount }, (_, index) => ({
    original: originalParagraphs[index] || '',
    translated: translatedParagraphs[index] || '',
  }));

  return (
    <div className="newspaper-shell space-y-5 p-4 md:p-6">
      <section className="newspaper-panel overflow-hidden">
        <div className="relative p-5 md:p-7">
          <div className="relative space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/newspaper" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40">
                <ArrowLeft className="h-4 w-4" />
                返回报纸
              </Link>
              <button
                onClick={fetchArticle}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新正文
              </button>
              {requestPayload.url && (
                <a
                  href={requestPayload.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
                >
                  打开原站
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>

            {article && (
              <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                {loading
                  ? '正在后台补抓正文，当前先展示摘要双语对照。'
                  : error
                    ? '正文抓取失败，当前已自动降级为摘要模式，不影响继续阅读。'
                    : '正文已就绪，当前展示完整双语对照。'}
              </div>
            )}

            {article ? (
              <>
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                    <Languages className="h-3.5 w-3.5" />
                    双语阅读模式
                  </div>
                  <h1 className="max-w-5xl text-3xl font-bold tracking-tight text-foreground md:text-[40px]">{article.titleZh || article.title}</h1>
                  <div className="reader-font-en max-w-4xl text-[17px] leading-8 text-muted-foreground">{article.title}</div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{article.source}</span>
                    <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{article.domain}</span>
                    <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{timeLabel(article.publishedAt)}</span>
                    <span className={`rounded-full border px-2 py-1 ${article.translationMode === 'live' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
                      {article.translationMode === 'live' ? '实时翻译' : '术语回退翻译'}
                    </span>
                  </div>
                  {(article.summaryZh || article.summary) && (
                    <div className="grid gap-4 rounded-[28px] border border-border bg-background/70 p-5 lg:grid-cols-2">
                      <div>
                        <div className="reader-kicker">中文导读</div>
                        <div className="reader-font-zh mt-3 text-[16px] leading-8 text-foreground">{article.summaryZh || '暂无'}</div>
                      </div>
                      <div>
                        <div className="reader-kicker">Original Summary</div>
                        <div className="reader-font-en mt-3 text-[16px] leading-8 text-muted-foreground">{article.summary || 'No summary'}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="reader-column overflow-hidden">
                    <div className="border-b border-border/70 px-5 py-4">
                      <div className="reader-kicker">Original</div>
                      <div className="mt-1 reader-font-en text-sm text-muted-foreground">Left column keeps the source language intact.</div>
                    </div>
                    <div className="space-y-0 px-3 py-3 md:px-5">
                      {paragraphPairs.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">暂无正文</div>
                      ) : (
                        paragraphPairs.map((pair, index) => (
                          <div key={`en-${index}`} className="border-b border-border/50 px-2 py-4 last:border-b-0">
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{String(index + 1).padStart(2, '0')}</div>
                            <p className="reader-paragraph-en">{pair.original || '暂无原文段落'}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="reader-column overflow-hidden">
                    <div className="border-b border-border/70 px-5 py-4">
                      <div className="reader-kicker">中文翻译</div>
                      <div className="mt-1 reader-font-zh text-sm text-muted-foreground">Right column is optimized for连续阅读，而不是机器堆字。</div>
                    </div>
                    <div className="space-y-0 px-3 py-3 md:px-5">
                      {paragraphPairs.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">暂无译文</div>
                      ) : (
                        paragraphPairs.map((pair, index) => (
                          <div key={`zh-${index}`} className="border-b border-border/50 px-2 py-4 last:border-b-0">
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{String(index + 1).padStart(2, '0')}</div>
                            <p className="reader-paragraph-zh">{pair.translated || '暂无对应译文'}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : loading ? (
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                正在准备阅读视图
              </div>
            ) : (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error || '文章加载失败'}</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
