# Finished: admin table editor

Production: https://ncd-focus-ptn.muktar32.workers.dev/

Worker version: `6d6146cc-44cf-4b02-be54-4d9d496f45ac`. Backend and frontend published together. Additive migration `0002_admin.sql` applied before publishing. The requested admin password is configured as `ADMIN_PASSCODE` only; its value is intentionally absent from this report and all public assets. Existing user/Telegram secrets remain configured.

Use **จัดการฐานข้อมูล**, unlock with the specified password, choose a table, correct cells and click **บันทึกแถว**. Targets/assignments, follow-ups (physical, W0 behavior, labs, weekly summaries), workers and audit history are supported. Worker rename updates linked assignments atomically. Admin capability expires after 30 minutes and has a lock button. Staff overview remains distinct from administration.

Private backups: `C:/Users/mukta/.codex/ncd-admin-private/20261015/before-admin.sql` and `after-admin.sql`. Exact clinical/directory parity passed; remote verification performed no clinical writes and sent no test notifications. Original Google Sheets remain untouched. Existing normal browser workflow plus final admin browser workflow passed; 18 API/migration/admin tests and strict TypeScript passed.

Evidence: `review_admin_tables_20261015.md` has exact commands and limitations. Remote receipts and data parity receipt are saved alongside it. `admin-table-synthetic-20261015.png` shows local synthetic data, not patient information. Live UI could not be inspected with connected Chrome due to host/browser instability; production API authentication, authorization, lock and asset checks passed.

Rollback: previous Worker can ignore the new additive columns. Preserve D1 and its audit records; do not reimport the old migration snapshots or revert patient data to roll back this feature.
