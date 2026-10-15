> **ระบบจริงย้ายไป Cloudflare Workers + D1 (15 ตุลาคม 2569)**
> ใช้ https://ncd-focus-ptn.muktar32.workers.dev/ และคู่มือ `cloudflare/README.md` สำหรับการพัฒนา/นำขึ้นระบบจริง
> Google Sheets และโค้ด Apps Script ด้านล่างเก็บเพื่ออ้างอิงย้อนหลัง ห้ามนำ backend เดิมขึ้นใหม่เพื่อเปิดรับเขียนพร้อม D1 โดยไม่ตรวจเทียบข้อมูลและทำตามแผนย้อนกลับ
# Production-only connection

All staff use the existing shared API_PASSCODE. There is no separate app administrator password or settings screen. Connection defaults are maintained in app.js; Google project settings are managed through the owner's Google account. Legacy browser-local connection overrides are removed on startup.

Failed requests preserve form values, show a persistent error, and block writes until a successful reconnect. The frontend never loads demo CSVs or simulates saves. Writes are not retried automatically: after a lost response, inspect the target's records before submitting again.

## Deployment

1. Back up and compare the remote Apps Script source before uploading. Keep API_PASSCODE and all other existing Script properties unchanged. No ADMIN_PASSCODE is required.
2. Publish the backend to the existing deployment ID, retaining its /exec URL. Verify login accepts the existing user password and rejects an incorrect one. Maintenance actions are blocked through the public API; use the owner's Apps Script editor for maintenance.
3. Publish the frontend to https://ncd-focus-ptn.netlify.app/ after backend verification. Source repository: MuktarWaya/NCD-focus-ptn, branch master.
4. Staff must finish current work and reload. Already-open tabs continue running old code until refreshed. Confirm no settings navigation or demo banner is present.

## Verification and rollback

Run node --test tests/production_connection.test.js, node tests/tracking_utils.test.js, node tests/notification_logic.test.js, and syntax checks on app.js and backend/gas_backend.js.

The backend previously used deployment version 21. Roll back the frontend before reverting the backend (the old backend lacks login). No patient records or sheet structures are changed by this release.
