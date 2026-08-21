import { Component, OnInit, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, collectionData, doc, getDoc, query, where, documentId } from '@angular/fire/firestore';
import { DropOffDataModel } from '../../../Models/dropoffdata.model';
import { firstValueFrom } from 'rxjs';

interface StopView {
  id: string;
  customerName: string | null;
  phone: string | null;
  destinationName: string;
  isdelivered: boolean | null;
  trackingAvailable: boolean;
  date: Date | null;
}

@Component({
  selector: 'app-parcel-management',
  templateUrl: './parcel-management.component.html',
  styleUrls: ['./parcel-management.component.css']
})
export class ParcelManagementComponent implements OnInit {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  allStops: StopView[] = [];
  filteredStops: StopView[] = [];

  filterDelivered: 'all' | 'pending' | 'delivered' | 'failed' = 'all';
  minDate: string | null = null;
  maxDate: string | null = null;
  searchPhone: string = '';

  currentUserId: string | null = null;

  ngOnInit(): void {
    this.currentUserId = this.auth.currentUser?.uid ?? null;
    this.fetchStopsFromOrders();
  }

  private async fetchStopsFromOrders(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    this.currentUserId = user.uid;

    // 1️⃣ Fetch accepted orders of current user
    const ordersRef = collection(this.firestore, 'orders');
    const userOrdersQuery = query(
      ordersRef,
      where('userID', '==', user.uid),
      where('isAcepted', '==', true)
    );
    const ordersData = await firstValueFrom(collectionData(userOrdersQuery, { idField: 'id' })) as any[];
    if (!ordersData || ordersData.length === 0) return;

    // 2️⃣ Collect all stop IDs
    const stopIds: string[] = ordersData.reduce((acc: string[], order) => {
      if (Array.isArray(order.stops)) acc.push(...order.stops);
      return acc;
    }, []);

    if (stopIds.length === 0) return;

    // 3️⃣ Fetch stops in batches using Promise.all
    const batchSize = 10; // Firestore 'in' query limit
    const stopBatches: StopView[] = [];

    for (let i = 0; i < stopIds.length; i += batchSize) {
      const batchIds = stopIds.slice(i, i + batchSize);
      const stopsQuery = query(
        collection(this.firestore, 'stops'),
        where(documentId(), 'in', batchIds)
      );

      const stopsData = await firstValueFrom(collectionData(stopsQuery, { idField: 'id' })) as any[];

      const batchStops = stopsData.map(data => {
        const model = DropOffDataModel.fromFirestore(data);
        return {
          id: data.id,
          customerName: model.name ?? 'N/A',
          phone: model.phoneNumber ?? null,
          destinationName: model.destinationName,
          isdelivered: model.isdelivered ?? null,
          date: data['date'] ? new Date(data['date']) : null,
          trackingAvailable: this.isTrackingAvailable(model.isdelivered ?? null, data['date'] ?? null)
        } as StopView;
      });

      stopBatches.push(...batchStops);
    }

    this.allStops = stopBatches;
    this.applyFilters();
  }

  private isTrackingAvailable(isdelivered: boolean | null, date: number | null): boolean {
    if (!date) return false;
    if (isdelivered !== null) return false;

    const stopDate = new Date(date);
    const now = new Date();
    const diffHours = (now.getTime() - stopDate.getTime()) / (1000 * 60 * 60);

    return diffHours <= 24;
  }

  applyFilters(): void {
    const phoneTerm = this.searchPhone.toLowerCase().trim();

    this.filteredStops = this.allStops.filter(stop => {
      // Delivery status filter
      let matchesDelivery = true;
      if (this.filterDelivered === 'pending') matchesDelivery = stop.isdelivered === null;
      if (this.filterDelivered === 'delivered') matchesDelivery = stop.isdelivered === true;
      if (this.filterDelivered === 'failed') matchesDelivery = stop.isdelivered === false;

      // Date range filter
      let matchesDate = true;
      if (this.minDate) matchesDate = matchesDate && !!stop.date && stop.date >= new Date(this.minDate);
      if (this.maxDate) matchesDate = matchesDate && !!stop.date && stop.date <= new Date(this.maxDate);

      // Phone filter
      let matchesPhone = true;
      if (phoneTerm) matchesPhone = stop.phone?.toLowerCase().includes(phoneTerm) ?? false;

      return matchesDelivery && matchesDate && matchesPhone;
    });
  }
}
