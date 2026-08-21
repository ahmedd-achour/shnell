import * as L from 'leaflet'; // or import { LatLng } from 'leaflet'

export interface Order {
  distance: number;
  namePickUp: string;
  pickUpLocation: L.LatLng;
  stops: string[];
  vehicleType: string;
  userID: string;
  isAcepted?: boolean;
}

export class OrderModel implements Order {
  constructor(
    public distance: number,
    public namePickUp: string,
    public pickUpLocation: L.LatLng,
    public stops: string[],
    public vehicleType: string,
    public userID: string,
    public isInstantDelivery: boolean = false,
    public isAcepted: boolean = false
  ) {}


  toJson(): any {
    return {
      userID: this.userID,
      distance: this.distance,
      namePickUp: this.namePickUp,
      pickUpLocation: { lat: this.pickUpLocation.lat, lng: this.pickUpLocation.lng },
      stops: this.stops,
      vehicleType: this.vehicleType,
      isAcepted: this.isAcepted,
      timestamp: new Date()
    };
  }
}
