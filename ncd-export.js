(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ncdExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const RISK_CATEGORIES = ['DM', 'DM + BMI เกิน', 'HT', 'HT + BMI เกิน', 'DM + HT', 'DM + HT + BMI เกิน', 'BMI เกิน'];
    const YES_NO = [['yes', 'มี'], ['no', 'ไม่มี']];
    const FIELDS = [
        { key: 'report_exercise_minutes', label: 'ออกกำลังกายรวมใน 1 สัปดาห์ (นาที)', type: 'number', max: 10080, step: '1' },
        { key: 'physical_activity', label: 'กลุ่มกิจกรรมทางกายตามแบบ', options: [['high', '≥ 150 นาที'], ['low', '< 150 นาที'], ['none', 'ไม่ออกเลย']] },
        { key: 'food_overeat', label: 'กินเยอะ / กินเกิน', options: YES_NO },
        { key: 'food_unhealthy', label: 'กินไม่ถูกต้อง / กินไม่ดี', options: YES_NO },
        { key: 'food_habit', label: 'พฤติกรรมการกินแต่ละวัน', type: 'textarea' },
        { key: 'veggie_fruit', label: 'ผักและผลไม้ (ส่วนต่อวัน)', type: 'number', max: 100, step: '0.1' },
        { key: 'depression_2q', label: 'ผลคัดกรองภาวะซึมเศร้า 2Q', options: YES_NO },
        { key: 'report_sleep_hours', label: 'นอนเฉลี่ย (ชั่วโมงต่อวัน)', type: 'number', max: 24, step: '0.01' },
        { key: 'sleep', label: 'ช่องการนอนตามแบบหน่วยจัดการ', options: [['low', 'น้อยกว่าหรือเท่ากับ 7–8 ชั่วโมง ตามแบบ'], ['high', 'มากกว่าหรือเท่ากับ 7–8 ชั่วโมง ตามแบบ']] },
        { key: 'smoking', label: 'การสูบบุหรี่', options: [['yes', 'สูบ'], ['no', 'ไม่สูบ']] },
        { key: 'alcohol', label: 'การดื่มเครื่องดื่มแอลกอฮอล์', options: [['yes', 'ดื่ม'], ['no', 'ไม่ดื่ม']] },
        { key: 'risk_category', label: 'ประเภทกลุ่มเสี่ยงในรอบนี้ (สำหรับกลุ่มเสี่ยง)', options: RISK_CATEGORIES.map(v => [v, v]) }
    ];
    const hasValue = v => v !== undefined && v !== null && String(v).trim() !== '';
    function number(v) {
        if (!hasValue(v)) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function text(v) { return hasValue(v) ? String(v) : ''; }
    function normalize(key, value) {
        if (!hasValue(value)) return '';
        const v = String(value).trim();
        if (['food_overeat', 'food_unhealthy', 'depression_2q', 'smoking', 'alcohol'].includes(key)) {
            if (['yes', 'Y', 'มี', 'สูบ', 'ดื่ม'].includes(v)) return 'yes';
            if (['no', 'N', 'ไม่มี', 'ไม่สูบ', 'ไม่ดื่ม'].includes(v)) return 'no';
        }
        if (key === 'physical_activity') {
            if (['high', '>= 150 นาที', '≥ 150 นาที'].includes(v)) return 'high';
            if (['low', '< 150 นาที'].includes(v)) return 'low';
            if (['none', 'ไม่ออกเลย'].includes(v)) return 'none';
        }
        if (key === 'sleep') {
            if (['low', '≤ 7-8 ชม.', '≤ 7–8 ชม.'].includes(v)) return 'low';
            if (['high', '≥ 7-8 ชม.', '≥ 7–8 ชม.'].includes(v)) return 'high';
        }
        return v;
    }
    function exerciseCategory(log) {
        const n = number(log.report_exercise_minutes);
        if (n !== null && n >= 0 && n <= 10080) return n === 0 ? 'none' : n >= 150 ? 'high' : 'low';
        const category = normalize('physical_activity', log.physical_activity);
        return ['high', 'low', 'none'].includes(category) ? category : '';
    }
    function yesNo(log, key) {
        const v = normalize(key, log[key]);
        return v === 'yes' ? 'มี' : v === 'no' ? 'ไม่มี' : '';
    }
    function marks(value, categories) { return categories.map(c => value === c ? '✓' : null); }
    function behaviorValues(log) {
        return [
            ...marks(exerciseCategory(log), ['high', 'low', 'none']),
            yesNo(log, 'food_overeat'), yesNo(log, 'food_unhealthy'), text(log.food_habit), text(log.remark),
            number(log.veggie_fruit), ...marks(normalize('depression_2q', log.depression_2q), ['yes', 'no']),
            ...marks(normalize('sleep', log.sleep), ['low', 'high']),
            ...marks(normalize('smoking', log.smoking), ['yes', 'no']),
            ...marks(normalize('alcohol', log.alcohol), ['yes', 'no'])
        ];
    }
    function rowValues(target, log, index, patient) {
        const physical = ['weight', 'bmi', 'waist', 'dtx'].map(k => number(log[k]));
        physical.push(text(log.bp));
        physical.push(...['body_fat', 'muscle_mass', 'visceral_fat', 'body_age'].map(k => number(log[k])));
        const personal = patient
            ? [index + 1, text(target.name), number(target.age), text(target.chronic_disease), text(target.co_morbidity), text(target.onset_year), text(target.medicines), number(target.height)]
            : [index + 1, text(target.name), text(target.address), number(target.age), number(target.height)];
        const labs = patient ? ['hba1c', 'egfr', 'creatinine', 'triglyceride', 'ldl', 'cholesterol'].map(k => number(log[k])) : [];
        return [...personal, ...physical, ...labs, ...behaviorValues(log)];
    }
    function buildReport(targets, records, options) {
        if (!options.village || options.village === 'all') throw new Error('กรุณาเลือกหนึ่งชุมชน');
        if (!/^W(?:0|2|4|6|8|10|12|14|16|18|20|22|24)$/.test(options.round)) throw new Error('รอบติดตามไม่ถูกต้อง');
        const selected = targets.filter(t => t.village === options.village);
        const ids = new Set();
        selected.forEach(t => {
            if (!hasValue(t.id) || ids.has(String(t.id))) throw new Error('รหัสรายบุคคลขาดหรือซ้ำ กรุณาตรวจทะเบียนก่อนส่งออก');
            ids.add(String(t.id));
            if (!['กลุ่มเสี่ยง', 'กลุ่มป่วย'].includes(t.type)) throw new Error('พบรายชื่อที่ยังไม่ได้ระบุกลุ่มเสี่ยงหรือกลุ่มป่วย');
        });
        const byId = new Map();
        records.filter(r => r.quarter === options.round && ids.has(String(r.target_id))).forEach(r => {
            if (byId.has(String(r.target_id))) throw new Error('พบผลติดตามซ้ำในรอบที่เลือก กรุณาตรวจข้อมูลก่อนส่งออก');
            byId.set(String(r.target_id), r);
        });
        const counts = Object.fromEntries(RISK_CATEGORIES.map(c => [c, 0]));
        let missingRecords = 0, unclassified = 0, incompleteBehavior = 0;
        const groups = { risk: [], patient: [] };
        selected.sort((a, b) => text(a.name).localeCompare(text(b.name), 'th')).forEach(target => {
            const found = byId.get(String(target.id));
            const log = found || {};
            if (!found) missingRecords++;
            const behaviorComplete = exerciseCategory(log) &&
                ['food_overeat', 'food_unhealthy', 'depression_2q', 'smoking', 'alcohol'].every(k => yesNo(log, k)) &&
                number(log.veggie_fruit) !== null && hasValue(log.food_habit) && ['low', 'high'].includes(normalize('sleep', log.sleep));
            if (!behaviorComplete) incompleteBehavior++;
            const patient = target.type === 'กลุ่มป่วย';
            if (!patient) {
                if (RISK_CATEGORIES.includes(log.risk_category)) counts[log.risk_category]++;
                else unclassified++;
            }
            const group = groups[patient ? 'patient' : 'risk'];
            group.push({ target, log, values: rowValues(target, log, group.length, patient) });
        });
        return { ...groups, counts, missingRecords, unclassified, incompleteBehavior, total: selected.length, options };
    }
    async function createWorkbook(ExcelJS, template, report) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(template);
        const opts = report.options;
        for (const [name, items, columns] of [['กลุ่มเสี่ยง', report.risk, 30], ['กลุ่มป่วย', report.patient, 39]]) {
            const sheet = wb.getWorksheet(name);
            if (!sheet || sheet.getCell('B2').value !== 'ชื่อ-สกุล') throw new Error('ไฟล์ต้นแบบไม่ตรงกับแบบหน่วยจัดการ');
            // Keep the template's columns and merges, give long Thai headings room to wrap.
            for (let c = 1; c <= columns; c++) {
                const column = sheet.getColumn(c);
                column.width = Math.max(column.width || 8.43, c === 1 ? 6 : 10);
                for (const r of [2, 3]) {
                    const cell = sheet.getCell(r, c);
                    cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'middle', horizontal: 'center' };
                }
            }
            const wider = name === 'กลุ่มเสี่ยง' ? { T: 20, U: 20, V: 16 } : { D: 14, E: 14, F: 14, G: 25, AC: 20, AD: 20, AE: 16 };
            Object.entries(wider).forEach(([column, width]) => sheet.getColumn(column).width = Math.max(sheet.getColumn(column).width, width));
            sheet.getRow(2).height = 64;
            sheet.getRow(3).height = 72;
            const extra = Math.max(0, items.length - 23);
            if (extra) sheet.insertRows(27, Array.from({ length: extra }, () => []), 'i+');
            const dataEnd = 26 + extra;
            for (let r = 4; r <= dataEnd; r++) {
                const row = sheet.getRow(r);
                row.height = 36;
                for (let c = 1; c <= columns; c++) {
                    const cell = row.getCell(c);
                    cell.value = null;
                    cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'middle' };
                }
            }
            items.forEach((item, i) => {
                let rowHeight = 36;
                item.values.forEach((v, c) => {
                    const cell = sheet.getCell(i + 4, c + 1);
                    // Strings are assigned as strings, never as formula/hyperlink objects.
                    cell.value = v;
                    if (typeof v === 'number') cell.numFmt = Number.isInteger(v) ? '0' : '0.00';
                    if (typeof v === 'string') {
                        const charsPerLine = Math.max(1, Math.floor(sheet.getColumn(c + 1).width * 1.15));
                        const lines = v.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
                        rowHeight = Math.max(rowHeight, lines * (cell.font?.size || 16) * 1.3);
                    }
                });
                sheet.getRow(i + 4).height = Math.min(409, rowHeight);
            });
            sheet.getCell('A1').value = `ข้อมูลสถานะสุขภาพ (รายบุคคล) ${opts.village}  ตำบล ${opts.tambon || '................'}  อำเภอ ${opts.district || '................'}  จังหวัด ${opts.province || '................'}\nรอบ ${opts.round} | วันที่ส่งออก ${opts.dateText || ''} | ${items.length} คน`;
            sheet.getCell('A1').alignment = { ...sheet.getCell('A1').alignment, wrapText: true, vertical: 'middle' };
            sheet.getRow(1).height = 48;
            // The template has no merged cells below row 3; only its summary moves.
            let noteRow = dataEnd + 1;
            if (name === 'กลุ่มเสี่ยง') {
                RISK_CATEGORIES.forEach((c, i) => sheet.getCell(28 + extra + i, 5).value = report.counts[c]);
                sheet.getCell(35 + extra, 2).value = 'ยังไม่ระบุประเภทกลุ่มเสี่ยง';
                sheet.getCell(35 + extra, 5).value = report.unclassified;
                noteRow = 36 + extra;
            }
            const notes = [
                `ใช้ผลรอบ ${opts.round} เท่านั้น ช่องว่าง = ยังไม่มีข้อมูล ไม่แทนด้วยศูนย์หรือผลรอบอื่น`,
                `รวม ${report.total} คน: ไม่มีผลรอบนี้ ${report.missingRecords} คน / ข้อมูลพฤติกรรมยังไม่ครบ ${report.incompleteBehavior} คน`,
                'ประเภทกลุ่มเสี่ยงนับจากการประเมินที่บันทึกในรอบนี้ ไม่วินิจฉัยจาก DTX/BP ครั้งเดียว; ช่องการนอนใช้การเลือกตามแบบ',
                'ข้อมูลทะเบียนและโรค/ยา/ส่วนสูงเป็นข้อมูลทะเบียนปัจจุบัน ผลตรวจและพฤติกรรมเป็นข้อมูลรอบที่เลือก'
            ];
            notes.forEach((note, i) => {
                sheet.mergeCells(noteRow + i, 1, noteRow + i, columns);
                const cell = sheet.getCell(noteRow + i, 1);
                cell.value = note;
                cell.font = { name: 'Tahoma', size: 11, color: { argb: 'FF334155' } };
                cell.alignment = { wrapText: true, vertical: 'middle' };
                sheet.getRow(noteRow + i).height = 30;
            });
            sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];
            sheet.pageSetup = { ...sheet.pageSetup, orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3', printArea: `A1:${name === 'กลุ่มเสี่ยง' ? 'AD' : 'AM'}${noteRow + notes.length - 1}` };
        }
        return wb;
    }
    return { FIELDS, RISK_CATEGORIES, hasValue, number, normalize, exerciseCategory, rowValues, buildReport, createWorkbook };
});
