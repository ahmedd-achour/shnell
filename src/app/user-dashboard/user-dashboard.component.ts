import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  Firestore, collection, doc, getDoc, query, where, Timestamp, onSnapshot, getCountFromServer,
} from '@angular/fire/firestore';
import { Auth, signOut } from '@angular/fire/auth';
import { Swal } from '../shared/swal';
import { isUserBanned } from '../roleguard';
import { BizComposerComponent } from './business/biz-composer.component';
import { BizLiveComponent } from './business/biz-live.component';
import { BizHistoryComponent } from './business/biz-history.component';
import { BizApiComponent } from './business/biz-api.component';
import { BizRequestComponent } from './business/biz-request.component';
import { BizFleetComponent } from './business/biz-fleet.component';
import { BizService } from './business/biz.service';
import { BizVideoComponent } from '../shared/biz-video.component';

type View = 'home' | 'jobs' | 'live' | 'fleet' | 'history' | 'api';
const VIEWS: View[] = ['home', 'jobs', 'live', 'fleet', 'history', 'api'];

/**
 * Shnell Business (/app): the professional console. Trips are defined and
 * booked in biz-composer (server-priced, same engine as the client app),
 * followed in biz-live, accounted for in biz-history, and the same engine is
 * open to the account's own software through biz-api (public API + webhooks).
 */
@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, BizComposerComponent, BizLiveComponent, BizHistoryComponent, BizApiComponent, BizRequestComponent, BizFleetComponent, BizVideoComponent],
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private router = inject(Router);
  biz = inject(BizService);

  // ---- real-time ban wall ----
  banned = false;
  private banUnsub?: () => void;

  // ---- home / business overview ----
  companyName = '';
  loadingOverview = true;
  ordersTotal = 0;
  ordersThisWeek = 0;
  ordersOpen = 0;

  view: View = 'home';
  userEmail = '';
  userUid = '';

  async ngOnInit(): Promise<void> {
    this.userEmail = this.auth.currentUser?.email || '';
    this.userUid = this.auth.currentUser?.uid || '';
    const fromUrl = new URLSearchParams(location.search).get('view') as View | null;
    if (fromUrl && VIEWS.includes(fromUrl)) this.view = fromUrl;

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

    await this.biz.init();
    this.loadOverview();
  }

  /** Server-truth counts for the home view. */
  async loadOverview(): Promise<void> {
    this.loadingOverview = true;
    try {
      const uid = this.userUid;
      if (!uid) return;
      const userSnap = await getDoc(doc(this.firestore, 'users', uid));
      this.companyName = (userSnap.exists() ? (userSnap.data() as any)?.name : '') || '';

      const ordersCol = collection(this.firestore, 'orders');
      const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [total, week, open] = await Promise.all([
        getCountFromServer(query(ordersCol, where('clientId', '==', uid))),
        getCountFromServer(query(ordersCol, where('clientId', '==', uid), where('timestamp', '>=', weekAgo))),
        getCountFromServer(query(ordersCol, where('clientId', '==', uid), where('isAccepted', '==', false))),
      ]);
      this.ordersTotal = total.data().count;
      this.ordersThisWeek = week.data().count;
      this.ordersOpen = open.data().count;
    } catch (err) {
      console.error('loadOverview failed:', err);
    } finally {
      this.loadingOverview = false;
    }
  }

  ngOnDestroy(): void {
    this.banUnsub?.();
  }

  /** Immediate, refresh-free lockout: raise the ban wall, then sign out. */
  private enforceBanNow(): void {
    if (this.banned) return;
    this.banned = true;
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

  /** An admin approved the request while the page was open. */
  onActivated(): void {
    if (this.biz.enabled === true) return;
    this.biz.enabled = true;
    this.setView('home');
    Swal.fire({
      icon: 'success',
      title: 'Shnell Business activé',
      text: 'Votre espace professionnel est prêt.',
      timer: 2600,
      showConfirmButton: false,
      customClass: { popup: 'sh-swal' },
    });
  }

  setView(v: View): void {
    this.view = v;
    this.router.navigate([], { queryParams: { view: v === 'home' ? null : v }, replaceUrl: true });
    if (v === 'home') this.loadOverview();
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.router.navigateByUrl('/sign-in');
  }
}
