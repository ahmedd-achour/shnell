export interface Bid {
  id?: string;
  idOrder: string;
  idDriver: string;
  idUser: string;
  ammount: number;
  currencyCode?: string;
  isActive: boolean;
  timestamp?: Date | any;
}

export interface Cancelation {
  id?: string;
  idDeal: string;
  cancelledBy: string;
  time?: Date | any;
}

/** Has the driver/company payment side of the deal been settled? */
export type DealPaymentStatus = 'unpaid' | 'paid';

export interface Deals {
  id?: string;
  idOrder: string;
  idDriver: string;
  idUser: string;
  status: 'accepted' | 'acepted' | 'almost' | 'terminated' | string;
  timestamp?: Date | any;
  /** Flat mission price agreed with the driver (spec §5) — fixed after acceptance. */
  agreedPrice?: number;
  currency?: string;
  /** Percentage applied to `agreedPrice` to derive `commissionAmount`. */
  commissionPercentage?: number;
  commissionAmount?: number;
  /** Amount actually paid out to the driver (may equal agreedPrice or agreedPrice - commission depending on payment flow). */
  driverAmount?: number;
  paymentStatus?: DealPaymentStatus;
  acceptedAt?: Date | any;
  startedAt?: Date | any;
  completedAt?: Date | any;
  cancelledAt?: Date | any;
}

export type Deal = Deals;

/** Lifecycle of a single stop / parcel. Replaces the old `isDelivered` boolean.
 *  Writers dual-write `state` + a mirror `isDelivered: state === 'delivered'`;
 *  readers prefer `state` and fall back to the legacy bool for old docs. */
export type StopState = 'pending' | 'inRoute' | 'delivered' | 'notDelivered';

/** Has the parcel's cash (parcelPrice) been settled with the expeditor yet? */
export type ExpeditorPayout = 'unpaid' | 'paid';

export interface DropOffData {
  id?: string;
  destination: {
    latitude: number;
    longitude: number;
  };
  destinationName: string;
  /** @deprecated legacy mirror — read `state` instead */
  isdelivered?: boolean;
  /** @deprecated legacy mirror — read `state` instead */
  isDelivered?: boolean;
  state?: StopState;
  name?: string;           // optional recipient / contact name for this stop
  receiverPhone?: string;  // optional contact phone for this stop
  receiverPhone2?: string; // optional second contact phone
  description?: string;    // free-text note about the parcel / stop
  parcelPrice?: number;    // "frais de vente du colis" — cash to collect on delivery (TND)
  /** UID of the professional / company user who created this stop. */
  definedBy?: string;
  /** Optional expeditor (sender) reference — enables per-expeditor money analysis. */
  expeditorId?: string;
  /** Whether the collected cash has been paid out to the expeditor. Default 'unpaid'. */
  expeditorPayout?: ExpeditorPayout;
  paidToExpeditorAt?: any;  // Timestamp set when expeditorPayout flips to 'paid'
  /** Position of this stop within its mission's optimized route (0-based). */
  sequence?: number;
  /** Reason selected by the driver when `state` is 'notDelivered'. */
  failureReason?: string;
  proofOfDelivery?: {
    photoUrl?: string;
    signatureUrl?: string;
    deliveredAt?: any;
    note?: string;
  };
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
  pricing?: any;
}

/** Tiered fee band, e.g. { upTo: 20, fee: 8 } = "up to 20 km costs +8 DT". `upTo: null` means "and above". */
export interface PricingBand {
  upTo: number | null;
  fee: number;
}

/** Stored at settings/dispatch. Backs `PricingService` and `MissionCapacityService` — admin-configurable, never hardcoded in components. */
export interface DispatchConfig {
  maxStopsPerMission: number;
  maxParcelsPerMission: number;
  maxConcurrentOrders: number;
  pricing: {
    baseFee: number;
    distanceBands: PricingBand[]; // km
    stopBands: PricingBand[];     // stop count
    parcelBands: PricingBand[];   // parcel count
  };
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
  /** ISO 4217 code of price (the trip's country currency). */
  currencyCode?: string;
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
  optionalAssets: string[] | null;
  budget: number | null;
  notes: string | null;
  timestamp?: any;
  /** True when created from the admin console (no real customer). The driver
   *  app hides the in-app call / video-call actions for these orders. */
  isAdministrative?: boolean;
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
  /** Display copy of wallets/{uid}.balances (joined in by the dashboard
   *  service; never stored on users). */
  balances?: Record<string, number>;
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
  typeOfTransaction?: 'commission' | 'recharge' | 'adjustment' | string;
  /** Currency of this ledger line (= the wallet balance it moved). */
  currencyCode?: string;
  /** That currency's wallet balance right after this line. */
  balanceAfter?: number;
  reason?: string;
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

export interface CallLog {
  id?: string;
  dealId?: string;
  callStatus?: string;
  callerName?: string;
  callerId?: string;
  receiverId?: string;
  status?: string;
  timestamp?: any;
  type?: string;
  participants?: string[];
}
