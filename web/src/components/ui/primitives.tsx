import { Children, createElement, isValidElement } from 'react';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/utils';
import '@material/web/button/elevated-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/chips/chip-set.js';
import '@material/web/chips/filter-chip.js';
import '@material/web/chips/assist-chip.js';
import '@material/web/dialog/dialog.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/labs/card/elevated-card.js';
import '@material/web/labs/card/filled-card.js';
import '@material/web/labs/card/outlined-card.js';
import '@material/web/labs/navigationtab/navigation-tab.js';
import '@material/web/list/list-item.js';
import '@material/web/select/filled-select.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/slider/slider.js';
import '@material/web/switch/switch.js';
import '@material/web/textfield/filled-text-field.js';
import '@material/web/textfield/outlined-text-field.js';

export type SemanticTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent';

const toneClasses: Record<SemanticTone, { tag: string; text: string; surface: string }> = {
  neutral: {
    tag: 'text-muted-foreground',
    text: 'text-muted-foreground',
    surface: 'border-transparent bg-[color:var(--surface-container-low)]',
  },
  primary: {
    tag: 'text-[color:var(--on-primary-container)] bg-[color:var(--primary-container)]',
    text: 'text-primary',
    surface: 'border-transparent bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)]',
  },
  success: {
    tag: 'text-[color:var(--on-success-container)] bg-[color:var(--success-container)]',
    text: 'text-[color:var(--success)]',
    surface: 'border-transparent bg-[color:var(--success-container)] text-[color:var(--on-success-container)]',
  },
  warning: {
    tag: 'text-[color:var(--on-accent-container)] bg-[color:var(--accent-container)]',
    text: 'text-accent',
    surface: 'border-transparent bg-[color:var(--accent-container)] text-[color:var(--on-accent-container)]',
  },
  danger: {
    tag: 'text-[color:var(--on-error-container)] bg-[color:var(--error-container)]',
    text: 'text-destructive',
    surface: 'border-transparent bg-[color:var(--error-container)] text-[color:var(--on-error-container)]',
  },
  accent: {
    tag: 'text-[color:var(--on-accent-container)] bg-[color:var(--accent-container)]',
    text: 'text-accent',
    surface: 'border-transparent bg-[color:var(--accent-container)] text-[color:var(--on-accent-container)]',
  },
};

export function toneTextClass(tone: SemanticTone) {
  return toneClasses[tone].text;
}

export function toneSurfaceClass(tone: SemanticTone) {
  return toneClasses[tone].surface;
}

export function Button({
  variant = 'tonal',
  className,
  children,
  type: _type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'primary' | 'secondary' | 'quiet' | 'icon';
}) {
  const sharedProps = { className: cn('material-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed', className), ...props } as Record<string, unknown>;

  if (variant === 'icon') {
    return createElement('md-icon-button', sharedProps, children);
  }

  if (variant === 'primary' || variant === 'filled') {
    return createElement('md-filled-button', sharedProps, children);
  }

  if (variant === 'secondary' || variant === 'tonal') {
    return createElement('md-filled-tonal-button', sharedProps, children);
  }

  if (variant === 'outlined') {
    return createElement('md-outlined-button', sharedProps, children);
  }

  if (variant === 'elevated') {
    return createElement('md-elevated-button', sharedProps, children);
  }

  return createElement('md-text-button', sharedProps, children);
}

export function TextInput({
  className,
  variant = 'filled',
  onChange,
  onInput,
  placeholder,
  'aria-label': ariaLabel,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  variant?: 'filled' | 'outlined';
}) {
  const sharedProps = {
    className: cn('material-field', className),
    placeholder,
    label: props.name || ariaLabel || placeholder || '',
    onInput: onInput || onChange,
    ...props,
  } as Record<string, unknown>;

  return createElement(variant === 'outlined' ? 'md-outlined-text-field' : 'md-filled-text-field', sharedProps);
}

export function SelectInput({
  className,
  variant = 'filled',
  children,
  onChange,
  value,
  defaultValue,
  'aria-label': ariaLabel,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: 'filled' | 'outlined';
}) {
  const selectedValue = value ?? defaultValue;
  const materialOptions = Children.map(children, (child) => {
    if (!isValidElement(child) || child.type !== 'option') {
      return child;
    }

    const option = child as ReactElement<{
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
    }>;
    const optionValue = option.props.value ?? String(option.props.children ?? '');
    const headline = typeof option.props.children === 'string' || typeof option.props.children === 'number'
      ? String(option.props.children)
      : undefined;

    return createElement(
      'md-select-option',
      {
        key: String(optionValue),
        value: String(optionValue),
        headline,
        disabled: option.props.disabled,
        selected: selectedValue !== undefined && String(selectedValue) === String(optionValue),
      },
      headline ? null : <span slot="headline">{option.props.children}</span>
    );
  });

  const sharedProps = {
    className: cn('material-field', className),
    label: props.name || ariaLabel || '',
    value,
    onInput: onChange,
    onChange,
    ...props,
  } as Record<string, unknown>;

  return createElement(variant === 'outlined' ? 'md-outlined-select' : 'md-filled-select', sharedProps, materialOptions);
}

export function TextArea({
  className,
  variant = 'filled',
  onChange,
  onInput,
  placeholder,
  'aria-label': ariaLabel,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: 'filled' | 'outlined';
}) {
  const sharedProps = {
    className: cn('material-field min-h-24', className),
    placeholder,
    label: props.name || ariaLabel || placeholder || '',
    type: 'textarea',
    rows: props.rows ?? 4,
    onInput: onInput || onChange,
    ...props,
  } as Record<string, unknown>;

  return createElement(variant === 'outlined' ? 'md-outlined-text-field' : 'md-filled-text-field', sharedProps);
}

export function Switch({
  checked,
  disabled,
  onChange,
  className,
  ...props
}: {
  checked?: boolean;
  disabled?: boolean;
  onChange?: () => void;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'onChange'>) {
  return createElement('md-switch', {
    className: cn('material-switch', className),
    selected: checked,
    disabled,
    onClick: onChange,
    ...props,
  } as Record<string, unknown>);
}

export function Slider({
  value,
  min = 0,
  max = 100,
  disabled,
  onChange,
  className,
  ...props
}: {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'onChange'>) {
  return createElement('md-slider', {
    className: cn('material-slider', className),
    value,
    min,
    max,
    disabled,
    ticks: false,
    labeled: true,
    onInput: (event: Event) => onChange?.(Number((event.target as HTMLInputElement).value)),
    ...props,
  } as Record<string, unknown>);
}

export function FilterChip({
  selected,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  selected?: boolean;
  children?: ReactNode;
}) {
  return createElement(
    'md-filter-chip',
    {
      className: cn('material-chip', className),
      selected,
      ...props,
    } as Record<string, unknown>,
    children
  );
}

export function ChipSet({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
}) {
  return createElement('md-chip-set', { className: cn('material-chip-set', className), ...props }, children);
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-xs font-medium leading-5 text-muted-foreground', className)} {...props} />;
}

export function StatusTag({
  tone = 'neutral',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: SemanticTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn('status-pill', toneClasses[tone].tag, className)} {...props}>{children}</span>;
}

export function Card({
  variant = 'filled',
  tone = 'neutral',
  selected,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: 'elevated' | 'filled' | 'outlined';
  tone?: SemanticTone;
  selected?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const cardClass = cn(
    'material-card',
    variant === 'elevated' ? 'material-card-elevated' : variant === 'outlined' ? 'material-card-outlined' : 'material-card-filled',
    selected && toneClasses[tone].surface,
    className
  );

  if (variant === 'elevated') {
    return createElement('md-elevated-card', { className: cardClass, ...props }, children);
  }

  if (variant === 'outlined') {
    return createElement('md-outlined-card', { className: cardClass, ...props }, children);
  }

  return createElement('md-filled-card', { className: cardClass, ...props }, children);
}

export function Surface(props: Parameters<typeof Card>[0]) {
  return <Card {...props} />;
}

export function ListItem({
  leading,
  overline,
  headline,
  supporting,
  trailing,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  leading?: ReactNode;
  overline?: ReactNode;
  headline?: ReactNode;
  supporting?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return createElement(
    'md-list-item',
    { className: cn('material-list-item', className), ...props },
    leading ? <span slot="start" className="material-list-leading">{leading}</span> : null,
    overline ? <span slot="overline" className="material-list-overline">{overline}</span> : null,
    headline ? <span slot="headline" className="material-list-headline">{headline}</span> : children,
    supporting ? <span slot="supporting-text" className="material-list-supporting">{supporting}</span> : null,
    trailing ? <span slot="end" className="material-list-trailing">{trailing}</span> : null
  );
}

export function NavigationItem({
  active,
  icon,
  label,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  icon: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  const labelText = typeof label === 'string' ? label : undefined;

  return createElement(
    'md-navigation-tab',
    {
      className: cn('material-nav-item', active && 'material-nav-item-active', className),
      active,
      label: labelText,
      ...props,
    },
    <span slot="inactive-icon" className="material-nav-indicator">{icon}</span>,
    <span slot="active-icon" className="material-nav-indicator">{icon}</span>,
    labelText ? null : <span className="material-nav-label">{label}</span>
  );
}
