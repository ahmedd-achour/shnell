import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardDataService } from './services/dashboard-data.service';
import { CrossTabSyncService, CrossTabEvent } from '../services/cross-tab-sync.service';
import { ShnellUser, Vehicle, Orders, Deals, Commission, DriverRTDBLocation, Bid , CallLog } from './models/dashboard.models';

import { OverviewTabComponent } from './components/overview-tab/overview-tab.component';
import { UsersTabComponent } from './components/users-tab/users-tab.component';
import { VehiclesTabComponent } from './components/vehicles-tab/vehicles-tab.component';
import { DealsTabComponent } from './components/deals-tab/deals-tab.component';
import { LiveMapTabComponent } from './components/live-map-tab/live-map-tab.component';
import { NotificationsTabComponent } from './components/notifications-tab/notifications-tab.component';
import { DriverProfileTabComponent } from './components/driver-profile-tab/driver-profile-tab.component';
import { SettingsTabComponent } from './components/settings-tab/settings-tab.component';
import { DispatchOrderTabComponent } from './components/dispatch-order-tab/dispatch-order-tab.component';

import { VerificationsTabComponent } from './components/verifications-tab/verifications-tab.component';

export type DashboardTab = 'overview' | 'users' | 'vehicles' | 'verifications' | 'deals' | 'live-map' | 'driver-profile' | 'settings' | 'notifications' | 'dispatch-order';

@Component({
  selector: 'app-shnell-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    OverviewTabComponent,
    UsersTabComponent,
    VehiclesTabComponent,
    VerificationsTabComponent,
    DealsTabComponent,
    LiveMapTabComponent,
    NotificationsTabComponent,
    DriverProfileTabComponent,
    SettingsTabComponent,
    DispatchOrderTabComponent
  ],
  templateUrl: './shnell-dashboard.component.html',
  styleUrls: ['./shnell-dashboard.component.css']
})
export class ShnellDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  activeTab: DashboardTab = 'overview';
  loading: boolean = true;
  error: string | null = null;
  today: Date = new Date();
  isDarkMode: boolean = false;

  users: ShnellUser[] = [];
  vehicles: Vehicle[] = [];
  orders: Orders[] = [];
  verifications: any[] = [];
  deals: Deals[] = [];
  commissions: Commission[] = [];
  driverLocations: DriverRTDBLocation[] = [];
  bids: Bid[] = [];
  callLogs: CallLog[] = [];

  selectedUserForNotification: ShnellUser | null = null;
  selectedDriverIdForInspection: string | null = null;

  liveToastMessage: string | null = null;
  toastTimeout: any = null;

  private readonly tabMeta: Record<string, { label: string; icon: string }> = {
    'overview':       { label: 'Overview & Analytics',  icon: 'bi-grid-1x2-fill' },
    'users':          { label: 'Users & Drivers',       icon: 'bi-people-fill' },
    'verifications':  { label: 'Driver Verifications',  icon: 'bi-person-vcard' },
    'vehicles':       { label: 'Fleet Applications',    icon: 'bi-truck' },
    'deals':          { label: 'Orders & Deals',        icon: 'bi-receipt' },
    'live-map':       { label: 'Realtime Map',          icon: 'bi-geo-alt-fill' },
    'driver-profile': { label: 'Driver Profile',        icon: 'bi-person-badge-fill' },
    'settings':       { label: 'App Config',            icon: 'bi-gear-wide-connected' },
    'notifications':  { label: 'FCM Notifications',     icon: 'bi-bell-fill' },
    'dispatch-order': { label: 'Assign Order',          icon: 'bi-send-plus-fill' },
  };

  get activeTabLabel(): string {
    return this.tabMeta[this.activeTab]?.label ?? this.activeTab.replace('-', ' ');
  }
  get activeTabIcon(): string {
    return this.tabMeta[this.activeTab]?.icon ?? 'bi-grid-1x2-fill';
  }

  constructor(
    private dashboardDataService: DashboardDataService,
    private crossTabSyncService: CrossTabSyncService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkQueryParams();
    this.subscribeToDashboardData();
    this.subscribeToCrossTabSync();
  }

  private checkQueryParams(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['tab'] && ['overview', 'users', 'vehicles', 'verifications', 'deals', 'live-map', 'driver-profile', 'settings', 'notifications', 'dispatch-order'].includes(params['tab'])) {
        this.activeTab = params['tab'] as DashboardTab;
      }
      if (params['id']) {
        this.selectedDriverIdForInspection = params['id'];
        if (!params['tab']) {
          this.activeTab = 'driver-profile';
        }
      }
    });
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  private subscribeToDashboardData(): void {
    combineLatest([
      this.dashboardDataService.getUsers(),
      this.dashboardDataService.getVehicles(),
      this.dashboardDataService.getDriverVerifications(),
      this.dashboardDataService.getOrders(),
      this.dashboardDataService.getDeals(),
      this.dashboardDataService.getCommissions(),
      this.dashboardDataService.getDriverRTDBLocations(),
      this.dashboardDataService.getBids(),
      this.dashboardDataService.getCallLogs()
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([users, vehicles, verifications, orders, deals, commissions, locations, bids, callLogs]) => {
          this.users = users;
          this.vehicles = vehicles;
          this.verifications = verifications;
          this.orders = orders;
          this.deals = deals;
          this.commissions = commissions;
          this.driverLocations = locations;
          this.bids = bids;
          this.callLogs = callLogs;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error fetching dashboard data:', err);
          this.error = 'Failed to sync platform data engine.';
          this.loading = false;
        }
      });
  }

  private subscribeToCrossTabSync(): void {
    this.crossTabSyncService.events$.pipe(takeUntil(this.destroy$)).subscribe((evt: CrossTabEvent) => {
      let msg = '';
      if (evt.type === 'DRIVER_UPDATED') {
        msg = `⚡ Cross-Tab Alert: Driver #${evt.payload.driverId} details were updated in another tab!`;
      } else if (evt.type === 'NOTIFICATION_SENT') {
        msg = `🔔 Cross-Tab Alert: Notification "${evt.payload.title}" sent to driver #${evt.payload.driverId}`;
      } else if (evt.type === 'VEHICLE_APPROVED') {
        msg = `🚛 Cross-Tab Alert: Fleet asset #${evt.payload.vehicleId} approval status changed.`;
      }

      if (msg) {
        this.showToast(msg);
      }
    });
  }

  showToast(message: string): void {
    this.liveToastMessage = message;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.liveToastMessage = null;
    }, 4500);
  }

  setTab(tab: DashboardTab): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab },
      queryParamsHandling: 'merge'
    });
  }

  onSelectUserForNotification(user: ShnellUser): void {
    this.selectedUserForNotification = user;
    this.activeTab = 'notifications';
  }

  onInspectDriver(driverId: string): void {
    this.selectedDriverIdForInspection = driverId;
    this.activeTab = 'driver-profile';
  }

  get pendingVehiclesCount(): number {
    return this.vehicles.filter(v => !v.isAdminApproved).length;
  }

  get activeDriversCount(): number {
    return this.driverLocations.filter(l => l.isOnline).length;
  }
}
