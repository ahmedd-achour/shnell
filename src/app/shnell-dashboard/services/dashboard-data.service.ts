import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
  writeBatch
} from '@angular/fire/firestore';
import { Database, ref, onValue } from '@angular/fire/database';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, BehaviorSubject, of, combineLatest } from 'rxjs';
import { map, startWith, catchError, switchMap, tap, shareReplay } from 'rxjs/operators';
import {
  Bid,
  Cancelation,
  Deals,
  DropOffData,
  CountryServiceArea,
    CallLog,
  VehicleSettings,
  GlobalConfig,
  DispatchConfig,
  Orders,
  Rating,
  ShnellUser,
  Vehicle,
  Commission,
  DriverRTDBLocation
} from '../models/dashboard.models';

/** Mirrors the limits partnerdash/user-dashboard currently hardcode (maxStops=250, MAX_JOBS=50)
 *  and the pricing example from the pro-dispatch spec, used only until an admin saves settings/dispatch. */
const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  maxStopsPerMission: 250,
  maxParcelsPerMission: 250,
  maxConcurrentOrders: 50,
  pricing: {
    baseFee: 5,
    distanceBands: [
      { upTo: 10, fee: 5 },
      { upTo: 20, fee: 8 },
      { upTo: 40, fee: 15 },
      { upTo: null, fee: 25 }
    ],
    stopBands: [
      { upTo: 20, fee: 0 },
      { upTo: 50, fee: 5 },
      { upTo: null, fee: 10 }
    ],
    parcelBands: [
      { upTo: 50, fee: 0 },
      { upTo: 100, fee: 10 },
      { upTo: 250, fee: 20 },
      { upTo: null, fee: 30 }
    ]
  }
};

/** adminAdjustBalance answer: applied now, or waiting for a second admin. */
export interface RechargeResult {
  success: boolean;
  pending: boolean;
  requestId: string;
  currencyCode: string;
  newBalance?: number;
  replay?: boolean;
}

/** Idempotency key for one money movement. */
export function newRequestId(): string {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
}

@Injectable({
  providedIn: 'root'
})
export class DashboardDataService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
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

  /** One shared users+wallets listener for the whole console (shell, search, bell). */
  private users$?: Observable<ShnellUser[]>;

  getUsers(): Observable<ShnellUser[]> {
    return this.users$ ??= this.loadUsers().pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  private loadUsers(): Observable<ShnellUser[]> {
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
            // The money lives in wallets/{uid} only.
            balances: w ? w['balances'] : undefined
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

  getDispatchConfigDoc(): Observable<DispatchConfig> {
    const docRef = doc(this.firestore, 'settings', 'dispatch');
    return docData(docRef).pipe(
      map(data => ({ ...DEFAULT_DISPATCH_CONFIG, ...(data as any) }) as DispatchConfig),
      startWith(DEFAULT_DISPATCH_CONFIG),
      catchError(err => {
        console.error('Error fetching settings/dispatch:', err);
        return of(DEFAULT_DISPATCH_CONFIG);
      })
    );
  }

  async updateDispatchConfig(config: DispatchConfig): Promise<void> {
    await this.adminCall('adminSaveSettings', { docId: 'dispatch', data: config });
  }

  getDriverRTDBLocations(): Observable<DriverRTDBLocation[]> {
    return this.driverLocations$.asObservable();
  }

  /** Admin writes below go through Cloud Functions that log them in admin_audit. */
  private async adminCall<T = any>(name: string, data: any): Promise<T> {
    return (await httpsCallable<any, T>(this.functions, name)(data)).data;
  }

  async updateVehicleApproval(vehicleId: string, approved: boolean): Promise<void> {
    await this.adminCall('adminReviewVehicle', { vehicleId, approve: approved });
  }

  async deleteVehicle(vehicleId: string): Promise<void> {
    await this.adminCall('adminReviewVehicle', { vehicleId, remove: true });
  }

  async setDriverVerified(driverId: string, verified: boolean): Promise<void> {
    await this.adminCall('adminUpdateAccount', { userId: driverId, isVerified: verified });
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
        // onDealLifecycle pushes "job assigned" to the driver and "driver
        // found" to the customer (notifications/ is the device registry only).
        assignedBy: 'admin',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to assign driver:', e);
      throw e;
    }
  }

  /** Fetches specific stop docs by id (one-shot, not realtime) — used by the dispatch
   *  center to load only the stops belonging to the order being dispatched, instead of
   *  subscribing to the whole `stops` collection. */
  async getStopsByIds(ids: string[]): Promise<DropOffData[]> {
    const docs = await Promise.all(ids.map(id => getDoc(doc(this.firestore, 'stops', id))));
    return docs
      .filter(d => d.exists())
      .map(d => ({ id: d.id, ...(d.data() as any) })) as DropOffData[];
  }

  /** One-shot company doc lookup (plan/commissionRate) — used to price a mission per the
   *  owning company's PAYG/PRO status instead of always falling back to the global rate. */
  async getCompanyDoc(companyId: string): Promise<any | null> {
    const snap = await getDoc(doc(this.firestore, 'companies', companyId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  /** Persists a dispatch-center route optimization: reorders `orders/{orderId}.stops`
   *  and writes each stop's `sequence` so the driver app receives the correct order (spec §7). */
  async applyRouteSequence(orderId: string, orderedStopIds: string[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'orders', orderId), { stops: orderedStopIds });
    orderedStopIds.forEach((stopId, index) => {
      batch.update(doc(this.firestore, 'stops', stopId), { sequence: index });
    });
    await batch.commit();
  }

  async softDeleteOrder(orderId: string): Promise<void> {
    const docRef = doc(this.firestore, `orders/${orderId}`);
    await updateDoc(docRef, { isAcepted: true });
  }


  async toggleUserBan(userId: string, currentBanState: boolean): Promise<boolean> {
    const newBanState = !currentBanState;
    await this.adminCall('adminUpdateAccount', { userId, isBan: newBanState });
    return newBanState;
  }

  /**
   * Credits (or debits, amount < 0) ONE currency of a user's wallet through
   * the adminAdjustBalance function: wallets/{uid}.balances[currency], the
   * commissions ledger line and the admin_audit entry, server-side.
   * No conversion: a DZD recharge never lifts a negative TND balance.
   */
  async rechargeUserBalance(
    userId: string, amount: number, currencyCode: string, reference: string, reason?: string,
  ): Promise<RechargeResult> {
    const callable = httpsCallable<
      { userId: string; amount: number; currencyCode: string; reference: string; requestId: string; reason?: string },
      RechargeResult
    >(this.functions, 'adminAdjustBalance');
    // One id per submission: a network retry of this call can't credit twice
    // (and the receipt number can't be used twice either).
    const requestId = newRequestId();
    const res = await callable({
      userId, amount, currencyCode: currencyCode.trim().toUpperCase(), reference: reference.trim(), requestId,
      ...(reason ? { reason: reason.trim().slice(0, 300) } : {}),
    });
    return res.data;
  }

  /** Recharges above the currency's threshold, waiting for a second admin. */
  getPendingRecharges(): Observable<any[]> {
    const q = query(collection(this.firestore, 'recharge_requests'), where('status', '==', 'pending'));
    return collectionData(q, { idField: 'id' }).pipe(startWith([]), catchError(() => of([])));
  }

  async decideRecharge(requestId: string, approve: boolean): Promise<{ status: string; newBalance?: number; currencyCode?: string }> {
    const callable = httpsCallable<{ requestId: string; approve: boolean }, any>(this.functions, 'adminApproveRecharge');
    return (await callable({ requestId, approve })).data;
  }

  async updateUserAccType(userId: string, accType: 'pro' | 'standard' | string): Promise<void> {
    await this.adminCall('adminUpdateAccount', { userId, accType });
  }

  async updateConfigParams(params: {
    version_customer_app?: string;
    version_driver_app?: string;
    commission_percentage?: number;
    stop_fee?: number;
    update_link_customer_app?: string;
    update_link_driver_app?: string;
  }): Promise<void> {
    await this.adminCall('adminSaveSettings', { docId: 'config', data: params });
  }

  async updateVehicleSettingsConfig(vehicles: Record<string, VehicleSettings>): Promise<void> {
    await this.adminCall('adminSaveSettings', { docId: 'vehicles', data: vehicles });
  }

  async updateServiceAreasConfig(data: {
    countries?: Record<string, CountryServiceArea>;
    messages?: Record<string, string>;
  }): Promise<void> {
    await this.adminCall('adminSaveSettings', { docId: 'service_areas', data });
  }
}
