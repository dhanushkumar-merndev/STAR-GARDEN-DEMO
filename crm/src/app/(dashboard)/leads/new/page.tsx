import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import { listAssignableBdms } from '@/server/services/leads';
import { Button, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { NewLeadForm } from '@/components/leads/new-lead-form';

export const metadata: Metadata = { title: 'New lead' };

/**
 * Manual lead creation (AGENTS.md §11.3, §23.3).
 *
 * The duplicate check happens on submit rather than as-you-type: §8.1 requires
 * a clear warning with an approved path forward, and that is a decision the BDM
 * makes once with the full picture, not a nag on every keystroke.
 */
export default async function NewLeadPage() {
  const user = await requirePageRole('ADMIN', 'BDM');
  const bdms = user.isAdmin ? await listAssignableBdms() : [];

  return (
    <>
      <PageHeader
        title="New lead"
        subtitle="Capture an enquiry that came in by phone, walk-in or referral."
        action={
          <Link href="/leads">
            <Button variant="ghost">Cancel</Button>
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="Customer details"
          description="Mobile number is how duplicates are detected."
        />
        <CardBody>
          <NewLeadForm bdms={bdms} canAssign={user.isAdmin} currentUserId={user.id} />
        </CardBody>
      </Card>
    </>
  );
}
