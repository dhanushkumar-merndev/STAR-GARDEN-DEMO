'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Alert, Button, Field, Textarea } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FormError, SubmitButton, fieldError } from '@/components/forms/form-parts';
import {
  approveVersionAction,
  markVersionReadyAction,
  requestRevisionAction,
} from '@/server/actions/workflow';
import type { ActionResult } from '@/lib/errors';
import type { DesignVersionStatus } from '@/types/database';

/**
 * Review controls for one design version (AGENTS.md §8.4 steps 5–9).
 *
 * Approval is irreversible in practice — it becomes the version execution
 * builds from — so it goes behind a confirmation that says exactly that (§16).
 */
export function DesignVersionActions({
  versionId,
  versionNumber,
  status,
  canSubmit,
  canReview,
  isOwnUpload,
  isAdmin,
}: {
  versionId: string;
  versionNumber: number;
  status: DesignVersionStatus;
  canSubmit: boolean;
  canReview: boolean;
  isOwnUpload: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const awaitingReview = status === 'READY_FOR_REVIEW';
  const submittable = canSubmit && (status === 'DRAFT' || status === 'REVISION_REQUESTED');

  // §7.3 / migration 07: a designer cannot sign off their own upload.
  const reviewable = canReview && awaitingReview && (!isOwnUpload || isAdmin);

  function submitForReview() {
    const formData = new FormData();
    formData.set('design_version_id', versionId);

    startTransition(async () => {
      const result = await markVersionReadyAction(null, formData);
      if (result.ok) {
        toast.success(`Version ${versionNumber} sent for review.`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  if (!submittable && !reviewable) {
    if (canReview && awaitingReview && isOwnUpload && !isAdmin) {
      return (
        <Alert tone="neutral">
          You uploaded this version, so someone else must review it.
        </Alert>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {submittable ? (
        <Button size="sm" onClick={submitForReview} disabled={pending}>
          {pending ? 'Submitting…' : 'Mark ready for review'}
        </Button>
      ) : null}

      {reviewable ? (
        <>
          <RequestRevisionDialog versionId={versionId} versionNumber={versionNumber} />
          <ApproveDialog versionId={versionId} versionNumber={versionNumber} />
        </>
      ) : null}
    </div>
  );
}

function RequestRevisionDialog({
  versionId,
  versionNumber,
}: {
  versionId: string;
  versionNumber: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await requestRevisionAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Revision requested.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Request revision
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Request a revision on version ${versionNumber}`}
        description="The designer uploads a new version; this one stays as history."
      >
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="design_version_id" value={versionId} />
          <FormError result={result} />

          <Field
            label="What needs to change?"
            htmlFor="revision_notes"
            required
            error={fieldError(result, 'revision_notes')}
          >
            <Textarea
              id="revision_notes"
              name="revision_notes"
              rows={4}
              required
              autoFocus
              placeholder="Move the seating away from the water tank; customer wants more planting along the west parapet."
            />
          </Field>

          <SubmitButton fullWidth variant="outline">
            Send back for revision
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ versionId, versionNumber }: { versionId: string; versionNumber: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await approveVersionAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success(`Version ${next.data.versionNumber} approved.`);
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Approve</Button>
      </DialogTrigger>
      <DialogContent title={`Approve version ${versionNumber}?`}>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="design_version_id" value={versionId} />
          <FormError result={result} />

          <Alert tone="warn" title="This becomes the approved design">
            Any previously approved version is superseded, and execution will build from this exact
            version. Approving does not send anything to the customer — download and share it
            yourself.
          </Alert>

          <Field label="Note" htmlFor="note" hint="Optional. Added to the lead timeline.">
            <Textarea id="note" name="note" rows={2} />
          </Field>

          <SubmitButton fullWidth pendingLabel="Approving…">
            Approve this version
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
