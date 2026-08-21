import { NgModule } from '@angular/core';
import { RouterModule, Routes, } from '@angular/router';
import { WelcomePageComponent } from './components/welcome-page/welcome-page.component';
import { DownloadRedirectComponent } from './components/download-redirect/download-redirect.component';
import { AuthGuard, redirectUnauthorizedTo } from '@angular/fire/auth-guard';
import { UserResolver } from './services/user.resolver';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { ServiceComponent } from './components/service/service.component';
import { ContactComponent } from './components/contact/contact.component';
import { BlogComponent } from './components/blog/blog.component';
import { SingleComponent } from './components/single/single.component';
import { PrivacyPolicyComponent } from './components/privacy-policy/privacy-policy.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ParcelManagementComponent } from './components/parcel-management/parcel-management.component';
import { StopsManagementComponent } from './components/stops-management/stops-management.component';
import { AnalyticsComponent } from './components/analytics/analytics.component';
import { FleetIntelligenceDashboardComponent } from './components/fleet-intelligence/fleet-intelligence.component';
import { DriverDetailsComponent } from './components/fleet-intelligence/driver-details/driver-details.component';
import { ProfileComponent } from './components/profile/profile.component';
import { PartnerdashComponent } from './components/partnerdash/partnerdash.component';
import { RetourspaymentsComponent } from './components/retourspayments/retourspayments.component';
import { SignInComponent } from './components/auth/sign-in/sign-in.component';
import { SignUpComponent } from './components/auth/sign-up/sign-up.component';
import { ForgotPasswordComponent } from './components/auth/forgot-password/forgot-password.component';
import { PublicLayoutComponent } from './public-layout/public-layout.component';
import { AdminDriverManagementComponent } from './admin-driver-management/admin-driver-management.component';
import { AdminGuard } from './roleguard';
import { ExpiredOrdersComponent } from './expired-orders/expired-orders.component';
import { UpdateStopLocationComponent } from './update-stop-location/update-stop-location.component';
import { ShnellDashboardComponent } from './shnell-dashboard/shnell-dashboard.component';

const redirectToLogin = () => redirectUnauthorizedTo('/sign-in');

const routes: Routes = [
  // Default route

  {
    path: 'download',
    component: DownloadRedirectComponent
  },

  { path: 'home', redirectTo: '', pathMatch: 'full' },



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
  ]
},



  // Auth pages
    { path: 'sign-up', component: SignUpComponent },
    { path: 'forgot-password', component: ForgotPasswordComponent },



  // Dashboard with sidebar
  {
    path: '',
    component: SidebarComponent, // sidebar stays visible
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectToLogin },
   // resolve: { user: UserResolver },
    children: [
      { path: 'admin-driver-management/details', component: AdminDriverManagementComponent  }, // route protected by AdminGuard
      { path: 'parcel-management', component: ParcelManagementComponent },
      { path: 'analytics', component: FleetIntelligenceDashboardComponent },
      { path: 'analytics/driver-details', component: DriverDetailsComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'stops-management', component: PartnerdashComponent },
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
