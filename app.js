/* ==========================================
   APPLICATION LOGIC: NCDs Focus (มุ่งเป้าปัตตานี)
   Handles Views, Chart.js, CSV Fetch, and GAS API
   ========================================== */

// --- Global Application State ---
const DEFAULT_API_PASSCODE = '009941';
const ACTIVE_VILLAGES = ['หมู่ 2 บ้านตรัง', 'หมู่ 3 บ้านเขาวัง', 'หมู่ 4 บ้านม่วงเงิน'];
const FUTURE_VILLAGES = ['หมู่ 1 บ้านบองอ'];
const ALL_VILLAGES = [...ACTIVE_VILLAGES, ...FUTURE_VILLAGES];

const state = {
    currentView: 'dashboard-view',
    connectionMode: 'demo', // 'demo' or 'online'
    gasUrl: 'https://script.google.com/macros/s/AKfycbyWSrEKMUTazju1NHOk4h_XpJlpKTColEyyzdUexl7LXiphImm7wZL7cBINCxpCdeVjDA/exec',
    apiPasscode: DEFAULT_API_PASSCODE,
    
    // In-memory data (loaded from CSV or API)
    targets: [],
    quarterlyData: [],
    dailyLogs: [],
    
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
    setupProfileActionFallbacks();
    setupEventListeners();
    checkAuthentication();
});

// --- Settings & Theme Management ---
function loadSettings() {
    const savedUrl = localStorage.getItem('ncd_gas_url');
    const savedPasscode = localStorage.getItem('ncd_api_passcode');
    const savedMode = localStorage.getItem('ncd_connection_mode');
    
    if (savedUrl) {
        state.gasUrl = savedUrl;
    }
    if (state.gasUrl) {
        document.getElementById('setting-gas-url').value = state.gasUrl;
    }
    
    if (savedPasscode === '123456') {
        localStorage.setItem('ncd_api_passcode', DEFAULT_API_PASSCODE);
    } else if (savedPasscode) {
        state.apiPasscode = savedPasscode;
    }
    if (state.apiPasscode) {
        document.getElementById('setting-passcode').value = state.apiPasscode;
    }
    
    const hasApiSettings = Boolean(state.gasUrl && state.apiPasscode);
    state.connectionMode = hasApiSettings ? 'online' : (savedMode || 'demo');

    if (state.connectionMode === 'online' && (!state.gasUrl || !state.apiPasscode)) {
        state.connectionMode = 'demo';
        localStorage.setItem('ncd_connection_mode', 'demo');
    }

    updateConnectionIndicator();
}

function saveSettings(url, passcode) {
    if (!url || !passcode) {
        showToast("กรุณากรอก URL และรหัสผ่าน API ให้ครบถ้วน", "danger");
        return;
    }

    state.gasUrl = url;
    state.apiPasscode = passcode;
    state.connectionMode = 'online';
    
    localStorage.setItem('ncd_gas_url', url);
    localStorage.setItem('ncd_api_passcode', passcode);
    localStorage.setItem('ncd_connection_mode', 'online');
    
    updateConnectionIndicator();
    showToast("บันทึกการตั้งค่าการเชื่อมต่อสำเร็จ!");
    refreshData();
}

function resetToDemo() {
    switchToDemoMode();
    
    updateConnectionIndicator();
    showToast("กลับสู่โหมดทดลองใช้ (Demo Mode)");
    refreshData();
}

function switchToDemoMode() {
    state.connectionMode = 'demo';
    localStorage.setItem('ncd_connection_mode', 'demo');
}

function updateConnectionIndicator() {
    const indicator = document.getElementById('conn-status-indicator');
    const demoBanner = document.getElementById('demo-banner');
    
    if (state.connectionMode === 'online') {
        indicator.className = 'connection-status online';
        indicator.querySelector('.status-text').textContent = 'Connected (Sheets)';
        demoBanner.classList.add('hidden');
    } else {
        indicator.className = 'connection-status offline';
        indicator.querySelector('.status-text').textContent = 'Demo Mode';
        demoBanner.classList.remove('hidden');
    }
}

function getTargetVillage(target) {
    if (!target || !target.village) return 'ยังไม่ระบุหมู่บ้าน';
    return target.village;
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

// --- Data Fetching and Parsing ---
async function refreshData() {
    showSpinner(true);
    try {
        if (state.connectionMode === 'online' && state.gasUrl) {
            await fetchFromAPI();
        } else {
            await fetchFromLocalCSVs();
        }
        
        // Render initial view
        switchView(state.currentView);
    } catch (err) {
        console.error("Error loading data:", err);
        showToast("ไม่สามารถโหลดข้อมูลได้: " + err.message, "danger");
        // Fallback to demo mode if API failed
        if (state.connectionMode === 'online') {
            showToast("สลับเข้าสู่โหมดทดลองใช้เนื่องจากเชื่อมต่อล้มเหลว", "warning");
            switchToDemoMode();
            updateConnectionIndicator();
            await fetchFromLocalCSVs();
            switchView(state.currentView);
        }
    } finally {
        showSpinner(false);
    }
}

// Fetch database from Google Apps Script Web App
async function fetchFromAPI() {
    // 1. Get Targets
    const targetsJSON = await postToAPI('getTargets', {});
    if (!targetsJSON.success) throw new Error(targetsJSON.error);
    state.targets = targetsJSON.data;
    state.targets.forEach(t => {
        t.id = parseInt(t.id);
        t.age = parseInt(t.age);
        t.height = parseFloat(t.height);
        t.village = t.village || '';
    });
    
    // 2. Fetch stats and other tables by fetching details when needed,
    // but to get dashboard Stats, we query getDashboardStats API
    const statsJSON = await postToAPI('getDashboardStats', {});
    if (statsJSON.success) {
        state.apiDashboardStats = statsJSON.data;
    }
}

// Fetch database from local CSV mock files (Demo Mode)
async function fetchFromLocalCSVs() {
    // Helper to read and parse local files
    const fetchCSV = async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load ${url}`);
        const text = await res.text();
        return parseCSV(text);
    };

    state.targets = await fetchCSV('data/targets.csv');
    state.quarterlyData = await fetchCSV('data/quarterly_data.csv');
    state.dailyLogs = await fetchCSV('data/daily_logs.csv');
    
    // Convert numeric fields from string
    state.targets.forEach(t => {
        t.id = parseInt(t.id);
        t.age = parseInt(t.age);
        t.height = parseFloat(t.height);
        t.village = t.village || '';
    });
    
    state.quarterlyData.forEach(q => {
        q.id = parseInt(q.id);
        q.target_id = parseInt(q.target_id);
        q.weight = parseFloat(q.weight);
        q.bmi = parseFloat(q.bmi);
        q.waist = parseFloat(q.waist);
        q.dtx = parseInt(q.dtx);
        q.body_fat = parseFloat(q.body_fat) || 0;
        q.muscle_mass = parseFloat(q.muscle_mass) || 0;
        q.visceral_fat = parseInt(q.visceral_fat) || 0;
        q.body_age = parseInt(q.body_age) || 0;
        q.veggie_fruit = parseInt(q.veggie_fruit) || 0;
    });

    state.dailyLogs.forEach(d => {
        d.id = parseInt(d.id);
        d.target_id = parseInt(d.target_id);
        d.avoid_sweet = parseInt(d.avoid_sweet);
        d.avoid_oil = parseInt(d.avoid_oil);
        d.avoid_salt = parseInt(d.avoid_salt);
        d.exercise_duration = parseInt(d.exercise_duration);
        d.water = parseInt(d.water);
        d.sleep_hours = parseFloat(d.sleep_hours);
    });
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
        
        if (row.length === headers.length) {
            const obj = {};
            headers.forEach((header, idx) => {
                let val = row[idx].replace(/^"|"$/g, '');
                // Handle newlines
                val = val.replace(/\\n/g, '\n');
                obj[header] = val;
            });
            result.push(obj);
        }
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

// --- Navigation / Routing ---
function switchView(viewId) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Show active view
    const activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.classList.remove('hidden');
    }
    
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-view') === viewId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
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
    } else if (viewId === 'profile-view') {
        renderProfileDetail();
    } else if (viewId === 'interpreter-view') {
        renderInterpreterView();
    }
}

function updateHeaderTitles(viewId) {
    const title = document.getElementById('view-title');
    const subtitle = document.getElementById('view-subtitle');
    
    if (viewId === 'dashboard-view') {
        title.textContent = 'แผงควบคุม (Dashboard)';
        subtitle.textContent = 'สรุปสถิติสถานะสุขภาพและการเปลี่ยนแปลงพฤติกรรมภาพรวม';
    } else if (viewId === 'targets-view') {
        title.textContent = 'รายชื่อกลุ่มเป้าหมาย';
        subtitle.textContent = 'แสดงข้อมูลประชากรเป้าหมาย นำเข้า ติดตามผล และกรองกลุ่มเสี่ยง/กลุ่มป่วย';
    } else if (viewId === 'profile-view') {
        title.textContent = 'ข้อมูลพฤติกรรมและสุขภาพรายบุคคล';
        subtitle.textContent = 'แสดงรายละเอียดสุขภาพประวัติการคัดกรอง 3 เดือน และกราฟแนวโน้มพัฒนาการ';
    } else if (viewId === 'settings-view') {
        title.textContent = 'ตั้งค่าการเชื่อมต่อระบบ';
        subtitle.textContent = 'เชื่อมต่อฐานข้อมูล Google Sheets ของคุณผ่านระบบ Google Apps Script';
    } else if (viewId === 'interpreter-view') {
        title.textContent = 'เครื่องมือแปลผลวัดองค์ประกอบร่างกาย';
        subtitle.textContent = 'วิเคราะห์สัดส่วนไขมัน กล้ามเนื้อ ไขมันช่องท้อง และดัชนีมวลกายสำหรับ อสม.';
    }
}

// --- View 1: Dashboard Rendering ---
function renderDashboard() {
    let stats = {};
    
    if (state.connectionMode === 'online' && state.apiDashboardStats) {
        stats = state.apiDashboardStats;
    } else {
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
                const qOrder = { "M0": 1, "M3": 2, "M6": 3, "M9": 4 };
                logs.sort((a, b) => (qOrder[a.quarter] || 99) - (qOrder[b.quarter] || 99));
                
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
        
        stats = {
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
    
    // Render Urgent targets table
    renderUrgentTargetsTable();
    
    // Render overall behavior metrics
    renderOverallBehavior();
}

function renderVillageProgress(stats = {}) {
    const container = document.getElementById('village-progress-container');
    if (!container) return;

    const villageSummary = Array.isArray(stats.villageSummary) ? stats.villageSummary : calculateVillageSummary();
    container.innerHTML = villageSummary.map(item => {
        const progressWidth = Math.min(Math.max(item.progressRate, 0), 100);
        return `
            <div class="bg-white/50 border border-white/60 rounded-xl p-4 shadow-sm">
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h4 class="font-headline font-bold text-primary text-base">${displayValue(item.village)}</h4>
                        <p class="text-xs text-on-surface-variant">กลุ่มเป้าหมาย ${item.total} คน</p>
                    </div>
                    <div class="text-right">
                        <div class="font-stat-display text-2xl font-extrabold text-on-surface">${item.progressRate}%</div>
                        <span class="text-[10px] text-on-surface-variant font-semibold">มีข้อมูลติดตาม</span>
                    </div>
                </div>
                <div class="w-full h-2.5 bg-outline-variant/30 rounded-full overflow-hidden mb-3">
                    <div class="h-full bg-primary rounded-full transition-all duration-500" style="width: ${progressWidth}%"></div>
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
    
    const isDark = document.body.classList.contains('dark-theme');
    
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
    const ctx = document.getElementById('improvement-chart').getContext('2d');
    if (state.charts.improvement) state.charts.improvement.destroy();
    
    const isDark = document.body.classList.contains('dark-theme');
    
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
    tbody.innerHTML = '';
    
    // Find urgent targets (BP > 140/90 or DTX > 160) from latest quarterly data
    const latestLogs = {};
    const qOrder = { "M0": 1, "M3": 2, "M6": 3, "M9": 4 };
    
    state.quarterlyData.forEach(row => {
        const tid = row.target_id;
        if (!latestLogs[tid] || qOrder[row.quarter] > qOrder[latestLogs[tid].quarter]) {
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
    
    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">ไม่พบเป้าหมายที่มีวิกฤตสุขภาพในระบบ</td></tr>`;
        return;
    }
    
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

    // Add event click to "ดูข้อมูล" buttons
    tbody.querySelectorAll('.view-profile-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            viewTargetProfile(id);
        });
    });
}

function renderOverallBehavior() {
    if (state.quarterlyData.length === 0) return;
    
    // Calculate behavioral metrics from the latest quarterly logs
    const latestLogs = {};
    const qOrder = { "M0": 1, "M3": 2, "M6": 3, "M9": 4 };
    
    state.quarterlyData.forEach(row => {
        const tid = row.target_id;
        if (!latestLogs[tid] || qOrder[row.quarter] > qOrder[latestLogs[tid].quarter]) {
            latestLogs[tid] = row;
        }
    });

    const logsArray = Object.values(latestLogs);
    const total = logsArray.length;
    
    if (total === 0) return;
    
    const exerciseCount = logsArray.filter(l => l.physical_activity === '>= 150 นาที').length;
    const veggieCount = logsArray.filter(l => l.veggie_fruit >= 5).length;
    const sleepCount = logsArray.filter(l => l.sleep === '≥ 7-8 ชม.').length;
    const smokingCount = logsArray.filter(l => l.smoking === 'ไม่สูบ').length;
    
    const exerciseRate = ((exerciseCount / total) * 100).toFixed(0);
    const veggieRate = ((veggieCount / total) * 100).toFixed(0);
    const sleepRate = ((sleepCount / total) * 100).toFixed(0);
    const smokingRate = ((smokingCount / total) * 100).toFixed(0);
    
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
    const container = document.getElementById('targets-cards-container');
    container.innerHTML = '';
    
    const searchVal = document.getElementById('target-search-input').value.toLowerCase();
    const filterType = document.getElementById('filter-type').value;
    const filterVillage = document.getElementById('filter-village').value;
    const filterDisease = document.getElementById('filter-disease').value;
    
    // Group latest quarterly logs for disease checking
    const latestLogs = {};
    const qOrder = { "M0": 1, "M3": 2, "M6": 3, "M9": 4 };
    state.quarterlyData.forEach(row => {
        const tid = row.target_id;
        if (!latestLogs[tid] || qOrder[row.quarter] > qOrder[latestLogs[tid].quarter]) {
            latestLogs[tid] = row;
        }
    });

    // Filter targets
    let filtered = state.targets.filter(t => {
        // Search Name & Address
        const village = getTargetVillage(t);
        const matchSearch = (t.name || '').toLowerCase().includes(searchVal)
            || (t.address || '').toLowerCase().includes(searchVal)
            || village.toLowerCase().includes(searchVal);
        
        // Filter Type (Risk vs Patient)
        const matchType = filterType === 'all' || t.type === filterType;

        // Filter Village
        const matchVillage = filterVillage === 'all' || village === filterVillage;
        
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
        
        return matchSearch && matchType && matchVillage && matchDisease;
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
    
    if (pageItems.length === 0) {
        container.innerHTML = `<div class="panel grid-span-2" style="text-align: center; width: 100%; color: var(--text-muted); padding: 40px;">ไม่พบข้อมูลกลุ่มเป้าหมายตามที่ค้นหา</div>`;
        return;
    }
    
    // Render cards
    pageItems.forEach(t => {
        const log = latestLogs[t.id] || {};
        const card = document.createElement('div');
        
        const badgeBgClass = t.type === 'กลุ่มเสี่ยง' ? 'bg-risk-warning/15 text-risk-warning border border-risk-warning/30' : 'bg-risk-danger/15 text-risk-danger border border-risk-danger/30';
        
        // Status indicator color bar based on health risk
        let dotColorClass = 'bg-emerald-500';
        if (log.dtx >= 140 || (log.bp && parseInt(log.bp.toString().split('/')[0]) >= 140)) {
            dotColorClass = 'bg-risk-danger'; // Red
        } else if (log.dtx >= 110 || (log.bp && parseInt(log.bp.toString().split('/')[0]) >= 130) || log.bmi >= 25) {
            dotColorClass = 'bg-risk-warning'; // Yellow
        }
        
        const bmiVal = log.bmi ? log.bmi.toFixed(1) : '-';
        const dtxVal = log.dtx ? log.dtx : '-';
        const village = getTargetVillage(t);
        
        // Calculate progress percents for bars
        const bmiPercent = log.bmi ? Math.min(Math.max((log.bmi - 15) / 20 * 100, 5), 100) : 0;
        const dtxPercent = log.dtx ? Math.min(Math.max((log.dtx - 70) / 130 * 100, 5), 100) : 0;
        
        // BMI Label
        let bmiLabel = 'ปกติ';
        let bmiColor = 'text-emerald-500';
        let bmiBarBg = 'bg-emerald-500';
        if (log.bmi >= 30.0) { bmiLabel = 'อ้วน'; bmiColor = 'text-rose-500'; bmiBarBg = 'bg-rose-500'; }
        else if (log.bmi >= 25.0) { bmiLabel = 'น้ำหนักเกิน'; bmiColor = 'text-amber-500'; bmiBarBg = 'bg-amber-500'; }
        else if (log.bmi < 18.5 && log.bmi > 0) { bmiLabel = 'น้ำหนักน้อย'; bmiColor = 'text-sky-500'; bmiBarBg = 'bg-sky-500'; }

        // DTX Label
        let dtxLabel = 'ปกติ';
        let dtxColor = 'text-emerald-500';
        let dtxBarBg = 'bg-emerald-500';
        if (log.dtx >= 126) { dtxLabel = 'เบาหวาน'; dtxColor = 'text-rose-500'; dtxBarBg = 'bg-rose-500'; }
        else if (log.dtx >= 100) { dtxLabel = 'กลุ่มเสี่ยง'; dtxColor = 'text-amber-500'; dtxBarBg = 'bg-amber-500'; }
        
        card.className = 'relative bg-surface-glass backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] rounded-xl overflow-hidden group hover:-translate-y-1 transition-transform duration-300';
        card.innerHTML = `
            <div class="vital-bar ${dotColorClass}"></div>
            <div class="p-5 pl-6">
                <div class="flex justify-between items-start mb-3">
                    <span class="inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${badgeBgClass}">${displayValue(t.type)}</span>
                </div>
                <h3 class="font-headline text-lg font-bold text-on-surface mb-1">${displayValue(t.name)}</h3>
                <p class="text-xs text-on-surface-variant flex items-center gap-1 mb-4">
                    <span class="material-symbols-outlined text-[16px] text-primary">location_on</span>
                    <span>บ้านเลขที่ ${displayValue(t.address)} &bull; ${displayValue(village)} &bull; อายุ ${displayValue(t.age)} ปี</span>
                </p>
                <div class="space-y-3">
                    <div class="bg-white/40 rounded-lg p-3">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-xs text-on-surface-variant">BMI (${bmiVal})</span>
                            <span class="font-bold text-[10px] ${bmiColor}">${bmiLabel}</span>
                        </div>
                        <div class="w-full bg-outline-variant/30 rounded-full h-2">
                            <div class="h-2 rounded-full ${bmiBarBg}" style="width: ${bmiPercent}%"></div>
                        </div>
                    </div>
                    <div class="bg-white/40 rounded-lg p-3">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-xs text-on-surface-variant">DTX (${dtxVal} มก.)</span>
                            <span class="font-bold text-[10px] ${dtxColor}">${dtxLabel}</span>
                        </div>
                        <div class="w-full bg-outline-variant/30 rounded-full h-2">
                            <div class="h-2 rounded-full ${dtxBarBg}" style="width: ${dtxPercent}%"></div>
                        </div>
                    </div>
                </div>
                <div class="mt-4 pt-3 border-t border-slate-100/50 flex justify-end">
                    <button class="w-full bg-primary/10 hover:bg-primary/20 text-primary font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs view-profile-btn" data-id="${t.id}">
                        <span class="material-symbols-outlined text-[16px]">visibility</span>
                        <span>ดูข้อมูลสุขภาพ</span>
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });

    // Add click listeners
    container.querySelectorAll('.view-profile-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            viewTargetProfile(id);
        });
    });
}

// --- View 3: Target Profile Rendering ---
async function viewTargetProfile(targetId) {
    state.selectedTargetId = targetId;
    
    showSpinner(true);
    try {
        if (state.connectionMode === 'online') {
            // Fetch target details from API
            const json = await postToAPI('getTargetDetail', { id: targetId });
            if (!json.success) throw new Error(json.error);
            
            state.selectedTargetProfile = json.data.profile;
            state.selectedTargetQuarterly = json.data.quarterly;
            state.selectedTargetDailyLogs = json.data.dailyLogs;
            
            // Format numeric values
            state.selectedTargetProfile.id = parseInt(state.selectedTargetProfile.id);
            state.selectedTargetProfile.age = parseInt(state.selectedTargetProfile.age);
            state.selectedTargetProfile.height = parseFloat(state.selectedTargetProfile.height);
            
            state.selectedTargetQuarterly.forEach(q => {
                q.id = parseInt(q.id);
                q.target_id = parseInt(q.target_id);
                q.weight = parseFloat(q.weight);
                q.bmi = parseFloat(q.bmi);
                q.waist = parseFloat(q.waist);
                q.dtx = parseInt(q.dtx);
                q.body_fat = parseFloat(q.body_fat) || 0;
                q.muscle_mass = parseFloat(q.muscle_mass) || 0;
                q.visceral_fat = parseInt(q.visceral_fat) || 0;
                q.body_age = parseInt(q.body_age) || 0;
                q.veggie_fruit = parseInt(q.veggie_fruit) || 0;
            });
            
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
            // Filter locally (Demo Mode)
            state.selectedTargetProfile = state.targets.find(t => t.id === targetId);
            state.selectedTargetQuarterly = state.quarterlyData.filter(q => q.target_id === targetId);
            state.selectedTargetDailyLogs = state.dailyLogs.filter(d => d.target_id === targetId);
            
            // Sort quarterly (M0, M3, M6, M9)
            const qOrder = { "M0": 1, "M3": 2, "M6": 3, "M9": 4 };
            state.selectedTargetQuarterly.sort((a, b) => (qOrder[a.quarter] || 99) - (qOrder[b.quarter] || 99));
        }
        
        switchView('profile-view');
    } catch (err) {
        console.error("Error viewing profile:", err);
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
    
    const diseasesText = (t.chronic_disease === 'ไม่มี' || !t.chronic_disease) ? 'ไม่มีโรคประจำตัว' : t.chronic_disease;
    document.getElementById('profile-diseases').textContent = diseasesText;
    document.getElementById('profile-medicines').textContent = t.medicines || '-';
    
    const badge = document.getElementById('profile-type-badge');
    badge.textContent = t.type;
    badge.className = t.type === 'กลุ่มเสี่ยง' ? 'badge badge-risk' : 'badge badge-patient';
    
    // Set profile icon avatar color
    const avatar = document.getElementById('profile-avatar-icon');
    avatar.style.color = t.type === 'กลุ่มเสี่ยง' ? '#f59e0b' : '#ef4444';
    avatar.style.backgroundColor = t.type === 'กลุ่มเสี่ยง' ? 'var(--color-warning-light)' : 'var(--color-danger-light)';

    // 2. Render Quarterly Timeline Cards
    renderTimelineCards();
    
    // 3. Render Charts (Weight/BMI, BP/Sugar, Body Composition)
    renderProfileCharts();
    
    // 4. Render Daily Logs Table
    renderDailyLogsTable();
}

function renderTimelineCards() {
    const container = document.getElementById('quarterly-timeline');
    container.innerHTML = '';
    
    const logs = state.selectedTargetQuarterly;
    
    if (logs.length === 0) {
        container.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center text-on-surface-variant font-semibold w-full col-span-full">ยังไม่มีการบันทึกข้อมูลสุขภาพรายไตรมาสสำหรับบุคคลนี้</div>`;
        return;
    }
    
    const gender = inferGender(state.selectedTargetProfile ? state.selectedTargetProfile.name : '');
    
    logs.forEach((log, idx) => {
        const card = document.createElement('div');
        
        const qName = log.quarter === 'M0' ? 'Month 0 (แรกเริ่ม)' : 
                      log.quarter === 'M3' ? 'Month 3 (3 เดือน)' :
                      log.quarter === 'M6' ? 'Month 6 (6 เดือน)' : 'Month 9 (9 เดือน)';
                      
        // Status calculations for indicators
        let bpStatusText = 'ปกติ';
        let bpStatusClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
        if (log.bp) {
            const sys = parseInt(log.bp.toString().split('/')[0]);
            if (sys >= 140) {
                bpStatusText = 'สูง';
                bpStatusClass = 'bg-rose-50 text-rose-700 border border-rose-200';
            } else if (sys >= 130) {
                bpStatusText = 'เฝ้าระวัง';
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

        // Sidebar indicators
        let cardIndicatorColorClass = 'bg-slate-300';
        if (bpStatusText === 'สูง' || dtxStatusText === 'สูง' || bmiInterp.label === 'อ้วน') {
            cardIndicatorColorClass = 'bg-rose-500';
        } else if (bpStatusText === 'เฝ้าระวัง' || dtxStatusText === 'เสี่ยง' || bmiInterp.label === 'น้ำหนักเกิน') {
            cardIndicatorColorClass = 'bg-amber-500';
        } else if (bpStatusText === 'ปกติ' && dtxStatusText === 'ปกติ') {
            cardIndicatorColorClass = 'bg-emerald-500';
        }
        
        card.className = 'bg-white/70 dark:bg-inverse-surface/60 rounded-2xl p-5 border border-white/50 dark:border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between hover:scale-[1.02] transition-all';
        card.innerHTML = `
            <div class="vital-bar ${cardIndicatorColorClass}"></div>
            <div class="flex justify-between items-start mb-4 border-b border-slate-100/50 pb-2">
                <span class="font-bold text-sm text-primary dark:text-primary-fixed">${qName}</span>
                <span class="text-xs text-outline font-semibold">${displayValue(log.date)}</span>
            </div>
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
                    <span class="font-bold text-on-surface">${log.body_age} ปี</span>
                </div>` : ''}
                ${log.hba1c ? `
                <div class="flex justify-between items-center border-b border-rose-50 pb-1.5 text-rose-600">
                    <span>HbA1C (Lab):</span>
                    <span class="font-bold">${log.hba1c} %</span>
                </div>` : ''}
                <div class="flex justify-between items-center">
                    <span>รอบเอว:</span>
                    <span class="font-bold text-on-surface">${log.waist} ซม.</span>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function renderProfileCharts() {
    const logs = state.selectedTargetQuarterly;
    if (logs.length === 0) return;
    
    const labels = logs.map(l => l.quarter);
    const isDark = document.body.classList.contains('dark-theme');
    
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
            <td><strong>${displayValue(log.date)}</strong></td>
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
        const button = e.target.closest('#btn-edit-target, #btn-add-quarterly, #btn-add-daily');
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
            document.getElementById('form-target-chronic').value = t.chronic_disease || '';
            document.getElementById('form-target-comorbidity').value = t.co_morbidity || '';
            document.getElementById('form-target-onset').value = t.onset_year || '';
            document.getElementById('form-target-medicines').value = t.medicines || '';

            document.getElementById('target-modal-title').textContent = 'แก้ไขข้อมูลส่วนตัวกลุ่มเป้าหมาย';
            openModal('target-modal');
        } else if (button.id === 'btn-add-quarterly') {
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
    // Nav Items switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = e.currentTarget.getAttribute('data-view');
            switchView(viewId);
        });
    });

    // Login form submission
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputPasscode = document.getElementById('login-passcode').value.trim();
            const errorDiv = document.getElementById('login-error');
            
            const expectedPasscode = state.apiPasscode || DEFAULT_API_PASSCODE;
            if (inputPasscode === expectedPasscode) {
                sessionStorage.setItem('ncd_authenticated', 'true');
                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) loginScreen.classList.add('hidden');
                errorDiv.classList.add('hidden');
                refreshData();
                showToast("เข้าสู่ระบบสำเร็จ!");
            } else {
                errorDiv.classList.remove('hidden');
                const passcodeField = document.getElementById('login-passcode');
                if (passcodeField) {
                    passcodeField.value = '';
                    passcodeField.focus();
                }
            }
        });
    }

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    // Close demo banner button
    document.getElementById('close-demo-banner').addEventListener('click', () => {
        document.getElementById('demo-banner').classList.add('hidden');
    });

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
    document.getElementById('target-search-input').addEventListener('input', () => {
        state.currentPage = 1;
        renderTargetsList();
    });
    document.getElementById('filter-type').addEventListener('change', () => {
        state.currentPage = 1;
        renderTargetsList();
    });
    document.getElementById('filter-village').addEventListener('change', () => {
        state.currentPage = 1;
        renderTargetsList();
    });
    document.getElementById('filter-disease').addEventListener('change', () => {
        state.currentPage = 1;
        renderTargetsList();
    });

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

    // Settings Connection Form Submission
    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('setting-gas-url').value.trim();
        const passcode = document.getElementById('setting-passcode').value.trim();
        saveSettings(url, passcode);
    });

    document.getElementById('btn-reset-demo').addEventListener('click', () => {
        resetToDemo();
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
                    
                    // Show import button
                    if (importBtn) importBtn.classList.remove('hidden');
                }
            } else {
                if (importBtn) importBtn.classList.add('hidden');
            }
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
            chronic_disease: document.getElementById('form-target-chronic').value.trim(),
            co_morbidity: document.getElementById('form-target-comorbidity').value.trim(),
            onset_year: document.getElementById('form-target-onset').value.trim(),
            medicines: document.getElementById('form-target-medicines').value.trim()
        };

        if (!ALL_VILLAGES.includes(formData.village)) {
            showToast("กรุณาเลือกหมู่บ้านจากรายการที่กำหนด", "warning");
            return;
        }
        
        if (targetId) {
            formData.id = parseInt(targetId);
        }
        
        showSpinner(true);
        try {
            if (state.connectionMode === 'online') {
                // Post to GAS API
                const res = await postToAPI(action, formData);
                if (!res.success) throw new Error(res.error);
                
                showToast(res.data.message || "บันทึกข้อมูลเรียบร้อยแล้ว");
            } else {
                // Save locally (Demo Mode simulation)
                if (action === 'addTarget') {
                    const newId = state.targets.length + 1;
                    formData.id = newId;
                    state.targets.push(formData);
                    showToast("เพิ่มข้อมูลกลุ่มเป้าหมายใหม่สำเร็จ (โหมดทดลองใช้)");
                } else {
                    const idx = state.targets.findIndex(t => t.id === formData.id);
                    if (idx !== -1) {
                        state.targets[idx] = { ...state.targets[idx], ...formData };
                        state.selectedTargetProfile = state.targets[idx];
                        showToast("อัปเดตข้อมูลสำเร็จ (โหมดทดลองใช้)");
                    }
                }
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
        }
    });

    // 2. Add Quarterly Data Form
    document.getElementById('btn-add-quarterly').addEventListener('click', () => {
        openQuarterlyModal(state.selectedTargetId);
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
            body_fat: parseFloat(document.getElementById('form-q-fat').value) || 0,
            muscle_mass: parseFloat(document.getElementById('form-q-muscle').value) || 0,
            visceral_fat: parseInt(document.getElementById('form-q-visceral').value) || 0,
            body_age: parseInt(document.getElementById('form-q-bodyage').value) || 0,
            physical_activity: document.getElementById('form-q-pa').value,
            veggie_fruit: parseInt(document.getElementById('form-q-fruit').value) || 0,
            sleep: document.getElementById('form-q-sleep').value,
            food_overeat: document.getElementById('form-q-overeat').value,
            food_unhealthy: document.getElementById('form-q-unhealthy').value,
            smoking: document.getElementById('form-q-smoke').value,
            alcohol: document.getElementById('form-q-alcohol').value,
            depression_2q: document.getElementById('form-q-depress').value,
            food_habit: document.getElementById('form-q-habit').value.trim(),
            remark: document.getElementById('form-q-remark').value.trim(),
            // Lab results
            hba1c: parseFloat(document.getElementById('form-q-hba1c').value) || '',
            egfr: parseFloat(document.getElementById('form-q-egfr').value) || '',
            creatinine: parseFloat(document.getElementById('form-q-creatinine').value) || '',
            triglyceride: parseInt(document.getElementById('form-q-trigly').value) || '',
            ldl: parseInt(document.getElementById('form-q-ldl').value) || '',
            cholesterol: parseInt(document.getElementById('form-q-chol').value) || ''
        };
        
        showSpinner(true);
        try {
            if (state.connectionMode === 'online') {
                const res = await postToAPI('addQuarterly', formData);
                if (!res.success) throw new Error(res.error);
                
                showToast(res.data.message || "บันทึกผลการคัดกรองสำเร็จ!");
            } else {
                // Local simulation
                // Check if already exists for this quarter and target, update it
                const existingIdx = state.quarterlyData.findIndex(q => q.target_id === targetId && q.quarter === formData.quarter);
                if (existingIdx !== -1) {
                    state.quarterlyData[existingIdx] = { ...state.quarterlyData[existingIdx], ...formData };
                    showToast("อัปเดตข้อมูลไตรมาสสำเร็จ (โหมดทดลองใช้)");
                } else {
                    formData.id = state.quarterlyData.length + 1;
                    state.quarterlyData.push(formData);
                    showToast("บันทึกผลการคัดกรองรอบใหม่สำเร็จ (โหมดทดลองใช้)");
                }
            }
            closeModal('quarterly-modal');
            viewTargetProfile(targetId);
        } catch (err) {
            console.error("Quarterly save failed:", err);
            showToast("บันทึกข้อมูลสุขภาพไม่สำเร็จ: " + err.message, "danger");
        } finally {
            showSpinner(false);
        }
    });

    // 3. Add Daily Log Form
    document.getElementById('btn-add-daily').addEventListener('click', () => {
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
        
        showSpinner(true);
        try {
            if (state.connectionMode === 'online') {
                const res = await postToAPI('addDailyLog', formData);
                if (!res.success) throw new Error(res.error);
                
                showToast(res.data.message || "บันทึกพฤติกรรมรายวันสำเร็จ!");
            } else {
                // Local simulation
                formData.id = state.dailyLogs.length + 1;
                state.dailyLogs.unshift(formData); // Add to top
                showToast("บันทึกพฤติกรรมสุขภาพรายวันเรียบร้อย (โหมดทดลองใช้)");
            }
            closeModal('daily-modal');
            viewTargetProfile(targetId);
        } catch (err) {
            console.error("Daily save failed:", err);
            showToast("ไม่สามารถบันทึกพฤติกรรมได้: " + err.message, "danger");
        } finally {
            showSpinner(false);
        }
    });
}

// Post request handler using POST redirect trick for GAS (Text payload with text/plain to bypass Preflight)
async function postToAPI(action, data) {
    if (!state.gasUrl || !state.apiPasscode) {
        throw new Error("ยังไม่ได้ตั้งค่า URL หรือรหัสผ่าน API");
    }

    const payload = {
        action: action,
        passcode: state.apiPasscode,
        data: data
    };
    
    // We send POST request without headers object to avoid triggering CORS preflight check
    const response = await fetch(state.gasUrl, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    
    const json = await response.json();
    return json;
}

// --- UI Feedback Elements ---
function showSpinner(show) {
    const spinner = document.getElementById('loading-spinner');
    if (show) {
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
        if (bmi < 25.0) return { label: 'ปกติ', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
        if (bmi < 30.0) return { label: 'น้ำหนักเกิน', class: 'text-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200', bgClass: 'bg-amber-500' };
        return { label: 'อ้วน', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
    },
    interpretBodyFat: function(fat, gender) {
        if (!fat || fat <= 0) return { label: '-', class: 'text-slate-400', badgeClass: 'bg-slate-100 text-slate-700', bgClass: 'bg-slate-400' };
        if (gender === 'ชาย') {
            if (fat < 10.0) return { label: 'ต่ำ', class: 'text-sky-500', badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200', bgClass: 'bg-sky-500' };
            if (fat < 20.0) return { label: 'ปกติ', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
            if (fat < 25.0) return { label: 'สูง', class: 'text-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200', bgClass: 'bg-amber-500' };
            return { label: 'สูงมาก', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
        } else {
            if (fat < 20.0) return { label: 'ต่ำ', class: 'text-sky-500', badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200', bgClass: 'bg-sky-500' };
            if (fat < 30.0) return { label: 'ปกติ', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
            if (fat < 35.0) return { label: 'สูง', class: 'text-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200', bgClass: 'bg-amber-500' };
            return { label: 'สูงมาก', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
        }
    },
    interpretVisceralFat: function(level) {
        if (!level || level <= 0) return { label: '-', class: 'text-slate-400', badgeClass: 'bg-slate-100 text-slate-700', bgClass: 'bg-slate-400' };
        if (level < 10) return { label: 'ปกติ', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
        if (level < 15) return { label: 'สูง', class: 'text-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200', bgClass: 'bg-amber-500' };
        return { label: 'สูงมาก', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
    },
    interpretSkeletalMuscle: function(muscle, gender) {
        if (!muscle || muscle <= 0) return { label: '-', class: 'text-slate-400', badgeClass: 'bg-slate-100 text-slate-700', bgClass: 'bg-slate-400' };
        if (gender === 'ชาย') {
            if (muscle < 32.9) return { label: 'ต่ำ', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
            if (muscle < 35.8) return { label: 'ปกติ', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
            if (muscle < 37.4) return { label: 'สูง', class: 'text-sky-500', badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200', bgClass: 'bg-sky-500' };
            return { label: 'สูงมาก', class: 'text-primary', badgeClass: 'bg-primary/10 text-primary border border-primary/20', bgClass: 'bg-primary' };
        } else {
            if (muscle < 25.9) return { label: 'ต่ำ', class: 'text-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200', bgClass: 'bg-rose-500' };
            if (muscle < 28.0) return { label: 'ปกติ', class: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200', bgClass: 'bg-emerald-500' };
            if (muscle < 29.1) return { label: 'สูง', class: 'text-sky-500', badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200', bgClass: 'bg-sky-500' };
            return { label: 'สูงมาก', class: 'text-primary', badgeClass: 'bg-primary/10 text-primary border border-primary/20', bgClass: 'bg-primary' };
        }
    }
};

function renderInterpreterView() {
    const select = document.getElementById('interp-target-select');
    if (!select) return;
    
    // Only populate if length is 1 (meaning it only has the default option)
    if (select.children.length <= 1) {
        select.innerHTML = '<option value="">-- ป้อนแบบอิสระ --</option>';
        
        state.targets.forEach(t => {
            const option = document.createElement('option');
            option.value = t.id;
            option.textContent = `${t.name} (บ้านเลขที่: ${t.address}, ${getTargetVillage(t)})`;
            select.appendChild(option);
        });
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
    } else if (interp.label.includes('ปกติ') || interp.label.includes('ดี')) {
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
        if (fatInterp.label === 'สูงมาก') { riskScore += 3; alerts.push('เปอร์เซ็นต์ไขมันในร่างกายอยู่ในระดับสูงมาก'); }
        else if (fatInterp.label === 'สูง') { riskScore += 2; alerts.push('เปอร์เซ็นต์ไขมันในร่างกายอยู่ในระดับสูง'); }
    }
    
    if (visceral > 0) {
        if (visceralInterp.label === 'สูงมาก') { riskScore += 3; alerts.push('ระดับไขมันในช่องท้องสูงมากอันตราย'); }
        else if (visceralInterp.label === 'สูง') { riskScore += 2; alerts.push('ระดับไขมันในช่องท้องอยู่ในเกณฑ์สูง'); }
    }
    
    if (muscle > 0) {
        if (muscleInterp.label === 'ต่ำ') { riskScore += 1; alerts.push('มวลกล้ามเนื้อลายต่ำกว่าเกณฑ์ปกติ'); }
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
    
    const patientFields = document.querySelectorAll('.patient-field');
    if (t.type === 'กลุ่มป่วย') {
        patientFields.forEach(f => f.classList.remove('hidden'));
    } else {
        patientFields.forEach(f => f.classList.add('hidden'));
    }
    
    // Reset badges
    document.getElementById('form-q-badge-bmi').innerHTML = 'BMI: -';
    document.getElementById('form-q-badge-fat').innerHTML = 'ไขมัน: -';
    document.getElementById('form-q-badge-visceral').innerHTML = 'ช่องท้อง: -';
    document.getElementById('form-q-badge-muscle').innerHTML = 'กล้ามเนื้อ: -';
    
    openModal('quarterly-modal');
}
