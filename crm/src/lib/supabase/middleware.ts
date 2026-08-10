import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/auth/callback'];

/** API routes that authenticate by their own means (signature, secret, CORS). */
const SELF_AUTHENTICATING_API = ['/api/meta/webhook', '/api/public/', '/api/cron/', '/api/health'];

function isPublicPath(pathname: string): boolean {
  return (
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
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === '/login' || pathname === '/')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
