CREATE TABLE IF NOT EXISTS report_branding (
  owner_email TEXT PRIMARY KEY,
  agency_name TEXT NOT NULL,
  logo_url TEXT,
  brand_color TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  custom_domain TEXT,
  footer_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_share_links (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  client_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT,
  password_hint TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_viewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_share_links_owner_status
  ON report_share_links(owner_email, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_report_share_links_report
  ON report_share_links(report_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_report_share_links_expires
  ON report_share_links(status, expires_at);
