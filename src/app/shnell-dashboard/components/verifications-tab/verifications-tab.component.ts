import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShnellUser } from '../../models/dashboard.models';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { toastSuccess, toastError } from '../../../shared/swal';

@Component({
  selector: 'app-verifications-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './verifications-tab.component.html',
  styleUrls: []
})
export class VerificationsTabComponent {
  @Input() verifications: any[] = [];
  @Input() users: ShnellUser[] = [];

  statusFilter: 'all' | 'pending' | 'approved' = 'pending';
  searchQuery: string = '';
  processingId: string | null = null;
  selectedVerification: any = null;
  activeAssetTab: string = '';

  constructor(private firestore: Firestore) {}

  get filteredVerifications(): any[] {
    let filtered = this.verifications;

    if (this.statusFilter === 'pending') {
      filtered = filtered.filter(v => v.isVerified !== true);
    } else if (this.statusFilter === 'approved') {
      filtered = filtered.filter(v => v.isVerified === true);
    }

    if (this.searchQuery.trim().length > 0) {
      const q = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(v => {
        const u = this.getDriver(v.uid);
        if (!u) return false;
        return (
          (u.name && u.name.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.phone && u.phone.toLowerCase().includes(q)) ||
          (v.uid && v.uid.toLowerCase().includes(q))
        );
      });
    }

    return filtered;
  }

  getDriver(uid: string): ShnellUser | undefined {
    return this.users.find(u => u.uid === uid || u.id === uid);
  }

  getDriverName(uid: string): string {
    const u = this.getDriver(uid);
    return u ? u.name || u.email || uid : uid;
  }

  getDriverContact(uid: string): string {
    const u = this.getDriver(uid);
    return u ? u.phone || 'N/A' : 'N/A';
  }

  openDossier(v: any) {
    this.selectedVerification = v;
    if (v.cinFrontUrl) this.activeAssetTab = 'cinFront';
    else if (v.drivingLicenseFrontUrl) this.activeAssetTab = 'permitFront';
    else this.activeAssetTab = 'cinFront';
  }

  closeDossier() {
    this.selectedVerification = null;
  }

  async toggleApproval(v: any): Promise<void> {
    if (!v || !v.uid) return;
    this.processingId = v.uid;
    try {
      const newStatus = v.isVerified !== true;
      const verifyRef = doc(this.firestore, `drivers/${v.uid}`);
      await updateDoc(verifyRef, { isVerified: newStatus });
      v.isVerified = newStatus;
      toastSuccess(newStatus ? 'Vérification approuvée' : 'Vérification révoquée');
    } catch (e) {
      console.error('Error toggling driver verification:', e);
      toastError('Erreur lors de la mise à jour de la vérification');
    } finally {
      this.processingId = null;
    }
  }

  onAssetImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if ((img as any)._failed) return;
    (img as any)._failed = true;
    img.src = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80';
  }
}
