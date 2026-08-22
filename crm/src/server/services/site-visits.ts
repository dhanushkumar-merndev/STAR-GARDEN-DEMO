import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { DEFAULT_PAGE_SIZE, type PaginatedResult } from '@/lib/pagination';
import { AuditAction, recordAudit } from '@/lib/audit';
import {
  adminUserIds,
  notify,
  notifyMany,
  NotificationCopy,
  type NotifyParams,
} from '@/lib/notifications';
import { sendStaffEmail } from '@/lib/email';
import { siteVisitAssignedEmail } from '@/lib/email/templates';
import { assertCanReadSiteVisit, assertCanWriteLead, assertLeadCanStartDelivery } from '@/lib/permissions/guards';
import { canScheduleVisitTime } from '@/lib/permissions';
import { assertSiteVisitTransition } from '@/lib/state-machines';
import { hasVisitDayArrived } from '@/lib/utils/visit-timing';
import { getSettings } from '@/lib/settings';
import type { SessionUser } from '@/lib/auth/session';
import type { SiteVisitRow } from '@/types/database';
import { refreshLeadNextAction } from './activities';
import { assignDesigner } from './designs';

/**
 * Site visits (AGENTS.md §8.3, extended by the operations brief).
 *
 * Three rules the brief adds to the original:
 *
 *   1. **The Admin owns the calendar.** Only an Admin books or moves a visit.
 *      The designer sees the time they were given; they cannot move it, which
 *      is what stops two people quietly rearranging the same customer's
 *      morning.
 *   2. **One landscaper owns the site.** The designer named on the visit is the
 *      one offered first when the design project is created, so the person who
 *      stood in the garden is the person who draws it.
 *   3. **The journey is three taps, not a feed.** "Start" when they leave,
 *      "Reached site" when they arrive, and that is all. Coordinates are
 *      captured at most once per tap and only when the browser prompt was
 *      accepted — declining still lets the step happen. There is no polling and
 *      no capture between the taps (§3.2, §8.3, §18).
 */

export interface SiteVisitWithLead extends SiteVisitRow {
  lead: { id: string; lead_code: string; customer_name: string; mobile_country_code: string; mobile_normalized: string } | null;
  designer?: { id: string; full_name: string } | null;
}

export async function scheduleSiteVisit(
  user: SessionUser,
  input: {
    lead_id: string;
    scheduled_start_at: string;
    scheduled_end_at?: string;
    address: string;
    latitude?: number;
    longitude?: number;
    map_url?: string;
    notes?: string;
    designer_id: string;
  },
): Promise<SiteVisitRow> {
  if (!canScheduleVisitTime(user)) {
    throw new AppError(
      'FORBIDDEN',
      'Only an Admin can book a site visit time. Ask an Admin to schedule it.',
    );
  }

  const lead = await assertCanWriteLead(user, input.lead_id);
  assertLeadCanStartDelivery(lead);
  const supabase = await createClient();

  // A visit is the operational next step after the customer says they are
  // interested. Keep this check on the server so a forged form submission
  // cannot bypass the locked tab in the UI.
  const { data: latestCallOutcome } = await supabase
    .from('activities')
    .select('outcome')
    .eq('lead_id', input.lead_id)
    .eq('type', 'CALL_OUTCOME')
    .order('activity_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestCallOutcome?.outcome !== 'INTERESTED') {
    throw new AppError('INVALID_TRANSITION', 'Record the customer as Interested before scheduling a site visit.');
  }

  // The designer who attends is the one who will later own the design, so the
  // choice is made here rather than deferred to the design step — which is why
  // it is required rather than optional.
  const designerId = input.designer_id.trim();

  if (!designerId) {
    throw new AppError('VALIDATION', 'A site visit needs a landscape designer.', {
      fields: { designer_id: 'Choose the designer attending the visit.' },
    });
  }

  const { data: designer } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', designerId)
    .maybeSingle();

  if (
    !designer ||
    !designer.is_active ||
    !['LANDSCAPER', 'ADMIN', 'SUPER_ADMIN'].includes(designer.role)
  ) {
    throw new AppError('VALIDATION', 'That landscape designer is not available.', {
      fields: { designer_id: 'Choose an active landscape designer.' },
    });
  }

  const { data: visit, error } = await supabase
    .from('site_visits')
    .insert({
      lead_id: input.lead_id,
      scheduled_start_at: input.scheduled_start_at,
      scheduled_end_at: input.scheduled_end_at ?? null,
      address: input.address,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      map_url: input.map_url ?? null,
      notes: input.notes ?? null,
      status: 'SCHEDULED',
      assigned_designer_id: designerId,
      // Captured now, not read later: the visit keeps the mode it was booked
      // in even if an Admin flips the setting tomorrow.
      journey_tracking_enabled: (await getSettings()).siteVisitJourneyEnabled,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !visit) {
    throw new AppError('INTERNAL', 'Could not schedule the visit.', { cause: error });
  }

  // The owning BDM always attends; the designer attends when one was named
  // (§8.3, §7.3).
  const attendees = [lead.assigned_bdm_id ?? user.id];
  if (designerId) attendees.push(designerId);

  await supabase.from('site_visit_attendees').insert(
    [...new Set(attendees)].map((userId) => ({
      site_visit_id: visit.id,
      user_id: userId,
      // The designer is required too — the design step is blocked until this
      // visit is complete, so their attendance is not optional.
      is_required: true,
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
      assigned_designer_id: designerId,
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
  if (!canScheduleVisitTime(user)) {
    throw new AppError(
      'FORBIDDEN',
      'Only an Admin can move a site visit. Ask an Admin to reschedule it.',
    );
  }

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
      // A visit that moved has not been travelled to. Leaving EN_ROUTE behind
      // would show the Admin a designer permanently "on the way" to a date that
      // no longer exists.
      journey_status: 'NOT_STARTED',
      journey_started_at: null,
      journey_start_latitude: null,
      journey_start_longitude: null,
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
 * Open visits that could still change mode.
 *
 * "Open" is not enough on its own — a visit whose designer has already tapped
 * Start journey is mid-flight, and pulling the remaining steps out from under
 * them is exactly the thing the per-visit flag exists to prevent.
 */
/**
 * How many open visits `applyJourneySettingToOpenVisits` would actually
 * change right now — not how many are merely *eligible*.
 *
 * Eligibility (open, not started, no check-in) barely shrinks on its own:
 * a visit stays eligible until someone starts or completes it, so counting
 * eligibility alone would keep showing the same large number forever, even
 * immediately after a successful apply had already brought every one of them
 * into line. The `neq` below is what actually answers "does this button have
 * anything left to do" — it drops to 0 the moment nothing is out of sync,
 * and only grows again once the setting changes or a new visit is booked
 * under the old value.
 */
export async function countConvertibleVisits(user: SessionUser): Promise<number> {
  if (!user.isAdmin) return 0;
  const supabase = await createClient();
  const { siteVisitJourneyEnabled } = await getSettings();

  const { count } = await supabase
    .from('site_visits')
    .select('id', { count: 'exact', head: true })
    .not('status', 'in', '("COMPLETED","CANCELLED")')
    .eq('journey_status', 'NOT_STARTED')
    .is('check_in_at', null)
    .neq('journey_tracking_enabled', siteVisitJourneyEnabled);

  return count ?? 0;
}

/**
 * Applies the current setting to visits already booked.
 *
 * Deliberately an explicit action rather than a side effect of the toggle:
 * changing what is on the screen of a designer who is out on the road is the
 * kind of thing somebody should have to ask for.
 */
export async function applyJourneySettingToOpenVisits(
  user: SessionUser,
): Promise<{ updated: number; skipped: number }> {
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'Admin access is required.');

  const { siteVisitJourneyEnabled } = await getSettings();
  const supabase = await createClient();

  // Filtered once, not fetched-then-listed-back: the previous version pulled
  // every open visit's id into memory and sent them all back in a single
  // `.in(id, [...])` filter. That is fine at seed scale and breaks at real
  // scale — 798 open visits produced a ~30KB query string, rejected before
  // it ever reached Postgres. Expressing "not started, no check-in yet" as
  // filters on the UPDATE itself costs the same whether 5 rows match or
  // 50,000 do, and `head: true` skips returning the updated rows' bodies —
  // only the count, from the response header.
  const { count: totalOpen } = await supabase
    .from('site_visits')
    .select('id', { count: 'exact', head: true })
    .not('status', 'in', '("COMPLETED","CANCELLED")');

  // `count` is an option to `update()` itself here, not to a chained
  // `.select()` — postgrest-js only accepts a column list on `.select()`
  // after a mutation. Passing it to `.select()` instead silently drops the
  // count request rather than erroring, which is exactly what happened here
  // the first time: the update ran and applied correctly, but the reported
  // count came back as if nothing had matched.
  // `neq` here (matching `countConvertibleVisits`) is what makes this
  // idempotent: pressing Apply a second time with nothing changed touches
  // zero rows and truthfully reports so, instead of re-writing all 798 rows
  // to the value they already held and claiming that as "updated".
  const { error, count: updatedCount } = await supabase
    .from('site_visits')
    .update({ journey_tracking_enabled: siteVisitJourneyEnabled }, { count: 'exact' })
    .not('status', 'in', '("COMPLETED","CANCELLED")')
    .eq('journey_status', 'NOT_STARTED')
    .is('check_in_at', null)
    .neq('journey_tracking_enabled', siteVisitJourneyEnabled);

  if (error) {
    throw new AppError('INTERNAL', 'Could not update the open visits.', { cause: error });
  }

  const updated = updatedCount ?? 0;
  const skipped = (totalOpen ?? 0) - updated;

  if (updated === 0) return { updated: 0, skipped };

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SETTING_UPDATED,
    entityType: 'site_visit',
    after: {
      journey_tracking_enabled: siteVisitJourneyEnabled,
      row_count: updated,
      note: 'Applied the journey setting to open visits that had not started.',
    },
  });

  return { updated, skipped };
}

/**
 * Refuses a journey step while the Admin has journey tracking switched off.
 *
 * The visit page hides these controls in that mode, but hiding a button is a
 * convenience — this is the check that decides (§7.5). It matters more than
 * usual here because the switch can flip mid-visit: a designer with the page
 * already open would otherwise still be holding a live "Reached site".
 */
function assertJourneyTrackingEnabled(visit: SiteVisitRow): void {
  if (visit.journey_tracking_enabled) return;

  throw new AppError(
    'INVALID_TRANSITION',
    'Journey tracking is switched off for this visit. Complete it in one step instead.',
  );
}

/**
 * Refuses a journey tap before the day the visit is booked for.
 *
 * The UI hides the buttons until then, but that is a convenience — this is the
 * check that decides (§7.5). One-sided: late is fine, early is not. See
 * `lib/utils/visit-timing.ts` for why.
 */
function assertVisitDayArrived(scheduledStartAt: string, action: string): void {
  if (hasVisitDayArrived(scheduledStartAt)) return;

  const when = new Date(scheduledStartAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  });

  throw new AppError(
    'INVALID_TRANSITION',
    `This visit is booked for ${when}. You can ${action} from that morning — ask an Admin to reschedule if it is happening sooner.`,
  );
}

/**
 * "Start" — the designer has left for the site.
 *
 * The Admin sees this on the visits board so a customer asking "is someone
 * coming?" can be answered. It is a single point captured when the button was
 * pressed, not the beginning of a tracking session: nothing else is recorded
 * until the designer presses "Reached site" themselves.
 */
export async function startJourney(
  user: SessionUser,
  input: { site_visit_id: string; latitude: number; longitude: number },
): Promise<SiteVisitRow> {
  const { visit, lead, isAttendee } = await assertCanReadSiteVisit(user, input.site_visit_id);

  if (!isAttendee && !user.isAdmin) {
    await assertCanWriteLead(user, visit.lead_id);
  }

  assertJourneyTrackingEnabled(visit);

  if (visit.status === 'CANCELLED' || visit.status === 'COMPLETED') {
    throw new AppError(
      'INVALID_TRANSITION',
      'This visit is already finished. Start a journey only for an upcoming visit.',
    );
  }

  assertVisitDayArrived(visit.scheduled_start_at, 'start the journey');

  if (visit.journey_status === 'ARRIVED') {
    throw new AppError('INVALID_TRANSITION', 'You have already reached this site.');
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({
      journey_status: 'EN_ROUTE',
      journey_started_at: new Date().toISOString(),
      journey_start_latitude: input.latitude,
      journey_start_longitude: input.longitude,
    })
    .eq('id', input.site_visit_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not start the journey.', { cause: error });
  }

  await supabase.from('activities').insert({
    lead_id: visit.lead_id,
    type: 'SITE_VISIT',
    notes: 'On the way to the site.',
    created_by: user.id,
  });

  await notifyJourneyWatchers(input.site_visit_id, user.id, {
    ...NotificationCopy.visitJourneyStarted(
      user.profile.full_name,
      lead.customer_name ?? 'the site',
    ),
    entityType: 'site_visit',
    entityId: input.site_visit_id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_JOURNEY_STARTED,
    entityType: 'site_visit',
    entityId: updated.id,
    after: {
      journey_started_at: updated.journey_started_at,
      // A flag, not a coordinate pair — the audit trail must not become a
      // second location store.
      location_shared: true,
    },
  });

  return updated;
}

/**
 * "Reached site" — arrival, which is the same moment as check-in.
 *
 * Deliberately one operation rather than two buttons that could disagree: the
 * database constraint `site_visits_arrival_matches_check_in` refuses any row
 * where the journey says ARRIVED but no check-in exists.
 *
 * Coordinates are optional. A user who declines the browser permission prompt
 * must still be able to arrive — refusing would turn an opt-in into a
 * requirement, which §18 forbids.
 */
export async function checkIn(
  user: SessionUser,
  input: { site_visit_id: string; latitude: number; longitude: number },
): Promise<SiteVisitRow> {
  const { visit, lead, isAttendee } = await assertCanReadSiteVisit(user, input.site_visit_id);

  if (!isAttendee && !user.isAdmin) {
    await assertCanWriteLead(user, visit.lead_id);
  }

  assertJourneyTrackingEnabled(visit);
  assertSiteVisitTransition(visit.status, 'IN_PROGRESS');
  assertVisitDayArrived(visit.scheduled_start_at, 'record arrival');

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({
      status: 'IN_PROGRESS',
      journey_status: 'ARRIVED',
      check_in_at: now,
      check_in_latitude: input.latitude,
      check_in_longitude: input.longitude,
      // A designer who arrives without pressing Start still gets a coherent
      // journey rather than an arrival with no departure.
      journey_started_at: visit.journey_started_at ?? now,
    })
    .eq('id', input.site_visit_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not record your arrival.', { cause: error });
  }

  await supabase.from('activities').insert({
    lead_id: visit.lead_id,
    type: 'SITE_VISIT',
    notes: 'Reached the site.',
    created_by: user.id,
  });

  await notifyJourneyWatchers(input.site_visit_id, user.id, {
    ...NotificationCopy.visitArrived(user.profile.full_name, lead.customer_name ?? 'the site'),
    entityType: 'site_visit',
    entityId: input.site_visit_id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_ARRIVED,
    entityType: 'site_visit',
    entityId: updated.id,
    after: {
      check_in_at: updated.check_in_at,
      location_shared: true,
    },
  });

  return updated;
}

/**
 * Puts a different landscape designer on an already-booked visit.
 *
 * Admin-only, and the same call updates the attendee list — a designer who is
 * named on the visit but not invited to it would never see it in their own
 * list, which is the sort of gap that surfaces as a missed appointment.
 */
export async function assignVisitDesigner(
  user: SessionUser,
  input: { site_visit_id: string; designer_id: string },
): Promise<SiteVisitRow> {
  if (!canScheduleVisitTime(user)) {
    throw new AppError('FORBIDDEN', 'Only an Admin can change who attends a site visit.');
  }

  const { visit, lead } = await assertCanReadSiteVisit(user, input.site_visit_id);
  const supabase = await createClient();

  const { data: designer } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', input.designer_id)
    .maybeSingle();

  if (
    !designer ||
    !designer.is_active ||
    !['LANDSCAPER', 'ADMIN', 'SUPER_ADMIN'].includes(designer.role)
  ) {
    throw new AppError('VALIDATION', 'That landscape designer is not available.', {
      fields: { designer_id: 'Choose an active landscape designer.' },
    });
  }

  const previous = visit.assigned_designer_id;

  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({ assigned_designer_id: input.designer_id })
    .eq('id', input.site_visit_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not change the designer.', { cause: error });
  }

  if (previous && previous !== input.designer_id) {
    await supabase
      .from('site_visit_attendees')
      .delete()
      .eq('site_visit_id', input.site_visit_id)
      .eq('user_id', previous);
  }

  await supabase
    .from('site_visit_attendees')
    .upsert(
      { site_visit_id: input.site_visit_id, user_id: input.designer_id, is_required: true },
      { onConflict: 'site_visit_id,user_id' },
    );

  const when = new Date(visit.scheduled_start_at).toLocaleString('en-IN');

  await notify({
    userId: input.designer_id,
    ...NotificationCopy.siteVisitScheduled(lead.customer_name ?? 'Customer', when),
    entityType: 'site_visit',
    entityId: input.site_visit_id,
    skipEmail: true,
  });

  await sendStaffEmail({
    userId: input.designer_id,
    rendered: siteVisitAssignedEmail({
      siteVisitId: input.site_visit_id,
      customerName: lead.customer_name ?? 'Customer',
      address: visit.address,
      scheduledAt: when,
      notes: visit.notes,
    }),
    emailType: 'site_visit.designer_assigned',
    relatedEntityType: 'site_visit',
    relatedEntityId: input.site_visit_id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_DESIGNER_ASSIGNED,
    entityType: 'site_visit',
    entityId: updated.id,
    before: { assigned_designer_id: previous },
    after: { assigned_designer_id: input.designer_id },
  });

  return updated;
}

export async function checkOut(
  user: SessionUser,
  input: {
    site_visit_id: string;
    latitude: number;
    longitude: number;
    notes?: string;
    requirement_summary?: string;
  },
): Promise<SiteVisitRow> {
  const { visit, isAttendee } = await assertCanReadSiteVisit(user, input.site_visit_id);

  if (!isAttendee && !user.isAdmin) {
    await assertCanWriteLead(user, visit.lead_id);
  }

  assertJourneyTrackingEnabled(visit);

  if (!visit.check_in_at) {
    throw new AppError('INVALID_TRANSITION', 'Check in before checking out.');
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({
      check_out_at: new Date().toISOString(),
      check_out_latitude: input.latitude,
      check_out_longitude: input.longitude,
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
      location_shared: true,
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
    /** Overrides the visit's own designer for the design that follows. */
    designer_id?: string;
  },
): Promise<SiteVisitRow> {
  const { visit } = await assertCanReadSiteVisit(user, input.site_visit_id);
  await assertCanWriteLead(user, visit.lead_id);

  assertSiteVisitTransition(visit.status, 'COMPLETED', {
    journeyTrackingEnabled: visit.journey_tracking_enabled,
  });

  const supabase = await createClient();
  // `check_out_at` can never be set without `check_in_at` already being set
  // (site_visits_checkout_after_checkin). With journey tracking off there is
  // no separate check-in step at all — completion is the one button that
  // closes the whole visit — so both are stamped together here, from the
  // same `now`, rather than only the checkout half.
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('site_visits')
    .update({
      status: 'COMPLETED',
      notes: input.notes,
      requirement_summary: input.requirement_summary ?? visit.requirement_summary,
      check_in_at: visit.check_in_at ?? now,
      check_out_at: visit.check_out_at ?? now,
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

  // The designer who attended the site owns the next phase by default, so the
  // Admin is not made to pick the same person again on the lead page — but the
  // completion form can name someone else, which is the case where the visit
  // was attended by one person and the drawing belongs to another.
  // An existing live design is deliberately left alone: a re-visit must not
  // silently reset a drawing that is already in progress or awaiting review.
  const designerId = input.designer_id ?? visit.assigned_designer_id;

  if (input.design_required && designerId) {
    const { data: liveProject, error: projectError } = await supabase
      .from('design_projects')
      .select('id, assigned_designer_id, status')
      .eq('lead_id', visit.lead_id)
      .neq('status', 'CANCELLED')
      .maybeSingle();

    if (projectError) {
      throw new AppError('INTERNAL', 'Could not prepare the landscape design.', { cause: projectError });
    }

    if (!liveProject || (liveProject.status === 'REQUIRED' && !liveProject.assigned_designer_id)) {
      await assignDesigner(user, {
        lead_id: visit.lead_id,
        designer_id: designerId,
        requirement_notes:
          input.requirement_summary ?? updated.requirement_summary ?? undefined,
      });
    }
  }

  await refreshLeadNextAction(visit.lead_id);

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.SITE_VISIT_COMPLETED,
    entityType: 'site_visit',
    entityId: updated.id,
    after: { design_required: input.design_required, designer_id: designerId ?? null },
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

export type SiteVisitScope = 'UPCOMING' | 'TODAY' | 'OVERDUE' | 'COMPLETED' | 'ALL';

/** The scope predicate, shared by the list and the tab counts (see follow-ups). */
function applySiteVisitScope<Q extends {
  in: (column: string, values: string[]) => Q;
  eq: (column: string, value: string) => Q;
  gte: (column: string, value: string) => Q;
  lte: (column: string, value: string) => Q;
  lt: (column: string, value: string) => Q;
}>(query: Q, scope: SiteVisitScope): Q {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const OPEN = ['SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS'];

  switch (scope) {
    case 'UPCOMING':
      return query.in('status', OPEN).gte('scheduled_start_at', now.toISOString());
    case 'TODAY':
      return query
        .in('status', OPEN)
        .gte('scheduled_start_at', startOfToday)
        .lte('scheduled_start_at', endOfToday);
    case 'OVERDUE':
      return query.in('status', OPEN).lt('scheduled_start_at', now.toISOString());
    case 'COMPLETED':
      return query.eq('status', 'COMPLETED');
    default:
      return query;
  }
}

export async function countSiteVisitsByScope(
  scopes: readonly SiteVisitScope[],
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  const { data, error } = await supabase.rpc('site_visit_scope_counts', {
    p_now: now.toISOString(),
    p_start_today: startOfToday,
    p_end_today: endOfToday,
  });
  if (error) {
    console.warn('[site-visits] site_visit_scope_counts RPC unavailable; using count fallback', error);
    const entries = await Promise.all(
      scopes.map(async (scope) => {
        const { count, error: countError } = await applySiteVisitScope(
          supabase.from('site_visits').select('id', { count: 'exact', head: true }),
          scope,
        );
        if (countError) {
          throw new AppError('INTERNAL', 'Could not count site visits.', { cause: countError });
        }
        return [scope, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  const values = data && !Array.isArray(data) && typeof data === 'object' ? data : {};
  return Object.fromEntries(scopes.map((scope) => [scope, Number(values[scope] ?? 0)]));
}

export async function listSiteVisits(
  user: SessionUser,
  options: {
    scope?: 'UPCOMING' | 'TODAY' | 'OVERDUE' | 'COMPLETED' | 'ALL';
    limit?: number;
    offset?: number;
    /**
     * Setting this switches the call into paged mode: `pageSize` rows at that
     * offset, plus an exact `total`. Left unset (dashboard panels) the call
     * keeps its `limit`/`offset` behaviour and skips the count, which is a
     * full scan under RLS.
     */
    page?: number;
    pageSize?: number;
  } = {},
): Promise<PaginatedResult<SiteVisitWithLead>> {
  const supabase = await createClient();
  const paged = options.page !== undefined;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = paged
    ? Math.min(100, Math.max(5, options.pageSize ?? DEFAULT_PAGE_SIZE))
    : Math.min(500, Math.max(1, options.limit ?? 100));
  const offset = paged ? (page - 1) * pageSize : Math.max(0, options.offset ?? 0);

  let query = supabase
    .from('site_visits')
    .select(
      'id, lead_id, scheduled_start_at, address, status, lead:leads!site_visits_lead_id_fkey(id, lead_code, customer_name, mobile_country_code, mobile_normalized)',
      paged ? { count: 'exact' } : undefined,
    );

  query = applySiteVisitScope(query, options.scope ?? 'ALL');

  const { data, count, error } = await query
    .order('scheduled_start_at', { ascending: (options.scope ?? 'ALL') !== 'COMPLETED' })
    .range(offset, offset + pageSize - 1);

  if (error) throw new AppError('INTERNAL', 'Could not load site visits.', { cause: error });

  const items = (data ?? []) as unknown as SiteVisitWithLead[];
  return { items, total: count ?? items.length, page, pageSize };
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

/**
 * Journey updates go to the attendees *and* to every Admin.
 *
 * The Admin is the person a customer rings to ask "is someone coming?", and
 * they are usually not on the attendee list — so notifying attendees alone
 * would tell the news to everyone except the person who needs it.
 */
async function notifyJourneyWatchers(
  siteVisitId: string,
  actorId: string,
  payload: Omit<NotifyParams, 'userId'>,
): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('site_visit_attendees')
    .select('user_id')
    .eq('site_visit_id', siteVisitId);

  const recipients = [
    ...(data ?? []).map((row) => row.user_id),
    ...(await adminUserIds()),
  ].filter((id) => id !== actorId);

  await notifyMany(recipients, payload);
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
