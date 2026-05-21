ALTER TABLE fix_requests ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fix_requests ADD COLUMN due_at TEXT;
ALTER TABLE fix_requests ADD COLUMN next_update_at TEXT;
ALTER TABLE fix_requests ADD COLUMN status_reason TEXT;
ALTER TABLE fix_requests ADD COLUMN payment_amount INTEGER;
ALTER TABLE fix_requests ADD COLUMN payment_currency TEXT;
ALTER TABLE fix_requests ADD COLUMN payment_customer_email TEXT;
ALTER TABLE fix_requests ADD COLUMN dodo_business_id TEXT;
ALTER TABLE fix_requests ADD COLUMN dodo_brand_id TEXT;
ALTER TABLE fix_requests ADD COLUMN refund_id TEXT;
ALTER TABLE fix_requests ADD COLUMN refund_amount INTEGER;
ALTER TABLE fix_requests ADD COLUMN refund_currency TEXT;
ALTER TABLE fix_requests ADD COLUMN refunded_at TEXT;
ALTER TABLE fix_requests ADD COLUMN dispute_event TEXT;
ALTER TABLE fix_requests ADD COLUMN disputed_at TEXT;
ALTER TABLE fix_requests ADD COLUMN delivery_notified_at TEXT;
ALTER TABLE fix_requests ADD COLUMN delivery_notification_error TEXT;
ALTER TABLE fix_requests ADD COLUMN before_after_summary_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fix_requests_report_owner_unique
  ON fix_requests (report_id, owner_email);

CREATE INDEX IF NOT EXISTS idx_fix_requests_is_test_status
  ON fix_requests (is_test, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_fix_requests_due_at
  ON fix_requests (due_at);

CREATE INDEX IF NOT EXISTS idx_fix_requests_refund_id
  ON fix_requests (refund_id);

CREATE TABLE IF NOT EXISTS fix_request_events (
  id TEXT PRIMARY KEY,
  fix_request_id TEXT NOT NULL,
  event TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_email TEXT,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fix_request_events_request
  ON fix_request_events (fix_request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_fix_request_events_event
  ON fix_request_events (event, created_at);

CREATE INDEX IF NOT EXISTS idx_dodo_webhook_events_payment
  ON dodo_webhook_events (payment_id, event_type, updated_at);

CREATE TABLE IF NOT EXISTS ops_digest_runs (
  digest_key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  summary_json TEXT,
  sent_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  actor_email TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
  ON admin_sessions (expires_at);
