const fs = require('fs');
let modelsPath = 'src/models.ts';
let modelsContent = fs.readFileSync(modelsPath, 'utf8');

if (!modelsContent.includes('export interface CallLog')) {
  modelsContent += `
export interface CallLog {
  id?: string;
  dealId?: string;
  callStatus?: string;
  callerName?: string;
  callerId?: string;
  receiverId?: string;
  status?: string;
  timestamp?: any;
  type?: string;
  participants?: string[];
}
`;
  fs.writeFileSync(modelsPath, modelsContent, 'utf8');
  console.log('Added CallLog to models.ts');
} else {
  console.log('CallLog already in models.ts');
}
