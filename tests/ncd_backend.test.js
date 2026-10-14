const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
function sheet(initial) {
    const rows = initial.map(r => [...r]);
    return {
        rows,
        getLastColumn: () => Math.max(...rows.map(r => r.length)),
        getLastRow: () => rows.length,
        getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); },
        getRange(r, c, nr = 1, nc = 1) {
            return {
                getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r + i - 1]?.[c + j - 1] ?? '')),
                getValue: () => rows[r - 1]?.[c - 1] ?? '',
                setValues(values) { values.forEach((row, i) => row.forEach((v, j) => {
                    if (!rows[r + i - 1]) rows[r + i - 1] = [];
                    rows[r + i - 1][c + j - 1] = v;
                })); },
                setValue(v) { this.setValues([[v]]); }
            };
        },
        appendRow(row) { rows.push([...row]); }
    };
}
function backend() {
    const context = vm.createContext({ console });
    vm.runInContext(fs.readFileSync(require.resolve('../backend/gas_backend.js'), 'utf8'), context);
    vm.runInContext('successResponse = data => ({success: true, data}); errorResponse = error => ({success: false, error}); notifyRecordEvent_ = () => {};', context);
    const q = sheet([['id', 'target_id', 'quarter', 'date', 'weight', 'food_habit', 'smoking', 'hba1c'], [1, 1, 'W0', '1/1/2026', 60, 'ข้อมูลเดิม', 'ไม่สูบ', 6]]);
    const t = sheet([['id', 'type'], [1, 'กลุ่มเสี่ยง']]);
    const ss = { getSheetByName: name => name === 'QuarterlyData' ? q : name === 'Targets' ? t : null };
    return { context, q, ss, records: () => context.getSheetData(q) };
}
test('appends missing report headers once without moving existing data', () => {
    const b = backend();
    const payload = { target_id: 1, quarter: 'W0', date: '14/10/2026', report_exercise_minutes: 0, veggie_fruit: 0, report_sleep_hours: 7, sleep: 'high', risk_category: 'HT' };
    assert.equal(b.context.addQuarterly(b.ss, payload).success, true);
    const headers = [...b.q.rows[0]];
    assert.equal(b.context.addQuarterly(b.ss, payload).success, true);
    assert.deepEqual(b.q.rows[0], headers); assert.equal(new Set(headers).size, headers.length);
    const row = b.records()[0];
    assert.equal(row.food_habit, 'ข้อมูลเดิม'); assert.equal(row.smoking, 'ไม่สูบ'); assert.equal(row.hba1c, 6);
    assert.equal(row.report_exercise_minutes, 0); assert.equal(row.veggie_fruit, 0); assert.equal(row.risk_category, 'HT');
});
test('explicit clearing differs from omitted fields and survives readback', () => {
    const b = backend();
    b.context.addQuarterly(b.ss, { target_id: 1, quarter: 'W0', food_habit: '', smoking: '' });
    assert.equal(b.records()[0].food_habit, ''); assert.equal(b.records()[0].smoking, '');
    assert.equal(b.records()[0].weight, 60);
});
test('validates W0 new assessments and rejects invalid values before a data write', () => {
    const b = backend();
    for (const invalid of [{ veggie_fruit: -1 }, { report_sleep_hours: 25 }, { report_exercise_minutes: 'bad' }, { smoking: 'maybe' }, { risk_category: 'INVALID' }]) {
        const result = b.context.addQuarterly(b.ss, { target_id: 1, quarter: 'W0', ...invalid });
        assert.equal(result.success, false); assert.equal(b.records()[0].food_habit, 'ข้อมูลเดิม');
    }
    assert.equal(b.context.validateTrackingData_({ quarter: 'W0', report_sleep_hours: 0, smoking: 'no', veggie_fruit: '' }), '');
});
test('stores new reports in W2 and omits laboratories outside lab rounds', () => {
    const b = backend();
    const payload = { target_id: 1, quarter: 'W2', date: '14/10/2026', smoking: 'yes', hba1c: 9, food_habit: 'ผลประเมินใหม่' };
    for (const week of [1, 2]) Object.assign(payload, { [`week${week}_exercise_minutes`]: 150, [`week${week}_healthy_menu_days`]: 5, [`week${week}_sleep_avg`]: 7, [`week${week}_avoid_sweet`]: 4, [`week${week}_avoid_oil`]: 4, [`week${week}_avoid_salt`]: 4 });
    assert.equal(b.context.addQuarterly(b.ss, payload).success, true);
    const row = b.records().find(r => r.quarter === 'W2');
    assert.equal(row.smoking, 'yes'); assert.equal(row.food_habit, 'ผลประเมินใหม่'); assert.equal(row.hba1c, '');
    assert.equal(b.records()[0].food_habit, 'ข้อมูลเดิม');
});
test('writes free-text food assessments as literals when text starts with equals', () => {
    const b = backend();
    b.context.addQuarterly(b.ss, { target_id: 1, quarter: 'W0', food_habit: '=ข้อความทดสอบ' });
    assert.equal(b.records()[0].food_habit, "'=ข้อความทดสอบ");
});
