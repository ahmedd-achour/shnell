import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, doc, onSnapshot, query, where } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { confirmAction, toastError, toastSuccess } from '../../shared/swal';
import { BizService } from './biz.service';

/** Mirrors functions/lib/biz_plan.js. */
export const BIZ_PLAN = { freeDrivers: 2, proBase: 99, proIncluded: 10, proPerExtra: 10 };
export const proPrice = (seats: number) =>
  BIZ_PLAN.proBase + BIZ_PLAN.proPerExtra * Math.max(0, seats - BIZ_PLAN.proIncluded);

interface PlanView {
  tier: 'free' | 'pro';
  status: 'active' | 'past_due';
  seats: number;
  periodEndMs: number;
  autoRenew: boolean;
}

interface LinkRow {
  driverUid: string;
  driverName: string;
  phone: string;
  status: 'pending' | 'active' | 'declined' | 'ended';
  invitedAtMs: number;
}

/**
 * Shnell Business → Ma flotte: the account's own drivers. A driver joins
 * only by accepting the invitation in the Shnell Driver app
 * (bizInviteDriver -> fleetLinkRespond); then trips can be handed to them
 * directly from "Créer des trajets" or the API (driverId).
 */
@Component({
  selector: 'app-biz-fleet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './biz-fleet.component.html',
  styleUrls: ['./biz.css'],
})
export class BizFleetComponent implements OnInit, OnDestroy {
  private fs = inject(Firestore);
  private auth = inject(Auth);
  private fns = inject(Functions);
  private biz = inject(BizService);

  links: LinkRow[] = [];
  loading = true;
  phone = '';
  busy = false;
  removing: string | null = null;
  usage = { trips: 0, drivers: 0 };
  readonly month = new Date().toISOString().slice(0, 7);
  readonly P = BIZ_PLAN;
  plan: PlanView = { tier: 'free', status: 'active', seats: BIZ_PLAN.freeDrivers, periodEndMs: 0, autoRenew: true };
  fleetSize = 0;
  balance = 0;
  paying = false;

  private unsubs: (() => void)[] = [];

  ngOnInit(): void {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    this.unsubs.push(onSnapshot(query(collection(this.fs, 'fleet_links'), where('bizUid', '==', uid)), (s) => {
      const before = this.links.filter((l) => l.status === 'active').length;
      this.links = s.docs.map((d) => {
        const m: any = d.data();
        return {
          driverUid: String(m.driverUid || ''), driverName: String(m.driverName || 'Chauffeur'), phone: String(m.phone || ''),
          status: m.status, invitedAtMs: m.invitedAt?.toMillis?.() || 0,
        } as LinkRow;
      }).filter((l) => l.status === 'pending' || l.status === 'active')
        .sort((a, b) => (a.status === b.status ? b.invitedAtMs - a.invitedAtMs : a.status === 'active' ? -1 : 1));
      this.loading = false;
      // A driver accepted (or left): the composer's driver list follows.
      if (this.links.filter((l) => l.status === 'active').length !== before) this.biz.reloadFleet();
    }, () => { this.loading = false; }));
    this.unsubs.push(onSnapshot(doc(this.fs, 'users', uid), (s) => {
      const m: any = s.data() || {};
      const p = m.bizPlan || {};
      this.fleetSize = Array.isArray(m.drivers) ? m.drivers.length : 0;
      this.plan = p.tier === 'pro'
        ? { tier: 'pro', status: p.status === 'past_due' ? 'past_due' : 'active', seats: Math.max(BIZ_PLAN.proIncluded, Number(p.seats) || 0),
            periodEndMs: p.periodEnd?.toMillis?.() || 0, autoRenew: p.autoRenew !== false }
        : { tier: 'free', status: 'active', seats: BIZ_PLAN.freeDrivers, periodEndMs: 0, autoRenew: true };
    }, () => null));
    this.unsubs.push(onSnapshot(doc(this.fs, 'wallets', uid), (s) => {
      this.balance = Number((s.data() as any)?.balances?.TND) || 0;
    }, () => null));
    this.unsubs.push(onSnapshot(doc(this.fs, 'business_usage', `${uid}_${this.month}`), (s) => {
      const m: any = s.exists() ? s.data() : {};
      this.usage = { trips: Number(m.ownFleetTrips) || 0, drivers: Array.isArray(m.ownFleetDrivers) ? m.ownFleetDrivers.length : 0 };
    }, () => null));
  }

  ngOnDestroy(): void { this.unsubs.forEach((u) => u()); }

  /** What the next Pro month costs with today's fleet. */
  get nextPrice(): number { return proPrice(Math.max(BIZ_PLAN.proIncluded, this.fleetSize)); }
  get isPro(): boolean { return this.plan.tier === 'pro'; }
  get pastDue(): boolean { return this.isPro && this.plan.status === 'past_due'; }
  get freeFull(): boolean { return !this.isPro && this.fleetSize >= BIZ_PLAN.freeDrivers; }

  async subscribe(): Promise<void> {
    const amount = this.nextPrice;
    const ok = await confirmAction({
      title: this.pastDue ? `Payer ${amount} TND maintenant ?` : `Passer à Shnell Business Pro (${amount} TND / mois) ?`,
      text: `${amount} TND seront prélevés sur votre portefeuille Shnell (solde : ${this.balance} TND), puis chaque mois automatiquement.`,
      confirmText: this.pastDue ? 'Payer' : 'Passer à Pro',
    });
    if (!ok) return;
    this.paying = true;
    try {
      const r: any = await httpsCallable(this.fns, 'bizSubscribePro')({});
      toastSuccess(`Pro actif : ${r.data?.amount} TND payés`);
    } catch (e: any) {
      const d = e?.details;
      toastError('Paiement impossible', d?.reason === 'insufficient_funds'
        ? `Solde insuffisant (${d.balance} TND pour ${d.required} TND). Rechargez votre portefeuille auprès de Shnell.`
        : e?.message);
    } finally {
      this.paying = false;
    }
  }

  async setAutoRenew(on: boolean): Promise<void> {
    if (!on) {
      const ok = await confirmAction({
        title: 'Arrêter le renouvellement ?',
        text: `Pro reste actif jusqu’au ${new Date(this.plan.periodEndMs).toLocaleDateString('fr-FR')}, puis retour à l’offre gratuite (${BIZ_PLAN.freeDrivers} chauffeurs).`,
        confirmText: 'Arrêter', danger: true,
      });
      if (!ok) return;
    }
    try {
      await httpsCallable(this.fns, 'bizSetAutoRenew')({ autoRenew: on });
      toastSuccess(on ? 'Renouvellement automatique activé' : 'Renouvellement arrêté');
    } catch (e: any) {
      toastError('Action impossible', e?.message);
    }
  }

  get active(): LinkRow[] { return this.links.filter((l) => l.status === 'active'); }
  get pending(): LinkRow[] { return this.links.filter((l) => l.status === 'pending'); }

  async invite(): Promise<void> {
    const phone = this.phone.trim();
    if (!phone || this.busy) return;
    this.busy = true;
    try {
      const r: any = await httpsCallable(this.fns, 'bizInviteDriver')({ phone });
      this.phone = '';
      toastSuccess(`Invitation envoyée${r.data?.driverName ? ' à ' + r.data.driverName : ''}`
        + (r.data?.extraSeat ? ` — ${r.data.extraSeat} TND à son acceptation (chauffeur supplémentaire)` : ''));
    } catch (e: any) {
      toastError('Invitation impossible', e?.message);
    } finally {
      this.busy = false;
    }
  }

  async remove(l: LinkRow): Promise<void> {
    const ok = await confirmAction({
      title: l.status === 'pending' ? `Annuler l’invitation de ${l.driverName} ?` : `Retirer ${l.driverName} de votre flotte ?`,
      text: l.status === 'pending' ? '' : 'Vous ne pourrez plus lui confier de trajets directement. Ses trajets en cours ne changent pas.',
      confirmText: l.status === 'pending' ? 'Annuler l’invitation' : 'Retirer',
      danger: true,
    });
    if (!ok) return;
    this.removing = l.driverUid;
    try {
      await httpsCallable(this.fns, 'bizRemoveDriver')({ driverId: l.driverUid });
      toastSuccess(l.status === 'pending' ? 'Invitation annulée' : 'Chauffeur retiré');
    } catch (e: any) {
      toastError('Action impossible', e?.message);
    } finally {
      this.removing = null;
    }
  }
}
