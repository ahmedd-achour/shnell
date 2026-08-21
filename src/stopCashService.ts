// stops-cache.service.ts
import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { DropOffDataModel } from './Models/dropoffdata.model';

@Injectable({
  providedIn: 'root'
})
export class StopsCacheService {
  pickupAddress: string | null = null;
  pickupLatLng: L.LatLng | null = null;
  dropOffs: DropOffDataModel[] = [];
  selectedDriverId: string | null = null;
  selectedDriverIndex: number | null = null;

  constructor() {
    this.loadFromLocalStorage();
  }

  saveToLocalStorage() {
    localStorage.setItem('pickupAddress', this.pickupAddress || '');
    localStorage.setItem('pickupLatLng', this.pickupLatLng ? JSON.stringify(this.pickupLatLng) : '');
    localStorage.setItem('dropOffs', JSON.stringify(this.dropOffs));
    localStorage.setItem('selectedDriverId', this.selectedDriverId || '');
    localStorage.setItem('selectedDriverIndex', this.selectedDriverIndex?.toString() || '');
  }

  loadFromLocalStorage() {
    const pickup = localStorage.getItem('pickupAddress');
    if (pickup) this.pickupAddress = pickup;

    const latlng = localStorage.getItem('pickupLatLng');
    if (latlng) this.pickupLatLng = L.latLng(JSON.parse(latlng));

    const drops = localStorage.getItem('dropOffs');
    if (drops) this.dropOffs = JSON.parse(drops);

    const driverId = localStorage.getItem('selectedDriverId');
    if (driverId) this.selectedDriverId = driverId;

    const driverIndex = localStorage.getItem('selectedDriverIndex');
    if (driverIndex) this.selectedDriverIndex = parseInt(driverIndex, 10);
  }


}
