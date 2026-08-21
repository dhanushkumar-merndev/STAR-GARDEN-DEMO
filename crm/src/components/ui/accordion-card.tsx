import * as React from 'react';
import { LuChevronDown } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

/**
 * A `Card` whose body folds away.
 *
 * Settings had grown into one long scroll of panels that are each configured
 * once and then never touched — the reminder windows, the cleaning rules, the
 * upload limit. Collapsed, the page becomes a list of headings you can read in
 * one screen; the panel you actually came for is one click away.
 *
 * Native `<details>` rather than a state hook, so it works in a Server
 * Component, survives with JavaScript still loading, and gets the browser's own
 * find-in-page and keyboard handling for free.
 */
export function AccordionCard({
  title,
  description,
  action,
  defaultOpen = false,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Open on arrival. For the one or two panels that are genuinely daily. */
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn('card group overflow-hidden', className)} open={defaultOpen}>
      <summary
        className={cn(
          'flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 px-3 py-3 sm:px-4',
          'hover:bg-surface-muted',
          // The border belongs to the open state: closed, it would draw a line
          // under a heading with nothing beneath it.
          'group-open:border-b group-open:border-line',
        )}
      >
        {/* Safari still paints its own triangle without this. */}
        <style>{`summary::-webkit-details-marker { display: none; }`}</style>

        <div className="flex min-w-0 flex-1 basis-48 items-start gap-2.5">
          <LuChevronDown
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-180"
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold break-words text-ink">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="max-w-full shrink-0">{action}</div> : null}
      </summary>

      <div className="p-3 sm:p-4">{children}</div>
    </details>
  );
}
