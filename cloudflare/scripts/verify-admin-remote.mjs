import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const [base,secretsPath,receiptPath]=process.argv.slice(2);
if(!base||!secretsPath||!receiptPath)throw Error('Usage: verify-admin-remote BASE PRIVATE_SECRETS RECEIPT');
const secrets=JSON.parse(await fs.readFile(secretsPath,'utf8'));let cookie='';
async function api(action,data={},extra={}){const r=await fetch(base+'/api',{method:'POST',headers:{'Content-Type':'application/json','X-NCD-Client':'1',Origin:base,Cookie:cookie},body:JSON.stringify({action,data,...extra}),signal:AbortSignal.timeout(30000)});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};}
assert.equal((await api('login',{}, {passcode:secrets.API_PASSCODE})).body.data.admin,false);
assert.equal((await api('selectWorker',{worker:'__staff_all__'})).status,200);
assert.equal((await api('adminList',{table:'targets'})).status,403);
assert.equal((await api('adminLogin',{}, {passcode:secrets.ADMIN_PASSCODE})).body.data.unlocked,true);
const counts={};for(const table of ['targets','tracking','workers','audit']){const r=await api('adminList',{table});assert.equal(r.status,200,'adminList '+table+' '+(r.body.code||''));assert.ok(Array.isArray(r.body.data.rows));counts[table]=r.body.data.total;}
assert.equal((await api('adminList',{table:'sessions'})).status,400);
assert.equal((await api('adminLock')).status,200);
assert.equal((await api('adminList',{table:'targets'})).status,403);
assert.equal((await api('getBootstrapData')).status,200);
assert.equal((await api('logout')).status,200);
assert.equal((await api('login',{}, {passcode:secrets.ADMIN_PASSCODE})).body.data.admin,true);
assert.equal((await api('adminList',{table:'workers'})).status,200);
await api('logout');
const html=await (await fetch(base,{signal:AbortSignal.timeout(30000)})).text();assert.ok(html.includes('id="admin-view"'));assert.ok(html.includes('admin.js'));const js=await(await fetch(base+'/admin.js')).text();assert.ok(js.includes('adminSave'));assert.ok(!js.includes(secrets.ADMIN_PASSCODE));
const receipt={verifiedAt:new Date().toISOString(),base,passed:true,checks:['ordinary/staff cannot access admin','admin unlock','allowlisted table reads','lock revokes capability','normal session remains valid','direct admin login','published admin assets without embedded credential'],counts,clinicalMutationRequests:0};
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
