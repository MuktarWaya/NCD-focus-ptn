# คู่มือการติดตั้ง Google Sheets และ Google Apps Script สำหรับระบบหลังบ้าน

ทำตามขั้นตอนด้านล่างนี้เพื่อเชื่อมโยง Google Sheet ของคุณให้ทำหน้าที่เป็นฐานข้อมูลผ่าน API

---

## ขั้นตอนที่ 1: เตรียมแผ่นงาน Google Sheet

1. เปิดเบราว์เซอร์แล้วไปที่ Google Sheet ของคุณ:
   [https://docs.google.com/spreadsheets/d/1n4zJ7YJZ0fUxzoyBO0GUIAZiHjj71d7dZaQ5sYdcL8Y/edit](https://docs.google.com/spreadsheets/d/1n4zJ7YJZ0fUxzoyBO0GUIAZiHjj71d7dZaQ5sYdcL8Y/edit)
2. สร้างชีตหรือแผ่นงานใหม่ทั้งหมด **3 แผ่นงาน (Tabs)** โดยตั้งชื่อแต่ละแท็บให้ถูกต้องดังนี้ (ตัวสะกดพิมพ์ใหญ่-เล็กมีผล):
   - **Targets**
   - **QuarterlyData**
   - **DailyLogs**
3. นำเข้าข้อมูลตัวอย่างจากไฟล์ CSV ที่ผมสร้างไว้ให้ในคอมพิวเตอร์ของคุณ โดยการนำไปวางหรือกด **ไฟล์ (File) -> นำเข้า (Import) -> อัปโหลด -> เลือกไฟล์ CSV** หรือจะคัดลอกคอลัมน์จากตาราง CSV ไปวางตรงๆ ก็ได้:
   - นำเข้าไฟล์ `data/targets.csv` ลงในชีต **Targets**
   - นำเข้าไฟล์ `data/quarterly_data.csv` ลงในชีต **QuarterlyData**
   - นำเข้าไฟล์ `data/daily_logs.csv` ลงในชีต **DailyLogs**

*หมายเหตุ: ตรวจสอบให้มั่นใจว่าแถวแรก (แถวที่ 1) ของแต่ละแผ่นงาน คือชื่อคอลัมน์ภาษาอังกฤษอย่างถูกต้อง เช่น ชีต Targets จะต้องขึ้นต้นแถวแรกว่า `id`, `name`, `address`...*

---

## ขั้นตอนที่ 2: ติดตั้ง Google Apps Script

1. ที่เมนูด้านบนของ Google Sheet กดเลือก **ส่วนขยาย (Extensions) -> Apps Script**
2. ระบบจะเปิดหน้าต่างสคริปต์ใหม่ขึ้นมา ให้ลบโค้ดเริ่มต้นทั้งหมดออก (ที่มีคำว่า `function myFunction() { ... }`)
3. เปิดไฟล์ `backend/gas_backend.js` ในโฟลเดอร์โครงการนี้ คัดลอกโค้ดทั้งหมดแล้วนำไปวางในหน้าต่าง Apps Script
4. (ตัวเลือก) คุณสามารถเปลี่ยนรหัสผ่านเพื่อความปลอดภัยของข้อมูลสุขภาพในบรรทัดที่ 8 ได้:
   ```javascript
   var API_PASSCODE = "123456"; // สามารถเปลี่ยนเลขนี้เป็นรหัสที่คุณต้องการได้
   ```
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
7. **คัดลอกลิงก์ Web app URL นั้นไว้** เพื่อนำไปใส่ในแอปพลิเคชัน Frontend (ไฟล์ `app.js` หรือตั้งค่าระบบนำส่ง)

---

## สรุปโครงสร้างคอลัมน์ของชีต (สำหรับการอ้างอิง)

### 1. Targets (ข้อมูลส่วนบุคคล)
`id` | `name` | `address` | `age` | `height` | `type` | `chronic_disease` | `co_morbidity` | `onset_year` | `medicines`

### 2. QuarterlyData (ข้อมูลราย 3 เดือน)
`id` | `target_id` | `quarter` | `date` | `weight` | `bmi` | `waist` | `dtx` | `bp` | `body_fat` | `muscle_mass` | `visceral_fat` | `body_age` | `physical_activity` | `food_overeat` | `food_unhealthy` | `food_habit` | `remark` | `veggie_fruit` | `depression_2q` | `sleep` | `smoking` | `alcohol` | `hba1c` | `egfr` | `creatinine` | `triglyceride` | `ldl` | `cholesterol`

### 3. DailyLogs (บันทึกรายวัน)
`id` | `target_id` | `week` | `day` | `date` | `avoid_sweet` | `avoid_oil` | `avoid_salt` | `menu` | `exercise_type` | `exercise_duration` | `water` | `sleep_hours`
