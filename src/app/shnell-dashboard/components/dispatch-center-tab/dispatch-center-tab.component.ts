import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Orders, DropOffData, ShnellUser, Vehicle, DispatchConfig, GlobalConfig } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { RouteService, RoutePoint } from '../../services/route.service';
import { PricingService, MissionPriceResult } from '../../services/pricing.service';
import { MissionCapacityService, MissionSplit } from '../../services/mission-capacity.service';
import { DealService } from '../../services/deal.service';
import { toastSuccess, toastError } from '../../../shared/swal';

/** Ops screen for spec §16 "Dispatch Center": given an order (mission) a company already
 *  created that has no driver yet, sequence its stops, price the mission from
 *  settings/dispatch, and create a priced Deal when an operator assigns a driver. */
@Component({
  selector: 'app-dispatch-center-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dispatch-center-tab.component.html',
  styleUrls: ['./dispatch-center-tab.component.css']
})
export class DispatchCenterTabComponent implements OnInit, OnDestroy {
  @Input() orders: Orders[] = [];
  @Input() users: ShnellUser[] = [];
  @Input() vehicles: Vehicle[] = [];

  searchQuery = '';
  selectedOrderId: string | null = null;
  selectedDriverId = '';

  loadingOrder = false;
  submitting = false;

  orderStops: DropOffData[] = [];
  optimizedStopIds: string[] = [];
  totalDistanceKm = 0;
  capacitySplit: MissionSplit[] = [];
  price: MissionPriceResult | null = null;
  commissionPercentage = 0;
  commissionAmount = 0;
  companyPlanLabel = '';

  private dispatchConfig: DispatchConfig | null = null;
  private globalConfig: GlobalConfig | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private dashboardDataService: DashboardDataService,
    private routeService: RouteService,
    private pricingService: PricingService,
    private missionCapacityService: MissionCapacityService,
    private dealService: DealService
  ) {}

  ngOnInit(): void {
    this.dashboardDataService.getDispatchConfigDoc()
      .pipe(takeUntil(this.destroy$))
      .subscribe(cfg => this.dispatchConfig = cfg);
    this.dashboardDataService.getGlobalConfigDoc()
      .pipe(takeUntil(this.destroy$))
      .subscribe(cfg => this.globalConfig = cfg);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get pendingOrders(): Orders[] {
    const q = this.searchQuery.toLowerCase().trim();
    return this.orders
      .filter(o => o.isAccepted !== true)
      .filter(o => !q || o.id?.toLowerCase().includes(q) || o.namePickUp?.toLowerCase().includes(q))
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
  }

  get driverUsers(): ShnellUser[] {
    return this.users.filter(u => u.role === 'driver');
  }

  parcelCountFor(stop: DropOffData): number {
    return (stop as any).quantity || 1;
  }

  stopNameFor(stopId: string): string {
    const stop = this.orderStops.find((s: any) => s.id === stopId);
    return (stop as any)?.destinationName || (stop as any)?.name || stopId;
  }

  async selectOrder(order: Orders): Promise<void> {
    if (!order.id) return;
    this.selectedOrderId = order.id;
    this.selectedDriverId = '';
    this.orderStops = [];
    this.optimizedStopIds = [];
    this.price = null;
    this.capacitySplit = [];
    this.loadingOrder = true;

    try {
      const [stops, company] = await Promise.all([
        this.dashboardDataService.getStopsByIds(order.stops || []),
        this.dashboardDataService.getCompanyDoc(order.clientId || '')
      ]);
      this.orderStops = stops;

      const pickup = { lat: order.pickUpLocation?.coordinates?.[1] ?? 0, lng: order.pickUpLocation?.coordinates?.[0] ?? 0 };
      const routePoints: RoutePoint[] = stops
        .map((s: any, i: number) => ({
          id: s.id,
          lat: s.destination?.latitude,
          lng: s.destination?.longitude
        }))
        .filter((p: RoutePoint) => typeof p.lat === 'number' && typeof p.lng === 'number');

      const optimized = this.routeService.optimize(pickup, routePoints);
      this.optimizedStopIds = optimized.orderedStopIds;
      this.totalDistanceKm = optimized.totalDistanceKm;

      const config = this.dispatchConfig;
      if (config) {
        this.capacitySplit = this.missionCapacityService.split(
          stops.map(s => ({ id: s.id!, parcelCount: this.parcelCountFor(s) })),
          config
        );

        const parcelCount = stops.reduce((sum, s) => sum + this.parcelCountFor(s), 0);
        this.price = this.pricingService.computeMissionPrice(
          { distanceKm: this.totalDistanceKm, stopCount: stops.length, parcelCount },
          config
        );
      }

      // commissionRate on the company doc is a plain percent (e.g. 10, or 0 for PRO) and
      // always wins when set; otherwise fall back to plan default / the global fraction.
      const plan = company?.plan === 'pro' ? 'pro' : 'payg';
      this.companyPlanLabel = plan.toUpperCase();
      const hasOverride = company?.commissionRate !== undefined && company?.commissionRate !== null;
      this.commissionPercentage = hasOverride
        ? Number(company.commissionRate)
        : plan === 'pro'
          ? 0
          : Number((this.globalConfig as any)?.commission_percentage ?? 0.1) * 100;

      if (this.price) {
        const c = this.pricingService.computeCommission(this.price.agreedPrice, this.commissionPercentage);
        this.commissionAmount = c.commissionAmount;
      }
    } catch (err) {
      console.error('Failed to load order for dispatch:', err);
      toastError('Failed to load order details');
    } finally {
      this.loadingOrder = false;
    }
  }

  get selectedOrder(): Orders | undefined {
    return this.orders.find(o => o.id === this.selectedOrderId);
  }

  async confirmDispatch(): Promise<void> {
    const order = this.selectedOrder;
    if (!order?.id || !this.selectedDriverId || !this.price) return;

    this.submitting = true;
    try {
      await this.dashboardDataService.applyRouteSequence(order.id, this.optimizedStopIds);
      await this.dealService.createDeal({
        orderId: order.id,
        driverId: this.selectedDriverId,
        userId: order.clientId || '',
        price: this.price,
        commissionPercentage: this.commissionPercentage,
        commissionAmount: this.commissionAmount
      });
      order.isAccepted = true;
      toastSuccess('Mission dispatched — deal created');
      this.selectedOrderId = null;
    } catch (err) {
      console.error('Dispatch failed:', err);
      toastError('Failed to dispatch mission');
    } finally {
      this.submitting = false;
    }
  }

  cancelSelection(): void {
    this.selectedOrderId = null;
  }
}
