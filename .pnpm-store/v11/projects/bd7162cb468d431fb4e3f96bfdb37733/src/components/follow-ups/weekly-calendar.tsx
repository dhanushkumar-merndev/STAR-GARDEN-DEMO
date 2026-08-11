import Link from 'next/link';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { LuCalendarDays } from 'react-icons/lu';
import { Card, CardBody, CardHeader } from '@/components/ui';
import type { FollowUpWithLead } from '@/server/services/follow-ups';

const MAX_ITEMS_PER_DAY = 3;

/** A bounded weekly overview: never renders more than three cards per day. */
export function WeeklyFollowUpCalendar({ items }: { items: FollowUpWithLead[] }) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const scheduled = items.filter((item) => item.status === 'OPEN' || item.status === 'OVERDUE');

  return (
    <Card className="mb-4">
      <CardHeader
        title="This week"
        description="Up to 3 follow-ups per day"
        action={<LuCalendarDays className="size-5 text-brand-700" aria-hidden="true" />}
      />
      <CardBody className="p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
          {days.map((day) => {
            const dayItems = scheduled.filter((item) => isSameDay(new Date(item.due_at), day));
            const visibleItems = dayItems.slice(0, MAX_ITEMS_PER_DAY);
            const moreCount = dayItems.length - visibleItems.length;
            const isToday = isSameDay(day, today);

            return (
              <section
                key={day.toISOString()}
                className={
                  isToday
                    ? 'min-h-32 rounded-lg border border-brand-300 bg-brand-50 p-2'
                    : 'min-h-32 rounded-lg border border-line bg-surface p-2'
                }
              >
                <p className="text-xs font-semibold text-ink">{format(day, 'EEE')}</p>
                <p className="text-xs text-ink-muted">{format(day, 'd MMM')}</p>

                <div className="mt-2 space-y-1.5">
                  {visibleItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/leads/${item.lead_id}`}
                      className={
                        item.status === 'OVERDUE'
                          ? 'block rounded-md border border-danger/25 bg-danger-bg px-2 py-1.5 text-xs hover:brightness-95'
                          : 'block rounded-md bg-surface-muted px-2 py-1.5 text-xs hover:bg-brand-50'
                      }
                    >
                      <span className="block truncate font-medium text-ink">{format(new Date(item.due_at), 'h:mm a')}</span>
                      <span className="block truncate text-ink-muted">{item.lead?.customer_name ?? item.title}</span>
                    </Link>
                  ))}
                  {moreCount > 0 ? (
                    <p className="px-1 text-xs font-medium text-brand-700">+{moreCount} more</p>
                  ) : null}
                  {dayItems.length === 0 ? <p className="pt-2 text-xs text-ink-subtle">No follow-ups</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
