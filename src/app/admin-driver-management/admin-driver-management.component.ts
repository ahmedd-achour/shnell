import { Component, OnInit, OnDestroy } from '@angular/core';
import { getDoc,
  Firestore,
  doc,
  docData,
  updateDoc,
  collection,
  query,
  where,
  collectionData,
  deleteDoc,
  Timestamp,
  setDoc
} from '@angular/fire/firestore';

import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Observable, of, Subject } from 'rxjs';
import { confirmAction, notify, toastSuccess, toastError } from '../shared/swal';
import { 
  catchError,
  switchMap,
  takeUntil,
  filter,
  map
} from 'rxjs/operators';

@Component({
  selector: 'app-admin-driver-management',
  templateUrl: './admin-driver-management.component.html',
  styleUrls: ['./admin-driver-management.component.css']
})
export class AdminDriverManagementComponent implements OnInit, OnDestroy {

  driver$!: Observable<any>;
  vehicles$!: Observable<any[]>;
  ratings$!: Observable<any[]>;
  bids$!: Observable<any[]>;
  deals$!: Observable<any[]>;
  avgRating$!: Observable<{ avg: number; count: number }>;
  verification$!: Observable<any>;

  driverId: string | null = null;
  rechargeAmount: number | null = null;
  isUpdating: boolean = false;

  activeAsset: { url: string; label: string } | null = null;
  selectedImage: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private firestore: Firestore,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDriverFromQueryParams();

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.loadDriverFromQueryParams();
    });
  }

  private loadDriverFromQueryParams(): void {
    const token = this.route.snapshot.queryParamMap.get('token') ||
                  this.route.snapshot.queryParamMap.get('id') ||
                  this.route.snapshot.paramMap.get('id');

    if (!token) {
      this.driverId = null;
      this.driver$ = of(null);
      this.vehicles$ = of([]);
      return;
    }

    this.driverId = token;
    this.initializeDataStreams(token);
  }

  private initializeDataStreams(uid: string): void {
    const driverRef = doc(this.firestore, `users/${uid}`);

    this.driver$ = docData(driverRef, { idField: 'id' }).pipe(
      takeUntil(this.destroy$),
      switchMap(driver => {
        if (!driver) return of(null);
        // fetch wallet stream and combine
        const walletRef = doc(this.firestore, `wallets/${uid}`);
        return docData(walletRef).pipe(
          map(wallet => ({
            ...driver,
            balance: wallet ? (wallet as any).balance : (driver as any).balance
          }))
        );
      }),
      catchError(err => {
        console.error('Driver fetch error:', err);
        return of(null);
      })
    );

    this.vehicles$ = this.driver$.pipe(
      switchMap(driver => {
        if (!driver?.id) return of([]);

        const vCol = collection(this.firestore, 'vehicles');
        const vQuery = query(vCol, where('idDriver', '==', driver.id));

        return collectionData(vQuery, { idField: 'id' }).pipe(
          catchError(err => {
            console.error('Vehicle fetch error:', err);
            return of([]);
          })
        );
      }),
      takeUntil(this.destroy$)
    );

    const bidsCol = collection(this.firestore, 'bids');
    const bidsQuery = query(bidsCol, where('idDriver', '==', uid));
    this.bids$ = collectionData(bidsQuery, { idField: 'id' }).pipe(
      takeUntil(this.destroy$),
      catchError(() => of([]))
    );

    const dealsCol = collection(this.firestore, 'deals');
    const dealsQuery = query(dealsCol, where('idDriver', '==', uid));
    this.deals$ = collectionData(dealsQuery, { idField: 'id' }).pipe(
      takeUntil(this.destroy$),
      catchError(() => of([]))
    );

    const ratingsCol = collection(this.firestore, 'ratings');
    const ratingsQuery = query(ratingsCol, where('driverId', '==', uid));

    this.ratings$ = collectionData(ratingsQuery, { idField: 'id' }).pipe(
      takeUntil(this.destroy$),
      catchError(err => {
        console.error('Ratings fetch error:', err);
        return of([]);
      })
    );

    this.avgRating$ = this.ratings$.pipe(
      map((ratings: any[]) => {
        if (!ratings || ratings.length === 0) {
          return { avg: 0, count: 0 };
        }

        const total = ratings.reduce(
          (sum, r) => sum + (r.rating || 0),
          0
        );

        return {
          avg: Number((total / ratings.length).toFixed(1)),
          count: ratings.length
        };
      })
    );

    const verifyRef = doc(this.firestore, `drivers/${uid}`);
    this.verification$ = docData(verifyRef).pipe(
      takeUntil(this.destroy$),
      catchError(err => {
        console.error('Verification fetch error:', err);
        return of(null);
      })
    );
  }

  async setDriverAccType(driverId: string, accType: string) {
    if (!driverId) return;
    this.isUpdating = true;
    try {
      const userRef = doc(this.firestore, `users/${driverId}`);
      await updateDoc(userRef, { accType });
      toastSuccess('Type d\'abonnement mis à jour');
    } catch (err) {
      console.error('Account type update failed:', err);
      toastError('Erreur lors de la mise à jour du type d\'abonnement');
    } finally {
      this.isUpdating = false;
    }
  }

  async toggleBan(driver: any) {
    if (!driver.id) return;
    this.isUpdating = true;
    try {
      const userRef = doc(this.firestore, `users/${driver.id}`);
      const newStatus = !driver.isBan;
      await updateDoc(userRef, { isBan: newStatus });
      toastSuccess(`Chauffeur ${newStatus ? 'banni' : 'débanni'} avec succès`);
    } catch (err) {
      console.error('Ban status update failed:', err);
      toastError('Erreur lors de la mise à jour du statut');
    } finally {
      this.isUpdating = false;
    }
  }

  setPresetRecharge(amount: number) {
    this.rechargeAmount = amount;
  }

  // Updates for isAdminApproved and isAssetsApproved
  async updateVehicleAdminApproval(vehicleId: string, approved: boolean) {
    if (!vehicleId) return;
    this.isUpdating = true;

    try {
      const vRef = doc(this.firestore, `vehicles/${vehicleId}`);
      await updateDoc(vRef, { isAdminApproved: approved });
    } catch (err) {
      console.error('Vehicle admin approval update failed:', err);
      toastError('Échec de la mise à jour du statut admin du véhicule');
    } finally {
      this.isUpdating = false;
    }
  }

  async updateVehicleAssetsApproval(vehicleId: string, approved: boolean) {
    if (!vehicleId) return;
    this.isUpdating = true;

    try {
      const vRef = doc(this.firestore, `vehicles/${vehicleId}`);
      await updateDoc(vRef, { isAssetsApproved: approved });
    } catch (err) {
      console.error('Vehicle assets approval update failed:', err);
      toastError('Échec de la mise à jour de la validation des documents');
    } finally {
      this.isUpdating = false;
    }
  }

  async updateVehicleBothApprovals(vehicleId: string, approved: boolean) {
    if (!vehicleId) return;
    this.isUpdating = true;

    try {
      const vRef = doc(this.firestore, `vehicles/${vehicleId}`);
      await updateDoc(vRef, {
        isAdminApproved: approved,
        isAssetsApproved: approved
      });
    } catch (err) {
      console.error('Vehicle approval update failed:', err);
      toastError('Échec de la mise à jour du véhicule');
    } finally {
      this.isUpdating = false;
    }
  }

  async deleteThisVehicle(vehicle: any) {
    const ok = await confirmAction({
      title: 'Supprimer ce véhicule ?',
      text: 'Cette action est définitive.',
      danger: true,
    });
    if (!ok) return;

    this.isUpdating = true;
    try {
      await deleteDoc(doc(this.firestore, 'vehicles', vehicle.id));
      toastSuccess('Véhicule supprimé avec succès');
    } catch (err: any) {
      console.error(err);
      toastError(err.message || 'Erreur lors de la suppression');
    } finally {
      this.isUpdating = false;
    }
  }

  async addFunds(driver: any) {
    if (!this.rechargeAmount || this.rechargeAmount <= 0) {
      notify('warning', 'Montant invalide', 'Saisissez un montant supérieur à 0.');
      return;
    }

    this.isUpdating = true;

    try {
      const db = this.firestore;
      const walletRef = doc(db, `wallets/${driver.id}`);
      const commissionsRef = doc(collection(db, 'commissions'));

      const amount = Number(this.rechargeAmount.toFixed(2));
      const newBalance = Number(((driver.balance || 0) + amount).toFixed(2));

      await updateDoc(walletRef, {
        balance: newBalance
      });

      await setDoc(commissionsRef, {
        DriverId: String(driver.id),
        commissionDeducted: amount,
        percentageFees: 0.0,
        DealAmount: amount,
        userId: 'ADMIN_PANEL',
        time: Timestamp.fromDate(new Date()),
        typeOfTransaction: 'recharge'
      });

      toastSuccess(`Solde mis à jour : +${amount} TND`);
      this.rechargeAmount = null;

    } catch (err) {
      console.error('Recharge failed:', err);
      toastError('Erreur lors de la recharge');
    } finally {
      this.isUpdating = false;
    }
  }

  openImage(url: string, label: string = 'Document') {
    if (!url) return;
    this.activeAsset = { url, label };
    document.body.style.overflow = 'hidden';
  }

  viewInBrowser(url: string) {
    if (!url) return;
    window.open(url, '_blank');
  }

  closeMaxView() {
    this.activeAsset = null;
    document.body.style.overflow = '';
  }

  handleImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if ((img as any)._failed) return;
    (img as any)._failed = true;
    img.src = 'assets/placeholder.png'; // Removed hardcoded Unsplash URLs
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}


