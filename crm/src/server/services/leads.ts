import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { notify, NotificationCopy } from '@/lib/notifications';
import { sendStaffEmail } from '@/lib/email';
import { leadAssignedEmail } from '@/lib/email/templates';
import { formatMobile } from '@/lib/utils/phone';
import { assertCanReadLead, assertCanWriteLead } from '@/lib/permissions/guards';
import { canAssignLeadToOthers } from '@/lib/permissions';
import { assertLeadTransition } from '@/lib/state-machines';
import type { SessionUser } from '@/lib/auth/session';
import { getBusinessSettings } from '@/lib/settings';
import type { LeadRow, LeadStatus, UserRole } from '@/types/database';
import { STATUS_FILTERS, type LeadStatusFilter } from '@/lib/leads/status-filters';
import { intakeLead, type DuplicateMatch } from './lead-intake';
import type { CreateLeadInput } from '@/lib/validation/schemas';
import { listAllFavoritedLeadIds } from './lead-favorites';

/**
 * Lead operations (AGENTS.md §8.1, §8.2).
 *
 * Every function begins with an authorization check that does not trust the ids
 * the browser sent (§7.5), and multi-row transitions delegate to the SQL
 * functions in migration 07 so they are atomic (§18).
 */

export interface CreateLeadResult {
  lead: LeadRow;
  duplicateOf: DuplicateMatch | null;
}

export async function createManualLead(
  user: SessionUser,
  input: CreateLeadInput,
): Promise<CreateLeadResult> {
  // A BDM may create a lead, but may not hand it to someone else (§7.2). The
  // RLS insert policy says the same thing; this is the readable half.
  let assignedTo = input.assigned_bdm_id ?? null;
  const { bdmRoleEnabled } = await getBusinessSettings();

  if (assignedTo && assignedTo !== user.id && !canAssignLeadToOthers(user)) {
    throw new AppError('FORBIDDEN', 'Only an Admin can assign a lead to another BDM.', {
      fields: { assigned_bdm_id: 'You can only create leads for yourself.' },
    });
  }

  // When BDM work is switched off, the Admin doing the intake is the owner.
  // This prevents a lead from sitting in an unassigned queue with nobody to
  // complete the visit, design, and execution workflow.
  if (!assignedTo && (user.role === 'BDM' || (user.isAdmin && !bdmRoleEnabled))) {
    assignedTo = user.id;
  }

  const supabase = await createClient();

  if (assignedTo) {
    await assertBdmAssignmentAvailable(supabase, assignedTo);
  }

  return intakeLead(
    {
      customerName: input.customer_name,
      phone: input.mobile,
      email: input.email ?? null,
      locationText: input.location_text ?? null,
      siteAddress: input.site_address ?? null,
      requirementSummary: input.requirement_summary ?? null,
      source: input.source,
      sourceReference: input.source_reference ?? null,
      assignedBdmId: assignedTo,
      nextActionAt: input.next_action_at ?? null,
      createdBy: user.id,
    },
    {
      client: supabase,
      // The user has seen the duplicate warning and chosen to proceed (§8.1).
      allowDuplicate: input.confirm_duplicate === true,
    },
  );
}

export async function updateLead(
  user: SessionUser,
  input: {
    lead_id: string;
    customer_name: string;
    mobile: { countryCode: string; national: string };
    email?: string;
    location_text?: string;
    site_address?: string;
    requirement_summary?: string;
    next_action_at?: string;
  },
): Promise<LeadRow> {
  const before = await assertCanWriteLead(user, input.lead_id);
  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from('leads')
    .update({
      customer_name: input.customer_name,
      mobile_country_code: input.mobile.countryCode,
      mobile_normalized: input.mobile.national,
      email: input.email ?? null,
      location_text: input.location_text ?? null,
      site_address: input.site_address ?? null,
      requirement_summary: input.requirement_summary ?? null,
      next_action_at: input.next_action_at ?? null,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', input.lead_id)
    .select('*')
    .single();

  if (error || !lead) throw new AppError('INTERNAL', 'Could not update the lead.', { cause: error });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.LEAD_UPDATED,
    entityType: 'lead',
    entityId: lead.id,
    before: {
      customer_name: before.customer_name,
      mobile_normalized: before.mobile_normalized,
      email: before.email,
      site_address: before.site_address,
    },
    after: {
      customer_name: lead.customer_name,
      mobile_normalized: lead.mobile_normalized,
      email: lead.email,
      site_address: lead.site_address,
    },
  });

  return lead;
}

/**
 * Assignment and reassignment (§7.1, §8.1 step 7).
 *
 * The lead row, the assignment history and the timeline entry are written by
 * one SQL function so they cannot diverge (§18).
 */
export async function assignLead(
  user: SessionUser,
  input: { lead_id: string; to_user_id: string; reason?: string },
): Promise<LeadRow> {
  if (!canAssignLeadToOthers(user)) {
    throw new AppError('FORBIDDEN', 'Only an Admin can assign leads.');
  }

  const supabase = await createClient();
  await assertBdmAssignmentAvailable(supabase, input.to_user_id);

  const { data: before } = await supabase
    .from('leads')
    .select('id, lead_code, customer_name, assigned_bdm_id')
    .eq('id', input.lead_id)
    .maybeSingle();

  const { data: lead, error } = await supabase.rpc('assign_lead', {
    p_lead_id: input.lead_id,
    p_to_user_id: input.to_user_id,
    p_reason: input.reason ?? null,
  });

  if (error || !lead) {
    throw new AppError('INTERNAL', humanizePostgresError(error, 'Could not assign the lead.'), {
      cause: error,
    });
  }

  const previousOwner = before?.assigned_bdm_id ?? null;

  await recordAudit({
    actorUserId: user.id,
    action: previousOwner ? AuditAction.LEAD_REASSIGNED : AuditAction.LEAD_ASSIGNED,
    entityType: 'lead',
    entityId: lead.id,
    before: { assigned_bdm_id: previousOwner },
    after: { assigned_bdm_id: input.to_user_id, reason: input.reason ?? null },
  });

  await notify({
    userId: input.to_user_id,
    ...NotificationCopy.leadAssigned(lead.lead_code, lead.customer_name),
    entityType: 'lead',
    entityId: lead.id,
    // The templated email below carries the phone number and campaign, so the
    // generic fallback would be a strictly worse duplicate.
    skipEmail: true,
  });

  // Email is best-effort and deliberately unawaited-for-failure: the
  // assignment has already committed and must not be undone by a mail problem.
  await sendStaffEmail({
    userId: input.to_user_id,
    rendered: leadAssignedEmail({
      leadId: lead.id,
      leadCode: lead.lead_code,
      customerName: lead.customer_name,
      mobile: formatMobile(lead.mobile_country_code, lead.mobile_normalized),
      location: lead.location_text,
      source: lead.source.replace(/_/g, ' ').toLowerCase(),
      campaign: lead.meta_campaign_name,
      nextAction: lead.next_action_at
        ? new Date(lead.next_action_at).toLocaleString('en-IN')
        : null,
    }),
    emailType: 'lead.assigned',
    relatedEntityType: 'lead',
    relatedEntityId: lead.id,
  });

  // Tell the previous owner their list changed, so work does not silently
  // disappear from under them.
  if (previousOwner && previousOwner !== input.to_user_id) {
    await notify({
      userId: previousOwner,
      ...NotificationCopy.leadReassigned(lead.lead_code, lead.customer_name),
      entityType: 'lead',
      entityId: lead.id,
    });
  }

  return lead;
}

export async function changeLeadStatus(
  user: SessionUser,
  input: { lead_id: string; status: LeadStatus; lost_reason?: string; note?: string },
): Promise<LeadRow> {
  const before = await assertCanWriteLead(user, input.lead_id);
  const supabase = await createClient();

  // Qualification requires evidence of contact (§8.2).
  let hasContactActivity = true;
  if (input.status === 'QUALIFIED') {
    const { count } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', input.lead_id)
      .in('type', ['CALL_OUTCOME', 'SITE_VISIT']);
    hasContactActivity = (count ?? 0) > 0;
  }

  assertLeadTransition(before.status, input.status, {
    lostReason: input.lost_reason,
    hasContactActivity,
  });

  const { data: lead, error } = await supabase.rpc('change_lead_status', {
    p_lead_id: input.lead_id,
    p_status: input.status,
    p_lost_reason: input.lost_reason ?? null,
    p_note: input.note ?? null,
  });

  if (error || !lead) {
    throw new AppError('INTERNAL', humanizePostgresError(error, 'Could not change the status.'), {
      cause: error,
    });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.LEAD_STATUS_CHANGED,
    entityType: 'lead',
    entityId: lead.id,
    before: { status: before.status },
    after: { status: lead.status, lost_reason: lead.lost_reason, note: input.note ?? null },
  });

  return lead;
}

export async function setDesignRequired(
  user: SessionUser,
  input: { lead_id: string; design_required: boolean; requirement_notes?: string },
): Promise<LeadRow> {
  await assertCanWriteLead(user, input.lead_id);
  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from('leads')
    .update({
      design_required: input.design_required,
      requirement_summary: input.requirement_notes ?? undefined,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', input.lead_id)
    .select('*')
    .single();

  if (error || !lead) throw new AppError('INTERNAL', 'Could not update the lead.', { cause: error });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.LEAD_UPDATED,
    entityType: 'lead',
    entityId: lead.id,
    after: { design_required: input.design_required },
  });

  return lead;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export interface LeadListFilters {
  search?: string;
  /**
   * A lead status, `'ALL'`, or one of the two delivery stages that live in
   * their own tables (`IN_DESIGN`, `IN_EXECUTION`). See `parseStatusFilter`.
   */
  status?: LeadStatusFilter;
  source?: string;
  assignedTo?: string | 'UNASSIGNED' | 'ALL';
  scope?: 'MINE' | 'ALL' | 'UNASSIGNED' | 'NO_NEXT_ACTION';
  page?: number;
  pageSize?: number;
}

export interface LeadListItem extends LeadRow {
  assigned_bdm: { full_name: string } | null;
}

/**
 * Lead list. RLS already restricts the rows a non-Admin can see, so `scope`
 * shapes the view rather than enforcing access.
 */
export async function listLeads(
  user: SessionUser,
  filters: LeadListFilters = {},
): Promise<{ items: LeadListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));
  const deliveryTable =
    filters.status === 'IN_DESIGN'
      ? 'design_projects'
      : filters.status === 'IN_EXECUTION'
        ? 'execution_projects'
        : null;
  const selection = deliveryTable
    ? `*, assigned_bdm:profiles!leads_assigned_bdm_id_fkey(full_name), ${deliveryTable}!inner(id, status)`
    : '*, assigned_bdm:profiles!leads_assigned_bdm_id_fkey(full_name)';

  let query = supabase
    .from('leads')
    .select(selection, { count: 'exact' });

  query = applyLeadListFilters(query, user, filters);

  if (deliveryTable) {
    const excluded =
      deliveryTable === 'design_projects'
        ? '("NOT_REQUIRED","CANCELLED")'
        : '("COMPLETED","CANCELLED")';
    query = query.not(`${deliveryTable}.status`, 'in', excluded);
  } else if (filters.status === 'STARRED') {
    // Personal favourites only — the pin (`is_starred`) is not a tab of its
    // own, it just reorders whatever tab a lead already sits in (below). A
    // plain id list rather than a join: bounded by how many leads one person
    // has clicked a star on, never by the size of `leads` itself.
    const favoriteIds = await listAllFavoritedLeadIds(user);
    // The all-zero id never matches a real row — the plain way to say "no
    // favourites yet, show nothing" without a separate empty-list code path.
    query = query.in('id', favoriteIds.length ? favoriteIds : ['00000000-0000-0000-0000-000000000000']);
  } else if (
    filters.status &&
    filters.status !== 'ALL' &&
    filters.status !== 'IN_DESIGN' &&
    filters.status !== 'IN_EXECUTION'
  ) {
    query = query.eq('status', filters.status);
  }

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query
    // Pinned leads float to the top of whatever tab they're already in —
    // there is no separate "Pinned" tab, this is the whole mechanism.
    .order('is_starred', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new AppError('INTERNAL', 'Could not load leads.', { cause: error });

  return {
    items: (data ?? []) as unknown as LeadListItem[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Every lead-list filter except the stage.
 *
 * Stage is left out because the tab counts need exactly this set — the rows the
 * other controls allow — before splitting it by status, and because two of the
 * stages (`IN_DESIGN`, `IN_EXECUTION`) are not statuses and need an id lookup
 * only the count path has to hand.
 *
 * Generic over the builder so the list query and the count query can share it;
 * PostgREST types them differently despite the identical filter methods.
 */
function applyLeadListFilters<Q extends {
  eq: (column: string, value: string) => Q;
  is: (column: string, value: null) => Q;
  not: (column: string, operator: string, value: string) => Q;
  or: (filters: string) => Q;
}>(query: Q, user: SessionUser, filters: LeadListFilters): Q {
  let next = query;

  if (filters.scope === 'MINE' || (user.role === 'BDM' && !filters.scope)) {
    next = next.eq('assigned_bdm_id', user.id);
  } else if (filters.scope === 'UNASSIGNED') {
    next = next.is('assigned_bdm_id', null);
  } else if (filters.scope === 'NO_NEXT_ACTION') {
    // §8.2 / §12.1: live leads with nothing scheduled next.
    next = next.is('next_action_at', null).not('status', 'in', '("LOST","CLOSED")');
  }

  if (filters.source && filters.source !== 'ALL') {
    next = next.eq('source', filters.source);
  }

  if (filters.assignedTo && filters.assignedTo !== 'ALL') {
    next = filters.assignedTo === 'UNASSIGNED'
      ? next.is('assigned_bdm_id', null)
      : next.eq('assigned_bdm_id', filters.assignedTo);
  }

  const search = filters.search?.trim();
  if (search) {
    const digits = search.replace(/\D/g, '');
    const escaped = search.replace(/[%_,]/g, ' ');
    next = digits.length >= 4
      ? next.or(`mobile_normalized.ilike.%${digits}%,customer_name.ilike.%${escaped}%,lead_code.ilike.%${escaped}%`)
      : next.or(`customer_name.ilike.%${escaped}%,lead_code.ilike.%${escaped}%,location_text.ilike.%${escaped}%`);
  }

  return next;
}

/** All lead stage tabs in one RLS-scoped database aggregate. */
export async function countLeadsByStage(
  user: SessionUser,
  filters: LeadListFilters = {},
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const rawSearch = filters.search?.trim() || null;
  const search = rawSearch?.replace(/[%_,]/g, ' ') ?? null;
  const digits = rawSearch?.replace(/\D/g, '') ?? '';
  const ownerId =
    filters.scope === 'MINE' || (user.role === 'BDM' && !filters.scope) ? user.id : null;
  const assignedTo = filters.assignedTo;

  const { data, error } = await supabase.rpc('lead_stage_counts', {
    p_owner_id: ownerId,
    p_scope_unassigned: filters.scope === 'UNASSIGNED',
    p_no_next_action: filters.scope === 'NO_NEXT_ACTION',
    p_source: filters.source && filters.source !== 'ALL' ? filters.source : null,
    p_assigned_to:
      assignedTo && assignedTo !== 'ALL' && assignedTo !== 'UNASSIGNED' ? assignedTo : null,
    p_assigned_unassigned: assignedTo === 'UNASSIGNED',
    p_search: search,
    p_search_digits: digits || null,
    p_search_has_digits: digits.length >= 4,
  });

  if (error) {
    // Deployments apply application code and migrations independently. Keep the
    // Leads screen available during that short window (or on a stale preview
    // database) instead of turning a missing optimization RPC into a blank
    // page. The normal path above remains one aggregate query.
    console.warn('[leads] lead_stage_counts RPC unavailable; using count fallback', error);
    return countLeadsByStageFallback(supabase, user, filters);
  }

  const counts = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const result: Record<string, number> = {};
  for (const option of STATUS_FILTERS) {
    const value = counts[option.value];
    result[option.value] = typeof value === 'number' ? value : 0;
  }
  return result;
}

/** Compatibility path for databases that have not applied the RPC migration yet. */
async function countLeadsByStageFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: SessionUser,
  filters: LeadListFilters,
): Promise<Record<string, number>> {
  const base = () =>
    applyLeadListFilters(
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      user,
      { ...filters, status: 'ALL' },
    );

  const entries = await Promise.all(
    STATUS_FILTERS.map(async (option) => {
      let response;
      if (option.value === 'ALL') {
        response = await base();
      } else if (option.value === 'IN_DESIGN' || option.value === 'IN_EXECUTION') {
        const table = option.value === 'IN_DESIGN' ? 'design_projects' : 'execution_projects';
        const excluded =
          option.value === 'IN_DESIGN'
            ? '("NOT_REQUIRED","CANCELLED")'
            : '("COMPLETED","CANCELLED")';
        response = await applyLeadListFilters(
          supabase
            .from('leads')
            .select(`id, ${table}!inner(id)`, { count: 'exact', head: true })
            .not(`${table}.status`, 'in', excluded),
          user,
          { ...filters, status: 'ALL' },
        );
      } else if (option.value === 'STARRED') {
        // Personal favourites only — matches `listLeads`'s STARRED branch.
        const favoriteIds = await listAllFavoritedLeadIds(user);
        response = await base().in(
          'id',
          favoriteIds.length ? favoriteIds : ['00000000-0000-0000-0000-000000000000'],
        );
      } else {
        response = await base().eq('status', option.value);
      }

      if (response.error) {
        throw new AppError('INTERNAL', 'Could not count lead stages.', { cause: response.error });
      }
      return [option.value, response.count ?? 0] as const;
    }),
  );

  return Object.fromEntries(entries);
}

/** Full lead detail with its timeline (§11.3). */
export async function getLeadDetail(user: SessionUser, leadId: string) {
  const lead = await assertCanReadLead(user, leadId);
  const supabase = await createClient();

  const [activities, followUps, siteVisits, designProject, executionProject, owner] =
    await Promise.all([
      supabase
        .from('activities')
        .select('*, created_by_profile:profiles!activities_created_by_fkey(full_name)')
        .eq('lead_id', leadId)
        .order('activity_at', { ascending: false })
        .limit(200),
      supabase
        .from('follow_ups')
        .select('*, assignee:profiles!follow_ups_assigned_to_fkey(full_name)')
        .eq('lead_id', leadId)
        .order('due_at', { ascending: true }),
      supabase
        .from('site_visits')
        .select('*')
        .eq('lead_id', leadId)
        .order('scheduled_start_at', { ascending: false }),
      supabase
        .from('design_projects')
        .select('*, designer:profiles!design_projects_assigned_designer_id_fkey(full_name)')
        .eq('lead_id', leadId)
        .neq('status', 'CANCELLED')
        .maybeSingle(),
      supabase
        .from('execution_projects')
        .select('*')
        .eq('lead_id', leadId)
        .neq('status', 'CANCELLED')
        .maybeSingle(),
      lead.assigned_bdm_id
        ? supabase.from('profiles').select('id, full_name').eq('id', lead.assigned_bdm_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const visitRows = siteVisits.data ?? [];
  const visitIds = visitRows.map((visit) => visit.id);
  const { data: siteVisitFiles } = visitIds.length
    ? await supabase
        .from('files')
        .select('*')
        .in('site_visit_id', visitIds)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
    : { data: [] };

  return {
    lead,
    owner: owner.data,
    activities: activities.data ?? [],
    followUps: followUps.data ?? [],
    siteVisits: visitRows,
    designProject: designProject.data,
    executionProject: executionProject.data,
    siteVisitFiles: siteVisitFiles ?? [],
  };
}

/**
 * Who a lead can be assigned to.
 *
 * When the separate BDM role is switched off in Settings — which it is today,
 * because the Admins do the calling themselves — active Admins are offered as
 * lead owners. Listing BDMs in that state would let a lead be handed to a role
 * nobody is currently filling, and the lead would then sit unworked.
 *
 * The BDM role itself is never removed from the database, so turning the
 * setting on later simply makes those people selectable again, with all their
 * historical leads intact.
 */
/**
 * How many people a picker asks for at a time.
 *
 * These lists used to come back whole — every active member of the role, on
 * every page render, so a screen could show three of them in a dropdown. That
 * is the "cost scales with the size of the table, not with what is on screen"
 * shape CLAUDE.md warns about, just in a payload rather than a scan: at 500
 * staff it is 500 `<option>` elements in the HTML of every Leads page load.
 *
 * A page now sends one screenful, and the picker asks the server again as the
 * user types (`searchOwnersAction` and friends).
 */
const PEOPLE_PAGE_SIZE = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PeopleQuery = {
  /** Substring match on the name, from the picker's search box. */
  search?: string;
  limit?: number;
  /**
   * Ids to include even when they fall outside the page — in practice the
   * person already chosen. Without this a capped list would render a picker
   * whose own selection is missing, and the trigger would fall back to the
   * placeholder because Radix reads its label off the selected option.
   */
  include?: (string | null | undefined)[];
};

async function listPeopleByRole(roles: UserRole[], query: PeopleQuery = {}) {
  const supabase = await createClient();
  const search = query.search?.trim().replace(/[%_,]/g, ' ');

  let request = supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', roles)
    .eq('is_active', true)
    .order('full_name')
    .limit(query.limit ?? PEOPLE_PAGE_SIZE);

  if (search) request = request.ilike('full_name', `%${search}%`);

  const { data } = await request;
  const rows = data ?? [];

  // One extra query, and only for ids the page above did not already return.
  // Callers pass whatever their picker currently holds, which on a filter bar
  // can be a sentinel like `ALL` rather than an id — hence the shape check.
  const missing = [
    ...new Set((query.include ?? []).filter((id): id is string => Boolean(id) && UUID.test(id!))),
  ].filter((id) => !rows.some((row) => row.id === id));

  if (missing.length === 0) return rows;

  const { data: pinned } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', missing);

  return [...rows, ...(pinned ?? [])].sort((a, b) =>
    (a.full_name ?? '').localeCompare(b.full_name ?? ''),
  );
}

export async function listAssignableBdms(query: PeopleQuery = {}) {
  const { bdmRoleEnabled } = await getBusinessSettings();

  // Admin and Super Admin can always own a lead, the same way they are
  // always eligible in the designer/execution pickers. BDM joins the list
  // only once the role is actually switched on — offering it earlier would
  // let a lead be handed to a role nobody is filling yet.
  const roles: UserRole[] = bdmRoleEnabled
    ? ['BDM', 'ADMIN', 'SUPER_ADMIN']
    : ['ADMIN', 'SUPER_ADMIN'];

  return listPeopleByRole(roles, query);
}

async function assertBdmAssignmentAvailable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  const { bdmRoleEnabled } = await getBusinessSettings();
  const { data: assignee } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle();

  const expectedRoles: UserRole[] = bdmRoleEnabled
    ? ['BDM', 'ADMIN', 'SUPER_ADMIN']
    : ['ADMIN', 'SUPER_ADMIN'];
  if (!assignee || !assignee.is_active || !expectedRoles.includes(assignee.role)) {
    throw new AppError('VALIDATION', 'Choose an active BDM or Admin to own this lead.');
  }
}

export async function listActiveDesigners(query: PeopleQuery = {}) {
  return listPeopleByRole(['LANDSCAPER', 'ADMIN', 'SUPER_ADMIN'], query);
}

export async function listActiveExecutionStaff(query: PeopleQuery = {}) {
  return listPeopleByRole(['EXECUTION', 'ADMIN', 'SUPER_ADMIN'], query);
}

/**
 * Turns a Postgres exception into something a user can act on.
 *
 * The SQL functions raise with specific SQLSTATEs; anything else keeps a
 * generic message so column names and values never reach the browser (§15).
 */
export function humanizePostgresError(
  error: { code?: string; message?: string } | null,
  fallback: string,
): string {
  if (!error) return fallback;

  switch (error.code) {
    case '42501': // insufficient_privilege — our own RAISE
      return error.message ?? 'You do not have permission to do that.';
    case '23514': // check_violation — our own RAISE
      return error.message ?? fallback;
    case 'P0002':
      return 'That record no longer exists.';
    case '23505':
      return 'That record already exists.';
    default:
      return fallback;
  }
}
