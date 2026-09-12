import { Injectable, inject } from '@angular/core';
import { RemoteConfig, fetchAndActivate, getValue } from '@angular/fire/remote-config';
import { setMapboxToken } from './mapbox';

/**
 * Secrets/config fetched from Firebase Remote Config instead of being
 * hardcoded in the bundle — values can be rotated from the Firebase console
 * without a rebuild/redeploy. `init()` is awaited by an APP_INITIALIZER
 * (see app.module.ts) before the app finishes bootstrapping.
 */
@Injectable({ providedIn: 'root' })
export class RemoteConfigService {
  private readonly rc = inject(RemoteConfig);

  async init(): Promise<void> {
    this.rc.settings.minimumFetchIntervalMillis = 3600000;
    this.rc.defaultConfig = {
      mapbox_access_token: '',
      gemini_api_key: '',
      gemini_model: 'gemini-2.0-flash',
      google_maps_api_key: '',
      brevo_api_key: '',
    };
    try {
      await fetchAndActivate(this.rc);
    } catch (error) {
      console.error('Remote Config fetch failed, using defaults', error);
    }
    setMapboxToken(this.value('mapbox_access_token'));
  }

  private value(key: string): string {
    return getValue(this.rc, key).asString();
  }

  get mapboxAccessToken(): string { return this.value('mapbox_access_token'); }
  get geminiApiKey(): string { return this.value('gemini_api_key'); }
  get geminiModel(): string { return this.value('gemini_model') || 'gemini-2.0-flash'; }
  get googleMapsApiKey(): string { return this.value('google_maps_api_key'); }
  get brevoApiKey(): string { return this.value('brevo_api_key'); }
}
