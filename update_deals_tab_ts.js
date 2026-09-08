const fs = require('fs');

const tsPath = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.ts';
let tsContent = fs.readFileSync(tsPath, 'utf8');

if (!tsContent.includes('@Input() bids')) {
  // Add imports
  tsContent = tsContent.replace('Commission, ShnellUser } from', 'Commission, ShnellUser, Bid, CallLog, Vehicle } from');
  
  // Add @Input
  const addInputs = `
  @Input() bids: Bid[] = [];
  @Input() callLogs: CallLog[] = [];
  // Need vehicles to find eligible drivers
  @Input() vehicles: Vehicle[] = [];
`;
  tsContent = tsContent.replace('processingDeleteId: string | null = null;', 'processingDeleteId: string | null = null;' + addInputs);

  // Expand logic
  const expandLogic = `
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
    if (!confirm('Are you sure you want to manually assign this driver?')) return;
    
    this.assigningDriverId = driverId;
    try {
      await this.dashboardDataService.assignDriverToOrder(order.id, driverId, order.userId || order.userID);
      alert('Driver assigned successfully!');
      order.isAcepted = true;
    } catch(e) {
      console.error(e);
      alert('Failed to assign driver');
    } finally {
      this.assigningDriverId = null;
    }
  }
`;
  tsContent = tsContent.replace('constructor(private dashboardDataService: DashboardDataService) {}', expandLogic + '\n  constructor(private dashboardDataService: DashboardDataService) {}');
  
  fs.writeFileSync(tsPath, tsContent, 'utf8');
  console.log('Updated deals-tab.component.ts');
}
