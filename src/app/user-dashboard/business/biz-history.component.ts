import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, Timestamp, collection, getDocs, orderBy, query, where } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import * as XLSX from 'xlsx';
import { toastError } from '../../shared/swal';
import { BizService } from './biz.service';

type HistState = 'open' | 'assigned' | 'in_progress' | 'delivered' | 'canceled' | 'expired';

interface HistRow {
  id: string;
  atMs: number;
  source: 'API' | 'Tableau de bord' | 'Application';
  pickup: string;
  stops: number;
  types: string;
  state: HistState;
  price: number;
  currency: string;
  driverId: string;
  driver: string;
  ownFleet: boolean;
}

const STATE_LABEL: Record<HistState, { label: string; tone: string }> = {
  open: { label: 'En recherche', tone: 'tone-info' },
  assigned: { label: 'Chauffeur trouvé', tone: 'tone-info' },
  in_progress: { label: 'En route', tone: 'tone-warn' },
  delivered: { label: 'Livré', tone: 'tone-ok' },
  canceled: { label: 'Annulé', tone: 'tone-muted' },
  expired: { label: 'Expiré', tone: 'tone-muted' },
};

/**
 * Shnell Business → Historique : every order of the account over a period
 * (dashboard, API and app), what was spent, an Excel export and a printable
 * statement for the accounting team.
 */
@Component({
  selector: 'app-biz-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './biz-history.component.html',
  styleUrls: ['./biz.css'],
})
export class BizHistoryComponent implements OnInit {
  private fs = inject(Firestore);
  private auth = inject(Auth);
  private biz = inject(BizService);

  readonly stateLabel = STATE_LABEL;
  readonly states = Object.keys(STATE_LABEL) as HistState[];

  from = '';
  to = '';
  stateFilter: '' | HistState = '';
  sourceFilter = '';
  search = '';
  rows: HistRow[] = [];
  loading = false;

  async ngOnInit(): Promise<void> {
    const now = new Date();
    this.from = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
    this.to = isoDay(now);
    await this.biz.init();   // vehicle names
    this.load();
  }

  preset(p: 'month' | 'last' | '30' | 'year'): void {
    const now = new Date();
    if (p === 'month') { this.from = isoDay(new Date(now.getFullYear(), now.getMonth(), 1)); this.to = isoDay(now); }
    if (p === 'last') {
      this.from = isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      this.to = isoDay(new Date(now.getFullYear(), now.getMonth(), 0));
    }
    if (p === '30') { this.from = isoDay(new Date(Date.now() - 29 * 864e5)); this.to = isoDay(now); }
    if (p === 'year') { this.from = isoDay(new Date(now.getFullYear(), 0, 1)); this.to = isoDay(now); }
    this.load();
  }

  async load(): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid || !this.from || !this.to) return;
    const fromMs = new Date(`${this.from}T00:00:00`).getTime();
    const toMs = new Date(`${this.to}T23:59:59.999`).getTime();
    if (!(toMs >= fromMs)) { toastError('Période invalide'); return; }
    if (toMs - fromMs > 400 * 864e5) { toastError('Une période de 13 mois au plus'); return; }
    this.loading = true;
    try {
      const [orders, deals] = await Promise.all([
        getDocs(query(collection(this.fs, 'orders'), where('clientId', '==', uid),
          where('timestamp', '>=', Timestamp.fromMillis(fromMs)), where('timestamp', '<=', Timestamp.fromMillis(toMs)),
          orderBy('timestamp', 'asc'))),
        getDocs(query(collection(this.fs, 'deals'), where('idUser', '==', uid),
          where('timestamp', '>=', Timestamp.fromMillis(fromMs - 864e5)), orderBy('timestamp', 'desc'))),
      ]);
      const dealOf = new Map<string, any>();
      deals.forEach((d) => {
        const x: any = d.data();
        if (['accepted', 'almost', 'terminated'].includes(String(x.status))) dealOf.set(String(x.idOrder), x);
      });
      this.rows = orders.docs.map((d) => this.rowOf(d.id, d.data(), dealOf.get(d.id))).reverse();
      await Promise.all([...new Set(this.rows.map((r) => r.driverId).filter(Boolean))].map(async (id) => {
        const name = await this.biz.driverName(id);
        this.rows.filter((r) => r.driverId === id).forEach((r) => (r.driver = name));
      }));
    } catch (e: any) {
      console.warn('[history]', e);
      toastError('Chargement impossible');
    } finally {
      this.loading = false;
    }
  }

  private rowOf(id: string, o: any, deal: any): HistRow {
    const via = String(o.createdVia || '');
    let state: HistState = 'open';
    if (o.status === 'canceled') state = 'canceled';
    else if (o.status === 'expired') state = 'expired';
    else if (deal?.status === 'terminated') state = 'delivered';
    else if (deal?.status === 'almost') state = 'in_progress';
    else if (deal || o.chosenDriver) state = 'assigned';
    const types = Array.isArray(o.eligibleVehicleTypes) && o.eligibleVehicleTypes.length ? o.eligibleVehicleTypes : [o.vehicleType].filter(Boolean);
    return {
      id,
      atMs: o.timestamp?.toMillis ? o.timestamp.toMillis() : 0,
      source: via.startsWith('api') ? 'API' : via.startsWith('business') ? 'Tableau de bord' : 'Application',
      pickup: String(o.namePickUp || ''),
      stops: Array.isArray(o.stops) ? o.stops.length : 0,
      types: types.map((t: string) => this.biz.vehicles.find((v) => v.key === t)?.name || t).join(', '),
      state,
      price: Number(deal?.agreedPrice ?? o.price) || 0,
      currency: String(o.currencyCode || 'TND'),
      driverId: String(deal?.idDriver || o.chosenDriver || ''),
      driver: '',
      ownFleet: via.endsWith('_fleet'),
    };
  }

  get shown(): HistRow[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter((r) =>
      (!this.stateFilter || r.state === this.stateFilter) &&
      (!this.sourceFilter || r.source === this.sourceFilter) &&
      (!q || `${r.id} ${r.pickup} ${r.driver} ${r.types}`.toLowerCase().includes(q)));
  }

  get summary(): { orders: number; delivered: number; canceled: number; spent: number; open: number; avg: number; currency: string; stops: number } {
    const list = this.shown;
    const delivered = list.filter((r) => r.state === 'delivered');
    const spent = delivered.reduce((s, r) => s + r.price, 0);
    return {
      orders: list.length,
      delivered: delivered.length,
      canceled: list.filter((r) => r.state === 'canceled' || r.state === 'expired').length,
      open: list.filter((r) => ['open', 'assigned', 'in_progress'].includes(r.state)).length,
      spent,
      avg: delivered.length ? spent / delivered.length : 0,
      currency: list[0]?.currency || 'TND',
      stops: delivered.reduce((s, r) => s + r.stops, 0),
    };
  }

  /** Spend per month of the delivered orders shown (statement table). */
  get byMonth(): { month: string; orders: number; spent: number }[] {
    const m = new Map<string, { month: string; orders: number; spent: number }>();
    for (const r of this.shown) {
      if (r.state !== 'delivered') continue;
      const d = new Date(r.atMs);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const x = m.get(key) || { month: key, orders: 0, spent: 0 };
      x.orders++;
      x.spent += r.price;
      m.set(key, x);
    }
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  exportXlsx(): void {
    const data = this.shown.map((r) => ({
      Date: new Date(r.atMs).toLocaleString('fr-FR'),
      Commande: r.id,
      Source: r.source,
      Retrait: r.pickup,
      'Arrêts': r.stops,
      'Véhicules': r.types,
      'État': STATE_LABEL[r.state].label,
      Prix: r.price,
      Devise: r.currency,
      Chauffeur: r.driver + (r.ownFleet ? ' (ma flotte)' : ''),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Commandes');
    XLSX.writeFile(wb, `shnell-commandes-${this.from}_${this.to}.xlsx`);
  }

  /** A clean statement in a new window, printed or saved as PDF by the browser. */
  printStatement(): void {
    const s = this.summary;
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const money = (n: number) => `${n.toFixed(2)} ${esc(s.currency)}`;
    const delivered = this.shown.filter((r) => r.state === 'delivered').slice().reverse();
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Relevé Shnell ${esc(this.from)} – ${esc(this.to)}</title>
<style>body{font:13px/1.45 system-ui,sans-serif;color:#17140D;margin:32px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#666}.r{text-align:right}
.k{display:flex;gap:28px;margin:16px 0}.k b{display:block;font-size:18px}.muted{color:#666}</style></head><body>
<h1>Relevé des livraisons Shnell</h1>
<div class="muted">${esc(this.auth.currentUser?.email || '')} · du ${esc(this.from)} au ${esc(this.to)} · édité le ${new Date().toLocaleString('fr-FR')}</div>
<div class="k"><div><b>${s.delivered}</b>livraisons</div><div><b>${s.stops}</b>arrêts livrés</div><div><b>${money(s.spent)}</b>total</div></div>
<table><thead><tr><th>Mois</th><th class="r">Livraisons</th><th class="r">Montant</th></tr></thead><tbody>
${this.byMonth.map((m) => `<tr><td>${m.month}</td><td class="r">${m.orders}</td><td class="r">${money(m.spent)}</td></tr>`).join('')}
</tbody></table>
<table><thead><tr><th>Date</th><th>Commande</th><th>Retrait</th><th class="r">Arrêts</th><th>Chauffeur</th><th class="r">Prix</th></tr></thead><tbody>
${delivered.map((r) => `<tr><td>${new Date(r.atMs).toLocaleDateString('fr-FR')}</td><td>${esc(r.id.slice(0, 14))}</td><td>${esc(r.pickup)}</td><td class="r">${r.stops}</td><td>${esc(r.driver)}</td><td class="r">${money(r.price)}</td></tr>`).join('')}
</tbody></table>
<p class="muted">Montants convenus avec les chauffeurs pour les livraisons terminées. Les commandes annulées ou expirées ne sont pas facturées.</p>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toastError('Autorisez les fenêtres pop-up pour imprimer le relevé'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  trackId(_: number, r: HistRow): string { return r.id; }
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
