import { Component, inject } from '@angular/core';
import { Auth, AuthErrorCodes, createUserWithEmailAndPassword, signInWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sign-up',
  templateUrl: './sign-up.component.html',
  styleUrls: ['./sign-up.component.css']
})
export class SignUpComponent {
  authForm!: FormGroup;

  auth = inject(Auth);
  firestore = inject(Firestore);
  storage = inject(Storage);

  cinFile: File | null = null;
  companyPaperFile: File | null = null;
  fileError: string = '';

  isSubmissionInProgress: boolean = false;
  uploadStatus: string = '';
  errorMessage: string = '';

  constructor(private router: Router) {
    this.initForm();
  }

  initForm() {
    this.authForm = new FormGroup({
      businessName: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone: new FormControl('', Validators.required),
      password: new FormControl('', [Validators.required, Validators.minLength(6)]),
      confirmPassword: new FormControl('', Validators.required),
      dailyVolume: new FormControl('', Validators.required),
      cinNumber: new FormControl('', Validators.required),
    });
  }

  onCinFileSelected(event: Event) {
    this.cinFile = (event.target as HTMLInputElement).files?.[0] || null;
  }

  onCompanyPaperFileSelected(event: Event) {
    this.companyPaperFile = (event.target as HTMLInputElement).files?.[0] || null;
  }

  private async uploadVerificationFile(uid: string, file: File, label: 'cin' | 'company_paper'): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fileRef = ref(this.storage, `company_verification/${uid}/${label}.${ext}`);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  }

  async onSubmit() {
    this.errorMessage = '';
    this.fileError = '';

    if (this.authForm.invalid) {
      this.errorMessage = 'Veuillez remplir correctement tous les champs requis.';
      return;
    }
    if (!this.cinFile || !this.companyPaperFile) {
      this.fileError = 'La copie de la CIN et le document de l\'entreprise (registre de commerce / patente) sont requis.';
      return;
    }

    const { businessName, email, phone, password, confirmPassword, dailyVolume, cinNumber } = this.authForm.value;

    if (password !== confirmPassword) {
      this.errorMessage = 'Les mots de passe ne correspondent pas';
      return;
    }

    this.isSubmissionInProgress = true;

    try {
      // Step 1: Create the Auth account.
      this.uploadStatus = 'Création du compte...';
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const uid = userCredential.user.uid;
      await signInWithEmailAndPassword(this.auth, email, password);

      // Step 2: Upload verification documents. If either fails we still leave
      // the account created (it's already pending review either way) but we
      // surface the error so the partner knows to retry from their pending page.
      this.uploadStatus = 'Envoi des documents de vérification...';
      let cinFileUrl = '';
      let companyPaperUrl = '';
      try {
        [cinFileUrl, companyPaperUrl] = await Promise.all([
          this.uploadVerificationFile(uid, this.cinFile, 'cin'),
          this.uploadVerificationFile(uid, this.companyPaperFile, 'company_paper'),
        ]);
      } catch (uploadErr: any) {
        console.error('Verification upload failed:', uploadErr);
        this.errorMessage = 'Compte créé, mais l\'envoi des documents a échoué. Reconnectez-vous pour réessayer depuis votre espace en attente.';
      }

      // Step 3: users/{uid} — role stays 'company-onheld' until an admin
      // approves the companies/{uid} application below. Never include
      // 'balance' here: it isn't self-settable (see firestore.rules) and any
      // starting credit must be granted server-side, same as driver wallets.
      this.uploadStatus = 'Finalisation...';
      await setDoc(doc(this.firestore, 'users', uid), {
        email,
        name: businessName,
        phone,
        role: 'company-onheld',
        accType: 'standard',
        isBanned: false,
        darkMode: true,
        drivers: [], // roster this company can direct-assign to (see profile.component.ts)
      });

      // Step 4: companies/{uid} — the verification application admins review.
      await setDoc(doc(this.firestore, 'companies', uid), {
        businessName,
        email,
        phone,
        dailyVolume,
        cinNumber,
        cinFileUrl,
        companyPaperUrl,
        isAdminApproved: false,
        submittedAt: serverTimestamp(),
      });

      this.router.navigate(['/pending-approval']);
    } catch (error: any) {
      this.isSubmissionInProgress = false;
      console.error('Signup error:', error);

      if (error.code?.startsWith('auth/')) {
        switch (error.code) {
          case AuthErrorCodes.INVALID_EMAIL:
            this.errorMessage = 'L\'email n\'est pas valide';
            break;
          case AuthErrorCodes.WEAK_PASSWORD:
            this.errorMessage = 'Le mot de passe est trop faible (6 caractères min.)';
            break;
          case AuthErrorCodes.EMAIL_EXISTS:
            this.errorMessage = 'Cet email est déjà utilisé par un autre compte';
            break;
          default:
            this.errorMessage = error.message || 'Échec de l\'authentification. Réessayez.';
        }
      } else {
        this.errorMessage = error.message || 'Une erreur est survenue lors de l\'inscription.';
      }
    }
  }
}
