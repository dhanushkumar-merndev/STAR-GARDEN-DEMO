import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { adminUserIds, notify, NotificationCopy, notifyMany } from '@/lib/notifications';
import { getNormalizationSettings, getSettings } from '@/lib/settings';
import { normalizeLeadFields } from '@/lib/utils/normalize';
import { normalizeEmail, type NormalizedPhone } from '@/lib/utils/phone';
import type { Database, LeadRow, LeadSource, LeadStatus } from '@/types/database';

/**
 * The single lead intake path (AGENTS.md §8.1, §11.8).
 *
 * Meta Lead Ads, the public website form and manual entry all arrive here, so
 * normalization, duplicate detection, assignment and notification behave
 * identically whatever the source. §11.8 requires this explicitly for the
 * website form; applying it to all three is what keeps duplicate detection
 * meaningful.
 */

type Client = SupabaseClient<Database>;

export interface DuplicateMatch {
  id: string;
  lead_code: string;
  customer_name: string;
  status: LeadStatus;
  created_at: string;
  assigned_bdm_id: string | null;
  assigned_bdm_name: string | null;
  matched_on: 'mobile' | 'email';
}

/**
 * Finds a live lead with the same normalized mobile number.
 *
 * Always runs with the service-role client, and this is deliberate: a BDM must
 * be warned about a duplicate that belongs to a *different* BDM, which RLS
 * would correctly hide from them. Only the identifying fields below are
 * returned — enough to decide what to do, without exposing another BDM's
 * requirement notes, address or call history (§8.1 "warn or merge", §15).
 */
export async function findDuplicateLead(
  mobileNormalized: string,
  email?: string | null,
): Promise<DuplicateMatch | null> {
  const admin = createAdminClient();
  const { duplicateLookbackDays } = await getSettings();
  const since = new Date(Date.now() - duplicateLookbackDays * 86_400_000).toISOString();

  const { data: byMobile } = await admin
    .from('leads')
    .select('id, lead_code, customer_name, status, created_at, assigned_bdm_id')
    .eq('mobile_normalized', mobileNormalized)
    .not('status', 'in', '("LOST","CLOSED")')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let match = byMobile;
  let matchedOn: DuplicateMatch['matched_on'] = 'mobile';

  // Email is the secondary signal — a household sharing one mobile is common,
  // but a repeated email on a live lead is almost always the same enquiry.
  if (!match && email) {
    const { data: byEmail } = await admin
      .from('leads')
      .select('id, lead_code, customer_name, status, created_at, assigned_bdm_id')
      .eq('email', email)
      .not('status', 'in', '("LOST","CLOSED")')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    match = byEmail;
    if (byEmail) matchedOn = 'email';
  }

  if (!match) return null;

  let ownerName: string | null = null;
  if (match.assigned_bdm_id) {
    const { data: owner } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', match.assigned_bdm_id)
      .maybeSingle();
    ownerName = owner?.full_name ?? null;
  }

  return { ...match, assigned_bdm_name: ownerName, matched_on: matchedOn };
}

export interface IntakeLeadInput {
  customerName: string;
  phone: NormalizedPhone;
  email?: string | null;
  locationText?: string | null;
  siteAddress?: string | null;
  requirementSummary?: string | null;
  source: LeadSource;
  sourceReference?: string | null;
  metaPageId?: string | null;
  metaFormId?: string | null;
  metaLeadId?: string | null;
  metaCampaignId?: string | null;
  metaCampaignName?: string | null;
  metaAdsetId?: string | null;
  metaAdsetName?: string | null;
  metaAdId?: string | null;
  metaAdName?: string | null;
  assignedBdmId?: string | null;
  nextActionAt?: string | null;
  createdBy?: string | null;
}

export interface IntakeOptions {
  /** Supabase client to insert with. Defaults to the service-role client. */
  client?: Client;
  /**
   * When false (the default) a duplicate aborts the intake with a
   * DUPLICATE_LEAD error carrying the match. §8.1: never silently create
   * duplicates.
   */
  allowDuplicate?: boolean;
  /** Suppresses assignment notifications — used when seeding or backfilling. */
  silent?: boolean;
}

export interface IntakeResult {
  lead: LeadRow;
  duplicateOf: DuplicateMatch | null;
}

/**
 * Creates a lead from any source.
 *
 * The caller is responsible for its own authorization check before calling —
 * this service does not know whether the actor was allowed to create a lead,
 * only how to create one correctly (§7.5).
 */
export async function intakeLead(
  input: IntakeLeadInput,
  options: IntakeOptions = {},
): Promise<IntakeResult> {
  const client = options.client ?? createAdminClient();

  // The one-time normalization setup, applied here so Meta, the website form
  // and manual entry are cleaned identically. Doing it at the three call sites
  // instead is how "  RAVI  KUMAR " and "Ravi Kumar" become two customers.
  const rules = await getNormalizationSettings();
  const cleaned = normalizeLeadFields(
    {
      customerName: input.customerName,
      email: input.email,
      locationText: input.locationText,
      siteAddress: input.siteAddress,
      requirementSummary: input.requirementSummary,
    },
    rules,
  );

  // A name is required by the table's own check constraint, so a record that
  // normalizes to nothing keeps whatever the source sent rather than failing.
  const customerName = cleaned.customerName ?? input.customerName;

  // `normalizeEmail` from `utils/phone` is the storage-shape check; the
  // normalizer above has already dropped placeholders like `noreply@…`.
  const email = normalizeEmail(cleaned.email);

  const duplicate = await findDuplicateLead(input.phone.national, email);

  if (duplicate && !options.allowDuplicate) {
    const matchedEmail = duplicate.matched_on === 'email';
    throw new AppError(
      'DUPLICATE_LEAD',
      `${duplicate.customer_name} (${duplicate.lead_code}) already exists with this ${matchedEmail ? 'email address' : 'mobile number'}.`,
      {
        meta: { duplicate },
        fields: matchedEmail
          ? { email: 'This email address already belongs to a live lead.' }
          : { mobile: 'This mobile number already belongs to a live lead.' },
      },
    );
  }

  const status: LeadStatus = input.assignedBdmId ? 'ASSIGNED' : 'UNASSIGNED';

  const { data: lead, error } = await client
    .from('leads')
    .insert({
      customer_name: customerName,
      mobile_country_code: input.phone.countryCode,
      mobile_normalized: input.phone.national,
      email,
      location_text: cleaned.locationText,
      site_address: cleaned.siteAddress,
      requirement_summary: cleaned.requirementSummary,
      source: input.source,
      source_reference: input.sourceReference ?? null,
      meta_page_id: input.metaPageId ?? null,
      meta_form_id: input.metaFormId ?? null,
      meta_lead_id: input.metaLeadId ?? null,
      meta_campaign_id: input.metaCampaignId ?? null,
      meta_campaign_name: input.metaCampaignName ?? null,
      meta_adset_id: input.metaAdsetId ?? null,
      meta_adset_name: input.metaAdsetName ?? null,
      meta_ad_id: input.metaAdId ?? null,
      meta_ad_name: input.metaAdName ?? null,
      status,
      assigned_bdm_id: input.assignedBdmId ?? null,
      next_action_at: input.nextActionAt ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();

  if (error || !lead) {
    // The partial unique index on meta_lead_id makes a Meta retry a no-op
    // rather than a second lead (§14).
    if (error?.code === '23505' && error.message.includes('meta_lead_id')) {
      throw new AppError('CONFLICT', 'This Meta lead has already been imported.', {
        meta: { metaLeadId: input.metaLeadId },
      });
    }
    throw new AppError('INTERNAL', 'Could not save the lead.', { cause: error });
  }

  await recordAudit({
    actorUserId: input.createdBy ?? null,
    action: AuditAction.LEAD_CREATED,
    entityType: 'lead',
    entityId: lead.id,
    after: {
      lead_code: lead.lead_code,
      source: lead.source,
      status: lead.status,
      assigned_bdm_id: lead.assigned_bdm_id,
      duplicate_override: duplicate ? duplicate.lead_code : null,
    },
    captureRequest: input.source !== 'META_FACEBOOK' && input.source !== 'META_INSTAGRAM',
  });

  if (!options.silent) {
    if (lead.assigned_bdm_id) {
      await notify({
        userId: lead.assigned_bdm_id,
        ...NotificationCopy.leadAssigned(lead.lead_code, lead.customer_name),
        entityType: 'lead',
        entityId: lead.id,
      });
    } else {
      // Nobody owns it yet, so the desk needs to know it is waiting (§8.1 step 6).
      await notifyMany(await adminUserIds(), {
        ...NotificationCopy.leadAssigned(lead.lead_code, lead.customer_name),
        title: 'New unassigned lead',
        entityType: 'lead',
        entityId: lead.id,
      });
    }
  }

  return { lead, duplicateOf: duplicate };
}

/**
 * Records an inbound enquiry that was refused as a duplicate.
 *
 * Without this, a customer who fills the website form twice simply vanishes
 * from the record. The audit entry keeps the attempt visible to an Admin, and
 * a notification — pointing straight at the existing lead — makes sure that
 * visibility doesn't depend on someone going looking for it: the public side
 * always shows the customer success (§15), so this is the one place a human
 * actually finds out.
 */
export async function recordDuplicateAttempt(params: {
  source: LeadSource;
  mobileNormalized: string;
  customerName: string;
  duplicate: DuplicateMatch;
}): Promise<void> {
  await recordAudit({
    actorUserId: null,
    action: AuditAction.LEAD_DUPLICATE_BLOCKED,
    entityType: 'lead',
    entityId: params.duplicate.id,
    after: {
      source: params.source,
      customer_name: params.customerName,
      mobile_normalized: params.mobileNormalized,
      existing_lead_code: params.duplicate.lead_code,
    },
  });

  const copy = NotificationCopy.leadDuplicateAttempt(
    params.duplicate.lead_code,
    params.customerName,
    params.duplicate.matched_on,
  );

  if (params.duplicate.assigned_bdm_id) {
    // The lead already has an owner — only they (not the whole desk) need to
    // know someone followed up again.
    await notify({
      userId: params.duplicate.assigned_bdm_id,
      ...copy,
      entityType: 'lead',
      entityId: params.duplicate.id,
    });
  } else {
    // Unowned — same rule as a brand-new lead (§8.1 step 6): the desk needs
    // to know, not one specific person.
    await notifyMany(await adminUserIds(), {
      ...copy,
      entityType: 'lead',
      entityId: params.duplicate.id,
    });
  }
}
