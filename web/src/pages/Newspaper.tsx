import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Brain, Newspaper, RefreshCw, Search, ExternalLink, ArrowRight, Languages, GripVertical } from 'lucide-react';
import { newspaperApi } from '../lib/api';
import type { NewspaperArticle, NewspaperBriefing, NewspaperBriefingAiInsight, NewspaperHealth, NewspaperSection } from '../types';

function timeAgo(value: string | null) {
  if (!value) return 'Unknown';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function buildReadHref(item: NewspaperArticle) {
  const params = new URLSearchParams({
    url: item.url,
    source: item.source,
    sourceUrl: item.sourceUrl || '',
    commentUrl: item.commentUrl || '',
    publishedAt: item.publishedAt || '',
    title: item.title,
    titleZh: item.titleZh,
    summary: item.summary,
    summaryZh: item.summaryZh,
  });
  return `/newspaper/read?${params.toString()}`;
}

function matchesQuery(section: NewspaperSection, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    section.title,
    section.titleEn,
    section.description,
    section.descriptionEn,
    ...section.topics.flatMap((topic) => [topic.zh, topic.en]),
    ...section.items.flatMap((item) => [item.title, item.titleZh, item.summary, item.summaryZh, item.source, item.domain, ...item.matchedKeywords]),
  ].some((value) => value.toLowerCase().includes(q));
}

function ArticleRow({ item }: { item: NewspaperArticle }) {
  return (
    <div className="grid gap-4 rounded-[26px] border border-border/80 bg-background/80 p-4 transition hover:border-primary/30 hover:bg-background/90 lg:grid-cols-[minmax(0,1fr)_232px]">
      <div className="min-w-0">
        <div className="flex items-start gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-xs font-semibold text-foreground">
            {item.rank}
          </div>
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[17px] font-semibold leading-7 text-foreground">{item.titleZh || item.title}</div>
            <div className="mt-1 line-clamp-2 text-[13px] leading-6 text-muted-foreground">{item.title}</div>
            <div className="mt-3 line-clamp-3 text-[14px] leading-7 text-foreground/90">{item.summaryZh || item.summary}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{item.source}</span>
          <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{item.domain}</span>
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-primary">Score {item.score}</span>
          <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{item.freshnessLabel}</span>
          <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{timeAgo(item.publishedAt)}</span>
          {item.matchedKeywords.slice(0, 4).map((keyword) => (
            <span key={`${item.url}-${keyword}`} className="rounded-full border border-border px-2 py-1 text-muted-foreground/90">
              {keyword}
            </span>
          ))}
        </div>
      </div>

      <div className="grid content-start gap-2.5 lg:border-l lg:border-border/70 lg:pl-4">
        <div className="rounded-2xl border border-border bg-muted/20 p-3 text-[12px] leading-6 text-muted-foreground">
          <div className="font-medium text-foreground">双语阅读</div>
          <div>点开进入左右对照页，先看中文，再对照原文。</div>
        </div>
        <Link
          to={buildReadHref(item)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          阅读
          <ArrowRight className="h-4 w-4" />
        </Link>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3 text-sm text-foreground transition hover:bg-muted/40"
        >
          原站
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export default function NewspaperPage() {
  const [briefing, setBriefing] = useState<NewspaperBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<NewspaperHealth | null>(null);
  const [briefingInsight, setBriefingInsight] = useState<NewspaperBriefingAiInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);

  const fetchBriefing = async (refresh = false, silent = false) => {
    try {
      setError(null);
      if (refresh) setRefreshing(true);
      else if (!silent) setLoading(true);
      const result = await newspaperApi.briefing({ limit: 5, refresh });
      setBriefing(result);
    } catch (err: any) {
      setError(err?.message || '报纸加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBriefing();
    newspaperApi.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!briefing) return undefined;
    const hasPendingCards = briefing.sections.some((section) =>
      section.items.some((item) => !item.titleZh || !item.summaryZh || item.aiCardStatus === 'pending' || item.aiCardStatus === 'retrying'),
    );
    if (!hasPendingCards) return undefined;

    const timer = window.setInterval(() => {
      void fetchBriefing(false, true);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [briefing]);

  const generateBriefingInsight = async () => {
    setInsightLoading(true);
    try {
      setBriefingInsight(await newspaperApi.briefingInsight({ limit: 5, refresh: false }));
    } finally {
      setInsightLoading(false);
    }
  };

  const visibleSections = useMemo(() => {
    const filtered = briefing?.sections.filter((section) => matchesQuery(section, query)) ?? [];
    if (sectionOrder.length === 0) return filtered;
    const orderIndex = new Map(sectionOrder.map((id, index) => [id, index]));
    return [...filtered].sort((a, b) => {
      const aIndex = orderIndex.get(a.id);
      const bIndex = orderIndex.get(b.id);
      if (aIndex === undefined && bIndex === undefined) return 0;
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      return aIndex - bIndex;
    });
  }, [briefing, query, sectionOrder]);

  const visibleItems = useMemo(
    () => visibleSections.reduce((sum, section) => sum + section.items.length, 0),
    [visibleSections],
  );

  const handleSectionDragStart = (event: DragEvent<HTMLElement>, sectionId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-muse-section-id', sectionId);
  };

  const handleSectionDrop = (event: DragEvent<HTMLElement>, targetSectionId: string) => {
    event.preventDefault();
    const draggedSectionId = event.dataTransfer.getData('application/x-muse-section-id');
    if (!draggedSectionId || draggedSectionId === targetSectionId) return;

    const currentOrder = sectionOrder.length > 0 ? sectionOrder : (briefing?.sections.map((section) => section.id) ?? []);
    const visibleIds = visibleSections.map((section) => section.id);
    const orderedVisibleIds = currentOrder.filter((id) => visibleIds.includes(id));
    const missingVisibleIds = visibleIds.filter((id) => !orderedVisibleIds.includes(id));
    const nextVisibleOrder = [...orderedVisibleIds, ...missingVisibleIds];
    const from = nextVisibleOrder.indexOf(draggedSectionId);
    const to = nextVisibleOrder.indexOf(targetSectionId);
    if (from < 0 || to < 0) return;

    const nextOrder = [...nextVisibleOrder];
    const [moved] = nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, moved);
    const hiddenIds = currentOrder.filter((id) => !visibleIds.includes(id));
    setSectionOrder([...nextOrder, ...hiddenIds]);
  };

  return (
    <div className="newspaper-shell mx-auto w-full max-w-[1520px] space-y-5 p-4 md:p-6">
      <section className="newspaper-panel newspaper-hero overflow-hidden">
        <div className="relative p-6 md:p-7">
          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                <Newspaper className="h-3.5 w-3.5" />
                Newspaper Reader Desk
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-[42px]">报纸 / Signal Reader</h1>
              <p className="mt-3 max-w-3xl text-[15px] leading-8 text-muted-foreground">
                这里现在是清晰索引，不是噪音墙。先快速扫标题和中文导读，再点进阅读页做原文与中文的双栏对照，阅读节奏和信息密度都重新做了。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[24px] border border-border/80 bg-background/78 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Sections</div>
                <div className="mt-2 text-3xl font-semibold text-foreground">{briefing?.sections.length ?? 0}</div>
                <div className="text-[12px] text-muted-foreground">领域分区</div>
              </div>
              <div className="rounded-[24px] border border-border/80 bg-background/78 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Items</div>
                <div className="mt-2 text-3xl font-semibold text-foreground">{visibleItems}</div>
                <div className="text-[12px] text-muted-foreground">当前资讯</div>
              </div>
              <div className="rounded-[24px] border border-border/80 bg-background/78 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Sources</div>
                <div className="mt-2 text-3xl font-semibold text-foreground">{briefing?.totalSources ?? 0}</div>
                <div className="text-[12px] text-muted-foreground">含 Linux.do / GitHub</div>
              </div>
              <div className="rounded-[24px] border border-border/80 bg-background/78 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Mode</div>
                <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Languages className="h-4 w-4" />
                  AI-only
                </div>
                <div className="mt-1 text-[12px] text-muted-foreground">渐进正文 / AI 翻译</div>
              </div>
            </div>
          </div>

          <div className="relative mt-5 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="搜索报纸内容"
                placeholder="搜索领域、标题、翻译、来源、关键词"
                className="w-full rounded-[22px] border border-border bg-background/82 py-3.5 pl-10 pr-4 text-[15px] text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <button
              onClick={() => fetchBriefing(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-primary px-5 py-3.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              onClick={generateBriefingInsight}
              disabled={insightLoading}
              className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-border bg-background/80 px-5 py-3.5 text-sm font-medium text-foreground transition hover:bg-muted/40 disabled:opacity-50"
            >
              {insightLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              AI 总编台
            </button>
          </div>

          <div className="relative mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="rounded-[22px] border border-border bg-background/72 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Activity className="h-4 w-4" />
                信源健康
              </div>
              <div className="mt-2 text-xs leading-6 text-muted-foreground">
                {health
                  ? `${health.ok ? '服务在线' : '服务异常'} · AI 账号 ${health.ai.activeAccountCount} · 默认 ${health.ai.defaultAccountName || '未设置'}`
                  : '健康状态读取中'}
              </div>
            </div>
            <div className="rounded-[22px] border border-border bg-background/72 p-4 text-sm">
              <div className="font-medium text-foreground">AI 简报分析</div>
              <div className="mt-2 line-clamp-3 text-xs leading-6 text-muted-foreground">
                {insightLoading
                  ? 'AI 正在分析当前报纸。'
                  : briefingInsight?.summary || '点击 AI 总编台，让全领域 AI 总编挑 10 条重点。'}
              </div>
              {briefingInsight && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border px-2 py-1">{briefingInsight.accountName}</span>
                    <span className="rounded-full border border-border px-2 py-1">{briefingInsight.model}</span>
                    <span className="rounded-full border border-border px-2 py-1">Top {briefingInsight.highlights.length}</span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {briefingInsight.highlights.slice(0, 10).map((highlight, index) => (
                      <div key={`${index}-${highlight}`} className="rounded-2xl border border-border/80 bg-background/70 px-3 py-2 text-xs leading-6 text-foreground/85">
                        <span className="mr-2 font-semibold text-primary">{index + 1}</span>
                        {highlight}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="glass-card h-40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-8 text-center">
          <div className="text-lg font-medium text-foreground">报纸加载失败 / Load failed</div>
          <div className="mt-2 text-sm text-muted-foreground">{error}</div>
          <button
            onClick={() => fetchBriefing(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleSections.map((section) => (
            <section
              key={section.id}
              draggable
              onDragStart={(event) => handleSectionDragStart(event, section.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleSectionDrop(event, section.id)}
              className="newspaper-panel cursor-grab overflow-hidden active:cursor-grabbing"
            >
              <div className="relative p-5 md:p-6">
                <div className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-r ${section.accent}`} />
                <div className="relative">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-background/70 text-muted-foreground" title="拖拽排序领域分区">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <span className="text-2xl">{section.emoji}</span>
                        <div>
                          <div className="text-[24px] font-semibold tracking-tight text-foreground">{section.title}</div>
                          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{section.titleEn}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-[14px] leading-7 text-foreground/90">{section.description}</div>
                      <div className="text-[12px] leading-6 text-muted-foreground">{section.descriptionEn}</div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {section.topics.map((topic) => (
                          <span key={`${section.id}-${topic.en}`} className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                            {topic.zh} / {topic.en}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <div className="rounded-[24px] border border-border bg-background/72 p-4 text-sm">
                        <div className="font-medium text-foreground">{section.sourceCount}/{section.totalSources} sources online</div>
                        <div className="mt-1 text-[12px] leading-6 text-muted-foreground">
                          {section.failedSources.length ? `失败源：${section.failedSources.join('、')}` : '全部或大部分信源在线'}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-border bg-background/72 p-4">
                        <div className="flex flex-wrap gap-2">
                          {section.sources.map((source) => (
                            <span
                              key={`${section.id}-${source.name}`}
                              title={source.error || source.url}
                              className={`rounded-full border px-2.5 py-1.5 text-[11px] ${source.status === 'ok' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300'}`}
                            >
                              {source.name} · {source.itemCount}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {section.items.map((item) => (
                      <ArticleRow key={`${section.id}-${item.url}`} item={item} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
