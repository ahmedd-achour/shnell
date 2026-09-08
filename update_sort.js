const fs = require('fs');
const path = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.ts';
let content = fs.readFileSync(path, 'utf8');

const regex = /get filteredOrders\(\)\: Orders\[\] \{[\s\S]*?return matchesStatus && matchesQuery;\s*\}\);\s*\}/;

const replacement = `get filteredOrders(): Orders[] {
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
        o.userId?.toLowerCase().includes(this.searchQuery.toLowerCase());

      return matchesStatus && matchesQuery;
    });

    return filtered.sort((a, b) => {
      const dealA = this.getDealForOrder(a.id);
      const dealB = this.getDealForOrder(b.id);

      const getTime = (deal, order) => {
        if (deal?.timestamp?.seconds) return deal.timestamp.seconds * 1000;
        if (deal?.timestamp) return new Date(deal.timestamp).getTime();
        if (order?.timestamp?.seconds) return order.timestamp.seconds * 1000;
        if (order?.timestamp) return new Date(order.timestamp).getTime();
        return 0;
      };

      return getTime(dealB, b) - getTime(dealA, a);
    });
  }`;

content = content.replace(regex, replacement);
fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated filteredOrders to include sorting by date');
