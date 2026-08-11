import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppError, forbidden, unauthenticated } from '@/lib/errors';
import type { ProfileRow, UserRole } from '@/types/database';

/**
 * Session and identity for server code.
 *
 * AGENTS.md §7.5: UI visibility is not security, and the browser's claim about
 * who it is may never be trusted. Every Server Action and Route Handler starts
 * by calling `requireUser()` / `requireRole()` here, and the resulting id comes
 * from a JWT that Supabase Auth has verified — never from a form field.
 */

export interface SessionUser {
  id: string;
  email: string | null;
  profile: ProfileRow;
  role: UserRole;
  isAdmin: boolean;
}

/**
 * Current user, or null. De-duplicated per request by `React.cache`, so a page
 * that checks permissions in several components still issues one auth call.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();

  // getUser() revalidates the token with Supabase Auth. getSession() reads an
  // unverified cookie and must not be used for authorization.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // No profile row, or a deactivated one, means no access at all. This is the
  // same condition `app.is_active_user()` enforces in the database, so the two
  // layers cannot drift (§15).
  if (!profile || !profile.is_active) return null;

  return {
    id: user.id,
    email: user.email ?? profile.email,
    profile,
    role: profile.role,
    isAdmin: profile.role === 'ADMIN',
  };
});

/**
 * Distinguishes "signed out" from "signed in but not authorised", so the UI can
 * explain which one happened instead of bouncing to a login page the user has
 * already completed.
 */
export type AccessState =
  | { state: 'ANONYMOUS' }
  | { state: 'NO_PROFILE'; email: string | null }
  | { state: 'DEACTIVATED'; profile: ProfileRow }
  | { state: 'ACTIVE'; user: SessionUser };

export async function getAccessState(): Promise<AccessState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { state: 'ANONYMOUS' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return { state: 'NO_PROFILE', email: user.email ?? null };
  if (!profile.is_active) return { state: 'DEACTIVATED', profile };

  return {
    state: 'ACTIVE',
    user: {
      id: user.id,
      email: user.email ?? profile.email,
      profile,
      role: profile.role,
      isAdmin: profile.role === 'ADMIN',
    },
  };
}

/** Throws rather than redirecting — for Server Actions and Route Handlers. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw forbidden(
      `This action is restricted to ${roles.map((r) => ROLE_LABELS[r]).join(' or ')}.`,
    );
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole('ADMIN');
}

/** Redirecting variant — for pages and layouts. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

export async function requirePageRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requirePageUser();
  if (!roles.includes(user.role)) redirect('/dashboard?denied=1');
  return user;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  BDM: 'Business Development Manager',
  DESIGNER: 'Landscape Designer',
  EXECUTION: 'Execution Team',
};

export const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  BDM: 'BDM',
  DESIGNER: 'Designer',
  EXECUTION: 'Execution',
};

/** Records the sign-in timestamp. Best-effort: never blocks the session. */
export async function recordSignIn(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc('record_sign_in');
  } catch (error) {
    console.error('[auth] failed to record sign-in', error);
  }
}

/** Guard for code paths that must never run without an authenticated actor. */
export function assertActor(userId: string | null | undefined): string {
  if (!userId) throw new AppError('UNAUTHENTICATED', 'No acting user on this request.');
  return userId;
}
