'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Field, Input } from '@/components/ui';
import { FormError, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { updateSettingAction } from '@/server/actions/admin';
import type { ActionResult } from '@/lib/errors';

/** One runtime setting, saved independently so a bad value blocks only itself. */
export function SettingForm({
  settingKey,
  label,
  hint,
  defaultValue,
  type = 'text',
}: {
  settingKey: string;
  label: string;
  hint?: string;
  defaultValue: string;
  type?: 'text' | 'number';
}) {
  const router = useRouter();
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await updateSettingAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Setting saved.');
      router.refresh();
    }
  }

  return (
    <form action={handleSubmit} className="space-y-2">
      <input type="hidden" name="key" value={settingKey} />
      <FormError result={result} />

      <Field label={label} htmlFor={settingKey} hint={hint} error={fieldError(result, 'value')}>
        <div className="flex gap-2">
          <Input
            id={settingKey}
            name="value"
            type={type}
            defaultValue={defaultValue}
            className="max-w-40"
          />
          <SubmitButton size="md" variant="secondary">
            Save
          </SubmitButton>
        </div>
      </Field>
    </form>
  );
}
