import { LuExternalLink, LuMapPin, LuNavigation } from 'react-icons/lu';
import { Badge, type Tone } from '@/components/ui';
import { JourneyMap } from '@/components/site-visits/journey-map';
import { distanceMetres, googleMapsDirectionsUrl, osmViewUrl } from '@/lib/utils/maps';
import { formatDateTime } from '@/lib/utils/format';
import type { SiteVisitRow, VisitJourneyStatus } from '@/types/database';

/**
 * The journey to a site visit, as the Admin sees it.
 *
 * Three states and two timestamps — that is the whole feature. It answers the
 * one question a customer actually rings to ask ("is someone coming?") without
 * pretending to be a tracking product: nothing is recorded between the two
 * taps, and the copy says so rather than leaving staff to wonder.
 *
 * The map is the one client-side piece: `JourneyMap` mounts MapLibre to draw
 * both recorded points at once, which the old single-pin OSM iframe could not.
 * Everything around it still renders on the server.
 */

const JOURNEY_TONES: Record<VisitJourneyStatus, Tone> = {
  NOT_STARTED: 'neutral',
  EN_ROUTE: 'warn',
  ARRIVED: 'ok',
};

const JOURNEY_LABELS: Record<VisitJourneyStatus, string> = {
  NOT_STARTED: 'Not started',
  EN_ROUTE: 'On the way',
  ARRIVED: 'Reached site',
};

export function JourneyStatusBadge({ value }: { value: VisitJourneyStatus }) {
  return <Badge tone={JOURNEY_TONES[value]}>{JOURNEY_LABELS[value]}</Badge>;
}

export function VisitJourney({ visit }: { visit: SiteVisitRow }) {
  // Prefer where the designer actually stood; fall back to the address pin.
  const pin =
    visit.check_in_latitude != null && visit.check_in_longitude != null
      ? { latitude: visit.check_in_latitude, longitude: visit.check_in_longitude }
      : { latitude: visit.latitude, longitude: visit.longitude };

  const osmLink = osmViewUrl(pin);
  const directions = googleMapsDirectionsUrl({
    latitude: visit.latitude,
    longitude: visit.longitude,
    address: visit.address,
  });

  // The two taps, as map points. Either can be missing: location sharing is
  // optional at both ends (a declined browser prompt still records the time).
  const start =
    visit.journey_start_latitude != null && visit.journey_start_longitude != null
      ? {
          latitude: visit.journey_start_latitude,
          longitude: visit.journey_start_longitude,
          label: 'Left for site',
          when: visit.journey_started_at ? formatDateTime(visit.journey_started_at) : null,
        }
      : null;

  const end =
    visit.check_in_latitude != null && visit.check_in_longitude != null
      ? {
          latitude: visit.check_in_latitude,
          longitude: visit.check_in_longitude,
          label: 'Reached site',
          when: visit.check_in_at ? formatDateTime(visit.check_in_at) : null,
        }
      : null;

  const destination =
    visit.latitude != null && visit.longitude != null
      ? { latitude: visit.latitude, longitude: visit.longitude, label: 'Address on file' }
      : null;

  const hasMap = Boolean(start || end || destination);

  // Crow-flies only, and labelled as such — a sanity check on the arrival tap,
  // not a claim about anyone's route.
  const drift =
    visit.latitude != null && visit.check_in_latitude != null
      ? distanceMetres(
          { latitude: visit.latitude, longitude: visit.longitude },
          { latitude: visit.check_in_latitude, longitude: visit.check_in_longitude },
        )
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <JourneyStatusBadge value={visit.journey_status} />
        {visit.journey_started_at ? (
          <span className="text-xs text-ink-muted">
            Left at {formatDateTime(visit.journey_started_at)}
          </span>
        ) : null}
        {visit.check_in_at ? (
          <span className="text-xs text-ink-muted">
            · Arrived {formatDateTime(visit.check_in_at)}
          </span>
        ) : null}
      </div>

      {visit.journey_status === 'NOT_STARTED' ? (
        <p className="text-sm text-ink-muted">
          The designer has not started the journey yet.
        </p>
      ) : null}

      {hasMap ? (
        <figure className="m-0 overflow-hidden rounded-lg border border-line">
          <JourneyMap start={start} end={end} destination={destination} className="h-56 sm:h-72" />
          <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <LuMapPin className="size-3.5" />
              {start && end
                ? 'A straight line between the two taps — the route taken was not recorded'
                : end
                  ? 'Where the designer confirmed arrival'
                  : start
                    ? 'Where the designer set off'
                    : 'The address on file'}
            </span>
            <span className="flex gap-3">
              {osmLink ? (
                <a
                  href={osmLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                >
                  Bigger map <LuExternalLink className="size-3" />
                </a>
              ) : null}
              {directions ? (
                <a
                  href={directions}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                >
                  <LuNavigation className="size-3" /> Directions
                </a>
              ) : null}
            </span>
          </figcaption>
        </figure>
      ) : (
        <p className="text-sm text-ink-muted">
          No location pin shared yet.
          {directions ? (
            <>
              {' '}
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-700 underline"
              >
                <LuNavigation className="size-3.5" />
                Open the address in Maps
              </a>
              .
            </>
          ) : null}
        </p>
      )}

      {drift != null && drift > 500 ? (
        <p className="text-xs text-ink-muted">
          Arrival was confirmed about {formatDistance(drift)} from the address on file, in a
          straight line. That is often just an imprecise pin rather than a problem.
        </p>
      ) : null}

    </div>
  );
}

function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}
