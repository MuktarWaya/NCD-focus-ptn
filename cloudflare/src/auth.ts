import { ApiError, clean, STAFF, type Session } from './types.ts';

export async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function equalSecret(a: string, b: string): Promise<boolean> {
  const [x,y] = await Promise.all([hash(a),hash(b)]);
  const encoder=new TextEncoder();
  return crypto.subtle.timingSafeEqual(encoder.encode(x),encoder.encode(y));
}
export function cookie(token: string, request: Request, expire = false): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `ncd_session=${token}; HttpOnly; SameSite=Strict; Path=/${secure}; Max-Age=${expire ? 0 : 43200}`;
}
async function verifyPassword(request: Request, env: Env, passcode: unknown, adminOnly=false): Promise<boolean> {
  if (!env.API_PASSCODE) throw new ApiError('ระบบยังไม่ได้ตั้งค่ารหัสผ่าน',503,'NOT_CONFIGURED');
  if(adminOnly&&!env.ADMIN_PASSCODE)throw new ApiError('ยังไม่ได้ตั้งค่ารหัสแอดมิน',503,'NOT_CONFIGURED');
  const key = await hash((adminOnly?'admin:':'login:')+(request.headers.get('CF-Connecting-IP') || 'local'));
  const now = Date.now();
  const attempt = await env.DB.prepare('SELECT attempts,expires_at FROM login_attempts WHERE key=?').bind(key).first<{attempts:number;expires_at:number}>();
  if (attempt && attempt.expires_at > now && attempt.attempts >= 10) throw new ApiError('ลองรหัสผ่านหลายครั้ง กรุณารอ 15 นาที',429,'RATE_LIMIT');
  const input=String(passcode??'');
  const admin=!!env.ADMIN_PASSCODE&&await equalSecret(input,env.ADMIN_PASSCODE);
  const user=!adminOnly&&await equalSecret(input,env.API_PASSCODE);
  if (!(admin||user)) {
    await env.DB.prepare('INSERT INTO login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at>? THEN attempts+1 ELSE 1 END,expires_at=excluded.expires_at').bind(key,now+900000,now).run();
    throw new ApiError('รหัสผ่านไม่ถูกต้อง',401,'INVALID_LOGIN');
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE key=?').bind(key).run();
  return admin;
}
export async function login(request: Request, env: Env, passcode: unknown): Promise<{token:string;admin:boolean}> {
  const admin=await verifyPassword(request,env,passcode);
  const now=Date.now();const token = crypto.randomUUID()+crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions(token_hash,worker,expires_at,admin_expires_at) VALUES(?,?,?,?)').bind(await hash(token),admin?STAFF:'',now+43200000,admin?now+1800000:0)
  ]);
  return {token,admin};
}
export const adminActive=(current:Session)=>Number(current.admin_expires_at||0)>Date.now();
export function assertAdmin(current:Session):void{if(!adminActive(current))throw new ApiError('กรุณายืนยันรหัสแอดมินอีกครั้ง',403,'ADMIN_REQUIRED');}
export async function elevateAdmin(request:Request,env:Env,current:Session,passcode:unknown):Promise<number>{
  await verifyPassword(request,env,passcode,true);const until=Date.now()+1800000;
  await env.DB.prepare('UPDATE sessions SET admin_expires_at=?,worker=? WHERE token_hash=?').bind(until,STAFF,current.token_hash).run();return until;
}
export async function session(request: Request, env: Env): Promise<Session> {
  const token = /(?:^|;\s*)ncd_session=([^;]+)/.exec(request.headers.get('Cookie') || '')?.[1];
  if (!token) throw new ApiError('กรุณาเข้าสู่ระบบใหม่',401,'SESSION_EXPIRED');
  const row = await env.DB.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token),Date.now()).first<Session>();
  if (!row) throw new ApiError('หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่',401,'SESSION_EXPIRED');
  return row;
}
export function assertWorkspace(current: Session, requested: unknown): void {
  if (!current.worker || clean(requested) !== current.worker) throw new ApiError('ชื่อคณะทำงานในแท็บนี้ไม่ตรงกับการเชื่อมต่อล่าสุด กรุณาเลือกชื่ออีกครั้ง',409,'WORKSPACE_CHANGED');
}
