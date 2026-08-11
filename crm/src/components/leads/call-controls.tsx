'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Field, Input, Select, Textarea, Alert, Checkbox } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { logCallAction, recordCallAttemptAction } from '@/server/actions/leads';
import type { ActionResult } from '@/lib/errors';
import type { CallOutcome, LeadStatus } from '@/types/database';

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

const OUTCOMES: { value: CallOutcome; label: string; suggestsFollowUp: boolean }[] = [
  { value: 'CONNECTED', label: 'Connected', suggestsFollowUp: true },
  { value: 'INTERESTED', label: 'Interested', suggestsFollowUp: true },
  { value: 'CALL_LATER', label: 'Call later', suggestsFollowUp: true },
  { value: 'NO_ANSWER', label: 'No answer', suggestsFollowUp: true },
  { value: 'BUSY', label: 'Busy', suggestsFollowUp: true },
  { value: 'SWITCHED_OFF', label: 'Switched off', suggestsFollowUp: true },
  { value: 'NOT_INTERESTED', label: 'Not interested', suggestsFollowUp: false },
  { value: 'INVALID_NUMBER', label: 'Invalid number', suggestsFollowUp: false },
];

const STATUS_CHOICES: { value: LeadStatus | ''; label: string }[] = [
  { value: '', label: 'Leave unchanged' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'LOST', label: 'Lost' },
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
    // Fire-and-forget: the dialler must open immediately, and a slow network
    // must never stand between the BDM and the call.
    const formData = new FormData();
    formData.set('lead_id', leadId);

    startTransition(async () => {
      const result = await recordCallAttemptAction(formData);
      if (!result.ok) {
        toast.error('The call was not logged as an attempt. Record the outcome manually.');
      }
      router.refresh();
    });

    window.location.href = telHref;
  }

  return (
    <Button onClick={handleCall} size="lg" className="gap-2" disabled={pending}>
      <Phone className="size-4.5" />
      Call {displayNumber}
    </Button>
  );
}

export function LogCallDialog({
  leadId,
  currentStatus,
  lossReasons,
  trigger,
}: {
  leadId: string;
  currentStatus: LeadStatus;
  lossReasons: { value: string; label: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<CallOutcome>('CONNECTED');
  const [status, setStatus] = React.useState<string>('');
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  const selected = OUTCOMES.find((o) => o.value === outcome);
  const followUpRequired = outcome === 'CALL_LATER';

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
        title="Record call outcome"
        description="Tell the CRM what happened. It cannot detect this on its own."
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
              {OUTCOMES.map((o) => (
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

            <Field
              label="Next action"
              htmlFor="next_action"
              hint="A short description of what happens next."
              error={fieldError(result, 'next_action')}
            >
              <Input
                id="next_action"
                name="next_action"
                placeholder="Send quote for terrace garden"
              />
            </Field>

            <Field
              label={followUpRequired ? 'Call back on' : 'Follow-up date and time'}
              htmlFor="follow_up_at"
              required={followUpRequired}
              hint={
                selected?.suggestsFollowUp
                  ? 'Creates a dated follow-up that appears on your dashboard.'
                  : 'Optional.'
              }
              error={fieldError(result, 'follow_up_at')}
            >
              <Input
                id="follow_up_at"
                name="follow_up_at"
                type="datetime-local"
                required={followUpRequired}
              />
            </Field>

            <Field
              label="Preferred site visit date"
              htmlFor="preferred_site_visit_at"
              hint="If the customer suggested a date. Recorded as a note; schedule the visit separately."
              error={fieldError(result, 'preferred_site_visit_at')}
            >
              <Input
                id="preferred_site_visit_at"
                name="preferred_site_visit_at"
                type="datetime-local"
              />
            </Field>

            <Field label="Update lead stage" htmlFor="new_status" error={fieldError(result, 'new_status')}>
              <Select
                id="new_status"
                name="new_status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_CHOICES.filter(
                  (c) => c.value === '' || c.value !== currentStatus,
                ).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            {status === 'LOST' ? (
              <Field
                label="Reason for loss"
                htmlFor="lost_reason"
                required
                error={fieldError(result, 'lost_reason')}
              >
                <Select id="lost_reason" name="lost_reason" required defaultValue="">
                  <option value="" disabled>
                    Select a reason
                  </option>
                  {lossReasons.map((r) => (
                    <option key={r.value} value={r.label}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
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
