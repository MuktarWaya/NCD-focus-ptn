# คู่มือการติดตั้ง Google Sheets และ Google Apps Script สำหรับระบบหลังบ้าน

ทำตามขั้นตอนด้านล่างนี้เพื่อเชื่อมโยง Google Sheet ของคุณให้ทำหน้าที่เป็นฐานข้อมูลผ่าน API

---

## ขั้นตอนที่ 1: เตรียมแผ่นงาน Google Sheet

1. เปิดเบราว์เซอร์แล้วไปที่ Google Sheet ฐานข้อมูลของคุณ
2. สร้างชีตหรือแผ่นงานใหม่ทั้งหมด **3 แผ่นงาน (Tabs)** โดยตั้งชื่อแต่ละแท็บให้ถูกต้องดังนี้ (ตัวสะกดพิมพ์ใหญ่-เล็กมีผล):
   - **Targets**
   - **QuarterlyData**
   - **DailyLogs**
3. นำเข้าข้อมูลตัวอย่างจากไฟล์ CSV ที่ผมสร้างไว้ให้ในคอมพิวเตอร์ของคุณ โดยการนำไปวางหรือกด **ไฟล์ (File) -> นำเข้า (Import) -> อัปโหลด -> เลือกไฟล์ CSV** หรือจะคัดลอกคอลัมน์จากตาราง CSV ไปวางตรงๆ ก็ได้:
   - นำเข้าไฟล์ `data/targets.csv` ลงในชีต **Targets**
   - นำเข้าไฟล์ `data/quarterly_data.csv` ลงในชีต **QuarterlyData**
   - นำเข้าไฟล์ `data/daily_logs.csv` ลงในชีต **DailyLogs**

*หมายเหตุ: ตรวจสอบให้มั่นใจว่าแถวแรก (แถวที่ 1) ของแต่ละแผ่นงาน คือชื่อคอลัมน์ภาษาอังกฤษอย่างถูกต้อง เช่น ชีต Targets จะต้องขึ้นต้นแถวแรกว่า `id`, `name`, `address`, `village`, `responsible_worker`...*

---

## ขั้นตอนที่ 2: ติดตั้ง Google Apps Script

1. ที่เมนูด้านบนของ Google Sheet กดเลือก **ส่วนขยาย (Extensions) -> Apps Script**
2. ระบบจะเปิดหน้าต่างสคริปต์ใหม่ขึ้นมา ให้ลบโค้ดเริ่มต้นทั้งหมดออก (ที่มีคำว่า `function myFunction() { ... }`)
3. เปิดไฟล์ `backend/gas_backend.js` ในโฟลเดอร์โครงการนี้ คัดลอกโค้ดทั้งหมดแล้วนำไปวางในหน้าต่าง Apps Script
4. ตั้งค่ารหัสผ่าน API ใน Apps Script โดยไปที่ **Project Settings -> Script properties** แล้วเพิ่มค่า:
   - Property: `API_PASSCODE`
   - Value: รหัสผ่านจริงที่ต้องการใช้กับระบบ
5. กดปุ่ม **บันทึกโครงการ (Save Project)** ไอคอนรูปแผ่นดิสก์ หรือกด `Ctrl + S`

---

## 💡 ทางเลือก: ส่งโค้ดขึ้นด้วย Google Clasp (สำหรับผู้พัฒนา)

หากคุณติดตั้ง Node.js และต้องการอัปโหลดโค้ดฝั่งหลังบ้านผ่าน Command Line โดยใช้ **Google Clasp** เราได้เตรียมไฟล์กำหนดค่าไว้ให้แล้วในโฟลเดอร์ `backend/` สามารถดำเนินการได้ดังนี้:

1. เปิด Terminal หรือ PowerShell ในโฟลเดอร์นี้
2. ติดตั้ง Google Clasp ทั่วโลก (หากยังไม่ได้ติดตั้ง):
   ```bash
   npm install -g @google/clasp
   ```
3. ล็อกอินเข้าสู่บัญชี Google ของคุณ:
   ```bash
   clasp login
   ```
4. เปลี่ยนไดเรกทอรีไปยังโฟลเดอร์ `backend`:
   ```bash
   cd backend
   ```
5. อัปโหลดโค้ดไปยัง Google Apps Script อัตโนมัติ:
   ```bash
   clasp push
   ```
   *(หมายเหตุ: หาก clasp แจ้งเตือนเรื่อง Google Apps Script API ให้เปิดใช้งานผ่านลิงก์ [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings))*
6. หลังจากส่งโค้ดขึ้นระบบเรียบร้อย ให้ดำเนินการใน **ขั้นตอนที่ 3** (กด Deploy เป็นแอปพลิเคชันเว็บผ่านหน้าเบราว์เซอร์) เพื่อรับลิงก์ URL มาใช้งานได้ทันที


---

## ขั้นตอนที่ 3: เปิดใช้งานเป็นแอปพลิเคชันเว็บ (Deployment)

เพื่อให้หน้าจอฝั่งไคลเอนต์สามารถเชื่อมโยงเขียนและอ่านข้อมูลได้ ต้องนำเสนอสคริปต์เป็น Web API ดังนี้:

1. กดปุ่ม **การใช้งานจริง (Deploy)** สีน้ำเงินที่มุมขวาบนของหน้าจอ -> เลือก **การจัดการการทำให้ใช้งานได้ใหม่ (New deployment)**
2. ในป๊อปอัป ให้กดที่รูปฟันเฟืองข้าง "เลือกประเภท (Select type)" -> เลือก **แอปพลิเคชันเว็บ (Web app)**
3. ตั้งค่ารายละเอียดดังนี้:
   - **คำอธิบาย (Description)**: `NCD Focus API v1`
   - **เรียกใช้ในฐานะ (Execute as)**: เลือก **ฉัน (Me - อีเมลของคุณ)**
   - **ผู้มีสิทธิ์เข้าถึง (Who has access)**: เลือก **ทุกคน (Anyone)** *(สำคัญมาก: หากเลือกเฉพาะคุณ หน้าเว็บภายนอกจะไม่สามารถเข้าถึงชีตได้)*
4. กดปุ่ม **การทำให้ใช้งานได้ (Deploy)**
5. ระบบจะขึ้นป๊อปอัปให้กด **ให้สิทธิ์การเข้าถึง (Authorize access)** -> เลือกอีเมล Google ของคุณ -> ระบบจะขึ้นหน้าจอเตือนว่าแอปไม่ปลอดภัย ให้กดลิงก์ **ขั้นสูง (Advanced)** -> แล้วกดเลือก **ไปที่ ... (ไม่ปลอดภัย) / Go to ... (unsafe)** -> กด **อนุญาต (Allow)**
6. เมื่อทำการ Deploy สำเร็จ คุณจะได้รับหน้าต่างที่มี **URL ของเว็บแอป (Web app URL)** (ลิงก์จะยาวๆ ลงท้ายด้วย `/exec`)
7. **คัดลอกลิงก์ Web app URL นั้นไว้** เพื่อนำไปใส่ในหน้า **ตั้งค่า API** ภายในแอป ห้าม commit URL จริงหรือรหัสผ่าน API ลง GitHub

---

## สรุปโครงสร้างคอลัมน์ของชีต (สำหรับการอ้างอิง)

### 1. Targets (ข้อมูลส่วนบุคคล)
`id` | `name` | `address` | `village` | `responsible_worker` | `age` | `height` | `type` | `chronic_disease` | `co_morbidity` | `onset_year` | `medicines`

หมายเหตุ: `address` ใช้เก็บบ้านเลขที่เท่านั้น ส่วน `village` ใช้เก็บหมู่บ้านจากรายการควบคุม เช่น `หมู่ 2 บ้านตรัง`, `หมู่ 3 บ้านเขาวัง`, `หมู่ 4 บ้านม่วงเงิน` เพื่อให้ dashboard แยกความก้าวหน้ารายหมู่บ้านได้ถูกต้อง
`responsible_worker` ใช้เก็บชื่อคณะทำงาน/อสม. ที่รับผิดชอบกลุ่มเป้าหมายรายบุคคล เพื่อให้กรองรายชื่อและสรุป dashboard ตามผู้รับผิดชอบได้

### 2. QuarterlyData (ข้อมูลราย 3 เดือน)
`id` | `target_id` | `quarter` | `date` | `weight` | `bmi` | `waist` | `dtx` | `bp` | `body_fat` | `muscle_mass` | `visceral_fat` | `body_age` | `physical_activity` | `food_overeat` | `food_unhealthy` | `food_habit` | `remark` | `veggie_fruit` | `depression_2q` | `sleep` | `smoking` | `alcohol` | `hba1c` | `egfr` | `creatinine` | `triglyceride` | `ldl` | `cholesterol`

### 3. DailyLogs (บันทึกรายวัน)
`id` | `target_id` | `week` | `day` | `date` | `avoid_sweet` | `avoid_oil` | `avoid_salt` | `menu` | `exercise_type` | `exercise_duration` | `water` | `sleep_hours`

### 4. OSM (รายชื่อคณะทำงาน/อสม.)
คอลัมน์ A: `ลำดับที่` | คอลัมน์ B: `ชื่อ อสม`

ระบบจะอ่านรายชื่อจากคอลัมน์ B ตั้งแต่แถวที่ 2 เป็นต้นไป เพื่อนำไปใช้เป็นตัวเลือก `คณะทำงานที่รับผิดชอบ` ในฟอร์มรายบุคคล

### 5. NotificationLog (ประวัติการแจ้งเตือน)
`timestamp` | `type` | `severity` | `target_id` | `target_name` | `village` | `responsible_worker` | `message` | `channel` | `status` | `sent_at` | `dedupe_key` | `error`

ชีตนี้ใช้เก็บประวัติการแจ้งเตือน Telegram ทั้งแบบรายวันและแบบรายครั้ง เพื่อให้ตรวจสอบย้อนหลังได้ และเตรียมต่อยอดเป็น dashboard notification ในอนาคต

---

## ขั้นตอนที่ 4: ตั้งค่าระบบแจ้งเตือน Telegram

ระบบแจ้งเตือนจะไม่เก็บ token ไว้ใน GitHub, Netlify หรือไฟล์ JavaScript ใด ๆ ให้ตั้งค่าใน **Apps Script -> Project Settings -> Script properties** เท่านั้น

เพิ่ม Script properties ดังนี้:

- `TELEGRAM_BOT_TOKEN`: token ของ bot จาก BotFather
- `TELEGRAM_CHAT_ID`: `-5385222091`

หลังตั้งค่าแล้วให้กด Deploy เวอร์ชันใหม่ของ Web App เพื่อให้โค้ดแจ้งเตือนทำงานบน live deployment

### การทดสอบส่งสรุปรายวัน

หลัง deploy แล้ว สามารถทดสอบจากหน้าเว็บหรือเครื่องมือยิง API ด้วย action:

```json
{
  "action": "sendDailyTelegramSummary",
  "passcode": "รหัส API_PASSCODE",
  "data": {}
}
```

ข้อความ Telegram รายวันจะแสดง:

- จำนวนกลุ่มเป้าหมายใน 3 หมู่หลัก
- จำนวนที่ติดตามแล้วและค้างติดตาม
- สรุปแยกตามหมู่บ้าน
- รายชื่อคนที่ค้างติดตาม พร้อมหมู่บ้านและผู้รับผิดชอบ
- รายชื่อที่ต้องติดตามสุขภาพ ถ้ามีสัญญาณเสี่ยงจากผลตรวจล่าสุด

ข้อความจะไม่แสดงค่าตรวจสุขภาพละเอียด เช่น DTX, BP หรือ HbA1c ในกลุ่ม Telegram

### การตั้ง trigger รายวัน

เรียก action นี้หนึ่งครั้งหลัง deploy เพื่อสร้าง time-driven trigger:

```json
{
  "action": "setupDailyNotificationTrigger",
  "passcode": "รหัส API_PASSCODE",
  "data": {}
}
```

ระบบจะลบ trigger เดิมของ `sendDailyTelegramSummary` แล้วสร้างใหม่ให้ส่งทุกวันเวลาประมาณ 07:00 น. ตาม timezone `Asia/Bangkok`

### แจ้งเตือนรายครั้ง

หลัง deploy แล้ว ระบบจะส่ง Telegram และบันทึกลง `NotificationLog` เมื่อเกิดเหตุการณ์เหล่านี้:

- เพิ่มกลุ่มเป้าหมายใหม่
- แก้ไขข้อมูลสำคัญของกลุ่มเป้าหมาย เช่น หมู่บ้าน ผู้รับผิดชอบ ประเภทกลุ่ม โรคประจำตัว โรคร่วม
- บันทึกหรืออัปเดตผลตรวจ 3 เดือน
- บันทึกพฤติกรรมรายวัน

ถ้า Telegram ส่งไม่สำเร็จ ระบบจะยังบันทึกข้อมูลหลักลงชีตตามปกติ และบันทึก error ไว้ใน `NotificationLog`
