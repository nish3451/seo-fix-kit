CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  label TEXT,
  scopes_json TEXT NOT NULL DEFAULT '["audits:read","audits:write","projects:read","projects:write"]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_owner_status
  ON api_tokens(owner_email, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_api_tokens_hash
  ON api_tokens(token_hash);

CREATE TABLE IF NOT EXISTS api_webhooks (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  url TEXT NOT NULL,
  events_json TEXT NOT NULL DEFAULT '["audit.completed","audit.failed"]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_delivery_at TEXT,
  last_delivery_status TEXT,
  last_error TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_webhooks_owner_status
  ON api_webhooks(owner_email, status, updated_at);

CREATE TABLE IF NOT EXISTS api_webhook_events (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  audit_job_id TEXT,
  report_id TEXT,
  status TEXT NOT NULL,
  http_status INTEGER,
  error TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_webhook_events_webhook
  ON api_webhook_events(webhook_id, created_at);

CREATE INDEX IF NOT EXISTS idx_api_webhook_events_owner
  ON api_webhook_events(owner_email, created_at);
