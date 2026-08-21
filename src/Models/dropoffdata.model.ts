import * as L from 'leaflet';
import { Timestamp } from '@angular/fire/firestore'; // Import for consistent timestamps

export interface DropOffData {
  name?: string;
  phoneNumber?: string;
  destination: L.LatLng;
  destinationName: string;
  gov?: string;
  price?: number;
  productName?: string;
  isdelivered?: boolean | null;
  expeditorId?: string;
  quantity?: number;
  // isdelivered can be true (delivered), false (failed), or null (pending)
}

export class DropOffDataModel implements DropOffData {
  constructor(
    public destination: L.LatLng,
    public destinationName: string,
    public name?: string,
    public phoneNumber?: string,
    public isdelivered?: boolean | null,
    public gov?: string,
    public expeditorId?: string,
    public price?: number,
    public productName?: string,
    public quantity?: number
  ) {
    // FIXED: Validate LatLng on construction
    if (!this._isValidLatLng(destination)) {
      console.warn('Invalid LatLng provided; defaulting to Tunis center (36.8065, 10.1815)');
      this.destination = new L.LatLng(36.8065, 10.1815); // Fallback to Tunis
    }
  }

  private _isValidLatLng(latlng: L.LatLng | any): boolean {
    if (!latlng || typeof latlng.lat !== 'number' || typeof latlng.lng !== 'number') {
      return false;
    }
    // Leaflet bounds: lat [-90, 90], lng [-180, 180]
    return latlng.lat >= -90 && latlng.lat <= 90 && latlng.lng >= -180 && latlng.lng <= 180;
  }

  toFirestore(): any {
    return {
      name: this.name,
      phoneNumber: this.phoneNumber,
      destination: {
        latitude: this.destination.lat,
        longitude: this.destination.lng
      },
      destinationName: this.destinationName,
      isdelivered: this.isdelivered,
      gov: this.gov,
      price: this.price,
      expeditorId: this.expeditorId,
      productName: this.productName,
      quantity: this.quantity,
      date: Timestamp.now()  // FIXED: Use Timestamp for Firestore compatibility
    };
  }

  static fromFirestore(data: any): DropOffDataModel {
    // FIXED: Validate and default coords before creating LatLng
    let lat = 36.8065; // Tunis default
    let lng = 10.1815;
    if (data?.destination) {
      const dest = data.destination;
      lat = (dest.latitude ?? dest.lat) || lat;
      lng = (dest.longitude ?? dest.lng) || lng;
    }
    if (isNaN(lat) || isNaN(lng)) {
      console.warn('Invalid coords in fromFirestore; defaulting to Tunis center');
      lat = 36.8065;
      lng = 10.1815;
    }
    const latlng = new L.LatLng(lat, lng);
    return new DropOffDataModel(
      latlng,
      data.destinationName || '',
      data.name,
      data.phoneNumber,
      data.isdelivered,
      data.gov,
      data.expeditorId,
      data.price,
      data.productName,
      data.quantity
    );
  }
}
