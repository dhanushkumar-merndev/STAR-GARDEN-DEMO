import Link from 'next/link';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { Card, CardBody, CardHeader } from '@/components/ui';
import type { FollowUpCalendarDay } from '@/server/services/follow-ups';

export type CalendarView = 'week' | 'month';

/** A month cell is a seventh of the width, so it shows fewer before collapsing to a count. */
export const MAX_ITEMS_PER_DAY: Record<CalendarView, number> = { week: 3, month: 3 };

/**
 * Follow-up overview, by week or by month.
 *
 * The view lives in the URL rather than in component state: this is a Server
 * Component reading rows the server already fetched, so a client-side toggle
 * would mean shipping the whole month's follow-ups to the browser just to hide
 * six sevenths of them. It also makes a particular view linkable and keeps it
 * across a back/forward navigation (§16 "preserve filters").
 */
export function FollowUpCalendar({
  days: calendarDays,
  view,
  scope,
  selectedDate,
}: {
  /** Per-day totals from `getFollowUpCalendar`, already capped server-side. */
  days: FollowUpCalendarDay[];
  view: CalendarView;
  scope: string;
  /** `yyyy-mm-dd` currently being drilled into, so its cell reads as chosen. */
  selectedDate?: string;
}) {
  const today = new Date();
  const isMonth = view === 'month';

  // Both views start on a Monday, so the weekday columns line up between them.
  const start = isMonth
    ? startOfWeek(startOfMonth(today), { weekStartsOn: 1 })
    : startOfWeek(today, { weekStartsOn: 1 });
  const end = isMonth ? endOfWeek(endOfMonth(today), { weekStartsOn: 1 }) : addDays(start, 6);

  const days = eachDayOfInterval({ start, end });
  const limit = MAX_ITEMS_PER_DAY[view];
  // Keyed lookup rather than a scan per cell: the aggregate already grouped
  // these by day, and the grid draws up to 42 of them.
  const byDay = new Map(calendarDays.map((entry) => [entry.day, entry]));

  return (
    <Card className="mb-4">
      <CardHeader
        title={isMonth ? format(today, 'MMMM yyyy') : 'This week'}
        description={`Up to ${limit} follow-ups per day`}
        action={<ViewToggle view={view} scope={scope} />}
      />
      <CardBody className="p-3 sm:p-4">
        {/* The month grid is always 7 columns — a calendar that reflows to two
            columns is no longer a calendar. It scrolls sideways on a phone
            instead, which keeps the weekday alignment that gives it meaning. */}
        <div className={isMonth ? '-mx-1 overflow-x-auto px-1' : ''}>
          <div
            className={
              isMonth
                ? 'grid min-w-[44rem] grid-cols-7 gap-1.5'
                : 'grid gap-2 sm:grid-cols-2 xl:grid-cols-7'
            }
          >
            {isMonth
              ? days.slice(0, 7).map((day) => (
                  <p
                    key={`heading-${day.toISOString()}`}
                    className="px-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase"
                  >
                    {format(day, 'EEE')}
                  </p>
                ))
              : null}

            {days.map((day) => {
              const dayKeyLookup = format(day, 'yyyy-MM-dd');
              const entry = byDay.get(dayKeyLookup);
              const visibleItems = entry?.items ?? [];
              const dayTotal = entry?.total ?? 0;
              const moreCount = dayTotal - visibleItems.length;
              const isToday = isSameDay(day, today);
              // Leading/trailing days from the neighbouring month keep the grid
              // rectangular, but must not read as part of this month's workload.
              const isOutsideMonth = isMonth && !isSameMonth(day, today);

              const dayKey = format(day, 'yyyy-MM-dd');
              const isSelected = selectedDate === dayKey;
              // The whole cell cannot be a link — it already contains links to
              // individual follow-ups, and an anchor inside an anchor is not
              // valid HTML. The date heading is the handle instead.
              const dayHref = `/follow-ups?scope=${scope}&view=${view}&date=${dayKey}`;

              return (
                <section
                  key={day.toISOString()}
                  className={[
                    'rounded-lg border p-2',
                    isMonth ? 'min-h-24' : 'min-h-32',
                    isSelected
                      ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                      : isToday
                        ? 'border-brand-300 bg-brand-50'
                        : 'border-line bg-surface',
                    isOutsideMonth && !isToday ? 'opacity-45' : '',
                  ].join(' ')}
                >
                  <Link
                    href={dayHref}
                    aria-label={`Show follow-ups for ${format(day, 'd MMMM yyyy')}`}
                    className="-mx-1 -mt-1 block rounded-md px-1 py-0.5 hover:bg-brand-100/60"
                  >
                    {isMonth ? (
                      <p className="text-xs font-semibold text-ink">{format(day, 'd')}</p>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-ink">{format(day, 'EEE')}</p>
                        <p className="text-xs text-ink-muted">{format(day, 'd MMM')}</p>
                      </>
                    )}
                  </Link>

                  <div className="mt-2 space-y-1.5">
                    {visibleItems.map((item) => (
                      <Link
                        key={item.id}
                        // Straight to the lead's follow-up list, not the lead's
                        // default tab: this card *is* a follow-up, so that is
                        // the section the click was about.
                        href={`/leads/${item.lead_id}?tab=follow-ups`}
                        className={
                          item.status === 'OVERDUE'
                            ? 'block rounded-md border border-danger/25 bg-danger-bg px-2 py-1.5 text-xs hover:brightness-95'
                            : 'block rounded-md bg-surface-muted px-2 py-1.5 text-xs hover:bg-brand-50'
                        }
                      >
                        <span className="block truncate font-medium text-ink">
                          {format(new Date(item.due_at), 'h:mm a')}
                        </span>
                        <span className="block truncate text-ink-muted">
                          {item.customer_name ?? item.title}
                        </span>
                      </Link>
                    ))}
                    {/* The overflow is the other reason to open a day: the cell
                        caps at three, and the rest were previously unreachable
                        from here. */}
                    {moreCount > 0 ? (
                      <Link
                        href={dayHref}
                        className="block px-1 text-xs font-medium text-brand-700 hover:underline"
                      >
                        +{moreCount} more
                      </Link>
                    ) : null}
                    {dayTotal === 0 && !isMonth ? (
                      <p className="pt-2 text-xs text-ink-subtle">No follow-ups</p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Week/month switch. Plain links, so it works before hydration. */
function ViewToggle({ view, scope }: { view: CalendarView; scope: string }) {
  const options: { value: CalendarView; label: string }[] = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ];

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-0.5"
      role="group"
      aria-label="Calendar view"
    >
      {options.map((option) => {
        const active = option.value === view;
        return (
          <Link
            key={option.value}
            href={`/follow-ups?scope=${scope}&view=${option.value}`}
            aria-current={active ? 'true' : undefined}
            className={
              active
                ? 'rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-sm'
                : 'rounded-md px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-ink'
            }
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
