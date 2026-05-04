import { Search } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function SectionCard({
  title,
  sub,
  action,
  children,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('glass-card p-5', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({
  text,
  children,
  className,
}: {
  text?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground', className)}>
      {children ?? text}
    </div>
  );
}

export function SearchBox({
  value,
  onValueChange,
  onChange,
  placeholder,
  className,
  inputClassName,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  value: string;
  onValueChange?: (value: string) => void;
  onChange?: (value: string) => void;
  placeholder: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => {
          onValueChange?.(event.target.value);
          onChange?.(event.target.value);
        }}
        placeholder={placeholder}
        aria-label={props['aria-label'] ?? placeholder}
        className={cn('w-full rounded-lg border border-border bg-background/70 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20', inputClassName)}
        {...props}
      />
    </div>
  );
}

export function StatBlock({
  label,
  value,
  hint,
  note,
  variant = 'glass',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  note?: ReactNode;
  variant?: 'glass' | 'panel';
  className?: string;
}) {
  if (variant === 'panel') {
    return (
      <div className={cn('rounded-[24px] border border-border bg-background/65 p-4', className)}>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
        {hint || note ? <div className="mt-1 text-xs text-muted-foreground">{hint ?? note}</div> : null}
      </div>
    );
  }

  return (
    <div className={cn('glass-card p-5', className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
      {hint || note ? <div className="mt-2 text-xs text-muted-foreground">{hint ?? note}</div> : null}
    </div>
  );
}
