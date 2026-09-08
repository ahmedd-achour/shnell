const fs = require('fs');
let content = fs.readFileSync('src/app/shnell-dashboard/services/dashboard-data.service.ts', 'utf8');

content = content.replace(/\/\/ Sync to the users collection so the Admin Dashboard UI stays in sync\s*const userDocRef = doc\(this\.firestore, `users\/\$\{userId\}`\);\s*await setDoc\(userDocRef, \{ balance: newBalance \}, \{ merge: true \}\);/, '');

fs.writeFileSync('src/app/shnell-dashboard/services/dashboard-data.service.ts', content, 'utf8');
console.log("Updated rechargeUserBalance");
