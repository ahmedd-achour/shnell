import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { withLicenseUrls } from '../../../../Models/driver_verification';
import { FleetIntelligenceService, DriverStatus } from '../../../services/fleet-intelligence.service';
import { CrossTabSyncService } from '../../../services/cross-tab-sync.service';
import { Subscription, Observable } from 'rxjs';
import { Firestore, doc, docData, collection, query, where, collectionData, updateDoc, setDoc, addDoc, serverTimestamp } from '@angular/fire/firestore';
import { ShnellUser } from '../../../../Models/shnellUsers.models';
import { DashboardDataService } from '../../../shnell-dashboard/services/dashboard-data.service';
import { WalletLike, walletBalances, rechargeCurrencies, rechargeConfirmHtml, rechargeResultText, validReceiptRef } from '../../../shnell-dashboard/services/wallet';
import { confirmAction } from '../../../shared/swal';
import { Vehicle } from '../../../../Models/vehicle';

@Component({
  selector: 'app-driver-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-details.component.html',
  styleUrls: ['./driver-details.component.css']
})
export class DriverDetailsComponent implements OnInit, OnDestroy {
  driverId: string | null = null;
  driver: ShnellUser | null = null;
  vehicle: Vehicle | null = null;
  status: DriverStatus | null = null;

  metrics = {
    completedOrders: 0,
    cancelledOrders: 0,
    acceptanceRate: 0,
    avgDeliveryTime: '0m',
    totalDistance: 0,
    totalRevenue: 0
  };

  // State Update Controls
  isProcessing: boolean = false;
  bids$!: Observable<any[]>;
  deals$!: Observable<any[]>;
  avgRating$!: Observable<{ avg: number; count: number }>;
  verification$!: Observable<any>;
  selectedDriverVerification: any = null;
  rechargeAmount: number = 20;
  rechargeCurrency: string = '';
  rechargeReference: string = '';
  /** wallets/{uid}: the driver's money, one balance per currency. */
  wallet: WalletLike | null = null;
  readonly walletBalances = walletBalances;
  readonly rechargeCurrencies = rechargeCurrencies;

  // Notification Modal/Form
  notifTitle: string = '';
  notifBody: string = '';
  notifSentSuccess: boolean = false;

  private subscription = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private fleetService: FleetIntelligenceService,
    private firestore: Firestore,
    private router: Router,
    private crossTabSyncService: CrossTabSyncService,
    private dashboardDataService: DashboardDataService
  ) {}

  ngOnInit(): void {
    this.subscription.add(
      this.route.queryParams.subscribe(params => {
        this.driverId = params['id'];
        if (this.driverId) {
          this.loadDriverData(this.driverId);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  loadDriverData(id: string): void {
    // Basic Profile
    const driverRef = doc(this.firestore, `users/${id}`);
    this.subscription.add(
      docData(driverRef).subscribe(data => {
        if (data) {
          this.driver = ShnellUser.fromJson(data);
        }
      })
    );
    this.subscription.add(
      docData(doc(this.firestore, `wallets/${id}`)).subscribe(w => {
        this.wallet = (w as WalletLike) || null;
      })
    );

    // Vehicle
    const vQuery = query(collection(this.firestore, 'vehicles'), where('idDriver', '==', id));
    this.subscription.add(
      collectionData(vQuery, { idField: 'id' }).subscribe(vehicles => {
        if (vehicles && vehicles.length > 0) {
          this.vehicle = Vehicle.fromJson(vehicles[0]);
        }
      })
    );

    // Live Status
    this.subscription.add(
      this.fleetService.getDriverStatus(id).subscribe(status => {
        this.status = status;
      })
    );

    // Activity Metrics (from Deals/Orders)
    const dealsQuery = query(collection(this.firestore, 'deals'), where('idDriver', '==', id));
    this.subscription.add(
      collectionData(dealsQuery).subscribe(deals => {
        if (deals) {
          this.metrics.completedOrders = deals.filter((d: any) => d.status === 'completed' || d.status === 'accepted').length;
          this.metrics.cancelledOrders = deals.filter((d: any) => d.status === 'canceled').length;
          const total = this.metrics.completedOrders + this.metrics.cancelledOrders;
          this.metrics.acceptanceRate = total > 0 ? Math.round((this.metrics.completedOrders / total) * 100) : 0;
          this.metrics.totalRevenue = this.metrics.completedOrders * 25;
        }
      })
    );

    // Personal Verification
    const verifyRef = doc(this.firestore, `drivers/${id}`);
    this.subscription.add(
      docData(verifyRef).subscribe(data => {
        this.selectedDriverVerification = withLicenseUrls(data) || null;
      })
    );
  }

  // CROSS-TAB LINKED UPDATE METHODS
  async toggleBanStatus(): Promise<void> {
    if (!this.driver || !this.driverId) return;
    this.isProcessing = true;
    try {
      const currentBan = !!(this.driver.isBanned);
      const newBan = !currentBan;
      const userRef = doc(this.firestore, `users/${this.driverId}`);
      await updateDoc(userRef, {
        isBanned: newBan,
        isActive: !newBan
      });

      this.driver.isBanned = newBan;
      this.driver.isActive = !newBan;

      // Broadcast update across open tabs (map tab)
      this.crossTabSyncService.notifyDriverUpdated(this.driverId, { isBanned: newBan, isActive: !newBan });
    } catch (e) {
      console.error('Error updating ban status:', e);
    } finally {
      this.isProcessing = false;
    }
  }

  async updateAccType(accType: string): Promise<void> {
    if (!this.driver || !this.driverId) return;
    this.isProcessing = true;
    try {
      const userRef = doc(this.firestore, `users/${this.driverId}`);
      await updateDoc(userRef, { accType });
      this.driver.accType = accType;

      this.crossTabSyncService.notifyDriverUpdated(this.driverId, { accType });
    } catch (e) {
      console.error('Error updating accType:', e);
    } finally {
      this.isProcessing = false;
    }
  }

    async rechargeBalance(): Promise<void> {
    if (!this.driver || !this.driverId || !this.rechargeAmount || this.rechargeAmount <= 0) return;
    if (!/^[A-Z]{3}$/.test(this.rechargeCurrency) || this.isProcessing) return;
    if (!validReceiptRef(this.rechargeReference)) {
      alert('Saisissez le numéro du reçu');
      return;
    }
    this.isProcessing = true;
    try {
      const ok = await confirmAction({
        title: 'Confirmer la recharge',
        html: rechargeConfirmHtml(this.driver.name, this.wallet, this.rechargeAmount, this.rechargeCurrency),
        confirmText: `Créditer ${this.rechargeAmount} ${this.rechargeCurrency}`,
      });
      if (!ok) return;
      // Server-side: wallets/{uid}.balances[currency] + ledger line, atomically.
      const res = await this.dashboardDataService.rechargeUserBalance(this.driverId, this.rechargeAmount, this.rechargeCurrency, this.rechargeReference);
      this.rechargeReference = '';
      alert(rechargeResultText(this.rechargeAmount, res));
    } catch (e: any) {
      console.error('Error recharging balance:', e);
      alert(e?.message || 'Recharge failed');
    } finally {
      this.isProcessing = false;
    }
  }

  sendNotification(): void {
    if (!this.driverId || !this.notifTitle || !this.notifBody) return;
    // Broadcast notification to all linked open tabs
    this.crossTabSyncService.notifyNotificationSent(this.driverId, this.notifTitle, this.notifBody);
    this.notifSentSuccess = true;
    setTimeout(() => {
      this.notifSentSuccess = false;
      this.notifTitle = '';
      this.notifBody = '';
    }, 3000);
  }

  async toggleVehicleApproval(): Promise<void> {
    if (!this.vehicle || !this.vehicle.id) return;
    this.isProcessing = true;
    try {
      const newApproval = !this.vehicle.isAdminApproved;
      const vRef = doc(this.firestore, `vehicles/${this.vehicle.id}`);
      await updateDoc(vRef, { isAdminApproved: newApproval, isAssetsApproved: newApproval });
      this.vehicle.isAdminApproved = newApproval;
      this.vehicle.isAssetsApproved = newApproval;

      this.crossTabSyncService.notifyVehicleApproved(this.vehicle.id, newApproval);
    } catch (e) {
      console.error('Error updating vehicle approval:', e);
    } finally {
      this.isProcessing = false;
    }
  }

  async toggleDriverVerification(): Promise<void> {
    if (!this.driver || !this.driver.uid || !this.selectedDriverVerification) return;
    this.isProcessing = true;
    try {
      const currentStatus = this.selectedDriverVerification.isVerified === true;
      const newStatus = !currentStatus;
      const verifyRef = doc(this.firestore, `drivers/${this.driver.uid}`);
      await updateDoc(verifyRef, { isVerified: newStatus });
      this.selectedDriverVerification.isVerified = newStatus;
    } catch (e) {
      console.error('Error updating driver verification status:', e);
    } finally {
      this.isProcessing = false;
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

  getVehicleAssetUrl(v: Vehicle | null): string {
    if (!v) return 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400&auto=format&fit=crop&q=80';
    const candidate = [v.vehicleAssetUrl].find(c => c && typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:') || c.startsWith('assets/')));

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

  getAdditionalAssets(v: Vehicle | null): { url: string; label: string }[] {
    if (!v) return [];
    const list: { url: string; label: string }[] = [];
    const seen = new Set<string>();

    const mainAssets = [this.getValidUrl(v.vehicleAssetUrl)];
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

  handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if ((img as any)._failed) return;
    (img as any)._failed = true;

    // Inspect img.alt attribute to catch error and pick exact fallback image
    const alt = (img.alt || '').toLowerCase();
    if (alt.includes('carte') || alt.includes('grise')) {
      img.src = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&auto=format&fit=crop&q=80';
    } else if (alt.includes('cin') || alt.includes('identity') || alt.includes('id')) {
      img.src = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80';
    } else {
      img.src = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400&auto=format&fit=crop&q=80';
    }
  }

  goBack(): void {
    this.router.navigate(['/home-admin']);
  }
}
