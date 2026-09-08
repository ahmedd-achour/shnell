const fs = require('fs');

const htmlPath = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

htmlContent = htmlContent.replace(/b\.timestamp\?\.toDate\(\)/g, "b.timestamp?.seconds ? (b.timestamp.seconds * 1000) : b.timestamp");
htmlContent = htmlContent.replace(/c\.timestamp\?\.toDate\(\)/g, "c.timestamp?.seconds ? (c.timestamp.seconds * 1000) : c.timestamp");

fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('Fixed timestamp formatting');
