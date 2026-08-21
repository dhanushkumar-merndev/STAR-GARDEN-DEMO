'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LuArchive } from 'react-icons/lu';
import { Button, Checkbox, Input, Select } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/dialog';
import { archiveStaffAction, inviteStaffAction, updateStaffAction } from '@/server/actions/admin';
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

/**
 * Archive is a confirmed action, not a checkbox (§16).
 *
 * It is reversible — the archive modal in Settings hands the row back — but it
 * also revokes access on the way out, so it gets the same "are you sure" as
 * every other handoff-shaped decision in the CRM.
 *
 * The button is disabled rather than hidden when it cannot be used: an Admin
 * looking for it needs to see *why* it is unavailable, which is what the
 * active-work panel directly above already explains.
 */
function ArchiveStaffButton({
  member,
  blocked,
  isSelf,
}: {
  member: ProfileRow;
  blocked: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const reason = isSelf
    ? 'You cannot archive your own account.'
    : blocked
      ? 'Reassign their active work first.'
      : undefined;

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-ink-muted"
      disabled={blocked || pending}
      title={reason}
    >
      <LuArchive className="size-4" />
      {pending ? 'Archiving…' : 'Archive'}
    </Button>
  );

  // A disabled trigger inside a Radix `DialogTrigger asChild` still receives
  // the click handler but never fires it; rendering the bare button keeps the
  // tooltip working without an inert dialog attached to it.
  if (blocked) return trigger;

  return (
    <ConfirmDialog
      trigger={trigger}
      title={`Archive ${member.full_name}?`}
      description="They lose access immediately and disappear from the staff list."
    >
      {(close) => (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Their history stays intact — leads, calls, visits and the audit trail are unchanged.
            You can bring them back from <strong className="text-ink">Archived staff</strong> at any
            time, though access has to be granted again separately.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  const result = await archiveStaffAction(member.id);
                  if (result.ok) {
                    toast.success(`${member.full_name} archived.`);
                    close();
                    router.refresh();
                  } else toast.error(result.message);
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? 'Archiving…' : 'Archive'}
            </Button>
          </div>
        </div>
      )}
    </ConfirmDialog>
  );
}

export function StaffEditor({
  member,
  work,
  bdmEnabled = false,
  isSelf = false,
}: {
  member: ProfileRow;
  work: ActiveWorkCounts;
  bdmEnabled?: boolean;
  isSelf?: boolean;
}) {
  // Their current role is always offered, even a hidden one — otherwise saving
  // an unrelated edit would quietly change what they are.
  const roles = rolesFor(bdmEnabled, member.role);
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const hasWork = work.total > 0;

  /**
   * Controlled, not `defaultValue`.
   *
   * An uncontrolled field takes its default once, at mount. After a save the
   * server sends the updated row down, but React keeps the existing DOM node
   * and its old value — so the row went on showing the previous role until a
   * hard reload. Holding the values in state, with `StaffDirectory` keying this
   * component on the saved row, means fresh server data always wins.
   */
  const [form, setForm] = React.useState({
    full_name: member.full_name,
    mobile: member.mobile ?? '',
    role: member.role,
    is_active: member.is_active,
  });

  const dirty =
    form.full_name !== member.full_name ||
    form.mobile !== (member.mobile ?? '') ||
    form.role !== member.role ||
    form.is_active !== member.is_active;

  const nameMissing = form.full_name.trim() === '';

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
        <Input
          name="full_name"
          value={form.full_name}
          onChange={(event) => setForm((state) => ({ ...state, full_name: event.target.value }))}
          required
          aria-label="Full name"
        />
        <Input
          name="mobile"
          value={form.mobile}
          onChange={(event) => setForm((state) => ({ ...state, mobile: event.target.value }))}
          aria-label="Mobile"
        />
        <Select
          name="role"
          value={form.role}
          onChange={(event) => setForm((state) => ({ ...state, role: event.target.value as UserRole }))}
          aria-label="Role"
        >
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
        <Checkbox
          name="is_active"
          label="Active access"
          checked={form.is_active}
          onChange={(event) => setForm((state) => ({ ...state, is_active: event.target.checked }))}
        />
        <div className="flex items-center gap-3">
          {dirty && !pending ? (
            <span className="text-xs text-ink-muted">Unsaved changes</span>
          ) : null}
          <ArchiveStaffButton member={member} blocked={hasWork || isSelf} isSelf={isSelf} />
          {/* Nothing to save is not an error worth a toast — the button simply
              has no work to do until something differs from the saved row. */}
          <Button type="submit" variant="secondary" disabled={pending || !dirty || nameMissing}>
            {pending ? 'Saving…' : 'Save user'}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function StaffDirectory({
  staff,
  bdmEnabled = false,
  currentUserId,
}: {
  staff: (ProfileRow & { activeWork: ActiveWorkCounts })[];
  bdmEnabled?: boolean;
  currentUserId: string;
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
            {/* Keyed on the saved values, not just the id: when a save lands
                and the server sends the row back changed, the key changes and
                the editor remounts around the new data. Typing does not remount
                it — the server row is unchanged until a save succeeds. */}
            <StaffEditor
              key={`${member.id}:${member.role}:${member.full_name}:${member.mobile ?? ''}:${member.is_active}`}
              member={member}
              work={member.activeWork}
              bdmEnabled={bdmEnabled}
              isSelf={member.id === currentUserId}
            />
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
