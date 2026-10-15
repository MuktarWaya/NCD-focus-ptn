import fs from 'node:fs/promises';
import crypto from 'node:crypto';
export const canonical=value=>JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
export const digest=value=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
export function validate(snapshot){
  const ids=new Set();for(const t of snapshot.targets){if(!Number.isSafeInteger(Number(t.id))||Number(t.id)<1||ids.has(String(t.id)))throw Error('Invalid or duplicate target ID');ids.add(String(t.id));}
  for(const [key,rows] of [['quarterly',snapshot.quarterly],['dailyLogs',snapshot.dailyLogs]]){
    const seen=new Set();const rounds=new Set();
    for(const r of rows){if(!ids.has(String(r.target_id)))throw Error('Orphan '+key);if(!Number.isSafeInteger(Number(r.id))||Number(r.id)<1||seen.has(String(r.id)))throw Error('Invalid or duplicate '+key+' ID');seen.add(String(r.id));
      if(key==='quarterly'){const pair=String(r.target_id)+'|'+String(r.quarter).trim();if(rounds.has(pair))throw Error('Duplicate person/round; requires explicit resolution');rounds.add(pair);if(!/^(W(?:0|2|4|6|8|10|12|14|16|18|20|22|24)|M[0369])$/.test(String(r.quarter).trim()))throw Error('Unknown round; review source');}
    }
  }
  return {targets:snapshot.targets.length,quarterly:snapshot.quarterly.length,dailyLogs:snapshot.dailyLogs.length,workers:snapshot.workers.length};
}
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
export function importSQL(snapshot){
  const counts=validate(snapshot);const sql=[];
  // Imports can be rerun only while still in migration; never overwrite active D1 clinical changes.
  sql.push("CREATE TABLE import_guard (ok INTEGER NOT NULL CHECK(ok=1));");
  sql.push("INSERT INTO import_guard SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM audit_log) THEN 1 ELSE 0 END;");
  sql.push("DELETE FROM tracking_records; DELETE FROM daily_logs_legacy; DELETE FROM targets; DELETE FROM workers; DELETE FROM source_archive; DELETE FROM migration_runs;");
  for(const t of snapshot.targets)sql.push(`INSERT INTO targets(id,worker,village,document) VALUES(${Number(t.id)},${q(String(t.responsible_worker||'ยังไม่ระบุคณะทำงาน').trim().replace(/\s+/g,' '))},${q(t.village||'')},${q(JSON.stringify(t))});`);
  for(const r of snapshot.quarterly)sql.push(`INSERT INTO tracking_records(id,target_id,quarter,document) VALUES(${Number(r.id)},${Number(r.target_id)},${q(String(r.quarter).trim())},${q(JSON.stringify(r))});`);
  for(const r of snapshot.dailyLogs)sql.push(`INSERT INTO daily_logs_legacy(id,target_id,document) VALUES(${Number(r.id)},${Number(r.target_id)},${q(JSON.stringify(r))});`);
  snapshot.workers.forEach((name,i)=>sql.push(`INSERT INTO workers(name,ordinal) VALUES(${q(name)},${i});`));
  // Only clinical/admin historical tables, never unrelated tabs containing bot tokens or secrets.
  for(const name of ['Targets','QuarterlyData','DailyLogs','OSM','NotificationLog'])if(snapshot.archive?.[name]){
    const sheet=snapshot.archive[name];
    const {values,...metadata}=sheet;
    sql.push(`INSERT INTO source_archive(source_key,document) VALUES(${q(name+':metadata')},${q(JSON.stringify(metadata))});`);
    for(let i=0;i<(values||[]).length;i+=10)sql.push(`INSERT INTO source_archive(source_key,document) VALUES(${q(name+':rows:'+i)},${q(JSON.stringify(values.slice(i,i+10)))});`);
  }
  sql.push(`INSERT INTO migration_runs(snapshot_id,source_hash,counts) VALUES(${q(snapshot.snapshotId)},${q(digest(snapshot))},${q(JSON.stringify(counts))});`);
  sql.push("UPDATE settings SET value='unverified' WHERE key='migration_state'; DROP TABLE import_guard;");
  return sql.join('\n');
}
export function reconcile(snapshot,actual){
  const checks={};
  for(const key of ['targets','quarterly','dailyLogs']){
    const strip=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='_revision'));
    const sorted=rows=>rows.map(strip).sort((a,b)=>Number(a.id)-Number(b.id));
    checks[key]=digest(sorted(snapshot[key]))===digest(sorted(actual[key]));
  }
  checks.workers=digest(snapshot.workers)===digest(actual.workers);
  if(Object.values(checks).some(v=>!v))throw Error('Migration reconciliation failed: '+JSON.stringify(checks));
  return {checks,counts:validate(snapshot),snapshotHash:digest(snapshot)};
}
export async function writeImport(snapshotPath,out){const snapshot=JSON.parse(await fs.readFile(snapshotPath,'utf8'));await fs.writeFile(out,importSQL(snapshot));console.log({generated:true,counts:validate(snapshot),hash:digest(snapshot)});}
if(process.argv[2]==='sql')await writeImport(process.argv[3],process.argv[4]);
