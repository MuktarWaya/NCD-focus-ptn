/* ==========================================
   APPLICATION LOGIC: NCDs Focus (มุ่งเป้าปัตตานี)
   Handles Views, Chart.js, CSV Fetch, and GAS API
   ========================================== */

// --- Global Application State ---
const DEFAULT_API_PASSCODE = '009941';
const ACTIVE_VILLAGES = ['หมู่ 2 บ้านตรัง', 'หมู่ 3 บ้านเขาวัง', 'หมู่ 4 บ้านม่วงเงิน'];
const FUTURE_VILLAGES = ['หมู่ 1 บ้านบองอ'];
const ALL_VILLAGES = [...ACTIVE_VILLAGES, ...FUTURE_VILLAGES];
const UNASSIGNED_WORKER = 'ยังไม่ระบุคณะทำงาน';
const {
    TRACKING_ROUNDS,
    getWeeksForRound,
    isLabRound,
    summarizeWeek,
    roundLabel,
    roundSortValue
} = trackingUtils;
const WEEKLY_SUMMARY_FIELDS = ['exercise_minutes', 'healthy_menu_days', 'sleep_avg', 'avoid_sweet', 'avoid_oil', 'avoid_salt'];
const MOCK_WORKERS = [
    'อสม.นูรอัยนี มะ',
    'อสม.ฟาตีเมาะ สาและ',
    'อสม.ไซนับ ดอเลาะ',
    'อสม.อามีนะห์ มะลี',
    'อสม.รอกีเยาะ เจ๊ะมะ',
    'อสม.ซูไรดา ดือราแม',
    'อสม.ปาตีเมาะ มามะ',
    'อสม.มารียัม สะแลแม',
    'อสม.อาอีเสาะ ยะโกะ',
    'อสม.นูรีซัน มะสาและ',
    'อสม.ซารีนา ดือเร๊ะ',
    'อสม.รอฮานี สะมะแอ',
    'อสม.นูรฮายาตี เจ๊ะหะ',
    'อสม.ฮัสนะห์ มะแซ',
    'อสม.อัสมา สาและ',
    'อสม.ซูไฮลา มะลี',
    'อสม.มะยีดา ดอเลาะ',
    'อสม.รอซีดะห์ เจ๊ะเลาะ',
    'อสม.นูรอามีเนาะ ดือราแม',
    'อสม.ซัลมา มามะ',
    'อสม.อับดุลเลาะ สาและ',
    'อสม.มูฮัมหมัดอารีฟ ดอเลาะ',
    'อสม.อับดุลรอฮีม มะแซ',
    'อสม.มูฮัมหมัดซากี มะลี',
    'อสม.ซุลกิฟลี เจ๊ะมะ',
    'อสม.รอซาลี สะแลแม',
    'อสม.อับดุลฮากิม ดือเร๊ะ',
    'อสม.มูฮัมหมัดฟิตรี ยะโกะ',
    'อสม.ซาการียา มามะ',
    'อสม.อิสมาแอ สาและ',
    'อสม.นูรอาซีกีน เจ๊ะหะ',
    'อสม.ฟารีดา มะแซ',
    'อสม.ฮานีฟะห์ ดอเลาะ',
    'อสม.ซูไบดะห์ มะลี',
    'อสม.อาลีฟะห์ เจ๊ะเลาะ',
    'อสม.นูรฟารีซา ดือราแม',
    'อสม.ซาฟีนะห์ มามะ',
    'อสม.รอฮีมะห์ สาและ',
    'อสม.นูรอีมาน สะมะแอ',
    'อสม.ฮาซานะห์ ยะโกะ'
];

const state = {
    currentView: 'dashboard-view',
    connectionMode: 'online', // Production only: never fall back to simulated data.
    connectionReady: false,   // write-ready: เปิดเฉพาะ hydrate ครบแล้ว (targets+stats+quarterly+workers)
    coreDataReady: false,     // targets + dashboardStats พร้อม (แสดง dashboard ได้ read-only)
    secondaryReady: false,    // quarterly + workers พร้อม
    ncdReportVersion: 0,
    loadGeneration: 0,        // token กัน stale response หลัง logout/refresh ซ้ำ
    gasUrl: 'https://script.google.com/macros/s/AKfycbyWSrEKMUTazju1NHOk4h_XpJlpKTColEyyzdUexl7LXiphImm7wZL7cBINCxpCdeVjDA/exec',
    apiPasscode: DEFAULT_API_PASSCODE,
    
    // In-memory data (loaded from CSV or API)
    targets: [],
    quarterlyData: [],
    quarterlyExportData: [], // Preserve raw blanks for the community report.
    dailyLogs: [],
    workerOptions: [...MOCK_WORKERS],
    
    // Current viewed target details
    selectedTargetId: null,
    selectedTargetProfile: null,
    selectedTargetQuarterly: [],
    selectedTargetDailyLogs: [],
    
    // Chart instances
    charts: {
        ratio: null,
        improvement: null,
        weightBmi: null,
        bpDtx: null,
        bodyComp: null
    },

    // Pagination
    currentPage: 1,
    pageSize: 12
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initTheme();
    initFontScale();
    setupProfileActionFallbacks();
    setupEventListeners();
    checkAuthentication();
});

// --- Settings & Theme Management ---
function loadSettings() {
    state.connectionMode = "online";
    ["ncd_gas_url", "ncd_api_passcode", "ncd_connection_mode"].forEach(key => localStorage.removeItem(key));
    updateConnectionIndicator();
}


function updateConnectionIndicator() {
    const indicator = document.getElementById('conn-status-indicator');
    
    if (state.connectionReady) {
        indicator.className = 'connection-status online';
        indicator.querySelector('.status-text').textContent = 'Connected (Sheets)';
    } else {
        indicator.className = 'connection-status offline';
        indicator.querySelector('.status-text').textContent = 'ยังไม่พร้อมบันทึก';
    }
    document.querySelectorAll('#target-form [type="submit"], #quarterly-form [type="submit"], #daily-form [type="submit"]').forEach(button => {
        button.disabled = !state.connectionReady;
    });
    if (typeof ncdReportUI !== 'undefined') ncdReportUI.updateBackendSupport?.();
}

function getTargetVillage(target) {
    if (!target || !target.village) return 'ยังไม่ระบุหมู่บ้าน';
    return target.village;
}

function getTargetWorker(target) {
    if (!target || !target.responsible_worker) return UNASSIGNED_WORKER;
    return target.responsible_worker;
}

function calculateVillageSummary() {
    const quarterlyByTarget = {};
    state.quarterlyData.forEach(row => {
        if (!quarterlyByTarget[row.target_id]) quarterlyByTarget[row.target_id] = [];
        quarterlyByTarget[row.target_id].push(row);
    });

    return ACTIVE_VILLAGES.map(village => {
        const targets = state.targets.filter(t => getTargetVillage(t) === village);
        const followed = targets.filter(t => (quarterlyByTarget[t.id] || []).length > 0).length;
        const followUp = targets.filter(t => (quarterlyByTarget[t.id] || []).length > 1).length;
        const risk = targets.filter(t => t.type === 'กลุ่มเสี่ยง').length;
        const patient = targets.filter(t => t.type === 'กลุ่มป่วย').length;
        const progressRate = targets.length > 0 ? Math.round((followed / targets.length) * 100) : 0;

        return {
            village,
            total: targets.length,
            followed,
            followUp,
            risk,
            patient,
            remaining: Math.max(targets.length - followed, 0),
            progressRate
        };
    });
}

function calculateWorkerSummary() {
    const quarterlyByTarget = {};
    state.quarterlyData.forEach(row => {
        if (!quarterlyByTarget[row.target_id]) quarterlyByTarget[row.target_id] = [];
        quarterlyByTarget[row.target_id].push(row);
    });

    const workers = getWorkerFilterOptions();
    state.targets.forEach(t => {
        const worker = getTargetWorker(t);
        if (!workers.includes(worker)) workers.push(worker);
    });

    return workers.map(worker => {
        const targets = state.targets.filter(t => getTargetWorker(t) === worker);
        const followed = targets.filter(t => (quarterlyByTarget[t.id] || []).length > 0).length;
        const followUp = targets.filter(t => (quarterlyByTarget[t.id] || []).length > 1).length;
        const risk = targets.filter(t => t.type === 'กลุ่มเสี่ยง').length;
        const patient = targets.filter(t => t.type === 'กลุ่มป่วย').length;
        const progressRate = targets.length > 0 ? Math.round((followed / targets.length) * 100) : 0;

        return {
            worker,
            total: targets.length,
            followed,
            followUp,
            risk,
            patient,
            remaining: Math.max(targets.length - followed, 0),
            progressRate
        };
    }).filter(item => item.total > 0 || item.worker !== UNASSIGNED_WORKER);
}

function checkAuthentication() {
    const loginScreen = document.getElementById('login-screen');
    if (!loginScreen) return;

    const isAuthenticated = sessionStorage.getItem('ncd_authenticated') === 'true';
    if (isAuthenticated) {
        loginScreen.classList.add('hidden');
        refreshData();
    } else {
        loginScreen.classList.remove('hidden');
        const loginPasscode = document.getElementById('login-passcode');
        if (loginPasscode) {
            loginPasscode.value = '';
            loginPasscode.focus();
        }
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) errorDiv.classList.add('hidden');
    }
}

function initTheme() {
    const isDark = localStorage.getItem('ncd_dark_theme') === 'true';
    if (isDark) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
        document.getElementById('theme-toggle').innerHTML = '<span class="material-symbols-outlined">light_mode</span>';
    } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
        document.getElementById('theme-toggle').innerHTML = '<span class="material-symbols-outlined">dark_mode</span>';
    }
}

function initFontScale() {
    const scale = localStorage.getItem('ncd_font_scale') || 'normal';
    document.documentElement.dataset.fontScale = scale;
    const button = document.getElementById('font-size-toggle');
    if (button) button.setAttribute('aria-pressed', String(scale === 'large'));
}

function toggleFontScale() {
    const nextScale = document.documentElement.dataset.fontScale === 'large' ? 'normal' : 'large';
    document.documentElement.dataset.fontScale = nextScale;
    localStorage.setItem('ncd_font_scale', nextScale);
    const button = document.getElementById('font-size-toggle');
    if (button) button.setAttribute('aria-pressed', String(nextScale === 'large'));
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    document.body.classList.toggle('dark', isDark);
    localStorage.setItem('ncd_dark_theme', isDark);
    document.getElementById('theme-toggle').innerHTML = isDark ? 
        '<span class="material-symbols-outlined">light_mode</span>' : '<span class="material-symbols-outlined">dark_mode</span>';
    
    // Re-draw charts to match theme text colors if needed
    Chart.defaults.color = isDark ? '#bec8d2' : '#3e4850';
    refreshCharts();
}

// --- Dev-only performance instrumentation ---
// เปิดได้โดยเรียก URL ด้วย ?perf=1 หรือตั้ง localStorage ncd_perf_log=1 (production ปิดโดยปริยาย)
const PERF_LOGGING = (typeof location !== 'undefined' && /[?&]perf=1/.test(location.search))
    || (typeof localStorage !== 'undefined' && localStorage.getItem('ncd_perf_log') === '1');
// ?legacy=1 → บังคับ path เดิม (parallel) เพื่อ A/B เทียบกับ bootstrap (dev-only benchmark)
const FORCE_LEGACY_READS = (typeof location !== 'undefined' && /[?&]legacy=1/.test(location.search));
function perfNow() {
    return (typeof performance !== 'undefined') ? performance.now() : Date.now();
}
function perfLog(label, start) {
    if (!PERF_LOGGING) return;
    console.log(`[PERF] ${label}: ${Math.round(perfNow() - start)}ms`);
}

// --- Data Fetching and Parsing ---
// Progressive hydration:
//   1) CORE (critical): targets + dashboardStats → แสดง dashboard ที่ใช้ได้ (read-only)
//   2) SECONDARY (non-critical): quarterly + workers → hydrate ส่วนที่เหลือ + เปิดให้บันทึกได้
async function refreshData() {
    const generation = ++state.loadGeneration;
    const startedAt = perfNow();

    state.connectionReady = false;   // write-ready: เข้มงวดเท่าเดิม เปิดเฉพาะ hydrate ครบแล้ว
    state.coreDataReady = false;
    state.secondaryReady = false;
    state.ncdReportVersion = 0;
    updateConnectionIndicator();

    if (state.currentView === 'dashboard-view') renderDashboardLoading();

    try {
        const bootstrap = await fetchBootstrapOrNull();
        perfLog('bootstrap-request', startedAt);
        if (generation !== state.loadGeneration) return false;

        if (bootstrap) {
            // Bootstrap endpoint ให้ข้อมูลครบใน request เดียว (targets + stats + quarterly + workers)
            applyCoreData(bootstrap.targets, bootstrap.dashboardStats);
            state.coreDataReady = true;
            finishCoreRender();
            perfLog('coreDataReady + first-usable-dashboard (bootstrap)', startedAt);

            if (generation !== state.loadGeneration) return false;
            applySecondaryData(bootstrap.quarterly, bootstrap.workers);
            state.ncdReportVersion = Number(bootstrap.ncdReportVersion) || 0;
            state.secondaryReady = true;
            finishSecondaryRender();
            perfLog('secondaryReady + connectionReady (bootstrap)', startedAt);
            perfLog('full-hydration', startedAt);
            return true;
        }

        // Fallback: backend เดิมที่ยังไม่มี bootstrap action → อ่านแบบ parallel
        const core = await loadCoreLegacy();
        if (generation !== state.loadGeneration) return false;
        applyCoreData(core.targets, core.dashboardStats);
        state.coreDataReady = true;
        finishCoreRender();
        perfLog('coreDataReady + first-usable-dashboard (legacy)', startedAt);

        try {
            const secondary = await loadSecondaryLegacy();
            if (generation !== state.loadGeneration) return false;
            applySecondaryData(secondary.quarterly, secondary.workers);
            state.ncdReportVersion = Number(secondary.ncdReportVersion) || 0;
            state.secondaryReady = true;
            finishSecondaryRender();
            perfLog('secondaryReady + connectionReady (legacy)', startedAt);
            perfLog('full-hydration', startedAt);
        } catch (err) {
            if (generation !== state.loadGeneration) return false;
            console.warn('[NCDs] Secondary data load failed — read-only mode:', err);
            showToast('โหลดข้อมูลเพิ่มเติมไม่สำเร็จ แสดงผลหลักได้แต่ยังบันทึกข้อมูลไม่ได้', 'warning');
            reportConnectionError(err);
            // connectionReady ยัง false → ห้ามบันทึก และแสดงแบนเนอร์ข้อผิดพลาดแล้ว
        }
        return true;
    } catch (err) {
        if (generation !== state.loadGeneration) return false;
        console.error("Error loading data:", err);
        showToast("ไม่สามารถโหลดข้อมูลได้: " + err.message, "danger");
        reportConnectionError(err);
        return false;
    } finally {
        updateConnectionIndicator();
    }
}

// พยายามดึงข้อมูลทั้งหมดจาก bootstrap endpoint; คืน null เมื่อ backend ยังไม่รองรับ action นี้
async function fetchBootstrapOrNull() {
    if (FORCE_LEGACY_READS) return null; // A/B benchmark: บังคับ path เดิม (parallel)
    let raw;
    try {
        raw = await postToAPI('getBootstrapData', {}, state.apiPasscode, { reportError: false });
    } catch (err) {
        if (isActionUnavailableError(err)) return null; // backend เก่า → fallback legacy
        throw err; // network/server error → ให้เป็น core failure จริง
    }
    const d = raw && raw.data;
    if (!d || !Array.isArray(d.targets) || !d.dashboardStats || typeof d.dashboardStats !== 'object'
        || Array.isArray(d.dashboardStats)
        || !Array.isArray(d.quarterly) || !Array.isArray(d.workers)) {
        throw new Error('ข้อมูล bootstrap จากฐานข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง');
    }
    return d;
}

function isActionUnavailableError(err) {
    return /ไม่พบ Action/i.test((err && err.message) || '');
}

async function loadCoreLegacy() {
    const t = perfNow();
    const [targetsJSON, statsJSON] = await Promise.all([
        postToAPI('getTargets', {}, state.apiPasscode, { reportError: false }),
        postToAPI('getDashboardStats', {}, state.apiPasscode, { reportError: false })
    ]);
    perfLog('core-legacy (getTargets + getDashboardStats)', t);

    if (!targetsJSON.success) throw new Error(targetsJSON.error);
    if (!Array.isArray(targetsJSON.data)) throw new Error('ข้อมูลรายชื่อจากฐานข้อมูลไม่ถูกต้อง');
    if (!statsJSON.data || typeof statsJSON.data !== 'object') throw new Error('ข้อมูลสรุปจากฐานข้อมูลไม่ถูกต้อง');

    return {
        targets: targetsJSON.data,
        dashboardStats: statsJSON.success ? statsJSON.data : state.apiDashboardStats
    };
}

async function loadSecondaryLegacy() {
    const t = perfNow();
    const [workerJSON, quarterlyJSON] = await Promise.all([
        postToAPI('getOsmWorkers', {}, state.apiPasscode, { reportError: false }),
        postToAPI('getAllQuarterly', {}, state.apiPasscode, { reportError: false })
    ]);
    perfLog('secondary-legacy (getOsmWorkers + getAllQuarterly)', t);

    if (!Array.isArray(workerJSON.data)) throw new Error('ข้อมูลคณะทำงานจากฐานข้อมูลไม่ถูกต้อง');
    if (!quarterlyJSON.data || !Array.isArray(quarterlyJSON.data.quarterly)) throw new Error('ข้อมูลผลติดตามจากฐานข้อมูลไม่ถูกต้อง');

    return {
        quarterly: quarterlyJSON.success ? quarterlyJSON.data.quarterly : [],
        workers: workerJSON.success && Array.isArray(workerJSON.data) && workerJSON.data.length > 0 ? workerJSON.data : null,
        ncdReportVersion: quarterlyJSON.data.ncdReportVersion || 0
    };
}

function normalizeTargets(targets) {
    (targets || []).forEach(t => {
        t.id = parseInt(t.id);
        t.age = parseInt(t.age);
        t.height = parseFloat(t.height);
        t.village = t.village || '';
        t.responsible_worker = t.responsible_worker || '';
    });
    return targets || [];
}

function applyCoreData(targets, stats) {
    state.targets = normalizeTargets(targets);
    state.apiDashboardStats = stats;
}

function applySecondaryData(quarterly, workers) {
    state.workerOptions = [...MOCK_WORKERS];
    state.quarterlyExportData = Array.isArray(quarterly) ? quarterly.map(record => ({ ...record })) : [];
    state.quarterlyData = Array.isArray(quarterly) ? quarterly : [];
    state.quarterlyData.forEach(normalizeTrackingRecord);
    if (Array.isArray(workers) && workers.length > 0) {
        state.workerOptions = getUniqueWorkers(workers);
    }
}

function finishCoreRender() {
    const errEl = document.getElementById('connection-error');
    if (errEl) errEl.classList.add('hidden');
    switchView(state.currentView);
}

function finishSecondaryRender() {
    populateWorkerControls();
    if (state.currentView === 'dashboard-view') renderDashboardSecondary();
    state.connectionReady = true;
    updateConnectionIndicator();
}

function normalizeTrackingRecord(record) {
    if (!record._ncdRawPhysical) {
        record._ncdRawPhysical = {};
        ['weight', 'bmi', 'waist', 'dtx', 'body_fat', 'muscle_mass', 'visceral_fat', 'body_age'].forEach(field => {
            record._ncdRawPhysical[field] = record[field] ?? '';
        });
    }
    record.id = parseInt(record.id);
    record.target_id = parseInt(record.target_id);
    ['weight', 'bmi', 'waist', 'dtx', 'body_fat', 'muscle_mass', 'visceral_fat', 'body_age'].forEach(field => {
        record[field] = parseFloat(record[field]) || 0;
    });
    [1, 2].forEach(weekIndex => {
        WEEKLY_SUMMARY_FIELDS.forEach(field => {
            const key = `week${weekIndex}_${field}`;
            if (record[key] !== undefined && record[key] !== '') record[key] = parseFloat(record[key]);
        });
    });
    return record;
}

// Custom CSV Parser (Robust Client-Side parsing)
function parseCSV(text) {
    const lines = text.split('\n');
    if (lines.length === 0 || !lines[0]) return [];
    
    // Extract headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = [];
        let insideQuote = false;
        let entry = '';
        
        for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"') {
                insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
                row.push(entry.trim());
                entry = '';
            } else {
                entry += char;
            }
        }
        row.push(entry.trim());
        
        const obj = {};
        headers.forEach((header, idx) => {
            const raw = idx < row.length ? row[idx] : '';
            let val = raw.replace(/^"|"$/g, '');
            // Handle newlines
            val = val.replace(/\\n/g, '\n');
            obj[header] = val;
        });
        result.push(obj);
    }
    return result;
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function displayValue(value, fallback = '-') {
    if (value === undefined || value === null || value === '') return fallback;
    return escapeHTML(value);
}

// Display-only Thai date formatter (does not mutate state/data)
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function formatThaiDate(value) {
    if (value === undefined || value === null || value === '') return '—';
    let d;
    if (value instanceof Date) {
        d = value;
    } else if (typeof value === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value.trim())) {
        const parts = value.trim().split('/');
        d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else {
        d = new Date(value);
    }
    if (isNaN(d.getTime())) return '—';
    return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// Display-only age (avoid "NaN ปี"); presentation layer only
function displayAge(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : '—';
}

function getUniqueWorkers(values) {
    const seen = new Set();
    return values
        .map(value => String(value || '').trim())
        .filter(value => {
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}

function getWorkerOptions() {
    return Array.isArray(state.workerOptions) && state.workerOptions.length > 0
        ? state.workerOptions
        : MOCK_WORKERS;
}

function getWorkerFilterOptions() {
    return getUniqueWorkers([
        ...getWorkerOptions(),
        ...state.targets.map(t => t.responsible_worker)
    ]);
}

function populateWorkerSelect(selectId, options = {}) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const currentValue = select.value;
    const defaultValue = options.defaultValue ?? 'all';
    const defaultLabel = options.defaultLabel ?? 'ทุกคณะทำงาน';

    select.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = defaultValue;
    defaultOption.textContent = defaultLabel;
    select.appendChild(defaultOption);

    const workers = options.includeAssignedWorkers ? getWorkerFilterOptions() : getWorkerOptions();
    workers.forEach(worker => {
        const option = document.createElement('option');
        option.value = worker;
        option.textContent = worker;
        select.appendChild(option);
    });

    select.value = [...select.options].some(option => option.value === currentValue) ? currentValue : defaultValue;
}

function populateWorkerControls() {
    populateWorkerSelect('filter-worker', { includeAssignedWorkers: true });
    populateWorkerSelect('dashboard-worker-filter', { includeAssignedWorkers: true });
    populateWorkerSelect('form-target-worker', { defaultValue: '', defaultLabel: 'เลือกคณะทำงาน' });
}

// --- Navigation / Routing ---
function switchView(viewId) {
    if (viewId === 'settings-view') return;
    // Hide all views
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Show active view
    const activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.classList.remove('hidden');
    }
    
    // Update active nav item (profile keeps its parent "targets" context)
    const navActiveId = viewId === 'profile-view' ? 'targets-view' : viewId;
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(item => {
        const isActive = item.getAttribute('data-view') === navActiveId;
        item.classList.toggle('active', isActive);
        if (isActive) {
            item.setAttribute('aria-current', 'page');
        } else {
            item.removeAttribute('aria-current');
        }
    });

    state.currentView = viewId;
    
    // Set headers titles
    updateHeaderTitles(viewId);
    
    // Render view-specific elements
    if (viewId === 'dashboard-view') {
        renderDashboard();
    } else if (viewId === 'targets-view') {
        renderTargetsList();
    } else if (viewId === 'registry-view') {
        renderRegistry();
    } else if (viewId === 'focusgroup-view') {
        renderFocusGroupView();
    } else if (viewId === 'profile-view') {
        renderProfileDetail();
    } else if (viewId === 'interpreter-view') {
        renderInterpreterView();
    }
}

function setMobileNavOpen(isOpen) {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('mobile-nav-overlay');
    const toggle = document.getElementById('mobile-nav-toggle');
    if (!sidebar || !overlay) return;

    sidebar.classList.toggle('-translate-x-full', !isOpen);
    overlay.classList.toggle('hidden', !isOpen);
    document.body.classList.toggle('overflow-hidden', isOpen);
    if (toggle) toggle.setAttribute('aria-expanded', String(isOpen));
}

function closeMobileNav() {
    setMobileNavOpen(false);
}

function isMobileViewport() {
    return Boolean(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
}

function updateHeaderTitles(viewId) {
    const title = document.getElementById('view-title');
    const subtitle = document.getElementById('view-subtitle');
    
    if (viewId === 'dashboard-view') {
        title.textContent = isMobileViewport() ? 'แผงควบคุม' : 'แผงควบคุม (Dashboard)';
        subtitle.textContent = 'สรุปสถิติสถานะสุขภาพและการเปลี่ยนแปลงพฤติกรรมภาพรวม';
    } else if (viewId === 'targets-view') {
        title.textContent = 'รายชื่อกลุ่มเป้าหมาย';
        subtitle.textContent = 'แสดงข้อมูลประชากรเป้าหมาย นำเข้า ติดตามผล และกรองกลุ่มเสี่ยง/กลุ่มป่วย';
    } else if (viewId === 'registry-view') {
        title.textContent = 'ทะเบียนจำแนกรหัสสี ปิงปองจราจร 7 สี';
        subtitle.textContent = 'ทะเบียนกลุ่มเป้าหมายจำแนกตามรหัสสีจากผลติดตามล่าสุด เรียงตามความรุนแรง พร้อมส่งออกรายงาน';
    } else if (viewId === 'focusgroup-view') {
        title.textContent = 'รายงาน Focus Group (องค์ประกอบร่างกาย)';
        subtitle.textContent = 'รายชื่อกลุ่มเป้าหมายที่มีค่าองค์ประกอบร่างกายผิดปกติ เพื่อแบ่งกลุ่มให้คำปรึกษารายกลุ่ม';
    } else if (viewId === 'profile-view') {
        title.textContent = 'ข้อมูลพฤติกรรมและสุขภาพรายบุคคล';
        subtitle.textContent = 'แสดงผลตรวจร่างกายและสรุปพฤติกรรมจากสมุดทุก 2 สัปดาห์ ตลอด 24 สัปดาห์';
    } else if (viewId === 'settings-view') {
        title.textContent = 'ตั้งค่าการเชื่อมต่อระบบ';
        subtitle.textContent = 'เชื่อมต่อฐานข้อมูล Google Sheets ของคุณผ่านระบบ Google Apps Script';
    } else if (viewId === 'interpreter-view') {
        title.textContent = 'เครื่องมือแปลผลวัดองค์ประกอบร่างกาย';
        subtitle.textContent = 'วิเคราะห์สัดส่วนไขมัน กล้ามเนื้อ ไขมันช่องท้อง และดัชนีมวลกายสำหรับ อสม.';
    }
}

// --- View 1: Dashboard Rendering ---
function getDashboardStats() {
    if (state.connectionMode === 'online' && state.apiDashboardStats) {
        return state.apiDashboardStats;
    }

    // Calculate locally (Demo Mode)
    const total = state.targets.length;
    const risk = state.targets.filter(t => t.type === 'กลุ่มเสี่ยง').length;
    const patient = state.targets.filter(t => t.type === 'กลุ่มป่วย').length;

    // Calculate improvements (Latest vs M0)
    let improvedBmi = 0;
    let improvedBp = 0;
    let improvedDtx = 0;
    let followUpCount = 0;

    // Group quarterly logs by target
    const grouped = {};
    state.quarterlyData.forEach(row => {
        if (!grouped[row.target_id]) grouped[row.target_id] = [];
        grouped[row.target_id].push(row);
    });

    Object.keys(grouped).forEach(tid => {
        const logs = grouped[tid];
        if (logs.length > 1) { // has M0 and follow-ups
            followUpCount++;
            // Sort by quarter
            logs.sort((a, b) => roundSortValue(a.quarter) - roundSortValue(b.quarter));

            const m0 = logs[0];
            const latest = logs[logs.length - 1];

            if (latest.bmi < m0.bmi) improvedBmi++;

            if (latest.bp && m0.bp) {
                const m0Sys = parseInt(m0.bp.toString().split('/')[0]);
                const latSys = parseInt(latest.bp.toString().split('/')[0]);
                if (latSys < m0Sys) improvedBp++;
            }

            if (latest.dtx < m0.dtx) improvedDtx++;
        }
    });

    const improvedBmiRate = followUpCount > 0 ? ((improvedBmi / followUpCount) * 100).toFixed(1) : 0;
    const improvedBpRate = followUpCount > 0 ? ((improvedBp / followUpCount) * 100).toFixed(1) : 0;
    const improvedDtxRate = followUpCount > 0 ? ((improvedDtx / followUpCount) * 100).toFixed(1) : 0;
    const overallRate = followUpCount > 0 ? (((improvedBmi + improvedBp + improvedDtx) / (followUpCount * 3)) * 100).toFixed(1) : 0;

    return {
        totalTargets: total,
        riskCount: risk,
        patientCount: patient,
        totalWithFollowUp: followUpCount,
        improvedBmiCount: improvedBmi,
        improvedBmiRate: improvedBmiRate,
        improvedBpCount: improvedBp,
        improvedBpRate: improvedBpRate,
        improvedDtxCount: improvedDtx,
        improvedDtxRate: improvedDtxRate,
        overallImprovedRate: overallRate
    };
}

function renderDashboard() {
    renderDashboardCore();
    renderDashboardSecondary();
}

// ส่วนหลักของ dashboard ที่พร้อมแสดงทันทีเมื่อ core data (stats) มา
function renderDashboardCore() {
    const stats = getDashboardStats();

    // Update stats cards UI
    document.getElementById('stat-total').textContent = stats.totalTargets;
    document.getElementById('stat-risk').textContent = stats.riskCount;
    document.getElementById('stat-risk-percent').textContent = stats.totalTargets > 0 ? ((stats.riskCount / stats.totalTargets) * 100).toFixed(0) + "%" : "0%";
    document.getElementById('stat-patient').textContent = stats.patientCount;
    document.getElementById('stat-patient-percent').textContent = stats.totalTargets > 0 ? ((stats.patientCount / stats.totalTargets) * 100).toFixed(0) + "%" : "0%";
    document.getElementById('stat-improved-rate').textContent = (stats.overallImprovedRate || stats.improvedBmiRate || 0) + "%";

    // Draw Pie Chart: Ratio
    drawRatioChart(stats.riskCount, stats.patientCount);

    // Draw Bar Chart: Improvement Indicators
    drawImprovementChart(stats.improvedBmiRate, stats.improvedBpRate, stats.improvedDtxRate);

    // Render village-level progress cards
    renderVillageProgress(stats);
    renderWorkerProgress(stats);
}

// ส่วนที่ต้องใช้ข้อมูล quarterly (pingpong / urgent / behavior) — hydrate ทีหลัง
function renderDashboardSecondary() {
    if (!state.secondaryReady) {
        renderSecondaryLoading();
        return;
    }
    renderPingpongDistribution();
    renderUrgentTargetsTable();
    renderOverallBehavior();
}

// สถานะ "กำลังโหลด" แบบ component-level สำหรับ section ที่รอข้อมูล secondary
function renderSecondaryLoading() {
    const note = document.getElementById('pingpong-dist-note');
    if (note) note.textContent = 'กำลังโหลดผลติดตามล่าสุด...';
    const bar = document.getElementById('pingpong-dist-bar');
    if (bar) bar.innerHTML = '<div class="w-full h-full bg-slate-200/70 rounded-full"></div>';
    const legend = document.getElementById('pingpong-dist-legend');
    if (legend) legend.innerHTML = '<p class="col-span-full text-sm text-on-surface-variant text-center py-2">กำลังโหลดข้อมูลเพิ่มเติม...</p>';

    const countLabel = document.getElementById('urgent-count-label');
    if (countLabel) countLabel.textContent = 'กำลังโหลด...';
    const tbody = document.getElementById('dashboard-urgent-list');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-sm text-on-surface-variant">กำลังโหลดรายการที่ควรติดตาม...</td></tr>';
    const cards = document.getElementById('dashboard-urgent-cards');
    if (cards) cards.innerHTML = '<div class="rounded-xl bg-white/60 border border-slate-100 p-4 text-sm text-on-surface-variant text-center">กำลังโหลดรายการที่ควรติดตาม...</div>';
}

// สถานะโหลดเริ่มต้น (ก่อน core data พร้อม) สำหรับ login / session-restore
function renderDashboardLoading() {
    const v = document.getElementById('village-progress-container');
    if (v) v.innerHTML = '<div class="col-span-full rounded-xl bg-white/50 border border-white/60 p-6 text-center text-sm text-on-surface-variant">กำลังโหลดข้อมูล...</div>';
    const w = document.getElementById('worker-progress-container');
    if (w) w.innerHTML = '<div class="col-span-full rounded-xl bg-white/50 border border-white/60 p-6 text-center text-sm text-on-surface-variant">กำลังโหลดข้อมูล...</div>';
    renderSecondaryLoading();
}

function renderPingpongDistribution() {
    const bar = document.getElementById('pingpong-dist-bar');
    const legend = document.getElementById('pingpong-dist-legend');
    const note = document.getElementById('pingpong-dist-note');
    if (!bar || !legend) return;

    // นับสีปัจจุบัน (จากผลติดตามล่าสุด) ของกลุ่มเป้าหมายที่มีข้อมูลพอแปลผล
    const counts = {};
    pingpongRules.scaleOrder.forEach(k => counts[k] = 0);
    let assessed = 0;
    state.targets.forEach(t => {
        const latest = getLatestLogForTarget(t.id);
        if (!latest) return;
        const pp = pingpongRules.classify(latest, t);
        if (pp.rank < 0) return;
        counts[pp.key]++;
        assessed++;
    });

    if (note) {
        note.textContent = assessed > 0
            ? `แปลผลจากผลติดตามล่าสุด · ประเมินได้ ${assessed} คน`
            : 'ยังไม่มีข้อมูลผลตรวจเพียงพอสำหรับแปลผล';
    }

    if (assessed === 0) {
        bar.innerHTML = '<div class="w-full bg-slate-200"></div>';
        legend.innerHTML = '<p class="col-span-full text-sm text-on-surface-variant text-center py-2">ยังไม่มีข้อมูลน้ำตาล/ความดันของกลุ่มเป้าหมาย</p>';
        return;
    }

    bar.innerHTML = pingpongRules.scaleOrder.map(k => {
        const c = pingpongRules.colors[k];
        const pct = (counts[k] / assessed) * 100;
        if (pct <= 0) return '';
        return `<div class="${c.barClass} h-full" style="width:${pct}%" title="${c.label} ${counts[k]} คน"></div>`;
    }).join('');

    legend.innerHTML = pingpongRules.scaleOrder.map(k => {
        const c = pingpongRules.colors[k];
        const pct = Math.round((counts[k] / assessed) * 100);
        return `
            <div class="rounded-xl border border-slate-100 bg-white/60 p-3">
                <div class="flex items-center gap-2 mb-1">
                    <span class="w-3 h-3 rounded-full" style="background:${c.dot}"></span>
                    <span class="text-[11px] font-bold text-on-surface">${c.label}</span>
                </div>
                <div class="font-stat-display text-xl font-extrabold text-on-surface">${counts[k]} <span class="text-xs font-semibold text-on-surface-variant">คน (${pct}%)</span></div>
                <div class="text-[10px] text-on-surface-variant">${c.sub}</div>
            </div>`;
    }).join('');
}

// --- ทะเบียนจำแนกรหัสสี (Color-Coded Registry) ---
function getRegistryRows() {
    const colorFilter = (document.getElementById('registry-filter-color') || {}).value || 'all';
    const villageFilter = (document.getElementById('registry-filter-village') || {}).value || 'all';

    const rows = state.targets.map(t => {
        const latest = getLatestLogForTarget(t.id);
        const color = latest ? pingpongRules.classify(latest, t) : pingpongRules.colors.unknown;
        return { target: t, latest: latest, color: color };
    }).filter(r => {
        if (villageFilter !== 'all' && getTargetVillage(r.target) !== villageFilter) return false;
        if (colorFilter !== 'all' && r.color.key !== colorFilter) return false;
        return true;
    });

    // เรียงตามความรุนแรง (สีรุนแรงก่อน) แล้วตามชื่อ ; ยังไม่ประเมินไปท้ายสุด
    rows.sort((a, b) => {
        const ra = a.color.rank < 0 ? -99 : a.color.rank;
        const rb = b.color.rank < 0 ? -99 : b.color.rank;
        if (rb !== ra) return rb - ra;
        return (a.target.name || '').localeCompare(b.target.name || '', 'th');
    });
    return rows;
}

function renderRegistry() {
    const tbody = document.getElementById('registry-tbody');
    const empty = document.getElementById('registry-empty');
    const count = document.getElementById('registry-count');
    if (!tbody) return;

    const rows = getRegistryRows();
    if (count) count.textContent = `${rows.length} ราย`;

    if (rows.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    tbody.innerHTML = rows.map((r, idx) => {
        const t = r.target, latest = r.latest, c = r.color;
        const diseases = (t.chronic_disease === 'ไม่มี' || !t.chronic_disease) ? '-' : t.chronic_disease;
        const dtx = latest && latest.dtx ? displayValue(latest.dtx) : '-';
        const bp = latest && latest.bp ? displayValue(latest.bp) : '-';
        const round = latest ? roundLabel(latest.quarter) : '-';
        const badge = c.rank >= 0
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] ${c.badgeClass}"><span class="w-2.5 h-2.5 rounded-full" style="background:${c.dot}"></span>${c.label} · ${c.sub}</span>`
            : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-[11px] bg-slate-100 text-slate-400 border border-slate-200">ยังไม่ประเมิน</span>`;
        const typeBadge = t.type === 'กลุ่มเสี่ยง'
            ? '<span class="badge badge-risk">กลุ่มเสี่ยง</span>'
            : '<span class="badge badge-patient">กลุ่มป่วย</span>';
        return `
            <tr class="border-b border-slate-100/70 hover:bg-primary/5 cursor-pointer transition-colors registry-row" data-id="${t.id}">
                <td class="py-3 px-3 text-on-surface-variant">${idx + 1}</td>
                <td class="py-3 px-3 font-bold text-on-surface whitespace-nowrap">${escapeHTML(t.name)}</td>
                <td class="py-3 px-3 text-on-surface-variant whitespace-nowrap">${displayValue(getTargetVillage(t))}</td>
                <td class="py-3 px-3">${typeBadge}</td>
                <td class="py-3 px-3 text-on-surface-variant">${escapeHTML(diseases)}</td>
                <td class="py-3 px-3 text-on-surface-variant whitespace-nowrap">${round}</td>
                <td class="py-3 px-3 tabular-nums">${dtx}</td>
                <td class="py-3 px-3 tabular-nums whitespace-nowrap">${bp}</td>
                <td class="py-3 px-3 whitespace-nowrap">${badge}</td>
                <td class="py-3 px-3 text-on-surface-variant whitespace-nowrap">${displayValue(getTargetWorker(t))}</td>
            </tr>`;
    }).join('');

    tbody.querySelectorAll('.registry-row').forEach(tr => {
        tr.addEventListener('click', () => viewTargetProfile(parseInt(tr.getAttribute('data-id'))));
    });
}

function exportRegistryCSV() {
    const rows = getRegistryRows();
    if (rows.length === 0) {
        showToast('ไม่มีข้อมูลให้ส่งออก', 'warning');
        return;
    }
    const headers = ['ลำดับ', 'ชื่อ-สกุล', 'หมู่บ้าน', 'กลุ่ม', 'โรคประจำตัว', 'รอบล่าสุด', 'DTX', 'BP', 'HbA1c', 'สีปิงปอง', 'ระดับ(rank)', 'คณะทำงาน'];
    const escapeCSV = (v) => {
        const s = (v === undefined || v === null) ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(',')];
    rows.forEach((r, idx) => {
        const t = r.target, latest = r.latest, c = r.color;
        lines.push([
            idx + 1,
            t.name,
            getTargetVillage(t),
            t.type,
            (t.chronic_disease === 'ไม่มี' || !t.chronic_disease) ? '' : t.chronic_disease,
            latest ? roundLabel(latest.quarter) : '',
            latest && latest.dtx ? latest.dtx : '',
            latest && latest.bp ? latest.bp : '',
            latest && latest.hba1c ? latest.hba1c : '',
            c.rank >= 0 ? c.label : 'ยังไม่ประเมิน',
            c.rank >= 0 ? c.rank : '',
            getTargetWorker(t)
        ].map(escapeCSV).join(','));
    });
    const csv = '﻿' + lines.join('\n'); // BOM ให้ Excel อ่านภาษาไทยถูก
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ทะเบียนรหัสสีปิงปอง_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- รายงาน Focus Group: กลุ่มค่าองค์ประกอบร่างกายผิดปกติ ---
const focusGroupMeta = {
    fat: {
        title: 'ไขมันร่างกายสูง',
        subtitle: 'สูงกว่าเป้าหมาย (ชาย 20% / หญิง 30%)',
        icon: 'elderly_woman',
        accent: 'text-rose-500',
        bar: 'bg-rose-500',
        format: (v) => `${Number(v).toFixed(1)}%`
    },
    visceral: {
        title: 'ไขมันช่องท้องสูง',
        subtitle: 'ระดับ ≥ 9 (สูง / สูงมาก)',
        icon: 'monitor_heart',
        accent: 'text-orange-500',
        bar: 'bg-orange-500',
        format: (v) => `ระดับ ${v}`
    },
    muscle: {
        title: 'กล้ามเนื้อลายต่ำ',
        subtitle: 'ต่ำกว่าเป้าหมาย (ชาย ≤ 30% / หญิง ≤ 25%)',
        icon: 'accessibility_new',
        accent: 'text-sky-500',
        bar: 'bg-sky-500',
        format: (v) => `${Number(v).toFixed(1)}%`
    }
};

function buildFocusGroupData() {
    const villageFilter = (document.getElementById('focusgroup-filter-village') || {}).value || 'all';
    const groups = {
        fat: [],
        visceral: [],
        muscle: []
    };

    state.targets.forEach(t => {
        if (villageFilter !== 'all' && getTargetVillage(t) !== villageFilter) return;

        const latest = getLatestLogForTarget(t.id);
        if (!latest) return;

        const gender = inferGender(t.name);
        const fatInterp = bodyCompRules.interpretBodyFat(latest.body_fat, gender);
        const visceralInterp = bodyCompRules.interpretVisceralFat(latest.visceral_fat);
        const muscleInterp = bodyCompRules.interpretSkeletalMuscle(latest.muscle_mass, gender);

        const base = {
            target: t,
            latest: latest,
            gender: gender,
            village: getTargetVillage(t),
            worker: getTargetWorker(t),
            round: roundLabel(latest.quarter)
        };

        if (fatInterp.label === 'สูงกว่าเป้าหมาย') {
            groups.fat.push({ ...base, value: latest.body_fat, interp: fatInterp.label });
        }
        if (visceralInterp.label === 'สูง' || visceralInterp.label === 'สูงมาก') {
            groups.visceral.push({ ...base, value: latest.visceral_fat, interp: visceralInterp.label });
        }
        if (muscleInterp.label === 'ต่ำกว่าเป้าหมาย') {
            groups.muscle.push({ ...base, value: latest.muscle_mass, interp: muscleInterp.label });
        }
    });

    ['fat', 'visceral', 'muscle'].forEach(key => {
        groups[key].sort((a, b) => (a.target.name || '').localeCompare(b.target.name || '', 'th'));
    });
    return groups;
}

function renderFocusGroupView() {
    const container = document.getElementById('focusgroup-groups-container');
    if (!container) return;

    const groups = buildFocusGroupData();
    const totalAbnormal = groups.fat.length + groups.visceral.length + groups.muscle.length;

    const groupCard = (key) => {
        const meta = focusGroupMeta[key];
        const items = groups[key];
        const rows = items.map((it, idx) => `
            <tr class="border-b border-slate-100/70 hover:bg-primary/5 transition-colors focusgroup-row" data-id="${it.target.id}">
                <td class="py-3 px-3 text-on-surface-variant">${idx + 1}</td>
                <td class="py-3 px-3 font-bold text-on-surface whitespace-nowrap">${escapeHTML(it.target.name)}</td>
                <td class="py-3 px-3 text-on-surface-variant whitespace-nowrap">${displayValue(it.village)}</td>
                <td class="py-3 px-3 text-on-surface-variant whitespace-nowrap">${displayValue(it.worker)}</td>
                <td class="py-3 px-3 tabular-nums font-semibold ${meta.accent} whitespace-nowrap">${meta.format(it.value)}</td>
                <td class="py-3 px-3 text-on-surface-variant whitespace-nowrap">${displayValue(it.round)}</td>
            </tr>`).join('');

        const empty = items.length === 0
            ? `<tr><td colspan="6" class="py-6 px-3 text-center text-on-surface-variant">ไม่มีบุคคลในกลุ่มนี้ตามเกณฑ์ปัจจุบัน</td></tr>`
            : '';

        return `
            <div class="glass-card rounded-2xl p-6">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-white/60 border border-white/60 flex items-center justify-center ${meta.accent}">
                            <span class="material-symbols-outlined">${meta.icon}</span>
                        </div>
                        <div>
                            <h3 class="font-headline text-base font-bold text-on-surface">${meta.title}</h3>
                            <p class="text-xs text-on-surface-variant">${meta.subtitle}</p>
                        </div>
                    </div>
                    <span class="font-stat-display text-lg font-extrabold text-on-surface shrink-0">${items.length} คน</span>
                </div>
                <div class="w-full h-1.5 rounded-full overflow-hidden bg-slate-100 mb-4">
                    <div class="h-full ${meta.bar} rounded-full transition-all duration-500" style="width: ${totalAbnormal > 0 ? Math.round((items.length / totalAbnormal) * 100) : 0}%"></div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-100/50 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                                <th class="py-2.5 px-3 rounded-l-lg">#</th>
                                <th class="py-2.5 px-3">ชื่อ-สกุล</th>
                                <th class="py-2.5 px-3">หมู่บ้าน</th>
                                <th class="py-2.5 px-3">คณะทำงาน (อสม.)</th>
                                <th class="py-2.5 px-3">ค่า</th>
                                <th class="py-2.5 px-3 rounded-r-lg">รอบล่าสุด</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">${rows}${empty}</tbody>
                    </table>
                </div>
            </div>`;
    };

    container.innerHTML = groupCard('fat') + groupCard('visceral') + groupCard('muscle');

    container.querySelectorAll('.focusgroup-row').forEach(tr => {
        tr.addEventListener('click', () => viewTargetProfile(parseInt(tr.getAttribute('data-id'))));
    });
}

function buildFocusGroupText() {
    const groups = buildFocusGroupData();
    const villageFilter = (document.getElementById('focusgroup-filter-village') || {}).value || 'all';
    const villageLabel = villageFilter === 'all' ? 'ทุกหมู่บ้าน' : villageFilter;
    const dateText = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const lines = [];
    lines.push('NCD Focus PTN - รายงานกลุ่ม Focus Group (องค์ประกอบร่างกาย)');
    lines.push(`หมู่บ้าน: ${villageLabel} | วันที่ ${dateText}`);
    lines.push('==========================================');

    ['fat', 'visceral', 'muscle'].forEach(key => {
        const meta = focusGroupMeta[key];
        const items = groups[key];
        lines.push('');
        lines.push(`${meta.title} (${items.length} คน)`);
        if (items.length === 0) {
            lines.push('- ไม่มีบุคคลในกลุ่มนี้');
        } else {
            items.forEach((it, idx) => {
                lines.push(`${idx + 1}. ${it.target.name} | ${it.village} | ${it.worker} | ${meta.format(it.value)}`);
            });
        }
    });

    lines.push('');
    lines.push('หมายเหตุ: ใช้ผลติดตามล่าสุดของแต่ละคน เกณฑ์เดียวกับเครื่องมือแปลผล');
    return lines.join('\n');
}

function fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (err) {
        ok = false;
    }
    document.body.removeChild(ta);
    if (ok) showToast('คัดลอกข้อความรายงานแล้ว นำไปวางใน Line group ได้เลย');
    else showToast('คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง', 'danger');
}

async function copyFocusGroupToClipboard() {
    const text = buildFocusGroupText();
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            showToast('คัดลอกข้อความรายงานแล้ว นำไปวางใน Line group ได้เลย');
            return;
        }
    } catch (err) {
        console.warn('Clipboard API ล้มเหลว ใช้ fallback:', err);
    }
    fallbackCopyText(text);
}

function exportFocusGroupExcel() {
    if (typeof XLSX === 'undefined') {
        showToast('โหลดไลบรารี Excel ไม่สำเร็จ กรุณาเช็คอินเทอร์เน็ตแล้วลองใหม่', 'danger');
        return;
    }

    const groups = buildFocusGroupData();
    const wb = XLSX.utils.book_new();
    const headerRow = ['ลำดับ', 'ชื่อ-สกุล', 'หมู่บ้าน', 'คณะทำงาน (อสม.)', 'ค่า', 'รอบล่าสุด'];

    ['fat', 'visceral', 'muscle'].forEach(key => {
        const meta = focusGroupMeta[key];
        const rows = [headerRow];
        groups[key].forEach((it, idx) => {
            rows.push([
                idx + 1,
                it.target.name,
                it.village,
                it.worker,
                meta.format(it.value),
                it.round
            ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, meta.title.slice(0, 31));
    });

    XLSX.writeFile(wb, `รายงาน_Focus_Group_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('ส่งออกไฟล์ Excel เรียบร้อยแล้ว');
}

function renderVillageProgress(stats = {}) {
    const container = document.getElementById('village-progress-container');
    if (!container) return;

    const villageSummary = Array.isArray(stats.villageSummary) ? stats.villageSummary : calculateVillageSummary();
    container.innerHTML = villageSummary.map(item => {
        const progressWidth = Math.min(Math.max(item.progressRate, 0), 100);
        const hasRemaining = item.remaining > 0;
        return `
            <div class="bg-white/50 border border-white/60 rounded-xl p-4 shadow-sm">
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div class="min-w-0">
                        <h4 class="font-headline font-bold text-primary text-base">${displayValue(item.village)}</h4>
                        <p class="text-xs text-on-surface-variant">กลุ่มเป้าหมาย ${item.total} คน</p>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="font-stat-display text-2xl font-extrabold text-on-surface">${item.progressRate}%</div>
                        <span class="text-[10px] text-on-surface-variant font-semibold">มีข้อมูลติดตาม</span>
                    </div>
                </div>
                <div class="w-full h-2.5 bg-outline-variant/30 rounded-full overflow-hidden mb-3">
                    <div class="h-full bg-primary rounded-full transition-all duration-500" style="width: ${progressWidth}%"></div>
                </div>
                <div class="rounded-lg ${hasRemaining ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-100'} p-2.5 mb-2 flex items-center justify-between">
                    <span class="text-xs font-semibold ${hasRemaining ? 'text-amber-800' : 'text-emerald-800'}">ยังไม่ครบ (ต้องติดตาม)</span>
                    <strong class="${hasRemaining ? 'text-risk-warning' : 'text-emerald-700'} text-lg">${item.remaining} คน</strong>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs">
                    <div class="rounded-lg bg-slate-50/80 p-2">
                        <span class="block text-on-surface-variant">ติดตามแล้ว</span>
                        <strong class="text-on-surface">${item.followed}</strong>
                    </div>
                    <div class="rounded-lg bg-slate-50/80 p-2">
                        <span class="block text-on-surface-variant">กลุ่มเสี่ยง</span>
                        <strong class="text-risk-warning">${item.risk}</strong>
                    </div>
                    <div class="rounded-lg bg-slate-50/80 p-2">
                        <span class="block text-on-surface-variant">กลุ่มป่วย</span>
                        <strong class="text-risk-danger">${item.patient}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderWorkerProgress(stats = {}) {
    const container = document.getElementById('worker-progress-container');
    if (!container) return;

    const workerFilter = document.getElementById('dashboard-worker-filter');
    const selectedWorker = workerFilter ? workerFilter.value : 'all';
    const summary = Array.isArray(stats.workerSummary) ? stats.workerSummary : calculateWorkerSummary();
    const filteredSummary = summary.filter(item => selectedWorker === 'all' || item.worker === selectedWorker);

    if (filteredSummary.length === 0) {
        container.innerHTML = `<div class="col-span-full rounded-xl bg-white/50 border border-white/60 p-6 text-center text-on-surface-variant font-semibold">ไม่พบข้อมูลคณะทำงานตามตัวกรอง</div>`;
        return;
    }

    container.innerHTML = filteredSummary.map(item => {
        const progressWidth = Math.min(Math.max(item.progressRate || 0, 0), 100);
        return `
            <div class="bg-white/50 border border-white/60 rounded-xl p-4 shadow-sm">
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div class="min-w-0">
                        <h4 class="font-headline font-bold text-primary text-sm leading-snug">${displayValue(item.worker)}</h4>
                        <p class="text-xs text-on-surface-variant">รับผิดชอบ ${item.total} คน</p>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="font-stat-display text-xl font-extrabold text-on-surface">${item.progressRate}%</div>
                        <span class="text-[10px] text-on-surface-variant font-semibold">ติดตามแล้ว</span>
                    </div>
                </div>
                <div class="w-full h-2.5 bg-outline-variant/30 rounded-full overflow-hidden mb-3">
                    <div class="h-full bg-tertiary-container rounded-full transition-all duration-500" style="width: ${progressWidth}%"></div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="rounded-lg bg-slate-50/80 p-2">
                        <span class="block text-on-surface-variant">ติดตามแล้ว</span>
                        <strong class="text-on-surface">${item.followed} คน</strong>
                    </div>
                    <div class="rounded-lg bg-slate-50/80 p-2">
                        <span class="block text-on-surface-variant">ยังไม่ครบ</span>
                        <strong class="text-risk-warning">${item.remaining} คน</strong>
                    </div>
                    <div class="rounded-lg bg-slate-50/80 p-2">
                        <span class="block text-on-surface-variant">กลุ่มเสี่ยง</span>
                        <strong class="text-risk-warning">${item.risk} คน</strong>
                    </div>
                    <div class="rounded-lg bg-slate-50/80 p-2">
                        <span class="block text-on-surface-variant">กลุ่มป่วย</span>
                        <strong class="text-risk-danger">${item.patient} คน</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function drawRatioChart(risk, patient) {
    const ctx = document.getElementById('ratio-chart').getContext('2d');
    if (state.charts.ratio) state.charts.ratio.destroy();
    
    const isDark = document.body.classList.contains('dark');
    
    state.charts.ratio = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['กลุ่มเสี่ยง', 'กลุ่มป่วย'],
            datasets: [{
                data: [risk, patient],
                backgroundColor: ['#f59e0b', '#ef4444'],
                borderWidth: 2,
                borderColor: isDark ? '#111a36' : '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: isDark ? '#94a3b8' : '#64748b',
                        font: { family: 'Sarabun', size: 12, weight: 600 }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

function drawImprovementChart(bmi, bp, dtx) {
    const canvas = document.getElementById('improvement-chart');
    const empty = document.getElementById('improvement-empty');
    if (state.charts.improvement) state.charts.improvement.destroy();
    
    const values = [parseFloat(bmi) || 0, parseFloat(bp) || 0, parseFloat(dtx) || 0];
    const hasData = values.some(v => v > 0);
    if (!hasData) {
        if (canvas) canvas.classList.add('hidden');
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (canvas) canvas.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    
    const ctx = canvas.getContext('2d');
    const isDark = document.body.classList.contains('dark');
    
    state.charts.improvement = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['ดัชนีมวลกาย (BMI) ลดลง', 'ความดันโลหิต (BP) ลดลง', 'ระดับน้ำตาล (DTX) ลดลง'],
            datasets: [{
                label: 'สัดส่วนคนไข้ที่ดีขึ้น (%)',
                data: [parseFloat(bmi), parseFloat(bp), parseFloat(dtx)],
                backgroundColor: ['#10b981', '#3b82f6', '#06b6d4'],
                borderRadius: 8,
                barThickness: 30
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: isDark ? '#f1f5f9' : '#1e293b', font: { family: 'Sarabun', size: 12, weight: 600 } }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderUrgentTargetsTable() {
    const tbody = document.getElementById('dashboard-urgent-list');
    const cards = document.getElementById('dashboard-urgent-cards');
    const countLabel = document.getElementById('urgent-count-label');
    
    // Find urgent targets (BP > 140/90 or DTX > 160) from latest quarterly data
    const latestLogs = {};
    
    state.quarterlyData.forEach(row => {
        const tid = row.target_id;
        if (!latestLogs[tid] || roundSortValue(row.quarter) > roundSortValue(latestLogs[tid].quarter)) {
            latestLogs[tid] = row;
        }
    });
    
    const urgent = [];
    Object.keys(latestLogs).forEach(tid => {
        const log = latestLogs[tid];
        const target = state.targets.find(t => t.id === parseInt(tid));
        if (!target) return;
        
        let isUrgent = false;
        let sys = 0, dia = 0;
        if (log.bp) {
            const parts = log.bp.toString().split('/');
            sys = parseInt(parts[0]);
            dia = parseInt(parts[1]);
            if (sys >= 140 || dia >= 90) isUrgent = true;
        }
        if (log.dtx >= 160) isUrgent = true;
        
        if (isUrgent) {
            urgent.push({
                target: target,
                log: log,
                bp: log.bp,
                dtx: log.dtx,
                sys: sys,
                dia: dia
            });
        }
    });
    
    // Sort by sugar or pressure (descending)
    urgent.sort((a, b) => b.dtx - a.dtx || b.sys - a.sys);
    
    const displayList = urgent.slice(0, 5); // top 5
    
    if (countLabel) {
        const total = urgent.length;
        if (total === 0) {
            countLabel.textContent = '';
        } else if (total > displayList.length) {
            countLabel.textContent = `พบ ${total} ราย • แสดง ${displayList.length} รายแรก`;
        } else {
            countLabel.textContent = `พบ ${total} ราย`;
        }
    }
    
    const emptyRow = `<tr><td colspan="5" class="py-6 text-center text-sm text-on-surface-variant"><span class="material-symbols-outlined align-middle text-[18px]">check_circle</span> ไม่พบรายการที่ต้องติดตามเร่งด่วน</td></tr>`;
    const emptyCard = `<div class="rounded-xl bg-emerald-50/60 border border-emerald-100 p-4 text-sm text-emerald-800 flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">check_circle</span> ไม่พบรายการที่ต้องติดตามเร่งด่วน</div>`;
    
    // Desktop table
    if (tbody) {
        tbody.innerHTML = '';
        if (displayList.length === 0) {
            tbody.innerHTML = emptyRow;
        } else {
            displayList.forEach(item => {
                const tr = document.createElement('tr');
                const bpClass = (item.sys >= 140 || item.dia >= 90) ? 'text-danger font-bold' : '';
                const dtxClass = item.dtx >= 160 ? 'text-danger font-bold' : '';
                const badgeClass = item.target.type === 'กลุ่มเสี่ยง' ? 'badge-risk' : 'badge-patient';
                
                tr.innerHTML = `
                    <td class="py-3 px-4"><strong>${displayValue(item.target.name)}</strong></td>
                    <td class="py-3 px-3"><span class="px-2.5 py-0.5 rounded-full font-bold text-[10px] ${badgeClass}">${displayValue(item.target.type)}</span></td>
                    <td class="py-3 px-3"><span class="${bpClass}">${displayValue(item.bp)}</span></td>
                    <td class="py-3 px-3"><span class="${dtxClass}">${displayValue(item.dtx)} มก.</span></td>
                    <td class="py-3 px-4 text-center">
                        <button class="text-primary hover:text-primary-container font-semibold inline-flex items-center gap-1 view-profile-btn" data-id="${item.target.id}">
                            <span class="material-symbols-outlined text-[18px]">visibility</span>
                            <span>ดูข้อมูล</span>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
    
    // Mobile compact cards (same data, no table)
    if (cards) {
        cards.innerHTML = '';
        if (displayList.length === 0) {
            cards.innerHTML = emptyCard;
        } else {
            cards.innerHTML = displayList.map(item => {
                const bpBad = item.sys >= 140 || item.dia >= 90;
                const dtxBad = item.dtx >= 160;
                return `
                    <div class="rounded-xl bg-white/60 border border-rose-100 p-3 flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full ${item.target.type === 'กลุ่มเสี่ยง' ? 'bg-risk-warning/15 text-risk-warning' : 'bg-risk-danger/15 text-risk-danger'} flex items-center justify-center font-bold shrink-0">
                            ${displayValue((item.target.name || '').trim().charAt(0) || '·')}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-on-surface text-sm truncate">${displayValue(item.target.name)}</div>
                            <div class="text-xs text-on-surface-variant mt-0.5">
                                <span class="${bpBad ? 'text-risk-danger font-bold' : ''}">BP ${displayValue(item.bp)}</span>
                                <span class="mx-1">·</span>
                                <span class="${dtxBad ? 'text-risk-danger font-bold' : ''}">DTX ${displayValue(item.dtx)}</span>
                            </div>
                        </div>
                        <button class="view-profile-btn text-primary font-semibold shrink-0 inline-flex items-center gap-1 text-xs" data-id="${item.target.id}">
                            <span class="material-symbols-outlined text-[18px]">visibility</span><span>ดู</span>
                        </button>
                    </div>`;
            }).join('');
        }
    }
    
    // Add event click to "ดูข้อมูล" buttons (table + cards)
    document.querySelectorAll('#dashboard-urgent-list .view-profile-btn, #dashboard-urgent-cards .view-profile-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            viewTargetProfile(id);
        });
    });
}

function renderOverallBehavior() {
    // ใช้เฉพาะค่าสรุปจากสมุดกระดาษ โดยเลือกสัปดาห์ล่าสุดของแต่ละคน
    const latestLogs = {};
    state.quarterlyData.filter(row => row.week2_exercise_minutes !== undefined && row.week2_exercise_minutes !== '').forEach(row => {
        const tid = row.target_id;
        if (!latestLogs[tid] || roundSortValue(row.quarter) > roundSortValue(latestLogs[tid].quarter)) {
            latestLogs[tid] = row;
        }
    });

    const logsArray = Object.values(latestLogs);
    const total = logsArray.length;
    
    const exerciseCount = logsArray.filter(l => Number(l.week2_exercise_minutes) >= 150).length;
    const veggieCount = logsArray.filter(l => Number(l.week2_healthy_menu_days) >= 7).length;
    const sleepCount = logsArray.filter(l => Number(l.week2_sleep_avg) >= 7).length;
    const smokingCount = logsArray.filter(l => {
        const scores = [l.week2_avoid_sweet, l.week2_avoid_oil, l.week2_avoid_salt].map(Number);
        return scores.every(Number.isFinite) && scores.reduce((sum, score) => sum + score, 0) / 3 >= 3.5;
    }).length;
    
    const rate = count => total > 0 ? ((count / total) * 100).toFixed(0) : '0';
    const exerciseRate = rate(exerciseCount);
    const veggieRate = rate(veggieCount);
    const sleepRate = rate(sleepCount);
    const smokingRate = rate(smokingCount);
    
    // Update progress bars
    document.getElementById('bar-exercise').style.width = exerciseRate + "%";
    document.getElementById('val-exercise').textContent = exerciseRate + "%";
    
    document.getElementById('bar-veggie').style.width = veggieRate + "%";
    document.getElementById('val-veggie').textContent = veggieRate + "%";
    
    document.getElementById('bar-sleep').style.width = sleepRate + "%";
    document.getElementById('val-sleep').textContent = sleepRate + "%";
    
    document.getElementById('bar-smoking').style.width = smokingRate + "%";
    document.getElementById('val-smoking').textContent = smokingRate + "%";
}

// --- View 2: Targets List Rendering ---
function renderTargetsList() {
    const tableBody = document.getElementById('targets-table-body');
    const mobileList = document.getElementById('targets-mobile-list');
    const emptyState = document.getElementById('targets-empty');
    const resultCount = document.getElementById('targets-result-count');
    
    const searchVal = document.getElementById('target-search-input').value.toLowerCase();
    const filterType = document.getElementById('filter-type').value;
    const filterVillage = document.getElementById('filter-village').value;
    const filterWorker = document.getElementById('filter-worker').value;
    const filterDisease = document.getElementById('filter-disease').value;
    
    // Group latest quarterly logs for disease checking
    const latestLogs = {};
    state.quarterlyData.forEach(row => {
        const tid = row.target_id;
        if (!latestLogs[tid] || roundSortValue(row.quarter) > roundSortValue(latestLogs[tid].quarter)) {
            latestLogs[tid] = row;
        }
    });

    // Filter targets
    let filtered = state.targets.filter(t => {
        // Search Name & Address
        const village = getTargetVillage(t);
        const worker = getTargetWorker(t);
        const matchSearch = (t.name || '').toLowerCase().includes(searchVal)
            || (t.address || '').toLowerCase().includes(searchVal)
            || village.toLowerCase().includes(searchVal)
            || worker.toLowerCase().includes(searchVal);
        
        // Filter Type (Risk vs Patient)
        const matchType = filterType === 'all' || t.type === filterType;

        // Filter Village
        const matchVillage = filterVillage === 'all' || village === filterVillage;

        // Filter responsible worker
        const matchWorker = filterWorker === 'all' || worker === filterWorker;
        
        // Filter Disease
        let matchDisease = true;
        if (filterDisease !== 'all') {
            const log = latestLogs[t.id] || {};
            if (filterDisease === 'DM') {
                const chronicDisease = t.chronic_disease || '';
                matchDisease = chronicDisease.includes('DM') || (log.dtx >= 126);
            } else if (filterDisease === 'HT') {
                const chronicDisease = t.chronic_disease || '';
                matchDisease = chronicDisease.includes('HT') || (log.bp && parseInt(log.bp.toString().split('/')[0]) >= 130);
            } else if (filterDisease === 'Obesity') {
                matchDisease = log.bmi >= 25 || (t.co_morbidity && t.co_morbidity.includes('อ้วน'));
            } else if (filterDisease === 'Dyslipidemia') {
                const chronicDisease = t.chronic_disease || '';
                matchDisease = chronicDisease.toLowerCase().includes('lipid') || chronicDisease.includes('ไขมัน');
            }
        }
        
        return matchSearch && matchType && matchVillage && matchWorker && matchDisease;
    });
    
    // Pagination logic
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / state.pageSize) || 1;
    
    // Bounds check current page
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;
    
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const pageItems = filtered.slice(startIndex, startIndex + state.pageSize);
    
    // Page indicator text
    document.getElementById('page-indicator').textContent = `หน้า ${state.currentPage} / ${totalPages} (รวม ${totalItems} คน)`;
    
    // Result count
    if (resultCount) {
        const hasFilter = Boolean(searchVal || filterType !== 'all' || filterVillage !== 'all' || filterWorker !== 'all' || filterDisease !== 'all');
        resultCount.textContent = (hasFilter && totalItems !== state.targets.length)
            ? `พบ ${totalItems} รายจาก ${state.targets.length} ราย`
            : `พบ ${totalItems} ราย`;
    }
    
    // Empty state
    if (totalItems === 0) {
        const msg = state.targets.length === 0
            ? 'ยังไม่มีรายชื่อกลุ่มเป้าหมาย'
            : (searchVal ? 'ไม่พบรายชื่อที่ตรงกับคำค้น' : 'ไม่พบข้อมูลตามเงื่อนไขที่เลือก');
        if (tableBody) tableBody.innerHTML = '';
        if (emptyState) { emptyState.textContent = msg; emptyState.classList.remove('hidden'); }
        if (mobileList) mobileList.innerHTML = `<div class="text-center text-on-surface-variant font-semibold py-10 px-4">${msg}</div>`;
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');
    
    // Single source of render data (desktop table + mobile cards)
    const renderItems = pageItems.map(t => {
        const log = latestLogs[t.id] || null;
        return {
            t: t,
            log: log,
            pp: log ? pingpongRules.classify(log, t) : pingpongRules.colors.unknown,
            village: getTargetVillage(t),
            worker: getTargetWorker(t)
        };
    });
    
    if (tableBody) tableBody.innerHTML = renderItems.map(buildTargetRow).join('');
    if (mobileList) mobileList.innerHTML = renderItems.map(buildTargetCard).join('');
    
    // Event delegation (view profile + record follow-up)
    document.querySelectorAll('#targets-table-body .view-profile-btn, #targets-table-body .record-btn, #targets-mobile-list .view-profile-btn, #targets-mobile-list .record-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            if (e.currentTarget.classList.contains('record-btn')) {
                state.selectedTargetId = id;
                state.selectedTargetQuarterly = state.quarterlyData.filter(q => String(q.target_id) === String(id));
                openQuarterlyModal(id);
            } else {
                viewTargetProfile(id);
            }
        });
    });
}

function buildTargetRow({ t, log, pp, village }) {
    const badge = t.type === 'กลุ่มเสี่ยง'
        ? 'bg-risk-warning/15 text-risk-warning border-risk-warning/30'
        : 'bg-risk-danger/15 text-risk-danger border-risk-danger/30';
    const bp = log && log.bp ? displayValue(log.bp) : '—';
    const dtx = log && log.dtx ? displayValue(log.dtx) : '—';
    const date = formatThaiDate(log ? log.date : null);
    const statusPill = log
        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] ${pp.badgeClass}"><span class="w-2 h-2 rounded-full" style="background:${pp.dot}"></span>${pp.label}</span>`
        : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] bg-slate-100 text-slate-500 border border-slate-200"><span class="w-2 h-2 rounded-full bg-slate-300"></span>ยังไม่ติดตาม</span>`;
    const avatarColor = t.type === 'กลุ่มเสี่ยง' ? 'bg-risk-warning/15 text-risk-warning' : 'bg-risk-danger/15 text-risk-danger';
    return `
        <tr class="cursor-pointer">
            <td class="py-3 px-4">
                <div class="flex items-center gap-2.5">
                    <span class="w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center font-bold text-sm shrink-0">${displayValue((t.name || '').trim().charAt(0) || '·')}</span>
                    <strong class="text-on-surface" title="${displayValue(t.name)}">${displayValue(t.name)}</strong>
                </div>
            </td>
            <td class="py-3 px-3 text-on-surface-variant">${displayAge(t.age)}</td>
            <td class="py-3 px-3 text-on-surface-variant">${displayValue(village)}</td>
            <td class="py-3 px-3"><span class="inline-block px-2 py-0.5 rounded-full font-bold text-[11px] border ${badge}">${displayValue(t.type)}</span></td>
            <td class="py-3 px-3 font-semibold">${bp}</td>
            <td class="py-3 px-3 font-semibold">${dtx}</td>
            <td class="py-3 px-3">${statusPill}</td>
            <td class="py-3 px-3 text-on-surface-variant text-xs whitespace-nowrap">${date}</td>
            <td class="py-3 px-3 text-right whitespace-nowrap">
                <button class="record-btn text-primary hover:text-primary-container font-semibold inline-flex items-center gap-1 text-xs mr-2" data-id="${t.id}" aria-label="บันทึกผล"><span class="material-symbols-outlined text-[18px]">edit_note</span>บันทึกผล</button>
                <button class="view-profile-btn text-on-surface-variant hover:text-primary font-semibold inline-flex items-center gap-1 text-xs" data-id="${t.id}" aria-label="ดูข้อมูล"><span class="material-symbols-outlined text-[18px]">visibility</span>ดูข้อมูล</button>
            </td>
        </tr>`;
}

function buildTargetCard({ t, log, pp, village }) {
    const badge = t.type === 'กลุ่มเสี่ยง'
        ? 'bg-risk-warning/15 text-risk-warning border-risk-warning/30'
        : 'bg-risk-danger/15 text-risk-danger border-risk-danger/30';
    const bp = log && log.bp ? displayValue(log.bp) : '—';
    const dtx = log && log.dtx ? displayValue(log.dtx) : '—';
    const date = formatThaiDate(log ? log.date : null);
    const statusPill = log
        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${pp.badgeClass}"><span class="w-2 h-2 rounded-full" style="background:${pp.dot}"></span>${pp.label}</span>`
        : `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] bg-slate-100 text-slate-500"><span class="w-2 h-2 rounded-full bg-slate-300"></span>ยังไม่ติดตาม</span>`;
    const avatarColor = t.type === 'กลุ่มเสี่ยง' ? 'bg-risk-warning/15 text-risk-warning' : 'bg-risk-danger/15 text-risk-danger';
    return `
        <div class="target-card bg-white/70 backdrop-blur border border-white/60 rounded-2xl p-3.5 shadow-sm">
            <div class="flex items-start gap-2.5">
                <span class="w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center font-bold shrink-0">${displayValue((t.name || '').trim().charAt(0) || '·')}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <h4 class="font-headline font-bold text-on-surface text-base truncate">${displayValue(t.name)}</h4>
                        <span class="inline-block px-2 py-0.5 rounded-full font-bold text-[10px] border ${badge} shrink-0">${displayValue(t.type)}</span>
                    </div>
                    <p class="text-xs text-on-surface-variant mt-0.5">อายุ ${displayAge(t.age)} ปี • ${displayValue(village)}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 mt-2.5">
                ${statusPill}
                <span class="text-[11px] text-on-surface-variant ml-auto">ล่าสุด ${date}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2.5">
                <div class="rounded-lg bg-slate-50/80 p-1.5">
                    <span class="block text-[10px] text-on-surface-variant">ความดัน (BP)</span>
                    <strong class="text-sm text-on-surface">${bp}</strong>
                </div>
                <div class="rounded-lg bg-slate-50/80 p-1.5">
                    <span class="block text-[10px] text-on-surface-variant">น้ำตาล (DTX)</span>
                    <strong class="text-sm text-on-surface">${dtx}</strong>
                </div>
            </div>
            <div class="flex gap-2 mt-2.5">
                <button class="view-profile-btn flex-1 bg-primary/10 hover:bg-primary/20 text-primary font-semibold py-2.5 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5 text-xs" data-id="${t.id}"><span class="material-symbols-outlined text-[16px]">visibility</span>ดูข้อมูล</button>
                <button class="record-btn flex-1 bg-primary text-white font-semibold py-2.5 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5 text-xs" data-id="${t.id}"><span class="material-symbols-outlined text-[16px]">edit_note</span>บันทึกผล</button>
            </div>
        </div>`;
}

// --- View 3: Target Profile Rendering ---
async function viewTargetProfile(targetId) {
    state.selectedTargetId = targetId;
    
    showSpinner(true, 'กำลังโหลดข้อมูลรายบุคคล...');
    try {
        if (state.connectionMode === 'online') {
            // Fetch target details from API
            const json = await postToAPI('getTargetDetail', { id: targetId });
            if (!json.success) throw new Error(json.error);
            
            state.selectedTargetProfile = json.data.profile;
            state.selectedTargetQuarterly = json.data.quarterly;
            state.selectedTargetDailyLogs = json.data.dailyLogs;

            // Update report preview from the just-read profile without losing raw blanks.
            state.quarterlyExportData = state.quarterlyExportData
                .filter(row => String(row.target_id) !== String(targetId))
                .concat(json.data.quarterly.map(row => ({ ...row })));
            
            // Format numeric values
            state.selectedTargetProfile.id = parseInt(state.selectedTargetProfile.id);
            state.selectedTargetProfile.age = parseInt(state.selectedTargetProfile.age);
            state.selectedTargetProfile.height = parseFloat(state.selectedTargetProfile.height);
            state.selectedTargetProfile.responsible_worker = state.selectedTargetProfile.responsible_worker || '';
            state.targets = state.targets.map(target => String(target.id) === String(targetId) ? { ...state.selectedTargetProfile } : target);
            
            state.selectedTargetQuarterly.forEach(normalizeTrackingRecord);
            
            state.selectedTargetDailyLogs.forEach(d => {
                d.id = parseInt(d.id);
                d.target_id = parseInt(d.target_id);
                d.avoid_sweet = parseInt(d.avoid_sweet);
                d.avoid_oil = parseInt(d.avoid_oil);
                d.avoid_salt = parseInt(d.avoid_salt);
                d.exercise_duration = parseInt(d.exercise_duration);
                d.water = parseInt(d.water);
                d.sleep_hours = parseFloat(d.sleep_hours);
            });
        } else {
            throw new Error('ระบบใช้งานจริงต้องเชื่อมต่อฐานข้อมูลเท่านั้น');
        }

        state.selectedTargetQuarterly.sort((a, b) => roundSortValue(a.quarter) - roundSortValue(b.quarter));
        
        switchView('profile-view');
    } catch (err) {
        console.error("Error viewing profile:", err);
        reportConnectionError(err);
        showToast("ไม่สามารถโหลดโปรไฟล์เป้าหมายได้: " + err.message, "danger");
    } finally {
        showSpinner(false);
    }
}

function renderProfileDetail() {
    const t = state.selectedTargetProfile;
    if (!t) return;
    
    // 1. Render Personal Profile Card
    document.getElementById('profile-name').textContent = t.name;
    document.getElementById('profile-age').textContent = t.age;
    document.getElementById('profile-height').textContent = t.height;
    document.getElementById('profile-address').textContent = t.address;
    document.getElementById('profile-village').textContent = getTargetVillage(t);
    document.getElementById('profile-worker').textContent = getTargetWorker(t);
    
    const diseasesText = (t.chronic_disease === 'ไม่มี' || !t.chronic_disease) ? 'ไม่มีโรคประจำตัว' : t.chronic_disease;
    document.getElementById('profile-diseases').textContent = diseasesText;
    document.getElementById('profile-medicines').textContent = t.medicines || '-';
    
    const badge = document.getElementById('profile-type-badge');
    badge.textContent = t.type;
    badge.className = t.type === 'กลุ่มเสี่ยง' ? 'badge badge-risk' : 'badge badge-patient';

    // สรุปสีปิงปองจราจรปัจจุบัน (จากผลติดตามล่าสุด)
    const ppBadge = document.getElementById('profile-pingpong-badge');
    if (ppBadge) {
        const latestLog = getLatestLogForTarget(t.id);
        const pp = latestLog ? pingpongRules.classify(latestLog, t) : pingpongRules.colors.unknown;
        if (pp.rank >= 0) {
            ppBadge.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[11px] ${pp.badgeClass}`;
            ppBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full" style="background:${pp.dot}"></span>ปิงปอง ${pp.label} · ${pp.sub}`;
            ppBadge.title = pp.advice;
        } else {
            ppBadge.className = 'hidden';
            ppBadge.innerHTML = '';
        }
    }
    
    // Set profile icon avatar color
    const avatar = document.getElementById('profile-avatar-icon');
    avatar.style.color = t.type === 'กลุ่มเสี่ยง' ? '#f59e0b' : '#ef4444';
    avatar.style.backgroundColor = t.type === 'กลุ่มเสี่ยง' ? 'var(--color-warning-light)' : 'var(--color-danger-light)';

    // 2. Render Clinical Snapshot (latest values)
    renderProfileSnapshot();
    
    // 3. Render Quarterly Timeline Cards
    renderTimelineCards();
    
    // 4. Render Charts (Weight/BMI, BP/Sugar, Body Composition)
    renderProfileCharts();
    
    // 5. Render Daily Behavior Logs
    renderDailyLogsTable();
    
}

function renderProfileSnapshot() {
    const container = document.getElementById('profile-snapshot');
    const dateEl = document.getElementById('profile-latest-date');
    if (!container) return;
    const t = state.selectedTargetProfile;
    const logs = state.selectedTargetQuarterly || [];
    const latest = logs.length > 0 ? logs[logs.length - 1] : null;
    
    if (!latest) {
        if (dateEl) dateEl.textContent = '';
        container.innerHTML = `<div class="col-span-full text-center text-on-surface-variant py-6">
            <span class="material-symbols-outlined text-3xl mb-1 block">inbox</span>
            <p class="font-semibold text-sm">ยังไม่มีผลติดตาม</p>
            <button class="record-first-btn mt-3 bg-primary text-white font-semibold py-2.5 px-5 rounded-xl inline-flex items-center gap-1.5 text-sm" data-id="${t.id}"><span class="material-symbols-outlined text-[18px]">edit_note</span>บันทึกผลครั้งแรก</button>
        </div>`;
        return;
    }
    
    if (dateEl) dateEl.textContent = `${formatThaiDate(latest.date)} · ${roundLabel(latest.quarter)}`;
    
    const bp = latest.bp ? displayValue(latest.bp) : '—';
    const dtx = latest.dtx ? displayValue(latest.dtx) : '—';
    const weight = latest.weight ? displayValue(latest.weight) : '—';
    const bmi = latest.bmi ? displayValue(latest.bmi) : '—';
    const waist = latest.waist ? displayValue(latest.waist) : '—';
    const pp = pingpongRules.classify(latest, t);
    
    container.innerHTML = `
        <div class="rounded-xl bg-white/60 border border-slate-100 p-3 min-w-0">
            <span class="block text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">ความดัน (BP)</span>
            <strong class="text-lg text-on-surface">${bp} <span class="text-xs font-normal text-on-surface-variant">mmHg</span></strong>
        </div>
        <div class="rounded-xl bg-white/60 border border-slate-100 p-3 min-w-0">
            <span class="block text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">น้ำตาล (DTX)</span>
            <strong class="text-lg text-on-surface">${dtx} <span class="text-xs font-normal text-on-surface-variant">mg/dL</span></strong>
        </div>
        <div class="rounded-xl bg-white/60 border border-slate-100 p-3 min-w-0">
            <span class="block text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">น้ำหนัก</span>
            <strong class="text-lg text-on-surface">${weight} <span class="text-xs font-normal text-on-surface-variant">กก.</span></strong>
        </div>
        <div class="rounded-xl bg-white/60 border border-slate-100 p-3 min-w-0">
            <span class="block text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">BMI</span>
            <strong class="text-lg text-on-surface">${bmi}</strong>
        </div>
        <div class="rounded-xl bg-white/60 border border-slate-100 p-3 min-w-0">
            <span class="block text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">รอบเอว</span>
            <strong class="text-lg text-on-surface">${waist} <span class="text-xs font-normal text-on-surface-variant">ซม.</span></strong>
        </div>
        <div class="rounded-xl p-3 flex flex-col justify-center min-w-0 ${pp.rank >= 0 ? pp.badgeClass : 'bg-slate-100 text-slate-500 border border-slate-200'}">
            <span class="block text-[10px] font-bold uppercase tracking-wider">ปิงปอง</span>
            <strong class="text-base">${pp.rank >= 0 ? `${pp.label} · ${pp.sub}` : 'ยังไม่ประเมิน'}</strong>
        </div>
    `;
}

function getStoredWeekSummary(log, weekIndex) {
    const prefix = `week${weekIndex}_`;
    const hasData = WEEKLY_SUMMARY_FIELDS.some(field => log[`${prefix}${field}`] !== undefined && log[`${prefix}${field}`] !== '');
    if (!hasData) return null;
    return summarizeWeek({
        exercise_minutes: log[`${prefix}exercise_minutes`],
        healthy_menu_days: log[`${prefix}healthy_menu_days`],
        sleep_avg: log[`${prefix}sleep_avg`],
        avoid_sweet: log[`${prefix}avoid_sweet`],
        avoid_oil: log[`${prefix}avoid_oil`],
        avoid_salt: log[`${prefix}avoid_salt`]
    });
}

function renderWeekSummaryCard(summary, weekNumber) {
    if (!summary) return '';
    const exerciseClass = summary.exercisePassed ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50';
    return `
        <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div class="flex items-center justify-between gap-2 mb-2">
                <strong class="text-xs text-on-surface">สัปดาห์ที่ ${weekNumber}</strong>
                <span class="text-[9px] font-bold rounded-full px-2 py-0.5 ${exerciseClass}">${summary.exercisePassed ? 'ออกกำลังกายผ่านเกณฑ์' : 'ยังไม่ถึง 150 นาที'}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
                <div><span class="block text-sm font-extrabold text-primary">${summary.exerciseMinutes}</span><span class="text-[9px] text-outline">นาที</span></div>
                <div><span class="block text-sm font-extrabold text-tertiary">${summary.healthyMenuDays}</span><span class="text-[9px] text-outline">วันเมนูสุขภาพ</span></div>
                <div><span class="block text-sm font-extrabold text-sky-600">${summary.sleepAverage}</span><span class="text-[9px] text-outline">ชม.นอนเฉลี่ย</span></div>
            </div>
            <p class="text-[10px] text-on-surface-variant mt-2 border-t border-slate-100 pt-2">เลี่ยงรสจัด <strong>${summary.avoidanceAverage}/5 · ${summary.avoidanceLabel}</strong></p>
        </div>`;
}

function renderLabSummary(log) {
    const labs = [
        ['HbA1C', log.hba1c], ['eGFR', log.egfr], ['Creatinine', log.creatinine],
        ['Triglyceride', log.triglyceride], ['LDL-C', log.ldl], ['Cholesterol', log.cholesterol]
    ].filter(([, value]) => value !== undefined && value !== '');
    if (labs.length === 0) return '';
    return `<div class="mt-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3">
        <strong class="text-[10px] text-rose-600 block mb-2">ผลตรวจทางห้องปฏิบัติการ</strong>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">${labs.map(([label, value]) => `<span>${label}: <b>${value}</b></span>`).join('')}</div>
    </div>`;
}

function renderTimelineCards() {
    const container = document.getElementById('quarterly-timeline');
    container.innerHTML = '';
    
    const logs = state.selectedTargetQuarterly;
    
    if (logs.length === 0) {
        container.innerHTML = `<div class="glass-card rounded-2xl p-8 text-center text-on-surface-variant font-semibold w-full col-span-full">ยังไม่มีผลติดตาม 24 สัปดาห์สำหรับบุคคลนี้</div>`;
        return;
    }
    
    const gender = inferGender(state.selectedTargetProfile ? state.selectedTargetProfile.name : '');
    
    logs.forEach((log, idx) => {
        const card = document.createElement('div');
        
        const qName = roundLabel(log.quarter);
                      
        // LEGACY display interpretation (pre-Phase 5) — do NOT reuse in new components.
        // Clinical source-of-truth is pingpongRules.classify(); these inline thresholds are
        // legacy presentation-only labels and should be migrated to pingpongRules later.
        // Status calculations for indicators
        let bpStatusText = 'ปกติ';
        let bpStatusClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
        if (log.bp) {
            const bpParts = log.bp.toString().split('/');
            const sys = parseInt(bpParts[0]);
            const dia = parseInt(bpParts[1]);
            if (sys >= 140 || dia >= 90) {
                bpStatusText = 'สูง';
                bpStatusClass = 'bg-rose-50 text-rose-700 border border-rose-200';
            } else if (sys >= 120 || dia >= 80) {
                bpStatusText = 'ยังไม่ถึงเป้าหมาย';
                bpStatusClass = 'bg-amber-50 text-amber-700 border border-amber-200';
            }
        }
        
        let dtxStatusText = 'ปกติ';
        let dtxStatusClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
        if (log.dtx >= 126) {
            dtxStatusText = 'สูง';
            dtxStatusClass = 'bg-rose-50 text-rose-700 border border-rose-200';
        } else if (log.dtx >= 100) {
            dtxStatusText = 'เสี่ยง';
            dtxStatusClass = 'bg-amber-50 text-amber-700 border border-amber-200';
        }

        const bmiInterp = bodyCompRules.interpretBMI(log.bmi);
        const fatInterp = bodyCompRules.interpretBodyFat(log.body_fat, gender);
        const visceralInterp = bodyCompRules.interpretVisceralFat(log.visceral_fat);
        const muscleInterp = bodyCompRules.interpretSkeletalMuscle(log.muscle_mass, gender);
        // LEGACY inline thresholds (pre-Phase 5, presentation-only) — report-only, not to extend
        const bodyAgePassed = log.body_age > 0 && log.body_age <= Number(state.selectedTargetProfile.age || 0);
        const waistPassed = log.waist > 0 && log.waist < (gender === 'ชาย' ? 90 : 80);

        // Sidebar indicators
        let cardIndicatorColorClass = 'bg-slate-300';
        if (bpStatusText === 'สูง' || dtxStatusText === 'สูง' || bmiInterp.label === 'อ้วน') {
            cardIndicatorColorClass = 'bg-rose-500';
        } else if (bpStatusText === 'ยังไม่ถึงเป้าหมาย' || dtxStatusText === 'เสี่ยง' || bmiInterp.label === 'น้ำหนักเกิน') {
            cardIndicatorColorClass = 'bg-amber-500';
        } else if (bpStatusText === 'ปกติ' && dtxStatusText === 'ปกติ') {
            cardIndicatorColorClass = 'bg-emerald-500';
        }

        const paperWeeks = getWeeksForRound(log.quarter);
        const weekSummaries = paperWeeks.map((weekNumber, weekIndex) =>
            renderWeekSummaryCard(getStoredWeekSummary(log, weekIndex + 1), weekNumber)
        ).join('');
        const labSummary = renderLabSummary(log);

        // สีปิงปองจราจร 7 สี ประจำรอบนี้
        const pp = pingpongRules.classify(log, state.selectedTargetProfile);
        const ppBadge = pp.rank >= 0
            ? `<div class="mb-3">${pingpongRules.badgeHtml(pp)}</div>`
            : '';

        card.className = 'bg-white/70 dark:bg-inverse-surface/60 rounded-2xl p-5 border border-white/50 dark:border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between hover:scale-[1.02] transition-all';
        card.innerHTML = `
            <div class="vital-bar ${cardIndicatorColorClass}"></div>
            <div class="flex justify-between items-start mb-3 border-b border-slate-100/50 pb-2">
                <span class="font-bold text-sm text-primary dark:text-primary-fixed">${qName}</span>
                <span class="text-xs text-outline font-semibold">${formatThaiDate(log.date)}</span>
            </div>
            ${ppBadge}
            <div class="space-y-2.5 text-xs text-on-surface-variant font-medium">
                <div class="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span>น้ำหนัก:</span>
                    <span class="font-bold text-on-surface">${log.weight} กก.</span>
                </div>
                <div class="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span>BMI:</span>
                    <span class="font-bold text-on-surface">${log.bmi.toFixed(1)} <span class="px-2 py-0.5 rounded-full font-bold text-[9px] ${bmiInterp.badgeClass} ml-1">${bmiInterp.label}</span></span>
                </div>
                <div class="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span>ความดัน (BP):</span>
                    <span class="font-bold text-on-surface">${displayValue(log.bp)} <span class="px-2 py-0.5 rounded-full font-bold text-[9px] ${bpStatusClass} ml-1">${bpStatusText}</span></span>
                </div>
                <div class="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span>น้ำตาล (DTX):</span>
                    <span class="font-bold text-on-surface">${log.dtx} มก. <span class="px-2 py-0.5 rounded-full font-bold text-[9px] ${dtxStatusClass} ml-1">${dtxStatusText}</span></span>
                </div>
                ${log.body_fat > 0 ? `
                <div class="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span>ไขมันร่างกาย:</span>
                    <span class="font-bold text-on-surface">${log.body_fat.toFixed(1)}% <span class="px-2 py-0.5 rounded-full font-bold text-[9px] ${fatInterp.badgeClass} ml-1">${fatInterp.label}</span></span>
                </div>` : ''}
                ${log.visceral_fat > 0 ? `
                <div class="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span>ไขมันช่องท้อง:</span>
                    <span class="font-bold text-on-surface">ระดับ ${log.visceral_fat} <span class="px-2 py-0.5 rounded-full font-bold text-[9px] ${visceralInterp.badgeClass} ml-1">${visceralInterp.label}</span></span>
                </div>` : ''}
                ${log.muscle_mass > 0 ? `
                <div class="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span>กล้ามเนื้อลาย:</span>
                    <span class="font-bold text-on-surface">${log.muscle_mass.toFixed(1)}% <span class="px-2 py-0.5 rounded-full font-bold text-[9px] ${muscleInterp.badgeClass} ml-1">${muscleInterp.label}</span></span>
                </div>` : ''}
                ${log.body_age > 0 ? `
                <div class="flex justify-between items-center border-b border-slate-50 pb-1.5">
                    <span>อายุร่างกาย:</span>
                    <span class="font-bold text-on-surface">${log.body_age} ปี <span class="px-2 py-0.5 rounded-full font-bold text-[9px] ${bodyAgePassed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'} ml-1">${bodyAgePassed ? 'ผ่านเป้าหมาย' : 'เกินอายุจริง'}</span></span>
                </div>` : ''}
                <div class="flex justify-between items-center">
                    <span>รอบเอว:</span>
                    <span class="font-bold text-on-surface">${log.waist} ซม. <span class="px-2 py-0.5 rounded-full font-bold text-[9px] ${waistPassed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'} ml-1">${waistPassed ? 'ผ่านเป้าหมาย' : 'ยังไม่ถึงเป้าหมาย'}</span></span>
                </div>
            </div>
            ${labSummary}
            ${ncdReportUI.summary(log)}
            ${weekSummaries ? `<div class="mt-4 pt-3 border-t border-slate-100 space-y-2">${weekSummaries}</div>` : ''}
        `;
        
        container.appendChild(card);
    });
}

function renderProfileCharts() {
    const logs = state.selectedTargetQuarterly;
    if (logs.length === 0) return;
    
    const labels = logs.map(l => l.quarter);
    const isDark = document.body.classList.contains('dark');
    
    // --- Chart 1: Weight & BMI ---
    const ctx1 = document.getElementById('chart-weight-bmi').getContext('2d');
    if (state.charts.weightBmi) state.charts.weightBmi.destroy();
    
    state.charts.weightBmi = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'น้ำหนัก (กก.)',
                    data: logs.map(l => l.weight),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    yAxisID: 'y-weight',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'ดัชนีมวลกาย (BMI)',
                    data: logs.map(l => l.bmi),
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    yAxisID: 'y-bmi',
                    tension: 0.3,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                'y-weight': {
                    position: 'left',
                    grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun' } }
                },
                'y-bmi': {
                    position: 'right',
                    grid: { display: false },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun' } }
                },
                x: {
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun', weight: 600 } }
                }
            },
            plugins: {
                legend: { labels: { font: { family: 'Sarabun' }, color: isDark ? '#94a3b8' : '#64748b' } }
            }
        }
    });
    
    // --- Chart 2: BP & DTX ---
    const ctx2 = document.getElementById('chart-bp-dtx').getContext('2d');
    if (state.charts.bpDtx) state.charts.bpDtx.destroy();
    
    const bpSys = logs.map(l => l.bp ? parseInt(l.bp.toString().split('/')[0]) : null);
    const bpDia = logs.map(l => l.bp ? parseInt(l.bp.toString().split('/')[1]) : null);
    
    state.charts.bpDtx = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'BP Systolic (บน)',
                    data: bpSys,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    tension: 0.2,
                    yAxisID: 'y-bp'
                },
                {
                    label: 'BP Diastolic (ล่าง)',
                    data: bpDia,
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    tension: 0.2,
                    yAxisID: 'y-bp'
                },
                {
                    label: 'ค่าน้ำตาล DTX (มก.)',
                    data: logs.map(l => l.dtx),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    tension: 0.2,
                    yAxisID: 'y-dtx',
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                'y-bp': {
                    position: 'left',
                    grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun' } }
                },
                'y-dtx': {
                    position: 'right',
                    grid: { display: false },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun' } }
                },
                x: {
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun', weight: 600 } }
                }
            },
            plugins: {
                legend: { labels: { font: { family: 'Sarabun' }, color: isDark ? '#94a3b8' : '#64748b' } }
            }
        }
    });

    // --- Chart 3: Body Composition (Fat % vs Muscle %) ---
    const ctx3 = document.getElementById('chart-body-composition').getContext('2d');
    if (state.charts.bodyComp) state.charts.bodyComp.destroy();
    
    state.charts.bodyComp = new Chart(ctx3, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'ไขมันในร่างกาย (%)',
                    data: logs.map(l => l.body_fat),
                    backgroundColor: '#ec4899',
                    borderRadius: 4
                },
                {
                    label: 'มวลกล้ามเนื้อ (%)',
                    data: logs.map(l => l.muscle_mass),
                    backgroundColor: '#8b5cf6',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun' } }
                },
                x: {
                    ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Sarabun', weight: 600 } }
                }
            },
            plugins: {
                legend: { labels: { font: { family: 'Sarabun' }, color: isDark ? '#94a3b8' : '#64748b' } }
            }
        }
    });
}

function renderDailyLogsTable() {
    const tbody = document.getElementById('daily-logs-table-body');
    tbody.innerHTML = '';
    
    const logs = state.selectedTargetDailyLogs;
    
    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 20px;">ไม่มีข้อมูลการบันทึกพฤติกรรมสุขภาพรายวัน</td></tr>`;
        return;
    }
    
    logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${formatThaiDate(log.date)}</strong></td>
            <td>${displayValue(log.week)}</td>
            <td>${displayValue(log.day)}</td>
            <td><span class="tag bg-warning-light text-warning">${displayValue(log.avoid_sweet)}</span></td>
            <td><span class="tag bg-warning-light text-warning">${displayValue(log.avoid_oil)}</span></td>
            <td><span class="tag bg-warning-light text-warning">${displayValue(log.avoid_salt)}</span></td>
            <td>${displayValue(log.menu)}</td>
            <td>${displayValue(log.exercise_type)}</td>
            <td>${displayValue(log.exercise_duration, '0')}</td>
            <td>${displayValue(log.water, '0')}</td>
            <td>${displayValue(log.sleep_hours, '0')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function refreshCharts() {
    // Redraw charts using current global states (called during theme change)
    if (state.currentView === 'dashboard-view') {
        renderDashboard();
    } else if (state.currentView === 'profile-view') {
        renderProfileCharts();
    }
}

// --- Form & Modals Management ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        window.setTimeout(() => {
            if (!modal.classList.contains('active')) {
                modal.classList.add('hidden');
            }
        }, 250);
    }
}

function setupProfileActionFallbacks() {
    document.addEventListener('click', (e) => {
        const button = e.target.closest('#btn-edit-target, #btn-add-quarterly, #btn-add-daily, .record-first-btn');
        if (!button) return;

        e.preventDefault();
        e.stopPropagation();

        if (button.id === 'btn-edit-target') {
            const t = state.selectedTargetProfile;
            if (!t) {
                showToast("กรุณาเลือกกลุ่มเป้าหมายก่อนแก้ไขข้อมูล", "warning");
                return;
            }

            document.getElementById('form-target-id').value = t.id || '';
            document.getElementById('form-target-name').value = t.name || '';
            document.getElementById('form-target-type').value = t.type || 'กลุ่มเสี่ยง';
            document.getElementById('form-target-age').value = t.age || '';
            document.getElementById('form-target-height').value = t.height || '';
            document.getElementById('form-target-address').value = t.address || '';
            document.getElementById('form-target-village').value = t.village || '';
            document.getElementById('form-target-worker').value = t.responsible_worker || '';
            document.getElementById('form-target-chronic').value = t.chronic_disease || '';
            document.getElementById('form-target-comorbidity').value = t.co_morbidity || '';
            document.getElementById('form-target-onset').value = t.onset_year || '';
            document.getElementById('form-target-medicines').value = t.medicines || '';

            document.getElementById('target-modal-title').textContent = 'แก้ไขข้อมูลส่วนตัวกลุ่มเป้าหมาย';
            openModal('target-modal');
        } else if (button.id === 'btn-add-quarterly') {
            openQuarterlyModal(state.selectedTargetId);
        } else if (button.classList.contains('record-first-btn')) {
            openQuarterlyModal(state.selectedTargetId);
        } else if (button.id === 'btn-add-daily') {
            if (!state.selectedTargetId) {
                showToast("กรุณาเลือกกลุ่มเป้าหมายก่อนบันทึกพฤติกรรม", "warning");
                return;
            }

            document.getElementById('daily-form').reset();
            document.getElementById('form-d-target-id').value = state.selectedTargetId;

            const d = new Date();
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            document.getElementById('form-d-date').value = `${dd}/${mm}/${yyyy}`;

            openModal('daily-modal');
        }
    }, true);
}

function setupEventListeners() {
    populateWorkerControls();

    const mobileNavToggle = document.getElementById('mobile-nav-toggle');
    const mobileNavClose = document.getElementById('mobile-nav-close');
    const mobileNavOverlay = document.getElementById('mobile-nav-overlay');

    if (mobileNavToggle) {
        mobileNavToggle.addEventListener('click', () => setMobileNavOpen(true));
    }
    if (mobileNavClose) {
        mobileNavClose.addEventListener('click', closeMobileNav);
    }
    if (mobileNavOverlay) {
        mobileNavOverlay.addEventListener('click', closeMobileNav);
    }

    // Nav Items switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = e.currentTarget.getAttribute('data-view');
            switchView(viewId);
            closeMobileNav();
        });
    });

    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = e.currentTarget.getAttribute('data-view');
            if (!viewId) return;
            switchView(viewId);
        });
    });

    // Mobile bottom-nav quick actions
    const quickRecordBtn = document.getElementById('quick-record-btn');
    if (quickRecordBtn) {
        quickRecordBtn.addEventListener('click', () => {
            if (state.currentView === 'profile-view' && state.selectedTargetId && state.selectedTargetProfile) {
                openQuarterlyModal(state.selectedTargetId);
                return;
            }
            switchView('targets-view');
            closeMobileNav();
            const search = document.getElementById('target-search-input');
            if (search) search.focus();
        });
    }
    const moreMenuBtn = document.getElementById('more-menu-btn');
    if (moreMenuBtn) {
        moreMenuBtn.addEventListener('click', () => setMobileNavOpen(true));
    }

    // Login form submission
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputPasscode = document.getElementById('login-passcode').value.trim();
            const errorDiv = document.getElementById('login-error');
            
            const submit = loginForm.querySelector('[type="submit"]');
            const submitLabel = submit ? submit.querySelector('span') : null;
            submit.disabled = true;
            if (submitLabel) submitLabel.textContent = 'กำลังตรวจสอบรหัสผ่าน...';
            const loginStart = perfNow();
            try {
                const login = await postToAPI('login', {}, inputPasscode);
                perfLog('login-auth', loginStart);
                if (login.data?.role !== 'user') throw new Error('กรุณาอัปเดต Apps Script เป็นเวอร์ชันล่าสุด');
                sessionStorage.setItem('ncd_authenticated', 'true');
                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) loginScreen.classList.add('hidden');
                errorDiv.classList.add('hidden');
                document.getElementById('login-passcode').value = '';
                // ซ่อนหน้า login แล้วแสดง app shell + โหลดข้อมูลแบบ progressive ทันที
                showToast('เข้าสู่ระบบแล้ว กำลังโหลดข้อมูลล่าสุด...', 'success');
                const ok = await refreshData();
                if (ok && state.connectionReady) {
                    showToast('เข้าสู่ระบบและโหลดข้อมูลจริงเรียบร้อยแล้ว');
                    perfLog('login-total (auth + full hydration)', loginStart);
                }
            } catch (error) {
                sessionStorage.removeItem('ncd_authenticated');
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('hidden');
                const passcodeField = document.getElementById('login-passcode');
                if (passcodeField) {
                    passcodeField.value = '';
                    passcodeField.focus();
                }
            } finally {
                if (submitLabel) submitLabel.textContent = 'เข้าสู่ระบบ';
                submit.disabled = false;
            }
        });
    }

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('font-size-toggle')?.addEventListener('click', toggleFontScale);
    
    // Back to list button inside profile
    document.getElementById('back-to-list-btn').addEventListener('click', () => {
        switchView('targets-view');
    });

    // Profile Tabs switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            e.currentTarget.classList.add('active');
            const tabId = e.currentTarget.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Search and filters change on list
    const searchInputEl = document.getElementById('target-search-input');
    const searchClearBtn = document.getElementById('target-search-clear');
    searchInputEl.addEventListener('input', () => {
        state.currentPage = 1;
        if (searchClearBtn) searchClearBtn.classList.toggle('hidden', !searchInputEl.value);
        renderTargetsList();
    });
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            searchInputEl.value = '';
            searchClearBtn.classList.add('hidden');
            state.currentPage = 1;
            renderTargetsList();
            searchInputEl.focus();
        });
    }
    const filterToggleBtn = document.getElementById('targets-filter-toggle');
    if (filterToggleBtn) {
        filterToggleBtn.addEventListener('click', () => {
            const panel = document.getElementById('targets-filter-panel');
            const isHidden = panel.classList.toggle('hidden');
            filterToggleBtn.setAttribute('aria-expanded', String(!isHidden));
        });
    }
    document.getElementById('filter-type').addEventListener('change', () => {
        state.currentPage = 1;
        renderTargetsList();
    });
    document.getElementById('filter-village').addEventListener('change', () => {
        state.currentPage = 1;
        renderTargetsList();
    });
    document.getElementById('filter-worker').addEventListener('change', () => {
        state.currentPage = 1;
        renderTargetsList();
    });
    document.getElementById('filter-disease').addEventListener('change', () => {
        state.currentPage = 1;
        renderTargetsList();
    });

    const dashboardWorkerFilter = document.getElementById('dashboard-worker-filter');
    if (dashboardWorkerFilter) {
        dashboardWorkerFilter.addEventListener('change', () => {
            const stats = state.connectionMode === 'online' ? (state.apiDashboardStats || {}) : {};
            renderWorkerProgress(stats);
        });
    }

    // Targets list Pagination
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderTargetsList();
        }
    });
    document.getElementById('next-page-btn').addEventListener('click', () => {
        state.currentPage++;
        renderTargetsList();
    });


    document.getElementById('retry-connection').addEventListener('click', () => {
        if (sessionStorage.getItem('ncd_authenticated') === 'true') refreshData();
    });
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('ncd_authenticated');
        location.reload();
    });

    // --- Modal buttons and forms ---
    
    // Close modal triggers
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modal = e.currentTarget.closest('.modal-overlay');
            if (modal) closeModal(modal.id);
        });
    });

    // Target select dropdown change in interpreter
    const interpSelect = document.getElementById('interp-target-select');
    if (interpSelect) {
        interpSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const importBtn = document.getElementById('interp-import-btn');
            
            if (val) {
                const target = state.targets.find(t => t.id === parseInt(val));
                if (target) {
                    // Populate gender and height
                    document.getElementById('interp-gender').value = inferGender(target.name);
                    document.getElementById('interp-height').value = target.height;
                    document.getElementById('interp-age').value = target.age;

                    // Prefill ping-pong inputs from latest follow-up
                    const latest = getLatestLogForTarget(target.id);
                    document.getElementById('interp-pp-dtx').value = (latest && latest.dtx) ? latest.dtx : '';
                    document.getElementById('interp-pp-hba1c').value = (latest && latest.hba1c) ? latest.hba1c : '';
                    if (latest && latest.bp) {
                        const parts = latest.bp.toString().split('/');
                        document.getElementById('interp-pp-sbp').value = parts[0] || '';
                        document.getElementById('interp-pp-dbp').value = parts[1] || '';
                    } else {
                        document.getElementById('interp-pp-sbp').value = '';
                        document.getElementById('interp-pp-dbp').value = '';
                    }
                    document.getElementById('interp-pp-patient').checked = pingpongRules.isPatient(target);
                    classifyInterpreterPingpong();

                    // Show import button
                    if (importBtn) importBtn.classList.remove('hidden');
                }
            } else {
                if (importBtn) importBtn.classList.add('hidden');
            }
            calculateBodyComposition();
        });
    }

    // Ping-pong interpreter inputs (realtime)
    ['interp-pp-dtx', 'interp-pp-hba1c', 'interp-pp-sbp', 'interp-pp-dbp', 'interp-pp-patient'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', classifyInterpreterPingpong);
            el.addEventListener('change', classifyInterpreterPingpong);
        }
    });

    // Registry (ทะเบียนจำแนกรหัสสี) filters + export
    ['registry-filter-color', 'registry-filter-village'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderRegistry);
    });
    const registryExportBtn = document.getElementById('registry-export-btn');
    if (registryExportBtn) registryExportBtn.addEventListener('click', exportRegistryCSV);

    // Focus Group report filters + copy/export
    const focusGroupVillageFilter = document.getElementById('focusgroup-filter-village');
    if (focusGroupVillageFilter) focusGroupVillageFilter.addEventListener('change', renderFocusGroupView);
    const focusGroupCopyBtn = document.getElementById('focusgroup-copy-btn');
    if (focusGroupCopyBtn) focusGroupCopyBtn.addEventListener('click', copyFocusGroupToClipboard);
    const focusGroupExcelBtn = document.getElementById('focusgroup-excel-btn');
    if (focusGroupExcelBtn) focusGroupExcelBtn.addEventListener('click', exportFocusGroupExcel);

    const interpVillageFilter = document.getElementById('interp-village-filter');
    if (interpVillageFilter) {
        interpVillageFilter.addEventListener('change', () => {
            renderInterpreterView();
            const importBtn = document.getElementById('interp-import-btn');
            if (importBtn) importBtn.classList.add('hidden');
            calculateBodyComposition();
        });
    }

    // Input change listeners in interpreter
    const interpInputs = ['interp-gender', 'interp-age', 'interp-height', 'interp-weight', 'interp-bodyfat', 'interp-visceral', 'interp-muscle', 'interp-bodyage'];
    interpInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', calculateBodyComposition);
            el.addEventListener('change', calculateBodyComposition);
        }
    });

    // Reset button in interpreter
    const interpReset = document.getElementById('interp-reset-btn');
    if (interpReset) {
        interpReset.addEventListener('click', () => {
            if (interpSelect) interpSelect.value = '';
            document.getElementById('interp-gender').value = 'ชาย';
            document.getElementById('interp-age').value = '45';
            document.getElementById('interp-height').value = '160';
            document.getElementById('interp-weight').value = '';
            document.getElementById('interp-bodyfat').value = '';
            document.getElementById('interp-visceral').value = '';
            document.getElementById('interp-muscle').value = '';
            document.getElementById('interp-bodyage').value = '';

            // Clear ping-pong inputs
            ['interp-pp-dtx', 'interp-pp-hba1c', 'interp-pp-sbp', 'interp-pp-dbp'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const ppPatient = document.getElementById('interp-pp-patient');
            if (ppPatient) ppPatient.checked = false;
            classifyInterpreterPingpong();

            const importBtn = document.getElementById('interp-import-btn');
            if (importBtn) importBtn.classList.add('hidden');

            calculateBodyComposition();
        });
    }

    // Import button in interpreter
    const interpImport = document.getElementById('interp-import-btn');
    if (interpImport) {
        interpImport.addEventListener('click', () => {
            const targetId = parseInt(interpSelect.value);
            if (!targetId) return;
            
            // Prefill values
            openQuarterlyModal(targetId);
            
            document.getElementById('form-q-weight').value = document.getElementById('interp-weight').value;
            document.getElementById('form-q-fat').value = document.getElementById('interp-bodyfat').value;
            document.getElementById('form-q-visceral').value = document.getElementById('interp-visceral').value;
            document.getElementById('form-q-muscle').value = document.getElementById('interp-muscle').value;
            document.getElementById('form-q-bodyage').value = document.getElementById('interp-bodyage').value;
            
            // Trigger realtime calculation inside form
            document.getElementById('form-q-weight').dispatchEvent(new Event('input'));
            document.getElementById('form-q-fat').dispatchEvent(new Event('input'));
            document.getElementById('form-q-visceral').dispatchEvent(new Event('input'));
            document.getElementById('form-q-muscle').dispatchEvent(new Event('input'));
        });
    }
    
    // Set up form real-time calculation
    setupQuarterlyFormRealtimeInterpretation();

    // 1. Add Target Form
    document.getElementById('btn-add-target').addEventListener('click', () => {
        document.getElementById('target-form').reset();
        document.getElementById('form-target-id').value = '';
        document.getElementById('target-modal-title').textContent = 'เพิ่มข้อมูลกลุ่มเป้าหมายใหม่';
        openModal('target-modal');
    });

    // Edit Target Profile Form
    document.getElementById('btn-edit-target').addEventListener('click', () => {
        const t = state.selectedTargetProfile;
        if (!t) return;
        
        document.getElementById('form-target-id').value = t.id;
        document.getElementById('form-target-name').value = t.name;
        document.getElementById('form-target-type').value = t.type;
        document.getElementById('form-target-age').value = t.age;
        document.getElementById('form-target-height').value = t.height;
        document.getElementById('form-target-address').value = t.address;
        document.getElementById('form-target-village').value = t.village || '';
        document.getElementById('form-target-worker').value = t.responsible_worker || '';
        document.getElementById('form-target-chronic').value = t.chronic_disease;
        document.getElementById('form-target-comorbidity').value = t.co_morbidity;
        document.getElementById('form-target-onset').value = t.onset_year;
        document.getElementById('form-target-medicines').value = t.medicines;
        
        document.getElementById('target-modal-title').textContent = 'แก้ไขข้อมูลส่วนตัวกลุ่มเป้าหมาย';
        openModal('target-modal');
    });

    document.getElementById('target-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const targetId = document.getElementById('form-target-id').value;
        const action = targetId ? 'updateTarget' : 'addTarget';
        
        const formData = {
            name: document.getElementById('form-target-name').value.trim(),
            type: document.getElementById('form-target-type').value,
            age: parseInt(document.getElementById('form-target-age').value),
            height: parseFloat(document.getElementById('form-target-height').value),
            address: document.getElementById('form-target-address').value.trim(),
            village: document.getElementById('form-target-village').value,
            responsible_worker: document.getElementById('form-target-worker').value,
            chronic_disease: document.getElementById('form-target-chronic').value.trim(),
            co_morbidity: document.getElementById('form-target-comorbidity').value.trim(),
            onset_year: document.getElementById('form-target-onset').value.trim(),
            medicines: document.getElementById('form-target-medicines').value.trim()
        };

        if (!ALL_VILLAGES.includes(formData.village)) {
            showToast("กรุณาเลือกหมู่บ้านจากรายการที่กำหนด", "warning");
            return;
        }

        if (!getWorkerOptions().includes(formData.responsible_worker)) {
            showToast("กรุณาเลือกคณะทำงานที่รับผิดชอบจากรายการที่กำหนด", "warning");
            return;
        }
        
        if (targetId) {
            formData.id = parseInt(targetId);
        }
        
        const submitBtn = (e.target && e.target.querySelector) ? e.target.querySelector('[type="submit"]') : null;
        if (submitBtn) submitBtn.disabled = true;
        showSpinner(true, 'กำลังบันทึกข้อมูลบุคคล...');
        try {
            {
                const res = await postToAPI(action, formData);
                if (!res.success) throw new Error(res.error);
                
                showToast(res.data.message || "บันทึกข้อมูลเรียบร้อยแล้ว");
            }
            closeModal('target-modal');
            
            // Reload and refresh current view
            if (action === 'updateTarget') {
                viewTargetProfile(state.selectedTargetId);
            } else {
                refreshData();
            }
        } catch (err) {
            console.error("Save failed:", err);
            showToast("บันทึกข้อมูลล้มเหลว: " + err.message, "danger");
        } finally {
            showSpinner(false);
            if (submitBtn) submitBtn.disabled = !state.connectionReady;
        }
    });

    // 2. Add Quarterly Data Form
    document.getElementById('btn-add-quarterly').addEventListener('click', () => {
        openQuarterlyModal(state.selectedTargetId);
    });

    document.getElementById('form-q-round').addEventListener('change', (event) => loadTrackingRoundRecord(event.target.value));
    document.querySelectorAll('.weekly-summary-input').forEach(input => {
        input.addEventListener('input', () => {
            updateWeeklySummaryPreview(1);
            updateWeeklySummaryPreview(2);
        });
    });

    document.getElementById('quarterly-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const targetId = parseInt(document.getElementById('form-q-target-id').value);
        const height = parseFloat(document.getElementById('form-q-height').value);
        const weight = parseFloat(document.getElementById('form-q-weight').value);
        
        // Auto calculate BMI on client
        const hM = height / 100;
        const bmi = parseFloat((weight / (hM * hM)).toFixed(1));
        
        const formData = {
            target_id: targetId,
            quarter: document.getElementById('form-q-round').value,
            date: document.getElementById('form-q-date').value.trim(),
            weight: weight,
            bmi: bmi,
            waist: parseFloat(document.getElementById('form-q-waist').value),
            bp: document.getElementById('form-q-bp').value.trim(),
            dtx: parseInt(document.getElementById('form-q-dtx').value),
            body_fat: ncdExport.number(document.getElementById('form-q-fat').value) ?? '',
            muscle_mass: ncdExport.number(document.getElementById('form-q-muscle').value) ?? '',
            visceral_fat: ncdExport.number(document.getElementById('form-q-visceral').value) ?? '',
            body_age: ncdExport.number(document.getElementById('form-q-bodyage').value) ?? '',
            remark: document.getElementById('form-q-remark').value.trim(),
            // Lab results
            hba1c: parseFloat(document.getElementById('form-q-hba1c').value) || '',
            egfr: parseFloat(document.getElementById('form-q-egfr').value) || '',
            creatinine: parseFloat(document.getElementById('form-q-creatinine').value) || '',
            triglyceride: parseInt(document.getElementById('form-q-trigly').value) || '',
            ldl: parseInt(document.getElementById('form-q-ldl').value) || '',
            cholesterol: parseInt(document.getElementById('form-q-chol').value) || ''
        };

        Object.assign(formData, ncdReportUI.collect());

        if (formData.quarter !== 'W0') {
            [1, 2].forEach(weekIndex => {
                formData[`week${weekIndex}_exercise_minutes`] = parseInt(document.getElementById(`form-q-w${weekIndex}-exercise`).value);
                formData[`week${weekIndex}_healthy_menu_days`] = parseInt(document.getElementById(`form-q-w${weekIndex}-menu`).value);
                formData[`week${weekIndex}_sleep_avg`] = parseFloat(document.getElementById(`form-q-w${weekIndex}-sleep`).value);
                formData[`week${weekIndex}_avoid_sweet`] = parseFloat(document.getElementById(`form-q-w${weekIndex}-sweet`).value);
                formData[`week${weekIndex}_avoid_oil`] = parseFloat(document.getElementById(`form-q-w${weekIndex}-oil`).value);
                formData[`week${weekIndex}_avoid_salt`] = parseFloat(document.getElementById(`form-q-w${weekIndex}-salt`).value);
            });
        }

        if (!isLabRound(formData.quarter)) {
            ['hba1c', 'egfr', 'creatinine', 'triglyceride', 'ldl', 'cholesterol'].forEach(field => {
                formData[field] = '';
            });
        }
        
        const submitBtn = (e.target && e.target.querySelector) ? e.target.querySelector('[type="submit"]') : null;
        if (submitBtn) submitBtn.disabled = true;
        showSpinner(true, 'กำลังบันทึกผลติดตามสุขภาพ...');
        try {
            {
                const res = await postToAPI('addQuarterly', formData);
                if (!res.success) throw new Error(res.error);
                
                showToast(res.data.message || "บันทึกผลการคัดกรองสำเร็จ!");
            }
            closeModal('quarterly-modal');
            viewTargetProfile(targetId);
        } catch (err) {
            console.error("Quarterly save failed:", err);
            showToast("บันทึกข้อมูลสุขภาพไม่สำเร็จ: " + err.message, "danger");
        } finally {
            showSpinner(false);
            if (submitBtn) submitBtn.disabled = !state.connectionReady;
        }
    });

    // 3. Add Daily Log Form
    document.getElementById('btn-add-daily')?.addEventListener('click', () => {
        const t = state.selectedTargetProfile;
        if (!t) return;
        
        document.getElementById('daily-form').reset();
        document.getElementById('form-d-target-id').value = t.id;
        
        // Auto default date and day name
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        document.getElementById('form-d-date').value = `${dd}/${mm}/${yyyy}`;
        
        const days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
        document.getElementById('form-d-day').value = days[d.getDay()];
        document.getElementById('form-d-week').value = "สัปดาห์ที่ 1";
        
        openModal('daily-modal');
    });

    document.getElementById('daily-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const targetId = parseInt(document.getElementById('form-d-target-id').value);
        
        const formData = {
            target_id: targetId,
            week: document.getElementById('form-d-week').value.trim(),
            day: document.getElementById('form-d-day').value,
            date: document.getElementById('form-d-date').value.trim(),
            avoid_sweet: parseInt(document.getElementById('form-d-sweet').value),
            avoid_oil: parseInt(document.getElementById('form-d-oil').value),
            avoid_salt: parseInt(document.getElementById('form-d-salt').value),
            menu: document.getElementById('form-d-menu').value.trim(),
            exercise_type: document.getElementById('form-d-extype').value.trim(),
            exercise_duration: parseInt(document.getElementById('form-d-exduration').value) || 0,
            water: parseInt(document.getElementById('form-d-water').value) || 0,
            sleep_hours: parseFloat(document.getElementById('form-d-sleep').value) || 0
        };
        
        const submitBtn = (e.target && e.target.querySelector) ? e.target.querySelector('[type="submit"]') : null;
        if (submitBtn) submitBtn.disabled = true;
        showSpinner(true, 'กำลังบันทึกพฤติกรรมรายวัน...');
        try {
            {
                const res = await postToAPI('addDailyLog', formData);
                if (!res.success) throw new Error(res.error);
                
                showToast(res.data.message || "บันทึกพฤติกรรมรายวันสำเร็จ!");
            }
            closeModal('daily-modal');
            viewTargetProfile(targetId);
        } catch (err) {
            console.error("Daily save failed:", err);
            showToast("ไม่สามารถบันทึกพฤติกรรมได้: " + err.message, "danger");
        } finally {
            showSpinner(false);
            if (submitBtn) submitBtn.disabled = !state.connectionReady;
        }
    });
}

// Post request handler using POST redirect trick for GAS (Text payload with text/plain to bypass Preflight)
async function postToAPI(action, data, passcode = state.apiPasscode, opts = {}) {
    const isWrite = ['addTarget', 'updateTarget', 'addQuarterly', 'addDailyLog'].includes(action);
    if (isWrite && (state.connectionMode !== 'online' || !state.connectionReady || sessionStorage.getItem('ncd_authenticated') !== 'true')) {
        throw new Error('ยังไม่พร้อมบันทึก กรุณาเชื่อมต่อใหม่ให้สำเร็จก่อน ข้อมูลในฟอร์มยังอยู่');
    }
    if (!state.gasUrl || !state.apiPasscode) {
        throw new Error("ยังไม่ได้ตั้งค่า URL หรือรหัสผ่าน API");
    }

    const payload = {
        action: action,
        passcode,
        data: data
    };
    
    // We send POST request without headers object to avoid triggering CORS preflight check
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(state.gasUrl, {
            method: 'POST', body: JSON.stringify(payload), signal: controller.signal
        });
        if (!response.ok) throw new Error(`เซิร์ฟเวอร์ตอบ HTTP ${response.status}`);
        const json = await response.json();
        if (!json || json.success !== true) throw new Error(json?.error || 'คำตอบจากเซิร์ฟเวอร์ไม่ถูกต้อง');
        return json;
    } catch (error) {
        const message = isWrite
            ? 'ยังยืนยันผลการบันทึกไม่ได้ กรุณาเชื่อมต่อใหม่และตรวจรายการก่อนบันทึกซ้ำ: '
            : 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ';
        const failure = new Error(message + (error.name === 'AbortError' ? 'หมดเวลารอเซิร์ฟเวอร์' : error.message));
        if (opts.reportError !== false) reportConnectionError(failure);
        throw failure;
    } finally {
        clearTimeout(timer);
    }
}

function reportConnectionError(error) {
    state.connectionReady = false;
    document.getElementById('connection-error-message').textContent = error.message + ' ระบบหยุดการบันทึกและไม่มีการใช้ข้อมูลจำลอง';
    document.getElementById('connection-error').classList.remove('hidden');
    updateConnectionIndicator();
}

// --- UI Feedback Elements ---
function showSpinner(show, message = 'กำลังดำเนินการ...') {
    const spinner = document.getElementById('loading-spinner');
    const spinnerMessage = document.getElementById('loading-spinner-message');
    if (show) {
        if (spinnerMessage) spinnerMessage.textContent = message;
        spinner.classList.remove('hidden');
    } else {
        spinner.classList.add('hidden');
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'check_circle' : 
                 type === 'warning' ? 'warning' : 'error';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-outlined';
    iconSpan.textContent = icon;

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;

    toast.append(iconSpan, messageSpan);
    
    // Append to body (styled in CSS dynamically)
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.add('active');
    }, 50);
    
    // Remove after 3.5s
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Append CSS styles dynamically for Toast notification (keeps style.css clean)
const style = document.createElement('style');
style.textContent = `
    .toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #ffffff;
        border-radius: 12px;
        padding: 12px 20px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
        border: 1px solid rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 9999;
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 14px;
        font-weight: 500;
    }
    .toast.active {
        transform: translateY(0);
        opacity: 1;
    }
    .toast-success { color: #00b17b; border-left: 4px solid #00b17b; }
    .toast-warning { color: #f59e0b; border-left: 4px solid #f59e0b; }
    .toast-danger { color: #ef4444; border-left: 4px solid #ef4444; }
    .toast span.material-symbols-outlined { font-size: 20px; }
    .dark .toast {
        background: #111a36;
        border-color: rgba(255, 255, 255, 0.05);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
`;
document.head.appendChild(style);

// --- Body Composition Interpretation System ---

function inferGender(name) {
    if (!name) return 'หญิง';
    name = name.trim();
    if (name.startsWith('นาย') || name.startsWith('เด็กชาย') || name.startsWith('ด.ช.') || name.startsWith('ด.ช')) {
        return 'ชาย';
    }
    return 'หญิง'; // Default to หญิง
}

const bodyCompRules = {
    interpretBMI: function(bmi) {
        if (!bmi || bmi <= 0) return { label: '-', class: 'text-slate-400', badgeClass: 'bg-slate-100 text-slate-700', bgClass: 'bg-slate-400' };
        if (bmi < 18.5) return { label: 'น้ำหนักต่ำกว่าเกณฑ์', class: 'text-sky-500', badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200', bgClass: 'bg-sky-500' };
        if (bmi < 23.0) return { label: 'ปกติ', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
        if (bmi < 25.0) return { label: 'น้ำหนักเกิน', class: 'text-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200', bgClass: 'bg-amber-500' };
        return { label: 'อ้วน', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
    },
    interpretBodyFat: function(fat, gender) {
        if (!fat || fat <= 0) return { label: '-', class: 'text-slate-400', badgeClass: 'bg-slate-100 text-slate-700', bgClass: 'bg-slate-400' };
        const target = gender === 'ชาย' ? 20 : 30;
        if (fat < target) return { label: 'ผ่านเป้าหมาย', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
        return { label: 'สูงกว่าเป้าหมาย', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
    },
    interpretVisceralFat: function(level) {
        if (!level || level <= 0) return { label: '-', class: 'text-slate-400', badgeClass: 'bg-slate-100 text-slate-700', bgClass: 'bg-slate-400' };
        if (level < 9) return { label: 'ปกติ', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
        if (level < 15) return { label: 'สูง', class: 'text-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200', bgClass: 'bg-amber-500' };
        return { label: 'สูงมาก', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
    },
    interpretSkeletalMuscle: function(muscle, gender) {
        if (!muscle || muscle <= 0) return { label: '-', class: 'text-slate-400', badgeClass: 'bg-slate-100 text-slate-700', bgClass: 'bg-slate-400' };
        if (gender === 'ชาย') {
            if (muscle <= 30) return { label: 'ต่ำกว่าเป้าหมาย', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
            return { label: 'ผ่านเป้าหมาย', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
        } else {
            if (muscle <= 25) return { label: 'ต่ำกว่าเป้าหมาย', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
            return { label: 'ผ่านเป้าหมาย', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
        }
    }
};

/* ---------------------------------------------------------------------------
   ปิงปองจราจรชีวิต 7 สี (NCDs) — แปลผลสถานะสุขภาพ "แต่ละครั้ง"
   อ้างอิงนิยาม ศ.(พิเศษ) ดร.นพ.วิชัย เทียนถาวร / สบช.โมเดล
   หมายเหตุการออกแบบ:
   - ทำ 6 สี (ขาว→แดง) ยังไม่รวม "สีดำ" (กลุ่มภาวะแทรกซ้อน) เพราะยังไม่มีฟิลด์
     บันทึกความเสียหายอวัยวะเป้าหมาย (ตา/ไต/เท้า/หัวใจ/สมอง)
   - น้ำตาลยึด DTX(=FBS) ร่วมกับ HbA1c แบบ Worst-Case (เลือกค่ารุนแรงสุด)
     โดย HbA1c จะยกระดับเฉพาะเมื่อสูง (≥7.0 = ส้ม, ≥8.0 = แดง); ต่ำกว่า 7.0
     ถือว่าคุมได้ ไม่ดันให้เกิน "เขียวเข้ม" เพื่อไม่ให้ผู้ป่วยคุมดีถูกจัดเป็นสีเหลือง
   - ความดันและน้ำตาลประเมินแยกกันแล้วยึดสีที่รุนแรงสุด (Worst-Case Classification)
   --------------------------------------------------------------------------- */
const pingpongRules = {
    colors: {
        white:      { key: 'white',      label: 'สีขาว',       sub: 'ปกติ',              rank: 0, dot: '#94a3b8', badgeClass: 'bg-white text-slate-600 border border-slate-300',       barClass: 'bg-slate-300',   advice: 'สุขภาพดี ธำรงพฤติกรรม 3อ. ออกกำลังกาย ≥150 นาที/สัปดาห์ และคัดกรองประจำปี' },
        lightgreen: { key: 'lightgreen', label: 'สีเขียวอ่อน', sub: 'กลุ่มเสี่ยง',        rank: 1, dot: '#a3e635', badgeClass: 'bg-lime-50 text-lime-700 border border-lime-300',        barClass: 'bg-lime-400',    advice: 'ภาวะก่อนป่วย ปรับพฤติกรรมเข้มข้น 3อ.3ล. ลดพุง ติดตามซ้ำทุก 3–6 เดือน' },
        darkgreen:  { key: 'darkgreen',  label: 'สีเขียวเข้ม', sub: 'ป่วยระดับ 0 (คุมได้)', rank: 2, dot: '#059669', badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-300', barClass: 'bg-emerald-600', advice: 'ผู้ป่วยคุมได้ดี เน้นกินยาต่อเนื่องห้ามหยุดยาเอง ตรวจภาวะแทรกซ้อนประจำปี' },
        yellow:     { key: 'yellow',     label: 'สีเหลือง',     sub: 'ป่วยระดับ 1',        rank: 3, dot: '#eab308', badgeClass: 'bg-yellow-50 text-yellow-800 border border-yellow-300', barClass: 'bg-yellow-400',  advice: 'ควบคุมได้ปานกลาง ทบทวนอาหาร/การใช้ยา ติดตามทุก 2–3 เดือน เป้าลดกลับเขียวเข้ม' },
        orange:     { key: 'orange',     label: 'สีส้ม',        sub: 'ป่วยระดับ 2',        rank: 4, dot: '#f97316', badgeClass: 'bg-orange-50 text-orange-800 border border-orange-300', barClass: 'bg-orange-500',  advice: 'ควบคุมไม่ดี ค้นหาอุปสรรค ประสานแพทย์ปรับยา ติดตามใกล้ชิดทุก 2–4 สัปดาห์' },
        red:        { key: 'red',        label: 'สีแดง',        sub: 'ป่วยระดับ 3',        rank: 5, dot: '#dc2626', badgeClass: 'bg-red-50 text-red-800 border border-red-300',          barClass: 'bg-red-600',     advice: 'วิกฤต ส่งพบแพทย์ทันที เฝ้าระวังภาวะฉุกเฉิน วางแผนเยี่ยมบ้านใน 1–2 สัปดาห์' },
        unknown:    { key: 'unknown',    label: 'ยังไม่ประเมิน', sub: 'ข้อมูลไม่พอ',        rank: -1, dot: '#cbd5e1', badgeClass: 'bg-slate-100 text-slate-400 border border-slate-200',   barClass: 'bg-slate-200',   advice: 'ต้องมีค่าน้ำตาล (DTX/HbA1c) หรือความดันโลหิตอย่างน้อยหนึ่งอย่างเพื่อแปลผล' }
    },

    // ลำดับสีสำหรับแสดงสเกล/กราจาย (ไม่รวม unknown)
    scaleOrder: ['white', 'lightgreen', 'darkgreen', 'yellow', 'orange', 'red'],

    // ระดับความรุนแรงจากค่าน้ำตาล 0–4 (worst-case ของ DTX/FBS กับ HbA1c) ; -1 = ไม่มีข้อมูล
    glucoseScore: function(dtx, hba1c) {
        let s = -1;
        const d = parseFloat(dtx);
        if (!isNaN(d) && d > 0) {
            if (d < 100) s = 0;
            else if (d <= 125) s = 1;
            else if (d <= 154) s = 2;
            else if (d <= 182) s = 3;
            else s = 4;
        }
        const h = parseFloat(hba1c);
        if (!isNaN(h) && h > 0) {
            let hs = 0;                 // <7.0 = คุมได้ ไม่ยกระดับ
            if (h >= 8.0) hs = 4;       // แดง
            else if (h >= 7.0) hs = 3;  // ส้ม
            s = Math.max(s, hs);
        }
        return s;
    },

    // ระดับความรุนแรงจากความดันโลหิต 0–4 ; -1 = ไม่มีข้อมูล
    bpScore: function(bp) {
        if (!bp && bp !== 0) return -1;
        const parts = bp.toString().split('/');
        const sys = parseInt(parts[0]);
        const dia = parseInt(parts[1]);
        if (isNaN(sys) && isNaN(dia)) return -1;
        const s = isNaN(sys) ? 0 : sys;
        const d = isNaN(dia) ? 0 : dia;
        if (s >= 180 || d >= 110) return 4;
        if (s >= 160 || d >= 100) return 3;
        if (s >= 140 || d >= 90) return 2;
        if (s >= 120 || d >= 80) return 1;
        return 0;
    },

    // เป็นผู้ป่วยที่ได้รับการวินิจฉัย/รับยา (ใช้แยก "เขียวเข้ม" ออกจาก "ขาว/เขียวอ่อน")
    isPatient: function(target) {
        if (!target) return false;
        if (target.type === 'กลุ่มป่วย') return true;
        const cd = (target.chronic_disease || '').toString().toUpperCase();
        return cd.includes('DM') || cd.includes('HT') || cd.includes('เบาหวาน') || cd.includes('ความดัน');
    },

    // แปลผลหนึ่งครั้งเป็นสีปิงปอง — คืน object สีจาก this.colors
    classify: function(log, target) {
        const g = this.glucoseScore(log ? log.dtx : null, log ? log.hba1c : null);
        const b = this.bpScore(log ? log.bp : null);
        if (g < 0 && b < 0) return this.colors.unknown;
        const score = Math.max(g, b);                 // Worst-Case ระหว่างน้ำตาลกับความดัน
        if (score >= 4) return this.colors.red;
        if (score === 3) return this.colors.orange;
        if (score === 2) return this.colors.yellow;
        // score 0 หรือ 1
        if (this.isPatient(target)) return this.colors.darkgreen; // ผู้ป่วยที่คุมค่าได้
        return score === 1 ? this.colors.lightgreen : this.colors.white;
    },

    // badge HTML สั้นสำหรับใช้ซ้ำ
    badgeHtml: function(color, extraClass) {
        if (!color || color.rank < 0) return '';
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[10px] ${color.badgeClass} ${extraClass || ''}">`
             + `<span class="w-2.5 h-2.5 rounded-full" style="background:${color.dot}"></span>ปิงปอง ${color.label} · ${color.sub}</span>`;
    }
};

// หาผลติดตามล่าสุด (ตามรอบ) ของกลุ่มเป้าหมายหนึ่งราย
function getLatestLogForTarget(targetId) {
    const logs = state.quarterlyData.filter(q => String(q.target_id) === String(targetId));
    if (logs.length === 0) return null;
    logs.sort((a, b) => roundSortValue(a.quarter) - roundSortValue(b.quarter));
    return logs[logs.length - 1];
}

function renderInterpreterView() {
    const select = document.getElementById('interp-target-select');
    if (!select) return;

    const villageFilter = document.getElementById('interp-village-filter');
    const selectedVillage = villageFilter ? villageFilter.value : 'all';
    const currentValue = select.value;
    const filteredTargets = state.targets.filter(t => {
        return selectedVillage === 'all' || getTargetVillage(t) === selectedVillage;
    });

    select.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = selectedVillage === 'all'
        ? '-- ป้อนแบบอิสระ --'
        : `-- เลือกกลุ่มเป้าหมายใน${selectedVillage} --`;
    select.appendChild(defaultOption);

    filteredTargets.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = `${t.name} (บ้านเลขที่: ${t.address}, ${getTargetVillage(t)})`;
        select.appendChild(option);
    });

    const stillVisible = filteredTargets.some(t => String(t.id) === String(currentValue));
    select.value = stillVisible ? currentValue : '';

    // วาดสเกลสีปิงปอง และแปลผลค่าปัจจุบัน (ถ้ามี)
    renderPingpongScale();
    classifyInterpreterPingpong();
}

// วาดสเกลสี 6 สี (ขาว→แดง) ในหน้าแปลผล
function renderPingpongScale() {
    const scale = document.getElementById('interp-pp-scale');
    if (!scale) return;
    scale.innerHTML = pingpongRules.scaleOrder.map(k => {
        const c = pingpongRules.colors[k];
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${c.badgeClass}">`
             + `<span class="w-2.5 h-2.5 rounded-full" style="background:${c.dot}"></span>${c.label} · ${c.sub}</span>`;
    }).join('');
}

// แปลผลปิงปองจากช่องกรอกในหน้าแปลผล (แบบ realtime)
function classifyInterpreterPingpong() {
    const badge = document.getElementById('interp-pp-badge');
    const dot = document.getElementById('interp-pp-dot');
    const title = document.getElementById('interp-pp-title');
    const advice = document.getElementById('interp-pp-advice');
    const result = document.getElementById('interp-pp-result');
    if (!badge || !title) return;

    const dtx = document.getElementById('interp-pp-dtx').value;
    const hba1c = document.getElementById('interp-pp-hba1c').value;
    const sbp = document.getElementById('interp-pp-sbp').value;
    const dbp = document.getElementById('interp-pp-dbp').value;
    const isPatient = document.getElementById('interp-pp-patient').checked;

    const bp = (sbp || dbp) ? `${sbp || ''}/${dbp || ''}` : '';
    const pseudoLog = { dtx: dtx, hba1c: hba1c, bp: bp };
    const pseudoTarget = { type: isPatient ? 'กลุ่มป่วย' : 'กลุ่มเสี่ยง' };
    const pp = pingpongRules.classify(pseudoLog, pseudoTarget);

    badge.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs ${pp.badgeClass}`;
    badge.innerHTML = pp.rank >= 0
        ? `<span class="w-2.5 h-2.5 rounded-full" style="background:${pp.dot}"></span>${pp.label}`
        : 'ยังไม่ประเมิน';
    if (dot) dot.style.background = pp.dot;
    title.textContent = pp.rank >= 0 ? `${pp.label} — ${pp.sub}` : 'ป้อนค่าน้ำตาลหรือความดันเพื่อแปลผล';
    if (advice) advice.textContent = pp.advice;
    if (result) {
        result.className = pp.rank >= 0
            ? `rounded-xl border p-4 flex items-start gap-3 ${pp.badgeClass}`
            : 'rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex items-start gap-3';
    }
}

function calculateBodyComposition() {
    const gender = document.getElementById('interp-gender').value;
    const age = parseInt(document.getElementById('interp-age').value) || 0;
    const height = parseFloat(document.getElementById('interp-height').value) || 0;
    const weight = parseFloat(document.getElementById('interp-weight').value) || 0;
    const fat = parseFloat(document.getElementById('interp-bodyfat').value) || 0;
    const visceral = parseInt(document.getElementById('interp-visceral').value) || 0;
    const muscle = parseFloat(document.getElementById('interp-muscle').value) || 0;
    const bodyage = parseInt(document.getElementById('interp-bodyage').value) || 0;

    // Check minimum inputs for BMI
    if (height > 0 && weight > 0) {
        const bmi = weight / ((height / 100) ** 2);
        document.getElementById('interp-val-bmi').textContent = bmi.toFixed(1);
        const bmiInterp = bodyCompRules.interpretBMI(bmi);
        updateCardUI('interp-card-bmi', 'interp-badge-bmi', bmiInterp);
    } else {
        document.getElementById('interp-val-bmi').textContent = '-';
        resetCardUI('interp-card-bmi', 'interp-badge-bmi');
    }

    // Update Fat Card
    if (fat > 0) {
        document.getElementById('interp-val-bodyfat').textContent = fat.toFixed(1) + '%';
        const fatInterp = bodyCompRules.interpretBodyFat(fat, gender);
        updateCardUI('interp-card-bodyfat', 'interp-badge-bodyfat', fatInterp);
    } else {
        document.getElementById('interp-val-bodyfat').textContent = '-';
        resetCardUI('interp-card-bodyfat', 'interp-badge-bodyfat');
    }

    // Update Visceral Card
    if (visceral > 0) {
        document.getElementById('interp-val-visceral').textContent = visceral;
        const visceralInterp = bodyCompRules.interpretVisceralFat(visceral);
        updateCardUI('interp-card-visceral', 'interp-badge-visceral', visceralInterp);
    } else {
        document.getElementById('interp-val-visceral').textContent = '-';
        resetCardUI('interp-card-visceral', 'interp-badge-visceral');
    }

    // Update Muscle Card
    if (muscle > 0) {
        document.getElementById('interp-val-muscle').textContent = muscle.toFixed(1) + '%';
        const muscleInterp = bodyCompRules.interpretSkeletalMuscle(muscle, gender);
        updateCardUI('interp-card-muscle', 'interp-badge-muscle', muscleInterp);
    } else {
        document.getElementById('interp-val-muscle').textContent = '-';
        resetCardUI('interp-card-muscle', 'interp-badge-muscle');
    }

    updateOverallInterpretation(gender, height, weight, fat, visceral, muscle);
}

function updateCardUI(cardId, badgeId, interp) {
    const card = document.getElementById(cardId);
    const badge = document.getElementById(badgeId);
    if (!card || !badge) return;
    
    card.classList.remove('status-bar-success', 'status-bar-warning', 'status-bar-danger', 'border-rose-200', 'border-amber-200', 'border-emerald-200', 'border-sky-200');
    
    badge.textContent = interp.label;
    badge.className = `px-2.5 py-0.5 rounded-full font-bold text-[10px] ${interp.badgeClass}`;
    
    if (interp.label.includes('สูงมาก') || interp.label.includes('อ้วน') || interp.label.includes('ต่ำ')) {
        if (interp.label.includes('ต่ำ') && (cardId.includes('bmi') || cardId.includes('muscle'))) {
            card.classList.add('status-bar-danger', 'border-rose-200'); // Low muscle or low weight is critical
        } else if (interp.label.includes('ต่ำ')) {
            card.classList.add('border-sky-200');
        } else {
            card.classList.add('status-bar-danger', 'border-rose-200');
        }
    } else if (interp.label.includes('สูง') || interp.label.includes('น้ำหนักเกิน') || interp.label.includes('เสี่ยง')) {
        card.classList.add('status-bar-warning', 'border-amber-200');
    } else if (interp.label.includes('ปกติ') || interp.label.includes('ดี') || interp.label.includes('ผ่านเป้าหมาย')) {
        card.classList.add('status-bar-success', 'border-emerald-200');
    }
}

function resetCardUI(cardId, badgeId) {
    const card = document.getElementById(cardId);
    const badge = document.getElementById(badgeId);
    if (!card || !badge) return;
    
    card.classList.remove('status-bar-success', 'status-bar-warning', 'status-bar-danger', 'border-rose-200', 'border-amber-200', 'border-emerald-200', 'border-sky-200');
    badge.textContent = '-';
    badge.className = 'px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-bold text-[10px]';
}

function updateOverallInterpretation(gender, height, weight, fat, visceral, muscle) {
    const bar = document.getElementById('interp-overall-bar');
    const badge = document.getElementById('interp-overall-badge');
    const desc = document.getElementById('interp-overall-desc');
    if (!bar || !badge || !desc) return;
    
    if (height <= 0 || weight <= 0) {
        bar.className = 'vital-bar bg-slate-300';
        badge.className = 'w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0';
        badge.innerHTML = '<span class="material-symbols-outlined text-4xl">monitor_weight</span>';
        desc.textContent = 'โปรดป้อน น้ำหนัก และข้อมูลตัวเลขจากหน้าจอเครื่องชั่ง เพื่อตรวจสอบการประเมินผลอย่างครอบคลุม';
        return;
    }
    
    const bmi = weight / ((height / 100) ** 2);
    const bmiInterp = bodyCompRules.interpretBMI(bmi);
    const fatInterp = bodyCompRules.interpretBodyFat(fat, gender);
    const visceralInterp = bodyCompRules.interpretVisceralFat(visceral);
    const muscleInterp = bodyCompRules.interpretSkeletalMuscle(muscle, gender);
    
    let riskScore = 0;
    let alerts = [];
    
    if (bmiInterp.label === 'อ้วน') { riskScore += 3; alerts.push('ดัชนีมวลกายอยู่ในเกณฑ์อ้วน'); }
    else if (bmiInterp.label === 'น้ำหนักเกิน') { riskScore += 1; alerts.push('น้ำหนักเกินเกณฑ์มาตรฐาน'); }
    else if (bmiInterp.label === 'น้ำหนักต่ำกว่าเกณฑ์') { riskScore += 1; alerts.push('น้ำหนักต่ำกว่าเกณฑ์มาตรฐาน'); }
    
    if (fat > 0) {
        if (fatInterp.label.includes('สูง')) { riskScore += 2; alerts.push('เปอร์เซ็นต์ไขมันในร่างกายสูงกว่าเป้าหมาย'); }
    }
    
    if (visceral > 0) {
        if (visceralInterp.label === 'สูงมาก') { riskScore += 3; alerts.push('ระดับไขมันในช่องท้องสูงมากอันตราย'); }
        else if (visceralInterp.label === 'สูง') { riskScore += 2; alerts.push('ระดับไขมันในช่องท้องอยู่ในเกณฑ์สูง'); }
    }
    
    if (muscle > 0) {
        if (muscleInterp.label.includes('ต่ำ')) { riskScore += 1; alerts.push('มวลกล้ามเนื้อลายต่ำกว่าเป้าหมาย'); }
    }
    
    if (riskScore >= 4) {
        bar.className = 'vital-bar bg-rose-500';
        badge.className = 'w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 shrink-0';
        badge.innerHTML = '<span class="material-symbols-outlined text-4xl">warning</span>';
        desc.innerHTML = `<strong>ตรวจพบข้อควรระวังสำคัญ:</strong> ${alerts.join(', ')} ควรแนะนำการปรับพฤติกรรม เช่น เลี่ยงอาหารรสจัด หวาน-มัน-เค็ม และเพิ่มการออกกำลังกายแบบมีแรงต้าน`;
    } else if (riskScore > 0) {
        bar.className = 'vital-bar bg-amber-500';
        badge.className = 'w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-500 shrink-0';
        badge.innerHTML = '<span class="material-symbols-outlined text-4xl">error</span>';
        desc.innerHTML = `<strong>ตรวจพบข้อสังเกต:</strong> ${alerts.join(', ')} ควรเริ่มควบคุมอาหารและออกกำลังกายอย่างสม่ำเสมอเพื่อฟื้นฟูองค์ประกอบร่างกาย`;
    } else {
        bar.className = 'vital-bar bg-emerald-500';
        badge.className = 'w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 shrink-0';
        badge.innerHTML = '<span class="material-symbols-outlined text-4xl">check_circle</span>';
        desc.innerHTML = `<strong>สุขภาพปกติ:</strong> ดัชนีมวลกาย เปอร์เซ็นต์ไขมัน และระดับไขมันช่องท้องอยู่ในเกณฑ์ปกติ มีสัดส่วนกล้ามเนื้อเหมาะสม รักษาพฤติกรรมสุขภาพที่ดีนี้ต่อไป!`;
    }
}

function setupQuarterlyFormRealtimeInterpretation() {
    const weightInput = document.getElementById('form-q-weight');
    const fatInput = document.getElementById('form-q-fat');
    const visceralInput = document.getElementById('form-q-visceral');
    const muscleInput = document.getElementById('form-q-muscle');
    
    if (!weightInput || !fatInput || !visceralInput || !muscleInput) return;
    
    const updateFormBmi = () => {
        const height = parseFloat(document.getElementById('form-q-height').value) || 0;
        const weight = parseFloat(weightInput.value) || 0;
        const badge = document.getElementById('form-q-badge-bmi');
        
        if (height > 0 && weight > 0) {
            const bmi = weight / ((height / 100) ** 2);
            const interp = bodyCompRules.interpretBMI(bmi);
            badge.innerHTML = `BMI: <strong>${bmi.toFixed(1)}</strong> <span class="${interp.class}">(${interp.label})</span>`;
        } else {
            badge.innerHTML = 'BMI: -';
        }
    };
    
    const updateFormFat = () => {
        const targetId = parseInt(document.getElementById('form-q-target-id').value);
        const target = state.targets.find(t => t.id === targetId) || state.selectedTargetProfile || {};
        const gender = inferGender(target.name);
        const fat = parseFloat(fatInput.value) || 0;
        const badge = document.getElementById('form-q-badge-fat');
        
        if (fat > 0) {
            const interp = bodyCompRules.interpretBodyFat(fat, gender);
            badge.innerHTML = `ไขมัน: <span class="${interp.class}"><strong>${interp.label}</strong></span>`;
        } else {
            badge.innerHTML = 'ไขมัน: -';
        }
    };
    
    const updateFormVisceral = () => {
        const visceral = parseInt(visceralInput.value) || 0;
        const badge = document.getElementById('form-q-badge-visceral');
        
        if (visceral > 0) {
            const interp = bodyCompRules.interpretVisceralFat(visceral);
            badge.innerHTML = `ช่องท้อง: <span class="${interp.class}"><strong>${interp.label}</strong></span>`;
        } else {
            badge.innerHTML = 'ช่องท้อง: -';
        }
    };
    
    const updateFormMuscle = () => {
        const targetId = parseInt(document.getElementById('form-q-target-id').value);
        const target = state.targets.find(t => t.id === targetId) || state.selectedTargetProfile || {};
        const gender = inferGender(target.name);
        const muscle = parseFloat(muscleInput.value) || 0;
        const badge = document.getElementById('form-q-badge-muscle');
        
        if (muscle > 0) {
            const interp = bodyCompRules.interpretSkeletalMuscle(muscle, gender);
            badge.innerHTML = `กล้ามเนื้อ: <span class="${interp.class}"><strong>${interp.label}</strong></span>`;
        } else {
            badge.innerHTML = 'กล้ามเนื้อ: -';
        }
    };
    
    weightInput.addEventListener('input', updateFormBmi);
    fatInput.addEventListener('input', updateFormFat);
    visceralInput.addEventListener('input', updateFormVisceral);
    muscleInput.addEventListener('input', updateFormMuscle);
}

function getWeeklySummaryFormData(weekIndex) {
    return {
        exercise_minutes: document.getElementById(`form-q-w${weekIndex}-exercise`).value,
        healthy_menu_days: document.getElementById(`form-q-w${weekIndex}-menu`).value,
        sleep_avg: document.getElementById(`form-q-w${weekIndex}-sleep`).value,
        avoid_sweet: document.getElementById(`form-q-w${weekIndex}-sweet`).value,
        avoid_oil: document.getElementById(`form-q-w${weekIndex}-oil`).value,
        avoid_salt: document.getElementById(`form-q-w${weekIndex}-salt`).value
    };
}

function updateWeeklySummaryPreview(weekIndex) {
    const preview = document.getElementById(`form-q-week${weekIndex}-preview`);
    const data = getWeeklySummaryFormData(weekIndex);
    if ([data.avoid_sweet, data.avoid_oil, data.avoid_salt].some(value => value === '')) {
        preview.textContent = 'รอข้อมูล';
        preview.classList.remove('text-emerald-700', 'text-amber-700');
        preview.classList.add('text-slate-500');
        return;
    }
    const summary = summarizeWeek(data);
    preview.textContent = `รสจัด ${summary.avoidanceAverage}/5 · ${summary.avoidanceLabel}`;
    preview.classList.remove('text-slate-500', 'text-emerald-700', 'text-amber-700');
    preview.classList.add(summary.avoidanceAverage >= 3.5 ? 'text-emerald-700' : 'text-amber-700');
}

function toggleWeeklySummaryInputs(enabled) {
    document.querySelectorAll('.weekly-summary-input').forEach(input => {
        input.disabled = !enabled;
        input.required = enabled;
        input.setAttribute('aria-required', String(enabled));
    });
}

function updateTrackingRoundForm() {
    const round = document.getElementById('form-q-round').value;
    const weeks = getWeeksForRound(round);
    const hasWeeklySummary = weeks.length === 2;
    document.getElementById('biweekly-summary-section').classList.toggle('hidden', !hasWeeklySummary);
    toggleWeeklySummaryInputs(hasWeeklySummary);
    if (hasWeeklySummary) {
        document.getElementById('form-q-week1-title').textContent = `สัปดาห์ที่ ${weeks[0]}`;
        document.getElementById('form-q-week2-title').textContent = `สัปดาห์ที่ ${weeks[1]}`;
    }
    document.querySelector('.lab-round-section').classList.toggle('hidden', !isLabRound(round));
}

function setTrackingField(id, value) {
    const field = document.getElementById(id);
    if (field) field.value = value ?? '';
}

function loadTrackingRoundRecord(round) {
    const record = state.selectedTargetQuarterly.find(item => item.quarter === round);
    const physicalFields = {
        'form-q-weight': 'weight', 'form-q-waist': 'waist', 'form-q-bp': 'bp', 'form-q-dtx': 'dtx',
        'form-q-fat': 'body_fat', 'form-q-muscle': 'muscle_mass', 'form-q-visceral': 'visceral_fat',
        'form-q-bodyage': 'body_age', 'form-q-remark': 'remark', 'form-q-hba1c': 'hba1c',
        'form-q-egfr': 'egfr', 'form-q-creatinine': 'creatinine', 'form-q-trigly': 'triglyceride',
        'form-q-ldl': 'ldl', 'form-q-chol': 'cholesterol'
    };
    Object.entries(physicalFields).forEach(([id, key]) => setTrackingField(id, record ? (record._ncdRawPhysical?.[key] ?? record[key]) : ''));
    ncdReportUI.load(record, state.selectedTargetProfile);
    if (record) {
        setTrackingField('form-q-date', record.date);
    } else {
        const today = new Date();
        setTrackingField('form-q-date', `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`);
    }
    [1, 2].forEach(weekIndex => {
        const fields = { exercise: 'exercise_minutes', menu: 'healthy_menu_days', sleep: 'sleep_avg', sweet: 'avoid_sweet', oil: 'avoid_oil', salt: 'avoid_salt' };
        Object.entries(fields).forEach(([suffix, key]) => {
            setTrackingField(`form-q-w${weekIndex}-${suffix}`, record ? record[`week${weekIndex}_${key}`] : '');
        });
        updateWeeklySummaryPreview(weekIndex);
    });
    updateTrackingRoundForm();
}

function openQuarterlyModal(targetId) {
    const t = state.targets.find(t => t.id === targetId) || state.selectedTargetProfile;
    if (!t) return;
    
    document.getElementById('quarterly-form').reset();
    document.getElementById('form-q-target-id').value = t.id;
    document.getElementById('form-q-height').value = t.height;
    
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    document.getElementById('form-q-date').value = `${dd}/${mm}/${yyyy}`;
    
    const recordedRounds = new Set(state.selectedTargetQuarterly.map(item => item.quarter));
    const nextRound = TRACKING_ROUNDS.find(item => !recordedRounds.has(item.value));
    document.getElementById('form-q-round').value = nextRound ? nextRound.value : 'W24';
    
    // Reset badges
    document.getElementById('form-q-badge-bmi').innerHTML = 'BMI: -';
    document.getElementById('form-q-badge-fat').innerHTML = 'ไขมัน: -';
    document.getElementById('form-q-badge-visceral').innerHTML = 'ช่องท้อง: -';
    document.getElementById('form-q-badge-muscle').innerHTML = 'กล้ามเนื้อ: -';

    loadTrackingRoundRecord(document.getElementById('form-q-round').value);
    
    openModal('quarterly-modal');
}
