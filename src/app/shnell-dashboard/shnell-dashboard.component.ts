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
import { AccountTabComponent } from './components/account-tab/account-tab.component';
import { FinanceTabComponent } from './components/finance-tab/finance-tab.component';
import { ActivityTabComponent } from './components/activity-tab/activity-tab.component';
import { AlertsTabComponent } from './components/alerts-tab/alerts-tab.component';
import { AdminHubService } from './services/admin-hub.service';
import { AttentionStripComponent } from './components/attention-strip/attention-strip.component';
import { SettingsTabComponent } from './components/settings-tab/settings-tab.component';
import { DispatchOrderTabComponent } from './components/dispatch-order-tab/dispatch-order-tab.component';
import { DispatchCenterTabComponent } from './components/dispatch-center-tab/dispatch-center-tab.component';
import { AssistantTabComponent } from './components/assistant-tab/assistant-tab.component';

import { VerificationsTabComponent } from './components/verifications-tab/verifications-tab.component';

export type DashboardTab = 'overview' | 'users' | 'vehicles' | 'verifications' | 'deals' | 'live-map' | 'account' | 'settings' | 'notifications' | 'dispatch-order' | 'dispatch-center' | 'finance' | 'activity' | 'alerts' | 'assistant';

const TABS: DashboardTab[] = ['overview', 'users', 'vehicles', 'verifications', 'deals', 'live-map', 'account', 'settings',
  'notifications', 'dispatch-order', 'dispatch-center', 'finance', 'activity', 'alerts', 'assistant'];

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
    AccountTabComponent,
    FinanceTabComponent,
    ActivityTabComponent,
    AlertsTabComponent,
    AttentionStripComponent,
    SettingsTabComponent,
    DispatchOrderTabComponent,
    DispatchCenterTabComponent,
    AssistantTabComponent
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
  /** Account open in Account 360 (?tab=account&uid=…). */
  selectedAccountUid: string | null = null;
  openAlertsCount = 0;
  criticalAlertsCount = 0;
  pendingRechargesCount = 0;

  liveToastMessage: string | null = null;
  toastTimeout: any = null;

  private readonly tabMeta: Record<string, { label: string; icon: string }> = {
    'overview':       { label: 'Overview & Analytics',  icon: 'bi-grid-1x2-fill' },
    'users':          { label: 'Users & Drivers',       icon: 'bi-people-fill' },
    'verifications':  { label: 'Driver Verifications',  icon: 'bi-person-vcard' },
    'vehicles':       { label: 'Fleet Applications',    icon: 'bi-truck' },
    'deals':          { label: 'Orders & Deals',        icon: 'bi-receipt' },
    'live-map':       { label: 'Realtime Map',          icon: 'bi-geo-alt-fill' },
    'account':        { label: 'Account 360',           icon: 'bi-person-badge-fill' },
    'finance':        { label: 'Finance & Ledger',      icon: 'bi-bank' },
    'activity':       { label: 'Activity Log',          icon: 'bi-journal-text' },
    'alerts':         { label: 'Alerts',                icon: 'bi-bell-fill' },
    'settings':       { label: 'App Config',            icon: 'bi-gear-wide-connected' },
    'notifications':  { label: 'FCM Notifications',     icon: 'bi-bell-fill' },
    'dispatch-order': { label: 'Assign Order',          icon: 'bi-send-plus-fill' },
    'dispatch-center': { label: 'Dispatch Center',      icon: 'bi-signpost-split-fill' },
    'assistant':      { label: 'AI Assistant',          icon: 'bi-stars' },
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
    private router: Router,
    private hub: AdminHubService
  ) {}

  ngOnInit(): void {
    this.checkQueryParams();
    this.subscribeToDashboardData();
    this.subscribeToCrossTabSync();
    this.hub.openAlerts$.pipe(takeUntil(this.destroy$)).subscribe(a => {
      this.openAlertsCount = a.length;
      this.criticalAlertsCount = a.filter(x => x.severity === 'critical').length;
    });
    this.hub.pendingRecharges$.pipe(takeUntil(this.destroy$)).subscribe(p => this.pendingRechargesCount = p.length);
  }

  private checkQueryParams(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      // 'driver-profile' is the old name of Account 360 (bookmarks keep working).
      const tab = params['tab'] === 'driver-profile' ? 'account' : params['tab'];
      if (tab && TABS.includes(tab)) {
        this.activeTab = tab as DashboardTab;
      }
      const uid = params['uid'] || params['id'];
      if (uid) {
        this.selectedAccountUid = uid;
        if (!tab) this.activeTab = 'account';
      } else if (this.activeTab === 'account') {
        this.selectedAccountUid = null;
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
      queryParams: { tab: tab, uid: null, id: null },
      queryParamsHandling: 'merge'
    });
  }

  onSelectUserForNotification(user: ShnellUser): void {
    this.selectedUserForNotification = user;
    this.activeTab = 'notifications';
  }

  /** Opens Account 360 for any account (driver, customer, partner). */
  openAccount(uid: string): void {
    if (!uid) return;
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: 'account', uid } });
  }

  onInspectDriver(driverId: string): void {
    this.openAccount(driverId);
  }

  get pendingVehiclesCount(): number {
    return this.vehicles.filter(v => !v.isAdminApproved).length;
  }

  get activeDriversCount(): number {
    return this.driverLocations.filter(l => l.isOnline).length;
  }
}
