# แผนงาน: แก้ทะเบียนรหัสสี + เพิ่มรายงาน Focus Group (องค์ประกอบร่างกาย)

## เป้าหมาย
1. แก้ `parseCSV` ให้อ่าน CSV ได้แม้จำนวนคอลัมน์ไม่เท่า header (สาเหตุทะเบียนสีว่าง)
2. เพิ่มหน้า/เมนูใหม่ "รายงาน Focus Group" แสดงรายชื่อกลุ่มค่าผิดปกติ 3 กลุ่ม + ส่งออก clipboard(Line) และ Excel

---

## การเปลี่ยนแปลง (ตามลำดับ)

### 1. [MODIFY] `app.js` — แก้ `parseCSV`
- แก้บล็อกที่ตรวจ `if (row.length === headers.length)` (ประมาณบรรทัด 480)
- เปลี่ยนเป็น: สร้าง object จากทุก header โดย `val = (idx < row.length ? row[idx] : '')` แล้ว strip quote/`\n` เหมือนเดิม แล้ว `result.push(obj)` (ไม่ตรวจความยาวแถว)
- ผลลัพธ์: แถว M0–M9 (29 คอลัมน์) ถูกเก็บครบ ค่าคอลัมน์ที่ไม่มีเป็น `''`

### 2. [MODIFY] `index.html` — เพิ่มเมนู + ส่วนแสดงผลใหม่
- `<head>`: เพิ่ม script SheetJS CDN (`https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`)
- Sidebar `<nav>` (หลังลิงก์ "ทะเบียนจำแนกรหัสสี"): เพิ่ม
  `<a ... data-view="focusgroup-view"><span class="material-symbols-outlined">format_list_bulleted</span><span>รายงาน Focus Group</span></a>`
- เพิ่ม `<section id="focusgroup-view" class="view-section space-y-6 hidden">` ประกอบด้วย:
  - แถบกรองหมู่บ้าน (`focusgroup-filter-village`)
  - สรุปการ์ด 3 กลุ่ม: `focusgroup-fat`, `focusgroup-visceral`, `focusgroup-muscle` (ตารางรายชื่อ: ชื่อ, หมู่บ้าน, อสม., ค่า, รอบล่าสุด)
  - ปุ่ม `focusgroup-copy-btn` (คัดลอกเพื่อส่ง Line) และ `focusgroup-excel-btn` (ส่งออก Excel)

### 3. [MODIFY] `app.js` — เพิ่มตรรกะหน้าใหม่
- `buildFocusGroupData()`: สำหรับแต่ละ target เอา `getLatestLogForTarget(t.id)` แล้วใช้
  - `bodyCompRules.interpretBodyFat(log.body_fat, gender)` → ผิดปกติ = label `สูงกว่าเป้าหมาย`
  - `bodyCompRules.interpretVisceralFat(log.visceral_fat)` → ผิดปกติ = label `สูง` หรือ `สูงมาก`
  - `bodyCompRules.interpretSkeletalMuscle(log.muscle_mass, gender)` → ผิดปกติ = label `ต่ำกว่าเป้าหมาย`
  - `gender = inferGender(t.name)`
- `renderFocusGroupView()`: เรนเดอร์ 3 กลุ่ม + นับจำนวน + รองรับ filter หมู่บ้าน
- `buildFocusGroupText()`: สร้างข้อความ plain text สำหรับ Line (หัวเรื่อง + สรุปจำนวน + รายชื่อแต่ละกลุ่ม)
- `copyFocusGroupToClipboard()`: `navigator.clipboard.writeText(...)` + fallback `document.execCommand('copy')` + toast
- `exportFocusGroupExcel()`: ตรวจ `typeof XLSX !== 'undefined'` → สร้าง workbook 3 sheets (ไขมันสูง/ช่องท้องสูง/กล้ามเนื้อต่ำ) → `XLSX.writeFile`
- `switchView()`: เพิ่ม case `focusgroup-view` → `renderFocusGroupView()`
- `updateHeaderTitles()`: เพิ่มชื่อ/คำบรรยายหน้า focusgroup-view
- `setupEventListeners()`: ผูก event ของ filter + ปุ่ม copy/excel

---

## Verification Plan
1. `node --check app.js` — ไม่มี syntax error
2. `node tests/tracking_utils.test.js` และ `node tests/notification_logic.test.js` — ผ่านเหมือนเดิม
3. Script ตรวจสอบ (ชั่วคราว): จำลอง parseCSV ใหม่กับ `data/quarterly_data.csv` ต้องได้ 801 แถว (เดิม 1 แถว)
4. Manual: `python -m http.server 8787` เปิด `http://127.0.0.1:8787/index.html` → login `009941` →
   - ทะเบียนจำแนกรหัสสี: แสดงสีครบตามผลติดตามล่าสุด
   - เมนู "รายงาน Focus Group": แสดง 3 กลุ่มรายชื่อ
   - กด "คัดลอกเพื่อส่ง Line" → paste ในแอปจดบันทึก/Line ได้
   - กด "ส่งออก Excel" → ได้ไฟล์ .xlsx เปิดด้วย Excel ได้

## หมายเหตุ
- ไม่แตะ `backend/gas_backend.js` (คำนวณ/แปลผลฝั่ง Client ล้วน ไม่กระทบชีต)
- Online mode: `getAllQuarterly` โหลดทุกแถวอยู่แล้ว ไม่มีผลกระทบจาก fix (ซึ่งเป็นเรื่องของ Demo CSV)
