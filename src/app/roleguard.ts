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
 *  carries `isBanned` === true. Mirrors the check the
 *  two Flutter apps already run in their `main.dart`. */
export function isUserBanned(data: any): boolean {
  return data?.isBanned === true;
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
 * Shnell Business guard (/app) — same rule as the apps' auth gate: a signed-in
 * account with its WhatsApp number verified (users/{uid}.isPhoneVerified,
 * set by the server). Unverified or profile-less accounts go back to
 * /sign-in, which resumes at the phone step. Admins pass. Banned accounts
 * are signed out.
 */
@Injectable({ providedIn: 'root' })
export class AuthedGuard implements CanActivate {
  constructor(private auth: Auth, private firestore: Firestore, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    const user = await currentUserOrWait(this.auth);
    if (!user) return this.router.createUrlTree(['/sign-in']);

    let data: any = null;
    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      data = snap.exists() ? snap.data() : null;
    } catch (err) {
      console.error('AuthedGuard read failed:', err);
      return true;   // fail open on a read blip; the dashboard re-checks the ban live
    }
    if (isUserBanned(data)) {
      await signOut(this.auth).catch(() => {});
      return this.router.createUrlTree(['/sign-in'], { queryParams: { banned: 1 } });
    }
    const admin = String(data?.role || '').trim().toLowerCase() === 'admin';
    if (!admin && data?.isPhoneVerified !== true) return this.router.createUrlTree(['/sign-in']);
    return true;
  }
}

/**
 * Partner console guard (stops-management). A professional account starts as
 * `company-onheld` at sign-up (see SignUpComponent) and only becomes `company`
 * once an admin approves its companies/{uid} verification doc — so this route
 * is unreachable until that happens, closing what was previously a completely
 * unguarded path (no canActivate at all) to the bulk-dispatch console.
 */
@Injectable({ providedIn: 'root' })
export class ApprovedCompanyGuard implements CanActivate {
  constructor(private auth: Auth, private firestore: Firestore, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    const user = await currentUserOrWait(this.auth);
    if (!user) return this.router.createUrlTree(['/sign-in']);

    if (await accountBanned(this.firestore, user.uid)) {
      await signOut(this.auth).catch(() => {});
      return this.router.createUrlTree(['/sign-in'], { queryParams: { banned: 1 } });
    }

    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = (snap.exists() ? (snap.data() as any)?.role : '')
        ?.toString().trim().toLowerCase();

      if (role === 'admin' || role === 'company') return true;
      if (role === 'company-onheld') return this.router.createUrlTree(['/pending-approval']);
      return this.router.createUrlTree(['/app']);
    } catch (err) {
      console.error('ApprovedCompanyGuard error:', err);
      return this.router.createUrlTree(['/app']);
    }
  }
}
