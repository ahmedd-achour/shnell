import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { ShnellUser } from '../../../Models/shnellUsers.models';
import { Unsubscribe } from 'firebase/firestore'; // Import for proper cleanup
import { Subscription } from 'rxjs';
import { AdminHubService } from '../../shnell-dashboard/services/admin-hub.service';
import { DashboardDataService } from '../../shnell-dashboard/services/dashboard-data.service';
import { toMillis } from '../../shnell-dashboard/services/hub-format';

interface SearchHit { kind: 'account' | 'page'; label: string; sub: string; icon: string; go: () => void; }

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit {
  user: ShnellUser | null = null;
  navItems: { label: string, path: string, icon: string, queryParams?: any, group?: string, badge?: string }[] = [];

  // Admin hub: live counters, global search, alerts bell.
  @ViewChild('searchBox') searchBox?: ElementRef<HTMLInputElement>;
  searchQuery = '';
  searchOpen = false;
  searchIndex = 0;
  bellOpen = false;
  openAlerts: any[] = [];
  pendingRecharges: any[] = [];
  private allUsers: any[] = [];
  private hubSubs: Subscription[] = [];
  readonly toMillis = toMillis;
  sidebarCollapsed = false;
  unauthorizedMessage: string | null = null;
  private authSubscription?: Unsubscribe; // For cleanup

  constructor(private auth: Auth, private firestore: Firestore, public router: Router,
              private hub: AdminHubService, private data: DashboardDataService) {}

  ngOnInit(): void {
    // Subscribe to Firebase Auth changes
    this.authSubscription = this.auth.onAuthStateChanged(firebaseUser => {
      if (!firebaseUser) {
        this.user = null;
        this.navItems = []; // Clear nav items
        this.unauthorizedMessage = 'Please log in to access the dashboard';
        this.sidebarCollapsed = false; // Reset sidebar on logout
        return;
      }

      // Fetch user document from Firestore
      const userDocRef = doc(this.firestore, `users/${firebaseUser.uid}`);
      const docSub = docData(userDocRef).subscribe(data => {
        if (!data) {
          this.user = null;
          this.navItems = [];
          this.unauthorizedMessage = 'User data not found';
          return;
        }

        this.user = ShnellUser.fromJson(data);

        // Role-based navigation with icons
        if (this.user.role === 'company') {
          this.navItems = [
            { label: 'Gestion des chauffeurs', path: 'home-company', icon: 'bi-people' },
            { label: 'Gestion des arrêts', path: 'stops-management', icon: 'bi-geo-alt' },
            { label: 'Livraison en direct', path: 'live-delivery', icon: 'bi-broadcast' },
            { label: 'Finances & Analytique', path: 'retour-payment', icon: 'bi-graph-up' },
            { label: 'Profil', path: 'profile', icon: 'bi-person' }
          ] as any;
          this.unauthorizedMessage = null;
        } else if (this.user.role === 'admin') {
          this.navItems = [
            { group: 'Command', label: 'Overview & Analytics', path: 'home-admin', queryParams: { tab: 'overview' }, icon: 'bi-grid-1x2-fill' },
            { group: 'Command', label: 'AI Assistant', path: 'home-admin', queryParams: { tab: 'assistant' }, icon: 'bi-stars' },
            { group: 'Command', label: 'Alerts', path: 'home-admin', queryParams: { tab: 'alerts' }, icon: 'bi-bell-fill', badge: 'alerts' },
            { group: 'Command', label: 'Realtime Map', path: 'home-admin', queryParams: { tab: 'live-map' }, icon: 'bi-geo-alt-fill' },

            { group: 'Operations', label: 'Orders & Deals', path: 'home-admin', queryParams: { tab: 'deals' }, icon: 'bi-receipt' },
            { group: 'Operations', label: 'Assign Order', path: 'home-admin', queryParams: { tab: 'dispatch-order' }, icon: 'bi-send-plus-fill' },
            { group: 'Operations', label: 'Dispatch Center', path: 'home-admin', queryParams: { tab: 'dispatch-center' }, icon: 'bi-signpost-split-fill' },
            { group: 'Operations', label: 'Expired Orders', path: 'expired-orders', icon: 'bi-clock-history' },

            { group: 'People & Fleet', label: 'Users & Drivers', path: 'home-admin', queryParams: { tab: 'users' }, icon: 'bi-people-fill' },
            { group: 'People & Fleet', label: 'Account 360', path: 'home-admin', queryParams: { tab: 'account' }, icon: 'bi-person-badge-fill' },
            { group: 'People & Fleet', label: 'Driver Verifications', path: 'home-admin', queryParams: { tab: 'verifications' }, icon: 'bi-person-vcard' },
            { group: 'People & Fleet', label: 'Fleet Applications', path: 'home-admin', queryParams: { tab: 'vehicles' }, icon: 'bi-truck' },

            { group: 'Money & Audit', label: 'Finance & Ledger', path: 'home-admin', queryParams: { tab: 'finance' }, icon: 'bi-bank', badge: 'recharges' },
            { group: 'Money & Audit', label: 'Activity Log', path: 'home-admin', queryParams: { tab: 'activity' }, icon: 'bi-journal-text' },

            { group: 'System', label: 'App Config', path: 'home-admin', queryParams: { tab: 'settings' }, icon: 'bi-gear-wide-connected' },
            { group: 'System', label: 'Notifications & Broadcast', path: 'home-admin', queryParams: { tab: 'notifications' }, icon: 'bi-megaphone-fill' }
          ] as any;
          this.unauthorizedMessage = null;
          this.startHub();
        } else {
          // Unauthorized role: sign out and redirect
          this.auth.signOut().then(() => {
            this.router.navigate(['/sign-in']);
          }).catch(error => {
            console.error('Sign out error:', error);
            this.router.navigate(['/sign-in']); // Force redirect anyway
          });
          return; // Exit early
        }
      });

      // Store doc subscription for potential cleanup (optional, as component destroy will handle)
      // Note: Angular Fire handles unsub on destroy, but explicit is better
    });
  }

  ngOnDestroy(): void {
    // Cleanup subscriptions
    if (this.authSubscription) {
      this.authSubscription();
    }
    this.hubSubs.forEach(s => s.unsubscribe());
  }

  /* ------------------------- admin hub (admins only) ------------------------- */

  private startHub(): void {
    if (this.hubSubs.length) return;
    this.hubSubs.push(
      this.hub.openAlerts$.subscribe(a => this.openAlerts = a),
      this.hub.pendingRecharges$.subscribe(p => this.pendingRecharges = p),
      this.data.getUsers().subscribe(u => this.allUsers = u),
    );
  }

  badgeOf(item: any): number {
    if (item.badge === 'alerts') return this.openAlerts.length;
    if (item.badge === 'recharges') return this.pendingRecharges.length;
    return 0;
  }

  get criticalAlerts(): number { return this.openAlerts.filter(a => a.severity === 'critical').length; }
  get bellCount(): number { return this.openAlerts.length; }

  get searchHits(): SearchHit[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return [];
    const pages: SearchHit[] = this.navItems
      .filter(n => n.label.toLowerCase().includes(q) || (n.group || '').toLowerCase().includes(q))
      .slice(0, 4)
      .map(n => ({ kind: 'page', label: n.label, sub: n.group || '', icon: n.icon, go: () => this.navigate(n) }));
    const accounts: SearchHit[] = q.length < 2 ? [] : this.allUsers
      .filter(u => [u.name, u.email, u.phone, u.uid, u.id].some(v => String(v || '').toLowerCase().includes(q)))
      .slice(0, 7)
      .map(u => ({
        kind: 'account', label: u.name || u.uid, icon: u.role === 'driver' ? 'bi-truck' : u.role === 'company' ? 'bi-buildings' : 'bi-person',
        sub: [u.role, u.phone || u.email, (u.isBan || u.isBanned) ? 'banned' : ''].filter(Boolean).join(' · '),
        go: () => this.openAccount(u.uid || u.id),
      }));
    return [...accounts, ...pages];
  }

  openAccount(uid: string): void {
    this.router.navigate(['home-admin'], { queryParams: { tab: 'account', uid } });
  }

  onSearchKey(e: KeyboardEvent): void {
    const hits = this.searchHits;
    if (e.key === 'ArrowDown') { this.searchIndex = Math.min(this.searchIndex + 1, hits.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { this.searchIndex = Math.max(this.searchIndex - 1, 0); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[this.searchIndex]) { this.pick(hits[this.searchIndex]); }
    else if (e.key === 'Escape') { this.closeSearch(); }
    else this.searchIndex = 0;
  }

  pick(h: SearchHit): void {
    h.go();
    this.closeSearch();
  }

  closeSearch(): void {
    this.searchOpen = false;
    this.searchQuery = '';
    this.searchIndex = 0;
    this.searchBox?.nativeElement.blur();
  }

  goTab(tab: string): void {
    this.bellOpen = false;
    this.router.navigate(['home-admin'], { queryParams: { tab } });
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && this.user?.role === 'admin') {
      e.preventDefault();
      this.searchOpen = true;
      setTimeout(() => this.searchBox?.nativeElement.focus());
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest?.('.topbar-search')) this.searchOpen = false;
    if (!t.closest?.('.bell-wrap')) this.bellOpen = false;
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  navigate(item: any) {
    if (item.queryParams) {
      this.router.navigate([item.path], { queryParams: item.queryParams }).then(success => {
        if (success) {
          if (window.innerWidth < 992) {
            this.sidebarCollapsed = true;
          }
        }
      });
    } else {
      this.router.navigate([item.path]).then(success => {
        if (success) {
          if (window.innerWidth < 992) {
            this.sidebarCollapsed = true;
          }
        }
      });
    }
  }

  isActive(item: any): boolean {
    if (item.queryParams && item.queryParams.tab) {
      // If we are looking for the overview tab, and the URL has no tab param, treat it as active
      if (item.queryParams.tab === 'overview' && this.router.url.includes('home-admin') && !this.router.url.includes('tab=')) {
        return true;
      }
      return this.router.url.includes(item.path) && this.router.url.includes('tab=' + item.queryParams.tab);
    }
    // For non-tabbed items like profile
    if (item.path === 'home-admin' && !item.queryParams) {
       return this.router.url.includes(item.path) && !this.router.url.includes('tab=');
    }
    return this.router.url.includes(item.path);
  }
}
