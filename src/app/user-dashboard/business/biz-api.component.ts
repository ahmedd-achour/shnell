import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, doc, onSnapshot, query, where } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { confirmAction, toastError, toastSuccess } from '../../shared/swal';
import { ApiDocsComponent } from './api-docs.component';

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAtMs: number;
  lastUsedAtMs: number;
  calls: number;
  ordersCreated: number;
  suspended: boolean;
}

interface Webhook {
  url: string;
  secret: string;
  failures: number;
  last: { atMs: number; type: string; status: number; ok: boolean } | null;
}

const MAX_KEYS = 5;

/**
 * Shnell Business → API: the account's keys (several, named, never
 * expiring), its webhook, and the API reference. Keys and webhooks are
 * written only by Cloud Functions (issueApiKey / revokeApiKey /
 * setApiWebhook / testApiWebhook); the page reads them live.
 */
@Component({
  selector: 'app-biz-api',
  standalone: true,
  imports: [CommonModule, FormsModule, ApiDocsComponent],
  templateUrl: './biz-api.component.html',
  styleUrls: ['./biz.css'],
})
export class BizApiComponent implements OnInit, OnDestroy {
  private fs = inject(Firestore);
  private auth = inject(Auth);
  private fns = inject(Functions);

  readonly maxKeys = MAX_KEYS;
  keys: ApiKeyRow[] = [];
  loadingKeys = true;
  newKeyName = '';
  /** Full key, shown once right after creation (only a hash is stored). */
  freshKey = '';
  busy = false;

  hook: Webhook | null = null;
  hookUrl = '';
  showSecret = false;
  hookBusy = false;

  apiBlocked = false;
  businessOn: boolean | null = null;

  private subs: (() => void)[] = [];

  ngOnInit(): void {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    this.subs.push(onSnapshot(
      query(collection(this.fs, 'api_keys'), where('uid', '==', uid), where('revoked', '==', false)),
      (s) => {
        const ms = (v: any) => (v?.toMillis ? v.toMillis() : 0);
        this.keys = s.docs.map((d) => {
          const k: any = d.data();
          return {
            id: d.id, name: String(k.name || 'API key'), prefix: String(k.prefix || ''),
            createdAtMs: ms(k.createdAt), lastUsedAtMs: ms(k.lastUsedAt),
            calls: Number(k.calls) || 0, ordersCreated: Number(k.ordersCreated) || 0, suspended: k.suspended === true,
          };
        }).sort((a, b) => b.createdAtMs - a.createdAtMs);
        this.loadingKeys = false;
      },
      () => { this.loadingKeys = false; },
    ));
    this.subs.push(onSnapshot(doc(this.fs, 'api_webhooks', uid), (s) => {
      const h: any = s.exists() ? s.data() : null;
      this.hook = h ? {
        url: String(h.url || ''), secret: String(h.secret || ''), failures: Number(h.failures) || 0,
        last: h.lastDelivery ? {
          atMs: h.lastDelivery.at?.toMillis ? h.lastDelivery.at.toMillis() : 0,
          type: String(h.lastDelivery.type || ''), status: Number(h.lastDelivery.status) || 0, ok: h.lastDelivery.ok === true,
        } : null,
      } : null;
      if (h && !this.hookUrl) this.hookUrl = this.hook!.url;
    }, () => { /* no webhook */ }));
    this.subs.push(onSnapshot(doc(this.fs, 'users', uid), (s) => {
      const u: any = s.data() || {};
      this.apiBlocked = u.apiBlocked === true;
      this.businessOn = u.business === true || String(u.role || '').toLowerCase() === 'admin';
    }));
  }

  ngOnDestroy(): void { this.subs.forEach((u) => u()); }

  /* ------------------------------ keys ------------------------------ */

  async createKey(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const res = await httpsCallable<{ name: string }, { key: string }>(this.fns, 'issueApiKey')({ name: this.newKeyName.trim() });
      this.freshKey = res.data.key;
      this.newKeyName = '';
      toastSuccess('Clé créée : copiez-la maintenant, elle ne sera plus affichée.');
    } catch (e: any) {
      toastError(e?.message || 'Création impossible');
    } finally {
      this.busy = false;
    }
  }

  async revoke(k: ApiKeyRow): Promise<void> {
    const ok = await confirmAction({
      title: `Révoquer « ${k.name} » ?`,
      text: `Les appels avec ${k.prefix}… seront refusés immédiatement. Irréversible.`,
      danger: true, confirmText: 'Révoquer',
    });
    if (!ok) return;
    try {
      await httpsCallable(this.fns, 'revokeApiKey')({ keyId: k.id });
      toastSuccess('Clé révoquée');
    } catch (e: any) {
      toastError(e?.message || 'Révocation impossible');
    }
  }

  /* ------------------------------ webhook ------------------------------ */

  async saveHook(rotate = false): Promise<void> {
    if (this.hookBusy) return;
    this.hookBusy = true;
    try {
      await httpsCallable(this.fns, 'setApiWebhook')({ url: this.hookUrl.trim(), rotate });
      toastSuccess(rotate ? 'Nouveau secret généré' : 'Webhook enregistré');
      this.showSecret = true;
    } catch (e: any) {
      toastError(e?.message || 'Enregistrement impossible');
    } finally {
      this.hookBusy = false;
    }
  }

  async removeHook(): Promise<void> {
    const ok = await confirmAction({ title: 'Supprimer le webhook ?', text: 'Plus aucun événement ne sera envoyé.', danger: true, confirmText: 'Supprimer' });
    if (!ok) return;
    try {
      await httpsCallable(this.fns, 'setApiWebhook')({ url: null });
      this.hookUrl = '';
      toastSuccess('Webhook supprimé');
    } catch (e: any) {
      toastError(e?.message || 'Suppression impossible');
    }
  }

  async testHook(): Promise<void> {
    if (this.hookBusy) return;
    this.hookBusy = true;
    try {
      const { data } = await httpsCallable<unknown, { ok: boolean; status: number }>(this.fns, 'testApiWebhook', { timeout: 30000 })({});
      if (data.ok) toastSuccess(`Votre serveur a répondu ${data.status}`);
      else toastError(data.status ? `Votre serveur a répondu ${data.status}` : 'Votre serveur ne répond pas (5 s)');
    } catch (e: any) {
      toastError(e?.message || 'Test impossible');
    } finally {
      this.hookBusy = false;
    }
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => toastSuccess('Copié')).catch(() => {});
  }
}
