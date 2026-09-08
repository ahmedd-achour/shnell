const fs = require('fs');

const htmlPath = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Replace table header to add an empty header for expand button
htmlContent = htmlContent.replace('<th class="pe-4 text-end">Admin Actions</th>', '<th class="pe-4 text-end">Admin Actions</th>\n              <th></th>');

// Replace standard row to add expand button and logic
htmlContent = htmlContent.replace('<td class="pe-4 text-end">', `<td class="pe-4 text-end">`);
htmlContent = htmlContent.replace(`</button>\n              </td>\n            </tr>`, `</button>\n              </td>\n              <td>\n                <button class="btn btn-sm btn-outline-light" (click)="toggleExpand(o.id!)"><i class="bi" [ngClass]="expandedOrderId === o.id ? 'bi-chevron-up' : 'bi-chevron-down'"></i></button>\n              </td>\n            </tr>
            <!-- Expanded Details Row -->
            <tr *ngIf="expandedOrderId === o.id" class="bg-darker">
              <td colspan="9" class="p-4 border-bottom border-secondary">
                <div class="row g-4">
                  <!-- Bids Section -->
                  <div class="col-md-4">
                    <div class="card bg-dark border-secondary h-100">
                      <div class="card-header border-secondary bg-transparent fw-bold text-info">
                        <i class="bi bi-tags me-2"></i>Bids
                      </div>
                      <div class="card-body p-2" style="max-height: 250px; overflow-y: auto;">
                        <ul class="list-group list-group-flush" *ngIf="getOrderBids(o.id!).length; else noBids">
                          <li class="list-group-item bg-transparent text-light border-secondary px-2 py-1" *ngFor="let b of getOrderBids(o.id!)">
                            <div class="d-flex justify-content-between align-items-center">
                              <span><i class="bi bi-person text-muted me-1"></i>{{ getUserName(b.idDriver) }}</span>
                              <span class="badge bg-success">{{ b.ammount | number:'1.2-2' }} TND</span>
                            </div>
                            <small class="text-muted">{{ b.timestamp?.toDate() | date:'short' }}</small>
                          </li>
                        </ul>
                        <ng-template #noBids><p class="text-muted small m-2">No bids submitted.</p></ng-template>
                      </div>
                    </div>
                  </div>

                  <!-- Call Logs Section -->
                  <div class="col-md-4">
                    <div class="card bg-dark border-secondary h-100">
                      <div class="card-header border-secondary bg-transparent fw-bold text-warning">
                        <i class="bi bi-telephone me-2"></i>Call Logs
                      </div>
                      <div class="card-body p-2" style="max-height: 250px; overflow-y: auto;">
                        <ul class="list-group list-group-flush" *ngIf="getOrderCallLogs(o.id!).length; else noCalls">
                          <li class="list-group-item bg-transparent text-light border-secondary px-2 py-1" *ngFor="let c of getOrderCallLogs(o.id!)">
                            <div class="d-flex justify-content-between">
                              <span><i class="bi" [ngClass]="c.type === 'video' ? 'bi-camera-video' : 'bi-telephone'"></i> {{ c.callerName || 'Unknown' }}</span>
                              <span class="badge" [ngClass]="c.callStatus === 'ended' ? 'bg-secondary' : 'bg-success'">{{ c.callStatus }}</span>
                            </div>
                            <small class="text-muted">{{ c.timestamp?.toDate() | date:'short' }}</small>
                          </li>
                        </ul>
                        <ng-template #noCalls><p class="text-muted small m-2">No calls recorded.</p></ng-template>
                      </div>
                    </div>
                  </div>

                  <!-- Assign Driver Section -->
                  <div class="col-md-4">
                    <div class="card bg-dark border-secondary h-100">
                      <div class="card-header border-secondary bg-transparent fw-bold text-success">
                        <i class="bi bi-person-plus me-2"></i>Eligible Drivers & Assign
                      </div>
                      <div class="card-body p-2" style="max-height: 250px; overflow-y: auto;">
                        <ul class="list-group list-group-flush" *ngIf="getEligibleDrivers(o).length; else noDrivers">
                          <li class="list-group-item bg-transparent text-light border-secondary px-2 py-2 d-flex justify-content-between align-items-center" *ngFor="let u of getEligibleDrivers(o)">
                            <div>
                              <div class="fw-semibold">{{ u.name }}</div>
                              <small class="text-muted">{{ u.phone }}</small>
                            </div>
                            <button class="btn btn-sm btn-primary" (click)="assignDriver(o, u.uid || u.id!)" [disabled]="assigningDriverId === (u.uid || u.id)">
                              <span *ngIf="assigningDriverId === (u.uid || u.id)" class="spinner-border spinner-border-sm"></span>
                              <span *ngIf="assigningDriverId !== (u.uid || u.id)">Assign</span>
                            </button>
                          </li>
                        </ul>
                        <ng-template #noDrivers><p class="text-muted small m-2">No eligible drivers for {{ o.vehicleType }}.</p></ng-template>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>`);

fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('Updated deals-tab.component.html');
