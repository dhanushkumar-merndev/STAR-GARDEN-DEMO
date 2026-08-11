/**
 * Shared configuration for every Meta Edge Function.
 *
 * The Graph API version is pinned HERE and nowhere else (add-on §17). Meta
 * deprecates versions on a schedule, and a version string copied into three
 * functions is a guarantee that one of them will be forgotten. Bumping this
 * constant is the entire upgrade.
 *
 * Verify field availability against current Meta developer documentation before
 * raising it — fields move between versions and some require extra permissions.
 */
export const GRAPH_API_VERSION = 'v25.0';

export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Hard ceiling on pagination, so a runaway account cannot hang a function. */
export const MAX_PAGES = 25;

/** Per-request timeout against the Graph API. */
export const GRAPH_TIMEOUT_MS = 15_000;

/**
 * Secrets, read from the function environment.
 *
 * `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform;
 * the Meta values are set with `supabase secrets set`. Nothing here is ever
 * echoed into a response, a log line or an error message.
 */
export function env(name: string): string | undefined {
  const value = Deno.env.get(name);
  return value && value.trim() !== '' ? value.trim() : undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} is not configured on this project.`);
  return value;
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/**
 * Removes anything token-shaped from an error before it is stored or returned.
 *
 * Graph errors frequently echo the request URL, and the access token travels in
 * that URL as a query parameter.
 */
export function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  return raw
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[redacted]')
    .replace(/\bEAA[A-Za-z0-9]{20,}\b/g, '[redacted-token]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 500);
}
