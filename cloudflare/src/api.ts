import { hash, assertWorkspace, assertAdmin } from './auth.ts';
import { ApiError, clean, id, owner, STAFF, unpack, type Document, type Session, type StoredRow } from './types.ts';
import { computeDashboardStats_, validateTrackingData_, validateNcdReportData_, pingpongClassify_, getTodayThaiDate, trackingRoundOrder_, parseDate } from './rules.mjs';
import { eventMessage } from './notifications.ts';

const targetFields = 'name address village responsible_worker age height type chronic_disease co_morbidity onset_year medicines'.split(' ');
const trackFields = 'target_id quarter date height weight bmi waist dtx bp body_fat muscle_mass visceral_fat body_age physical_activity food_overeat food_unhealthy food_habit remark veggie_fruit depression_2q sleep smoking alcohol hba1c egfr creatinine triglyceride ldl cholesterol report_exercise_minutes report_sleep_hours risk_category'.split(' ').concat([1,2].flatMap(n=>['exercise_minutes','healthy_menu_days','sleep_avg','avoid_sweet','avoid_oil','avoid_salt'].map(k=>`week${n}_${k}`)));
const dailyFields = 'target_id week day date avoid_sweet avoid_oil avoid_salt menu exercise_type exercise_duration water sleep_hours'.split(' ');
const writes = new Set(['addTarget','updateTarget','addQuarterly','addDailyLog']);
export function isWrite(action:string):boolean{return writes.has(action);}
export async function workers(env:Env):Promise<string[]>{
  return (await env.DB.prepare('SELECT name FROM workers ORDER BY ordinal').all<{name:string}>()).results.map(w=>w.name);
}
export async function workspaceChoices(env:Env):Promise<string[]>{
  const [directory,assigned]=await Promise.all([workers(env),env.DB.prepare('SELECT DISTINCT worker AS name FROM targets ORDER BY worker').all<{name:string}>()]);
  return [...new Set([...directory,...assigned.results.map(w=>w.name)])];
}
async function records(env:Env,table:'targets'|'tracking_records'|'daily_logs_legacy'):Promise<Document[]>{
  return (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all<StoredRow>()).results.map(unpack);
}
async function assertTarget(env:Env,current:Session,targetId:number,write=false,admin=false):Promise<StoredRow>{
  const row=await env.DB.prepare('SELECT * FROM targets WHERE id=?').bind(targetId).first<StoredRow>();
  if(!row)throw new ApiError('ไม่พบข้อมูลกลุ่มเป้าหมาย',404,'NOT_FOUND');
  if(!admin&&((write&&current.worker===STAFF)||(current.worker!==STAFF&&row.worker!==current.worker)))throw new ApiError('รายชื่อนี้ไม่ได้อยู่ในกลุ่มที่คุณรับผิดชอบ',403,'FORBIDDEN');
  return row;
}
export async function read(action:string,data:Document,env:Env,current:Session):Promise<unknown>{
  if(action==='getOsmWorkers')return workers(env);
  // Global registry/tracking reads retain the existing shared dashboard contract. They require login.
  // Workspace selection is an organizational filter, not personal authentication or confidentiality.
  if(action==='getTargets')return records(env,'targets');
  if(action==='getAllQuarterly')return {quarterly:await records(env,'tracking_records'),ncdReportVersion:1};
  if(action==='getBootstrapData'||action==='getDashboardStats'){
    const [targets,quarterly,directory]=await Promise.all([records(env,'targets'),records(env,'tracking_records'),workers(env)]);
    const dashboardStats=computeDashboardStats_(targets,quarterly,directory);
    if(action==='getDashboardStats')return dashboardStats;
    return {targets,quarterly,workers:directory,dashboardStats,ncdReportVersion:1,backend:'cloudflare',selectedWorker:current.worker||null,writesEnabled:env.WRITES_ENABLED==='true'};
  }
  if(action==='getTargetDetail'){
    const targetId=id(data.id);const row=await assertTarget(env,current,targetId);
    const result=await env.DB.batch<StoredRow>([env.DB.prepare('SELECT * FROM tracking_records WHERE target_id=?').bind(targetId),env.DB.prepare('SELECT * FROM daily_logs_legacy WHERE target_id=?').bind(targetId)]);
    return {profile:unpack(row),quarterly:result[0].results.map(unpack).sort((a,b)=>trackingRoundOrder_(a.quarter)-trackingRoundOrder_(b.quarter)),dailyLogs:result[1].results.map(unpack).sort((a,b)=>parseDate(b.date).getTime()-parseDate(a.date).getTime()),ncdReportVersion:1};
  }
  throw new ApiError('ไม่พบ Action สำหรับการเขียนข้อมูล',400,'UNKNOWN_ACTION');
}
function pick(data:Document,fields:string[]):Document{
  const result:Document={};
  for(const key of fields)if(Object.hasOwn(data,key)){
    const v=data[key];
    if(v!==null&&!['string','number','boolean'].includes(typeof v))throw new ApiError('รูปแบบข้อมูลไม่ถูกต้อง');
    if(typeof v==='number'&&!Number.isFinite(v))throw new ApiError('ตัวเลขไม่ถูกต้อง');
    if(typeof v==='string'&&v.length>4000)throw new ApiError('ข้อความยาวเกินที่กำหนด');
    result[key]=v;
  }
  return result;
}
function validateTarget(d:Document):void{
  if(!clean(d.name))throw new ApiError('กรุณาระบุชื่อกลุ่มเป้าหมาย');
  if(!['กลุ่มเสี่ยง','กลุ่มป่วย'].includes(String(d.type)))throw new ApiError('ประเภทกลุ่มไม่ถูกต้อง');
  if(!['หมู่ 1 บ้านบองอ','หมู่ 2 บ้านตรัง','หมู่ 3 บ้านเขาวัง','หมู่ 4 บ้านม่วงเงิน'].includes(String(d.village)))throw new ApiError('หมู่บ้านไม่ถูกต้อง');
  for(const key of ['age','height'])if(d[key]!==''&&d[key]!=null&&(!Number.isFinite(Number(d[key]))||Number(d[key])<=0))throw new ApiError('ข้อมูล '+key+' ไม่ถูกต้อง');
}
function newId():number{
  const bytes=crypto.getRandomValues(new Uint8Array(6));
  return bytes.reduce((n,b)=>n*256+b,0)||1;
}
export async function mutate(action:string,data:Document,requestId:string,expected:unknown,env:Env,current:Session,admin=false):Promise<unknown>{
  if(admin)assertAdmin(current);
  if(env.WRITES_ENABLED!=='true')throw new ApiError('ระบบอยู่ระหว่างตรวจสอบข้อมูล ยังไม่เปิดรับบันทึก',503,'READ_ONLY');
  const migration=await env.DB.prepare("SELECT value FROM settings WHERE key='migration_state'").first<{value:string}>();
  if(migration?.value!=='verified')throw new ApiError('ยังตรวจสอบข้อมูลย้ายเข้าไม่ครบ',503,'UNVERIFIED_DATA');
  if(!admin&&current.worker===STAFF)throw new ApiError('โหมดเจ้าหน้าที่ดูข้อมูลทั้งหมด ใช้ดูข้อมูลเท่านั้น กรุณาเลือกชื่อผู้รับผิดชอบก่อนบันทึก',403,'FORBIDDEN');
  if(!/^[a-zA-Z0-9-]{16,100}$/.test(requestId))throw new ApiError('ไม่พบรหัสยืนยันคำขอบันทึก');
  const payloadHash=await hash(JSON.stringify({action,data,expected,worker:current.worker,...(admin?{admin:true}:{})}));
  const prior=await env.DB.prepare('SELECT * FROM mutation_receipts WHERE request_id=?').bind(requestId).first<{session_hash:string;payload_hash:string;result:string}>();
  if(prior){
    if(prior.session_hash!==current.token_hash||prior.payload_hash!==payloadHash)throw new ApiError('รหัสคำขอบันทึกถูกใช้กับข้อมูลอื่นแล้ว',409,'IDEMPOTENCY_CONFLICT');
    return JSON.parse(prior.result);
  }
  let table:'targets'|'tracking_records'|'daily_logs_legacy';
  let existing:StoredRow|null=null;let target:Document;let document:Document;
  if(action==='addTarget'||action==='updateTarget'){
    table='targets';
    if(action==='updateTarget')existing=await assertTarget(env,current,id(data.id),true,admin);
    document={...(existing?JSON.parse(existing.document):{}),...pick(data,targetFields)};
    if(!admin&&owner(document)!==current.worker)throw new ApiError('ผู้รับผิดชอบต้องตรงกับชื่อคณะทำงานที่เลือก',403,'FORBIDDEN');
    if(admin&&Object.hasOwn(data,'responsible_worker')){
      document.responsible_worker=clean(data.responsible_worker);
      if(!['ยังไม่ระบุคณะทำงาน',...await workspaceChoices(env)].includes(owner(document)))throw new ApiError('กรุณาเลือกคณะทำงานจากรายการ หรือเพิ่มคณะทำงานก่อน');
    }
    validateTarget(document);target=document;
  }else{
    const targetId=id(data.target_id);target=JSON.parse((await assertTarget(env,current,targetId,true,admin)).document);
    if(action==='addQuarterly'){
      table='tracking_records';
      const quarter=clean(data.quarter);
      existing=await env.DB.prepare('SELECT * FROM tracking_records WHERE target_id=? AND quarter=?').bind(targetId,quarter).first<StoredRow>();
      document={...(existing?JSON.parse(existing.document):{}),...pick(data,trackFields),target_id:targetId,quarter};
      if(!admin||!Object.hasOwn(data,'date'))document.date=document.date||getTodayThaiDate();
      if(admin&&Object.hasOwn(data,'weight'))document.height=target.height;
      if((!admin||Object.hasOwn(data,'weight'))&&document.weight&&document.height)document.bmi=(Number(document.weight)/(Number(document.height)/100)**2).toFixed(1);
      const invalid=admin?validateNcdReportData_(data):validateTrackingData_(document);if(invalid)throw new ApiError(invalid);
      if(admin)for(const [key,value] of Object.entries(data)){
        if(!/^week[12]_/.test(key)||value===''||value===null)continue;
        const max=key.endsWith('healthy_menu_days')?7:key.endsWith('sleep_avg')?24:key.includes('_avoid_')?5:10080;
        const min=key.includes('_avoid_')?1:0;
        if(!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw new ApiError('ค่าสรุปสัปดาห์ไม่อยู่ในช่วงที่กำหนด');
      }
      for(const key of ['weight','height','bmi','waist','dtx','body_fat','muscle_mass','visceral_fat','body_age','hba1c','egfr','creatinine','triglyceride','ldl','cholesterol']){
        if(admin&&!Object.hasOwn(data,key))continue;
        const value=document[key];if(value!==''&&value!==null&&value!==undefined&&(!Number.isFinite(Number(value))||Number(value)<0))throw new ApiError('ข้อมูล '+key+' ไม่ถูกต้อง');
      }
      if(!admin&&!['W0','W12','W24'].includes(quarter))for(const field of ['hba1c','egfr','creatinine','triglyceride','ldl','cholesterol'])document[field]='';
      if(!admin||['dtx','hba1c','bp'].some(key=>Object.hasOwn(data,key))){const pp=pingpongClassify_(document,target);document.pingpong=pp.colorTh;document.pingpong_rank=pp.rank;}
    }else{
      table='daily_logs_legacy';document={...pick(data,dailyFields),target_id:targetId};document.date=document.date||getTodayThaiDate();
    }
  }
  const expectedRevision=expected===null?-1:Number(expected);
  if(!Number.isInteger(expectedRevision)||expectedRevision!==(existing?.revision??-1))throw new ApiError('ข้อมูลถูกแก้ไขแล้ว กรุณาเปิดประวัติล่าสุดก่อนบันทึก ข้อมูลในฟอร์มยังอยู่',409,'REVISION_CONFLICT');
  const recordId=existing?.id??newId();document.id=recordId;
  const nextRevision=existing?existing.revision+1:0;
  const result={id:recordId,message:'บันทึกข้อมูลเรียบร้อยแล้ว',record:{...document,_revision:nextRevision},requestId};
  const documentJson=JSON.stringify(document);
  const batch:D1PreparedStatement[]=[];
  // The receipt CHECK and write execute in one D1 transaction; a stale revision aborts the entire batch.
  let guard:string;const guardValues:(string|number)[]=[];
  if(existing){guard=`(SELECT revision FROM ${table} WHERE id=?)=?`;guardValues.push(recordId,existing.revision);}
  else if(table==='tracking_records'){guard='NOT EXISTS(SELECT 1 FROM tracking_records WHERE target_id=? AND quarter=?)';guardValues.push(Number(document.target_id),String(document.quarter));}
  else{guard=`NOT EXISTS(SELECT 1 FROM ${table} WHERE id=?)`;guardValues.push(recordId);}
  batch.push(env.DB.prepare(`INSERT INTO mutation_receipts(request_id,session_hash,action,payload_hash,result) VALUES(?,?,?,?,CASE WHEN ${guard} THEN ? ELSE NULL END)`).bind(requestId,current.token_hash,action,payloadHash,...guardValues,JSON.stringify(result)));
  if(existing){
    const sql=table==='targets'?'UPDATE targets SET document=?,worker=?,village=?,revision=revision+1,updated_at=? WHERE id=?':'UPDATE tracking_records SET document=?,revision=revision+1,updated_at=? WHERE id=?';
    const args=table==='targets'?[documentJson,owner(document),clean(document.village),new Date().toISOString(),recordId]:[documentJson,new Date().toISOString(),recordId];
    batch.push(env.DB.prepare(sql).bind(...args));
  }else if(table==='targets')batch.push(env.DB.prepare('INSERT INTO targets(id,worker,village,document) VALUES(?,?,?,?)').bind(recordId,owner(document),clean(document.village),documentJson));
  else if(table==='tracking_records')batch.push(env.DB.prepare('INSERT INTO tracking_records(id,target_id,quarter,document) VALUES(?,?,?,?)').bind(recordId,document.target_id,document.quarter,documentJson));
  else batch.push(env.DB.prepare('INSERT INTO daily_logs_legacy(id,target_id,document) VALUES(?,?,?)').bind(recordId,document.target_id,documentJson));
  batch.push(env.DB.prepare('INSERT INTO audit_log(request_id,actor,action,target_id,before_document,after_document) VALUES(?,?,?,?,?,?)').bind(requestId,admin?'ผู้ดูแลระบบ':current.worker,admin?'admin:'+action:action,table==='targets'?recordId:document.target_id,existing?.document??null,documentJson));
  // Persist notifications atomically, then deliver asynchronously by Cron. Never send in the save path.
  const notificationAction=action==='addQuarterly'&&existing?'updateQuarterly':action;
  batch.push(env.DB.prepare('INSERT INTO notification_outbox(id,kind,message) VALUES(?,?,?)').bind(requestId,notificationAction,eventMessage(notificationAction,target,document,existing?JSON.parse(existing.document):undefined)));
  try{await env.DB.batch(batch);}catch{
    const receipt=await env.DB.prepare('SELECT session_hash,payload_hash,result FROM mutation_receipts WHERE request_id=?').bind(requestId).first<{session_hash:string;payload_hash:string;result:string}>();
    if(receipt?.session_hash===current.token_hash&&receipt.payload_hash===payloadHash)return JSON.parse(receipt.result);
    throw new ApiError('มีการเปลี่ยนแปลงข้อมูลพร้อมกัน กรุณาตรวจประวัติก่อนบันทึกใหม่',409,'REVISION_CONFLICT');
  }
  return result;
}
export { assertWorkspace };
export const adminTargetFields=targetFields;
export const adminTrackingFields=trackFields.filter(key=>!['target_id','quarter','height','bmi'].includes(key));
