# Plan: choose worker after shared login

User requests a worker choice after password authentication, then assigned targets throughout the working views while keeping Dashboard overview available.

1. Add pure worker scoping helpers and identity choice UI. Load actual directory and assigned names, require choice, remember within session, validate after refresh, clear on logout. No fuzzy name matching or zero-person fallback to all.
2. Scope targets list, registry, Focus Group, interpreter chooser, W0 and all exports to chosen worker. Keep Dashboard calculations/progress overview unchanged. Display current identity and allow deliberate change via chooser.
3. Guard profile navigation and client write paths against other-worker IDs; constrain target creation/edit assignment to chosen name. Recheck profile assignment returned by API. This is a shared-password workspace selector, not individual account authentication or backend authorization.
4. Test full password → choice → scoped views/exports → global Dashboard, direct outside-profile/write guard, refresh/restore/change/logout and failures using mock API. Verify existing tests. Deploy frontend after review; backend unchanged unless implementation needs a new API.
5. Backup prior frontend/commit c8533a1, verify live assets and unchanged data hash, persist review/finish.

Existing approval to extend and update system and waiver of execute-plan command are retained. No production clinical test writes or auto messaging.
