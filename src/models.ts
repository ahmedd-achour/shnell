export interface Bid {
  id?: string;
  idOrder: string;
  idDriver: string;
  idUser: string;
  ammount: number;
  isActive: boolean;
  timestamp?: Date | any;
}

export interface Cancelation {
  id?: string;
  idDeal: string;
  cancelledBy: string;
  time?: Date | any;
}

export interface Deals {
  id?: string;
  idOrder: string;
  idDriver: string;
  idUser: string;
  status: 'accepted' | 'acepted' | 'almost' | 'terminated' | string;
  timestamp?: Date | any;
}

export type Deal = Deals;

export interface DropOffData {
  id?: string;
  destination: {
    latitude: number;
    longitude: number;
  };
  destinationName: string;
  isdelivered: boolean;
}

export interface CountryServiceArea {
  name: string;
  active: boolean;
  governorates: string[];
}

export interface VehicleSettings {
  name: string;
  maxWeight: number;
  volume: number;
  basePrice: number;
  shortDistThreshold: number;
  shortDistMin: number;
  shortDistMult: number;
  longDistRate: number;
  isActive?: boolean;
}

export interface GlobalConfig {
  customerAppVersion: string;
  driverAppVersion: string;
  commissionPercentage: number;
  stopFee: number;
  customerAppUpdateLink: string;
  driverAppUpdateLink: string;
  vehicles: Record<string, VehicleSettings>;
  countries: Record<string, CountryServiceArea>;
  serviceUnavailableMessages: Record<string, string>;
}

export interface Orders {
  id: string;
  userID: string;
  userId?: string;
  price: number;
  distance: number;
  namePickUp: string;
  pickUpLocation: {
    coordinates: [number, number]; // [longitude, latitude]
    type?: string;
  };
  stops: string[]; // List of stop IDs in stops collection
  vehicleType: string;
  isAcepted: boolean;
  scheduleAt?: Date | any | null;
  category: string;
  elevatorOnPickup: boolean;
  longWalkOnPickup: boolean;
  elevatorOnDropoff: boolean;
  longWalkOnDropoff: boolean;
  pickupFloor: number;
  dropoffFloor: number;
  moveServiceSize: string;
  bulkyItems: boolean;
  optionalAssets: string[] | null;
  budget: number | null;
  notes: string | null;
  timestamp?: any;
}

export type Order = Orders;

export interface Rating {
  id?: string;
  userId: string;
  rating: number;
  driverId: string;
  time?: Date | any;
}

export interface ShnellUser {
  uid?: string;
  id?: string;
  email: string;
  name: string;
  phone: string;
  role: 'driver' | 'user' | 'admin' | 'company' | string;
  accType: 'pro' | 'standard' | 'eco' | string;
  fcmToken?: string;
  balance: number;
  isActive: boolean;
  darkMode?: boolean;
  platform?: string;
  isPhoneVerified?: boolean;
  isBan?: boolean;
  isBanned?: boolean;
}

export interface Vehicle {
  id?: string;
  carteGrise: string;
  cin: string;
  idDriver: string;
  type: string;
  vehiculeAsset: string;
  isAssetsApproved: boolean;
  isAdminApproved: boolean;
  allAssets: string[];
  carteGriseAsset?: string;
  cinAsset?: string;
  driverName?: string;
}

export interface Commission {
  id?: string;
  userId?: string;
  DriverId?: string;
  commissionDeducted: number;
  percentageFees?: number;
  DealAmount: number;
  orderId?: string;
  driverId?: string;
  time?: Date | any;
  typeOfTransaction?: 'commission' | 'recharge' | string;
}

export interface DriverRTDBLocation {
  driverId: string;
  coordinates: [number, number]; // [lng, lat]
  g?: string; // geohash
  ts?: number; // timestamp ms
  accuracy?: number;
  provider?: string;
  driverName?: string;
  driverPhone?: string;
  driverRole?: string;
  vehicleType?: string;
  isOnline?: boolean;
  isBusy?: boolean;
}

export interface MetricCard {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
  trendUp?: boolean;
  accent: 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'emerald' | 'cyan' | 'indigo';
  icon?: string;
  change?: string;
}
