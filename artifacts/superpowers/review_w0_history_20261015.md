# Review: resume baseline history 15 October 2026

User confirms issue affects all target participants. Shared form previously chose the first unrecorded round automatically, which opened an empty next round despite an existing partial W0. Fixed default to existing W0, plus explicit เติม / แก้ไขข้อมูล W0 เดิม action. All user record buttons read the selected person's current profile first. Target-specific raw history preserves blank vs zero, old dates, labs, behavior fields; mismatched detail vs known global rounds triggers a fresh existing getAllQuarterly read before proceeding. No M0/W2 borrowing and no other-person fallback. Staff mode remains read-only.

Review:
- Blocker: none.
- Major: none. Duplicate-round editing blocked; failed history reads do not open blank form; mock save updates one existing W0 row; owned-target checks retained.
- Minor: choosing a new follow-up round is now explicit via round dropdown. Only real existing W0 data is restored; genuinely missing fields stay blank. Legacy M0 shown as a warning, not migrated.
- Nit: none.

Verification:
- node --test tests/tracking_history.test.js tests/production_connection.test.js tests/worker_scope.test.js tests/w0_completeness.test.js tests/ncd_export.test.js tests/ncd_backend.test.js: 51 passed.
- With bundled Playwright/Chrome and HTTP server8765, node --test tests/ncd_browser.test.cjs: passed partial W0 reopened without manually choosing round, date/weight/HbA1c retained, blanks/zero preserved, one W0 after save, missing detail recovered through fresh global history, fresh-read failure blocks form, another target stays blank, W2/W12 separate, Excel regression and desktop/mobile.
- tests/worker_workspace_browser.test.cjs and tests/w0_browser.test.cjs passed.
- node --check app.js; node --check tracking-history.js; git diff --check passed.
- Mock desktop/mobile screenshots inspected: resume-w0-desktop.png and resume-w0-mobile.png in excluded ncd-qa/.
- Initial browser attempt failed because previous-day local HTTP server was stopped; restarted and subsequent flows passed.
- Read-only live API sample confirms stored W0 in both bootstrap and detail. Baseline before release is168 targets/93 results/35 directory (one real target added during work; no clinical write by this task). Backup and API hash in excluded deploy_w0_history_20261015/.

Deployment: frontend only, existing Apps Script v25 API supports this. Publish proof/data verification recorded in finish artifact. Rollback frontend to0f73815; no restoration of Sheets needed.
