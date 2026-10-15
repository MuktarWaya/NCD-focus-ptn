import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setup,fixtures} from './helpers.mjs';
import {canonical} from '../scripts/migration.mjs';
import {flushOutbox,enqueueDaily} from '../src/notifications.ts';
const requestId=()=>crypto.randomUUID();
test('server login, secure session, workspace selection, scope and staff read-only',async()=>{
  const c=await setup();assert.equal((await c.api('getBootstrapData')).status,401);
  assert.equal((await c.api('login',{}, {passcode:'bad'})).status,401);
  const auth=await c.login();assert.match(auth.response.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict/);assert.match(auth.response.headers.get('Set-Cookie'),/Secure/);
  assert.equal((await c.api('getTargetDetail',{id:1})).body.data.dailyLogs.length,1);
  assert.equal((await c.api('getTargetDetail',{id:2})).status,403);
  assert.equal((await c.api('getTargetDetail',{id:1},{worker:'คณะ ข'})).status,409);
  await c.api('selectWorker',{worker:'__staff_all__'});
  assert.equal((await c.api('getTargetDetail',{id:2},{worker:'__staff_all__'})).status,200);
  assert.equal((await c.api('addQuarterly',{target_id:2,quarter:'W0'},{worker:'__staff_all__',requestId:requestId(),expectedRevision:null})).status,403);
  await c.api('logout');assert.equal((await c.api('getBootstrapData')).status,401);
});
test('bootstrap/dashboard, exact dates, zeros, blanks, unknown columns and legacy history match original backend',async()=>{
  const c=await setup();await c.login();const d=(await c.api('getBootstrapData')).body.data;
  assert.equal(d.targets.length,2);assert.equal(d.quarterly[0].veggie_fruit,0);assert.equal(d.quarterly[0].body_fat,'');assert.equal(d.quarterly[0].date,'18/09/2569');
  const legacy=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../../backend/gas_backend.js',import.meta.url),'utf8'),legacy);
  legacy.targets=fixtures.targets;legacy.logs=fixtures.quarterly;legacy.workers=fixtures.workers;
  const stats=vm.runInContext('computeDashboardStats_(targets,logs,workers)',legacy);
  assert.equal(canonical(d.dashboardStats),canonical(stats));
  assert.equal(d.targets[0].legacy_extra,'รักษาช่องต้นทาง');assert.equal(d.quarterly[0].unknown_source_column,'preserve');
});
test('upsert preserves omitted fields and clears explicit blank; repeat receipt writes once',async()=>{
  const c=await setup();await c.login();const key=requestId();const input={target_id:1,quarter:'W0',food_habit:'=เก็บเป็นข้อความจริง',veggie_fruit:0,body_fat:''};const extra={requestId:key,expectedRevision:0};
  const a=await c.api('addQuarterly',input,extra);assert.equal(a.status,200);assert.equal(a.body.data.id,10);
  assert.equal(a.body.data.record.unknown_source_column,'preserve');assert.equal(a.body.data.record.hba1c,0);assert.equal(a.body.data.record.food_habit,'=เก็บเป็นข้อความจริง');
  const again=await c.api('addQuarterly',input,extra);assert.deepEqual(again.body,a.body);
  assert.equal(c.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM tracking_records').get().n,1);
  assert.equal(c.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,1);
  assert.equal(c.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n,1);
  assert.equal((await c.api('addQuarterly',{...input,veggie_fruit:1},extra)).status,409);
});
test('concurrent updates reject stale versions atomically with no orphan receipt/outbox',async()=>{
  const c=await setup();await c.login();const results=await Promise.all([1,2].map(n=>c.api('addQuarterly',{target_id:1,quarter:'W0',food_habit:'แก้ไข '+n},{requestId:requestId(),expectedRevision:0})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(c.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,1);
  assert.equal(c.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM mutation_receipts').get().n,1);
  assert.equal(c.DB.sqlite.prepare('SELECT revision FROM tracking_records WHERE id=10').get().revision,1);
});
test('same new person/round requests cannot create duplicate tracking rows',async()=>{
  const c=await setup();await c.login();const data={target_id:1,quarter:'M0',weight:60};
  const results=await Promise.all([1,2].map(()=>c.api('addQuarterly',data,{requestId:requestId(),expectedRevision:null})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(c.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM tracking_records WHERE quarter='M0'").get().n,1);
});
test('add/update target, daily log and follow-up validation retain API contracts',async()=>{
  const c=await setup();await c.login();const target={...fixtures.targets[0],id:undefined,name:'ใหม่ ทดสอบ'};
  const a=await c.api('addTarget',target,{requestId:requestId(),expectedRevision:null});assert.equal(a.status,200);assert.ok(Number.isSafeInteger(a.body.data.id));
  assert.equal((await c.api('updateTarget',{id:1,name:'แก้ ทดสอบ'},{requestId:requestId(),expectedRevision:0})).status,200);
  assert.equal((await c.api('updateTarget',{id:1,responsible_worker:'คณะ ข'},{requestId:requestId(),expectedRevision:1})).status,403);
  assert.equal((await c.api('addDailyLog',{target_id:1,sleep_hours:0},{requestId:requestId(),expectedRevision:null})).status,200);
  const weekly=Object.fromEntries([1,2].flatMap(n=>Object.entries({exercise_minutes:0,healthy_menu_days:0,sleep_avg:0,avoid_sweet:1,avoid_oil:1,avoid_salt:1}).map(([k,v])=>[`week${n}_${k}`,v])));
  const q=await c.api('addQuarterly',{target_id:1,quarter:'W2',weight:60,height:160,hba1c:7,...weekly},{requestId:requestId(),expectedRevision:null});assert.equal(q.status,200);assert.equal(q.body.data.record.hba1c,'');assert.equal(q.body.data.record.bmi,'23.4');
  assert.equal((await c.api('addQuarterly',{target_id:1,quarter:'W4'},{requestId:requestId(),expectedRevision:null})).status,400);
});
test('writes fail closed before reconciliation and during read-only staging',async()=>{
  const c=await setup({verified:false});await c.login();const extra={requestId:requestId(),expectedRevision:0};
  assert.equal((await c.api('addQuarterly',{target_id:1,quarter:'W0'},extra)).status,503);
  c.env.WRITES_ENABLED='false';assert.equal((await c.api('addQuarterly',{target_id:1,quarter:'W0'},extra)).status,503);
  assert.equal(c.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,0);
});
test('notification failure is retried from durable outbox without undoing saved record',async()=>{
  const c=await setup();await c.login();const saved=await c.api('addQuarterly',{target_id:1,quarter:'W0',remark:'บันทึกแล้ว'},{requestId:requestId(),expectedRevision:0});assert.equal(saved.status,200);
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('no network');};c.env.NOTIFICATIONS_ENABLED='true';c.env.TELEGRAM_BOT_TOKEN='dummy';c.env.TELEGRAM_CHAT_ID='dummy';
  try{await flushOutbox(c.env);await enqueueDaily(c.env);await enqueueDaily(c.env);}finally{globalThis.fetch=original;}
  const pending=c.DB.sqlite.prepare("SELECT * FROM notification_outbox WHERE kind='updateQuarterly'").get();assert.equal(pending.attempts,1);assert.equal(pending.status,'pending');
  assert.equal(c.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='daily_summary'").get().n,1);
  assert.equal(c.DB.sqlite.prepare('SELECT revision FROM tracking_records WHERE id=10').get().revision,1);
});
