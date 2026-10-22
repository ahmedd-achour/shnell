import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShnellUser } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { rechargeCurrencies, rechargeResultText, validReceiptRef } from '../../services/wallet';
import { confirmAction, toastError, toastSuccess } from '../../../shared/swal';

/**
 * The one form that moves money from the console: credit (office recharge)
 * or debit (correction) of ONE currency of an account's wallet, through
 * adminAdjustBalance — receipt number (unique per currency), idempotency
 * key, maker-checker above the threshold, ledger line + admin_audit entry.
 */
@Component({
  selector: 'app-wallet-movement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wallet-movement.component.html',
  styleUrls: ['../../hub.css'],
})
export class WalletMovementComponent implements OnInit {
  @Input() users: ShnellUser[] = [];
  /** Preselected account (Account 360, paused-driver list). */
  @Input() user: ShnellUser | null = null;
  @Input() config: any = null;
  @Input() direction: 'credit' | 'debit' = 'credit';
  @Output() closed = new EventEmitter<boolean>();

  query = '';
  amount: number | null = null;
  currency = 'TND';
  reference = '';
  reason = '';
  saving = false;

  constructor(private data: DashboardDataService) {}

  ngOnInit(): void {
    if (this.user) this.currency = rechargeCurrencies(this.user as any)[0] || 'TND';
  }

  get matches(): ShnellUser[] {
    const q = this.query.trim().toLowerCase();
    if (q.length < 2) return [];
    return this.users.filter(u =>
      [u.name, u.email, u.phone, u.uid, u.id].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 8);
  }

  pick(u: ShnellUser): void {
    this.user = u;
    this.query = '';
    this.currency = rechargeCurrencies(u as any)[0] || 'TND';
  }

  currencies(): string[] { return rechargeCurrencies(this.user as any); }

  balance(): number { return Number(this.user?.balances?.[this.currency] || 0); }

  get delta(): number {
    const a = Math.round(Math.abs(Number(this.amount) || 0) * 100) / 100;
    return this.direction === 'credit' ? a : -a;
  }

  get threshold(): number | null {
    const t = this.config?.recharge_approval_thresholds?.[this.currency];
    return typeof t === 'number' && t > 0 ? t : null;
  }

  get needsApproval(): boolean { return !!this.threshold && Math.abs(this.delta) > this.threshold; }

  async submit(): Promise<void> {
    const u = this.user;
    const uid = u ? String(u.uid || u.id) : '';
    const delta = this.delta;
    if (!uid) return toastError('Choisissez un compte');
    if (!delta) return toastError('Montant invalide');
    if (!/^[A-Z]{3}$/.test(this.currency)) return toastError('Choisissez la devise');
    if (!validReceiptRef(this.reference)) return toastError('Saisissez le numéro du reçu (2-64 caractères)');
    if (delta < 0 && this.reason.trim().length < 3) return toastError('Un débit doit être justifié (motif)');
    const before = this.balance();
    const after = Math.round((before + delta) * 100) / 100;
    const ok = await confirmAction({
      title: delta > 0 ? 'Confirmer le crédit' : 'Confirmer le débit',
      html: `<div style="text-align:left">
        <div>Compte : <b>${esc(u!.name || uid)}</b></div>
        <div style="font-size:1.6em;margin:.4em 0"><b>${delta > 0 ? '+' : ''}${delta.toFixed(2)} ${this.currency}</b></div>
        <div>Solde ${this.currency} : ${before.toFixed(2)} → <b>${after.toFixed(2)}</b></div>
        <div>Reçu : <b>${esc(this.reference)}</b></div>
        ${this.needsApproval ? `<div style="margin-top:.5em;color:#B7791F">Au-dessus de ${this.threshold} ${this.currency} : un autre admin devra valider.</div>` : ''}
        <div style="opacity:.75;margin-top:.5em">Chaque devise est un solde séparé. Enregistré dans le registre et le journal admin.</div>
      </div>`,
      confirmText: delta > 0 ? 'Créditer' : 'Débiter',
      danger: delta < 0,
    });
    if (!ok) return;
    this.saving = true;
    try {
      const res = await this.data.rechargeUserBalance(uid, delta, this.currency, this.reference, this.reason);
      toastSuccess(delta > 0 ? rechargeResultText(delta, res) : res.pending
        ? `${delta} ${res.currencyCode} : en attente de validation par un autre admin.`
        : `${delta.toFixed(2)} ${res.currencyCode} débités. Nouveau solde : ${(res.newBalance ?? 0).toFixed(2)}`);
      this.closed.emit(true);
    } catch (e: any) {
      toastError(e?.message || 'Échec du mouvement');
    } finally {
      this.saving = false;
    }
  }
}

function esc(t: string): string {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
