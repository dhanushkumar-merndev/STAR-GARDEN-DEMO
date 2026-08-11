import { describe, expect, it } from 'vitest';
import {
  googleMapsDirectionsUrl,
  googleMapsViewUrl,
  safeHttpUrl,
} from '../../src/lib/utils/maps';

describe('Google Maps links', () => {
  it('prefers precise coordinates for a map pin', () => {
    const url = new URL(
      googleMapsViewUrl({ latitude: 12.971599, longitude: 77.594566, address: 'Ignored' })!,
    );
    expect(url.pathname).toBe('/maps/search/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('query')).toBe('12.971599,77.594566');
  });

  it('uses the visit address as the directions destination', () => {
    const url = new URL(googleMapsDirectionsUrl({ address: 'Whitefield, Bengaluru' })!);
    expect(url.pathname).toBe('/maps/dir/');
    expect(url.searchParams.get('destination')).toBe('Whitefield, Bengaluru');
    expect(url.searchParams.has('origin')).toBe(false);
  });

  it('returns null when no location is available', () => {
    expect(googleMapsViewUrl({})).toBeNull();
    expect(googleMapsDirectionsUrl({ address: '  ' })).toBeNull();
  });

  it('rejects active or malformed user-supplied URL schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl('https://maps.app.goo.gl/example')).toBe(
      'https://maps.app.goo.gl/example',
    );
  });
});
