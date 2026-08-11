import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { env, requireEnv } from './config.ts';

/**
 * Database access and caller authentication for Edge Functions.
 *
 * Two callers exist and they are authenticated differently (add-on §15):
 *
 *   - **Scheduled** invocations come from `pg_cron` inside the same project and
 *     carry a shared internal secret. They have no user session.
 *   - **Manual** invocations come from an Admin's browser and carry a Supabase
 *     user JWT. The role is then read FROM THE DATABASE — never from a claim in
 *     the token or a flag in the request body.
 *
 * The webhook authenticates by Meta signature instead and uses neither.
 */

/** Service-role client. Bypasses RLS; used only after the caller is verified. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type CallerKind =
  | { kind: 'SERVICE' }
  | { kind: 'ADMIN'; userId: string }
  | { kind: 'DENIED'; reason: string };

/**
 * Establishes who is calling.
 *
 * Order matters: the internal secret is checked first because a cron call has
 * no JWT at all, and an invalid JWT must not mask a legitimate scheduled run.
 */
export async function authenticateCaller(request: Request): Promise<CallerKind> {
  const internalSecret = env('META_SYNC_INTERNAL_SECRET');
  const providedSecret = request.headers.get('x-internal-secret');

  if (internalSecret && providedSecret) {
    return constantTimeEqual(providedSecret, internalSecret)
      ? { kind: 'SERVICE' }
      : { kind: 'DENIED', reason: 'Invalid internal secret.' };
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { kind: 'DENIED', reason: 'No credentials supplied.' };
  }

  const token = authorization.slice('Bearer '.length);

  // Anonymous key presented as a bearer token is not a user session.
  if (token === env('SUPABASE_ANON_KEY')) {
    return { kind: 'DENIED', reason: 'A signed-in Admin session is required.' };
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { kind: 'DENIED', reason: 'Session is not valid.' };
  }

  // The database is authoritative about the role (§15, §18).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile?.is_active || profile.role !== 'ADMIN') {
    return { kind: 'DENIED', reason: 'Admin access is required.' };
  }

  return { kind: 'ADMIN', userId: data.user.id };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/* -------------------------------------------------------------------------- */
/* Sync run bookkeeping                                                        */
/* -------------------------------------------------------------------------- */

export interface SyncRunHandle {
  id: string;
  received: number;
  created: number;
  updated: number;
}

export async function startSyncRun(
  supabase: SupabaseClient,
  syncType: 'CAMPAIGNS' | 'INSIGHTS' | 'WEBHOOK_REPLAY',
  caller: CallerKind,
): Promise<SyncRunHandle> {
  const { data } = await supabase
    .from('meta_sync_runs')
    .insert({
      sync_type: syncType,
      status: 'RUNNING',
      trigger_type: caller.kind === 'ADMIN' ? 'ADMIN_MANUAL' : 'CRON',
      triggered_by: caller.kind === 'ADMIN' ? caller.userId : null,
    })
    .select('id')
    .single();

  return { id: data?.id ?? '', received: 0, created: 0, updated: 0 };
}

export async function finishSyncRun(
  supabase: SupabaseClient,
  run: SyncRunHandle,
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  errorSummary?: string | null,
): Promise<void> {
  if (!run.id) return;

  await supabase
    .from('meta_sync_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      records_received: run.received,
      records_created: run.created,
      records_updated: run.updated,
      error_summary: errorSummary ?? null,
    })
    .eq('id', run.id);
}

/** Append-only audit entry from a headless context. */
export async function audit(
  supabase: SupabaseClient,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    actorUserId?: string | null;
    after?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      actor_user_id: entry.actorUserId ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      after_data: entry.after ?? null,
    });
  } catch (error) {
    console.error('[audit] failed', error);
  }
}
