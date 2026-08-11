import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Service-role client. **Bypasses RLS.**
 *
 * AGENTS.md §7.5 / §18: this is not a shortcut around authorization. It exists
 * only for work that has no user session to check, or that must write rows the
 * acting user is deliberately not allowed to write directly:
 *
 *   1. Meta Lead Ads webhook intake        — no user session exists
 *   2. Public website enquiry intake       — anonymous caller
 *   3. Audit-log writes                    — append-only, never client-writable
 *   4. Notification fan-out to OTHER users — after the caller's own check passed
 *   5. Admin user provisioning             — auth.admin API
 *   6. Reminder cron                       — runs headless
 *   7. Rate-limit bookkeeping              — table has no policies at all
 *
 * Every caller must have already established that the operation is permitted.
 * If you are reaching for this to "make a query work", use `createClient()`
 * from `./server` instead and fix the policy.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-application-name': 'stargarden-crm-service' },
    },
  });
}
