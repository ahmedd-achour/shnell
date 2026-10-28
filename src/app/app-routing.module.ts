import { NgModule } from '@angular/core';
import { RouterModule, Routes, } from '@angular/router';
import { WelcomePageComponent } from './components/welcome-page/welcome-page.component';
import { DownloadRedirectComponent } from './components/download-redirect/download-redirect.component';
import { UserResolver } from './services/user.resolver';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { ServiceComponent } from './components/service/service.component';
import { ContactComponent } from './components/contact/contact.component';
import { BlogComponent } from './components/blog/blog.component';
import { PrivacyPolicyComponent } from './components/privacy-policy/privacy-policy.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { FleetIntelligenceDashboardComponent } from './components/fleet-intelligence/fleet-intelligence.component';
import { DriverDetailsComponent } from './components/fleet-intelligence/driver-details/driver-details.component';
import { ProfileComponent } from './components/profile/profile.component';
// import { PartnerdashComponent } from './components/partnerdash/partnerdash.component';   // PARTNERS HIDDEN
import { RetourspaymentsComponent } from './components/retourspayments/retourspayments.component';
import { SignInComponent } from './components/auth/sign-in/sign-in.component';
// import { SignUpComponent } from './components/auth/sign-up/sign-up.component';   // PARTNERS HIDDEN
import { PublicLayoutComponent } from './public-layout/public-layout.component';
import { AdminDriverManagementComponent } from './admin-driver-management/admin-driver-management.component';
import { AdminCompanyManagementComponent } from './admin-company-management/admin-company-management.component';
import { AdminGuard, AuthedGuard } from './roleguard';   // + ApprovedCompanyGuard when partners return
import { ExpiredOrdersComponent } from './expired-orders/expired-orders.component';
import { UpdateStopLocationComponent } from './update-stop-location/update-stop-location.component';
import { ShnellDashboardComponent } from './shnell-dashboard/shnell-dashboard.component';
import { UserDashboardComponent } from './user-dashboard/user-dashboard.component';
import { DevelopersPageComponent } from './user-dashboard/business/api-docs.component';
// import { PendingApprovalComponent } from './components/pending-approval/pending-approval.component';   // PARTNERS HIDDEN

const routes: Routes = [
  // Default route
  {
    path: 'download',
    component: DownloadRedirectComponent 
  },

  { path: 'home', redirectTo: '', pathMatch: 'full' }, 

  // Shnell Business — the professional console (trips, live board, history, API).
  { path: 'app', component: UserDashboardComponent, canActivate: [AuthedGuard] },

  // Professional partner console — bulk stop dispatch, smart filters, driver
  // assignment. Gated on `users/{uid}.role === 'company'`, which only an
  // admin can set (see AdminCompanyManagementComponent) after reviewing the
  // CIN + company-paper verification docs submitted at sign-up. Previously
  // this route lived inside the admin-only sidebar group below, which meant
  // no professional account (only 'admin') could ever actually reach it.
  // PARTNERS HIDDEN (custom partnerships for now) — restore by uncommenting
  // these two routes, the sign-up route below and the "Espace pro" links
  // (header, home, footer).
  // { path: 'stops-management', component: PartnerdashComponent, canActivate: [ApprovedCompanyGuard] },
  // { path: 'pending-approval', component: PendingApprovalComponent, canActivate: [AuthedGuard] },
  // Old links land on the home page meanwhile (remove these three when restoring).
  { path: 'stops-management', redirectTo: '', pathMatch: 'full' },
  { path: 'pending-approval', redirectTo: '', pathMatch: 'full' },
  { path: 'sign-up', redirectTo: '', pathMatch: 'full' },



  // we wanna display the header , <route> , footer if no login is hapened , and solve the dashboard internal page reload problem
  // app-header , and app-footer
  // Public pages
{
  path: '',
  component: PublicLayoutComponent,
  children: [

    { path: '', redirectTo: '', pathMatch: 'full' },
    { path: 'welcome', component: WelcomePageComponent },
    { path: 'update-stop', component: UpdateStopLocationComponent },
    { path: 'home', component: HomeComponent },
    { path: '', component: HomeComponent },
    { path: 'about', component: AboutComponent },
    { path: 'service', component: ServiceComponent },
    { path: 'contact', component: ContactComponent },
    { path: 'sign-in', component: SignInComponent },
    { path: 'blog', component: BlogComponent },
    { path: 'privacy-policy', component: PrivacyPolicyComponent },
    { path: 'developers', component: DevelopersPageComponent },
  ]
},



  // Auth pages
    // PARTNERS HIDDEN: partner self sign-up is off for now.
    // { path: 'sign-up', component: SignUpComponent },



  // Dashboard with sidebar
  {
    path: '',
    component: SidebarComponent, // sidebar stays visible
    canActivate: [AdminGuard],
   // resolve: { user: UserResolver },
    children: [
      { path: 'admin-driver-management/details', component: AdminDriverManagementComponent  }, // route protected by AdminGuard
      { path: 'admin-company-management', component: AdminCompanyManagementComponent }, // approve/reject professional accounts
      { path: 'analytics', component: FleetIntelligenceDashboardComponent },
      { path: 'analytics/driver-details', component: DriverDetailsComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'expired-orders', component: ExpiredOrdersComponent , }, // route protected by AdminGuard
      { path: 'retour-payment', component: RetourspaymentsComponent },
      { path: 'home-admin', component: ShnellDashboardComponent },
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
    ]
  },

   // { path: ':stopID', component: GlobemapboxComponent },


  // Catch-all route
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
