import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { ResponsiveOverflowTabs } from './responsive-overflow-tabs';

/**
 * The scope/stage strip that heads a list screen.
 *
 * There were five of these — leads, follow-ups, site visits, designs,
 * execution — each hand-rolled, and they had drifted: different heights,
 * different hover states, one with its own padding. Moving between two list
 * pages should not feel like moving between two applications, so the strip is
 * one component and every page gets the same 44px row (§16).
 *
 * Two shapes of tab, one appearance:
 *
 *   - `hrefFor` renders `<Link>`s. This is the default, and it is what a
 *     Server Component page uses: the filter is a URL, so it survives a
 *     refresh, a share and the back button with no JavaScript involved.
 *   - `onSelect` renders `<button>`s, for a Client Component that already
 *     holds other filter state and needs to fold this into the same navigation.
 *
 * Exactly one of the two is required — a tab that neither links nor handles a
 * click is decoration.
 *
 * This component itself carries no `'use client'` — every page above calls it
 * directly from a Server Component, and a function prop like `hrefFor` cannot
 * cross into a Client Component. Instead, the tabs are pre-rendered into plain
 * React elements right here (still on the server, when called from one), and
 * only those finished elements — never the function that built them — are
 * handed to `ResponsiveOverflowTabs`, which is where the actual browser-side
 * measuring and `⋯` dropdown live.
 *
 * Below `lg`, the strip is exactly what it always was: every tab in one row,
 * scrolling horizontally — a phone's thumb already scrolls a row like this
 * without thinking about it. At `lg` and up, a wide tab count (twelve, on the
 * lead list) stopped fitting a laptop-width column and started clipping the
 * last few tabs at the edge with no sign more existed. There, tabs that do
 * not fit collapse behind a `⋯` button instead — measured against the actual
 * container width, so it adapts continuously as the window resizes rather
 * than snapping at a fixed breakpoint.
 */
export interface FilterTabOption<T extends string = string> {
  value: T;
  label: string;
  /**
   * How many rows the tab would show. Optional throughout — a page that has not
   * counted yet renders exactly as before rather than showing a nought, which
   * would be a claim rather than an absence.
   */
  count?: number;
}

type FilterTabsProps<T extends string> = {
  options: readonly FilterTabOption<T>[];
  /** The currently applied filter. Compared by value. */
  value: T;
  /** Names the strip for screen readers, e.g. "Filter follow-ups". */
  label: string;
  className?: string;
} & (
  | { hrefFor: (value: T) => string; onSelect?: never }
  | { onSelect: (value: T) => void; hrefFor?: never }
);

/**
 * Shared by both shapes so a link tab and a button tab cannot look different.
 *
 * Height is split by pointer, not fixed at one value. On a phone these are
 * thumb targets and stay at the 44px minimum (§16); on a desktop they are
 * mouse targets, and 44px made a twelve-tab strip into a heavy band across the
 * page. `h-9` from `lg` up is the compact row this replaced.
 *
 * Horizontal padding rather than a fixed width, so "Ready for review" and
 * "All" sit in the same row without either being cramped or stranded.
 */
function tabClasses(active: boolean): string {
  return cn(
    // 40px, not the 44px §16 minimum — a deliberate half-step down for a row
    // of many small pills rather than a lone tap target; still comfortably
    // tappable, just less bulky than a full-size thumb target would read as.
    'flex h-10 shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 lg:h-9',
    'text-sm font-medium whitespace-nowrap transition-colors',
    active
      ? 'bg-brand-600 text-white hover:bg-brand-700'
      : 'border border-line bg-surface text-ink-muted hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800',
  );
}

/**
 * The count, styled to sit behind the label rather than compete with it.
 *
 * `tabular-nums` keeps the strip from twitching sideways as counts change, and
 * the value is announced as "N items" so a screen reader does not read a bare
 * number stuck to the end of the label.
 */
function TabCount({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        active ? 'bg-white/20 text-white' : 'bg-surface-muted text-ink-subtle',
      )}
    >
      <span className="sr-only">, </span>
      {value}
      <span className="sr-only"> items</span>
    </span>
  );
}

function TabRow({ label, count }: { label: string; count?: number }) {
  return (
    <>
      {label}
      {count === undefined ? null : (
        <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
          {count}
        </span>
      )}
    </>
  );
}

export function FilterTabs<T extends string>({
  options,
  value,
  label,
  className,
  hrefFor,
  onSelect,
}: FilterTabsProps<T>) {
  const items = options.map((option) => {
    const active = option.value === value;
    const tab = hrefFor ? (
      <Link href={hrefFor(option.value)} aria-current={active ? 'page' : undefined} className={tabClasses(active)}>
        {option.label}
        {option.count === undefined ? null : <TabCount value={option.count} active={active} />}
      </Link>
    ) : (
      <button type="button" aria-pressed={active} onClick={() => onSelect?.(option.value)} className={tabClasses(active)}>
        {option.label}
        {option.count === undefined ? null : <TabCount value={option.count} active={active} />}
      </button>
    );
    // The dropdown row: same option, laid out for a menu list rather than a pill.
    const rowClasses = cn(
      'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none data-highlighted:bg-surface-muted',
      active ? 'font-semibold text-brand-700' : 'text-ink',
    );
    const row = hrefFor ? (
      <Link href={hrefFor(option.value)} className={rowClasses}>
        <TabRow label={option.label} count={option.count} />
      </Link>
    ) : (
      <button type="button" onClick={() => onSelect?.(option.value)} className={rowClasses}>
        <TabRow label={option.label} count={option.count} />
      </button>
    );

    return { key: option.value, tab, row };
  });

  const activeIndex = options.findIndex((option) => option.value === value);

  return (
    <>
      {/* Mobile: unchanged — every tab, one scrolling row. */}
      <nav
        aria-label={label}
        className={cn(
          'no-scrollbar flex w-full min-w-0 max-w-full snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:hidden',
          className,
        )}
      >
        {items.map((item) => (
          <React.Fragment key={item.key}>{item.tab}</React.Fragment>
        ))}
      </nav>

      {/* Desktop/tablet: measured, with overflow behind "⋯" (client-side). */}
      <div className="hidden lg:block">
        <ResponsiveOverflowTabs items={items} activeIndex={activeIndex} label={label} className={className} />
      </div>
    </>
  );
}
