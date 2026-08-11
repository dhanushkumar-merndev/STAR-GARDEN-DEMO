import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { overdueWorkEmail } from '@/lib/email/templates';
import type { NotificationType } from '@/types/database';

/**
 * In-app notifications (AGENTS.md §13).
 *
 * MVP scope is in-app only — no email, no push, no WhatsApp (§3.2).
 *
 * Written with the service-role client for two reasons: `notifications` has no
 * INSERT policy (a user must not be able to forge their own alerts), and the
 * whole point is to write a row belonging to *someone else*. Every caller has
 * already passed its own authorization check first (§7.5).
 *
 * Delivery is best-effort. A failed notification must never roll back the
 * business change that triggered it.
 */

export interface NotifyParams {
  userId: string | null | undefined;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /**
   * Set when the calling service sends its own richer email for this event, so
   * the recipient does not get the same news twice.
   */
  skipEmail?: boolean;
}

/**
 * Notification types that also justify an email.
 *
 * Deliberately narrow. Anything that arrives on a schedule and repeats — a
 * "due soon" nudge, say — stays in-app, because an inbox full of CRM noise gets
 * filtered and then the important ones are missed too. These are the events
 * that mean *someone is now waiting on you*.
 */
const EMAIL_WORTHY: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'LEAD_ASSIGNED',
  'DESIGNER_ASSIGNED',
  'DESIGN_READY_FOR_REVIEW',
  'DESIGN_REVISION_REQUESTED',
  'DESIGN_APPROVED',
  'EXECUTION_ASSIGNED',
  'EXECUTION_BLOCKED',
  'FOLLOW_UP_OVERDUE',
  'DESIGN_OVERDUE',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_CANCELLED',
]);

export async function notify(params: NotifyParams): Promise<void> {
  if (!params.userId || !isSupabaseConfigured()) return;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from('notifications').insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
    });

    // 23505 is the per-day dedupe index doing its job: the same reminder for
    // the same entity has already been sent today. Not an error — and it also
    // means no duplicate email, because the send is gated behind this insert.
    if (error) {
      if (error.code !== '23505') console.error('[notifications] insert failed', error);
      return;
    }

    await deliverEmail(params);
  } catch (error) {
    console.error('[notifications] unexpected failure', error);
  }
}

/**
 * Mirrors a notification to email.
 *
 * Never throws and never blocks the caller — the in-app row is already written
 * by this point, and email is explicitly a secondary channel. Rich per-event
 * templates are sent from the services that have the full context (a lead's
 * phone number, a visit's address); this generic fallback covers the reminder
 * cron, which only has a title and a one-line body.
 */
async function deliverEmail(params: NotifyParams): Promise<void> {
  if (!isEmailConfigured() || !EMAIL_WORTHY.has(params.type) || !params.userId) return;
  if (params.skipEmail) return;

  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('email, is_active')
      .eq('id', params.userId)
      .maybeSingle();

    if (!profile?.email || !profile.is_active) return;

    const rendered = overdueWorkEmail({
      heading: params.title,
      title: params.body ?? 'Open the CRM to see the details.',
      detail: null,
      path: emailPath(params),
    });

    await sendEmail({
      to: profile.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      emailType: `notification.${params.type.toLowerCase()}`,
      relatedEntityType: params.entityType ?? null,
      relatedEntityId: params.entityId ?? null,
    });
  } catch (error) {
    console.error('[notifications] email delivery failed', error);
  }
}

function emailPath(params: NotifyParams): string {
  const { entityType, entityId } = params;
  if (!entityType || !entityId) return '/dashboard';

  switch (entityType) {
    case 'lead':
      return `/leads/${entityId}`;
    case 'design_project':
      return `/designs/${entityId}`;
    case 'execution_project':
      return `/execution/${entityId}`;
    case 'site_visit':
      return `/site-visits/${entityId}`;
    case 'follow_up':
      return '/follow-ups';
    default:
      return '/dashboard';
  }
}

/** Fan-out to several recipients, skipping duplicates and empty ids. */
export async function notifyMany(
  userIds: (string | null | undefined)[],
  params: Omit<NotifyParams, 'userId'>,
): Promise<void> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  await Promise.all(unique.map((userId) => notify({ ...params, userId })));
}

/** Every active Admin — for events the whole desk should see. */
export async function adminUserIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'ADMIN')
      .eq('is_active', true);
    return (data ?? []).map((r) => r.id);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Message builders                                                            */
/*                                                                             */
/* Kept here rather than inline at each call site so wording stays consistent   */
/* and the notification centre reads like one voice.                            */
/* -------------------------------------------------------------------------- */

export const NotificationCopy = {
  leadAssigned: (leadCode: string, customerName: string) => ({
    type: 'LEAD_ASSIGNED' as NotificationType,
    title: 'New lead assigned to you',
    body: `${leadCode} · ${customerName}`,
  }),

  leadReassigned: (leadCode: string, customerName: string) => ({
    type: 'LEAD_REASSIGNED' as NotificationType,
    title: 'A lead was moved off your list',
    body: `${leadCode} · ${customerName}`,
  }),

  followUpDueSoon: (title: string, leadCode: string) => ({
    type: 'FOLLOW_UP_DUE_SOON' as NotificationType,
    title: 'Follow-up due soon',
    body: `${title} · ${leadCode}`,
  }),

  followUpOverdue: (title: string, leadCode: string) => ({
    type: 'FOLLOW_UP_OVERDUE' as NotificationType,
    title: 'Follow-up overdue',
    body: `${title} · ${leadCode}`,
  }),

  siteVisitScheduled: (customerName: string, when: string) => ({
    type: 'SITE_VISIT_SCHEDULED' as NotificationType,
    title: 'Site visit scheduled',
    body: `${customerName} · ${when}`,
  }),

  siteVisitRescheduled: (customerName: string, when: string) => ({
    type: 'SITE_VISIT_RESCHEDULED' as NotificationType,
    title: 'Site visit moved',
    body: `${customerName} · now ${when}`,
  }),

  siteVisitCancelled: (customerName: string) => ({
    type: 'SITE_VISIT_CANCELLED' as NotificationType,
    title: 'Site visit cancelled',
    body: customerName,
  }),

  designerAssigned: (leadCode: string, customerName: string) => ({
    type: 'DESIGNER_ASSIGNED' as NotificationType,
    title: 'New design assigned to you',
    body: `${leadCode} · ${customerName}`,
  }),

  designDueSoon: (leadCode: string) => ({
    type: 'DESIGN_DUE_SOON' as NotificationType,
    title: 'Design due soon',
    body: leadCode,
  }),

  designOverdue: (leadCode: string) => ({
    type: 'DESIGN_OVERDUE' as NotificationType,
    title: 'Design overdue',
    body: leadCode,
  }),

  designReadyForReview: (leadCode: string, versionNumber: number) => ({
    type: 'DESIGN_READY_FOR_REVIEW' as NotificationType,
    title: 'Design ready for review',
    body: `${leadCode} · version ${versionNumber}`,
  }),

  revisionRequested: (leadCode: string, versionNumber: number) => ({
    type: 'DESIGN_REVISION_REQUESTED' as NotificationType,
    title: 'Revision requested',
    body: `${leadCode} · version ${versionNumber}`,
  }),

  designApproved: (leadCode: string, versionNumber: number) => ({
    type: 'DESIGN_APPROVED' as NotificationType,
    title: 'Design approved',
    body: `${leadCode} · version ${versionNumber} is now the approved design`,
  }),

  executionAssigned: (leadCode: string, customerName: string) => ({
    type: 'EXECUTION_ASSIGNED' as NotificationType,
    title: 'Execution project assigned to you',
    body: `${leadCode} · ${customerName}`,
  }),

  executionTaskDue: (title: string) => ({
    type: 'EXECUTION_TASK_DUE' as NotificationType,
    title: 'Task due today',
    body: title,
  }),

  executionTaskOverdue: (title: string) => ({
    type: 'EXECUTION_TASK_OVERDUE' as NotificationType,
    title: 'Task overdue',
    body: title,
  }),

  executionBlocked: (leadCode: string, blocker: string) => ({
    type: 'EXECUTION_BLOCKED' as NotificationType,
    title: 'Execution project blocked',
    body: `${leadCode} · ${blocker}`,
  }),

  executionCompleted: (leadCode: string) => ({
    type: 'EXECUTION_COMPLETED' as NotificationType,
    title: 'Project completed',
    body: leadCode,
  }),

  /* --- Site visit journey. In-app only: the Admin is watching a board, not
     an inbox, and "someone left the office" is not worth an email. --- */

  visitJourneyStarted: (staffName: string, customerName: string) => ({
    type: 'SITE_VISIT_STARTED' as NotificationType,
    title: 'On the way to site',
    body: `${staffName} has left for ${customerName}`,
  }),

  visitArrived: (staffName: string, customerName: string) => ({
    type: 'SITE_VISIT_ARRIVED' as NotificationType,
    title: 'Reached the site',
    body: `${staffName} has arrived at ${customerName}`,
  }),

  /* --- Accounts --- */

  accountRecorded: (leadCode: string, amount: string) => ({
    type: 'ACCOUNT_RECORDED' as NotificationType,
    title: 'Project value recorded',
    body: `${leadCode} · ${amount}`,
  }),

  accountClosed: (leadCode: string) => ({
    type: 'ACCOUNT_CLOSED' as NotificationType,
    title: 'Project closed',
    body: leadCode,
  }),

  /* --- Access --- */

  roleAssigned: (roleLabel: string) => ({
    type: 'ROLE_ASSIGNED' as NotificationType,
    title: 'Your access has been updated',
    body: `You are now a ${roleLabel}.`,
  }),
} as const;
