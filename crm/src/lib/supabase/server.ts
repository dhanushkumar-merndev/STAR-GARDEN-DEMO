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
  const { url, anonKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
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
