import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { DEFAULT_PAGE_SIZE, type PaginatedResult } from '@/lib/pagination';
import { AuditAction, recordAudit } from '@/lib/audit';
import { assertCanWriteLead } from '@/lib/permissions/guards';
import type { SessionUser } from '@/lib/auth/session';
import type { FollowUpRow } from '@/types/database';
import { humanizePostgresError } from './leads';
import { refreshLeadNextAction } from './activities';

/**
 * Follow-up tasks and reminders (AGENTS.md §8.2, §11.3, §13).
 */

export interface FollowUpWithLead extends FollowUpRow {
  lead: { id: string; lead_code: string; customer_name: string; mobile_country_code: string; mobile_normalized: string } | null;
}

export async function createFollowUp(
  user: SessionUser,
  input: {
    lead_id: string;
    title: string;
    notes?: string;
    due_at: string;
    assigned_to?: string;
  },
): Promise<FollowUpRow> {
  const lead = await assertCanWriteLead(user, input.lead_id);
  const supabase = await createClient();
  // Only Admins may redirect work to another staff member. Everyone else's
  // follow-up stays with the lead owner, regardless of submitted form data.
  const assigneeId = user.isAdmin
    ? input.assigned_to ?? lead.assigned_bdm_id ?? user.id
    : lead.assigned_bdm_id ?? user.id;

  const { data: followUp, error } = await supabase
    .from('follow_ups')
    .insert({
      lead_id: input.lead_id,
      // Default to whoever owns the lead, so a follow-up never lands nowhere.
      assigned_to: assigneeId,
      title: input.title,
      notes: input.notes ?? null,
      due_at: input.due_at,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !followUp) {
    throw new AppError('INTERNAL', 'Could not create the follow-up.', { cause: error });
  }

  await supabase.from('activities').insert({
    lead_id: input.lead_id,
    type: 'FOLLOW_UP_CREATED',
    notes: `${input.title} — due ${new Date(input.due_at).toLocaleString('en-IN')}`,
    created_by: user.id,
  });

  await refreshLeadNextAction(input.lead_id);

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.FOLLOW_UP_CREATED,
    entityType: 'follow_up',
    entityId: followUp.id,
    after: { lead_id: input.lead_id, title: input.title, due_at: input.due_at },
  });

  return followUp;
}

/** Completion is transactional — see `complete_follow_up` in migration 07. */
/** Moves the existing reminder instead of creating a duplicate follow-up. */
export async function rescheduleFollowUp(
  user: SessionUser,
  input: { follow_up_id: string; due_at: string; notes?: string },
): Promise<FollowUpRow> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('follow_ups')
    .select('*')
    .eq('id', input.follow_up_id)
    .maybeSingle();

  if (!existing) throw new AppError('NOT_FOUND', 'Follow-up not found.');
  if (!['OPEN', 'OVERDUE'].includes(existing.status)) {
    throw new AppError('INVALID_TRANSITION', 'Only an open follow-up can be rescheduled.');
  }
  if (existing.assigned_to !== user.id) await assertCanWriteLead(user, existing.lead_id);

  const { data: followUp, error } = await supabase
    .from('follow_ups')
    .update({ due_at: input.due_at, status: 'OPEN', notes: input.notes ?? existing.notes })
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error || !followUp) {
    throw new AppError('INTERNAL', 'Could not reschedule the follow-up.', { cause: error });
  }

  await supabase.from('activities').insert({
    lead_id: existing.lead_id,
    type: 'NOTE',
    notes: `Follow-up rescheduled to ${new Date(input.due_at).toLocaleString('en-IN')}.`,
    created_by: user.id,
  });
  await refreshLeadNextAction(existing.lead_id);
  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.FOLLOW_UP_RESCHEDULED,
    entityType: 'follow_up',
    entityId: followUp.id,
    before: { due_at: existing.due_at, status: existing.status },
    after: { due_at: followUp.due_at, status: followUp.status },
  });

  return followUp;
}

export async function completeFollowUp(
  user: SessionUser,
  input: { follow_up_id: string; notes?: string },
): Promise<FollowUpRow> {
  const supabase = await createClient();

  const { data: followUp, error } = await supabase.rpc('complete_follow_up', {
    p_follow_up_id: input.follow_up_id,
    p_notes: input.notes ?? null,
  });

  if (error || !followUp) {
    throw new AppError(
      'INTERNAL',
      humanizePostgresError(error, 'Could not complete the follow-up.'),
      { cause: error },
    );
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.FOLLOW_UP_COMPLETED,
    entityType: 'follow_up',
    entityId: followUp.id,
    after: { lead_id: followUp.lead_id, notes: input.notes ?? null },
  });

  return followUp;
}

export async function cancelFollowUp(
  user: SessionUser,
  input: { follow_up_id: string; reason?: string },
): Promise<FollowUpRow> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('follow_ups')
    .select('*')
    .eq('id', input.follow_up_id)
    .maybeSingle();

  if (!existing) throw new AppError('NOT_FOUND', 'Follow-up not found.');

  // A follow-up may be cancelled by its assignee or by whoever owns the lead.
  if (existing.assigned_to !== user.id) {
    await assertCanWriteLead(user, existing.lead_id);
  }

  const { data: followUp, error } = await supabase
    .from('follow_ups')
    .update({ status: 'CANCELLED', notes: input.reason ?? existing.notes })
    .eq('id', input.follow_up_id)
    .select('*')
    .single();

  if (error || !followUp) {
    throw new AppError('INTERNAL', 'Could not cancel the follow-up.', { cause: error });
  }

  await refreshLeadNextAction(existing.lead_id);

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.FOLLOW_UP_CANCELLED,
    entityType: 'follow_up',
    entityId: followUp.id,
    before: { status: existing.status },
    after: { status: 'CANCELLED', reason: input.reason ?? null },
  });

  return followUp;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export type FollowUpScope = 'PENDING' | 'TODAY' | 'OVERDUE' | 'UPCOMING' | 'COMPLETED' | 'ALL';

/**
 * The scope predicate, shared by the list and the tab counts.
 *
 * Extracted rather than written twice: a count that disagrees with the list it
 * labels is worse than no count at all, and two copies of six date comparisons
 * would eventually disagree.
 *
 * Generic over the builder type because PostgREST's filter builder and its
 * head-count variant are different types with the same filter methods.
 */
function applyFollowUpScope<Q extends {
  in: (column: string, values: string[]) => Q;
  eq: (column: string, value: string) => Q;
  gte: (column: string, value: string) => Q;
  lte: (column: string, value: string) => Q;
  gt: (column: string, value: string) => Q;
  lt: (column: string, value: string) => Q;
}>(query: Q, scope: FollowUpScope): Q {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  switch (scope) {
    case 'PENDING':
      return query.in('status', ['OPEN', 'OVERDUE']);
    case 'TODAY':
      return query
        .in('status', ['OPEN', 'OVERDUE'])
        .gte('due_at', startOfToday)
        .lte('due_at', endOfToday.toISOString());
    case 'OVERDUE':
      return query.in('status', ['OPEN', 'OVERDUE']).lt('due_at', now.toISOString());
    case 'UPCOMING':
      return query.in('status', ['OPEN', 'OVERDUE']).gt('due_at', endOfToday.toISOString());
    case 'COMPLETED':
      return query.eq('status', 'COMPLETED');
    default:
      return query;
  }
}

/** One RLS-scoped aggregate for every tab; avoids one HTTP query per scope. */
export async function countFollowUpsByScope(
  user: SessionUser,
  scopes: readonly FollowUpScope[],
  options: { assignedTo?: string } = {},
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  const assignedTo = options.assignedTo ?? (user.isAdmin ? null : user.id);

  const { data, error } = await supabase.rpc('follow_up_scope_counts', {
    p_assigned_to: assignedTo,
    p_now: now.toISOString(),
    p_start_today: startOfToday,
    p_end_today: endOfToday,
  });
  if (error) {
    console.warn('[follow-ups] follow_up_scope_counts RPC unavailable; using count fallback', error);
    return countFollowUpsByScopeFallback(supabase, user, scopes, options);
  }

  const values = data && !Array.isArray(data) && typeof data === 'object' ? data : {};
  return Object.fromEntries(scopes.map((scope) => [scope, Number(values[scope] ?? 0)]));
}

async function countFollowUpsByScopeFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: SessionUser,
  scopes: readonly FollowUpScope[],
  options: { assignedTo?: string },
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    scopes.map(async (scope) => {
      let query = supabase.from('follow_ups').select('id', { count: 'exact', head: true });
      if (options.assignedTo) query = query.eq('assigned_to', options.assignedTo);
      else if (!user.isAdmin) query = query.eq('assigned_to', user.id);

      const { count, error } = await applyFollowUpScope(query, scope);
      if (error) throw new AppError('INTERNAL', 'Could not count follow-ups.', { cause: error });
      return [scope, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function listFollowUps(
  user: SessionUser,
  options: {
    scope?: FollowUpScope;
    assignedTo?: string;
    leadId?: string;
    limit?: number;
    offset?: number;
    /** `yyyy-mm-dd`. Narrows to one calendar day, for the calendar drill-down. */
    day?: string;
    /**
     * ISO timestamps bounding `due_at`, for the calendar grid.
     *
     * The grid needs every follow-up in the weeks it draws — which is a
     * question about dates, not about row counts. Bounding it by `limit` (as
     * it was) silently dropped work off the end of a busy month; bounding it
     * by the range actually rendered cannot.
     */
    from?: string;
    to?: string;
    /**
     * Setting this switches the call into paged mode: `pageSize` rows at that
     * offset, plus an exact `total`. Left unset (dashboard panels, and the
     * month calendar, which needs whole weeks rather than a page) the call
     * keeps its `limit`/`offset` behaviour and skips the count, which is a
     * full scan under RLS.
     */
    page?: number;
    pageSize?: number;
  } = {},
): Promise<PaginatedResult<FollowUpWithLead>> {
  const supabase = await createClient();
  const paged = options.page !== undefined;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = paged
    ? Math.min(100, Math.max(5, options.pageSize ?? DEFAULT_PAGE_SIZE))
    : Math.min(500, Math.max(1, options.limit ?? 100));
  const offset = paged ? (page - 1) * pageSize : Math.max(0, options.offset ?? 0);

  let query = supabase
    .from('follow_ups')
    .select(
      'id, lead_id, assigned_to, title, notes, due_at, is_automatic, status, completed_at, completed_by, created_by, created_at, updated_at, lead:leads!follow_ups_lead_id_fkey(id, lead_code, customer_name, mobile_country_code, mobile_normalized)',
      paged ? { count: 'exact' } : undefined,
    );

  // Admins see the whole desk; everyone else sees their own queue.
  if (options.assignedTo) {
    query = query.eq('assigned_to', options.assignedTo);
  } else if (!user.isAdmin) {
    query = query.eq('assigned_to', user.id);
  }

  if (options.leadId) query = query.eq('lead_id', options.leadId);

  query = applyFollowUpScope(query, options.scope ?? 'ALL');

  // Applied after the scope, not instead of it: clicking 17 Aug while looking
  // at Overdue should show that day's overdue work, not everything on the day.
  if (options.from) query = query.gte('due_at', options.from);
  if (options.to) query = query.lte('due_at', options.to);

  const dayParts = options.day?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayParts) {
    const year = Number(dayParts[1]);
    const month = Number(dayParts[2]) - 1;
    const date = Number(dayParts[3]);
    query = query
      .gte('due_at', new Date(year, month, date).toISOString())
      .lte('due_at', new Date(year, month, date, 23, 59, 59, 999).toISOString());
  }

  const { data, count, error } = await query
    .order('due_at', { ascending: (options.scope ?? 'ALL') !== 'COMPLETED' })
    .range(offset, offset + pageSize - 1);

  if (error) throw new AppError('INTERNAL', 'Could not load follow-ups.', { cause: error });

  const items = (data ?? []) as unknown as FollowUpWithLead[];
  return { items, total: count ?? items.length, page, pageSize };
}

/** Counts for the dashboard tiles (§12.2). */
export async function followUpCounts(user: SessionUser) {
  const counts = await countFollowUpsByScope(user, ['OVERDUE', 'TODAY']);

  return {
    overdue: counts.OVERDUE ?? 0,
    today: counts.TODAY ?? 0,
  };
}
