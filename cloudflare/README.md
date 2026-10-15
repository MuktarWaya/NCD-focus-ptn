# NCD Focus: Cloudflare Workers + D1

The original SPA is built into an explicit static allowlist by `scripts/build.mjs`. The Worker serves `/api` on the same origin; Google Sheets / Apps Script is not in the new read/write path. Original source at the repository root remains available for historical comparison. Never publish the whole repository as static assets.

Production: https://ncd-focus-ptn.muktar32.workers.dev

Staging: https://ncd-focus-staging.muktar32.workers.dev (separate random password, read-only, notifications disabled).

## Setup and checks

Node.js 24+, then from this directory:

```powershell
npm ci
npm run build
npm run types
npm run check
npm test
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

Local `.dev.vars` must contain `API_PASSCODE`; Telegram keys are optional. These files are ignored. `wrangler types` generates the ignored runtime/binding declarations. Configure real secrets with `wrangler secret bulk PRIVATE_JSON --env production` (or `secret put`); never put them in source/config/public files. The generated public JS contains no shared password or legacy endpoint.

For the real local D1 browser flow, initialize **only the local synthetic database** with the fixture from `tests/helpers.mjs`, import it, and set `settings.migration_state=verified`. Set `NCD_QA_NODE_MODULES` to a directory containing Playwright and run `node --test tests/browser.test.mjs`. Chrome must be installed. Tests write only to this local fixture database; there are no live patient test writes or test Telegram sends. A fixture database with an audit history cannot be reimported until it is explicitly reset; the production importer deliberately rejects overwriting post-migration clinical edits.

## Compatibility and access

Preserves action-based API responses, target IDs, all clinical and behavior columns, exact blank/zero values, legacy rounds M0/M3/M6/M9, W0–W24, original daily history, worker/staff screens, all dashboards, interpreter, comparison/capture, CSV/Excel exports and templates. Imported JSON retains unknown columns; subsequent partial updates merge with the old document. Derived BMI/pingpong and validation use generated legacy rules with regression parity tests. No mock worker directory is used in the Cloudflare build.

Login uses the existing shared password and a 12-hour HttpOnly/Secure/SameSite cookie. Worker selection is recorded in the server session. The server enforces ownership for individual detail access and mutations; staff overview is read-only. **Shared login and selectable names are a workspace convention, not personal identity authentication.** Authenticated users can still retrieve global registry/tracking data for the existing all-community dashboard, exactly as before. Do not describe this release as per-person confidential data isolation. A future account/PIN-per-worker change must replace shared selection if required.

Every write has a request ID, original form revision, atomic D1 receipt/write/audit/outbox batch, and a unique person/round constraint. Repeating the same request returns the receipt; stale concurrent edits return 409 without overwriting. The client never automatically resends a write. An ambiguous write leaves the form and pending request ID intact; reconnect and inspect history before submitting again. Staff may select a responsible worker to edit, following the existing workflow.

## Notifications

Clinical transactions only enqueue a durable outbox row. A Cron runs every five minutes to deliver pending messages, and `0 0 * * *` creates the daily 07:00 Asia/Bangkok summary. Retries use leases/backoff, eight attempts then a visible failed row; inspect `notification_outbox` for delivery failures. Telegram has no idempotency key, so an ambiguous send can duplicate a notification (at-least-once delivery). Clinical records/receipts remain exactly-once for a request. No detailed measurements appear in messages. `NOTIFICATIONS_ENABLED=false` disables all outbound sends; staging always uses false. Enable production only after the old scheduled sender has been disabled. Historical NotificationLog is archived, never replayed.

## Data migration and cutover

Private snapshots/backups live outside the public repository (this run: `C:/Users/mukta/.codex/ncd-migration-private/20261015`). They contain health data and owner credentials; do not commit/share them.

1. Owner script backup: `node scripts/google-admin.mjs backup PRIVATE_BACKUP_JSON`. Keep the exact original content and deployment/version.
2. Preliminary source: read all source sheets with the authorized Drive connector, then `snapshot-source.mjs PRIVATE_RAW_JSON PRIVATE_SNAPSHOT_JSON`. Clinical serialization comes from the original API. Secret-bearing unrelated tabs are excluded from D1 archives.
3. Generate SQL: `node scripts/migration.mjs sql PRIVATE_SNAPSHOT_JSON PRIVATE_IMPORT_SQL`. Import with `wrangler d1 execute DB --env staging --remote --file PRIVATE_IMPORT_SQL`. The operation fails on duplicate IDs/person-rounds, unknown rounds, orphans, and on existing post-cutover audit writes. It preserves all original IDs/JSON values; it never selects a duplicate silently.
4. Deploy staging, configure its random secret, verify with `verify-remote.mjs BASE PRIVATE_SECRETS PRIVATE_SNAPSHOT RECEIPT_JSON`. Verify every record/field, exact worker directory, and reports for every community and round. Test writes on local/synthetic data only.
5. Prepare owner freeze code with `prepare-cutover.mjs PRIVATE_BACKUP PRIVATE_DIRECTORY NEW_URL`. It guards legacy writes and disables the old scheduled sender without changing spreadsheet cells/properties. A private random admin export token is used only during migration and is never committed.
6. After tests pass, publish the freeze with `google-admin.mjs publish PRIVATE_BACKUP PRIVATE_FREEZE_SOURCE`. Allow six minutes for old Apps Script executions already running to finish; compare stable final exports. `final-snapshot.mjs PRIVATE_DIRECTORY` retrieves all five source tables and the existing Telegram configuration privately. No sheet data writes are needed.
7. Import the final snapshot to production while `WRITES_ENABLED=false`. Run remote reconciliation and archive hash verification, then set `settings.migration_state=verified`. Take a D1 SQL backup. Verify source data still matches before enabling writes.
8. Enable production `WRITES_ENABLED=true` and notifications only when credentials exist and legacy sender is disabled. Deploy first, verify, then publish the Netlify redirect-only directory/config to send the existing URL to Cloudflare. Old open tabs remain blocked by the Apps Script freeze.
9. Retain the old Sheets unchanged as historical evidence. New production edits are stored in D1; this release does not synchronize new data back to Sheets. D1 Time Travel plus manual SQL exports support recovery. Keep backup files in the private location and use `wrangler d1 export DB --env production --remote --output PRIVATE_SQL` for a fresh export.

## Rollback

Before any D1 clinical writes, disable Cloudflare writes/notifications, restore the original owner source/deployment, verify old reads, then remove the old-site redirect. After any D1 clinical writes, **do not blindly restore routing or reimport a snapshot**: freeze D1, export it, reconcile `audit_log` and all post-cutover records back to the chosen source, verify, then reopen one writer. Avoid dual writers. Preserve all backups/audit receipts until reconciliation is complete. `migration_runs` records source snapshot hashes/counts; `source_archive` stores chunked raw clinical/admin sheet rows.
