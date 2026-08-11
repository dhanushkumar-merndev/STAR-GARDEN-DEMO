import { GRAPH_BASE, GRAPH_TIMEOUT_MS, MAX_PAGES, safeError } from './config.ts';

/**
 * Meta Graph / Marketing API client.
 *
 * One place for request building, pagination, signature verification and error
 * shaping, so `meta-webhook`, `meta-sync` and `meta-insights-sync` never
 * reimplement any of it (add-on §2).
 */

export interface GraphError extends Error {
  status?: number;
  /** True when Meta says the token is invalid or lacks a permission. */
  isAuthProblem?: boolean;
}

async function graphFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');

    const error = new Error(
      // The URL is deliberately NOT included — it carries the access token.
      `Graph ${response.status} on ${path}: ${safeError(body)}`,
    ) as GraphError;

    error.status = response.status;
    // 190 = invalid/expired token, 200/10 = missing permission.
    error.isAuthProblem =
      response.status === 401 ||
      /"code"\s*:\s*(190|102|10|200)\b/.test(body);

    throw error;
  }

  return (await response.json()) as T;
}

interface Paged<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/**
 * Follows cursor pagination to the end, or to `MAX_PAGES`.
 *
 * Meta returns `paging.next` as a fully-formed URL; following the cursor
 * instead keeps the access token out of a second URL we would have to handle.
 */
export async function graphList<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const results: T[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await graphFetch<Paged<T>>(path, {
      ...params,
      limit: params.limit ?? '100',
      ...(after ? { after } : {}),
    });

    results.push(...(response.data ?? []));

    after = response.paging?.cursors?.after;
    if (!after || !response.paging?.next) break;
  }

  return results;
}

export async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  return graphFetch<T>(path, params);
}

/* -------------------------------------------------------------------------- */
/* Webhook authenticity                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Verifies `X-Hub-Signature-256` against the RAW request body.
 *
 * The raw bytes matter: re-serialising parsed JSON produces different bytes and
 * the HMAC would never match a legitimate payload.
 *
 * Comparison is constant-time — a fast `!==` leaks signature bytes through
 * timing, which is enough to forge one given patience.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));

  const expected = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const provided = signatureHeader.slice('sha256='.length);

  if (provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/* -------------------------------------------------------------------------- */
/* Lead retrieval                                                              */
/* -------------------------------------------------------------------------- */

export interface MetaLeadField {
  name: string;
  values: string[];
}

export interface MetaLead {
  id: string;
  created_time: string;
  form_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  platform?: string;
  field_data: MetaLeadField[];
}

/**
 * Fetches one lead, including its campaign/ad-set/ad attribution.
 *
 * Attribution fields are requested but treated as optional: Meta omits them for
 * organic Page forms and when the token lacks `ads_read`. §17 requires handling
 * unavailable fields gracefully rather than failing the lead.
 */
export async function fetchLead(leadgenId: string, pageAccessToken: string): Promise<MetaLead> {
  return graphGet<MetaLead>(leadgenId, {
    fields:
      'id,created_time,field_data,form_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,platform',
    access_token: pageAccessToken,
  });
}

/* -------------------------------------------------------------------------- */
/* Campaigns, forms and insights                                               */
/* -------------------------------------------------------------------------- */

export interface MetaCampaign {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  objective?: string;
}

export async function fetchCampaigns(
  adAccountId: string,
  adsAccessToken: string,
): Promise<MetaCampaign[]> {
  return graphList<MetaCampaign>(`${normalizeAdAccount(adAccountId)}/campaigns`, {
    fields: 'id,name,status,effective_status,objective',
    access_token: adsAccessToken,
  });
}

export interface MetaAdAccount {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  /** 1 = ACTIVE. Meta has ~9 other codes; they are stored untranslated. */
  account_status?: number;
  business?: { name?: string };
}

/**
 * Every ad account the configured token can reach.
 *
 * `/me/adaccounts` rather than a hard-coded id: the owner should be able to SEE
 * their accounts and pick one, instead of pasting an `act_…` string they have
 * to go and find in Ads Manager. An agency token commonly reaches several.
 *
 * Requires the `ads_read` permission. Without it Graph returns a 200 with an
 * empty list rather than an error, which is why the sync reports the count.
 */
export async function fetchAdAccounts(adsAccessToken: string): Promise<MetaAdAccount[]> {
  return graphList<MetaAdAccount>('me/adaccounts', {
    fields: 'id,name,currency,timezone_name,account_status,business{name}',
    access_token: adsAccessToken,
  });
}

export interface MetaLeadForm {
  id: string;
  name: string;
  status?: string;
  questions?: { key?: string; label?: string; type?: string }[];
}

export async function fetchPageLeadForms(
  pageId: string,
  pageAccessToken: string,
): Promise<MetaLeadForm[]> {
  return graphList<MetaLeadForm>(`${pageId}/leadgen_forms`, {
    fields: 'id,name,status,questions',
    access_token: pageAccessToken,
  });
}

/**
 * Discovers which lead forms a campaign's ads point at.
 *
 * A form is not owned by a campaign — the same form is commonly reused — so
 * this returns links rather than an ownership column (add-on §6).
 *
 * `ads_read` may be unavailable, in which case an empty list is returned and
 * the Admin falls back to picking from the Page's full form list.
 */
export async function fetchCampaignFormLinks(
  campaignId: string,
  adsAccessToken: string,
): Promise<string[]> {
  try {
    const ads = await graphList<{ creative?: { id?: string } }>(`${campaignId}/ads`, {
      fields: 'creative{id,object_story_spec}',
      access_token: adsAccessToken,
    });

    const formIds = new Set<string>();

    for (const ad of ads) {
      const spec = (ad.creative as unknown as {
        object_story_spec?: { link_data?: { call_to_action?: { value?: { lead_gen_form_id?: string } } } };
      })?.object_story_spec;

      const formId = spec?.link_data?.call_to_action?.value?.lead_gen_form_id;
      if (formId) formIds.add(String(formId));
    }

    return [...formIds];
  } catch {
    // Permission-restricted or unavailable. Not fatal (§17).
    return [];
  }
}

export interface MetaInsight {
  campaign_id?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
}

export async function fetchCampaignInsights(
  adAccountId: string,
  adsAccessToken: string,
  datePreset = 'today',
): Promise<MetaInsight[]> {
  return graphList<MetaInsight>(`${normalizeAdAccount(adAccountId)}/insights`, {
    level: 'campaign',
    fields: 'campaign_id,date_start,spend,impressions,reach,clicks,actions',
    date_preset: datePreset,
    time_increment: '1',
    access_token: adsAccessToken,
  });
}

/** Counts lead actions out of an insight row. */
export function leadsFromInsight(insight: MetaInsight): number {
  const actions = insight.actions ?? [];

  const lead = actions.find(
    (action) =>
      action.action_type === 'lead' ||
      action.action_type === 'onsite_conversion.lead_grouped' ||
      action.action_type === 'offsite_conversion.fb_pixel_lead',
  );

  const value = Number(lead?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/** Ad account ids must carry the `act_` prefix; owners paste them both ways. */
export function normalizeAdAccount(adAccountId: string): string {
  const trimmed = adAccountId.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}
