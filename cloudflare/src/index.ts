import { cookie, login, session } from './auth.ts';
import { read, mutate, isWrite, workspaceChoices, assertWorkspace } from './api.ts';
import { ApiError, clean, STAFF, type Document } from './types.ts';
import { enqueueDaily, flushOutbox } from './notifications.ts';

function json(body:unknown,status=200,headers:HeadersInit={}):Response{
  return Response.json(body,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
}
async function boundedBody(request:Request):Promise<Record<string,unknown>>{
  if(Number(request.headers.get('Content-Length')||0)>98304)throw new ApiError('ข้อมูลคำขอใหญ่เกินกำหนด',413);
  const reader=request.body?.getReader();if(!reader)throw new ApiError('ไม่พบข้อมูลคำขอ');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>98304){await reader.cancel();throw new ApiError('ข้อมูลคำขอใหญ่เกินกำหนด',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError('รูปแบบคำขอไม่ถูกต้อง');}
  if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new ApiError('รูปแบบคำขอไม่ถูกต้อง');
  return parsed as Record<string,unknown>;
}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api'))return env.ASSETS.fetch(request);
    if(url.pathname==='/api/health'&&request.method==='GET')return json({success:true,data:{service:'ncd-focus',backend:'cloudflare',environment:env.ENVIRONMENT}});
    if(url.pathname!=='/api'||request.method!=='POST')return json({success:false,error:'ไม่พบปลายทาง API'},404);
    try{
      const origin=request.headers.get('Origin');
      if((origin&&origin!==url.origin)||request.headers.get('X-NCD-Client')!=='1')throw new ApiError('คำขอไม่ผ่านการตรวจสอบแหล่งที่มา',403,'ORIGIN');
      const body=await boundedBody(request);const action=clean(body.action);
      const data=(body.data&&typeof body.data==='object'&&!Array.isArray(body.data)?body.data:{}) as Document;
      if(action==='login'){
        const token=await login(request,env,body.passcode);
        return json({success:true,data:{role:'user',backend:'cloudflare'}},200,{'Set-Cookie':cookie(token,request)});
      }
      const current=await session(request,env);
      if(action==='logout'){
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(current.token_hash).run();
        return json({success:true,data:{}},200,{'Set-Cookie':cookie('',request,true)});
      }
      if(action==='selectWorker'){
        const name=clean(data.worker);
        if(!name||![STAFF,...await workspaceChoices(env)].includes(name))throw new ApiError('ไม่พบชื่อคณะทำงาน');
        await env.DB.prepare('UPDATE sessions SET worker=? WHERE token_hash=?').bind(name,current.token_hash).run();
        return json({success:true,data:{worker:name}});
      }
      if(isWrite(action)||action==='getTargetDetail')assertWorkspace(current,body.worker);
      const result=isWrite(action)?await mutate(action,data,String(body.requestId||''),body.expectedRevision,env,current):await read(action,data,env,current);
      return json({success:true,data:result});
    }catch(error){
      if(error instanceof ApiError)return json({success:false,error:error.message,code:error.code},error.status);
      // Do not log request bodies, SQL errors, tokens or patient values.
      console.error(JSON.stringify({event:'api_failure',path:url.pathname}));
      return json({success:false,error:'ระบบไม่สามารถยืนยันผลคำขอได้ กรุณาตรวจรายการก่อนบันทึกซ้ำ',code:'SERVER_ERROR'},500);
    }
  },
  async scheduled(controller:ScheduledController,env:Env,ctx:ExecutionContext):Promise<void>{
    ctx.waitUntil((async()=>{
      if(controller.cron==='0 0 * * *')await enqueueDaily(env);
      await flushOutbox(env);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()),
        env.DB.prepare('DELETE FROM login_attempts WHERE expires_at<?').bind(Date.now())
      ]);
    })());
  }
} satisfies ExportedHandler<Env>;
