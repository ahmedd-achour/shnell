export class Vehicle {
  idDriver: string;
  matVehicle?: string; // corresponds to licensePlate
  maxWeight: number;
  maxVolume: number;
  type: string; // corresponds to vehicleTypeId
  vehicleImage?: string; // corresponds to vehicleAssetUrl
  isAdminApproved: boolean;
  isAssetsApproved: boolean;
  allAssets: string[];
  id?: string;

  constructor(data: any) {
    this.idDriver = data.idDriver || '';
    this.matVehicle = data.matVehicle || data.licensePlate || '';
    this.maxWeight = Number(data.maxWeight || 0);
    this.maxVolume = Number(data.maxVolume || 0);
    this.type = data.type || data.vehicleTypeId || 'camion';
    this.vehicleImage = data.vehicleImage || data.vehicleAssetUrl || data.vehiculeAsset || ("assets/trucks/" + (data.type || data.vehicleTypeId) + ".png");
    this.isAdminApproved = data.isAdminApproved ?? false;
    this.isAssetsApproved = data.isAssetsApproved ?? data.isAdminApproved ?? false;
    this.allAssets = Array.isArray(data.allAssets) ? data.allAssets : [];
    this.id = data.id || data.uid;
  }

  static fromJson(json: any): Vehicle {
    return new Vehicle(json);
  }
}
