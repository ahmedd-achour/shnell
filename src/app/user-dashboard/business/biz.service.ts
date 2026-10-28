import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDoc, onSnapshot, query, where, orderBy, limit,
  runTransaction, serverTimestamp, updateDoc, Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { MAPBOX_TOKEN } from '../../shared/mapbox';
import {
  BIZ_MAX_TRIPS, BizTrip, FleetDriver, LiveBid, LiveState, LiveTrip, VehicleChoice,
  geoSig, locatedStops, newTrip, quoteSig,
} from './biz-models';
import { bestOrder, haversineKm, pathCost } from './route-opt';

type LatLng = [number, number];

const OSRM = 'https://router.project-osrm.org';
const ROUTER_TIMEOUT_MS = 12000;
/** Road / straight-line ratio used when a road distance is missing. */
const DETOUR = 1.3;

/** km between every pair of points by road (OSRM table, one call); straight x DETOUR where unknown. */
async function roadMatrix(pts: LatLng[]): Promise<number[][]> {
  const crow = pts.map((a) => pts.map((b) => haversineKm(a, b) * DETOUR));
  try {
    const coords = pts.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
    const res = await fetch(`${OSRM}/table/v1/driving/${coords}?annotations=distance`, { signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS) });
    const body = await res.json();
    if (!res.ok || body?.code !== 'Ok' || !Array.isArray(body.distances)) return crow;
    return body.distances.map((row: (number | null)[], i: number) =>
      row.map((m, j) => (m != null && Number.isFinite(m) ? m / 1000 : crow[i][j])));
  } catch {
    return crow;
  }
}

/**
 * Driving route through the points in this order: Mapbox Directions (25
 * points per request, chained), else OSRM in one request. null if both fail.
 */
async function roadRoute(pts: LatLng[]): Promise<{ km: number; line: number[][] } | null> {
  const coords = (list: LatLng[]) => list.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const fetchRoute = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS) });
    const body = await res.json();
    const r = body?.routes?.[0];
    if (!res.ok || !r || !Number.isFinite(Number(r.distance))) throw new Error('no route');
    return { m: Number(r.distance), line: (r.geometry?.coordinates || []) as number[][] };
  };
  if (MAPBOX_TOKEN) {
    try {
      let m = 0;
      const line: number[][] = [];
      for (let i = 0; i < pts.length - 1; i += 24) {
        const leg = await fetchRoute(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords(pts.slice(i, i + 25))}?overview=full&geometries=geojson&access_token=${MAPBOX_TOKEN}`);
        m += leg.m;
        line.push(...leg.line);
      }
      return { km: Math.round(m / 100) / 10, line };
    } catch { /* fall through to OSRM */ }
  }
  try {
    const r = await fetchRoute(`${OSRM}/route/v1/driving/${coords(pts)}?overview=full&geometries=geojson`);
    return { km: Math.round(r.m / 100) / 10, line: r.line };
  } catch {
    return null;
  }
}

const VEHICLE_ORDER =['super_light', 'popular', 'light', 'light_medium', 'medium', 'medium_heavy', 'heavy', 'super_heavy'];
const BOOK_CHUNK = 20;
const LIVE_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** Callable error -> short French message for a trip card. */
export function bizErrorText(r: { reason?: string | null; message?: string; code?: string }): string {
  switch (r.reason) {
    case 'business_disabled': return 'Shnell Business n’est pas activé sur ce compte.';
    case 'country_unverified': return 'Pays non vérifié, réessayez.';
    case 'cross_border': return 'Retrait et arrêts doivent être dans le même pays.';
    case 'unpriced': return 'Aucun des véhicules choisis n’a de tarif.';
    case 'quote_mismatch': return 'Le trajet a changé depuis le calcul du prix.';
    case 'too_many_open': return `Maximum ${BIZ_MAX_TRIPS} trajets ouverts.`;
    case 'stop_phone': return 'Un arrêt n’a pas de téléphone.';
    case 'not_in_fleet': return 'Ce chauffeur n’est pas dans votre flotte.';
    case 'driver_inactive': return 'Ce chauffeur n’est pas actif.';
    default: return r.message || 'Erreur';
  }
}

/**
 * Shnell Business data layer: drafts (per account, in this browser), the
 * vehicle catalogue, the account's own drivers, server quotes / bookings,
 * and the live view of booked trips.
 */
@Injectable({ providedIn: 'root' })
export class BizService {
  private fs = inject(Firestore);
  private fns = inject(Functions);
  private auth = inject(Auth);

  drafts: BizTrip[] = [];
  vehicles: VehicleChoice[] = [];
  fleet: FleetDriver[] = [];
  /** null while unknown. Admins may always use it. */
  enabled: boolean | null = null;
  private loadedFor = '';
  private saveTimer: any = null;

  get uid(): string { return this.auth.currentUser?.uid || ''; }
  private get storeKey(): string { return `biz_drafts_v1_${this.uid}`; }

  /** Account flag, catalogue, fleet and drafts (once per signed-in account). */
  async init(): Promise<void> {
    const uid = this.uid;
    if (!uid || this.loadedFor === uid) return;
    this.loadedFor = uid;
    const [me, veh] = await Promise.all([
      getDoc(doc(this.fs, 'users', uid)).catch(() => null),
      getDoc(doc(this.fs, 'settings', 'vehicles')).catch(() => null),
    ]);
    const u: any = me?.exists() ? me.data() : {};
    this.enabled = u.business === true || String(u.role || '').toLowerCase() === 'admin';
    this.vehicles = this.catalogue(veh?.exists() ? veh.data() : {});
    this.fleet = await this.loadFleet(Array.isArray(u.drivers) ? u.drivers.map(String) : []);
    this.restore();
  }

  private catalogue(data: any): VehicleChoice[] {
    const keys = Object.keys(data || {}).filter((k) => data[k] && typeof data[k] === 'object' && (data[k].isActive ?? data[k].is_active ?? true) !== false);
    const list = (keys.length ? keys : VEHICLE_ORDER).map((key) => {
      const v = (data || {})[key] || {};
      return {
        key,
        name: String(v.name || key.replace(/_/g, ' ')),
        maxWeightKg: Number(v.max_weight ?? v.maxWeight ?? 0),
        image: vehicleImage(key),
      };
    });
    return list.sort((a, b) => (a.maxWeightKg || 1e9) - (b.maxWeightKg || 1e9) || a.name.localeCompare(b.name));
  }

  /** Re-reads users/{uid}.drivers (a driver accepted or left an invitation). */
  async reloadFleet(): Promise<void> {
    const uid = this.uid;
    if (!uid) return;
    const me = await getDoc(doc(this.fs, 'users', uid)).catch(() => null);
    const u: any = me?.exists() ? me.data() : {};
    this.fleet = await this.loadFleet(Array.isArray(u.drivers) ? u.drivers.map(String) : []);
  }

  private async loadFleet(ids: string[]): Promise<FleetDriver[]> {
    const rows = await Promise.all(ids.slice(0, 200).map(async (id) => {
      const s = await getDoc(doc(this.fs, 'users', id)).catch(() => null);
      const d: any = s?.exists() ? s.data() : null;
      return d ? { id, name: d.name || 'Chauffeur', phone: d.phone || '' } : null;
    }));
    return rows.filter((r): r is FleetDriver => !!r);
  }

  /* ------------------------------ drafts ------------------------------ */

  private restore(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storeKey) || '[]');
      if (Array.isArray(saved) && saved.length) {
        this.drafts = saved.map((t: BizTrip) => ({ ...newTrip(1), ...t, quoting: false, status: t.status === 'booking' ? 'draft' : t.status }));
        return;
      }
    } catch { /* storage unavailable */ }
    if (!this.drafts.length) this.drafts = [newTrip(1)];
  }

  save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(this.storeKey, JSON.stringify(this.drafts)); } catch { /* storage unavailable */ }
    }, 400);
  }

  /* ------------------------------ route planning ------------------------------ */

  /** Road line of each trip's last plan (memory only: too big for localStorage). */
  routeLines = new Map<string, number[][]>();
  private matrixQueue: Promise<unknown> = Promise.resolve();

  /**
   * ONE route for the whole trip: pickup -> every stop once, shortest order.
   * Road distances between all points come from a single matrix call, the
   * order is optimised on them (unless the dispatcher locked it), then the
   * road route is fetched once for its distance and map line. Straight-line
   * estimates stand in when a router is unreachable; the server never
   * prices below the straight line anyway.
   */
  async plan(t: BizTrip): Promise<void> {
    const sig = geoSig(t);
    if (t.roadSig === sig) return;
    const located = locatedStops(t);
    if (t.pickupLat == null || t.pickupLng == null || !located.length) {
      Object.assign(t, { roadKm: null, roadExact: false, savedKm: 0, roadSig: sig });
      this.routeLines.delete(t.key);
      return;
    }
    const pts: LatLng[] = [[t.pickupLat, t.pickupLng], ...located.map((s) => [s.lat!, s.lng!] as LatLng)];
    const asEntered = pts.map((_, i) => i);
    let order = asEntered;
    let saved = 0;
    if (!t.keepOrder && located.length > 1) {
      const d = await this.queued(() => roadMatrix(pts));
      order = bestOrder(d);
      saved = pathCost(d, asEntered) - pathCost(d, order);
    }
    if (geoSig(t) !== sig) return;   // edited meanwhile: the next plan wins
    if (order.some((v, i) => v !== i)) {
      t.stops = [...order.slice(1).map((i) => located[i - 1]), ...t.stops.filter((s) => s.lat == null || s.lng == null)];
    }
    const planned = geoSig(t);
    const route = await roadRoute(order.map((i) => pts[i]));
    if (geoSig(t) !== planned) return;
    Object.assign(t, {
      roadKm: route ? route.km : null, roadExact: !!route,
      savedKm: Math.round(Math.max(0, saved) * 10) / 10, roadSig: planned,
    });
    if (route) this.routeLines.set(t.key, route.line); else this.routeLines.delete(t.key);
    this.save();
  }

  /** The public OSRM server asks for gentle use: one matrix at a time. */
  private queued<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.matrixQueue.then(fn, fn);
    this.matrixQueue = run.catch(() => undefined);
    return run;
  }

  /* ------------------------------ server ------------------------------ */

  /** Prices `trips` server-side (bizQuote); fills trip.quote or trip.error. */
  async quote(trips: BizTrip[]): Promise<void> {
    const todo = trips.filter((t) => t.pickupLat != null && locatedStops(t).length && t.vehicleTypes.length);
    if (!todo.length) return;
    for (const t of todo) { t.quoting = true; t.error = ''; }
    try {
      await Promise.all(todo.map((t) => this.plan(t)));
      const fn = httpsCallable<any, { results: any[] }>(this.fns, 'bizQuote', { timeout: 90000 });
      const { data } = await fn({
        trips: todo.map((t) => ({
          key: t.key,
          pickup: { lat: t.pickupLat, lng: t.pickupLng },
          stops: locatedStops(t).map((s) => ({ lat: s.lat, lng: s.lng })),
          vehicleTypes: t.vehicleTypes,
          distanceKm: t.roadKm || undefined,
          countryCode: 'TN',
        })),
      });
      for (const r of data.results || []) {
        const t = todo.find((x) => x.key === r.key);
        if (!t) continue;
        if (r.ok) {
          t.quote = {
            quoteId: r.quoteId, distanceKm: r.distanceKm, currency: r.currency, options: r.options || [],
            minPrice: r.minPrice, maxPrice: r.maxPrice, unpriced: r.unpriced || [], expiresAtMs: r.expiresAtMs, sig: quoteSig(t),
          };
        } else {
          t.quote = null;
          t.error = bizErrorText(r);
        }
      }
    } catch (e: any) {
      for (const t of todo) t.error = e?.message || 'Calcul du prix impossible';
    } finally {
      for (const t of todo) t.quoting = false;
      this.save();
    }
  }

  /** Books ready trips (bizBook), BOOK_CHUNK per call; marks each trip. */
  async book(trips: BizTrip[], onProgress?: (done: number) => void): Promise<{ ok: number; failed: number }> {
    let ok = 0, failed = 0;
    const fn = httpsCallable<any, { results: any[] }>(this.fns, 'bizBook', { timeout: 300000 });
    for (let i = 0; i < trips.length; i += BOOK_CHUNK) {
      const chunk = trips.slice(i, i + BOOK_CHUNK);
      chunk.forEach((t) => { t.status = 'booking'; t.error = ''; });
      try {
        const { data } = await fn({ trips: chunk.map((t) => this.bookingOf(t)) });
        for (const r of data.results || []) {
          const t = chunk.find((x) => x.requestId === r.requestId);
          if (!t) continue;
          if (r.ok) { t.status = 'booked'; t.orderId = r.orderId; ok++; }
          else { t.status = 'error'; t.error = bizErrorText(r); failed++; }
        }
      } catch (e: any) {
        chunk.forEach((t) => { if (t.status === 'booking') { t.status = 'error'; t.error = e?.message || 'Échec'; failed++; } });
      }
      this.save();
      onProgress?.(Math.min(i + BOOK_CHUNK, trips.length));
    }
    return { ok, failed };
  }

  private bookingOf(t: BizTrip): any {
    const scheduleMs = t.scheduleAt ? new Date(t.scheduleAt).getTime() : 0;
    return {
      requestId: t.requestId,
      driverId: t.driverId || undefined,
      order: {
        namePickUp: t.pickupAddress.trim(),
        pickUpLocation: { coordinates: [Number(t.pickupLng), Number(t.pickupLat)] },
        quoteId: t.quote?.quoteId,
        scheduleAtMs: scheduleMs > Date.now() ? scheduleMs : undefined,
        notes: t.notes.trim() || undefined,
        category: 'eco',
      },
      stops: t.stops.map((s) => ({
        destination: { latitude: Number(s.lat), longitude: Number(s.lng) },
        destinationName: s.address.trim(),
        name: s.name.trim(),
        receiverPhone: s.phone.trim(),
        receiverPhone2: s.phone2.trim(),
        description: s.description.trim(),
        parcelPrice: s.parcelPrice != null && !isNaN(Number(s.parcelPrice)) ? Number(s.parcelPrice) : undefined,
        expeditorId: s.expeditorId.trim(),
      })),
    };
  }

  /* ------------------------------ live trips ------------------------------ */

  /**
   * Every booked trip of the account (last 7 days + anything still open),
   * merged from five listeners: orders x2, searches, offers, deals.
   */
  watchLive(cb: (trips: LiveTrip[]) => void): () => void {
    const uid = this.uid;
    if (!uid) return () => {};
    const orders = new Map<string, any>();
    const recent = new Map<string, any>();
    const open = new Map<string, any>();
    const searches = new Map<string, any>();
    let bids: any[] = [];
    let deals: any[] = [];
    const emit = () => {
      orders.clear();
      for (const [k, v] of recent) orders.set(k, v);
      for (const [k, v] of open) orders.set(k, v);
      cb([...orders.values()]
        .filter((o) => /^(business|api)/.test(String(o.createdVia || '')) || o.dispatchMode === 'multi' || o.chosenDriver)
        .map((o) => this.liveOf(o, searches.get(o.id), bids.filter((b) => b.idOrder === o.id), deals.filter((d) => d.idOrder === o.id)))
        .sort((a, b) => b.createdAtMs - a.createdAtMs));
    };
    const subs = [
      onSnapshot(query(collection(this.fs, 'orders'), where('clientId', '==', uid),
        where('timestamp', '>=', Timestamp.fromMillis(Date.now() - LIVE_WINDOW_MS)), orderBy('timestamp', 'asc')),
        (s) => { recent.clear(); s.forEach((d) => recent.set(d.id, { ...d.data(), id: d.id })); emit(); }, (e) => console.warn('[biz] orders', e)),
      onSnapshot(query(collection(this.fs, 'orders'), where('clientId', '==', uid), where('isAccepted', '==', false), limit(BIZ_MAX_TRIPS + 50)),
        (s) => { open.clear(); s.forEach((d) => open.set(d.id, { ...d.data(), id: d.id })); emit(); }, (e) => console.warn('[biz] open', e)),
      onSnapshot(query(collection(this.fs, 'dispatch_searches'), where('orderSummary.clientId', '==', uid), limit(400)),
        (s) => { searches.clear(); s.forEach((d) => searches.set(d.id, d.data())); emit(); }, (e) => console.warn('[biz] searches', e)),
      onSnapshot(query(collection(this.fs, 'bids'), where('idUser', '==', uid), where('isActive', '==', true), limit(500)),
        (s) => { bids = s.docs.map((d) => ({ ...d.data(), id: d.id })); emit(); }, (e) => console.warn('[biz] bids', e)),
      onSnapshot(query(collection(this.fs, 'deals'), where('idUser', '==', uid), orderBy('timestamp', 'desc'), limit(300)),
        (s) => { deals = s.docs.map((d) => ({ ...d.data(), id: d.id })); emit(); }, (e) => console.warn('[biz] deals', e)),
    ];
    return () => subs.forEach((u) => u());
  }

  private liveOf(o: any, s: any, bids: any[], deals: any[]): LiveTrip {
    const ms = (v: any) => (v?.toMillis ? v.toMillis() : Number(v) || 0);
    const deal = deals.find((d) => ['accepted', 'almost', 'terminated'].includes(String(d.status))) || null;
    let state: LiveState;
    if (o.status === 'canceled') state = 'canceled';
    else if (o.status === 'expired') state = 'expired';
    else if (deal?.status === 'terminated') state = 'delivered';
    else if (deal?.status === 'almost') state = 'in_progress';
    else if (deal || o.chosenDriver) state = 'assigned';
    // Own driver declined (declineFleetJob): nothing searches until Relancer.
    else if (o.fleetDeclined && !s) state = 'no_driver';
    else if (s?.status === 'scheduled') state = 'scheduled';
    else if (bids.length) state = 'offers';
    else if (s?.status === 'searching' || !s) state = 'searching';
    else state = 'no_driver';
    const rev = deal?.revision?.status === 'pending'
      ? { trips: Number(deal.revision.trips) || 0, price: Number(deal.revision.price ?? deal.revision.total) || 0, currency: String(deal.revision.currency || o.currencyCode || 'TND') }
      : null;
    return {
      orderId: o.id,
      createdAtMs: ms(o.timestamp),
      pickup: String(o.namePickUp || ''),
      stopCount: Array.isArray(o.stops) ? o.stops.length : 0,
      price: Number(deal?.agreedPrice ?? o.price) || 0,
      currency: String(o.currencyCode || 'TND'),
      types: Array.isArray(o.eligibleVehicleTypes) && o.eligibleVehicleTypes.length ? o.eligibleVehicleTypes : [o.vehicleType].filter(Boolean),
      scheduleAtMs: ms(o.scheduleAt),
      state,
      radiusKm: s?.radiusKm ?? null,
      phase: String(s?.phase || ''),
      deadlineMs: ms(s?.deadlineAt),
      startsAtMs: ms(s?.startsAt),
      notified: Object.keys(s?.notifiedDriverIds || {}).length,
      bids: bids.map((b): LiveBid => ({
        driverId: String(b.idDriver), amount: Number(b.amount) || 0,
        currency: String(b.currencyCode || o.currencyCode || 'TND'), vehicleType: String(b.vehicleType || ''), at: ms(b.timestamp),
      })).sort((a, b) => a.amount - b.amount),
      driverId: String(deal?.idDriver || o.chosenDriver || ''),
      dealId: deal?.id || '',
      dealStatus: String(deal?.status || ''),
      revision: rev,
      ownFleet: String(o.createdVia || '').endsWith('_fleet'),
      fleetDeclinedBy: !deal && o.fleetDeclined?.driverId ? String(o.fleetDeclined.driverId) : null,
      viaApi: String(o.createdVia || '').startsWith('api'),
    };
  }

  /* ------------------------------ actions (same writes as the client app) ------------------------------ */

  /** Accepts a driver's offer at its live amount (BidAcceptService in the client app). */
  async acceptBid(orderId: string, driverId: string, shownAmount: number): Promise<void> {
    const uid = this.uid;
    await runTransaction(this.fs, async (tx) => {
      const orderRef = doc(this.fs, 'orders', orderId);
      const fresh = await tx.get(orderRef);
      const o: any = fresh.data();
      if (!fresh.exists() || o.isAccepted === true || o.status === 'canceled' || String(o.chosenDriver || '')) {
        throw new Error('Ce trajet est déjà pris.');
      }
      const bidSnap = await tx.get(doc(this.fs, 'bids', `${orderId}_${driverId}`));
      const b: any = bidSnap.data();
      const amount = Number(b?.amount);
      if (!bidSnap.exists() || b.isActive !== true || amount !== shownAmount) throw new Error('Cette offre a changé, rechargez.');
      tx.set(doc(collection(this.fs, 'deals')), {
        idDriver: driverId, idOrder: orderId, idUser: uid, status: 'accepted',
        timestamp: serverTimestamp(), createdBy: uid, agreedPrice: amount,
      });
      tx.update(orderRef, { isAccepted: true, chosenDriver: driverId, price: amount });
    });
  }

  /** Cancels a trip nobody holds yet (pending_order_widget in the client app). */
  async cancelOrder(orderId: string): Promise<void> {
    await updateDoc(doc(this.fs, 'orders', orderId), {
      isAccepted: true, status: 'canceled', canceledBy: this.uid, canceledAt: serverTimestamp(),
    });
  }

  /** Cancels an assigned trip with a reason (cancel_ride_sheet in the client app). */
  async cancelDeal(dealId: string, reason: string, note: string, rebook: boolean): Promise<void> {
    await updateDoc(doc(this.fs, 'deals', dealId), {
      status: 'canceled', canceledBy: this.uid, canceledAt: serverTimestamp(),
      cancelReason: reason, cancelNote: note, cancelRebook: rebook,
    });
  }

  /** The driver's phone on a live trip of this account (tripContactPhone). */
  async driverPhone(orderId: string): Promise<{ phone: string; name: string }> {
    const r = await httpsCallable<any, { phone: string; name: string }>(this.fns, 'tripContactPhone')({ orderId });
    return r.data;
  }

  async retry(orderId: string): Promise<void> {
    await httpsCallable(this.fns, 'retryOrderDispatch', { timeout: 60000 })({ orderId });
  }

  async respondRevision(dealId: string, decision: 'accept' | 'decline' | 'cancel'): Promise<void> {
    await httpsCallable(this.fns, 'respondTripRevision')({ dealId, decision });
  }

  /** Names of drivers on the board (cached). */
  private names = new Map<string, string>();
  async driverName(id: string): Promise<string> {
    if (!id) return '';
    if (this.names.has(id)) return this.names.get(id)!;
    const s = await getDoc(doc(this.fs, 'publicProfiles', id)).catch(() => null);
    const d: any = s?.exists() ? s.data() : {};
    const name = String(d.name || d.displayName || 'Chauffeur');
    this.names.set(id, name);
    return name;
  }
}

export function vehicleImage(key: string): string {
  const k = (key || '').toLowerCase();
  const known = ['super_light', 'light', 'light_medium', 'medium', 'medium_heavy', 'heavy', 'super_heavy', 'popular', 'isuzu'];
  if (known.includes(k)) return `assets/trucks/${k}.png`;
  if (k.includes('super_heavy')) return 'assets/trucks/super_heavy.png';
  if (k.includes('medium_heavy')) return 'assets/trucks/medium_heavy.png';
  if (k.includes('heavy')) return 'assets/trucks/heavy.png';
  if (k.includes('medium')) return 'assets/trucks/medium.png';
  if (k.includes('light')) return 'assets/trucks/light.png';
  if (k.includes('popular')) return 'assets/trucks/popular.png';
  return 'assets/trucks/medium.png';
}
