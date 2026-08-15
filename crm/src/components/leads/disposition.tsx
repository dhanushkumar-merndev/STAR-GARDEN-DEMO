'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  LuCalendarClock,
  LuCircleCheck,
  LuPhoneMissed,
  LuPhoneOff,
  LuPhoneOutgoing,
  LuThumbsDown,
  LuThumbsUp,
  LuVolumeX,
} from 'react-icons/lu';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { logCallAction } from '@/server/actions/leads';
import { recordDispositionAction } from '@/server/actions/workflow';
import { cn } from '@/lib/utils/cn';
import type { CallOutcome } from '@/types/database';

export interface DispositionButtonsProps {
  leadId: string;
  customerName: string;
  /** The most recently saved manual call result for this lead. */
  selectedOutcome: CallOutcome | null;
  /** Loss reasons from `config_options`, so the list stays Admin-editable. */
  lostReasons: { value: string; label: string }[];
  /** A terminal lead keeps its recorded result visible but cannot be changed. */
  readOnly?: boolean;
  /** Admins may explicitly reopen a lost lead by recording Interested. */
  allowReopen?: boolean;
}

type AfterCallChoice = CallOutcome;

const CHOICES: {
  key: AfterCallChoice;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: 'INTERESTED',
    label: 'Interested',
    icon: LuThumbsUp,
  },
  {
    key: 'CALL_LATER',
    label: 'Create follow-up',
    icon: LuCalendarClock,
  },
  {
    key: 'NOT_INTERESTED',
    label: 'Not interested',
    icon: LuThumbsDown,
  },
  { key: 'CONNECTED', label: 'Connected', icon: LuCircleCheck },
  { key: 'NO_ANSWER', label: 'No answer', icon: LuPhoneMissed },
  { key: 'BUSY', label: 'Busy', icon: LuPhoneOutgoing },
  { key: 'SWITCHED_OFF', label: 'Switched off', icon: LuPhoneOff },
  { key: 'INVALID_NUMBER', label: 'Invalid number', icon: LuVolumeX },
];

function isDisposition(choice: AfterCallChoice): choice is 'INTERESTED' | 'CALL_LATER' | 'NOT_INTERESTED' {
  return choice === 'INTERESTED' || choice === 'CALL_LATER' || choice === 'NOT_INTERESTED';
}

export function DispositionButtons({
  leadId,
  customerName,
  lostReasons,
  selectedOutcome,
  readOnly = false,
  allowReopen = false,
}: DispositionButtonsProps) {
  const router = useRouter();
  const [choice, setChoice] = React.useState<AfterCallChoice | null>(null);
  const [optimisticOutcome, setOptimisticOutcome] = React.useState<CallOutcome | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function onSubmit(formData: FormData) {
    if (!choice) return;
    setFieldErrors({});

    startTransition(async () => {
      if (isDisposition(choice)) {
        formData.set('disposition', choice === 'CALL_LATER' ? 'FOLLOW_UP' : choice);
        const result = await recordDispositionAction(null, formData);
        if (!result.ok) {
          setFieldErrors(result.fields ?? {});
          toast.error(result.message);
          return;
        }
        toast.success(NEXT_STEP_COPY[result.data.kind]);
      } else {
        formData.set('outcome', choice);
        const result = await logCallAction(null, formData);
        if (!result.ok) {
          setFieldErrors(result.fields ?? {});
          toast.error(result.message);
          return;
        }
        toast.success(
          ['NO_ANSWER', 'BUSY', 'SWITCHED_OFF'].includes(choice)
            ? `${choiceLabel(choice)} saved. Callback reminder set for 30 minutes.`
            : `${choiceLabel(choice)} saved.`,
        );
      }

      setOptimisticOutcome(choice);
      setChoice(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {readOnly ? (
        <Alert tone="neutral" title="This lead is marked Not interested">
          {allowReopen
            ? 'If the customer changed their mind, select Interested to reopen this lead.'
            : 'The recorded call outcome is retained for history. Ask an Admin to reopen the lead before recording a new outcome.'}
        </Alert>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {CHOICES.map((item) => {
          const Icon = item.icon;
          const active = (choice ?? optimisticOutcome ?? selectedOutcome) === item.key;
          const canReopenWithThisChoice = allowReopen && item.key === 'INTERESTED';
          return (
            <button
              key={item.key}
              type="button"
              disabled={readOnly && !canReopenWithThisChoice}
              onClick={() => (!readOnly || canReopenWithThisChoice) && setChoice(item.key)}
              className={cn(
                'flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-all',
                active
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                  : 'border-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-50',
                readOnly && !canReopenWithThisChoice && 'cursor-not-allowed opacity-70',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      <Dialog open={choice !== null} onOpenChange={(open) => !open && setChoice(null)}>
        <DialogContent title={choice ? choiceLabel(choice) : ''} description={customerName}>
          {choice ? (
            <form action={onSubmit} className="space-y-4">
              <input type="hidden" name="lead_id" value={leadId} />

              {choice === 'NOT_INTERESTED' ? (
                <Field
                  label="Why not?"
                  htmlFor="lost_reason"
                  required
                  error={fieldErrors.lost_reason}
                  hint="This appears in reporting."
                >
                  <Select id="lost_reason" name="lost_reason" defaultValue="">
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
              ) : null}

              {choice === 'CALL_LATER' ? (
                <>
                  <Field
                    label="Follow-up date and time"
                    htmlFor="follow_up_at"
                    required
                    error={fieldErrors.follow_up_at}
                  >
                    <Input
                      id="follow_up_at"
                      name="follow_up_at"
                      type="datetime-local"
                      defaultValue={defaultFollowUpValue()}
                    />
                  </Field>
                  <Field label="Reminder title" htmlFor="follow_up_note" error={fieldErrors.follow_up_note}>
                    <Input id="follow_up_note" name="follow_up_note" placeholder={`Call ${customerName} back`} />
                  </Field>
                </>
              ) : null}

              {choice === 'INTERESTED' ? (
                <Alert tone="ok">
                  Save this, then schedule the site visit. Assign a landscape designer after the visit is completed.
                </Alert>
              ) : null}

              <Field
                label={choice === 'CONNECTED' ? 'Call notes' : 'Notes'}
                htmlFor={isDisposition(choice) ? 'note' : 'notes'}
                error={fieldErrors.note ?? fieldErrors.notes}
              >
                <Textarea
                  id={isDisposition(choice) ? 'note' : 'notes'}
                  name={isDisposition(choice) ? 'note' : 'notes'}
                  rows={3}
                  placeholder={notePlaceholder(choice)}
                />
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setChoice(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Saving...' : 'Save outcome'}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function choiceLabel(choice: AfterCallChoice): string {
  return CHOICES.find((item) => item.key === choice)?.label ?? choice;
}

function notePlaceholder(choice: AfterCallChoice): string {
  switch (choice) {
    case 'NO_ANSWER':
      return 'Optional — e.g. rang twice, no answer';
    case 'BUSY':
      return 'Optional — e.g. customer asked to call again later';
    case 'SWITCHED_OFF':
      return 'Optional — e.g. phone switched off';
    case 'INVALID_NUMBER':
      return 'Optional — e.g. number does not belong to the customer';
    case 'CONNECTED':
      return 'Optional — record what was discussed';
    default:
      return 'Optional';
  }
}

const NEXT_STEP_COPY: Record<string, string> = {
  BOOK_SITE_VISIT: 'Saved. Schedule the site visit next.',
  ASSIGN_DESIGN: 'Saved. The site visit is done — assign the design next.',
  FOLLOW_UP_SET: 'Follow-up created.',
  NONE: 'Saved. This lead is marked Not interested.',
};

function defaultFollowUpValue(): string {
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(10, 0, 0, 0);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(
    when.getHours(),
  )}:${pad(when.getMinutes())}`;
}
