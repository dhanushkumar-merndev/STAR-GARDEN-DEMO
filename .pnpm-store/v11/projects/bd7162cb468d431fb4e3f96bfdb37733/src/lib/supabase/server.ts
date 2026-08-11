import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * User-scoped Supabase client for Server Components, Server Actions and Route
 * Handlers.
 *
 * This is the DEFAULT client for all business reads and writes. It carries the
 * signed-in user's JWT, so Row Level Security applies to every query — the
 * second enforcement layer required by AGENTS.md §7.5. Reach for
 * `createAdminClient()` only in the narrow system cases documented there.
 */
export async function createClient() {
  // `cookies()` is awaited FIRST, before any env validation. Reading cookies is
  // what tells Next.js this render is dynamic; throwing a missing-env error
  // ahead of it would fail the build's prerender pass instead of deferring to
  // request time, which is exactly what must not happen while credentials are
  // still being filled in.
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      // We authorize with getUser(), so persisting the full user object in
      // every cookie is unnecessary. Tokens-only keeps Google OAuth cookies
      // comfortably below common proxy/header limits.
      encode: 'tokens-only',
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // `middleware.ts` refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
