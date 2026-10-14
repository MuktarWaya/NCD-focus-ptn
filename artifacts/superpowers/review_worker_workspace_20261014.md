# Review: worker workspace selector

Scope: user's requested password → worker selection → assigned targets, with global Dashboard retained. Existing authorized system update and waiver of execute-plan command apply.

- Blocker: none.
- Major: none. Targets in all work views/export functions use one pure scope helper; Dashboard retains complete datasets/stats. No-selection and zero-person states never fall back to all targets. API client rejects out-of-scope profile/write IDs before network calls. Returned changed ownership clears profile and updates list. New/edited target assignment is fixed to chosen worker.
- Minor / limitation: this is a workspace filter under the existing shared password, not separate account authentication or server-side per-worker authorization. Documented in README. Backend continues providing the existing global bootstrap needed for Dashboard.
- Nit: none outstanding.

UX: required named choice, actual directory plus recorded assignments, exact name matching with whitespace cleanup, visible identity/count and deliberate change button, session restore validation, logout clearing, retry on load failure, app inert while chooser open. Fixed mobile sidebar logout being obscured by bottom nav; background nav hidden during chooser.

Verification:
- node --test tests/worker_scope.test.js tests/w0_completeness.test.js tests/production_connection.test.js tests/ncd_export.test.js tests/ncd_backend.test.js: 46 passed.
- node tests/tracking_utils.test.js; node tests/notification_logic.test.js: 10 checks passed.
- Browser (NCD_QA_NODE_MODULES + HTTP server 8765): tests/worker_workspace_browser.test.cjs passed password login/choice, scoped list/registry/export preview/Focus Group/interpreter/W0, global Dashboard totals/villages, other-ID read/write guard, changed-profile owner, zero-person selection, session restore, invalid saved name, mobile chooser, change and logout. tests/w0_browser.test.cjs passed scope-adapted W0 flow; tests/ncd_browser.test.cjs passed saving/reopening and real workbook generation against mock API.
- node --check app.js worker-scope.js w0-tracking-ui.js ncd-report-ui.js (each separately) and git diff --check: passed.
- Desktop/mobile chooser screenshots inspected in excluded worker-qa directory.
- Production API before update: valid login accepted, invalid rejected, 167 targets / 93 tracking / 35 worker directory. Backup in excluded deploy_worker_20261014/frontend-before; baseline c8533a1.

Deployment: frontend only. Apps Script v25/API/schema unchanged. No production health writes or external messages. Final live assets/data/chooser verification is recorded in finish artifact.
