'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { createLeadAction } from '@/server/actions/leads';
import type { ActionResult } from '@/lib/errors';

/**
 * Manual lead form (AGENTS.md §8.1, §23.4).
 *
 * Duplicate handling is the interesting part. The server refuses a duplicate on
 * the first attempt and returns the matching lead; the form then shows who owns
 * it and offers two honest choices — open the existing lead, or state that this
 * really is a separate enquiry and continue. §8.1 forbids silently creating a
 * second record, and forbids a dead end too.
 */

interface DuplicateMeta {
  id: string;
  lead_code: string;
  customer_name: string;
  status: string;
  assigned_bdm_name: string | null;
}

export function NewLeadForm({
  bdms,
  canAssign,
  currentUserId,
}: {
  bdms: { id: string; full_name: string }[];
  canAssign: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);
  const [duplicate, setDuplicate] = React.useState<DuplicateMeta | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);

  async function handleSubmit(formData: FormData) {
    if (confirmed) formData.set('confirm_duplicate', 'true');

    const next = await createLeadAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success(`Lead ${next.data.leadCode} created.`);
      router.push(`/leads/${next.data.leadId}`);
      return;
    }

    if (next.code === 'DUPLICATE_LEAD' && next.meta?.duplicate) {
      setDuplicate(next.meta.duplicate as DuplicateMeta);
      return;
    }

    setDuplicate(null);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {duplicate ? (
        <Alert tone="warn" title="This number already exists">
          <p>
            <span className="font-medium">{duplicate.customer_name}</span> ({duplicate.lead_code})
            is already in the CRM
            {duplicate.assigned_bdm_name ? `, owned by ${duplicate.assigned_bdm_name}` : ' and unassigned'}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/leads/${duplicate.id}`}>
              <Button size="sm" variant="secondary">
                Open the existing lead
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirmed(true);
                toast.info('Submit again to create a separate lead.');
              }}
            >
              This is a different enquiry
            </Button>
          </div>
          {confirmed ? (
            <p className="mt-2 text-xs font-medium">
              Confirmed. Press &ldquo;Create lead&rdquo; again to save it as a separate record.
            </p>
          ) : null}
        </Alert>
      ) : null}

      <FormError result={duplicate ? null : result} />

      <PendingFieldset>
        <Field
          label="Customer name"
          htmlFor="customer_name"
          required
          error={fieldError(result, 'customer_name')}
        >
          <Input id="customer_name" name="customer_name" required autoComplete="name" autoFocus />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="mobile"
          required
          hint="10-digit Indian mobile, or include the country code."
          error={fieldError(result, 'mobile')}
        >
          <Input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            required
            placeholder="98450 12345"
            autoComplete="tel"
          />
        </Field>

        <Field label="Email" htmlFor="email" error={fieldError(result, 'email')}>
          <Input id="email" name="email" type="email" autoComplete="email" />
        </Field>

        <Field
          label="Area or locality"
          htmlFor="location_text"
          error={fieldError(result, 'location_text')}
        >
          <Input id="location_text" name="location_text" placeholder="Whitefield, Bengaluru" />
        </Field>

        <Field label="Site address" htmlFor="site_address" error={fieldError(result, 'site_address')}>
          <Textarea id="site_address" name="site_address" rows={2} />
        </Field>

        <Field
          label="What are they looking for?"
          htmlFor="requirement_summary"
          error={fieldError(result, 'requirement_summary')}
        >
          <Textarea
            id="requirement_summary"
            name="requirement_summary"
            rows={3}
            placeholder="Terrace garden for a 1200 sqft terrace, low maintenance."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Source" htmlFor="source" error={fieldError(result, 'source')}>
            <Select id="source" name="source" defaultValue="MANUAL">
              <option value="MANUAL">Manual / phone-in</option>
              <option value="WEBSITE">Website</option>
              <option value="META_FACEBOOK">Facebook</option>
              <option value="META_INSTAGRAM">Instagram</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field
            label="Next action"
            htmlFor="next_action_at"
            hint="When will you contact them?"
            error={fieldError(result, 'next_action_at')}
          >
            <Input id="next_action_at" name="next_action_at" type="datetime-local" />
          </Field>
        </div>

        {canAssign ? (
          <Field
            label="Assign to"
            htmlFor="assigned_bdm_id"
            hint="Leave blank to place it in the unassigned queue."
            error={fieldError(result, 'assigned_bdm_id')}
          >
            <Select id="assigned_bdm_id" name="assigned_bdm_id" defaultValue="">
              <option value="">Unassigned</option>
              {bdms.map((bdm) => (
                <option key={bdm.id} value={bdm.id}>
                  {bdm.full_name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="assigned_bdm_id" value={currentUserId} />
        )}
      </PendingFieldset>

      <div className="flex gap-2 pt-2">
        <SubmitButton pendingLabel="Creating…">Create lead</SubmitButton>
        <Link href="/leads">
          <Button variant="ghost">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}
