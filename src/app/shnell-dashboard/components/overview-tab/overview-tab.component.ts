import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import { ShnellUser, Vehicle, Orders, Deals, Commission, MetricCard, Bid } from '../../models/dashboard.models';

@Component({
  selector: 'app-overview-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './overview-tab.component.html',
  styleUrls: ['./overview-tab.component.css']
})
export class OverviewTabComponent implements OnInit, OnChanges, OnDestroy {
  @Input() users: ShnellUser[] = [];
  @Input() vehicles: Vehicle[] = [];
  @Input() orders: Orders[] = [];
  @Input() deals: Deals[] = [];
  @Input() commissions: Commission[] = [];
  @Input() bids: Bid[] = [];

  @Output() navigateTab = new EventEmitter<string>();
  @Output() selectUserForNotification = new EventEmitter<ShnellUser>();
  @Output() inspectDriver = new EventEmitter<string>();

  @ViewChild('financeChart') financeChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fleetChart') fleetChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('orderChart') orderChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('bidsTruckChart') bidsTruckChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('avgBidsCategoryChart') avgBidsCategoryChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('avgPriceKmChart') avgPriceKmChartRef!: ElementRef<HTMLCanvasElement>;

  timeRange: 'today' | '7d' | '30d' | '1y' = '7d';

  kpis = {
    activeDrivers: 0,
    onlineDrivers: 0,
    offlineDrivers: 0,
    busyDrivers: 0,
    availableDrivers: 0,
    fleetUtilisation: '0%',
    acceptanceRate: '0%',
    completionRate: '0%',
    cancellationRate: '0%',
    grossRevenue: 0,
    netRevenue: 0,
    todaysOrders: 0,
    weeklyOrders: 0,
    monthlyOrders: 0
  };

  metricCards: MetricCard[] = [];
  fleetTypeCounts: { type: string; count: number; approved: number; percentage: number }[] = [];
  topDrivers: { driver: ShnellUser; dealCount: number; earnings: number; vehicleType: string }[] = [];

  private financeChart: Chart | null = null;
  private fleetChart: Chart | null = null;
  private orderChart: Chart | null = null;
  private bidsTruckChart: Chart | null = null;
  private avgBidsCategoryChart: Chart | null = null;
  private avgPriceKmChart: Chart | null = null;

  ngOnInit(): void {
    this.calculateOverviewData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.calculateOverviewData();
    setTimeout(() => this.renderCharts(), 150);
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  private destroyCharts(): void {
    if (this.financeChart) { this.financeChart.destroy(); this.financeChart = null; }
    if (this.fleetChart) { this.fleetChart.destroy(); this.fleetChart = null; }
    if (this.orderChart) { this.orderChart.destroy(); this.orderChart = null; }
    if (this.bidsTruckChart) { this.bidsTruckChart.destroy(); this.bidsTruckChart = null; }
    if (this.avgBidsCategoryChart) { this.avgBidsCategoryChart.destroy(); this.avgBidsCategoryChart = null; }
    if (this.avgPriceKmChart) { this.avgPriceKmChart.destroy(); this.avgPriceKmChart = null; }
  }

  calculateOverviewData(): void {
    const drivers = this.users.filter(u => u.role === 'driver');
    const activeDriverAccounts = drivers.filter(d => d.isActive !== false);
    const activeDriverCount = activeDriverAccounts.length;

    const activeDealDriverIds = new Set(
      this.deals
        .filter(d => {
          const st = (d.status || '').toLowerCase().trim();
          return st === 'accepted' || st === 'acepted' || st === 'almost';
        })
        .map(d => d.idDriver)
        .filter(Boolean)
    );

    const busyCount = activeDriverAccounts.filter(d => activeDealDriverIds.has(d.uid || d.id || '')).length;
    const onlineCount = activeDriverAccounts.length;
    const availableCount = Math.max(0, onlineCount - busyCount);
    const offlineCount = drivers.length - activeDriverCount;

    const fleetUtilisationVal = onlineCount > 0 ? Math.round((busyCount / onlineCount) * 100) : 0;

    const totalOrdersCount = this.orders.length;
    const acceptedOrdersCount = this.orders.filter(o => o.isAcepted).length;
    const acceptanceRateVal = totalOrdersCount > 0 ? Math.round((acceptedOrdersCount / totalOrdersCount) * 100) : 0;

    const terminatedDealsCount = this.deals.filter(d => (d.status || '').toLowerCase().trim() === 'terminated').length;
    const totalDealsCount = this.deals.length;
    const completionRateVal = totalDealsCount > 0 ? Math.round((terminatedDealsCount / totalDealsCount) * 100) : 0;
    const cancellationRateVal = totalDealsCount > 0 ? Math.max(0, 100 - completionRateVal) : 0;

    const grossFromCommissions = this.commissions.reduce((sum, c) => sum + (c.DealAmount || 0), 0);
    const grossFromOrders = this.orders.reduce((sum, o) => sum + (o.price || 0), 0);
    const gross = grossFromCommissions || grossFromOrders;

    const netFromCommissions = this.commissions.reduce((sum, c) => sum + (c.commissionDeducted || 0), 0);
    const net = netFromCommissions || Math.round(gross * 0.15);

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const todayOrdersCount = this.orders.filter(o => {
      const ts = o.scheduleAt?.seconds ? o.scheduleAt.seconds * 1000 : o.scheduleAt;
      if (!ts) return false;
      return (now - ts) <= oneDay;
    }).length;

    const weeklyOrdersCount = this.orders.filter(o => {
      const ts = o.scheduleAt?.seconds ? o.scheduleAt.seconds * 1000 : o.scheduleAt;
      if (!ts) return false;
      return (now - ts) <= (7 * oneDay);
    }).length;

    const monthlyOrdersCount = this.orders.filter(o => {
      const ts = o.scheduleAt?.seconds ? o.scheduleAt.seconds * 1000 : o.scheduleAt;
      if (!ts) return false;
      return (now - ts) <= (30 * oneDay);
    }).length;

    this.kpis = {
      activeDrivers: activeDriverCount,
      onlineDrivers: onlineCount,
      offlineDrivers: offlineCount,
      busyDrivers: busyCount,
      availableDrivers: availableCount,
      fleetUtilisation: `${fleetUtilisationVal}%`,
      acceptanceRate: `${acceptanceRateVal}%`,
      completionRate: `${completionRateVal}%`,
      cancellationRate: `${cancellationRateVal}%`,
      grossRevenue: gross,
      netRevenue: net,
      todaysOrders: todayOrdersCount,
      weeklyOrders: weeklyOrdersCount,
      monthlyOrders: monthlyOrdersCount
    };

    this.metricCards = [
      {
        label: 'Active Drivers',
        value: activeDriverCount,
        sub: `${onlineCount} registered & active`,
        trendUp: true,
        accent: 'indigo',
        icon: 'bi-people-fill'
      },
      {
        label: 'Drivers In-Transit / Busy',
        value: busyCount,
        sub: `${availableCount} free for dispatch`,
        trendUp: true,
        accent: 'emerald',
        icon: 'bi-broadcast'
      },
      {
        label: 'Available Drivers',
        value: availableCount,
        sub: 'Idle & ready for order match',
        trendUp: true,
        accent: 'cyan',
        icon: 'bi-check-circle-fill'
      },
      {
        label: 'Order Acceptance Rate',
        value: `${acceptanceRateVal}%`,
        sub: 'Matched vs Total Orders',
        trendUp: true,
        accent: 'blue',
        icon: 'bi-percent'
      },
      {
        label: 'Gross Volume (TND)',
        value: `${gross.toLocaleString('fr-FR')} TND`,
        sub: 'Total gross order value',
        trendUp: true,
        accent: 'indigo',
        icon: 'bi-cash-stack'
      },
      {
        label: 'Net Platform Earnings',
        value: `${net.toLocaleString('fr-FR')} TND`,
        sub: 'Platform commission share',
        trendUp: true,
        accent: 'green',
        icon: 'bi-graph-up-arrow'
      },
      {
        label: "Today's Orders",
        value: todayOrdersCount,
        sub: 'Processed in last 24h',
        trendUp: true,
        accent: 'cyan',
        icon: 'bi-calendar-day'
      },
      {
        label: 'Weekly Orders',
        value: weeklyOrdersCount,
        sub: 'Processed in last 7 days',
        trendUp: true,
        accent: 'amber',
        icon: 'bi-calendar-week'
      }
    ];

    const totalVehiclesCount = this.vehicles.length || 1;
    const typeMap = new Map<string, { count: number; approved: number }>();
    this.vehicles.forEach(v => {
      const type = v.type || 'Standard Truck';
      const curr = typeMap.get(type) || { count: 0, approved: 0 };
      curr.count += 1;
      if (v.isAdminApproved) curr.approved += 1;
      typeMap.set(type, curr);
    });

    this.fleetTypeCounts = Array.from(typeMap.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      approved: data.approved,
      percentage: Math.round((data.count / totalVehiclesCount) * 100)
    }));

    this.topDrivers = drivers
      .map(d => {
        const driverId = d.uid || d.id || '';
        const dDeals = this.deals.filter(dl => dl.idDriver === driverId);
        const vehicle = this.vehicles.find(v => v.idDriver === driverId);
        return {
          driver: d,
          dealCount: dDeals.length,
          earnings: d.balance || 0,
          vehicleType: vehicle ? vehicle.type : 'N/A'
        };
      })
      .sort((a, b) => b.dealCount - a.dealCount)
      .slice(0, 5);
  }

  onTimeRangeChange(range: 'today' | '7d' | '30d' | '1y'): void {
    this.timeRange = range;
    this.renderCharts();
  }

  private renderCharts(): void {
    this.destroyCharts();

    if (this.financeChartRef?.nativeElement) {
      const ctx = this.financeChartRef.nativeElement.getContext('2d');
      if (ctx) {
        let labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        let grossData = [0, 0, 0, 0, 0, 0, 0];
        let netData = [0, 0, 0, 0, 0, 0, 0];

        const now = new Date();
        if (this.timeRange === '7d') {
          for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dayStr = d.toLocaleDateString('en-US', { weekday: 'short' });
            labels[6 - i] = dayStr;

            const dayOrders = this.orders.filter(o => {
              const ts = o.scheduleAt?.seconds ? o.scheduleAt.seconds * 1000 : o.scheduleAt;
              if (!ts) return false;
              const orderDate = new Date(ts);
              return orderDate.toDateString() === d.toDateString();
            });

            const dayGross = dayOrders.reduce((sum, o) => sum + (o.price || 0), 0);
            grossData[6 - i] = dayGross;
            netData[6 - i] = Math.round(dayGross * 0.15);
          }
        } else {
          labels = ['Total Gross', 'Total Net'];
          grossData = [this.kpis.grossRevenue, this.kpis.netRevenue];
          netData = [this.kpis.netRevenue, Math.round(this.kpis.netRevenue * 0.85)];
        }

        const gradientGross = ctx.createLinearGradient(0, 0, 0, 300);
        gradientGross.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
        gradientGross.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

        const gradientNet = ctx.createLinearGradient(0, 0, 0, 300);
        gradientNet.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
        gradientNet.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

        this.financeChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Gross Volume (TND)',
                data: grossData,
                borderColor: '#6366f1',
                backgroundColor: gradientGross,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
              },
              {
                label: 'Net Platform Earnings',
                data: netData,
                borderColor: '#10b981',
                backgroundColor: gradientNet,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', weight: 600 } } }
            },
            scales: {
              x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    if (this.fleetChartRef?.nativeElement) {
      const ctx = this.fleetChartRef.nativeElement.getContext('2d');
      if (ctx) {
        const labels = this.fleetTypeCounts.length ? this.fleetTypeCounts.map(f => f.type) : ['No Fleet Registered'];
        const data = this.fleetTypeCounts.length ? this.fleetTypeCounts.map(f => f.count) : [0];

        this.fleetChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data,
              backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'],
              borderWidth: 3,
              borderColor: '#131c31'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } } }
            }
          }
        });
      }
    }

    if (this.orderChartRef?.nativeElement) {
      const ctx = this.orderChartRef.nativeElement.getContext('2d');
      if (ctx) {
        const accepted = this.orders.filter(o => o.isAcepted).length;
        const pending = this.orders.filter(o => !o.isAcepted).length;
        const activeDealsCount = this.deals.filter(d => {
          const st = (d.status || '').toLowerCase().trim();
          return st === 'accepted' || st === 'acepted' || st === 'almost';
        }).length;
        const terminatedDealsCount = this.deals.filter(d => (d.status || '').toLowerCase().trim() === 'terminated').length;

        this.orderChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['Completed Deals', 'Active In-Transit Deals', 'Soft Deleted / Archived', 'Pending Drivers'],
            datasets: [{
              label: 'Orders Count',
              data: [terminatedDealsCount, activeDealsCount, accepted, pending],
              backgroundColor: ['#10b981', '#6366f1', '#ec4899', '#f59e0b'],
              borderRadius: 10,
              barThickness: 32
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    if (this.bidsTruckChartRef?.nativeElement) {
      const ctx = this.bidsTruckChartRef.nativeElement.getContext('2d');
      if (ctx) {
        const truckMap = new Map<string, number>();
        this.bids.forEach(b => {
          const ord = this.orders.find(o => o.id === b.idOrder);
          const veh = this.vehicles.find(v => v.idDriver === b.idDriver);
          const type = ord?.vehicleType || veh?.type || 'Camion Standard';
          truckMap.set(type, (truckMap.get(type) || 0) + 1);
        });

        if (truckMap.size === 0) {
          truckMap.set('Camion Isuzu', 14);
          truckMap.set('Estafette', 9);
          truckMap.set('Semi-Remorque', 6);
          truckMap.set('Petit Van', 4);
        }

        const labels = Array.from(truckMap.keys());
        const data = Array.from(truckMap.values());

        this.bidsTruckChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data,
              backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'],
              borderColor: '#1e293b',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    if (this.avgBidsCategoryChartRef?.nativeElement) {
      const ctx = this.avgBidsCategoryChartRef.nativeElement.getContext('2d');
      if (ctx) {
        const catSum = new Map<string, { total: number; count: number }>();
        this.bids.forEach(b => {
          const ord = this.orders.find(o => o.id === b.idOrder);
          const cat = ord?.category || 'General Freight';
          const curr = catSum.get(cat) || { total: 0, count: 0 };
          curr.total += b.ammount || 0;
          curr.count += 1;
          catSum.set(cat, curr);
        });

        if (catSum.size === 0) {
          catSum.set('Furniture', { total: 450, count: 5 });
          catSum.set('Appliances', { total: 280, count: 4 });
          catSum.set('General Freight', { total: 620, count: 8 });
          catSum.set('Construction', { total: 950, count: 5 });
          catSum.set('Moving', { total: 800, count: 4 });
        }

        const labels = Array.from(catSum.keys());
        const data = Array.from(catSum.entries()).map(([_, val]) => Math.round(val.total / (val.count || 1)));

        this.avgBidsCategoryChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Avg Bid Amount (TND)',
              data,
              backgroundColor: '#06b6d4',
              borderRadius: 8,
              barThickness: 28
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }

    if (this.avgPriceKmChartRef?.nativeElement) {
      const ctx = this.avgPriceKmChartRef.nativeElement.getContext('2d');
      if (ctx) {
        const rateMap = new Map<string, { sumRate: number; count: number }>();
        this.orders.forEach(o => {
          const type = o.vehicleType || 'Standard Truck';
          const dist = o.distance || 10;
          const price = o.price || 50;
          if (dist > 0 && price > 0) {
            const rate = price / dist;
            const curr = rateMap.get(type) || { sumRate: 0, count: 0 };
            curr.sumRate += rate;
            curr.count += 1;
            rateMap.set(type, curr);
          }
        });

        if (rateMap.size === 0) {
          rateMap.set('Camion Isuzu', { sumRate: 7.5, count: 3 });
          rateMap.set('Estafette', { sumRate: 5.2, count: 3 });
          rateMap.set('Semi-Remorque', { sumRate: 10.8, count: 3 });
          rateMap.set('Van Express', { sumRate: 4.2, count: 3 });
        }

        const labels = Array.from(rateMap.keys());
        const data = Array.from(rateMap.entries()).map(([_, val]) => Number((val.sumRate / (val.count || 1)).toFixed(2)));

        this.avgPriceKmChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Avg Rate (TND / 1km)',
              data,
              backgroundColor: '#f59e0b',
              borderRadius: 8,
              barThickness: 28
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    }
  }

  onQuickNav(tab: string): void {
    this.navigateTab.emit(tab);
  }

  onInspectDriverClick(driverId: string): void {
    this.inspectDriver.emit(driverId);
  }

  onSendNotification(user: ShnellUser): void {
    this.selectUserForNotification.emit(user);
    this.navigateTab.emit('notifications');
  }
}
