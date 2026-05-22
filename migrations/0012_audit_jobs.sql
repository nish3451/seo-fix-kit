CREATE TABLE IF NOT EXISTS audit_jobs (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  owner_session_hash TEXT,
  owner_invite_id TEXT,
  access_mode TEXT NOT NULL DEFAULT 'invite',
  target_url TEXT NOT NULL,
  target_host TEXT NOT NULL,
  max_pages INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'queued',
  report_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_jobs_owner_status ON audit_jobs(owner_email, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_expires ON audit_jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_created ON audit_jobs(created_at);
