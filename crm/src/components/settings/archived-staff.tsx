'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LuArchive, LuChevronRight, LuUndo2 } from 'react-icons/lu';
import { Badge, Button } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { unarchiveStaffAction } from '@/server/actions/admin';
import type { ProfileRow, UserRole } from '@/types/database';

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  BDM: 'BDM',
  LANDSCAPER: 'Landscaper',
  EXECUTION: 'Execution Team',
  CLIENT: 'Client',
};

/**
 * The archive shelf (AGENTS.md §11.7).
 *
 * A row rather than a section: the staff list is the working surface, and
 * people who have been filed away should cost exactly one line of it until
 * someone actually goes looking. Same shape as "Deleted Leads" on the Settings
 * hub, so the two read as the same kind of thing — a drawer you open, not a
 * list you scroll past.
 */
export function ArchivedStaffSetting({ staff }: { staff: ProfileRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function unarchive(member: ProfileRow) {
    setPendingId(member.id);
    try {
      const result = await unarchiveStaffAction(member.id);
      if (result.ok) {
        toast.success(`${member.full_name} moved back to the staff list.`);
        router.refresh();
        // Closing the last row leaves an empty modal open over an empty card;
        // step back out instead.
        if (staff.length <= 1) setOpen(false);
      } else toast.error(result.message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-muted">
          <LuArchive className="size-5 shrink-0 text-ink-subtle" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Archived staff</span>
            <span className="block text-xs text-ink-muted">
              {staff.length === 0
                ? 'Nobody archived yet'
                : `${staff.length} ${staff.length === 1 ? 'person' : 'people'} filed away · restore any of them`}
            </span>
          </span>
          {staff.length > 0 ? <Badge tone="neutral">{staff.length}</Badge> : null}
          <LuChevronRight className="size-4 shrink-0 text-ink-subtle" />
        </button>
      </DialogTrigger>

      <DialogContent
        title="Archived staff"
        description="Hidden from the staff list. Restoring does not restore access."
        className="sm:max-w-2xl"
      >
        {staff.length === 0 ? (
          <p className="rounded-lg border border-line p-4 text-sm text-ink-muted">
            Nobody has been archived. Use <strong className="text-ink">Archive</strong> on a staff
            row to file someone away without deleting their history.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="divide-y divide-line rounded-lg border border-line">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{member.full_name}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {member.email ?? 'No email'}
                      {member.archived_at ? ` · archived ${formatDate(member.archived_at)}` : ''}
                    </p>
                  </div>
                  <Badge tone="neutral">{ROLE_LABELS[member.role] ?? member.role}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={pendingId !== null}
                    onClick={() => void unarchive(member)}
                  >
                    <LuUndo2 className="size-4" />
                    {pendingId === member.id ? 'Restoring…' : 'Unarchive'}
                  </Button>
                </div>
              ))}
            </div>

            <p className="text-xs text-ink-muted">
              An unarchived account returns to the staff list as{' '}
              <strong className="text-ink">Inactive</strong>. Tick “Active access” on their row to
              let them sign in again.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
