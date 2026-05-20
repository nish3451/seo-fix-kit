CREATE TABLE IF NOT EXISTS audit_reports (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  origin TEXT,
  score INTEGER,
  summary_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_created_at
  ON audit_reports (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_reports_origin
  ON audit_reports (origin);
