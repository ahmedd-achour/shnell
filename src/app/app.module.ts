import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { AuthModule, getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { WelcomePageComponent } from './components/welcome-page/welcome-page.component';
import { DownloadRedirectComponent } from './components/download-redirect/download-redirect.component';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { FooterComponent } from './components/footer/footer.component';
import { ServiceComponent } from './components/service/service.component';
import { ContactComponent } from './components/contact/contact.component';
import { PrivacyPolicyComponent } from './components/privacy-policy/privacy-policy.component';
import { BlogComponent } from './components/blog/blog.component';

import { HeaderComponent } from './components/header/header.component';
import { PartnerdashComponent } from './components/partnerdash/partnerdash.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ProfileComponent } from './components/profile/profile.component';
import { RetourspaymentsComponent } from './components/retourspayments/retourspayments.component';
import { SignInComponent } from './components/auth/sign-in/sign-in.component';
import { SignUpComponent } from './components/auth/sign-up/sign-up.component';
import { PublicLayoutComponent } from './public-layout/public-layout.component';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { AdminDriverManagementComponent } from './admin-driver-management/admin-driver-management.component';
import { ExpiredOrdersComponent } from './expired-orders/expired-orders.component';
import { UpdateStopLocationComponent } from './update-stop-location/update-stop-location.component';
import { NgModule } from '@angular/core';
import { ShnellDashboardComponent } from './shnell-dashboard/shnell-dashboard.component';
import { LottieComponent, provideLottieOptions } from 'ngx-lottie';
import player from 'lottie-web';

export function playerFactory() {
  return player;
}

@NgModule({
  declarations:  [
    DownloadRedirectComponent,
    WelcomePageComponent,
     AppComponent,
    HeaderComponent,
    HomeComponent,
    AboutComponent,
    FooterComponent,
    ServiceComponent,
    ContactComponent,
    PrivacyPolicyComponent,
    BlogComponent,
    PartnerdashComponent,
    SidebarComponent,
    ProfileComponent,
    RetourspaymentsComponent,
    SignInComponent,
    SignUpComponent,
    PublicLayoutComponent,
    AdminDriverManagementComponent,
    ExpiredOrdersComponent,
    UpdateStopLocationComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    MatButtonModule,
    FormsModule,
    DragDropModule,

AuthModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ShnellDashboardComponent,
    LottieComponent,
    HttpClientModule
  ],
    schemas: [],



  providers: [
    // place your Firebase configuration here

    provideFirebaseApp(() => initializeApp({
     apiKey: "AIzaSyDWNJDwoOzrOywA98IN288Pc3K81SRwv9k",
    authDomain: "shnell-393a6.firebaseapp.com",
    databaseURL: "https://shnell-393a6-default-rtdb.firebaseio.com",
    projectId: "shnell-393a6",
    storageBucket: "shnell-393a6.appspot.com",
    messagingSenderId: "217120837439",
    appId: "1:217120837439:web:bf8efa57bd6d30294e0d8a",
    measurementId: "G-7H2GZ2YM6V"
    })),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideDatabase(() => getDatabase()),
    provideFunctions(() => getFunctions()),
    provideAnimationsAsync(),
    provideLottieOptions({ player: playerFactory })
  ],

  bootstrap: [AppComponent]
})
export class AppModule { }

