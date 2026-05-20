CREATE TABLE IF NOT EXISTS beta_invites (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  owner_email TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  used_at TEXT,
  last_used_ip_hash TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_beta_invites_owner_email
  ON beta_invites (owner_email);

CREATE INDEX IF NOT EXISTS idx_beta_invites_status
  ON beta_invites (status);

ALTER TABLE beta_sessions ADD COLUMN invite_id TEXT;
ALTER TABLE audit_reports ADD COLUMN owner_invite_id TEXT;

CREATE INDEX IF NOT EXISTS idx_beta_sessions_invite_id
  ON beta_sessions (invite_id);

CREATE INDEX IF NOT EXISTS idx_audit_reports_owner_invite_id
  ON audit_reports (owner_invite_id);

CREATE TABLE IF NOT EXISTS fix_requests (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  target_url TEXT NOT NULL,
  target_host TEXT NOT NULL,
  score INTEGER,
  issue_count INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fix_requests_created_at
  ON fix_requests (created_at);

CREATE INDEX IF NOT EXISTS idx_fix_requests_owner_email
  ON fix_requests (owner_email);

CREATE INDEX IF NOT EXISTS idx_fix_requests_status
  ON fix_requests (status);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  success INTEGER NOT NULL,
  actor_email TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON admin_audit_log (created_at);
