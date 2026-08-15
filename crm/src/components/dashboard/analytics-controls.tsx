'use client';

import { useFormStatus } from 'react-dom';
import { LuCalendarDays, LuRefreshCw } from 'react-icons/lu';
import { refreshAdminDashboardAction } from '@/server/actions/admin';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { DateRangeFilter } from './date-range-filter';

export function AnalyticsControls({
  firstName,
  dateLabel,
  from,
  to,
}: {
  firstName: string;
  dateLabel: string;
  from?: string;
  to?: string;
}) {
  const refreshButton = (
    <form action={refreshAdminDashboardAction} className="shrink-0 lg:border-l lg:border-line lg:pl-3">
      <RefreshSubmitButton />
    </form>
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">Welcome back, {firstName}</p>
          <p className="text-xs text-ink-muted">{dateLabel}</p>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Choose dashboard date range"
              className="tap flex shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-brand-700 shadow-sm transition hover:bg-brand-50"
            >
              <LuCalendarDays className="size-5" />
            </button>
          </DialogTrigger>
          <DialogContent
            title="Dashboard date range"
            description="Choose the dates used by every analytics chart."
          >
            <div className="space-y-3">
              <DateRangeFilter from={from} to={to} />
              {refreshButton}
              <p className="text-xs text-ink-muted">
                Analytics are cached for one hour. Refresh for current data.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="hidden lg:block">
        <p className="mb-3 text-sm text-ink-muted">{dateLabel}</p>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
          <DateRangeFilter from={from} to={to} />
          {refreshButton}
        </div>
        <p className="mt-3 text-xs text-muted">
          Analytics are cached for one hour. Refresh anytime for current data.
        </p>
      </div>
    </>
  );
}

function RefreshSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-70 lg:w-auto"
    >
      <LuRefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} />
      {pending ? 'Refreshing…' : 'Refresh now'}
    </button>
  );
}
