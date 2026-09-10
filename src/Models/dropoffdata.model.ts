import { LatLng } from '../app/shared/latlng';
import { Timestamp } from '@angular/fire/firestore'; // Import for consistent timestamps

export type StopState = 'pending' | 'inRoute' | 'delivered' | 'notDelivered';

/** Whether the parcel's collected cash has been settled with the expeditor. */
export type ExpeditorPayout = 'unpaid' | 'paid';

const STOP_STATES: StopState[] = ['pending', 'inRoute', 'delivered', 'notDelivered'];

/** Normalise a raw Firestore value into an `ExpeditorPayout` (defaults to 'unpaid'). */
export function expeditorPayoutFromDoc(data: any): ExpeditorPayout {
  return (data?.expeditorPayout ?? '').toString().trim() === 'paid' ? 'paid' : 'unpaid';
}

/** Normalise a raw Firestore stop doc into a `StopState`.
 *  Prefers the new `state` string, falls back to the legacy `isDelivered` /
 *  `isdelivered` boolean (true -> delivered, false/absent -> pending). */
export function stopStateFromDoc(data: any): StopState {
  const raw = (data?.state ?? '').toString().trim();
  if (STOP_STATES.includes(raw as StopState)) return raw as StopState;
  const legacy = data?.isdelivered ?? data?.isDelivered;
  return legacy === true ? 'delivered' : 'pending';
}

export interface DropOffData {
  name?: string;
  phoneNumber?: string;
  receiverPhone2?: string;
  destination: LatLng;
  destinationName: string;
  gov?: string;
  price?: number;
  productName?: string;
  description?: string;
  parcelPrice?: number;
  state?: StopState;
  /** @deprecated legacy mirror — read `state` instead */
  isdelivered?: boolean | null;
  expeditorId?: string;
  quantity?: number;
  /** UID of the professional / company user who created this stop. */
  definedBy?: string;
  /** Whether the collected cash has been paid out to the expeditor. */
  expeditorPayout?: ExpeditorPayout;
}

export class DropOffDataModel implements DropOffData {
  public state: StopState;

  constructor(
    public destination: LatLng,
    public destinationName: string,
    public name?: string,
    public phoneNumber?: string,
    isdelivered?: boolean | null | StopState,
    public gov?: string,
    public expeditorId?: string,
    public price?: number,
    public productName?: string,
    public quantity?: number,
    public description?: string,
    public receiverPhone2?: string,
    public parcelPrice?: number,
    state?: StopState,
    public definedBy?: string,
    public expeditorPayout: ExpeditorPayout = 'unpaid'
  ) {
    // Accept an explicit `state`, or an old-style `isdelivered` (bool | 'delivered' string).
    if (state && STOP_STATES.includes(state)) {
      this.state = state;
    } else if (typeof isdelivered === 'string' && STOP_STATES.includes(isdelivered as StopState)) {
      this.state = isdelivered as StopState;
    } else {
      this.state = isdelivered === true ? 'delivered' : 'pending';
    }

    // FIXED: Validate LatLng on construction
    if (!this._isValidLatLng(destination)) {
      console.warn('Invalid LatLng provided; defaulting to Tunis center (36.8065, 10.1815)');
      this.destination = new LatLng(36.8065, 10.1815); // Fallback to Tunis
    }
  }

  /** @deprecated compat accessor — new code should read `state` */
  get isdelivered(): boolean {
    return this.state === 'delivered';
  }

  private _isValidLatLng(latlng: LatLng | any): boolean {
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
      receiverPhone2: this.receiverPhone2,
      destination: {
        latitude: this.destination.lat,
        longitude: this.destination.lng
      },
      destinationName: this.destinationName,
      state: this.state,
      // legacy mirror so older driver / client builds keep working
      isDelivered: this.state === 'delivered',
      description: this.description,
      parcelPrice: this.parcelPrice,
      gov: this.gov,
      price: this.price,
      expeditorId: this.expeditorId,
      expeditorPayout: this.expeditorPayout ?? 'unpaid',
      definedBy: this.definedBy,
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
    const latlng = new LatLng(lat, lng);
    return new DropOffDataModel(
      latlng,
      data.destinationName || '',
      data.name,
      data.phoneNumber ?? data.receiverPhone,
      undefined,
      data.gov,
      data.expeditorId,
      data.price,
      data.productName,
      data.quantity,
      data.description,
      data.receiverPhone2,
      typeof data.parcelPrice === 'number' ? data.parcelPrice : Number(data.parcelPrice) || undefined,
      stopStateFromDoc(data),
      data.definedBy ?? data.createdBy ?? data.companyId,
      expeditorPayoutFromDoc(data)
    );
  }
}
