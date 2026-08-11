import 'server-only';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';

/**
 * Rate limiting for the public enquiry form and auth-sensitive endpoints
 * (AGENTS.md §15).
 *
 * Backed by a Postgres table rather than Redis, deliberately: §3.2 excludes
 * Redis "unless a proven need appears", and an internal CRM's public surface is
 * one form. The table has no RLS policies at all, so only the service-role
 * client can touch it.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Logical bucket, e.g. `public_enquiry`. */
  bucket: string;
  /** Caller identity within the bucket — usually an IP address. */
  identifier: string;
  limit: number;
  windowSeconds: number;
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { bucket, identifier, limit, windowSeconds } = options;
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  try {
    const admin = createAdminClient();

    const { count, error } = await admin
      .from('rate_limit_hits')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', bucket)
      .eq('identifier', identifier)
      .gte('created_at', since);

    if (error) throw error;

    const used = count ?? 0;
    if (used >= limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
    }

    await admin.from('rate_limit_hits').insert({ bucket, identifier });

    // Opportunistic cleanup: drop rows well outside any window we use, so the
    // table cannot grow without bound. Cheap, and only ~2% of requests pay it.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await admin.from('rate_limit_hits').delete().lt('created_at', cutoff);
    }

    return { allowed: true, remaining: limit - used - 1, retryAfterSeconds: 0 };
  } catch (error) {
    // Fail OPEN, and loudly. This limiter protects a contact form from spam; it
    // is not an authorization control, and a database hiccup must not take the
    // public website's enquiry form offline.
    console.error('[rate-limit] check failed, allowing request', { bucket, error });
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

export async function enforceRateLimit(options: RateLimitOptions): Promise<void> {
  const result = await checkRateLimit(options);
  if (!result.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many requests. Please try again later.', {
      meta: { retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    return forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Same, for a Route Handler that already holds the Request. */
export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}
