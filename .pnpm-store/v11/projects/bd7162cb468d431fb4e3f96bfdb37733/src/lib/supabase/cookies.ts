/** Default storage key used by supabase-js for this project. */
export function authCookieBaseName(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

/**
 * Browsers share localhost cookies across ports. Old Supabase projects can
 * therefore accumulate enough chunked auth cookies to trigger HTTP 431 before
 * Next.js sees the request. Only OAuth callback processing uses this cleanup;
 * production host-only cookies remain isolated naturally.
 */
export function isForeignSupabaseAuthCookie(name: string, currentBase: string): boolean {
  return name.startsWith('sb-') && name.includes('-auth-token') && !name.startsWith(currentBase);
}
