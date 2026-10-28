/**
 * Shnell Business — trip drafts as the dispatcher edits them, and the live
 * view of booked trips. Booking always goes through the server (bizQuote /
 * bizBook in functions/index.js): the browser never prices or writes orders.
 */

export const BIZ_MAX_TRIPS = 100;
export const BIZ_MAX_STOPS = 50;

export interface BizStop {
  uid: string;
  address: string;
  name: string;
  phone: string;
  phone2: string;
  description: string;
  parcelPrice: number | null;
  expeditorId: string;
  lat: number | null;
  lng: number | null;
}

export interface BizQuoteOption {
  type: string;
  name: string;
  price: number;
  maxWeightKg: number | null;
}

export interface BizQuote {
  quoteId: string;
  distanceKm: number;
  currency: string;
  options: BizQuoteOption[];
  minPrice: number;
  maxPrice: number;
  unpriced: string[];
  expiresAtMs: number;
  /** geometry + types this quote was made for (stale when it differs). */
  sig: string;
}

export type BizTripStatus = 'draft' | 'booking' | 'booked' | 'error';

export interface BizTrip {
  key: string;
  /** Booking id: stable per draft so a retried "book" never double-books. */
  requestId: string;
  title: string;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  stops: BizStop[];
  vehicleTypes: string[];
  /** datetime-local value, '' = now. */
  scheduleAt: string;
  notes: string;
  /** Own-fleet driver (no marketplace search), or '' for the marketplace. */
  driverId: string;
  driverName: string;
  roadKm: number | null;
  /** geoSig the route (order + roadKm) was planned for. */
  roadSig: string;
  /** true = the dispatcher's own stop order; false = the app picks the shortest. */
  keepOrder: boolean;
  /** km the optimised order saves over the order as entered (0 = already best). */
  savedKm: number;
  /** roadKm came from a road router (false = straight-line estimate). */
  roadExact: boolean;
  quote: BizQuote | null;
  quoting: boolean;
  status: BizTripStatus;
  error: string;
  orderId: string;
}

export interface VehicleChoice {
  key: string;
  name: string;
  maxWeightKg: number;
  image: string;
}

export interface FleetDriver { id: string; name: string; phone: string; }

/** What the live board shows for one booked trip. */
export type LiveState =
  | 'scheduled' | 'searching' | 'offers' | 'no_driver'
  | 'assigned' | 'in_progress' | 'delivered' | 'canceled' | 'expired';

export interface LiveBid { driverId: string; amount: number; currency: string; vehicleType: string; at: number; }

export interface LiveTrip {
  orderId: string;
  createdAtMs: number;
  pickup: string;
  stopCount: number;
  price: number;
  currency: string;
  types: string[];
  scheduleAtMs: number;
  state: LiveState;
  radiusKm: number | null;
  phase: string;
  deadlineMs: number;
  startsAtMs: number;
  notified: number;
  bids: LiveBid[];
  driverId: string;
  dealId: string;
  dealStatus: string;
  revision: { trips: number; price: number; currency: string } | null;
  ownFleet: boolean;
  /** Own driver who declined this trip (it is unassigned again). */
  fleetDeclinedBy: string | null;
  /** Booked through the public API (not this console). */
  viaApi: boolean;
}

export function rid(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return 'biz_' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newStop(): BizStop {
  return { uid: rid(), address: '', name: '', phone: '', phone2: '', description: '', parcelPrice: null, expeditorId: '', lat: null, lng: null };
}

export function newTrip(n: number): BizTrip {
  return {
    key: rid(), requestId: rid(), title: `Trajet ${n}`,
    pickupAddress: '', pickupLat: null, pickupLng: null,
    stops: [newStop()], vehicleTypes: [], scheduleAt: '', notes: '',
    driverId: '', driverName: '', roadKm: null, roadSig: '', keepOrder: false, savedKm: 0, roadExact: false,
    quote: null, quoting: false, status: 'draft', error: '', orderId: '',
  };
}

/** Located stops only (what the server prices). */
export function locatedStops(t: BizTrip): BizStop[] {
  return t.stops.filter((s) => s.lat != null && s.lng != null);
}

/** Geometry signature (~11 m grid), the same rounding as the server's geoKey. */
export function geoSig(t: BizTrip): string {
  const r = (v: number | null) => Number(v).toFixed(4);
  return [[t.pickupLat, t.pickupLng], ...locatedStops(t).map((s) => [s.lat, s.lng])]
    .map(([a, b]) => `${r(a)},${r(b)}`).join(';');
}

export function quoteSig(t: BizTrip): string {
  return `${geoSig(t)}|${[...t.vehicleTypes].sort().join(',')}`;
}

export function stopHasPhone(s: BizStop): boolean {
  return !!(s.phone.trim() || s.phone2.trim());
}

/** Why this trip can't be booked yet ('' = ready). */
export function tripProblem(t: BizTrip): string {
  if (t.pickupLat == null) return 'Point de retrait manquant';
  const located = locatedStops(t);
  if (!located.length) return 'Au moins un arrêt localisé';
  if (located.length !== t.stops.length) return 'Des arrêts ne sont pas localisés';
  if (t.stops.length > BIZ_MAX_STOPS) return `${BIZ_MAX_STOPS} arrêts maximum`;
  const noPhone = t.stops.findIndex((s) => !stopHasPhone(s));
  if (noPhone >= 0) return `Arrêt ${noPhone + 1} : téléphone obligatoire`;
  if (!t.vehicleTypes.length) return 'Choisissez au moins un véhicule';
  if (!t.quote || t.quote.sig !== quoteSig(t)) return 'Prix à calculer';
  if (t.quote.expiresAtMs < Date.now()) return 'Prix expiré, recalculez';
  return '';
}
