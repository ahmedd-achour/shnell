import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Orders, Deals, Commission, ShnellUser } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';

@Component({
  selector: 'app-deals-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deals-tab.component.html',
  styleUrls: ['./deals-tab.component.css']
})
export class DealsTabComponent implements OnInit {
  @Input() orders: Orders[] = [];
  @Input() deals: Deals[] = [];
  @Input() commissions: Commission[] = [];
  @Input() users: ShnellUser[] = [];

  statusFilter: 'all' | 'accepted' | 'almost' | 'terminated' | 'pending' = 'all';
  searchQuery: string = '';
  processingDeleteId: string | null = null;

  constructor(private dashboardDataService: DashboardDataService) {}

  ngOnInit(): void {}

  get filteredOrders(): Orders[] {
    return this.orders.filter(o => {
      const deal = this.getDealForOrder(o.id);
      const dealStatus = (deal?.status || '').toLowerCase().trim();

      const matchesStatus =
        this.statusFilter === 'all' ||
        (this.statusFilter === 'accepted' && (dealStatus === 'accepted' || dealStatus === 'acepted')) ||
        (this.statusFilter === 'almost' && dealStatus === 'almost') ||
        (this.statusFilter === 'terminated' && dealStatus === 'terminated') ||
        (this.statusFilter === 'pending' && (!dealStatus || dealStatus === 'pending'));

      const matchesQuery = !this.searchQuery ||
        o.id?.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        o.namePickUp?.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        o.vehicleType?.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        o.userId?.toLowerCase().includes(this.searchQuery.toLowerCase());

      return matchesStatus && matchesQuery;
    });
  }

  getDealForOrder(orderId: string): Deals | undefined {
    return this.deals.find(d => d.idOrder === orderId);
  }

  getNormalizedStatus(dealStatus?: string): { label: string; badgeClass: string } {
    const st = (dealStatus || '').toLowerCase().trim();
    if (st === 'accepted' || st === 'acepted') {
      return { label: 'Accepted (Active)', badgeClass: 'bg-primary text-white' };
    } else if (st === 'almost') {
      return { label: 'In-Transit (On the way)', badgeClass: 'bg-warning text-dark' };
    } else if (st === 'terminated') {
      return { label: 'Completed (Terminated)', badgeClass: 'bg-success text-white' };
    }
    return { label: 'Pending Matching', badgeClass: 'bg-secondary text-white' };
  }

  getUserName(userId?: string): string {
    if (!userId) return 'Unknown User';
    const u = this.users.find(x => x.uid === userId || x.id === userId);
    return u ? u.name : userId;
  }

  getCommission(orderId: string): number {
    const comm = this.commissions.find(c => c.orderId === orderId);
    if (comm) return comm.commissionDeducted;
    const order = this.orders.find(o => o.id === orderId);
    return order?.price ? Number((order.price * 0.15).toFixed(2)) : 0;
  }

  async softDeleteOrder(order: Orders): Promise<void> {
    if (!order.id) return;
    if (!confirm(`Are you sure you want to delete/archive order ${order.id}? (Order document will be soft-deleted by setting isAcepted=true)`)) {
      return;
    }

    this.processingDeleteId = order.id;
    try {
      await this.dashboardDataService.softDeleteOrder(order.id);
      order.isAcepted = true;
    } catch (err) {
      console.error('Failed to soft delete order:', err);
      alert('Error soft-deleting order document.');
    } finally {
      this.processingDeleteId = null;
    }
  }
}
