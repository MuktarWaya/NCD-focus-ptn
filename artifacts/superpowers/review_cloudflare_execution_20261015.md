# Review — Workers + D1 migration

Blocker: none after final snapshot stability, reconciliation and cutover checks complete. Production remains read-only until those checks; never open two writers.

Major: none unresolved. Shared login remains an organizational workspace, not individual authenticated identity. All-community dashboard data remains accessible to authenticated users, preserving the existing contract; detail and mutations validate server-selected workspace, staff is read-only. This is explicitly documented rather than claiming private per-user isolation.

Minor: Telegram outbox delivery occurs up to five minutes after save and is at-least-once (possible duplicate notification after ambiguous delivery); eight failures are retained for inspection. Clinical writes use atomic receipts, unique person/round and revision checks. External fonts/Chart.js/Tailwind/SheetJS remain as in the existing frontend. No runtime Apps Script dependency in the Cloudflare build.

Nit: none.

## Verification

- `node --test tests/w0_completeness.test.js tests/tracking_history.test.js tests/production_connection.test.js tests/worker_scope.test.js tests/ncd_export.test.js tests/ncd_backend.test.js`: 54 passed.
- `node --test cloudflare/tests/api.test.mjs cloudflare/tests/migration.test.mjs`: 11 passed, SQLite transaction semantics, scope/staff, auth, idempotency/concurrency, zero/blank/date/unknown field preservation, notification failures, migration duplicates/orphans/import guard, allowlisted assets.
- `node --test cloudflare/tests/browser.test.mjs` with `NCD_QA_NODE_MODULES`: passed against real local Wrangler Worker + synthetic D1; login/worker/W0/W12/save/reopen/Excel/desktop/mobile/staff/lost response. No patient test writes.
- Generated Wrangler types, strict TypeScript check, JS syntax and staged diff whitespace checks; Workers dry-run succeeds.
- Remote source-to-D1 comparisons: exact IDs and every stored field for 170 targets, 97 results, zero legacy daily logs, 35 original directory entries; report parity in 52 community/round combinations.
- Downloaded D1 SQL export restored into SQLite: clinical data, directory and chunked archives of all five tables match hashes; no post-cutover clinical writes before activation.
- CUA production UI: existing password works; staff choice 170 targets; Cloudflare connection label; Dashboard 170 total, 157 risk, 13 patient. Read-only UI checks only.
- Private path requests `/env.txt`, `/data/targets.csv`, `/backend/gas_backend.js`, `/artifacts/superpowers/` return 404 on Cloudflare. Actual credentials scanned against staged content: no match. Secrets and raw snapshots remain outside repository.

## Cutover safeguards

Apps Script owner source/deployments backed up privately. Version 26 blocks legacy mutations and stops its scheduled sender; Sheets cells and Script properties preserved. Six-minute drain followed by stable final exports required. New API remains read-only until provenance and field/archive checks pass. Backups and rollback/reconciliation procedure documented in cloudflare/README.md. No test notification sends and no live clinical writes by this task.
