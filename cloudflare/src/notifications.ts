import { buildDailyNotificationSummaryFromData_, buildRecordEventTelegramMessage_ } from './rules.mjs';
import { type Document, type StoredRow } from './types.ts';

export function eventMessage(action: string, target: Document, data: Document, before?:Document): string {
  return buildRecordEventTelegramMessage_(action,target,data,before);
}
export async function enqueueDaily(env: Env): Promise<void> {
  if(String(env.NOTIFICATIONS_ENABLED)!=='true')return;
  const results=await env.DB.batch<StoredRow>([env.DB.prepare('SELECT * FROM targets ORDER BY id'),env.DB.prepare('SELECT * FROM tracking_records ORDER BY id')]);
  const summary=buildDailyNotificationSummaryFromData_(results[0].results.map(r=>JSON.parse(r.document)),results[1].results.map(r=>JSON.parse(r.document)),[]);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',dateStyle:'short'}).format(new Date());
  const message=['NCD Focus PTN - สรุปประจำวัน '+date,`กลุ่มเป้าหมาย ${summary.totalTargets} คน`, `มีผลติดตาม ${summary.followed} คน`, `ค้างติดตาม ${summary.pendingCount} คน`,`ต้องติดตามสุขภาพ ${summary.urgentCount} คน`,
    ...summary.villageSummary.map((v:{village:string;total:number;pending:number})=>`${v.village}: ทั้งหมด ${v.total} ค้างติดตาม ${v.pending}`),
    ...summary.pending.slice(0,30).map((t:{name:string;village:string;responsible_worker:string})=>`ค้างติดตาม: ${t.name} | ${t.village} | ${t.responsible_worker}`),
    ...summary.urgent.slice(0,15).map((t:{name:string;village:string;responsible_worker:string})=>`ต้องติดตามสุขภาพ: ${t.name} | ${t.village} | ${t.responsible_worker}`),
    'หมายเหตุ: ไม่แสดงค่าตรวจสุขภาพละเอียด กรุณาเปิด Dashboard'].join('\n');
  await env.DB.prepare('INSERT OR IGNORE INTO notification_outbox(id,kind,message) VALUES(?,?,?)').bind('daily-'+date,'daily_summary',message).run();
}
export async function flushOutbox(env: Env): Promise<void> {
  if(String(env.NOTIFICATIONS_ENABLED)!=='true'||!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return;
  const now=Date.now();
  const rows=await env.DB.prepare("SELECT id,message,attempts FROM notification_outbox WHERE status='pending' AND next_attempt<=? AND lease_until<? ORDER BY created_at LIMIT 10").bind(now,now).all<{id:string;message:string;attempts:number}>();
  for(const row of rows.results){
    const claimed=await env.DB.prepare("UPDATE notification_outbox SET lease_until=? WHERE id=? AND status='pending' AND lease_until<?").bind(now+120000,row.id,now).run();
    if(!claimed.meta.changes)continue;
    try{
      // Outbox is durable; notification failure never changes the clinical save outcome.
      const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:row.message.slice(0,4000)}),signal:AbortSignal.timeout(10000)});
      const result=await response.json<{ok?:boolean}>();
      if(!response.ok||!result.ok)throw new Error('Telegram delivery failed');
      await env.DB.prepare("UPDATE notification_outbox SET status='sent',sent_at=?,lease_until=0,last_error=NULL WHERE id=?").bind(new Date().toISOString(),row.id).run();
    }catch{
      // Telegram has no idempotency key. Delivery is at-least-once; an ambiguous response can duplicate a message.
      await env.DB.prepare("UPDATE notification_outbox SET attempts=attempts+1,next_attempt=?,lease_until=0,last_error='Delivery not confirmed',status=? WHERE id=?").bind(now+Math.min(3600000,60000*2**row.attempts),row.attempts>=7?'failed':'pending',row.id).run();
    }
  }
}
