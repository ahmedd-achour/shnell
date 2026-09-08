const fs = require('fs');
const path = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/o\.userId\?\.toLowerCase\(\)/g, "(o.userId || o.userID)?.toLowerCase()");

fs.writeFileSync(path, content, 'utf8');
