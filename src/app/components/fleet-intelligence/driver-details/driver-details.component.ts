import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FleetIntelligenceService, DriverStatus } from '../../../services/fleet-intelligence.service';
import { CrossTabSyncService } from '../../../services/cross-tab-sync.service';
import { Subscription } from 'rxjs';
import { Firestore, doc, docData, collection, query, where, collectionData, updateDoc, addDoc, serverTimestamp } from '@angular/fire/firestore';
import { ShnellUser } from '../../../../Models/shnellUsers.models';
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
  rechargeAmount: number = 20;

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
    private crossTabSyncService: CrossTabSyncService
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
          this.metrics.cancelledOrders = deals.filter((d: any) => d.status === 'cancelled').length;
          const total = this.metrics.completedOrders + this.metrics.cancelledOrders;
          this.metrics.acceptanceRate = total > 0 ? Math.round((this.metrics.completedOrders / total) * 100) : 0;
          this.metrics.totalRevenue = this.metrics.completedOrders * 25;
        }
      })
    );
  }

  // CROSS-TAB LINKED UPDATE METHODS
  async toggleBanStatus(): Promise<void> {
    if (!this.driver || !this.driverId) return;
    this.isProcessing = true;
    try {
      const currentBan = !!(this.driver.isBan || this.driver.isBanned);
      const newBan = !currentBan;
      const userRef = doc(this.firestore, `users/${this.driverId}`);
      await updateDoc(userRef, {
        isBan: newBan,
        isBanned: newBan,
        isActive: !newBan
      });

      this.driver.isBan = newBan;
      this.driver.isBanned = newBan;
      this.driver.isActive = !newBan;

      // Broadcast update across open tabs (map tab)
      this.crossTabSyncService.notifyDriverUpdated(this.driverId, { isBan: newBan, isActive: !newBan });
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
    this.isProcessing = true;
    try {
      const newBal = (this.driver.balance || 0) + this.rechargeAmount;
      const userRef = doc(this.firestore, `users/${this.driverId}`);
      await updateDoc(userRef, { balance: newBal });

      const commColRef = collection(this.firestore, 'commissions');
      await addDoc(commColRef, {
        userId: this.driverId,
        DriverId: this.driverId,
        commissionDeducted: this.rechargeAmount,
        DealAmount: this.rechargeAmount,
        time: serverTimestamp(),
        typeOfTransaction: 'recharge'
      });

      this.driver.balance = newBal;
      this.crossTabSyncService.notifyDriverUpdated(this.driverId, { balance: newBal });
      alert(`Credited ${this.rechargeAmount} TND to ${this.driver.name}'s account.`);
    } catch (e) {
      console.error('Error recharging balance:', e);
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
