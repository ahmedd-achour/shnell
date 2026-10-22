import { Injectable } from '@angular/core';

export interface RoutePoint {
  id: string;
  lat: number;
  lng: number;
}

export interface OptimizedRoute {
  /** Stop ids in visiting order, pickup-first. */
  orderedStopIds: string[];
  /** Haversine distance of the full pickup -> stop1 -> ... -> stopN path, in km. */
  totalDistanceKm: number;
}

/** Straight-line (haversine) distance in km. Exported so pricing/capacity callers
 *  that need a distance figure don't have to re-derive it. */
export function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Sequences a mission's stops for the driver (spec §7). Extracted verbatim from the
 *  nearest-neighbor heuristic that already existed in partnerdash.component.ts — kept
 *  behind this interface so a real routing/optimization API (Mapbox Optimization, etc.)
 *  can replace the heuristic later without touching dispatch-center or pricing callers. */
@Injectable({ providedIn: 'root' })
export class RouteService {

  optimize(pickup: { lat: number; lng: number }, stops: RoutePoint[]): OptimizedRoute {
    const remaining = [...stops];
    const orderedStopIds: string[] = [];
    let current = { lat: pickup.lat, lng: pickup.lng };
    let totalDistanceKm = 0;

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = haversineDistanceKm(current, remaining[0]);
      for (let i = 1; i < remaining.length; i++) {
        const dist = haversineDistanceKm(current, remaining[i]);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestIndex = i;
        }
      }
      const nextStop = remaining.splice(nearestIndex, 1)[0];
      orderedStopIds.push(nextStop.id);
      totalDistanceKm += nearestDistance;
      current = { lat: nextStop.lat, lng: nextStop.lng };
    }

    return { orderedStopIds, totalDistanceKm: Number(totalDistanceKm.toFixed(2)) };
  }
}
