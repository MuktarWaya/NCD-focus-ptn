# Review: W0 comparison and assigned targets

Extends the user's approved W0 work with the requested comparison tables and target-name verification.

- Blocker: none.
- Major: none. Worker totals still derive from individual statuses; table subtotal equals included rows; same worker split by village correctly; group status filter keeps denominator; all member names/IDs/missing labels are HTML-escaped; no assignments or clinical records are mutated.
- Minor: regular page has expandable target names per explicit user request. Compact capture shows aggregate worker tables and hides target names/details, so a single village overview stays short. It does not include clinical measurements. User can open names before entering records and click through to existing profile.
- Nit: none.

Verification:
- node --test tests/w0_completeness.test.js tests/production_connection.test.js tests/ncd_export.test.js tests/ncd_backend.test.js: 43 tests passed.
- NCD_QA_NODE_MODULES set to bundled modules; local HTTP on 8765; node --test tests/w0_browser.test.cjs: passed menu entry, two village tables, worker filter, member identity/scoping, existing copied reminder, table capture with names hidden, mobile no horizontal overflow, Escape, mock profile navigation, fresh/failure states.
- Screenshots desktop and 390px mobile inspected; compact colored table readable. No production test writes.
- node --check w0-completeness.js; node --check w0-tracking-ui.js; git diff --check: passed.
- Production backup and before API hash stored in excluded deploy_w0_comparison_20261014 directory. Counts remain 167/93/35. Publish verification recorded in finish artifact.

Backend unchanged: current Apps Script version 25 supplies all needed data. Rollback frontend to commit 9fa1dad without altering Sheets.
