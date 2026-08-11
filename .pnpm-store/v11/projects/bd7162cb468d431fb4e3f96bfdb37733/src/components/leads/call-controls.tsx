'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuPhone } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button, Field, Select, Textarea, Alert, Checkbox } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { logCallAction, recordCallAttemptAction } from '@/server/actions/leads';
import type { ActionResult } from '@/lib/errors';
import type { CallOutcome } from '@/types/database';

/**
 * Call Activity and Follow-up Management (AGENTS.md §6).
 *
 * Note the name: this is NOT telephony integration. There is no virtual number,
 * no API, no recording. Tapping "Call" opens the device dialler with a `tel:`
 * link so the call goes out over the employee's own SIM (§6.1), and the CRM
 * records only that the dialler was opened — never that a call connected, how
 * long it ran, or what was said (§6.3).
 *
 * Everything the CRM knows about the call afterwards is what the BDM types in.
 */

const OTHER_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'NO_ANSWER', label: 'No answer' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'SWITCHED_OFF', label: 'Switched off' },
  { value: 'INVALID_NUMBER', label: 'Invalid number' },
];

export function CallCustomerButton({
  leadId,
  telHref,
  displayNumber,
}: {
  leadId: string;
  telHref: string;
  displayNumber: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function handleCall() {
    // Save the attempt before navigating to `tel:`. Navigating first can abort
    // the Server Action on some browsers, leaving an unassigned lead unclaimed.
    // This request is small; the dialler still opens immediately afterwards.
    const formData = new FormData();
    formData.set('lead_id', leadId);

    startTransition(async () => {
      const result = await recordCallAttemptAction(formData);
      if (!result.ok) {
        toast.error('The call was not logged as an attempt. Record the outcome manually.');
      }
      router.refresh();
      window.location.href = telHref;
    });
  }

  return (
    <Button onClick={handleCall} size="lg" className="gap-2" disabled={pending}>
      <LuPhone className="size-4.5" />
      Call {displayNumber}
    </Button>
  );
}

export function LogCallDialog({
  leadId,
  trigger,
}: {
  leadId: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<CallOutcome>('NO_ANSWER');
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await logCallAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Call outcome recorded.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="secondary">Record call outcome</Button>}
      </DialogTrigger>

      <DialogContent
        title="Other call outcome"
        description="Use this only when the customer could not be reached. To set a reminder, use Create follow-up below."
      >
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="lead_id" value={leadId} />

          <FormError result={result} />

          <Field label="Outcome" htmlFor="outcome" required error={fieldError(result, 'outcome')}>
            <Select
              id="outcome"
              name="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CallOutcome)}
              required
            >
              {OTHER_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <PendingFieldset>
            <Field label="Notes" htmlFor="notes" error={fieldError(result, 'notes')}>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="What did the customer say? Requirements, budget, timeline…"
              />
            </Field>

          </PendingFieldset>

          <Alert tone="neutral">
            The CRM records what you enter here. It does not know whether the call connected, how
            long it lasted, or what was said.
          </Alert>

          <div className="flex gap-2 pt-1">
            <SubmitButton fullWidth pendingLabel="Recording…">
              Save outcome
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddNoteDialog({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const { addNoteAction } = await import('@/server/actions/leads');
    const next = await addNoteAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Note added.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add note</Button>
      </DialogTrigger>
      <DialogContent title="Add a note">
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="lead_id" value={leadId} />
          <FormError result={result} />
          <Field label="Note" htmlFor="notes" required error={fieldError(result, 'notes')}>
            <Textarea id="notes" name="notes" rows={4} required autoFocus />
          </Field>
          <SubmitButton fullWidth>Save note</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MarkDesignRequiredForm({
  leadId,
  designRequired,
}: {
  leadId: string;
  designRequired: boolean;
}) {
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    const { setDesignRequiredAction } = await import('@/server/actions/leads');
    const result = await setDesignRequiredAction(null, formData);
    if (result.ok) {
      toast.success(
        formData.get('design_required') ? 'Marked as needing a design.' : 'Design no longer required.',
      );
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <Checkbox
        name="design_required"
        label="Landscape design is required"
        hint="Marks this lead ready for a designer to be assigned."
        defaultChecked={designRequired}
      />
      <SubmitButton size="sm" variant="secondary">
        Save
      </SubmitButton>
    </form>
  );
}
