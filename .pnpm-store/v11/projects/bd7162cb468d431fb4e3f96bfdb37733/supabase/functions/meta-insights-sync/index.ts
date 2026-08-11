import { CORS_HEADERS, jsonResponse, requireEnv, safeError } from '../_shared/config.ts';
import {
  audit,
  authenticateCaller,
  finishSyncRun,
  readSetting,
  resolveAdAccountId,
  serviceClient,
  startSyncRun,
} from '../_shared/db.ts';
import { fetchCampaignInsights, leadsFromInsight } from '../_shared/meta.ts';

/** Upserts one daily campaign-performance row per campaign. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const caller = await authenticateCaller(request);
  if (caller.kind === 'DENIED') return jsonResponse({ error: caller.reason }, 401);

  const supabase = serviceClient();

  if (caller.kind === 'ADMIN') {
    const { data: remaining } = await supabase.rpc('meta_sync_cooldown_remaining', {
      p_sync_type: 'INSIGHTS',
      p_cooldown_seconds: 60,
    });
    if (Number(remaining ?? 0) > 0) {
      return jsonResponse({ error: `Try again in ${remaining} seconds.`, retryAfter: remaining }, 429);
    }
  }

  const run = await startSyncRun(supabase, 'INSIGHTS', caller);

  try {
    // Same resolution order as the campaign sync: the Admin's choice in
    // Supabase first, the environment variable only as a fallback.
    const adAccountId = await resolveAdAccountId(supabase);

    if (!adAccountId) {
      throw new Error(
        'No ad account has been selected yet. Choose one in Settings → Integrations → Meta.',
      );
    }

    const insights = await fetchCampaignInsights(
      adAccountId,
      requireEnv('META_ADS_ACCESS_TOKEN'),
    );

    // When the Admin has narrowed to specific campaigns, spend for the rest is
    // not stored — it would inflate the CPL on the Ads screen with numbers from
    // work this business is not tracking.
    const selectionMode = await readSetting<string>(supabase, 'meta_campaign_selection_mode');
    let allowedCampaignIds: Set<string> | null = null;

    if (selectionMode === 'SELECTED') {
      const { data: selected } = await supabase
        .from('meta_campaigns')
        .select('meta_campaign_id')
        .eq('is_selected', true);

      allowedCampaignIds = new Set((selected ?? []).map((row) => String(row.meta_campaign_id)));
    }

    const now = new Date().toISOString();
    const rows = insights.flatMap((insight) => {
      if (!insight.campaign_id || !insight.date_start) return [];
      if (allowedCampaignIds && !allowedCampaignIds.has(insight.campaign_id)) return [];

      const spend = finiteNumber(insight.spend);
      const leads = Math.max(0, Math.round(leadsFromInsight(insight)));

      return [{
        meta_campaign_id: insight.campaign_id,
        insight_date: insight.date_start,
        spend,
        impressions: Math.max(0, Math.round(finiteNumber(insight.impressions))),
        reach: Math.max(0, Math.round(finiteNumber(insight.reach))),
        clicks: Math.max(0, Math.round(finiteNumber(insight.clicks))),
        leads,
        // No leads means no meaningful CPL — null avoids both infinity and the
        // misleading implication that the leads were free.
        cost_per_lead: leads === 0 ? null : Math.round((spend / leads) * 100) / 100,
        last_synced_at: now,
      }];
    });

    run.received = insights.length;

    const dates = [...new Set(rows.map((row) => row.insight_date))];
    const existingKeys = new Set<string>();
    if (dates.length > 0) {
      const { data: existing } = await supabase
        .from('meta_campaign_daily_insights')
        .select('meta_campaign_id, insight_date')
        .in('insight_date', dates);
      for (const row of existing ?? []) {
        existingKeys.add(`${row.meta_campaign_id}:${row.insight_date}`);
      }
    }

    run.created = rows.filter(
      (row) => !existingKeys.has(`${row.meta_campaign_id}:${row.insight_date}`),
    ).length;
    run.updated = rows.length - run.created;

    if (rows.length > 0) {
      const { error } = await supabase
        .from('meta_campaign_daily_insights')
        .upsert(rows, { onConflict: 'meta_campaign_id,insight_date' });
      if (error) throw error;
    }

    await finishSyncRun(supabase, run, 'SUCCESS');
    await audit(supabase, {
      action: 'META_INSIGHTS_SYNC_COMPLETED',
      entityType: 'meta_sync_run',
      entityId: run.id,
      actorUserId: caller.kind === 'ADMIN' ? caller.userId : null,
      after: { rows: rows.length },
    });

    return jsonResponse({ ok: true, rows: rows.length });
  } catch (error) {
    const message = safeError(error);
    await finishSyncRun(supabase, run, 'FAILED', message);
    return jsonResponse({ error: message }, 500);
  }
});

function finiteNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
