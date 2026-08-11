'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Checkbox, Input } from '@/components/ui';
import { FormError, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { upsertConfigOptionAction } from '@/server/actions/admin';
import type { ActionResult } from '@/lib/errors';
import type { ConfigOptionRow } from '@/types/database';

function useOptionForm() {
  const router = useRouter();
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function submit(formData: FormData, message: string) {
    const next = await upsertConfigOptionAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success(message);
      setResult(null);
      router.refresh();
    }
  }

  return { result, submit };
}

export function ConfigOptionRowForm({ option }: { option: ConfigOptionRow }) {
  const { result, submit } = useOptionForm();

  return (
    <form action={(formData) => submit(formData, 'Option saved.')} className="space-y-2">
      <input type="hidden" name="id" value={option.id} />
      <input type="hidden" name="group_key" value={option.group_key} />
      <FormError result={result} />

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_auto] sm:items-end">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink-muted">Value</span>
          <Input name="value" defaultValue={option.value} required aria-label="Value" />
        </label>

        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink-muted">Label shown to staff</span>
          <Input name="label" defaultValue={option.label} required aria-label="Label" />
        </label>

        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink-muted">Order</span>
          <Input
            name="sort_order"
            type="number"
            defaultValue={option.sort_order}
            aria-label="Sort order"
          />
        </label>

        <SubmitButton size="md" variant="secondary">
          Save
        </SubmitButton>
      </div>

      <Checkbox
        name="is_active"
        label="Active"
        hint="Inactive options stay on old records but are no longer offered."
        defaultChecked={option.is_active}
      />

      {fieldError(result, 'value') ? (
        <p className="text-xs text-danger">{fieldError(result, 'value')}</p>
      ) : null}
    </form>
  );
}

export function NewConfigOptionForm({ groupKey }: { groupKey: string }) {
  const { result, submit } = useOptionForm();
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await submit(formData, 'Option added.');
        formRef.current?.reset();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="group_key" value={groupKey} />
      <input type="hidden" name="is_active" value="on" />
      <FormError result={result} />

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_auto] sm:items-end">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink-muted">Value</span>
          <Input name="value" placeholder="OUT_OF_BUDGET" required aria-label="New value" />
        </label>

        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink-muted">Label</span>
          <Input name="label" placeholder="Out of budget" required aria-label="New label" />
        </label>

        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink-muted">Order</span>
          <Input name="sort_order" type="number" defaultValue={50} aria-label="New sort order" />
        </label>

        <SubmitButton size="md">Add</SubmitButton>
      </div>
    </form>
  );
}
