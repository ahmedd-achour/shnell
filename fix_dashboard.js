const fs = require('fs');
let tsContent = fs.readFileSync('src/app/shnell-dashboard/components/settings-tab/settings-tab.component.ts', 'utf8');

// 1. Add pricing_json to the form creation
if (!tsContent.includes('pricing_json:')) {
    tsContent = tsContent.replace(/long_dist_rate: \[\(v as any\)\.long_dist_rate \?\? 0\],/,
`long_dist_rate: [(v as any).long_dist_rate ?? 0],
      pricing_json: [v.pricing ? JSON.stringify(v.pricing, null, 2) : '{}'],`);
}

// 2. Add it to patchValue
if (!tsContent.includes('pricing_json: v.pricing')) {
    tsContent = tsContent.replace(/long_dist_rate: v\.longDistRate \?\? \(v as any\)\.long_dist_rate \?\? 0,/,
`long_dist_rate: v.longDistRate ?? (v as any).long_dist_rate ?? 0,
                  pricing_json: v.pricing ? JSON.stringify(v.pricing, null, 2) : '{}',`);
}

// 3. Extract it on save and include in payload
if (!tsContent.includes('let parsedPricing = {};')) {
    tsContent = tsContent.replace(/const updatedPayload: Record<string, any> = \{\};/,
`let parsedPricing = {};
      try {
        parsedPricing = JSON.parse(val.pricing_json);
      } catch (e) {
        this.errorMessage = "Invalid JSON in Pricing for " + val.name;
        this.savingVehicle = null;
        return;
      }
      const updatedPayload: Record<string, any> = {};`);
      
    tsContent = tsContent.replace(/long_dist_rate: vehicleObj\.longDistRate,/,
`long_dist_rate: vehicleObj.longDistRate,
        price_per_km: Number(val.price_per_km),
        pricing: parsedPricing,`);
}

fs.writeFileSync('src/app/shnell-dashboard/components/settings-tab/settings-tab.component.ts', tsContent, 'utf8');
console.log("Updated settings-tab.component.ts");

let htmlContent = fs.readFileSync('src/app/shnell-dashboard/components/settings-tab/settings-tab.component.html', 'utf8');
if (!htmlContent.includes('formControlName="pricing_json"')) {
    htmlContent = htmlContent.replace(/<div class="mb-3">\s*<label class="form-label text-muted small mb-1">Long Dist Rate<\/label>\s*<input type="number".*?formControlName="long_dist_rate" \/>\s*<\/div>/,
`<div class="mb-3">
                      <label class="form-label text-muted small mb-1">Long Dist Rate</label>
                      <input type="number" step="0.1" class="form-control form-control-sm bg-black text-white border-secondary" formControlName="long_dist_rate" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label text-warning small mb-1">Country Pricing (JSON)</label>
                      <textarea class="form-control form-control-sm bg-black text-warning border-secondary font-monospace" formControlName="pricing_json" rows="8"></textarea>
                    </div>`);
    fs.writeFileSync('src/app/shnell-dashboard/components/settings-tab/settings-tab.component.html', htmlContent, 'utf8');
    console.log("Updated settings-tab.component.html");
}

