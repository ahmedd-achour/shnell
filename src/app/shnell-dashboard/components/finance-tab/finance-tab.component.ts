import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ShnellUser } from '../../models/dashboard.models';
import { AdminHubService } from '../../services/admin-hub.service';
import { DashboardDataService } from '../../services/dashboard-data.service';
import {
  LedgerRow, downloadCsv, ledgerMeta, toMillis, totalsByCurrency, short,
} from '../../services/hub-format';
import { walletBalances } from '../../services/wallet';
import { WalletMovementComponent } from '../wallet-movement/wallet-movement.component';
import { confirmAction, toastError, toastSuccess } from '../../../shared/swal';

type Range = 'today' | '7d' | '30d' | '90d';
const RANGE_DAYS: Record<Range, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };

/**
 * Finance & ledger: every wallet movement (trip commissions, office
 * recharges, adjustments, partner tours) from commissions/*, the recharges
 * waiting for a second admin, the daily cash-count reports, and the form to
 * record a new movement (adminAdjustBalance: receipt + idempotency + audit).
 */
@Component({
  selector: 'app-finance-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, WalletMovementComponent],
  templateUrl: './finance-tab.component.html',
  styleUrls: ['../../hub.css'],
})
export class FinanceTabComponent implements OnInit, OnDestroy {
  @Input() users: ShnellUser[] = [];
  @Output() openAccount = new EventEmitter<string>();

  private destroy$ = new Subject<void>();
  private range$ = new BehaviorSubject<Range>('7d');

  range: Range = '7d';
  loading = true;
  rows: LedgerRow[] = [];
  pending: any[] = [];
  reports: any[] = [];
  config: any = null;
  deciding: string | null = null;

  kindFilter = 'all';
  currencyFilter = 'all';
  search = '';
  pageSize = 100;

  showForm = false;
  formUser: ShnellUser | null = null;

  readonly ledgerMeta = ledgerMeta;
  readonly short = short;
  readonly toMillis = toMillis;

  constructor(public hub: AdminHubService, private data: DashboardDataService) {}

  ngOnInit(): void {
    this.range$.pipe(
      switchMap(r => {
        this.loading = true;
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return this.hub.ledger$(d.getTime() - RANGE_DAYS[r] * 86400000, 2000);
      }),
      takeUntil(this.destroy$),
    ).subscribe(rows => { this.rows = rows; this.loading = false; });
    this.hub.pendingRecharges$.pipe(takeUntil(this.destroy$)).subscribe(p => this.pending = p);
    this.hub.rechargeReports$().pipe(takeUntil(this.destroy$)).subscribe(r => this.reports = r);
    this.hub.config$.pipe(takeUntil(this.destroy$)).subscribe(c => this.config = c);
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  setRange(r: Range): void { this.range = r; this.pageSize = 100; this.range$.next(r); }

  /* ---------- lookups ---------- */

  private byId = new Map<string, ShnellUser>();
  private usersRef: ShnellUser[] | null = null;
  user(uid: string | null): ShnellUser | undefined {
    if (this.usersRef !== this.users) {
      this.usersRef = this.users;
      this.byId = new Map(this.users.map(u => [String(u.uid || u.id), u]));
    }
    return uid ? this.byId.get(uid) : undefined;
  }
  name = (uid: string | null): string => {
    if (!uid) return '—';
    if (uid === 'system') return 'System';
    return this.user(uid)?.name || short(uid);
  };

  /* ---------- KPIs ---------- */

  get currencies(): string[] {
    return [...new Set(this.rows.map(r => r.currencyCode))].sort();
  }

  totals(kind: string, sign: 1 | -1 | 0 = 0) {
    return totalsByCurrency(this.rows.filter(r => r.kind === kind && (sign === 0 || Math.sign(r.delta) === sign)));
  }

  fmtTotals(list: { currency: string; total: number }[], abs = false): string {
    if (!list.length) return '0.00';
    return list.map(t => `${(abs ? Math.abs(t.total) : t.total).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t.currency}`).join(' · ');
  }

  count(kind: string): number { return this.rows.filter(r => r.kind === kind).length; }

  /** Accounts whose balance in a currency is under that currency's pause line. */
  get pausedAccounts(): { user: ShnellUser; currency: string; amount: number; floor: number }[] {
    const out: { user: ShnellUser; currency: string; amount: number; floor: number }[] = [];
    for (const u of this.users) {
      if (u.role !== 'driver') continue;
      for (const b of walletBalances(u as any)) {
        const floor = this.floorIn(b.currency);
        if (b.amount < floor) out.push({ user: u, currency: b.currency, amount: b.amount, floor });
      }
    }
    return out.sort((a, b) => a.amount - b.amount);
  }

  floorIn(cur: string): number {
    const own = this.config?.balance_block_thresholds?.[cur];
    if (typeof own === 'number') return own;
    if (cur === 'TND') return typeof this.config?.balance_block_threshold === 'number' ? this.config.balance_block_threshold : -20;
    return 0;
  }

  /* ---------- ledger table ---------- */

  get filtered(): LedgerRow[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter(r =>
      (this.kindFilter === 'all' || r.kind === this.kindFilter) &&
      (this.currencyFilter === 'all' || r.currencyCode === this.currencyFilter) &&
      (!q || [r.uid, this.name(r.uid), r.reference, r.orderId, r.requestId, this.name(r.adminUid), r.reason]
        .some(v => (v || '').toLowerCase().includes(q))));
  }

  get visible(): LedgerRow[] { return this.filtered.slice(0, this.pageSize); }

  kindCount(kind: string): number { return kind === 'all' ? this.rows.length : this.count(kind); }

  exportCsv(): void {
    const rows = this.filtered;
    downloadCsv(`shnell-ledger-${this.range}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['time', 'account_uid', 'account_name', 'kind', 'delta', 'currency', 'balance_before', 'balance_after',
        'reference', 'order_id', 'request_id', 'recorded_by', 'approved_by', 'reason', 'ledger_id'],
      rows.map(r => [new Date(r.time).toISOString(), r.uid, this.name(r.uid), r.kind, r.delta, r.currencyCode,
        r.balanceBefore, r.balanceAfter, r.reference, r.orderId, r.requestId,
        r.adminUid ? this.name(r.adminUid) : '', r.approvedBy ? this.name(r.approvedBy) : '', r.reason, r.id]));
  }

  /* ---------- approvals ---------- */

  async decide(r: any, approve: boolean): Promise<void> {
    if (this.deciding) return;
    const ok = await confirmAction({
      title: approve ? 'Valider la recharge' : 'Refuser la recharge',
      text: `${r.amount} ${r.currencyCode} — ${this.name(r.userId)} — reçu ${r.reference}`,
      danger: !approve,
      confirmText: approve ? `Valider ${r.amount} ${r.currencyCode}` : 'Refuser',
    });
    if (!ok) return;
    this.deciding = r.id;
    try {
      const res = await this.data.decideRecharge(r.id, approve);
      toastSuccess(res.status === 'approved'
        ? `Validée : nouveau solde ${res.currencyCode} ${(res.newBalance ?? 0).toFixed(2)}`
        : 'Recharge refusée');
    } catch (e: any) {
      toastError(e?.message || 'Échec');
    } finally {
      this.deciding = null;
    }
  }

  reportRows(rep: any): { admin: string; currency: string; total: number; count: number }[] {
    const out: { admin: string; currency: string; total: number; count: number }[] = [];
    for (const [adminUid, byCur] of Object.entries(rep.byAdmin || {})) {
      for (const [currency, t] of Object.entries(byCur as any)) {
        out.push({ admin: this.name(adminUid), currency, total: (t as any).total, count: (t as any).count });
      }
    }
    return out;
  }

  /* ---------- new movement (WalletMovementComponent) ---------- */

  openForm(u?: ShnellUser): void {
    this.formUser = u || null;
    this.showForm = true;
  }

  trackRow = (_: number, r: LedgerRow) => r.id;
}
