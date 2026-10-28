import { Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, onSnapshot } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { toastError, toastSuccess } from '../../shared/swal';
import { BizVideoComponent } from '../../shared/biz-video.component';

type ReqStatus = 'pending' | 'contacted' | 'approved' | 'rejected';

export const BIZ_SECTORS: { id: string; label: string }[] = [
  { id: 'ecommerce', label: 'E-commerce / vente en ligne' },
  { id: 'retail', label: 'Commerce / magasins' },
  { id: 'distribution', label: 'Distribution / grossiste' },
  { id: 'construction', label: 'BTP / matériaux' },
  { id: 'moving', label: 'Déménagement' },
  { id: 'industry', label: 'Industrie / usine' },
  { id: 'agri_food', label: 'Agroalimentaire' },
  { id: 'other', label: 'Autre' },
];
export const BIZ_VOLUMES = ['1-20', '20-100', '100-500', '500+'];
export const BIZ_NEEDS: { id: string; label: string; icon: string }[] = [
  { id: 'web', label: 'Réserver des trajets depuis le web', icon: 'bi-window-stack' },
  { id: 'api', label: 'Connecter mon logiciel (API)', icon: 'bi-code-slash' },
  { id: 'fleet', label: 'Gérer mes propres chauffeurs', icon: 'bi-truck' },
  { id: 'cod', label: 'Paiement à la livraison', icon: 'bi-cash-coin' },
  { id: 'scheduled', label: 'Trajets programmés', icon: 'bi-calendar-check' },
];

/**
 * Shown in /app to an account without Shnell Business: what the pro space
 * gives, then the request form (requestBusinessAccess). The request's
 * status (business_requests/{uid}) is followed live; when an admin
 * approves, users.business flips and the shell emits `activated`.
 */
@Component({
  selector: 'app-biz-request',
  standalone: true,
  imports: [CommonModule, FormsModule, BizVideoComponent],
  templateUrl: './biz-request.component.html',
  styleUrls: ['./biz.css', './biz-request.component.css'],
})
export class BizRequestComponent implements OnInit, OnDestroy {
  private fs = inject(Firestore);
  private auth = inject(Auth);
  private fns = inject(Functions);
  @Output() activated = new EventEmitter<void>();

  readonly sectors = BIZ_SECTORS;
  readonly volumes = BIZ_VOLUMES;
  readonly needList = BIZ_NEEDS;

  loading = true;
  status: ReqStatus | null = null;
  reviewNote = '';
  submittedAtMs = 0;
  editing = false;
  busy = false;

  form = {
    company: '', contactName: '', phone: '', sector: '', monthlyTrips: '', city: '', taxId: '', website: '', message: '',
    needs: new Set<string>(['web']),
  };

  private unsubs: (() => void)[] = [];

  async ngOnInit(): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    // Pre-fill from the profile (name + the WhatsApp-verified number).
    const me = await getDoc(doc(this.fs, 'users', uid)).catch(() => null);
    const u: any = me?.exists() ? me.data() : {};
    this.form.contactName = String(u.name || '');
    this.form.phone = String(u.phone || '');

    this.unsubs.push(onSnapshot(doc(this.fs, 'business_requests', uid), (s) => {
      this.loading = false;
      if (!s.exists()) { this.status = null; return; }
      const r: any = s.data();
      this.status = r.status;
      this.reviewNote = String(r.reviewNote || '');
      this.submittedAtMs = r.updatedAt?.toMillis?.() || Date.now();
      if (!this.editing) {
        Object.assign(this.form, {
          company: r.company || '', contactName: r.contactName || this.form.contactName, phone: r.phone || this.form.phone,
          sector: r.sector || '', monthlyTrips: r.monthlyTrips || '', city: r.city || '', taxId: r.taxId || '',
          website: r.website || '', message: r.message || '',
        });
        this.form.needs = new Set<string>(Array.isArray(r.needs) ? r.needs : []);
      }
    }, () => { this.loading = false; }));

    this.unsubs.push(onSnapshot(doc(this.fs, 'users', uid), (s) => {
      if (s.exists() && (s.data() as any).business === true) this.activated.emit();
    }));
  }

  ngOnDestroy(): void { this.unsubs.forEach((u) => u()); }

  get showForm(): boolean { return !this.loading && (this.status === null || this.status === 'rejected' || this.editing); }

  toggleNeed(id: string): void { this.form.needs.has(id) ? this.form.needs.delete(id) : this.form.needs.add(id); }

  get valid(): boolean {
    const f = this.form;
    return f.company.trim().length >= 2 && f.contactName.trim().length >= 2 &&
      /^\+?[0-9 ()-]{8,20}$/.test(f.phone.trim()) && !!f.sector && !!f.monthlyTrips;
  }

  async submit(): Promise<void> {
    if (!this.valid || this.busy) return;
    this.busy = true;
    try {
      await httpsCallable(this.fns, 'requestBusinessAccess')({ ...this.form, needs: [...this.form.needs] });
      this.editing = false;
      toastSuccess('Demande envoyée');
    } catch (e: any) {
      toastError('Envoi impossible', e?.message || 'Réessayez dans un instant.');
    } finally {
      this.busy = false;
    }
  }
}
