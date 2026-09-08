const fs = require('fs');

const tsPath = 'src/app/shnell-dashboard/shnell-dashboard.component.ts';
let tsContent = fs.readFileSync(tsPath, 'utf8');

tsContent = tsContent.replace(/import \{.*?\} from '\.\/models\/dashboard\.models';/, (match) => {
  return match.replace('}', ', CallLog }');
});

fs.writeFileSync(tsPath, tsContent, 'utf8');
console.log('Fixed import in shnell-dashboard');
