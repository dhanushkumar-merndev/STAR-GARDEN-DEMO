import type { Metadata } from 'next';
import { requirePageUser, ROLE_LABELS } from '@/lib/auth/session';
import { signOutAction } from '@/server/actions/auth';
import { Badge, Button, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { ProfileForm } from '@/components/settings/profile-form';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Your profile' };

/** Profile and sign-out (AGENTS.md §11.2). */
export default async function ProfilePage() {
  const user = await requirePageUser();

  return (
    <>
      <PageHeader title="Your profile" subtitle={ROLE_LABELS[user.role]} />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Account" description="Signed in with Google" />
          <CardBody className="space-y-2 text-sm">
            <p>
              <span className="text-ink-muted">Email: </span>
              <span className="font-medium text-ink">{user.email ?? '—'}</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-ink-muted">Role:</span>
              <Badge tone="brand">{ROLE_LABELS[user.role]}</Badge>
            </p>
            {user.profile.last_login_at ? (
              <p>
                <span className="text-ink-muted">Last sign-in: </span>
                {formatDateTime(user.profile.last_login_at)}
              </p>
            ) : null}
            <p className="pt-2 text-xs text-ink-subtle">
              Your role and access are managed by an Admin. There is no password on this account —
              sign-in always goes through Google.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your details" description="Visible to colleagues on assignments." />
          <CardBody>
            <ProfileForm
              fullName={user.profile.full_name}
              mobile={user.profile.mobile ?? ''}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
