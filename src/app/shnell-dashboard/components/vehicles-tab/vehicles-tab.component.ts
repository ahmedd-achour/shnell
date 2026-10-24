import { Component, Input, Output, EventEmitter, OnInit, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Vehicle, ShnellUser } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { withLicenseUrls } from '../../../../Models/driver_verification';
import { CrossTabSyncService } from '../../../services/cross-tab-sync.service';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { confirmAction, toastSuccess, toastError } from '../../../shared/swal';
import { aiSignalLabel, aiVerdictLabel, aiVerdictClass, aiReviewStatusLabel, aiReviewStatusClass } from '../../../shared/ai-review-labels';

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

  selectedVehicleDossier: (Vehicle & { driver?: ShnellUser }) | null = null;
  selectedDriverVerification: any = null;
  activeAssetTab: string | number = 'vehicle';

  /** Carte grise of the open dossier (vehicles/{id}/private/papers). */
  selectedPapers: { carteGriseFrontUrl?: string; carteGriseBackUrl?: string } | null = null;
  /** Type the admin approves with — starts at the AI suggestion. */
  selectedType = '';
  /** settings/vehicles keys, cheapest first as in the catalog. */
  catalogTypes: string[] = [];
  private static readonly CATALOG_ORDER = ['super_light', 'light', 'light_medium', 'medium', 'medium_heavy', 'heavy', 'super_heavy'];

  constructor(
    private dashboardDataService: DashboardDataService,
    private crossTabSyncService: CrossTabSyncService,
    private firestore: Firestore
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
    return t.includes('heavy') || t.includes('medium');
  }

  isEstafetteType(type?: string): boolean {
    if (!type) return false;
    return type.toLowerCase().includes('light');
  }

  onInspectDriverClick(driverId: string): void {
    this.inspectDriver.emit(driverId);
  }

  openDossierComplet(vehicle: Vehicle): void {
    this.openDossierCompletTab(vehicle, 'vehicle');
  }

  async openDossierCompletTab(vehicle: Vehicle, tab: string | number) {
    const driver = this.users.find(u => u.uid === vehicle.idDriver || u.id === vehicle.idDriver);
    this.selectedVehicleDossier = { ...vehicle, driver };
    this.activeAssetTab = tab;
    this.selectedDriverVerification = null;
    this.selectedPapers = null;
    this.selectedType = vehicle.type || vehicle.aiSuggestion?.type || '';

    this.loadCatalog();
    if (vehicle.id) {
      getDoc(doc(this.firestore, `vehicles/${vehicle.id}/private/papers`))
        .then(snap => {
          if (snap.exists() && this.selectedVehicleDossier?.id === vehicle.id) this.selectedPapers = snap.data() as any;
        })
        .catch(e => console.error('Failed to fetch carte grise', e));
    }

    try {
      const docSnap = await getDoc(doc(this.firestore, `drivers/${vehicle.idDriver}`));
      if (docSnap.exists()) {
        this.selectedDriverVerification = withLicenseUrls(docSnap.data());
      }
    } catch (e) {
      console.error('Failed to fetch driver verification', e);
    }
  }

  closeDossierComplet(): void {
    this.selectedVehicleDossier = null;
    this.selectedPapers = null;
  }

  private async loadCatalog(): Promise<void> {
    if (this.catalogTypes.length) return;
    try {
      const snap = await getDoc(doc(this.firestore, 'settings/vehicles'));
      const keys = Object.keys(snap.data() || {});
      const order = VehiclesTabComponent.CATALOG_ORDER;
      this.catalogTypes = keys.sort((a, b) =>
        (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
    } catch (e) {
      console.error('Failed to load vehicle catalog', e);
      this.catalogTypes = [...VehiclesTabComponent.CATALOG_ORDER];
    }
  }

  /** Waiting for the AI, or the AI could not decide: the admin must pick. */
  needsTypeChoice(v: Vehicle): boolean {
    return !v.type && !v.isAdminApproved;
  }

  aiConfidenceClass(c?: string): string {
    return c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'danger';
  }

  readonly verdictLabel = aiVerdictLabel;
  readonly verdictClass = aiVerdictClass;
  readonly reviewStatusLabel = aiReviewStatusLabel;
  readonly reviewStatusClass = aiReviewStatusClass;
  readonly signalLabel = aiSignalLabel;

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
      (v as any).vehicleAssetUrl,
      (v as any).vehiculeAsset,
      (v as any).vehicleAsset,
      (v as any).vehicleImage,
      (v as any).vehiculeImage,
      (v as any).photo
    ].find(c => c && typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:') || c.startsWith('assets/')));

    if (candidate) return candidate.trim();

    if (v.type) {
      const t = v.type.toLowerCase().trim();
      if (t.includes('medium_heavy')) return 'assets/trucks/medium_heavy.png';
      if (t.includes('super_heavy')) return 'assets/trucks/super_heavy.png';
      if (t.includes('light') || t.includes('voiture') || t.includes('car')) return 'assets/trucks/light.png';
      if (t.includes('heavy')) return 'assets/trucks/heavy.png';
      if (t.includes('medium') || t.includes('camion') || t.includes('truck')) return 'assets/trucks/medium.png';
      if (t.includes('popular') || t.includes('light')) return 'assets/trucks/popular.png';
      if (t.includes('medium')) return 'assets/trucks/isuzu.png';
    }

    return 'assets/trucks/medium.png';
  }

  getTruckTypeAsset(type?: string): string {
    if (!type) return 'assets/trucks/medium.png';
    const t = type.toLowerCase().trim();
    if (t.includes('medium_heavy')) return 'assets/trucks/medium_heavy.png';
    if (t.includes('super_heavy')) return 'assets/trucks/super_heavy.png';
    if (t.includes('light') || t.includes('voiture') || t.includes('car')) return 'assets/trucks/light.png';
    if (t.includes('heavy')) return 'assets/trucks/heavy.png';
    if (t.includes('medium') || t.includes('camion') || t.includes('truck')) return 'assets/trucks/medium.png';
    if (t.includes('popular') || t.includes('light')) return 'assets/trucks/popular.png';
    if (t.includes('medium')) return 'assets/trucks/isuzu.png';
    return 'assets/trucks/medium.png';
  }

  getAdditionalAssets(v: Vehicle): { url: string; label: string }[] {
    if (!v) return [];
    const list: { url: string; label: string }[] = [];
    const seen = new Set<string>();

    const mainAssets = [
      (v as any).vehicleAsset,
      (v as any).vehicleImage,
      (v as any).vehiculeImage,
      (v as any).photo
    ];
    mainAssets.forEach(a => {
      if (a && typeof a === 'string' && (a.startsWith('http') || a.startsWith('data:') || a.startsWith('assets/'))) {
        seen.add(a.trim());
      }
    });

    const rawAdditional = [
      ...(Array.isArray(v.allAssets) ? v.allAssets : []),
      ...(Array.isArray((v as any).optionalAssets) ? (v as any).optionalAssets : []),
      ...(Array.isArray((v as any).additionalAssets) ? (v as any).additionalAssets : [])
    ];
    
    let counter = 1;
    rawAdditional.forEach(a => {
      if (a && typeof a === 'string' && (a.startsWith('http') || a.startsWith('data:') || a.startsWith('assets/'))) {
        const trimmed = a.trim();
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          list.push({ url: trimmed, label: `Extra Asset #${counter++}` });
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
    const newStatus = !vehicle.isAdminApproved;
    // The type chosen in the open dossier (AI suggestion or the admin's pick).
    const inDossier = this.selectedVehicleDossier?.id === vehicle.id;
    const type = newStatus && inDossier ? this.selectedType : '';
    if (newStatus && !(type || vehicle.type)) {
      // No type yet (classifier pending or unsure): decide it in the dossier.
      this.openDossierCompletTab(vehicle, 'vehicle');
      toastError('Choisissez le type de véhicule avant d\'approuver.');
      return;
    }
    this.processingId = vehicle.id;
    try {
      await this.dashboardDataService.updateVehicleApproval(vehicle.id, newStatus, type || undefined);
      vehicle.isAdminApproved = newStatus;
      vehicle.isAssetsApproved = newStatus;
      if (type) vehicle.type = type;
      if (this.selectedVehicleDossier && this.selectedVehicleDossier.id === vehicle.id) {
        this.selectedVehicleDossier.isAdminApproved = newStatus;
        this.selectedVehicleDossier.isAssetsApproved = newStatus;
        if (type) this.selectedVehicleDossier.type = type;
      }
      this.crossTabSyncService.notifyVehicleApproved(vehicle.id, newStatus);
      toastSuccess(newStatus ? 'Véhicule approuvé' : 'Approbation révoquée');
    } catch (err) {
      console.error('Error toggling vehicle approval:', err);
      const e = err as { code?: string; message?: string };
      const detail = [e?.code, e?.message].filter(Boolean).join(' — ');
      toastError('Erreur lors de la mise à jour du véhicule' + (detail ? ` : ${detail}` : ''));
    } finally {
      this.processingId = null;
    }
  }

  async toggleDriverVerification(driverId: string): Promise<void> {
    if (!driverId || !this.selectedDriverVerification) return;
    this.processingId = driverId;
    try {
      const currentStatus = this.selectedDriverVerification.isVerified === true;
      const newStatus = !currentStatus;
      await this.dashboardDataService.setDriverVerified(driverId, newStatus);
      this.selectedDriverVerification.isVerified = newStatus;
      toastSuccess(newStatus ? 'Vérification approuvée' : 'Vérification révoquée');
    } catch (e) {
      console.error('Error toggling driver verification:', e);
      toastError('Erreur lors de la mise à jour de la vérification');
    } finally {
      this.processingId = null;
    }
  }

  async deleteVehicle(vehicle: Vehicle): Promise<void> {
    if (!vehicle.id) return;
    const ok = await confirmAction({
      title: 'Supprimer ce véhicule ?',
      text: `${vehicle.type || 'Véhicule'} (${vehicle.id}) sera définitivement retiré de la flotte.`,
      danger: true,
    });
    if (!ok) return;

    this.processingId = vehicle.id;
    try {
      await this.dashboardDataService.deleteVehicle(vehicle.id);
      this.vehicles = this.vehicles.filter(v => v.id !== vehicle.id);
      if (this.selectedVehicleDossier && this.selectedVehicleDossier.id === vehicle.id) {
        this.closeDossierComplet();
      }
      toastSuccess('Véhicule supprimé');
    } catch (err) {
      console.error('Error deleting vehicle:', err);
      toastError('Erreur lors de la suppression du véhicule');
    } finally {
      this.processingId = null;
    }
  }
}
