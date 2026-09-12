import { Component, OnInit, OnDestroy, AfterViewInit, AfterViewChecked, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LottieComponent, AnimationOptions } from 'ngx-lottie';
import Chart from 'chart.js/auto';
import {
  Firestore, collection, addDoc, doc, getDoc, getDocs, setDoc,
  query, where, serverTimestamp, Timestamp, onSnapshot
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
import { RemoteConfigService } from '../shared/remote-config.service';
import * as XLSX from 'xlsx';

const MAX_JOBS = 10;
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
  imports: [CommonModule, FormsModule, LottieComponent],
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit, OnDestroy, AfterViewInit, AfterViewChecked {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private functions = inject(Functions);
  private router = inject(Router);
  private remoteConfig = inject(RemoteConfigService);



  
  @ViewChild('pinMapEl') pinMapRef!: ElementRef<HTMLDivElement>;
  @ViewChild('statusChartEl') statusChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('stopsChartEl') stopsChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('parcelMapEl') parcelMapRef?: ElementRef<HTMLDivElement>;
  private statusChart?: Chart;
  private stopsChart?: Chart;

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

  // ---- analytics ----
  showInsights = true;

  // ---- visual stop query / bulk tools (per active job, transient) ----
  stopQ: { field: 'address' | 'name' | 'phone'; op: 'contains' | 'empty' | 'notEmpty' | 'located' | 'unlocated'; value: string } =
    { field: 'address', op: 'contains', value: '' };
  bulkSel = new Set<number>();

  readonly maxJobs = MAX_JOBS;
  readonly maxStops = MAX_STOPS;
  readonly steps = ['Itinéraire', 'Véhicule', 'Tarif'];

  view: 'jobs' | 'parcels' | 'api' = 'jobs';
  userEmail = '';
  userUid = '';
  countryCode = 'TN';
  stopFee = 0.4;

  vehicleOptions: VehicleOption[] = [];
  loadingVehicles = true;

  jobs: Job[] = [];
  activeJobId = '';
  dispatchingAll = false;

  private searchTimer: any = null;

  // ---- retention: local draft autosave + lifetime stats + recent pickups ----
  private readonly LS_JOBS = 'sh_ud_jobs_v1';
  private readonly LS_ACTIVE = 'sh_ud_active_v1';
  private readonly LS_PLACED_TOTAL = 'sh_ud_placed_total';
  private readonly LS_RECENT_PICKUPS = 'sh_ud_recent_pickups';
  private saveTimer: any = null;
  private autoSaveInterval: any = null;
  private onBeforeUnload = () => this.persistNow();
  lifetimePlaced = 0;
  draftRestored = false;
  recentPickups: { address: string; lat: number; lng: number }[] = [];

  // ---- pin picker modal ----
  pinOpen = false;
  pinTarget: LocTarget = { kind: 'pickup' };
  pinLat = TN_CENTER[0]; pinLng = TN_CENTER[1];
  pinName = '';
  pinLoading = false;
  private pinMap: mapboxgl.Map | null = null;
  private pinMarker: mapboxgl.Marker | null = null;
  pinMode: 'street' | 'satellite' = 'street';

  readonly equipmentOptions = [
    'Heavy straps', 'Moving blankets', 'Hand truck / trolley',
    'Extra helper', 'Packaging boxes', 'Disassembly tools'
  ];

  // Lottie assets (src/assets/lotties) — spaces URL-encoded for the XHR loader.
  readonly lot: Record<'delivery' | 'emptyBox' | 'pin', AnimationOptions> = {
    delivery: { path: 'assets/lotties/Delivery.json', loop: true, autoplay: true },
    emptyBox: { path: 'assets/lotties/Empty%20box.json', loop: true, autoplay: true },
    pin:      { path: 'assets/lotties/Map%20Location%20Pointer.json', loop: true, autoplay: true },
  };
  /** Route-step hero shows only while the active job is still untouched. */
  get activeJobUntouched(): boolean {
    const j = this.activeJob;
    return !!j && !j.pickupAddress.trim() && j.stops.length <= 1 && !(j.stops[0]?.address || '').trim();
  }

  /** Live Mapbox static thumbnail of the active job's route (pickup + located stops). */
  get routeStaticUrl(): string | null {
    const j = this.activeJob;
    if (!j || j.pickupLat == null || j.pickupLng == null) return null;
    const pins = [`pin-s-a+0E7A5F(${j.pickupLng},${j.pickupLat})`];
    j.stops.forEach((s, i) => {
      if (s.lat != null && s.lng != null && pins.length < 15) {
        pins.push(`pin-s-${(i + 1) % 10}+FFB300(${s.lng},${s.lat})`);
      }
    });
    return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${pins.join(',')}`
      + `/auto/560x300@2x?padding=44&access_token=${MAPBOX_TOKEN}`;
  }

  // API section
  get apiEndpoint(): string {
    return 'https://us-central1-shnell-393a6.cloudfunctions.net/createOrderViaApi';
  }
  apiLang: 'curl' | 'node' | 'python' = 'curl';

  private get apiKeyOrPlaceholder(): string { return this.userUid || '<YOUR_USER_UID>'; }

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

    this.loadStats();
    if (!this.restoreDraft()) {
      this.jobs = [this.newJob(1)];
      this.activeJobId = this.jobs[0].id;
    } else {
      this.draftRestored = true;
      toastSuccess('Brouillon restauré');
    }

    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.autoSaveInterval = setInterval(() => this.persistNow(), 5000);

    await Promise.all([this.loadVehicles(), this.loadConfig()]);
    this.loadParcels();
  }
  ngOnDestroy(): void {
    if (this.pinMap) { this.pinMap.remove(); this.pinMap = null; }
    if (this.parcelMap) { this.parcelMap.remove(); this.parcelMap = null; }
    this.statusChart?.destroy();
    this.stopsChart?.destroy();
    this.banUnsub?.();
    clearInterval(this.autoSaveInterval);
    clearTimeout(this.saveTimer);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    if (!this.banned) this.persistNow();
  }

  // ---------- local draft persistence (retention: never lose work) ----------
  private loadStats(): void {
    try {
      this.lifetimePlaced = Number(localStorage.getItem(this.LS_PLACED_TOTAL)) || 0;
      const rp = JSON.parse(localStorage.getItem(this.LS_RECENT_PICKUPS) || '[]');
      if (Array.isArray(rp)) this.recentPickups = rp.filter(r => r && r.address && r.lat != null).slice(0, 4);
    } catch { /* private mode / disabled storage */ }
  }

  /** Returns true when a meaningful draft was restored into `this.jobs`. */
  private restoreDraft(): boolean {
    try {
      const raw = localStorage.getItem(this.LS_JOBS);
      if (!raw) return false;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return false;
      const jobs = arr.slice(0, MAX_JOBS).map((j: any) => this.hydrateJob(j));
      const meaningful = jobs.some((j: Job) =>
        j.pickupAddress.trim() || j.stops.some(s => s.address.trim() || s.phone.trim()));
      if (!meaningful) return false;
      this.jobs = jobs;
      const act = localStorage.getItem(this.LS_ACTIVE);
      this.activeJobId = this.jobs.find(j => j.id === act)?.id || this.jobs[0].id;
      return true;
    } catch { return false; }
  }

  private hydrateJob(j: any): Job {
    const base = this.newJob(1);
    const stops = (Array.isArray(j?.stops) && j.stops.length ? j.stops : [null])
      .map((s: any) => ({ ...this.newStop(), ...(s || {}), suggests: [], loading: false }));
    return {
      ...base, ...j,
      pickupSuggests: [], pickupLoading: false, pricing: false,
      equipment: Array.isArray(j?.equipment) ? j.equipment : [],
      status: j?.status === 'placing' ? 'draft' : (j?.status || 'draft'),
      stops,
    };
  }

  scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), 700);
  }
  private persistNow(): void {
    try {
      const slim = this.jobs.map(j => ({
        ...j, pickupSuggests: [], pickupLoading: false, pricing: false,
        stops: j.stops.map(s => ({ ...s, suggests: [], loading: false })),
      }));
      localStorage.setItem(this.LS_JOBS, JSON.stringify(slim));
      localStorage.setItem(this.LS_ACTIVE, this.activeJobId);
    } catch { /* ignore */ }
  }
  private clearDraft(): void {
    try { localStorage.removeItem(this.LS_JOBS); localStorage.removeItem(this.LS_ACTIVE); } catch { /* ignore */ }
  }

  private rememberPickup(address: string, lat: number | null, lng: number | null): void {
    if (!address?.trim() || lat == null || lng == null) return;
    const a = address.trim();
    this.recentPickups = [{ address: a, lat, lng }, ...this.recentPickups.filter(r => r.address !== a)].slice(0, 4);
    try { localStorage.setItem(this.LS_RECENT_PICKUPS, JSON.stringify(this.recentPickups)); } catch { /* ignore */ }
  }
  useRecentPickup(j: Job, r: { address: string; lat: number; lng: number }): void {
    j.pickupAddress = r.address; j.pickupLat = r.lat; j.pickupLng = r.lng; j.pickupSuggests = [];
    this.recalcDistance(j);
    this.scheduleSave();
  }

  /** Immediate, refresh-free lockout: raise the ban wall, freeze the maps,
   *  then sign the user out and bounce them to /sign-in. */
  private enforceBanNow(): void {
    if (this.banned) return;
    this.banned = true;
    try { this.pinMap?.remove(); this.pinMap = null; } catch { /* noop */ }
    try { this.parcelMap?.remove(); this.parcelMap = null; } catch { /* noop */ }
    this.pinOpen = false;
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

  setView(v: 'jobs' | 'parcels' | 'api'): void {
    this.view = v;
    if (v === 'parcels') setTimeout(() => this.initParcelMap(), 60);
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.refreshCharts(), 0);
  }

  private chartSig = '';
  ngAfterViewChecked(): void {
    if (this.view !== 'jobs' || !this.showInsights) return;
    const sig = this.jobs.map(j => `${j.status}:${j.stops.length}:${j.stops.filter(s => s.lat != null).length}`).join('|');
    if (sig !== this.chartSig) {
      this.chartSig = sig;
      setTimeout(() => this.refreshCharts(), 0);
    }
  }

  // ---------- analytics ----------
  get kpiTotalStops(): number { return this.jobs.reduce((n, j) => n + j.stops.length, 0); }
  get kpiLocatedStops(): number { return this.jobs.reduce((n, j) => n + j.stops.filter(s => s.lat != null).length, 0); }
  get kpiTotalDistance(): number { return Number(this.jobs.reduce((n, j) => n + (j.distanceKm || 0), 0).toFixed(1)); }
  get kpiReady(): number { return this.jobs.filter(j => this.jobReady(j)).length; }
  get kpiPlaced(): number { return this.jobs.filter(j => j.status === 'placed').length; }
  /** Charts only earn their space once there's more than a single fresh draft. */
  get insightsHaveData(): boolean {
    return this.jobs.length > 1 || this.kpiPlaced > 0 || this.kpiTotalStops > 1;
  }
  get kpiValue(): number {
    return Number(this.jobs.reduce((n, j) => n + (j.computedPrice || 0), 0).toFixed(2));
  }

  toggleInsights(): void {
    this.showInsights = !this.showInsights;
    if (this.showInsights) { this.chartSig = ''; setTimeout(() => this.refreshCharts(), 0); }
  }

  private refreshCharts(): void {
    if (this.view !== 'jobs' || !this.showInsights) return;
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--sh-ink-500')?.trim() || '#6B6459';

    // ---- status doughnut ----
    if (this.statusChartRef?.nativeElement) {
      const draft = this.jobs.filter(j => j.status === 'draft' && !this.jobReady(j)).length;
      const ready = this.jobs.filter(j => j.status !== 'placed' && this.jobReady(j)).length;
      const placed = this.jobs.filter(j => j.status === 'placed').length;
      const errored = this.jobs.filter(j => j.status === 'error').length;
      const data = {
        labels: ['Draft', 'Ready', 'Placed', 'Needs attention'],
        datasets: [{
          data: [draft, ready, placed, errored],
          backgroundColor: ['#DAD3C3', '#FFC107', '#12805C', '#D42F2F'],
          borderWidth: 0,
        }],
      };
      if (this.statusChart) { this.statusChart.data = data as any; this.statusChart.update(); }
      else {
        this.statusChart = new Chart(this.statusChartRef.nativeElement, {
          type: 'doughnut',
          data: data as any,
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: { legend: { position: 'bottom', labels: { color: ink, boxWidth: 10, font: { size: 10 } } } },
          },
        });
      }
    }

    // ---- stops per job bar ----
    if (this.stopsChartRef?.nativeElement) {
      const data = {
        labels: this.jobs.map(j => j.title),
        datasets: [{
          label: 'Stops',
          data: this.jobs.map(j => j.stops.length),
          backgroundColor: '#FFB300',
          borderRadius: 4,
          maxBarThickness: 26,
        }],
      };
      if (this.stopsChart) { this.stopsChart.data = data as any; this.stopsChart.update(); }
      else {
        this.stopsChart = new Chart(this.stopsChartRef.nativeElement, {
          type: 'bar',
          data: data as any,
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: ink, font: { size: 10 } }, grid: { display: false } },
              y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: 'rgba(0,0,0,0.06)' } },
            },
          },
        });
      }
    }
  }

  // ---------- visual stop query + bulk tools (active job) ----------
  stopMatches(s: JobStop): boolean {
    const q = this.stopQ;
    switch (q.op) {
      case 'located':   return s.lat != null;
      case 'unlocated': return s.lat == null;
      case 'empty':     return !String((s as any)[q.field] || '').trim();
      case 'notEmpty':  return !!String((s as any)[q.field] || '').trim();
      case 'contains':
      default:          return String((s as any)[q.field] || '').toLowerCase().includes(q.value.toLowerCase().trim());
    }
  }
  get matchedStopIdxs(): number[] {
    return this.activeJob.stops.map((s, i) => (this.stopMatches(s) ? i : -1)).filter(i => i >= 0);
  }
  get matchedStopCount(): number { return this.matchedStopIdxs.length; }

  selectMatches(): void { this.bulkSel = new Set(this.matchedStopIdxs); }
  clearSelection(): void { this.bulkSel.clear(); }
  toggleBulk(i: number): void { this.bulkSel.has(i) ? this.bulkSel.delete(i) : this.bulkSel.add(i); }

  removeSelectedStops(): void {
    const j = this.activeJob;
    if (!this.bulkSel.size) return;
    const keep = j.stops.filter((_, i) => !this.bulkSel.has(i));
    j.stops = keep.length ? keep : [this.newStop()];
    this.bulkSel.clear();
    this.recalcDistance(j);
  }
  keepOnlySelectedStops(): void {
    const j = this.activeJob;
    if (!this.bulkSel.size) return;
    const keep = j.stops.filter((_, i) => this.bulkSel.has(i));
    j.stops = keep.length ? keep : [this.newStop()];
    this.bulkSel.clear();
    this.recalcDistance(j);
  }
  clearContactsOnSelected(): void {
    const j = this.activeJob;
    j.stops.forEach((s, i) => { if (this.bulkSel.has(i)) { s.name = ''; s.phone = ''; } });
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
    const key = this.remoteConfig.geminiApiKey;
    if (!key) throw new Error('Clé Gemini absente (Remote Config: gemini_api_key).');
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

  private async geminiMapChunk(rows: any[]): Promise<any[]> {
    const model = this.remoteConfig.geminiModel;
    const key = this.remoteConfig.geminiApiKey;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

    const prompt =
`You normalise delivery-parcel spreadsheet rows for a Tunisian courier.
Column headers vary wildly (French / Arabic / English, abbreviations, typos, extra columns, merged fields) — infer meaning from content, not just the header text.

For EACH input row output one object with EXACTLY these keys:
- "name": recipient / client name (string, "" if none)
- "phone": primary phone. Digits only, keep a leading "+216" if present, otherwise 8 local digits. "" if none/invalid.
- "phone2": a second phone if the row has one, else ""
- "address": the fullest delivery address / location text you can assemble ("" if none)
- "gov": Tunisian governorate, one of exactly: ${this.TN_GOVS.join(', ')}. "" if not derivable.
- "description": parcel contents / notes ("" if none)
- "parcelPrice": cash to collect / COD / "prix" / "montant" as a number (dot decimals), or null
- "expeditorId": sender / shop / vendor / "expéditeur" reference ("" if none)

Return ONLY a JSON array, same order and length as the input. No prose.

INPUT ROWS:
${JSON.stringify(rows)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      });
    } catch (e: any) {
      throw new Error(`Appel Gemini échoué : ${e?.message || e}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status} : ${body.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || '';
    const parsed = this.parseJsonLoose(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.stops)) return parsed.stops;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    throw new Error('Réponse IA non exploitable (JSON attendu).');
  }

  private parseJsonLoose(text: string): any {
    const t = (text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch { /* fall through */ }
    const s = t.indexOf('['), e = t.lastIndexOf(']');
    if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* noop */ } }
    return null;
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

  /** Batch the selected parcels into a fresh order (Job) and jump to it. */
  async createOrderFromParcels(): Promise<void> {
    const chosen = this.parcels.filter(p => this.parcelSel.has(p.id) && p.lat != null && p.lng != null);
    if (!chosen.length) { toastError('Select at least one located parcel'); return; }
    if (chosen.length > MAX_STOPS) { toastError(`Max ${MAX_STOPS} stops per order`); return; }
    if (this.jobs.length >= MAX_JOBS) { toastError(`Max ${MAX_JOBS} orders — free a slot first`); return; }

    const j = this.newJob(this.jobs.length + 1);
    j.title = `Batch · ${chosen.length} parcels`;
    j.stops = chosen.map(p => ({
      name: p.name, address: p.address || `${p.lat}, ${p.lng}`, phone: p.phone,
      phone2: p.phone2 || '', description: p.description || '',
      parcelPrice: p.parcelPrice ?? null,
      expeditorId: p.expeditorId || '',
      lat: p.lat, lng: p.lng, suggests: [], loading: false,
    }));
    if (this.parcelAnchor) {
      j.pickupLat = this.parcelAnchor.lat;
      j.pickupLng = this.parcelAnchor.lng;
      j.pickupAddress = (await mapboxReverseGeocode(this.parcelAnchor.lat, this.parcelAnchor.lng))
        || `${this.parcelAnchor.lat.toFixed(5)}, ${this.parcelAnchor.lng.toFixed(5)}`;
    }
    this.jobs.push(j);
    this.recalcDistance(j);
    this.activeJobId = j.id;
    this.parcelSel.clear();
    this.setView('jobs');
    toastSuccess(`Order drafted from ${chosen.length} parcels — set a pickup & vehicle`);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.router.navigateByUrl('/sign-in');
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => toastSuccess('Copied')).catch(() => {});
  }

  // ---------- config / vehicles ----------
  private async loadConfig(): Promise<void> {
    try {
      const snap = await getDoc(doc(this.firestore, 'settings', 'config'));
      const c = snap.exists() ? (snap.data() as any) : {};
      this.stopFee = Number(c.stop_fee ?? 0.4);
    } catch { /* defaults */ }
  }

  private vehicleImage(key: string): string {
    const k = (key || '').toLowerCase();
    const known = ['super_light', 'light', 'light_medium', 'medium', 'medium_heavy', 'heavy', 'super_heavy', 'popular', 'isuzu'];
    if (known.includes(k)) return `assets/trucks/${k}.png`;
    if (k.includes('super_heavy')) return 'assets/trucks/super_heavy.png';
    if (k.includes('medium_heavy')) return 'assets/trucks/medium_heavy.png';
    if (k.includes('heavy')) return 'assets/trucks/heavy.png';
    if (k.includes('medium')) return 'assets/trucks/medium.png';
    if (k.includes('super_light') || k.includes('light')) return 'assets/trucks/light.png';
    if (k.includes('popular')) return 'assets/trucks/popular.png';
    return 'assets/trucks/medium.png';
  }

  private async loadVehicles(): Promise<void> {
    this.loadingVehicles = true;
    try {
      const snap = await getDoc(doc(this.firestore, 'settings', 'vehicles'));
      const dbData = snap.exists() ? (snap.data() as any) : {};
      
      const hardcoded = ['super_light', 'popular', 'light', 'medium', 'medium_heavy', 'heavy', 'super_heavy'];
      
      this.vehicleOptions = hardcoded.map((key) => {
        const v = dbData[key] || {};
        return {
          key, 
          name: v.name || key.replace('_', ' '), 
          category: v.category || 'van',
          maxWeight: Number(v.maxWeight ?? v.max_weight ?? 0),
          volume: Number(v.volume ?? 0),
          image: this.vehicleImage(key), 
          raw: v // Retain raw pricing data if it exists in DB
        } as VehicleOption;
      });

      if (this.vehicleOptions.length) {
        for (const j of this.jobs) if (!j.vehicleKey) j.vehicleKey = this.vehicleOptions[0].key;
      }
    } catch (e) {
      console.error('loadVehicles', e);
      const hardcoded = ['super_light', 'popular', 'light', 'medium', 'medium_heavy', 'heavy', 'super_heavy'];
      this.vehicleOptions = hardcoded.map((key) => ({
        key, name: key.replace('_', ' '), category: 'van', maxWeight: 0, volume: 0, image: this.vehicleImage(key), raw: {}
      } as VehicleOption));
    } finally {
      this.loadingVehicles = false;
    }
  }
  vehicleFor(key: string): VehicleOption | undefined { return this.vehicleOptions.find(v => v.key === key); }
  onImgError(ev: Event): void { (ev.target as HTMLImageElement).src = 'assets/trucks/medium.png'; }

  // ---------- jobs ----------
  private newJob(n: number): Job {
    return {
      id: 'job_' + Math.random().toString(36).slice(2, 9),
      title: 'Job ' + n, step: 1, status: 'draft',
      pickupName: '', pickupAddress: '', pickupLat: null, pickupLng: null, pickupSuggests: [], pickupLoading: false,
      stops: [this.newStop()],
      vehicleKey: this.vehicleOptions[0]?.key || '',
      priceMode: 'fixed', computedPrice: 0, currency: 'TND', pricing: false,
      scheduleAt: null, budget: null, notes: '', equipment: [], distanceKm: 0
    };
  }
  private newStop(): JobStop {
    return {
      name: '', address: '', phone: '', phone2: '', description: '', parcelPrice: null, expeditorId: '',
      lat: null, lng: null, suggests: [], loading: false
    };
  }

  get activeJob(): Job { return this.jobs.find(j => j.id === this.activeJobId) || this.jobs[0]; }
  selectJob(id: string): void { this.activeJobId = id; this.view = 'jobs'; this.scheduleSave(); }
  addJob(): void {
    if (this.jobs.length >= MAX_JOBS) { toastError(`Maximum ${MAX_JOBS} jobs`); return; }
    const j = this.newJob(this.jobs.length + 1);
    this.jobs.push(j);
    this.selectJob(j.id);
    this.scheduleSave();
  }
  async removeJob(id: string): Promise<void> {
    if (this.jobs.length <= 1) return;
    const j = this.jobs.find(x => x.id === id);
    const hasWork = !!j && (j.pickupAddress.trim() !== '' || j.stops.some(s => s.address.trim() || s.phone.trim()));
    if (hasWork) {
      const ok = await confirmAction({
        title: `Supprimer « ${j!.title} » ?`,
        text: 'Cette commande et ses arrêts non enregistrés seront perdus.',
        danger: true,
      });
      if (!ok) return;
    }
    const wasActive = this.activeJobId === id;
    this.jobs = this.jobs.filter(x => x.id !== id);
    if (wasActive) this.selectJob(this.jobs[0].id);
    this.scheduleSave();
  }

  jobReady(j: Job): boolean {
    return j.status !== 'placed'
      && !!j.pickupAddress.trim() && j.pickupLat != null
      && j.stops.length > 0
      && j.stops.every(s => !!s.address.trim() && s.lat != null && !!s.phone.trim())
      && !!j.vehicleKey;
  }
  /** A stop is missing its required phone number. */
  stopPhoneMissing(s: JobStop): boolean { return !s.phone.trim(); }
  get anyReady(): boolean { return this.jobs.some(j => this.jobReady(j)); }
  locatedStops(j: Job): number { return j.stops.filter(s => s.lat != null).length; }
  stopsWithPhone(j: Job): number { return j.stops.filter(s => s.phone.trim()).length; }
  stopsWithName(j: Job): number { return j.stops.filter(s => s.name.trim()).length; }
  stopsWithDesc(j: Job): number { return j.stops.filter(s => s.description.trim()).length; }

  /** 0–100 score of how "driver-friendly" the job is: located + named + described
   *  stops mean faster deliveries and higher acceptance — a driver-retention lever
   *  surfaced to the professional user. */
  driverQuality(j: Job): number {
    const n = j.stops.length || 1;
    const located = this.locatedStops(j) / n;
    const named = this.stopsWithName(j) / n;
    const described = this.stopsWithDesc(j) / n;
    return Math.round(located * 55 + named * 25 + described * 20);
  }
  driverQualityLabel(j: Job): string {
    const q = this.driverQuality(j);
    return q >= 80 ? 'Excellente' : q >= 55 ? 'Correcte' : 'À enrichir';
  }

  goToStep(j: Job, n: number): void {
    const step = Math.min(3, Math.max(1, n)) as 1 | 2 | 3;
    if (step > j.step && j.step === 1 && !this.step1Ok(j)) return;
    j.step = step;
    if (step === 3) this.computePrice(j);
    this.scheduleSave();
  }
  step1Ok(j: Job): boolean {
    return !!j.pickupAddress.trim() && j.pickupLat != null
      && j.stops.length > 0
      && j.stops.every(s => !!s.address.trim() && s.lat != null && !!s.phone.trim());
  }

  addStop(j: Job): void {
    if (j.stops.length >= MAX_STOPS) { toastError(`Maximum ${MAX_STOPS} stops`); return; }
    j.stops.push(this.newStop());
  }
  async removeStop(j: Job, i: number): Promise<void> {
    if (j.stops.length <= 1) return;
    const s = j.stops[i];
    if (s && (s.address.trim() || s.phone.trim() || s.name.trim())) {
      const ok = await confirmAction({
        title: `Retirer l’arrêt ${i + 1} ?`,
        text: s.address.trim() || s.name.trim() || 'Arrêt renseigné',
        danger: true, confirmText: 'Retirer',
      });
      if (!ok) return;
    }
    j.stops.splice(i, 1);
    this.recalcDistance(j);
  }

  // ---------- Tunisia-only geocoding (Mapbox) ----------
  private async geocodeTN(q: string): Promise<any[]> {
    return mapboxForwardGeocode(q, 6);
  }
  private async reverseTN(lat: number, lng: number): Promise<string | null> {
    return mapboxReverseGeocode(lat, lng);
  }
  private label(r: any): string {
    return String(r?.display_name || '').split(',').slice(0, 3).join(', ').trim();
  }

  onPickupType(j: Job): void {
    j.pickupLat = null; j.pickupLng = null;
    clearTimeout(this.searchTimer);
    const q = j.pickupAddress;
    this.searchTimer = setTimeout(async () => {
      j.pickupLoading = true;
      j.pickupSuggests = await this.geocodeTN(q);
      j.pickupLoading = false;
    }, 320);
  }
  choosePickup(j: Job, r: any): void {
    j.pickupAddress = this.label(r);
    j.pickupLat = Number(parseFloat(r.lat).toFixed(6));
    j.pickupLng = Number(parseFloat(r.lon).toFixed(6));
    j.pickupSuggests = [];
    this.recalcDistance(j);
    this.rememberPickup(j.pickupAddress, j.pickupLat, j.pickupLng);
    this.scheduleSave();
  }
  onStopType(j: Job, i: number): void {
    const s = j.stops[i];
    s.lat = null; s.lng = null;
    clearTimeout(this.searchTimer);
    const q = s.address;
    this.searchTimer = setTimeout(async () => {
      s.loading = true;
      s.suggests = await this.geocodeTN(q);
      s.loading = false;
    }, 320);
  }
  chooseStop(j: Job, i: number, r: any): void {
    const s = j.stops[i];
    s.address = this.label(r);
    s.lat = Number(parseFloat(r.lat).toFixed(6));
    s.lng = Number(parseFloat(r.lon).toFixed(6));
    s.suggests = [];
    this.recalcDistance(j);
    this.scheduleSave();
  }

  private async locateMissing(j: Job): Promise<void> {
    if (j.pickupLat == null && j.pickupAddress.trim()) {
      const r = await this.geocodeTN(j.pickupAddress);
      if (r[0]) { j.pickupLat = Number(parseFloat(r[0].lat).toFixed(6)); j.pickupLng = Number(parseFloat(r[0].lon).toFixed(6)); }
    }
    for (const s of j.stops) {
      if (s.lat == null && s.address.trim()) {
        const r = await this.geocodeTN(s.address);
        if (r[0]) { s.lat = Number(parseFloat(r[0].lat).toFixed(6)); s.lng = Number(parseFloat(r[0].lon).toFixed(6)); }
      }
    }
  }

  // ---------- pin picker (mobile-style full map) ----------
  openPin(t: LocTarget): void {
    const j = this.activeJob;
    this.pinTarget = t;
    if (t.kind === 'pickup') {
      this.pinLat = j.pickupLat ?? TN_CENTER[0];
      this.pinLng = j.pickupLng ?? TN_CENTER[1];
      this.pinName = j.pickupName || j.pickupAddress || '';
    } else {
      const s = j.stops[t.index];
      this.pinLat = s.lat ?? j.pickupLat ?? TN_CENTER[0];
      this.pinLng = s.lng ?? j.pickupLng ?? TN_CENTER[1];
      this.pinName = s.name || s.address || '';
    }
    this.pinOpen = true;
    setTimeout(() => this.initPinMap(), 60);
  }
  closePin(): void {
    this.pinOpen = false;
    if (this.pinMap) { this.pinMap.remove(); this.pinMap = null; this.pinMarker = null; }
  }

  private initPinMap(): void {
    if (!this.pinMapRef?.nativeElement) return;
    if (this.pinMap) { this.pinMap.remove(); this.pinMap = null; }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    this.pinMap = new mapboxgl.Map({
      container: this.pinMapRef.nativeElement,
      style: this.pinMode === 'satellite' ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_STREET,
      center: [this.pinLng, this.pinLat],
      zoom: 14,
      minZoom: 6,
      maxBounds: TN_MAX_BOUNDS,
      attributionControl: false,
    });
    this.pinMap.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    this.pinMap.on('load', () => this.pinMap?.resize());

    const el = document.createElement('div');
    el.className = 'mbx-pin';
    el.style.cssText = 'width:28px;height:28px;background:#FFA000';
    el.innerHTML = '<span><i class="bi bi-geo-alt-fill"></i></span>';

    this.pinMarker = new mapboxgl.Marker({ element: el, draggable: true, anchor: 'bottom' })
      .setLngLat([this.pinLng, this.pinLat])
      .addTo(this.pinMap);
    this.pinMarker.on('dragend', () => {
      const p = this.pinMarker!.getLngLat();
      this.pinLat = Number(p.lat.toFixed(6));
      this.pinLng = Number(p.lng.toFixed(6));
    });
    this.pinMap.on('click', (e) => {
      this.pinLat = Number(e.lngLat.lat.toFixed(6));
      this.pinLng = Number(e.lngLat.lng.toFixed(6));
      this.pinMarker?.setLngLat(e.lngLat);
    });
  }
  setPinMode(m: 'street' | 'satellite'): void {
    if (!this.pinMap || m === this.pinMode) return;
    this.pinMode = m;
    this.pinMap.setStyle(m === 'satellite' ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_STREET);
  }
  async confirmPin(): Promise<void> {
    this.pinLoading = true;
    const name = (await this.reverseTN(this.pinLat, this.pinLng)) || `${this.pinLat.toFixed(5)}, ${this.pinLng.toFixed(5)}`;
    const j = this.activeJob;
    if (this.pinTarget.kind === 'pickup') {
      j.pickupLat = this.pinLat; j.pickupLng = this.pinLng;
      j.pickupAddress = name; j.pickupSuggests = [];
      this.rememberPickup(name, this.pinLat, this.pinLng);
    } else {
      const s = j.stops[this.pinTarget.index];
      if (s) { s.lat = this.pinLat; s.lng = this.pinLng; s.address = name; s.suggests = []; }
    }
    this.recalcDistance(j);
    this.pinLoading = false;
    this.closePin();
    this.scheduleSave();
  }

  // ---------- distance ----------
  private haversine(a: [number, number], b: [number, number]): number {
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  recalcDistance(j: Job): void {
    if (j.pickupLat == null) { j.distanceKm = 0; return; }
    let total = 0;
    let prev: [number, number] = [j.pickupLat, j.pickupLng as number];
    for (const s of j.stops) {
      if (s.lat == null) continue;
      total += this.haversine(prev, [s.lat, s.lng as number]);
      prev = [s.lat, s.lng as number];
    }
    j.distanceKm = Number((total * ROAD_FACTOR).toFixed(2));
  }

  // ---------- pricing (same as mobile client: cloud fn + local fallback) ----------
  async computePrice(j: Job): Promise<void> {
    if (!j.vehicleKey || j.distanceKm <= 0) { j.computedPrice = this.localPrice(j); return; }
    j.pricing = true;
    try {
      const callable = httpsCallable(this.functions, 'calculateTripPrice');
      const res: any = await callable({ vehicleType: j.vehicleKey, distanceInKm: j.distanceKm, countryCode: this.countryCode });
      const price = Number(res?.data?.price ?? 0);
      if (price > 0) {
        j.computedPrice = Number(price.toFixed(2));
        j.currency = res?.data?.currency || j.currency;
        return;
      }
      j.computedPrice = this.localPrice(j);
    } catch (e) {
      console.warn('calculateTripPrice failed, local fallback', e);
      j.computedPrice = this.localPrice(j);
    } finally {
      j.pricing = false;
    }
  }
  private localPrice(j: Job): number {
    const v = this.vehicleFor(j.vehicleKey)?.raw || {};
    const cc = this.countryCode.toUpperCase();
    const perCountry = v.pricing?.[cc] || v.pricing?.[this.countryCode];
    if (perCountry && (perCountry.base_price != null || perCountry.price_per_km != null)) {
      const base = Number(perCountry.base_price) || 0;
      const perKm = Number(perCountry.price_per_km) || 0;
      j.currency = (perCountry.currency || j.currency || 'TND').toString().toUpperCase();
      return Number((base + j.distanceKm * perKm).toFixed(2));
    }
    const base = Number(v.base_price ?? v.basePrice ?? 0);
    const perKm = Number(v.price_per_km ?? 0);
    if (base || perKm) return Number((base + j.distanceKm * perKm).toFixed(2));
    // last-resort tiered fallback
    const threshold = Number(v.short_dist_threshold ?? 30);
    const shortMin = Number(v.short_dist_min ?? 0);
    const shortMult = Number(v.short_dist_mult ?? 0);
    const longRate = Number(v.long_dist_rate ?? 0);
    return Number((j.distanceKm <= threshold
      ? Math.max(shortMin, j.distanceKm * shortMult)
      : j.distanceKm * longRate).toFixed(2));
  }

  toggleEquip(j: Job, a: string): void {
    const i = j.equipment.indexOf(a);
    if (i >= 0) j.equipment.splice(i, 1); else j.equipment.push(a);
  }

  // ---------- place ----------
  async placeJob(j: Job): Promise<boolean> {
    j.error = undefined;
    await this.locateMissing(j);
    this.recalcDistance(j);
    if (!this.jobReady(j)) {
      j.error = j.stops.some(s => this.stopPhoneMissing(s))
        ? 'Chaque arrêt doit avoir au moins un numéro de téléphone.'
        : 'Add a pickup and at least one stop that resolves to a place, plus a vehicle.';
      j.status = 'error';
      return false;
    }
    const uid = this.auth.currentUser?.uid;
    if (!uid) { this.router.navigateByUrl('/sign-in'); return false; }

    j.status = 'placing';
    try {
      await this.computePrice(j);

      const stopIds: string[] = [];
      for (const s of j.stops) {
        const ref = await addDoc(collection(this.firestore, 'stops'), {
          destination: { latitude: Number(s.lat), longitude: Number(s.lng) },
          destinationName: s.address.trim(),
          name: s.name.trim() ? s.name.trim() : null,
          receiverPhone: s.phone.trim() ? s.phone.trim() : null,
          receiverPhone2: s.phone2.trim() ? s.phone2.trim() : null,
          description: s.description.trim() ? s.description.trim() : null,
          parcelPrice: (s.parcelPrice != null && !isNaN(Number(s.parcelPrice))) ? Number(s.parcelPrice) : 0,
          expeditorId: s.expeditorId.trim() ? s.expeditorId.trim() : null,
          expeditorPayout: 'unpaid' as ExpeditorPayout,
          definedBy: uid,            // professional user who created this stop
          createdBy: uid,
          clientId: uid,
          state: 'pending' as StopState,
          isDelivered: false   // legacy mirror
        });
        stopIds.push(ref.id);
      }

      const orderRef = doc(collection(this.firestore, 'orders'));
      const orderId = orderRef.id;
      const scheduleAtVal = j.scheduleAt?.trim()
        ? Timestamp.fromDate(new Date(j.scheduleAt)) : Timestamp.now();

      await setDoc(orderRef, {
        clientId: uid,
        userID: uid,
        price: Number(j.computedPrice) || 0,
        distance: Number(j.distanceKm) || 0,
        namePickUp: j.pickupAddress.trim(),
        id: orderId,
        pickUpLocation: { coordinates: [Number(j.pickupLng), Number(j.pickupLat)], type: 'Point' },
        stops: stopIds,
        timestamp: serverTimestamp(),
        vehicleType: j.vehicleKey,
        isAccepted: false,
        isAcepted: false,
        scheduleAt: scheduleAtVal,
        category: 'eco',
        optionalAssets: [...j.equipment],
        budget: (j.budget != null && !isNaN(Number(j.budget))) ? Number(j.budget) : 0,
        notes: j.notes.trim(),
        currencyCode: j.currency || 'TND',
        isBiddingMode: j.priceMode === 'bidding',
        isAdministrative: true   // created from the web portal -> driver in-app calling disabled
      });

      j.placedOrderId = orderId;
      j.status = 'placed';
      this.lifetimePlaced++;
      try { localStorage.setItem(this.LS_PLACED_TOTAL, String(this.lifetimePlaced)); } catch { /* ignore */ }
      // if nothing is left to work on, drop the saved draft
      if (this.jobs.every(x => x.status === 'placed')) this.clearDraft();
      else this.persistNow();
      toastSuccess(`${j.title} publiée`);
      return true;
    } catch (err: any) {
      console.error('placeJob', err);
      j.error = err?.message || 'Failed to place this job.';
      j.status = 'error';
      return false;
    }
  }

  async dispatchAll(): Promise<void> {
    if (this.dispatchingAll) return;
    this.dispatchingAll = true;
    let ok = 0, fail = 0;
    for (const j of this.jobs) {
      if (j.status === 'placed' || !this.jobReady(j)) continue;
      (await this.placeJob(j)) ? ok++ : fail++;
    }
    this.dispatchingAll = false;
    if (ok) toastSuccess(`${ok} job(s) placed${fail ? `, ${fail} failed` : ''}`);
    else if (fail) toastError(`${fail} job(s) failed`);
    else toastError('No ready jobs to place');
  }

  async resetJob(j: Job): Promise<void> {
    const ok = await confirmAction({
      title: 'Nouvelle commande dans ce créneau ?',
      text: 'La commande placée reste active — vous repartez d’une feuille blanche ici.',
      confirmText: 'Recommencer',
    });
    if (!ok) return;
    const idx = this.jobs.findIndex(x => x.id === j.id);
    const fresh = this.newJob(idx + 1);
    fresh.id = j.id;
    this.jobs[idx] = fresh;
  }
}
