import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { assertCanWriteLead } from '@/lib/permissions/guards';
import { leadStatusForCallOutcome, assertLeadTransition } from '@/lib/state-machines';
import type { SessionUser } from '@/lib/auth/session';
import type { ActivityRow, CallOutcome, LeadStatus } from '@/types/database';
import { changeLeadStatus, humanizePostgresError } from './leads';

/**
 * Call activity and follow-up management (AGENTS.md §6).
 *
 * The feature is deliberately named this way and not "telephony integration":
 * there is no virtual number and no telephony API (§3.2, §6). The CRM opens the
 * device dialler with a `tel:` link and then records what the BDM tells it.
 */

/**
 * Records that the dialler was opened.
 *
 * §6.3 is explicit that this timestamp is NOT proof a call connected, has a
 * duration, or was answered. It is stored as `CALL_ATTEMPT` and rendered in the
 * timeline with that caveat visible to the user.
 */
export async function recordCallAttempt(
  user: SessionUser,
  leadId: string,
): Promise<ActivityRow> {
  const lead = await assertCanWriteLead(user, leadId);
  const supabase = await createClient();

  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      lead_id: leadId,
      type: 'CALL_ATTEMPT',
      notes: 'Dialler opened from the CRM. Outcome not yet recorded.',
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !activity) {
    throw new AppError('INTERNAL', 'Could not record the call attempt.', { cause: error });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.CALL_ATTEMPT_RECORDED,
    entityType: 'lead',
    entityId: leadId,
    after: { lead_code: lead.lead_code, note: 'Dialler opened; connection state unknown.' },
  });

  return activity;
}

export interface LogCallInput {
  lead_id: string;
  outcome: CallOutcome;
  notes?: string;
  next_action?: string;
  follow_up_at?: string;
  preferred_site_visit_at?: string;
  new_status?: LeadStatus;
  lost_reason?: string;
}

export interface LogCallResult {
  activity: ActivityRow;
  followUpId: string | null;
  newStatus: LeadStatus | null;
}

/**
 * Manual call outcome entry (§6.2).
 *
 * One user action can produce three records — the timeline entry, a follow-up,
 * and a status change — so the order matters: the activity is written first and
 * the rest are additive. A failure partway leaves a lead with an honest
 * timeline rather than a silent gap.
 */
export async function logCallOutcome(
  user: SessionUser,
  input: LogCallInput,
): Promise<LogCallResult> {
  const lead = await assertCanWriteLead(user, input.lead_id);
  const supabase = await createClient();

  const noteParts = [input.notes, input.preferred_site_visit_at
    ? `Customer prefers a site visit around ${new Date(input.preferred_site_visit_at).toLocaleString('en-IN')}.`
    : null].filter(Boolean);

  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      lead_id: input.lead_id,
      type: 'CALL_OUTCOME',
      outcome: input.outcome,
      notes: noteParts.join(' ') || null,
      next_action: input.next_action ?? null,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !activity) {
    throw new AppError('INTERNAL', 'Could not save the call outcome.', { cause: error });
  }

  let followUpId: string | null = null;

  if (input.follow_up_at) {
    const { data: followUp, error: followUpError } = await supabase
      .from('follow_ups')
      .insert({
        lead_id: input.lead_id,
        assigned_to: lead.assigned_bdm_id ?? user.id,
        title: input.next_action?.trim() || `Follow up after ${humanizeOutcome(input.outcome)}`,
        notes: input.notes ?? null,
        due_at: input.follow_up_at,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (followUpError) {
      throw new AppError('INTERNAL', 'The call was saved, but the follow-up could not be created.', {
        cause: followUpError,
      });
    }

    followUpId = followUp?.id ?? null;

    await supabase.from('activities').insert({
      lead_id: input.lead_id,
      type: 'FOLLOW_UP_CREATED',
      notes: `Follow-up due ${new Date(input.follow_up_at).toLocaleString('en-IN')}.`,
      created_by: user.id,
    });
  }

  // The BDM's explicit choice wins; otherwise derive a sensible move.
  const targetStatus =
    input.new_status ?? leadStatusForCallOutcome(lead.status, input.outcome) ?? null;

  let newStatus: LeadStatus | null = null;

  if (targetStatus && targetStatus !== lead.status) {
    assertLeadTransition(lead.status, targetStatus, {
      lostReason: input.lost_reason,
      hasContactActivity: true,
    });

    const updated = await changeLeadStatus(user, {
      lead_id: input.lead_id,
      status: targetStatus,
      lost_reason: input.lost_reason,
      note: `Status updated after a call recorded as ${humanizeOutcome(input.outcome)}.`,
    });
    newStatus = updated.status;
  }

  await refreshLeadNextAction(input.lead_id);

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.CALL_OUTCOME_RECORDED,
    entityType: 'lead',
    entityId: input.lead_id,
    after: {
      outcome: input.outcome,
      next_action: input.next_action ?? null,
      follow_up_at: input.follow_up_at ?? null,
      status: newStatus ?? lead.status,
    },
  });

  return { activity, followUpId, newStatus };
}

export async function addNote(
  user: SessionUser,
  input: { lead_id: string; notes: string },
): Promise<ActivityRow> {
  await assertCanWriteLead(user, input.lead_id);
  const supabase = await createClient();

  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      lead_id: input.lead_id,
      type: 'NOTE',
      notes: input.notes,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !activity) {
    throw new AppError('INTERNAL', 'Could not save the note.', { cause: error });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.NOTE_ADDED,
    entityType: 'lead',
    entityId: input.lead_id,
    after: { note: input.notes.slice(0, 500) },
  });

  return activity;
}

/**
 * Recomputes `leads.next_action_at` from open follow-ups and scheduled visits.
 * Thin wrapper over the SQL helper so callers do not embed the query.
 */
export async function refreshLeadNextAction(leadId: string): Promise<void> {
  const supabase = await createClient();

  const [{ data: followUp }, { data: visit }] = await Promise.all([
    supabase
      .from('follow_ups')
      .select('due_at')
      .eq('lead_id', leadId)
      .in('status', ['OPEN', 'OVERDUE'])
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('site_visits')
      .select('scheduled_start_at')
      .eq('lead_id', leadId)
      .in('status', ['SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS'])
      .order('scheduled_start_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const candidates = [followUp?.due_at, visit?.scheduled_start_at].filter(
    (v): v is string => Boolean(v),
  );

  const next = candidates.length
    ? candidates.reduce((a, b) => (new Date(a) <= new Date(b) ? a : b))
    : null;

  const { error } = await supabase
    .from('leads')
    .update({ next_action_at: next, last_activity_at: new Date().toISOString() })
    .eq('id', leadId);

  if (error) {
    console.error('[leads] could not refresh next action', humanizePostgresError(error, ''), error);
  }
}

export function humanizeOutcome(outcome: CallOutcome): string {
  const labels: Record<CallOutcome, string> = {
    CONNECTED: 'connected',
    NO_ANSWER: 'no answer',
    BUSY: 'busy',
    SWITCHED_OFF: 'switched off',
    INVALID_NUMBER: 'invalid number',
    CALL_LATER: 'call later',
    INTERESTED: 'interested',
    NOT_INTERESTED: 'not interested',
  };
  return labels[outcome];
}

export const CALL_OUTCOME_OPTIONS: { value: CallOutcome; label: string }[] = [
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'NO_ANSWER', label: 'No answer' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'SWITCHED_OFF', label: 'Switched off' },
  { value: 'INVALID_NUMBER', label: 'Invalid number' },
  { value: 'CALL_LATER', label: 'Call later' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
];
