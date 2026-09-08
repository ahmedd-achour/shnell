import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { CrossTabSyncService } from '../../../services/cross-tab-sync.service';
import { ShnellUser, Vehicle, Bid, Deals, Commission } from '../../models/dashboard.models';
import { toastSuccess, toastError } from '../../../shared/swal';

@Component({
  selector: 'app-driver-profile-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-profile-tab.component.html',
  styleUrls: ['./driver-profile-tab.component.css']
})
export class DriverProfileTabComponent implements OnInit, OnChanges, OnDestroy {
  @Input() driverId: string | null = null;
  @Input() driversList: ShnellUser[] = [];

  selectedDriver: ShnellUser | null = null;
  driverVehicles: Vehicle[] = [];
  driverBids: Bid[] = [];
  driverDeals: Deals[] = [];
  driverCommissions: Commission[] = [];

  loading: boolean = false;
  activeAssetModalUrl: string | null = null;
  isProcessing: boolean = false;

  // Notification Form State
  notifTitle: string = '';
  notifBody: string = '';
  notifType: string = 'info';
  notifSentSuccess: boolean = false;

  // Balance Recharge State
  rechargeAmount: number = 20;

  private destroy$ = new Subject<void>();

  constructor(
    private dashboardDataService: DashboardDataService,
    private crossTabSyncService: CrossTabSyncService
  ) {}

  ngOnInit(): void {
    if (!this.driverId && this.driversList.length > 0) {
      const firstDriver = this.driversList.find(u => u.role === 'driver');
      if (firstDriver) {
        this.selectDriver(firstDriver.uid || firstDriver.id || '');
      }
    } else if (this.driverId) {
      this.selectDriver(this.driverId);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['driverId'] && this.driverId) {
      this.selectDriver(this.driverId);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDriverSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target.value) {
      this.selectDriver(target.value);
    }
  }

  selectDriver(id: string): void {
    this.driverId = id;
    this.loading = true;

    const found = this.driversList.find(d => d.uid === id || d.id === id);
    if (found) {
      this.selectedDriver = { ...found };
    }

    this.dashboardDataService.getVehicles(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(vehicles => {
        this.driverVehicles = vehicles;
      });

    this.dashboardDataService.getBids(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(bids => {
        this.driverBids = bids;
      });

    this.dashboardDataService.getDeals(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(deals => {
        this.driverDeals = deals;
      });

    this.dashboardDataService.getDriverCommissions(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(commissions => {
        // Sort by time descending
        this.driverCommissions = commissions.sort((a, b) => {
          const tA = a.time?.seconds || 0;
          const tB = b.time?.seconds || 0;
          return tB - tA;
        });
        this.loading = false;
      });
  }

  get normalizedDeals(): { deal: Deals; statusLabel: string; statusClass: string }[] {
    return this.driverDeals.map(d => {
      const st = (d.status || '').toLowerCase().trim();
      let statusLabel = 'Pending';
      let statusClass = 'bg-secondary text-white';

      if (st === 'accepted' || st === 'acepted') {
        statusLabel = 'Accepted';
        statusClass = 'bg-primary text-white';
      } else if (st === 'almost') {
        statusLabel = 'In-Transit (On the way)';
        statusClass = 'bg-warning text-dark';
      } else if (st === 'terminated') {
        statusLabel = 'Completed';
        statusClass = 'bg-success text-white';
      }

      return { deal: d, statusLabel, statusClass };
    });
  }

  // UPDATE ACTIONS & CROSS-TAB BROADCASTING
  async toggleBanStatus(): Promise<void> {
    if (!this.selectedDriver) return;
    const uid = this.selectedDriver.uid || this.selectedDriver.id;
    if (!uid) return;

    this.isProcessing = true;
    try {
      const currentBan = !!(this.selectedDriver.isBan || this.selectedDriver.isBanned);
      const newBanState = await this.dashboardDataService.toggleUserBan(uid, currentBan);
      this.selectedDriver.isBan = newBanState;
      this.selectedDriver.isBanned = newBanState;
      this.selectedDriver.isActive = !newBanState;

      // Broadcast update across open tabs
      this.crossTabSyncService.notifyDriverUpdated(uid, {
        isBan: newBanState,
        isActive: !newBanState
      });
      toastSuccess(newBanState ? 'Chauffeur banni' : 'Chauffeur débanni');
    } catch (e) {
      console.error('Error toggling ban state:', e);
      toastError('Échec de la mise à jour du statut du chauffeur');
    } finally {
      this.isProcessing = false;
    }
  }

  async updateAccType(newAccType: string): Promise<void> {
    if (!this.selectedDriver) return;
    const uid = this.selectedDriver.uid || this.selectedDriver.id;
    if (!uid) return;

    this.isProcessing = true;
    try {
      await this.dashboardDataService.updateUserAccType(uid, newAccType);
      this.selectedDriver.accType = newAccType;

      this.crossTabSyncService.notifyDriverUpdated(uid, { accType: newAccType });
    } catch (e) {
      console.error('Error updating accType:', e);
    } finally {
      this.isProcessing = false;
    }
  }

  async rechargeDriverBalance(): Promise<void> {
    if (!this.selectedDriver || !this.rechargeAmount || this.rechargeAmount <= 0) return;
    const uid = this.selectedDriver.uid || this.selectedDriver.id;
    if (!uid) return;

    this.isProcessing = true;
    try {
      const newBal = await this.dashboardDataService.rechargeUserBalance(uid, this.selectedDriver.balance || 0, this.rechargeAmount);
      this.selectedDriver.balance = newBal;

      this.crossTabSyncService.notifyDriverUpdated(uid, { balance: newBal });
      toastSuccess(`${this.rechargeAmount} TND crédités sur le portefeuille de ${this.selectedDriver.name}`);
    } catch (e) {
      console.error('Error recharging balance:', e);
      toastError('Erreur lors du crédit du portefeuille');
    } finally {
      this.isProcessing = false;
    }
  }

  sendDriverNotification(): void {
    if (!this.selectedDriver || !this.notifTitle || !this.notifBody) return;
    const uid = this.selectedDriver.uid || this.selectedDriver.id || '';

    // Emit Cross-Tab signal so all tabs receive real-time notification
    this.crossTabSyncService.notifyNotificationSent(uid, this.notifTitle, this.notifBody);

    this.notifSentSuccess = true;
    setTimeout(() => {
      this.notifSentSuccess = false;
      this.notifTitle = '';
      this.notifBody = '';
    }, 3000);
  }

  async toggleVehicleApproval(vehicle: Vehicle): Promise<void> {
    if (!vehicle.id) return;
    try {
      const newStatus = !vehicle.isAdminApproved;
      await this.dashboardDataService.updateVehicleApproval(vehicle.id, newStatus);
      vehicle.isAdminApproved = newStatus;
      vehicle.isAssetsApproved = newStatus;

      this.crossTabSyncService.notifyVehicleApproved(vehicle.id, newStatus);
    } catch (e) {
      console.error('Error toggling vehicle approval:', e);
    }
  }

  getValidUrl(val: any): string | null {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('assets/')
    ) {
      return trimmed;
    }
    return null;
  }

  getCarteGriseAssetUrl(v: Vehicle | null): string {
    if (!v) return 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&auto=format&fit=crop&q=80';
    return (
      this.getValidUrl(v.carteGriseAsset) ||
      this.getValidUrl(v.carteGrise) ||
      this.getValidUrl((v as any).carteGriseFront) ||
      'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&auto=format&fit=crop&q=80'
    );
  }

  getCinAssetUrl(v: Vehicle | null): string {
    if (!v) return 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80';
    return (
      this.getValidUrl(v.cinAsset) ||
      this.getValidUrl(v.cin) ||
      this.getValidUrl((v as any).carteIdentityFront) ||
      'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80'
    );
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

  getAdditionalAssets(v: Vehicle): { url: string; label: string }[] {
    if (!v) return [];
    const list: { url: string; label: string }[] = [];
    const seen = new Set<string>();

    const mainAssets = [
      this.getValidUrl(v.carteGriseAsset),
      this.getValidUrl(v.carteGrise),
      this.getValidUrl(v.cinAsset),
      this.getValidUrl(v.cin),
      this.getValidUrl(v.vehiculeAsset),
      this.getValidUrl((v as any).vehicleAsset),
      this.getValidUrl((v as any).vehicleImage),
      this.getValidUrl((v as any).carteGriseFront),
      this.getValidUrl((v as any).carteIdentityFront)
    ];
    mainAssets.forEach(a => { if (a) seen.add(a); });

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
        const valid = this.getValidUrl(urlStr);
        if (valid && !seen.has(valid)) {
          seen.add(valid);
          list.push({ url: valid, label: `Extra Asset #${count++}` });
        }
      }
    });

    return list;
  }

  onAssetImageError(event: Event, assetType: string = 'vehicle'): void {
    const img = event.target as HTMLImageElement;
    if ((img as any)._failed) return;
    (img as any)._failed = true;

    // Use img.alt attribute to catch image loading errors dynamically
    const alt = (img.alt || assetType || '').toLowerCase();
    if (alt.includes('carte') || alt.includes('grise')) {
      img.src = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&auto=format&fit=crop&q=80';
    } else if (alt.includes('cin') || alt.includes('identity') || alt.includes('id')) {
      img.src = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80';
    } else {
      img.src = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400&auto=format&fit=crop&q=80';
    }
  }

  openAssetModal(url: string): void {
    if (url) this.activeAssetModalUrl = url;
  }

  closeAssetModal(): void {
    this.activeAssetModalUrl = null;
  }

  handleImageError(event: Event): void {
    this.onAssetImageError(event, 'vehicle');
  }
}
