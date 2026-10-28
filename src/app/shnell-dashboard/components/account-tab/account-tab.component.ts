import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { ShnellUser } from '../../models/dashboard.models';
import { AdminHubService } from '../../services/admin-hub.service';
import {
  AuditRow, LedgerRow, auditMeta, describeAudit, downloadCsv, ledgerMeta, short, toMillis,
} from '../../services/hub-format';
import { walletBalances } from '../../services/wallet';
import { alertTone, alertType } from '../alerts-tab/alerts-tab.component';
import { WalletMovementComponent } from '../wallet-movement/wallet-movement.component';
import { confirmAction, toastError, toastSuccess } from '../../../shared/swal';

type Section = 'timeline' | 'wallet' | 'trips' | 'admin' | 'devices' | 'inbox' | 'calls' | 'fleet';

interface TimelineItem {
  at: number;
  icon: string;
  tone: string;
  title: string;
  text: string;
  amount?: number;
  currency?: string;
  source: Section;
}

/**
 * Account 360 — everything about one driver, customer or partner on one
 * page: identity and status, wallet per currency with its pause line, and
 * the full history read from the source collections (ledger, admin_audit,
 * deals / orders, alerts, devices, inbox, calls), merged into one timeline.
 * Actions (recharge / debit, ban, verify, tier, password, notify) go
 * through audited Cloud Functions.
 */
@Component({
  selector: 'app-account-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, WalletMovementComponent],
  templateUrl: './account-tab.component.html',
  styleUrls: ['../../hub.css'],
})
export class AccountTabComponent implements OnChanges, OnDestroy {
  @Input() uid: string | null = null;
  @Input() users: ShnellUser[] = [];
  @Output() openAccount = new EventEmitter<string>();
  @Output() notifyUser = new EventEmitter<ShnellUser>();

  private destroy$ = new Subject<void>();
  private subs: Subscription[] = [];

  section: Section = 'timeline';
  pickQuery = '';

  user: any = null;
  wallet: any = null;
  driverFile: any = null;
  ledger: LedgerRow[] = [];
  audit: AuditRow[] = [];
  alerts: any[] = [];
  devices: any[] = [];
  inbox: any[] = [];
  calls: any[] = [];
  vehicles: any[] = [];
  orders: any[] = [];
  dealsAsDriver: any[] = [];
  dealsAsClient: any[] = [];
  config: any = null;

  busy = false;
  menuOpen = false;
  showMovement = false;
  movementDirection: 'credit' | 'debit' = 'credit';
  ledgerCurrency = 'all';

  readonly ledgerMeta = ledgerMeta;
  readonly auditMeta = auditMeta;
  readonly alertType = alertType;
  readonly alertTone = alertTone;
  readonly short = short;
  readonly toMillis = toMillis;

  constructor(public hub: AdminHubService) {
    this.hub.config$.pipe(takeUntil(this.destroy$)).subscribe(c => this.config = c);
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['uid']) this.load();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];
    Object.assign(this, {
      user: null, wallet: null, driverFile: null, ledger: [], audit: [], alerts: [], devices: [], inbox: [],
      calls: [], vehicles: [], orders: [], dealsAsDriver: [], dealsAsClient: [], ledgerCurrency: 'all',
    });
    const uid = this.uid;
    if (!uid) return;
    const h = this.hub;
    this.subs.push(
      h.user$(uid).subscribe(u => this.user = u),
      h.wallet$(uid).subscribe(w => this.wallet = w),
      h.driverFile$(uid).subscribe(d => this.driverFile = d),
      h.userLedger$(uid).subscribe(l => this.ledger = l),
      h.userAudit$(uid).subscribe(a => this.audit = a),
      h.userAlerts$(uid).subscribe(a => this.alerts = a),
      h.devices$(uid).subscribe(d => this.devices = d.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))),
      h.inbox$(uid).subscribe(i => this.inbox = i),
      h.calls$(uid).subscribe(c => this.calls = c.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))),
      h.vehicles$(uid).subscribe(v => this.vehicles = v),
      h.ordersOf$(uid).subscribe(o => this.orders = o.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))),
      h.dealsOf$(uid).subscribe(d => {
        const by = (a: any, b: any) => toMillis(b.timestamp) - toMillis(a.timestamp);
        this.dealsAsDriver = d.asDriver.sort(by);
        this.dealsAsClient = d.asClient.sort(by);
      }),
    );
  }

  /* ---------------------------- identity ---------------------------- */

  name = (uid: string | null): string => {
    if (!uid) return '—';
    if (uid === 'system') return 'System';
    if (uid === this.uid && this.user) return this.user.name || short(uid);
    return this.users.find(u => (u.uid || u.id) === uid)?.name || short(uid);
  };

  get role(): string {
    const r = String(this.user?.role || '').toLowerCase();
    return r === 'customer' || r === 'client' || !r ? 'user' : r;
  }
  get roleLabel(): string {
    return ({ driver: 'Driver', user: 'Customer', company: 'Partner', admin: 'Admin' } as any)[this.role] || this.role;
  }
  get isDriver(): boolean { return this.role === 'driver'; }
  get banned(): boolean { return this.user?.isBanned === true; }
  get verified(): boolean { return this.driverFile?.isVerified === true; }
  get business(): boolean { return this.user?.business === true; }
  get initial(): string { return String(this.user?.name || '?').trim().charAt(0).toUpperCase(); }
  get photo(): string | null { return this.user?.photoUrl || this.user?.profilePic || this.user?.image || null; }
  get createdAt(): number { return toMillis(this.user?.createdAt || this.user?.timestamp); }
  get lastSeen(): number {
    return Math.max(toMillis(this.user?.lastSeen), toMillis(this.user?.lastActive), ...this.devices.map(d => toMillis(d.updatedAt)), 0);
  }

  /** Score given by customers (as a driver) / by drivers (as a customer):
   *  kept apart by the server (onRatingCreated), one account can be both. */
  get driverRating(): { avg: number; count: number } | null {
    const count = Number(this.user?.ratingCount) || 0;
    return count > 0 ? { avg: Number(this.user?.ratingAvg) || 0, count } : null;
  }
  get customerRating(): { avg: number; count: number } | null {
    const count = Number(this.user?.clientRatingCount) || 0;
    return count > 0 ? { avg: Number(this.user?.clientRatingAvg) || 0, count } : null;
  }

  /** Customer cancellation score (functions/lib/cancel_policy.js). */
  get cancelPct(): number | null {
    const s = this.user?.cancelStats;
    return s && s.pct != null ? Number(s.pct) || 0 : null;
  }
  get cancelBlocked(): boolean { return toMillis(this.user?.cancelStats?.blockedUntil) > Date.now(); }

  /** "The load needs more trips" requests (functions/lib/trip_revision.js).
   *  A driver who asks often and is rarely accepted is worth a look. */
  get revisionStats(): { proposed: number; accepted: number; declined: number; canceled: number; acceptPct: number | null; suspicious: boolean } | null {
    const s = this.user?.revisionStats;
    const proposed = Number(s?.proposed) || 0;
    if (!proposed) return null;
    const accepted = Number(s.accepted) || 0;
    const declined = Number(s.declined) || 0;
    const canceled = Number(s.canceled) || 0;
    const answered = accepted + declined + canceled;
    const acceptPct = answered ? Math.round((accepted / answered) * 100) : null;
    const trips = Math.max(1, this.dealsAsDriver.length);
    return { proposed, accepted, declined, canceled, acceptPct, suspicious: proposed >= 3 && proposed / trips > 0.3 && (acceptPct ?? 0) < 50 };
  }

  /** The account as the movement form wants it (balances joined in). */
  get asShnellUser(): ShnellUser {
    return { ...(this.user || {}), uid: this.uid, balances: this.wallet?.balances || {} } as ShnellUser;
  }

  get pickMatches(): ShnellUser[] {
    const q = this.pickQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return this.users.filter(u =>
      [u.name, u.email, u.phone, u.uid, u.id].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 10);
  }

  /* ---------------------------- wallet ---------------------------- */

  get balances() { return walletBalances(this.wallet); }

  floorIn(cur: string): number {
    const own = this.config?.balance_block_thresholds?.[cur];
    if (typeof own === 'number') return own;
    if (cur === 'TND') return typeof this.config?.balance_block_threshold === 'number' ? this.config.balance_block_threshold : -20;
    return 0;
  }

  get ledgerCurrencies(): string[] { return [...new Set(this.ledger.map(l => l.currencyCode))].sort(); }

  get ledgerView(): LedgerRow[] {
    return this.ledger.filter(l => this.ledgerCurrency === 'all' || l.currencyCode === this.ledgerCurrency);
  }

  /** Per-currency totals of the account's whole ledger, split by kind. */
  get walletSummary(): { currency: string; recharged: number; commissions: number; other: number; lines: number }[] {
    const m = new Map<string, { recharged: number; commissions: number; other: number; lines: number }>();
    for (const l of this.ledger) {
      const t = m.get(l.currencyCode) || { recharged: 0, commissions: 0, other: 0, lines: 0 };
      if (l.kind === 'recharge') t.recharged += l.delta;
      else if (l.kind === 'commission') t.commissions += l.delta;
      else t.other += l.delta;
      t.lines++;
      m.set(l.currencyCode, t);
    }
    return [...m.entries()].map(([currency, t]) => ({ currency, ...t }));
  }

  exportLedger(): void {
    downloadCsv(`shnell-${this.uid}-ledger.csv`,
      ['time', 'kind', 'delta', 'currency', 'balance_before', 'balance_after', 'reference', 'order_id', 'recorded_by', 'approved_by', 'reason', 'ledger_id'],
      this.ledgerView.map(r => [new Date(r.time).toISOString(), r.kind, r.delta, r.currencyCode, r.balanceBefore, r.balanceAfter,
        r.reference, r.orderId, r.adminUid ? this.name(r.adminUid) : '', r.approvedBy ? this.name(r.approvedBy) : '', r.reason, r.id]));
  }

  /* ---------------------------- trips ---------------------------- */

  dealStatus(s: string): { label: string; tone: string } {
    const st = String(s || '').toLowerCase();
    if (st === 'terminated') return { label: 'Completed', tone: 'success' };
    if (st === 'almost') return { label: 'On the way', tone: 'warning' };
    if (st === 'accepted') return { label: 'Accepted', tone: 'info' };
    if (st.startsWith('cancel')) return { label: 'Cancelled', tone: 'danger' };
    return { label: s || 'Pending', tone: 'muted' };
  }

  orderStatus(o: any): { label: string; tone: string } {
    if (o.status === 'canceled') return { label: 'Cancelled', tone: 'danger' };
    if (o.isAccepted) return { label: 'Taken', tone: 'success' };
    return { label: 'Open', tone: 'warning' };
  }

  get tripCount(): number { return this.dealsAsDriver.length + this.orders.length; }

  /* ---------------------------- timeline ---------------------------- */

  get timeline(): TimelineItem[] {
    const items: TimelineItem[] = [];
    for (const l of this.ledger) {
      const m = ledgerMeta(l.kind);
      items.push({
        at: l.time, icon: m.icon, tone: l.delta >= 0 ? 'success' : m.tone, source: 'wallet',
        title: m.label,
        text: [l.reference ? `receipt ${l.reference}` : '', l.orderId ? `order ${short(l.orderId)}` : '',
          l.balanceAfter !== null ? `balance → ${l.balanceAfter.toFixed(2)} ${l.currencyCode}` : '',
          l.adminUid ? `by ${this.name(l.adminUid)}` : '', l.reason || ''].filter(Boolean).join(' · '),
        amount: l.delta, currency: l.currencyCode,
      });
    }
    for (const a of this.audit) {
      if (a.action === 'adjust_balance') continue; // the ledger line already tells it
      const m = auditMeta(a.action);
      items.push({ at: a.at, icon: m.icon, tone: m.tone, source: 'admin', title: m.label,
        text: `${describeAudit(a, this.name)} · by ${this.name(a.adminUid)}` });
    }
    for (const d of this.dealsAsDriver) {
      const s = this.dealStatus(d.status);
      items.push({ at: toMillis(d.timestamp), icon: 'bi-truck', tone: s.tone, source: 'trips',
        title: `Trip as driver · ${s.label}`, text: `order ${short(d.idOrder)} · customer ${this.name(d.idUser)}`,
        amount: d.agreedPrice ?? d.price, currency: d.currency || d.currencyCode });
    }
    for (const o of this.orders) {
      const s = this.orderStatus(o);
      items.push({ at: toMillis(o.timestamp), icon: 'bi-box-seam', tone: s.tone, source: 'trips',
        title: `Order placed · ${s.label}`, text: `${o.namePickUp || ''} · ${(o.stops || []).length} stop(s)`,
        amount: o.price, currency: o.currencyCode });
    }
    for (const a of this.alerts) {
      items.push({ at: toMillis(a.lastAt || a.createdAt), icon: alertType(a.type).icon, tone: alertTone(a.severity),
        source: 'timeline', title: `Alert · ${a.title}`, text: (a.body || '') + (a.resolved ? ' · closed' : ' · open') });
    }
    for (const c of this.calls) {
      items.push({ at: toMillis(c.timestamp), icon: 'bi-telephone', tone: 'muted', source: 'calls',
        title: `Call · ${c.callStatus || c.status || ''}`, text: `with ${this.name(this.other(c))}` });
    }
    const created = this.createdAt;
    if (created) items.push({ at: created, icon: 'bi-person-plus', tone: 'info', source: 'timeline', title: 'Account created', text: 'Started at 0 — no sign-up credit.' });
    return items.filter(i => i.at).sort((a, b) => b.at - a.at).slice(0, 400);
  }

  /* ---------------------------- actions ---------------------------- */

  openMovement(direction: 'credit' | 'debit'): void {
    this.movementDirection = direction;
    this.showMovement = true;
  }

  async toggleBan(): Promise<void> {
    const ban = !this.banned;
    const ok = await confirmAction({
      title: ban ? `Bannir ${this.user?.name} ?` : `Débannir ${this.user?.name} ?`,
      text: ban ? 'Le compte est bloqué immédiatement et retiré de la carte en direct.' : 'Le compte pourra de nouveau utiliser la plateforme.',
      confirmText: ban ? 'Bannir' : 'Débannir',
      danger: ban,
    });
    if (!ok) return;
    await this.run(() => this.hub.updateAccount({ userId: this.uid!, isBanned: ban }), ban ? 'Compte banni' : 'Compte débanni');
  }

  async toggleVerified(): Promise<void> {
    const v = !this.verified;
    await this.run(() => this.hub.updateAccount({ userId: this.uid!, isVerified: v }), v ? 'Chauffeur vérifié' : 'Vérification révoquée');
  }

  async toggleBusiness(): Promise<void> {
    const b = !this.business;
    await this.run(() => this.hub.updateAccount({ userId: this.uid!, business: b }), b ? 'Shnell Business activé' : 'Shnell Business désactivé');
  }

  async setTier(t: string): Promise<void> {
    if (String(this.user?.accType || '') === t) return;
    await this.run(() => this.hub.updateAccount({ userId: this.uid!, accType: t }), `Palier : ${t.toUpperCase()}`);
  }

  async reviewVehicle(v: any, approve: boolean): Promise<void> {
    await this.run(() => this.hub.reviewVehicle({ vehicleId: v.id, approve }), approve ? 'Véhicule approuvé' : 'Véhicule suspendu');
  }

  async resetPassword(): Promise<void> {
    const email = String(this.user?.email || '').trim();
    if (!email) return toastError('Ce compte n’a pas d’e-mail');
    const res = await Swal.fire({
      title: 'Nouveau mot de passe',
      text: `Pour ${email}. Communiquez-le au titulaire par un canal sûr.`,
      input: 'password',
      inputAttributes: { minlength: '8', autocomplete: 'new-password' },
      inputValidator: (v: string) => (!v || v.length < 8 ? '8 caractères minimum' : null),
      showCancelButton: true,
      confirmButtonText: 'Définir',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#FFC107',
      reverseButtons: true,
      customClass: { popup: 'sh-swal' },
    });
    if (!res.isConfirmed) return;
    await this.run(() => this.hub.resetPassword({ email, newPassword: String(res.value) }), 'Mot de passe mis à jour');
  }

  hubDescribe(a: AuditRow): string { return describeAudit(a, this.name); }

  /** The other party of a call. */
  other(c: any): string {
    return (c.participants || []).find((p: string) => p !== this.uid)
      || (c.callerId === this.uid ? c.receiverId : c.callerId) || '';
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => toastSuccess('Copié'));
  }

  private async run(fn: () => Promise<any>, ok: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
      toastSuccess(ok);
    } catch (e: any) {
      toastError(e?.message || 'Échec');
    } finally {
      this.busy = false;
    }
  }

  sectionCount(s: Section): number | null {
    switch (s) {
      case 'wallet': return this.ledger.length;
      case 'trips': return this.tripCount;
      case 'admin': return this.audit.length;
      case 'devices': return this.devices.length;
      case 'inbox': return this.inbox.length;
      case 'calls': return this.calls.length;
      case 'fleet': return this.vehicles.length;
      default: return null;
    }
  }

  readonly sections: { id: Section; label: string; icon: string; driverOnly?: boolean }[] = [
    { id: 'timeline', label: 'Timeline', icon: 'bi-clock-history' },
    { id: 'wallet', label: 'Transactions', icon: 'bi-wallet2' },
    { id: 'trips', label: 'Trips & orders', icon: 'bi-truck' },
    { id: 'admin', label: 'Admin log', icon: 'bi-shield-check' },
    { id: 'fleet', label: 'Vehicles', icon: 'bi-car-front', driverOnly: true },
    { id: 'devices', label: 'Devices', icon: 'bi-phone' },
    { id: 'inbox', label: 'Notifications', icon: 'bi-bell' },
    { id: 'calls', label: 'Calls', icon: 'bi-telephone' },
  ];
}
