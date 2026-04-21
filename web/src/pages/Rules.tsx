import { useState } from 'react';
import { osApi } from '../lib/api';
import { useOsWorkspace } from '../components/os/useOsWorkspace';

export default function Rules() {
  const { data, loading, error, reload } = useOsWorkspace();
  const [saving, setSaving] = useState(false);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">正在加载规则...</div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{error || '加载失败'}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Rules</h1>
          <p className="mt-2 text-sm text-muted-foreground">把低价值判断自动化，让异常、新闻和仓库动态自动流进 Today / Inbox。</p>
        </div>
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await osApi.createRule({
              name: '新关键词规则',
              description: '命中特定新闻关键词时进入 Today',
              scope: 'today',
              trigger_type: 'keyword_in_news',
              config: { keyword: 'security' },
              is_enabled: 1,
            });
            await reload();
            setSaving(false);
          }}
          className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          新增示例规则
        </button>
      </div>
      {data.rules.map((rule) => (
        <div key={rule.id} className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-medium text-foreground">{rule.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{rule.description}</div>
              <div className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">{rule.trigger_type} · {rule.scope}</div>
            </div>
            <button
              onClick={async () => {
                await osApi.updateRule(rule.id, { is_enabled: rule.is_enabled ? 0 : 1 });
                await reload();
              }}
              className="rounded-2xl border border-border px-4 py-2 text-sm"
            >
              {rule.is_enabled ? '停用' : '启用'}
            </button>
          </div>
          <pre className="mt-4 overflow-auto rounded-[22px] bg-background p-4 text-xs text-muted-foreground">{JSON.stringify(rule.config, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}
