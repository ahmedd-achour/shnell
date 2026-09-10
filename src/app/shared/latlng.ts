/**
 * Minimal lat/lng value type — a drop-in replacement for Leaflet's `L.LatLng`
 * for the parts of the app that only ever read `.lat` / `.lng`. Keeps the
 * dashboards off the Leaflet runtime now that maps are Mapbox GL.
 */
export class LatLng {
  constructor(public lat: number, public lng: number) {}
}

/** Accepts `{ lat, lng }` (e.g. parsed from localStorage) and returns a LatLng. */
export function latLng(o: { lat: number; lng: number } | null | undefined): LatLng | null {
  if (!o || typeof o.lat !== 'number' || typeof o.lng !== 'number') return null;
  return new LatLng(o.lat, o.lng);
}
