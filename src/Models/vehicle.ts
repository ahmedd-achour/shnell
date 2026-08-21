export class Vehicle {
  carteGriseFront: string;
  carteGriseBack: string;
  carteIdentityFront: string;
  carteIdentityBack: string;
  cin: string;
  idDriver: string;
  matVehicle: string;
  maxWeight: number;
  maxVolume: number;
  type: string;
  vehicleImage: string;
  isAdminApproved: boolean;
  isAssetsApproved: boolean;
  carteGrise: string;
  carteGriseAsset?: string;
  cinAsset?: string;
  vehiculeAsset?: string;
  allAssets: string[];
  id?: string;

  constructor(data: any) {
    this.carteGriseFront = data.carteGriseFront || '';
    this.carteGriseBack = data.carteGriseBack || '';
    this.carteIdentityFront = data.carteIdentityFront || '';
    this.carteIdentityBack = data.carteIdentityBack || '';
    this.cin = data.cin || '';
    this.idDriver = data.idDriver || '';
    this.matVehicle = data.matVehicle || '';
    this.maxWeight = Number(data.maxWeight || 0);
    this.maxVolume = Number(data.maxVolume || 0);
    this.type = data.type || 'camion';
    this.vehicleImage = "assets/trucks/" + data.type + ".png" || '';
    this.isAdminApproved = data.isAdminApproved ?? false;
    this.isAssetsApproved = data.isAssetsApproved ?? data.isAdminApproved ?? false;
    this.carteGrise = data.carteGrise || data.carteGriseFront || '';
    this.carteGriseAsset = data.carteGriseAsset || data.carteGriseFront || '';
    this.cinAsset = data.cinAsset || data.carteIdentityFront || '';
    this.vehiculeAsset = data.vehiculeAsset || data.vehicleImage || '';
    this.allAssets = Array.isArray(data.allAssets) ? data.allAssets : [];
    this.id = data.id || data.uid;
  }

  static fromJson(json: any): Vehicle {
    return new Vehicle(json);
  }
}
