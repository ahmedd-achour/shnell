const fs = require('fs');
const path = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.html';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/getDriverName\(deal\.idDriver\)/g, "getUserName(deal.idDriver)");

fs.writeFileSync(path, content, 'utf8');
