import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

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
    'flex h-11 shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 lg:h-9',
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

export function FilterTabs<T extends string>({
  options,
  value,
  label,
  className,
  hrefFor,
  onSelect,
}: FilterTabsProps<T>) {
  return (
    <nav
      aria-label={label}
      /**
       * No negative margins.
       *
       * The strip used to bleed past the page padding with `-mx-3 px-3`, which
       * makes the element wider than its container by design. Inside the page
       * that is harmless; as the outermost thing on a phone screen it was
       * enough to widen the layout and slide every other block sideways with
       * it. `w-full min-w-0` pins it to the column instead — a scroll container
       * that cannot itself force the column open.
       */
      className={cn(
        'no-scrollbar flex w-full min-w-0 max-w-full snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;

        return hrefFor ? (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={active ? 'page' : undefined}
            className={tabClasses(active)}
          >
            {option.label}
            {option.count === undefined ? null : (
              <TabCount value={option.count} active={active} />
            )}
          </Link>
        ) : (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect?.(option.value)}
            className={tabClasses(active)}
          >
            {option.label}
            {option.count === undefined ? null : (
              <TabCount value={option.count} active={active} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
