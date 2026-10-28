import { Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, onSnapshot } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import Swal from 'sweetalert2';
import { toMillis } from '../../services/hub-format';
import { confirmAction, toastError, toastSuccess } from '../../../shared/swal';
import { BIZ_NEEDS, BIZ_SECTORS } from '../../../user-dashboard/business/biz-request.component';

type Status = 'pending' | 'contacted' | 'approved' | 'rejected';

interface RequestRow {
  uid: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  sector: string;
  city: string;
  taxId: string;
  website: string;
  monthlyTrips: string;
  needs: string[];
  message: string;
  status: Status;
  reviewNote: string;
  submissions: number;
  createdAt: number;
  updatedAt: number;
  reviewedAt: number;
}

const STATUS_LABEL: Record<Status, string> = { pending: 'New', contacted: 'Contacted', approved: 'Approved', rejected: 'Refused' };
const STATUS_TONE: Record<Status, string> = { pending: 'tone-warning', contacted: 'tone-info', approved: 'tone-success', rejected: 'tone-danger' };

/**
 * Business requests (admin): accounts asking for Shnell Business from /app.
 * Call the company, mark it contacted, then approve (turns users.business
 * on) or refuse with a reason the customer sees. All through the audited
 * `adminBusinessRequest` function.
 */
@Component({
  selector: 'app-business-requests-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './business-requests-tab.component.html',
  styleUrls: ['../../hub.css'],
})
export class BusinessRequestsTabComponent implements OnInit, OnDestroy {
  @Output() openAccount = new EventEmitter<string>();

  private fs = inject(Firestore);
  private fns = inject(Functions);

  rows: RequestRow[] = [];
  filter: 'open' | Status | 'all' = 'open';
  search = '';
  busy: string | null = null;
  loading = true;
  expanded: string | null = null;
  readonly statusLabel = STATUS_LABEL;
  readonly statusTone = STATUS_TONE;

  private unsub?: () => void;

  ngOnInit(): void {
    this.unsub = onSnapshot(collection(this.fs, 'business_requests'), (s) => {
      this.rows = s.docs.map((d) => {
        const r: any = d.data();
        return {
          uid: d.id, company: String(r.company || ''), contactName: String(r.contactName || ''), phone: String(r.phone || ''),
          email: String(r.email || ''), sector: String(r.sector || ''), city: String(r.city || ''), taxId: String(r.taxId || ''),
          website: String(r.website || ''), monthlyTrips: String(r.monthlyTrips || ''),
          needs: Array.isArray(r.needs) ? r.needs : [], message: String(r.message || ''),
          status: (r.status || 'pending') as Status, reviewNote: String(r.reviewNote || ''),
          submissions: Number(r.submissions) || 1,
          createdAt: toMillis(r.createdAt), updatedAt: toMillis(r.updatedAt), reviewedAt: toMillis(r.reviewedAt),
        };
      }).sort((a, b) => b.updatedAt - a.updatedAt);
      this.loading = false;
    }, (e) => { console.warn('[business-requests]', e); this.loading = false; });
  }

  ngOnDestroy(): void { this.unsub?.(); }

  get shown(): RequestRow[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter((r) =>
      (this.filter === 'all' || (this.filter === 'open' ? (r.status === 'pending' || r.status === 'contacted') : r.status === this.filter)) &&
      (!q || `${r.company} ${r.contactName} ${r.phone} ${r.email} ${r.city}`.toLowerCase().includes(q)));
  }

  get kpis() {
    const week = Date.now() - 7 * 864e5;
    return {
      pending: this.rows.filter((r) => r.status === 'pending').length,
      contacted: this.rows.filter((r) => r.status === 'contacted').length,
      approved: this.rows.filter((r) => r.status === 'approved').length,
      week: this.rows.filter((r) => r.createdAt > week).length,
    };
  }

  sector(id: string): string { return BIZ_SECTORS.find((s) => s.id === id)?.label || id || '—'; }
  need(id: string): string { return BIZ_NEEDS.find((n) => n.id === id)?.label || id; }
  waLink(phone: string): string { return `https://wa.me/${phone.replace(/[^0-9]/g, '')}`; }

  async contacted(r: RequestRow): Promise<void> {
    const res = await Swal.fire({
      title: `Mark ${r.company} as contacted?`,
      input: 'text', inputPlaceholder: 'Call notes (internal, optional)',
      showCancelButton: true, confirmButtonText: 'Contacted', customClass: { popup: 'sh-swal' },
    });
    if (!res.isConfirmed) return;
    await this.call(r, 'contacted', String(res.value || ''), 'Marked as contacted');
  }

  async approve(r: RequestRow): Promise<void> {
    if (!(await confirmAction({
      title: `Turn on Shnell Business for ${r.company}?`,
      text: 'They can book up to 100 live trips and create API keys. They are notified at once.',
      confirmText: 'Approve',
    }))) return;
    await this.call(r, 'approve', '', 'Shnell Business enabled');
  }

  async reject(r: RequestRow): Promise<void> {
    const res = await Swal.fire({
      title: `Refuse ${r.company}?`,
      html: '<small>The reason is shown to the customer, who can complete the request and send it again.</small>',
      input: 'text', inputPlaceholder: 'Reason shown to the customer',
      inputValidator: (v) => (v && v.trim() ? null : 'A reason is required'),
      showCancelButton: true, confirmButtonText: 'Refuse', confirmButtonColor: '#D42F2F', customClass: { popup: 'sh-swal' },
    });
    if (!res.isConfirmed) return;
    await this.call(r, 'reject', String(res.value || ''), 'Request refused');
  }

  private async call(r: RequestRow, action: string, note: string, ok: string): Promise<void> {
    this.busy = r.uid;
    try {
      await httpsCallable(this.fns, 'adminBusinessRequest')({ userId: r.uid, action, note });
      toastSuccess(ok);
    } catch (e: any) {
      toastError(e?.message || 'Action failed');
    } finally {
      this.busy = null;
    }
  }
}
