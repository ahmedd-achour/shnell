const fs = require('fs');

const htmlPath = 'src/app/shnell-dashboard/shnell-dashboard.component.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

htmlContent = htmlContent.replace(/\[users\]="users">\s*<\/app-deals-tab>/, '[users]="users"\n      [bids]="bids"\n      [callLogs]="callLogs">\n    </app-deals-tab>');
fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('Updated shnell-dashboard.component.html');
