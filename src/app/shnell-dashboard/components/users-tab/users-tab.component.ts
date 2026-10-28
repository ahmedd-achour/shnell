import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShnellUser, DriverRTDBLocation } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { AdminHubService } from '../../services/admin-hub.service';
import { confirmAction, toastSuccess, toastError } from '../../../shared/swal';
import { walletBalances } from '../../services/wallet';
import { WalletMovementComponent } from '../wallet-movement/wallet-movement.component';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-users-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, WalletMovementComponent],
  templateUrl: './users-tab.component.html',
  styleUrls: ['./users-tab.component.css']
})
export class UsersTabComponent implements OnInit {
  @Input() users: ShnellUser[] = [];
  @Input() driverLocations: DriverRTDBLocation[] = [];

  @Output() selectUserForNotification = new EventEmitter<ShnellUser>();
  /** Opens Account 360 (any role). */
  @Output() inspectDriver = new EventEmitter<string>();
  @Output() navigateTab = new EventEmitter<string>();

  searchTerm: string = '';
  roleFilter: string = 'all';

  /** Account the credit / debit form is open for. */
  rechargeUserTarget: ShnellUser | null = null;
  /** Recharges above the threshold, waiting for a SECOND admin (approved in Finance). */
  pendingRecharges$!: Observable<any[]>;
  config$!: Observable<any>;
  readonly walletBalances = walletBalances;

  processingBanId: string | null = null;
  updatingAccTypeId: string | null = null;

  constructor(private dashboardDataService: DashboardDataService, private hub: AdminHubService) {}

  ngOnInit(): void {
    this.pendingRecharges$ = this.hub.pendingRecharges$;
    this.config$ = this.hub.config$;
  }

  get filteredUsers(): ShnellUser[] {
    const q = this.searchTerm.toLowerCase();
    return this.users.filter(user => {
      const matchesSearch = !q ||
        user.name?.toLowerCase().includes(q) ||
        user.email?.toLowerCase().includes(q) ||
        user.phone?.includes(this.searchTerm) ||
        (user.uid || user.id || '').toLowerCase().includes(q);

      const matchesRole = this.roleFilter === 'all' || user.role === this.roleFilter;

      return matchesSearch && matchesRole;
    });
  }

  isOnline(user: ShnellUser): boolean {
    const userId = user.uid || user.id;
    if (!userId) return false;
    const loc = this.driverLocations.find(l => l.driverId === userId);
    return !!loc && (loc.isOnline ?? true);
  }

  openUserDetails(user: ShnellUser): void {
    this.inspectDriver.emit(user.uid || user.id || '');
  }

  openRechargeModal(user: ShnellUser): void {
    this.rechargeUserTarget = user;
  }

  async toggleBan(user: ShnellUser): Promise<void> {
    const userId = user.uid || user.id;
    if (!userId) return;

    const currentBan = user.isBanned || false;
    const ok = await confirmAction({
      title: currentBan ? `Débannir ${user.name} ?` : `Bannir ${user.name} ?`,
      text: currentBan
        ? 'Ce compte pourra de nouveau se connecter et utiliser la plateforme.'
        : 'Ce compte sera immédiatement bloqué.',
      confirmText: currentBan ? 'Débannir' : 'Bannir',
      danger: !currentBan,
    });
    if (!ok) return;

    this.processingBanId = userId;
    try {
      const newBanState = await this.dashboardDataService.toggleUserBan(userId, currentBan);
      user.isBanned = newBanState;
      toastSuccess(newBanState ? 'Compte banni' : 'Compte débanni');
    } catch (err: any) {
      console.error('Failed to toggle ban state:', err);
      toastError(err?.message || 'Erreur lors de la mise à jour du statut');
    } finally {
      this.processingBanId = null;
    }
  }

  async updateAccType(user: ShnellUser, newType: 'pro' | 'standard' | string): Promise<void> {
    const userId = user.uid || user.id;
    if (!userId) return;
    if (user.accType === newType) return;

    this.updatingAccTypeId = userId;
    try {
      await this.dashboardDataService.updateUserAccType(userId, newType);
      user.accType = newType as any;
      toastSuccess(`Palier mis à jour : ${String(newType).toUpperCase()}`);
    } catch (err: any) {
      console.error('Failed to update account type:', err);
      toastError(err?.message || 'Erreur lors de la mise à jour du palier');
    } finally {
      this.updatingAccTypeId = null;
    }
  }

  onSendNotify(user: ShnellUser): void {
    this.selectUserForNotification.emit(user);
  }

  onInspectDriverClick(user: ShnellUser): void {
    this.inspectDriver.emit(user.uid || user.id || '');
  }
}
