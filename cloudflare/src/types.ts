export type Cell = string | number | boolean | null;
export type Document = Record<string, Cell>;
export type StoredRow = { id: number; document: string; revision: number; worker?: string; village?: string; target_id?: number; quarter?: string };
export type Session = { token_hash: string; worker: string; expires_at: number; admin_expires_at?:number };
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'VALIDATION') { super(message); this.status = status; this.code = code; }
}
export const STAFF = '__staff_all__';
export const clean = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
export const owner = (d: Document) => clean(d.responsible_worker) || 'ยังไม่ระบุคณะทำงาน';
export const unpack = (r: StoredRow): Document => ({ ...JSON.parse(r.document), _revision: r.revision });
export function id(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new ApiError('รหัสข้อมูลไม่ถูกต้อง');
  return n;
}
