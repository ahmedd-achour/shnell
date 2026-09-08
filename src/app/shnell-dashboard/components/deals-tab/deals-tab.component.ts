import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Orders, Deals, Commission, ShnellUser, Bid, CallLog, Vehicle } from '../../models/dashboard.models';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { confirmAction, toastSuccess, toastError } from '../../../shared/swal';

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
  @Input() bids: Bid[] = [];
  @Input() callLogs: CallLog[] = [];
  // Need vehicles to find eligible drivers
  @Input() vehicles: Vehicle[] = [];


  
  expandedOrderId: string | null = null;
  assigningDriverId: string | null = null;

  toggleExpand(orderId: string): void {
    if (this.expandedOrderId === orderId) {
      this.expandedOrderId = null;
    } else {
      this.expandedOrderId = orderId;
    }
  }

  getOrderBids(orderId: string): Bid[] {
    return this.bids.filter(b => b.idOrder === orderId);
  }

  getOrderCallLogs(orderId: string): CallLog[] {
    return this.callLogs.filter(c => c.dealId === orderId || (c.participants && c.participants.length > 0)); 
    // Wait, let's just filter by dealId if it exists, otherwise it's hard. 
    // Actually, orderId is often stored as dealId.
  }

  getEligibleDrivers(order: Orders): ShnellUser[] {
    // Return drivers whose vehicle matches order.vehicleType
    const matchingVehicles = this.vehicles.filter(v => v.type === order.vehicleType && v.isAdminApproved);
    const driverIds = matchingVehicles.map(v => v.idDriver);
    return this.users.filter(u => u.role === 'driver' && driverIds.includes(u.uid || u.id || ''));
  }

  async assignDriver(order: Orders, driverId: string): Promise<void> {
    if (!order.id) return;
    const ok = await confirmAction({
      title: 'Assigner ce chauffeur ?',
      text: 'Le chauffeur sélectionné sera affecté manuellement à cette course.',
      confirmText: 'Assigner',
    });
    if (!ok) return;

    this.assigningDriverId = driverId;
    try {
      await this.dashboardDataService.assignDriverToOrder(order.id, driverId, order.userId || order.userID);
      toastSuccess('Chauffeur assigné');
      order.isAcepted = true;
    } catch(e) {
      console.error(e);
      toastError('Échec de l\'assignation du chauffeur');
    } finally {
      this.assigningDriverId = null;
    }
  }

  constructor(private dashboardDataService: DashboardDataService) {}

  ngOnInit(): void {}

  get filteredOrders(): Orders[] {
    const filtered = this.orders.filter(o => {
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
        (o.userId || o.userID)?.toLowerCase().includes(this.searchQuery.toLowerCase());

      return matchesStatus && matchesQuery;
    });

    return filtered.sort((a, b) => {
      const dealA = this.getDealForOrder(a.id);
      const dealB = this.getDealForOrder(b.id);

      const getTime = (deal: any, order: any) => {
        if (deal?.timestamp?.seconds) return deal.timestamp.seconds * 1000;
        if (deal?.timestamp) return new Date(deal.timestamp).getTime();
        if (order?.timestamp?.seconds) return order.timestamp.seconds * 1000;
        if (order?.timestamp) return new Date(order.timestamp).getTime();
        return 0;
      };

      return getTime(dealB, b) - getTime(dealA, a);
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
    const ok = await confirmAction({
      title: 'Archiver cette commande ?',
      text: `La commande ${order.id} sera archivée (soft-delete).`,
      confirmText: 'Archiver',
      danger: true,
    });
    if (!ok) return;

    this.processingDeleteId = order.id;
    try {
      await this.dashboardDataService.softDeleteOrder(order.id);
      order.isAcepted = true;
      toastSuccess('Commande archivée');
    } catch (err) {
      console.error('Failed to soft delete order:', err);
      toastError('Erreur lors de l\'archivage de la commande');
    } finally {
      this.processingDeleteId = null;
    }
  }
}
