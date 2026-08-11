import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { notify, NotificationCopy } from '@/lib/notifications';
import { sendStaffEmail } from '@/lib/email';
import { siteVisitAssignedEmail } from '@/lib/email/templates';
import { assertCanReadSiteVisit, assertCanWriteLead } from '@/lib/permissions/guards';
import { assertSiteVisitTransition } from '@/lib/state-machines';
import type { SessionUser } from '@/lib/auth/session';
import type { SiteVisitRow } from '@/types/database';
import { refreshLeadNextAction } from './activities';

/**
 * Site visits (AGENTS.md §8.3).
 *
 * Location handling is the sensitive part. Coordinates are captured at most
 * twice per visit — once at check-in, once at check-out — and only when the
 * browser prompt was accepted. There is no background tracking, no polling and
 * no location capture outside an active check-in (§3.2, §8.3, §18).
 */

export interface SiteVisitWithLead extends SiteVisitRow {
  lead: { id: string; lead_code: string; customer_name: string; mobile_country_code: string; mobile_normalized: string } | null;
}

export async function scheduleSiteVisit(
  user: SessionUser,
  input: {
    lead_id: string;
    scheduled_start_at: string;
    scheduled_end_at?: string;
    address: string;
    map_url?: string;
    notes?: string;
    designer_id?: string;
  },
): Promise<SiteVisitRow> {
  const lead = await assertCanWriteLead(user, input.lead_id);
  const supabase = await createClient();

  const { data: visit, error } = await supabase
    .from('site_visits')
    .insert({
      lead_id: input.lead_id,
      scheduled_start_at: input.scheduled_start_at,
      scheduled_end_at: input.scheduled_end_at ?? null,
      address: input.address,
      map_url: input.map_url ?? null,
      notes: input.notes ?? null,
      status: 'SCHEDULED',
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !visit) {
    throw new AppError('INTERNAL', 'Could not schedule the visit.', { cause: error });
  }

  // The owning BDM always attends; a designer may be invited (§8.3, §7.3).
  const attendees = [lead.assigned_bdm_id ?? user.id];
  if (input.designer_id) attendees.push(input.designer_id);

  await supabase.from('site_visit_attendees').insert(
    [...new Set(attendees)].map((userId) => ({
      site_visit_id: visit.id,
      user_id: userId,
      is_required: userId !== input.designer_id,
    })),
  );

  await supabase.from('activities').insert({
    lead_id: input.lead_id,
    type: 'SITE_VISIT',
    notes: `Site visit scheduled for ${new Date(input.scheduled_start_at).toLocaleString('en-IN')}.`,
    created_by: user.id,
  });

  // Moving the lead forward is best-effort: a visit is booked either way.
  await supabase
    .from('leads')
    .update({ status: 'SITE_VISIT_SCHEDULED' })
    .eq('id', input.lead_id)
    .in('status', ['ASSIGNED', 'CONTACTED', 'FOLLOW_UP', 'NEW']);

  await refreshLeadNextAction(input.lead_id);

  const when = new Date(input.scheduled_start_at).toLocaleString('en-IN');

  const rendered = siteVisitAssignedEmail({
    siteVisitId: visit.id,
    customerName: lead.customer_name,
    address: input.address,
    scheduledAt: when,
    bdmName: null,
    notes: input.notes,
  });

  for (const attendee of new Set(attendees)) {
    if (attendee === user.id) continue;

    await notify({
      userId: attendee,
      ...NotificationCopy.siteVisitScheduled(lead.customer_name, when),
      entityType: 'site_visit',
      entityId: visit.id,
      skipEmail: true,
    });

    await sendStaffEmail({
      userId: attendee,
      rendered,
      emailType: 'site_visit.scheduled',
      relatedEntityType: 'site_visit',
      relatedEntityId: visit.id,
    });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_SCHEDULED,
    entityType: 'site_visit',
    entityId: visit.id,
    after: {
      lead_id: input.lead_id,
      scheduled_start_at: input.scheduled_start_at,
      designer_invited: input.designer_id ?? null,
    },
  });

  return visit;
}

export async function rescheduleSiteVisit(
  user: SessionUser,
  input: {
    site_visit_id: string;
    scheduled_start_at: string;
    scheduled_end_at?: string;
    reason?: string;
  },
): Promise<SiteVisitRow> {
  const { visit, lead } = await assertCanReadSiteVisit(user, input.site_visit_id);
  await assertCanWriteLead(user, visit.lead_id);

  assertSiteVisitTransition(visit.status, 'RESCHEDULED');

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({
      scheduled_start_at: input.scheduled_start_at,
      scheduled_end_at: input.scheduled_end_at ?? null,
      status: 'RESCHEDULED',
    })
    .eq('id', input.site_visit_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not reschedule the visit.', { cause: error });
  }

  await supabase.from('activities').insert({
    lead_id: visit.lead_id,
    type: 'SITE_VISIT',
    notes: `Visit moved to ${new Date(input.scheduled_start_at).toLocaleString('en-IN')}${
      input.reason ? ` — ${input.reason}` : ''
    }.`,
    created_by: user.id,
  });

  await refreshLeadNextAction(visit.lead_id);
  const recipients = await notifyAttendees(input.site_visit_id, user.id, {
    ...NotificationCopy.siteVisitRescheduled(
      lead.customer_name ?? 'Customer',
      new Date(input.scheduled_start_at).toLocaleString('en-IN'),
    ),
    entityType: 'site_visit',
    entityId: input.site_visit_id,
    skipEmail: true,
  });

  const rendered = siteVisitAssignedEmail({
    siteVisitId: input.site_visit_id,
    customerName: lead.customer_name ?? 'Customer',
    address: visit.address,
    scheduledAt: new Date(input.scheduled_start_at).toLocaleString('en-IN'),
    notes: input.reason ?? visit.notes,
    changed: true,
  });

  for (const recipientId of recipients) {
    await sendStaffEmail({
      userId: recipientId,
      rendered,
      emailType: 'site_visit.rescheduled',
      relatedEntityType: 'site_visit',
      relatedEntityId: input.site_visit_id,
    });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_RESCHEDULED,
    entityType: 'site_visit',
    entityId: updated.id,
    before: { scheduled_start_at: visit.scheduled_start_at },
    after: { scheduled_start_at: input.scheduled_start_at, reason: input.reason ?? null },
  });

  return updated;
}

/**
 * Check-in (§8.3).
 *
 * Coordinates are optional. A user who declines the browser permission prompt
 * must still be able to check in — refusing would turn an opt-in into a
 * requirement, which §18 forbids.
 */
export async function checkIn(
  user: SessionUser,
  input: { site_visit_id: string; latitude?: number; longitude?: number },
): Promise<SiteVisitRow> {
  const { visit, isAttendee } = await assertCanReadSiteVisit(user, input.site_visit_id);

  if (!isAttendee && !user.isAdmin) {
    await assertCanWriteLead(user, visit.lead_id);
  }

  assertSiteVisitTransition(visit.status, 'IN_PROGRESS');

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({
      status: 'IN_PROGRESS',
      check_in_at: new Date().toISOString(),
      check_in_latitude: input.latitude ?? null,
      check_in_longitude: input.longitude ?? null,
    })
    .eq('id', input.site_visit_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not check in.', { cause: error });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_CHECKED_IN,
    entityType: 'site_visit',
    entityId: updated.id,
    after: {
      check_in_at: updated.check_in_at,
      // Recorded as a flag, not a coordinate pair, so the audit trail does not
      // become a second location store.
      location_shared: input.latitude != null && input.longitude != null,
    },
  });

  return updated;
}

export async function checkOut(
  user: SessionUser,
  input: {
    site_visit_id: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
    requirement_summary?: string;
  },
): Promise<SiteVisitRow> {
  const { visit, isAttendee } = await assertCanReadSiteVisit(user, input.site_visit_id);

  if (!isAttendee && !user.isAdmin) {
    await assertCanWriteLead(user, visit.lead_id);
  }

  if (!visit.check_in_at) {
    throw new AppError('INVALID_TRANSITION', 'Check in before checking out.');
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({
      check_out_at: new Date().toISOString(),
      check_out_latitude: input.latitude ?? null,
      check_out_longitude: input.longitude ?? null,
      notes: input.notes ?? visit.notes,
      requirement_summary: input.requirement_summary ?? visit.requirement_summary,
    })
    .eq('id', input.site_visit_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not check out.', { cause: error });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_CHECKED_OUT,
    entityType: 'site_visit',
    entityId: updated.id,
    after: {
      check_out_at: updated.check_out_at,
      location_shared: input.latitude != null && input.longitude != null,
    },
  });

  return updated;
}

export async function completeSiteVisit(
  user: SessionUser,
  input: {
    site_visit_id: string;
    notes: string;
    requirement_summary?: string;
    design_required: boolean;
  },
): Promise<SiteVisitRow> {
  const { visit } = await assertCanReadSiteVisit(user, input.site_visit_id);
  await assertCanWriteLead(user, visit.lead_id);

  assertSiteVisitTransition(visit.status, 'COMPLETED');

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({
      status: 'COMPLETED',
      notes: input.notes,
      requirement_summary: input.requirement_summary ?? visit.requirement_summary,
      check_out_at: visit.check_out_at ?? new Date().toISOString(),
    })
    .eq('id', input.site_visit_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not complete the visit.', { cause: error });
  }

  await supabase.from('activities').insert({
    lead_id: visit.lead_id,
    type: 'SITE_VISIT',
    notes: `Visit completed. ${input.notes}`,
    created_by: user.id,
  });

  // §8.4 step 1: the BDM marks design_required after the visit.
  await supabase
    .from('leads')
    .update({
      status: 'SITE_VISIT_COMPLETED',
      design_required: input.design_required,
      requirement_summary: input.requirement_summary ?? undefined,
    })
    .eq('id', visit.lead_id);

  await refreshLeadNextAction(visit.lead_id);

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_COMPLETED,
    entityType: 'site_visit',
    entityId: updated.id,
    after: { design_required: input.design_required },
  });

  return updated;
}

export async function cancelSiteVisit(
  user: SessionUser,
  input: { site_visit_id: string; cancellation_reason: string },
): Promise<SiteVisitRow> {
  const { visit, lead } = await assertCanReadSiteVisit(user, input.site_visit_id);
  await assertCanWriteLead(user, visit.lead_id);

  assertSiteVisitTransition(visit.status, 'CANCELLED', {
    cancellationReason: input.cancellation_reason,
  });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({ status: 'CANCELLED', cancellation_reason: input.cancellation_reason })
    .eq('id', input.site_visit_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not cancel the visit.', { cause: error });
  }

  await supabase.from('activities').insert({
    lead_id: visit.lead_id,
    type: 'SITE_VISIT',
    notes: `Visit cancelled — ${input.cancellation_reason}`,
    created_by: user.id,
  });

  await refreshLeadNextAction(visit.lead_id);
  await notifyAttendees(input.site_visit_id, user.id, {
    ...NotificationCopy.siteVisitCancelled(lead.customer_name ?? 'Customer'),
    entityType: 'site_visit',
    entityId: input.site_visit_id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_CANCELLED,
    entityType: 'site_visit',
    entityId: updated.id,
    after: { reason: input.cancellation_reason },
  });

  return updated;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export async function listSiteVisits(
  user: SessionUser,
  options: { scope?: 'UPCOMING' | 'TODAY' | 'OVERDUE' | 'COMPLETED' | 'ALL'; limit?: number } = {},
): Promise<SiteVisitWithLead[]> {
  const supabase = await createClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  let query = supabase
    .from('site_visits')
    .select(
      '*, lead:leads!site_visits_lead_id_fkey(id, lead_code, customer_name, mobile_country_code, mobile_normalized)',
    );

  switch (options.scope ?? 'ALL') {
    case 'UPCOMING':
      query = query
        .in('status', ['SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS'])
        .gte('scheduled_start_at', now.toISOString());
      break;
    case 'TODAY':
      query = query
        .in('status', ['SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS'])
        .gte('scheduled_start_at', startOfToday)
        .lte('scheduled_start_at', endOfToday);
      break;
    case 'OVERDUE':
      query = query
        .in('status', ['SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS'])
        .lt('scheduled_start_at', now.toISOString());
      break;
    case 'COMPLETED':
      query = query.eq('status', 'COMPLETED');
      break;
  }

  const { data, error } = await query
    .order('scheduled_start_at', { ascending: (options.scope ?? 'ALL') !== 'COMPLETED' })
    .limit(options.limit ?? 100);

  if (error) throw new AppError('INTERNAL', 'Could not load site visits.', { cause: error });
  return (data ?? []) as unknown as SiteVisitWithLead[];
}

export async function getSiteVisitDetail(user: SessionUser, siteVisitId: string) {
  const { visit, lead, isAttendee } = await assertCanReadSiteVisit(user, siteVisitId);
  const supabase = await createClient();

  const [attendees, files] = await Promise.all([
    supabase
      .from('site_visit_attendees')
      .select('*, profile:profiles!site_visit_attendees_user_id_fkey(id, full_name, role)')
      .eq('site_visit_id', siteVisitId),
    supabase
      .from('files')
      .select('*')
      .eq('site_visit_id', siteVisitId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false }),
  ]);

  return {
    visit,
    lead,
    isAttendee,
    attendees: attendees.data ?? [],
    files: files.data ?? [],
  };
}

async function notifyAttendees(
  siteVisitId: string,
  actorId: string,
  payload: Parameters<typeof notify>[0] extends infer P
    ? P extends { userId: unknown }
      ? Omit<P, 'userId'>
      : never
    : never,
): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('site_visit_attendees')
    .select('user_id')
    .eq('site_visit_id', siteVisitId);

  const recipients: string[] = [];
  for (const row of data ?? []) {
    if (row.user_id === actorId) continue;
    recipients.push(row.user_id);
    await notify({ ...payload, userId: row.user_id });
  }

  return recipients;
}
