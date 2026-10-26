import { Component, OnInit, OnDestroy, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LottieComponent, AnimationOptions } from 'ngx-lottie';
import {
  Firestore, collection, addDoc, doc, getDoc, getDocs, setDoc,
  query, where, serverTimestamp, Timestamp, onSnapshot, getCountFromServer
} from '@angular/fire/firestore';
import { Auth, signOut } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import mapboxgl from 'mapbox-gl';
import { Swal, toastSuccess, toastError, confirmAction } from '../shared/swal';
import { StopState, ExpeditorPayout } from '../../models';
import { stopStateFromDoc, expeditorPayoutFromDoc } from '../../Models/dropoffdata.model';
import { isUserBanned } from '../roleguard';
import {
  MAPBOX_TOKEN, MAPBOX_STYLE_STREET, MAPBOX_STYLE_SATELLITE,
  mapboxForwardGeocode, mapboxReverseGeocode, mapboxGeocodeOne, makeDotEl, tnLngLat,
} from '../shared/mapbox';
import * as XLSX from 'xlsx';
import { BizComposerComponent } from './business/biz-composer.component';
import { BizLiveComponent } from './business/biz-live.component';
import { BizService } from './business/biz.service';
import { BIZ_MAX_STOPS, BIZ_MAX_TRIPS, newStop } from './business/biz-models';

const MAX_JOBS = 50;
const MAX_STOPS = 250;
const ROAD_FACTOR = 1.3;

// Tunisia only — max pan bounds in [lng, lat] order for Mapbox
const TN_MAX_BOUNDS: [[number, number], [number, number]] = [[6.9, 29.8], [12.3, 38.0]];
const TN_CENTER: [number, number] = [36.8065, 10.1815];

interface JobStop {
  name: string;      // optional contact / recipient name
  address: string;
  phone: string;     // REQUIRED for professional data entry (>= 1 phone per stop)
  phone2: string;    // optional second contact phone
  description: string;
  parcelPrice: number | null;   // "frais de vente du colis" — cash to collect (TND)
  expeditorId: string;          // optional expeditor (sender) reference for money analysis
  lat: number | null;
  lng: number | null;
  suggests: any[];
  loading: boolean;
}

interface Job {
  id: string;
  title: string;
  step: 1 | 2 | 3;
  status: 'draft' | 'placing' | 'placed' | 'error';
  placedOrderId?: string;
  error?: string;

  pickupName: string;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupSuggests: any[];
  pickupLoading: boolean;

  stops: JobStop[];
  vehicleKey: string;

  priceMode: 'fixed' | 'bidding';
  computedPrice: number;
  currency: string;
  pricing: boolean;

  scheduleAt: string | null;
  budget: number | null;
  notes: string;
  equipment: string[];

  distanceKm: number;

  /** Direct-assign this job to one of the company's own drivers instead of
   *  broadcasting it to the open marketplace (see placeJob()). null/undefined
   *  keeps the existing broadcast/bidding behaviour unchanged. */
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
}

interface VehicleOption {
  key: string; name: string; category: string;
  maxWeight: number; volume: number; image: string; raw: any;
}

type LocTarget = { kind: 'pickup' } | { kind: 'stop'; index: number };

interface ParcelRow {
  id: string;
  name: string;
  phone: string;
  phone2: string;
  address: string;
  gov: string;
  product: string;
  description: string;
  price: number;
  parcelPrice: number | null;   // cash to collect on delivery (TND)
  expeditorId: string;          // '' when unset
  expeditorPayout: ExpeditorPayout;
  lat: number | null;
  lng: number | null;
  state: StopState;
  dist?: number;   // transient: distance (km) from the current anchor
}

/** One row parsed out of an uploaded spreadsheet by the AI column-mapper,
 *  staged for review before it is written to the `stops` collection. */
interface ImportedStop {
  name: string;
  phone: string;
  phone2: string;
  address: string;
  gov: string;
  description: string;
  parcelPrice: number | null;
  expeditorId: string;
  lat: number | null;
  lng: number | null;
  note: string;   // transient: geocode / validation feedback
  keep: boolean;  // included in the "register" batch
}

/** Per-expeditor rollup for the money-analysis table. */
interface ExpeditorRollup {
  expeditorId: string;
  total: number;
  pending: number;
  inRoute: number;
  delivered: number;
  notDelivered: number;
  collected: number;    // Σ parcelPrice where state === 'delivered'
  toCollect: number;    // Σ parcelPrice where state !== 'delivered'
  paidOut: number;      // Σ parcelPrice where delivered && expeditorPayout === 'paid'
  outstanding: number;  // Σ parcelPrice where delivered && expeditorPayout === 'unpaid'
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, LottieComponent, BizComposerComponent, BizLiveComponent],
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private functions = inject(Functions);
  private router = inject(Router);

  
  private biz = inject(BizService);
  @ViewChild('parcelMapEl') parcelMapRef?: ElementRef<HTMLDivElement>;

  // ---- parcels map ----
  private parcelMap: mapboxgl.Map | null = null;
  private parcelMarkers = new Map<string, mapboxgl.Marker>();
  private anchorMarker: mapboxgl.Marker | null = null;
  parcels: ParcelRow[] = [];
  loadingParcels = false;
  parcelSearch = '';
  parcelGov = '';
  parcelOnlyLocated = false;
  parcelOnlyPhone = false;
  parcelStatus: 'any' | StopState = 'any';
  readonly parcelStates: StopState[] = ['pending', 'inRoute', 'delivered', 'notDelivered'];
  readonly stateLabels: Record<StopState, string> = {
    pending: 'En attente', inRoute: 'En route', delivered: 'Livré', notDelivered: 'Non livré',
  };
  // ---- real-time ban wall ----
  banned = false;
  private banUnsub?: () => void;

  // ---- my drivers roster (home KPI; trips use BizService.fleet) ----
  myDriverIds: string[] = [];
  myDrivers: { id: string; name: string; phone: string }[] = [];

  // ---- home / business overview ----
  companyName = '';
  companyApproved: boolean | null = null; // null = still loading
  loadingOverview = true;
  ordersTotal = 0;
  ordersThisWeek = 0;

  // ---- Excel import (AI column-mapping -> stops pool) ----
  importStage: 'idle' | 'parsing' | 'ai' | 'geocoding' | 'ready' | 'saving' = 'idle';
  importFileName = '';
  importRawCount = 0;
  importRows: ImportedStop[] = [];
  importLog: string[] = [];
  importError = '';

  parcelAnchor: { lng: number; lat: number } | null = null;
  kNearest = 10;
  parcelSel = new Set<string>();
  parcelMapMode: 'street' | 'satellite' = 'street';

  // 'home' is the business snapshot a professional should land on first
  // (KPIs, account status, money owed/collected) — 'parcels' (Manage Stops)
  // is where you work the stop pool; 'jobs' defines and books trips
  // (biz-composer, server-priced), 'live' follows them (biz-live).
  view: 'home' | 'jobs' | 'live' | 'parcels' | 'api' = 'home';
  userEmail = '';
  userUid = '';

  // Lottie assets (src/assets/lotties) — spaces URL-encoded for the XHR loader.
  readonly lot: Record<'delivery' | 'emptyBox' | 'pin', AnimationOptions> = {
    delivery: { path: 'assets/lotties/Delivery.json', loop: true, autoplay: true },
    emptyBox: { path: 'assets/lotties/Empty%20box.json', loop: true, autoplay: true },
    pin:      { path: 'assets/lotties/Map%20Location%20Pointer.json', loop: true, autoplay: true },
  };


  // API section
  get apiEndpoint(): string {
    return 'https://us-central1-shnell-393a6.cloudfunctions.net/createOrderViaApi';
  }
  apiLang: 'curl' | 'node' | 'python' = 'curl';

  /** The full key, shown ONCE right after it is created (only a hash is stored). */
  newApiKey = '';
  /** Prefix of the live key (api_keys, server-written). */
  apiKeyPrefix = '';
  apiKeyBusy = false;

  private get apiKeyOrPlaceholder(): string { return this.newApiKey || '<YOUR_API_KEY>'; }

  private async loadApiKeyPrefix(): Promise<void> {
    if (!this.userUid) return;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'api_keys'),
        where('uid', '==', this.userUid), where('revoked', '==', false)));
      this.apiKeyPrefix = snap.empty ? '' : String(snap.docs[0].data()['prefix'] || '');
    } catch {
      this.apiKeyPrefix = '';
    }
  }

  async createApiKey(): Promise<void> {
    if (this.apiKeyBusy) return;
    if (this.apiKeyPrefix) {
      const ok = await confirmAction({
        title: 'Nouvelle clé API',
        text: 'La clé actuelle cessera immédiatement de fonctionner. Continuer ?',
        danger: true,
        confirmText: 'Créer une nouvelle clé',
      });
      if (!ok) return;
    }
    this.apiKeyBusy = true;
    try {
      const res = await httpsCallable<unknown, { key: string; prefix: string }>(this.functions, 'issueApiKey')({});
      this.newApiKey = res.data.key;
      this.apiKeyPrefix = res.data.prefix;
      toastSuccess('Clé créée : copiez-la maintenant, elle ne sera plus affichée.');
    } catch (e: any) {
      toastError(e?.message || 'Échec de la création de la clé');
    } finally {
      this.apiKeyBusy = false;
    }
  }

  get sampleBody(): string {
    return `{
  "vehicleType": "medium",
  "priceMode": "fixed",
  "pickup": { "address": "Dépôt Ariana", "lat": 36.8625, "lng": 10.1956 },
  "stops": [
    { "name": "Client A", "phone": "+21620000000", "phone2": "+21629000000",
      "address": "Sousse centre", "lat": 35.8256, "lng": 10.6084,
      "description": "2 cartons fragiles", "parcelPrice": 120, "expeditorId": "boutique-x" }
  ],
  "scheduleAt": "2026-01-15T09:00:00Z",
  "notes": "Fragile",
  "notifyDrivers": true
}`;
  }

  get apiCurl(): string {
    return `curl -X POST "${this.apiEndpoint}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${this.apiKeyOrPlaceholder}" \\
  -d '${this.sampleBody.replace(/\n/g, '\n  ')}'`;
  }
  get apiNode(): string {
    return `const res = await fetch("${this.apiEndpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "${this.apiKeyOrPlaceholder}"
  },
  body: JSON.stringify(${this.sampleBody})
});
const data = await res.json();
console.log(data); // { success, orderId, price, currency, distanceKm, stopIds }`;
  }
  get apiPython(): string {
    return `import requests

res = requests.post(
    "${this.apiEndpoint}",
    headers={"x-api-key": "${this.apiKeyOrPlaceholder}"},
    json=${this.sampleBody.replace(/true/g, 'True')}
)
print(res.json())  # { success, orderId, price, currency, distanceKm, stopIds }`;
  }
  get apiSnippet(): string {
    return this.apiLang === 'node' ? this.apiNode
      : this.apiLang === 'python' ? this.apiPython
      : this.apiCurl;
  }

  readonly apiParams = [
    { k: 'vehicleType', t: 'string', req: true, d: 'A key from your fleet settings (settings/vehicles), e.g. "medium".' },
    { k: 'priceMode', t: '"fixed" | "bidding"', req: false, d: 'Fixed uses your per-km rate; bidding opens the order to driver bids. Default "fixed".' },
    { k: 'pickup', t: 'object', req: true, d: '{ address, lat, lng, name?, phone? } — must be inside Tunisia.' },
    { k: 'stops', t: 'object[]', req: true, d: 'Up to 250 { address, lat, lng, phone (required), name?, phone2?, description?, parcelPrice?, expeditorId? }, all inside Tunisia. parcelPrice = cash to collect on delivery (TND); expeditorId groups parcels for per-expeditor money analysis.' },
    { k: 'scheduleAt', t: 'ISO 8601', req: false, d: 'Future pickup time. Omit for "now".' },
    { k: 'notes', t: 'string', req: false, d: 'Free text shown to the driver.' },
    { k: 'budget', t: 'number', req: false, d: 'Optional cap for bidding mode.' },
    { k: 'notifyDrivers', t: 'boolean', req: false, d: 'Push to nearby drivers immediately. Default true.' },
  ];
  readonly apiErrors = [
    { c: '401', m: 'Missing or unknown x-api-key header.' },
    { c: '403', m: 'The account behind this API key is banned / inactive.' },
    { c: '400', m: 'A stop is missing its required phone number, or a field failed validation.' },
    { c: '422', m: 'A coordinate is outside Tunisia, or vehicleType is not in your fleet.' },
    { c: '429', m: 'Too many requests — throttle to ≤ 5 orders/second.' },
    { c: '500', m: 'Order could not be created; safe to retry with the same body.' },
  ];

  // ---------- lifecycle ----------
  async ngOnInit(): Promise<void> {
    this.userEmail = this.auth.currentUser?.email || '';
    this.userUid = this.auth.currentUser?.uid || '';
    this.loadApiKeyPrefix();

    // Defence-in-depth beyond AuthedGuard: a user banned mid-session is kicked
    // out the next time this view initialises.
    if (this.userUid) {
      try {
        const uSnap = await getDoc(doc(this.firestore, 'users', this.userUid));
        if (uSnap.exists() && isUserBanned(uSnap.data())) {
          await signOut(this.auth).catch(() => {});
          this.router.navigateByUrl('/sign-in?banned=1');
          return;
        }
      } catch { /* fail open */ }
      // Live watch — a ban applied while the user is working stops them at once,
      // no refresh needed. Losing read access to one's own user doc mid-session
      // (permission-denied) is also treated as a lockout.
      this.banUnsub = onSnapshot(
        doc(this.firestore, 'users', this.userUid),
        (snap) => { if (snap.exists() && isUserBanned(snap.data())) this.enforceBanNow(); },
        (err: any) => { if (err?.code === 'permission-denied') this.enforceBanNow(); },
      );
    }

    this.loadParcels();
    this.loadMyDrivers();
    this.loadOverview();
  }

  /** Roster of drivers this company account is linked to (users/{uid}.drivers,
   *  managed from /profile) — the pool a job can be direct-assigned to. */
  async loadMyDrivers(): Promise<void> {
    if (!this.userUid) return;
    try {
      const snap = await getDoc(doc(this.firestore, 'users', this.userUid));
      const ids: string[] = (snap.exists() ? (snap.data() as any)?.drivers : []) || [];
      this.myDriverIds = ids;
      if (ids.length === 0) { this.myDrivers = []; return; }

      const rows = await Promise.all(ids.map(async (id) => {
        const dSnap = await getDoc(doc(this.firestore, 'users', id));
        const d = dSnap.exists() ? (dSnap.data() as any) : null;
        return d ? { id, name: d.name || 'Chauffeur', phone: d.phone || '' } : null;
      }));
      this.myDrivers = rows.filter((r): r is { id: string; name: string; phone: string } => r !== null);
    } catch (err) {
      console.error('loadMyDrivers failed:', err);
    }
  }

  /** The business snapshot for the home view — server-truth counts (not the
   *  localStorage lifetimePlaced counter, which is per-browser and resets on
   *  a new device), account verification status, and the COD figures already
   *  computed from the live stops pool (see parcelKpis). */
  async loadOverview(): Promise<void> {
    this.loadingOverview = true;
    try {
      const uid = this.userUid;
      if (!uid) return;

      const [userSnap, companySnap] = await Promise.all([
        getDoc(doc(this.firestore, 'users', uid)),
        getDoc(doc(this.firestore, 'companies', uid)),
      ]);
      this.companyName = (userSnap.exists() ? (userSnap.data() as any)?.name : '') || '';
      this.companyApproved = companySnap.exists() ? (companySnap.data() as any)?.isAdminApproved === true : null;

      const ordersCol = collection(this.firestore, 'orders');
      const totalQ = query(ordersCol, where('userID', '==', uid));
      const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekQ = query(ordersCol, where('userID', '==', uid), where('timestamp', '>=', weekAgo));

      const [totalCount, weekCount] = await Promise.all([
        getCountFromServer(totalQ),
        getCountFromServer(weekQ),
      ]);
      this.ordersTotal = totalCount.data().count;
      this.ordersThisWeek = weekCount.data().count;
    } catch (err) {
      console.error('loadOverview failed:', err);
    } finally {
      this.loadingOverview = false;
    }
  }

  ngOnDestroy(): void {
    if (this.parcelMap) { this.parcelMap.remove(); this.parcelMap = null; }
    this.banUnsub?.();
  }

  /** Immediate, refresh-free lockout: raise the ban wall, freeze the maps,
   *  then sign the user out and bounce them to /sign-in. */
  private enforceBanNow(): void {
    if (this.banned) return;
    this.banned = true;
    try { this.parcelMap?.remove(); this.parcelMap = null; } catch { /* noop */ }
    this.importStage = 'idle';
    Swal.fire({
      icon: 'error',
      title: 'Compte suspendu',
      text: "Votre accès à l'espace professionnel Shnell vient d'être suspendu.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      customClass: { popup: 'sh-swal' },
    });
    setTimeout(async () => {
      this.banUnsub?.();
      await signOut(this.auth).catch(() => {});
      this.router.navigateByUrl('/sign-in?banned=1');
    }, 2600);
  }

  setView(v: 'home' | 'jobs' | 'live' | 'parcels' | 'api'): void {
    this.view = v;
    if (v === 'parcels') setTimeout(() => this.initParcelMap(), 60);
  }

  /** Great-circle distance in km between two [lat, lng] points. */
  private haversine(a: [number, number], b: [number, number]): number {
    const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ==========================================================================
  //  PARCELS MAP — the pro user's stored stops, filter + k-nearest + batch
  // ==========================================================================
  async loadParcels(): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    this.loadingParcels = true;
    try {
      const col = collection(this.firestore, 'stops');
      // stops are written with `definedBy` (new canonical), `createdBy` (partner
      // import) or `clientId` (portal) — all set to the professional user's UID.
      const snaps = await Promise.all([
        getDocs(query(col, where('definedBy', '==', uid))).catch(() => null),
        getDocs(query(col, where('createdBy', '==', uid))).catch(() => null),
        getDocs(query(col, where('clientId', '==', uid))).catch(() => null),
      ]);
      const seen = new Set<string>();
      const rows: ParcelRow[] = [];
      for (const snap of snaps) {
        if (!snap) continue;
        for (const d of snap.docs) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          rows.push(this.parcelFromDoc(d.id, d.data() as any));
        }
      }
      this.parcels = rows;
      if (this.view === 'parcels') { this.renderParcelMarkers(); }
    } catch (e) {
      console.warn('loadParcels', e);
    } finally {
      this.loadingParcels = false;
    }
  }

  private parcelFromDoc(id: string, data: any): ParcelRow {
    const dest = data?.destination || {};
    let lat: number | null = dest.latitude ?? dest.lat ?? null;
    let lng: number | null = dest.longitude ?? dest.lng ?? null;
    if (lat != null && lng != null) {
      const ll = tnLngLat([lng, lat]);
      if (ll) { lng = ll[0]; lat = ll[1]; }
    }
    const pp = Number(data?.parcelPrice);
    return {
      id,
      name: data?.name || data?.receiverName || '',
      phone: data?.phoneNumber || data?.receiverPhone || '',
      phone2: data?.receiverPhone2 || '',
      address: data?.destinationName || '',
      gov: data?.gov || '',
      product: data?.productName || '',
      description: data?.description || '',
      price: Number(data?.price || 0),
      parcelPrice: isFinite(pp) && pp > 0 ? pp : null,
      expeditorId: (data?.expeditorId || '').toString().trim(),
      expeditorPayout: expeditorPayoutFromDoc(data),
      lat: (lat != null && isFinite(lat)) ? lat : null,
      lng: (lng != null && isFinite(lng)) ? lng : null,
      state: stopStateFromDoc(data),
    };
  }

  // ==========================================================================
  //  PER-EXPEDITOR MONEY ANALYSIS  —  group parcels by expeditorId
  // ==========================================================================
  get expeditorRollups(): ExpeditorRollup[] {
    const m = new Map<string, ExpeditorRollup>();
    for (const p of this.parcels) {
      const key = p.expeditorId || '—';
      let r = m.get(key);
      if (!r) {
        r = {
          expeditorId: key, total: 0, pending: 0, inRoute: 0, delivered: 0, notDelivered: 0,
          collected: 0, toCollect: 0, paidOut: 0, outstanding: 0,
        };
        m.set(key, r);
      }
      r.total++;
      r[p.state]++;
      const cod = p.parcelPrice || 0;
      if (p.state === 'delivered') {
        r.collected += cod;
        if (p.expeditorPayout === 'paid') r.paidOut += cod; else r.outstanding += cod;
      } else {
        r.toCollect += cod;
      }
    }
    const round = (n: number) => Number(n.toFixed(2));
    return [...m.values()]
      .map(r => ({ ...r, collected: round(r.collected), toCollect: round(r.toCollect), paidOut: round(r.paidOut), outstanding: round(r.outstanding) }))
      .sort((a, b) => b.outstanding - a.outstanding || b.total - a.total);
  }

  /** Flip every DELIVERED, still-unpaid parcel of one expeditor to expeditorPayout: 'paid'. */
  async markExpeditorPaid(expeditorId: string): Promise<void> {
    const key = expeditorId === '—' ? '' : expeditorId;
    const targets = this.parcels.filter(p =>
      (p.expeditorId || '') === key && p.state === 'delivered' && p.expeditorPayout === 'unpaid');
    if (!targets.length) { toastError('Aucun colis livré non réglé pour cet expéditeur'); return; }
    const sum = targets.reduce((n, p) => n + (p.parcelPrice || 0), 0);
    const ok = await confirmAction({
      title: `Marquer réglé — ${expeditorId} ?`,
      html: `<b>${targets.length}</b> colis livré(s) · <b>${sum.toFixed(2)} TND</b> encaissé(s) seront marqués comme reversés à l'expéditeur.`,
      confirmText: 'Marquer réglé',
    });
    if (!ok) return;
    try {
      await Promise.all(targets.map(p => setDoc(
        doc(this.firestore, 'stops', p.id),
        { expeditorPayout: 'paid', paidToExpeditorAt: serverTimestamp() },
        { merge: true },
      )));
      targets.forEach(p => (p.expeditorPayout = 'paid'));
      toastSuccess(`${targets.length} colis marqué(s) réglé(s) à l'expéditeur`);
    } catch (e) {
      console.warn('markExpeditorPaid', e);
      toastError('Échec de la mise à jour');
    }
  }

  get parcelGovs(): string[] {
    return Array.from(new Set(this.parcels.map(p => p.gov).filter(Boolean))).sort();
  }

  get filteredParcels(): ParcelRow[] {
    const q = this.parcelSearch.toLowerCase().trim();
    return this.parcels.filter(p => {
      if (this.parcelOnlyLocated && p.lat == null) return false;
      if (this.parcelOnlyPhone && !p.phone) return false;
      if (this.parcelGov && p.gov !== this.parcelGov) return false;
      if (this.parcelStatus !== 'any' && p.state !== this.parcelStatus) return false;
      if (!q) return true;
      return [p.name, p.phone, p.address, p.gov, p.product, p.expeditorId].join(' ').toLowerCase().includes(q);
    });
  }

  get parcelKpis(): {
    total: number; located: number; filtered: number; selected: number; value: number;
    collected: number; toCollect: number;
  } {
    const f = this.filteredParcels;
    const cod = (p: ParcelRow) => p.parcelPrice || 0;
    return {
      total: this.parcels.length,
      located: this.parcels.filter(p => p.lat != null).length,
      filtered: f.length,
      selected: this.parcelSel.size,
      value: Number(this.parcels.filter(p => this.parcelSel.has(p.id)).reduce((n, p) => n + p.price, 0).toFixed(2)),
      // COD money already collected (delivered) vs. still outstanding
      collected: Number(this.parcels.filter(p => p.state === 'delivered').reduce((n, p) => n + cod(p), 0).toFixed(2)),
      toCollect: Number(this.parcels.filter(p => p.state !== 'delivered').reduce((n, p) => n + cod(p), 0).toFixed(2)),
    };
  }

  private initParcelMap(): void {
    if (!this.parcelMapRef?.nativeElement) return;
    if (this.parcelMap) { this.parcelMap.resize(); this.renderParcelMarkers(); return; }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    this.parcelMap = new mapboxgl.Map({
      container: this.parcelMapRef.nativeElement,
      style: this.parcelMapMode === 'satellite' ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_STREET,
      center: [10.1815, 36.8065],
      zoom: 6.4,
      attributionControl: false,
    });
    this.parcelMap.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    this.parcelMap.addControl(new mapboxgl.AttributionControl({ compact: true }));
    this.parcelMap.on('load', () => { this.parcelMap?.resize(); this.renderParcelMarkers(); });
    this.parcelMap.on('click', (e) => this.setAnchor(e.lngLat.lng, e.lngLat.lat));
  }

  setParcelMapMode(m: 'street' | 'satellite'): void {
    if (m === this.parcelMapMode) return;
    this.parcelMapMode = m;
    this.parcelMap?.setStyle(m === 'satellite' ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_STREET);
  }

  private renderParcelMarkers(): void {
    if (!this.parcelMap) return;
    this.parcelMarkers.forEach(m => m.remove());
    this.parcelMarkers.clear();

    const bounds = new mapboxgl.LngLatBounds();
    const visible = new Set(this.filteredParcels.map(p => p.id));

    this.parcels.forEach(p => {
      if (p.lat == null || p.lng == null || !visible.has(p.id)) return;
      const sel = this.parcelSel.has(p.id);
      const stateColor: Record<StopState, string> = {
        pending: '#FFB300', inRoute: '#2563EB', delivered: '#938B7D', notDelivered: '#D42F2F',
      };
      const el = makeDotEl(sel ? '#12805C' : stateColor[p.state], sel ? 15 : 11);
      if (sel) el.firstElementChild?.classList.add('is-sel');
      el.addEventListener('click', (ev) => { ev.stopPropagation(); this.toggleParcelSel(p.id); });
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.lng, p.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
          `<div class="map-driver-popup"><h6 class="fw-bold mb-1">${p.name || 'Parcel'}</h6>` +
          `<p class="mb-1 small">${p.address || '—'}</p>` +
          `<p class="mb-0 fs-8 muted">${this.stateLabels[p.state]}${p.gov ? ' · ' + p.gov : ''}${p.phone ? ' · ' + p.phone : ''}${p.parcelPrice ? ' · à encaisser ' + p.parcelPrice + ' TND' : ''}</p></div>`
        ))
        .addTo(this.parcelMap!);
      this.parcelMarkers.set(p.id, marker);
      bounds.extend([p.lng, p.lat]);
    });

    if (this.parcelAnchor) bounds.extend([this.parcelAnchor.lng, this.parcelAnchor.lat]);
    if (!bounds.isEmpty()) this.parcelMap.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 500 });
  }

  setAnchor(lng: number, lat: number): void {
    this.parcelAnchor = { lng, lat };
    if (this.parcelMap) {
      if (this.anchorMarker) this.anchorMarker.setLngLat([lng, lat]);
      else {
        const el = document.createElement('div');
        el.className = 'mbx-marker';
        el.innerHTML = '<div class="mbx-anchor"><i class="bi bi-crosshair"></i></div>';
        this.anchorMarker = new mapboxgl.Marker({ element: el, anchor: 'center', draggable: true })
          .setLngLat([lng, lat]).addTo(this.parcelMap);
        this.anchorMarker.on('dragend', () => {
          const p = this.anchorMarker!.getLngLat();
          this.parcelAnchor = { lng: p.lng, lat: p.lat };
        });
      }
    }
  }
  anchorFromParcel(p: ParcelRow): void {
    if (p.lat != null && p.lng != null) {
      this.setAnchor(p.lng, p.lat);
      this.parcelMap?.flyTo({ center: [p.lng, p.lat], zoom: 11, duration: 700 });
    }
  }
  clearAnchor(): void {
    this.parcelAnchor = null;
    this.anchorMarker?.remove();
    this.anchorMarker = null;
  }

  /** Select the K parcels nearest the anchor (great-circle), within the filter. */
  findKNearest(): void {
    if (!this.parcelAnchor) { toastError('Drop an anchor on the map first'); return; }
    const a: [number, number] = [this.parcelAnchor.lat, this.parcelAnchor.lng];
    const ranked = this.filteredParcels
      .filter(p => p.lat != null && p.lng != null)
      .map(p => ({ p, d: this.haversine(a, [p.lat as number, p.lng as number]) }))
      .sort((x, y) => x.d - y.d);
    ranked.forEach(r => (r.p.dist = Number(r.d.toFixed(2))));
    const k = Math.max(1, Math.min(this.kNearest, ranked.length));
    this.parcelSel = new Set(ranked.slice(0, k).map(r => r.p.id));
    this.renderParcelMarkers();
  }

  toggleParcelSel(id: string): void {
    this.parcelSel.has(id) ? this.parcelSel.delete(id) : this.parcelSel.add(id);
    this.renderParcelMarkers();
  }
  selectAllFilteredParcels(): void {
    this.parcelSel = new Set(this.filteredParcels.filter(p => p.lat != null).map(p => p.id));
    this.renderParcelMarkers();
  }
  clearParcelSel(): void { this.parcelSel.clear(); this.renderParcelMarkers(); }

  onParcelFilterChange(): void { this.renderParcelMarkers(); }

  // ==========================================================================
  //  EXCEL IMPORT  —  upload → AI column-mapping (Gemini) → review → stops pool
  //  Imported rows land in the `stops` collection tagged `definedBy = <uid>`,
  //  NOT attached to any order. Filter + batch them into a job afterwards.
  // ==========================================================================
  private readonly TN_GOVS = [
    'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa', 'Jendouba', 'Kairouan',
    'Kasserine', 'Kébili', 'Le Kef', 'Mahdia', 'La Manouba', 'Médenine', 'Monastir',
    'Nabeul', 'Sfax', 'Sidi Bouzid', 'Siliana', 'Sousse', 'Tataouine', 'Tozeur', 'Tunis', 'Zaghouan',
  ];
  private readonly IMPORT_MAX_ROWS = 1500;
  private readonly AI_CHUNK = 60;

  get importKeepCount(): number { return this.importRows.filter(r => r.keep).length; }
  get importLocatedCount(): number { return this.importRows.filter(r => r.keep && r.lat != null).length; }

  private log(msg: string): void {
    this.importLog = [...this.importLog, msg].slice(-40);
  }

  private resetImport(): void {
    this.importStage = 'idle';
    this.importRows = [];
    this.importLog = [];
    this.importError = '';
    this.importFileName = '';
    this.importRawCount = 0;
  }

  async cancelImport(): Promise<void> {
    if (this.importRows.length && this.importStage !== 'saving') {
      const ok = await confirmAction({
        title: 'Abandonner cet import ?',
        text: `${this.importRows.length} ligne(s) analysée(s) seront perdues.`,
        danger: true, confirmText: 'Abandonner',
      });
      if (!ok) return;
    }
    this.resetImport();
  }

  async onStopsFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toastError('Choisissez un fichier .xlsx, .xls ou .csv');
      return;
    }

    this.resetImport();
    this.importFileName = file.name;
    this.importStage = 'parsing';
    this.importError = '';
    this.log(`Lecture de ${file.name}…`);

    try {
      const raw = await this.parseWorkbook(file);
      if (!raw.length) { this.importError = 'Aucune ligne de données trouvée.'; this.importStage = 'idle'; return; }
      if (raw.length > this.IMPORT_MAX_ROWS) {
        this.log(`⚠︎ ${raw.length} lignes — seules les ${this.IMPORT_MAX_ROWS} premières seront traitées.`);
      }
      const rows = raw.slice(0, this.IMPORT_MAX_ROWS);
      this.importRawCount = rows.length;
      this.log(`${rows.length} ligne(s) — extraction intelligente des colonnes…`);

      this.importStage = 'ai';
      const mapped = await this.aiMapRows(rows);
      if (!mapped.length) { this.importError = "L'extraction IA n'a renvoyé aucune ligne exploitable."; this.importStage = 'idle'; return; }
      this.importRows = mapped;
      this.log(`${mapped.length} arrêt(s) reconnus — géocodage des adresses…`);

      this.importStage = 'geocoding';
      await this.geocodeImportRows();

      this.importStage = 'ready';
      this.log(`Prêt : ${this.importLocatedCount}/${this.importKeepCount} localisés. Vérifiez puis enregistrez.`);
    } catch (e: any) {
      console.error('stops import', e);
      this.importError = e?.message || "Échec de l'import.";
      this.importStage = 'idle';
    }
  }

  private async parseWorkbook(file: File): Promise<any[]> {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    // pick the sheet with the most rows
    let best: any[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as any[];
      if (json.length > best.length) best = json;
    }
    return best;
  }

  /** Runs the raw rows through Gemini in chunks, mapping arbitrary column
   *  names/languages/typos onto our stop schema. */
  private async aiMapRows(rawRows: any[]): Promise<ImportedStop[]> {
    const out: ImportedStop[] = [];
    for (let i = 0; i < rawRows.length; i += this.AI_CHUNK) {
      const chunk = rawRows.slice(i, i + this.AI_CHUNK);
      this.log(`IA : lignes ${i + 1}–${i + chunk.length}…`);
      const mapped = await this.geminiMapChunk(chunk);
      for (const m of mapped) out.push(this.normalizeImported(m));
    }
    // drop rows with neither an address nor a phone — nothing to act on
    return out.filter(r => r.address || r.phone);
  }

  /** One chunk through the aiMapStops function (Gemini runs server-side,
   *  the key never reaches the browser). */
  private async geminiMapChunk(rows: any[]): Promise<any[]> {
    try {
      const res = await httpsCallable<{ rows: any[]; govs: string[] }, { stops: any[] }>(
        this.functions, 'aiMapStops', { timeout: 130_000 })({ rows, govs: [...this.TN_GOVS] });
      if (Array.isArray(res.data?.stops)) return res.data.stops;
    } catch (e: any) {
      throw new Error(`Appel IA échoué : ${e?.message || e}`);
    }
    throw new Error('Réponse IA non exploitable (JSON attendu).');
  }

  private normalizeImported(o: any): ImportedStop {
    const num = Number(String(o?.parcelPrice ?? '').toString().replace(',', '.'));
    const gov = this.TN_GOVS.find(g => g.toLowerCase() === String(o?.gov || '').trim().toLowerCase()) || '';
    return {
      name: String(o?.name || '').trim(),
      phone: String(o?.phone || '').trim(),
      phone2: String(o?.phone2 || '').trim(),
      address: String(o?.address || '').trim(),
      gov,
      description: String(o?.description || '').trim(),
      parcelPrice: isFinite(num) && num > 0 ? num : null,
      expeditorId: String(o?.expeditorId || '').trim(),
      lat: null,
      lng: null,
      note: '',
      keep: true,
    };
  }

  private async geocodeImportRows(): Promise<void> {
    let done = 0;
    for (const r of this.importRows) {
      if (!r.keep) continue;
      if (!r.address) { r.note = 'pas d’adresse'; continue; }
      try {
        const hit = await mapboxGeocodeOne(r.gov ? `${r.address}, ${r.gov}` : r.address);
        if (hit) {
          r.lat = hit.lat; r.lng = hit.lng;
          r.note = 'localisé';
        } else {
          r.note = 'adresse introuvable — à épingler plus tard';
        }
      } catch {
        r.note = 'géocodage indisponible';
      }
      if (++done % 15 === 0) this.log(`Géocodage : ${done}/${this.importKeepCount}…`);
    }
  }

  /** Persist the kept rows into `stops`, tagged to this professional user. */
  async registerImportedStops(): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) { this.router.navigateByUrl('/sign-in'); return; }
    const keep = this.importRows.filter(r => r.keep && (r.address || r.lat != null));
    if (!keep.length) { toastError('Rien à enregistrer'); return; }

    const unlocated = keep.filter(r => r.lat == null).length;
    const ok0 = await confirmAction({
      title: `Enregistrer ${keep.length} arrêt(s) dans le pool ?`,
      html: unlocated
        ? `${keep.length - unlocated} localisé(s), <b>${unlocated} sans position</b> (à épingler plus tard).<br>Ils ne seront rattachés à aucune commande.`
        : `Tous localisés. Ils rejoignent le pool, sans être rattachés à une commande.`,
      confirmText: 'Enregistrer',
    });
    if (!ok0) return;

    this.importStage = 'saving';
    this.log(`Enregistrement de ${keep.length} arrêt(s)…`);
    let ok = 0, fail = 0;
    for (const r of keep) {
      try {
        await addDoc(collection(this.firestore, 'stops'), {
          destination: (r.lat != null && r.lng != null)
            ? { latitude: r.lat, longitude: r.lng }
            : null,
          destinationName: r.address || null,
          name: r.name || null,
          receiverPhone: r.phone || null,
          receiverPhone2: r.phone2 || null,
          gov: r.gov || null,
          description: r.description || null,
          parcelPrice: r.parcelPrice ?? 0,
          expeditorId: r.expeditorId || null,
          expeditorPayout: 'unpaid' as ExpeditorPayout,
          state: 'pending' as StopState,
          isDelivered: false,            // legacy mirror
          definedBy: uid,
          createdBy: uid,
          source: 'excel-import',
          importedAt: serverTimestamp(),
        });
        ok++;
      } catch (e) {
        console.warn('register stop', e);
        fail++;
      }
    }

    this.log(`Terminé : ${ok} enregistré(s)${fail ? `, ${fail} échec(s)` : ''}.`);
    if (ok) toastSuccess(`${ok} arrêt(s) ajoutés au pool`);
    if (fail && !ok) toastError('Aucun arrêt enregistré');
    await this.loadParcels();
    if (!fail) this.resetImport();
    else this.importStage = 'ready';
  }

  /** Selected pool stops -> a new trip draft in the composer (pickup = the map anchor). */
  async createOrderFromParcels(): Promise<void> {
    await this.biz.init();
    const chosen = this.parcels.filter(p => this.parcelSel.has(p.id) && p.lat != null && p.lng != null);
    if (!chosen.length) { toastError('Sélectionnez au moins un arrêt localisé'); return; }
    if (chosen.length > BIZ_MAX_STOPS) { toastError(`${BIZ_MAX_STOPS} arrêts maximum par trajet`); return; }
    if (this.biz.drafts.length >= BIZ_MAX_TRIPS) { toastError(`${BIZ_MAX_TRIPS} trajets maximum`); return; }

    const anchor = this.parcelAnchor;
    this.biz.addDraft({
      title: `Lot · ${chosen.length} arrêt(s)`,
      stops: chosen.map(p => ({
        ...newStop(), poolId: p.id,
        name: p.name, address: p.address || `${p.lat}, ${p.lng}`, phone: p.phone, phone2: p.phone2 || '',
        description: p.description || '', parcelPrice: p.parcelPrice ?? null, expeditorId: p.expeditorId || '',
        lat: p.lat, lng: p.lng,
      })),
      ...(anchor ? {
        pickupLat: anchor.lat, pickupLng: anchor.lng,
        pickupAddress: (await mapboxReverseGeocode(anchor.lat, anchor.lng)) || `${anchor.lat.toFixed(5)}, ${anchor.lng.toFixed(5)}`,
      } : {}),
    });
    this.parcelSel.clear();
    this.setView('jobs');
    toastSuccess(`Trajet préparé avec ${chosen.length} arrêt(s) — choisissez retrait et véhicules`);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.router.navigateByUrl('/sign-in');
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => toastSuccess('Copied')).catch(() => {});
  }

  locatedStops(j: Job): number { return j.stops.filter(s => s.lat != null).length; }
  stopsWithPhone(j: Job): number { return j.stops.filter(s => s.phone.trim()).length; }
  stopsWithName(j: Job): number { return j.stops.filter(s => s.name.trim()).length; }
  stopsWithDesc(j: Job): number { return j.stops.filter(s => s.description.trim()).length; }


  step1Ok(j: Job): boolean {
    return !!j.pickupAddress.trim() && j.pickupLat != null
      && j.stops.length > 0
      && j.stops.every(s => !!s.address.trim() && s.lat != null && !!s.phone.trim());
  }


  // ---------- Tunisia-only geocoding (Mapbox) ----------
  private async geocodeTN(q: string): Promise<any[]> {
    return mapboxForwardGeocode(q, 6);
  }
  private async reverseTN(lat: number, lng: number): Promise<string | null> {
    return mapboxReverseGeocode(lat, lng);
  }

}
