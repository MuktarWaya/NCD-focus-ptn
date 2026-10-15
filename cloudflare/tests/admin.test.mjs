import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './helpers.mjs';
const key=()=>crypto.randomUUID();
async function admin(){const c=await setup();await c.login();const login=await c.api('adminLogin',{}, {passcode:'local-admin-password'});assert.equal(login.status,200);return c;}
test('normal users and staff cannot elevate by selecting a name, spoofing fields, or using the shared password',async()=>{
  const c=await setup();await c.login('__staff_all__');
  assert.equal((await c.api('adminStatus')).body.data.unlocked,false);
  assert.equal((await c.api('adminLogin',{}, {passcode:'test-password'})).status,401);
  assert.equal((await c.api('adminList',{table:'targets'},{admin:true,role:'admin'})).status,403);
  assert.equal((await c.api('adminSave',{table:'targets',id:1,patch:{name:'ปลอม'}},{requestId:key(),expectedRevision:0,admin:true})).status,403);
});
test('admin password works from main login, expires after 30 minutes, and locks without ending normal session',async()=>{
  const c=await setup();const login=await c.api('login',{}, {passcode:'local-admin-password'});assert.equal(login.status,200);assert.equal(login.body.data.admin,true);
  assert.equal((await c.api('adminList',{table:'targets'})).status,200);
  await c.api('adminLock');assert.equal((await c.api('adminList',{table:'targets'})).status,403);assert.equal((await c.api('getBootstrapData')).status,200);
  await c.api('adminLogin',{}, {passcode:'local-admin-password'});c.DB.sqlite.exec('UPDATE sessions SET admin_expires_at=1');
  assert.equal((await c.api('adminSave',{table:'targets',id:1,patch:{name:'หมดเวลา'}},{requestId:key(),expectedRevision:0})).status,403);
});
test('admin tables filter and paginate without exposing SQL access',async()=>{
  const c=await admin();const targets=await c.api('adminList',{table:'targets',search:'ทดสอบ สอง',village:'หมู่ 4 บ้านม่วงเงิน'});assert.equal(targets.body.data.total,1);assert.equal(targets.body.data.rows[0].id,2);
  const tracking=await c.api('adminList',{table:'tracking',round:'W0'});assert.equal(tracking.body.data.rows[0]._target_name,'ทดสอบ หนึ่ง');
  assert.equal((await c.api('adminList',{table:'sessions'})).status,400);
  assert.equal((await c.api('adminList',{table:'targets',search:"%' OR 1=1;--"})).body.data.total,0);
});
test('admin corrects another worker target and reassignment with revisions/audit while preserving unknown fields',async()=>{
  const c=await admin();const requestId=key();const data={table:'targets',id:2,patch:{name:'แก้ชื่อแล้ว',responsible_worker:'คณะ ก',address:'002/09'}};const extra={requestId,expectedRevision:0};
  const result=await c.api('adminSave',data,extra);assert.equal(result.status,200);assert.equal(result.body.data.record.address,'002/09');
  assert.equal(JSON.parse(c.DB.sqlite.prepare('SELECT document FROM targets WHERE id=2').get().document).responsible_worker,'คณะ ก');
  assert.equal((await c.api('adminSave',data,extra)).status,200);assert.equal(c.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,1);
  assert.equal((await c.api('adminSave',{table:'targets',id:2,patch:{age:65}},{requestId:key(),expectedRevision:0})).status,409);
  const audit=(await c.api('adminList',{table:'audit'})).body.data.rows[0];assert.equal(audit.actor,'ผู้ดูแลระบบ');assert.equal(JSON.parse(audit.before_document).name,'ทดสอบ สอง');assert.equal(JSON.parse(audit.after_document).name,'แก้ชื่อแล้ว');
});
test('admin partial tracking corrections preserve legacy assessments, blanks, zero and immutable target/round IDs',async()=>{
  const c=await admin();c.DB.sqlite.prepare("UPDATE tracking_records SET document=json_set(document,'$.smoking','ไม่ทราบ','$.quarter','M0','$.hba1c',0),quarter='M0' WHERE id=10").run();
  const a=await c.api('adminSave',{table:'tracking',id:10,patch:{food_habit:'แก้อาหาร',veggie_fruit:0,body_fat:''}},{requestId:key(),expectedRevision:0});assert.equal(a.status,200);assert.equal(a.body.data.record.smoking,'ไม่ทราบ');assert.equal(a.body.data.record.hba1c,0);assert.equal(a.body.data.record.unknown_source_column,'preserve');
  const weight=await c.api('adminSave',{table:'tracking',id:10,patch:{weight:70}},{requestId:key(),expectedRevision:1});assert.equal(weight.status,200);assert.equal(weight.body.data.record.bmi,'27.3');
  assert.equal((await c.api('adminSave',{table:'tracking',id:10,patch:{target_id:2}},{requestId:key(),expectedRevision:2})).status,400);
  assert.equal((await c.api('adminSave',{table:'tracking',id:10,patch:{sleep:'invalid'}},{requestId:key(),expectedRevision:2})).status,400);
});
test('worker rename atomically updates all assignments and per-target audits, invalidates stale workspace and rejects stale edits',async()=>{
  const c=await admin();c.DB.sqlite.prepare('INSERT INTO sessions(token_hash,worker,expires_at) VALUES(?,?,?)').run('another-session','คณะ ก',Date.now()+100000);
  const requestId=key();const data={oldName:'คณะ ก',name:'ชื่อแก้ไข คณะ ก'};
  const a=await c.api('adminWorker',data,{requestId,expectedRevision:0});assert.equal(a.status,200);
  assert.equal(c.DB.sqlite.prepare('SELECT worker FROM targets WHERE id=1').get().worker,'ชื่อแก้ไข คณะ ก');assert.equal(c.DB.sqlite.prepare('SELECT revision FROM targets WHERE id=1').get().revision,1);
  assert.equal(JSON.parse(c.DB.sqlite.prepare('SELECT document FROM targets WHERE id=1').get().document).legacy_extra,'รักษาช่องต้นทาง');
  assert.equal(c.DB.sqlite.prepare("SELECT worker FROM sessions WHERE token_hash='another-session'").get().worker,'');
  assert.equal((await c.api('adminWorker',data,{requestId,expectedRevision:0})).status,200);assert.equal(c.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,2);
  assert.equal((await c.api('adminSave',{table:'targets',id:1,patch:{name:'เก่า'}},{requestId:key(),expectedRevision:0})).status,409);
  assert.equal((await c.api('adminWorker',{oldName:'ชื่อแก้ไข คณะ ก',name:'คณะ ข'},{requestId:key(),expectedRevision:1})).status,400);
  assert.equal((await c.api('adminWorker',{oldName:'ชื่อแก้ไข คณะ ก',name:'ชื่อใหม่'},{requestId:key(),expectedRevision:null})).status,409);
});
test('admin adds worker and normal ownership/staff guards remain active outside admin endpoints',async()=>{
  const c=await admin();const data={name:'คณะ ใหม่'};const extra={requestId:key(),expectedRevision:null};
  assert.equal((await c.api('adminWorker',data,extra)).status,200);assert.equal((await c.api('adminWorker',data,extra)).status,200);
  assert.ok((await c.api('getOsmWorkers')).body.data.includes('คณะ ใหม่'));
  assert.equal((await c.api('updateTarget',{id:2,name:'ส่งผ่านหน้าปกติ'},{worker:'__staff_all__',requestId:key(),expectedRevision:0})).status,403);
});
