'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { updateLeadAction } from '@/server/actions/leads';
import { formatMobile } from '@/lib/utils/phone';
import { toDateTimeLocalValue } from '@/lib/utils/format';
import type { ActionResult } from '@/lib/errors';
import type { LeadRow } from '@/types/database';

export function EditLeadForm({ lead }: { lead: LeadRow }) {
  const router = useRouter();
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await updateLeadAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Lead updated.');
      router.push(`/leads/${lead.id}`);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="lead_id" value={lead.id} />
      <FormError result={result} />

      <PendingFieldset>
        <Field
          label="Customer name"
          htmlFor="customer_name"
          required
          error={fieldError(result, 'customer_name')}
        >
          <Input id="customer_name" name="customer_name" defaultValue={lead.customer_name} required />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="mobile"
          required
          hint="Changing this re-runs duplicate detection on the next save."
          error={fieldError(result, 'mobile')}
        >
          <Input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            required
            defaultValue={formatMobile(lead.mobile_country_code, lead.mobile_normalized)}
          />
        </Field>

        <Field label="Email" htmlFor="email" error={fieldError(result, 'email')}>
          <Input id="email" name="email" type="email" defaultValue={lead.email ?? ''} />
        </Field>

        <Field label="Area or locality" htmlFor="location_text">
          <Input id="location_text" name="location_text" defaultValue={lead.location_text ?? ''} />
        </Field>

        <Field label="Site address" htmlFor="site_address">
          <Textarea id="site_address" name="site_address" rows={2} defaultValue={lead.site_address ?? ''} />
        </Field>

        <Field label="Requirement" htmlFor="requirement_summary">
          <Textarea
            id="requirement_summary"
            name="requirement_summary"
            rows={4}
            defaultValue={lead.requirement_summary ?? ''}
          />
        </Field>

        <Field label="Next action" htmlFor="next_action_at">
          <Input
            id="next_action_at"
            name="next_action_at"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(lead.next_action_at)}
          />
        </Field>
      </PendingFieldset>

      <div className="flex gap-2">
        <SubmitButton>Save changes</SubmitButton>
        <Link href={`/leads/${lead.id}`}>
          <Button variant="ghost">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}
