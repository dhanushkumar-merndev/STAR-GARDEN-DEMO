import { describe, expect, it } from 'vitest';
import {
  authCookieBaseName,
  isForeignSupabaseAuthCookie,
} from '../../src/lib/supabase/cookies';

describe('Supabase auth cookie cleanup', () => {
  const current = 'sb-zehqvibormdypiwncclq-auth-token';

  it('derives the same default storage key as supabase-js', () => {
    expect(authCookieBaseName('https://zehqvibormdypiwncclq.supabase.co')).toBe(current);
  });

  it('keeps every current-project session and PKCE chunk', () => {
    expect(isForeignSupabaseAuthCookie(current, current)).toBe(false);
    expect(isForeignSupabaseAuthCookie(`${current}.0`, current)).toBe(false);
    expect(isForeignSupabaseAuthCookie(`${current}-code-verifier`, current)).toBe(false);
  });

  it('removes auth cookies from another localhost Supabase project', () => {
    expect(isForeignSupabaseAuthCookie('sb-oldproject-auth-token.2', current)).toBe(true);
    expect(isForeignSupabaseAuthCookie('sb-oldproject-auth-token-code-verifier', current)).toBe(true);
  });

  it('does not touch unrelated application cookies', () => {
    expect(isForeignSupabaseAuthCookie('theme', current)).toBe(false);
    expect(isForeignSupabaseAuthCookie('sb-random-setting', current)).toBe(false);
  });
});
