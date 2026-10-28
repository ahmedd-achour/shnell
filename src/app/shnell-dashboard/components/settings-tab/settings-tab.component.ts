import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { VehicleSettings, CountryServiceArea, DispatchConfig, PricingBand } from '../../models/dashboard.models';
import { toastSuccess, toastError } from '../../../shared/swal';

/** One row of per-country pricing, as the user wants it modelled:
 *  pricing: { TN: { base_price: 30, price_per_km: 1.2, currency: "dt" }, ... } */
interface CountryPriceRow {
  countryCode: string;
  base_price: number;
  price_per_km: number;
  currency: string;
}

/** Same default as functions/lib/whatsapp_reach.js ({name} filled in). */
export const DEFAULT_REACH_TEXT =
  'Asslema {name} 👋\n' +
  'Shnell t3lmek enou famma offre 9rib menek tawa 🚚\n' +
  'Choufha 9bal ma y9blha chauffeur a5er w temchi 3lik! 👉 https://play.google.com/store/apps/details?id=com.shnell.shnell_driver';

@Component({
  selector: 'app-settings-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './settings-tab.component.html',
  styleUrls: ['./settings-tab.component.css']
})
export class SettingsTabComponent implements OnInit, OnDestroy {
  configForm!: FormGroup;
  dispatchForm!: FormGroup;
  strategicForm!: FormGroup;
  savingStrategic = false;
  reachToday = 0;
  reachLog: any[] = [];
  demoMode = false;
  savingDemo = false;
  vehicleForms: Record<string, FormGroup> = {};

  /** Editable rows for the three pricing bands — mirrors `vehiclePricing`'s row-array pattern. */
  distanceBands: PricingBand[] = [];
  stopBands: PricingBand[] = [];
  parcelBands: PricingBand[] = [];

  vehicleTypesList: string[] = ['super_light', 'light', 'medium', 'medium_heavy', 'heavy', 'super_heavy', 'popular'];
  vehicleSettingsData: Record<string, VehicleSettings> = {};

  /** Per-vehicle, per-country pricing rows, edited in the UI then folded into
   *  `pricing` on save. */
  vehiclePricing: Record<string, CountryPriceRow[]> = {};

  countriesData: Record<string, CountryServiceArea> = {};
  messagesData: Record<string, string> = { en: '', fr: '', ar: '' };

  loading: boolean = true;
  savingGlobal: boolean = false;
  savingVehicle: string | null = null;
  savingAreas: boolean = false;
  savingDispatch: boolean = false;

  successMessage: string | null = null;
  errorMessage: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private dashboardDataService: DashboardDataService
  ) {
    this.initForms();
  }

  ngOnInit(): void {
    this.loadSettings();
    this.dashboardDataService.getWhatsAppReachToday()
      .pipe(takeUntil(this.destroy$))
      .subscribe(n => this.reachToday = n);
    this.dashboardDataService.getWhatsAppReachLog()
      .pipe(takeUntil(this.destroy$))
      .subscribe(rows => this.reachLog = rows);
  }

  /** Message preview with sample values. */
  get reachPreview(): string {
    const text = (this.strategicForm.get('whatsapp_job_reach_text')?.value || '').trim() || DEFAULT_REACH_TEXT;
    return text.replace(/\{name\}/g, 'Sami').replace(/\{km\}/g, '2.4');
  }

  resetReachText(): void {
    this.strategicForm.patchValue({ whatsapp_job_reach_text: DEFAULT_REACH_TEXT });
  }

  async saveStrategicControls(): Promise<void> {
    if (this.strategicForm.invalid) return;
    this.savingStrategic = true;
    this.clearAlerts();
    try {
      const v = this.strategicForm.value;
      await this.dashboardDataService.updateStrategicControls({
        whatsapp_job_reach_enabled: !!v.whatsapp_job_reach_enabled,
        whatsapp_job_reach_offline: !!v.whatsapp_job_reach_offline,
        whatsapp_job_reach_per_order: Number(v.whatsapp_job_reach_per_order),
        whatsapp_job_reach_daily_cap: Number(v.whatsapp_job_reach_daily_cap),
        whatsapp_job_reach_cooldown_hours: Number(v.whatsapp_job_reach_cooldown_hours),
        whatsapp_job_reach_text: (v.whatsapp_job_reach_text || '').trim(),
        driver_auto_ban_enabled: !!v.driver_auto_ban_enabled,
      });
      this.strategicForm.markAsPristine();
      this.successMessage = 'Strategic controls saved.';
      toastSuccess('Strategic controls saved');
    } catch (err) {
      console.error('Save strategic controls error:', err);
      this.errorMessage = 'Failed to save strategic controls.';
      toastError('Failed to save strategic controls');
    } finally {
      this.savingStrategic = false;
    }
  }

  /** Saved at once (no Save button): it's flipped right before a demo. */
  async toggleDemoMode(on: boolean): Promise<void> {
    this.savingDemo = true;
    try {
      await this.dashboardDataService.setDemoMode(on);
      this.demoMode = on;
      toastSuccess(on ? 'Demo mode ON: drivers are not notified' : 'Demo mode OFF: back to normal');
    } catch (err) {
      console.error('Demo mode error:', err);
      toastError('Failed to switch demo mode');
    } finally {
      this.savingDemo = false;
    }
  }

  reachStatusClass(status: string): string {
    if (status === 'sent') return 'text-success';
    if (status === 'failed') return 'text-danger';
    if (status === 'queued' || status === 'sending') return 'text-primary';
    return 'text-muted';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForms(): void {
    this.configForm = this.fb.group({
      version_customer_app: ['1.0.0', Validators.required],
      version_driver_app: ['1.0.0', Validators.required],
      currency_code: ['TND', Validators.required],
      currency_symbol: ['DT', Validators.required],
      commission_percentage: [0.15, [Validators.required, Validators.min(0), Validators.max(1)]],
      stop_fee: [0.4, [Validators.required, Validators.min(0)]],
      // Shortest return trip and customer leg (functions/lib/returns.js)
      return_min_km: [20, [Validators.required, Validators.min(1), Validators.max(500)]],
      update_link_customer_app: [''],
      update_link_driver_app: ['']
    });

    // Both switches default to OFF: they are used strategically.
    this.strategicForm = this.fb.group({
      whatsapp_job_reach_enabled: [false],
      whatsapp_job_reach_offline: [true],
      whatsapp_job_reach_per_order: [10, [Validators.required, Validators.min(1), Validators.max(50)]],
      whatsapp_job_reach_daily_cap: [60, [Validators.required, Validators.min(0), Validators.max(95)]],
      whatsapp_job_reach_cooldown_hours: [12, [Validators.required, Validators.min(1), Validators.max(168)]],
      whatsapp_job_reach_text: [DEFAULT_REACH_TEXT, [Validators.maxLength(1000)]],
      driver_auto_ban_enabled: [false]
    });

    this.vehicleTypesList.forEach(key => {
      this.vehicleForms[key] = this.createVehicleFormGroup();
      this.vehiclePricing[key] = [];
    });

    this.dispatchForm = this.fb.group({
      maxStopsPerMission: [250, [Validators.required, Validators.min(1)]],
      maxParcelsPerMission: [250, [Validators.required, Validators.min(1)]],
      maxConcurrentOrders: [50, [Validators.required, Validators.min(1)]],
      baseFee: [5, [Validators.required, Validators.min(0)]]
    });
  }

  private createVehicleFormGroup(data?: VehicleSettings): FormGroup {
    return this.fb.group({
      name: [data?.name || '', Validators.required],
      category: [(data as any)?.category || 'van'],
      sort_order: [(data as any)?.sort_order ?? 0, [Validators.min(0)]],
      max_weight: [data?.maxWeight ?? 0, [Validators.required, Validators.min(0)]],
      volume: [data?.volume ?? 0, [Validators.required, Validators.min(0)]],
      base_price: [data?.basePrice ?? 0, [Validators.required, Validators.min(0)]],
      short_dist_threshold: [data?.shortDistThreshold ?? 30, [Validators.required, Validators.min(0)]],
      short_dist_min: [data?.shortDistMin ?? 0, [Validators.required, Validators.min(0)]],
      short_dist_mult: [data?.shortDistMult ?? 0, [Validators.required, Validators.min(0)]],
      long_dist_rate: [data?.longDistRate ?? 0, [Validators.required, Validators.min(0)]],
      isActive: [data?.isActive ?? true]
    });
  }

  /** Firestore `pricing` map -> editable rows. */
  private pricingMapToRows(pricing: any): CountryPriceRow[] {
    if (!pricing || typeof pricing !== 'object') return [];
    return Object.keys(pricing).map(cc => {
      const p = pricing[cc] || {};
      return {
        countryCode: cc.toUpperCase(),
        base_price: Number(p.base_price ?? 0),
        price_per_km: Number(p.price_per_km ?? 0),
        currency: (p.currency ?? '').toString()
      };
    });
  }

  private loadSettings(): void {
    combineLatest([
      this.dashboardDataService.getGlobalConfigDoc(),
      this.dashboardDataService.getVehicleSettingsDoc(),
      this.dashboardDataService.getServiceAreasDoc(),
      this.dashboardDataService.getDispatchConfigDoc()
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([configDoc, vehiclesDoc, areasDoc, dispatchDoc]) => {
          if (configDoc) {
            this.configForm.patchValue({
              version_customer_app: configDoc.version_customer_app || '1.0.0',
              version_driver_app: configDoc.version_driver_app || '1.0.0',
              currency_code: configDoc.currency_code || configDoc.default_currency_code || 'TND',
              currency_symbol: configDoc.currency_symbol || 'DT',
              commission_percentage: configDoc.commission_percentage ?? 0.15,
              stop_fee: configDoc.stop_fee ?? 0.4,
              return_min_km: configDoc.return_min_km ?? 20,
              update_link_customer_app: configDoc.update_link_customer_app || '',
              update_link_driver_app: configDoc.update_link_driver_app || ''
            });
            this.demoMode = configDoc.demo_mode_enabled === true;
            // Don't overwrite what the admin is editing on a live update.
            if (!this.strategicForm.dirty) {
              this.strategicForm.patchValue({
                whatsapp_job_reach_enabled: configDoc.whatsapp_job_reach_enabled === true,
                whatsapp_job_reach_offline: configDoc.whatsapp_job_reach_offline !== false,
                whatsapp_job_reach_per_order: configDoc.whatsapp_job_reach_per_order ?? 10,
                whatsapp_job_reach_daily_cap: configDoc.whatsapp_job_reach_daily_cap ?? 60,
                whatsapp_job_reach_cooldown_hours: configDoc.whatsapp_job_reach_cooldown_hours ?? 12,
                whatsapp_job_reach_text: configDoc.whatsapp_job_reach_text || DEFAULT_REACH_TEXT,
                driver_auto_ban_enabled: configDoc.driver_auto_ban_enabled === true
              });
            }
          }

          if (vehiclesDoc && Object.keys(vehiclesDoc).length > 0) {
            this.vehicleSettingsData = vehiclesDoc;
            Object.keys(vehiclesDoc).forEach(key => {
              const v: any = vehiclesDoc[key];
              if (!this.vehicleForms[key]) {
                this.vehicleForms[key] = this.createVehicleFormGroup(v);
                if (!this.vehicleTypesList.includes(key)) {
                  this.vehicleTypesList.push(key);
                }
              } else {
                this.vehicleForms[key].patchValue({
                  name: v.name || key,
                  category: v.category || 'van',
                  sort_order: v.sort_order ?? 0,
                  max_weight: v.maxWeight ?? v.max_weight ?? 0,
                  volume: v.volume ?? 0,
                  base_price: v.basePrice ?? v.base_price ?? 0,
                  short_dist_threshold: v.shortDistThreshold ?? v.short_dist_threshold ?? 30,
                  short_dist_min: v.shortDistMin ?? v.short_dist_min ?? 0,
                  short_dist_mult: v.shortDistMult ?? v.short_dist_mult ?? 0,
                  long_dist_rate: v.longDistRate ?? v.long_dist_rate ?? 0,
                  isActive: v.isActive ?? v.is_active ?? true
                });
              }
              this.vehiclePricing[key] = this.pricingMapToRows(v.pricing);
            });
          }

          if (areasDoc) {
            this.countriesData = areasDoc.countries || {};
            this.messagesData = areasDoc.messages || {
              en: 'Service not available in your area yet.',
              fr: 'Service non disponible dans votre région pour le moment.',
              ar: 'الخدمة غير متوفرة في منطقتك بعد.'
            };
          }

          if (dispatchDoc) {
            this.dispatchForm.patchValue({
              maxStopsPerMission: dispatchDoc.maxStopsPerMission ?? 250,
              maxParcelsPerMission: dispatchDoc.maxParcelsPerMission ?? 250,
              maxConcurrentOrders: dispatchDoc.maxConcurrentOrders ?? 50,
              baseFee: dispatchDoc.pricing?.baseFee ?? 5
            });
            this.distanceBands = [...(dispatchDoc.pricing?.distanceBands || [])];
            this.stopBands = [...(dispatchDoc.pricing?.stopBands || [])];
            this.parcelBands = [...(dispatchDoc.pricing?.parcelBands || [])];
          }

          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading settings:', err);
          this.errorMessage = 'Failed to load configuration parameters from Firestore.';
          this.loading = false;
        }
      });
  }

  addPricingRow(key: string): void {
    if (!this.vehiclePricing[key]) this.vehiclePricing[key] = [];
    this.vehiclePricing[key].push({
      countryCode: '',
      base_price: this.vehicleForms[key]?.get('base_price')?.value ?? 0,
      price_per_km: this.vehicleForms[key]?.get('long_dist_rate')?.value ?? 0,
      currency: (this.configForm.get('currency_symbol')?.value || 'dt').toLowerCase()
    });
  }

  removePricingRow(key: string, index: number): void {
    this.vehiclePricing[key]?.splice(index, 1);
  }

  addBand(bands: PricingBand[]): void {
    bands.push({ upTo: null, fee: 0 });
  }

  removeBand(bands: PricingBand[], index: number): void {
    bands.splice(index, 1);
  }

  async saveGlobalConfig(): Promise<void> {
    if (this.configForm.invalid) return;
    this.savingGlobal = true;
    this.clearAlerts();

    try {
      await this.dashboardDataService.updateConfigParams(this.configForm.value);
      this.successMessage = 'Global config saved.';
      toastSuccess('Global config saved');
    } catch (err) {
      console.error('Save global config error:', err);
      this.errorMessage = 'Failed to update global configuration.';
      toastError('Failed to save global config');
    } finally {
      this.savingGlobal = false;
    }
  }

  async saveVehicleConfig(key: string): Promise<void> {
    const form = this.vehicleForms[key];
    if (!form || form.invalid) {
      toastError('Fix the highlighted fields before saving');
      return;
    }

    this.savingVehicle = key;
    this.clearAlerts();

    try {
      const val = form.value;

      // Fold the per-country rows into a `pricing` map:
      //   { TN: { base_price, price_per_km, currency }, ... }
      const pricing: Record<string, { base_price: number; price_per_km: number; currency: string }> = {};
      for (const row of (this.vehiclePricing[key] || [])) {
        const cc = (row.countryCode || '').trim().toUpperCase();
        if (!cc) continue;
        pricing[cc] = {
          base_price: Number(row.base_price) || 0,
          price_per_km: Number(row.price_per_km) || 0,
          currency: (row.currency || '').toString().trim()
        };
      }

      const payload: Record<string, any> = {};
      payload[key] = {
        name: val.name,
        category: val.category,
        sort_order: Number(val.sort_order) || 0,
        max_weight: Number(val.max_weight),
        volume: Number(val.volume),
        base_price: Number(val.base_price),
        short_dist_threshold: Number(val.short_dist_threshold),
        short_dist_min: Number(val.short_dist_min),
        short_dist_mult: Number(val.short_dist_mult),
        long_dist_rate: Number(val.long_dist_rate),
        pricing,
        isActive: val.isActive,
        is_active: val.isActive
      };

      await this.dashboardDataService.updateVehicleSettingsConfig(payload as any);
      this.successMessage = `Saved settings for ${val.name || key}.`;
      toastSuccess(`Saved ${val.name || key}`);
    } catch (err) {
      console.error('Save vehicle config error:', err);
      this.errorMessage = `Failed to update vehicle settings for ${key}.`;
      toastError(`Failed to save ${key}`);
    } finally {
      this.savingVehicle = null;
    }
  }

  toggleCountryActive(countryKey: string): void {
    if (this.countriesData[countryKey]) {
      this.countriesData[countryKey].active = !this.countriesData[countryKey].active;
    }
  }

  async saveServiceAreas(): Promise<void> {
    this.savingAreas = true;
    this.clearAlerts();

    try {
      await this.dashboardDataService.updateServiceAreasConfig({
        countries: this.countriesData,
        messages: this.messagesData
      });
      this.successMessage = 'Service areas & messages saved.';
      toastSuccess('Service areas saved');
    } catch (err) {
      console.error('Save service areas error:', err);
      this.errorMessage = 'Failed to update service areas.';
      toastError('Failed to save service areas');
    } finally {
      this.savingAreas = false;
    }
  }

  async saveDispatchConfig(): Promise<void> {
    if (this.dispatchForm.invalid) return;
    this.savingDispatch = true;
    this.clearAlerts();

    try {
      const val = this.dispatchForm.value;
      const config: DispatchConfig = {
        maxStopsPerMission: Number(val.maxStopsPerMission),
        maxParcelsPerMission: Number(val.maxParcelsPerMission),
        maxConcurrentOrders: Number(val.maxConcurrentOrders),
        pricing: {
          baseFee: Number(val.baseFee),
          distanceBands: this.distanceBands.map(b => ({ upTo: b.upTo === null ? null : Number(b.upTo), fee: Number(b.fee) })),
          stopBands: this.stopBands.map(b => ({ upTo: b.upTo === null ? null : Number(b.upTo), fee: Number(b.fee) })),
          parcelBands: this.parcelBands.map(b => ({ upTo: b.upTo === null ? null : Number(b.upTo), fee: Number(b.fee) }))
        }
      };
      await this.dashboardDataService.updateDispatchConfig(config);
      this.successMessage = 'Dispatch & pricing config saved.';
      toastSuccess('Dispatch config saved');
    } catch (err) {
      console.error('Save dispatch config error:', err);
      this.errorMessage = 'Failed to update dispatch & pricing configuration.';
      toastError('Failed to save dispatch config');
    } finally {
      this.savingDispatch = false;
    }
  }

  private clearAlerts(): void {
    this.successMessage = null;
    this.errorMessage = null;
  }
}
