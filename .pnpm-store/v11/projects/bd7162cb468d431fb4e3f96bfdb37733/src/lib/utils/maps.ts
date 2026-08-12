export interface MapTarget {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}

function queryFor(target: MapTarget): string | null {
  if (
    typeof target.latitude === 'number' &&
    Number.isFinite(target.latitude) &&
    typeof target.longitude === 'number' &&
    Number.isFinite(target.longitude)
  ) {
    return `${target.latitude},${target.longitude}`;
  }

  const address = target.address?.trim();
  return address || null;
}

/** Opens a pin/search in Google Maps without requiring an API key. */
export function googleMapsViewUrl(target: MapTarget): string | null {
  const query = queryFor(target);
  if (!query) return null;

  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

/** Opens directions; Google Maps uses the staff device's location as origin. */
export function googleMapsDirectionsUrl(target: MapTarget): string | null {
  const destination = queryFor(target);
  if (!destination) return null;

  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', destination);
  return url.toString();
}

/* -------------------------------------------------------------------------- */
/* OpenStreetMap                                                               */
/*                                                                             */
/* The free option: no API key, no billing account, no per-load quota, and no  */
/* third-party script running inside the CRM. Google Maps needs a key for an   */
/* embed; OSM's own embed endpoint does not, which is why the map the Admin    */
/* actually sees is this one. The "open in Google Maps" links above stay,      */
/* because that is what staff want on a phone for turn-by-turn directions.     */
/* -------------------------------------------------------------------------- */

/* The OSM `export/embed.html` iframe that used to draw the journey map has
   been replaced by `components/site-visits/journey-map.tsx`, which renders both
   recorded points and the line between them — an iframe can only show one pin.
   The link helpers below are still used, for "open this elsewhere". */

/** The full OSM page, for "see a bigger map". */
export function osmViewUrl(target: MapTarget): string | null {
  const { latitude, longitude } = target;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
}

/**
 * Straight-line distance in metres between two points.
 *
 * Used to tell an Admin how far a designer's "reached site" tap was from the
 * address on file. Deliberately the crow-flies figure and labelled as such —
 * it is a sanity check, not a claim about where anyone drove.
 */
export function distanceMetres(
  a: { latitude?: number | null; longitude?: number | null },
  b: { latitude?: number | null; longitude?: number | null },
): number | null {
  if (
    typeof a.latitude !== 'number' ||
    typeof a.longitude !== 'number' ||
    typeof b.latitude !== 'number' ||
    typeof b.longitude !== 'number'
  ) {
    return null;
  }

  const EARTH_RADIUS_M = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;

  return Math.round(EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(h)));
}

/** Never render a user-supplied non-HTTP scheme into an anchor. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
