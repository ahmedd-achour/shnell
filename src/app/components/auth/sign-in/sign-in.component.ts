import { Component, inject } from '@angular/core';
import { Auth, AuthErrorCodes, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { isUserBanned } from '../../../roleguard';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css']
})
export class SignInComponent {
  authForm!: FormGroup;
  auth = inject(Auth);
  firestore = inject(Firestore);

  googleAuthProvider = (() => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  })();

  isSubmissionInProgress: boolean = false;
  errorMessage: string = '';
  isAdminMode: boolean = false;
  hidePassword = true;

  constructor(private router: Router, private route: ActivatedRoute) {
    this.initForm();
    if (this.route.snapshot.queryParamMap.get('banned') === '1') {
      this.errorMessage = 'Ce compte est suspendu. Contactez le support Shnell.';
    }
  }

  private readonly bannedMessage = 'Ce compte est suspendu. Contactez le support Shnell.';

  /** Reads users/{uid} and, if the account is banned, signs the user back out
   *  and surfaces the suspension message. Returns true when the login is blocked. */
  private async blockIfBanned(uid: string): Promise<boolean> {
    let banned = false;
    try {
      const snap = await getDoc(doc(this.firestore, 'users', uid));
      banned = snap.exists() ? isUserBanned(snap.data()) : false;
    } catch { /* fail open — a read blip must not lock anyone out */ }
    if (banned) {
      await signOut(this.auth).catch(() => {});
      this.isSubmissionInProgress = false;
      this.errorMessage = this.bannedMessage;
    }
    return banned;
  }

  initForm() {
    this.authForm = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    });
  }

  toggleAdminMode() {
    this.isAdminMode = !this.isAdminMode;
    this.errorMessage = '';
  }

  async loginWithGoogle() {
    this.isSubmissionInProgress = true;
    this.errorMessage = '';
    try {
      const cred = await signInWithPopup(this.auth, this.googleAuthProvider);
      if (await this.blockIfBanned(cred.user.uid)) return;
      // Google sign-in always lands on the user dashboard (never the admin console).
      await this.router.navigateByUrl('/app');
    } catch (error: any) {
      this.isSubmissionInProgress = false;
      const code = error?.code || '';
      const msg = (error?.message || '').toString();

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        this.errorMessage = '';
      } else if (
        code === 'auth/unauthorized-domain' ||
        code === 'auth/operation-not-allowed' ||
        msg.includes('redirect_uri_mismatch')
      ) {
        this.errorMessage =
          "Google sign-in isn't configured for this site yet — add this domain's OAuth redirect URI in the Firebase / Google Cloud console.";
      } else if (code === 'auth/popup-blocked') {
        this.errorMessage = 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
      } else {
        this.errorMessage = msg || 'Google sign-in failed';
      }
    }
  }

  async loginWithPhone() {
    this.errorMessage = 'Phone authentication is under construction.';
  }

  async onSubmit() {
    if (this.authForm.invalid) {
      this.errorMessage = 'Please fill all required fields';
      return;
    }

    this.isSubmissionInProgress = true;
    this.errorMessage = '';

    const { email, password } = this.authForm.value;

    try {
      const cred = await signInWithEmailAndPassword(this.auth, email, password);

      if (await this.blockIfBanned(cred.user.uid)) return;

      // Email+password + admin role -> admin console. Everyone else -> user dashboard.
      let role = '';
      try {
        const snap = await getDoc(doc(this.firestore, 'users', cred.user.uid));
        role = (snap.exists() ? (snap.data() as any)?.role : '')?.toString().trim().toLowerCase() || '';
      } catch { /* non-blocking */ }

      await this.router.navigateByUrl(role === 'admin' ? '/home-admin' : '/app');
    } catch (error: any) {
      this.isSubmissionInProgress = false;
      console.error('Sign-in error:', error);
      if (error.code === AuthErrorCodes.INVALID_EMAIL) {
        this.errorMessage = 'Email is not valid';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        this.errorMessage = 'Invalid email or password';
      } else {
        this.errorMessage = error.message || 'Something went wrong, please try again';
      }
    }
  }
}
