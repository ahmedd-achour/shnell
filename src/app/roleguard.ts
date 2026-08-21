import { ShnellUser } from './../Models/shnellUsers.models';
import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(private auth: Auth, private firestore: Firestore, private router: Router) {}

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
    const currentUser = this.auth.currentUser;

    if (!currentUser) {
      this.router.navigate(['/sign-in']);
      return false;
    }

    const userDocRef = doc(this.firestore, `users/${currentUser.uid}`);
    const userData = await firstValueFrom(docData(userDocRef));

    if (!userData) {
      this.router.navigate(['/sign-in']);
      return false;
    }

    const user = ShnellUser.fromJson(userData);
    if (user.role !== 'admin') {
      this.router.navigate(['/unauthorized']); // create an UnauthorizedComponent
      return false;
    }

    return true;
  }
}
