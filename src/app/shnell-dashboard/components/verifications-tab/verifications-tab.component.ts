import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShnellUser } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { FormsModule } from '@angular/forms';
import { toastSuccess, toastError } from '../../../shared/swal';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { aiSignalLabel, aiVerdictLabel, aiVerdictClass, aiReviewStatusLabel, aiReviewStatusClass } from '../../../shared/ai-review-labels';

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
  /** drivers/{uid}/private/identity — the Gemini identity review (admin-only). */
  identityReview: any = null;
  identityLoading = false;

  readonly verdictLabel = aiVerdictLabel;
  readonly verdictClass = aiVerdictClass;
  readonly reviewStatusLabel = aiReviewStatusLabel;
  readonly reviewStatusClass = aiReviewStatusClass;
  readonly signalLabel = aiSignalLabel;

  constructor(private dashboardDataService: DashboardDataService, private firestore: Firestore) {}

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
    this.loadIdentityReview(v.uid);
  }

  private async loadIdentityReview(uid: string): Promise<void> {
    this.identityReview = null;
    if (!uid) return;
    this.identityLoading = true;
    try {
      const snap = await getDoc(doc(this.firestore, 'drivers', uid, 'private', 'identity'));
      if (this.selectedVerification?.uid === uid) this.identityReview = snap.exists() ? snap.data() : null;
    } catch (e) {
      console.error('Identity review load failed:', e);
    } finally {
      this.identityLoading = false;
    }
  }

  closeDossier() {
    this.selectedVerification = null;
    this.identityReview = null;
  }

  async toggleApproval(v: any): Promise<void> {
    if (!v || !v.uid) return;
    this.processingId = v.uid;
    try {
      const newStatus = v.isVerified !== true;
      await this.dashboardDataService.setDriverVerified(v.uid, newStatus);
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
