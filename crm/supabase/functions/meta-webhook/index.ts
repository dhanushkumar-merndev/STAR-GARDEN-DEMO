import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { CORS_HEADERS, env, jsonResponse, requireEnv, safeError } from '../_shared/config.ts';
import { fetchLead, verifyWebhookSignature, type MetaLead } from '../_shared/meta.ts';
import { audit, authenticateCaller, serviceClient } from '../_shared/db.ts';
import {
  applyMapping,
  composeRequirement,
  normalizeEmail,
  normalizeMobile,
  type MappingEntry,
} from '../_shared/lead-fields.ts';

/**
 * Meta Lead Ads webhook (add-on §2.1).
 *
 * Register in the Meta app dashboard as:
 *   https://<project-ref>.supabase.co/functions/v1/meta-webhook
 * and subscribe the Page to the `leadgen` field.
 *
 * Deploy with `--no-verify-jwt`: Meta cannot present a Supabase user token, so
 * the function authenticates by HMAC signature instead.
 *
 * The processing order is the whole design:
 *
 *     verify → persist raw event → fetch lead → load mapping → map →
 *     normalize → deduplicate → create lead → attribution → notify
 *
 * Persisting **before** processing is what makes the "never lose a lead"
 * guarantee real. If the Graph call fails, the mapping is missing, or the
 * function is killed mid-run, the event is already durable and can be replayed.
 */

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ---------------------------------------------------------------------
  // GET — Meta's one-time verification handshake.
  // ---------------------------------------------------------------------
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = env('META_WEBHOOK_VERIFY_TOKEN');

    if (!verifyToken) {
      return new Response('Webhook is not configured', { status: 503, headers: CORS_HEADERS });
    }

    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
      });
    }

    return new Response('Forbidden', { status: 403, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ---------------------------------------------------------------------
  // POST — authenticity first, before the body is parsed or trusted.
  // ---------------------------------------------------------------------
  let appSecret: string;
  let pageAccessToken: string;

  try {
    appSecret = requireEnv('META_APP_SECRET');
    pageAccessToken = requireEnv('META_PAGE_ACCESS_TOKEN');
  } catch {
    return jsonResponse({ error: 'Meta integration is not configured' }, 503);
  }

  // The signature covers the RAW bytes. Parsing first and re-serialising would
  // change them and break verification for legitimate payloads.
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  const signatureValid = await verifyWebhookSignature(rawBody, signature, appSecret);
  if (!signatureValid) {
    // Admin retries carry the user's Supabase JWT. The function verifies that
    // user against the database; a browser-supplied role claim is never enough.
    const caller = await authenticateCaller(request);
    if (caller.kind === 'DENIED') {
      console.warn('[meta-webhook] rejected a payload with invalid credentials');
      return jsonResponse({ error: 'Invalid signature or Admin session' }, 401);
    }
  }

  if (!signatureValid && !request.headers.get('authorization') && !request.headers.get('x-internal-secret')) {
    console.warn('[meta-webhook] rejected a payload with an invalid signature');
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Malformed payload' }, 400);
  }

  const supabase = serviceClient();
  const events = extractLeadgenEvents(payload);
  const allowedPages = (env('META_ALLOWED_PAGE_IDS') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const mappingCache = new Map<string, Promise<MappingEntry[]>>();
  let adminIdsPromise: Promise<string[]> | null = null;
  const adminIds = () => (adminIdsPromise ??= loadActiveAdminIds(supabase));

  const summary = { received: events.length, created: 0, duplicates: 0, unmapped: 0, failed: 0 };

  // Keep intake creation ordered: two different Meta events can contain the
  // same mobile number, and the second must see the first before the duplicate
  // check. Mapping/admin fan-out is still cached/batched below.
  for (const event of events) {
    try {
      const outcome = await processEvent(
        supabase,
        event,
        payload,
        pageAccessToken,
        allowedPages,
        mappingCache,
        adminIds,
      );
      if (outcome === 'CREATED') summary.created += 1;
      else if (outcome === 'DUPLICATE') summary.duplicates += 1;
      else if (outcome === 'UNMAPPED') summary.unmapped += 1;
    } catch (error) {
      summary.failed += 1;
      console.error('[meta-webhook] event failed', safeError(error));
    }
  }

  // Always acknowledge once the event is durably stored. Meta redelivers on any
  // non-2xx, and a redelivery cannot help with a mapping problem — the Admin
  // resolves those from the Integration Issues screen.
  return jsonResponse({ acknowledged: true, ...summary }, 200);
});

/* -------------------------------------------------------------------------- */
/* Event extraction                                                            */
/* -------------------------------------------------------------------------- */

interface LeadgenEvent {
  leadgenId: string;
  pageId: string;
  formId: string | null;
}

function extractLeadgenEvents(payload: unknown): LeadgenEvent[] {
  const body = payload as {
    object?: string;
    entry?: { id?: string; changes?: { field?: string; value?: Record<string, unknown> }[] }[];
  };

  if (body?.object !== 'page') return [];

  const events: LeadgenEvent[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;

      const value = change.value ?? {};
      const leadgenId = String(value.leadgen_id ?? '');
      if (!leadgenId) continue;

      events.push({
        leadgenId,
        pageId: String(value.page_id ?? entry.id ?? ''),
        formId: value.form_id ? String(value.form_id) : null,
      });
    }
  }

  return events;
}

/* -------------------------------------------------------------------------- */
/* Processing                                                                  */
/* -------------------------------------------------------------------------- */

type Outcome = 'CREATED' | 'DUPLICATE' | 'UNMAPPED' | 'SKIPPED';

async function processEvent(
  supabase: SupabaseClient,
  event: LeadgenEvent,
  rawPayload: unknown,
  pageAccessToken: string,
  allowedPages: string[],
  mappingCache: Map<string, Promise<MappingEntry[]>>,
  adminIds: () => Promise<string[]>,
): Promise<Outcome> {
  if (allowedPages.length > 0 && !allowedPages.includes(event.pageId)) {
    await upsertEvent(supabase, event, rawPayload, 'IGNORED', 'Page is not in the allow list.');
    return 'SKIPPED';
  }

  // Step 1 — claim the event. `provider_event_id` is UNIQUE, so a Meta retry
  // collides here and does nothing (add-on §2.1, §23).
  const { data: claimed, error: claimError } = await supabase
    .from('meta_webhook_events')
    .insert({
      provider_event_id: event.leadgenId,
      page_id: event.pageId,
      form_id: event.formId,
      payload: rawPayload,
      processing_status: 'RECEIVED',
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  let eventId = claimed?.id as string | undefined;

  if (claimError) {
    if (claimError.code !== '23505') throw claimError;

    // Already seen. Only continue if it is an unresolved event being replayed.
    const { data: existing } = await supabase
      .from('meta_webhook_events')
      .select('id, processing_status, attempt_count')
      .eq('provider_event_id', event.leadgenId)
      .maybeSingle();

    if (!existing || existing.processing_status === 'PROCESSED') return 'SKIPPED';

    eventId = existing.id;

    await supabase
      .from('meta_webhook_events')
      .update({
        processing_status: 'PROCESSING',
        attempt_count: (existing.attempt_count ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', eventId);
  }

  if (!eventId) return 'SKIPPED';

  try {
    // Step 2 — the webhook carries identifiers only; the customer's details
    // require this server-side call.
    const lead: MetaLead = await fetchLead(event.leadgenId, pageAccessToken);
    const formId = lead.form_id ?? event.formId;

    if (!formId) {
      await markEvent(supabase, eventId, 'FAILED', 'Lead has no form id.');
      return 'SKIPPED';
    }

    // Step 3 — the saved mapping for this form.
    let mappingPromise = mappingCache.get(formId);
    if (!mappingPromise) {
      mappingPromise = (async () => {
        const { data: mappingRows, error } = await supabase
          .from('meta_field_mappings')
          .select('meta_field_key, crm_field')
          .eq('meta_form_id', formId)
          .eq('is_active', true);
        if (error) throw error;
        return (mappingRows ?? []) as MappingEntry[];
      })();
      mappingCache.set(formId, mappingPromise);
    }
    const mapping = await mappingPromise;

    const hasName = mapping.some((row) => row.crm_field === 'customer_name');
    const hasMobile = mapping.some((row) => row.crm_field === 'mobile');

    if (!hasName || !hasMobile) {
      // The lead is NOT discarded. It waits for an Admin to create the mapping,
      // then replays with everything intact (add-on §2.1).
      await supabase
        .from('meta_webhook_events')
        .update({ form_id: formId, form_name: null })
        .eq('id', eventId);

      await markEvent(
        supabase,
        eventId,
        'UNMAPPED_FORM',
        `No active field mapping for form ${formId}. Create the mapping, then retry.`,
      );

      await audit(supabase, {
        action: 'META_WEBHOOK_UNMAPPED_FORM',
        entityType: 'meta_webhook_event',
        entityId: eventId,
        after: { form_id: formId, leadgen_id: event.leadgenId },
      });

      return 'UNMAPPED';
    }

    // Step 4 — map and normalize.
    const mapped = applyMapping(lead.field_data ?? [], mapping);
    const phone = normalizeMobile(mapped.mobile);

    if (!phone) {
      await markEvent(
        supabase,
        eventId,
        'FAILED',
        mapped.mobile
          ? 'The mapped phone answer is not a usable number.'
          : 'The submission contained no phone number.',
      );
      return 'SKIPPED';
    }

    const email = normalizeEmail(mapped.email);

    // Step 5 — deduplicate against live leads.
    const { data: duplicate } = await supabase
      .from('leads')
      .select('id, lead_code')
      .eq('mobile_normalized', phone.national)
      .not('status', 'in', '("LOST","CLOSED")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      await supabase
        .from('meta_webhook_events')
        .update({ lead_id: duplicate.id })
        .eq('id', eventId);

      await markEvent(
        supabase,
        eventId,
        'PROCESSED',
        `Matched the existing lead ${duplicate.lead_code}; no duplicate created.`,
      );

      return 'DUPLICATE';
    }

    // Step 6 — create the lead with its Meta attribution.
    const source = lead.platform === 'ig' || lead.platform === 'instagram'
      ? 'META_INSTAGRAM'
      : 'META_FACEBOOK';

    const { data: created, error: insertError } = await supabase
      .from('leads')
      .insert({
        customer_name: mapped.customerName ?? 'Meta lead (name not supplied)',
        mobile_country_code: phone.countryCode,
        mobile_normalized: phone.national,
        email,
        location_text: mapped.locationText,
        requirement_summary: composeRequirement(mapped),
        source,
        source_reference: lead.id,
        status: 'UNASSIGNED',

        meta_page_id: event.pageId,
        meta_form_id: formId,
        meta_lead_id: event.leadgenId,
        meta_campaign_id: lead.campaign_id ?? null,
        meta_campaign_name: lead.campaign_name ?? null,
        meta_adset_id: lead.adset_id ?? null,
        meta_adset_name: lead.adset_name ?? null,
        meta_ad_id: lead.ad_id ?? null,
        meta_ad_name: lead.ad_name ?? null,
      })
      .select('id, lead_code, customer_name')
      .single();

    if (insertError) {
      // The partial unique index on meta_lead_id: another delivery won the race.
      if (insertError.code === '23505') {
        await markEvent(supabase, eventId, 'PROCESSED', 'Lead already imported.');
        return 'DUPLICATE';
      }
      throw insertError;
    }

    await supabase
      .from('meta_webhook_events')
      .update({ lead_id: created.id })
      .eq('id', eventId);

    await markEvent(supabase, eventId, 'PROCESSED', null);

    // Step 7 — tell the desk. Nobody owns this lead yet.
    await notifyAdmins(supabase, adminIds, created.id, created.lead_code, created.customer_name);

    await audit(supabase, {
      action: 'LEAD_META_ATTRIBUTION_CREATED',
      entityType: 'lead',
      entityId: created.id,
      after: {
        lead_code: created.lead_code,
        meta_lead_id: event.leadgenId,
        meta_form_id: formId,
        meta_campaign_id: lead.campaign_id ?? null,
        meta_campaign_name: lead.campaign_name ?? null,
      },
    });

    await audit(supabase, {
      action: 'META_WEBHOOK_PROCESSED',
      entityType: 'meta_webhook_event',
      entityId: eventId,
      after: { leadgen_id: event.leadgenId, lead_id: created.id },
    });

    return 'CREATED';
  } catch (error) {
    const message = safeError(error);
    await markEvent(supabase, eventId, 'FAILED', message);

    await audit(supabase, {
      action: 'META_WEBHOOK_FAILED',
      entityType: 'meta_webhook_event',
      entityId: eventId,
      after: { leadgen_id: event.leadgenId, error: message },
    });

    throw error;
  }
}

async function upsertEvent(
  supabase: SupabaseClient,
  event: LeadgenEvent,
  payload: unknown,
  status: string,
  note: string,
): Promise<void> {
  await supabase.from('meta_webhook_events').upsert(
    {
      provider_event_id: event.leadgenId,
      page_id: event.pageId,
      form_id: event.formId,
      payload,
      processing_status: status,
      last_error: note,
      processed_at: new Date().toISOString(),
    },
    { onConflict: 'provider_event_id' },
  );
}

async function markEvent(
  supabase: SupabaseClient,
  eventId: string,
  status: string,
  note: string | null,
): Promise<void> {
  await supabase
    .from('meta_webhook_events')
    .update({
      processing_status: status,
      last_error: note,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

/** New Meta leads land unassigned, so every active Admin is told. */
async function notifyAdmins(
  supabase: SupabaseClient,
  adminIds: () => Promise<string[]>,
  leadId: string,
  leadCode: string,
  customerName: string,
): Promise<void> {
  const rows = (await adminIds()).map((adminId) => ({
    user_id: adminId,
    type: 'LEAD_ASSIGNED',
    title: 'New lead from Meta',
    body: `${leadCode} · ${customerName}`,
    entity_type: 'lead',
    entity_id: leadId,
  }));
  if (rows.length === 0) return;

  const { error } = await supabase.rpc('insert_notifications_dedup', { p_rows: rows });
  if (error) {
    // Keep webhook intake compatible with a database that has not received the
    // batching migration yet. The daily dedupe index still rejects repeats.
    console.warn('[meta-webhook] notification batch RPC unavailable; using insert fallback', error);
    await Promise.allSettled(rows.map((row) => supabase.from('notifications').insert(row)));
  }
}

async function loadActiveAdminIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'ADMIN')
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []).map((profile) => profile.id as string);
}
