import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker from '../src/index.ts';
import {timingSafeEqual} from 'node:crypto';
// Workers provides this extension; Node's WebCrypto needs an equivalent in unit tests.
if(!crypto.subtle.timingSafeEqual)crypto.subtle.timingSafeEqual=(a,b)=>timingSafeEqual(a,b);
export class SqliteD1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));}
  prepare(sql){return new Statement(this,sql,[]);}
  async batch(statements){this.sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
}
class Statement{
  constructor(db,sql,args){Object.assign(this,{db,sql,args});}
  bind(...args){return new Statement(this.db,this.sql,args);}
  execute(){const rows=this.db.sqlite.prepare(this.sql).all(...this.args);const meta=this.db.sqlite.prepare('SELECT changes() AS changes').get();return {results:rows,success:true,meta:{changes:meta.changes}};}
  async all(){return this.execute();}
  async run(){return this.execute();}
  async first(column){const row=this.execute().results[0]??null;return column?row?.[column]??null:row;}
}
export const fixtures={
  targets:[{id:1,name:'ทดสอบ หนึ่ง',address:'001/2',village:'หมู่ 2 บ้านตรัง',responsible_worker:'คณะ ก',age:50,height:160,type:'กลุ่มเสี่ยง',legacy_extra:'รักษาช่องต้นทาง'}, {id:2,name:'ทดสอบ สอง',address:'2',village:'หมู่ 4 บ้านม่วงเงิน',responsible_worker:'คณะ ข',age:60,height:170,type:'กลุ่มป่วย'}],
  quarterly:[{id:10,target_id:1,quarter:'W0',date:'18/09/2569',weight:53.2,bmi:'20.8',waist:80,dtx:87,bp:'118/70',body_fat:'',muscle_mass:23.7,visceral_fat:7,body_age:59,report_exercise_minutes:0,physical_activity:'none',food_overeat:'yes',food_unhealthy:'yes',food_habit:'ข้าว 2 จาน',veggie_fruit:0,depression_2q:'no',report_sleep_hours:6,sleep:'low',smoking:'no',alcohol:'no',hba1c:0,unknown_source_column:'preserve'}],
  workers:['คณะ ก','คณะ ข'],dailyLogs:[{id:1,target_id:1,date:'01/10/2026',sleep_hours:0,menu:'=ข้อความตามจริง'}],archive:{NotificationLog:{values:[['status'],['sent']]},ชีต5:{values:[['SECRET_TOKEN']]}}
};
export async function setup({verified=true}={}){
  const DB=new SqliteD1();const {importSQL}=await import('../scripts/migration.mjs');
  DB.sqlite.exec(importSQL({...structuredClone(fixtures),snapshotId:'fixture'}));
  if(verified)DB.sqlite.exec("UPDATE settings SET value='verified' WHERE key='migration_state'");
  const env={DB,API_PASSCODE:'test-password',ENVIRONMENT:'local',WRITES_ENABLED:'true',NOTIFICATIONS_ENABLED:'false',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:'',ASSETS:{fetch:()=>new Response('asset')}};
  let cookie='';
  async function api(action,data={},extra={}){
    const response=await worker.fetch(new Request('https://ncd.test/api',{method:'POST',headers:{'X-NCD-Client':'1','Content-Type':'application/json','Cookie':cookie,Origin:'https://ncd.test'},body:JSON.stringify({action,data,worker:'คณะ ก',...extra})}),env,{});
    if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];
    return {status:response.status,body:await response.json(),response};
  }
  async function login(name='คณะ ก'){const r=await api('login',{}, {passcode:'test-password'});if(r.status!==200)throw Error('Test login failed');await api('selectWorker',{worker:name});return r;}
  return {env,DB,api,login,getCookie:()=>cookie};
}
