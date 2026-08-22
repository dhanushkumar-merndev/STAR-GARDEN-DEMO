import type { Metadata } from 'next';
import Link from 'next/link';
import { LuClipboardList } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { getFollowUpCalendar, listFollowUps, type FollowUpScope } from '@/server/services/follow-ups';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { DueBadge, FollowUpStatusBadge } from '@/components/status';
import {
  FollowUpCalendar,
  MAX_ITEMS_PER_DAY,
  type CalendarView,
} from '@/components/follow-ups/weekly-calendar';
import { formatDateTime } from '@/lib/utils/format';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { countFollowUpsByScope } from '@/server/services/follow-ups';
import { Pagination } from '@/components/ui/pagination';
import { readPageParam } from '@/lib/pagination';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export const metadata: Metadata = { title: 'Follow-ups' };

const SCOPES: { value: FollowUpScope; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'TODAY', label: 'Today' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ALL', label: 'All' },
];

/** Follow-up queue (AGENTS.md §11.3, §12.2). Overdue leads the list by default. */
export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('SUPER_ADMIN', 'ADMIN', 'BDM');
  const params = await searchParams;
  const scope = (typeof params.scope === 'string' ? params.scope : 'OVERDUE') as FollowUpScope;
  const view: CalendarView = params.view === 'month' ? 'month' : 'week';
  const day =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : undefined;

  const page = readPageParam(params);

  // The same window the grid draws (weeks start on Monday in both views), so
  // the calendar query asks for exactly the rows it will render. Bounding it
  // by a row limit instead used to drop work off the end of a busy month.
  const today = new Date();
  const calendarStart =
    view === 'month'
      ? startOfWeek(startOfMonth(today), { weekStartsOn: 1 })
      : startOfWeek(today, { weekStartsOn: 1 });
  const calendarEnd =
    view === 'month'
      ? endOfWeek(endOfMonth(today), { weekStartsOn: 1 })
      : addDays(calendarStart, 6);

  const [{ items, total, pageSize }, calendarDays, counts] = await Promise.all([
    listFollowUps(user, { scope, day, page }),
    // Aggregated in Postgres: the grid needs per-day totals plus the handful of
    // entries each cell shows, not every row in the month.
    getFollowUpCalendar(user, {
      from: calendarStart.toISOString(),
      to: calendarEnd.toISOString(),
      perDay: MAX_ITEMS_PER_DAY[view],
    }),
    countFollowUpsByScope(user, SCOPES.map((option) => option.value)),
  ]);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle={user.isAdmin ? 'Everyone’s follow-ups' : 'Assigned to you'}
      />

      <FilterTabs
        options={SCOPES.map((option) => ({ ...option, count: counts[option.value] ?? 0 }))}
        value={scope}
        label="Filter follow-ups"
        hrefFor={(value) => `/follow-ups?scope=${value}&view=${view}`}
        className="mb-4"
      />

      <FollowUpCalendar days={calendarDays} view={view} scope={scope} selectedDate={day} />

      <Card>
        {/* A filtered list that does not say so is the reason people think a
            record has vanished. Named, and one click to undo. */}
        {day ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm text-ink">
              Showing{' '}
              <span className="font-semibold">
                {new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
              {' · '}
              {/* `total`, not `items.length`: the list is paginated, so counting
                  the rows on screen would tell a busy day it has 20 follow-ups
                  when the calendar cell that was clicked said 82. */}
              <span className="text-ink-muted">
                {total} open follow-up{total === 1 ? '' : 's'}
              </span>
            </p>
            <Link
              href={`/follow-ups?scope=${scope}&view=${view}`}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Reset
            </Link>
          </div>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            icon={<LuClipboardList className="size-8" />}
            title={day ? 'Nothing on this day' : scope === 'OVERDUE' ? 'Nothing overdue' : 'Nothing here'}
            description={
              day
                ? 'Pick another date on the calendar, or reset to see them all.'
                : scope === 'OVERDUE'
                  ? 'Your follow-ups are up to date.'
                  : 'Follow-ups you create from a lead appear here.'
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((followUp) => {
              const open = followUp.status === 'OPEN' || followUp.status === 'OVERDUE';

              return (
                <li key={followUp.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{followUp.title}</p>
                      <Link
                        href={`/leads/${followUp.lead_id}`}
                        className="mt-0.5 block truncate text-xs text-brand-700"
                      >
                        {followUp.lead?.customer_name} · {followUp.lead?.lead_code}
                      </Link>
                      {followUp.notes ? (
                        <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{followUp.notes}</p>
                      ) : null}
                    </div>

                    {/* Due date and the action that answers it, stacked on the
                        right. The button used to sit on its own line under the
                        notes, which left a wide empty band beside the badge and
                        put the two halves of one decision far apart. */}
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
                      {open ? (
                        <DueBadge value={followUp.due_at} />
                      ) : (
                        <FollowUpStatusBadge value={followUp.status} />
                      )}
                      {followUp.completed_at ? (
                        <Badge tone="neutral">Done {formatDateTime(followUp.completed_at)}</Badge>
                      ) : null}

                      {open && followUp.lead ? (
                        <Link
                          // Opens on the lead's follow-up list rather than its
                          // default tab. Call Customer sits in the lead header,
                          // above the tabs, so it stays one tap away either way.
                          href={`/leads/${followUp.lead_id}?tab=follow-ups`}
                          className="tap mt-0.5 inline-flex items-center justify-center rounded-lg border border-line px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
                        >
                          Open lead to call customer
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Pagination
        basePath="/follow-ups"
        params={params}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </>
  );
}
