import fs from 'node:fs/promises';
import {reconcile,digest} from './migration.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ncdExport=require('../../ncd-export.js');
const [base,secretPath,snapshotPath,receiptPath]=process.argv.slice(2);
if(!base?.startsWith('https://')||!receiptPath)throw Error('Usage: verify-remote.mjs HTTPS_BASE PRIVATE_SECRETS PRIVATE_SNAPSHOT RECEIPT');
const secrets=JSON.parse(await fs.readFile(secretPath,'utf8'));const snapshot=JSON.parse(await fs.readFile(snapshotPath,'utf8'));
let cookie='';const timings=[];
async function api(action,data={},extra={}){
  const start=performance.now();const r=await fetch(base+'/api',{method:'POST',headers:{'Content-Type':'application/json','X-NCD-Client':'1',Cookie:cookie,Origin:base},body:JSON.stringify({action,data,...extra}),signal:AbortSignal.timeout(30000)});
  if(r.headers.has('Set-Cookie'))cookie=r.headers.get('Set-Cookie').split(';')[0];
  const j=await r.json();timings.push({action,ms:Math.round(performance.now()-start),status:r.status});
  if(!r.ok||!j.success)throw Error('Cloudflare verification failed for '+action+' HTTP '+r.status);return j.data;
}
await api('login',{}, {passcode:secrets.API_PASSCODE});
const bootstrap=await api('getBootstrapData');await api('selectWorker',{worker:'__staff_all__'});
const dailyLogs=[];for(const t of snapshot.targets.filter(t=>snapshot.dailyLogs.some(d=>String(d.target_id)===String(t.id)))){const d=await api('getTargetDetail',{id:t.id},{worker:'__staff_all__'});dailyLogs.push(...d.dailyLogs);}
const verification=reconcile(snapshot,{...bootstrap,dailyLogs});
let exportReports=0;
for(const village of [...new Set(snapshot.targets.map(t=>t.village))])for(const round of ['W0','W2','W4','W6','W8','W10','W12','W14','W16','W18','W20','W22','W24']){
  const options={village,round};
  const expected=ncdExport.buildReport(snapshot.targets,snapshot.quarterly,options);
  const strip=row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='_revision'));
  const actual=ncdExport.buildReport(bootstrap.targets.map(strip),bootstrap.quarterly.map(strip),options);
  if(digest(expected)!==digest(actual))throw Error('Excel report differs after migration');
  exportReports++;
}
const checks=await Promise.all(['/env.txt','/data/targets.csv','/backend/gas_backend.js','/artifacts/superpowers/'].map(async p=>({path:p,status:(await fetch(base+p)).status})));
if(checks.some(c=>c.status!==404))throw Error('Private asset path is accessible');
const app=await(await fetch(base+'/app.js')).text();if(/script\.google\.com|DEFAULT_API_PASSCODE\s*=\s*'[^']+'/.test(app))throw Error('Legacy endpoint or credential in frontend');
for(let i=0;i<5;i++)await api('getBootstrapData');
const receipt={verifiedAt:new Date().toISOString(),base,...verification,exportReports,privatePathsBlocked:true,clinicalWrites:0,timings,frontendHash:digest(app)};
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));console.log(receipt);
