import { Component, Input, Output, EventEmitter, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc, doc, setDoc, serverTimestamp, Timestamp } from '@angular/fire/firestore';
import * as L from 'leaflet';
import { ShnellUser, Vehicle, DriverRTDBLocation } from '../../models/dashboard.models';
import { CrossTabSyncService } from '../../../services/cross-tab-sync.service';
import { NotificationService } from '../../services/notification.service';

export interface AreaPreset {
  name: string;
  lat: number;
  lng: number;
  region: string;
}

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

  // Form Model State (Flutter Orders model identical structure)
  selectedUserId: string = 'ADMIN_CONSOLE';
  selectedDriverId: string = '';
  category: 'eco' | 'pro' = 'pro';
  vehicleType: string = 'camion';

  // Pickup Specs
  pickupName: string = 'Avenue Habib Bourguiba, Tunis';
  pickupLat: number = 36.8065;
  pickupLng: number = 10.1815;
  elevatorOnPickup: boolean = false;
  longWalkOnPickup: boolean = false;
  pickupFloor: number = 0;

  // Dropoff Specs
  dropoffName: string = 'Les Berges du Lac 2, Tunis';
  dropoffLat: number = 36.8350;
  dropoffLng: number = 10.2400;
  elevatorOnDropoff: boolean = false;
  longWalkOnDropoff: boolean = false;
  dropoffFloor: number = 0;

  // Additional Flutter Model Specs
  price: number = 45;
  distance: number = 8.5;
  moveServiceSize: string = 'Standard';
  bulkyItems: boolean = false;
  isAcepted: boolean = true;
  scheduleAt: string | null = null; // datetime-local input string

  // Optional fields (Saved with non-null defaults in Firestore when unset)
  selectedOptionalAssets: string[] = [];
  budget: number | null = null;
  notes: string | null = null;

  // Step Stepper Workflow State (Wizard Stepper Architecture)
  currentStep: number = 1; // 1: Chauffeur & Customer, 2: Locations & Map, 3: Specs & Equipment, 4: Review & Dispatch

  // Map & Location Picker state
  mapSelectTarget: 'pickup' | 'dropoff' = 'pickup';
  isSearchingGeocode: boolean = false;
  searchQueryPickup: string = '';
  searchQueryDropoff: string = '';
  geocodePickupResults: any[] = [];
  geocodeDropoffResults: any[] = [];

  private map: L.Map | null = null;
  private pickupMarker: L.Marker | null = null;
  private dropoffMarker: L.Marker | null = null;
  private routePolyline: L.Polyline | null = null;
  private driverMarker: L.Marker | null = null;

  // Preset Tunisian Areas for rapid 1-click human admin assignment
  presetAreas: AreaPreset[] = [
    { name: 'Avenue Habib Bourguiba, Tunis', lat: 36.8065, lng: 10.1815, region: 'Tunis Centre' },
    { name: 'Les Berges du Lac 1, Tunis', lat: 36.8300, lng: 10.2250, region: 'Tunis Lac' },
    { name: 'Les Berges du Lac 2, Tunis', lat: 36.8350, lng: 10.2400, region: 'Tunis Lac' },
    { name: 'La Marsa, Tunis', lat: 36.8782, lng: 10.3247, region: 'Banlieue Nord' },
    { name: 'Ennasr 2, Ariana', lat: 36.8570, lng: 10.1580, region: 'Ariana' },
    { name: 'El Ghazala Technopark, Ariana', lat: 36.8940, lng: 10.1870, region: 'Ariana' },
    { name: 'Zone Industrielle Megrine, Ben Arous', lat: 36.7720, lng: 10.2310, region: 'Ben Arous' },
    { name: 'Sousse Centre Ville', lat: 35.8256, lng: 10.6411, region: 'Sousse' },
    { name: 'Port El Kantaoui, Sousse', lat: 35.8942, lng: 10.5973, region: 'Sousse' },
    { name: 'Sfax Ville', lat: 34.7406, lng: 10.7603, region: 'Sfax' },
    { name: 'Hammamet Sud, Nabeul', lat: 36.3860, lng: 10.5730, region: 'Nabeul' },
    { name: 'Bizerte Centre', lat: 37.2746, lng: 9.8739, region: 'Bizerte' },
    { name: 'Monastir Marina', lat: 35.7770, lng: 10.8260, region: 'Monastir' }
  ];

  availableOptionalAssets: string[] = [
    'Heavy Straps',
    'Moving Blankets',
    'Hand Truck / Trolley',
    'Extra Helper / Loader',
    'Packaging Boxes',
    'Disassembly Tools'
  ];

  moveServiceSizes: string[] = ['Standard', 'Small (S)', 'Medium (M)', 'Large (L)', 'Full House (XL)'];
  vehicleTypeList: string[] = ['camion', 'estafette', 'light', 'medium', 'heavy', 'isuzu', 'popular'];

  // Driver Search & UI state
  driverSearchQuery: string = '';
  isSubmitting: boolean = false;
  successOrderInfo: { orderId: string; driverName: string; distanceToPickup: number; stopId: string; dealId: string } | null = null;
  errorMessage: string | null = null;

  constructor(
    private firestore: Firestore,
    private crossTabSyncService: CrossTabSyncService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    const firstDriver = this.driverUsers[0];
    if (firstDriver) {
      this.selectedDriverId = firstDriver.uid || firstDriver.id || '';
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initLeafletMap();
    }, 150);
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  get driverUsers(): ShnellUser[] {
    return this.users.filter(u => u.role === 'driver');
  }

  get customerUsers(): ShnellUser[] {
    return this.users.filter(u => u.role !== 'driver');
  }

  get filteredDrivers(): ShnellUser[] {
    const q = this.driverSearchQuery.toLowerCase().trim();
    if (!q) return this.driverUsers;
    return this.driverUsers.filter(d =>
      d.name?.toLowerCase().includes(q) ||
      d.phone?.includes(q) ||
      d.email?.toLowerCase().includes(q) ||
      (d.uid || d.id || '').toLowerCase().includes(q)
    );
  }

  get selectedDriver(): ShnellUser | undefined {
    return this.users.find(u => (u.uid || u.id) === this.selectedDriverId);
  }

  get selectedDriverVehicle(): Vehicle | undefined {
    if (!this.selectedDriverId) return undefined;
    return this.vehicles.find(v => v.idDriver === this.selectedDriverId);
  }

  get selectedDriverLocation(): { lat: number; lng: number; isOnline: boolean } {
    if (!this.selectedDriverId) {
      return { lat: 36.8065, lng: 10.1815, isOnline: false };
    }
    const rtdbLoc = this.driverLocations.find(l => l.driverId === this.selectedDriverId);
    if (rtdbLoc && rtdbLoc.coordinates && rtdbLoc.coordinates.length >= 2) {
      return {
        lat: rtdbLoc.coordinates[1],
        lng: rtdbLoc.coordinates[0],
        isOnline: !!rtdbLoc.isOnline
      };
    }
    return { lat: 36.8065, lng: 10.1815, isOnline: false };
  }

  isDriverOnline(driverId?: string): boolean {
    if (!driverId) return false;
    const rtdbLoc = this.driverLocations.find(l => l.driverId === driverId);
    return !!(rtdbLoc && rtdbLoc.isOnline);
  }

  get calculatedDistanceToPickup(): number {
    const driverLoc = this.selectedDriverLocation;
    return this.calculateHaversineDistanceKm(
      driverLoc.lat,
      driverLoc.lng,
      Number(this.pickupLat),
      Number(this.pickupLng)
    );
  }

  calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371; // Earth radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  // Auto calculate order delivery distance whenever pickup or dropoff changes
  updateDeliveryDistance(): void {
    this.distance = this.calculateHaversineDistanceKm(
      Number(this.pickupLat),
      Number(this.pickupLng),
      Number(this.dropoffLat),
      Number(this.dropoffLng)
    );
    this.updateMapElements();
  }

  selectDriver(driverId: string): void {
    this.selectedDriverId = driverId;
    const v = this.selectedDriverVehicle;
    if (v && v.type) {
      this.vehicleType = v.type;
    }
    this.updateMapElements();
  }

  // --- Leaflet Map Engine ---
  private initLeafletMap(): void {
    if (!this.mapElementRef?.nativeElement) return;

    this.map = L.map(this.mapElementRef.nativeElement, {
      center: [36.8150, 10.2100],
      zoom: 12,
      zoomControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(this.map);

    // Click map to set active target location (pickup or dropoff)
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));

      if (this.mapSelectTarget === 'pickup') {
        this.pickupLat = lat;
        this.pickupLng = lng;
        this.reverseGeocode(lat, lng, 'pickup');
      } else {
        this.dropoffLat = lat;
        this.dropoffLng = lng;
        this.reverseGeocode(lat, lng, 'dropoff');
      }
      this.updateDeliveryDistance();
    });

    this.updateMapElements();
  }

  private updateMapElements(): void {
    if (!this.map) return;

    // 1. Pickup Marker
    const pickupIcon = L.divIcon({
      className: 'custom-leaflet-marker pickup-marker',
      html: `<div style="background:#10b981; color:white; padding:6px 10px; border-radius:20px; font-weight:bold; font-size:12px; box-shadow:0 3px 8px rgba(0,0,0,0.4); border:2px solid white;">📍 Pickup</div>`,
      iconSize: [80, 32],
      iconAnchor: [40, 16]
    });

    if (this.pickupMarker) {
      this.pickupMarker.setLatLng([this.pickupLat, this.pickupLng]);
    } else {
      this.pickupMarker = L.marker([this.pickupLat, this.pickupLng], { icon: pickupIcon, draggable: true }).addTo(this.map);
      this.pickupMarker.on('dragend', (e: any) => {
        const pos = e.target.getLatLng();
        this.pickupLat = Number(pos.lat.toFixed(6));
        this.pickupLng = Number(pos.lng.toFixed(6));
        this.reverseGeocode(this.pickupLat, this.pickupLng, 'pickup');
        this.updateDeliveryDistance();
      });
    }

    // 2. Dropoff Marker
    const dropoffIcon = L.divIcon({
      className: 'custom-leaflet-marker dropoff-marker',
      html: `<div style="background:#f59e0b; color:white; padding:6px 10px; border-radius:20px; font-weight:bold; font-size:12px; box-shadow:0 3px 8px rgba(0,0,0,0.4); border:2px solid white;">🎯 Dropoff</div>`,
      iconSize: [80, 32],
      iconAnchor: [40, 16]
    });

    if (this.dropoffMarker) {
      this.dropoffMarker.setLatLng([this.dropoffLat, this.dropoffLng]);
    } else {
      this.dropoffMarker = L.marker([this.dropoffLat, this.dropoffLng], { icon: dropoffIcon, draggable: true }).addTo(this.map);
      this.dropoffMarker.on('dragend', (e: any) => {
        const pos = e.target.getLatLng();
        this.dropoffLat = Number(pos.lat.toFixed(6));
        this.dropoffLng = Number(pos.lng.toFixed(6));
        this.reverseGeocode(this.dropoffLat, this.dropoffLng, 'dropoff');
        this.updateDeliveryDistance();
      });
    }

    // 3. Polyline between pickup and dropoff
    const latlngs: L.LatLngExpression[] = [
      [this.pickupLat, this.pickupLng],
      [this.dropoffLat, this.dropoffLng]
    ];

    if (this.routePolyline) {
      this.routePolyline.setLatLngs(latlngs);
    } else {
      this.routePolyline = L.polyline(latlngs, { color: '#3b82f6', weight: 4, dashArray: '6, 8', opacity: 0.8 }).addTo(this.map);
    }

    // 4. Driver Marker if selected
    const dLoc = this.selectedDriverLocation;
    if (dLoc) {
      const driverIcon = L.divIcon({
        className: 'custom-leaflet-marker driver-marker',
        html: `<div style="background:#6366f1; color:white; padding:4px 8px; border-radius:16px; font-weight:bold; font-size:11px; box-shadow:0 2px 6px rgba(0,0,0,0.4); border:2px solid white;">🚚 ${this.selectedDriver?.name || 'Driver'}</div>`,
        iconSize: [90, 28],
        iconAnchor: [45, 14]
      });

      if (this.driverMarker) {
        this.driverMarker.setLatLng([dLoc.lat, dLoc.lng]);
      } else {
        this.driverMarker = L.marker([dLoc.lat, dLoc.lng], { icon: driverIcon }).addTo(this.map);
      }
    }
  }

  // --- Human Area & Geocoding Helpers ---
  applyPresetArea(area: AreaPreset, target: 'pickup' | 'dropoff'): void {
    if (target === 'pickup') {
      this.pickupName = area.name;
      this.pickupLat = area.lat;
      this.pickupLng = area.lng;
    } else {
      this.dropoffName = area.name;
      this.dropoffLat = area.lat;
      this.dropoffLng = area.lng;
    }

    if (this.map) {
      this.map.panTo([area.lat, area.lng]);
    }
    this.updateDeliveryDistance();
  }

  async searchAddress(target: 'pickup' | 'dropoff'): Promise<void> {
    const query = target === 'pickup' ? this.searchQueryPickup : this.searchQueryDropoff;
    if (!query || query.trim().length < 3) return;

    this.isSearchingGeocode = true;
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      const data = await resp.json();
      if (target === 'pickup') {
        this.geocodePickupResults = data;
      } else {
        this.geocodeDropoffResults = data;
      }
    } catch (e) {
      console.warn('Geocoding search failed:', e);
    } finally {
      this.isSearchingGeocode = false;
    }
  }

  selectSearchResult(item: any, target: 'pickup' | 'dropoff'): void {
    const lat = Number(parseFloat(item.lat).toFixed(6));
    const lng = Number(parseFloat(item.lon).toFixed(6));
    const name = item.display_name.split(',').slice(0, 3).join(', ');

    if (target === 'pickup') {
      this.pickupName = name;
      this.pickupLat = lat;
      this.pickupLng = lng;
      this.geocodePickupResults = [];
      this.searchQueryPickup = '';
    } else {
      this.dropoffName = name;
      this.dropoffLat = lat;
      this.dropoffLng = lng;
      this.geocodeDropoffResults = [];
      this.searchQueryDropoff = '';
    }

    if (this.map) {
      this.map.panTo([lat, lng]);
    }
    this.updateDeliveryDistance();
  }

  private async reverseGeocode(lat: number, lng: number, target: 'pickup' | 'dropoff'): Promise<void> {
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await resp.json();
      if (data && data.display_name) {
        const formatted = data.display_name.split(',').slice(0, 3).join(', ');
        if (target === 'pickup') {
          this.pickupName = formatted;
        } else {
          this.dropoffName = formatted;
        }
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
    }
  }

  toggleOptionalAsset(asset: string): void {
    const idx = this.selectedOptionalAssets.indexOf(asset);
    if (idx >= 0) {
      this.selectedOptionalAssets.splice(idx, 1);
    } else {
      this.selectedOptionalAssets.push(asset);
    }
  }

  isAssetSelected(asset: string): boolean {
    return this.selectedOptionalAssets.includes(asset);
  }

  // --- Order Dispatch Action (100% Flutter Models Compliant) ---
  async createAndAssignOrder(): Promise<void> {
    this.errorMessage = null;
    this.successOrderInfo = null;

    if (!this.selectedDriverId) {
      this.errorMessage = 'Please select a driver to assign this order to.';
      return;
    }

    if (!this.pickupName.trim()) {
      this.errorMessage = 'Please enter or select a pickup location area.';
      return;
    }

    if (!this.dropoffName.trim()) {
      this.errorMessage = 'Please enter or select a dropoff destination area.';
      return;
    }

    this.isSubmitting = true;

    try {
      const driver = this.selectedDriver;
      const driverName = driver?.name || 'Assigned Chauffeur';
      const distanceToPickup = this.calculatedDistanceToPickup;

      // STEP 1: Save DropOffData model into 'stops' collection first
      // Matches DropOffData.toFirestore(): { destination: { latitude, longitude }, destinationName, isdelivered }
      const stopDocRef = await addDoc(collection(this.firestore, 'stops'), {
        destination: {
          latitude: Number(this.dropoffLat),
          longitude: Number(this.dropoffLng)
        },
        destinationName: this.dropoffName.trim(),
        isdelivered: false
      });
      const stopId = stopDocRef.id;

      // STEP 2: Generate Doc Reference for 'orders' document
      const orderDocRef = doc(collection(this.firestore, 'orders'));
      const orderId = orderDocRef.id;

      // Optional fields formatting (Default non-null values to avoid null trap in apps/models)
      const optionalAssetsVal = (this.selectedOptionalAssets && this.selectedOptionalAssets.length > 0)
        ? [...this.selectedOptionalAssets]
        : [];

      const budgetVal = (this.budget !== null && this.budget !== undefined && !isNaN(Number(this.budget)))
        ? Number(this.budget)
        : 0;

      const notesVal = (this.notes && this.notes.trim().length > 0)
        ? this.notes.trim()
        : '';

      const scheduleAtVal = (this.scheduleAt && this.scheduleAt.trim().length > 0)
        ? Timestamp.fromDate(new Date(this.scheduleAt))
        : Timestamp.now();

      // STEP 3: Create Order document matching 100% of Flutter Orders model fields & toJson() schema
      const orderData = {
        userID: this.selectedUserId || 'ADMIN_CONSOLE',
        price: Number(this.price) || 0,
        distance: Number(this.distance) || 0,
        namePickUp: this.pickupName.trim(),
        id: orderId,
        pickUpLocation: {
          coordinates: [Number(this.pickupLng), Number(this.pickupLat)],
          type: 'Point'
        },
        stops: [stopId], // List of stop IDs in 'stops' collection
        timestamp: serverTimestamp(),
        vehicleType: this.vehicleType || 'camion',
        isAcepted: true, // Explicitly marked true for manual admin assignment
        scheduleAt: scheduleAtVal, // Non-null default (Timestamp.now()) if unscheduled
        category: this.category || 'pro',
        bulkyItems: !!this.bulkyItems,
        elevatorOnPickup: !!this.elevatorOnPickup,
        longWalkOnPickup: !!this.longWalkOnPickup,
        elevatorOnDropoff: !!this.elevatorOnDropoff,
        longWalkOnDropoff: !!this.longWalkOnDropoff,
        pickupFloor: Number(this.pickupFloor) || 0,
        dropoffFloor: Number(this.dropoffFloor) || 0,
        moveServiceSize: this.moveServiceSize || 'Standard',
        optionalAssets: optionalAssetsVal, // Non-null array default []
        budget: budgetVal,                 // Non-null number default 0
        notes: notesVal,                   // Non-null string default ""

        // Additional admin assignment compatibility attributes:
        assignedDriverId: this.selectedDriverId,
        assignedDriverName: driverName,
        destinationName: this.dropoffName.trim(),
        dropOffLocation: {
          latitude: Number(this.dropoffLat),
          longitude: Number(this.dropoffLng)
        }
      };

      await setDoc(orderDocRef, orderData);

      // STEP 4: Create Deal document in 'deals' collection following DealModel schema
      const dealsCol = collection(this.firestore, 'deals');
      const vehicleId = this.selectedDriverVehicle?.id || '';
      const dealDocRef = await addDoc(dealsCol, {
        idOrder: orderId,
        idDriver: this.selectedDriverId,
        idUser: this.selectedUserId || 'ADMIN_CONSOLE',
        idVehicle: vehicleId,
        status: 'accepted',
        timestamp: serverTimestamp()
      });
      const dealId = dealDocRef.id;

      // STEP 5: Add document under subcollection 'assigned_jobs' of users/{driverId}
      const assignedJobsCol = collection(this.firestore, 'users', this.selectedDriverId, 'assigned_jobs');
      await addDoc(assignedJobsCol, {
        assignedAt: serverTimestamp(),
        category: this.category || 'pro',
        orderId: orderId,
        dealId: dealId,
        status: 'accepted',
        distanceToPickup: distanceToPickup || 0
      });

      // STEP 6: Push notification to driver
      const notifTitle = `🚀 New Direct Job Assigned & Accepted!`;
      const notifBody = `Admin has assigned you an accepted ${this.category.toUpperCase()} order (#${orderId.slice(0, 8)}) at ${this.pickupName}. Pickup distance: ${distanceToPickup} km.`;

      try {
        await this.notificationService.sendUserNotification(this.selectedDriverId, notifTitle, notifBody);
      } catch (nErr) {
        console.warn('FCM dispatch warning:', nErr);
      }

      this.crossTabSyncService.notifyNotificationSent(this.selectedDriverId, notifTitle, notifBody);

      this.successOrderInfo = {
        orderId,
        driverName,
        distanceToPickup,
        stopId,
        dealId
      };
    } catch (err: any) {
      console.error('Error creating & assigning order:', err);
      this.errorMessage = err?.message || 'Failed to create and assign order.';
    } finally {
      this.isSubmitting = false;
    }
  }

  onInspectDriverClick(): void {
    if (this.selectedDriverId) {
      this.inspectDriver.emit(this.selectedDriverId);
    }
  }

  resetForm(): void {
    this.successOrderInfo = null;
    this.errorMessage = null;
    this.notes = null;
    this.budget = null;
    this.scheduleAt = null;
    this.selectedOptionalAssets = [];
  }
}
