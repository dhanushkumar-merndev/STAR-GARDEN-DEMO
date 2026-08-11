import { CORS_HEADERS, jsonResponse, requireEnv, safeError } from '../_shared/config.ts';
import {
  audit,
  authenticateCaller,
  finishSyncRun,
  serviceClient,
  startSyncRun,
} from '../_shared/db.ts';
import {
  fetchCampaignFormLinks,
  fetchCampaigns,
  fetchPageLeadForms,
} from '../_shared/meta.ts';

/** Synchronises campaign metadata, Page lead forms, and campaign↔form links. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const caller = await authenticateCaller(request);
  if (caller.kind === 'DENIED') return jsonResponse({ error: caller.reason }, 401);

  const supabase = serviceClient();

  if (caller.kind === 'ADMIN') {
    const { data: remaining } = await supabase.rpc('meta_sync_cooldown_remaining', {
      p_sync_type: 'CAMPAIGNS',
      p_cooldown_seconds: 60,
    });
    if (Number(remaining ?? 0) > 0) {
      return jsonResponse({ error: `Try again in ${remaining} seconds.`, retryAfter: remaining }, 429);
    }
  }

  const run = await startSyncRun(supabase, 'CAMPAIGNS', caller);

  try {
    const adAccountId = requireEnv('META_AD_ACCOUNT_ID');
    const adsAccessToken = requireEnv('META_ADS_ACCESS_TOKEN');
    const pageAccessToken = requireEnv('META_PAGE_ACCESS_TOKEN');
    const pageIds = requireEnv('META_ALLOWED_PAGE_IDS')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const [campaigns, formGroups, existingCampaigns, existingForms] = await Promise.all([
      fetchCampaigns(adAccountId, adsAccessToken),
      Promise.all(
        pageIds.map(async (pageId) => ({
          pageId,
          forms: await fetchPageLeadForms(pageId, pageAccessToken),
        })),
      ),
      supabase.from('meta_campaigns').select('meta_campaign_id'),
      supabase.from('meta_lead_forms').select('meta_form_id'),
    ]);

    const now = new Date().toISOString();
    const existingCampaignIds = new Set(
      (existingCampaigns.data ?? []).map((row) => String(row.meta_campaign_id)),
    );
    const existingFormIds = new Set(
      (existingForms.data ?? []).map((row) => String(row.meta_form_id)),
    );

    run.received = campaigns.length + formGroups.reduce((sum, group) => sum + group.forms.length, 0);
    run.created = campaigns.filter((campaign) => !existingCampaignIds.has(campaign.id)).length;
    run.updated = campaigns.length - run.created;

    if (campaigns.length > 0) {
      const { error } = await supabase.from('meta_campaigns').upsert(
        campaigns.map((campaign) => ({
          meta_campaign_id: campaign.id,
          name: campaign.name,
          configured_status: campaign.status ?? null,
          effective_status: campaign.effective_status ?? null,
          objective: campaign.objective ?? null,
          is_present_in_latest_sync: true,
          last_synced_at: now,
        })),
        { onConflict: 'meta_campaign_id' },
      );
      if (error) throw error;
    }

    // Only mark missing campaigns after the upstream fetch and all present-row
    // upserts succeeded. A failed sync must not make healthy history disappear.
    const seenCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
    const missingCampaignIds = [...existingCampaignIds].filter((id) => !seenCampaignIds.has(id));
    if (missingCampaignIds.length > 0) {
      const { error } = await supabase
        .from('meta_campaigns')
        .update({ is_present_in_latest_sync: false, last_synced_at: now })
        .in('meta_campaign_id', missingCampaignIds);
      if (error) throw error;
    }

    const forms = formGroups.flatMap(({ pageId, forms: pageForms }) =>
      pageForms.map((form) => ({ ...form, pageId })),
    );
    run.created += forms.filter((form) => !existingFormIds.has(form.id)).length;
    run.updated += forms.filter((form) => existingFormIds.has(form.id)).length;

    if (forms.length > 0) {
      const { error } = await supabase.from('meta_lead_forms').upsert(
        forms.map((form) => ({
          meta_form_id: form.id,
          meta_page_id: form.pageId,
          name: form.name,
          status: form.status ?? null,
          questions: form.questions ?? [],
          last_synced_at: now,
        })),
        { onConflict: 'meta_form_id' },
      );
      if (error) throw error;
    }

    const [{ data: campaignRows }, { data: formRows }, campaignFormIds] = await Promise.all([
      supabase.from('meta_campaigns').select('id, meta_campaign_id'),
      supabase.from('meta_lead_forms').select('id, meta_form_id'),
      Promise.all(
        campaigns.map(async (campaign) => ({
          campaignId: campaign.id,
          formIds: await fetchCampaignFormLinks(campaign.id, adsAccessToken),
        })),
      ),
    ]);

    const campaignPk = new Map(
      (campaignRows ?? []).map((row) => [String(row.meta_campaign_id), String(row.id)]),
    );
    const formPk = new Map(
      (formRows ?? []).map((row) => [String(row.meta_form_id), String(row.id)]),
    );

    const links = campaignFormIds.flatMap(({ campaignId, formIds }) => {
      const campaignIdPk = campaignPk.get(campaignId);
      if (!campaignIdPk) return [];

      return formIds.flatMap((formId) => {
        const formIdPk = formPk.get(formId);
        return formIdPk
          ? [{
              campaign_id: campaignIdPk,
              form_id: formIdPk,
              association_source: 'ADS_GRAPH',
              last_seen_at: now,
            }]
          : [];
      });
    });

    if (links.length > 0) {
      const { error } = await supabase
        .from('meta_campaign_forms')
        .upsert(links, { onConflict: 'campaign_id,form_id' });
      if (error) throw error;
    }

    await finishSyncRun(supabase, run, 'SUCCESS');
    await audit(supabase, {
      action: 'META_CAMPAIGN_SYNC_COMPLETED',
      entityType: 'meta_sync_run',
      entityId: run.id,
      actorUserId: caller.kind === 'ADMIN' ? caller.userId : null,
      after: { campaigns: campaigns.length, forms: forms.length, links: links.length },
    });

    return jsonResponse({ ok: true, campaigns: campaigns.length, forms: forms.length, links: links.length });
  } catch (error) {
    const message = safeError(error);
    await finishSyncRun(supabase, run, 'FAILED', message);
    return jsonResponse({ error: message }, 500);
  }
});
