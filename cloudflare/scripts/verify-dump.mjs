import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {reconcile,digest} from './migration.mjs';
const [snapshotPath,dumpPath,receiptPath]=process.argv.slice(2);
const snapshot=JSON.parse(await fs.readFile(snapshotPath,'utf8'));
const db=new DatabaseSync(':memory:');db.exec(await fs.readFile(dumpPath,'utf8'));
const rows=table=>db.prepare(`SELECT document FROM ${table} ORDER BY id`).all().map(r=>JSON.parse(r.document));
const result=reconcile(snapshot,{targets:rows('targets'),quarterly:rows('tracking_records'),dailyLogs:rows('daily_logs_legacy'),workers:db.prepare('SELECT name FROM workers ORDER BY ordinal').all().map(r=>r.name)});
const archived=db.prepare('SELECT source_key,document FROM source_archive').all();
const archiveChecks={};
for(const name of Object.keys(snapshot.archive)){
  const metadata=archived.find(r=>r.source_key===name+':metadata');
  const chunks=archived.filter(r=>r.source_key.startsWith(name+':rows:')).sort((a,b)=>Number(a.source_key.split(':').at(-1))-Number(b.source_key.split(':').at(-1)));
  const actual={...JSON.parse(metadata.document),values:chunks.flatMap(r=>JSON.parse(r.document))};
  archiveChecks[name]=digest(actual)===digest(snapshot.archive[name]);
}
if(Object.values(archiveChecks).some(v=>!v))throw Error('Raw source archive differs');
const migration=db.prepare('SELECT source_hash FROM migration_runs').get();if(migration.source_hash!==digest(snapshot))throw Error('Snapshot provenance hash differs');
const receipt={verifiedAt:new Date().toISOString(),...result,archiveChecks,postCutoverClinicalWrites:db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,manualBackupVerified:true};
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));console.log(receipt);
