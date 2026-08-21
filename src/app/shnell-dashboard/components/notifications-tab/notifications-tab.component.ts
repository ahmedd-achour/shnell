import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShnellUser } from '../../models/dashboard.models';
import { NotificationService } from '../../services/notification.service';

export interface NotificationLog {
  id: string;
  userId: string;
  userName?: string;
  header: string;
  body: string;
  category?: string;
  priority?: string;
  status: 'success' | 'error' | 'scheduled';
  messageId?: string;
  error?: string;
  timestamp: Date;
  scheduledTime?: string;
  targetCount?: number;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  category: string;
  header: string;
  body: string;
  icon: string;
  badgeClass: string;
}

@Component({
  selector: 'app-notifications-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notifications-tab.component.html',
  styleUrls: ['./notifications-tab.component.css']
})
export class NotificationsTabComponent implements OnInit, OnChanges {
  @Input() users: ShnellUser[] = [];
  @Input() preselectedUser: ShnellUser | null = null;

  recipientMode: 'single' | 'everyone' | 'drivers' | 'clients' | 'companies' | 'online_drivers' | 'offline_drivers' | 'pro_drivers' | 'vehicle_type' | 'custom_select' = 'single';
  selectedUserId: string = '';
  selectedVehicleType: string = 'all';

  selectedUserIds: Set<string> = new Set();
  recipientSearchQuery: string = '';

  header: string = '';
  body: string = '';
  category: 'promo' | 'marketing' | 'maintenance' | 'driver_alert' | 'customer_alert' | 'critical' | 'system' = 'promo';
  priority: 'high' | 'normal' | 'low' = 'normal';
  imageUrl: string = '';
  actionUrl: string = '';
  scheduleDate: string = '';
  scheduleTime: string = '';

  sending: boolean = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;

  sentLogs: NotificationLog[] = [];
  historySearchQuery: string = '';
  historyFilterStatus: string = 'all';

  templates: NotificationTemplate[] = [
    {
      id: 'approved',
      name: 'Account Verification Approved',
      category: 'driver_alert',
      header: '🎉 Driver Account Approved!',
      body: 'Your Shnell driver account has been verified and approved. You can now go online and accept delivery orders in real-time!',
      icon: 'bi-check-circle-fill',
      badgeClass: 'btn-outline-success'
    },
    {
      id: 'bonus',
      name: 'Daily Delivery Bonus',
      category: 'promo',
      header: '💰 Daily Delivery Bonus Unlocked',
      body: 'Earn extra commission today! Complete 5 deliveries to receive a 20 TND bonus payout directly to your ledger.',
      icon: 'bi-piggy-bank-fill',
      badgeClass: 'btn-outline-warning'
    },
    {
      id: 'update',
      name: 'App Update Required',
      category: 'system',
      header: '📲 App Update Required',
      body: 'A new version of Shnell is available on Google Play / App Store. Please update your app to keep receiving live orders smoothly.',
      icon: 'bi-phone-vibrate',
      badgeClass: 'btn-outline-info'
    },
    {
      id: 'warning',
      name: 'GPS Telemetry Notice',
      category: 'critical',
      header: '⚠️ Important GPS Notice',
      body: 'Please ensure your device location services and high-accuracy GPS permissions remain enabled to stay online on the live map.',
      icon: 'bi-exclamation-triangle-fill',
      badgeClass: 'btn-outline-danger'
    },
    {
      id: 'maintenance',
      name: 'Scheduled Maintenance',
      category: 'maintenance',
      header: '⚙️ Scheduled System Maintenance',
      body: 'Shnell platform will undergo brief maintenance tonight between 02:00 AM - 03:00 AM. Thank you for your patience.',
      icon: 'bi-gear-wide-connected',
      badgeClass: 'btn-outline-secondary'
    }
  ];

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    if (this.preselectedUser) {
      this.selectedUserId = this.preselectedUser.uid || this.preselectedUser.id || '';
      this.recipientMode = 'single';
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['preselectedUser'] && this.preselectedUser) {
      this.selectedUserId = this.preselectedUser.uid || this.preselectedUser.id || '';
      this.recipientMode = 'single';
    }
  }

  get resolvedTargetUsers(): ShnellUser[] {
    if (this.recipientMode === 'single') {
      const u = this.users.find(x => (x.uid || x.id) === this.selectedUserId);
      return u ? [u] : [];
    }

    if (this.recipientMode === 'everyone') {
      return this.users;
    }

    if (this.recipientMode === 'drivers') {
      return this.users.filter(u => u.role === 'driver');
    }

    if (this.recipientMode === 'clients') {
      return this.users.filter(u => u.role === 'user' || u.role === 'client');
    }

    if (this.recipientMode === 'companies') {
      return this.users.filter(u => u.role === 'company');
    }

    if (this.recipientMode === 'pro_drivers') {
      return this.users.filter(u => u.role === 'driver' && u.accType === 'pro');
    }

    if (this.recipientMode === 'custom_select') {
      return this.users.filter(u => this.selectedUserIds.has(u.uid || u.id || ''));
    }

    return this.users.filter(u => u.role === 'driver');
  }

  get filteredRecipientSearchList(): ShnellUser[] {
    const q = this.recipientSearchQuery.toLowerCase().trim();
    if (!q) return this.users.slice(0, 15);
    return this.users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.includes(q) ||
      (u.uid || u.id || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }

  get selectedUserObject(): ShnellUser | undefined {
    return this.users.find(u => (u.uid || u.id) === this.selectedUserId);
  }

  toggleSelectRecipient(userId: string): void {
    if (this.selectedUserIds.has(userId)) {
      this.selectedUserIds.delete(userId);
    } else {
      this.selectedUserIds.add(userId);
    }
  }

  selectAllCustomRecipients(): void {
    this.filteredRecipientSearchList.forEach(u => {
      const id = u.uid || u.id;
      if (id) this.selectedUserIds.add(id);
    });
  }

  deselectAllCustomRecipients(): void {
    this.selectedUserIds.clear();
  }

  removeRecipientChip(userId: string): void {
    this.selectedUserIds.delete(userId);
  }

  applyTemplate(template: NotificationTemplate): void {
    const name = this.selectedUserObject ? this.selectedUserObject.name : 'Valued User';
    this.header = template.header;
    this.body = template.body.replace('${name}', name);
    this.category = template.category as any;
  }

  async sendNotification(): Promise<void> {
    this.successMessage = null;
    this.errorMessage = null;

    const targets = this.resolvedTargetUsers;
    if (targets.length === 0) {
      this.errorMessage = 'Please select at least one recipient user or recipient group.';
      return;
    }
    if (!this.header.trim()) {
      this.errorMessage = 'Please enter a notification header (title).';
      return;
    }
    if (!this.body.trim()) {
      this.errorMessage = 'Please enter notification message body.';
      return;
    }

    this.sending = true;
    let successCount = 0;
    let failCount = 0;

    try {
      for (const target of targets) {
        const uid = target.uid || target.id;
        if (!uid) continue;

        try {
          const result = await this.notificationService.sendUserNotification(
            uid,
            this.header.trim(),
            this.body.trim()
          );

          if (result && result.success) {
            successCount++;
            this.sentLogs.unshift({
              id: Math.random().toString(36).substring(2, 9),
              userId: uid,
              userName: target.name,
              header: this.header,
              body: this.body,
              category: this.category,
              priority: this.priority,
              status: 'success',
              messageId: result.messageId || 'MSG-' + Math.floor(Math.random() * 100000),
              timestamp: new Date()
            });
          } else {
            failCount++;
            this.sentLogs.unshift({
              id: Math.random().toString(36).substring(2, 9),
              userId: uid,
              userName: target.name,
              header: this.header,
              body: this.body,
              category: this.category,
              priority: this.priority,
              status: 'error',
              error: result?.message || 'FCM Cloud dispatch failed',
              timestamp: new Date()
            });
          }
        } catch (err: any) {
          failCount++;
          this.sentLogs.unshift({
            id: Math.random().toString(36).substring(2, 9),
            userId: uid,
            userName: target.name,
            header: this.header,
            body: this.body,
            category: this.category,
            priority: this.priority,
            status: 'error',
            error: err.message || 'Dispatch exception',
            timestamp: new Date()
          });
        }
      }

      if (successCount > 0) {
        this.successMessage = `Successfully dispatched push notification to ${successCount} recipient(s).` + (failCount > 0 ? ` (${failCount} failed)` : '');
        this.header = '';
        this.body = '';
      } else {
        this.errorMessage = `Failed to send push notification to selected target(s).`;
      }
    } catch (err: any) {
      console.error('Notification dispatch error:', err);
      this.errorMessage = err.message || 'Error processing FCM notifications.';
    } finally {
      this.sending = false;
    }
  }

  get deliveredCount(): number {
    return this.sentLogs.filter(l => l.status === 'success').length;
  }

  get failedCount(): number {
    return this.sentLogs.filter(l => l.status === 'error').length;
  }

  get filteredHistoryLogs(): NotificationLog[] {
    const q = this.historySearchQuery.toLowerCase().trim();
    return this.sentLogs.filter(l => {
      const matchesSearch = !q ||
        l.header.toLowerCase().includes(q) ||
        l.body.toLowerCase().includes(q) ||
        (l.userName || '').toLowerCase().includes(q) ||
        l.userId.toLowerCase().includes(q);

      const matchesStatus = this.historyFilterStatus === 'all' || l.status === this.historyFilterStatus;

      return matchesSearch && matchesStatus;
    });
  }

  retryFailedNotification(log: NotificationLog): void {
    this.selectedUserId = log.userId;
    this.recipientMode = 'single';
    this.header = log.header;
    this.body = log.body;
  }
}
