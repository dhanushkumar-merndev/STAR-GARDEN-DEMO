import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { sendCustomerEmail } from '@/lib/email';
import {
  clientPortalInviteEmail,
  clientStatusUpdateEmail,
  type BusinessContact,
  type PipelineStep,
} from '@/lib/email/templates';
import { canManagePortalAccess } from '@/lib/permissions';
import { assertCanReadLead } from '@/lib/permissions/guards';
import { getBusinessSettings } from '@/lib/settings';
import { businessWhatsappUrl } from '@/lib/utils/whatsapp';
import type { SessionUser } from '@/lib/auth/session';
import type {
  DesignStatus,
  ExecutionStatus,
  LeadPortalAccessRow,
  LeadStatus,
  PaymentStatus,
  SiteVisitStatus,
  VisitJourneyStatus,
} from '@/types/database';

/**
 * The customer portal (operations brief §"they can view their lead status").
 *
 * Two halves that must not be confused:
 *
 *   - **The customer's side** reads through `client_portal_jobs()`, a
 *     SECURITY DEFINER function that returns a curated projection. The customer
 *     never touches `leads`, so internal notes, call outcomes, staff names and
 *     other customers' rows are unreachable by construction rather than by a
 *     policy someone has to keep correct.
 *   - **The Admin's side** grants and revokes access, and chooses when to send
 *     a status update. Nothing here fires automatically on an internal status
 *     change: the Admin decides what the customer is told and when.
 */

/* -------------------------------------------------------------------------- */
/* The shape the RPC returns                                                   */
/* -------------------------------------------------------------------------- */

export interface ClientJob {
  lead_id: string;
  lead_code: string;
  customer_name: string;
  status: LeadStatus;
  requirement_summary: string | null;
  location: string | null;
  created_at: string;
  site_visit: {
    scheduled_start_at: string | null;
    status: SiteVisitStatus | null;
    journey_status: VisitJourneyStatus | null;
    completed_at: string | null;
  } | null;
  design: { status: DesignStatus | null; approved_at: string | null } | null;
  execution: {
    status: ExecutionStatus | null;
    progress_percent: number | null;
    planned_start_at: string | null;
    completed_at: string | null;
  } | null;
  account: {
    total_amount: number;
    received_amount: number;
    balance_amount: number;
    currency: string;
    payment_status: PaymentStatus;
    closed_at: string | null;
  } | null;
}

/**
 * The signed-in customer's own jobs.
 *
 * Returns an empty list rather than throwing for a staff member who wanders
 * onto the portal — the function itself filters on `role = 'CLIENT'`, so an
 * empty result is the correct and safe answer.
 */
export async function getMyJobs(): Promise<ClientJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('client_portal_jobs');

  if (error) {
    throw new AppError('INTERNAL', 'Could not load your project.', { cause: error });
  }

  return Array.isArray(data) ? (data as unknown as ClientJob[]) : [];
}

/** Best-effort "last seen" stamp. A failure here must never break the page. */
export async function markPortalSeen(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc('client_portal_seen');
  } catch (error) {
    console.error('[portal] could not stamp last_viewed_at', error);
  }
}

/* -------------------------------------------------------------------------- */
/* The pipeline                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Turns a job into the five stages a customer understands.
 *
 * Pure, and shared between the portal page and the status email, so the two can
 * never tell the customer different stories about the same job.
 *
 * The stages are deliberately the *customer's* milestones, not the CRM's
 * statuses: "we have your enquiry", "we visited", "we designed", "we built it",
 * "it is finished". A customer does not need to know what QUALIFIED means.
 */
export function pipelineFor(job: ClientJob): PipelineStep[] {
  const visitDone =
    job.site_visit?.status === 'COMPLETED' || Boolean(job.site_visit?.completed_at);
  const visitBooked = Boolean(job.site_visit?.scheduled_start_at) && !visitDone;
  const visitEnRoute = job.site_visit?.journey_status === 'EN_ROUTE';

  const designApproved = job.design?.status === 'APPROVED';
  const designStarted =
    Boolean(job.design) && job.design?.status !== 'REQUIRED' && !designApproved;

  const executionDone = job.execution?.status === 'COMPLETED';
  const executionStarted = Boolean(job.execution) && !executionDone;

  const closed = Boolean(job.account?.closed_at) || job.status === 'CLOSED';

  const steps: PipelineStep[] = [
    {
      label: 'Enquiry received',
      state: 'DONE',
      detail: formatDay(job.created_at),
    },
    {
      label: 'Site visit',
      state: visitDone ? 'DONE' : visitBooked ? 'CURRENT' : 'PENDING',
      detail: visitDone
        ? formatDay(job.site_visit?.completed_at ?? null)
        : visitEnRoute
          ? 'our team is on the way'
          : job.site_visit?.scheduled_start_at
            ? `booked for ${formatDayTime(job.site_visit.scheduled_start_at)}`
            : null,
    },
    {
      label: 'Design',
      state: designApproved ? 'DONE' : designStarted ? 'CURRENT' : 'PENDING',
      detail: designApproved
        ? `approved ${formatDay(job.design?.approved_at ?? null)}`
        : designStarted
          ? 'your design is being prepared'
          : null,
    },
    {
      label: 'Execution',
      state: executionDone ? 'DONE' : executionStarted ? 'CURRENT' : 'PENDING',
      detail: executionDone
        ? formatDay(job.execution?.completed_at ?? null)
        : executionStarted && typeof job.execution?.progress_percent === 'number'
          ? `${job.execution.progress_percent}% complete`
          : null,
    },
    {
      label: 'Handover',
      state: closed ? 'DONE' : executionDone ? 'CURRENT' : 'PENDING',
      detail: closed ? formatDay(job.account?.closed_at ?? null) : null,
    },
  ];

  return steps;
}

/** A one-line summary of where a job has reached, for the email subject. */
export function headlineFor(job: ClientJob): string {
  const steps = pipelineFor(job);
  const current = steps.find((step) => step.state === 'CURRENT');
  const lastDone = [...steps].reverse().find((step) => step.state === 'DONE');

  if (!current) return `${lastDone?.label ?? 'Your project'} is complete`;
  return `Your project: ${current.label.toLowerCase()} in progress`;
}

function formatDay(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDayTime(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* -------------------------------------------------------------------------- */
/* Admin: managing access                                                      */
/* -------------------------------------------------------------------------- */

export async function listPortalAccess(
  user: SessionUser,
  leadId: string,
): Promise<LeadPortalAccessRow[]> {
  await assertCanReadLead(user, leadId);
  const supabase = await createClient();

  const { data } = await supabase
    .from('lead_portal_access')
    .select('*')
    .eq('lead_id', leadId)
    .order('is_primary', { ascending: false })
    .order('created_at');

  return data ?? [];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function portalAccessWriteError(error: { code?: string; message?: string } | null): AppError {
  const detail = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();

  // The Customer access UI is harmless without this migration, but a generic
  // 500 makes the next Admin think that the customer's email was at fault.
  if (
    detail.includes('lead_portal_access') &&
    (detail.includes('does not exist') || detail.includes('schema cache') || detail.includes('pgrst205'))
  ) {
    return new AppError(
      'INTERNAL',
      'Customer access is not deployed to this database yet. Run Supabase db push, then try again.',
      { cause: error },
    );
  }

  return new AppError('INTERNAL', 'Could not give that address access.', { cause: error });
}

/**
 * Grants one address a read-only view of one job, and tells them so.
 *
 * The primary address is the one from the lead itself. An alternative is for a
 * customer who gave a work address on the form but wants updates at home — it
 * grants the same read-only view and nothing more, which is why it is safe to
 * let an Admin add one on the customer's word alone.
 */
export async function grantPortalAccess(
  user: SessionUser,
  input: { lead_id: string; email: string; is_primary?: boolean; send_invite?: boolean },
): Promise<LeadPortalAccessRow> {
  if (!canManagePortalAccess(user)) {
    throw new AppError('FORBIDDEN', 'Only an Admin can give a customer access.');
  }

  const email = input.email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    throw new AppError('VALIDATION', 'That does not look like an email address.', {
      fields: { email: 'Enter a valid email address.' },
    });
  }

  const lead = await assertCanReadLead(user, input.lead_id);
  const supabase = await createClient();

  // A staff address must never become a customer login: the provisioning
  // trigger prefers a staff invite, so the account would keep its staff role
  // and this grant would be dead weight that only confuses the next Admin.
  const { data: staffMatch } = await supabase
    .from('staff_invites')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (staffMatch) {
    throw new AppError('VALIDATION', 'That address already belongs to a staff member.', {
      fields: { email: 'Use the customer’s own address, not a staff one.' },
    });
  }

  const isPrimary = input.is_primary ?? false;

  if (isPrimary) {
    // One primary per lead — the partial unique index enforces it, and clearing
    // first turns a constraint violation into a clean handover.
    const { error: clearPrimaryError } = await supabase
      .from('lead_portal_access')
      .update({ is_primary: false })
      .eq('lead_id', input.lead_id);

    if (clearPrimaryError) throw portalAccessWriteError(clearPrimaryError);
  }

  // The original index intentionally normalizes email with lower(btrim()).
  // PostgREST cannot name an expression index in `onConflict`, so an upsert
  // would fail even though the address is valid. Inputs are normalized above;
  // update the known grant or insert a new one explicitly instead.
  const { data: existing, error: existingError } = await supabase
    .from('lead_portal_access')
    .select('id')
    .eq('lead_id', input.lead_id)
    .eq('email', email)
    .maybeSingle();

  if (existingError) throw portalAccessWriteError(existingError);

  const write = existing
    ? supabase
        .from('lead_portal_access')
        .update({
          is_primary: isPrimary,
          invited_by: user.id,
          invited_at: new Date().toISOString(),
          revoked_at: null,
        })
        .eq('id', existing.id)
        .select('*')
        .single()
    : supabase
        .from('lead_portal_access')
        .insert({
          lead_id: input.lead_id,
          email,
          is_primary: isPrimary,
          invited_by: user.id,
          invited_at: new Date().toISOString(),
          revoked_at: null,
        })
        .select('*')
        .single();

  const { data: access, error } = await write;

  if (error || !access) {
    throw portalAccessWriteError(error);
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.PORTAL_ACCESS_GRANTED,
    entityType: 'lead_portal_access',
    entityId: access.id,
    after: { lead_id: input.lead_id, email, is_primary: isPrimary },
  });

  if (input.send_invite !== false) {
    const business = await businessContact();

    await sendCustomerEmail({
      to: email,
      rendered: clientPortalInviteEmail({
        customerName: lead.customer_name,
        leadCode: lead.lead_code,
        loginEmail: email,
        business,
      }),
      emailType: 'portal.invited',
      leadId: input.lead_id,
    });
  }

  return access;
}

export async function revokePortalAccess(
  user: SessionUser,
  input: { access_id: string },
): Promise<void> {
  if (!canManagePortalAccess(user)) {
    throw new AppError('FORBIDDEN', 'Only an Admin can revoke customer access.');
  }

  const supabase = await createClient();

  // Revoked rather than deleted: the history of who could see what is exactly
  // the sort of question that gets asked six months later.
  const { data: access, error } = await supabase
    .from('lead_portal_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', input.access_id)
    .select('*')
    .single();

  if (error || !access) {
    throw new AppError('INTERNAL', 'Could not revoke that access.', { cause: error });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.PORTAL_ACCESS_REVOKED,
    entityType: 'lead_portal_access',
    entityId: access.id,
    after: { lead_id: access.lead_id, email: access.email },
  });
}

/* -------------------------------------------------------------------------- */
/* Admin: sending a status update                                              */
/* -------------------------------------------------------------------------- */

/**
 * Emails the customer where their job has reached.
 *
 * The Admin picks which address receives it — hence `recipient_email`, which is
 * validated against the grants on this lead rather than trusted. Without that
 * check a Server Action could be used to mail an arbitrary inbox a real
 * customer's project details.
 */
export async function sendStatusUpdate(
  user: SessionUser,
  input: { lead_id: string; recipient_email: string; message?: string },
): Promise<{ sent: boolean; recipient: string }> {
  if (!canManagePortalAccess(user)) {
    throw new AppError('FORBIDDEN', 'Only an Admin can email a status update.');
  }

  const lead = await assertCanReadLead(user, input.lead_id);
  const recipient = input.recipient_email.trim().toLowerCase();

  const grants = await listPortalAccess(user, input.lead_id);
  const isGranted = grants.some(
    (grant) => grant.revoked_at === null && grant.email.trim().toLowerCase() === recipient,
  );

  if (!isGranted) {
    throw new AppError('FORBIDDEN', 'That address does not have access to this project.', {
      fields: { recipient_email: 'Give this address access first.' },
    });
  }

  const job = await adminJobView(user, input.lead_id);
  const business = await businessContact();

  const result = await sendCustomerEmail({
    to: recipient,
    rendered: clientStatusUpdateEmail({
      customerName: lead.customer_name,
      leadCode: lead.lead_code,
      headline: headlineFor(job),
      steps: pipelineFor(job),
      business,
      message: input.message?.trim() || null,
    }),
    emailType: 'portal.status_update',
    leadId: input.lead_id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.PORTAL_STATUS_EMAILED,
    entityType: 'lead',
    entityId: input.lead_id,
    after: { recipient, sent: result.ok, has_message: Boolean(input.message?.trim()) },
  });

  return { sent: result.ok, recipient };
}

/**
 * The same projection the customer sees, assembled for an Admin.
 *
 * The RPC filters on the *caller* being a CLIENT, so an Admin cannot reuse it.
 * This rebuilds the identical shape from staff-readable rows, which is what
 * lets `pipelineFor` stay the single definition of what a stage means.
 */
export async function adminJobView(user: SessionUser, leadId: string): Promise<ClientJob> {
  const lead = await assertCanReadLead(user, leadId);
  const supabase = await createClient();

  const [visit, design, execution, account] = await Promise.all([
    supabase
      .from('site_visits')
      .select('scheduled_start_at, status, journey_status, check_out_at')
      .eq('lead_id', leadId)
      .neq('status', 'CANCELLED')
      .order('scheduled_start_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('design_projects')
      .select('status, approved_at')
      .eq('lead_id', leadId)
      .neq('status', 'CANCELLED')
      .maybeSingle(),
    supabase
      .from('execution_projects')
      .select('status, progress_percent, planned_start_at, completed_at')
      .eq('lead_id', leadId)
      .neq('status', 'CANCELLED')
      .maybeSingle(),
    supabase.from('lead_accounts').select('*').eq('lead_id', leadId).maybeSingle(),
  ]);

  return {
    lead_id: lead.id,
    lead_code: lead.lead_code,
    customer_name: lead.customer_name,
    status: lead.status,
    requirement_summary: lead.requirement_summary,
    location: lead.location_text,
    created_at: lead.created_at,
    site_visit: visit.data
      ? {
          scheduled_start_at: visit.data.scheduled_start_at,
          status: visit.data.status,
          journey_status: visit.data.journey_status,
          completed_at: visit.data.check_out_at,
        }
      : null,
    design: design.data
      ? { status: design.data.status, approved_at: design.data.approved_at }
      : null,
    execution: execution.data
      ? {
          status: execution.data.status,
          progress_percent: execution.data.progress_percent,
          planned_start_at: execution.data.planned_start_at,
          completed_at: execution.data.completed_at,
        }
      : null,
    account: account.data
      ? {
          total_amount: Number(account.data.total_amount),
          received_amount: Number(account.data.received_amount),
          balance_amount: Number(account.data.balance_amount),
          currency: account.data.currency,
          payment_status: account.data.payment_status,
          closed_at: account.data.closed_at,
        }
      : null,
  };
}

/** The company details every customer-facing message carries. */
export async function businessContact(): Promise<BusinessContact> {
  const business = await getBusinessSettings();

  return {
    name: business.name,
    phone: business.phone,
    email: business.email,
    whatsappUrl: businessWhatsappUrl(business.whatsappNumber),
  };
}
