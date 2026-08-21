'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  LuArrowRight,
  LuCalendarPlus,
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
import { scheduleSiteVisitAction } from '@/server/actions/workflow';
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
  /** A fresh Call Customer attempt is required for every saved outcome. */
  callAttemptRequired?: boolean;
  designers: { id: string; full_name: string }[];
  defaultAddress: string | null;
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
  callAttemptRequired = false,
  designers,
  defaultAddress,
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

        if (choice === 'INTERESTED') {
          const visitData = new FormData();
          visitData.set('lead_id', leadId);
          visitData.set('scheduled_start_at', String(formData.get('visit_scheduled_start_at') ?? ''));
          visitData.set('address', String(formData.get('visit_address') ?? ''));
          visitData.set('map_url', String(formData.get('visit_map_url') ?? ''));
          visitData.set('designer_id', String(formData.get('visit_designer_id') ?? ''));
          visitData.set('notes', String(formData.get('visit_notes') ?? ''));

          const visitResult = await scheduleSiteVisitAction(null, visitData);
          if (!visitResult.ok) {
            setFieldErrors(
              Object.fromEntries(
                Object.entries(visitResult.fields ?? {}).map(([key, value]) => [`visit_${key}`, value]),
              ),
            );
            toast.error('Interested was saved, but the site visit could not be scheduled. Use the Site visits tab.');
            setChoice(null);
            router.push(`/leads/${leadId}?tab=visits`);
            router.refresh();
            return;
          }
          toast.success('Interested saved and site visit scheduled.');
        } else {
          toast.success(NEXT_STEP_COPY[result.data.kind]);
        }
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
      {callAttemptRequired && !readOnly && selectedOutcome !== 'INTERESTED' ? (
        <Alert tone="neutral" title="Call the customer first">
          {selectedOutcome
            ? 'Interested can reopen a previously contacted lead. Other outcomes unlock after you press Call Customer.'
            : 'All outcomes, including Interested, unlock after you press Call Customer.'}
        </Alert>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {CHOICES.map((item) => {
          const Icon = item.icon;
          // Once the attempt is consumed, the saved result belongs in the
          // "Last call" badge above. Keeping its action button green while all
          // buttons are locked makes it look clickable/half-selected.
          const availableWithoutAttempt =
            (item.key === 'INTERESTED' && selectedOutcome !== null) ||
            (item.key === 'NOT_INTERESTED' && selectedOutcome === 'INTERESTED');
          const attemptLocked = callAttemptRequired && !availableWithoutAttempt;
          const alreadyInterested = item.key === 'INTERESTED' && selectedOutcome === 'INTERESTED';
          const active = !alreadyInterested && !attemptLocked &&
            (choice ?? optimisticOutcome ?? selectedOutcome) === item.key;
          const canReopenWithThisChoice = allowReopen && item.key === 'INTERESTED';
          return (
            <button
              key={item.key}
              type="button"
              disabled={alreadyInterested || attemptLocked || (readOnly && !canReopenWithThisChoice)}
              title={alreadyInterested ? 'Interested is already the latest outcome.' : undefined}
              onClick={() => (!alreadyInterested && !attemptLocked && (!readOnly || canReopenWithThisChoice)) && setChoice(item.key)}
              className={cn(
                'flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-all',
                active
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                  : 'border-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-50',
                (alreadyInterested || attemptLocked || (readOnly && !canReopenWithThisChoice)) && 'cursor-not-allowed opacity-55',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}

        {/* Deliberately not styled like the seven above it. Those record what
            the customer said; this schedules something. A dashed outline and
            the arrow say "this takes you somewhere" rather than "this is an
            eighth outcome" — the two must not be confusable, because pressing
            an outcome is a one-way commit. */}
        {readOnly ? null : (
          <Link
            href={`/leads/${leadId}?tab=follow-ups&new=1`}
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-50"
          >
            <LuCalendarPlus className="size-4" />
            Add follow-up
            <LuArrowRight className="size-3.5" />
          </Link>
        )}
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
                <div className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                  <Alert tone="ok">Record interest and schedule the site visit together.</Alert>
                  <Field
                    label="Site visit date and time"
                    htmlFor="visit_scheduled_start_at"
                    required
                    error={fieldErrors.visit_scheduled_start_at}
                  >
                    <Input id="visit_scheduled_start_at" name="visit_scheduled_start_at" type="datetime-local" required />
                  </Field>
                  <Field label="Site address" htmlFor="visit_address" required error={fieldErrors.visit_address}>
                    <Textarea id="visit_address" name="visit_address" rows={2} required defaultValue={defaultAddress ?? ''} />
                  </Field>
                  <Field label="Map link" htmlFor="visit_map_url" error={fieldErrors.visit_map_url}>
                    <Input id="visit_map_url" name="visit_map_url" type="url" placeholder="https://maps.app.goo.gl/…" />
                  </Field>
                  {designers.length > 0 ? (
                    <Field
                      label="Landscape Designer attending"
                      htmlFor="visit_designer_id"
                      required
                      error={fieldErrors.visit_designer_id}
                    >
                      <Select id="visit_designer_id" name="visit_designer_id" defaultValue="" required>
                        <option value="" disabled>Choose a designer</option>
                        {designers.map((designer) => (
                          <option key={designer.id} value={designer.id}>{designer.full_name}</option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <Alert tone="warn" title="No landscape designer available">
                      Add a Designer under Settings → Users before recording Interested.
                    </Alert>
                  )}
                  <Field label="Visit notes" htmlFor="visit_notes" error={fieldErrors.visit_notes}>
                    <Textarea id="visit_notes" name="visit_notes" rows={2} placeholder="Gate code, parking, who to ask for…" />
                  </Field>
                </div>
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
                <Button type="submit" disabled={pending || (choice === 'INTERESTED' && designers.length === 0)}>
                  {pending ? 'Saving...' : choice === 'INTERESTED' ? 'Save and schedule visit' : 'Save outcome'}
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
