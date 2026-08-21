import { Component, Input, Output, EventEmitter, OnInit, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Vehicle, ShnellUser } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { CrossTabSyncService } from '../../../services/cross-tab-sync.service';

@Pipe({
  name: 'assetUrl',
  standalone: true
})
export class AssetUrlPipe implements PipeTransform {
  transform(value: any): string | null {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    const isUrl =
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('assets/') ||
      trimmed.startsWith('../assets/');

    return isUrl ? trimmed : null;
  }
}

@Component({
  selector: 'app-vehicles-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, AssetUrlPipe],
  templateUrl: './vehicles-tab.component.html',
  styleUrls: ['./vehicles-tab.component.css']
})
export class VehiclesTabComponent implements OnInit {
  @Input() vehicles: Vehicle[] = [];
  @Input() users: ShnellUser[] = [];

  @Output() inspectDriver = new EventEmitter<string>();

  statusFilter: 'all' | 'pending' | 'approved' = 'all';
  typeFilter: string = 'all';
  searchQuery: string = '';
  processingId: string | null = null;

  // Selected Vehicle for Dossier Complet Modal
  selectedVehicleDossier: (Vehicle & { driver?: ShnellUser }) | null = null;
  activeAssetTab: 'carteGrise' | 'cin' | 'vehicle' = 'carteGrise';

  constructor(
    private dashboardDataService: DashboardDataService,
    private crossTabSyncService: CrossTabSyncService
  ) {}

  ngOnInit(): void {
    console.log('VehiclesTab initialized with vehicles:', this.vehicles);
  }

  ngOnChanges(): void {
    console.log('Vehicles changed:', this.vehicles);
  }

  get vehicleTypes(): string[] {
    const set = new Set<string>();
    (this.vehicles || []).forEach(v => { if (v.type) set.add(v.type); });
    return Array.from(set);
  }

  get pendingCount(): number {
    return (this.vehicles || []).filter(v => !v.isAdminApproved).length;
  }

  get approvedCount(): number {
    return (this.vehicles || []).filter(v => v.isAdminApproved).length;
  }

  get filteredVehicles(): Vehicle[] {
    if (!this.vehicles || !Array.isArray(this.vehicles)) return [];

    return this.vehicles.filter(v => {
      const isApproved = v.isAdminApproved === true;
      
      const matchesStatus =
        !this.statusFilter ||
        this.statusFilter === 'all' ||
        (this.statusFilter === 'pending' && !isApproved) ||
        (this.statusFilter === 'approved' && isApproved);

      const matchesType = 
        !this.typeFilter || 
        this.typeFilter === 'all' || 
        (v.type && v.type.toLowerCase().trim() === this.typeFilter.toLowerCase().trim());

      const driverName = (this.getDriverName(v.idDriver) || '').toLowerCase();
      const q = (this.searchQuery || '').toLowerCase().trim();
      const matchesQuery = !q ||
        (v.type && v.type.toLowerCase().includes(q)) ||
        (v.cin && v.cin.toLowerCase().includes(q)) ||
        (v.carteGrise && v.carteGrise.toLowerCase().includes(q)) ||
        (driverName && driverName.includes(q)) ||
        (v.idDriver && v.idDriver.toLowerCase().includes(q)) ||
        (v.id && v.id.toLowerCase().includes(q));

      return matchesStatus && matchesType && matchesQuery;
    });
  }

  getDriverName(driverId: string): string {
    if (!driverId) return 'Unknown Driver';
    const d = this.users.find(u => u.uid === driverId || u.id === driverId);
    return d ? d.name : driverId;
  }

  getDriverContact(driverId: string): string {
    if (!driverId) return '';
    const d = this.users.find(u => u.uid === driverId || u.id === driverId);
    return d ? (d.phone || d.email) : '';
  }

  isTruckType(type?: string): boolean {
    if (!type) return false;
    const t = type.toLowerCase();
    return t.includes('camion') || t.includes('isuzu');
  }

  isEstafetteType(type?: string): boolean {
    if (!type) return false;
    return type.toLowerCase().includes('estafette');
  }

  onInspectDriverClick(driverId: string): void {
    this.inspectDriver.emit(driverId);
  }

  openDossierComplet(vehicle: Vehicle): void {
    this.openDossierCompletTab(vehicle, 'carteGrise');
  }

  openDossierCompletTab(vehicle: Vehicle, tab: 'carteGrise' | 'cin' | 'vehicle'): void {
    const driver = this.users.find(u => u.uid === vehicle.idDriver || u.id === vehicle.idDriver);
    this.selectedVehicleDossier = { ...vehicle, driver };
    this.activeAssetTab = tab;
  }

  closeDossierComplet(): void {
    this.selectedVehicleDossier = null;
  }

  openAssetModal(url: string): void {
    if (!url) return;
  }

  getDisplayRef(val?: string, fallback: string = ''): string | null {
    if (!val) return fallback || null;
    const trimmed = val.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('assets/') ||
      trimmed.includes('/') ||
      trimmed.length > 25
    ) {
      return fallback || null;
    }
    return trimmed;
  }

  getVehicleAssetUrl(v: Vehicle | null): string {
    if (!v) return 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400&auto=format&fit=crop&q=80';
    const candidate = [
      v.vehiculeAsset,
      (v as any).vehicleAsset,
      (v as any).vehicleImage,
      (v as any).vehiculeImage,
      (v as any).photo
    ].find(c => c && typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:') || c.startsWith('assets/')));

    if (candidate) return candidate.trim();

    if (v.type) {
      const t = v.type.toLowerCase().trim();
      if (t.includes('light_medium')) return 'assets/trucks/light_medium.png';
      if (t.includes('medium_heavy')) return 'assets/trucks/medium_heavy.png';
      if (t.includes('super_heavy')) return 'assets/trucks/super_heavy.png';
      if (t.includes('light') || t.includes('voiture') || t.includes('car')) return 'assets/trucks/light.png';
      if (t.includes('heavy')) return 'assets/trucks/heavy.png';
      if (t.includes('medium') || t.includes('camion') || t.includes('truck')) return 'assets/trucks/medium.png';
      if (t.includes('popular') || t.includes('estafette')) return 'assets/trucks/popular.png';
      if (t.includes('isuzu')) return 'assets/trucks/isuzu.png';
    }

    return 'assets/trucks/medium.png';
  }

  getAdditionalAssets(v: Vehicle): { url: string; label: string }[] {
    if (!v) return [];
    const list: { url: string; label: string }[] = [];
    const seen = new Set<string>();

    const mainAssets = [
      (v.carteGriseAsset || v.carteGrise),
      (v.cinAsset || v.cin),
      v.vehiculeAsset,
      (v as any).vehicleAsset,
      (v as any).vehicleImage,
      (v as any).carteGriseFront,
      (v as any).carteIdentityFront
    ];
    mainAssets.forEach(a => {
      if (a && typeof a === 'string' && (a.startsWith('http') || a.startsWith('data:') || a.startsWith('assets/'))) {
        seen.add(a.trim());
      }
    });

    const rawAdditional = [
      ...(Array.isArray(v.allAssets) ? v.allAssets : []),
      ...(Array.isArray((v as any).optionalAssets) ? (v as any).optionalAssets : []),
      (v as any).carteGriseBack,
      (v as any).carteIdentityBack,
      (v as any).vehicleAssetBack
    ];

    let count = 1;
    rawAdditional.forEach(asset => {
      if (asset) {
        const urlStr = typeof asset === 'string' ? asset : (asset.url || asset.path || '');
        if (typeof urlStr === 'string') {
          const trimmed = urlStr.trim();
          if (
            (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('assets/')) &&
            !seen.has(trimmed)
          ) {
            seen.add(trimmed);
            list.push({ url: trimmed, label: `Extra Asset #${count++}` });
          }
        }
      }
    });

    return list;
  }

  onAssetImageError(event: Event, assetType: string = 'vehicle'): void {
    const img = event.target as HTMLImageElement;
    if ((img as any)._failed) return;
    (img as any)._failed = true;

    // Read img.alt to determine specific asset fallback
    const alt = (img.alt || assetType || '').toLowerCase();
    if (alt.includes('carte') || alt.includes('grise')) {
      img.src = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&auto=format&fit=crop&q=80';
    } else if (alt.includes('cin') || alt.includes('identity') || alt.includes('id')) {
      img.src = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80';
    } else {
      img.src = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400&auto=format&fit=crop&q=80';
    }
  }

  async toggleApproval(vehicle: Vehicle): Promise<void> {
    if (!vehicle.id) return;
    this.processingId = vehicle.id;
    try {
      const newStatus = !vehicle.isAdminApproved;
      await this.dashboardDataService.updateVehicleApproval(vehicle.id, newStatus);
      vehicle.isAdminApproved = newStatus;
      vehicle.isAssetsApproved = newStatus;
      if (this.selectedVehicleDossier && this.selectedVehicleDossier.id === vehicle.id) {
        this.selectedVehicleDossier.isAdminApproved = newStatus;
        this.selectedVehicleDossier.isAssetsApproved = newStatus;
      }
      this.crossTabSyncService.notifyVehicleApproved(vehicle.id, newStatus);
    } catch (err) {
      console.error('Error toggling vehicle approval:', err);
      alert('Error updating vehicle status');
    } finally {
      this.processingId = null;
    }
  }

  async deleteVehicle(vehicle: Vehicle): Promise<void> {
    if (!vehicle.id) return;
    if (!confirm(`Are you sure you want to remove vehicle ${vehicle.type} (${vehicle.id})?`)) return;

    this.processingId = vehicle.id;
    try {
      await this.dashboardDataService.deleteVehicle(vehicle.id);
      this.vehicles = this.vehicles.filter(v => v.id !== vehicle.id);
      if (this.selectedVehicleDossier && this.selectedVehicleDossier.id === vehicle.id) {
        this.closeDossierComplet();
      }
    } catch (err) {
      console.error('Error deleting vehicle:', err);
      alert('Error deleting vehicle');
    } finally {
      this.processingId = null;
    }
  }
}
