import { AlertTriangle, BrainCircuit, CalendarClock, Inbox, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ActionItemCard } from '../components/os/ActionItemCard';
import { useOsWorkspace } from '../components/os/useOsWorkspace';

export default function Today() {
  const { data, loading, error, reload } = useOsWorkspace();

  if (loading) return <div className="p-6 text-sm text-muted-foreground">正在汇总你的下一步...</div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{error || '加载失败'}</div>;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              <BrainCircuit className="h-3.5 w-3.5" />
              Personal Operating System
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Today</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{data.today.summary}</p>
            </div>
            <div className="rounded-3xl bg-primary px-5 py-4 text-primary-foreground shadow-lg shadow-primary/20">
              <div className="text-xs uppercase tracking-[0.22em] opacity-80">Current Focus</div>
              <div className="mt-2 text-xl font-semibold">{data.today.headline}</div>
            </div>
          </div>
          <button onClick={reload} className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2 text-sm hover:bg-secondary">
            <RefreshCw className="h-4 w-4" />
            重新聚合
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.today.questions.map((item) => (
          <div key={item.key} className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
            <div className="mt-3 text-sm leading-6 text-foreground">{item.answer}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr,0.95fr]">
        <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground">必须现在处理</h2>
            </div>
            <Link to="/inbox" className="text-sm text-primary">去 Inbox</Link>
          </div>
          <div className="space-y-3">
            {data.today.priorities.map((item) => (
              <ActionItemCard key={item.id} item={item} compact onChanged={reload} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h2 className="font-semibold text-foreground">异常中心</h2>
            </div>
            <div className="space-y-3">
              {data.alerts.slice(0, 5).map((item) => (
                <ActionItemCard key={item.id} item={item} compact onChanged={reload} />
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-500" />
              <h2 className="font-semibold text-foreground">信号变化</h2>
            </div>
            <div className="space-y-3">
              {data.today.highlights.slice(0, 5).map((item) => (
                <Link key={item.id} to={item.actionPath} className="block rounded-[22px] border border-border bg-background p-4">
                  <div className="text-sm font-medium text-foreground">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.summary}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link to="/inbox" className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
          <Inbox className="h-5 w-5 text-primary" />
          <div className="mt-4 text-lg font-semibold text-foreground">Inbox</div>
          <div className="mt-1 text-sm text-muted-foreground">{data.stats.inboxCount} 个待处理动作，按处理优先级而不是模块排列。</div>
        </Link>
        <Link to="/entities" className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
          <BrainCircuit className="h-5 w-5 text-sky-500" />
          <div className="mt-4 text-lg font-semibold text-foreground">Entity View</div>
          <div className="mt-1 text-sm text-muted-foreground">从邮箱、域名、仓库和项目切入，看跨模块关联。</div>
        </Link>
        <Link to="/memory" className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <div className="mt-4 text-lg font-semibold text-foreground">Memory</div>
          <div className="mt-1 text-sm text-muted-foreground">{data.stats.pinnedMemoryCount} 条高优先级个人记忆，防止每次重新进入上下文。</div>
        </Link>
      </section>
    </div>
  );
}
