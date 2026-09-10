import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Auth, authState, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { firstValueFrom, of } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';

async function currentUserOrWait(auth: Auth) {
  let user = auth.currentUser;
  if (!user) {
    user = await firstValueFrom(
      authState(auth).pipe(timeout({ first: 4000 }), catchError(() => of(null)))
    );
  }
  return user;
}

/** A user is barred from every authenticated surface when their account doc
 *  carries `isBan` (or the legacy `isBanned`) === true. Mirrors the check the
 *  two Flutter apps already run in their `main.dart`. */
export function isUserBanned(data: any): boolean {
  return data?.isBan === true || data?.isBanned === true;
}

/** Read `users/{uid}` and report whether the account is banned. Fails open
 *  (returns false) on any read error so a transient Firestore blip can't lock
 *  a legitimate user out. */
async function accountBanned(firestore: Firestore, uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(firestore, 'users', uid));
    return snap.exists() ? isUserBanned(snap.data()) : false;
  } catch (err) {
    console.error('ban check failed:', err);
    return false;
  }
}

/**
 * Admin dashboard guard.
 * The console is reachable ONLY when an `admin` account has authenticated
 * with email + password (a Google sign-in never reaches it). Anything else
 * falls through to the user dashboard. Banned accounts are signed out.
 */
@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private auth: Auth, private firestore: Firestore, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    const user = await currentUserOrWait(this.auth);
    if (!user) return this.router.createUrlTree(['/sign-in']);

    if (await accountBanned(this.firestore, user.uid)) {
      await signOut(this.auth).catch(() => {});
      return this.router.createUrlTree(['/sign-in'], { queryParams: { banned: 1 } });
    }

    const viaPassword = (user.providerData || []).some(p => p?.providerId === 'password');
    if (!viaPassword) return this.router.createUrlTree(['/app']);

    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = (snap.exists() ? (snap.data() as any)?.role : '')
        ?.toString().trim().toLowerCase();
      if (role !== 'admin') return this.router.createUrlTree(['/app']);
      return true;
    } catch (err) {
      console.error('AdminGuard error:', err);
      return this.router.createUrlTree(['/app']);
    }
  }
}

/**
 * User dashboard guard — any authenticated account is allowed in, no role check,
 * EXCEPT a banned account, which is signed out and bounced to /sign-in.
 */
@Injectable({ providedIn: 'root' })
export class AuthedGuard implements CanActivate {
  constructor(private auth: Auth, private firestore: Firestore, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    const user = await currentUserOrWait(this.auth);
    if (!user) return this.router.createUrlTree(['/sign-in']);

    if (await accountBanned(this.firestore, user.uid)) {
      await signOut(this.auth).catch(() => {});
      return this.router.createUrlTree(['/sign-in'], { queryParams: { banned: 1 } });
    }
    return true;
  }
}
