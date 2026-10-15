const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function client({ search = '', captureLogs = false, stubSpinner = true } = {}) {
    const elements = new Map();
    const storage = new Map([['ncd_authenticated', 'true']]);
    const logs = [];
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value: '', hidden: false, textContent: '', listeners: {},
            addEventListener(type, fn) { this.listeners[type] = fn; }, focus() {},
            classList: {
                values: new Set(),
                add(...names) { names.forEach(name => this.values.add(name)); },
                remove(...names) { names.forEach(name => this.values.delete(name)); },
                contains(name) { return this.values.has(name); },
                toggle(name,force) { const add=force ?? !this.values.has(name); if(add)this.values.add(name);else this.values.delete(name);return add; }
            },
            querySelector() { return element(id + '-child'); }
        });
        return elements.get(id);
    };
    const context = vm.createContext({
        console: { error() {}, warn() {}, log(...args) { if (captureLogs) logs.push(args.join(' ')); } },
        location: { search }, AbortController, setTimeout, clearTimeout,
        trackingUtils: require('../tracking-utils'),
        workerScope: require('../worker-scope'),
        trackingHistory: require('../tracking-history'),
        ncdReportUI: { collect: () => ({}) },
        ncdExport: require('../ncd-export'),
        document: { querySelector: () => null, addEventListener() {}, getElementById: element, querySelectorAll: () => [], createElement: () => ({}), head: { appendChild() {} } },
        localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        fetch: async () => { throw new Error('network down'); }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../app.js'), 'utf8'), context);
    vm.runInContext(`showToast = () => {}; ${stubSpinner ? 'showSpinner = () => {};' : ''} switchView = () => {}; populateWorkerControls = () => {}; renderDashboardSecondary = () => {}; renderDashboardLoading = () => {}; ensureWorkerSelection = () => {}; showWorkerChoice = () => {};`, context);
    return { context, storage, elements, logs, run: code => vm.runInContext(code, context) };
}

test('login and blocking operations expose contextual progress messages', () => {
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    assert.match(html, /id="loading-spinner-message"[^>]*aria-live="polite"/);

    const c = client({ stubSpinner: false });
    c.run("showSpinner(true, 'กำลังโหลดข้อมูลรายบุคคล...')");
    assert.equal(c.elements.get('loading-spinner-message').textContent, 'กำลังโหลดข้อมูลรายบุคคล...');
    assert.equal(c.elements.get('loading-spinner').classList.contains('hidden'), false);
    c.run('showSpinner(false)');
    assert.equal(c.elements.get('loading-spinner').classList.contains('hidden'), true);

    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    assert.match(source, /submitLabel\.textContent = 'กำลังตรวจสอบรหัสผ่าน\.\.\.'/);
    assert.match(source, /showSpinner\(true, 'กำลังบันทึกข้อมูลบุคคล\.\.\.'\)/);
    assert.match(source, /showSpinner\(true, 'กำลังบันทึกผลติดตามสุขภาพ\.\.\.'\)/);
    assert.match(source, /showSpinner\(true, 'กำลังบันทึกพฤติกรรมรายวัน\.\.\.'\)/);
});

test('community export retains raw missing measurements while chart normalization stays compatible', () => {
    const c = client();
    c.run("applySecondaryData([{id: 1, target_id: 1, quarter: 'W0', body_fat: '', muscle_mass: 0, weight: 60}], [])");
    assert.equal(c.run('state.quarterlyData[0].body_fat'), 0);
    assert.equal(c.run('state.quarterlyExportData[0].body_fat'), '');
    assert.equal(c.run('state.quarterlyExportData[0].muscle_mass'), 0);
    assert.equal(c.run('state.quarterlyData[0]._ncdRawPhysical.body_fat'), '');
});

test('old demo preference cannot enable demo and settings fields are blank for users', () => {
    const c = client(); c.storage.set('ncd_connection_mode', 'demo');
    c.run('loadSettings()');
    assert.equal(c.run('state.connectionMode'), 'online');
    assert.equal(c.storage.has('ncd_connection_mode'), false);
    assert.equal(c.elements.has('setting-passcode'), false);
});

test('failed initial load stops writes and never reads local CSVs', async () => {
    const c = client(); const urls = [];
    c.context.fetch = async url => { urls.push(url); throw new Error('network down'); };
    assert.equal(await c.run('refreshData()'), false);
    assert.equal(c.run('state.connectionReady'), false);
    assert.equal(c.run('state.connectionMode'), 'online');
    await assert.rejects(c.run("postToAPI('addTarget', {})"), /ยังไม่พร้อมบันทึก/);
    assert.equal(urls.length, 1);
    assert.ok(urls.every(url => url.startsWith('https://script.google.com/')));
    assert.match(c.elements.get('connection-error-message').textContent, /ไม่มีการใช้ข้อมูลจำลอง/);
});

test('complete recovery permits real writes, failed write locks further writes without retry', async () => {
    const c = client({ search: '?legacy=1' }); let requests = 0;
    c.context.fetch = async (_url, options) => {
        requests++;
        const { action } = JSON.parse(options.body);
        const data = action === 'getOsmWorkers' || action === 'getTargets' ? [] : action === 'getAllQuarterly' ? { quarterly: [] } : {};
        return { ok: true, json: async () => ({ success: true, data }) };
    };
    assert.equal(await c.run('refreshData()'), true);
    c.run("state.selectedWorker='ทีม ก';state.targets=[{id:1,responsible_worker:'ทีม ก'}]");
    await c.run("postToAPI('addDailyLog', {target_id:1})");
    const before = requests;
    c.context.fetch = async () => { requests++; throw new Error('response lost'); };
    await assert.rejects(c.run("postToAPI('addQuarterly', {target_id:1})"), /ตรวจรายการก่อนบันทึกซ้ำ/);
    await assert.rejects(c.run("postToAPI('addQuarterly', {target_id:1})"), /ยังไม่พร้อมบันทึก/);
    assert.equal(requests, before + 1);
});

test('HTTP errors, invalid JSON, and rejected API responses never report success', async () => {
    for (const response of [
        { ok: false, status: 404 },
        { ok: true, json: async () => { throw new SyntaxError('HTML instead of JSON'); } },
        { ok: true, json: async () => ({ success: false, error: 'Invalid Passcode' }) },
        { ok: true, json: async () => ({}) }
    ]) {
        const c = client(); c.context.fetch = async () => response;
        await assert.rejects(c.run("postToAPI('getTargets', {})"));
        assert.equal(c.run('state.connectionReady'), false);
    }
});

test('missing quarterly data keeps writes locked even after core data renders', async () => {
    const c = client({ search: '?legacy=1' });
    c.context.fetch = async (_url, options) => ({ ok: true, json: async () => ({
        success: true, data: ['getTargets', 'getOsmWorkers'].includes(JSON.parse(options.body).action) ? [] : {}
    }) });
    // core (targets + stats) โหลดได้ → dashboard แสดงผลได้แบบ read-only
    assert.equal(await c.run('refreshData()'), true);
    assert.equal(c.run('state.coreDataReady'), true);
    // แต่ quarterly ขาด → ระบบยังล็อกการบันทึก (write safety คงเดิม ไม่เปิดก่อนเวลา)
    assert.equal(c.run('state.connectionReady'), false);
    await assert.rejects(c.run("postToAPI('addQuarterly', {target_id:1})"), /ยังไม่พร้อมบันทึก/);
});

test('bootstrap endpoint is used when available and skips legacy reads', async () => {
    const c = client(); const actions = [];
    c.context.fetch = async (_url, options) => {
        const { action } = JSON.parse(options.body);
        actions.push(action);
        if (action === 'getBootstrapData') {
            return { ok: true, json: async () => ({ success: true, data: {
                targets: [{ id: '1', age: '50', height: '160', village: 'หมู่ 2 บ้านตรัง', responsible_worker: 'อสม.เอ' }],
                dashboardStats: { totalTargets: 1, riskCount: 1, patientCount: 0 },
                quarterly: [],
                workers: ['อสม.เอ']
            }}) };
        }
        return { ok: true, json: async () => ({ success: true, data: {} }) };
    };
    assert.equal(await c.run('refreshData()'), true);
    assert.deepEqual(actions, ['getBootstrapData']);
    assert.equal(c.run('state.coreDataReady'), true);
    assert.equal(c.run('state.secondaryReady'), true);
    assert.equal(c.run('state.connectionReady'), true);
    assert.equal(c.run('state.targets.length'), 1);
    assert.equal(c.run('state.workerOptions[0]'), 'อสม.เอ');
});

test('malformed bootstrap quarterly data keeps secondary and writes locked', async () => {
    const c = client();
    c.context.fetch = async () => ({ ok: true, json: async () => ({ success: true, data: {
        targets: [], dashboardStats: { totalTargets: 0 }, quarterly: {}, workers: []
    } }) });

    assert.equal(await c.run('refreshData()'), false);
    assert.equal(c.run('state.secondaryReady'), false);
    assert.equal(c.run('state.connectionReady'), false);
    await assert.rejects(c.run("postToAPI('addQuarterly', {target_id:1})"), /ยังไม่พร้อมบันทึก/);
});

test('malformed bootstrap workers data keeps writes locked', async () => {
    const c = client();
    c.context.fetch = async () => ({ ok: true, json: async () => ({ success: true, data: {
        targets: [], dashboardStats: { totalTargets: 0 }, quarterly: [], workers: null
    } }) });

    assert.equal(await c.run('refreshData()'), false);
    assert.equal(c.run('state.secondaryReady'), false);
    assert.equal(c.run('state.connectionReady'), false);
});

test('legacy fallback works when bootstrap action is unavailable', async () => {
    const c = client(); const actions = [];
    c.context.fetch = async (_url, options) => {
        const { action } = JSON.parse(options.body);
        actions.push(action);
        if (action === 'getBootstrapData') {
            return { ok: true, json: async () => ({ success: false, error: 'ไม่พบ Action สำหรับการเขียนข้อมูล' }) };
        }
        const data = action === 'getOsmWorkers' || action === 'getTargets' ? [] : action === 'getAllQuarterly' ? { quarterly: [] } : {};
        return { ok: true, json: async () => ({ success: true, data }) };
    };
    assert.equal(await c.run('refreshData()'), true);
    assert.ok(actions.includes('getTargets'));
    assert.ok(actions.includes('getDashboardStats'));
    assert.ok(actions.includes('getAllQuarterly'));
    assert.equal(c.run('state.coreDataReady'), true);
    assert.equal(c.run('state.connectionReady'), true);
});

test('bootstrap network failure never silently downgrades to legacy', async () => {
    const c = client(); const actions = [];
    c.context.fetch = async (_url, options) => {
        actions.push(JSON.parse(options.body).action);
        throw new Error('network down');
    };
    assert.equal(await c.run('refreshData()'), false);
    assert.deepEqual(actions, ['getBootstrapData']); // ไม่ fallback ไป legacy
    assert.equal(c.run('state.connectionReady'), false);
});

test('stale generation does not overwrite a newer concurrent load', async () => {
    const c = client();
    let releaseFirst;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    let bootstrapCalls = 0;
    c.context.fetch = async (_url, options) => {
        const { action } = JSON.parse(options.body);
        if (action !== 'getBootstrapData') {
            return { ok: true, json: async () => ({ success: true, data: {} }) };
        }
        bootstrapCalls++;
        if (bootstrapCalls === 1) {
            await firstGate; // หน่วง request แรกไว้
            return { ok: true, json: async () => ({ success: true, data: {
                targets: [{ id: '1', age: '50', height: '160', village: 'v1', responsible_worker: 'w1' }],
                dashboardStats: { totalTargets: 1 }, quarterly: [], workers: ['w1']
            }}) };
        }
        return { ok: true, json: async () => ({ success: true, data: {
            targets: [{ id: '2', age: '51', height: '161', village: 'v2', responsible_worker: 'w2' }],
            dashboardStats: { totalTargets: 2 }, quarterly: [], workers: ['w2']
        }}) };
    };

    const first = c.run('refreshData()');   // generation 1 (หน่วง)
    const second = c.run('refreshData()');  // generation 2 (เสร็จทันที)
    assert.equal(await second, true);
    assert.equal(c.run('state.targets[0].id'), 2);

    releaseFirst();
    await first; // generation 1 ต้องถูกทิ้ง
    assert.equal(c.run('state.targets[0].id'), 2); // ไม่ถูก overwrite โดยข้อมูลเก่า
});

test('stale legacy core response does not overwrite newer core state', async () => {
    const c = client({ search: '?legacy=1' });
    const releases = {};
    const counts = {};
    c.context.fetch = async (_url, options) => {
        const { action } = JSON.parse(options.body);
        counts[action] = (counts[action] || 0) + 1;
        const call = counts[action];
        if (call === 1 && ['getTargets', 'getDashboardStats'].includes(action)) {
            await new Promise(resolve => { releases[action] = resolve; });
        }
        const old = call === 1;
        const data = action === 'getTargets'
            ? [{ id: old ? '1' : '2', age: '50', height: '160' }]
            : action === 'getDashboardStats'
                ? { totalTargets: old ? 1 : 2 }
                : action === 'getAllQuarterly' ? { quarterly: [] } : [];
        return { ok: true, json: async () => ({ success: true, data }) };
    };

    const stale = c.run('refreshData()');
    await new Promise(resolve => setImmediate(resolve));
    const current = c.run('refreshData()');
    assert.equal(await current, true);
    releases.getTargets(); releases.getDashboardStats();
    await stale;
    assert.equal(c.run('state.targets[0].id'), 2);
    assert.equal(c.run('state.apiDashboardStats.totalTargets'), 2);
});

test('stale legacy secondary response does not overwrite newer secondary state', async () => {
    const c = client({ search: '?legacy=1' });
    const releases = {};
    const counts = {};
    c.context.fetch = async (_url, options) => {
        const { action } = JSON.parse(options.body);
        counts[action] = (counts[action] || 0) + 1;
        const call = counts[action];
        if (call === 1 && ['getOsmWorkers', 'getAllQuarterly'].includes(action)) {
            await new Promise(resolve => { releases[action] = resolve; });
        }
        const old = call === 1;
        const data = action === 'getTargets' ? []
            : action === 'getDashboardStats' ? { totalTargets: 0 }
                : action === 'getOsmWorkers' ? [old ? 'old-worker' : 'new-worker']
                    : { quarterly: [{ id: old ? '1' : '2', target_id: '1' }] };
        return { ok: true, json: async () => ({ success: true, data }) };
    };

    const stale = c.run('refreshData()');
    await new Promise(resolve => setImmediate(resolve));
    const current = c.run('refreshData()');
    assert.equal(await current, true);
    releases.getOsmWorkers(); releases.getAllQuarterly();
    await stale;
    assert.equal(c.run('state.quarterlyData[0].id'), 2);
    assert.equal(c.run('state.workerOptions[0]'), 'new-worker');
});

test('stale failed refresh cannot lock or report over a newer successful generation', async () => {
    const c = client();
    let releaseFailure;
    let calls = 0;
    c.context.fetch = async () => {
        calls++;
        if (calls === 1) {
            await new Promise(resolve => { releaseFailure = resolve; });
            throw new Error('late stale failure');
        }
        return { ok: true, json: async () => ({ success: true, data: {
            targets: [], dashboardStats: { totalTargets: 0 }, quarterly: [], workers: []
        } }) };
    };

    const stale = c.run('refreshData()');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await c.run('refreshData()'), true);
    releaseFailure();
    assert.equal(await stale, false);
    assert.equal(c.run('state.connectionReady'), true);
    assert.equal(c.elements.has('connection-error-message'), false);
});

test('legacy partial secondary failure emits no full hydration or login total marker', async () => {
    const c = client({ search: '?legacy=1&perf=1', captureLogs: true });
    c.run('setupEventListeners()');
    c.run("document.getElementById('login-passcode').value = 'valid';");
    c.context.fetch = async (_url, options) => {
        const { action } = JSON.parse(options.body);
        if (action === 'login') return { ok: true, json: async () => ({ success: true, data: { role: 'user' } }) };
        if (action === 'getAllQuarterly') throw new Error('secondary down');
        const data = action === 'getTargets' || action === 'getOsmWorkers' ? [] : {};
        return { ok: true, json: async () => ({ success: true, data }) };
    };

    await c.elements.get('login-form').listeners.submit({ preventDefault() {} });
    assert.equal(c.run('state.connectionReady'), false);
    assert.ok(!c.logs.some(line => line.includes('full-hydration')));
    assert.ok(!c.logs.some(line => line.includes('login-total (auth + full hydration)')));
});

test('session restore hydrates without re-login', async () => {
    const c = client(); // storage เริ่มต้นมี ncd_authenticated = 'true'
    const actions = [];
    c.context.fetch = async (_url, options) => {
        const { action } = JSON.parse(options.body);
        actions.push(action);
        if (action === 'getBootstrapData') {
            return { ok: true, json: async () => ({ success: true, data: {
                targets: [], dashboardStats: { totalTargets: 0 }, quarterly: [], workers: []
            }}) };
        }
        return { ok: true, json: async () => ({ success: true, data: {} }) };
    };
    c.run('checkAuthentication()');
    await new Promise(resolve => setTimeout(resolve, 50)); // รอ async refreshData ทำงาน
    assert.ok(actions.includes('getBootstrapData'));
    assert.ok(!actions.includes('login')); // ไม่มีการ re-login
    assert.equal(c.run('state.coreDataReady'), true);
    assert.equal(c.run('state.connectionReady'), true);
});

test('browser settings overrides are ignored and settings form is removed', () => {
    const c = client(); const old = c.run('state.gasUrl');
    c.storage.set('ncd_gas_url', 'https://example.com');
    c.storage.set('ncd_api_passcode', 'stale-password');
    c.run('loadSettings()');
    assert.equal(c.run('state.gasUrl'), old);
    assert.equal(c.run('state.apiPasscode'), '009941');
    assert.equal(c.run('typeof saveSettings'), 'undefined');
    assert.ok(!fs.readFileSync(require.resolve('../index.html'), 'utf8').includes('settings-view'));
});

test('all three real submit handlers preserve form and never mutate local data when disconnected', async () => {
    const c = client(); const notices = [];
    c.context.showToast = (message, type) => notices.push({ message, type });
    c.run('setupEventListeners()');
    // The form inputs are read on submission; create them via the same DOM facade.
    c.run("document.getElementById('form-target-village').value = ACTIVE_VILLAGES[0]; document.getElementById('form-target-worker').value = MOCK_WORKERS[0]; document.getElementById('form-q-round').value = 'W0';");
    for (const formId of ['target-form', 'quarterly-form', 'daily-form']) {
        await c.elements.get(formId).listeners.submit({ preventDefault() {} });
    }
    assert.equal(c.run('state.targets.length + state.quarterlyData.length + state.dailyLogs.length'), 0);
    assert.equal(notices.length, 3);
    assert.ok(notices.every(notice => notice.type === 'danger' && notice.message.includes('ยังไม่พร้อมบันทึก')));
});

test('login trusts only the server role and shows immediate failure', async () => {
    const c = client(); c.run('setupEventListeners()');
    c.run("document.getElementById('login-passcode').value = 'wrong';");
    await c.elements.get('login-form').listeners.submit({ preventDefault() {} });
    assert.equal(c.storage.has('ncd_authenticated'), false);
    assert.match(c.elements.get('login-error').textContent, /เชื่อมต่อฐานข้อมูลไม่สำเร็จ/);
});

test('shared login works but maintenance actions are denied even with a legacy admin password', () => {
    const properties = { API_PASSCODE: 'user-test', ADMIN_PASSCODE: 'admin-test' };
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties[k] || '' }) },
        SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
        ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../backend/gas_backend'), 'utf8'), context);
    const request = (passcode, action = 'login') => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ passcode, action, data: {} }) } }).text);
    assert.equal(request('user-test').data.role, 'user');
    assert.equal(request('admin-test').success, false);
    assert.equal(request('wrong').success, false);
    assert.equal(request('user-test', 'setupSheets').success, false);
    assert.equal(request('admin-test', 'setupSheets').success, false);
    delete properties.ADMIN_PASSCODE;
    assert.equal(request('admin-test').success, false);
});
test('workspace guards stop other-worker profile reads and writes before network requests',async()=>{
 const c=client();let requests=0;c.context.fetch=async()=>{requests++;return {ok:true,json:async()=>({success:true,data:{}})};};
 c.run("state.connectionReady=true;state.selectedWorker='ทีม ก';state.targets=[{id:1,responsible_worker:'ทีม ก'},{id:2,responsible_worker:'ทีม ข'}]");
 for(const [action,data] of [['getTargetDetail',{id:2}],['addQuarterly',{target_id:2}],['addDailyLog',{target_id:2}],['updateTarget',{id:2,responsible_worker:'ทีม ก'}],['addTarget',{responsible_worker:'ทีม ข'}]])await assert.rejects(c.run(`postToAPI(${JSON.stringify(action)},${JSON.stringify(data)})`),/รับผิดชอบ/);
 assert.equal(requests,0);await c.run("postToAPI('addQuarterly',{target_id:1})");assert.equal(requests,1);
 c.run('state.selectedWorker=null');await assert.rejects(c.run("postToAPI('getTargetDetail',{id:1})"),/เลือกชื่อ/);
});
test('staff overview permits reads but rejects every mutation before fetch',async()=>{const c=client();let calls=0;c.context.fetch=async()=>{calls++;return {ok:true,json:async()=>({success:true,data:{}})};};c.run("state.connectionReady=true;state.selectedWorker=workerScope.STAFF_ALL;state.targets=[{id:1,responsible_worker:'ทีม ก'}]");await c.run("postToAPI('getTargetDetail',{id:1})");assert.equal(calls,1);for(const action of ['addTarget','updateTarget','addQuarterly','addDailyLog'])await assert.rejects(c.run(`postToAPI('${action}',{id:1,target_id:1,responsible_worker:'ทีม ก'})`),/โหมดเจ้าหน้าที่/);assert.equal(calls,1);});

test('POST requests use unique uncached URLs with credentials only in the body', async () => {
    const c = client(); const calls = [];
    c.context.fetch = async (url, options) => {
        calls.push({url, options});
        return {ok:true,json:async()=>({success:true,data:{}})};
    };
    await c.run("postToAPI('getTargets', {}, 'test-secret')");
    await c.run("postToAPI('getTargets', {}, 'test-secret')");
    assert.notEqual(calls[0].url, calls[1].url);
    for (const {url,options} of calls) {
        assert.match(url, /[?&]_ncd_request=/);
        assert.equal(url.includes('test-secret'),false);
        assert.equal(options.method,'POST');
        assert.equal(options.cache,'no-store');
        assert.equal(options.redirect,'follow');
        assert.equal(JSON.parse(options.body).passcode,'test-secret');
        assert.equal(options.headers,undefined); // stays a simple cross-origin request
    }
});

test('GET-only rejection of a write remains ambiguous and is never retried', async () => {
    const c=client(); let requests=0;
    c.run("state.connectionReady=true;state.selectedWorker='ทีม ก';state.targets=[{id:1,responsible_worker:'ทีม ก'}]");
    c.context.fetch=async()=>{requests++;return {ok:true,json:async()=>({success:false,error:'API นี้ต้องเรียกผ่าน POST พร้อมรหัสผ่านเท่านั้น'})};};
    await assert.rejects(c.run("postToAPI('addQuarterly',{target_id:1})"),/ตรวจรายการก่อนบันทึกซ้ำ/);
    assert.equal(requests,1);
    assert.equal(c.run('state.connectionReady'),false);
});
