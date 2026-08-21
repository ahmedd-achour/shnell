import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, query, where, orderBy, doc, docData } from '@angular/fire/firestore';
import { Database, ref, onValue, object } from '@angular/fire/database';
import { Observable, combineLatest, map, of, switchMap, BehaviorSubject } from 'rxjs';
import { ShnellUser } from '../../Models/shnellUsers.models';
import { Vehicle } from '../../Models/vehicle';

export interface DriverStatus {
  driverId: string;
  onlineStatus: 'online' | 'idle' | 'offline';
  lastSeen: number | null;
  coordinates?: { lat: number, lng: number };
  minutesSinceUpdate: number;
}

@Injectable({
  providedIn: 'root'
})
export class FleetIntelligenceService {
  private firestore = inject(Firestore);
  private db = inject(Database);

  getDrivers(): Observable<ShnellUser[]> {
    const driversRef = collection(this.firestore, 'users');
    const q = query(driversRef, where('role', '==', 'driver'));
    return collectionData(q, { idField: 'uid' }).pipe(
      map(actions => actions.map(a => ShnellUser.fromJson(a)))
    );
  }

  getOrders(): Observable<any[]> {
    const ordersRef = collection(this.firestore, 'orders');
    return collectionData(ordersRef, { idField: 'id' });
  }

  getVehicles(): Observable<Vehicle[]> {
    const vehiclesRef = collection(this.firestore, 'vehicles');
    return collectionData(vehiclesRef, { idField: 'id' }).pipe(
      map(vehicles => vehicles.map(v => Vehicle.fromJson(v)))
    );
  }

  getDriverLocations(): Observable<Record<string, any>> {
    const locationsRef = ref(this.db, 'locations');
    return new Observable(observer => {
      const unsubscribe = onValue(locationsRef, (snapshot) => {
        observer.next(snapshot.val() || {});
      });
      return { unsubscribe };
    });
  }

  getDriverStatus(driverId: string): Observable<DriverStatus> {
    const driverLocRef = ref(this.db, `locations/${driverId}`);
    return new Observable<any>(observer => {
      const unsubscribe = onValue(driverLocRef, (snapshot) => {
        observer.next(snapshot.val());
      });
      return { unsubscribe };
    }).pipe(
      map(data => {
        const ts = data?.ts; // integer Unix timestamp
        const now = Math.floor(Date.now() / 1000);
        let status: 'online' | 'idle' | 'offline' = 'offline';
        let diffMinutes = Infinity;

        if (ts) {
          const diffSeconds = now - ts;
          diffMinutes = Math.floor(diffSeconds / 60);
          if (diffMinutes < 5) status = 'online';
          else if (diffMinutes < 30) status = 'idle';
          else status = 'offline';
        }

        return {
          driverId,
          onlineStatus: status,
          lastSeen: ts,
          coordinates: data?.coordinates ? { lat: data.coordinates[1], lng: data.coordinates[0] } : undefined,
          minutesSinceUpdate: diffMinutes
        };
      })
    );
  }

  getAllDriverStatuses(): Observable<Record<string, DriverStatus>> {
    return this.getDriverLocations().pipe(
      map(locations => {
        const statuses: Record<string, DriverStatus> = {};
        const now = Math.floor(Date.now() / 1000);

        Object.keys(locations).forEach(driverId => {
          const data = locations[driverId];
          const ts = data?.ts;
          let status: 'online' | 'idle' | 'offline' = 'offline';
          let diffMinutes = Infinity;

          if (ts) {
            const diffSeconds = now - ts;
            diffMinutes = Math.floor(diffSeconds / 60);
            if (diffMinutes < 5) status = 'online';
            else if (diffMinutes < 30) status = 'idle';
            else status = 'offline';
          }

          statuses[driverId] = {
            driverId,
            onlineStatus: status,
            lastSeen: ts,
            coordinates: data?.coordinates ? { lat: data.coordinates[1], lng: data.coordinates[0] } : undefined,
            minutesSinceUpdate: diffMinutes
          };
        });
        return statuses;
      })
    );
  }
}
