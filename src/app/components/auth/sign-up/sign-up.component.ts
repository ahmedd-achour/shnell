import { Component, inject } from '@angular/core';
import { Auth, AuthErrorCodes, createUserWithEmailAndPassword, signInWithEmailAndPassword } from '@angular/fire/auth';  // Added signIn for explicit
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ShnellUser } from '../../../../Models/shnellUsers.models';
import { Company } from '../../../../Models/company';

@Component({
  selector: 'app-sign-up',
  templateUrl: './sign-up.component.html',
  styleUrls: ['./sign-up.component.css']
})
export class SignUpComponent {
  authForm!: FormGroup;

  auth = inject(Auth);
  firestore = inject(Firestore);

  isSubmissionInProgress: boolean = false;
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
    });
  }

  async onSubmit() {
    if (this.authForm.invalid) {
      this.errorMessage = 'Please fill all required fields correctly';
      return;
    }

    const { businessName, email, phone, password, confirmPassword, dailyVolume } = this.authForm.value;

    // Password confirmation check
    if (password !== confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    this.isSubmissionInProgress = true;
    this.errorMessage = '';

    try {
      // Step 1: Create user in Firebase Auth
      console.log('Creating Auth user for:', email);
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const uid = userCredential.user.uid;
      console.log('Auth user created with UID:', uid);

      // Step 2: Explicitly sign in (redundant but ensures auth state)
      await signInWithEmailAndPassword(this.auth, email, password);
      console.log('User signed in');

      // Step 3: Construct and save to Firestore
      const newUser = new Company(
        email,            // email
        businessName,     // name
        phone,            // phone
        'company-onheld', // role
        true,             // darkMode
        50.0,            // balance (fixed to 100.0 for cleanliness)
        [],               // drivers
        dailyVolume,
        0.25       // dailyVolume
      );

      console.log('Saving user to Firestore:', newUser.toJson());

      // Separate try-catch for Firestore
      try {
        await setDoc(doc(this.firestore, 'users', uid), newUser.toJson());
        console.log('Firestore doc saved successfully for UID:', uid);
      } catch (firestoreError: any) {
        console.error('Firestore save failed:', firestoreError);
        if (firestoreError.code === 'permission-denied') {
          throw new Error('Firestore permissions denied. Check your Security Rules in Firebase Console.');
        } else {
          throw firestoreError;
        }
      }

      // Success: Redirect to dashboard (or sign-in if preferred)
      this.router.navigate(['/sign-in']);  // Change to your post-signup route
    } catch (error: any) {
      this.isSubmissionInProgress = false;
      console.error('Signup error:', error);

      // Handle Auth errors
      if (error.code?.startsWith('auth/')) {
        switch (error.code) {
          case AuthErrorCodes.INVALID_EMAIL:
            this.errorMessage = 'Email is not valid';
            break;
          case AuthErrorCodes.WEAK_PASSWORD:
            this.errorMessage = 'Password is too weak (min 6 characters)';
            break;
          case AuthErrorCodes.EMAIL_EXISTS:
            this.errorMessage = 'The email is already used for another account';
            break;
          default:
            this.errorMessage = error.message || 'Authentication failed. Please try again.';
        }
      } else {
        // Firestore or other errors
        this.errorMessage = error.message || 'Something went wrong with registration. Check console for details.';
      }
    }
  }
}
