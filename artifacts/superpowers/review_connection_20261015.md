Review: Blocker none; Major none; Minor none; Nit none.
No backend changes. Unique non-secret request URLs and no-store reduce redirect/cache reuse; not a proven universal remedy for Google service failures. Preserve no automatic mutation retry and fail-closed connection state.
Verification commands: node --test tests/production_connection.test.js (26 passed); node --test tests/ncd_browser.test.cjs with NCD_QA_NODE_MODULES configured (1 full mock desktop/mobile flow passed); node --check app.js; git diff --check (passed).
Browser test uses mocked backend, no real patient writes. Credentials remain only in POST body.
