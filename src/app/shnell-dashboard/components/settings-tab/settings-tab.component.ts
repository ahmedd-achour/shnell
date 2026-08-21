import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { VehicleSettings, CountryServiceArea } from '../../models/dashboard.models';

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

  vehicleTypesList: string[] = ['isuzu', 'estafette', 'grand_camion', 'petit_camion'];
  vehicleSettingsData: Record<string, VehicleSettings> = {};

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
      commission_percentage: [0.15, [Validators.required, Validators.min(0), Validators.max(1)]],
      stop_fee: [0.4, [Validators.required, Validators.min(0)]],
      update_link_customer_app: [''],
      update_link_driver_app: ['']
    });

    this.vehicleTypesList.forEach(key => {
      this.vehicleForms[key] = this.createVehicleFormGroup();
    });
  }

  private createVehicleFormGroup(data?: VehicleSettings): FormGroup {
    return this.fb.group({
      name: [data?.name || '', Validators.required],
      max_weight: [data?.maxWeight ?? 0, [Validators.required, Validators.min(0)]],
      volume: [data?.volume ?? 0, [Validators.required, Validators.min(0)]],
      base_price: [data?.basePrice ?? 0, [Validators.required, Validators.min(0)]],
      short_dist_threshold: [data?.shortDistThreshold ?? 300, [Validators.required, Validators.min(0)]],
      short_dist_min: [data?.shortDistMin ?? 0, [Validators.required, Validators.min(0)]],
      short_dist_mult: [data?.shortDistMult ?? 0, [Validators.required, Validators.min(0)]],
      long_dist_rate: [data?.longDistRate ?? 0, [Validators.required, Validators.min(0)]],
      isActive: [data?.isActive ?? true]
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
              commission_percentage: configDoc.commission_percentage ?? 0.15,
              stop_fee: configDoc.stop_fee ?? 0.4,
              update_link_customer_app: configDoc.update_link_customer_app || '',
              update_link_driver_app: configDoc.update_link_driver_app || ''
            });
          }

          if (vehiclesDoc && Object.keys(vehiclesDoc).length > 0) {
            this.vehicleSettingsData = vehiclesDoc;
            Object.keys(vehiclesDoc).forEach(key => {
              const v = vehiclesDoc[key];
              if (!this.vehicleForms[key]) {
                this.vehicleForms[key] = this.createVehicleFormGroup(v);
                if (!this.vehicleTypesList.includes(key)) {
                  this.vehicleTypesList.push(key);
                }
              } else {
                this.vehicleForms[key].patchValue({
                  name: v.name || key,
                  max_weight: v.maxWeight ?? (v as any).max_weight ?? 0,
                  volume: v.volume ?? 0,
                  base_price: v.basePrice ?? (v as any).base_price ?? 0,
                  short_dist_threshold: v.shortDistThreshold ?? (v as any).short_dist_threshold ?? 300,
                  short_dist_min: v.shortDistMin ?? (v as any).short_dist_min ?? 0,
                  short_dist_mult: v.shortDistMult ?? (v as any).short_dist_mult ?? 0,
                  long_dist_rate: v.longDistRate ?? (v as any).long_dist_rate ?? 0,
                  isActive: v.isActive ?? true
                });
              }
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

  async saveGlobalConfig(): Promise<void> {
    if (this.configForm.invalid) return;
    this.savingGlobal = true;
    this.clearAlerts();

    try {
      await this.dashboardDataService.updateConfigParams(this.configForm.value);
      this.successMessage = 'Global App Config Parameters successfully updated!';
    } catch (err) {
      console.error('Save global config error:', err);
      this.errorMessage = 'Failed to update global configuration.';
    } finally {
      this.savingGlobal = false;
    }
  }

  async saveVehicleConfig(key: string): Promise<void> {
    const form = this.vehicleForms[key];
    if (!form || form.invalid) return;

    this.savingVehicle = key;
    this.clearAlerts();

    try {
      const val = form.value;
      const vehicleObj: VehicleSettings = {
        name: val.name,
        maxWeight: Number(val.max_weight),
        volume: Number(val.volume),
        basePrice: Number(val.base_price),
        shortDistThreshold: Number(val.short_dist_threshold),
        shortDistMin: Number(val.short_dist_min),
        shortDistMult: Number(val.short_dist_mult),
        longDistRate: Number(val.long_dist_rate),
        isActive: val.isActive
      };

      const updatedPayload: Record<string, any> = {};
      updatedPayload[key] = {
        name: vehicleObj.name,
        max_weight: vehicleObj.maxWeight,
        volume: vehicleObj.volume,
        base_price: vehicleObj.basePrice,
        short_dist_threshold: vehicleObj.shortDistThreshold,
        short_dist_min: vehicleObj.shortDistMin,
        short_dist_mult: vehicleObj.shortDistMult,
        long_dist_rate: vehicleObj.longDistRate,
        isActive: vehicleObj.isActive
      };

      await this.dashboardDataService.updateVehicleSettingsConfig(updatedPayload as any);
      this.successMessage = `Vehicle settings for ${val.name} successfully updated!`;
    } catch (err) {
      console.error('Save vehicle config error:', err);
      this.errorMessage = `Failed to update vehicle settings for ${key}.`;
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
      this.successMessage = 'Service Areas & Messages successfully updated!';
    } catch (err) {
      console.error('Save service areas error:', err);
      this.errorMessage = 'Failed to update service areas.';
    } finally {
      this.savingAreas = false;
    }
  }

  private clearAlerts(): void {
    this.successMessage = null;
    this.errorMessage = null;
  }
}
