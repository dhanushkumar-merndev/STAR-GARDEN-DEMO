import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import {
  applyMapping,
  isMappingComplete,
  suggestMapping,
  validateMapping,
  type MappingEntry,
} from '@/lib/meta/mapping';
import type { SessionUser } from '@/lib/auth/session';
import type {
  MetaCampaignRow,
  MetaFieldMappingRow,
  MetaFormQuestion,
  MetaLeadFormRow,
  MetaSyncRunRow,
  MetaSyncType,
} from '@/types/database';

/**
 * Meta configuration reads and writes for the Admin screens (add-on §3, §6).
 *
 * Everything here reads *already-synchronised* data from Postgres. Opening the
 * Ads or mapping screen must never trigger a Graph fetch — that is what the
 * scheduled Edge Functions are for, and a page that calls Meta on every render
 * would hit rate limits and stall on Meta's latency.
 */

function requireAdmin(user: SessionUser): void {
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'Meta configuration is Admin-only.');
}

/* -------------------------------------------------------------------------- */
/* Campaigns and forms                                                         */
/* -------------------------------------------------------------------------- */

export async function listCampaigns(user: SessionUser): Promise<MetaCampaignRow[]> {
  requireAdmin(user);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('meta_campaigns')
    .select('*')
    // Campaigns still present in the last sync first, then by name.
    .order('is_present_in_latest_sync', { ascending: false })
    .order('name');

  if (error) throw new AppError('INTERNAL', 'Could not load campaigns.', { cause: error });
  return data ?? [];
}

export async function listLeadForms(user: SessionUser): Promise<MetaLeadFormRow[]> {
  requireAdmin(user);
  const supabase = await createClient();

  const { data, error } = await supabase.from('meta_lead_forms').select('*').order('name');

  if (error) throw new AppError('INTERNAL', 'Could not load lead forms.', { cause: error });
  return data ?? [];
}

/**
 * Forms attached to a campaign, plus every other known form.
 *
 * §6 requires both: a campaign's own forms when the association can be
 * determined, and the full Page form list when it cannot — a form is not owned
 * by a campaign, and Meta does not always expose the link.
 */
export async function listFormsForCampaign(
  user: SessionUser,
  campaignId: string,
): Promise<{ linked: MetaLeadFormRow[]; other: MetaLeadFormRow[] }> {
  requireAdmin(user);
  const supabase = await createClient();

  const [{ data: links }, { data: allForms }] = await Promise.all([
    supabase.from('meta_campaign_forms').select('form_id').eq('campaign_id', campaignId),
    supabase.from('meta_lead_forms').select('*').order('name'),
  ]);

  const linkedIds = new Set((links ?? []).map((link) => link.form_id));
  const forms = allForms ?? [];

  return {
    linked: forms.filter((form) => linkedIds.has(form.id)),
    other: forms.filter((form) => !linkedIds.has(form.id)),
  };
}

/** Cached questions for a form, as captured by the last sync. */
export function formQuestions(form: MetaLeadFormRow): MetaFormQuestion[] {
  if (!Array.isArray(form.questions)) return [];

  return (form.questions as unknown[])
    .filter((q): q is { key?: unknown; label?: unknown; type?: unknown } =>
      Boolean(q && typeof q === 'object'),
    )
    .map((q) => ({
      key: String(q.key ?? ''),
      label: String(q.label ?? q.key ?? ''),
      type: q.type ? String(q.type) : undefined,
    }))
    .filter((q) => q.key !== '');
}

/* -------------------------------------------------------------------------- */
/* Field mapping                                                               */
/* -------------------------------------------------------------------------- */

export async function getFormMapping(
  user: SessionUser,
  metaFormId: string,
): Promise<MetaFieldMappingRow[]> {
  requireAdmin(user);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('meta_field_mappings')
    .select('*')
    .eq('meta_form_id', metaFormId)
    .order('created_at');

  if (error) throw new AppError('INTERNAL', 'Could not load the mapping.', { cause: error });
  return data ?? [];
}

/**
 * Saves a complete mapping for one form.
 *
 * All-or-nothing: the mapping is validated as a whole and the previous rows are
 * replaced only if it passes. A half-saved mapping would drop customers at
 * intake, which is the exact failure the add-on's "do not save an invalid
 * mapping" rule exists to prevent.
 */
export async function saveFormMapping(
  user: SessionUser,
  input: { metaFormId: string; entries: MappingEntry[]; isActive?: boolean },
): Promise<{ complete: boolean }> {
  requireAdmin(user);

  const validation = validateMapping(input.entries);
  if (!validation.valid) {
    throw new AppError('VALIDATION', 'This mapping is not valid yet.', {
      fields: validation.errors,
    });
  }

  const supabase = await createClient();
  const isActive = input.isActive ?? true;

  const { data: previous } = await supabase
    .from('meta_field_mappings')
    .select('*')
    .eq('meta_form_id', input.metaFormId);

  // The SQL function deletes and inserts in one database transaction. If any
  // new row violates a constraint, Postgres rolls the delete back too.
  const { error: replaceError } = await supabase.rpc('replace_meta_form_mapping', {
    p_meta_form_id: input.metaFormId,
    p_entries: input.entries.map((entry) => ({
      meta_field_key: entry.metaFieldKey,
      meta_field_label: entry.metaFieldLabel ?? null,
      crm_field: entry.crmField,
    })),
    p_is_active: isActive,
  });

  if (replaceError) {
    throw new AppError('INTERNAL', 'Could not save the mapping.', { cause: replaceError });
  }

  await recordAudit({
    actorUserId: user.id,
    action: previous && previous.length > 0 ? 'META_MAPPING_UPDATED' : 'META_MAPPING_CREATED',
    entityType: 'meta_field_mapping',
    before: previous?.map((row) => ({ field: row.meta_field_key, crm: row.crm_field })),
    after: {
      meta_form_id: input.metaFormId,
      is_active: isActive,
      entries: input.entries.map((entry) => ({
        field: entry.metaFieldKey,
        crm: entry.crmField,
      })),
    },
  });

  return { complete: isMappingComplete(input.entries) };
}

export async function setMappingActive(
  user: SessionUser,
  input: { metaFormId: string; isActive: boolean },
): Promise<void> {
  requireAdmin(user);
  const supabase = await createClient();

  const { error } = await supabase
    .from('meta_field_mappings')
    .update({ is_active: input.isActive, updated_by: user.id })
    .eq('meta_form_id', input.metaFormId);

  if (error) throw new AppError('INTERNAL', 'Could not update the mapping.', { cause: error });

  await recordAudit({
    actorUserId: user.id,
    action: input.isActive ? 'META_MAPPING_UPDATED' : 'META_MAPPING_DISABLED',
    entityType: 'meta_field_mapping',
    after: { meta_form_id: input.metaFormId, is_active: input.isActive },
  });
}

/** Suggested starting mapping for a form the Admin has not configured yet. */
export function suggestedMappingFor(form: MetaLeadFormRow): MappingEntry[] {
  return suggestMapping(formQuestions(form));
}

/**
 * Preview: runs a mapping against a sample submission so an Admin can see what
 * a lead would look like before saving (§6 step 10).
 */
export function previewMapping(entries: MappingEntry[], sample: Record<string, string>) {
  const fieldData = Object.entries(sample).map(([name, value]) => ({ name, values: [value] }));
  return applyMapping(fieldData, entries);
}

/* -------------------------------------------------------------------------- */
/* Integration health (add-on §11)                                             */
/* -------------------------------------------------------------------------- */

export interface MetaIntegrationHealth {
  campaignCount: number;
  activeCampaignCount: number;
  lastCampaignSync: MetaSyncRunRow | null;
  lastInsightsSync: MetaSyncRunRow | null;
  lastSuccessfulWebhookAt: string | null;
  failedWebhookCount: number;
  unmappedFormCount: number;
  recentIssues: {
    id: string;
    provider_event_id: string;
    form_id: string | null;
    form_name: string | null;
    processing_status: string;
    last_error: string | null;
    attempt_count: number;
    created_at: string;
  }[];
}

export async function getMetaHealth(user: SessionUser): Promise<MetaIntegrationHealth> {
  requireAdmin(user);

  // Service-role read: `meta_webhook_events` rows are written headlessly, and
  // the Admin needs the whole picture including events that never became leads.
  const admin = createAdminClient();

  const [
    campaigns,
    activeCampaigns,
    campaignSync,
    insightsSync,
    lastWebhook,
    failedWebhooks,
    unmapped,
    issues,
  ] = await Promise.all([
    admin.from('meta_campaigns').select('id', { count: 'exact', head: true }),
    admin
      .from('meta_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('effective_status', 'ACTIVE'),
    admin
      .from('meta_sync_runs')
      .select('*')
      .eq('sync_type', 'CAMPAIGNS')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('meta_sync_runs')
      .select('*')
      .eq('sync_type', 'INSIGHTS')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('meta_webhook_events')
      .select('processed_at')
      .eq('processing_status', 'PROCESSED')
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('meta_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'FAILED'),
    admin
      .from('meta_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'UNMAPPED_FORM'),
    admin
      .from('meta_webhook_events')
      .select(
        'id, provider_event_id, form_id, form_name, processing_status, last_error, attempt_count, created_at',
      )
      .in('processing_status', ['FAILED', 'UNMAPPED_FORM'])
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  return {
    campaignCount: campaigns.count ?? 0,
    activeCampaignCount: activeCampaigns.count ?? 0,
    lastCampaignSync: campaignSync.data,
    lastInsightsSync: insightsSync.data,
    lastSuccessfulWebhookAt: lastWebhook.data?.processed_at ?? null,
    failedWebhookCount: failedWebhooks.count ?? 0,
    unmappedFormCount: unmapped.count ?? 0,
    recentIssues: issues.data ?? [],
  };
}

/* -------------------------------------------------------------------------- */
/* Campaign performance (add-on §13)                                           */
/* -------------------------------------------------------------------------- */

export interface CampaignPerformanceRow {
  campaign: MetaCampaignRow;
  spendToday: number;
  leadsToday: number;
  costPerLead: number | null;
  impressions: number;
  clicks: number;
  mappedForms: string[];
  crmLeadCount: number;
}

export async function getCampaignPerformance(
  user: SessionUser,
): Promise<CampaignPerformanceRow[]> {
  requireAdmin(user);
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: campaigns }, { data: insights }, { data: links }, { data: leadCounts }] =
    await Promise.all([
      supabase.from('meta_campaigns').select('*').order('name'),
      supabase.from('meta_campaign_daily_insights').select('*').eq('insight_date', today),
      supabase
        .from('meta_campaign_forms')
        .select('campaign_id, meta_lead_forms!meta_campaign_forms_form_id_fkey(name)'),
      // Attribution comes from the lead rows themselves, which is the CRM's own
      // count rather than Meta's — the two legitimately differ when a lead is
      // deduplicated against an existing enquiry.
      supabase.from('leads').select('meta_campaign_id').not('meta_campaign_id', 'is', null),
    ]);

  const insightByCampaign = new Map((insights ?? []).map((row) => [row.meta_campaign_id, row]));

  const formsByCampaign = new Map<string, string[]>();
  for (const link of links ?? []) {
    const form = link.meta_lead_forms as unknown as { name: string } | null;
    if (!form) continue;
    const existing = formsByCampaign.get(link.campaign_id) ?? [];
    existing.push(form.name);
    formsByCampaign.set(link.campaign_id, existing);
  }

  const crmLeadsByCampaign = new Map<string, number>();
  for (const lead of leadCounts ?? []) {
    if (!lead.meta_campaign_id) continue;
    crmLeadsByCampaign.set(
      lead.meta_campaign_id,
      (crmLeadsByCampaign.get(lead.meta_campaign_id) ?? 0) + 1,
    );
  }

  return (campaigns ?? []).map((campaign) => {
    const insight = insightByCampaign.get(campaign.meta_campaign_id);

    return {
      campaign,
      spendToday: Number(insight?.spend ?? 0),
      leadsToday: insight?.leads ?? 0,
      // Preserved as null when there are no leads — never zero, never infinity.
      costPerLead: insight?.cost_per_lead === null ? null : Number(insight?.cost_per_lead ?? 0) || null,
      impressions: insight?.impressions ?? 0,
      clicks: insight?.clicks ?? 0,
      mappedForms: formsByCampaign.get(campaign.id) ?? [],
      crmLeadCount: crmLeadsByCampaign.get(campaign.meta_campaign_id) ?? 0,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Manual sync (add-on §5)                                                     */
/* -------------------------------------------------------------------------- */

const MANUAL_SYNC_COOLDOWN_SECONDS = 60;

/**
 * Checks the server-enforced cooldown before an Admin-triggered sync.
 *
 * The check lives in the database so a second browser tab, or a user hammering
 * the button, cannot bypass it.
 */
export async function checkSyncCooldown(
  user: SessionUser,
  syncType: MetaSyncType,
): Promise<number> {
  requireAdmin(user);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('meta_sync_cooldown_remaining', {
    p_sync_type: syncType,
    p_cooldown_seconds: MANUAL_SYNC_COOLDOWN_SECONDS,
  });

  if (error) return 0;
  return typeof data === 'number' ? data : 0;
}

export async function recordManualSyncTrigger(
  user: SessionUser,
  syncType: MetaSyncType,
): Promise<void> {
  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.META_SYNC_MANUAL_TRIGGERED,
    entityType: 'meta_sync_run',
    after: { sync_type: syncType },
  });
}

export async function listRecentSyncRuns(
  user: SessionUser,
  limit = 20,
): Promise<MetaSyncRunRow[]> {
  requireAdmin(user);
  const supabase = await createClient();

  const { data } = await supabase
    .from('meta_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}
