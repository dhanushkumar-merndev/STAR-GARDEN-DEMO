'use client';

import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LuEllipsis } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

/**
 * The client half of `FilterTabs`'s desktop/tablet overflow behaviour.
 *
 * Split into its own file, and receiving already-built React elements rather
 * than the `hrefFor`/`onSelect` functions that build them, because a Server
 * Component (every page that uses `FilterTabs` directly) cannot pass a raw
 * function to a Client Component — only serializable data or JSX. `FilterTabs`
 * itself stays free of `'use client'` so it keeps working from a Server
 * Component; only the measuring and dropdown logic below needs the browser.
 */
export interface OverflowTabItem {
  key: string;
  /** The pill as it renders inline — used both to show it and to measure it. */
  tab: React.ReactNode;
  /** The same option, styled as a dropdown row, for when it overflows. */
  row: React.ReactNode;
}

/** Reserved width for the "⋯" button itself, so it is never the thing that overflows. */
const OVERFLOW_BUTTON_WIDTH = 44;
/** Matches `gap-2`. */
const GAP = 8;

export function ResponsiveOverflowTabs({
  items,
  activeIndex,
  label,
  className,
}: {
  items: OverflowTabItem[];
  /** Index of the currently active tab, so the "⋯" button can self-highlight when it hides the active one. */
  activeIndex: number;
  label: string;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const measureRefs = React.useRef<Array<HTMLElement | null>>([]);
  // null = "not measured yet" — renders every tab, so the first paint (and
  // any render before JavaScript runs) never shows a false collapse.
  const [visibleCount, setVisibleCount] = React.useState<number | null>(null);

  const recompute = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const available = container.clientWidth;

    let used = 0;
    let count = 0;
    for (let i = 0; i < items.length; i += 1) {
      const width = measureRefs.current[i]?.getBoundingClientRect().width ?? 0;
      const withGap = width + (count > 0 ? GAP : 0);
      const isLast = i === items.length - 1;
      // Every tab but the last must also leave room for the "⋯" button that
      // would otherwise follow it — the last tab needs no such reservation,
      // since fitting it means nothing overflows at all.
      const reserve = isLast ? 0 : OVERFLOW_BUTTON_WIDTH + GAP;
      if (used + withGap + reserve > available) break;
      used += withGap;
      count += 1;
    }
    setVisibleCount(count);
  }, [items.length]);

  React.useEffect(() => {
    recompute();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => recompute());
    observer.observe(container);
    return () => observer.disconnect();
  }, [recompute]);

  const effectiveVisibleCount = visibleCount ?? items.length;
  const visible = items.slice(0, effectiveVisibleCount);
  const overflow = items.slice(effectiveVisibleCount);
  const activeIsOverflowing = activeIndex >= effectiveVisibleCount;

  return (
    <nav aria-label={label} ref={containerRef} className={cn('flex w-full min-w-0 max-w-full items-center gap-2 pb-1', className)}>
      {visible.map((item) => (
        <React.Fragment key={item.key}>{item.tab}</React.Fragment>
      ))}

      {overflow.length > 0 ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={`${overflow.length} more filter${overflow.length === 1 ? '' : 's'}`}
              className={cn(
                'flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors',
                activeIsOverflowing
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'border border-line bg-surface text-ink-muted hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800',
              )}
            >
              <LuEllipsis className="size-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={6}
              className="z-50 max-h-[60vh] w-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg"
            >
              {overflow.map((item) => (
                <DropdownMenu.Item key={item.key} asChild>
                  {item.row}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}

      {/* Off-screen duplicate of every tab, purely so its refs report each
          tab's real rendered width — same elements as above, so the measured
          widths match exactly what will actually be shown. */}
      <div aria-hidden className="pointer-events-none absolute -z-10 flex gap-2 opacity-0" style={{ top: -9999, left: -9999 }}>
        {items.map((item, index) => (
          <span key={item.key} ref={(el) => { measureRefs.current[index] = el; }}>
            {item.tab}
          </span>
        ))}
      </div>
    </nav>
  );
}
