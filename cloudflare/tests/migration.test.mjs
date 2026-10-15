import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixtures,SqliteD1} from './helpers.mjs';
import {validate,importSQL,reconcile} from '../scripts/migration.mjs';
test('migration is exact, rerunnable before cutover and excludes unrelated secret tabs',()=>{
  const snapshot={...structuredClone(fixtures),snapshotId:'test'};const DB=new SqliteD1();
  DB.sqlite.exec(importSQL(snapshot));DB.sqlite.exec(importSQL(snapshot));
  const read=table=>DB.sqlite.prepare(`SELECT document FROM ${table} ORDER BY id`).all().map(r=>JSON.parse(r.document));
  const actual={targets:read('targets'),quarterly:read('tracking_records'),dailyLogs:read('daily_logs_legacy'),workers:DB.sqlite.prepare('SELECT name FROM workers ORDER BY ordinal').all().map(r=>r.name)};
  assert.equal(reconcile(snapshot,actual).checks.quarterly,true);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM source_archive WHERE source_key='ชีต5'").get().n,0);
  DB.sqlite.exec("INSERT INTO audit_log(request_id,actor,action) VALUES('later','a','write')");
  assert.throws(()=>DB.sqlite.exec(importSQL(snapshot)));assert.equal(read('targets').length,2);
});
test('duplicate, orphan, invalid ID and unsupported rounds stop migration',()=>{
  for(const modify of [s=>s.targets.push(s.targets[0]),s=>s.quarterly.push({...s.quarterly[0],id:11}),s=>s.quarterly[0].target_id=999,s=>s.quarterly[0].id='bad',s=>s.quarterly[0].quarter='Qunknown']){
    const snapshot=structuredClone(fixtures);modify(snapshot);assert.throws(()=>validate(snapshot));
  }
});
test('published assets contain no source records, embedded password or legacy API',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');assert.doesNotMatch(app,/script\.google\.com|DEFAULT_API_PASSCODE\s*=\s*'[^']+'/);
  const files=fs.readdirSync(new URL('../public/',import.meta.url));for(const forbidden of ['data','env.txt','artifacts','backend','source-sheets.json'])assert.ok(!files.includes(forbidden));
  assert.match(app,/ncdTransport.beginQuarterly/);assert.match(app,/ncdTransport.beginTarget/);
});
