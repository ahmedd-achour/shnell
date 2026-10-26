import { AfterViewChecked, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import mapboxgl from 'mapbox-gl';
import {
  MAPBOX_TOKEN, MAPBOX_STYLE_STREET, GeoHit, mapboxForwardGeocode, mapboxReverseGeocode, mapboxGeocodeOne, makePinEl,
} from '../../shared/mapbox';
import { toastError, toastSuccess, confirmAction } from '../../shared/swal';
import { BizService } from './biz.service';
import {
  BIZ_MAX_STOPS, BIZ_MAX_TRIPS, BizStop, BizTrip, geoSig, locatedStops, newStop, newTrip, quoteSig, rid, tripProblem,
} from './biz-models';

type Target = { trip: string; stop: string | null };   // stop null = pickup

const TN_BOUNDS: [[number, number], [number, number]] = [[6.9, 29.8], [12.3, 38.0]];

/**
 * Shnell Business — define trips on ONE page each: pickup, up to 50 stops,
 * the vehicle types the dispatcher allows, schedule, notes and who drives
 * (marketplace or own fleet). Prices come from the server (bizQuote) as the
 * trip is edited; booking goes through bizBook.
 */
@Component({
  selector: 'app-biz-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './biz-composer.component.html',
  styleUrls: ['./biz.css'],
})
export class BizComposerComponent implements OnInit, AfterViewChecked, OnDestroy {
  @Output() openLive = new EventEmitter<void>();
  @ViewChild('mapEl') mapEl?: ElementRef<HTMLDivElement>;

  biz = inject(BizService);
  readonly maxStops = BIZ_MAX_STOPS;
  readonly maxTrips = BIZ_MAX_TRIPS;
  readonly problem = tripProblem;

  activeKey = '';
  suggest: { target: Target; items: GeoHit[] } | null = null;
  pinTarget: Target | null = null;
  booking = false;
  bookProgress = '';
  pasteFor: string | null = null;
  pasteText = '';
  pasting = false;
  recentPickups: { address: string; lat: number; lng: number }[] = [];

  private map: mapboxgl.Map | null = null;
  private mapFor = '';
  private markers: mapboxgl.Marker[] = [];
  private typeTimer: any = null;
  private quoteTimers = new Map<string, any>();

  get trips(): BizTrip[] { return this.biz.drafts; }
  get active(): BizTrip | undefined { return this.trips.find((t) => t.key === this.activeKey); }
  get readyTrips(): BizTrip[] { return this.trips.filter((t) => t.status !== 'booked' && !tripProblem(t)); }
  get readyTotal(): number { return this.readyTrips.reduce((s, t) => s + (t.quote?.minPrice || 0), 0); }
  get staleCount(): number {
    return this.trips.filter((t) => t.status !== 'booked' && t.pickupLat != null && locatedStops(t).length && t.vehicleTypes.length
      && (!t.quote || t.quote.sig !== quoteSig(t) || t.quote.expiresAtMs < Date.now())).length;
  }

  async ngOnInit(): Promise<void> {
    await this.biz.init();
    if (!this.trips.length) this.biz.drafts = [newTrip(1)];
    this.activeKey = this.trips.find((t) => t.status !== 'booked')?.key || this.trips[0].key;
    try { this.recentPickups = JSON.parse(localStorage.getItem('biz_recent_pickups') || '[]').slice(0, 6); } catch { /* none */ }
  }

  ngAfterViewChecked(): void {
    const t = this.active;
    if (!t || !this.mapEl || !MAPBOX_TOKEN) return;
    if (!this.map || this.mapFor !== t.key || this.map.getContainer() !== this.mapEl.nativeElement) this.buildMap(t);
  }

  ngOnDestroy(): void {
    this.map?.remove();
    clearTimeout(this.typeTimer);
    this.quoteTimers.forEach((x) => clearTimeout(x));
  }

  /* ------------------------------ trips ------------------------------ */

  open(t: BizTrip): void {
    this.activeKey = t.key;
    this.suggest = null;
    this.pinTarget = null;
  }

  addTrip(copyOf?: BizTrip): void {
    if (this.trips.length >= BIZ_MAX_TRIPS) { toastError(`${BIZ_MAX_TRIPS} trajets maximum`); return; }
    const t = newTrip(this.trips.length + 1);
    if (copyOf) {
      Object.assign(t, {
        title: `${copyOf.title} (copie)`,
        pickupAddress: copyOf.pickupAddress, pickupLat: copyOf.pickupLat, pickupLng: copyOf.pickupLng,
        stops: copyOf.stops.map((s) => ({ ...s, uid: rid() })),
        vehicleTypes: [...copyOf.vehicleTypes], scheduleAt: copyOf.scheduleAt, notes: copyOf.notes,
        driverId: copyOf.driverId, driverName: copyOf.driverName,
      });
    }
    this.trips.push(t);
    this.open(t);
    this.changed(t);
  }

  async removeTrip(t: BizTrip): Promise<void> {
    if (t.status !== 'booked' && (t.pickupLat != null || t.stops.some((s) => s.address))) {
      const ok = await confirmAction({ title: 'Supprimer ce trajet ?', text: t.title, confirmText: 'Supprimer' });
      if (!ok) return;
    }
    this.biz.drafts = this.trips.filter((x) => x.key !== t.key);
    if (!this.trips.length) this.biz.drafts = [newTrip(1)];
    if (this.activeKey === t.key) this.open(this.trips[0]);
    this.biz.save();
  }

  clearBooked(): void {
    this.biz.drafts = this.trips.filter((t) => t.status !== 'booked');
    if (!this.trips.length) this.biz.drafts = [newTrip(1)];
    if (!this.active) this.open(this.trips[0]);
    this.biz.save();
  }

  /** Any edit: save, refresh the map, then (after a pause) re-plan the route and re-price. */
  changed(t: BizTrip, geometry = true): void {
    if (t.status === 'error') t.status = 'draft';
    this.biz.save();
    if (geometry && t.key === this.activeKey) this.drawMarkers(t);
    clearTimeout(this.quoteTimers.get(t.key));
    this.quoteTimers.set(t.key, setTimeout(async () => {
      await this.biz.plan(t);
      if (t.key === this.activeKey) this.drawMarkers(t);
      if (t.quote?.sig === quoteSig(t) && t.quote.expiresAtMs > Date.now()) return;
      await this.biz.quote([t]);
    }, 900));
  }

  /* ------------------------------ route ------------------------------ */

  locatedCount(t: BizTrip): number { return locatedStops(t).length; }

  /** Route not yet planned for the current points (the order may still change). */
  planning(t: BizTrip): boolean { return t.pickupLat != null && t.roadSig !== geoSig(t); }

  setOptimize(t: BizTrip, on: boolean): void {
    t.keepOrder = !on;
    t.roadSig = '';
    this.changed(t);
  }

  /* ------------------------------ stops ------------------------------ */

  addStop(t: BizTrip): void {
    if (t.stops.length >= BIZ_MAX_STOPS) { toastError(`${BIZ_MAX_STOPS} arrêts maximum par trajet`); return; }
    t.stops.push(newStop());
    this.biz.save();
  }

  removeStop(t: BizTrip, s: BizStop): void {
    t.stops = t.stops.filter((x) => x.uid !== s.uid);
    if (!t.stops.length) t.stops = [newStop()];
    this.changed(t);
  }

  moveStop(t: BizTrip, i: number, d: -1 | 1): void {
    const j = i + d;
    if (j < 0 || j >= t.stops.length) return;
    [t.stops[i], t.stops[j]] = [t.stops[j], t.stops[i]];
    if (!t.keepOrder) {
      t.keepOrder = true;   // a hand-made order is kept as is
      toastSuccess('Ordre manuel conservé (optimisation désactivée pour ce trajet)');
    }
    this.changed(t);
  }

  /**
   * Paste rows from a spreadsheet: address [TAB] phone [TAB] name [TAB]
   * COD [TAB] note. Each address is geocoded (Tunisia).
   */
  async applyPaste(t: BizTrip): Promise<void> {
    const rows = this.pasteText.split(/\r?\n/).map((l) => l.split('\t').map((c) => c.trim())).filter((r) => r[0]);
    if (!rows.length) return;
    const room = BIZ_MAX_STOPS - t.stops.filter((s) => s.address || s.lat != null).length;
    if (rows.length > room) { toastError(`Il reste ${room} place(s) sur ce trajet`); return; }
    this.pasting = true;
    t.stops = t.stops.filter((s) => s.address || s.lat != null);
    let missed = 0;
    for (const r of rows) {
      const s = newStop();
      s.address = r[0]; s.phone = r[1] || ''; s.name = r[2] || '';
      s.parcelPrice = r[3] && !isNaN(Number(r[3].replace(',', '.'))) ? Number(r[3].replace(',', '.')) : null;
      s.description = r[4] || '';
      const hit = await mapboxGeocodeOne(s.address).catch(() => null);
      if (hit) { s.lat = hit.lat; s.lng = hit.lng; } else missed++;
      t.stops.push(s);
    }
    if (!t.stops.length) t.stops = [newStop()];
    this.pasting = false;
    this.pasteFor = null;
    this.pasteText = '';
    this.changed(t);
    if (missed) toastError(`${missed} adresse(s) non trouvée(s) : placez-les sur la carte`);
    else toastSuccess(`${rows.length} arrêt(s) ajouté(s)`);
  }

  /* ------------------------------ addresses ------------------------------ */

  isSuggestFor(t: BizTrip, s: BizStop | null): boolean {
    return !!this.suggest && this.suggest.target.trip === t.key && this.suggest.target.stop === (s ? s.uid : null);
  }

  onType(t: BizTrip, s: BizStop | null): void {
    const q = s ? s.address : t.pickupAddress;
    if (s) { s.lat = null; s.lng = null; } else { t.pickupLat = null; t.pickupLng = null; }
    clearTimeout(this.typeTimer);
    if (q.trim().length < 3) { this.suggest = null; return; }
    this.typeTimer = setTimeout(async () => {
      const items = await mapboxForwardGeocode(q, 5).catch(() => []);
      this.suggest = { target: { trip: t.key, stop: s ? s.uid : null }, items };
    }, 300);
  }

  choose(t: BizTrip, s: BizStop | null, h: GeoHit): void {
    const lat = Number(h.lat), lng = Number(h.lon);
    if (s) { s.address = h.display_name; s.lat = lat; s.lng = lng; }
    else this.setPickup(t, h.display_name, lat, lng);
    this.suggest = null;
    this.changed(t);
  }

  setPickup(t: BizTrip, address: string, lat: number, lng: number): void {
    t.pickupAddress = address; t.pickupLat = lat; t.pickupLng = lng;
    this.recentPickups = [{ address, lat, lng }, ...this.recentPickups.filter((r) => r.address !== address)].slice(0, 6);
    try { localStorage.setItem('biz_recent_pickups', JSON.stringify(this.recentPickups)); } catch { /* none */ }
  }

  useRecent(t: BizTrip, r: { address: string; lat: number; lng: number }): void {
    this.setPickup(t, r.address, r.lat, r.lng);
    this.changed(t);
  }

  armPin(t: BizTrip, s: BizStop | null): void {
    this.pinTarget = { trip: t.key, stop: s ? s.uid : null };
  }

  isPinFor(t: BizTrip, s: BizStop | null): boolean {
    return !!this.pinTarget && this.pinTarget.trip === t.key && this.pinTarget.stop === (s ? s.uid : null);
  }

  /* ------------------------------ vehicles / driver ------------------------------ */

  toggleType(t: BizTrip, key: string): void {
    t.vehicleTypes = t.vehicleTypes.includes(key) ? t.vehicleTypes.filter((k) => k !== key) : [...t.vehicleTypes, key];
    this.changed(t, false);
  }

  setDriver(t: BizTrip, id: string): void {
    t.driverId = id;
    t.driverName = this.biz.fleet.find((d) => d.id === id)?.name || '';
    this.biz.save();
  }

  priceOf(t: BizTrip, type: string): number | null {
    return t.quote && t.quote.sig === quoteSig(t) ? (t.quote.options.find((o) => o.type === type)?.price ?? null) : null;
  }

  vehicleName(key: string): string { return this.biz.vehicles.find((v) => v.key === key)?.name || key; }

  /* ------------------------------ quote / book ------------------------------ */

  async quoteAll(): Promise<void> {
    const stale = this.trips.filter((t) => t.status !== 'booked' && (!t.quote || t.quote.sig !== quoteSig(t) || t.quote.expiresAtMs < Date.now()));
    await this.biz.quote(stale);
    if (this.active) this.drawMarkers(this.active);
  }

  async bookOne(t: BizTrip): Promise<void> {
    await this.bookTrips([t]);
  }

  async bookAll(): Promise<void> {
    const ready = this.readyTrips;
    if (!ready.length) { toastError('Aucun trajet prêt'); return; }
    const ok = await confirmAction({
      title: `Réserver ${ready.length} trajet(s) ?`,
      text: `À partir de ${Math.round(this.readyTotal)} ${ready[0].quote?.currency || 'TND'} au total. La recherche de chauffeurs démarre aussitôt.`,
      confirmText: 'Réserver',
    });
    if (ok) await this.bookTrips(ready);
  }

  private async bookTrips(list: BizTrip[]): Promise<void> {
    if (this.booking) return;
    if (this.biz.enabled === false) { toastError('Shnell Business n’est pas activé sur ce compte.'); return; }
    const notReady = list.find((t) => tripProblem(t));
    if (notReady) { toastError(`${notReady.title} : ${tripProblem(notReady)}`); return; }
    this.booking = true;
    this.bookProgress = `0/${list.length}`;
    const res = await this.biz.book(list, (n) => (this.bookProgress = `${n}/${list.length}`));
    this.booking = false;
    this.bookProgress = '';
    if (res.ok) toastSuccess(`${res.ok} trajet(s) réservé(s)${res.failed ? `, ${res.failed} en erreur` : ''}`);
    else toastError(`${res.failed} trajet(s) en erreur`);
  }

  /* ------------------------------ map ------------------------------ */

  private buildMap(t: BizTrip): void {
    this.map?.remove();
    (mapboxgl as any).accessToken = MAPBOX_TOKEN;
    this.map = new mapboxgl.Map({
      container: this.mapEl!.nativeElement, style: MAPBOX_STYLE_STREET,
      center: [t.pickupLng ?? 10.1815, t.pickupLat ?? 36.8065], zoom: t.pickupLat != null ? 10 : 6.2,
      maxBounds: TN_BOUNDS, attributionControl: false,
    });
    this.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.on('click', (e) => this.onMapClick(e.lngLat.lat, e.lngLat.lng));
    this.mapFor = t.key;
    this.map.on('load', () => this.drawMarkers(t));
  }

  private async onMapClick(lat: number, lng: number): Promise<void> {
    const target = this.pinTarget;
    const t = target && this.trips.find((x) => x.key === target.trip);
    if (!target || !t) return;
    const address = (await mapboxReverseGeocode(lat, lng).catch(() => null)) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (target.stop === null) this.setPickup(t, address, lat, lng);
    else {
      const s = t.stops.find((x) => x.uid === target.stop);
      if (s) { s.address = address; s.lat = lat; s.lng = lng; }
    }
    this.pinTarget = null;
    this.changed(t);
  }

  private drawMarkers(t: BizTrip): void {
    if (!this.map || this.mapFor !== t.key) return;
    this.markers.forEach((m) => m.remove());
    this.markers = [];
    const bounds = new mapboxgl.LngLatBounds();
    if (t.pickupLat != null) {
      this.markers.push(new mapboxgl.Marker({ element: makePinEl('R', '#0E7A5F', 28) }).setLngLat([t.pickupLng!, t.pickupLat]).addTo(this.map));
      bounds.extend([t.pickupLng!, t.pickupLat]);
    }
    t.stops.forEach((s, i) => {
      if (s.lat == null) return;
      this.markers.push(new mapboxgl.Marker({ element: makePinEl(String(i + 1), '#F59E0B', 24) }).setLngLat([s.lng!, s.lat]).addTo(this.map!));
      bounds.extend([s.lng!, s.lat]);
    });
    // Planned road route when it matches the points; otherwise a dashed straight preview.
    const road = t.roadSig === geoSig(t) ? this.biz.routeLines.get(t.key) : undefined;
    const straight = [[t.pickupLng, t.pickupLat], ...locatedStops(t).map((s) => [s.lng, s.lat])].filter((p) => p[0] != null) as number[][];
    this.setLine('route', road || [], { 'line-color': '#0E7A5F', 'line-width': 4, 'line-opacity': 0.85 });
    this.setLine('route-est', road ? [] : straight, { 'line-color': '#F59E0B', 'line-width': 2, 'line-dasharray': [2, 2] });
    if (!bounds.isEmpty()) this.map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 300 });
  }

  private setLine(id: string, coordinates: number[][], paint: any): void {
    if (!this.map) return;
    const data: any = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
    const src = this.map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else if (this.map.isStyleLoaded()) {
      this.map.addSource(id, { type: 'geojson', data });
      this.map.addLayer({ id, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint });
    }
  }

  trackKey(_: number, x: { key?: string; uid?: string }): string { return (x.key || x.uid)!; }
}
