-- First-party activation instrumentation for the private-beta funnel.
--
-- Each row is a single self-attributed step the visitor reached on the way
-- from the locked homepage to a verified beta session. Rows are intentionally
-- append-only so the founder can analyse drop-off without ever mutating a
-- recorded event. The same visitor can produce multiple rows over time.

CREATE TABLE IF NOT EXISTS access_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step TEXT NOT NULL,
  funnel_key TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  landing_path TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_events_step_created_at
  ON access_events (step, created_at);

CREATE INDEX IF NOT EXISTS idx_access_events_funnel_key
  ON access_events (funnel_key, created_at);

CREATE INDEX IF NOT EXISTS idx_access_events_owner_email
  ON access_events (owner_email, created_at);

CREATE INDEX IF NOT EXISTS idx_access_events_created_at
  ON access_events (created_at);
