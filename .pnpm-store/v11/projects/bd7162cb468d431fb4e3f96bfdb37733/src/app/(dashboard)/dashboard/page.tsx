import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/session';
import {
  getAdminDashboard,
  getBdmDashboard,
  getDesignerDashboard,
  getExecutionDashboard,
} from '@/server/services/dashboard';
import type { DashboardDateRange } from '@/server/services/dashboard';
import { listFollowUps } from '@/server/services/follow-ups';
import { listSiteVisits } from '@/server/services/site-visits';
import { Alert, Card, CardHeader, CardBody, EmptyState, PageHeader, StatTile } from '@/components/ui';
import { DueBadge, SiteVisitStatusBadge } from '@/components/status';
import { formatDue, formatDateTime, humanizeEnum } from '@/lib/utils/format';
import { LeadAnalyticsChart } from '@/components/dashboard/lead-analytics-charts';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Role dashboards (AGENTS.md §12).
 *
 * Four genuinely different views, not one view with things hidden. A designer
 * has no use for lead-source breakdowns, and an execution lead has no use for
 * follow-up counts — showing them greyed out would just be noise.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;
  const denied = params.denied === '1';
  const dateRange: DashboardDateRange = {
    from: typeof params.from === 'string' ? params.from : undefined,
    to: typeof params.to === 'string' ? params.to : undefined,
  };

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${user.profile.full_name.split(' ')[0]}`}
        subtitle={new Date().toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      />

      {denied ? (
        <div className="mb-4">
          <Alert tone="warn" title="Not available to your role">
            You were redirected here because that section is restricted.
          </Alert>
        </div>
      ) : null}

      {user.role === 'ADMIN' ? <AdminView dateRange={dateRange} /> : null}
      {user.role === 'BDM' ? <BdmView /> : null}
      {user.role === 'DESIGNER' ? <DesignerView /> : null}
      {user.role === 'EXECUTION' ? <ExecutionView /> : null}
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/* -------------------------------------------------------------------------- */
/* Admin (§12.1)                                                               */
/* -------------------------------------------------------------------------- */

async function AdminView({ dateRange }: { dateRange: DashboardDateRange }) {
  const user = await requirePageUser();
  const data = await getAdminDashboard(user, dateRange);
  const analyticsDescription = dateRange.from || dateRange.to ? 'Selected date range' : 'Last 90 days';

  return (
    <div className="space-y-4">
      <form method="GET" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <div className="mr-2 min-w-0">
          <p className="text-sm font-semibold text-ink">Filter charts</p>
          <p className="text-xs text-ink-muted">Choose a date range</p>
        </div>
        <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink-muted">From</span>
              <input
                type="date"
                name="from"
                defaultValue={dateRange.from ?? ''}
                className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink-muted">To</span>
              <input
                type="date"
                name="to"
                defaultValue={dateRange.to ?? ''}
                className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </label>
            <button className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700" type="submit">
              Apply
            </button>
            {dateRange.from || dateRange.to ? (
              <Link href="/dashboard" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Reset
              </Link>
            ) : null}
      </form>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">New leads</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Selected range" value={data.leadsInRange} tone="brand" />
          <StatTile label="Today" value={data.leadsToday} />
          <StatTile label="This month" value={data.leadsThisMonth} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Needs attention</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Unassigned"
            value={data.unassigned}
            tone={data.unassigned > 0 ? 'warn' : 'neutral'}
            href="/leads?scope=UNASSIGNED"
          />
          <StatTile
            label="No next action"
            value={data.noNextAction}
            tone={data.noNextAction > 0 ? 'warn' : 'neutral'}
            href="/leads?scope=NO_NEXT_ACTION"
            hint="Live leads with nothing scheduled"
          />
          <StatTile
            label="Overdue follow-ups"
            value={data.followUps.overdue}
            tone={data.followUps.overdue > 0 ? 'danger' : 'neutral'}
            href="/follow-ups?scope=OVERDUE"
          />
          <StatTile
            label="Overdue visits"
            value={data.visitsOverdue}
            tone={data.visitsOverdue > 0 ? 'danger' : 'neutral'}
            href="/site-visits?scope=OVERDUE"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Design and execution</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Awaiting designer"
            value={data.designs.awaitingAssignment}
            tone={data.designs.awaitingAssignment > 0 ? 'warn' : 'neutral'}
            href="/designs?scope=AWAITING_ASSIGNMENT"
          />
          <StatTile
            label="Ready for review"
            value={data.designs.readyForReview}
            tone="info"
            href="/designs?scope=READY_FOR_REVIEW"
          />
          <StatTile
            label="Blocked projects"
            value={data.execution.blocked}
            tone={data.execution.blocked > 0 ? 'danger' : 'neutral'}
            href="/execution?scope=BLOCKED"
          />
          <StatTile
            label="Overdue tasks"
            value={data.execution.overdue}
            tone={data.execution.overdue > 0 ? 'danger' : 'neutral'}
            href="/execution"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Lead trend" description={analyticsDescription} />
          <CardBody>
            <LeadAnalyticsChart kind="line" trend={data.leadTrend} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Leads by source" description={analyticsDescription} />
          <CardBody>
            <LeadAnalyticsChart
              kind="bar"
              items={data.bySource.map((row) => ({ label: humanizeEnum(row.source), count: row.count }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Leads by owner" description={analyticsDescription} />
          <CardBody>
            <LeadAnalyticsChart kind="bar" items={data.byBdm.map((row) => ({ label: row.name, count: row.count }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Leads by status" description={analyticsDescription} />
          <CardBody>
            <LeadAnalyticsChart
              kind="bar"
              items={data.byStatus.map((row) => ({ label: humanizeEnum(row.status), count: row.count }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            description="Assignments, approvals, downloads and closures"
            action={
              <Link href="/settings/audit" className="text-xs font-medium text-brand-700">
                Full history
              </Link>
            }
          />
          <CardBody className="p-0">
            {data.recentActivity.length === 0 ? (
              <EmptyState title="Nothing yet" description="Recent significant actions appear here." />
            ) : (
              <ul className="divide-y divide-line">
                {data.recentActivity.map((row) => (
                  <li key={row.id} className="px-4 py-2.5 text-sm">
                    <p className="font-medium text-ink">{describeAction(row.action)}</p>
                    <p className="text-xs text-ink-muted">
                      {row.actor ?? 'System'} · {formatDateTime(row.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BDM (§12.2)                                                                 */
/* -------------------------------------------------------------------------- */

async function BdmView() {
  const user = await requirePageUser();
  const [data, dueToday, overdue, visits] = await Promise.all([
    getBdmDashboard(user),
    listFollowUps(user, { scope: 'TODAY', limit: 10 }),
    listFollowUps(user, { scope: 'OVERDUE', limit: 10 }),
    listSiteVisits(user, { scope: 'TODAY', limit: 10 }),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="New leads" value={data.newLeads} tone="brand" href="/leads?status=ASSIGNED" />
        <StatTile label="Active leads" value={data.activeLeads} href="/leads" />
        <StatTile
          label="Due today"
          value={data.followUps.today}
          tone={data.followUps.today > 0 ? 'warn' : 'neutral'}
          href="/follow-ups?scope=TODAY"
        />
        <StatTile
          label="Overdue"
          value={data.followUps.overdue}
          tone={data.followUps.overdue > 0 ? 'danger' : 'neutral'}
          href="/follow-ups?scope=OVERDUE"
        />
      </div>

      {data.noNextAction > 0 ? (
        <Alert tone="warn" title={`${data.noNextAction} lead(s) have no next action`}>
          <Link href="/leads?scope=NO_NEXT_ACTION" className="font-medium underline">
            Schedule a call or visit
          </Link>{' '}
          so they do not go quiet.
        </Alert>
      ) : null}

      {overdue.length > 0 ? (
        <Card>
          <CardHeader title="Overdue follow-ups" description="Clear these first" />
          <CardBody className="p-0">
            <FollowUpList items={overdue} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Today"
          description="Follow-ups due today"
          action={
            <Link href="/follow-ups" className="text-xs font-medium text-brand-700">
              View all
            </Link>
          }
        />
        <CardBody className="p-0">
          {dueToday.length === 0 ? (
            <EmptyState title="Nothing due today" description="Enjoy the quiet, or work ahead." />
          ) : (
            <FollowUpList items={dueToday} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Site visits today"
          action={
            <Link href="/site-visits" className="text-xs font-medium text-brand-700">
              View all
            </Link>
          }
        />
        <CardBody className="p-0">
          {visits.length === 0 ? (
            <EmptyState title="No visits today" />
          ) : (
            <ul className="divide-y divide-line">
              {visits.map((visit) => (
                <li key={visit.id} className="px-4 py-3">
                  <Link href={`/site-visits/${visit.id}`} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {visit.lead?.customer_name ?? 'Site visit'}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {formatDateTime(visit.scheduled_start_at)} · {visit.address ?? 'No address'}
                      </p>
                    </div>
                    <SiteVisitStatusBadge value={visit.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Designs to review"
          value={data.designsReadyForReview}
          tone={data.designsReadyForReview > 0 ? 'info' : 'neutral'}
          href="/designs?scope=READY_FOR_REVIEW"
        />
        <StatTile label="Active execution" value={data.activeExecution} href="/execution" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Designer (§12.3)                                                            */
/* -------------------------------------------------------------------------- */

async function DesignerView() {
  const user = await requirePageUser();
  const data = await getDesignerDashboard(user);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="New assignments"
          value={data.newAssignments}
          tone={data.newAssignments > 0 ? 'brand' : 'neutral'}
          href="/designs"
        />
        <StatTile label="In progress" value={data.inProgress} href="/designs" />
        <StatTile
          label="Due soon"
          value={data.dueSoon}
          tone={data.dueSoon > 0 ? 'warn' : 'neutral'}
          href="/designs?scope=DUE"
        />
        <StatTile
          label="Revisions"
          value={data.revisions}
          tone={data.revisions > 0 ? 'warn' : 'neutral'}
          href="/designs"
        />
      </div>

      {data.visitsToAttend > 0 ? (
        <Alert tone="info" title={`${data.visitsToAttend} site visit(s) to attend`}>
          <Link href="/site-visits" className="font-medium underline">
            See the schedule
          </Link>
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Your recent versions"
          action={
            <Link href="/designs" className="text-xs font-medium text-brand-700">
              All designs
            </Link>
          }
        />
        <CardBody className="p-0">
          {data.recentVersions.length === 0 ? (
            <EmptyState
              title="No versions uploaded yet"
              description="Open a design project to upload version 1."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.recentVersions.map((version) => (
                <li key={version.id} className="px-4 py-3 text-sm">
                  <p className="font-medium text-ink">
                    {version.project} · version {version.version_number}
                  </p>
                  <p className="text-xs text-ink-muted">{formatDateTime(version.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Execution (§12.4)                                                           */
/* -------------------------------------------------------------------------- */

async function ExecutionView() {
  const user = await requirePageUser();
  const data = await getExecutionDashboard(user);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="New assignments"
          value={data.newAssignments}
          tone={data.newAssignments > 0 ? 'brand' : 'neutral'}
          href="/execution"
        />
        <StatTile
          label="Tasks due today"
          value={data.dueToday}
          tone={data.dueToday > 0 ? 'warn' : 'neutral'}
          href="/execution"
        />
        <StatTile
          label="Overdue tasks"
          value={data.overdue}
          tone={data.overdue > 0 ? 'danger' : 'neutral'}
          href="/execution"
        />
        <StatTile
          label="Blocked"
          value={data.blocked}
          tone={data.blocked > 0 ? 'danger' : 'neutral'}
          href="/execution?scope=BLOCKED"
        />
      </div>

      <Alert tone="neutral">
        <span className="font-medium">Nearing completion:</span> {data.nearingCompletion} project(s)
        are past 80% of their task checklist.
      </Alert>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

function FollowUpList({
  items,
}: {
  items: Awaited<ReturnType<typeof listFollowUps>>;
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((followUp) => {
        const due = formatDue(followUp.due_at);
        return (
          <li key={followUp.id} className="px-4 py-3">
            <Link href={`/leads/${followUp.lead_id}`} className="block">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{followUp.title}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {followUp.lead?.customer_name} · {followUp.lead?.lead_code}
                  </p>
                </div>
                <DueBadge label={due.label} tone={due.tone} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function describeAction(action: string): string {
  const map: Record<string, string> = {
    'lead.assigned': 'Lead assigned',
    'lead.reassigned': 'Lead reassigned',
    'lead.status_changed': 'Lead status changed',
    'design.version_approved': 'Design version approved',
    'file.downloaded': 'File downloaded',
    'execution.completed': 'Execution project completed',
  };
  return map[action] ?? humanizeEnum(action.replace(/\./g, ' '));
}
