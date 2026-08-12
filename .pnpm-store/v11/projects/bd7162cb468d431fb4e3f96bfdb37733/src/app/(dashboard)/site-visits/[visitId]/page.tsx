import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  LuArrowLeft,
  LuCalendarDays,
  LuClipboardList,
  LuExternalLink,
  LuFileText,
  LuLogIn,
  LuLogOut,
  LuMapPin,
  LuNavigation,
} from 'react-icons/lu';
import { requirePageUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { getSiteVisitDetail } from '@/server/services/site-visits';
import { getSettings } from '@/lib/settings';
import { canWriteLead } from '@/lib/permissions';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui';
import { SiteVisitStatusBadge } from '@/components/status';
import { FileList } from '@/components/files/file-list';
import {
  CancelVisitDialog,
  CheckInButton,
  CheckOutButton,
  CompleteVisitDialog,
  RescheduleVisitDialog,
  StartJourneyButton,
} from '@/components/site-visits/visit-controls';
import { VisitJourney } from '@/components/site-visits/journey';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { hasVisitDayArrived } from '@/lib/utils/visit-timing';
import { formatMobile, telHref } from '@/lib/utils/phone';
import { googleMapsDirectionsUrl, googleMapsViewUrl } from '@/lib/utils/maps';

export const metadata: Metadata = { title: 'Site visit' };

/** Visit detail with check-in/out (AGENTS.md §11.4, §8.3). */
export default async function SiteVisitPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const user = await requirePageUser();

  let detail;
  try {
    detail = await getSiteVisitDetail(user, visitId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { visit, lead, isAttendee, attendees, files } = detail;
  const settings = await getSettings();

  const canManage = canWriteLead(user, lead ?? { assigned_bdm_id: null });
  const canRecord = canManage || isAttendee;
  const isOpen = visit.status !== 'COMPLETED' && visit.status !== 'CANCELLED';
  const visitDayArrived = hasVisitDayArrived(visit.scheduled_start_at);
  const capturedSiteTarget = {
    latitude: visit.latitude ?? visit.check_in_latitude,
    longitude: visit.longitude ?? visit.check_in_longitude,
    address: visit.address,
  };
  const directionsUrl = googleMapsDirectionsUrl(capturedSiteTarget);
  const hasVisitRecord = Boolean(
    visit.check_in_at ||
      visit.check_out_at ||
      visit.requirement_summary ||
      visit.notes ||
      visit.cancellation_reason,
  );
  const attendeeNames = attendees
    .map((attendee) => (attendee as { profile?: { full_name: string } | null }).profile?.full_name)
    .filter((name): name is string => Boolean(name))
    .join(', ');

  return (
    <div className="space-y-4">
      <div>
        <Link href="/site-visits" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <LuArrowLeft className="size-4" />
          All visits
        </Link>
      </div>

      <Card>
        <CardBody className="p-0 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="inline-flex items-center gap-2 font-medium text-ink-muted">
              <LuCalendarDays className="size-4" />
              {formatDateTime(visit.scheduled_start_at)}
            </p>
            <SiteVisitStatusBadge value={visit.status} />
          </div>
          <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:flex-nowrap">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <LuMapPin className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-ink">{visit.address ?? 'Site address not added'}</p>
              {attendeeNames ? <p className="mt-0.5 truncate text-sm text-ink-muted">{attendeeNames}</p> : null}
              {lead?.mobile_normalized ? (
                <a
                  href={telHref(lead.mobile_country_code, lead.mobile_normalized)}
                  className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline"
                >
                  {formatMobile(lead.mobile_country_code, lead.mobile_normalized)}
                </a>
              ) : null}
            </div>
            {directionsUrl ? (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tap inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                <LuNavigation className="size-4" />
                Directions
              </a>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* The journey. Visible to everyone who can see the visit — the Admin is
          usually not an attendee, and they are the person a customer rings to
          ask whether anybody is coming. */}
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><LuNavigation className="size-5 text-brand-700" />Journey to site</span>}
          description="Track when the designer leaves and arrives."
        />
        <CardBody className="space-y-4">
          <VisitJourney visit={visit} />
          {isOpen && (canRecord || user.isAdmin) ? (
            <div className="space-y-3 border-t border-line pt-4">
              {/* Nothing may be recorded before the booked day. The server
                  refuses it either way (§7.5); this is so the designer reads a
                  date instead of hitting an error. Late is never blocked — the
                  CRM tracks overdue visits, and those still have to be
                  completable. */}
              {canRecord && !visitDayArrived ? (
                <p className="text-sm text-ink-muted">
                  The journey opens on{' '}
                  <span className="font-medium text-ink">
                    {formatDate(visit.scheduled_start_at)}
                  </span>
                  . Ask an Admin to reschedule if it is happening sooner.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {/* Exactly one step at a time.
                    Start journey → Reached site → Check out → Complete.

                    These used to be two independent conditions, so a visit that
                    had not started showed "Start journey" and "Reached site"
                    side by side — a designer could record arrival without ever
                    having left, and on a phone there was no way to tell which
                    was the next step. A single chain makes the wrong button
                    unreachable rather than merely discouraged. */}
                {canRecord && visitDayArrived ? (
                  !visit.check_in_at && visit.journey_status === 'NOT_STARTED' ? (
                    <StartJourneyButton siteVisitId={visit.id} />
                  ) : !visit.check_in_at ? (
                    <CheckInButton siteVisitId={visit.id} />
                  ) : !visit.check_out_at ? (
                    <CheckOutButton siteVisitId={visit.id} maxSizeMb={settings.maxUploadSizeMb} />
                  ) : canManage ? (
                    // Completing is the step after check-out, not a parallel option.
                    <CompleteVisitDialog siteVisitId={visit.id} />
                  ) : null
                ) : null}

                {/* Outside the sequence and outside the date window: these are
                    the Admin's escape hatches, and rescheduling a visit before
                    its day is the main reason to reach for one. */}
                {user.isAdmin ? (
                  <>
                    <RescheduleVisitDialog siteVisitId={visit.id} />
                    <CancelVisitDialog siteVisitId={visit.id} />
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {hasVisitRecord ? <Card>
        <CardHeader title={<span className="flex items-center gap-2"><LuClipboardList className="size-5 text-brand-700" />Visit record</span>} />
        <CardBody className="space-y-3 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2 sm:divide-x sm:divide-line">
            <div className="flex items-center gap-3">
              <LuLogIn className="size-5 shrink-0 text-brand-700" />
              <div>
                <dt className="text-xs text-ink-muted">Checked in</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {visit.check_in_at ? formatDateTime(visit.check_in_at) : 'Not yet'}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:pl-5">
              <LuLogOut className="size-5 shrink-0 text-danger" />
              <div>
                <dt className="text-xs text-ink-muted">Checked out</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {visit.check_out_at ? formatDateTime(visit.check_out_at) : 'Not yet'}
                </dd>
              </div>
            </div>
          </dl>

          {visit.check_in_latitude != null && visit.check_in_longitude != null ? (
            <LocationLink
              label="Check-in location"
              latitude={visit.check_in_latitude}
              longitude={visit.check_in_longitude}
            />
          ) : visit.check_in_at ? (
            <p className="text-xs text-ink-muted">Check-in recorded without a location.</p>
          ) : null}

          {visit.check_out_latitude != null && visit.check_out_longitude != null ? (
            <LocationLink
              label="Check-out location"
              latitude={visit.check_out_latitude}
              longitude={visit.check_out_longitude}
            />
          ) : visit.check_out_at ? (
            <p className="text-xs text-ink-muted">Check-out recorded without a location.</p>
          ) : null}

          {visit.requirement_summary ? (
            <div className="flex gap-3 rounded-xl bg-surface-muted p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <LuClipboardList className="size-5" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink-muted">Requirement</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-ink">{visit.requirement_summary}</p>
              </div>
            </div>
          ) : null}

          {visit.notes ? (
            <div className="flex gap-3 rounded-xl bg-surface-muted p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <LuFileText className="size-5" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink-muted">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-ink">{visit.notes}</p>
              </div>
            </div>
          ) : null}

          {visit.cancellation_reason ? (
            <Alert tone="danger" title="Cancelled">
              {visit.cancellation_reason}
            </Alert>
          ) : null}
        </CardBody>
      </Card> : null}

      {/* Read-only. Site photos are uploaded in the check-out dialog, which is
          the one place the designer is already being asked for evidence —
          a second uploader here put two controls for the same category on one
          screen with nothing to say which to use. */}
      <Card>
        <CardHeader title="Photos and attachments" />
        <CardBody>
          <FileList
            files={files}
            canArchive={user.isAdmin}
            emptyMessage="No photos yet. Site photos are added when the designer checks out."
          />
        </CardBody>
      </Card>
    </div>
  );
}

function LocationLink({
  label,
  latitude,
  longitude,
}: {
  label: string;
  latitude: number;
  longitude: number;
}) {
  const href = googleMapsViewUrl({ latitude, longitude });

  return (
    <p className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
      <span>{label} shared:</span>
      <a
        href={href ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
      >
        View in Google Maps <LuExternalLink className="size-3" />
      </a>
      <span className="text-ink-subtle">({latitude}, {longitude})</span>
    </p>
  );
}
