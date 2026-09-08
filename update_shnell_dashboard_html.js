const fs = require('fs');

const htmlPath = 'src/app/shnell-dashboard/shnell-dashboard.component.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

if (!htmlContent.includes('[bids]="bids"')) {
  htmlContent = htmlContent.replace('[users]="users">', '[users]="users"\n      [bids]="bids"\n      [callLogs]="callLogs">');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');
  console.log('Updated shnell-dashboard.component.html');
}
