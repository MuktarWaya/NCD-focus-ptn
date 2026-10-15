const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('browser saves and reopens assessments, then exports fresh data on desktop and mobile', { skip: !process.env.NCD_QA_NODE_MODULES, timeout: 120000 }, async () => {
    const { chromium } = require(path.join(process.env.NCD_QA_NODE_MODULES, 'playwright'));
    const ExcelJS = require('../vendor/exceljs-4.4.0.min.js');
    const backend = vm.createContext({ console });
    vm.runInContext(fs.readFileSync(require.resolve('../backend/gas_backend.js'), 'utf8'), backend);
    vm.runInContext('successResponse = data => ({success: true, data}); errorResponse = error => ({success: false, error}); notifyRecordEvent_ = () => {};', backend);
    const targets = [
        { id: 1, name: 'ทดสอบ ผู้ป่วย', type: 'กลุ่มป่วย', village: 'หมู่ 2 บ้านตรัง', age: 50, height: 160, address: '001/2', chronic_disease: 'DM', co_morbidity: '', onset_year: '2560', medicines: 'ยาทดสอบ', responsible_worker: 'อสม.ทดสอบ' },
        { id: 2, name: 'ทดสอบ กลุ่มเสี่ยง', type: 'กลุ่มเสี่ยง', village: 'หมู่ 2 บ้านตรัง', age: 45, height: 170, address: '002/3', chronic_disease: '', responsible_worker: 'อสม.ทดสอบ' },
        { id: 3, name: 'ทดสอบ ชุมชนอื่น', type: 'กลุ่มเสี่ยง', village: 'หมู่ 3 บ้านเขาวัง', age: 40, height: 160 },
        { id: 4, responsible_worker:'อสม.ทดสอบ', name: 'ทดสอบ ยังไม่มีผล', type: 'กลุ่มเสี่ยง', village: 'หมู่ 2 บ้านตรัง', age: 40, height: 160 }
    ];
    const initial = [{ id: 1, target_id: 1, quarter: 'W0', date: '14/10/2026', weight: 60, bmi: 23.4, waist: 80, dtx: 100, bp: '120/80', body_fat: '', muscle_mass: '', visceral_fat: '', body_age: '', hba1c: 6 }];
    const headers = Object.keys(initial[0]);
    const rows = [headers, ...initial.map(r => headers.map(k => r[k]))];
    const q = {
        getLastColumn: () => Math.max(...rows.map(r => r.length)), getLastRow: () => rows.length,
        getDataRange() { return this.getRange(1, 1, rows.length, this.getLastColumn()); },
        getRange(r, c, nr = 1, nc = 1) {
            return {
                getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r + i - 1]?.[c + j - 1] ?? '')),
                getValue: () => rows[r - 1]?.[c - 1] ?? '',
                setValues(values) { values.forEach((row, i) => row.forEach((v, j) => { rows[r + i - 1] ||= []; rows[r + i - 1][c + j - 1] = v; })); },
                setValue(v) { this.setValues([[v]]); }
            };
        }, appendRow(row) { rows.push([...row]); }
    };
    backend.getTargetById_ = (_, id) => targets.find(t => t.id === Number(id));
    const ss = { getSheetByName: name => name === 'QuarterlyData' ? q : null };
    const records = () => backend.getSheetData(q);
    const browser = await chromium.launch({ headless: true, channel: process.env.NCD_QA_BROWSER || 'chrome' });
    const qa = path.resolve('artifacts/superpowers/ncd-qa'); fs.mkdirSync(qa, { recursive: true });
    const errors = [];
    const actions = [];
    let rejectBootstrap = false;
    let incompleteDetailOnce = true;
    let rejectDetail = false;
    try {
        const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
        await context.addInitScript(() => { sessionStorage.setItem('ncd_authenticated', 'true'); sessionStorage.setItem('ncd_selected_worker','อสม.ทดสอบ'); sessionStorage.setItem('ncd_role', 'admin'); });
        await context.route('https://script.google.com/**', async route => {
            const payload = route.request().postDataJSON();
            actions.push(payload.action);
            let result;
            if (payload.action === 'getBootstrapData') {
                if (rejectBootstrap) result = { success: false, error: 'ทดสอบการโหลดล้มเหลว' };
                else result = { success: true, data: { targets, quarterly: records(), workers: ['อสม.ทดสอบ'], ncdReportVersion: 1, dashboardStats: backend.computeDashboardStats_(targets, records(), ['อสม.ทดสอบ']) } };
            } else if (payload.action === 'getAllQuarterly') {
                result = {success:true,data:{quarterly:records(),ncdReportVersion:1}};
            } else if (payload.action === 'getTargetDetail') {
                const history = incompleteDetailOnce ? [] : records().filter(r => Number(r.target_id) === Number(payload.data.id));
                incompleteDetailOnce = false;
                result = { success: true, data: { profile: targets.find(t => t.id === Number(payload.data.id)), quarterly: history, dailyLogs: [] } };
                if (rejectDetail) result = {success:false,error:'ทดสอบอ่านประวัติไม่สำเร็จ'};
            } else if (payload.action === 'addQuarterly') result = backend.addQuarterly(ss, payload.data);
            else result = { success: false, error: 'unsupported test action' };
            await route.fulfill({ json: result, headers: { 'access-control-allow-origin': '*' } });
        });
        // Never allow a real production API request even if an endpoint changes.
        await context.route('**/macros/s/**', async route => {
            if (new URL(route.request().url()).hostname === 'script.google.com') return route.fallback();
            await route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', err => errors.push(err.message));
        await page.goto(process.env.NCD_QA_URL || 'http://127.0.0.1:8765', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => state.connectionReady && document.getElementById('form-report-smoking'));
        await page.evaluate(() => viewTargetProfile(1));
        assert.ok(actions.includes('getAllQuarterly'));
        assert.ok(!(await page.locator('#profile-snapshot').innerText()).includes('ยังไม่มีผลติดตาม'));
        await page.locator('.record-first-btn[data-round="W0"]').click();
        await page.locator('#quarterly-modal').waitFor({state:'visible'});
        assert.equal(await page.locator('#form-q-round').inputValue(),'W0');
        assert.equal(await page.locator('#form-q-weight').inputValue(),'60');
        assert.equal(await page.locator('#form-q-hba1c').inputValue(),'6');
        assert.equal(await page.locator('#form-q-date').inputValue(),'14/10/2026');
        assert.match(await page.locator('#form-q-history-status').innerText(),/ดึงประวัติ W0 เดิม/);
        assert.equal(await page.locator('#form-q-fat').inputValue(), '');
        await page.screenshot({path:path.join(qa,'resume-w0-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        await page.screenshot({path:path.join(qa,'resume-w0-mobile.png')});
        await page.setViewportSize({width:1440,height:1000});
        await page.locator('#form-report-report_exercise_minutes').fill('0');
        await page.locator('#form-report-food_overeat').selectOption('no');
        await page.locator('#form-report-food_unhealthy').selectOption('yes');
        await page.locator('#form-report-food_habit').fill('ประเมินอาหารทดสอบ');
        await page.locator('#form-report-veggie_fruit').fill('0');
        await page.locator('#form-report-depression_2q').selectOption('no');
        await page.locator('#form-report-report_sleep_hours').fill('7');
        await page.locator('#form-report-sleep').selectOption('high');
        await page.locator('#form-report-smoking').selectOption('no');
        await page.locator('#form-report-alcohol').selectOption('no');
        assert.equal(await page.locator('[data-report-key="risk_category"]').isVisible(), false);
        await page.locator('.report-assessment-section').screenshot({ path: path.join(qa, 'assessment-desktop.png') });
        await page.locator('#quarterly-form button[type="submit"]').click();
        await page.waitForFunction(() => document.getElementById('quarterly-modal').classList.contains('hidden'));
        assert.equal(records().filter(r=>r.target_id===1 && r.quarter==='W0').length,1);
        assert.equal(records()[0].food_habit, 'ประเมินอาหารทดสอบ'); assert.equal(records()[0].body_fat, '');
        await page.waitForFunction(() => document.querySelector('.report-profile-summary'));
        await page.locator('.nav-item[data-view="w0-tracking-view"]').click();
        assert.match(await page.locator('#w0-summary').innerText(),/ครบพฤติกรรม W0\s*1 คน/);
        await page.locator('.w0-members summary').click();
        await page.locator('[data-target-id="1"]').click();
        await page.locator('#profile-view').waitFor({state:'visible'});
        await page.locator('#btn-add-quarterly').click();
        await page.locator('#quarterly-modal').waitFor({state:'visible'});
        assert.equal(await page.locator('#form-q-round').inputValue(),'W0');
        assert.equal(await page.locator('#form-report-smoking').inputValue(), 'no');
        assert.equal(await page.locator('#form-report-veggie_fruit').inputValue(), '0');
        assert.equal(await page.locator('#form-report-food_habit').inputValue(), 'ประเมินอาหารทดสอบ');
        await page.locator('#form-q-round').selectOption('W2');
        assert.equal(await page.locator('#form-report-smoking').inputValue(), '');
        await page.locator('#form-q-round').selectOption('W12');
        assert.equal(await page.locator('#form-report-smoking').inputValue(), '');
        await page.locator('#form-q-round').selectOption('W0');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.report-assessment-section').screenshot({ path: path.join(qa, 'assessment-mobile.png') });
        await page.locator('#quarterly-modal .close-modal-btn').first().click();
        await page.waitForFunction(() => document.getElementById('quarterly-modal').classList.contains('hidden'));
        await page.locator('#back-to-list-btn').click();
        await page.locator('#targets-mobile-list .record-btn[data-id="2"]').click();
        await page.locator('#quarterly-modal').waitFor({state:'visible'});
        assert.equal(await page.locator('#form-q-target-id').inputValue(),'2');
        assert.equal(await page.locator('#form-q-weight').inputValue(),'');
        assert.equal(await page.locator('#form-report-food_habit').inputValue(),'');
        await page.locator('#form-q-round').selectOption('W12');
        assert.equal(await page.locator('[data-report-key="risk_category"]').isVisible(), true);
        for (const [id, value] of [['weight', '70'], ['waist', '90'], ['dtx', '110'], ['bp', '130/85']]) await page.locator(`#form-q-${id}`).fill(value);
        for (const week of [1, 2]) for (const [suffix, value] of [['exercise', '150'], ['menu', '5'], ['sleep', '7'], ['sweet', '4'], ['oil', '4'], ['salt', '4']]) await page.locator(`#form-q-w${week}-${suffix}`).fill(value);
        await page.locator('#form-report-risk_category').selectOption('DM + HT');
        await page.locator('#form-report-report_exercise_minutes').fill('150');
        await page.locator('#quarterly-form button[type="submit"]').click();
        await page.waitForFunction(() => document.getElementById('quarterly-modal').classList.contains('hidden'));
        assert.equal(records().find(r => r.target_id === 2 && r.quarter === 'W12').risk_category, 'DM + HT');
        await page.evaluate(() => switchView('registry-view'));
        await page.locator('#ncd-export-village').selectOption('หมู่ 2 บ้านตรัง');
        await page.locator('#ncd-export-round').selectOption('W0');
        await page.locator('#ncd-export-tambon').fill('ตำบลทดสอบ');
        await page.locator('#ncd-export-district').fill('อำเภอทดสอบ');
        await page.locator('#ncd-export-preview').click();
        assert.match(await page.locator('#ncd-export-status').textContent(), /กลุ่มเสี่ยง 2 คน \/ กลุ่มป่วย 1 คน/);
        assert.match(await page.locator('#ncd-export-status').textContent(), /พฤติกรรมยังไม่ครบ 2 คน/);
        await page.locator('#ncd-export-btn').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(qa, 'export-mobile.png') });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('.ncd-export-section').screenshot({ path: path.join(qa, 'export-desktop.png') });
        const bootstrapBefore = actions.filter(a => a === 'getBootstrapData').length;
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#ncd-export-btn').click();
        const download = await downloadPromise;
        const output = path.join(qa, 'browser-community.xlsx'); await download.saveAs(output);
        const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(fs.readFileSync(output));
        assert.equal(workbook.getWorksheet('กลุ่มป่วย').getCell('I4').value, 60);
        assert.equal(workbook.getWorksheet('กลุ่มป่วย').getCell('AC4').value, 'ประเมินอาหารทดสอบ');
        assert.equal(workbook.getWorksheet('กลุ่มป่วย').getCell('N4').value, null);
        assert.equal(workbook.getWorksheet('กลุ่มป่วย').getCell('AE4').value, 0);
        assert.equal(workbook.getWorksheet('กลุ่มป่วย').getCell('AK4').value, '✓');
        assert.equal(workbook.getWorksheet('กลุ่มเสี่ยง').getCell('B6').value, null);
        assert.ok(actions.filter(a => a === 'getBootstrapData').length > bootstrapBefore);
        await page.waitForFunction(() => !document.getElementById('ncd-export-btn').disabled);
        await page.locator('#ncd-export-round').selectOption('W12');
        const secondDownloadPromise = page.waitForEvent('download');
        await page.locator('#ncd-export-btn').click();
        const secondDownload = await secondDownloadPromise;
        const secondWorkbook = new ExcelJS.Workbook(); await secondWorkbook.xlsx.load(fs.readFileSync(await secondDownload.path()));
        assert.equal(secondWorkbook.getWorksheet('กลุ่มเสี่ยง').getCell('F4').value, 70);
        assert.equal(secondWorkbook.getWorksheet('กลุ่มเสี่ยง').getCell('E32').value, 1);
        assert.equal(secondWorkbook.getWorksheet('กลุ่มป่วย').getCell('I4').value, null);
        await page.waitForFunction(() => !document.getElementById('ncd-export-btn').disabled);
        await page.evaluate(() => toggleTheme());
        await page.locator('.ncd-export-section').screenshot({ path: path.join(qa, 'export-dark.png') });
        await page.evaluate(() => toggleTheme());
        await page.evaluate(() => { openQuarterlyModal(2); ncdReportUI.load({ veggie_fruit: 'ประมาณห้าส่วน', smoking: 'ไม่ทราบ' }, { type: 'กลุ่มเสี่ยง' }); });
        const legacyPayload = await page.evaluate(() => ncdReportUI.collect());
        assert.equal(Object.hasOwn(legacyPayload, 'veggie_fruit'), false);
        assert.equal(Object.hasOwn(legacyPayload, 'smoking'), false);
        await page.locator('#form-report-veggie_fruit').fill('2');
        await page.locator('#form-report-smoking').selectOption('');
        const replacedPayload = await page.evaluate(() => ncdReportUI.collect());
        assert.equal(replacedPayload.veggie_fruit, 2); assert.equal(replacedPayload.smoking, '');
        await page.evaluate(() => { state.ncdReportVersion = 0; ncdReportUI.updateBackendSupport(); });
        await page.evaluate(() => openQuarterlyModal(2));
        assert.equal(await page.locator('#form-report-smoking').isDisabled(), true);
        assert.equal(await page.locator('#ncd-report-support').isVisible(), true);
        assert.deepEqual(await page.evaluate(() => ncdReportUI.collect()), {});
        await page.locator('#quarterly-modal .close-modal-btn').first().click();
        await page.locator('#ncd-export-btn').waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.getElementById('ncd-export-btn').disabled);
        await page.evaluate(()=>viewTargetProfile(1));
        rejectDetail=true;
        await page.locator('#btn-add-quarterly').click();
        await page.waitForFunction(()=>!state.connectionReady);
        assert.equal(await page.locator('#quarterly-modal').isVisible(),false);
        rejectDetail=false;
        await page.evaluate(()=>refreshData());
        await page.evaluate(()=>switchView('registry-view'));
        await page.locator('#ncd-export-village').selectOption('หมู่ 2 บ้านตรัง');
        rejectBootstrap = true;
        let extraDownloads = 0; page.on('download', () => extraDownloads++);
        await page.locator('#ncd-export-btn').click();
        await page.waitForFunction(() => !document.getElementById('ncd-export-btn').disabled);
        assert.equal(extraDownloads, 0);
        assert.equal(await page.evaluate(() => state.connectionReady), false);
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(qa, 'browser-results.json'), JSON.stringify({ passed: true, ui: ['1440x1000', '390x844'], actions: [...new Set(actions)], pageErrors: errors, productionRequests: 0, failedRefreshBlockedExport: true }, null, 2));
        await context.close();
    } finally { await browser.close(); }
});
