import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Languages, Loader2, RefreshCw } from 'lucide-react';
import type { NewspaperAiInsight, NewspaperArticleDetail } from '../types';

type StreamPhase = 'idle' | 'extracting' | 'translating' | 'insight' | 'done' | 'error';

type ReaderProgress = {
  extract: number;
  translate: number;
  insight: number;
  translated: number;
  total: number;
  message: string;
};

type StreamEvent =
  | { type: 'metadata'; detail: NewspaperArticleDetail }
  | { type: 'extract_progress'; progress: number; message: string }
  | { type: 'paragraph'; index: number; text: string; total: number }
  | { type: 'translate_progress'; progress: number; message: string; translated: number; total: number }
  | { type: 'translated_paragraph'; index: number; text: string; total: number }
  | { type: 'insight_progress'; progress: number; message: string }
  | { type: 'insight'; insight: NewspaperAiInsight }
  | { type: 'done'; detail: NewspaperArticleDetail }
  | { type: 'error'; message: string };

function timeLabel(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '时间未知';
}

function buildStreamUrl(payload: Record<string, string>) {
  const params = new URLSearchParams(payload);
  return `/api/newspaper/article/stream?${params.toString()}`;
}

function patchIndexed(list: string[], index: number, text: string) {
  const next = [...list];
  while (next.length <= index) next.push('');
  next[index] = text;
  return next;
}

export default function NewspaperReaderPage() {
  const [searchParams] = useSearchParams();
  const streamAbortRef = useRef<AbortController | null>(null);
  const [article, setArticle] = useState<NewspaperArticleDetail | null>(null);
  const [originalParagraphs, setOriginalParagraphs] = useState<string[]>([]);
  const [translatedParagraphs, setTranslatedParagraphs] = useState<string[]>([]);
  const [insight, setInsight] = useState<NewspaperAiInsight | null>(null);
  const [phase, setPhase] = useState<StreamPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [progress, setProgress] = useState<ReaderProgress>({
    extract: 0,
    translate: 0,
    insight: 0,
    translated: 0,
    total: 0,
    message: '准备读取',
  });

  const requestPayload = useMemo(
    () => ({
      url: searchParams.get('url') || '',
      source: searchParams.get('source') || '',
      sourceUrl: searchParams.get('sourceUrl') || '',
      commentUrl: searchParams.get('commentUrl') || '',
      publishedAt: searchParams.get('publishedAt') || '',
      title: searchParams.get('title') || '',
      titleZh: searchParams.get('titleZh') || '',
      summary: searchParams.get('summary') || '',
      summaryZh: searchParams.get('summaryZh') || '',
    }),
    [searchParams],
  );

  useEffect(() => {
    streamAbortRef.current?.abort();
    setArticle(null);
    setOriginalParagraphs([]);
    setTranslatedParagraphs([]);
    setInsight(null);
    setError(null);
    setPhase('extracting');
    setProgress({ extract: 0, translate: 0, insight: 0, translated: 0, total: 0, message: '开始抓取正文' });

    if (!requestPayload.url) {
      setError('缺少文章链接');
      setPhase('error');
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    streamAbortRef.current = controller;

    const handlePayload = (rawData: string) => {
      let data: StreamEvent;
      try {
        data = JSON.parse(rawData) as StreamEvent;
      } catch {
        setError('阅读流返回了无法解析的数据');
        setPhase('error');
        controller.abort();
        return;
      }

      if (data.type === 'metadata') {
        setArticle(data.detail);
        setPhase('extracting');
        return;
      }
      if (data.type === 'extract_progress') {
        setProgress((current) => ({ ...current, extract: data.progress, message: data.message }));
        return;
      }
      if (data.type === 'paragraph') {
        setOriginalParagraphs((current) => patchIndexed(current, data.index, data.text));
        setProgress((current) => ({ ...current, total: data.total, message: `正文 ${data.index + 1}/${data.total}` }));
        return;
      }
      if (data.type === 'translate_progress') {
        setPhase('translating');
        setProgress((current) => ({
          ...current,
          translate: data.progress,
          translated: data.translated,
          total: data.total,
          message: data.message,
        }));
        return;
      }
      if (data.type === 'translated_paragraph') {
        setTranslatedParagraphs((current) => patchIndexed(current, data.index, data.text));
        setProgress((current) => ({ ...current, translated: Math.max(current.translated, data.index + 1), total: data.total }));
        return;
      }
      if (data.type === 'insight_progress') {
        setPhase('insight');
        setProgress((current) => ({ ...current, insight: data.progress, message: data.message }));
        return;
      }
      if (data.type === 'insight') {
        setInsight(data.insight);
        return;
      }
      if (data.type === 'done') {
        setArticle(data.detail);
        setPhase('done');
        setProgress((current) => ({ ...current, extract: 100, translate: current.translate || 100, insight: current.insight || 100, message: '完成' }));
        controller.abort();
        return;
      }
      if (data.type === 'error') {
        setError(data.message);
      }
    };

    const consumeFrame = (frame: string) => {
      const dataLines = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());
      if (!dataLines.length) return;
      handlePayload(dataLines.join('\n'));
    };

    const readStream = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(buildStreamUrl(requestPayload), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(response.status === 401 ? '阅读流认证失败，请重新登录后再试' : `阅读流连接失败：${response.status} ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() || '';
          frames.forEach(consumeFrame);
        }

        buffer += decoder.decode();
        if (buffer.trim()) consumeFrame(buffer);
      } catch (err: any) {
        if (cancelled || controller.signal.aborted) return;
        setError(err?.message || '阅读流连接中断');
        setPhase('error');
      }
    };

    void readStream();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestPayload, refreshKey]);

  const rowCount = Math.max(originalParagraphs.length, translatedParagraphs.length);
  const paragraphPairs = Array.from({ length: rowCount }, (_, index) => ({
    original: originalParagraphs[index] || '',
    translated: translatedParagraphs[index] || '',
  }));
  const isBusy = phase !== 'done' && phase !== 'error';

  return (
    <div className="newspaper-shell mx-auto w-full max-w-[1520px] space-y-5 p-4 md:p-6">
      <section className="newspaper-panel overflow-hidden">
        <div className="relative space-y-5 p-5 md:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/newspaper" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40">
              <ArrowLeft className="h-4 w-4" />
              返回报纸
            </Link>
            <button
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={isBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              重新读取
            </button>
            {requestPayload.url && (
              <a href={requestPayload.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40">
                打开原站
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>

          <div className="grid gap-3 rounded-2xl border border-border bg-background/70 p-4 md:grid-cols-3">
            {[
              ['正文抓取', progress.extract],
              ['AI 翻译', progress.translate],
              ['AI 导读', progress.insight],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{label as string}</span>
                  <span>{value as number}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value as number}%` }} />
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground md:col-span-3">
              {progress.message} · 已译 {progress.translated}/{progress.total || originalParagraphs.length || 0} 段
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
              {error}
            </div>
          )}

          {article ? (
            <>
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                  <Languages className="h-3.5 w-3.5" />
                  AI-only 渐进阅读
                </div>
                <h1 className="max-w-5xl text-3xl font-bold tracking-tight text-foreground md:text-[40px]">{article.titleZh || article.title}</h1>
                <div className="reader-font-en max-w-4xl text-[17px] leading-8 text-muted-foreground">{article.title}</div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{article.source}</span>
                  <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{article.domain}</span>
                  <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{timeLabel(article.publishedAt)}</span>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-600 dark:text-emerald-300">只使用 AI 翻译</span>
                </div>

              <div className="grid gap-4 rounded-[28px] border border-border bg-background/70 p-5 lg:grid-cols-2">
                  <div>
                    <div className="reader-kicker">AI 导读摘要</div>
                    <div className="reader-font-zh mt-3 text-[16px] leading-8 text-foreground">
                      {insight?.status === 'ready'
                        ? insight.summary
                        : phase === 'insight'
                          ? 'AI 导读生成中。'
                          : insight?.degradedReason || 'AI 导读等待正文和翻译完成。'}
                    </div>
                    {insight && (
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full border border-border px-2 py-1">{insight.accountName}</span>
                        <span className="rounded-full border border-border px-2 py-1">{insight.model}</span>
                        <span className="rounded-full border border-border px-2 py-1">{insight.status === 'ready' ? 'AI ready' : 'AI failed'}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="reader-kicker">Original Summary</div>
                    <div className="reader-font-en mt-3 text-[16px] leading-8 text-muted-foreground">{article.summary || 'No summary'}</div>
                  </div>
                </div>

                {insight?.status === 'ready' && (
                  <div className="grid gap-4 rounded-[28px] border border-border bg-background/70 p-5 lg:grid-cols-4">
                    {[
                      ['要点', insight.takeaways],
                      ['风险', insight.risks],
                      ['问题', insight.questions],
                      ['行动', insight.actions],
                    ].map(([label, items]) => (
                      <div key={label as string}>
                        <div className="reader-kicker">{label as string}</div>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground/85">
                          {(items as string[]).map((item) => <li key={item}>• {item}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <div className="reader-column overflow-hidden">
                  <div className="border-b border-border/70 px-5 py-4">
                    <div className="reader-kicker">Original</div>
                    <div className="mt-1 reader-font-en text-sm text-muted-foreground">正文抓到哪里就显示到哪里，不再补抓。</div>
                  </div>
                  <div className="max-h-[70vh] overflow-y-auto space-y-0 px-3 py-3 md:px-5">
                    {paragraphPairs.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">正文读取中</div>
                    ) : (
                      paragraphPairs.map((pair, index) => (
                        <div key={`en-${index}`} className="border-b border-border/50 px-2 py-4 last:border-b-0">
                          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{String(index + 1).padStart(2, '0')}</div>
                          <p className="reader-paragraph-en">{pair.original || '正文读取中'}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="reader-column overflow-hidden">
                  <div className="border-b border-border/70 px-5 py-4">
                    <div className="reader-kicker">中文翻译</div>
                    <div className="mt-1 reader-font-zh text-sm text-muted-foreground">AI 译到哪里就显示到哪里。</div>
                  </div>
                  <div className="max-h-[70vh] overflow-y-auto space-y-0 px-3 py-3 md:px-5">
                    {paragraphPairs.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">等待正文</div>
                    ) : (
                      paragraphPairs.map((pair, index) => (
                        <div key={`zh-${index}`} className="border-b border-border/50 px-2 py-4 last:border-b-0">
                          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{String(index + 1).padStart(2, '0')}</div>
                          <p className="reader-paragraph-zh">{pair.translated || 'AI 翻译中'}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              正在打开阅读流
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
