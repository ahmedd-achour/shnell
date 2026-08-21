import { Component, inject } from '@angular/core';
import { Auth, User, signOut } from '@angular/fire/auth';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ShnellUser } from '../../../../Models/shnellUsers.models';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  private activatedRoute = inject(ActivatedRoute);
  private router = inject(Router);

  // get the user from the route (which is injected by the UserResolver)
  user: User = this.activatedRoute.snapshot.data['user'];

  // get the auth service
  auth = inject(Auth);


 users$!: Observable<ShnellUser[]>; // Observable for users collection

  constructor(private firestore: Firestore) {}

  ngOnInit(): void {
    const usersCollection = collection(this.firestore, 'users');
    this.users$ = collectionData(usersCollection, { idField: 'id' }) as Observable<ShnellUser[]>;
  }
  onSignOut() {
    signOut(this.auth).then(response => {
      this.router.navigate(['/auth/sign-in']);
    })
      .catch(error => {
        console.error('Error occurred:', error);
      })
  }

  center: google.maps.LatLngLiteral = { lat: 36.8065, lng: 10.1815 }; // Tunis
  zoom = 12;

   navItems = [
    { label: 'Driver Management', path: '/home-admin' },//
    { label: 'Parcel Management', path: '/parcel-management' },//
    { label: 'Stops Management', path: '/stops-management' },
    { label: 'Live Map & Data', path: '/live-map' },//
    { label: 'Analytics & Performance', path: '/analytics' },
    {label : "Retour & payment Management" , path : "/retour&payment"},

    { label: 'Profile', path: '/profile' }
  ];
    sidebarCollapsed = false;

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
