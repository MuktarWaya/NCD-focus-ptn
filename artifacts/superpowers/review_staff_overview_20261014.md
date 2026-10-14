# Review: staff all-target overview

User asked to add staff viewing all people. Added explicit staff choice to shared-password workspace selector; staff targetsFor returns full target set, normal worker filtering stays exact. Human label used in chooser, identity, preview and export filename. Staff worker filters enabled and staff session restores normally. Staff mode is read-only: all four mutation actions blocked before fetch and record buttons disabled; no staff token stored as target owner.

Blocker: none. Major: none. Minor: remains workspace selection under shared password, not a separate authenticated staff account, as already documented. Nit: none.

Verification:
- node --test tests/worker_scope.test.js tests/w0_completeness.test.js tests/production_connection.test.js tests/ncd_export.test.js tests/ncd_backend.test.js: 48 passed.
- NCD_QA_NODE_MODULES with local HTTP server8765: node --test tests/worker_workspace_browser.test.cjs passed actual staff choice, all-target list, unlocked worker filters, W0 totals, another-worker profile, read-only mutation/button guard, restored staff session and switching back to ordinary worker.
- node --check worker-scope.js; node --check app.js; git diff --check passed.
- Before API 167 targets/93 tracking/35 directory, unchanged baseline hash; frontend backup in excluded deploy_staff_20261014/frontend-before. No production health writes or outbound messages.

Deploy frontend only, backend v25 unchanged. Rollback frontend to f163163. Final live receipts in finish artifact.
