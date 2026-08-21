import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { DriverRTDBLocation, ShnellUser, Vehicle } from '../../models/dashboard.models';

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

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup = L.layerGroup();
  private markersMap = new Map<string, L.Marker>();

  searchQuery: string = '';
  selectedDriver: (DriverRTDBLocation & { user?: ShnellUser; vehicle?: Vehicle }) | null = null;

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initLeafletMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['driverLocations'] || changes['users'] || changes['vehicles']) {
      this.updateMarkers();
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initLeafletMap(): void {
    if (!this.mapElementRef?.nativeElement) return;

    this.map = L.map(this.mapElementRef.nativeElement, {
      center: [36.8065, 10.1815],
      zoom: 10,
      zoomControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this.markersLayer.addTo(this.map);
    this.updateMarkers();
  }

  private createCustomIcon(): L.DivIcon {
    return L.divIcon({
      className: 'custom-driver-pin',
      html: `
        <div class="driver-marker-wrapper">
          <div class="pulse-ring"></div>
          <div class="marker-core bg-warning text-dark">
            <i class="bi bi-truck-front-fill"></i>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20]
    });
  }

  updateMarkers(): void {
    if (!this.map) return;

    this.markersLayer.clearLayers();
    this.markersMap.clear();

    const filtered = this.filteredLocations;
    const bounds: L.LatLngExpression[] = [];

    filtered.forEach(loc => {
      const lng = loc.coordinates[0];
      const lat = loc.coordinates[1];

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      const user = this.users.find(u => u.uid === loc.driverId || u.id === loc.driverId);
      const vehicle = this.vehicles.find(v => v.idDriver === loc.driverId);

      const driverName = user ? user.name : 'Driver #' + loc.driverId.substring(0, 6);
      const phone = user ? (user.phone || 'N/A') : 'N/A';
      const vehicleType = vehicle ? vehicle.type : 'Delivery Fleet';

      bounds.push([lat, lng]);

      const icon = this.createCustomIcon();
      const marker = L.marker([lat, lng], { icon });

      const popupContent = `
        <div class="card bg-dark text-white shadow-lg p-2 border border-secondary">
          <h6 class="fw-bold mb-1 text-warning">${driverName}</h6>
          <p class="mb-1 small text-light"><i class="bi bi-truck me-1"></i> ${vehicleType}</p>
          <p class="mb-1 small text-light"><i class="bi bi-telephone me-1"></i> ${phone}</p>
          <hr class="my-1 border-secondary"/>
          <p class="mb-1 fs-8 text-muted">Geohash: <span class="font-monospace text-info">${loc.g || 'N/A'}</span></p>
          <p class="mb-2 fs-8 text-muted">Provider: ${loc.provider || 'fused'} (${loc.accuracy || 10}m)</p>
          <button class="btn btn-xs btn-outline-info w-100 rounded-pill py-1 fs-8 fw-semibold" onclick="window.open('/analytics/driver-details?id=${loc.driverId}', '_blank')">
            <i class="bi bi-box-arrow-up-right me-1"></i> See Details (New Tab)
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('click', () => {
        this.selectedDriver = { ...loc, user, vehicle };
      });

      marker.addTo(this.markersLayer);
      this.markersMap.set(loc.driverId, marker);
    });

    if (bounds.length > 0 && this.map) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 14 });
    }
  }

  get filteredLocations(): DriverRTDBLocation[] {
    if (!this.searchQuery) return this.driverLocations;
    const q = this.searchQuery.toLowerCase();

    return this.driverLocations.filter(loc => {
      const user = this.users.find(u => u.uid === loc.driverId || u.id === loc.driverId);
      const name = user?.name?.toLowerCase() || '';
      const phone = user?.phone || '';
      const geohash = loc.g?.toLowerCase() || '';

      return loc.driverId.toLowerCase().includes(q) || name.includes(q) || phone.includes(q) || geohash.includes(q);
    });
  }

  centerOnDriver(loc: DriverRTDBLocation): void {
    const lng = loc.coordinates[0];
    const lat = loc.coordinates[1];
    if (this.map && lat && lng) {
      this.map.flyTo([lat, lng], 15, { duration: 1.2 });
      const marker = this.markersMap.get(loc.driverId);
      if (marker) marker.openPopup();
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
