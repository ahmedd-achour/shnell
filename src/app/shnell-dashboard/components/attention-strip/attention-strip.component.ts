import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ShnellUser, Vehicle } from '../../models/dashboard.models';
import { AdminHubService } from '../../services/admin-hub.service';
import { LedgerRow, totalsByCurrency } from '../../services/hub-format';
import { walletBalances } from '../../services/wallet';

/**
 * Overview's first row: what needs an admin now, each tile one click from
 * the screen that clears it, plus today's money in.
 */
@Component({
  selector: 'app-attention-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="hub-kpis">
    <div class="hub-kpi hub-kpi--click" [class.hub-kpi--alert]="alerts" (click)="navigateTab.emit('alerts')" role="button" tabindex="0" (keydown.enter)="navigateTab.emit('alerts')">
      <div class="hub-kpi__label"><i class="bi bi-bell-fill" [class.text-danger]="critical"></i> Open alerts</div>
      <div class="hub-kpi__value">{{ alerts }}</div>
      <div class="hub-kpi__sub">{{ critical ? critical + ' critical' : 'nothing critical' }}</div>
    </div>
    <div class="hub-kpi hub-kpi--click" [class.hub-kpi--alert]="recharges" (click)="navigateTab.emit('finance')" role="button" tabindex="0" (keydown.enter)="navigateTab.emit('finance')">
      <div class="hub-kpi__label"><i class="bi bi-shield-lock"></i> Recharges to approve</div>
      <div class="hub-kpi__value">{{ recharges }}</div>
      <div class="hub-kpi__sub">waiting for a second admin</div>
    </div>
    <div class="hub-kpi hub-kpi--click" [class.hub-kpi--alert]="pendingVehicles" (click)="navigateTab.emit('vehicles')" role="button" tabindex="0" (keydown.enter)="navigateTab.emit('vehicles')">
      <div class="hub-kpi__label"><i class="bi bi-truck"></i> Vehicles to review</div>
      <div class="hub-kpi__value">{{ pendingVehicles }}</div>
      <div class="hub-kpi__sub">not yet approved</div>
    </div>
    <div class="hub-kpi hub-kpi--click" [class.hub-kpi--alert]="toVerify" (click)="navigateTab.emit('verifications')" role="button" tabindex="0" (keydown.enter)="navigateTab.emit('verifications')">
      <div class="hub-kpi__label"><i class="bi bi-person-vcard"></i> Drivers to verify</div>
      <div class="hub-kpi__value">{{ toVerify }}</div>
      <div class="hub-kpi__sub">documents submitted</div>
    </div>
    <div class="hub-kpi hub-kpi--click" [class.hub-kpi--alert]="paused" (click)="navigateTab.emit('finance')" role="button" tabindex="0" (keydown.enter)="navigateTab.emit('finance')">
      <div class="hub-kpi__label"><i class="bi bi-pause-circle"></i> Drivers paused</div>
      <div class="hub-kpi__value">{{ paused }}</div>
      <div class="hub-kpi__sub">balance under the pause line</div>
    </div>
    <div class="hub-kpi hub-kpi--click" (click)="navigateTab.emit('finance')" role="button" tabindex="0" (keydown.enter)="navigateTab.emit('finance')">
      <div class="hub-kpi__label"><i class="bi bi-cash-coin text-success"></i> Recharged today</div>
      <div class="hub-kpi__value fs-5">{{ todayRecharges || '0.00' }}</div>
      <div class="hub-kpi__sub">{{ todayCommissions ? 'commissions ' + todayCommissions : 'no commission yet today' }}</div>
    </div>
  </div>`,
  styleUrls: ['../../hub.css'],
})
export class AttentionStripComponent implements OnInit, OnChanges, OnDestroy {
  @Input() users: ShnellUser[] = [];
  @Input() vehicles: Vehicle[] = [];
  @Input() verifications: any[] = [];
  @Output() navigateTab = new EventEmitter<string>();

  alerts = 0;
  critical = 0;
  recharges = 0;
  todayRecharges = '';
  todayCommissions = '';
  private config: any = null;
  private destroy$ = new Subject<void>();

  constructor(private hub: AdminHubService) {}

  ngOnInit(): void {
    this.hub.openAlerts$.pipe(takeUntil(this.destroy$)).subscribe(a => {
      this.alerts = a.length;
      this.critical = a.filter(x => x.severity === 'critical').length;
    });
    this.hub.pendingRecharges$.pipe(takeUntil(this.destroy$)).subscribe(p => this.recharges = p.length);
    this.hub.config$.pipe(takeUntil(this.destroy$)).subscribe(c => { this.config = c; this.recount(); });
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    this.hub.ledger$(midnight.getTime(), 1000).pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.todayRecharges = fmt(rows.filter(r => r.kind === 'recharge'));
      this.todayCommissions = fmt(rows.filter(r => r.kind === 'commission'), true);
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  pendingVehicles = 0;
  toVerify = 0;
  paused = 0;

  ngOnChanges(): void { this.recount(); }

  private recount(): void {
    this.pendingVehicles = this.vehicles.filter(v => !v.isAdminApproved).length;
    // Same rule as the Driver Verifications tab: pending = not verified yet.
    this.toVerify = this.verifications.filter(v => v.isVerified !== true).length;
    let n = 0;
    for (const u of this.users) {
      if (u.role !== 'driver') continue;
      if (walletBalances(u as any).some(b => b.amount < this.floorIn(b.currency))) n++;
    }
    this.paused = n;
  }

  private floorIn(cur: string): number {
    const own = this.config?.balance_block_thresholds?.[cur];
    if (typeof own === 'number') return own;
    if (cur === 'TND') return typeof this.config?.balance_block_threshold === 'number' ? this.config.balance_block_threshold : -20;
    return 0;
  }
}

function fmt(rows: LedgerRow[], abs = false): string {
  return totalsByCurrency(rows).map(t => `${(abs ? Math.abs(t.total) : t.total).toFixed(2)} ${t.currency}`).join(' · ');
}
