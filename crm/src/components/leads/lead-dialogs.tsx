'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { assignLeadAction, changeLeadStatusAction } from '@/server/actions/leads';
import {
  assignDesignerAction,
  createExecutionProjectAction,
  createFollowUpAction,
  scheduleSiteVisitAction,
  startDesignFromVisitAction,
} from '@/server/actions/workflow';
import type { ActionResult } from '@/lib/errors';
import type { LeadStatus } from '@/types/database';

/**
 * Dialogs on the lead detail screen (AGENTS.md §11.3).
 *
 * All follow the same shape: a trigger button, a form posting to a Server
 * Action, and a result that either closes the dialog or renders field errors in
 * place. Handoff dialogs (designer, execution) restate what is about to happen
 * before confirming, per §16.
 */

type Person = { id: string; full_name: string };

function useDialogForm(onDone?: () => void, defaultOpen = false) {
  const router = useRouter();
  const [open, setOpen] = React.useState(defaultOpen);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  const run = React.useCallback(
    async (
      action: (prev: unknown, formData: FormData) => Promise<ActionResult<unknown>>,
      formData: FormData,
      successMessage: string,
    ) => {
      const next = await action(null, formData);
      setResult(next);

      if (next.ok) {
        toast.success(successMessage);
        setOpen(false);
        setResult(null);
        onDone?.();
        router.refresh();
      }
    },
    [onDone, router],
  );

  return { open, setOpen, result, run };
}

/* -------------------------------------------------------------------------- */
/* Assignment (§7.1)                                                           */
/* -------------------------------------------------------------------------- */

export function AssignLeadDialog({
  leadId,
  bdms,
  currentOwnerId,
}: {
  leadId: string;
  bdms: Person[];
  currentOwnerId: string | null;
}) {
  const { open, setOpen, result, run } = useDialogForm();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {currentOwnerId ? 'Reassign' : 'Assign'}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={currentOwnerId ? 'Reassign this lead' : 'Assign this lead'}
        description="The new owner is notified immediately."
      >
        <form
          action={(formData) => run(assignLeadAction, formData, 'Lead assigned.')}
          className="space-y-4"
        >
          <input type="hidden" name="lead_id" value={leadId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field label="Assign to" htmlFor="to_user_id" required error={fieldError(result, 'to_user_id')}>
              <Select id="to_user_id" name="to_user_id" required defaultValue={currentOwnerId ?? ''}>
                <option value="" disabled>
                  Select an owner
                </option>
                {bdms.map((bdm) => (
                  <option key={bdm.id} value={bdm.id}>
                    {bdm.full_name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Reason" htmlFor="reason" hint="Recorded in the assignment history.">
              <Input id="reason" name="reason" placeholder="Covering while Bharat is on leave" />
            </Field>
          </PendingFieldset>

          <SubmitButton fullWidth>Assign lead</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export function ChangeStatusDialog({
  leadId,
  currentStatus,
  lossReasons,
}: {
  leadId: string;
  currentStatus: LeadStatus;
  lossReasons: { value: string; label: string }[];
}) {
  const { open, setOpen, result, run } = useDialogForm();
  const [status, setStatus] = React.useState<string>(currentStatus);

  const options: { value: LeadStatus; label: string }[] = [
    { value: 'CONTACTED', label: 'Contacted' },
    { value: 'FOLLOW_UP', label: 'Follow-up' },
    { value: 'SITE_VISIT_SCHEDULED', label: 'Visit scheduled' },
    { value: 'SITE_VISIT_COMPLETED', label: 'Visit completed' },
    { value: 'QUALIFIED', label: 'Qualified' },
    { value: 'LOST', label: 'Lost' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Change stage
        </Button>
      </DialogTrigger>
      <DialogContent title="Change lead stage">
        <form
          action={(formData) => run(changeLeadStatusAction, formData, 'Stage updated.')}
          className="space-y-4"
        >
          <input type="hidden" name="lead_id" value={leadId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field label="New stage" htmlFor="status" required error={fieldError(result, 'status')}>
              <Select
                id="status"
                name="status"
                required
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            {status === 'LOST' ? (
              <Field
                label="Reason"
                htmlFor="lost_reason"
                required
                error={fieldError(result, 'lost_reason')}
              >
                <Select id="lost_reason" name="lost_reason" required defaultValue="">
                  <option value="" disabled>
                    Select a reason
                  </option>
                  {lossReasons.map((reason) => (
                    <option key={reason.value} value={reason.label}>
                      {reason.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label="Note" htmlFor="note" hint="Added to the timeline.">
              <Textarea id="note" name="note" rows={2} />
            </Field>
          </PendingFieldset>

          <SubmitButton fullWidth>Update stage</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Follow-up                                                                   */
/* -------------------------------------------------------------------------- */

export function CreateFollowUpDialog({
  leadId,
  assignees,
  canAssign,
}: {
  leadId: string;
  assignees: Person[];
  canAssign: boolean;
}) {
  /**
   * `?new=1` opens this straight away.
   *
   * It is how the "Add follow-up" tile on the call screen reaches a dialog that
   * lives on another tab — one navigation, and the form is already up. Read
   * once, as the initial state, so closing the dialog does not fight the URL.
   */
  const searchParams = useSearchParams();
  const router = useRouter();
  const { open, setOpen, result, run } = useDialogForm(undefined, searchParams.get('new') === '1');

  function handleOpenChange(next: boolean) {
    setOpen(next);

    // Drop the flag once it has been consumed, or a refresh — or the back
    // button — would reopen a dialog the user has just dismissed.
    if (!next && searchParams.get('new') === '1') {
      const query = new URLSearchParams(searchParams.toString());
      query.delete('new');
      router.replace(`/leads/${leadId}?${query.toString()}`, { scroll: false });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add follow-up
        </Button>
      </DialogTrigger>
      <DialogContent title="New follow-up" description="Appears on the dashboard and sends a reminder.">
        <form
          action={(formData) => run(createFollowUpAction, formData, 'Follow-up created.')}
          className="space-y-4"
        >
          <input type="hidden" name="lead_id" value={leadId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field label="What needs doing?" htmlFor="title" required error={fieldError(result, 'title')}>
              <Input id="title" name="title" required placeholder="Send the terrace quote" autoFocus />
            </Field>

            <Field label="Due" htmlFor="due_at" required error={fieldError(result, 'due_at')}>
              <Input id="due_at" name="due_at" type="datetime-local" required />
            </Field>

            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} />
            </Field>

            {canAssign && assignees.length > 0 ? (
              <Field label="Assign to" htmlFor="assigned_to" hint="Defaults to the lead owner.">
                <Select id="assigned_to" name="assigned_to" defaultValue="">
                  <option value="">Lead owner</option>
                  {assignees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </PendingFieldset>

          <SubmitButton fullWidth>Create follow-up</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Site visit (§8.3)                                                           */
/* -------------------------------------------------------------------------- */

export function ScheduleVisitDialog({
  leadId,
  designers,
  defaultAddress,
  triggerLabel = 'Schedule visit',
}: {
  leadId: string;
  designers: Person[];
  defaultAddress: string | null;
  triggerLabel?: string;
}) {
  const { open, setOpen, result, run } = useDialogForm();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent title="Schedule a site visit">
        <form
          action={(formData) => run(scheduleSiteVisitAction, formData, 'Site visit scheduled.')}
          className="space-y-4"
        >
          <input type="hidden" name="lead_id" value={leadId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field
              label="Date and time"
              htmlFor="scheduled_start_at"
              required
              error={fieldError(result, 'scheduled_start_at')}
            >
              <Input id="scheduled_start_at" name="scheduled_start_at" type="datetime-local" required />
            </Field>

            <Field
              label="Site address"
              htmlFor="address"
              required
              error={fieldError(result, 'address')}
            >
              <Textarea id="address" name="address" rows={2} required defaultValue={defaultAddress ?? ''} />
            </Field>

            <Field label="Map link" htmlFor="map_url" hint="Paste a Google Maps link if you have one.">
              <Input id="map_url" name="map_url" type="url" placeholder="https://maps.app.goo.gl/…" />
            </Field>

            {designers.length > 0 ? (
              <Field
                label="Landscape Designer visiting the site"
                htmlFor="designer_id"
                required
                error={fieldError(result, 'designer_id')}
                hint="After the Admin approves the visit, this same designer automatically receives the design task and requirement."
              >
                <Select id="designer_id" name="designer_id" defaultValue="" required>
                  <option value="" disabled>
                    Choose a designer
                  </option>
                  {designers.map((designer) => (
                    <option key={designer.id} value={designer.id}>
                      {designer.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              // Hiding the field here would let the form submit and fail server
              // validation with nothing on screen to act on.
              <Alert tone="warn" title="No landscape designer available">
                A visit needs a designer to attend. Add one under Settings → Users
                and access, then schedule the visit.
              </Alert>
            )}

            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} placeholder="Gate code, parking, who to ask for…" />
            </Field>
          </PendingFieldset>

          <SubmitButton fullWidth disabled={designers.length === 0}>
            Schedule visit
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Design handoff (§8.4)                                                       */
/* -------------------------------------------------------------------------- */

export function AssignDesignerDialog({
  leadId,
  designers,
  currentDesignerId,
  defaultRequirement,
}: {
  leadId: string;
  designers: Person[];
  currentDesignerId: string | null;
  defaultRequirement: string | null;
}) {
  const { open, setOpen, result, run } = useDialogForm();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={currentDesignerId ? 'outline' : 'primary'}>
          {currentDesignerId ? 'Change designer' : 'Assign designer'}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Assign a landscape designer"
        description="They are notified and can see the requirement, site details and visit notes."
      >
        <form
          action={(formData) => run(assignDesignerAction, formData, 'Designer assigned.')}
          className="space-y-4"
        >
          <input type="hidden" name="lead_id" value={leadId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field
              label="Designer"
              htmlFor="designer_id"
              required
              error={fieldError(result, 'designer_id')}
            >
              <Select
                id="designer_id"
                name="designer_id"
                required
                defaultValue={currentDesignerId ?? ''}
              >
                <option value="" disabled>
                  Select a designer
                </option>
                {designers.map((designer) => (
                  <option key={designer.id} value={designer.id}>
                    {designer.full_name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="What should they design?"
              htmlFor="requirement_notes"
              error={fieldError(result, 'requirement_notes')}
            >
              <Textarea
                id="requirement_notes"
                name="requirement_notes"
                rows={4}
                defaultValue={defaultRequirement ?? ''}
              />
            </Field>

            <Field label="Due by" htmlFor="due_at" hint="Drives the reminder before the deadline.">
              <Input id="due_at" name="due_at" type="datetime-local" />
            </Field>
          </PendingFieldset>

          <SubmitButton fullWidth>Assign designer</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One-click recovery for older completed visits. No second designer picker. */
export function StartDesignFromVisitButton({
  leadId,
  designerName,
}: {
  leadId: string;
  designerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function startDesign() {
    const formData = new FormData();
    formData.set('lead_id', leadId);

    startTransition(() => {
      void startDesignFromVisitAction(null, formData).then((result) => {
        if (result.ok) {
          toast.success(`${designerName} has been assigned and notified.`);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      });
    });
  }

  return (
    <Button size="sm" onClick={startDesign} disabled={pending}>
      {pending ? 'Starting design…' : `Start design with ${designerName}`}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Execution handoff (§8.5)                                                    */
/* -------------------------------------------------------------------------- */

export function StartExecutionDialog({
  leadId,
  approvedVersions,
  executionStaff,
  triggerLabel = 'Start execution',
}: {
  leadId: string;
  approvedVersions: { id: string; version_number: number; version_note: string | null }[];
  executionStaff: Person[];
  triggerLabel?: string;
}) {
  const { open, setOpen, result, run } = useDialogForm();

  if (approvedVersions.length === 0) {
    return (
      <Alert tone="neutral">
        Execution can only start once a design version has been approved.
      </Alert>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent
        title="Hand over to execution"
        description="The project is locked to the exact approved design version you pick here."
      >
        <form
          action={(formData) => run(createExecutionProjectAction, formData, 'Execution project created.')}
          className="space-y-4"
        >
          <input type="hidden" name="lead_id" value={leadId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field
              label="Approved design version"
              htmlFor="approved_design_version_id"
              required
              error={fieldError(result, 'approved_design_version_id')}
            >
              <Select
                id="approved_design_version_id"
                name="approved_design_version_id"
                required
                defaultValue={approvedVersions[0]?.id ?? ''}
              >
                {approvedVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version_number}
                    {version.version_note ? ` — ${version.version_note.slice(0, 50)}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Project title" htmlFor="title">
              <Input id="title" name="title" placeholder="Ramesh Kumar — terrace garden" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Planned start" htmlFor="planned_start_at">
                <Input id="planned_start_at" name="planned_start_at" type="datetime-local" />
              </Field>
              <Field label="Target completion" htmlFor="due_at">
                <Input id="due_at" name="due_at" type="datetime-local" />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink">Assign to</legend>
              <div className="space-y-1 rounded-lg border border-line p-3">
                {executionStaff.length === 0 ? (
                  <p className="text-sm text-ink-muted">No active execution staff yet.</p>
                ) : (
                  executionStaff.map((person) => (
                    <Checkbox
                      key={person.id}
                      name="assignee_ids"
                      value={person.id}
                      label={person.full_name}
                    />
                  ))
                )}
              </div>
            </fieldset>

            <Checkbox
              name="use_template"
              label="Create the standard task checklist"
              hint="Site prep, materials, waterproofing, drainage, planting, handover…"
              defaultChecked
            />
          </PendingFieldset>

          <Alert tone="warn">
            Once created, this project references the selected version permanently. Later design
            changes do not flow through to it.
          </Alert>

          <SubmitButton fullWidth>Create execution project</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
