import { useMemo, useState } from 'react';
import { ActionItemCard } from '../components/os/ActionItemCard';
import { useOsWorkspace } from '../components/os/useOsWorkspace';

const filters = [
  { key: 'all', label: '全部' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'alert', label: '异常' },
  { key: 'update', label: '变化' },
];

export default function Inbox() {
  const { data, loading, error, reload } = useOsWorkspace();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.inbox.filter((item) => {
      const matchesFilter =
        filter === 'all' ||
        item.severity === filter ||
        item.type === filter;
      const matchesQuery =
        !q ||
        [item.title, item.summary, item.source, item.entityType, item.entityKey, item.actionLabel]
          .join(' ')
          .toLowerCase()
          .includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [data, filter, query]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">正在加载 Inbox...</div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{error || '加载失败'}</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-[32px] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Inbox</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">所有需要你处理的事都在这里，不再先找页面再找问题。先筛异常，再看高优，再下钻模块。</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、来源、实体或动作"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary/50 sm:w-80"
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === item.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-4">
        <Metric label="全部动作" value={data.inbox.length} />
        <Metric label="Critical" value={data.inbox.filter((item) => item.severity === 'critical').length} />
        <Metric label="High" value={data.inbox.filter((item) => item.severity === 'high').length} />
        <Metric label="当前筛选" value={items.length} />
      </div>

      {items.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          当前筛选没有待处理项。换一个过滤条件，或者回到 Today 看系统推荐。
        </div>
      ) : items.map((item) => (
        <ActionItemCard key={item.id} item={item} onChanged={reload} />
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
