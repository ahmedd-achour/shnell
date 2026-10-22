import { Injectable } from '@angular/core';
import { DispatchConfig, PricingBand } from '../models/dashboard.models';

export interface MissionPriceInput {
  distanceKm: number;
  stopCount: number;
  parcelCount: number;
}

export interface MissionPriceResult {
  baseFee: number;
  distanceFee: number;
  stopFee: number;
  parcelFee: number;
  /** Flat total offered to the driver for the whole mission (spec §5, §10). */
  agreedPrice: number;
}

function feeForBand(bands: PricingBand[], value: number): number {
  for (const band of bands) {
    if (band.upTo === null || value <= band.upTo) return band.fee;
  }
  return bands.length ? bands[bands.length - 1].fee : 0;
}

/** Computes the flat transporter (driver) price for a mission from admin-configured
 *  settings/dispatch bands. Single source of truth — replaces the divergent pricing
 *  logic previously duplicated in partnerdash (flat payrate) and user-dashboard
 *  (Cloud Function + GlobalConfig fallback). */
@Injectable({ providedIn: 'root' })
export class PricingService {

  computeMissionPrice(input: MissionPriceInput, config: DispatchConfig): MissionPriceResult {
    const baseFee = config.pricing.baseFee;
    const distanceFee = feeForBand(config.pricing.distanceBands, input.distanceKm);
    const stopFee = feeForBand(config.pricing.stopBands, input.stopCount);
    const parcelFee = feeForBand(config.pricing.parcelBands, input.parcelCount);
    const agreedPrice = Number((baseFee + distanceFee + stopFee + parcelFee).toFixed(2));
    return { baseFee, distanceFee, stopFee, parcelFee, agreedPrice };
  }

  /** Commission the platform keeps for a given deal price. PRO companies typically pass 0 (spec §12). */
  computeCommission(agreedPrice: number, commissionPercentage: number): { commissionAmount: number; driverAmount: number } {
    const commissionAmount = Number((agreedPrice * (commissionPercentage / 100)).toFixed(2));
    return { commissionAmount, driverAmount: agreedPrice };
  }
}
