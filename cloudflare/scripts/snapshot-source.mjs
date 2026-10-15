import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validate,digest} from './migration.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [rawPath,output]=process.argv.slice(2);if(!rawPath||!output)throw Error('Usage: snapshot-source.mjs PRIVATE_RAW_SHEETS_JSON PRIVATE_OUTPUT_JSON');
const raw=JSON.parse(await fs.readFile(rawPath,'utf8'));
const source=await fs.readFile(path.join(root,'app.js'),'utf8');
const url=source.match(/gasUrl:\s*'([^']+)'/)[1];const passcode=source.match(/const DEFAULT_API_PASSCODE\s*=\s*'([^']+)'/)[1];
async function read(action,data={}){
  for(let attempt=0;attempt<3;attempt++){
    try{const r=await fetch(url+'?_ncd_snapshot='+crypto.randomUUID(),{method:'POST',cache:'no-store',body:JSON.stringify({action,data,passcode}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success)throw Error('Source read failed');return j.data;}catch(error){if(attempt===2)throw error;}
  }
}
const bootstrap=await read('getBootstrapData');
const table=values=>{const [headers,...rows]=values||[];return rows.filter(r=>r.some(v=>v!==''&&v!==null)).map(r=>Object.fromEntries(headers.filter(Boolean).map((key,i)=>[key,r[i]??''])));};
// For nonempty daily history use the original API serialization (including any date cells).
const dailyRaw=table(raw.sheets.DailyLogs.values);let dailyLogs=[];
if(dailyRaw.length){
  const targetIds=[...new Set(dailyRaw.map(r=>r.target_id))];for(const id of targetIds){const detail=await read('getTargetDetail',{id});dailyLogs.push(...detail.dailyLogs);}
  if(dailyLogs.length!==dailyRaw.length)throw Error('Daily log count differs from raw source');
}
const snapshot={snapshotId:crypto.randomUUID(),readAt:new Date().toISOString(),sourceSpreadsheetId:raw.spreadsheetId,sourceReadAt:raw.readAt,targets:bootstrap.targets,quarterly:bootstrap.quarterly,workers:bootstrap.workers,dailyLogs,archive:Object.fromEntries(Object.entries(raw.sheets).filter(([name])=>['Targets','QuarterlyData','DailyLogs','OSM','NotificationLog'].includes(name)))};
validate(snapshot);
await fs.writeFile(output,JSON.stringify(snapshot));
console.log({snapshotSaved:true,counts:validate(snapshot),hash:digest(snapshot)});
