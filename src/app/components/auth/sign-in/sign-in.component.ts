import { Component, inject } from '@angular/core';
import { Auth, AuthErrorCodes, GoogleAuthProvider, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css']
})
export class SignInComponent {
  authForm!: FormGroup;
  auth = inject(Auth);
  firestore = inject(Firestore);

  googleAuthProvider = new GoogleAuthProvider();

  isSubmissionInProgress: boolean = false;
  errorMessage: string = '';

  private allowedRoles = ['company', 'admin']; // Allowed roles

  constructor(private router: Router) {
    this.initForm();
  }

  initForm() {
    this.authForm = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    });
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
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const uid = userCredential.user.uid;

      // Fetch Firestore user data
      const userDocRef = doc(this.firestore, 'users', uid);
      const userSnapshot = await getDoc(userDocRef);

      if (!userSnapshot.exists()) {
        await signOut(this.auth); // Immediately sign out
        throw new Error('User data not found in the system');
      }

      const userData: any = userSnapshot.data();

      // Check if role is allowed
      if (!this.allowedRoles.includes(userData.role)) {
        await signOut(this.auth); // Immediately sign out
        throw new Error('You are not authorized to access this dashboard');
      }

      // Success → redirect
      this.router.navigate(['/home-admin']); // successfull login = profile redirection
    } catch (error: any) {
      this.isSubmissionInProgress = false;
      console.error('Sign-in error:', error);
      if (error.code === AuthErrorCodes.INVALID_EMAIL) {
        this.errorMessage = 'Email is not valid';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        this.errorMessage = 'Invalid Email or Password';
      } else {
        this.errorMessage = error.message+'' || 'Something went wrong, please try again';
      }
    }
  }
hidePassword = true;


}
