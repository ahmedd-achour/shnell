const fs = require('fs');
const path = 'src/app/shnell-dashboard/components/deals-tab/deals-tab.component.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /const getTime = \(deal, order\) => \{/g,
    "const getTime = (deal: any, order: any) => {"
);

fs.writeFileSync(path, content, 'utf8');
