import { Component, OnInit } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { ShnellUser } from '../../../Models/shnellUsers.models';
import { Unsubscribe } from 'firebase/firestore'; // Import for proper cleanup

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit {
  user: ShnellUser | null = null;
  navItems: { label: string, path: string, icon: string, queryParams?: any, group?: string }[] = [];
  sidebarCollapsed = false;
  unauthorizedMessage: string | null = null;
  private authSubscription?: Unsubscribe; // For cleanup

  constructor(private auth: Auth, private firestore: Firestore, public router: Router) {}

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
            { group: 'Monitor', label: 'Overview & Analytics', path: 'home-admin', queryParams: { tab: 'overview' }, icon: 'bi-grid-1x2-fill' },
            { group: 'Monitor', label: 'Realtime Map', path: 'home-admin', queryParams: { tab: 'live-map' }, icon: 'bi-geo-alt-fill' },
            { group: 'Monitor', label: 'Orders & Deals', path: 'home-admin', queryParams: { tab: 'deals' }, icon: 'bi-receipt' },

            { group: 'Fleet & Drivers', label: 'Users & Drivers', path: 'home-admin', queryParams: { tab: 'users' }, icon: 'bi-people-fill' },
            { group: 'Fleet & Drivers', label: 'Driver Verifications', path: 'home-admin', queryParams: { tab: 'verifications' }, icon: 'bi-person-vcard' },
            { group: 'Fleet & Drivers', label: 'Fleet Applications', path: 'home-admin', queryParams: { tab: 'vehicles' }, icon: 'bi-truck' },
            { group: 'Fleet & Drivers', label: 'Driver Profile', path: 'home-admin', queryParams: { tab: 'driver-profile' }, icon: 'bi-person-badge-fill' },

            { group: 'Operations', label: 'Assign Order', path: 'home-admin', queryParams: { tab: 'dispatch-order' }, icon: 'bi-send-plus-fill' },
            { group: 'Operations', label: 'Expired Orders', path: 'expired-orders', icon: 'bi-clock-history' },

            { group: 'System', label: 'App Config', path: 'home-admin', queryParams: { tab: 'settings' }, icon: 'bi-gear-wide-connected' },
            { group: 'System', label: 'FCM Notifications', path: 'home-admin', queryParams: { tab: 'notifications' }, icon: 'bi-bell-fill' },
            { group: 'System', label: 'Profile', path: 'profile', icon: 'bi-person' }
          ] as any;
          this.unauthorizedMessage = null;
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
