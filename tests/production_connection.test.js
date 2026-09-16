const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function client() {
    const elements = new Map();
    const storage = new Map([['ncd_authenticated', 'true']]);
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value: '', hidden: false, textContent: '', listeners: {},
            addEventListener(type, fn) { this.listeners[type] = fn; }, focus() {},
            classList: { add() {}, remove() {} }, querySelector() { return element(id + '-child'); }
        });
        return elements.get(id);
    };
    const context = vm.createContext({
        console: { error() {}, warn() {} }, AbortController, setTimeout, clearTimeout,
        trackingUtils: require('../tracking-utils'),
        document: { addEventListener() {}, getElementById: element, querySelectorAll: () => [], createElement: () => ({}), head: { appendChild() {} } },
        localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        fetch: async () => { throw new Error('network down'); }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../app.js'), 'utf8'), context);
    vm.runInContext('showToast = () => {}; showSpinner = () => {}; switchView = () => {}; populateWorkerControls = () => {};', context);
    return { context, storage, elements, run: code => vm.runInContext(code, context) };
}

test('old demo preference cannot enable demo and settings fields are blank for users', () => {
    const c = client(); c.storage.set('ncd_connection_mode', 'demo');
    c.run('loadSettings()');
    assert.equal(c.run('state.connectionMode'), 'online');
    assert.equal(c.storage.has('ncd_connection_mode'), false);
    assert.equal(c.elements.get('setting-passcode').value, '');
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
    const c = client(); let requests = 0;
    c.context.fetch = async (_url, options) => {
        requests++;
        const { action } = JSON.parse(options.body);
        const data = action === 'getOsmWorkers' || action === 'getTargets' ? [] : action === 'getAllQuarterly' ? { quarterly: [] } : {};
        return { ok: true, json: async () => ({ success: true, data }) };
    };
    assert.equal(await c.run('refreshData()'), true);
    await c.run("postToAPI('addDailyLog', {})");
    const before = requests;
    c.context.fetch = async () => { requests++; throw new Error('response lost'); };
    await assert.rejects(c.run("postToAPI('addQuarterly', {})"), /ตรวจรายการก่อนบันทึกซ้ำ/);
    await assert.rejects(c.run("postToAPI('addQuarterly', {})"), /ยังไม่พร้อมบันทึก/);
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

test('missing quarterly data keeps system locked even after targets loaded', async () => {
    const c = client();
    c.context.fetch = async (_url, options) => ({ ok: true, json: async () => ({
        success: true, data: ['getTargets', 'getOsmWorkers'].includes(JSON.parse(options.body).action) ? [] : {}
    }) });
    assert.equal(await c.run('refreshData()'), false);
    assert.equal(c.run('state.connectionReady'), false);
});

test('non-admin cannot save settings', async () => {
    const c = client(); const old = c.run('state.gasUrl');
    await c.run("saveSettings('https://script.google.com/macros/s/other/exec', 'other')");
    assert.equal(c.run('state.gasUrl'), old);
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
    assert.equal(c.run('state.isAdmin'), false);
    assert.match(c.elements.get('login-error').textContent, /เชื่อมต่อฐานข้อมูลไม่สำเร็จ/);
});

test('backend distinguishes admin from user and denies privileged actions to users', () => {
    const properties = { API_PASSCODE: 'user-test', ADMIN_PASSCODE: 'admin-test' };
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties[k] || '' }) },
        SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
        ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../backend/gas_backend'), 'utf8'), context);
    const request = (passcode, action = 'login') => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ passcode, action, data: {} }) } }).text);
    assert.equal(request('user-test').data.role, 'user');
    assert.equal(request('admin-test').data.role, 'admin');
    assert.equal(request('wrong').success, false);
    assert.equal(request('user-test', 'setupSheets').success, false);
    delete properties.ADMIN_PASSCODE;
    assert.equal(request('admin-test').success, false);
});
