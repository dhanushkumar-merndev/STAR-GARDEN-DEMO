'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Field, Input } from '@/components/ui';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { updateOwnProfileAction } from '@/server/actions/admin';
import type { ActionResult } from '@/lib/errors';

/** Self-service profile edit. Role and activation stay with the Admin (§7.1). */
export function ProfileForm({ fullName, mobile }: { fullName: string; mobile: string }) {
  const router = useRouter();
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await updateOwnProfileAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Profile updated.');
      router.refresh();
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <FormError result={result} />

      <PendingFieldset>
        <Field label="Full name" htmlFor="full_name" required error={fieldError(result, 'full_name')}>
          <Input id="full_name" name="full_name" defaultValue={fullName} required />
        </Field>

        <Field
          label="Mobile"
          htmlFor="mobile"
          hint="So colleagues can reach you about an assignment."
          error={fieldError(result, 'mobile')}
        >
          <Input id="mobile" name="mobile" type="tel" inputMode="tel" defaultValue={mobile} />
        </Field>
      </PendingFieldset>

      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}
