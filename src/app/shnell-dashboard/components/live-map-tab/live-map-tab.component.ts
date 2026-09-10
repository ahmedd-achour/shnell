import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import mapboxgl from 'mapbox-gl';
import { DriverRTDBLocation, ShnellUser, Vehicle } from '../../models/dashboard.models';
import { vehicleImage } from '../../../shared/vehicle-assets';
import {
  MAPBOX_TOKEN, MAPBOX_STYLE_STREET, MAPBOX_STYLE_SATELLITE,
  TN_CENTER_LNGLAT, makeTruckMarkerEl, tnLngLat,
} from '../../../shared/mapbox';

@Component({
  selector: 'app-live-map-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './live-map-tab.component.html',
  styleUrls: ['./live-map-tab.component.css']
})
export class LiveMapTabComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input() driverLocations: DriverRTDBLocation[] = [];
  @Input() users: ShnellUser[] = [];
  @Input() vehicles: Vehicle[] = [];

  @Output() selectUserForNotification = new EventEmitter<ShnellUser>();
  @Output() inspectDriver = new EventEmitter<string>();

  @ViewChild('mapElement') mapElementRef!: ElementRef<HTMLDivElement>;

  private map: mapboxgl.Map | null = null;
  private markersMap = new Map<string, mapboxgl.Marker>();

  searchQuery: string = '';
  vehicleTypeFilter: string = 'all';
  mapStyle: 'street' | 'satellite' = 'street';
  selectedDriver: (DriverRTDBLocation & { user?: ShnellUser; vehicle?: Vehicle }) | null = null;

  // ---- advanced filters (admin-tunable) ----
  showFilters = true;
  freshnessSec: number = 0;              // 0 = any; else "pinged within N seconds"
  statusFilter: 'any' | 'online' | 'busy' | 'idle' | 'offline' = 'any';
  maxAccuracy: number = 0;              // 0 = any; else "accuracy <= N metres"
  sortBy: 'recent' | 'stale' | 'name' | 'accuracy' = 'recent';
  autoFit = true;                       // re-frame the map when the filter set changes

  readonly freshnessOptions = [
    { v: 0, label: 'Any time' },
    { v: 60, label: 'Last 1 min' },
    { v: 300, label: 'Last 5 min' },
    { v: 900, label: 'Last 15 min' },
    { v: 3600, label: 'Last 1 hour' },
    { v: 21600, label: 'Last 6 hours' },
  ];

  vehicleImage = vehicleImage;

  /** Resolve the vehicle type for a driver ping (used for markers + filtering). */
  vehicleTypeFor(driverId: string): string {
    const v = this.vehicles.find(x => x.idDriver === driverId);
    return (v?.type || '').toString();
  }

  /** Distinct vehicle types present among the live drivers, for the filter. */
  get availableVehicleTypes(): string[] {
    const set = new Set<string>();
    this.driverLocations.forEach(loc => {
      const t = this.vehicleTypeFor(loc.driverId);
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }

  setMapStyle(style: 'street' | 'satellite'): void {
    if (this.mapStyle === style) return;
    this.mapStyle = style;
    this.map?.setStyle(style === 'satellite' ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_STREET);
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['driverLocations'] || changes['users'] || changes['vehicles']) {
      this.updateMarkers();
    }
  }

  ngOnDestroy(): void {
    this.markersMap.forEach(m => m.remove());
    this.markersMap.clear();
    if (this.map) { this.map.remove(); this.map = null; }
  }

  private initMap(): void {
    if (!this.mapElementRef?.nativeElement) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    this.map = new mapboxgl.Map({
      container: this.mapElementRef.nativeElement,
      style: this.mapStyle === 'satellite' ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_STREET,
      center: TN_CENTER_LNGLAT,
      zoom: 8.5,
      attributionControl: false,
    });
    this.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    this.map.on('load', () => {
      this.map?.resize();
      this.updateMarkers();
    });
  }

  /** Explicit "fit all pins" — bound to the Recenter button. */
  recenter(): void {
    this.updateMarkers(true);
  }

  updateMarkers(forceFit = false): void {
    if (!this.map) return;

    this.markersMap.forEach(m => m.remove());
    this.markersMap.clear();

    const filtered = this.filteredLocations;
    const bounds = new mapboxgl.LngLatBounds();

    filtered.forEach(loc => {
      const ll = tnLngLat(loc.coordinates);
      if (!ll) return;
      const [lng, lat] = ll;

      const user = this.users.find(u => u.uid === loc.driverId || u.id === loc.driverId);
      const vehicle = this.vehicles.find(v => v.idDriver === loc.driverId);

      const driverName = user ? user.name : 'Driver #' + loc.driverId.substring(0, 6);
      const phone = user ? (user.phone || 'N/A') : 'N/A';
      const vehicleType = vehicle ? vehicle.type : 'Delivery Fleet';

      bounds.extend([lng, lat]);

      const el = makeTruckMarkerEl(vehicleImage(vehicle ? vehicle.type : undefined), { size: 26, live: true });
      el.addEventListener('click', () => { this.selectedDriver = { ...loc, user, vehicle }; });

      const popupContent = `
        <div class="map-driver-popup">
          <img class="map-driver-popup__veh" src="${vehicleImage(vehicle ? vehicle.type : undefined)}" alt="" onerror="this.src='assets/trucks/medium.png'">
          <h6 class="fw-bold mb-1">${driverName}</h6>
          <p class="mb-1 small"><i class="bi bi-truck me-1"></i> ${vehicleType}</p>
          <p class="mb-1 small"><i class="bi bi-telephone me-1"></i> ${phone}</p>
          <hr class="my-1"/>
          <p class="mb-1 fs-8 muted">Geohash: <span class="font-monospace">${loc.g || 'N/A'}</span></p>
          <p class="mb-2 fs-8 muted">Provider: ${loc.provider || 'fused'} (${loc.accuracy || 10}m)</p>
          <button class="map-driver-popup__btn" onclick="window.open('/analytics/driver-details?id=${loc.driverId}', '_blank')">
            <i class="bi bi-box-arrow-up-right me-1"></i> See Details (New Tab)
          </button>
        </div>
      `;

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 16, closeButton: true }).setHTML(popupContent))
        .addTo(this.map!);

      this.markersMap.set(loc.driverId, marker);
    });

    if (!bounds.isEmpty() && (forceFit || this.autoFit)) {
      this.map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }

  /** Seconds since this driver last pinged (Infinity when unknown). */
  ageSec(loc: DriverRTDBLocation): number {
    return loc.ts ? Math.max(0, Math.floor((Date.now() - loc.ts) / 1000)) : Infinity;
  }

  private matchesStatus(loc: DriverRTDBLocation): boolean {
    switch (this.statusFilter) {
      case 'online':  return !!loc.isOnline;
      case 'offline': return !loc.isOnline;
      case 'busy':    return !!loc.isBusy;
      case 'idle':    return !!loc.isOnline && !loc.isBusy;
      default:        return true;
    }
  }

  get filteredLocations(): DriverRTDBLocation[] {
    const q = this.searchQuery.toLowerCase().trim();
    const rows = this.driverLocations.filter(loc => {
      if (this.vehicleTypeFilter !== 'all' && this.vehicleTypeFor(loc.driverId) !== this.vehicleTypeFilter) return false;
      if (!this.matchesStatus(loc)) return false;
      if (this.freshnessSec > 0 && this.ageSec(loc) > this.freshnessSec) return false;
      if (this.maxAccuracy > 0 && (loc.accuracy ?? 9999) > this.maxAccuracy) return false;
      if (!q) return true;
      const user = this.users.find(u => u.uid === loc.driverId || u.id === loc.driverId);
      const name = user?.name?.toLowerCase() || '';
      const phone = user?.phone || '';
      const geohash = loc.g?.toLowerCase() || '';
      return loc.driverId.toLowerCase().includes(q) || name.includes(q) || phone.includes(q) || geohash.includes(q);
    });

    const nameOf = (loc: DriverRTDBLocation) =>
      (this.users.find(u => u.uid === loc.driverId || u.id === loc.driverId)?.name || loc.driverId).toLowerCase();

    return rows.sort((a, b) => {
      switch (this.sortBy) {
        case 'stale':    return this.ageSec(b) - this.ageSec(a);
        case 'name':     return nameOf(a).localeCompare(nameOf(b));
        case 'accuracy': return (a.accuracy ?? 9999) - (b.accuracy ?? 9999);
        default:         return this.ageSec(a) - this.ageSec(b); // recent first
      }
    });
  }

  /** Re-run filtering + markers (bound to every filter control). */
  applyFilters(): void {
    this.updateMarkers();
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.vehicleTypeFilter = 'all';
    this.freshnessSec = 0;
    this.statusFilter = 'any';
    this.maxAccuracy = 0;
    this.sortBy = 'recent';
    this.updateMarkers(true);
  }

  centerOnDriver(loc: DriverRTDBLocation): void {
    const ll = tnLngLat(loc.coordinates);
    if (this.map && ll) {
      this.map.flyTo({ center: ll, zoom: 15, duration: 1200 });
      const marker = this.markersMap.get(loc.driverId);
      if (marker && !marker.getPopup()?.isOpen()) marker.togglePopup();
      const user = this.users.find(u => u.uid === loc.driverId || u.id === loc.driverId);
      const vehicle = this.vehicles.find(v => v.idDriver === loc.driverId);
      this.selectedDriver = { ...loc, user, vehicle };
    }
  }

  openDriverDetailsInNewTab(driverId: string): void {
    if (!driverId) return;
    const url = `/analytics/driver-details?id=${driverId}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onNotifyDriver(user?: ShnellUser): void {
    if (user) {
      this.selectUserForNotification.emit(user);
    }
  }

  onInspectDriverClick(driverId: string): void {
    this.inspectDriver.emit(driverId);
  }

  getTimeAgo(ts?: number): string {
    if (!ts) return 'Just now';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
  }
}
