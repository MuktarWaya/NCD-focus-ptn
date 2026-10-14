(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ncd-export.js'):root.ncdExport);if(typeof module==='object'&&module.exports)module.exports=api;root.w0Completeness=api;})(globalThis,function(exp){
'use strict';
const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
const labels={name:'ชื่อในทะเบียน',type:'ประเภทกลุ่ม',address:'บ้านเลขที่',age:'อายุ',height:'ส่วนสูง',chronic_disease:'โรคประจำตัว',co_morbidity:'โรคร่วม',onset_year:'ปีที่ป่วย',medicines:'ยา',date:'วันที่ประเมิน',weight:'น้ำหนัก',bmi:'BMI',waist:'รอบเอว',dtx:'น้ำตาล DTX',bp:'ความดัน',body_fat:'ไขมันร่างกาย',muscle_mass:'มวลกล้ามเนื้อ',visceral_fat:'ไขมันช่องท้อง',body_age:'อายุร่างกาย',hba1c:'HbA1c',egfr:'eGFR',creatinine:'Creatinine',triglyceride:'Triglyceride',ldl:'LDL',cholesterol:'Cholesterol',physical_activity:'กิจกรรมทางกาย',food_overeat:'กินเยอะ / กินเกิน',food_unhealthy:'กินไม่ถูกต้อง',food_habit:'พฤติกรรมการกิน',veggie_fruit:'ผักและผลไม้',depression_2q:'คัดกรอง 2Q',sleep:'การนอน',smoking:'บุหรี่',alcohol:'แอลกอฮอล์',risk_category:'ประเภทความเสี่ยง'};
const labs=['hba1c','egfr','creatinine','triglyceride','ldl','cholesterol'];
function inspect(target,records){
 const missing=[],review=[];const logs=records.filter(r=>String(r.target_id)===String(target.id));const w0=logs.filter(r=>clean(r.quarter)==='W0');
 const check=(obj,key,numeric=false,zero=false)=>{if(!exp.hasValue(obj[key]))missing.push(labels[key]);else if(numeric&&(exp.number(obj[key])===null||exp.number(obj[key])<(zero?0:Number.MIN_VALUE)))review.push(labels[key]);};
 ['name','age','height'].forEach(k=>check(target,k,['age','height'].includes(k)));
 if(!['กลุ่มเสี่ยง','กลุ่มป่วย'].includes(target.type))review.push(labels.type);
 if(target.type==='กลุ่มเสี่ยง')check(target,'address');
 if(target.type==='กลุ่มป่วย')['chronic_disease','co_morbidity','onset_year','medicines'].forEach(k=>check(target,k));
 if(w0.length){const r=w0[0];if(w0.length>1)review.push('ผล W0 ซ้ำ');check(r,'date');if(exp.hasValue(r.date)&&!validDate(r.date))review.push(labels.date);
 ['weight','bmi','waist','dtx','body_fat','muscle_mass','visceral_fat','body_age'].forEach(k=>check(r,k,true));check(r,'bp');if(exp.hasValue(r.bp)&&!/^\s*[1-9]\d*(?:\.\d+)?\s*\/\s*[1-9]\d*(?:\.\d+)?\s*$/.test(String(r.bp)))review.push(labels.bp);
 if(!exp.exerciseCategory(r)){(exp.hasValue(r.physical_activity)||exp.hasValue(r.report_exercise_minutes)?review:missing).push(labels.physical_activity);}
 if(exp.hasValue(r.report_exercise_minutes)&&(exp.number(r.report_exercise_minutes)===null||exp.number(r.report_exercise_minutes)<0||exp.number(r.report_exercise_minutes)>10080))review.push('นาทีออกกำลังกาย');
 ['food_overeat','food_unhealthy','depression_2q','smoking','alcohol','sleep'].forEach(k=>{if(!exp.hasValue(r[k]))missing.push(labels[k]);else if(!(k==='sleep'?['low','high']:['yes','no']).includes(exp.normalize(k,r[k])))review.push(labels[k]);});
 check(r,'food_habit');check(r,'veggie_fruit',true,true);if(exp.number(r.veggie_fruit)>100)review.push(labels.veggie_fruit);
 if(target.type==='กลุ่มเสี่ยง'){check(r,'risk_category');if(exp.hasValue(r.risk_category)&&!exp.RISK_CATEGORIES.includes(r.risk_category))review.push(labels.risk_category);}
 if(target.type==='กลุ่มป่วย')labs.forEach(k=>check(r,k,true));
 }
 return {status:!logs.length?'red':!w0.length||missing.length||review.length?'yellow':'green',missing:[...new Set(missing)],review:[...new Set(review)],hasW0:!!w0.length,legacy:!w0.length&&logs.some(r=>clean(r.quarter)==='M0'),other:!w0.length&&!!logs.length};
}
function validDate(v){const s=clean(v);const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)||s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);if(!m)return false;let y,month,d;if(s.includes('/'))[,d,month,y]=m;else[,y,month,d]=m;y=Number(y);if(y>2400)y-=543;const date=new Date(y,Number(month)-1,Number(d));return date.getFullYear()===y&&date.getMonth()===Number(month)-1&&date.getDate()===Number(d);}
function build(targets,records,workers,filters={}){
 const ids=new Set();targets.forEach(t=>{if(!clean(t.id)||ids.has(String(t.id)))throw Error('รหัสรายบุคคลขาดหรือซ้ำ กรุณาตรวจทะเบียนก่อนสรุป');ids.add(String(t.id));});
 const directory=new Set(workers.map(clean));const groups=new Map();
 targets.filter(t=>!filters.village||clean(t.village)===filters.village).forEach(t=>{const name=clean(t.responsible_worker)||'ยังไม่ระบุคณะทำงาน';if(filters.worker&&name!==filters.worker)return;let g=groups.get(name);if(!g){g={name,total:0,green:0,yellow:0,red:0,noW0:0,legacy:0,other:0,missing:{},review:{},needsCoordinator:!directory.has(name)||name==='ทดสอบ'};groups.set(name,g);}const p=inspect(t,records);g.total++;g[p.status]++;if(!p.hasW0)g.noW0++;if(p.legacy)g.legacy++;else if(p.other)g.other++;p.missing.forEach(k=>{g.missing[k]=(g.missing[k]||0)+1;});p.review.forEach(k=>{g.review[k]=(g.review[k]||0)+1;});});
 const rows=[...groups.values()].map(g=>({...g,status:g.green===g.total?'green':g.red===g.total?'red':'yellow'})).filter(g=>!filters.status||g.status===filters.status).sort((a,b)=>a.name.localeCompare(b.name,'th'));
 return {rows,totals:rows.reduce((a,g)=>{['total','green','yellow','red'].forEach(k=>a[k]+=g[k]);return a;},{total:0,green:0,yellow:0,red:0})};
}
function reminder(g,community,time){const list=obj=>Object.entries(obj).map(([k,n])=>`• ${k}: ${n} คน`).join('\n');return `เรียน ${g.name}\nติดตามข้อมูลรอบเริ่มต้น W0: ${community}\nข้อมูลอ่านล่าสุด ${time}\nรับผิดชอบ ${g.total} คน\n🟢 ครบ ${g.green} คน 🟡 บางส่วน ${g.yellow} คน 🔴 ยังไม่มีผลติดตาม ${g.red} คน\nยังไม่มี W0 ${g.noW0} คน${g.legacy?` (มี M0 เดิม ${g.legacy} คน กรุณาตรวจรอบก่อนกรอกซ้ำ)`:''}${g.other?` / มีรอบอื่น ${g.other} คน`:''}\n${Object.keys(g.missing).length?`ข้อมูลที่ขาด:\n${list(g.missing)}\n`:''}${Object.keys(g.review).length?`ค่าที่ต้องตรวจต้นทาง:\n${list(g.review)}\n`:''}${g.needsCoordinator?'กรุณาให้ผู้ประสานงานตรวจชื่อผู้รับผิดชอบกับทะเบียนคณะทำงาน\n':''}ขอความร่วมมือเติมข้อมูลตามผลประเมินจริง ช่องพฤติกรรมบางรายการเพิ่งเพิ่ม หากผลแล็บยังไม่มี ขอให้ประสานผลเดิมหรือแจ้งสถานะ\nจำนวนแต่ละหัวข้ออาจซ้ำคนกัน ไม่ควรนำมาบวกเป็นจำนวนคนทั้งหมด ขอบคุณค่ะ`;} 
return {inspect,build,reminder,validDate};
});
