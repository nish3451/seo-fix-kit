CREATE TABLE IF NOT EXISTS audit_usage (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_usage_updated_at
  ON audit_usage (updated_at);
