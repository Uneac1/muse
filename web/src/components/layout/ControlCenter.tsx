import type { ReactNode } from 'react';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, Circle, Loader2, Plus, Search, SlidersHorizontal, Zap } from 'lucide-react';
import { Card, ChipSet, FilterChip, ListItem } from '../ui/primitives';

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function ControlPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx('control-page mx-auto w-full max-w-[1560px] space-y-6', className)}>{children}</div>;
}

export function ControlHero({
  eyebrow,
  title,
  description,
  actions,
  stats,
  accent = 'teal',
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  stats?: ReactNode;
  accent?: 'teal' | 'lime' | 'orange' | 'violet' | 'blue';
}) {
  const [mode, setMode] = useState('flow');
  return (
    <section className={cx('control-hero control-hero-adaptive dynamic-block grid gap-5', `control-hero-${accent}`)}>
      <div className="space-y-3">
        {eyebrow ? <div className="control-hero-badge">{eyebrow}</div> : null}
        <div className="space-y-2">
          <h1 className="max-w-4xl text-3xl font-semibold leading-tight text-[color:inherit] md:text-[2.35rem]">{title}</h1>
          {description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="control-hero-actions flex flex-wrap gap-2">{actions}</div> : null}
        <div className="control-hero-ux flex-wrap gap-2.5">
          <label className="control-hero-search">
            <Search className="h-4 w-4" />
            <input aria-label={`${title} quick search`} placeholder={`搜索 ${title}、动作或状态`} />
            <kbd>/</kbd>
          </label>
          <div className="control-hero-mode max-w-full overflow-x-auto" role="group" aria-label={`${title} view mode`}>
            {['focus', 'flow', 'review'].map((item) => (
              <button key={item} type="button" data-selected={mode === item} onClick={() => setMode(item)}>
                {item}
              </button>
            ))}
          </div>
          <button type="button" className="control-hero-mini-action shrink-0" onClick={() => setMode((value) => value === 'review' ? 'flow' : 'review')}>
            <SlidersHorizontal className="h-4 w-4" />
            Tune
          </button>
        </div>
      </div>
      {stats ? <div className="control-hero-stats">{stats}</div> : null}
    </section>
  );
}

export function ControlPanel({
  title,
  eyebrow,
  meta,
  action,
  className,
  children,
}: {
  title: string;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card variant="elevated" className={cx('control-panel dynamic-block', className)}>
      <div className="control-panel-header muse-section-heading gap-3">
        <div className="min-w-0">
          {eyebrow ? <div className="control-eyebrow">{eyebrow}</div> : null}
          <h2 className="mt-1 text-lg text-foreground">{title}</h2>
          {meta ? <div className="mt-1 text-sm text-muted-foreground">{meta}</div> : null}
        </div>
        {action ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{action}</div> : null}
      </div>
      <div className="control-panel-ux">
        <span><Zap className="h-3.5 w-3.5" /> Live surface</span>
        <span><Bell className="h-3.5 w-3.5" /> State feedback</span>
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function MetricCard({
  label,
  value,
  meta,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'success';
}) {
  return (
    <Card variant={tone ? 'filled' : 'elevated'} className={cx('metric-tile control-metric dynamic-block', tone && `control-metric-${tone}`)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
      {meta ? <div className="mt-1 text-sm text-muted-foreground">{meta}</div> : null}
      <InlineProgress value={typeof value === 'number' ? value : 48} className="mt-4" />
    </Card>
  );
}

export function CommandHero(props: Parameters<typeof ControlHero>[0]) {
  return <ControlHero {...props} />;
}

export function SectionHeader({
  title,
  eyebrow,
  action,
  meta,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('muse-section-heading', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="control-eyebrow">{eyebrow}</div> : null}
        <h2 className="mt-1 text-2xl leading-none text-foreground">{title}</h2>
        {meta ? <div className="mt-1 text-sm text-muted-foreground">{meta}</div> : null}
      </div>
      {action ? <div className="w-full shrink-0 sm:w-auto sm:justify-end">{action}</div> : null}
    </div>
  );
}

export function DynamicSurface({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={cx('dynamic-surface dynamic-block', className)}>{children}</Tag>;
}

export function InlineProgress({
  value,
  max = 100,
  className,
}: {
  value: number;
  max?: number;
  className?: string;
}) {
  const pct = Math.max(4, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={cx('inline-progress', className)} aria-label={`Progress ${Math.round(pct)}%`}>
      <motion.span
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.62, ease: [0.2, 0, 0, 1] }}
      />
    </div>
  );
}

export function FilterChips({
  items,
  value,
  onChange,
}: {
  items: Array<{ key: string; label: ReactNode; count?: number }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ChipSet className="filter-chip-row">
      {items.map((item) => (
        <FilterChip
          key={item.key}
          onClick={() => onChange(item.key)}
          className="filter-chip"
          selected={value === item.key}
          data-selected={value === item.key}
        >
          <span>{item.label}</span>
          {typeof item.count === 'number' ? <strong>{item.count}</strong> : null}
        </FilterChip>
      ))}
    </ChipSet>
  );
}

export function SegmentedControl({
  items,
  value,
  onChange,
}: {
  items: Array<{ key: string; label: ReactNode }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-control">
      {items.map((item) => (
        <button key={item.key} type="button" onClick={() => onChange(item.key)} data-selected={value === item.key}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function InteractiveListRow({
  leading,
  title,
  meta,
  children,
  trailing,
  defaultOpen = false,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  trailing?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.article layout className="interactive-list-row dynamic-block">
      <button type="button" className="md3-state-layer interactive-list-row-main" onClick={() => setOpen((value) => !value)}>
        {leading ? <span className="interactive-list-leading">{leading}</span> : null}
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          {meta ? <span className="mt-1 block truncate text-xs text-muted-foreground">{meta}</span> : null}
        </span>
        {trailing ? <span className="interactive-list-trailing">{trailing}</span> : null}
        {children ? <ChevronDown className={cx('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} /> : null}
      </button>
      <AnimatePresence initial={false}>
        {open && children ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="interactive-list-detail">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

export function StatusTimeline({
  items,
}: {
  items: Array<{ label: ReactNode; meta?: ReactNode; state?: 'done' | 'active' | 'warning' | 'pending' }>;
}) {
  const iconFor = (state?: string) => {
    if (state === 'done') return <CheckCircle2 className="h-3.5 w-3.5" />;
    if (state === 'warning') return <AlertTriangle className="h-3.5 w-3.5" />;
    if (state === 'active') return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    return <Circle className="h-3.5 w-3.5" />;
  };
  return (
    <div className="status-timeline">
      {items.map((item, index) => (
        <div key={index} className="status-timeline-item" data-state={item.state || 'pending'}>
          <span className="status-timeline-dot">{iconFor(item.state)}</span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{item.label}</span>
            {item.meta ? <span className="block text-xs text-muted-foreground">{item.meta}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="md3-empty-state dynamic-block text-center">
      <Plus className="mx-auto h-5 w-5 text-primary" />
      <div className="mt-3 text-base font-medium text-foreground">{title}</div>
      {description ? <div className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="md3-error-state dynamic-block text-center">
      <AlertTriangle className="mx-auto h-5 w-5" />
      <div className="mt-3 text-base font-medium">{title}</div>
      {description ? <div className="mx-auto mt-2 max-w-lg text-sm leading-6 opacity-80">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function CompactList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx('space-y-2.5', className)}>{children}</div>;
}

export function KeyValueGrid({
  items,
  columns = 3,
}: {
  items: Array<{ label: string; value: ReactNode; meta?: ReactNode }>;
  columns?: 2 | 3 | 4;
}) {
  const cols =
    columns === 2 ? 'md:grid-cols-2' : columns === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3';
  return (
    <div className={cx('grid gap-3', cols)}>
      {items.map((item) => (
        <ListItem
          key={item.label}
          className="control-kv"
          overline={item.label}
          headline={item.value}
          supporting={item.meta}
        />
      ))}
    </div>
  );
}
