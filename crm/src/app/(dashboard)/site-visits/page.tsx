import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, MapPin } from 'lucide-react';
import { requirePageRole } from '@/lib/auth/session';
import { listSiteVisits } from '@/server/services/site-visits';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { SiteVisitStatusBadge } from '@/components/status';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Site visits' };

const SCOPES = [
  { value: 'TODAY', label: 'Today' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ALL', label: 'All' },
] as const;

/** Visit list (AGENTS.md §11.4). Grouped by day so a phone screen reads as a plan. */
export default async function SiteVisitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('ADMIN', 'BDM', 'DESIGNER');
  const params = await searchParams;
  const scope = (typeof params.scope === 'string' ? params.scope : 'UPCOMING') as
    (typeof SCOPES)[number]['value'];

  const visits = await listSiteVisits(user, { scope, limit: 100 });

  const grouped = visits.reduce<Record<string, typeof visits>>((acc, visit) => {
    const day = new Date(visit.scheduled_start_at).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    (acc[day] ??= []).push(visit);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Site visits" subtitle={`${visits.length} in this view`} />

      <nav className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter">
        {SCOPES.map((option) => {
          const active = option.value === scope;
          return (
            <Link
              key={option.value}
              href={`/site-visits?scope=${option.value}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'tap flex items-center rounded-full bg-brand-600 px-4 text-sm font-medium whitespace-nowrap text-white'
                  : 'tap flex items-center rounded-full border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-ink-muted'
              }
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      {visits.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="No visits in this view"
            description="Schedule a visit from a lead page."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([day, dayVisits]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-ink-muted">{day}</h2>
              <Card>
                <ul className="divide-y divide-line">
                  {dayVisits.map((visit) => (
                    <li key={visit.id}>
                      <Link
                        href={`/site-visits/${visit.id}`}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-surface-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">
                            {visit.lead?.customer_name ?? 'Site visit'}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {formatDateTime(visit.scheduled_start_at)}
                          </p>
                          {visit.address ? (
                            <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-muted">
                              <MapPin className="mt-0.5 size-3.5 shrink-0" />
                              <span className="line-clamp-2">{visit.address}</span>
                            </p>
                          ) : null}
                        </div>
                        <SiteVisitStatusBadge value={visit.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
