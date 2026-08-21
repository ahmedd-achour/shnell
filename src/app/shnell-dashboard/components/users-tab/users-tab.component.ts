import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShnellUser, DriverRTDBLocation } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';

@Component({
  selector: 'app-users-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users-tab.component.html',
  styleUrls: ['./users-tab.component.css']
})
export class UsersTabComponent implements OnInit {
  @Input() users: ShnellUser[] = [];
  @Input() driverLocations: DriverRTDBLocation[] = [];

  @Output() selectUserForNotification = new EventEmitter<ShnellUser>();
  @Output() inspectDriver = new EventEmitter<string>();

  searchTerm: string = '';
  roleFilter: string = 'all';

  selectedUserModal: ShnellUser | null = null;

  rechargeUserTarget: ShnellUser | null = null;
  rechargeAmountInput: number = 50;
  isProcessingRecharge: boolean = false;
  rechargeSuccessMsg: string | null = null;

  processingBanId: string | null = null;
  updatingAccTypeId: string | null = null;

  constructor(private dashboardDataService: DashboardDataService) {}

  ngOnInit(): void {}

  get filteredUsers(): ShnellUser[] {
    return this.users.filter(user => {
      const matchesSearch = !this.searchTerm ||
        user.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.phone?.includes(this.searchTerm) ||
        (user.uid || user.id || '').toLowerCase().includes(this.searchTerm.toLowerCase());

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
    if (user.role === 'driver') {
      this.inspectDriver.emit(user.uid || user.id || '');
    } else {
      this.selectedUserModal = user;
    }
  }

  closeUserDetails(): void {
    this.selectedUserModal = null;
  }

  openRechargeModal(user: ShnellUser): void {
    this.rechargeUserTarget = user;
    this.rechargeAmountInput = 50;
    this.rechargeSuccessMsg = null;
  }

  closeRechargeModal(): void {
    this.rechargeUserTarget = null;
    this.rechargeSuccessMsg = null;
  }

  async executeRecharge(): Promise<void> {
    if (!this.rechargeUserTarget || !this.rechargeAmountInput || this.rechargeAmountInput <= 0) return;
    const userId = this.rechargeUserTarget.uid || this.rechargeUserTarget.id;
    if (!userId) return;

    this.isProcessingRecharge = true;
    try {
      const updatedBalance = await this.dashboardDataService.rechargeUserBalance(
        userId,
        this.rechargeUserTarget.balance || 0,
        this.rechargeAmountInput
      );

      this.rechargeUserTarget.balance = updatedBalance;
      this.rechargeSuccessMsg = `Successfully deposited ${this.rechargeAmountInput} TND. Event recorded in commissions log.`;
      setTimeout(() => this.closeRechargeModal(), 1800);
    } catch (err) {
      console.error('Failed to recharge balance:', err);
      alert('Error depositing funds to user balance.');
    } finally {
      this.isProcessingRecharge = false;
    }
  }

  async toggleBan(user: ShnellUser): Promise<void> {
    const userId = user.uid || user.id;
    if (!userId) return;

    const currentBan = user.isBan || user.isBanned || false;
    const actionLabel = currentBan ? 'unban' : 'ban';
    if (!confirm(`Are you sure you want to ${actionLabel} ${user.name}?`)) return;

    this.processingBanId = userId;
    try {
      const newBanState = await this.dashboardDataService.toggleUserBan(userId, currentBan);
      user.isBan = newBanState;
      user.isBanned = newBanState;
    } catch (err) {
      console.error('Failed to toggle ban state:', err);
      alert('Error updating user ban state.');
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
    } catch (err) {
      console.error('Failed to update account type:', err);
      alert('Error updating user tier level.');
    } finally {
      this.updatingAccTypeId = null;
    }
  }

  onSendNotify(user: ShnellUser): void {
    this.selectUserForNotification.emit(user);
    if (this.selectedUserModal) this.closeUserDetails();
  }

  onInspectDriverClick(user: ShnellUser): void {
    this.inspectDriver.emit(user.uid || user.id || '');
  }
}
