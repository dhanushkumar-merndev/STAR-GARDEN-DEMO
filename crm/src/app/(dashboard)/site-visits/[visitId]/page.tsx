import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { requirePageUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { getSiteVisitDetail } from '@/server/services/site-visits';
import { getSettings } from '@/lib/settings';
import { canWriteLead } from '@/lib/permissions';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { SiteVisitStatusBadge } from '@/components/status';
import { FileList } from '@/components/files/file-list';
import { FileUploader } from '@/components/files/uploader';
import {
  CancelVisitDialog,
  CheckInButton,
  CheckOutButton,
  CompleteVisitDialog,
  RescheduleVisitDialog,
} from '@/components/site-visits/visit-controls';
import { formatDateTime } from '@/lib/utils/format';
import { formatMobile, telHref } from '@/lib/utils/phone';
import { googleMapsDirectionsUrl, googleMapsViewUrl, safeHttpUrl } from '@/lib/utils/maps';

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
  const capturedSiteTarget = {
    latitude: visit.latitude ?? visit.check_in_latitude,
    longitude: visit.longitude ?? visit.check_in_longitude,
    address: visit.address,
  };
  const savedMapUrl = safeHttpUrl(visit.map_url);
  const viewMapUrl = savedMapUrl ?? googleMapsViewUrl(capturedSiteTarget);
  const directionsUrl = googleMapsDirectionsUrl(capturedSiteTarget);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/site-visits" className="text-sm text-ink-muted hover:text-ink">
          ← All visits
        </Link>
      </div>

      <PageHeader
        title={lead?.customer_name ?? 'Site visit'}
        subtitle={formatDateTime(visit.scheduled_start_at)}
        action={<SiteVisitStatusBadge value={visit.status} />}
      />

      <Card>
        <CardBody className="space-y-3 text-sm">
          {visit.address ? (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
              <span>{visit.address}</span>
            </p>
          ) : null}

          {viewMapUrl || directionsUrl ? (
            <div className="flex flex-wrap gap-2">
              {directionsUrl ? (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Navigation className="size-4" />
                  Directions in Google Maps
                </a>
              ) : null}
              {viewMapUrl ? (
                <a
                  href={viewMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap inline-flex items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-brand-700 hover:bg-surface-muted"
                >
                  <ExternalLink className="size-4" />
                  View map pin
                </a>
              ) : null}
            </div>
          ) : null}

          {lead?.mobile_normalized ? (
            <p>
              <span className="text-ink-muted">Customer: </span>
              <a
                href={telHref(lead.mobile_country_code, lead.mobile_normalized)}
                className="font-medium text-brand-700"
              >
                {formatMobile(lead.mobile_country_code, lead.mobile_normalized)}
              </a>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {attendees.map((attendee) => {
              const profile = (attendee as { profile?: { full_name: string; role: string } | null })
                .profile;
              return (
                <Badge key={attendee.id} tone="neutral">
                  {profile?.full_name ?? 'Attendee'}
                </Badge>
              );
            })}
          </div>

          {lead?.id ? (
            <Link href={`/leads/${lead.id}`} className="inline-flex text-sm font-medium text-brand-700">
              Open the lead →
            </Link>
          ) : null}
        </CardBody>
      </Card>

      {isOpen && canRecord ? (
        <Card>
          <CardHeader
            title="On site"
            description="Check in when you arrive. Tap Share location to capture one GPS point for this visit only."
          />
          <CardBody className="flex flex-wrap gap-2">
            {!visit.check_in_at ? (
              <CheckInButton siteVisitId={visit.id} />
            ) : !visit.check_out_at ? (
              <CheckOutButton siteVisitId={visit.id} />
            ) : null}

            {canManage ? (
              <>
                <CompleteVisitDialog siteVisitId={visit.id} />
                <RescheduleVisitDialog siteVisitId={visit.id} />
                <CancelVisitDialog siteVisitId={visit.id} />
              </>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Visit record" />
        <CardBody className="space-y-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-ink-muted">Checked in</dt>
              <dd className="font-medium">
                {visit.check_in_at ? formatDateTime(visit.check_in_at) : 'Not yet'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">Checked out</dt>
              <dd className="font-medium">
                {visit.check_out_at ? formatDateTime(visit.check_out_at) : 'Not yet'}
              </dd>
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
            <div className="rounded-lg bg-surface-muted p-3">
              <p className="text-xs font-medium text-ink-muted">Requirement</p>
              <p className="mt-1 whitespace-pre-wrap">{visit.requirement_summary}</p>
            </div>
          ) : null}

          {visit.notes ? (
            <div className="rounded-lg bg-surface-muted p-3">
              <p className="text-xs font-medium text-ink-muted">Notes</p>
              <p className="mt-1 whitespace-pre-wrap">{visit.notes}</p>
            </div>
          ) : null}

          {visit.cancellation_reason ? (
            <Alert tone="danger" title="Cancelled">
              {visit.cancellation_reason}
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Photos and attachments" />
        <CardBody className="space-y-4">
          <FileList files={files} canArchive={canRecord} emptyMessage="No photos yet." />
          {canRecord ? (
            <div className="border-t border-line pt-4">
              <FileUploader
                category="SITE_VISIT_ATTACHMENT"
                siteVisitId={visit.id}
                maxSizeMb={settings.maxUploadSizeMb}
                label="Add a photo or document"
              />
            </div>
          ) : null}
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
        className="font-medium text-brand-700"
      >
        View in Google Maps
      </a>
      <span className="text-ink-subtle">({latitude}, {longitude})</span>
    </p>
  );
}
