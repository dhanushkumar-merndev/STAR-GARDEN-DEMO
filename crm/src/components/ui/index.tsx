import * as React from 'react';
import { cn } from '@/lib/utils/cn';
export { CustomSelect as Select } from './custom-select';

/**
 * Primitives for the CRM interface.
 *
 * Hand-rolled rather than pulled from a component library: the surface actually
 * needed is small, every control has to clear a 44px touch target on a phone
 * (§16), and status has to read without relying on colour — which most default
 * badge components do not do.
 */

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100 border border-brand-200',
  outline: 'bg-surface text-ink border border-line hover:bg-surface-muted',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', fullWidth, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  );
});

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card overflow-hidden', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('block text-sm font-medium text-ink', className)} {...props}>
      {children}
      {required ? (
        <span className="ml-0.5 text-danger" aria-label="required">
          *
        </span>
      ) : null}
    </label>
  );
}

const FIELD_BASE =
  'w-full rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-ink-subtle ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none ' +
  'disabled:bg-surface-muted disabled:text-ink-subtle transition-colors';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD_BASE, 'h-11', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(FIELD_BASE, 'py-2.5', className)} {...props} />;
});

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 py-1', className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 rounded border-line text-brand-600 focus:ring-brand-300"
        {...props}
      />
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Status display                                                              */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted border-line',
  brand: 'bg-brand-50 text-brand-800 border-brand-200',
  ok: 'bg-[--color-ok-bg] text-[--color-ok] border-[--color-ok]/25',
  warn: 'bg-[--color-warn-bg] text-[oklch(45%_0.13_70)] border-[--color-warn]/30',
  danger: 'bg-[--color-danger-bg] text-danger border-danger/25',
  info: 'bg-[--color-info-bg] text-[--color-info] border-[--color-info]/25',
};

/**
 * Status chip. The label is always spelled out — §16 requires that overdue and
 * other states be distinguishable without colour.
 */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The strip above a page's content.
 *
 * The page's *name* now lives in the application header bar, where it sits next
 * to the logo and never scrolls away. Repeating it here produced two headings
 * and a band of empty space between them, so this component no longer renders
 * one: `title` stays in the signature because it is still the accessible name
 * of the region, and every page already passes it.
 *
 * What remains is the useful part — the one-line context and the primary
 * action. With neither, nothing renders at all, so a page that only wanted a
 * heading no longer pays for an empty element.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  if (!subtitle && !action) return null;

  return (
    <header
      aria-label={title}
      className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
    >
      {subtitle ? (
        <p className="min-w-0 text-sm text-ink-muted">{subtitle}</p>
      ) : (
        <span className="min-w-0" />
      )}
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** §16: "Provide empty states and retry states, not blank screens." */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-ink-subtle">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const STAT_VALUE_CLASSES: Record<Tone, string> = {
  neutral: 'text-ink',
  brand: 'text-brand-700',
  ok: 'text-[--color-ok]',
  warn: 'text-[oklch(45%_0.13_70)]',
  danger: 'text-danger',
  info: 'text-[--color-info]',
};

/** The colour bar down the left edge — a second cue beside the value's colour. */
const STAT_EDGE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-line',
  brand: 'bg-brand-500',
  ok: 'bg-[--color-ok]',
  warn: 'bg-[--color-warn]',
  danger: 'bg-danger',
  info: 'bg-[--color-info]',
};

/**
 * A single number worth glancing at.
 *
 * A zero in a "needs attention" tile is good news, so a non-neutral tone only
 * shows once the count is actually non-zero — callers pass the tone
 * conditionally. The tone appears twice, as an edge bar and in the value's
 * colour, because §16 forbids leaving meaning to colour alone; the label
 * spells out what the number is either way.
 */
export function StatTile({
  label,
  value,
  tone = 'neutral',
  href,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  href?: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-1 rounded-l-[--radius-card]',
          STAT_EDGE_CLASSES[tone],
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        {icon ? (
          <span aria-hidden="true" className="shrink-0 text-ink-subtle">
            {icon}
          </span>
        ) : null}
      </div>
      <p className={cn('mt-1.5 text-3xl font-semibold tracking-tight tabular-nums', STAT_VALUE_CLASSES[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-snug text-ink-subtle">{hint}</p> : null}
    </>
  );

  const base = 'card relative overflow-hidden py-3 pr-3 pl-4';

  if (href) {
    return (
      <a
        href={href}
        className={cn(
          base,
          'block transition-all hover:border-brand-200 hover:bg-brand-50/40 hover:shadow-sm',
        )}
      >
        {content}
      </a>
    );
  }

  return <div className={base}>{content}</div>;
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-lg border px-3 py-2.5 text-sm', TONE_CLASSES[tone])} role="status">
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={cn(title && 'mt-0.5')}>{children}</div>
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="my-4 border-line" />;
  return (
    <div className="my-4 flex items-center gap-3">
      <hr className="flex-1 border-line" />
      <span className="text-xs font-medium text-ink-subtle uppercase tracking-wide">{label}</span>
      <hr className="flex-1 border-line" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-surface-muted', className)} />;
}
