import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  updateDoc,
  deleteDoc,
  addDoc,
  setDoc,
  query,
  where,
  serverTimestamp
} from '@angular/fire/firestore';
import { Database, ref, onValue } from '@angular/fire/database';
import { Observable, BehaviorSubject, of, combineLatest } from 'rxjs';
import { map, startWith, catchError, switchMap, tap } from 'rxjs/operators';
import {
  Bid,
  Cancelation,
  Deals,
  DropOffData,
  CountryServiceArea,
    CallLog,
  VehicleSettings,
  GlobalConfig,
  Orders,
  Rating,
  ShnellUser,
  Vehicle,
  Commission,
  DriverRTDBLocation
} from '../models/dashboard.models';

@Injectable({
  providedIn: 'root'
})
export class DashboardDataService {
  private firestore = inject(Firestore);
  private database = inject(Database);

  private driverLocations$ = new BehaviorSubject<DriverRTDBLocation[]>([]);

  constructor() {
    this.initRTDBListener();
  }

  private initRTDBListener(): void {
    try {
      const locationsRef = ref(this.database, 'locations');
      onValue(locationsRef, (snapshot) => {
        const data = snapshot.val() || {};
        const parsed: DriverRTDBLocation[] = [];

        Object.keys(data).forEach(id => {
          const item = data[id];
          if (!item) return;

          let lng = 10.1815;
          let lat = 36.8065;

          if (Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
            lng = Number(item.coordinates[0]);
            lat = Number(item.coordinates[1]);
          } else if (item.coordinates && typeof item.coordinates === 'object') {
            lng = Number(item.coordinates.lng ?? item.coordinates[0] ?? 10.1815);
            lat = Number(item.coordinates.lat ?? item.coordinates[1] ?? 36.8065);
          } else if (item[0] !== undefined && item[1] !== undefined) {
            lng = Number(item[0]);
            lat = Number(item[1]);
          }

          parsed.push({
            driverId: id,
            coordinates: [lng, lat],
            g: item.g || 'N/A',
            ts: item.ts || Date.now(),
            accuracy: item.accuracy || 10,
            provider: item.provider || 'fused',
            isOnline: (Date.now() - (item.ts || 0)) < 15 * 60 * 1000
          });
        });

        this.driverLocations$.next(parsed);
      }, (error) => {
        console.error('RTDB locations error:', error);
      });
    } catch (e) {
      console.warn('RTDB not connected or unavailable:', e);
    }
  }

  getUsers(): Observable<ShnellUser[]> {
    const colRef = collection(this.firestore, 'users');
    const walletsCol = collection(this.firestore, 'wallets');
    
    return combineLatest([
      collectionData(colRef, { idField: 'uid' }),
      collectionData(walletsCol, { idField: 'uid' })
    ]).pipe(
      map(([usersList, walletsList]) => {
        return usersList.map(u => {
          const w = walletsList.find(wallet => wallet.uid === u.uid);
          // Normalise legacy role strings so the whole admin sees one vocabulary:
          // platform roles are 'user' / 'driver' ('admin'/'company' console-only).
          const rawRole = (u['role'] || '').toString().trim().toLowerCase();
          const role = (rawRole === 'customer' || rawRole === 'client' || rawRole === '') ? 'user' : rawRole;
          return {
            ...u,
            role,
            id: u.uid || u['__id'] || u['id'],
            balance: w ? w['balance'] : u['balance']
          } as ShnellUser;
        });
      }),
      startWith([]),
      catchError(err => {
        console.error('Error fetching users:', err);
        return of([]);
      })
    );
  }

  getVehicles(driverId?: string): Observable<Vehicle[]> {
    const colRef = collection(this.firestore, 'vehicles');
    const q = driverId
      ? query(colRef, where('idDriver', '==', driverId))
      : colRef;

    return collectionData(q, { idField: 'id' }).pipe(
      map(list => list.map(item => {
        const idDriver = item['idDriver'] || item['driverId'] || item['userId'] || '';
        const isAdminApproved = item['isAdminApproved'] === true || item['isAdminApproved'] === 'true';
        const isAssetsApproved = item['isAssetsApproved'] === true || item['isAssetsApproved'] === 'true';
        const type = item['type'] || item['vehicleType'] || 'camion';
        const carteGrise = item['carteGrise'] || item['carteGriseFront'] || item['carteGriseAsset'] || '';
        const cin = item['cin'] || item['carteIdentityFront'] || item['cinAsset'] || '';
        const vehiculeAsset = item['vehiculeAsset'] || item['vehicleAsset'] || item['vehicleImage'] || item['photo'] || '';
        const allAssets = Array.isArray(item['allAssets']) ? item['allAssets'] : [];

        return {
          ...item,
          id: item['id'] || item['__id'] || item['uid'],
          idDriver,
          isAdminApproved,
          isAssetsApproved,
          type,
          carteGrise,
          cin,
          vehiculeAsset,
          allAssets
        } as Vehicle;
      })),
      startWith([]),
      catchError(err => {
        console.error('Error fetching vehicles from Firestore:', err);
        return of([]);
      })
    );
  }

  getDriverVerifications(): Observable<any[]> {
    const colRef = collection(this.firestore, 'drivers');
    return collectionData(colRef, { idField: 'uid' });
  }

  getOrders(): Observable<Orders[]> {
    const colRef = collection(this.firestore, 'orders');
    return collectionData(colRef, { idField: 'id' }).pipe(
      map(list => list.map(item => ({
        ...item,
        id: item['id'] || item['__id']
      }) as Orders)),
      startWith([]),
      catchError(err => {
        console.error('Error fetching orders:', err);
        return of([]);
      })
    );
  }

  getDeals(driverId?: string): Observable<Deals[]> {
    const colRef = collection(this.firestore, 'deals');
    const q = driverId
      ? query(colRef, where('idDriver', '==', driverId))
      : colRef;

    return collectionData(q, { idField: 'id' }).pipe(
      map(list => list.map(item => ({
        ...item,
        id: item['id'] || item['__id']
      }) as Deals)),
      startWith([]),
      catchError(err => {
        console.error('Error fetching deals:', err);
        return of([]);
      })
    );
  }

  
  getCallLogs(): Observable<CallLog[]> {
    const colRef = collection(this.firestore, 'call_logs');
    return collectionData(colRef, { idField: 'id' }).pipe(
      map(list => list as CallLog[]),
      startWith([]),
      catchError(err => {
        console.error('Error fetching call logs:', err);
        return of([]);
      })
    );
  }

  getBids(driverId?: string): Observable<Bid[]> {
    const colRef = collection(this.firestore, 'bids');
    const q = driverId
      ? query(colRef, where('idDriver', '==', driverId))
      : colRef;

    return collectionData(q, { idField: 'id' }).pipe(
      map(list => {
        const result = list.map(item => ({
          ...item,
          id: item['id'] || item['__id']
        }) as Bid);
        return result.sort((a, b) => {
          const tA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (a.timestamp || 0);
          const tB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (b.timestamp || 0);
          return tB - tA;
        });
      }),
      startWith([]),
      catchError(err => {
        console.error('Error fetching bids:', err);
        return of([]);
      })
    );
  }

  getRatings(driverId?: string): Observable<Rating[]> {
    const colRef = collection(this.firestore, 'ratings');
    const q = driverId
      ? query(colRef, where('driverId', '==', driverId))
      : colRef;

    return collectionData(q, { idField: 'id' }).pipe(
      map(list => list as Rating[]),
      startWith([]),
      catchError(err => {
        console.error('Error fetching ratings:', err);
        return of([]);
      })
    );
  }

  getCancelations(): Observable<Cancelation[]> {
    const colRef = collection(this.firestore, 'cancelations');
    return collectionData(colRef, { idField: 'id' }).pipe(
      map(list => list as Cancelation[]),
      startWith([]),
      catchError(err => {
        console.error('Error fetching cancelations:', err);
        return of([]);
      })
    );
  }

  getCommissions(): Observable<Commission[]> {
    const colRef = collection(this.firestore, 'commissions');
    return collectionData(colRef, { idField: 'id' }).pipe(
      map(list => list as Commission[]),
      startWith([]),
      catchError(err => {
        console.error('Error fetching commissions:', err);
        return of([]);
      })
    );
  }

  getDriverCommissions(driverId: string): Observable<Commission[]> {
    const colRef = collection(this.firestore, 'commissions');
    const q = query(colRef, where('DriverId', '==', driverId));
    return collectionData(q, { idField: 'id' }).pipe(
      map(list => list as Commission[]),
      startWith([]),
      catchError(err => {
        console.error('Error fetching driver commissions:', err);
        return of([]);
      })
    );
  }

  getStops(): Observable<DropOffData[]> {
    const colRef = collection(this.firestore, 'stops');
    return collectionData(colRef, { idField: 'id' }).pipe(
      map(list => list as DropOffData[]),
      startWith([]),
      catchError(err => {
        console.error('Error fetching stops:', err);
        return of([]);
      })
    );
  }

  getGlobalConfigDoc(): Observable<any> {
    const docRef = doc(this.firestore, 'settings', 'config');
    return docData(docRef).pipe(
      catchError(err => {
        console.error('Error fetching settings/config:', err);
        return of(null);
      })
    );
  }

  getVehicleSettingsDoc(): Observable<Record<string, VehicleSettings>> {
    const docRef = doc(this.firestore, 'settings', 'vehicles');
    return docData(docRef).pipe(
      map(data => (data || {}) as Record<string, VehicleSettings>),
      catchError(err => {
        console.error('Error fetching settings/vehicles:', err);
        return of({});
      })
    );
  }

  getServiceAreasDoc(): Observable<{ countries?: Record<string, CountryServiceArea>; messages?: Record<string, string> }> {
    const docRef = doc(this.firestore, 'settings', 'service_areas');
    return docData(docRef).pipe(
      map(data => (data || {}) as any),
      catchError(err => {
        console.error('Error fetching settings/service_areas:', err);
        return of({});
      })
    );
  }

  getDriverRTDBLocations(): Observable<DriverRTDBLocation[]> {
    return this.driverLocations$.asObservable();
  }

  async updateVehicleApproval(vehicleId: string, approved: boolean): Promise<void> {
    const docRef = doc(this.firestore, `vehicles/${vehicleId}`);
    await updateDoc(docRef, { isAdminApproved: approved, isAssetsApproved: approved });
  }

  async deleteVehicle(vehicleId: string): Promise<void> {
    const docRef = doc(this.firestore, `vehicles/${vehicleId}`);
    await deleteDoc(docRef);
  }

  
  async assignDriverToOrder(orderId: string, driverId: string, userId: string): Promise<void> {
    try {
      const orderRef = doc(this.firestore, 'orders', orderId);
      await updateDoc(orderRef, { isAcepted: true });

      const dealRef = doc(collection(this.firestore, 'deals'));
      await setDoc(dealRef, {
        idOrder: orderId,
        idDriver: driverId,
        idUser: userId,
        status: 'accepted',
        timestamp: serverTimestamp()
      });
      
      const notifRef = doc(collection(this.firestore, 'notifications'));
      await setDoc(notifRef, {
        userId: driverId,
        title: 'New Job Assigned',
        body: 'Admin has manually assigned you a job.',
        time: serverTimestamp(),
        isRead: false,
        type: 'assignment'
      });
    } catch (e) {
      console.error('Failed to assign driver:', e);
      throw e;
    }
  }

  async softDeleteOrder(orderId: string): Promise<void> {
    const docRef = doc(this.firestore, `orders/${orderId}`);
    await updateDoc(docRef, { isAcepted: true });
  }

  async updateUserBalance(userId: string, newBalance: number): Promise<void> {
    const docRef = doc(this.firestore, `users/${userId}`);
    await updateDoc(docRef, { balance: newBalance });
  }

  async toggleUserBan(userId: string, currentBanState: boolean): Promise<boolean> {
    const newBanState = !currentBanState;
    const docRef = doc(this.firestore, `users/${userId}`);
    await updateDoc(docRef, {
      isBan: newBanState,
      isBanned: newBanState,
      isActive: !newBanState
    });
    return newBanState;
  }

  async rechargeUserBalance(userId: string, currentBalance: number, rechargeAmount: number, adminOrDriverId?: string): Promise<number> {
    const newBalance = (currentBalance || 0) + rechargeAmount;
    
    // Update the wallet collection (create if not exists)
    const walletDocRef = doc(this.firestore, `wallets/${userId}`);
    await setDoc(walletDocRef, { balance: newBalance }, { merge: true });

    

    const commColRef = collection(this.firestore, 'commissions');
    await addDoc(commColRef, {
      userId: userId,
      DriverId: adminOrDriverId || userId,
      commissionDeducted: rechargeAmount,
      percentageFees: 0,
      DealAmount: rechargeAmount,
      time: serverTimestamp(),
      typeOfTransaction: 'recharge'
    });

    return newBalance;
  }

  async updateUserAccType(userId: string, accType: 'pro' | 'standard' | string): Promise<void> {
    const docRef = doc(this.firestore, `users/${userId}`);
    await updateDoc(docRef, { accType: accType });
  }

  async updateConfigParams(params: {
    version_customer_app?: string;
    version_driver_app?: string;
    commission_percentage?: number;
    stop_fee?: number;
    update_link_customer_app?: string;
    update_link_driver_app?: string;
  }): Promise<void> {
    const docRef = doc(this.firestore, 'settings', 'config');
    await setDoc(docRef, params, { merge: true });
  }

  async updateVehicleSettingsConfig(vehicles: Record<string, VehicleSettings>): Promise<void> {
    const docRef = doc(this.firestore, 'settings', 'vehicles');
    await setDoc(docRef, vehicles, { merge: true });
  }

  async updateServiceAreasConfig(data: {
    countries?: Record<string, CountryServiceArea>;
    messages?: Record<string, string>;
  }): Promise<void> {
    const docRef = doc(this.firestore, 'settings', 'service_areas');
    await setDoc(docRef, data, { merge: true });
  }
}
