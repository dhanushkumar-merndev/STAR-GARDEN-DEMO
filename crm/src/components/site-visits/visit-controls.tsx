'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuExternalLink, LuLogIn, LuLogOut, LuMapPin, LuNavigation } from 'react-icons/lu';
import { toast } from 'sonner';
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import {
  cancelSiteVisitAction,
  checkInAction,
  checkOutAction,
  completeSiteVisitAction,
  rescheduleSiteVisitAction,
  startJourneyAction,
} from '@/server/actions/workflow';
import type { ActionResult } from '@/lib/errors';
import { googleMapsViewUrl } from '@/lib/utils/maps';
import { searchDesignersAction } from '@/server/actions/people';
import { FileUploader, type FileUploaderHandle } from '@/components/files/uploader';

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
type LocationAction = (
  prev: unknown,
  formData: FormData,
) => Promise<ActionResult<{ siteVisitId: string }>>;

function requestRequiredLocation(): Promise<NonNullable<Coords>> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('This device cannot share its location.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        }),
      () => reject(new Error('Location is required. Allow location access and try again.')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

function RequiredLocationButton({
  siteVisitId,
  action,
  label,
  pendingLabel,
  successMessage,
  icon: Icon,
}: {
  siteVisitId: string;
  action: LocationAction;
  label: string;
  pendingLabel: string;
  successMessage: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const location = await requestRequiredLocation();
      const formData = new FormData();
      formData.set('site_visit_id', siteVisitId);
      formData.set('latitude', String(location.latitude));
      formData.set('longitude', String(location.longitude));

      const result = await action(null, formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not get your location.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button className="gap-2" onClick={() => void handleClick()} disabled={pending}>
      <Icon className="size-4" />
      {pending ? pendingLabel : label}
    </Button>
  );
}

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
  required = false,
}: ReturnType<typeof useOneShotLocation> & { required?: boolean }) {
  React.useEffect(() => {
    if (required && state === 'idle') request();
  }, [required, request, state]);

  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex items-start gap-2">
        <LuMapPin className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
        <div className="text-sm">
          <p className="font-medium text-ink">Share your location{required ? '' : ' (optional)'}</p>
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
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700"
          >
            Preview this pin in Google Maps <LuExternalLink className="size-3" />
          </a>
        </div>
      ) : null}

      {state === 'denied' ? (
        <p className="text-xs text-ink-muted">
          {required
            ? 'Location is required to continue. Allow it in your browser, then try again.'
            : 'Location not shared. You can still continue.'}
        </p>
      ) : null}

      {state === 'unsupported' ? (
        <p className="text-xs text-ink-muted">This device cannot share a location.</p>
      ) : null}

      {!required && (state === 'idle' || state === 'denied') ? (
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

/**
 * "Start" — the designer is leaving for the site.
 *
 * The first of the journey's two taps. It puts the visit into EN_ROUTE so the
 * Admin's board can answer "is someone coming?" without ringing the designer.
 *
 * Same location rules as check-in: one reading, taken only if the prompt is
 * accepted, and declining still lets the journey start. Nothing is sampled
 * between this tap and the next one — there is no watcher (§3.2, §18).
 */
export function StartJourneyButton({ siteVisitId }: { siteVisitId: string }) {
  return (
    <RequiredLocationButton
      siteVisitId={siteVisitId}
      action={startJourneyAction}
      label="Start journey"
      pendingLabel="Getting location..."
      successMessage="Journey started."
      icon={LuNavigation}
    />
  );
}

/**
 * "Reached site" — arrival, which is also the check-in.
 *
 * One button, not two: the database refuses any row where the journey says
 * arrived but no check-in exists, so splitting them would only create a state
 * the schema rejects.
 */
export function CheckInButton({ siteVisitId }: { siteVisitId: string }) {
  return (
    <RequiredLocationButton
      siteVisitId={siteVisitId}
      action={checkInAction}
      label="Reached site"
      pendingLabel="Getting location..."
      successMessage="Arrival recorded."
      icon={LuLogIn}
    />
  );
}

export function CheckOutButton({
  siteVisitId,
  maxSizeMb,
}: {
  siteVisitId: string;
  maxSizeMb: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);
  const location = useOneShotLocation();
  const uploader = React.useRef<FileUploaderHandle>(null);

  /**
   * One button for both jobs: the photos go up, then the visit closes.
   *
   * Order matters. Checking out first and uploading after would mean a failed
   * upload leaves a closed visit with no evidence and nobody still on site to
   * fix it. Uploading first means a failure stops the check-out, and the
   * designer — who is standing there with the phone — can retry.
   */
  async function handleSubmit(formData: FormData) {
    if (uploader.current && uploader.current.pendingCount() > 0) {
      const uploaded = await uploader.current.uploadAll();
      if (!uploaded) {
        toast.error('Fix the photos that failed, then check out.');
        return;
      }
    }

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
          <LuLogOut className="size-4" />
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

          <LocationControl {...location} required />
          <div className="border-t border-line pt-4">
            <FileUploader
              ref={uploader}
              category="SITE_VISIT_ATTACHMENT"
              siteVisitId={siteVisitId}
              maxSizeMb={maxSizeMb}
              cameraCapture
              multiple
              maxFiles={10}
              hideAction
              label="Photo evidence"
              helpText="Take photos now or choose from the gallery — up to 10. They upload when you check out."
            />
          </div>
          <SubmitButton
            fullWidth
            pendingLabel="Uploading and checking out…"
            disabled={!location.coords || location.state === 'asking'}
          >
            Check out
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteVisitDialog({
  siteVisitId,
  triggerLabel = 'Complete visit',
  photoUploadMaxSizeMb,
  designers = [],
  defaultDesignerId,
}: {
  siteVisitId: string;
  triggerLabel?: string;
  /**
   * Set only when journey tracking is off (§8.3).
   *
   * Site photos normally arrive with the check-out dialog. Without that step
   * this is the last moment anyone is asked about the visit, so the uploader
   * moves here rather than the evidence being quietly lost.
   */
  photoUploadMaxSizeMb?: number;
  /**
   * Who the design can be handed to — Landscape Designers, Admins and Super
   * Admins, the same roles every other designer picker offers.
   *
   * One page of them; the picker asks the server for the rest as you type.
   */
  designers?: { id: string; full_name: string }[];
  /** The designer who attended, pre-selected. */
  defaultDesignerId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);
  const uploader = React.useRef<FileUploaderHandle>(null);
  // Controlled so the designer field can follow it: naming someone to draw a
  // design nobody asked for is a question with no answer.
  const [designRequired, setDesignRequired] = React.useState(true);

  async function handleSubmit(formData: FormData) {
    // Same order as check-out, for the same reason: a failed upload must not
    // leave a closed visit with no evidence and nobody left to re-attach it.
    if (uploader.current && uploader.current.pendingCount() > 0) {
      const uploaded = await uploader.current.uploadAll();
      if (!uploaded) {
        toast.error('Fix the photos that failed, then complete the visit.');
        return;
      }
    }

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
        <Button>{triggerLabel}</Button>
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
              checked={designRequired}
              onChange={(event) => setDesignRequired(event.target.checked)}
              label="Start landscape design after approval"
              hint="The requirement goes to the designer chosen below once an Admin approves this visit."
            />

            {designRequired ? (
              <Field
                label="Landscape designer"
                htmlFor="designer_id"
                hint="Defaults to whoever attended this visit. Change it to hand the drawing to someone else."
                error={fieldError(result, 'designer_id')}
              >
                <Select
                  id="designer_id"
                  name="designer_id"
                  searchable
                  onSearch={searchDesignersAction}
                  defaultValue={defaultDesignerId ?? ''}
                >
                  {/* Sending nothing keeps the server's own default — the
                      designer on the visit — so this stays valid even on a
                      visit booked without one. */}
                  <option value="">Whoever attended this visit</option>
                  {designers.map((designer) => (
                    <option key={designer.id} value={designer.id}>
                      {designer.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </PendingFieldset>

          {photoUploadMaxSizeMb ? (
            <div className="border-t border-line pt-4">
              <FileUploader
                ref={uploader}
                category="SITE_VISIT_ATTACHMENT"
                siteVisitId={siteVisitId}
                maxSizeMb={photoUploadMaxSizeMb}
                cameraCapture
                multiple
                maxFiles={10}
                hideAction
                label="Photo evidence"
                helpText="Optional — up to 10 photos from the visit. They upload when you complete it."
              />
            </div>
          ) : null}

          <SubmitButton fullWidth>{triggerLabel}</SubmitButton>
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
