'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/ui';
import { Alert } from '@/components/ui';
import type { ActionResult } from '@/lib/errors';

/**
 * Form plumbing shared by every dialog and page form.
 *
 * §16 asks for understandable errors and visible progress. `useFormStatus` gives
 * a pending state without any client state of our own, and `FormError` renders
 * whatever the Server Action returned — including the field-keyed messages the
 * Zod schemas produce.
 */

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? (pendingLabel ?? 'Saving…') : children}
    </Button>
  );
}

/** Top-of-form error. Field-level messages are rendered by `fieldError`. */
export function FormError({ result }: { result: ActionResult<unknown> | null }) {
  if (!result || result.ok) return null;

  return (
    <Alert tone="danger" title="Could not save">
      {result.message}
    </Alert>
  );
}

export function fieldError(result: ActionResult<unknown> | null, field: string): string | undefined {
  if (!result || result.ok) return undefined;
  return result.fields?.[field];
}

/** Disables a whole fieldset while the form is in flight. */
export function PendingFieldset({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
      {children}
    </fieldset>
  );
}
