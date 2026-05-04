import {
  AlertTriangle,
  BrainCircuit,
  CalendarClock,
  Code2,
  FileText,
  Inbox,
  Mail,
  RefreshCw,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ActionItemCard } from '../components/os/ActionItemCard';
import { useOsWorkspace } from '../components/os/useOsWorkspace';
import { Button } from '../components/ui/primitives';

const DynamicWidgetShowcase = lazy(() => import('../components/md3/DynamicWidgetShowcase').then((module) => ({
  default: module.DynamicWidgetShowcase,
})));

function resolveNextStepPath(answer?: string) {
  return answer?.startsWith('/') ? answer : '/inbox';
}

export default function Today() {
  const { data, loading, error, reload } = useOsWorkspace();
  const nextStepPath = resolveNextStepPath(data?.today.questions.find((item) => item.key === 'next_step')?.answer);

  if (loading) {
    return (
      <div className="today-hero-card page-enter">
        <div className="editorial-kicker">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI 今日汇报生成中</span>
        </div>
        <h1 className="today-hero-title mt-7">正在让 AI 整理今天该看的内容...</h1>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="md3-skeleton h-24 rounded-[14px]" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="today-hero-card page-enter">
        <div className="editorial-kicker">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>AI 汇报失败</span>
        </div>
        <h1 className="today-hero-title mt-7">Today 没有正常生成今日汇报</h1>
        <p className="today-hero-copy mt-7 text-destructive">{error || '加载失败'}</p>
        <div className="mt-8">
          <Button variant="filled" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新聚合
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="today-page mx-auto w-full max-w-[1560px] space-y-8 pb-24 md:space-y-10 xl:pb-6">
      <section className="today-hero-card page-enter">
        <div className="editorial-kicker">
          <BrainCircuit className="h-3.5 w-3.5" />
          <span>AI 今日汇报</span>
        </div>
        <h1 className="today-hero-title mt-7 text-foreground">{data.today.headline || '今天先看 AI 整理的重点'}</h1>
        <p className="today-hero-copy mt-7">{data.today.summary}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            to={nextStepPath}
            className="material-button inline-flex min-h-10 items-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
          >
            <FileText className="mr-2 h-4 w-4" />
            打开 AI 建议入口
          </Link>
          <Button variant="outlined" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新整理汇报
          </Button>
        </div>
        <div className="mt-10 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-3 py-1">
            <BrainCircuit className="h-3.5 w-3.5" />
            AI 整理
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-3 py-1">
            <Mail className="h-3.5 w-3.5" />
            {data.stats.inboxCount} 条待读信号
          </span>
        </div>
        <div className="today-hero-metrics mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '优先处理', value: data.today.priorities.length, meta: 'AI sorted' },
            { label: '新信号', value: data.today.highlights.length, meta: 'from inbox' },
            { label: '异常', value: data.alerts.length, meta: data.alerts.length ? 'needs review' : 'clear' },
            { label: '置顶记忆', value: data.stats.pinnedMemoryCount, meta: 'context anchors' },
          ].map((item) => (
            <div key={item.label} className="today-hero-metric">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="today-question-grid grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.today.questions.map((item) => (
          <div key={item.key} className="md3-card p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
            <div className="today-question-answer mt-3 text-sm leading-6 text-foreground">{item.answer}</div>
          </div>
        ))}
      </section>

      <section className="today-split-grid grid gap-7 xl:grid-cols-[0.95fr,1.05fr]">
        <div>
          <div className="today-section-heading">
            <h2>AI 建议先处理</h2>
            <span className="text-sm text-muted-foreground">按今天的影响排序</span>
          </div>
          <div className="mt-5 space-y-3">
            {data.today.priorities.slice(0, 3).map((item) => (
              <ActionItemCard key={item.id} item={item} compact onChanged={reload} />
            ))}
          </div>
        </div>

        <div>
          <div className="today-section-heading">
            <h2>AI 摘出的新信号</h2>
            <Link to="/inbox" className="text-sm text-[color:var(--tertiary)]">去 Inbox</Link>
          </div>
          <div className="mt-5 overflow-hidden rounded-[14px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)]">
            {data.today.highlights.slice(0, 3).map((item) => (
              <Link key={item.id} to={item.actionPath} className="md3-state-layer block border-b border-[color:var(--outline-variant)] p-4 last:border-b-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                    <div className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.summary}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">Now</span>
                </div>
                <div className="mt-3 inline-flex rounded-md bg-[color:var(--tertiary-container)] px-2 py-1 text-[11px] text-[color:var(--on-tertiary-container)]">
                  AI 标记
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="today-split-grid grid gap-7 xl:grid-cols-[0.75fr,1.55fr]">
        <div>
          <div className="today-section-heading">
            <h2>汇报来源</h2>
          </div>
          <div className="mt-5 space-y-3">
            <div className="today-diagnostic-tile flex items-center gap-4 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--tertiary-container)] text-[color:var(--on-tertiary-container)]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs uppercase text-muted-foreground">Inbox</div>
                <div className="text-lg text-foreground">{data.stats.inboxCount} 条信号</div>
              </div>
            </div>
            <div className="today-diagnostic-tile flex items-center gap-4 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)]">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs uppercase text-muted-foreground">AI Memory</div>
                <div className="text-lg text-foreground">{data.stats.pinnedMemoryCount} 条置顶记忆</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="today-section-heading">
            <h2>继续追问 AI</h2>
          </div>
          <div className="today-ai-links mt-5 grid min-h-[210px] grid-cols-1 overflow-hidden rounded-[14px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] sm:grid-cols-3">
            {[
              { label: 'Code', icon: Code2, to: '/codex' },
              { label: 'Memory', icon: BrainCircuit, to: '/memory' },
              { label: 'Teams', icon: UsersRound, to: '/openteams' },
            ].map(({ label, icon: Icon, to }, index) => (
              <Link
                key={label}
                to={to}
                className={`md3-state-layer grid place-items-center border-[color:var(--outline-variant)] ${index !== 2 ? 'border-r' : ''}`}
              >
                <span className={`grid h-16 w-16 place-items-center rounded-full border border-[color:var(--outline-variant)] shadow-sm ${index === 1 ? 'bg-primary text-primary-foreground' : 'bg-[color:var(--surface-container-lowest)] text-foreground'}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="mt-2 text-xs font-medium text-muted-foreground">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Suspense fallback={<div className="md3-skeleton h-72 rounded-[14px]" />}>
        <DynamicWidgetShowcase />
      </Suspense>

      <section className="today-split-grid grid gap-6 xl:grid-cols-[1.25fr,0.95fr]">
          <div className="md3-surface rounded-[14px] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground">更多待办</h2>
            </div>
            <Link to="/inbox" className="text-sm text-primary">去 Inbox</Link>
          </div>
          <div className="space-y-3">
            {(data.today.priorities.length > 3 ? data.today.priorities.slice(3) : data.today.priorities).map((item) => (
              <ActionItemCard key={item.id} item={item} compact onChanged={reload} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="md3-surface rounded-[14px] p-5">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h2 className="font-semibold text-foreground">AI 标记的异常</h2>
            </div>
            <div className="space-y-3">
              {data.alerts.slice(0, 5).map((item) => (
                <ActionItemCard key={item.id} item={item} compact onChanged={reload} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="today-resource-grid grid gap-4 md:grid-cols-3">
        <Link to="/inbox" className="md3-card p-5">
          <Inbox className="h-5 w-5 text-primary" />
          <div className="mt-4 text-lg font-semibold text-foreground">Inbox</div>
          <div className="mt-1 text-sm text-muted-foreground">{data.stats.inboxCount} 个待处理动作，是 AI 汇报的主要输入源。</div>
        </Link>
        <Link to="/memory" className="md3-card p-5">
          <BrainCircuit className="h-5 w-5 text-sky-500" />
          <div className="mt-4 text-lg font-semibold text-foreground">AI Memory</div>
          <div className="mt-1 text-sm text-muted-foreground">AI 的长期记忆会影响 Today 如何整理和取舍。</div>
        </Link>
        <Link to="/memory" className="md3-card p-5">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <div className="mt-4 text-lg font-semibold text-foreground">AI 记忆置顶</div>
          <div className="mt-1 text-sm text-muted-foreground">{data.stats.pinnedMemoryCount} 条高优先级记忆会优先进入 AI 汇报上下文。</div>
        </Link>
      </section>
    </div>
  );
}
