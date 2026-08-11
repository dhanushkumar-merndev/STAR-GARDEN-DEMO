import { NextResponse } from 'next/server';
import { isSupabaseConfigured, isTigrisConfigured } from '@/lib/env';

/**
 * Liveness and configuration probe.
 *
 * Reports application-owned integration state without returning a key, an
 * endpoint or a project ref (§15). Meta runs in Supabase Edge Functions and is
 * therefore reported as externally managed rather than inspecting its secrets.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const integrations = {
    supabase: isSupabaseConfigured(),
    tigris: isTigrisConfigured(),
    meta: 'supabase_edge_functions',
  };

  // The app is usable without Tigris (no file uploads), but not without Supabase.
  const status = integrations.supabase ? 'ok' : 'setup_required';

  return NextResponse.json(
    { status, integrations, time: new Date().toISOString() },
    { status: integrations.supabase ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
