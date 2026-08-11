import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { ProfileRow, StaffInviteRow, UserRole } from '@/types/database';

/**
 * Staff administration (AGENTS.md §7.1, §11.7).
 *
 * Sign-in is Google-only, so there is no "create user with a password" step.
 * An Admin allowlists a Google address and the role it should receive; the
 * account materialises on that person's first sign-in, provisioned by the
 * `on_auth_user_created` trigger (migration 06).
 *
 * Two consequences worth stating plainly:
 *   - Revoking an invite does NOT revoke an existing account. Deactivating the
 *     profile does, and does so immediately (§15).
 *   - Someone who signs in without an invite gets an inactive profile that can
 *     read nothing. Admins see them as access requests and can approve or
 *     ignore them.
 */

export interface StaffMember extends ProfileRow {
  open_leads?: number;
}

export interface ActiveWorkCounts {
  assignedLeads: number;
  openFollowUps: number;
  upcomingSiteVisits: number;
  activeDesignProjects: number;
  openExecutionTasks: number;
  total: number;
}

/** Work that would be orphaned if a staff member lost their current role. */
export async function getActiveWorkCounts(
  user: SessionUser,
  staffUserId: string,
): Promise<ActiveWorkCounts> {
  requireAdminRole(user);
  const supabase = await createClient();

  const { data: attendance } = await supabase
    .from('site_visit_attendees')
    .select('site_visit_id')
    .eq('user_id', staffUserId);
  const visitIds = (attendance ?? []).map((row) => row.site_visit_id);

  const [leads, followUps, visits, designs, tasks] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_bdm_id', staffUserId)
      .not('status', 'in', '("LOST","CLOSED")'),
    supabase
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', staffUserId)
      .in('status', ['OPEN', 'OVERDUE']),
    visitIds.length
      ? supabase
          .from('site_visits')
          .select('id', { count: 'exact', head: true })
          .in('id', visitIds)
          .in('status', ['SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS'])
      : Promise.resolve({ count: 0 }),
    supabase
      .from('design_projects')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_designer_id', staffUserId)
      .not('status', 'in', '("APPROVED","CANCELLED","NOT_REQUIRED")'),
    supabase
      .from('execution_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', staffUserId)
      .not('status', 'in', '("COMPLETED","CANCELLED")'),
  ]);

  const counts = {
    assignedLeads: leads.count ?? 0,
    openFollowUps: followUps.count ?? 0,
    upcomingSiteVisits: visits.count ?? 0,
    activeDesignProjects: designs.count ?? 0,
    openExecutionTasks: tasks.count ?? 0,
  };

  return { ...counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}

export async function listStaffWithActiveWork(
  user: SessionUser,
): Promise<(StaffMember & { activeWork: ActiveWorkCounts })[]> {
  const staff = await listStaff(user);
  if (staff.length === 0) return [];

  // Constant query count: this screen must not issue five extra requests per
  // staff member. At 100 users that old shape would have meant 500+ queries.
  const supabase = await createClient();
  const [leads, followUps, attendance, activeVisits, designs, tasks] = await Promise.all([
    supabase
      .from('leads')
      .select('assigned_bdm_id')
      .not('assigned_bdm_id', 'is', null)
      .not('status', 'in', '("LOST","CLOSED")'),
    supabase
      .from('follow_ups')
      .select('assigned_to')
      .in('status', ['OPEN', 'OVERDUE']),
    supabase.from('site_visit_attendees').select('user_id, site_visit_id'),
    supabase
      .from('site_visits')
      .select('id')
      .in('status', ['SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS']),
    supabase
      .from('design_projects')
      .select('assigned_designer_id')
      .not('assigned_designer_id', 'is', null)
      .not('status', 'in', '("APPROVED","CANCELLED","NOT_REQUIRED")'),
    supabase
      .from('execution_tasks')
      .select('assigned_to')
      .not('assigned_to', 'is', null)
      .not('status', 'in', '("COMPLETED","CANCELLED")'),
  ]);

  const leadCounts = countBy(leads.data ?? [], (row) => row.assigned_bdm_id);
  const followUpCounts = countBy(followUps.data ?? [], (row) => row.assigned_to);
  const designCounts = countBy(designs.data ?? [], (row) => row.assigned_designer_id);
  const taskCounts = countBy(tasks.data ?? [], (row) => row.assigned_to);
  const activeVisitIds = new Set((activeVisits.data ?? []).map((row) => row.id));
  const visitCounts = countBy(
    (attendance.data ?? []).filter((row) => activeVisitIds.has(row.site_visit_id)),
    (row) => row.user_id,
  );

  return staff.map((member) => {
    const counts = {
      assignedLeads: leadCounts.get(member.id) ?? 0,
      openFollowUps: followUpCounts.get(member.id) ?? 0,
      upcomingSiteVisits: visitCounts.get(member.id) ?? 0,
      activeDesignProjects: designCounts.get(member.id) ?? 0,
      openExecutionTasks: taskCounts.get(member.id) ?? 0,
    };

    return {
      ...member,
      activeWork: {
        ...counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      },
    };
  });
}

function countBy<T>(rows: T[], keyOf: (row: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function listStaff(user: SessionUser): Promise<StaffMember[]> {
  requireAdminRole(user);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('is_active', { ascending: false })
    .order('full_name');

  if (error) throw new AppError('INTERNAL', 'Could not load users.', { cause: error });
  return data ?? [];
}

/** Accounts that signed in without an invite — never approved, never active. */
export async function listAccessRequests(user: SessionUser): Promise<ProfileRow[]> {
  requireAdminRole(user);
  const supabase = await createClient();

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('is_active', false)
    .is('approved_at', null)
    .order('created_at', { ascending: false });

  return data ?? [];
}

export async function listInvites(user: SessionUser): Promise<StaffInviteRow[]> {
  requireAdminRole(user);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('staff_invites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new AppError('INTERNAL', 'Could not load invites.', { cause: error });
  return data ?? [];
}

export async function inviteStaff(
  user: SessionUser,
  input: { email: string; full_name: string; mobile?: string; role: UserRole },
): Promise<StaffInviteRow> {
  requireAdminRole(user);
  const supabase = await createClient();

  const { data: invite, error } = await supabase
    .from('staff_invites')
    .insert({
      email: input.email,
      full_name: input.full_name,
      mobile: input.mobile ?? null,
      role: input.role,
      invited_by: user.id,
    })
    .select('*')
    .single();

  if (error?.code === '23505') {
    throw new AppError('CONFLICT', 'That email is already on the allowlist.', {
      fields: { email: 'Already invited.' },
    });
  }

  if (error || !invite) {
    throw new AppError('INTERNAL', 'Could not create the invite.', { cause: error });
  }

  // If this person already signed in and was parked as inactive, the invite is
  // effectively an approval — apply it now rather than making them sign in again.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('profiles')
    .select('id, is_active, approved_at')
    .ilike('email', input.email)
    .maybeSingle();

  if (existing && !existing.is_active && !existing.approved_at) {
    await admin
      .from('profiles')
      .update({
        role: input.role,
        full_name: input.full_name,
        is_active: true,
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      })
      .eq('id', existing.id);

    await admin
      .from('staff_invites')
      .update({ accepted_at: new Date().toISOString(), accepted_by: existing.id })
      .eq('id', invite.id);
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.USER_INVITED,
    entityType: 'staff_invite',
    entityId: invite.id,
    after: { email: input.email, role: input.role, applied_to_existing: Boolean(existing) },
  });

  return invite;
}

export async function revokeInvite(user: SessionUser, inviteId: string): Promise<void> {
  requireAdminRole(user);
  const supabase = await createClient();

  const { data: invite } = await supabase
    .from('staff_invites')
    .select('*')
    .eq('id', inviteId)
    .maybeSingle();

  if (!invite) throw new AppError('NOT_FOUND', 'Invite not found.');

  const { error } = await supabase.from('staff_invites').delete().eq('id', inviteId);
  if (error) throw new AppError('INTERNAL', 'Could not revoke the invite.', { cause: error });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.USER_INVITE_REVOKED,
    entityType: 'staff_invite',
    entityId: inviteId,
    before: { email: invite.email, role: invite.role, accepted: Boolean(invite.accepted_at) },
    after: invite.accepted_at
      ? { note: 'Invite removed. The existing account is unaffected — deactivate it separately.' }
      : { note: 'Pending invite removed.' },
  });
}

export async function updateStaff(
  user: SessionUser,
  input: {
    user_id: string;
    full_name: string;
    mobile?: string;
    role: UserRole;
    is_active: boolean;
  },
): Promise<ProfileRow> {
  requireAdminRole(user);

  const supabase = await createClient();

  const { data: before } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', input.user_id)
    .maybeSingle();

  if (!before) throw new AppError('NOT_FOUND', 'User not found.');

  // An Admin locking themselves out is a support ticket nobody can resolve
  // from inside the app.
  if (input.user_id === user.id) {
    if (!input.is_active) {
      throw new AppError('VALIDATION', 'You cannot deactivate your own account.');
    }
    if (input.role !== 'ADMIN') {
      throw new AppError('VALIDATION', 'You cannot remove your own Admin role.');
    }
  }

  // Never leave the system with no way back in.
  if (before.role === 'ADMIN' && (input.role !== 'ADMIN' || !input.is_active)) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'ADMIN')
      .eq('is_active', true);

    if ((count ?? 0) <= 1) {
      throw new AppError('VALIDATION', 'This is the last active Admin. Promote someone else first.');
    }
  }

  if (before.role !== input.role || (before.is_active && !input.is_active)) {
    const activeWork = await getActiveWorkCounts(user, input.user_id);
    if (activeWork.total > 0) {
      throw new AppError(
        'VALIDATION',
        'Reassign this user’s active work before changing their role or deactivating them.',
        { meta: { activeWork } },
      );
    }
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update({
      full_name: input.full_name,
      mobile: input.mobile ?? null,
      role: input.role,
      is_active: input.is_active,
      approved_at: input.is_active ? (before.approved_at ?? new Date().toISOString()) : before.approved_at,
      approved_by: input.is_active && !before.approved_at ? user.id : before.approved_by,
    })
    .eq('id', input.user_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not update the user.', { cause: error });
  }

  let action: string = AuditAction.USER_UPDATED;
  if (before.is_active && !updated.is_active) action = AuditAction.USER_DEACTIVATED;
  if (!before.is_active && updated.is_active) action = AuditAction.USER_REACTIVATED;

  await recordAudit({
    actorUserId: user.id,
    action,
    entityType: 'profile',
    entityId: updated.id,
    before: { role: before.role, is_active: before.is_active, full_name: before.full_name },
    after: { role: updated.role, is_active: updated.is_active, full_name: updated.full_name },
  });

  return updated;
}

/** Self-service profile edit. Role and activation are not editable here. */
export async function updateOwnProfile(
  user: SessionUser,
  input: { full_name: string; mobile?: string },
): Promise<ProfileRow> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: input.full_name, mobile: input.mobile ?? null })
    .eq('id', user.id)
    .select('*')
    .single();

  if (error || !data) {
    throw new AppError('INTERNAL', 'Could not update your profile.', { cause: error });
  }

  return data;
}

function requireAdminRole(user: SessionUser): void {
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'Admin access is required.');
}
