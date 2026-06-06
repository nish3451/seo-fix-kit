CREATE TABLE IF NOT EXISTS audit_schedules (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  owner_session_hash TEXT,
  owner_invite_id TEXT,
  access_mode TEXT NOT NULL DEFAULT 'invite',
  target_url TEXT NOT NULL,
  target_host TEXT NOT NULL,
  max_pages INTEGER NOT NULL DEFAULT 10,
  interval_days INTEGER NOT NULL DEFAULT 7,
  status TEXT NOT NULL DEFAULT 'active',
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_job_id TEXT,
  last_report_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paused_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_schedules_owner_status
  ON audit_schedules(owner_email, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_audit_schedules_due
  ON audit_schedules(status, next_run_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_schedules_owner_target_active
  ON audit_schedules(owner_email, target_url)
  WHERE status = 'active';

ALTER TABLE audit_jobs ADD COLUMN schedule_id TEXT;
