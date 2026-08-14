import type { Metadata } from 'next';
import Link from 'next/link';
import { LuClipboardList } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listFollowUps, type FollowUpScope } from '@/server/services/follow-ups';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { DueBadge, FollowUpStatusBadge } from '@/components/status';
import { FollowUpOutcomeActions } from '@/components/leads/follow-up-actions';
import { WeeklyFollowUpCalendar } from '@/components/follow-ups/weekly-calendar';
import { getConfigOptions } from '@/lib/settings';
import { formatDue, formatDateTime } from '@/lib/utils/format';
import { formatMobile, telHref } from '@/lib/utils/phone';

export const metadata: Metadata = { title: 'Follow-ups' };

const SCOPES: { value: FollowUpScope; label: string }[] = [
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
  const user = await requirePageRole('ADMIN', 'BDM');
  const params = await searchParams;
  const scope = (typeof params.scope === 'string' ? params.scope : 'OVERDUE') as FollowUpScope;

  const [items, calendarItems, lostReasons] = await Promise.all([
    listFollowUps(user, { scope, limit: 100 }),
    listFollowUps(user, { scope: 'ALL', limit: 100 }),
    getConfigOptions('lost_reason'),
  ]);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle={user.isAdmin ? 'Everyone’s follow-ups' : 'Assigned to you'}
      />

      <nav className="-mx-3 mb-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-3 pb-2 lg:mx-0 lg:px-0" aria-label="Filter">
        {SCOPES.map((option) => {
          const active = option.value === scope;
          return (
            <Link
              key={option.value}
              href={`/follow-ups?scope=${option.value}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'tap flex shrink-0 snap-start items-center justify-center rounded-full bg-brand-600 px-4 text-sm font-medium whitespace-nowrap text-white'
                  : 'tap flex shrink-0 snap-start items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-ink-muted'
              }
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      <WeeklyFollowUpCalendar items={calendarItems} />

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={<LuClipboardList className="size-8" />}
            title={scope === 'OVERDUE' ? 'Nothing overdue' : 'Nothing here'}
            description={
              scope === 'OVERDUE'
                ? 'Your follow-ups are up to date.'
                : 'Follow-ups you create from a lead appear here.'
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((followUp) => {
              const due = formatDue(followUp.due_at);
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

                    <div className="flex flex-col items-end gap-1.5">
                      {open ? (
                        <DueBadge label={due.label} tone={due.tone} />
                      ) : (
                        <FollowUpStatusBadge value={followUp.status} />
                      )}
                      {followUp.completed_at ? (
                        <Badge tone="neutral">Done {formatDateTime(followUp.completed_at)}</Badge>
                      ) : null}
                    </div>
                  </div>

                  {open ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {followUp.lead ? (
                        <a
                          href={telHref(
                            followUp.lead.mobile_country_code,
                            followUp.lead.mobile_normalized,
                          )}
                          className="tap inline-flex items-center rounded-lg border border-line px-3 text-sm font-medium text-brand-700"
                        >
                          Call{' '}
                          {formatMobile(
                            followUp.lead.mobile_country_code,
                            followUp.lead.mobile_normalized,
                          )}
                        </a>
                      ) : null}
                      {followUp.lead ? (
                        <FollowUpOutcomeActions
                          followUpId={followUp.id}
                          leadId={followUp.lead_id}
                          customerName={followUp.lead.customer_name}
                          lostReasons={lostReasons}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
