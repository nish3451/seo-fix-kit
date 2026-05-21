CREATE TABLE IF NOT EXISTS site_claims (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  host TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verification_method TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  last_checked_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_site_claims_owner_email
  ON site_claims (owner_email, updated_at);

CREATE INDEX IF NOT EXISTS idx_site_claims_owner_host
  ON site_claims (owner_email, host);

CREATE INDEX IF NOT EXISTS idx_site_claims_status
  ON site_claims (status, updated_at);
