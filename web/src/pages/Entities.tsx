import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOsWorkspace } from '../components/os/useOsWorkspace';

export default function Entities() {
  const { data, loading, error } = useOsWorkspace();
  const [query, setQuery] = useState('');
  const [health, setHealth] = useState('all');
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.entities.filter((item) => {
      const matchesHealth = health === 'all' || item.health === health;
      const matchesQuery = !q || [item.name, item.description, item.type, ...item.links.map((link) => `${link.kind} ${link.label} ${link.value}`)].join(' ').toLowerCase().includes(q);
      return matchesHealth && matchesQuery;
    });
  }, [data, health, query]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">正在构建实体图谱...</div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{error || '加载失败'}</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-[32px] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Entity View</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">按邮箱、域名、仓库和项目看全局关联，而不是让模块并排摆着。每个实体都给出一跳路径，直接进入处理页面。</p>
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索邮箱、domain、repo、project" className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary/50 md:max-w-sm" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {['all', 'critical', 'watch', 'healthy'].map((item) => (
            <button
              key={item}
              onClick={() => setHealth(item)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                health === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filtered.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground xl:col-span-2">
            没有匹配实体。换一个关键词，或先从 Inbox 里处理能形成关联的动作。
          </div>
        ) : filtered.map((entity) => (
          <div key={entity.id} className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-medium text-foreground">{entity.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{entity.description}</div>
              </div>
              <div className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{entity.health}</div>
            </div>
            <div className="mt-4 space-y-3">
              {entity.links.map((link) => (
                <Link key={`${entity.id}-${link.kind}-${link.value}`} to={link.path} className="block rounded-[22px] border border-border bg-background px-4 py-3 transition hover:border-primary/40 hover:bg-secondary/60">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{link.kind}</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{link.label}：{link.value}</div>
                  {link.status && <div className="mt-1 text-xs text-muted-foreground">status: {link.status}</div>}
                </Link>
              ))}
            </div>
            {entity.relatedActionIds.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-300">
                关联 {entity.relatedActionIds.length} 个待处理动作，建议从 Inbox 下钻。
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
