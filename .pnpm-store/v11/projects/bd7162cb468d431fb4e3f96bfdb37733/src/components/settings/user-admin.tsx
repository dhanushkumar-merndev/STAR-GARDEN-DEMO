'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Checkbox, Input, Select } from '@/components/ui';
import { inviteStaffAction, updateStaffAction } from '@/server/actions/admin';
import type { ActiveWorkCounts } from '@/server/services/users';
import type { ProfileRow, UserRole } from '@/types/database';

const ALL_ROLES: { value: UserRole; label: string; requiresBdm?: boolean }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'BDM', label: 'BDM', requiresBdm: true },
  { value: 'DESIGNER', label: 'Landscape Designer' },
  { value: 'EXECUTION', label: 'Execution Team' },
];

/**
 * The roles an Admin may hand out.
 *
 * BDM is hidden while the "separate BDM role" switch in Settings is off, so
 * nobody is given a role the business is not currently running. It stays
 * visible for anyone who already holds it — hiding an existing user's own role
 * would make the dropdown silently change them to something else on save.
 *
 * CLIENT never appears: a customer login is created by granting portal access
 * to a lead, not by editing a staff record.
 */
function rolesFor(bdmEnabled: boolean, currentRole?: UserRole) {
  return ALL_ROLES.filter(
    (role) => !role.requiresBdm || bdmEnabled || role.value === currentRole,
  );
}

export function InviteStaffForm({ bdmEnabled = false }: { bdmEnabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const roles = rolesFor(bdmEnabled);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      action={async (data) => {
        setPending(true);
        try {
          const result = await inviteStaffAction(null, data);
          if (result.ok) {
            toast.success('Google account added to the allowlist.');
            router.refresh();
          } else toast.error(result.message);
        } finally {
          setPending(false);
        }
      }}
    >
      <Input name="full_name" placeholder="Full name" required />
      <Input name="email" type="email" placeholder="Google account email" required />
      <Input name="mobile" type="tel" placeholder="Mobile (optional)" />
      {/* Defaults to Designer, not BDM: with the BDM role switched off that
          option is not even in the list, and a default that is absent would
          silently select whatever happens to be first. */}
      <Select name="role" defaultValue={bdmEnabled ? 'BDM' : 'DESIGNER'}>
        {roles.map((role) => (
          <option key={role.value} value={role.value}>
            {role.label}
          </option>
        ))}
      </Select>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add staff access'}</Button>
      </div>
    </form>
  );
}

export function StaffEditor({
  member,
  work,
  bdmEnabled = false,
}: {
  member: ProfileRow;
  work: ActiveWorkCounts;
  bdmEnabled?: boolean;
}) {
  // Their current role is always offered, even a hidden one — otherwise saving
  // an unrelated edit would quietly change what they are.
  const roles = rolesFor(bdmEnabled, member.role);
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const hasWork = work.total > 0;

  return (
    <form
      className="space-y-3"
      action={async (data) => {
        setPending(true);
        try {
          const result = await updateStaffAction(null, data);
          if (result.ok) {
            toast.success('Staff account updated.');
            router.refresh();
          } else toast.error(result.message);
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="user_id" value={member.id} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
        <Input name="full_name" defaultValue={member.full_name} required aria-label="Full name" />
        <Input name="mobile" defaultValue={member.mobile ?? ''} aria-label="Mobile" />
        <Select name="role" defaultValue={member.role} aria-label="Role">
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </Select>
      </div>

      {hasWork ? (
        <div className="rounded-lg border border-[--color-warn]/30 bg-[--color-warn-bg] p-3 text-xs text-ink-muted">
          <p className="font-semibold text-ink">Reassign active work before changing role or deactivating</p>
          <p className="mt-1">
            {work.assignedLeads} leads · {work.openFollowUps} follow-ups · {work.upcomingSiteVisits} visits ·{' '}
            {work.activeDesignProjects} designs · {work.openExecutionTasks} execution tasks
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox name="is_active" label="Active access" defaultChecked={member.is_active} />
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save user'}</Button>
      </div>
    </form>
  );
}

export function StaffDirectory({
  staff,
  bdmEnabled = false,
}: {
  staff: (ProfileRow & { activeWork: ActiveWorkCounts })[];
  bdmEnabled?: boolean;
}) {
  const pageSize = 10;
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(staff.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = staff.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <ul className="divide-y divide-line">
        {visible.map((member) => (
          <li key={member.id} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{member.full_name}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${member.is_active ? 'border-[--color-ok]/25 bg-[--color-ok-bg] text-[--color-ok]' : 'border-line bg-surface-muted text-ink-muted'}`}>
                {member.is_active ? 'Active' : 'Inactive'}
              </span>
              <span className="text-xs text-ink-muted">{member.email}</span>
            </div>
            <StaffEditor member={member} work={member.activeWork} bdmEnabled={bdmEnabled} />
          </li>
        ))}
      </ul>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2">
          <span className="text-xs text-ink-muted">Page {currentPage} of {totalPages} · {staff.length} staff</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
