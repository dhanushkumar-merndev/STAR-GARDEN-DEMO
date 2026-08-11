'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { appEnv, isSupabaseConfigured } from '@/lib/env';

/**
 * Authentication actions (AGENTS.md §11.1).
 *
 * Sign-in is Google OAuth only. There is no password anywhere in this system —
 * no password to phish, reuse, leak or reset — and staff already carry a
 * managed Google account.
 *
 * Being able to authenticate is not the same as being allowed in: the
 * `staff_invites` allowlist and the `on_auth_user_created` trigger decide
 * whether a verified Google identity becomes an active profile (migration 06).
 * A stranger who completes the Google flow lands on an inactive profile that
 * can read nothing.
 */

/** Where Google returns the browser after consent. */
function callbackUrl(origin: string, next?: string): string {
  const url = new URL('/auth/callback', origin);
  // Only same-site relative paths are accepted, so the callback cannot be used
  // as an open redirect to an attacker's site.
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    url.searchParams.set('next', next);
  }
  return url.toString();
}

async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const forwardedHost = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? (appEnv.isProduction ? 'https' : 'http');
    if (forwardedHost) return `${proto}://${forwardedHost}`;
  } catch {
    // Fall through to the configured URL.
  }
  return appEnv.url;
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) {
    redirect('/login?error=not_configured');
  }

  const next = String(formData.get('next') ?? '/dashboard');
  const origin = await requestOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl(origin, next),
      queryParams: {
        // Let the user pick which Google account to use — staff often have a
        // personal account signed in on the same phone.
        prompt: 'select_account',
      },
    },
  });

  if (error || !data.url) {
    console.error('[auth] could not start Google sign-in', error);
    redirect('/login?error=oauth_start');
  }

  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login?signed_out=1');
}
