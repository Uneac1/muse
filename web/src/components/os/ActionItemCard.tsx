import { Check, EyeOff, FilePlus, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { osApi } from '../../lib/api';
import type { ActionCenterItem } from '../../types';

interface Props {
  item: ActionCenterItem;
  compact?: boolean;
  onChanged: () => Promise<void> | void;
}

function severityTone(severity: string) {
  if (severity === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-500';
  if (severity === 'high') return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
  if (severity === 'medium') return 'border-sky-500/30 bg-sky-500/10 text-sky-500';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
}

export function ActionItemCard({ item, compact = false, onChanged }: Props) {
  const mark = async (status: 'active' | 'done' | 'muted', note?: string) => {
    await osApi.setActionState({ actionId: item.id, status, note });
    await onChanged();
  };

  const remember = async () => {
    await osApi.createMemory({
      title: item.title,
      content: `${item.summary}\n\n来源：${item.source}\n动作：${item.actionLabel} -> ${item.actionPath}`,
      kind: item.severity === 'critical' || item.type === 'alert' ? 'risk' : 'note',
      tags: [item.source, item.severity, item.entityType].filter(Boolean),
      source: item.source,
      entity_type: item.entityType,
      entity_key: item.entityKey,
      is_pinned: item.severity === 'critical' ? 1 : 0,
      is_resolved: 0,
    });
    await mark('muted', '已沉淀到 Memory，暂不重复提醒。');
  };

  return (
    <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-foreground">{item.title}</div>
            <div className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${severityTone(item.severity)}`}>{item.severity}</div>
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</div>
          {!compact && (
            <div className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {item.source} · {item.type} · {item.entityType}
            </div>
          )}
        </div>
        <Link to={item.actionPath} className="shrink-0 rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          {item.actionLabel}
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => mark('done', '已处理')} className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary">
          <Check className="h-3.5 w-3.5" />
          标记完成
        </button>
        <button onClick={() => mark('muted', '已知风险，暂不重复提醒')} className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary">
          <EyeOff className="h-3.5 w-3.5" />
          已知风险
        </button>
        <button onClick={remember} className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary">
          <FilePlus className="h-3.5 w-3.5" />
          沉淀记忆
        </button>
        {item.status && item.status !== 'active' && (
          <button onClick={() => mark('active')} className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary">
            <RotateCcw className="h-3.5 w-3.5" />
            恢复
          </button>
        )}
      </div>
    </div>
  );
}
