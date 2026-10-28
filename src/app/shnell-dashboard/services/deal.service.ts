import { Injectable, inject } from '@angular/core';
import { Firestore, doc, collection, setDoc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { MissionPriceResult } from './pricing.service';

export interface CreateDealInput {
  orderId: string;
  driverId: string;
  userId: string;
  price: MissionPriceResult;
  commissionPercentage: number;
  commissionAmount: number;
}

/** Creates the priced Deal a driver accepts for an entire mission (spec §5, §9) and
 *  marks the order as offered/assigned. Complements (does not replace)
 *  DashboardDataService.assignDriverToOrder(), which the admin deals-tab still uses
 *  for its simple no-price manual assignment. */
@Injectable({ providedIn: 'root' })
export class DealService {
  private firestore = inject(Firestore);

  async createDeal(input: CreateDealInput): Promise<string> {
    const orderRef = doc(this.firestore, 'orders', input.orderId);
    await updateDoc(orderRef, { isAccepted: true });

    const dealRef = doc(collection(this.firestore, 'deals'));
    await setDoc(dealRef, {
      idOrder: input.orderId,
      idDriver: input.driverId,
      idUser: input.userId,
      status: 'accepted',
      timestamp: serverTimestamp(),
      agreedPrice: input.price.agreedPrice,
      currency: 'TND',
      commissionPercentage: input.commissionPercentage,
      commissionAmount: input.commissionAmount,
      driverAmount: input.price.agreedPrice,
      paymentStatus: 'unpaid',
      // onDealLifecycle pushes "job assigned" to the driver and "driver
      // found" to the customer (notifications/ is the device registry only).
      assignedBy: 'admin',
      acceptedAt: serverTimestamp()
    });

    return dealRef.id;
  }
}
