import 'server-only';

/**
 * Environment access.
 *
 * Deliberately lazy: nothing throws at import or build time. The owner is
 * filling in Supabase, Tigris and Meta credentials after the first deploy, and
 * AGENTS.md §14 requires that missing Meta credentials never block manual and
 * website lead intake. Each integration validates only when it is actually
 * used, and reports a precise, actionable message.
 */

class MissingEnvError extends Error {
  constructor(names: string[], integration: string) {
    super(
      `${integration} is not configured. Missing environment variable(s): ${names.join(', ')}. ` +
        `See crm/.env.example for how to obtain them.`,
    );
    this.name = 'MissingEnvError';
  }
}

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function require_(names: string[], integration: string): string[] {
  const values = names.map(read);
  const missing = names.filter((_, i) => values[i] === undefined);
  if (missing.length > 0) throw new MissingEnvError(missing, integration);
  return values as string[];
}

function readInt(name: string, fallback: number): number {
  const raw = read(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/* -------------------------------------------------------------------------- */
/* Application                                                                 */
/* -------------------------------------------------------------------------- */

export const appEnv = {
  get url(): string {
    return (
      read('NEXT_PUBLIC_APP_URL') ??
      (read('VERCEL_PROJECT_PRODUCTION_URL')
        ? `https://${read('VERCEL_PROJECT_PRODUCTION_URL')}`
        : 'http://localhost:3000')
    ).replace(/\/$/, '');
  },
  get name(): string {
    return read('NEXT_PUBLIC_APP_NAME') ?? 'Star Garden CRM';
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
};

/* -------------------------------------------------------------------------- */
/* Supabase                                                                    */
/* -------------------------------------------------------------------------- */

export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const [url, anonKey] = require_(
    ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    'Supabase',
  );
  return { url: url!, anonKey: anonKey! };
}

/**
 * Service-role credentials. Callers must have already performed their own
 * authorization check — this key bypasses RLS (§7.5, §18).
 */
export function getSupabaseServiceEnv(): { url: string; serviceRoleKey: string } {
  const [url, serviceRoleKey] = require_(
    ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    'Supabase service role',
  );
  return { url: url!, serviceRoleKey: serviceRoleKey! };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(read('NEXT_PUBLIC_SUPABASE_URL') && read('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
}

/* -------------------------------------------------------------------------- */
/* Tigris object storage                                                       */
/* -------------------------------------------------------------------------- */

export interface TigrisEnv {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  uploadTtlSeconds: number;
  downloadTtlSeconds: number;
}

export function getTigrisEnv(): TigrisEnv {
  const [bucket, accessKeyId, secretAccessKey] = require_(
    ['TIGRIS_BUCKET_NAME', 'TIGRIS_ACCESS_KEY_ID', 'TIGRIS_SECRET_ACCESS_KEY'],
    'Tigris object storage',
  );

  return {
    bucket: bucket!,
    endpoint: read('TIGRIS_ENDPOINT_URL') ?? 'https://t3.storage.dev',
    region: read('TIGRIS_REGION') ?? 'auto',
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    // Short-lived by policy (§15). Clamped so a misconfiguration cannot mint a
    // long-lived URL by accident.
    uploadTtlSeconds: Math.min(readInt('TIGRIS_UPLOAD_URL_TTL_SECONDS', 300), 900),
    downloadTtlSeconds: Math.min(readInt('TIGRIS_DOWNLOAD_URL_TTL_SECONDS', 120), 900),
  };
}

export function isTigrisConfigured(): boolean {
  return Boolean(
    read('TIGRIS_BUCKET_NAME') && read('TIGRIS_ACCESS_KEY_ID') && read('TIGRIS_SECRET_ACCESS_KEY'),
  );
}

/* -------------------------------------------------------------------------- */
/* Meta Lead Ads                                                               */
/* -------------------------------------------------------------------------- */

export interface MetaEnv {
  appSecret: string;
  verifyToken: string;
  pageAccessToken: string;
  graphVersion: string;
  allowedPageIds: string[];
}

export function getMetaEnv(): MetaEnv {
  const [appSecret, verifyToken, pageAccessToken] = require_(
    ['META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN', 'META_PAGE_ACCESS_TOKEN'],
    'Meta Lead Ads',
  );

  return {
    appSecret: appSecret!,
    verifyToken: verifyToken!,
    pageAccessToken: pageAccessToken!,
    graphVersion: read('META_GRAPH_API_VERSION') ?? 'v21.0',
    allowedPageIds: (read('META_ALLOWED_PAGE_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function isMetaConfigured(): boolean {
  return Boolean(
    read('META_APP_SECRET') && read('META_WEBHOOK_VERIFY_TOKEN') && read('META_PAGE_ACCESS_TOKEN'),
  );
}

/* -------------------------------------------------------------------------- */
/* Cron, uploads, public form                                                  */
/* -------------------------------------------------------------------------- */

export function getCronSecret(): string {
  const [secret] = require_(['CRON_SECRET'], 'Reminder cron');
  return secret!;
}

export const uploadEnv = {
  get maxSizeMbFallback(): number {
    return readInt('MAX_UPLOAD_SIZE_MB', 50);
  },
};

export const publicFormEnv = {
  get allowedOrigins(): string[] {
    return (read('PUBLIC_ENQUIRY_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
  },
  get rateLimitPerHour(): number {
    return readInt('PUBLIC_ENQUIRY_RATE_LIMIT_PER_HOUR', 8);
  },
  get turnstileSecret(): string | undefined {
    return read('TURNSTILE_SECRET_KEY');
  },
};

export { MissingEnvError };
