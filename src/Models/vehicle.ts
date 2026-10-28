import { Vehicle as VehicleDoc } from '../models';

/** vehicles/{id} for the fleet screens (canonical fields only, see models.ts). */
export class Vehicle implements VehicleDoc {
  id?: string;
  idDriver: string;
  type: string;
  vehicleAssetUrl: string;
  licensePlate?: string;
  isAdminApproved: boolean;
  isAssetsApproved: boolean;
  allAssets: string[];

  constructor(data: any) {
    this.id = data.id;
    this.idDriver = data.idDriver || '';
    // Empty while the AI classifier / admin has not set it (typeSource 'ai_pending').
    this.type = data.type || '';
    this.vehicleAssetUrl = data.vehicleAssetUrl || '';
    this.licensePlate = data.licensePlate || undefined;
    this.isAdminApproved = data.isAdminApproved === true;
    this.isAssetsApproved = data.isAssetsApproved === true;
    this.allAssets = Array.isArray(data.allAssets) ? data.allAssets : [];
  }

  static fromJson(json: any): Vehicle {
    return new Vehicle(json);
  }
}
