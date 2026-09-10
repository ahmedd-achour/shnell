import { Component, Input, Output, EventEmitter, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc, doc, setDoc, serverTimestamp, Timestamp } from '@angular/fire/firestore';
import mapboxgl from 'mapbox-gl';
import { ShnellUser, Vehicle, DriverRTDBLocation } from '../../models/dashboard.models';
import {
  MAPBOX_TOKEN, MAPBOX_STYLE_STREET, makePinEl, tnLngLat,
  mapboxForwardGeocode, mapboxReverseGeocode,
} from '../../../shared/mapbox';
import { CrossTabSyncService } from '../../../services/cross-tab-sync.service';
import { NotificationService } from '../../services/notification.service';
import { toastSuccess, toastError } from '../../../shared/swal';

interface StopRow {
  name: string;
  lat: number;
  lng: number;
  phone: string;          // optional -> written as receiverPhone
  searchQuery: string;
  results: any[];
}

type LocTarget = { kind: 'pickup' } | { kind: 'stop'; index: number };

@Component({
  selector: 'app-dispatch-order-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dispatch-order-tab.component.html',
  styleUrls: ['./dispatch-order-tab.component.css']
})
export class DispatchOrderTabComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() users: ShnellUser[] = [];
  @Input() vehicles: Vehicle[] = [];
  @Input() driverLocations: DriverRTDBLocation[] = [];

  @Output() navigateTab = new EventEmitter<string>();
  @Output() inspectDriver = new EventEmitter<string>();

  @ViewChild('dispatchMapElement') mapElementRef!: ElementRef<HTMLDivElement>;

  readonly steps = ['Driver', 'Route & stops', 'Order details', 'Review'];
  currentStep = 1;

  // Order model
  selectedUserId = 'ADMIN_CONSOLE';
  customerSearch = '';
  selectedDriverId = '';
  vehicleType = 'camion';
  price: number = 45;
  distance: number = 0;
  scheduleAt: string | null = null;
  budget: number | null = null;
  notes: string | null = null;
  selectedOptionalAssets: string[] = [];

  // Pickup
  pickupName = 'Avenue Habib Bourguiba, Tunis';
  pickupLat = 36.8065;
  pickupLng = 10.1815;
  pickupSearch = '';
  pickupResults: any[] = [];

  // Stops (>=1)
  stops: StopRow[] = [
    { name: 'Les Berges du Lac 2, Tunis', lat: 36.8350, lng: 10.2400, phone: '', searchQuery: '', results: [] }
  ];

  // Which location the next map click places
  locTarget: LocTarget = { kind: 'pickup' };
  isSearchingGeocode = false;

  private map: mapboxgl.Map | null = null;
  private mapLoaded = false;
  private pickupMarker: mapboxgl.Marker | null = null;
  private stopMarkers: mapboxgl.Marker[] = [];
  private driverMarker: mapboxgl.Marker | null = null;

  availableOptionalAssets: string[] = [
    'Heavy Straps', 'Moving Blankets', 'Hand Truck / Trolley',
    'Extra Helper / Loader', 'Packaging Boxes', 'Disassembly Tools'
  ];
  vehicleTypeList: string[] = ['super_light', 'light', 'medium', 'medium_heavy', 'heavy', 'super_heavy', 'popular'];

  driverSearchQuery = '';
  isSubmitting = false;
  successOrderInfo: { orderId: string; driverName: string; distanceToPickup: number; stopIds: string[]; dealId: string } | null = null;
  errorMessage: string | null = null;

  constructor(
    private firestore: Firestore,
    private crossTabSyncService: CrossTabSyncService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    const firstDriver = this.driverUsers[0];
    if (firstDriver) this.selectedDriverId = firstDriver.uid || firstDriver.id || '';
    this.recalcDistance();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 150);
  }

  ngOnDestroy(): void {
    if (this.map) { this.map.remove(); this.map = null; }
  }

  // ---------- Stepper ----------
  goToStep(n: number): void {
    if (n < 1 || n > this.steps.length) return;
    if (n > this.currentStep && !this.canLeave(this.currentStep)) return;
    this.currentStep = n;
    if (n === 2) setTimeout(() => { this.map?.resize(); this.drawMap(); }, 150);
  }
  next(): void { this.goToStep(this.currentStep + 1); }
  prev(): void { this.goToStep(this.currentStep - 1); }

  canLeave(step: number): boolean {
    if (step === 1) return !!this.selectedDriverId;
    if (step === 2) return !!this.pickupName.trim() && this.stops.every(s => !!s.name.trim());
    return true;
  }
  get canDispatch(): boolean {
    return !!this.selectedDriverId && !!this.pickupName.trim()
      && this.stops.length > 0 && this.stops.every(s => !!s.name.trim())
      && !this.isSubmitting;
  }

  // ---------- Drivers / customers ----------
  get driverUsers(): ShnellUser[] { return this.users.filter(u => u.role === 'driver'); }
  get customerUsers(): ShnellUser[] { return this.users.filter(u => u.role !== 'driver'); }

  /** Searchable customer list — name / phone / uid / email, capped. */
  get filteredCustomers(): ShnellUser[] {
    const q = this.customerSearch.toLowerCase().trim();
    const base = this.customerUsers;
    if (!q) return base.slice(0, 20);
    return base.filter(u =>
      u.name?.toLowerCase().includes(q) || u.phone?.includes(q) ||
      u.email?.toLowerCase().includes(q) || (u.uid || u.id || '').toLowerCase().includes(q)
    ).slice(0, 25);
  }
  get selectedCustomer(): ShnellUser | undefined {
    if (!this.selectedUserId || this.selectedUserId === 'ADMIN_CONSOLE') return undefined;
    return this.users.find(u => (u.uid || u.id) === this.selectedUserId);
  }
  selectCustomer(u: ShnellUser | null): void {
    this.selectedUserId = u ? (u.uid || u.id || 'ADMIN_CONSOLE') : 'ADMIN_CONSOLE';
    this.customerSearch = '';
  }

  get filteredDrivers(): ShnellUser[] {
    const q = this.driverSearchQuery.toLowerCase().trim();
    if (!q) return this.driverUsers;
    return this.driverUsers.filter(d =>
      d.name?.toLowerCase().includes(q) || d.phone?.includes(q) ||
      d.email?.toLowerCase().includes(q) || (d.uid || d.id || '').toLowerCase().includes(q));
  }
  get selectedDriver(): ShnellUser | undefined {
    return this.users.find(u => (u.uid || u.id) === this.selectedDriverId);
  }
  get selectedDriverVehicle(): Vehicle | undefined {
    if (!this.selectedDriverId) return undefined;
    return this.vehicles.find(v => v.idDriver === this.selectedDriverId);
  }
  get selectedDriverLocation(): { lat: number; lng: number; isOnline: boolean } {
    const rtdbLoc = this.driverLocations.find(l => l.driverId === this.selectedDriverId);
    const ll = tnLngLat(rtdbLoc?.coordinates);
    if (ll) return { lat: ll[1], lng: ll[0], isOnline: !!rtdbLoc?.isOnline };
    return { lat: 36.8065, lng: 10.1815, isOnline: false };
  }
  isDriverOnline(driverId?: string): boolean {
    if (!driverId) return false;
    return !!this.driverLocations.find(l => l.driverId === driverId && l.isOnline);
  }

  selectDriver(driverId: string): void {
    this.selectedDriverId = driverId;
    const v = this.selectedDriverVehicle;
    if (v?.type) this.vehicleType = v.type;
    this.drawMap();
  }

  get calculatedDistanceToPickup(): number {
    const d = this.selectedDriverLocation;
    return this.haversine(d.lat, d.lng, Number(this.pickupLat), Number(this.pickupLng));
  }

  // ---------- Distance ----------
  haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
  }

  recalcDistance(): void {
    let total = 0;
    let prev = { lat: Number(this.pickupLat), lng: Number(this.pickupLng) };
    for (const s of this.stops) {
      total += this.haversine(prev.lat, prev.lng, Number(s.lat), Number(s.lng));
      prev = { lat: Number(s.lat), lng: Number(s.lng) };
    }
    this.distance = Number(total.toFixed(2));
    this.drawMap();
  }

  // ---------- Stops ----------
  addStop(): void {
    const last = this.stops[this.stops.length - 1];
    this.stops.push({
      name: '', phone: '', searchQuery: '', results: [],
      lat: last ? last.lat : this.pickupLat,
      lng: last ? last.lng : this.pickupLng
    });
    this.locTarget = { kind: 'stop', index: this.stops.length - 1 };
  }
  removeStop(i: number): void {
    if (this.stops.length <= 1) return;
    this.stops.splice(i, 1);
    if (this.locTarget.kind === 'stop' && this.locTarget.index >= this.stops.length) {
      this.locTarget = { kind: 'pickup' };
    }
    this.recalcDistance();
  }
  armTarget(t: LocTarget): void { this.locTarget = t; }
  isArmed(t: LocTarget): boolean {
    if (t.kind === 'pickup') return this.locTarget.kind === 'pickup';
    return this.locTarget.kind === 'stop' && this.locTarget.index === t.index;
  }

  // ---------- Map (Mapbox GL) ----------
  private initMap(): void {
    if (!this.mapElementRef?.nativeElement) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    this.map = new mapboxgl.Map({
      container: this.mapElementRef.nativeElement,
      style: MAPBOX_STYLE_STREET,
      center: [10.21, 36.815],
      zoom: 11,
      attributionControl: false,
    });
    this.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    this.map.on('load', () => {
      this.mapLoaded = true;
      this.map!.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      this.map!.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563EB', 'line-width': 4, 'line-opacity': 0.85 },
      });
      this.map!.resize();
      this.drawMap();
    });

    this.map.on('click', (e) => {
      const lat = Number(e.lngLat.lat.toFixed(6));
      const lng = Number(e.lngLat.lng.toFixed(6));
      if (this.locTarget.kind === 'pickup') {
        this.pickupLat = lat; this.pickupLng = lng;
        this.reverseGeocode(lat, lng, this.locTarget);
      } else {
        const s = this.stops[this.locTarget.index];
        if (s) { s.lat = lat; s.lng = lng; this.reverseGeocode(lat, lng, this.locTarget); }
      }
      this.recalcDistance();
    });
  }

  private drawMap(): void {
    if (!this.map || !this.mapLoaded) return;

    // pickup
    if (this.pickupMarker) this.pickupMarker.setLngLat([this.pickupLng, this.pickupLat]);
    else {
      this.pickupMarker = new mapboxgl.Marker({ element: makePinEl('A', '#0E7A5F', 30), draggable: true, anchor: 'bottom' })
        .setLngLat([this.pickupLng, this.pickupLat])
        .addTo(this.map);
      this.pickupMarker.on('dragend', () => {
        const p = this.pickupMarker!.getLngLat();
        this.pickupLat = Number(p.lat.toFixed(6));
        this.pickupLng = Number(p.lng.toFixed(6));
        this.reverseGeocode(this.pickupLat, this.pickupLng, { kind: 'pickup' });
        this.recalcDistance();
      });
    }

    // stops — rebuild markers to keep numbering correct
    this.stopMarkers.forEach(m => m.remove());
    this.stopMarkers = this.stops.map((s, i) => {
      const m = new mapboxgl.Marker({ element: makePinEl(String(i + 1), '#FFA000', 28), draggable: true, anchor: 'bottom' })
        .setLngLat([s.lng, s.lat])
        .addTo(this.map!);
      m.on('dragend', () => {
        const p = m.getLngLat();
        s.lat = Number(p.lat.toFixed(6));
        s.lng = Number(p.lng.toFixed(6));
        this.reverseGeocode(s.lat, s.lng, { kind: 'stop', index: i });
        this.recalcDistance();
      });
      return m;
    });

    // route
    const coords: [number, number][] = [
      [this.pickupLng, this.pickupLat],
      ...this.stops.map(s => [s.lng, s.lat] as [number, number]),
    ];
    const src = this.map.getSource('route') as mapboxgl.GeoJSONSource | undefined;
    src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });

    // driver
    const d = this.selectedDriverLocation;
    if (this.driverMarker) this.driverMarker.setLngLat([d.lng, d.lat]);
    else this.driverMarker = new mapboxgl.Marker({ element: makePinEl('🚚', '#1D4ED8', 32), anchor: 'bottom' })
      .setLngLat([d.lng, d.lat])
      .addTo(this.map);

    try {
      const b = new mapboxgl.LngLatBounds();
      coords.forEach(c => b.extend(c));
      b.extend([d.lng, d.lat]);
      if (!b.isEmpty()) this.map.fitBounds(b, { padding: 70, animate: false, maxZoom: 15 });
    } catch { /* single point */ }
  }

  // ---------- Geocoding (Mapbox) ----------
  async searchAddress(kind: 'pickup' | 'stop', index = 0): Promise<void> {
    const q = kind === 'pickup' ? this.pickupSearch : this.stops[index]?.searchQuery;
    if (!q || q.trim().length < 3) return;
    this.isSearchingGeocode = true;
    try {
      const data = await mapboxForwardGeocode(q, 5);
      if (kind === 'pickup') this.pickupResults = data;
      else if (this.stops[index]) this.stops[index].results = data;
    } catch (e) {
      console.warn('Geocoding failed:', e);
    } finally {
      this.isSearchingGeocode = false;
    }
  }

  pickResult(item: any, kind: 'pickup' | 'stop', index = 0): void {
    const lat = Number(parseFloat(item.lat).toFixed(6));
    const lng = Number(parseFloat(item.lon).toFixed(6));
    const name = String(item.display_name).split(',').slice(0, 3).join(', ');
    if (kind === 'pickup') {
      this.pickupName = name; this.pickupLat = lat; this.pickupLng = lng;
      this.pickupResults = []; this.pickupSearch = '';
    } else if (this.stops[index]) {
      const s = this.stops[index];
      s.name = name; s.lat = lat; s.lng = lng; s.results = []; s.searchQuery = '';
    }
    this.map?.panTo([lng, lat]);
    this.recalcDistance();
  }

  private async reverseGeocode(lat: number, lng: number, t: LocTarget): Promise<void> {
    try {
      const formatted = await mapboxReverseGeocode(lat, lng);
      if (!formatted) return;
      if (t.kind === 'pickup') this.pickupName = formatted;
      else if (this.stops[t.index]) this.stops[t.index].name = formatted;
    } catch (e) {
      console.warn('Reverse geocode error:', e);
    }
  }

  // ---------- Optional assets ----------
  toggleOptionalAsset(a: string): void {
    const i = this.selectedOptionalAssets.indexOf(a);
    if (i >= 0) this.selectedOptionalAssets.splice(i, 1);
    else this.selectedOptionalAssets.push(a);
  }
  isAssetSelected(a: string): boolean { return this.selectedOptionalAssets.includes(a); }

  // ---------- Dispatch ----------
  async createAndAssignOrder(): Promise<void> {
    this.errorMessage = null;
    this.successOrderInfo = null;
    if (!this.canDispatch) {
      this.errorMessage = 'Select a driver, a pickup and at least one named stop.';
      return;
    }

    this.isSubmitting = true;
    try {
      const driver = this.selectedDriver;
      const driverName = driver?.name || 'Assigned driver';
      const distanceToPickup = this.calculatedDistanceToPickup;

      // 1. one stop doc per row
      const stopIds: string[] = [];
      for (const s of this.stops) {
        const ref = await addDoc(collection(this.firestore, 'stops'), {
          destination: { latitude: Number(s.lat), longitude: Number(s.lng) },
          destinationName: s.name.trim(),
          receiverPhone: s.phone.trim() ? s.phone.trim() : null,
          state: 'pending',
          isDelivered: false   // legacy mirror
        });
        stopIds.push(ref.id);
      }

      // 2. order doc — current (slimmed) Orders model + isAdministrative
      const orderDocRef = doc(collection(this.firestore, 'orders'));
      const orderId = orderDocRef.id;

      const optionalAssetsVal = [...this.selectedOptionalAssets];
      const budgetVal = (this.budget != null && !isNaN(Number(this.budget))) ? Number(this.budget) : 0;
      const notesVal = this.notes?.trim() ? this.notes.trim() : '';
      const scheduleAtVal = this.scheduleAt?.trim()
        ? Timestamp.fromDate(new Date(this.scheduleAt)) : Timestamp.now();

      await setDoc(orderDocRef, {
        userID: this.selectedUserId || 'ADMIN_CONSOLE',
        price: Number(this.price) || 0,
        distance: Number(this.distance) || 0,
        namePickUp: this.pickupName.trim(),
        id: orderId,
        pickUpLocation: { coordinates: [Number(this.pickupLng), Number(this.pickupLat)], type: 'Point' },
        stops: stopIds,
        timestamp: serverTimestamp(),
        vehicleType: this.vehicleType || 'camion',
        isAccepted: true,
        isAcepted: true,
        scheduleAt: scheduleAtVal,
        category: 'eco',
        optionalAssets: optionalAssetsVal,
        budget: budgetVal,
        notes: notesVal,
        currencyCode: 'TND',
        isBiddingMode: false,
        isAdministrative: true
      });

      // 3. deal
      const dealDocRef = await addDoc(collection(this.firestore, 'deals'), {
        idOrder: orderId,
        idDriver: this.selectedDriverId,
        idUser: this.selectedUserId || 'ADMIN_CONSOLE',
        idVehicle: this.selectedDriverVehicle?.id || '',
        status: 'accepted',
        timestamp: serverTimestamp()
      });
      const dealId = dealDocRef.id;

      // 4. driver assigned_jobs
      await addDoc(collection(this.firestore, 'users', this.selectedDriverId, 'assigned_jobs'), {
        assignedAt: serverTimestamp(),
        category: 'eco',
        orderId, dealId,
        status: 'accepted',
        distanceToPickup: distanceToPickup || 0
      });

      // 5. notify driver
      const notifTitle = 'New job assigned';
      const notifBody = `You've been assigned an order (#${orderId.slice(0, 8)}) at ${this.pickupName}. Pickup is ${distanceToPickup} km away.`;
      try {
        await this.notificationService.sendUserNotification(this.selectedDriverId, notifTitle, notifBody);
      } catch (nErr) {
        console.warn('FCM dispatch warning:', nErr);
      }
      this.crossTabSyncService.notifyNotificationSent(this.selectedDriverId, notifTitle, notifBody);

      this.successOrderInfo = { orderId, driverName, distanceToPickup, stopIds, dealId };
      toastSuccess('Order dispatched');
    } catch (err: any) {
      console.error('Error creating & assigning order:', err);
      this.errorMessage = err?.message || 'Failed to create and assign order.';
      toastError('Dispatch failed');
    } finally {
      this.isSubmitting = false;
    }
  }

  onInspectDriverClick(): void {
    if (this.selectedDriverId) this.inspectDriver.emit(this.selectedDriverId);
  }

  resetForm(): void {
    this.successOrderInfo = null;
    this.errorMessage = null;
    this.notes = null;
    this.budget = null;
    this.scheduleAt = null;
    this.selectedOptionalAssets = [];
    this.stops = [{ name: '', lat: this.pickupLat, lng: this.pickupLng, phone: '', searchQuery: '', results: [] }];
    this.currentStep = 1;
    this.recalcDistance();
  }
}
