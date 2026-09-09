# Brainstorm: ทะเบียนรหัสสีไม่ทำงาน + รายงานกลุ่มค่าผิดปกติสำหรับ Focus Group

## Goal
1. **แก้ทะเบียนจำแนกรหัสสี (ปิงปองจราจร 7 สี) ที่ไม่ทำงาน** — สาเหตุคือฟังก์ชัน `parseCSV` ใน `app.js` ทิ้งแถว CSV ที่มีจำนวนคอลัมน์ไม่เท่า header ทำให้ `data/quarterly_data.csv` (header 41 คอลัมน์ แต่แถวข้อมูล M0/M3/M6/M9 มี 29 คอลัมน์ จำนวน 800 จาก 801 แถว) ถูกทิ้งเกือบหมด เหลือข้อมูลเพียง 1 แถว → ทะเบียนสีขึ้น "ยังไม่ประเมิน" เกือบทุกคน
2. **เพิ่มรายงานกลุ่มค่าองค์ประกอบร่างกายผิดปกติ** สำหรับแบ่งกลุ่มทำ Focus Group ให้คำปรึกษารายกลุ่ม
   - กลุ่มไขมันร่างกายสูง (สูงกว่าเป้าหมาย: ชาย 20% / หญิง 30%)
   - กลุ่มไขมันช่องท้องสูง (ระดับ ≥ 9 = "สูง"/"สูงมาก")
   - กลุ่มกล้ามเนื้อลายต่ำ (ชาย ≤ 30% / หญิง ≤ 25%)
   - ใช้เกณฑ์จาก `bodyCompRules` เดิมในเครื่องมือแปลผล (ตามที่ผู้ใช้เลือก)

## Constraints & Requirements
- Vanilla HTML/CSS/JS + CDN (Tailwind, Chart.js) — ไม่มี build step, ไม่มี package.json
- ต้องไม่กระทบโครงสร้างข้อมูล Google Sheets (คำนวณฝั่ง Client อย่างเดียว)
- เกณฑ์ตัดสิน: reuse `bodyCompRules.interpretBodyFat/interpretVisceralFat/interpretSkeletalMuscle` + `inferGender(name)`
- ผู้ใช้ต้องการ: เมนูใหม่ใน sidebar; ส่งออก 2 แบบ = (1) คัดลอกข้อความไปวางใน Line group (clipboard) และ (2) ส่งออก Excel

## Options
- **ส่งออก Excel**: ใช้ SheetJS (xlsx) ผ่าน CDN (jsdelivr) → สร้างไฟล์ .xlsx จริง (แนะนำ) vs. สร้าง .xls จำลองจาก HTML table (ไม่พึ่งไลบรารี แต่ไม่ใช่ xlsx จริง) → เลือก SheetJS CDN ตามความต้องการ "Excel" ของผู้ใช้
- **คัดลอก Line**: ใช้ `navigator.clipboard.writeText()` กับข้อความ plain text ที่จัดย่อหน้าให้อ่านง่ายในกลุ่ม Line (header + รายชื่อพร้อมหมู่บ้าน/อสม.)

## Risks
1. **สิทธิ์ Clipboard**: `navigator.clipboard` ต้องใช้ในบริบท HTTPS หรือ localhost; หน้าเว็บ Netlify เป็น HTTPS อยู่แล้ว → OK, และมี fallback ผ่าน `document.execCommand('copy')` กรณี clipboard API ไม่พร้อม
2. **CDN ของ SheetJS**: หาก CDN โหลดไม่ได้ Excel export จะล้ม → ตรวจ `typeof XLSX !== 'undefined'` ก่อน export และแจ้งเตือน
3. **เพศจากชื่อ**: `inferGender` เดาเพศจากคำนำหน้า (นาย/นาง/นางสาว) ถ้าชื่อไม่ขึ้นต้นด้วยคำนำหน้าจะ default เป็นหญิง → แสดงเกณฑ์ที่ใช้บนรายงานให้ผู้ใช้ทราบ

## Acceptance Criteria
- [ ] ทะเบียนจำแนกรหัสสีแสดงสีปิงปองครบตามข้อมูล (Demo mode โหลด quarterly ได้ครบ ไม่เหลือ 1 แถว)
- [ ] มีเมนู sidebar ใหม่ "รายงาน Focus Group (องค์ประกอบร่างกาย)"
- [ ] แสดงรายชื่อแยก 3 กลุ่ม (ไขมันสูง / ช่องท้องสูง / กล้ามเนื้อต่ำ) พร้อมค่า, หมู่บ้าน, อสม., รอบล่าสุด และกรองตามหมู่บ้านได้
- [ ] ปุ่ม "คัดลอกเพื่อส่ง Line" คัดลอกข้อความรายงานไป clipboard ได้
- [ ] ปุ่ม "ส่งออก Excel" ดาวน์โหลดไฟล์ .xlsx ได้
- [ ] Tests เดิมผ่าน (`node tests/*.test.js`) และ `node --check app.js` ผ่าน
