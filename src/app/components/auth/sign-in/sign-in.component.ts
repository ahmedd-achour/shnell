import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Auth, AuthErrorCodes, GoogleAuthProvider, User, signInWithEmailAndPassword, signInWithPopup, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { isUserBanned } from '../../../roleguard';

type Step = 'start' | 'phone' | 'code';

/** Countries offered for the WhatsApp number (any other: type the full +number). */
const DIAL_CODES = [
  { code: '+216', flag: '🇹🇳', name: 'Tunisie' },
  { code: '+213', flag: '🇩🇿', name: 'Algérie' },
  { code: '+218', flag: '🇱🇾', name: 'Libye' },
  { code: '+212', flag: '🇲🇦', name: 'Maroc' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '', flag: '🌍', name: 'Autre (+indicatif)' },
];

/** The phone_otp.js error codes (HttpsError message) -> what the user reads. */
const OTP_ERRORS: Record<string, string> = {
  'invalid-phone': 'Numéro invalide : vérifiez l’indicatif et le numéro.',
  'phone-in-use': 'Ce numéro est déjà lié à un autre compte Shnell.',
  'wait-before-resend': 'Patientez un peu avant de redemander un code.',
  'too-many-codes': 'Trop de codes demandés. Réessayez plus tard.',
  'whatsapp-send-failed': 'Le code n’a pas pu être envoyé sur WhatsApp. Vérifiez que ce numéro a WhatsApp.',
  'wrong-code': 'Code incorrect.',
  'invalid-code': 'Code incorrect.',
  'code-expired': 'Ce code a expiré : demandez-en un nouveau.',
  'no-code': 'Ce code a expiré : demandez-en un nouveau.',
  'too-many-attempts': 'Trop d’essais. Demandez un nouveau code.',
  'otp-not-configured': 'La vérification par WhatsApp est momentanément indisponible.',
};

/**
 * Shnell Business sign-in / sign-up: the same experience as the mobile apps.
 *   1. Google (creates the account on first use, as the client app does);
 *   2. the WhatsApp number, verified with a 6-digit code (requestPhoneOtp /
 *      verifyPhoneOtp — the server sets users/{uid}.isPhoneVerified);
 *   3. /app.
 * Admins keep their email + password entry to the console.
 */
@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css']
})
export class SignInComponent implements OnInit, OnDestroy {
  authForm!: FormGroup;
  auth = inject(Auth);
  firestore = inject(Firestore);
  private functions = inject(Functions);

  googleAuthProvider = (() => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  })();

  readonly dialCodes = DIAL_CODES;
  step: Step = 'start';
  dial = '+216';
  localNumber = '';
  sentTo = '';
  code = '';
  resendIn = 0;
  signedInAs = '';

  isSubmissionInProgress: boolean = false;
  errorMessage: string = '';
  isAdminMode: boolean = false;
  hidePassword = true;

  private timer: any = null;
  private userUnsub?: () => void;

  constructor(private router: Router, private route: ActivatedRoute) {
    this.initForm();
    if (this.route.snapshot.queryParamMap.get('banned') === '1') {
      this.errorMessage = 'Ce compte est suspendu. Contactez le support Shnell.';
    }
  }

  async ngOnInit(): Promise<void> {
    // Back here signed in but not verified yet (AuthedGuard sends them): resume at the phone step.
    await this.auth.authStateReady?.();
    const user = this.auth.currentUser;
    const viaGoogle = (user?.providerData || []).some((p) => p?.providerId === 'google.com');
    if (user && viaGoogle && this.route.snapshot.queryParamMap.get('banned') !== '1') {
      this.isSubmissionInProgress = true;
      await this.continueAfterGoogle(user);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.userUnsub?.();
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

  /* ------------------------------ 1. Google ------------------------------ */

  async loginWithGoogle() {
    this.isSubmissionInProgress = true;
    this.errorMessage = '';
    try {
      const cred = await signInWithPopup(this.auth, this.googleAuthProvider);
      await this.continueAfterGoogle(cred.user);
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
          "La connexion Google n'est pas encore configurée pour ce site (domaine OAuth à ajouter dans Firebase).";
      } else if (code === 'auth/popup-blocked') {
        this.errorMessage = 'Votre navigateur a bloqué la fenêtre Google. Autorisez les pop-ups pour ce site et réessayez.';
      } else {
        this.errorMessage = msg || 'La connexion Google a échoué';
      }
    }
  }

  /**
   * The account exists after this (created like the client app's sign-up),
   * then: banned -> out; phone verified -> /app; else the phone step.
   */
  private async continueAfterGoogle(user: User): Promise<void> {
    this.signedInAs = user.email || user.displayName || '';
    const ref = doc(this.firestore, 'users', user.uid);
    let data: any = null;
    try {
      const snap = await getDoc(ref);
      data = snap.exists() ? snap.data() : null;
      if (!data || !data.role) {
        // --- NEW ACCOUNT --- same seed as the client app (phone set by the server once verified).
        const seed: Record<string, any> = {
          email: user.email || '', name: user.displayName || '', phone: '',
          role: 'user', accType: 'standard', isActive: false, darkMode: false, language: 'fr',
          platform: 'web', isPhoneVerified: false, isBanned: false, isVerified: false,
          createdAt: serverTimestamp(),
        };
        // An unfinished profile only gets what it is missing; server flags stay server-owned.
        const patch = data
          ? Object.fromEntries(Object.entries(seed).filter(([k]) => !(k in data) && !['isBanned', 'isVerified', 'isPhoneVerified'].includes(k)))
          : seed;
        await setDoc(ref, patch, { merge: !!data });
        data = { ...(data || {}), ...patch };
      }
    } catch (e) {
      console.error('[sign-in] profile sync failed', e);
    }
    if (await this.blockIfBanned(user.uid)) return;
    if (data?.isPhoneVerified === true || String(data?.role || '').toLowerCase() === 'admin') {
      await this.router.navigateByUrl('/app');
      return;
    }
    this.isSubmissionInProgress = false;
    this.step = 'phone';
    this.watchVerification(user.uid);
  }

  /** The server flips isPhoneVerified: move on as soon as it does (like the apps' auth gate). */
  private watchVerification(uid: string): void {
    this.userUnsub?.();
    this.userUnsub = onSnapshot(doc(this.firestore, 'users', uid), (s) => {
      if (s.data()?.['isPhoneVerified'] === true) {
        this.userUnsub?.();
        this.router.navigateByUrl('/app');
      }
    }, () => { /* the verify call's answer still moves on */ });
  }

  /* ------------------------------ 2. WhatsApp ------------------------------ */

  get fullNumber(): string {
    const local = this.localNumber.replace(/[^\d+]/g, '');
    if (!this.dial) return local.startsWith('+') ? local : (local ? '+' + local : '');
    return this.dial + local.replace(/^\+/, '').replace(/^0+/, '');
  }

  private otpError(e: any): string {
    const key = String(e?.message || '').replace(/^.*?:\s*/, '').trim();
    return OTP_ERRORS[key] || 'Une erreur est survenue. Réessayez.';
  }

  async sendCode(): Promise<void> {
    const phone = this.sentTo || this.fullNumber;
    if (!/^\+\d{8,15}$/.test(phone)) { this.errorMessage = OTP_ERRORS['invalid-phone']; return; }
    this.isSubmissionInProgress = true;
    this.errorMessage = '';
    try {
      const res = await httpsCallable<any, { phone?: string; resendInMs?: number }>(this.functions, 'requestPhoneOtp')({ phone, lang: 'fr' });
      this.sentTo = res.data?.phone || phone;
      this.code = '';
      this.step = 'code';
      this.countdown(Math.round((res.data?.resendInMs ?? 60000) / 1000));
      setTimeout(() => document.getElementById('otp-input')?.focus(), 50);
    } catch (e: any) {
      this.errorMessage = this.otpError(e);
    } finally {
      this.isSubmissionInProgress = false;
    }
  }

  onCodeInput(v: string): void {
    this.code = String(v || '').replace(/\D/g, '').slice(0, 6);
    this.errorMessage = '';
    if (this.code.length === 6) this.verifyCode();
  }

  async verifyCode(): Promise<void> {
    if (this.code.length !== 6 || this.isSubmissionInProgress) return;
    this.isSubmissionInProgress = true;
    this.errorMessage = '';
    try {
      await httpsCallable(this.functions, 'verifyPhoneOtp')({ code: this.code });
      await this.router.navigateByUrl('/app');
    } catch (e: any) {
      this.errorMessage = this.otpError(e);
      this.code = '';
      this.isSubmissionInProgress = false;
    }
  }

  changeNumber(): void {
    clearInterval(this.timer);
    this.resendIn = 0;
    this.sentTo = '';
    this.code = '';
    this.errorMessage = '';
    this.step = 'phone';
  }

  private countdown(seconds: number): void {
    clearInterval(this.timer);
    this.resendIn = seconds;
    this.timer = setInterval(() => {
      this.resendIn = Math.max(0, this.resendIn - 1);
      if (!this.resendIn) clearInterval(this.timer);
    }, 1000);
  }

  /** "Use another account" — back to step 1. */
  async useAnotherAccount(): Promise<void> {
    this.userUnsub?.();
    clearInterval(this.timer);
    await signOut(this.auth).catch(() => {});
    this.step = 'start';
    this.sentTo = '';
    this.code = '';
    this.localNumber = '';
    this.errorMessage = '';
    this.isSubmissionInProgress = false;
  }

  /* ------------------------------ admins ------------------------------ */

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
        this.errorMessage = error.message || 'Login failed';
      }
    }
  }
}
