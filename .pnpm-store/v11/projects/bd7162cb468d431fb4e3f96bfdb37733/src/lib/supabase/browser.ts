'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * Browser client. Uses the publishable anon key only — RLS is what protects the
 * data behind it. Service-role keys and Tigris secrets never reach this file
 * (AGENTS.md §15, §18).
 *
 * Used for sign-in/sign-out and optional Realtime subscriptions. All business
 * mutations go through Server Actions so authorization is re-checked on the
 * server.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error(
        'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
          'NEXT_PUBLIC_SUPABASE_ANON_KEY (see crm/.env.example).',
      );
    }

    client = createBrowserClient<Database>(url, anonKey);
  }

  return client;
}
