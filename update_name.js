const fs = require('fs');
const path = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.html';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/\{\{\s*getUserName\(o\.userId\)\s*\}\}/g, "{{ getUserName(o.userId || o.userID) }}");
content = content.replace(/\{\{\s*o\.userId\s*\|\|\s*'N\/A'\s*\}\}/g, "{{ o.userId || o.userID || 'N/A' }}");

fs.writeFileSync(path, content, 'utf8');
