'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuThumbsDown, LuThumbsUp } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button, Field, Select, Textarea } from '@/components/ui';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { completeFollowUpWithDispositionAction } from '@/server/actions/workflow';

interface FollowUpOutcomeActionsProps {
  followUpId: string;
  leadId: string;
  customerName: string;
  lostReasons: { value: string; label: string }[];
}

/** Saves the customer's decision and completes the follow-up in the same action. */
export function FollowUpOutcomeActions({
  followUpId,
  leadId,
  customerName,
  lostReasons,
}: FollowUpOutcomeActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [showNotInterested, setShowNotInterested] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function save(disposition: 'INTERESTED' | 'NOT_INTERESTED', values = new FormData()) {
    setFieldErrors({});
    values.set('lead_id', leadId);
    values.set('follow_up_id', followUpId);
    values.set('disposition', disposition);

    startTransition(async () => {
      const result = await completeFollowUpWithDispositionAction(null, values);
      if (result.ok) {
        toast.success(
          disposition === 'INTERESTED'
            ? 'Interested saved and follow-up completed.'
            : 'Not interested saved and follow-up completed.',
        );
        setShowNotInterested(false);
        router.refresh();
      } else {
        setFieldErrors(result.fields ?? {});
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => save('INTERESTED')}
          disabled={pending}
          className="gap-1.5"
        >
          <LuThumbsUp className="size-4" />
          Interested
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowNotInterested(true)}
          disabled={pending}
          className="gap-1.5"
        >
          <LuThumbsDown className="size-4" />
          Not interested
        </Button>
      </div>

      <Dialog open={showNotInterested} onOpenChange={setShowNotInterested}>
        <DialogContent title="Not interested" description={customerName}>
          <form action={(formData) => save('NOT_INTERESTED', formData)} className="space-y-4">
            <Field
              label="Why not?"
              htmlFor={`lost_reason_${followUpId}`}
              required
              error={fieldErrors.lost_reason}
            >
              <Select id={`lost_reason_${followUpId}`} name="lost_reason" defaultValue="">
                <option value="" disabled>
                  Choose a reason
                </option>
                {lostReasons.map((reason) => (
                  <option key={reason.value} value={reason.label}>
                    {reason.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor={`note_${followUpId}`} error={fieldErrors.note}>
              <Textarea id={`note_${followUpId}`} name="note" rows={3} placeholder="Optional" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowNotInterested(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving...' : 'Save outcome'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
