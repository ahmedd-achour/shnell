import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ShnellUser } from '../../models/dashboard.models';
import { AdminHubService } from '../../services/admin-hub.service';
import { short, toMillis } from '../../services/hub-format';
import { confirmAction, toastError, toastSuccess } from '../../../shared/swal';
import Swal from 'sweetalert2';

export const ALERT_TYPES: Record<string, { label: string; icon: string }> = {
  no_supply:           { label: 'No driver for an order', icon: 'bi-person-x' },
  driver_canceled:     { label: 'Driver cancelled a trip', icon: 'bi-x-circle' },
  trip_aborted:        { label: 'Trip aborted',            icon: 'bi-exclamation-octagon' },
  recharge_pending:    { label: 'Recharge to approve',     icon: 'bi-shield-lock' },
  endpoint_down:       { label: 'Service down',            icon: 'bi-hdd-network' },
  wallet_legacy_value: { label: 'Wallet value to check',   icon: 'bi-wallet2' },
  business_request:    { label: 'Business access request', icon: 'bi-building-add' },
};

export function alertType(t: string) { return ALERT_TYPES[t] || { label: (t || 'alert').replace(/_/g, ' '), icon: 'bi-bell' }; }
export function alertTone(sev: string): string { return sev === 'critical' ? 'danger' : sev === 'warning' ? 'warning' : 'info'; }

/**
 * Alerts center: incidents raised by the server (admin_alerts) — orders
 * nobody takes, aborted trips, recharges waiting for approval, endpoints
 * down. Each alert links to what fixes it; resolving it keeps who / when.
 */
@Component({
  selector: 'app-alerts-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './alerts-tab.component.html',
  styleUrls: ['../../hub.css'],
})
export class AlertsTabComponent implements OnInit, OnDestroy {
  @Input() users: ShnellUser[] = [];
  @Output() openAccount = new EventEmitter<string>();
  @Output() navigateTab = new EventEmitter<string>();

  private destroy$ = new Subject<void>();
  private view$ = new BehaviorSubject<'open' | 'all'>('open');
  view: 'open' | 'all' = 'open';
  alerts: any[] = [];
  severity = 'all';
  busy: string | null = null;
  loading = true;

  readonly alertType = alertType;
  readonly alertTone = alertTone;
  readonly toMillis = toMillis;
  readonly short = short;

  constructor(private hub: AdminHubService) {}

  ngOnInit(): void {
    this.view$.pipe(
      switchMap(v => v === 'open' ? this.hub.openAlerts$ : this.hub.recentAlerts$(300)),
      takeUntil(this.destroy$),
    ).subscribe(a => { this.alerts = a; this.loading = false; });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  setView(v: 'open' | 'all'): void { this.view = v; this.loading = true; this.view$.next(v); }

  get filtered(): any[] {
    return this.alerts.filter(a => this.severity === 'all' || a.severity === this.severity);
  }

  sevCount(s: string): number { return this.alerts.filter(a => s === 'all' || a.severity === s).length; }

  name(uid: string): string {
    if (!uid) return '—';
    if (uid === 'system') return 'System';
    return this.users.find(u => (u.uid || u.id) === uid)?.name || short(uid);
  }

  async resolve(a: any): Promise<void> {
    const res = await Swal.fire({
      title: 'Clôturer l’alerte',
      text: a.title,
      input: 'text',
      inputPlaceholder: 'Note (facultatif) : ce qui a été fait',
      showCancelButton: true,
      confirmButtonText: 'Clôturer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#FFC107',
      reverseButtons: true,
      customClass: { popup: 'sh-swal' },
    });
    if (!res.isConfirmed) return;
    this.busy = a.id;
    try {
      await this.hub.resolveAlert(a.id, String(res.value || '').trim());
      toastSuccess('Alerte clôturée');
    } catch (e: any) {
      toastError(e?.message || 'Échec');
    } finally {
      this.busy = null;
    }
  }

  async retry(a: any): Promise<void> {
    this.busy = a.id;
    try {
      await this.hub.retryDispatch({ orderId: a.orderId });
      toastSuccess('Commande renvoyée aux chauffeurs');
    } catch (e: any) {
      toastError(e?.message || 'Échec du renvoi');
    } finally {
      this.busy = null;
    }
  }

  async cancelOrder(a: any): Promise<void> {
    const ok = await confirmAction({
      title: 'Annuler la commande ?',
      text: `Commande ${short(a.orderId)} : le client et le chauffeur éventuel seront prévenus.`,
      danger: true,
      confirmText: 'Annuler la commande',
      cancelText: 'Retour',
    });
    if (!ok) return;
    this.busy = a.id;
    try {
      await this.hub.cancelOrder({ orderId: a.orderId, reason: `Alert: ${a.type}` });
      await this.hub.resolveAlert(a.id, 'Order cancelled');
      toastSuccess('Commande annulée');
    } catch (e: any) {
      toastError(e?.message || 'Échec de l’annulation');
    } finally {
      this.busy = null;
    }
  }
}
