import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import { listAccessRequests, listInvites, listStaffWithActiveWork } from '@/server/services/users';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { InviteStaffForm, StaffDirectory } from '@/components/settings/user-admin';

export const metadata: Metadata = { title: 'Users and roles' };

export default async function UsersPage() {
  const user = await requirePageRole('ADMIN');
  const [staff, invites, requests] = await Promise.all([
    listStaffWithActiveWork(user),
    listInvites(user),
    listAccessRequests(user),
  ]);

  return (
    <>
      <div className="mb-2"><Link href="/settings" className="text-sm text-ink-muted hover:text-ink">← Settings</Link></div>
      <PageHeader title="Users and roles" subtitle="Google-only access with an explicit allowlist" />
      <div className="space-y-4">
        <Card><CardHeader title="Add staff access" description="They must sign in with this exact Google address." /><CardBody><InviteStaffForm /></CardBody></Card>

        {requests.length ? <Card><CardHeader title="Access requests" description="These accounts signed in without an invite and cannot read CRM data." /><ul className="divide-y divide-line">{requests.map((request) => <li key={request.id} className="flex items-center gap-2 px-4 py-3"><Badge tone="warn">No access</Badge><span className="text-sm font-medium">{request.full_name}</span><span className="text-sm text-ink-muted">{request.email}</span></li>)}</ul></Card> : null}

        <Card><CardHeader title="Staff" description="Role changes and deactivation are blocked until active work is reassigned." />{staff.length === 0 ? <EmptyState title="No staff accounts" /> : <StaffDirectory staff={staff} />}</Card>

        <Card><CardHeader title="Invite history" />{invites.length === 0 ? <EmptyState title="No invites" /> : <ul className="divide-y divide-line">{invites.map((invite) => <li key={invite.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"><span className="font-medium text-ink">{invite.full_name}</span><span className="text-ink-muted">{invite.email}</span><Badge tone={invite.accepted_at ? 'ok' : 'info'}>{invite.accepted_at ? 'Accepted' : 'Pending'}</Badge></li>)}</ul>}</Card>
      </div>
    </>
  );
}
