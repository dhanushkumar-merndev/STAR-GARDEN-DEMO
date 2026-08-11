import 'server-only';

import { createClient } from '@/lib/supabase/server';
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

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export interface AdminDashboard {
  leadsToday: number;
  leadsThisWeek: number;
  leadsThisMonth: number;
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
}

export async function getAdminDashboard(user: SessionUser): Promise<AdminDashboard> {
  const supabase = await createClient();

  const [
    today,
    week,
    month,
    unassigned,
    noNextAction,
    allLeads,
    visitsTodayList,
    visitsOverdueList,
    followUps,
    designs,
    execution,
    audit,
  ] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday()),
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', daysAgo(7)),
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', daysAgo(30)),
    supabase.from('leads').select('id', { count: 'exact', head: true }).is('assigned_bdm_id', null).not('status', 'in', '("LOST","CLOSED")'),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .is('next_action_at', null)
      .not('status', 'in', '("LOST","CLOSED")'),
    // Grouping is done in JS: the row count here is an internal CRM's pipeline,
    // not a warehouse, and a materialised view would be premature (§3.2).
    supabase
      .from('leads')
      .select('source, status, assigned_bdm:profiles!leads_assigned_bdm_id_fkey(full_name)')
      .gte('created_at', daysAgo(90))
      .limit(5000),
    listSiteVisits(user, { scope: 'TODAY', limit: 200 }),
    listSiteVisits(user, { scope: 'OVERDUE', limit: 200 }),
    followUpCounts(user),
    designCounts(user),
    executionCounts(user),
    supabase
      .from('audit_logs')
      .select('id, action, entity_type, created_at, actor:profiles!audit_logs_actor_user_id_fkey(full_name)')
      .in('action', [
        'lead.assigned',
        'lead.reassigned',
        'design.version_approved',
        'file.downloaded',
        'execution.completed',
        'lead.status_changed',
      ])
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const rows = (allLeads.data ?? []) as unknown as {
    source: string;
    status: string;
    assigned_bdm: { full_name: string } | null;
  }[];

  const tally = <K extends string>(items: (K | null | undefined)[]) => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (!item) continue;
      map.set(item, (map.get(item) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };

  return {
    leadsToday: today.count ?? 0,
    leadsThisWeek: week.count ?? 0,
    leadsThisMonth: month.count ?? 0,
    unassigned: unassigned.count ?? 0,
    noNextAction: noNextAction.count ?? 0,
    bySource: tally(rows.map((r) => r.source)).map(([source, count]) => ({ source, count })),
    byStatus: tally(rows.map((r) => r.status)).map(([status, count]) => ({ status, count })),
    byBdm: tally(rows.map((r) => r.assigned_bdm?.full_name ?? 'Unassigned')).map(([name, count]) => ({
      name,
      count,
    })),
    followUps,
    designs,
    execution,
    visitsToday: visitsTodayList.length,
    visitsOverdue: visitsOverdueList.length,
    recentActivity: ((audit.data ?? []) as unknown as {
      id: string;
      action: string;
      entity_type: string;
      created_at: string;
      actor: { full_name: string } | null;
    }[]).map((row) => ({
      id: row.id,
      action: row.action,
      entity_type: row.entity_type,
      created_at: row.created_at,
      actor: row.actor?.full_name ?? null,
    })),
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
