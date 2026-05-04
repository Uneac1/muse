import { createElement, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import '@material/web/fab/fab.js';

export function MaterialFab({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'surface';
}) {
  return createElement('md-fab', { className: cn('material-fab', className), ...props }, children);
}
