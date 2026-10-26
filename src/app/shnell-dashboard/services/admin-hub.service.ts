import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore, collection, collectionData, doc, docData, query, where, orderBy, limit,
  updateDoc, serverTimestamp, documentId,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith } from 'rxjs/operators';
import { AuditRow, LedgerRow, normalizeAudit, normalizeLedger, toMillis } from './hub-format';

/**
 * Data + server actions of the admin hub (Finance, Activity, Alerts,
 * Account 360, topbar bell / search). Every write that touches money or an
 * account goes through a Cloud Function, which logs it in admin_audit.
 */
@Injectable({ providedIn: 'root' })
export class AdminHubService {
  private fs = inject(Firestore);
  private fns = inject(Functions);
  private auth = inject(Auth);

  get myUid(): string { return this.auth.currentUser?.uid || ''; }

  private safe<T>(o: Observable<T>, empty: T): Observable<T> {
    return o.pipe(catchError(err => { console.error('[hub]', err); return of(empty); }));
  }

  private call<I, O = any>(name: string) {
    const fn = httpsCallable<I, O>(this.fns, name);
    return async (data: I): Promise<O> => (await fn(data)).data;
  }

  /* ------------------------------ ledger ------------------------------ */

  /** Latest ledger lines of the whole platform (newest first). */
  ledger$(sinceMs: number, max = 1000): Observable<LedgerRow[]> {
    const q = query(collection(this.fs, 'commissions'),
      where('time', '>=', new Date(sinceMs)), orderBy('time', 'desc'), limit(max));
    return this.safe(collectionData(q, { idField: 'id' }).pipe(map(l => l.map(normalizeLedger))), []);
  }

  /** Every ledger line of one account, whatever owner field the line uses. */
  userLedger$(uid: string): Observable<LedgerRow[]> {
    const one = (field: string) => this.safe(collectionData(
      query(collection(this.fs, 'commissions'), where(field, '==', uid), orderBy('time', 'desc'), limit(300)),
      { idField: 'id' }), [] as any[]).pipe(startWith([] as any[]));
    return combineLatest(['uid', 'DriverId', 'driverId', 'userId'].map(one)).pipe(
      map(lists => {
        const byId = new Map<string, any>();
        lists.flat().forEach(d => byId.set(d.id, d));
        return [...byId.values()].map(normalizeLedger).sort((a, b) => b.time - a.time);
      }));
  }

  /* ------------------------------ audit ------------------------------ */

  audit$(max = 300): Observable<AuditRow[]> {
    const q = query(collection(this.fs, 'admin_audit'), orderBy('at', 'desc'), limit(max));
    return this.safe(collectionData(q, { idField: 'id' }).pipe(map(l => l.map(normalizeAudit))), []);
  }

  userAudit$(uid: string): Observable<AuditRow[]> {
    const q = query(collection(this.fs, 'admin_audit'), where('targetUid', '==', uid), orderBy('at', 'desc'), limit(200));
    return this.safe(collectionData(q, { idField: 'id' }).pipe(map(l => l.map(normalizeAudit))), []);
  }

  /* ------------------------------ alerts ------------------------------ */

  /** Open alerts, shared by the bell, the sidebar badge and the Alerts tab. */
  readonly openAlerts$: Observable<any[]> = this.safe(collectionData(
    query(collection(this.fs, 'admin_alerts'), where('resolved', '==', false), orderBy('lastAt', 'desc'), limit(200)),
    { idField: 'id' }), [] as any[]).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  recentAlerts$(max = 300): Observable<any[]> {
    const q = query(collection(this.fs, 'admin_alerts'), orderBy('lastAt', 'desc'), limit(max));
    return this.safe(collectionData(q, { idField: 'id' }), []);
  }

  userAlerts$(uid: string): Observable<any[]> {
    const one = (f: string) => this.safe(collectionData(
      query(collection(this.fs, 'admin_alerts'), where(f, '==', uid), limit(100)), { idField: 'id' }), [] as any[])
      .pipe(startWith([] as any[]));
    return combineLatest([one('driverId'), one('clientId')]).pipe(
      map(([a, b]) => [...a, ...b].sort((x, y) => toMillis(y.lastAt) - toMillis(x.lastAt))));
  }

  async resolveAlert(id: string, note?: string): Promise<void> {
    await updateDoc(doc(this.fs, 'admin_alerts', id), {
      resolved: true, resolvedBy: this.myUid, resolvedAt: serverTimestamp(),
      ...(note ? { note: note.slice(0, 300) } : {}),
    });
  }

  /* ------------------------------ recharges ------------------------------ */

  readonly pendingRecharges$: Observable<any[]> = this.safe(collectionData(
    query(collection(this.fs, 'recharge_requests'), where('status', '==', 'pending')), { idField: 'id' }), [] as any[])
    .pipe(map(l => l.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))), shareReplay({ bufferSize: 1, refCount: true }));

  rechargeRequests$(max = 200): Observable<any[]> {
    const q = query(collection(this.fs, 'recharge_requests'), orderBy('createdAt', 'desc'), limit(max));
    return this.safe(collectionData(q, { idField: 'id' }), []);
  }

  /** Daily cash-count reports (reports/recharges_YYYY-MM-DD), newest first. */
  rechargeReports$(max = 31): Observable<any[]> {
    const q = query(collection(this.fs, 'reports'),
      where(documentId(), '>=', 'recharges_'), where(documentId(), '<', 'recharges_~'),
      orderBy(documentId(), 'desc'), limit(max));
    return this.safe(collectionData(q, { idField: 'id' }), []);
  }

  readonly config$: Observable<any> = this.safe(docData(doc(this.fs, 'settings', 'config')), null)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));

  /* ------------------------------ account 360 ------------------------------ */

  user$(uid: string): Observable<any> {
    return this.safe(docData(doc(this.fs, 'users', uid), { idField: 'uid' }), null);
  }

  wallet$(uid: string): Observable<any> {
    return this.safe(docData(doc(this.fs, 'wallets', uid)), null);
  }

  driverFile$(uid: string): Observable<any> {
    return this.safe(docData(doc(this.fs, 'drivers', uid)), null);
  }

  devices$(uid: string): Observable<any[]> {
    return this.safe(collectionData(query(collection(this.fs, 'notifications'), where('userId', '==', uid)), { idField: 'id' }), []);
  }

  inbox$(uid: string): Observable<any[]> {
    const q = query(collection(this.fs, 'users', uid, 'inbox'), orderBy('createdAt', 'desc'), limit(50));
    return this.safe(collectionData(q, { idField: 'id' }), []);
  }

  vehicles$(uid: string): Observable<any[]> {
    return this.safe(collectionData(query(collection(this.fs, 'vehicles'), where('idDriver', '==', uid)), { idField: 'id' }), []);
  }

  /** Orders the account placed (customer / partner side). */
  ordersOf$(uid: string): Observable<any[]> {
    return this.safe(collectionData(query(collection(this.fs, 'orders'), where('userID', '==', uid), limit(300)), { idField: 'id' }), []);
  }

  /** Deals the account drove (driver side) and deals on its orders (customer side). */
  dealsOf$(uid: string): Observable<{ asDriver: any[]; asClient: any[] }> {
    const one = (f: string) => this.safe(collectionData(
      query(collection(this.fs, 'deals'), where(f, '==', uid), limit(300)), { idField: 'id' }), [] as any[])
      .pipe(startWith([] as any[]));
    return combineLatest([one('idDriver'), one('idUser')]).pipe(map(([asDriver, asClient]) => ({ asDriver, asClient })));
  }

  calls$(uid: string): Observable<any[]> {
    const q = query(collection(this.fs, 'call_logs'), where('participants', 'array-contains', uid), limit(100));
    return this.safe(collectionData(q, { idField: 'id' }), []);
  }

  /* ------------------------------ audited server actions ------------------------------ */

  updateAccount = this.call<{ userId: string; isBan?: boolean; accType?: string; isVerified?: boolean; business?: boolean; note?: string },
    { success: boolean; changed: string[] }>('adminUpdateAccount');

  reviewVehicle = this.call<{ vehicleId: string; approve?: boolean; type?: string; remove?: boolean }>('adminReviewVehicle');

  saveSettings = this.call<{ docId: 'config' | 'vehicles' | 'service_areas' | 'dispatch'; data: any },
    { success: boolean; changed: string[] }>('adminSaveSettings');

  cancelOrder = this.call<{ orderId: string; reason?: string }>('adminCancelOrder');

  retryDispatch = this.call<{ orderId: string }>('retryOrderDispatch');

  resetPassword = this.call<{ email: string; newPassword: string }>('updateUserPasswordAdmin');

  broadcast = this.call<{ title: string; body: string; userIds?: string[]; topic?: string; category?: string }>('adminBroadcast');

  /** Admin assistant (Gemini over live data). Several tool rounds: allow 3 min. */
  async askAssistant(question: string, history: AssistantTurn[]): Promise<AssistantAnswer> {
    const fn = httpsCallable<{ question: string; history: AssistantTurn[] }, AssistantAnswer>(this.fns, 'adminAssistant', { timeout: 180000 });
    return (await fn({ question, history })).data;
  }
}

export interface AssistantTurn { role: 'user' | 'model'; text: string; }
export interface AssistantStep { tool: string; args: any; summary: string; ms: number; }
export interface AssistantAnswer { answer: string; steps: AssistantStep[]; model: string | null; tokens: number; }
