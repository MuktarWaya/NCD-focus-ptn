const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const api = require('../ncd-export');
const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
const options = { village: 'ชุมชนทดสอบ', round: 'W12', tambon: 'ตำบลทดสอบ', district: 'อำเภอทดสอบ', province: 'ปัตตานี', dateText: '14/10/2569' };
const target = (id, type = 'กลุ่มเสี่ยง') => ({ id, name: `ทดสอบ ${id}`, village: options.village, type, address: '001/2', age: 55, height: 160, chronic_disease: 'DM', co_morbidity: 'HT', onset_year: '2555', medicines: '=ข้อความยาทดสอบ' });
const log = id => ({ target_id: id, quarter: 'W12', weight: 60, bmi: 23.44, waist: 80, dtx: 100, bp: '120/80', body_fat: 20, muscle_mass: 30, visceral_fat: 5, body_age: 50, hba1c: 6, egfr: 90, creatinine: .8, triglyceride: 100, ldl: 90, cholesterol: 180, report_exercise_minutes: 0, food_overeat: 'no', food_unhealthy: 'yes', food_habit: 'อาหารทดสอบ', remark: 'หมายเหตุทดสอบ', veggie_fruit: 0, depression_2q: 'no', sleep: 'high', smoking: 'no', alcohol: 'no', risk_category: 'DM' });

test('exports only selected village and exact round and keeps people without a result', () => {
    const r = api.buildReport([target(1), target(2, 'กลุ่มป่วย'), { ...target(3), village: 'อื่น' }], [log(1), { ...log(2), quarter: 'W0' }, log(3)], options);
    assert.equal(r.total, 2); assert.equal(r.missingRecords, 1); assert.equal(r.incompleteBehavior, 1);
    assert.equal(r.patient[0].values[8], null); assert.equal(r.patient[0].values[17], null);
    assert.equal(r.risk[0].values.length, 30); assert.equal(r.patient[0].values.length, 39);
    assert.equal(r.risk[0].values[2], '001/2');
    assert.equal(r.risk[0].values[16], '✓'); assert.equal(r.risk[0].values[21], 0);
    assert.equal(r.counts.DM, 1);
});
test('all template columns receive the intended fields for a patient', () => {
    const v = api.rowValues(target(1, 'กลุ่มป่วย'), log(1), 0, true);
    assert.deepEqual(v.slice(0, 17), [1, 'ทดสอบ 1', 55, 'DM', 'HT', '2555', '=ข้อความยาทดสอบ', 160, 60, 23.44, 80, 100, '120/80', 20, 30, 5, 50]);
    assert.deepEqual(v.slice(17, 23), [6, 90, .8, 100, 90, 180]);
    assert.deepEqual(v.slice(23), [null, null, '✓', 'ไม่มี', 'มี', 'อาหารทดสอบ', 'หมายเหตุทดสอบ', 0, null, '✓', null, '✓', null, '✓', null, '✓']);
});
test('blank and zero differ and exercise thresholds include zero and 150', () => {
    assert.equal(api.number(''), null); assert.equal(api.number(null), null); assert.equal(api.number(' '), null);
    assert.equal(api.number(0), 0); assert.equal(api.exerciseCategory({ report_exercise_minutes: 0 }), 'none');
    assert.equal(api.exerciseCategory({ report_exercise_minutes: 149 }), 'low');
    assert.equal(api.exerciseCategory({ report_exercise_minutes: 150 }), 'high');
    assert.equal(api.exerciseCategory({}), '');
});
test('maps known legacy categories but never replaces missing or unknown assessments with no', () => {
    assert.equal(api.normalize('food_overeat', 'N'), 'no'); assert.equal(api.normalize('smoking', 'สูบ'), 'yes');
    assert.equal(api.exerciseCategory({ physical_activity: '>= 150 นาที' }), 'high');
    const v = api.rowValues(target(1), { smoking: 'ไม่ทราบ', sleep: 'unknown' }, 0, false);
    assert.deepEqual(v.slice(22), Array(8).fill(null));
    assert.equal(api.buildReport([target(1)], [], options).unclassified, 1);
});
test('does not infer risk diagnoses from glucose, blood pressure or the latest other round', () => {
    const r = api.buildReport([target(1)], [{ ...log(1), risk_category: '', dtx: 300, bp: '180/110' }, { ...log(1), quarter: 'W24', risk_category: 'DM + HT' }], options);
    assert.equal(r.unclassified, 1); assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), 0);
});
test('stops on duplicate results, duplicate IDs, invalid group and invalid selection', () => {
    assert.throws(() => api.buildReport([target(1)], [log(1), log(1)], options), /ซ้ำ/);
    assert.throws(() => api.buildReport([target(1), target(1)], [], options), /ซ้ำ/);
    assert.throws(() => api.buildReport([target(1, '')], [], options), /กลุ่ม/);
    assert.throws(() => api.buildReport([], [], { ...options, village: 'all' }), /ชุมชน/);
    assert.throws(() => api.buildReport([], [], { ...options, round: 'W13' }), /รอบ/);
});
test('round-trips 0, 1, 23, 24 and 50 people on both sheets, preserves headers/styles and moves summary', async () => {
    const template = fs.readFileSync(require.resolve('../templates/ncd-community.xlsx'));
    for (const count of [0, 1, 23, 24, 50]) {
        const targets = Array.from({ length: count * 2 }, (_, i) => target(i + 1, i < count ? 'กลุ่มเสี่ยง' : 'กลุ่มป่วย'));
        const records = targets.map(t => log(t.id));
        const report = api.buildReport(targets, records, options);
        const workbook = await api.createWorkbook(ExcelJS, template, report);
        const bytes = await workbook.xlsx.writeBuffer();
        const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(bytes);
        const extra = Math.max(0, count - 23);
        for (const name of ['กลุ่มเสี่ยง', 'กลุ่มป่วย']) {
            const s = reopened.getWorksheet(name);
            assert.equal(s.getCell('B2').value, 'ชื่อ-สกุล'); assert.match(s.getCell('A1').value, /W12/);
            assert.equal(s.getCell(name === 'กลุ่มเสี่ยง' ? 'O3' : 'X3').value, '≥ 150 นาที');
            assert.equal(s.getRow(3).getCell(1).master.address, 'A2');
            if (count) {
                assert.equal(s.getCell('A4').value, 1); assert.equal(s.getCell(count + 3, 1).value, count);
                assert.ok(s.getCell(count + 3, 2).border.bottom); assert.equal(s.getCell('B4').font.name, 'TH SarabunPSK');
            } else assert.equal(s.getCell('A4').value, null);
        }
        assert.equal(reopened.getWorksheet('กลุ่มเสี่ยง').getCell(28 + extra, 5).value, count);
        assert.equal(reopened.getWorksheet('กลุ่มเสี่ยง').getCell(35 + extra, 5).value, 0);
        if (count) {
            const medicine = reopened.getWorksheet('กลุ่มป่วย').getCell('G4');
            assert.equal(typeof medicine.value, 'string'); assert.equal(medicine.value, '=ข้อความยาทดสอบ');
        }
        if (count === 50 && process.env.NCD_WRITE_QA === '1') {
            fs.mkdirSync('artifacts/superpowers/ncd-qa', { recursive: true });
            fs.writeFileSync('artifacts/superpowers/ncd-qa/synthetic-community.xlsx', bytes);
        }
    }
});
