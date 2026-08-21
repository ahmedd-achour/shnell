import { Injectable, NgZone } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface CrossTabEvent {
  type: 'DRIVER_UPDATED' | 'NOTIFICATION_SENT' | 'VEHICLE_APPROVED' | 'BALANCE_UPDATED';
  payload: any;
  senderTabId: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class CrossTabSyncService {
  private channel: BroadcastChannel | null = null;
  private tabId: string = 'tab_' + Math.random().toString(36).substring(2, 9);
  private eventSubject = new Subject<CrossTabEvent>();

  public events$: Observable<CrossTabEvent> = this.eventSubject.asObservable();

  constructor(private ngZone: NgZone) {
    this.initBroadcastChannel();
  }

  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('shnell_admin_fleet_sync');
        this.channel.onmessage = (event: MessageEvent<CrossTabEvent>) => {
          if (event.data && event.data.senderTabId !== this.tabId) {
            this.ngZone.run(() => {
              this.eventSubject.next(event.data);
            });
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel initialization error:', e);
      }
    }

    // Fallback using localStorage storage event
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === 'shnell_cross_tab_event' && event.newValue) {
        try {
          const parsed: CrossTabEvent = JSON.parse(event.newValue);
          if (parsed.senderTabId !== this.tabId) {
            this.ngZone.run(() => {
              this.eventSubject.next(parsed);
            });
          }
        } catch (e) {
          console.warn('Cross tab storage parse error:', e);
        }
      }
    });
  }

  public notifyDriverUpdated(driverId: string, updates: any): void {
    this.broadcast({
      type: 'DRIVER_UPDATED',
      payload: { driverId, ...updates },
      senderTabId: this.tabId,
      timestamp: Date.now()
    });
  }

  public notifyNotificationSent(driverId: string, title: string, message: string): void {
    this.broadcast({
      type: 'NOTIFICATION_SENT',
      payload: { driverId, title, message },
      senderTabId: this.tabId,
      timestamp: Date.now()
    });
  }

  public notifyVehicleApproved(vehicleId: string, approved: boolean): void {
    this.broadcast({
      type: 'VEHICLE_APPROVED',
      payload: { vehicleId, approved },
      senderTabId: this.tabId,
      timestamp: Date.now()
    });
  }

  private broadcast(evt: CrossTabEvent): void {
    if (this.channel) {
      try {
        this.channel.postMessage(evt);
      } catch (e) {
        console.warn('BroadcastChannel postMessage error:', e);
      }
    }
    try {
      localStorage.setItem('shnell_cross_tab_event', JSON.stringify(evt));
    } catch (e) {
      console.warn('LocalStorage broadcast error:', e);
    }
  }
}
