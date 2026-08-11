import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { assertCanWriteLead } from '@/lib/permissions/guards';
import { assertLeadTransition } from '@/lib/state-machines';
import type { SessionUser } from '@/lib/auth/session';
import type { LeadRow, LeadStatus } from '@/types/database';
import { humanizePostgresError } from './leads';
import { createFollowUp } from './follow-ups';
import { refreshLeadNextAction } from './activities';
import { siteVisitGate } from './designs';

/**
 * Lead disposition — the single decision an Admin makes after a call.
 *
 * The brief is specific about the shape: three buttons, and each one leads
 * somewhere different.
 *
 *   NOT_INTERESTED  the lead is lost, with a stated reason, and moves to the
 *                   "Not interested" tab.
 *   INTERESTED      the next step is a site visit with a named landscape
 *                   designer. The caller gets back what is still missing.
 *   FOLLOW_UP       a dated task, so the lead reappears on the calendar
 *                   instead of going quiet.
 *
 * Modelling this as one operation rather than three separate screens is the
 * point. A status change without the thing that should follow it — a lost lead
 * with no reason, an interested lead with nothing booked — is exactly the state
 * that leaves customers un-called for a fortnight.
 */

export type Disposition = 'INTERESTED' | 'NOT_INTERESTED' | 'FOLLOW_UP';

export interface DispositionInput {
  lead_id: string;
  disposition: Disposition;
  /** Required for NOT_INTERESTED. */
  lost_reason?: string;
  /** Required for FOLLOW_UP. ISO timestamp. */
  follow_up_at?: string;
  follow_up_note?: string;
  /** Free-text note recorded on the timeline for every disposition. */
  note?: string;
}

export interface DispositionResult {
  lead: LeadRow;
  /** What the UI should offer next. Empty when nothing is outstanding. */
  nextStep:
    | { kind: 'NONE' }
    | { kind: 'BOOK_SITE_VISIT'; suggestedDesignerId: string | null }
    | { kind: 'ASSIGN_DESIGN'; suggestedDesignerId: string | null }
    | { kind: 'FOLLOW_UP_SET'; dueAt: string };
}

export async function recordDisposition(
  user: SessionUser,
  input: DispositionInput,
): Promise<DispositionResult> {
  const lead = await assertCanWriteLead(user, input.lead_id);

  switch (input.disposition) {
    case 'NOT_INTERESTED':
      return markNotInterested(user, lead, input);
    case 'FOLLOW_UP':
      return scheduleFollowUp(user, lead, input);
    case 'INTERESTED':
      return markInterested(user, lead, input);
  }
}

/* -------------------------------------------------------------------------- */
/* Not interested                                                              */
/* -------------------------------------------------------------------------- */

async function markNotInterested(
  user: SessionUser,
  lead: LeadRow,
  input: DispositionInput,
): Promise<DispositionResult> {
  const reason = input.lost_reason?.trim();

  if (!reason) {
    throw new AppError('VALIDATION', 'Say why this lead is not interested.', {
      fields: { lost_reason: 'Pick a reason, or type one.' },
    });
  }

  assertLeadTransition(lead.status, 'LOST', { lostReason: reason });

  const supabase = await createClient();

  // LOST is the "not interested" tab. Reusing it rather than adding a status
  // keeps one terminal state for a dead lead, so reporting does not have to
  // remember two names for the same thing.
  const { data: updated, error } = await supabase.rpc('change_lead_status', {
    p_lead_id: input.lead_id,
    p_status: 'LOST' satisfies LeadStatus,
    p_lost_reason: reason,
    p_note: input.note?.trim() || null,
  });

  if (error || !updated) {
    throw new AppError(
      'INTERNAL',
      humanizePostgresError(error, 'Could not mark the lead not interested.'),
      { cause: error },
    );
  }

  await supabase.from('activities').insert({
    lead_id: input.lead_id,
    type: 'CALL_OUTCOME',
    outcome: 'NOT_INTERESTED',
    notes: input.note?.trim() || `Not interested — ${reason}`,
    created_by: user.id,
  });

  await refreshLeadNextAction(input.lead_id);
  await audit(user, input, { status: 'LOST', lost_reason: reason });

  return { lead: updated, nextStep: { kind: 'NONE' } };
}

/* -------------------------------------------------------------------------- */
/* Follow-up                                                                   */
/* -------------------------------------------------------------------------- */

async function scheduleFollowUp(
  user: SessionUser,
  lead: LeadRow,
  input: DispositionInput,
): Promise<DispositionResult> {
  const dueAt = input.follow_up_at?.trim();

  if (!dueAt) {
    throw new AppError('VALIDATION', 'Pick when to call back.', {
      fields: { follow_up_at: 'Choose a date and time.' },
    });
  }

  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError('VALIDATION', 'That is not a valid date.', {
      fields: { follow_up_at: 'Choose a date and time.' },
    });
  }

  // A follow-up in the past would be born overdue and immediately trip the
  // reminder job, which reads as a bug to whoever receives the alert.
  if (parsed.getTime() < Date.now() - 60_000) {
    throw new AppError('VALIDATION', 'Pick a time in the future.', {
      fields: { follow_up_at: 'This time has already passed.' },
    });
  }

  await createFollowUp(user, {
    lead_id: input.lead_id,
    title: input.follow_up_note?.trim() || `Call ${lead.customer_name} back`,
    notes: input.note?.trim() || undefined,
    due_at: parsed.toISOString(),
  });

  const updated = await moveStatus(user, lead, 'FOLLOW_UP', input.note);

  await recordCallOutcomeActivity(user, input.lead_id, 'CALL_LATER', input.note);
  await audit(user, input, { status: 'FOLLOW_UP', follow_up_at: parsed.toISOString() });

  return {
    lead: updated,
    nextStep: { kind: 'FOLLOW_UP_SET', dueAt: parsed.toISOString() },
  };
}

/* -------------------------------------------------------------------------- */
/* Interested                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The customer wants to go ahead.
 *
 * The status moves to CONTACTED — not QUALIFIED, which the state machine
 * reserves for a judgement made after a completed visit. What the caller gets
 * back is the *next* thing to do, which depends on whether the site has been
 * seen yet: book the visit, or assign the design.
 */
async function markInterested(
  user: SessionUser,
  lead: LeadRow,
  input: DispositionInput,
): Promise<DispositionResult> {
  const gate = await siteVisitGate(input.lead_id);

  // AGENTS.md permits reopening a lost lead only as an Admin decision. A
  // customer can change their mind, so selecting Interested is the explicit
  // correction: reopen through the legal LOST -> ASSIGNED transition, then
  // place the lead in CONTACTED.
  let workingLead = lead;
  if (lead.status === 'LOST') {
    if (!user.isAdmin) {
      throw new AppError('FORBIDDEN', 'Only an Admin can reopen a Not interested lead.');
    }
    workingLead = await moveStatus(
      user,
      lead,
      'ASSIGNED',
      'Lead reopened after the customer confirmed interest.',
    );
  }

  const target: LeadStatus =
    workingLead.status === 'NEW' || workingLead.status === 'UNASSIGNED' || workingLead.status === 'ASSIGNED'
      ? 'CONTACTED'
      : workingLead.status;

  const updated =
    target === workingLead.status ? workingLead : await moveStatus(user, workingLead, target, input.note);

  await recordCallOutcomeActivity(user, input.lead_id, 'INTERESTED', input.note);
  await audit(user, input, { status: target, site_visit_unlocked: gate.isUnlocked });

  return {
    lead: updated,
    nextStep: gate.isUnlocked
      ? { kind: 'ASSIGN_DESIGN', suggestedDesignerId: gate.suggestedDesignerId }
      : { kind: 'BOOK_SITE_VISIT', suggestedDesignerId: gate.suggestedDesignerId },
  };
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                      */
/* -------------------------------------------------------------------------- */

async function moveStatus(
  user: SessionUser,
  lead: LeadRow,
  status: LeadStatus,
  note?: string,
): Promise<LeadRow> {
  assertLeadTransition(lead.status, status);

  const supabase = await createClient();
  const { data: updated, error } = await supabase.rpc('change_lead_status', {
    p_lead_id: lead.id,
    p_status: status,
    p_lost_reason: null,
    p_note: note?.trim() || null,
  });

  if (error || !updated) {
    throw new AppError('INTERNAL', humanizePostgresError(error, 'Could not update the lead.'), {
      cause: error,
    });
  }

  return updated;
}

/** The call outcome behind the disposition, recorded on the timeline. */
async function recordCallOutcomeActivity(
  user: SessionUser,
  leadId: string,
  outcome: 'INTERESTED' | 'CALL_LATER',
  note?: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from('activities').insert({
    lead_id: leadId,
    type: 'CALL_OUTCOME',
    outcome,
    notes: note?.trim() || null,
    created_by: user.id,
  });
}

async function audit(
  user: SessionUser,
  input: DispositionInput,
  after: Record<string, unknown>,
): Promise<void> {
  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.LEAD_DISPOSITION_RECORDED,
    entityType: 'lead',
    entityId: input.lead_id,
    after: { disposition: input.disposition, ...after },
  });
}
