ALTER TABLE fix_requests ADD COLUMN checkout_session_id TEXT;
ALTER TABLE fix_requests ADD COLUMN checkout_url TEXT;
ALTER TABLE fix_requests ADD COLUMN checkout_created_at TEXT;
ALTER TABLE fix_requests ADD COLUMN product_id TEXT;
ALTER TABLE fix_requests ADD COLUMN payment_id TEXT;
ALTER TABLE fix_requests ADD COLUMN paid_at TEXT;

CREATE INDEX IF NOT EXISTS idx_fix_requests_checkout_session
  ON fix_requests (checkout_session_id);

CREATE INDEX IF NOT EXISTS idx_fix_requests_payment
  ON fix_requests (payment_id);

CREATE TABLE IF NOT EXISTS dodo_webhook_events (
  webhook_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payment_id TEXT,
  fix_request_id TEXT,
  status TEXT NOT NULL,
  error TEXT,
  payload_hash TEXT,
  payload_json TEXT,
  received_count INTEGER NOT NULL DEFAULT 1,
  first_received_at TEXT NOT NULL,
  last_received_at TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dodo_webhook_events_status
  ON dodo_webhook_events (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_dodo_webhook_events_fix_request
  ON dodo_webhook_events (fix_request_id);
