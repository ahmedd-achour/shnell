import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, onSnapshot, query, where } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import Swal from 'sweetalert2';
import { ShnellUser } from '../../models/dashboard.models';
import { toMillis } from '../../services/hub-format';
import { confirmAction, toastError, toastSuccess } from '../../../shared/swal';

interface KeyRow {
  id: string;
  uid: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number;
  lastIp: string;
  calls: number;
  ordersCreated: number;
  revoked: boolean;
  suspended: boolean;
  suspendNote: string;
}

interface AccountRow {
  uid: string;
  name: string;
  email: string;
  apiBlocked: boolean;
  keys: number;
  calls: number;
  orders: number;
  lastUsedAt: number;
  webhook: { url: string; failures: number; ok: boolean | null } | null;
}

/**
 * API access (admin): every public-API key and every business account
 * using the API — usage, last call, webhook health — and the switches to
 * stop misuse: suspend / reactivate / revoke a key, block an account's API
 * access. All writes go through the audited `adminApiAccess` function.
 */
@Component({
  selector: 'app-api-access-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './api-access-tab.component.html',
  styleUrls: ['../../hub.css'],
})
export class ApiAccessTabComponent implements OnInit, OnDestroy {
  @Input() users: ShnellUser[] = [];
  @Output() openAccount = new EventEmitter<string>();

  private fs = inject(Firestore);
  private fns = inject(Functions);

  keys: KeyRow[] = [];
  hooks = new Map<string, any>();
  blocked = new Set<string>();
  business: { uid: string; name: string; email: string }[] = [];
  view: 'accounts' | 'keys' = 'accounts';
  showRevoked = false;
  search = '';
  busy: string | null = null;
  loading = true;

  private subs: (() => void)[] = [];

  ngOnInit(): void {
    this.subs.push(onSnapshot(collection(this.fs, 'api_keys'), (s) => {
      this.keys = s.docs.map((d) => {
        const k: any = d.data();
        return {
          id: d.id, uid: String(k.uid || ''), name: String(k.name || 'API key'), prefix: String(k.prefix || ''),
          createdAt: toMillis(k.createdAt), lastUsedAt: toMillis(k.lastUsedAt), lastIp: String(k.lastIp || ''),
          calls: Number(k.calls) || 0, ordersCreated: Number(k.ordersCreated) || 0,
          revoked: k.revoked === true, suspended: k.suspended === true, suspendNote: String(k.suspendNote || ''),
        };
      }).sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt));
      this.loading = false;
    }, (e) => { console.warn('[api-access] keys', e); this.loading = false; }));
    this.subs.push(onSnapshot(collection(this.fs, 'api_webhooks'), (s) => {
      this.hooks = new Map(s.docs.map((d) => [d.id, d.data()]));
    }, (e) => console.warn('[api-access] webhooks', e)));
    this.subs.push(onSnapshot(query(collection(this.fs, 'users'), where('business', '==', true)), (s) => {
      this.business = s.docs.map((d) => {
        const u: any = d.data();
        return { uid: d.id, name: String(u.name || u.companyName || ''), email: String(u.email || '') };
      });
      this.blocked = new Set(s.docs.filter((d) => (d.data() as any).apiBlocked === true).map((d) => d.id));
    }, (e) => console.warn('[api-access] business users', e)));
  }

  ngOnDestroy(): void { this.subs.forEach((u) => u()); }

  name(uid: string): string {
    const u: any = this.users.find((x: any) => x.id === uid || x.uid === uid);
    return u?.name || this.business.find((b) => b.uid === uid)?.name || uid.slice(0, 8);
  }

  get accounts(): AccountRow[] {
    const uids = new Set<string>([...this.business.map((b) => b.uid), ...this.keys.map((k) => k.uid)]);
    const q = this.search.trim().toLowerCase();
    return [...uids].map((uid) => {
      const live = this.keys.filter((k) => k.uid === uid && !k.revoked);
      const h = this.hooks.get(uid);
      const b = this.business.find((x) => x.uid === uid);
      return {
        uid,
        name: this.name(uid),
        email: b?.email || '',
        apiBlocked: this.blocked.has(uid),
        keys: live.length,
        calls: live.reduce((s, k) => s + k.calls, 0),
        orders: this.keys.filter((k) => k.uid === uid).reduce((s, k) => s + k.ordersCreated, 0),
        lastUsedAt: Math.max(0, ...live.map((k) => k.lastUsedAt)),
        webhook: h ? { url: String(h.url || ''), failures: Number(h.failures) || 0, ok: h.lastDelivery ? h.lastDelivery.ok === true : null } : null,
      };
    }).filter((a) => !q || `${a.name} ${a.email} ${a.uid}`.toLowerCase().includes(q))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt || b.keys - a.keys);
  }

  get shownKeys(): KeyRow[] {
    const q = this.search.trim().toLowerCase();
    return this.keys.filter((k) => (this.showRevoked || !k.revoked) &&
      (!q || `${k.name} ${k.prefix} ${k.uid} ${this.name(k.uid)}`.toLowerCase().includes(q)));
  }

  get kpis() {
    const live = this.keys.filter((k) => !k.revoked);
    const day = Date.now() - 864e5;
    return {
      accounts: new Set(live.map((k) => k.uid)).size,
      keys: live.length,
      suspended: live.filter((k) => k.suspended).length,
      blocked: this.blocked.size,
      active24h: live.filter((k) => k.lastUsedAt > day).length,
      orders: this.keys.reduce((s, k) => s + k.ordersCreated, 0),
    };
  }

  keysOf(uid: string): KeyRow[] { return this.keys.filter((k) => k.uid === uid && !k.revoked); }

  async keyAction(k: KeyRow, action: 'suspend' | 'reactivate' | 'revoke'): Promise<void> {
    const labels = { suspend: 'Suspend', reactivate: 'Reactivate', revoke: 'Revoke' };
    let note = '';
    if (action === 'reactivate') {
      if (!(await confirmAction({ title: `Reactivate ${k.prefix}…?`, text: `${this.name(k.uid)} · ${k.name}`, confirmText: 'Reactivate' }))) return;
    } else {
      const r = await Swal.fire({
        title: `${labels[action]} ${k.prefix}…?`,
        html: `${this.name(k.uid)} · ${k.name}<br><small>${action === 'revoke'
          ? 'Permanent: the key stops working and can never be turned back on.'
          : 'Calls are refused with 403 key_suspended until you reactivate it.'}</small>`,
        input: 'text', inputPlaceholder: 'Reason (kept in the audit log)',
        showCancelButton: true, confirmButtonText: labels[action], confirmButtonColor: '#D42F2F',
        customClass: { popup: 'sh-swal' },
      });
      if (!r.isConfirmed) return;
      note = String(r.value || '');
    }
    await this.call(k.id, { action, keyId: k.id, note }, `${labels[action]}d`);
  }

  async accountAction(a: AccountRow, action: 'block' | 'unblock'): Promise<void> {
    let note = '';
    if (action === 'block') {
      const r = await Swal.fire({
        title: `Block API access for ${a.name}?`,
        html: '<small>Every key of this account is refused (403 api_blocked) and no new key or webhook can be set. Their app and dashboard keep working.</small>',
        input: 'text', inputPlaceholder: 'Reason (kept in the audit log)',
        showCancelButton: true, confirmButtonText: 'Block API', confirmButtonColor: '#D42F2F',
        customClass: { popup: 'sh-swal' },
      });
      if (!r.isConfirmed) return;
      note = String(r.value || '');
    } else if (!(await confirmAction({ title: `Unblock API access for ${a.name}?`, confirmText: 'Unblock' }))) {
      return;
    }
    await this.call(a.uid, { action, userId: a.uid, note }, action === 'block' ? 'API access blocked' : 'API access restored');
  }

  private async call(busyKey: string, data: any, ok: string): Promise<void> {
    this.busy = busyKey;
    try {
      await httpsCallable(this.fns, 'adminApiAccess')(data);
      toastSuccess(ok);
    } catch (e: any) {
      toastError(e?.message || 'Action failed');
    } finally {
      this.busy = null;
    }
  }
}
