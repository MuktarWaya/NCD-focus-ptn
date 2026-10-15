import { assertAdmin, hash } from './auth.ts';
import { mutate, adminTargetFields, adminTrackingFields, workspaceChoices } from './api.ts';
import { ApiError, clean, id, unpack, STAFF, type StoredRow, type Session, type Document } from './types.ts';

const villages=['หมู่ 1 บ้านบองอ','หมู่ 2 บ้านตรัง','หมู่ 3 บ้านเขาวัง','หมู่ 4 บ้านม่วงเงิน'];
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export async function adminList(data:Record<string,unknown>,env:Env,current:Session):Promise<unknown>{
  assertAdmin(current);
  const table=clean(data.table);const page=Math.max(1,Math.min(100000,Math.floor(Number(data.page)||1)));const limit=25;
  const search=clean(data.search).slice(0,120);const args:(string|number)[]=[];const conditions:string[]=[];
  let from:string;
  if(table==='targets')from='targets t';
  else if(table==='tracking')from='tracking_records r JOIN targets t ON t.id=r.target_id';
  else if(table==='workers'){
    const query="WITH names AS (SELECT name FROM workers UNION SELECT worker AS name FROM targets) SELECT n.name,w.ordinal,COALESCE(w.revision,-1) AS _revision,COUNT(t.id) AS target_count,GROUP_CONCAT(DISTINCT t.village) AS villages FROM names n LEFT JOIN workers w ON w.name=n.name LEFT JOIN targets t ON t.worker=n.name WHERE n.name LIKE ? GROUP BY n.name ORDER BY n.name";
    const rows=(await env.DB.prepare(query).bind('%'+search+'%').all()).results;
    return {rows:rows.slice((page-1)*limit,page*limit),total:rows.length,page,limit,workers:await workspaceChoices(env),villages};
  }else if(table==='audit'){
    const rows=await env.DB.prepare('SELECT a.*,json_extract(t.document,\'$.name\') AS target_name FROM audit_log a LEFT JOIN targets t ON t.id=a.target_id WHERE a.actor LIKE ? OR a.action LIKE ? OR a.before_document LIKE ? OR a.after_document LIKE ? ORDER BY a.id DESC LIMIT ? OFFSET ?').bind(...Array(4).fill('%'+search+'%'),limit,(page-1)*limit).all();
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE actor LIKE ? OR action LIKE ? OR before_document LIKE ? OR after_document LIKE ?').bind(...Array(4).fill('%'+search+'%')).first<{n:number}>();
    return {rows:rows.results,total:count?.n||0,page,limit};
  }else throw new ApiError('ไม่พบตารางที่อนุญาต',400,'INVALID_TABLE');
  if(search){conditions.push("(json_extract(t.document,'$.name') LIKE ? OR CAST(t.id AS TEXT)=?)");args.push('%'+search+'%',search);}
  if(clean(data.village)){conditions.push('t.village=?');args.push(clean(data.village));}
  if(clean(data.worker)){conditions.push('t.worker=?');args.push(clean(data.worker));}
  if(table==='tracking'&&clean(data.round)){conditions.push('r.quarter=?');args.push(clean(data.round));}
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const select=table==='tracking'?"r.*,json_extract(t.document,'$.name') AS target_name,t.village,t.worker":"t.*";
  const result=await env.DB.batch<Record<string,unknown>>([
    env.DB.prepare(`SELECT ${select} FROM ${from}${where} ORDER BY ${table==='tracking'?'r':'t'}.id LIMIT ? OFFSET ?`).bind(...args,limit,(page-1)*limit),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM ${from}${where}`).bind(...args)
  ]);
  const rows=result[0].results.map(row=>{
    const stored=row as StoredRow;
    return {...unpack(stored),...(table==='tracking'?{_target_name:row.target_name,_village:row.village,_worker:row.worker}:{})};
  });
  return {rows,total:Number(result[1].results[0]?.n||0),page,limit,workers:await workspaceChoices(env),villages};
}

export async function adminSave(data:Record<string,unknown>,requestId:string,expected:unknown,env:Env,current:Session):Promise<unknown>{
  assertAdmin(current);
  const table=clean(data.table);
  if(!isObject(data.patch)||!Object.keys(data.patch).length)throw new ApiError('ยังไม่มีช่องที่แก้ไข');
  const allowed=table==='targets'?adminTargetFields:table==='tracking'?adminTrackingFields:[];
  if(Object.keys(data.patch).some(k=>!allowed.includes(k)))throw new ApiError('มีช่องที่ไม่อนุญาตให้แก้ไข รหัสและรอบติดตามเปลี่ยนไม่ได้');
  const patch=data.patch as Document;
  if(table==='targets')return mutate('updateTarget',{...patch,id:id(data.id)},requestId,expected,env,current,true);
  if(table==='tracking'){
    const row=await env.DB.prepare('SELECT * FROM tracking_records WHERE id=?').bind(id(data.id)).first<StoredRow>();
    if(!row)throw new ApiError('ไม่พบผลติดตาม',404,'NOT_FOUND');
    return mutate('addQuarterly',{...patch,target_id:row.target_id!,quarter:row.quarter!},requestId,expected,env,current,true);
  }
  throw new ApiError('ไม่พบตารางที่อนุญาต');
}

export async function saveWorker(data:Record<string,unknown>,requestId:string,expected:unknown,env:Env,current:Session):Promise<unknown>{
  assertAdmin(current);
  if(env.WRITES_ENABLED!=='true')throw new ApiError('ยังไม่เปิดรับบันทึก',503,'READ_ONLY');
  const state=await env.DB.prepare("SELECT value FROM settings WHERE key='migration_state'").first<{value:string}>();
  if(state?.value!=='verified')throw new ApiError('ยังตรวจสอบข้อมูลย้ายเข้าไม่ครบ',503,'UNVERIFIED_DATA');
  if(!/^[a-zA-Z0-9-]{16,100}$/.test(requestId))throw new ApiError('ไม่พบรหัสคำขอบันทึก');
  const name=clean(data.name);const oldName=clean(data.oldName);const creating=!oldName;
  if(!name||name.length>200||[STAFF,'ยังไม่ระบุคณะทำงาน'].includes(name))throw new ApiError('ชื่อคณะทำงานไม่ถูกต้อง');
  const payloadHash=await hash(JSON.stringify({action:'adminWorker',name,oldName,expected}));
  const prior=await env.DB.prepare('SELECT * FROM mutation_receipts WHERE request_id=?').bind(requestId).first<{session_hash:string;payload_hash:string;result:string}>();
  if(prior){if(prior.session_hash!==current.token_hash||prior.payload_hash!==payloadHash)throw new ApiError('คำขอบันทึกถูกใช้กับข้อมูลอื่นแล้ว',409,'IDEMPOTENCY_CONFLICT');return JSON.parse(prior.result);}
  const existing=oldName?await env.DB.prepare('SELECT * FROM workers WHERE name=?').bind(oldName).first<{name:string;ordinal:number;revision:number}>():null;
  const revision=existing?.revision??-1;
  if(creating?expected!==null:expected===null||!Number.isInteger(Number(expected))||Number(expected)!==revision)throw new ApiError('ชื่อคณะทำงานถูกแก้ไขแล้ว กรุณาโหลดล่าสุด',409,'REVISION_CONFLICT');
  if(!creating&&!existing){const assigned=await env.DB.prepare('SELECT id FROM targets WHERE worker=? LIMIT 1').bind(oldName).first();if(!assigned)throw new ApiError('ไม่พบคณะทำงานเดิม',404,'NOT_FOUND');}
  if((creating||name!==oldName)&&await env.DB.prepare('SELECT name FROM workers WHERE name=?').bind(name).first())throw new ApiError('มีชื่อคณะทำงานนี้แล้ว กรุณาแก้ผู้รับผิดชอบในตารางรายบุคคลแทน');
  const ordinal=existing?.ordinal??((await env.DB.prepare('SELECT COALESCE(MAX(ordinal),-1)+1 AS n FROM workers').first<{n:number}>())?.n??0);
  const result={message:creating?'เพิ่มคณะทำงานแล้ว':'แก้ชื่อคณะทำงานและผู้รับผิดชอบที่เกี่ยวข้องแล้ว',record:{name,ordinal,_revision:existing?revision+1:0},requestId};
  const guard=existing?'(SELECT revision FROM workers WHERE name=?)=?':'NOT EXISTS(SELECT 1 FROM workers WHERE name=?)';
  const guardArgs=existing?[oldName,revision]:[creating?name:oldName];
  const batch:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO mutation_receipts(request_id,session_hash,action,payload_hash,result) VALUES(?,?,?,?,CASE WHEN ${guard} THEN ? ELSE NULL END)`).bind(requestId,current.token_hash,'adminWorker',payloadHash,...guardArgs,JSON.stringify(result))];
  if(existing)batch.push(env.DB.prepare('UPDATE workers SET name=?,revision=revision+1 WHERE name=?').bind(name,oldName));
  else batch.push(env.DB.prepare('INSERT INTO workers(name,ordinal) VALUES(?,?)').bind(name,ordinal));
  if(!creating&&oldName!==name){
    batch.push(env.DB.prepare("INSERT INTO audit_log(request_id,actor,action,target_id,before_document,after_document) SELECT ?||'-target-'||id,'ผู้ดูแลระบบ','admin:reassignWorker',id,document,json_set(document,'$.responsible_worker',?) FROM targets WHERE worker=?").bind(requestId,name,oldName));
    batch.push(env.DB.prepare("UPDATE targets SET worker=?,document=json_set(document,'$.responsible_worker',?),revision=revision+1,updated_at=? WHERE worker=?").bind(name,name,new Date().toISOString(),oldName));
  }
  batch.push(env.DB.prepare('INSERT INTO audit_log(request_id,actor,action,before_document,after_document) VALUES(?,?,?,?,?)').bind(requestId,'ผู้ดูแลระบบ',creating?'admin:addWorker':'admin:renameWorker',JSON.stringify(existing||{name:oldName}),JSON.stringify(result.record)));
  if(oldName&&oldName!==name)batch.push(env.DB.prepare("UPDATE sessions SET worker='' WHERE worker=?").bind(oldName));
  try{await env.DB.batch(batch);}catch{
    const receipt=await env.DB.prepare('SELECT session_hash,payload_hash,result FROM mutation_receipts WHERE request_id=?').bind(requestId).first<{session_hash:string;payload_hash:string;result:string}>();
    if(receipt?.session_hash===current.token_hash&&receipt.payload_hash===payloadHash)return JSON.parse(receipt.result);
    throw new ApiError('ข้อมูลคณะทำงานเปลี่ยนระหว่างบันทึก กรุณาโหลดล่าสุด',409,'REVISION_CONFLICT');
  }
  return result;
}
