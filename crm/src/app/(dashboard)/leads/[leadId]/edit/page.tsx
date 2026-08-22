import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageRole } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { assertCanWriteLead } from '@/lib/permissions/guards';
import { Button, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { EditLeadForm } from '@/components/leads/edit-lead-form';

export const metadata: Metadata = { title: 'Edit lead' };

/** Edit a lead (AGENTS.md §11.3). Write access is re-checked server-side (§7.5). */
export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const user = await requirePageRole('SUPER_ADMIN', 'ADMIN', 'BDM');

  let lead;
  try {
    lead = await assertCanWriteLead(user, leadId);
  } catch (error) {
    if (error instanceof AppError && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')) {
      notFound();
    }
    throw error;
  }

  return (
    <>
      <PageHeader
        title="Edit lead"
        subtitle={`${lead.lead_code} · ${lead.customer_name}`}
        action={
          <Link href={`/leads/${lead.id}`}>
            <Button variant="ghost">Cancel</Button>
          </Link>
        }
      />

      <Card>
        <CardHeader title="Customer details" />
        <CardBody>
          <EditLeadForm lead={lead} />
        </CardBody>
      </Card>
    </>
  );
}
