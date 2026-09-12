/**
 * Shared Mapbox helpers — a single place for the access token, the base
 * styles and the geocoding calls so every map in the app behaves the same.
 *
 * Only the PUBLIC (`pk.`) token is ever used here; it is safe to ship in the
 * bundle. Never place a secret (`sk.`) token in front-end code.
 *
 * The token itself comes from Firebase Remote Config (not hardcoded here) so
 * it can be rotated without a rebuild — `RemoteConfigService` sets it via
 * `setMapboxToken()` once the initial fetch completes.
 */
export let MAPBOX_TOKEN = '';

export function setMapboxToken(token: string): void {
  MAPBOX_TOKEN = token;
}

/** Vector base styles used across the dashboards. */
export const MAPBOX_STYLE_STREET = 'mapbox://styles/mapbox/light-v11';
export const MAPBOX_STYLE_DARK = 'mapbox://styles/mapbox/dark-v11';
export const MAPBOX_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';

/** Tunisia bounding box [west, south, east, north] and centre [lng, lat]. */
export const TN_BBOX: [number, number, number, number] = [7.4, 30.0, 11.8, 37.7];
export const TN_CENTER_LNGLAT: [number, number] = [10.1815, 36.8065];

/**
 * Normalise a stored coordinate pair to `[lng, lat]`.
 *
 * Some records in the RTDB / Firestore are `[lng, lat]` (GeoJSON) and some are
 * `[lat, lng]`. For Tunisia the ranges don't overlap (lat ≈ 30–38, lng ≈ 7–12),
 * so we can always tell them apart — this stops a swapped record rendering in
 * the sea. Falls back to assuming `[lng, lat]` when it can't decide.
 */
export function tnLngLat(coords: [number, number] | number[] | undefined | null): [number, number] | null {
  if (!coords || coords.length < 2) return null;
  const a = Number(coords[0]);
  const b = Number(coords[1]);
  if (!isFinite(a) || !isFinite(b)) return null;
  const isLat = (v: number) => v >= 29 && v <= 39;
  const isLng = (v: number) => v >= 6 && v <= 13;
  if (isLng(a) && isLat(b)) return [a, b];          // already [lng, lat]
  if (isLat(a) && isLng(b)) return [b, a];          // stored [lat, lng] -> swap
  return [a, b];                                    // unknown -> assume [lng, lat]
}

export interface GeoHit {
  /** Short, human label (drop-in for Nominatim `display_name`). */
  display_name: string;
  /** Latitude as a string (drop-in for Nominatim `lat`). */
  lat: string;
  /** Longitude as a string (drop-in for Nominatim `lon`). */
  lon: string;
  /** Feature granularity, roughly matching Mapbox `place_type`. */
  place_type: string[];
}

function shortLabel(props: any): string {
  const name = props?.name || '';
  const ctx = props?.place_formatted || props?.full_address || '';
  if (name && ctx) return `${name}, ${ctx}`.split(',').slice(0, 3).join(', ').trim();
  return (name || ctx || '').split(',').slice(0, 3).join(', ').trim();
}

// Valid Mapbox Geocoding **v6** feature types (no `poi` — that only exists in v5).
const V6_TYPES = 'address,street,place,locality,neighborhood,region,district,postcode';
const TN_BBOX_STR = TN_BBOX.join(',');

/**
 * Forward geocode restricted to Tunisia. Tries Geocoding v6, then falls back to
 * v5 (`mapbox.places`, which also matches POIs and does autocomplete well).
 * Returns a Nominatim-shaped array so existing templates keep working.
 */
export async function mapboxForwardGeocode(query: string, limit = 6): Promise<GeoHit[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  // ---- v6 ----
  try {
    const url =
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}` +
      `&country=tn&limit=${limit}&language=fr&autocomplete=true&types=${V6_TYPES}` +
      `&bbox=${TN_BBOX_STR}&proximity=${TN_CENTER_LNGLAT.join(',')}` +
      `&access_token=${MAPBOX_TOKEN}`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      const feats: any[] = Array.isArray(data?.features) ? data.features : [];
      const hits = feats.map((f) => {
        const coords = f?.geometry?.coordinates || [];
        const props = f?.properties || {};
        return {
          display_name: shortLabel(props) || `${coords[1]}, ${coords[0]}`,
          lat: String(coords[1] ?? ''),
          lon: String(coords[0] ?? ''),
          place_type: [props?.feature_type || 'place'],
        } as GeoHit;
      }).filter((h) => h.lat && h.lon);
      if (hits.length) return hits;
    }
  } catch { /* fall through to v5 */ }

  // ---- v5 fallback ----
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?country=tn&language=fr&limit=${limit}&autocomplete=true&fuzzyMatch=true` +
      `&bbox=${TN_BBOX_STR}&proximity=${TN_CENTER_LNGLAT.join(',')}` +
      `&access_token=${MAPBOX_TOKEN}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    const feats: any[] = Array.isArray(data?.features) ? data.features : [];
    return feats.map((f) => {
      const c = f?.center || f?.geometry?.coordinates || [];
      return {
        display_name: String(f?.place_name || f?.text || `${c[1]}, ${c[0]}`)
          .split(',').slice(0, 3).join(', ').trim(),
        lat: String(c[1] ?? ''),
        lon: String(c[0] ?? ''),
        place_type: Array.isArray(f?.place_type) ? f.place_type : ['place'],
      } as GeoHit;
    }).filter((h) => h.lat && h.lon);
  } catch {
    return [];
  }
}

/** Reverse geocode a point to a short label. Tries v6, then v5. */
export async function mapboxReverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}` +
      `&language=fr&access_token=${MAPBOX_TOKEN}`;
    const resp = await fetch(url);
    if (resp.ok) {
      const f = ((await resp.json())?.features || [])[0];
      if (f) { const s = shortLabel(f.properties); if (s) return s; }
    }
  } catch { /* fall through */ }
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?language=fr&limit=1&access_token=${MAPBOX_TOKEN}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const f = ((await resp.json())?.features || [])[0];
    return f ? String(f.place_name || f.text || '').split(',').slice(0, 3).join(', ').trim() || null : null;
  } catch {
    return null;
  }
}

/** Single-result forward geocode returning the `{lat,lng,formatted_address}` shape. */
export async function mapboxGeocodeOne(
  address: string,
): Promise<{ lat: number; lng: number; formatted_address: string } | null> {
  const hits = await mapboxForwardGeocode(address, 1);
  if (!hits.length) return null;
  return {
    lat: parseFloat(hits[0].lat),
    lng: parseFloat(hits[0].lon),
    formatted_address: hits[0].display_name,
  };
}

/**
 * A compact map marker element for a fleet vehicle. Kept intentionally small
 * (default 26px) so a crowded map still reads cleanly. Pass `live` for the
 * soft pulsing halo used on the realtime map.
 */
export function makeTruckMarkerEl(imgUrl: string, opts: { size?: number; live?: boolean } = {}): HTMLElement {
  const size = opts.size ?? 26;
  // Mapbox writes an inline `transform` to the marker's root element every
  // frame — so the root MUST stay transform/transition-free. All visuals live
  // on an inner node.
  const wrap = document.createElement('div');
  wrap.className = 'mbx-marker';
  const el = document.createElement('div');
  el.className = 'mbx-truck' + (opts.live ? ' mbx-truck--live' : '');
  el.style.setProperty('--mbx-size', `${size}px`);
  el.innerHTML =
    (opts.live ? '<span class="mbx-truck__pulse"></span>' : '') +
    `<span class="mbx-truck__core"><img src="${imgUrl}" alt="" ` +
    `onerror="this.src='assets/trucks/medium.png'"></span>`;
  wrap.appendChild(el);
  return wrap;
}

/** A small lettered/numbered pin element (pickup = A, stops = 1..n). */
export function makePinEl(label: string, bg: string, size = 26): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mbx-marker';
  const el = document.createElement('div');
  el.className = 'mbx-pin';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.background = bg;
  const inner = document.createElement('span');
  inner.textContent = label;
  el.appendChild(inner);
  wrap.appendChild(el);
  return wrap;
}

/** A tiny dot marker for dense point layers (e.g. the pro-user parcel map). */
export function makeDotEl(bg: string, size = 12): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mbx-marker';
  const el = document.createElement('div');
  el.className = 'mbx-dot';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.background = bg;
  wrap.appendChild(el);
  return wrap;
}
