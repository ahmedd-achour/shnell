const fs = require('fs');

const tsPath = 'src/app/shnell-dashboard/shnell-dashboard.component.ts';
let tsContent = fs.readFileSync(tsPath, 'utf8');

if (!tsContent.includes('import {') || !tsContent.includes('CallLog')) {
  tsContent = tsContent.replace(/import \{.*?\} from '\.\.\/\.\.\/models';/, (match) => {
    return match.replace('}', ', CallLog }');
  });
}
fs.writeFileSync(tsPath, tsContent, 'utf8');

const htmlPath = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

htmlContent = htmlContent.replace('<tr *ngFor="let o of filteredOrders">', '<ng-container *ngFor="let o of filteredOrders">\n            <tr>');
htmlContent = htmlContent.replace('<!-- Expanded Details Row -->', '<!-- Expanded Details Row -->');
htmlContent = htmlContent.replace('</td>\n            </tr>\n            <tr *ngIf="filteredOrders.length === 0">', '</td>\n            </tr>\n            </ng-container>\n            <tr *ngIf="filteredOrders.length === 0">');

fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('Fixed compile errors');
