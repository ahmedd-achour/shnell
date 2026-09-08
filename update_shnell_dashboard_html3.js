const fs = require('fs');

const htmlPath = 'src/app/shnell-dashboard/shnell-dashboard.component.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

htmlContent = htmlContent.replace(/\[callLogs\]="callLogs">\s*<\/app-deals-tab>/, '[callLogs]="callLogs"\n      [vehicles]="vehicles">\n    </app-deals-tab>');
fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('Updated shnell-dashboard.component.html for vehicles');
