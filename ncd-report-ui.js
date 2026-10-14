/* Uses the existing application state; libraries and templates stay on this site. */
const ncdReportUI = (() => {
    let libraryPromise;
    function updateBackendSupport() {
        const section = document.querySelector('.report-assessment-section');
        if (!section) return;
        section.disabled = state.ncdReportVersion < 1 || !state.connectionReady;
        const note = document.getElementById('ncd-report-support');
        if (note) {
            note.hidden = state.ncdReportVersion >= 1;
            note.textContent = state.ncdReportVersion >= 1 ? '' : 'ช่องประเมินใหม่ยังบันทึกไม่ได้ ต้องอัปเดต Apps Script เป็นรุ่นรองรับแบบหน่วยจัดการ แล้วกดเชื่อมต่อใหม่';
        }
    }
    function renderFields() {
        document.getElementById('ncd-report-fields').innerHTML = ncdExport.FIELDS.map(field => {
            const id = `form-report-${field.key}`;
            const attrs = `id="${id}" class="report-input"`;
            let control;
            if (field.options) control = `<select ${attrs}><option value="">ยังไม่ประเมิน</option>${field.options.map(([v, label]) => `<option value="${escapeHTML(v)}">${escapeHTML(label)}</option>`).join('')}</select>`;
            else if (field.type === 'textarea') control = `<textarea ${attrs} rows="2" maxlength="2000" placeholder="ระบุพฤติกรรมที่ประเมินได้"></textarea>`;
            else control = `<input ${attrs} type="number" inputmode="decimal" min="0" max="${field.max}" step="${field.step}" placeholder="เว้นว่างเมื่อยังไม่ประเมิน">`;
            return `<div class="report-field ${field.type === 'textarea' ? 'report-field-wide' : ''}" data-report-key="${field.key}"><label for="${id}">${escapeHTML(field.label)}</label>${control}</div>`;
        }).join('');
        document.querySelectorAll('#ncd-report-fields input[type="number"]').forEach(input => {
            input.addEventListener('input', () => { delete input.dataset.keepLegacyNumeric; });
        });
        document.getElementById('form-report-report_exercise_minutes').addEventListener('input', syncExercise);
    }
    function syncExercise() {
        const minutes = document.getElementById('form-report-report_exercise_minutes');
        const category = document.getElementById('form-report-physical_activity');
        const hasMinutes = ncdExport.hasValue(minutes.value) && minutes.validity.valid;
        category.disabled = hasMinutes;
        if (hasMinutes) category.value = ncdExport.exerciseCategory({ report_exercise_minutes: minutes.value });
    }
    function load(record, target) {
        ncdExport.FIELDS.forEach(field => {
            const input = document.getElementById(`form-report-${field.key}`);
            input.querySelectorAll('option[data-legacy]').forEach(option => option.remove());
            const value = ncdExport.normalize(field.key, record ? record[field.key] : '');
            delete input.dataset.unknownValue;
            delete input.dataset.keepLegacyNumeric;
            if (field.type === 'number') {
                input.placeholder = 'เว้นว่างเมื่อยังไม่ประเมิน';
                if (ncdExport.hasValue(value) && ncdExport.number(value) === null) {
                    input.dataset.keepLegacyNumeric = 'true';
                    input.placeholder = `ข้อมูลเดิม: ${value} (กรอกตัวเลขเพื่อแก้ไข)`;
                }
            }
            if (field.options && ncdExport.hasValue(value) && !field.options.some(([v]) => v === value)) {
                const option = new Option(`${value} (ข้อมูลเดิม)`, value);
                option.dataset.legacy = 'true';
                input.appendChild(option);
                input.dataset.unknownValue = value;
            }
            input.value = value ?? '';
            if (field.key === 'risk_category') {
                const isRisk = target && target.type === 'กลุ่มเสี่ยง';
                input.disabled = !isRisk;
                input.closest('.report-field').hidden = !isRisk;
            }
        });
        syncExercise();
    }
    function collect() {
        if (state.ncdReportVersion < 1) return {};
        const result = {};
        ncdExport.FIELDS.forEach(field => {
            const input = document.getElementById(`form-report-${field.key}`);
            if (field.key === 'risk_category' && input.disabled) return;
            if (input.dataset.keepLegacyNumeric && input.value === '') return;
            if (input.dataset.unknownValue && input.value === input.dataset.unknownValue) return;
            result[field.key] = field.type === 'number' && input.value !== '' ? Number(input.value) : input.value.trim();
        });
        return result;
    }
    function summary(record) {
        const parts = ncdExport.FIELDS.filter(f => ncdExport.hasValue(record[f.key])).map(field => {
            const value = ncdExport.normalize(field.key, record[field.key]);
            const label = field.options?.find(([v]) => v === value)?.[1] || value;
            return `<span>${escapeHTML(field.label)}: <b>${escapeHTML(label)}</b></span>`;
        });
        return parts.length ? `<div class="report-profile-summary"><strong>ประเมินตามแบบหน่วยจัดการ</strong><div>${parts.join('')}</div></div>` : '';
    }
    function options() {
        return {
            village: document.getElementById('ncd-export-village').value,
            round: document.getElementById('ncd-export-round').value,
            tambon: document.getElementById('ncd-export-tambon').value.trim(),
            district: document.getElementById('ncd-export-district').value.trim(),
            province: document.getElementById('ncd-export-province').value.trim(),
            dateText: new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
        };
    }
    function preview() {
        const status = document.getElementById('ncd-export-status');
        if (!state.secondaryReady) { status.textContent = 'รอโหลดทะเบียนและผลติดตามให้ครบก่อนส่งออก'; return; }
        try {
            const r = ncdExport.buildReport(getScopedTargets(), state.quarterlyExportData, options());
            status.textContent = `${workerScope.label(state.selectedWorker)} · กลุ่มเสี่ยง ${r.risk.length} คน / กลุ่มป่วย ${r.patient.length} คน · ไม่มีผลรอบนี้ ${r.missingRecords} คน · พฤติกรรมยังไม่ครบ ${r.incompleteBehavior} คน · ยังไม่จำแนกประเภทกลุ่มเสี่ยง ${r.unclassified} คน`;
        } catch (err) { status.textContent = err.message; }
    }
    function loadLibrary() {
        if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
        if (libraryPromise) return libraryPromise;
        libraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const timer = setTimeout(fail, 20000);
            function fail() {
                clearTimeout(timer); script.remove(); libraryPromise = null;
                reject(new Error('โหลดเครื่องมือ Excel ไม่สำเร็จ กรุณาลองใหม่'));
            }
            script.src = 'vendor/exceljs-4.4.0.min.js';
            script.onload = () => { clearTimeout(timer); window.ExcelJS ? resolve(window.ExcelJS) : fail(); };
            script.onerror = fail;
            document.head.appendChild(script);
        });
        return libraryPromise;
    }
    async function exportFile(event) {
        event.preventDefault();
        if (!state.secondaryReady || sessionStorage.getItem('ncd_authenticated') !== 'true') {
            showToast('กรุณาเข้าสู่ระบบและรอโหลดข้อมูลให้ครบก่อนส่งออก', 'warning'); return;
        }
        const button = document.getElementById('ncd-export-btn');
        button.disabled = true; button.textContent = 'กำลังสร้างไฟล์ Excel…';
        const abort = new AbortController();
        let timer;
        try {
            const selectedOptions = options();
            // Re-read before exporting so a recent save by this or another worker is included.
            const refreshed = await refreshData();
            if (!refreshed || !state.secondaryReady) throw new Error('โหลดข้อมูลล่าสุดไม่ครบ กรุณาเชื่อมต่อใหม่ก่อนส่งออก');
            const report = ncdExport.buildReport(getScopedTargets(), state.quarterlyExportData, selectedOptions);
            preview();
            timer = setTimeout(() => abort.abort(), 20000);
            const [ExcelJS, template] = await Promise.all([
                loadLibrary(),
                fetch('templates/ncd-community.xlsx', { signal: abort.signal }).then(response => {
                    if (!response.ok) throw new Error('โหลดแบบ Excel ไม่สำเร็จ กรุณาตรวจว่าได้อัปโหลดไฟล์ต้นแบบแล้ว');
                    return response.arrayBuffer();
                })
            ]);
            const workbook = await ncdExport.createWorkbook(ExcelJS, template, report);
            const bytes = await workbook.xlsx.writeBuffer();
            if (sessionStorage.getItem('ncd_authenticated') !== 'true') throw new Error('ออกจากระบบแล้ว กรุณาเข้าสู่ระบบก่อนส่งออก');
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `NCDs_${workerScope.label(state.selectedWorker)}_${report.options.village}_${report.options.round}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            showToast('ส่งออกตามแบบหน่วยจัดการเรียบร้อยแล้ว');
        } catch (err) {
            showToast(err.name === 'AbortError' ? 'โหลดไฟล์ต้นแบบเกินเวลา กรุณาลองใหม่' : err.message, 'danger');
        } finally {
            clearTimeout(timer); button.disabled = false; button.textContent = 'ส่งออก Excel ตามแบบ';
        }
    }
    function init() {
        renderFields();
        const villages = document.getElementById('ncd-export-village');
        ALL_VILLAGES.forEach(v => villages.add(new Option(v, v)));
        const rounds = document.getElementById('ncd-export-round');
        TRACKING_ROUNDS.forEach(r => rounds.add(new Option(r.label, r.value)));
        document.getElementById('ncd-export-form').addEventListener('submit', exportFile);
        villages.addEventListener('change', preview); rounds.addEventListener('change', preview);
        document.getElementById('ncd-export-preview').addEventListener('click', preview);
        updateBackendSupport();
    }
    document.addEventListener('DOMContentLoaded', init);
    return { load, collect, summary, preview, updateBackendSupport };
})();
