PRAGMA foreign_keys = ON;
CREATE TABLE targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker TEXT NOT NULL, village TEXT NOT NULL,
  document TEXT NOT NULL CHECK(json_valid(document)),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX targets_worker ON targets(worker);
CREATE INDEX targets_village ON targets(village);
CREATE TABLE tracking_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL REFERENCES targets(id),
  quarter TEXT NOT NULL,
  document TEXT NOT NULL CHECK(json_valid(document)),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(target_id,quarter)
);
CREATE TABLE daily_logs_legacy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL REFERENCES targets(id),
  document TEXT NOT NULL CHECK(json_valid(document)),
  revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX daily_target ON daily_logs_legacy(target_id);
CREATE TABLE workers (name TEXT PRIMARY KEY, ordinal INTEGER NOT NULL);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, worker TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL
);
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE mutation_receipts (
  request_id TEXT PRIMARY KEY, session_hash TEXT NOT NULL,
  action TEXT NOT NULL, payload_hash TEXT NOT NULL,
  result TEXT NOT NULL CHECK(json_valid(result)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL, action TEXT NOT NULL, target_id INTEGER,
  before_document TEXT, after_document TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL,
  message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE source_archive (
  source_key TEXT PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document))
);
CREATE TABLE migration_runs (
  snapshot_id TEXT PRIMARY KEY, source_hash TEXT NOT NULL,
  counts TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings(key,value) VALUES('migration_state','unverified');
