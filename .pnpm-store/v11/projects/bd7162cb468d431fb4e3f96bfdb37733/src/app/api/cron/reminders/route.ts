import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getCronSecret, isSupabaseConfigured } from '@/lib/env';
import { runReminders } from '@/server/services/reminders';

/**
 * Due-date reminders (AGENTS.md §13).
 *
 * Invoked hourly by Supabase Cron (pg_cron + pg_net). The route is
 * publicly routable, so it authenticates by bearer secret; without it, anyone
 * could spam every user's notification list.
 *
 * Reminders are idempotent at the database level (the per-day dedupe index), so
 * a duplicate invocation is harmless and a missed hour self-heals.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  let expected: string;
  try {
    expected = getCronSecret();
  } catch {
    // No secret configured: refuse rather than run unauthenticated.
    return false;
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database is not configured' }, { status: 503 });
  }

  const startedAt = Date.now();

  try {
    const result = await runReminders();

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    console.error('[cron] reminder run failed', error);
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 });
  }
}

/** Supabase Cron uses POST; GET is retained for an authenticated health check. */
export const POST = GET;
