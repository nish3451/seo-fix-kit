CREATE TABLE IF NOT EXISTS report_domains (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  domain TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_domains_domain_active
  ON report_domains(domain)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_domains_owner_status
  ON report_domains(owner_email, status, updated_at);
