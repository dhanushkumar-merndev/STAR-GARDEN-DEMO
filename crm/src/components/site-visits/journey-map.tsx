'use client';

import * as React from 'react';
import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerTooltip,
} from '@/components/ui/map';

/**
 * Where the designer set off and where they confirmed arrival.
 *
 * The line between the two pins is drawn straight, and the caption says so.
 * The CRM records exactly two GPS fixes — one per tap — and nothing in between,
 * so a road-following polyline would be a route this system invented, shown to
 * an Admin who has no way to tell it apart from a recorded one. A straight line
 * cannot be mistaken for a path anybody drove.
 *
 * CARTO's Positron basemap: free, keyless, and light enough that the pins and
 * the route line stay the most prominent things on it.
 */

export interface JourneyPoint {
  latitude: number;
  longitude: number;
  label: string;
  /** Formatted timestamp, shown under the label in the tooltip. */
  when?: string | null;
}

export function JourneyMap({
  start,
  end,
  destination,
  className = 'h-72',
}: {
  start?: JourneyPoint | null;
  end?: JourneyPoint | null;
  /** The address on file — context for how close the arrival tap landed. */
  destination?: JourneyPoint | null;
  className?: string;
}) {
  const points = React.useMemo(
    () => [start, end, destination].filter((point): point is JourneyPoint => point != null),
    [start, end, destination],
  );

  const view = React.useMemo(() => fitView(points), [points]);

  const route = React.useMemo<[number, number][] | null>(
    () =>
      start && end
        ? [
            [start.longitude, start.latitude],
            [end.longitude, end.latitude],
          ]
        : null,
    [start, end],
  );

  if (points.length === 0 || !view) return null;

  return (
    <div className={`${className} w-full overflow-hidden rounded-lg border border-line`}>
      {/* `theme="light"` pins the CARTO Positron basemap. Left to itself the
          component follows the OS dark-mode setting, and the CRM has no dark
          theme for the chrome around the map to match. */}
      <Map center={view.center} zoom={view.zoom} theme="light">
        {/* Dashed, not solid: a broken line reads as "inferred" where a solid
            one reads as "recorded". */}
        {route ? (
          <MapRoute
            coordinates={route}
            color="#00713e"
            width={3}
            opacity={0.75}
            dashArray={[2, 2]}
            interactive={false}
          />
        ) : null}

        {destination && !sameSpot(destination, end) ? (
          <MapMarker longitude={destination.longitude} latitude={destination.latitude}>
            <MarkerContent>
              <span className="block size-3 rounded-full border-2 border-white bg-[#8b968f] shadow" />
            </MarkerContent>
            <MarkerTooltip>{destination.label}</MarkerTooltip>
          </MapMarker>
        ) : null}

        {start ? (
          <MapMarker longitude={start.longitude} latitude={start.latitude}>
            <MarkerContent>
              <Pin tone="start">A</Pin>
            </MarkerContent>
            <MarkerTooltip>
              {start.label}
              {start.when ? ` · ${start.when}` : ''}
            </MarkerTooltip>
          </MapMarker>
        ) : null}

        {end ? (
          <MapMarker longitude={end.longitude} latitude={end.latitude}>
            <MarkerContent>
              <Pin tone="end">B</Pin>
            </MarkerContent>
            <MarkerTooltip>
              {end.label}
              {end.when ? ` · ${end.when}` : ''}
            </MarkerTooltip>
          </MapMarker>
        ) : null}

        <MapControls />
      </Map>
    </div>
  );
}

/** A and B rather than colour alone, per §16. */
function Pin({ tone, children }: { tone: 'start' | 'end'; children: React.ReactNode }) {
  return (
    <span
      className={`flex size-5 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-md ${
        tone === 'start' ? 'bg-[#4a3aa7]' : 'bg-[#00713e]'
      }`}
    >
      {children}
    </span>
  );
}

function sameSpot(a: JourneyPoint, b?: JourneyPoint | null): boolean {
  if (!b) return false;
  return Math.abs(a.latitude - b.latitude) < 1e-5 && Math.abs(a.longitude - b.longitude) < 1e-5;
}

/**
 * A centre and zoom that hold every pin.
 *
 * MapLibre can fit bounds after load, but doing it here avoids a visible jump
 * from a default viewport to the right one on a slow phone.
 */
function fitView(points: JourneyPoint[]): { center: [number, number]; zoom: number } | null {
  if (points.length === 0) return null;

  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const span = Math.max(maxLat - minLat, maxLng - minLng);

  // Roughly one zoom level per halving of the span, clamped to something that
  // still shows streets at one end and a whole city at the other.
  const zoom = span === 0 ? 15 : Math.min(15, Math.max(9, Math.log2(360 / span) - 1.4));

  return { center, zoom };
}
