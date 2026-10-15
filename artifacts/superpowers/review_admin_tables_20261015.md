# Review: admin table editor, 15 October 2026

Blocker: none open. Admin capability is checked server-side before all table reads/mutations. Main shared password, staff selection, spoofed request fields and expired/locked capabilities cannot grant admin. Password is only a Worker secret; public allowlist contains no credential or private database export.

Major: none open. Target and tracking patches preserve omitted/unknown data and distinguish blanks from zero. Immutable IDs/person-round links cannot be edited. Atomic receipts/revisions reject duplicate or conflicting writes. Worker rename cascades assignments and per-person audits in one batch and invalidates old selected workspaces. Resolved a UI race where refreshing after save could overlap a table switch: refresh completes before reload/success, old table rows are cleared during switching, and saving sets a fresh progress message.

Minor: shared admin credential identifies edits as “ผู้ดูแลระบบ”, not an individual person. Unsaved drafts/request IDs remain in memory until page closes; beforeunload warns. No bulk paste, record deletion or automatic save is provided. Local browser automation verified 1440 and 390 widths. The connected desktop Chrome could not be inspected reliably (detached/CDP timeout while host RAM was low); production verification used authenticated API reads and published asset checks, with no clinical mutations.

Nit: no open functional finding. SQL backup and verification should run sequentially. One production verification returned a transient 500 while the D1 export was running; all checks passed after export completed. No clinical mutation was sent in either run.

## Exact verification commands and results

Run from project root. CLI tools are installed in `C:/Users/mukta/.codex/ncd-cloudflare-tools/node_modules`.

```powershell
node cloudflare/scripts/build.mjs
node --check cloudflare/admin.js
node C:/Users/mukta/.codex/ncd-cloudflare-tools/node_modules/typescript/bin/tsc --project cloudflare/tsconfig.json --noEmit
node --test cloudflare/tests/admin.test.mjs cloudflare/tests/api.test.mjs cloudflare/tests/migration.test.mjs
$env:NCD_QA_NODE_MODULES='C:\Users\mukta\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:NCD_QA_CHROME='C:\Users\mukta\AppData\Local\ms-playwright\chromium_headless_shell-1223\chrome-headless-shell-win64\chrome-headless-shell.exe'
node --test --test-concurrency=1 cloudflare/tests/admin-browser.test.mjs cloudflare/tests/browser.test.mjs
node --test cloudflare/tests/admin-browser.test.mjs
node cloudflare/scripts/verify-admin-remote.mjs https://ncd-focus-staging.muktar32.workers.dev C:/Users/mukta/.codex/ncd-admin-private/20261015/staging-verify.json artifacts/superpowers/admin-staging-receipt-20261015.json
node cloudflare/scripts/verify-admin-remote.mjs https://ncd-focus-ptn.muktar32.workers.dev C:/Users/mukta/.codex/ncd-admin-private/20261015/production-verify.json artifacts/superpowers/admin-production-receipt-20261015.json
git diff --check
```

Build: 18 allowlisted assets. Syntax and strict TypeScript passed. API/migration/admin: 18 passed. Existing complete browser workflow: passed (password/workspace, W0 reopen, save/reopen, staff, exports and ambiguous writes). Final admin browser rerun: passed, including real local D1 corrections, worker rename/restore, audit, mobile horizontal containment and lock. Initial screenshot fixture path failure was fixed with `fileURLToPath`; final screenshots inspected at both widths. Ordinary browser launch was constrained by low host RAM; the installed headless shell and serialized tests completed successfully.

Staging and final production remote checks: passed; normal/staff forbidden, unlock, four allowlisted tables, forbidden session table, lock, normal session retained, direct admin login, published assets without embedded admin credential. Clinical mutations on remote: zero. Private SQL backups compared via in-memory SQLite: all 170 target documents/revisions, 97 tracking documents/revisions, and 35 directory names/ordinals unchanged. Admin list includes three additional existing assignment aliases (38 names total), without inserting directory rows.
