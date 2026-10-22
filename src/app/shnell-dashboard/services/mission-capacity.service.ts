import { Injectable } from '@angular/core';
import { DispatchConfig } from '../models/dashboard.models';

export interface CapacityStop {
  id: string;
  /** Parcel count this stop contributes; defaults to 1 when the stop doesn't track quantity. */
  parcelCount?: number;
}

export interface MissionSplit {
  stopIds: string[];
  stopCount: number;
  parcelCount: number;
}

/** Splits an oversized stop selection into capacity-compliant missions (spec §6),
 *  using settings/dispatch's maxStopsPerMission / maxParcelsPerMission instead of a
 *  hardcoded limit. Greedy fill in selection order — route sequencing happens per-mission
 *  afterwards via RouteService, so split order here doesn't need to be distance-aware. */
@Injectable({ providedIn: 'root' })
export class MissionCapacityService {

  split(stops: CapacityStop[], config: DispatchConfig): MissionSplit[] {
    const missions: MissionSplit[] = [];
    let current: MissionSplit = { stopIds: [], stopCount: 0, parcelCount: 0 };

    for (const stop of stops) {
      const parcels = stop.parcelCount ?? 1;
      const wouldExceedStops = current.stopCount + 1 > config.maxStopsPerMission;
      const wouldExceedParcels = current.parcelCount + parcels > config.maxParcelsPerMission;

      if (current.stopCount > 0 && (wouldExceedStops || wouldExceedParcels)) {
        missions.push(current);
        current = { stopIds: [], stopCount: 0, parcelCount: 0 };
      }

      current.stopIds.push(stop.id);
      current.stopCount += 1;
      current.parcelCount += parcels;
    }

    if (current.stopCount > 0) missions.push(current);
    return missions;
  }
}
