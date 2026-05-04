import { useEffect, useState } from 'react';
import { Search, Command, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { osApi } from '../../lib/api';
import type { CommandCenterItem } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CommandCenterItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const next = await osApi.search(query);
        if (!controller.signal.aborted) setItems(next);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 120 : 0);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setItems([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/45 px-4 py-10 md:py-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Command className="h-5 w-5" />
          </div>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索命令"
              placeholder="搜索邮箱、域名、项目、token、仓库，或直接跳转动作"
              className="w-full rounded-2xl border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none ring-0 focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto p-2">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">搜索中...</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">没有匹配项，试试邮箱、仓库名、domain 或 action 关键词。</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors hover:bg-secondary"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">{item.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.subtitle}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
