import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, docData, updateDoc } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { toastSuccess } from '../shared/swal';

@Component({
  selector: 'app-update-stop-location',
  templateUrl: './update-stop-location.component.html',
  styleUrls: ['./update-stop-location.component.css']
})
export class UpdateStopLocationComponent implements OnInit {
  stopID: string | null = null;
  stop$!: Observable<any | null>;
  errorMessage: string | null = null;
  isLoading: boolean = false;
  newName: string = '';

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private router: Router
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.errorMessage = 'Token manquant';
      return;
    }

    try {
      this.stopID = atob(token); // decode base64 token
    } catch {
      this.errorMessage = 'Token invalide';
      return;
    }

    const stopRef = doc(this.firestore, `stops/${this.stopID}`);
    this.stop$ = docData(stopRef, { idField: 'id' }).pipe(
      catchError(err => {
        this.errorMessage = 'Impossible de récupérer le stop';
        return of(null);
      })
    );
  }

async setCurrentLocation() {
  if (!navigator.geolocation || !this.stopID) {
    this.errorMessage = 'Géolocalisation non supportée sur ce navigateur.';
    return;
  }

  this.isLoading = true;
  this.errorMessage = null;

  try {
    // ✅ Recheck permission status if supported
    if (navigator.permissions) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (status.state === 'denied') {
          this.errorMessage = 'L\'accès à la localisation est refusé. Veuillez l\'autoriser dans les paramètres du navigateur.';
          this.isLoading = false;
          return;
        }
      } catch (permErr) {
        console.warn('Permissions API non disponible ou erreur:', permErr);
        // continue to geolocation request anyway
      }
    }

    // ✅ Always re-request the current position
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const stopRef = doc(this.firestore, `stops/${this.stopID}`);
          const updateData: any = {
            destination: { latitude: lat, longitude: lng },
            destinationName : "changée par le lien"
          };

          if (this.newName.trim()) {
            updateData.destinationName = this.newName.trim();
          }

          await updateDoc(stopRef, updateData);
          toastSuccess('Emplacement mis à jour avec succès');
          await this.router.navigate(['/', this.stopID]);
        } catch (err) {
          console.error(err);
          this.errorMessage = 'Erreur lors de la mise à jour du stop.';
        } finally {
          this.isLoading = false;
        }
      },
      (err) => {
        console.error('Erreur de géolocalisation:', err);
        this.isLoading = false;

        switch (err.code) {
          case 1:
            this.errorMessage = 'Permission de localisation refusée. Veuillez autoriser l\'accès.';
            break;
          case 2:
            this.errorMessage = 'Position actuellement indisponible.';
            break;
          case 3:
            this.errorMessage = 'Ovrir la permission des localisation. ';
            break;
          default:
            this.errorMessage = 'Impossible de récupérer votre position.';
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  } catch (err) {
    console.error('Erreur inattendue:', err);
    this.errorMessage = 'Une erreur est survenue lors de la récupération de la position.';
    this.isLoading = false;
  }
}

}
