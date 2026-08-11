import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
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

  const { data: followUp, error } = await supabase
    .from('follow_ups')
    .insert({
      lead_id: input.lead_id,
      // Default to whoever owns the lead, so a follow-up never lands nowhere.
      assigned_to: input.assigned_to ?? lead.assigned_bdm_id ?? user.id,
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

export type FollowUpScope = 'TODAY' | 'OVERDUE' | 'UPCOMING' | 'COMPLETED' | 'ALL';

export async function listFollowUps(
  user: SessionUser,
  options: { scope?: FollowUpScope; assignedTo?: string; leadId?: string; limit?: number } = {},
): Promise<FollowUpWithLead[]> {
  const supabase = await createClient();
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  let query = supabase
    .from('follow_ups')
    .select(
      '*, lead:leads!follow_ups_lead_id_fkey(id, lead_code, customer_name, mobile_country_code, mobile_normalized)',
    );

  // Admins see the whole desk; everyone else sees their own queue.
  if (options.assignedTo) {
    query = query.eq('assigned_to', options.assignedTo);
  } else if (!user.isAdmin) {
    query = query.eq('assigned_to', user.id);
  }

  if (options.leadId) query = query.eq('lead_id', options.leadId);

  switch (options.scope ?? 'ALL') {
    case 'TODAY':
      query = query
        .in('status', ['OPEN', 'OVERDUE'])
        .gte('due_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())
        .lte('due_at', endOfToday.toISOString());
      break;
    case 'OVERDUE':
      query = query.in('status', ['OPEN', 'OVERDUE']).lt('due_at', now.toISOString());
      break;
    case 'UPCOMING':
      query = query.in('status', ['OPEN', 'OVERDUE']).gt('due_at', endOfToday.toISOString());
      break;
    case 'COMPLETED':
      query = query.eq('status', 'COMPLETED');
      break;
  }

  const { data, error } = await query
    .order('due_at', { ascending: (options.scope ?? 'ALL') !== 'COMPLETED' })
    .limit(options.limit ?? 100);

  if (error) throw new AppError('INTERNAL', 'Could not load follow-ups.', { cause: error });

  return (data ?? []) as unknown as FollowUpWithLead[];
}

/** Counts for the dashboard tiles (§12.2). */
export async function followUpCounts(user: SessionUser) {
  const supabase = await createClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const base = () => {
    const q = supabase
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .in('status', ['OPEN', 'OVERDUE']);
    return user.isAdmin ? q : q.eq('assigned_to', user.id);
  };

  const [overdue, today] = await Promise.all([
    base().lt('due_at', now.toISOString()),
    base().gte('due_at', startOfToday).lte('due_at', endOfToday),
  ]);

  return {
    overdue: overdue.count ?? 0,
    today: today.count ?? 0,
  };
}
