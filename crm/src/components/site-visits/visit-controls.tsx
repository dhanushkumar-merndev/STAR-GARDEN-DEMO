'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Checkbox, Field, Input, Textarea } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import {
  cancelSiteVisitAction,
  checkInAction,
  checkOutAction,
  completeSiteVisitAction,
  rescheduleSiteVisitAction,
} from '@/server/actions/workflow';
import type { ActionResult } from '@/lib/errors';
import { googleMapsViewUrl } from '@/lib/utils/maps';

/**
 * Check-in / check-out (AGENTS.md §8.3, §15, §18).
 *
 * Location is opt-in and visit-scoped. The browser prompt fires exactly twice
 * per visit — once at check-in, once at check-out — using `getCurrentPosition`,
 * never `watchPosition`. Declining is a first-class outcome: the check-in still
 * succeeds, just without coordinates. §18 forbids background GPS tracking, and
 * the only way to keep that promise is to never hold a location watcher.
 */

type Coords = { latitude: number; longitude: number } | null;

function useOneShotLocation() {
  const [state, setState] = React.useState<'idle' | 'asking' | 'granted' | 'denied' | 'unsupported'>(
    'idle',
  );
  const [coords, setCoords] = React.useState<Coords>(null);

  const request = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unsupported');
      return;
    }

    setState('asking');

    // One reading. No watcher is ever registered, so nothing keeps running
    // after this resolves.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
        setState('granted');
      },
      () => {
        setCoords(null);
        setState('denied');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, []);

  return { state, coords, request };
}

function LocationControl({
  state,
  coords,
  request,
}: ReturnType<typeof useOneShotLocation>) {
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
        <div className="text-sm">
          <p className="font-medium text-ink">Share your location (optional)</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Recorded once, for this visit only. The CRM never tracks you in the background.
          </p>
        </div>
      </div>

      {state === 'granted' && coords ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-[--color-ok]">
            Location captured ({coords.latitude}, {coords.longitude}).
          </p>
          <a
            href={googleMapsViewUrl(coords) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-xs font-medium text-brand-700"
          >
            Preview this pin in Google Maps →
          </a>
        </div>
      ) : null}

      {state === 'denied' ? (
        <p className="text-xs text-ink-muted">
          Location not shared. You can still continue — it is optional.
        </p>
      ) : null}

      {state === 'unsupported' ? (
        <p className="text-xs text-ink-muted">This device cannot share a location.</p>
      ) : null}

      {state === 'idle' || state === 'denied' ? (
        <Button size="sm" variant="outline" onClick={request}>
          {state === 'denied' ? 'Try again' : 'Share location'}
        </Button>
      ) : null}

      {state === 'asking' ? <p className="text-xs text-ink-muted">Waiting for your device…</p> : null}

      {coords ? (
        <>
          <input type="hidden" name="latitude" value={coords.latitude} />
          <input type="hidden" name="longitude" value={coords.longitude} />
        </>
      ) : null}
    </div>
  );
}

export function CheckInButton({ siteVisitId }: { siteVisitId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);
  const location = useOneShotLocation();

  async function handleSubmit(formData: FormData) {
    const next = await checkInAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Checked in.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <LogIn className="size-4" />
          Check in
        </Button>
      </DialogTrigger>
      <DialogContent title="Check in to this visit">
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="site_visit_id" value={siteVisitId} />
          <FormError result={result} />
          <LocationControl {...location} />
          <SubmitButton fullWidth>Check in</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CheckOutButton({ siteVisitId }: { siteVisitId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);
  const location = useOneShotLocation();

  async function handleSubmit(formData: FormData) {
    const next = await checkOutAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Checked out.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <LogOut className="size-4" />
          Check out
        </Button>
      </DialogTrigger>
      <DialogContent title="Check out of this visit">
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="site_visit_id" value={siteVisitId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field label="Visit notes" htmlFor="notes" error={fieldError(result, 'notes')}>
              <Textarea id="notes" name="notes" rows={3} placeholder="What did you see and discuss?" />
            </Field>

            <Field label="Requirement summary" htmlFor="requirement_summary">
              <Textarea
                id="requirement_summary"
                name="requirement_summary"
                rows={3}
                placeholder="Measurements, constraints, what the customer wants."
              />
            </Field>
          </PendingFieldset>

          <LocationControl {...location} />
          <SubmitButton fullWidth>Check out</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteVisitDialog({ siteVisitId }: { siteVisitId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await completeSiteVisitAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Visit completed.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Complete visit</Button>
      </DialogTrigger>
      <DialogContent title="Complete this site visit">
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="site_visit_id" value={siteVisitId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field label="Visit notes" htmlFor="notes" required error={fieldError(result, 'notes')}>
              <Textarea id="notes" name="notes" rows={4} required autoFocus />
            </Field>

            <Field label="Requirement summary" htmlFor="requirement_summary">
              <Textarea id="requirement_summary" name="requirement_summary" rows={3} />
            </Field>

            <Checkbox
              name="design_required"
              label="A landscape design is required"
              hint="Makes this lead ready for a designer to be assigned."
            />
          </PendingFieldset>

          <SubmitButton fullWidth>Complete visit</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RescheduleVisitDialog({ siteVisitId }: { siteVisitId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await rescheduleSiteVisitAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Visit rescheduled.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Reschedule</Button>
      </DialogTrigger>
      <DialogContent title="Reschedule this visit">
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="site_visit_id" value={siteVisitId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field
              label="New date and time"
              htmlFor="scheduled_start_at"
              required
              error={fieldError(result, 'scheduled_start_at')}
            >
              <Input id="scheduled_start_at" name="scheduled_start_at" type="datetime-local" required />
            </Field>

            <Field label="Reason" htmlFor="reason">
              <Input id="reason" name="reason" placeholder="Customer asked to move it" />
            </Field>
          </PendingFieldset>

          <SubmitButton fullWidth>Reschedule</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelVisitDialog({ siteVisitId }: { siteVisitId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await cancelSiteVisitAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Visit cancelled.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost">Cancel visit</Button>
      </DialogTrigger>
      <DialogContent title="Cancel this visit">
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="site_visit_id" value={siteVisitId} />
          <FormError result={result} />

          <Alert tone="warn">Attendees are notified that the visit is cancelled.</Alert>

          <Field
            label="Reason"
            htmlFor="cancellation_reason"
            required
            error={fieldError(result, 'cancellation_reason')}
          >
            <Textarea id="cancellation_reason" name="cancellation_reason" rows={3} required autoFocus />
          </Field>

          <SubmitButton fullWidth variant="danger">
            Cancel visit
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
