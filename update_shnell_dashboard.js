const fs = require('fs');

const compPath = 'src/app/shnell-dashboard/shnell-dashboard.component.ts';
let compContent = fs.readFileSync(compPath, 'utf8');

if (!compContent.includes('callLogs: CallLog[]')) {
  compContent = compContent.replace('CountryServiceArea,', 'CountryServiceArea,\n  CallLog,');
  compContent = compContent.replace('bids: Bid[] = [];', 'bids: Bid[] = [];\n  callLogs: CallLog[] = [];');
  
  compContent = compContent.replace('this.dashboardDataService.getBids()', 'this.dashboardDataService.getBids(),\n      this.dashboardDataService.getCallLogs()');
  
  compContent = compContent.replace(/next: \(\[users, vehicles, verifications, orders, deals, commissions, locations, bids\]\) => \{/, 'next: ([users, vehicles, verifications, orders, deals, commissions, locations, bids, callLogs]) => {');
  compContent = compContent.replace('this.bids = bids;', 'this.bids = bids;\n          this.callLogs = callLogs;');

  fs.writeFileSync(compPath, compContent, 'utf8');
  console.log('Updated shnell-dashboard.component.ts');
}
