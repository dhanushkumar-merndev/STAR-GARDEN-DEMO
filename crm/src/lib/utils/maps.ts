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
