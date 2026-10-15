# Workers + D1 migration — approved 15 October 2026
Human approval explicitly authorizes implementation, staging data validation, and eventual cutover without a superpowers command. Preserve the old Sheets as historical evidence. Existing production stays active until reconciliation and cutover safeguards pass.

## Design and acceptance
Retain the existing SPA, all rounds (including legacy), W0 tracking, staff/worker workspaces, interpreter, dashboards, Excel/other exports, daily legacy history and notifications. Workers serves an allowlisted static build and same-origin /api. D1 stores exact JSON payloads plus indexed IDs/ownership/round and revisions; do not normalize away blank/zero or unknown source columns. Reuse pure clinical/statistical rules from the existing backend with parity tests.
Shared password -> secure server session -> explicit worker choice as before; server validates selected workspace for all individual reads/writes. This is a shared-access workspace, not personal proof of identity. Staff selection remains read-only, all aggregates remain available. Password only in login body, Worker secret, never published JS. Mutation request IDs, atomic D1 batches, conflict checks and audit/outbox prevent duplicate and lost concurrent changes.

## Implementation
1. Inventory API contracts, storage, assets, notifications and migration source; verify Cloudflare account.
2. Implement D1 schema, Worker session/API/validation/notification outbox and allowlisted frontend build. Keep Netlify production unchanged during work.
3. Add migration snapshot/export/import/reconciliation scripts. Read actual source including per-target legacy daily logs and raw sheet archive; fail on duplicates/orphans and preserve IDs/types/fields.
4. Test local real D1 semantics: login, scope, CRUD/upsert, zero/blanks, legacy rounds, duplicate requests, concurrency conflicts, failure recovery, notification failures; full browser flows and Excel parity.
5. Provision isolated staging, import snapshot, verify counts/hashes/field parity and read latency. Never test writes on patient records; use separate synthetic database.
6. Before cutover: enforce old-backend write freeze; take final source snapshot, import and reconcile; deploy Worker production then redirect old frontend. Disable old daily notifications before enabling new. Retain source Sheets unchanged except documented write freeze. Rollback after new writes requires reconciliation, not blind routing rollback.
7. Persist review, receipts, exact tests, deployment and rollback instructions.

## Constraints
No patient/secret files in Git or public assets. Private snapshots outside repository public root. No automatic retry of ambiguous writes without same request ID. No Telegram test sends. No Cloudflare billing-plan upgrades without explicit user request. If account access blocks remote deployment, complete all independent local implementation/tests and report exact missing access.
