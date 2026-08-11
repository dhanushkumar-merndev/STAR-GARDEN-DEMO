import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { authCookieBaseName, isForeignSupabaseAuthCookie } from '@/lib/supabase/cookies';
import { getSupabasePublicEnv } from '@/lib/env';
import { recordSignIn } from '@/lib/auth/session';

/**
 * Google OAuth callback (AGENTS.md §11.1).
 *
 * Google redirects here with a one-time `code`, which is exchanged for a
 * session on the server. The tokens are written to HttpOnly cookies by
 * `@supabase/ssr` and never touch client JavaScript.
 *
 * Whether the person is *allowed* in is decided elsewhere — the
 * `on_auth_user_created` trigger provisions an active profile only for an
 * allowlisted address (migration 06), and `getSessionUser()` refuses anyone
 * without one. So this route can safely complete the exchange for any verified
 * Google account and let `/dashboard` show the "no access" state.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // The user declined consent, or Google refused.
  if (error) {
    const target = new URL('/login', origin);
    target.searchParams.set('error', error === 'access_denied' ? 'cancelled' : 'oauth');
    if (errorDescription) target.searchParams.set('detail', errorDescription.slice(0, 200));
    return NextResponse.redirect(target);
  }

  if (!code) {
    const target = new URL('/login', origin);
    target.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(target);
  }

  // localhost cookies are shared across ports. Remove auth cookies belonging
  // to other Supabase projects before writing this session, preventing an
  // otherwise valid OAuth redirect from exceeding the request-header limit.
  const cookieStore = await cookies();
  const currentCookieBase = authCookieBaseName(getSupabasePublicEnv().url);
  for (const { name } of cookieStore.getAll()) {
    if (isForeignSupabaseAuthCookie(name, currentCookieBase)) cookieStore.delete(name);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('[auth] code exchange failed', exchangeError.message);
    const target = new URL('/login', origin);
    target.searchParams.set('error', 'exchange_failed');
    return NextResponse.redirect(target);
  }

  // Best-effort; never blocks the redirect.
  await recordSignIn();

  const nextParam = searchParams.get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/dashboard';

  return NextResponse.redirect(new URL(next, origin));
}
