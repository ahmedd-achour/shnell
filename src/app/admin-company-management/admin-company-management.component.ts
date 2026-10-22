import { Component, OnInit } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { confirmAction, toastSuccess, toastError } from '../shared/swal';

interface CompanyApplication {
  id: string;
  businessName?: string;
  email?: string;
  phone?: string;
  dailyVolume?: string;
  cinNumber?: string;
  cinFileUrl?: string;
  companyPaperUrl?: string;
  isAdminApproved?: boolean;
  plan?: 'payg' | 'pro';
  commissionRate?: number;
  subscriptionEnd?: any;
}

@Component({
  selector: 'app-admin-company-management',
  templateUrl: './admin-company-management.component.html',
  styleUrls: ['./admin-company-management.component.css']
})
export class AdminCompanyManagementComponent implements OnInit {
  companies$!: Observable<CompanyApplication[]>;
  pending$!: Observable<CompanyApplication[]>;
  approved$!: Observable<CompanyApplication[]>;

  isUpdating = false;

  constructor(private firestore: Firestore) {}

  ngOnInit(): void {
    this.companies$ = collectionData(collection(this.firestore, 'companies'), { idField: 'id' }) as Observable<CompanyApplication[]>;
    this.pending$ = this.companies$.pipe(map(list => list.filter(c => c.isAdminApproved !== true)));
    this.approved$ = this.companies$.pipe(map(list => list.filter(c => c.isAdminApproved === true)));
  }

  async approve(company: CompanyApplication) {
    const ok = await confirmAction({
      title: `Approuver ${company.businessName || company.id} ?`,
      text: 'Ce compte pourra immédiatement accéder à son espace professionnel.',
    });
    if (!ok) return;

    this.isUpdating = true;
    try {
      const batch = writeBatch(this.firestore);
      batch.update(doc(this.firestore, 'companies', company.id), { isAdminApproved: true });
      batch.update(doc(this.firestore, 'users', company.id), { role: 'company' });
      await batch.commit();
      toastSuccess('Compte professionnel approuvé');
    } catch (err) {
      console.error('Company approval failed:', err);
      toastError('Échec de l\'approbation du compte');
    } finally {
      this.isUpdating = false;
    }
  }

  /** Formats a Firestore Timestamp/Date/string `subscriptionEnd` for a `&lt;input type="date"&gt;` value. */
  subscriptionEndInputValue(company: CompanyApplication): string {
    const raw = company.subscriptionEnd;
    if (!raw) return '';
    const date: Date = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  /** Spec §12: switches a company between PAYG (default, global commission applies)
   *  and PRO (yearly subscription, `commissionRate` overrides the global percentage —
   *  typically set to 0). `subscriptionEndInput` is a yyyy-MM-dd string from the date input. */
  async setPlan(company: CompanyApplication, plan: 'payg' | 'pro', subscriptionEndInput?: string, commissionRate?: number) {
    this.isUpdating = true;
    try {
      const payload: Record<string, any> = { plan };
      if (plan === 'pro') {
        payload['subscriptionStart'] = new Date();
        payload['subscriptionEnd'] = subscriptionEndInput ? new Date(subscriptionEndInput) : null;
        payload['commissionRate'] = commissionRate ?? 0;
      } else {
        payload['commissionRate'] = commissionRate ?? null;
      }
      await updateDoc(doc(this.firestore, 'companies', company.id), payload);
      toastSuccess(plan === 'pro' ? 'Compte passé en PRO' : 'Compte repassé en PAYG');
    } catch (err) {
      console.error('Plan update failed:', err);
      toastError('Échec de la mise à jour du plan');
    } finally {
      this.isUpdating = false;
    }
  }

  async revoke(company: CompanyApplication) {
    const ok = await confirmAction({
      title: `Révoquer l'accès de ${company.businessName || company.id} ?`,
      text: 'Le compte repassera en attente de vérification.',
      danger: true,
    });
    if (!ok) return;

    this.isUpdating = true;
    try {
      const batch = writeBatch(this.firestore);
      batch.update(doc(this.firestore, 'companies', company.id), { isAdminApproved: false });
      batch.update(doc(this.firestore, 'users', company.id), { role: 'company-onheld' });
      await batch.commit();
      toastSuccess('Accès révoqué');
    } catch (err) {
      console.error('Company revoke failed:', err);
      toastError('Échec de la révocation');
    } finally {
      this.isUpdating = false;
    }
  }
}
