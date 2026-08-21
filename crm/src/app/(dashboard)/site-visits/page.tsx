import type { Metadata } from 'next';
import Link from 'next/link';
import { LuCalendarDays, LuMapPin } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listSiteVisits } from '@/server/services/site-visits';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { SiteVisitStatusBadge } from '@/components/status';
import { formatDateTime } from '@/lib/utils/format';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { countSiteVisitsByScope } from '@/server/services/site-visits';
import { Pagination } from '@/components/ui/pagination';
import { readPageParam } from '@/lib/pagination';

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

  const page = readPageParam(params);

  const [{ items: visits, total, pageSize }, counts] = await Promise.all([
    listSiteVisits(user, { scope, page }),
    countSiteVisitsByScope(SCOPES.map((option) => option.value)),
  ]);

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
      <PageHeader title="Site visits" subtitle={`${total} in this view`} />

      <FilterTabs
        options={SCOPES.map((option) => ({ ...option, count: counts[option.value] ?? 0 }))}
        value={scope}
        label="Filter site visits"
        hrefFor={(value) => `/site-visits?scope=${value}`}
        className="mb-4"
      />

      {visits.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LuCalendarDays className="size-8" />}
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
                              <LuMapPin className="mt-0.5 size-3.5 shrink-0" />
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

      <Pagination
        basePath="/site-visits"
        params={params}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </>
  );
}
