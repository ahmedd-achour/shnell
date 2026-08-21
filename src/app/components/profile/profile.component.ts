import { Component, inject, OnInit } from '@angular/core';
import { Auth, User, signOut } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Firestore, arrayRemove, arrayUnion, doc, docData, getDoc, updateDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { ShnellUser } from '../../../Models/shnellUsers.models';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  private auth = inject(Auth);
  private router = inject(Router);
  private firestore = inject(Firestore);

  user: User | null = null;
  profile$!: Observable<ShnellUser | undefined>;

  ngOnInit() {
    this.user = this.auth.currentUser;

    if (this.user) {
      const userDoc = doc(this.firestore, `users/${this.user.uid}`);
      this.profile$ = docData(userDoc) as Observable<ShnellUser>;
    }
  }

  async onSignOut() {
    try {
      await signOut(this.auth);
      this.router.navigate(['/sign-in']);
    } catch (err) {
      console.error('Error occurred during logout:', err);
    }
  }

  async addDriver(driverId: string) {
    if (!this.user || !driverId.trim()) return;

    const userDocRef = doc(this.firestore, `users/${this.user.uid}`);
    const driverDocRef = doc(this.firestore, `users/${driverId}`);

    try {
      const driverSnap = await getDoc(driverDocRef);
      if (!driverSnap.exists()) {
        alert('❌ Driver not found in system');
        return;
      }

      const driverData = driverSnap.data() as ShnellUser;
      if (driverData.role !== 'driver') {
        alert('❌ This user is not registered as a driver');
        return;
      }

      const companySnap = await getDoc(userDocRef);
      if (!companySnap.exists()) {
        alert('❌ Company profile not found');
        return;
      }

      const companyData = companySnap.data() as ShnellUser;



      await updateDoc(userDocRef, {
        drivers: arrayUnion(driverId)
      });

      Swal.fire({
  title: "Success!",
  text: "le chauffeur a bien été ajouté!",
  icon: "success"
});
    } catch (err) {
      console.error('Error adding driver:', err);
      alert('❌ Something went wrong while adding the driver');
    }
  }

  // ✅ Remove driver function
  async removeDriver(driverId: string) {
    if (!this.user || !driverId) return;

    const userDocRef = doc(this.firestore, `users/${this.user.uid}`);

    try {
      const companySnap = await getDoc(userDocRef);
      if (!companySnap.exists()) {
        alert('❌ Company profile not found');
        return;
      }

      const companyData = companySnap.data() as ShnellUser;



      await updateDoc(userDocRef, {
        drivers: arrayRemove(driverId)
      });

          Swal.fire({
  title: "Success!",
  text: "le chauffeur a bien été retiré!",
  icon: "success"
});

    } catch (err) {
      console.error('Error removing driver:', err);
      alert('❌ Something went wrong while removing the driver');
    }
  }
}
