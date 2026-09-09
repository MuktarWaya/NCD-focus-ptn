# Finish: แก้ทะเบียนรหัสสี + เพิ่มรายงาน Focus Group

## สรุปสิ่งที่ทำ
1. `app.js` — แก้ `parseCSV` ให้ map ตามชื่อ header โดยคอลัมน์ที่ขาดเป็น `''` (ไม่ทิ้งแถวที่จำนวนคอลัมน์ไม่เท่า header)
2. `index.html` — เพิ่ม SheetJS CDN, เมนู sidebar "รายงาน Focus Group", และ section `#focusgroup-view`
3. `app.js` — เพิ่ม `focusGroupMeta`, `buildFocusGroupData`, `renderFocusGroupView`, `buildFocusGroupText`, `copyFocusGroupToClipboard`, `exportFocusGroupExcel` + ต่อ `switchView` / `updateHeaderTitles` / `setupEventListeners`

## การตรวจสอบ (Verification)
- `node --check app.js` → ผ่าน
- `node tests/tracking_utils.test.js` → ผ่าน (5/5)
- `node tests/notification_logic.test.js` → ผ่าน (5/5)
- parseCSV ใหม่: `targets.csv` 200 แถว, `quarterly_data.csv` 801 แถว (เดิม 1), `daily_logs.csv` 210 แถว
- จำลอง focus group กับข้อมูล demo: ไขมันร่างกายสูง 137, ไขมันช่องท้องสูง 93, กล้ามเนื้อลายต่ำ 41 (จาก 200)

## Review (ความรุนแรง)
- Blocker: ไม่มี
- Major: ไม่มี
- Minor: (1) mobile bottom nav ยังไม่มีเมนู Focus Group (เข้าทาง sidebar drawer ได้) (2) Excel export พึ่ง CDN SheetJS (ต้องออนไลน์)
- Nit: (1) ตารางกลุ่มไขมันสูงอาจยาว (137 แถว) ยังไม่มี pagination (2) ฟิลด์ `interp` ในรายการถูกเก็บแต่ยังไม่ได้ใช้แสดง

## Follow-ups
- ยังไม่ commit/push (รอผู้ใช้สั่ง) — ต้อง `git push` เพื่อให้ Netlify deploy; ไม่ต้อง `clasp push` เพราะไม่แตะ backend
