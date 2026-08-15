import type { Metadata } from 'next';
import Link from 'next/link';
import {
  LuArrowRight,
  LuCalendarDays,
  LuChartColumn,
  LuCircleAlert,
  LuClipboardList,
  LuEye,
  LuHardHat,
  LuMapPin,
  LuPencilRuler,
  LuUserPlus,
  LuUsers,
} from 'react-icons/lu';
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
import { formatDateTime, humanizeEnum } from '@/lib/utils/format';
import {
  LeadRankingChart,
  LeadShareChart,
  LeadTrendChart,
} from '@/components/dashboard/lead-analytics-charts';
import { AnalyticsControls } from '@/components/dashboard/analytics-controls';
import { OperationalKpis } from '@/components/dashboard/operational-kpis';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
      {user.role !== 'ADMIN' ? (
        <PageHeader
          title={`Good ${greeting()}, ${user.profile.full_name.split(' ')[0]}`}
          subtitle={new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        />
      ) : null}

      {denied ? (
        <div className="mb-4">
          <Alert tone="warn" title="Not available to your role">
            You were redirected here because that section is restricted.
          </Alert>
        </div>
      ) : null}

      {user.role === 'ADMIN' ? (
        <AdminView dateRange={dateRange} firstName={user.profile.full_name.split(' ')[0] || 'there'} />
      ) : null}
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

async function AdminView({ dateRange, firstName }: { dateRange: DashboardDateRange; firstName: string }) {
  const user = await requirePageUser();
  const data = await getAdminDashboard(user, dateRange);
  const analyticsDescription = formatAnalyticsRange(data.analyticsRange);

  const attention =
    data.unassigned + data.noNextAction + data.followUps.overdue + data.visitsOverdue;

  return (
    <div className="space-y-6">
      <AnalyticsControls
        firstName={firstName}
        dateLabel={new Date().toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        from={dateRange.from}
        to={dateRange.to}
      />

      <OperationalKpis
        data={data.operational}
        rangeLabel={analyticsDescription}
        rangeFrom={data.analyticsRange.from}
        rangeTo={data.analyticsRange.to}
      />

      {false ? (
      <>
      <Section title="New leads" hint={analyticsDescription}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Selected range"
            value={data.leadsInRange}
            tone="brand"
            icon={<LuUsers className="size-4" />}
          />
          <StatTile label="Today" value={data.leadsToday} icon={<LuCalendarDays className="size-4" />} />
          <StatTile
            label="This month"
            value={data.leadsThisMonth}
            icon={<LuChartColumn className="size-4" />}
          />
        </div>
      </Section>

      <Section
        title="Needs attention"
        hint={attention === 0 ? 'All clear' : `${attention} item(s) waiting on someone`}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Unassigned"
            value={data.unassigned}
            tone={data.unassigned > 0 ? 'warn' : 'neutral'}
            href="/leads?scope=UNASSIGNED"
            icon={<LuUserPlus className="size-4" />}
          />
          <StatTile
            label="No next action"
            value={data.noNextAction}
            tone={data.noNextAction > 0 ? 'warn' : 'neutral'}
            href="/leads?scope=NO_NEXT_ACTION"
            hint="Live leads with nothing scheduled"
            icon={<LuCircleAlert className="size-4" />}
          />
          <StatTile
            label="Overdue follow-ups"
            value={data.followUps.overdue}
            tone={data.followUps.overdue > 0 ? 'danger' : 'neutral'}
            href="/follow-ups?scope=OVERDUE"
            icon={<LuClipboardList className="size-4" />}
          />
          <StatTile
            label="Overdue visits"
            value={data.visitsOverdue}
            tone={data.visitsOverdue > 0 ? 'danger' : 'neutral'}
            href="/site-visits?scope=OVERDUE"
            icon={<LuMapPin className="size-4" />}
          />
        </div>
      </Section>

      <Section title="Design and execution">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Awaiting designer"
            value={data.designs.awaitingAssignment}
            tone={data.designs.awaitingAssignment > 0 ? 'warn' : 'neutral'}
            href="/designs?scope=AWAITING_ASSIGNMENT"
            icon={<LuPencilRuler className="size-4" />}
          />
          <StatTile
            label="Ready for review"
            value={data.designs.readyForReview}
            tone={data.designs.readyForReview > 0 ? 'info' : 'neutral'}
            href="/designs?scope=READY_FOR_REVIEW"
            icon={<LuEye className="size-4" />}
          />
          <StatTile
            label="Blocked projects"
            value={data.execution.blocked}
            tone={data.execution.blocked > 0 ? 'danger' : 'neutral'}
            href="/execution?scope=BLOCKED"
            icon={<LuHardHat className="size-4" />}
          />
          <StatTile
            label="Overdue tasks"
            value={data.execution.overdue}
            tone={data.execution.overdue > 0 ? 'danger' : 'neutral'}
            href="/execution"
            icon={<LuClipboardList className="size-4" />}
          />
        </div>
      </Section>

      <Section title="Analytics" hint={analyticsDescription}>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* The trend is the one chart worth reading across, so it gets the
              full width on large screens. */}
          <Card className="lg:col-span-2">
            <CardHeader title="Lead trend" description="Leads received per day" />
            <CardBody>
              <LeadTrendChart trend={data.leadTrend} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Where leads come from" description="Share by source" />
            <CardBody>
              <LeadShareChart
                items={data.bySource.map((row) => ({
                  key: row.source,
                  label: humanizeEnum(row.source),
                  count: row.count,
                }))}
              />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Leads by status" description="Where the pipeline is sitting" />
            <CardBody>
              <LeadRankingChart
                height="h-72"
                items={data.byStatus.map((row) => ({
                  key: row.status,
                  label: humanizeEnum(row.status),
                  count: row.count,
                }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Leads by owner" description="Workload across the team" />
            <CardBody>
              <LeadRankingChart
                height="h-72"
                items={data.byBdm.map((row) => ({ key: row.name, label: row.name, count: row.count }))}
              />
            </CardBody>
          </Card>
        </div>
      </Section>

      </>
      ) : null}

      <Section title="Recent activity">
        <Card>
          <CardHeader
            title="Latest changes"
            description="Assignments, approvals, downloads and closures"
            action={
              <Link
                href="/settings/audit"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                Full history
                <LuArrowRight className="size-3" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {data.recentActivity.length === 0 ? (
              <EmptyState title="Nothing yet" description="Recent significant actions appear here." />
            ) : (
              <ul className="divide-y divide-line">
                {data.recentActivity.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium text-ink">{describeAction(row.action)}</span>
                    <span className="text-xs text-ink-muted">
                      {row.actor ?? 'System'} · {formatDateTime(row.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </Section>
    </div>
  );
}

function formatAnalyticsRange(range: { from: string; to: string }): string {
  const format = (value: string) =>
    new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  // `to` is an exclusive boundary, so show the final included calendar day.
  const inclusiveTo = new Date(new Date(range.to).getTime() - 1);
  return `${format(range.from)} – ${format(inclusiveTo.toISOString())}`;
}

/** A titled band of the dashboard, so the page reads as groups not a wall. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
      </div>
      {children}
    </section>
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
                <DueBadge value={followUp.due_at} />
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
