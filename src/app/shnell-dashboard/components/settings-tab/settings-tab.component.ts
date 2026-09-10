import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { VehicleSettings, CountryServiceArea } from '../../models/dashboard.models';
import { toastSuccess, toastError } from '../../../shared/swal';

/** One row of per-country pricing, as the user wants it modelled:
 *  pricing: { TN: { base_price: 30, price_per_km: 1.2, currency: "dt" }, ... } */
interface CountryPriceRow {
  countryCode: string;
  base_price: number;
  price_per_km: number;
  currency: string;
}

@Component({
  selector: 'app-settings-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './settings-tab.component.html',
  styleUrls: ['./settings-tab.component.css']
})
export class SettingsTabComponent implements OnInit, OnDestroy {
  configForm!: FormGroup;
  vehicleForms: Record<string, FormGroup> = {};

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
      update_link_customer_app: [''],
      update_link_driver_app: ['']
    });

    this.vehicleTypesList.forEach(key => {
      this.vehicleForms[key] = this.createVehicleFormGroup();
      this.vehiclePricing[key] = [];
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
      this.dashboardDataService.getServiceAreasDoc()
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([configDoc, vehiclesDoc, areasDoc]) => {
          if (configDoc) {
            this.configForm.patchValue({
              version_customer_app: configDoc.version_customer_app || '1.0.0',
              version_driver_app: configDoc.version_driver_app || '1.0.0',
              currency_code: configDoc.currency_code || configDoc.default_currency_code || 'TND',
              currency_symbol: configDoc.currency_symbol || 'DT',
              commission_percentage: configDoc.commission_percentage ?? 0.15,
              stop_fee: configDoc.stop_fee ?? 0.4,
              update_link_customer_app: configDoc.update_link_customer_app || '',
              update_link_driver_app: configDoc.update_link_driver_app || ''
            });
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

  private clearAlerts(): void {
    this.successMessage = null;
    this.errorMessage = null;
  }
}
