# Production-only connection and administrator access

The updated frontend never loads demo CSVs or simulates saves. It requires a successful load of real data before enabling the three save forms. Failed requests leave form values intact, show a persistent error, and block further writes until a successful reconnect. Writes are never retried automatically because a lost response does not establish whether Sheets accepted the record.

## Deployment order

1. In the existing Apps Script project's Settings / Script properties, keep `API_PASSCODE` unchanged for current users. Add `ADMIN_PASSCODE` with the private administrator password supplied by the owner. Do not put the administrator password in frontend files, Git, or this document.
2. Compare the remote Apps Script source with `gas_backend.js` before uploading, to preserve any editor-only changes. Publish a new version to the existing deployment ID and retain the existing `/exec` URL. The new backend keeps the existing user CRUD API compatible and adds the `login` action. Maintenance actions now require the administrator password.
3. Verify `login` returns `role: user` for the user password and `role: admin` for the administrator password, and rejects an incorrect password. Do not log credentials or patient records.
4. Publish `app.js`, `index.html`, and `style.css` to the verified production frontend. Do not publish the new frontend before the backend supports `login`.
5. Reload clients. Existing open tabs continue running their previous JavaScript until refreshed. Verify both desktop and mobile settings navigation is hidden for users, visible for administrators, and failed loading cannot enable saves.
6. After a write response is lost, reconnect and inspect the relevant target's records before submitting again. Never test a save using dummy patient data in production.

## Scope of administrator settings

The settings screen retains the existing browser-local connection settings. Changing its URL/password affects that browser only. To move all users to another deployment, update the default connection configuration and publish the frontend. The administrator role is held in memory and is not trusted from local/session storage; after a page reload, log out and log in again to regain administrator settings.

The existing application still uses a shared user password for Sheets API access; this change does not introduce individual staff accounts. The backend verifies administrator credentials for maintenance actions; hiding frontend controls is not a substitute for backend authorization.

## Verification

Run `node --test tests/production_connection.test.js`, `node tests/tracking_utils.test.js`, `node tests/notification_logic.test.js`, and syntax checks on `app.js` and `backend/gas_backend.js`.
