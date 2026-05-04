import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Kicker({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground', className)}
      {...props}
    />
  );
}

export function Heading({
  as: Component = 'h1',
  size = 'lg',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & {
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  size?: 'display' | 'xl' | 'lg' | 'md' | 'sm';
  children?: ReactNode;
}) {
  const sizeClass = {
    display: 'text-4xl font-semibold leading-tight sm:text-5xl',
    xl: 'text-3xl font-semibold leading-tight',
    lg: 'text-2xl font-semibold leading-tight',
    md: 'text-lg font-semibold leading-7',
    sm: 'text-base font-semibold leading-6',
  }[size];

  return (
    <Component className={cn(sizeClass, 'text-foreground', className)} {...props}>
      {children}
    </Component>
  );
}

export function Text({
  tone = 'muted',
  size = 'sm',
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: 'default' | 'muted';
  size?: 'xs' | 'sm' | 'base';
}) {
  const sizeClass = size === 'xs' ? 'text-xs' : size === 'base' ? 'text-base' : 'text-sm';
  return <p className={cn(sizeClass, tone === 'muted' ? 'text-muted-foreground' : 'text-foreground', className)} {...props} />;
}
