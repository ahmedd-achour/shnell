import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Swal, toastError, toastSuccess, confirmAction } from '../../shared/swal';
import { BizService } from './biz.service';
import { LiveBid, LiveState, LiveTrip } from './biz-models';

type Filter = 'all' | 'open' | 'offers' | 'assigned' | 'in_progress' | 'delivered' | 'closed';

const STATE: Record<LiveState, { label: string; tone: string; icon: string }> = {
  scheduled:   { label: 'Planifié',        tone: 'tone-info',  icon: 'bi-calendar-event' },
  searching:   { label: 'Recherche',       tone: 'tone-warn',  icon: 'bi-broadcast' },
  offers:      { label: 'Offres reçues',   tone: 'tone-warn',  icon: 'bi-cash-coin' },
  no_driver:   { label: 'Aucun chauffeur', tone: 'tone-bad',   icon: 'bi-exclamation-circle' },
  assigned:    { label: 'Assigné',         tone: 'tone-info',  icon: 'bi-person-check' },
  in_progress: { label: 'En cours',        tone: 'tone-ok',    icon: 'bi-truck' },
  delivered:   { label: 'Livré',           tone: 'tone-ok',    icon: 'bi-check2-all' },
  cancelled:   { label: 'Annulé',          tone: 'tone-muted', icon: 'bi-x-circle' },
  expired:     { label: 'Expiré',          tone: 'tone-muted', icon: 'bi-hourglass-bottom' },
};

/** Same reasons, same keys as the client app's cancel sheet (lib/cancel_policy.js). */
const CANCEL_REASONS: Record<string, string> = {
  driver_asked: 'Le chauffeur m’a demandé d’annuler',
  driver_late: 'Le chauffeur est en retard',
  driver_early: 'Le chauffeur ne bouge pas',
  price_dispute: 'Désaccord sur le prix',
  changed_mind: 'Je n’en ai plus besoin',
  found_other: 'J’ai trouvé une autre solution',
  other: 'Autre',
};

/**
 * Shnell Business — every booked trip, live: search progress, offers to
 * accept, the driver on it, revisions to answer, cancel / relaunch. Writes
 * are the client app's own (same Firestore rules, same server reactions).
 */
@Component({
  selector: 'app-biz-live',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './biz-live.component.html',
  styleUrls: ['./biz.css'],
})
export class BizLiveComponent implements OnInit, OnDestroy {
  private biz = inject(BizService);
  private zone = inject(NgZone);

  trips: LiveTrip[] = [];
  loading = true;
  filter: Filter = 'open';
  search = '';
  expanded: string | null = null;
  busy = new Set<string>();
  names: Record<string, string> = {};
  now = Date.now();
  readonly state = STATE;

  private stop: () => void = () => {};
  private tick: any;

  readonly filters: { id: Filter; label: string }[] = [
    { id: 'open', label: 'À pourvoir' },
    { id: 'offers', label: 'Offres' },
    { id: 'assigned', label: 'Assignés' },
    { id: 'in_progress', label: 'En cours' },
    { id: 'delivered', label: 'Livrés' },
    { id: 'closed', label: 'Fermés' },
    { id: 'all', label: 'Tous' },
  ];

  async ngOnInit(): Promise<void> {
    await this.biz.init();
    this.stop = this.biz.watchLive((trips) => this.zone.run(() => {
      this.trips = trips;
      this.loading = false;
      for (const t of trips) {
        for (const id of [t.driverId, ...t.bids.map((b) => b.driverId)]) {
          if (id && !(id in this.names)) {
            this.names[id] = '…';
            this.biz.driverName(id).then((n) => (this.names[id] = n));
          }
        }
      }
    }));
    this.tick = setInterval(() => (this.now = Date.now()), 1000);
  }

  ngOnDestroy(): void {
    this.stop();
    clearInterval(this.tick);
  }

  private inFilter(t: LiveTrip, f: Filter): boolean {
    switch (f) {
      case 'open': return ['scheduled', 'searching', 'offers', 'no_driver'].includes(t.state);
      case 'offers': return t.state === 'offers';
      case 'assigned': return t.state === 'assigned';
      case 'in_progress': return t.state === 'in_progress';
      case 'delivered': return t.state === 'delivered';
      case 'closed': return t.state === 'cancelled' || t.state === 'expired';
      default: return true;
    }
  }

  count(f: Filter): number { return this.trips.filter((t) => this.inFilter(t, f)).length; }

  get shown(): LiveTrip[] {
    const q = this.search.trim().toLowerCase();
    return this.trips.filter((t) => this.inFilter(t, this.filter)
      && (!q || t.orderId.toLowerCase().includes(q) || t.pickup.toLowerCase().includes(q) || (this.names[t.driverId] || '').toLowerCase().includes(q)));
  }

  get revisionsWaiting(): number { return this.trips.filter((t) => t.revision).length; }

  left(ms: number): string {
    const s = Math.max(0, Math.round((ms - this.now) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  progress(t: LiveTrip): string {
    if (t.state === 'scheduled' && t.startsAtMs) return `démarre ${new Date(t.startsAtMs).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
    if (t.state === 'searching' || t.state === 'offers') {
      const parts = [];
      if (t.radiusKm) parts.push(`${t.radiusKm} km`);
      if (t.phase === 'fallback') parts.push('tous véhicules');
      parts.push(`${t.notified} chauffeur(s) contacté(s)`);
      if (t.deadlineMs > this.now) parts.push(this.left(t.deadlineMs));
      return parts.join(' · ');
    }
    return '';
  }

  private async run(id: string, fn: () => Promise<void>, ok: string): Promise<void> {
    if (this.busy.has(id)) return;
    this.busy.add(id);
    try {
      await fn();
      toastSuccess(ok);
    } catch (e: any) {
      toastError(e?.message || 'Action impossible');
    } finally {
      this.busy.delete(id);
    }
  }

  accept(t: LiveTrip, b: LiveBid): Promise<void> {
    return this.run(t.orderId, () => this.biz.acceptBid(t.orderId, b.driverId, b.amount), `Offre de ${this.names[b.driverId] || 'chauffeur'} acceptée`);
  }

  async cancel(t: LiveTrip): Promise<void> {
    if (t.dealId) {
      const res = await Swal.fire({
        title: 'Annuler ce trajet ?',
        input: 'select',
        inputOptions: CANCEL_REASONS,
        inputPlaceholder: 'Raison (obligatoire)',
        inputValidator: (v: string) => (v ? null : 'Choisissez une raison'),
        showCancelButton: true,
        confirmButtonText: 'Annuler le trajet',
        cancelButtonText: 'Retour',
      });
      if (!res.isConfirmed) return;
      await this.run(t.orderId, () => this.biz.cancelDeal(t.dealId, String(res.value), '', false), 'Trajet annulé');
      return;
    }
    const ok = await confirmAction({ title: 'Annuler la recherche ?', text: 'Les chauffeurs ne verront plus ce trajet.', confirmText: 'Annuler la recherche' });
    if (ok) await this.run(t.orderId, () => this.biz.cancelOrder(t.orderId), 'Recherche annulée');
  }

  retry(t: LiveTrip): Promise<void> {
    return this.run(t.orderId, () => this.biz.retry(t.orderId), 'Recherche relancée');
  }

  revision(t: LiveTrip, decision: 'accept' | 'decline'): Promise<void> {
    return this.run(t.orderId, () => this.biz.respondRevision(t.dealId, decision), decision === 'accept' ? 'Révision acceptée' : 'Révision refusée');
  }

  canCancel(t: LiveTrip): boolean { return ['scheduled', 'searching', 'offers', 'no_driver', 'assigned', 'in_progress'].includes(t.state); }

  trackId(_: number, t: LiveTrip): string { return t.orderId; }
}
