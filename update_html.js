const fs = require('fs');
const path = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.html';
let content = fs.readFileSync(path, 'utf8');

// Add Order Date column to the header
content = content.replace(
  '<th>Customer Name</th>',
  '<th>Customer Name</th>\n              <th>Order Date</th>'
);

// Add Deal Details column header (replace Deal Status)
content = content.replace(
  '<th>Deal Status (Normalized)</th>',
  '<th>Deal Status & Record</th>'
);

// Add the data to the row
// The customer name is:
// <td>
//   <div class="text-white fs-7 fw-semibold">{{ getUserName(o.userId) }}</div>
//   <small class="text-muted font-monospace fs-8">{{ o.userId || 'N/A' }}</small>
// </td>
content = content.replace(
  /<td>\s*<div class="text-white fs-7 fw-semibold">{{ getUserName\(o\.userId\) }}<\/div>\s*<small class="text-muted font-monospace fs-8">{{ o\.userId \|\| 'N\/A' }}<\/small>\s*<\/td>/g,
  `<td>
                <div class="text-white fs-7 fw-semibold">{{ getUserName(o.userId) }}</div>
                <small class="text-muted font-monospace fs-8">{{ o.userId || 'N/A' }}</small>
              </td>
              <td>
                <div class="text-light fs-8">
                  <i class="bi bi-clock me-1 text-secondary"></i>
                  {{ o.timestamp?.seconds ? (o.timestamp.seconds * 1000 | date:'medium') : (o.timestamp | date:'medium') || 'Unknown Date' }}
                </div>
              </td>`
);

// Deal status column:
// <td>
//   <ng-container *let="getNormalizedStatus(getDealForOrder(o.id)?.status) as st">
//     <span class="badge {{ st.badgeClass }} px-2 py-1 fs-8">
//       {{ st.label }}
//     </span>
//   </ng-container>
//   <div class="small text-muted" *ngIf="o.isAcepted">
//     <i class="bi bi-archive-fill me-1 text-secondary"></i>Soft-Deleted / Archived
//   </div>
// </td>
content = content.replace(
  /<td>\s*<ng-container \*let="getNormalizedStatus\(getDealForOrder\(o\.id\)\?\.status\) as st">\s*<span class="badge {{ st\.badgeClass }} px-2 py-1 fs-8">\s*{{ st\.label }}\s*<\/span>\s*<\/ng-container>\s*<div class="small text-muted" \*ngIf="o\.isAcepted">\s*<i class="bi bi-archive-fill me-1 text-secondary"><\/i>Soft-Deleted \/ Archived\s*<\/div>\s*<\/td>/g,
  `<td>
                <ng-container *let="getDealForOrder(o.id) as deal">
                  <ng-container *let="getNormalizedStatus(deal?.status) as st">
                    <span class="badge {{ st.badgeClass }} px-2 py-1 fs-8 mb-1 d-inline-block">
                      {{ st.label }}
                    </span>
                  </ng-container>
                  <div class="small text-info fs-8 mt-1" *ngIf="deal">
                    <i class="bi bi-person-check-fill me-1"></i>Driver: {{ getDriverName(deal.idDriver) }}
                    <div class="text-muted mt-1" style="font-size: 10px;">{{ deal.timestamp?.seconds ? (deal.timestamp.seconds * 1000 | date:'short') : (deal.timestamp | date:'short') }}</div>
                  </div>
                  <div class="small text-warning fs-8 mt-1" *ngIf="!deal">
                    <i class="bi bi-hourglass-split me-1"></i>No deal yet
                  </div>
                </ng-container>
                <div class="small text-muted mt-1" *ngIf="o.isAcepted">
                  <i class="bi bi-archive-fill me-1 text-secondary"></i>Soft-Deleted
                </div>
              </td>`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Updated deals-tab.component.html');
