CREATE TABLE IF NOT EXISTS beta_sessions (
  token_hash TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_beta_sessions_owner_email
  ON beta_sessions (owner_email);

CREATE INDEX IF NOT EXISTS idx_beta_sessions_expires_at
  ON beta_sessions (expires_at);

ALTER TABLE audit_reports ADD COLUMN owner_email TEXT;
ALTER TABLE audit_reports ADD COLUMN owner_session_hash TEXT;
ALTER TABLE audit_reports ADD COLUMN target_host TEXT;
ALTER TABLE audit_reports ADD COLUMN expires_at TEXT;

UPDATE audit_reports
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+30 days')
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_reports_owner_email
  ON audit_reports (owner_email);

CREATE INDEX IF NOT EXISTS idx_audit_reports_expires_at
  ON audit_reports (expires_at);

CREATE INDEX IF NOT EXISTS idx_audit_reports_target_host
  ON audit_reports (target_host);
