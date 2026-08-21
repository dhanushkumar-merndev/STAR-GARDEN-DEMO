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
 * mismatched. The compact toolbar uses a consistent 40px control height.
 */
const FIELD_CLASSES =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:w-[9.5rem]';

export function DateRangeFilter({
  from,
  to,
  isCustom = false,
}: {
  from?: string;
  to?: string;
  /**
   * Whether these dates were chosen, rather than the default the dashboard
   * filled in. Reset is only an offer when there is something to reset from —
   * once the fields are pre-filled, `from || to` is always true and the link
   * would sit there permanently doing nothing.
   */
  isCustom?: boolean;
}) {
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
  const active = isCustom;

  /**
   * Apply is only live once the fields differ from the range already applied.
   *
   * Pressing it otherwise navigates to the URL the page is already on: the
   * charts flicker through a reload and come back identical, which reads as a
   * broken button rather than a no-op. Comparing against the props works
   * because they are the applied range — after a successful Apply the new
   * values arrive as props and the button settles back to disabled on its own.
   */
  const dirty = start !== (from ?? '') || end !== (to ?? '');

  return (
    <form
      method="GET"
      className="flex min-w-0 flex-1 flex-wrap items-center gap-3"
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

      {/* `ml-auto` closes the gap the uncapped workspace opened up: the label
          stays left, the controls sit against Refresh now instead of stranded
          mid-row. Only from `sm` — stacked on a phone they should stay left. */}
      <div className="grid w-full grid-cols-1 gap-2.5 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:items-center">
        <label className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 sm:flex">
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

        <label className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 sm:flex">
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
          disabled={!dirty}
          title={dirty ? undefined : 'Change a date to apply a new range'}
          className="h-10 w-full rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
        >
          Apply
        </button>

        {active ? (
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <LuRotateCcw className="size-3.5" />
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}
