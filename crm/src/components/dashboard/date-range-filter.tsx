'use client';

import * as React from 'react';
import Link from 'next/link';
import { LuCalendarDays, LuRotateCcw } from 'react-icons/lu';

/**
 * The chart date range (AGENTS.md §12.1).
 *
 * The two inputs constrain each other: picking a From date sets it as the `min`
 * of To, and picking a To date sets it as the `max` of From, so the browser's
 * own calendar greys out the impossible days. An inverted range is not a
 * validation message to read after the fact — it is a state the control should
 * not let you reach.
 *
 * `min`/`max` are applied through state rather than left to the server render
 * because they have to track what the user is doing right now, before submit.
 */
/**
 * A fixed width, not the browser's intrinsic one. `dd-mm-yyyy` plus a picker
 * icon measures differently in each field, which left the two boxes visibly
 * mismatched. h-11 keeps them on the 44px touch target §16 asks for.
 */
const FIELD_CLASSES =
  'h-11 w-[10.5rem] rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none';

export function DateRangeFilter({ from, to }: { from?: string; to?: string }) {
  const [start, setStart] = React.useState(from ?? '');
  const [end, setEnd] = React.useState(to ?? '');

  // A range already in the URL stays put; only a genuinely inverted pair is
  // corrected, and by moving the field the user did not just touch.
  function onStartChange(value: string) {
    setStart(value);
    if (value && end && end < value) setEnd(value);
  }

  function onEndChange(value: string) {
    setEnd(value);
    if (value && start && start > value) setStart(value);
  }

  const today = new Date().toISOString().slice(0, 10);
  const active = Boolean(from || to);

  return (
    <form
      method="GET"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-xl border border-line bg-surface px-4 py-3.5"
    >
      {/* Title block and control group are separate flex children, both
          centred against the row. Aligning them as siblings of the inputs
          made the title sit low, because a label-over-input stack is taller
          than two lines of text. */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
        >
          <LuCalendarDays className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Date range</p>
          <p className="text-xs text-ink-muted">Filters every chart below</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">From</span>
          <input
            type="date"
            name="from"
            value={start}
            max={end || today}
            onChange={(event) => onStartChange(event.target.value)}
            className={FIELD_CLASSES}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">To</span>
          <input
            type="date"
            name="to"
            value={end}
            min={start || undefined}
            max={today}
            onChange={(event) => onEndChange(event.target.value)}
            className={FIELD_CLASSES}
          />
        </label>

        <button
          type="submit"
          className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Apply
        </button>

        {active ? (
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <LuRotateCcw className="size-3.5" />
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}
