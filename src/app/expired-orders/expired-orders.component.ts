import { Component, OnInit, inject } from '@angular/core';
import { Firestore, collection, getDocs, deleteDoc, doc } from '@angular/fire/firestore';
import * as XLSX from 'xlsx';
import { confirmAction, toastSuccess, toastError } from '../shared/swal';
import { vehicleImage, onVehicleImgError } from '../shared/vehicle-assets';

export interface OrderWithDocId {
  docId: string; // Firestore document ID for deletion
  id?: string;
  userID?: string;
  userId?: string;
  price?: number;
  distance?: number;
  namePickUp?: string;
  stops?: string[];
  vehicleType?: string;
  isAcepted?: boolean;
  timestamp: Date;
  scheduleAt?: Date | null;
  governorate?: string;
  region?: string;
  driverId?: string;
  driverName?: string;
  /** Why this order is unhandled: past its scheduled time ('expired'),
   *  or still open with no driver having taken it ('awaiting'). */
  status?: 'expired' | 'awaiting';
}

@Component({
  selector: 'app-expired-orders',
  templateUrl: './expired-orders.component.html',
  styleUrls: ['./expired-orders.component.css']
})
export class ExpiredOrdersComponent implements OnInit {
  private firestore = inject(Firestore);

  Math = Math;
  vehicleImage = vehicleImage;
  onVehicleImgError = onVehicleImgError;
  expiredOrders: OrderWithDocId[] = [];
  isLoading: boolean = true;

  // Search & Filter State
  searchQuery: string = '';
  datePreset: 'all' | 'today' | 'week' | 'month' = 'all';
  vehicleTypeFilter: string = 'all';
  governorateFilter: string = 'all';
  statusFilter: 'all' | 'expired' | 'awaiting' = 'all';

  // Selection & Bulk Operations
  selectedDocIds: Set<string> = new Set();
  isBulkDeleting: boolean = false;

  // Side Drawer / Detail Preview Modal State
  selectedOrderModal: OrderWithDocId | null = null;

  // Pagination State
  currentPage: number = 1;
  pageSize: number = 10;

  ngOnInit(): void {
    this.loadExpiredOrders();
  }

  /** Unhandled orders = orders with NO matching deal (no driver ever attached).
   *  Each is tagged 'expired' (its scheduled time has passed / > 72h old) or
   *  'awaiting' (still open, just nobody has taken it yet). */
  async loadExpiredOrders(): Promise<void> {
    this.isLoading = true;
    this.selectedDocIds.clear();
    try {
      const [ordersSnap, dealsSnap] = await Promise.all([
        getDocs(collection(this.firestore, 'orders')),
        getDocs(collection(this.firestore, 'deals'))
      ]);

      // Orders that already have a driver matched (a deal) — exclude these.
      const matchedOrderIds = new Set<string>();
      dealsSnap.docs.forEach(d => {
        const idOrder = (d.data() as any)?.idOrder;
        if (idOrder) matchedOrderIds.add(String(idOrder));
      });

      const now = Date.now();
      const toDate = (v: any): Date | null => {
        if (!v) return null;
        if (v.toDate) return v.toDate();
        if (v.seconds) return new Date(v.seconds * 1000);
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      };

      this.expiredOrders = ordersSnap.docs
        .filter(s => !matchedOrderIds.has(s.id) && !matchedOrderIds.has(String((s.data() as any)?.id)))
        .map(docSnap => {
          const data = docSnap.data() as any;
          const timestamp = toDate(data.timestamp) || new Date();
          const scheduleAt = toDate(data.scheduleAt);

          const expired =
            (scheduleAt ? scheduleAt.getTime() < now : false) ||
            (now - timestamp.getTime()) > 72 * 3600 * 1000;

          return {
            docId: docSnap.id,
            id: docSnap.id,
            namePickUp: data.namePickUp || 'Unnamed pickup',
            userID: data.userID || data.userId || 'N/A',
            userId: data.userId || data.userID || 'N/A',
            price: data.price ?? 0,
            distance: data.distance ?? 0,
            stops: Array.isArray(data.stops) ? data.stops : [],
            vehicleType: data.vehicleType || '—',
            isAcepted: !!data.isAcepted,
            governorate: data.governorate || 'Tunis',
            region: data.region || 'Grand Tunis',
            timestamp,
            scheduleAt,
            status: expired ? 'expired' : 'awaiting'
          } as OrderWithDocId;
        });
    } catch (err) {
      console.error('Error loading unhandled orders:', err);
    } finally {
      this.isLoading = false;
    }
  }

  get unhandledCount(): number { return this.expiredOrders.length; }
  get expiredCount(): number { return this.expiredOrders.filter(o => o.status === 'expired').length; }
  get awaitingCount(): number { return this.expiredOrders.filter(o => o.status === 'awaiting').length; }

  // --- KPI CALCULATIONS ---
  get totalExpiredCount(): number {
    return this.expiredOrders.length;
  }

  get expiredTodayCount(): number {
    const today = new Date();
    return this.expiredOrders.filter(o => o.timestamp.toDateString() === today.toDateString()).length;
  }

  get expiredWeekCount(): number {
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    return this.expiredOrders.filter(o => (now - o.timestamp.getTime()) <= oneWeekMs).length;
  }

  get expiredMonthCount(): number {
    const now = Date.now();
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    return this.expiredOrders.filter(o => (now - o.timestamp.getTime()) <= oneMonthMs).length;
  }

  get avgExpirationHours(): string {
    if (!this.expiredOrders.length) return '0 hrs';
    const now = Date.now();
    const totalHours = this.expiredOrders.reduce((sum, o) => sum + ((now - o.timestamp.getTime()) / (1000 * 60 * 60)), 0);
    return `${(totalHours / this.expiredOrders.length).toFixed(1)} hrs`;
  }

  get availableVehicleTypes(): string[] {
    const set = new Set<string>();
    this.expiredOrders.forEach(o => { if (o.vehicleType) set.add(o.vehicleType); });
    return Array.from(set);
  }

  get availableGovernorates(): string[] {
    const set = new Set<string>();
    this.expiredOrders.forEach(o => { if (o.governorate) set.add(o.governorate); });
    return Array.from(set);
  }

  // --- FILTERING & PAGINATION ---
  get filteredExpiredOrders(): OrderWithDocId[] {
    const q = this.searchQuery.toLowerCase().trim();
    const now = Date.now();

    return this.expiredOrders.filter(o => {
      const matchesSearch = !q ||
        o.namePickUp?.toLowerCase().includes(q) ||
        o.userID?.toLowerCase().includes(q) ||
        o.docId.toLowerCase().includes(q) ||
        o.vehicleType?.toLowerCase().includes(q);

      let matchesDate = true;
      if (this.datePreset === 'today') {
        matchesDate = o.timestamp.toDateString() === new Date().toDateString();
      } else if (this.datePreset === 'week') {
        matchesDate = (now - o.timestamp.getTime()) <= (7 * 24 * 3600 * 1000);
      } else if (this.datePreset === 'month') {
        matchesDate = (now - o.timestamp.getTime()) <= (30 * 24 * 3600 * 1000);
      }

      const matchesVehicle = this.vehicleTypeFilter === 'all' || o.vehicleType === this.vehicleTypeFilter;
      const matchesGov = this.governorateFilter === 'all' || o.governorate === this.governorateFilter;
      const matchesStatus = this.statusFilter === 'all' || o.status === this.statusFilter;

      return matchesSearch && matchesDate && matchesVehicle && matchesGov && matchesStatus;
    });
  }

  get paginatedOrders(): OrderWithDocId[] {
    const filtered = this.filteredExpiredOrders;
    const start = (this.currentPage - 1) * this.pageSize;
    return filtered.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredExpiredOrders.length / this.pageSize) || 1;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  // --- BULK SELECTION ---
  isAllSelected(): boolean {
    const current = this.paginatedOrders;
    return current.length > 0 && current.every(o => this.selectedDocIds.has(o.docId));
  }

  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.paginatedOrders.forEach(o => this.selectedDocIds.delete(o.docId));
    } else {
      this.paginatedOrders.forEach(o => this.selectedDocIds.add(o.docId));
    }
  }

  toggleSelectOrder(docId: string): void {
    if (this.selectedDocIds.has(docId)) {
      this.selectedDocIds.delete(docId);
    } else {
      this.selectedDocIds.add(docId);
    }
  }

  // --- DELETE & BULK DELETE ---
  async deleteOrder(order: OrderWithDocId): Promise<void> {
    if (!order.docId) return;
    const ok = await confirmAction({
      title: 'Supprimer cette commande expirée ?',
      text: `« ${order.namePickUp || order.docId} » et tous ses arrêts associés seront définitivement supprimés.`,
      danger: true,
    });
    if (!ok) return;

    this.isLoading = true;
    try {
      if (order.stops && order.stops.length > 0) {
        for (const stopId of order.stops) {
          if (typeof stopId === 'string' && stopId.trim() !== '') {
            await deleteDoc(doc(this.firestore, 'stops', stopId));
          }
        }
      }

      await deleteDoc(doc(this.firestore, 'orders', order.docId));
      this.expiredOrders = this.expiredOrders.filter(o => o.docId !== order.docId);
      this.selectedDocIds.delete(order.docId);
      if (this.selectedOrderModal?.docId === order.docId) {
        this.selectedOrderModal = null;
      }
      toastSuccess('Commande supprimée');
    } catch (err) {
      console.error('Error deleting order:', err);
      toastError('Échec de la suppression de la commande');
    } finally {
      this.isLoading = false;
    }
  }

  async bulkDeleteSelected(): Promise<void> {
    const count = this.selectedDocIds.size;
    if (count === 0) return;
    const ok = await confirmAction({
      title: `Purger ${count} commande(s) expirée(s) ?`,
      text: 'Cette action est définitive et supprimera aussi les arrêts associés.',
      confirmText: 'Purger',
      danger: true,
    });
    if (!ok) return;

    this.isBulkDeleting = true;
    this.isLoading = true;
    try {
      const selected = this.expiredOrders.filter(o => this.selectedDocIds.has(o.docId));
      for (const order of selected) {
        if (order.stops && order.stops.length > 0) {
          for (const stopId of order.stops) {
            if (typeof stopId === 'string' && stopId.trim() !== '') {
              await deleteDoc(doc(this.firestore, 'stops', stopId));
            }
          }
        }
        await deleteDoc(doc(this.firestore, 'orders', order.docId));
      }

      this.expiredOrders = this.expiredOrders.filter(o => !this.selectedDocIds.has(o.docId));
      this.selectedDocIds.clear();
      toastSuccess(`${count} commande(s) expirée(s) purgée(s)`);
    } catch (err) {
      console.error('Bulk deletion error:', err);
      toastError('Erreur lors de la purge groupée');
    } finally {
      this.isBulkDeleting = false;
      this.isLoading = false;
    }
  }

  // --- EXPORT FUNCTIONALITY ---
  exportToExcel(): void {
    const data = this.filteredExpiredOrders.map(o => ({
      'Doc ID': o.docId,
      'Pickup Location': o.namePickUp,
      'User ID': o.userID,
      'Stops Count': o.stops ? o.stops.length : 0,
      'Estimated Price (TND)': o.price || 0,
      'Vehicle Type': o.vehicleType || 'N/A',
      'Governorate': o.governorate || 'N/A',
      'Expiration Date': o.timestamp.toISOString()
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expired_Orders');
    XLSX.writeFile(wb, `shnell_expired_orders_${Date.now()}.xlsx`);
  }

  openOrderDrawer(order: OrderWithDocId): void {
    this.selectedOrderModal = order;
  }

  closeOrderDrawer(): void {
    this.selectedOrderModal = null;
  }
}
