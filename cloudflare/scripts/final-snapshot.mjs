import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,validate} from './migration.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [directory,outputName='snapshot-final.json']=process.argv.slice(2);
const admin=JSON.parse(await fs.readFile(path.join(directory,'cutover-admin.json'),'utf8'));
const source=await fs.readFile(path.join(root,'app.js'),'utf8');const url=source.match(/gasUrl:\s*'([^']+)'/)[1];const passcode=source.match(/const DEFAULT_API_PASSCODE\s*=\s*'([^']+)'/)[1];
let data;
for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url+'?_ncd_final='+crypto.randomUUID(),{method:'POST',cache:'no-store',body:JSON.stringify({action:'migrationExport',migrationToken:admin.adminToken,passcode}),signal:AbortSignal.timeout(60000)});const j=await r.json();if(!r.ok||!j.success||!j.data.frozen)throw Error('Final source export not confirmed');data=j.data;break;}catch(error){if(attempt===2)throw error;}
}
const {telegramToken,telegramChatId,notificationsConfigured,...records}=data;
const snapshot={snapshotId:crypto.randomUUID(),readAt:new Date().toISOString(),sourceSpreadsheetId:'1n4zJ7YJZ0fUxzoyBO0GUIAZiHjj71d7dZaQ5sYdcL8Y',...records};
await fs.writeFile(path.join(directory,outputName),JSON.stringify(snapshot));
await fs.writeFile(path.join(directory,'production-secrets.json'),JSON.stringify({API_PASSCODE:passcode,...(notificationsConfigured?{TELEGRAM_BOT_TOKEN:telegramToken,TELEGRAM_CHAT_ID:telegramChatId}:{})}));
console.log({saved:true,frozen:true,counts:validate(snapshot),hash:digest(snapshot),notificationsConfigured});
