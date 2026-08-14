import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth/session';
import { designCounts } from './designs';
import { executionCounts } from './execution';
import { followUpCounts } from './follow-ups';
import { listSiteVisits } from './site-visits';

/**
 * Dashboard aggregations (AGENTS.md §12).
 *
 * Every query runs through the user-scoped client, so RLS scopes the numbers to
 * what the viewer is allowed to see — a BDM's "overdue" count cannot include
 * another BDM's leads even though the query does not name an owner.
 */

export interface DashboardDateRange {
  from?: string;
  to?: string;
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/** Calendar dates entered by staff are IST calendar dates, while Postgres stores UTC. */
function istBoundary(date: string, endExclusive = false): string {
  const parts = date.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Date(Date.UTC(year, month - 1, day + (endExclusive ? 1 : 0), -5, -30)).toISOString();
}

function resolveAnalyticsRange(input: DashboardDateRange) {
  // Automatic boundaries are stable for the whole hour, otherwise using the
  // current millisecond would create a different database-cache key per request.
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);

  const to = validDate(input.to) ? istBoundary(input.to, true) : nextHour.toISOString();
  const from = validDate(input.from)
    ? istBoundary(input.from)
    : new Date(new Date(to).getTime() - 90 * 86_400_000).toISOString();

  if (new Date(to) > new Date(from)) return { from, to };

  return {
    from: new Date(nextHour.getTime() - 90 * 86_400_000).toISOString(),
    to: nextHour.toISOString(),
  };
}

export interface AdminDashboard {
  leadsToday: number;
  leadsThisWeek: number;
  leadsThisMonth: number;
  leadsInRange: number;
  analyticsRange: { from: string; to: string };
  leadTrend: { label: string; count: number }[];
  unassigned: number;
  noNextAction: number;
  bySource: { source: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byBdm: { name: string; count: number }[];
  followUps: { overdue: number; today: number };
  designs: Awaited<ReturnType<typeof designCounts>>;
  execution: Awaited<ReturnType<typeof executionCounts>>;
  visitsToday: number;
  visitsOverdue: number;
  recentActivity: {
    id: string;
    action: string;
    entity_type: string;
    created_at: string;
    actor: string | null;
  }[];
  operational: AdminOperationalKpis;
}

export interface DashboardBreakdownItem {
  label: string;
  count: number;
}

export interface AdminOperationalKpis {
  leads: { today: number; all: number; not_interested: number; invalid: number; breakdown: DashboardBreakdownItem[] };
  sales: {
    contacted: number;
    uncontacted: number;
    assigned: number;
    unassigned: number;
    members: Array<{
      id: string;
      name: string;
      assigned: number;
      contacted: number;
      uncontacted: number;
      interested: number;
      not_interested: number;
      invalid: number;
    }>;
  };
  site_visits: { total: number; today: number; completed: number; due: number; breakdown: DashboardBreakdownItem[] };
  designs: { in_process: number; completed: number; overdue: number; approval_pending: number; breakdown: DashboardBreakdownItem[] };
  follow_ups: { pending: number; today: number; completed: number; overdue: number; breakdown: DashboardBreakdownItem[] };
  execution: { in_progress: number; completed: number; blocked: number; overdue: number; breakdown: DashboardBreakdownItem[] };
  trends: Array<{
    day: string;
    leads: number;
    sales: number;
    site_visits: number;
    designs: number;
    follow_ups: number;
    execution: number;
  }>;
}

export async function getAdminDashboard(
  user: SessionUser,
  dateRange: DashboardDateRange = {},
): Promise<AdminDashboard> {
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'The Admin dashboard is Admin-only.');

  const supabase = await createClient();
  const analyticsRange = resolveAnalyticsRange(dateRange);

  const [{ data, error }, { data: operationalData, error: operationalError }] = await Promise.all([
    supabase.rpc('admin_dashboard_snapshot', {
      p_from: analyticsRange.from,
      p_to: analyticsRange.to,
    }),
    supabase.rpc('admin_dashboard_operational_kpis', {
      p_from: analyticsRange.from,
      p_to: analyticsRange.to,
    }),
  ]);

  if (error || !data || Array.isArray(data) || typeof data !== 'object') {
    throw new AppError('INTERNAL', 'Could not load the Admin dashboard.', { cause: error });
  }

  if (operationalError || !operationalData || Array.isArray(operationalData) || typeof operationalData !== 'object') {
    throw new AppError('INTERNAL', 'Could not load operational dashboard KPIs.', { cause: operationalError });
  }

  const snapshot = data as unknown as {
    leads_today: number;
    leads_this_week: number;
    leads_this_month: number;
    leads_in_range: number;
    unassigned: number;
    no_next_action: number;
    lead_trend: { day: string; count: number }[];
    by_source: { source: string; count: number }[];
    by_status: { status: string; count: number }[];
    by_bdm: { name: string; count: number }[];
    follow_ups: { overdue: number; today: number };
    designs: AdminDashboard['designs'];
    execution: AdminDashboard['execution'];
    visits_today: number;
    visits_overdue: number;
    recent_activity: AdminDashboard['recentActivity'];
  };

  return {
    leadsToday: snapshot.leads_today ?? 0,
    leadsThisWeek: snapshot.leads_this_week ?? 0,
    leadsThisMonth: snapshot.leads_this_month ?? 0,
    leadsInRange: snapshot.leads_in_range ?? 0,
    analyticsRange,
    leadTrend: (snapshot.lead_trend ?? []).map((row) => ({ label: row.day, count: row.count })),
    unassigned: snapshot.unassigned ?? 0,
    noNextAction: snapshot.no_next_action ?? 0,
    bySource: snapshot.by_source ?? [],
    byStatus: snapshot.by_status ?? [],
    byBdm: snapshot.by_bdm ?? [],
    followUps: snapshot.follow_ups ?? { overdue: 0, today: 0 },
    designs: snapshot.designs,
    execution: snapshot.execution,
    visitsToday: snapshot.visits_today ?? 0,
    visitsOverdue: snapshot.visits_overdue ?? 0,
    recentActivity: snapshot.recent_activity ?? [],
    operational: operationalData as unknown as AdminOperationalKpis,
  };
}

export interface BdmDashboard {
  newLeads: number;
  activeLeads: number;
  noNextAction: number;
  followUps: { overdue: number; today: number };
  visitsToday: number;
  designsReadyForReview: number;
  activeExecution: number;
}

export async function getBdmDashboard(user: SessionUser): Promise<BdmDashboard> {
  const supabase = await createClient();

  const mine = () =>
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_bdm_id', user.id);

  const [newLeads, activeLeads, noNextAction, followUps, visitsToday, designs, execution] =
    await Promise.all([
      mine().in('status', ['ASSIGNED', 'NEW']),
      mine().not('status', 'in', '("LOST","CLOSED")'),
      mine().is('next_action_at', null).not('status', 'in', '("LOST","CLOSED")'),
      followUpCounts(user),
      listSiteVisits(user, { scope: 'TODAY', limit: 100 }),
      supabase
        .from('design_projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'READY_FOR_REVIEW'),
      supabase
        .from('execution_projects')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '("COMPLETED","CANCELLED")'),
    ]);

  return {
    newLeads: newLeads.count ?? 0,
    activeLeads: activeLeads.count ?? 0,
    noNextAction: noNextAction.count ?? 0,
    followUps,
    visitsToday: visitsToday.length,
    designsReadyForReview: designs.count ?? 0,
    activeExecution: execution.count ?? 0,
  };
}

export interface DesignerDashboard {
  newAssignments: number;
  inProgress: number;
  dueSoon: number;
  revisions: number;
  visitsToAttend: number;
  recentVersions: { id: string; version_number: number; created_at: string; project: string }[];
}

export async function getDesignerDashboard(user: SessionUser): Promise<DesignerDashboard> {
  const supabase = await createClient();
  const counts = await designCounts(user);

  const [newAssignments, inProgress, visits, versions] = await Promise.all([
    supabase
      .from('design_projects')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_designer_id', user.id)
      .eq('status', 'ASSIGNED'),
    supabase
      .from('design_projects')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_designer_id', user.id)
      .eq('status', 'IN_PROGRESS'),
    supabase
      .from('site_visit_attendees')
      .select('site_visit_id, site_visits!inner(status, scheduled_start_at)')
      .eq('user_id', user.id)
      .in('site_visits.status', ['SCHEDULED', 'RESCHEDULED'])
      .gte('site_visits.scheduled_start_at', new Date().toISOString()),
    supabase
      .from('design_versions')
      .select('id, version_number, created_at, design_projects!inner(lead:leads!design_projects_lead_id_fkey(lead_code))')
      .eq('uploaded_by', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return {
    newAssignments: newAssignments.count ?? 0,
    inProgress: inProgress.count ?? 0,
    dueSoon: counts.dueSoon,
    revisions: counts.revisions,
    visitsToAttend: visits.data?.length ?? 0,
    recentVersions: ((versions.data ?? []) as unknown as {
      id: string;
      version_number: number;
      created_at: string;
      design_projects: { lead: { lead_code: string } | null } | null;
    }[]).map((v) => ({
      id: v.id,
      version_number: v.version_number,
      created_at: v.created_at,
      project: v.design_projects?.lead?.lead_code ?? 'Design',
    })),
  };
}

export interface ExecutionDashboard {
  newAssignments: number;
  dueToday: number;
  overdue: number;
  blocked: number;
  nearingCompletion: number;
}

export async function getExecutionDashboard(user: SessionUser): Promise<ExecutionDashboard> {
  const supabase = await createClient();
  const counts = await executionCounts(user);

  const { count: newAssignments } = await supabase
    .from('execution_projects')
    .select('id, execution_assignees!inner(user_id)', { count: 'exact', head: true })
    .eq('execution_assignees.user_id', user.id)
    .in('status', ['ASSIGNED', 'NOT_STARTED']);

  return {
    newAssignments: newAssignments ?? 0,
    dueToday: counts.dueToday,
    overdue: counts.overdue,
    blocked: counts.blocked,
    nearingCompletion: counts.nearingCompletion,
  };
}
