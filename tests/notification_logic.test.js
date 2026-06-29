const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const backendPath = path.join(__dirname, '..', 'backend', 'gas_backend.js');
const code = fs.readFileSync(backendPath, 'utf8');
const context = {
  console,
  PropertiesService: {
    getScriptProperties() {
      return { getProperty: () => '' };
    },
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) {
      return { text, setMimeType() { return this; } };
    },
  },
};

vm.createContext(context);
vm.runInContext(code, context);

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    console.error(err.stack || err.message);
    process.exitCode = 1;
  }
}

const targets = [
  { id: 1, name: 'คนที่หนึ่ง', village: 'หมู่ 2 บ้านตรัง', responsible_worker: 'อสม.เอ', type: 'กลุ่มเสี่ยง' },
  { id: 2, name: 'คนที่สอง', village: 'หมู่ 2 บ้านตรัง', responsible_worker: 'อสม.บี', type: 'กลุ่มเสี่ยง' },
  { id: 3, name: 'คนที่สาม', village: 'หมู่ 3 บ้านเขาวัง', responsible_worker: 'อสม.ซี', type: 'กลุ่มเสี่ยง' },
  { id: 4, name: 'คนนอกพื้นที่', village: 'หมู่ 1 บ้านบองอ', responsible_worker: 'อสม.ดี', type: 'กลุ่มเสี่ยง' },
];

const quarterly = [
  { target_id: 2, quarter: 'M0', dtx: 180, bp: '150/90' },
];

test('daily summary lists only active-village targets without any quarterly record as pending', () => {
  const summary = context.buildDailyNotificationSummaryFromData_(targets, quarterly, []);

  assert.strictEqual(summary.totalTargets, 3);
  assert.strictEqual(summary.followed, 1);
  assert.strictEqual(summary.pending.length, 2);
  assert.strictEqual(JSON.stringify(summary.pending.map((item) => item.name)), JSON.stringify(['คนที่หนึ่ง', 'คนที่สาม']));
  assert.ok(!summary.pending.some((item) => item.name === 'คนนอกพื้นที่'));
});

test('telegram daily message includes counts and pending names but omits detailed clinical values', () => {
  const summary = context.buildDailyNotificationSummaryFromData_(targets, quarterly, []);
  const message = context.buildDailyTelegramMessage_(summary, new Date('2026-06-29T00:30:00Z'));

  assert.match(message, /NCD Focus PTN/);
  assert.match(message, /ค้างติดตาม 2 คน/);
  assert.match(message, /คนที่หนึ่ง/);
  assert.match(message, /อสม\.เอ/);
  assert.doesNotMatch(message, /180/);
  assert.doesNotMatch(message, /150\/90/);
  assert.doesNotMatch(message, /DTX|BP|HbA1c/i);
});
