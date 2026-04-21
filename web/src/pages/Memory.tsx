import { useState } from 'react';
import { osApi } from '../lib/api';
import { useOsWorkspace } from '../components/os/useOsWorkspace';

export default function Memory() {
  const { data, loading, error, reload } = useOsWorkspace();
  const [saving, setSaving] = useState(false);
  if (loading) return <div className="p-6 text-sm text-muted-foreground">正在加载记忆层...</div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{error || '加载失败'}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Memory</h1>
          <p className="mt-2 text-sm text-muted-foreground">把 AI、邮件、新闻和判断沉淀成个人上下文，避免每次重新进入状态。</p>
        </div>
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await osApi.createMemory({
              title: '新的项目观察',
              content: '记录今天的重要判断，方便下次进入上下文时直接接着推进。',
              kind: 'note',
              tags: ['工作流'],
              source: 'manual',
              is_pinned: 1,
            });
            await reload();
            setSaving(false);
          }}
          className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          添加记忆
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {data.memory.map((item) => (
          <div key={item.id} className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-medium text-foreground">{item.title}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.kind} · {item.source}</div>
              </div>
              <button
                onClick={async () => {
                  await osApi.updateMemory(item.id, { is_pinned: item.is_pinned ? 0 : 1 });
                  await reload();
                }}
                className="rounded-2xl border border-border px-4 py-2 text-sm"
              >
                {item.is_pinned ? '取消置顶' : '置顶'}
              </button>
            </div>
            <div className="mt-4 text-sm leading-6 text-muted-foreground">{item.content}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
