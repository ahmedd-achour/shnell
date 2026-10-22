import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ShnellUser } from '../../models/dashboard.models';
import { AdminHubService } from '../../services/admin-hub.service';
import { AuditGroup, AuditRow, auditMeta, describeAudit, downloadCsv, short } from '../../services/hub-format';

/**
 * Activity log: every admin (and system) action recorded server-side in
 * admin_audit — wallet movements and approvals, bans, verifications,
 * vehicle reviews, order assignments / cancellations, broadcasts, settings.
 */
@Component({
  selector: 'app-activity-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './activity-tab.component.html',
  styleUrls: ['../../hub.css'],
})
export class ActivityTabComponent implements OnInit, OnDestroy {
  @Input() users: ShnellUser[] = [];
  @Output() openAccount = new EventEmitter<string>();

  private destroy$ = new Subject<void>();
  private max$ = new BehaviorSubject<number>(300);

  rows: AuditRow[] = [];
  loading = true;
  group: AuditGroup | 'all' = 'all';
  adminFilter = 'all';
  search = '';
  expanded: string | null = null;

  readonly auditMeta = auditMeta;
  readonly short = short;
  readonly groups: { id: AuditGroup | 'all'; label: string; icon: string }[] = [
    { id: 'all', label: 'All', icon: 'bi-list-ul' },
    { id: 'money', label: 'Money', icon: 'bi-cash-coin' },
    { id: 'account', label: 'Accounts', icon: 'bi-person-gear' },
    { id: 'fleet', label: 'Fleet', icon: 'bi-truck' },
    { id: 'orders', label: 'Orders', icon: 'bi-receipt' },
    { id: 'comms', label: 'Messages', icon: 'bi-megaphone' },
    { id: 'system', label: 'System', icon: 'bi-gear' },
  ];

  constructor(private hub: AdminHubService) {}

  ngOnInit(): void {
    this.max$.pipe(switchMap(n => this.hub.audit$(n)), takeUntil(this.destroy$))
      .subscribe(r => { this.rows = r; this.loading = false; });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  loadMore(): void { this.max$.next(this.max$.value + 500); }

  private byId = new Map<string, ShnellUser>();
  private usersRef: ShnellUser[] | null = null;
  name = (uid: string | null): string => {
    if (!uid) return '—';
    if (uid === 'system') return 'System';
    if (this.usersRef !== this.users) {
      this.usersRef = this.users;
      this.byId = new Map(this.users.map(u => [String(u.uid || u.id), u]));
    }
    return this.byId.get(uid)?.name || short(uid);
  };

  describe(a: AuditRow): string { return describeAudit(a, this.name); }

  get admins(): string[] { return [...new Set(this.rows.map(r => r.adminUid))]; }

  groupCount(g: AuditGroup | 'all'): number {
    return g === 'all' ? this.rows.length : this.rows.filter(r => auditMeta(r.action).group === g).length;
  }

  get filtered(): AuditRow[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter(r =>
      (this.group === 'all' || auditMeta(r.action).group === this.group) &&
      (this.adminFilter === 'all' || r.adminUid === this.adminFilter) &&
      (!q || [this.describe(r), auditMeta(r.action).label, this.name(r.adminUid), r.targetUid, r.orderId]
        .some(v => (v || '').toLowerCase().includes(q))));
  }

  /** Rows grouped by calendar day for the timeline. */
  get days(): { day: number; rows: AuditRow[] }[] {
    const out: { day: number; rows: AuditRow[] }[] = [];
    for (const r of this.filtered) {
      const d = new Date(r.at); d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      if (!out.length || out[out.length - 1].day !== key) out.push({ day: key, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }

  detailsJson(a: AuditRow): string { return JSON.stringify(a.details, null, 2); }

  exportCsv(): void {
    downloadCsv(`shnell-activity-${new Date().toISOString().slice(0, 10)}.csv`,
      ['time', 'admin', 'action', 'subject_uid', 'subject_name', 'order_id', 'summary', 'details_json', 'entry_id'],
      this.filtered.map(r => [new Date(r.at).toISOString(), this.name(r.adminUid), r.action, r.targetUid,
        r.targetUid ? this.name(r.targetUid) : '', r.orderId, this.describe(r), JSON.stringify(r.details), r.id]));
  }
}
