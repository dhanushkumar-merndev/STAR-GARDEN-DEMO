import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/manifest.webmanifest',
  // Google's OAuth branding review fetches these signed out: the homepage has
  // to explain what the application is for, and the policy has to be readable
  // without an account. Bouncing either to /login fails the review.
  '/home',
  '/privacy',
];

/** API routes that authenticate by their own means (signature, secret, CORS). */
const SELF_AUTHENTICATING_API = ['/api/public/', '/api/cron/', '/api/health'];

/**
 * Public on an exact match only.
 *
 * `/` cannot go in `PUBLIC_PATHS`: that list is prefix-matched, and every path
 * starts with a slash, so it would make the entire application anonymous.
 */
const PUBLIC_EXACT_PATHS = ['/'];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT_PATHS.includes(pathname) ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    SELF_AUTHENTICATING_API.some((p) => pathname.startsWith(p))
  );
}

/**
 * Refreshes the Supabase session cookie on every request and gates protected
 * routes.
 *
 * This is a coarse first gate, not the security boundary — AGENTS.md §7.5 is
 * explicit that UI visibility is not security. Every Server Action, Route
 * Handler and RLS policy re-checks authorization independently.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Before credentials are configured, let the app render its setup notice
  // rather than redirect-looping on /login.
  if (!url || !anonKey) return response;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      // Must match the Route Handler/Server Component client. The application
      // always calls getUser() for verified identity, so the larger serialized
      // user object does not need to travel in the session cookie.
      encode: 'tokens-only',
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates the JWT against Supabase Auth. Do not swap this for
  // getSession(), which trusts an unverified cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', pathname);
    return redirectWithCookies(redirectUrl, response);
  }

  // Do not redirect an authenticated visitor away from /login here. Google
  // authentication does not imply CRM authorization: the login page must be
  // allowed to render NO_PROFILE/DEACTIVATED and offer sign-out. Active users
  // are redirected by LoginPage after its database profile check.
  if (user && pathname === '/') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return redirectWithCookies(redirectUrl, response);
  }

  return response;
}

/** A new redirect response must retain any refresh/cleanup cookies Supabase set. */
function redirectWithCookies(url: URL, source: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
