/**
 * Maps a Shnell vehicle-type key to its illustration in `assets/trucks/`.
 * Mirrors the mapping used by the customer web dashboard so the admin console
 * shows the same fleet artwork everywhere (no more generic truck glyphs).
 */
const KNOWN = [
  'super_light', 'light', 'light_medium', 'medium',
  'medium_heavy', 'heavy', 'super_heavy', 'popular', 'isuzu'
];

export const VEHICLE_IMAGE_FALLBACK = 'assets/trucks/medium.png';

export function vehicleImage(key: string | null | undefined): string {
  const k = (key || '').toLowerCase().trim().replace(/\s+/g, '_');
  if (KNOWN.includes(k)) return `assets/trucks/${k}.png`;
  if (k.includes('super_heavy')) return 'assets/trucks/super_heavy.png';
  if (k.includes('medium_heavy')) return 'assets/trucks/medium_heavy.png';
  if (k.includes('heavy')) return 'assets/trucks/heavy.png';
  if (k.includes('isuzu')) return 'assets/trucks/isuzu.png';
  if (k.includes('medium')) return 'assets/trucks/medium.png';
  if (k.includes('super_light')) return 'assets/trucks/super_light.png';
  if (k.includes('light')) return 'assets/trucks/light.png';
  if (k.includes('popular')) return 'assets/trucks/popular.png';
  return VEHICLE_IMAGE_FALLBACK;
}

/** `(error)` handler for <img> — swaps a broken source for the fallback once. */
export function onVehicleImgError(ev: Event): void {
  const el = ev.target as HTMLImageElement;
  if (el && el.src.indexOf(VEHICLE_IMAGE_FALLBACK) === -1) el.src = VEHICLE_IMAGE_FALLBACK;
}
