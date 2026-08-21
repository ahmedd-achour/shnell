import { Component, OnInit } from '@angular/core';
import {
  Firestore,
  doc,
  docData,
  collection,
  collectionData,
  query,
  where,
  writeBatch
} from '@angular/fire/firestore';

import { Timestamp } from 'firebase/firestore';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

// ================= MODELS =================

interface Vehicle {
  carteGrise: string;
  carteIdentityFront: string;
  carteIdentityBack: string;
  cin: string;
  matVehicle: string;
  idDriver: string;
  maxWeight: number;
  maxVolume: number;
  type: string;
  vehicleImage: string;
  isAdminApproved?: boolean;
}

interface ShnellUser {
  id?: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  vehicleId?: string;
  vehicleType?: string;
  fcmToken?: string;
  balance?: number;
  isActive?: boolean;
  profileImage?: string;
  darkMode?: boolean;
}

interface Rating {
  userId: string;
  rating: number;
  additionalInfos?: string;
  time?: any;
}

// ================= COMPONENT =================

@Component({
  selector: 'app-driver-details',
  templateUrl: './driver-details.component.html',
  styleUrls: ['./driver-details.component.css']
})
export class DriverDetailsComponent implements OnInit {

  driverId: string | null = null;
  currentDriverBalance: number = 0;

  driver$!: Observable<ShnellUser | null>;
  vehicle$!: Observable<Vehicle | null>;
  avgRating$!: Observable<{ avg: number; count: number } | null>;

  errorMessage: string | null = null;
  isSubmitting: boolean = false;

  constructor(
    private firestore: Firestore,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.driverId = this.route.snapshot.paramMap.get('id');

    if (!this.driverId) {
      this.errorMessage = 'Driver ID is missing or invalid';
      console.error(this.errorMessage);
      return;
    }

    this.loadDriverData();
  }

  // ================= LOAD DATA =================

  private loadDriverData(): void {
    const driverDocRef = doc(this.firestore, `users/${this.driverId}`);

    this.driver$ = docData(driverDocRef, { idField: 'id' }).pipe(
      map(data => (data ? (data as ShnellUser) : null)),
      tap(driver => {
        if (driver) {
          this.currentDriverBalance = driver.balance ?? 0;
        }
      }),
      catchError(err => {
        this.errorMessage = 'Failed to fetch driver data';
        console.error(err);
        return of(null);
      })
    );

    this.vehicle$ = this.driver$.pipe(
      switchMap(driver => {
        if (!driver || !driver.vehicleId) return of(null);

        const vehicleDocRef = doc(
          this.firestore,
          `vehicules/${driver.vehicleId}`
        );

        return docData(vehicleDocRef, { idField: 'id' }).pipe(
          map(data => (data ? (data as Vehicle) : null)),
          catchError(err => {
            console.error('Vehicle fetch error:', err);
            return of(null);
          })
        );
      })
    );

    const ratingsCol = collection(this.firestore, 'ratings');
    const ratingsQuery = query(
      ratingsCol,
      where('userId', '==', this.driverId)
    );

    this.avgRating$ = collectionData(ratingsQuery, { idField: 'id' }).pipe(
      map(ratings => {
        const list = ratings as Rating[];

        if (!list || list.length === 0) {
          return { avg: 0, count: 0 };
        }

        const count = list.length;
        const total = list.reduce((sum, r) => sum + (r.rating || 0), 0);
        const avg = total / count;

        return {
          avg: Number(avg.toFixed(1)),
          count
        };
      }),
      catchError(err => {
        console.error('Ratings fetch error:', err);
        return of({ avg: 0, count: 0 });
      })
    );
  }

  // ================= ADD FUNDS (MATCH FLUTTER MODEL) =================

  async addFunds(amountInput: string): Promise<void> {
    const amount = parseFloat(amountInput.trim());

    if (!this.driverId || isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    this.isSubmitting = true;

    try {
      const batch = writeBatch(this.firestore);

      const userDocRef = doc(this.firestore, 'users', this.driverId);

      const commissionsRef = collection(this.firestore, 'commissions');
      const commissionDocRef = doc(commissionsRef);

      const finalAmount = Number(amount.toFixed(2));
      const updatedBalance = Number(
        (this.currentDriverBalance + finalAmount).toFixed(2)
      );

      batch.update(userDocRef, {
        balance: updatedBalance
      });

      batch.set(commissionDocRef, {
        DriverId: String(this.driverId),
        commissionDeducted: finalAmount,
        percentageFees: 0.0,
        DealAmount: finalAmount,
        userId: 'ADMIN_PANEL',
        time: Timestamp.fromDate(new Date()),
        typeOfTransaction: 'recharge'
      });

      await batch.commit();

      this.currentDriverBalance = updatedBalance;

      alert(`Successfully added ${finalAmount} TND to driver wallet`);
    } catch (error: any) {
      console.error('Firestore batch error:', error?.message || error);
      alert('Database transaction failed.');
    } finally {
      this.isSubmitting = false;
    }
  }

  // ================= IMAGE FALLBACK =================

  handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if ((img as any)._failed) return;
    (img as any)._failed = true;

    const alt = (img.alt || '').toLowerCase();
    if (alt.includes('profile')) {
      img.src = 'assets/shnell.png';
    } else if (alt.includes('carte') || alt.includes('grise')) {
      img.src = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&auto=format&fit=crop&q=80';
    } else if (alt.includes('cin') || alt.includes('identity') || alt.includes('id')) {
      img.src = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80';
    } else {
      img.src = 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400&auto=format&fit=crop&q=80';
    }
  }
}
