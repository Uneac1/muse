import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, ChevronDown, EyeOff, FilePlus, RotateCcw, SlidersHorizontal } from 'lucide-react';
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
  const [expanded, setExpanded] = useState(!compact);
  const [busy, setBusy] = useState<string | null>(null);

  const mark = async (status: 'active' | 'done' | 'muted', note?: string) => {
    setBusy(status);
    try {
      await osApi.setActionState({ actionId: item.id, status, note });
      await onChanged();
    } finally {
      setBusy(null);
    }
  };

  const remember = async () => {
    setBusy('memory');
    try {
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
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
      className="dynamic-block action-item-card rounded-[24px] border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 rounded-xl">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-foreground">{item.title}</div>
            <div className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${severityTone(item.severity)}`}>{item.severity}</div>
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</div>
          <div className="action-item-inline-ux">
            <span><Bell className="h-3.5 w-3.5" /> Live</span>
            <span><SlidersHorizontal className="h-3.5 w-3.5" /> {item.type}</span>
            <span className="action-item-progress"><i /></span>
          </div>
          {!compact && expanded && (
            <div className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {item.source} · {item.type} · {item.entityType}
            </div>
          )}
        </button>
        <Link to={item.actionPath} className="md3-state-layer shrink-0 rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          {item.actionLabel}
        </Link>
        <button type="button" onClick={() => setExpanded((value) => !value)} className="action-item-menu" aria-label={expanded ? '收起操作' : '展开操作'} aria-expanded={expanded}>
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={busy !== null} onClick={() => mark('done', '已处理')} className="md3-state-layer inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">
                <Check className={`h-3.5 w-3.5 ${busy === 'done' ? 'animate-spin' : ''}`} />
                标记完成
              </button>
              <button disabled={busy !== null} onClick={() => mark('muted', '已知风险，暂不重复提醒')} className="md3-state-layer inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">
                <EyeOff className={`h-3.5 w-3.5 ${busy === 'muted' ? 'animate-pulse' : ''}`} />
                已知风险
              </button>
              <button disabled={busy !== null} onClick={remember} className="md3-state-layer inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">
                <FilePlus className={`h-3.5 w-3.5 ${busy === 'memory' ? 'animate-pulse' : ''}`} />
                沉淀记忆
              </button>
              {item.status && item.status !== 'active' && (
                <button disabled={busy !== null} onClick={() => mark('active')} className="md3-state-layer inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
