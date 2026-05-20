ALTER TABLE fix_requests ADD COLUMN assigned_to TEXT;
ALTER TABLE fix_requests ADD COLUMN admin_note TEXT;
ALTER TABLE fix_requests ADD COLUMN customer_note TEXT;
ALTER TABLE fix_requests ADD COLUMN delivery_url TEXT;
ALTER TABLE fix_requests ADD COLUMN final_report_id TEXT;
ALTER TABLE fix_requests ADD COLUMN in_progress_at TEXT;
ALTER TABLE fix_requests ADD COLUMN delivered_at TEXT;
ALTER TABLE fix_requests ADD COLUMN last_notification_at TEXT;
ALTER TABLE fix_requests ADD COLUMN notification_error TEXT;

CREATE INDEX IF NOT EXISTS idx_fix_requests_paid_at
  ON fix_requests (paid_at);

CREATE INDEX IF NOT EXISTS idx_fix_requests_delivered_at
  ON fix_requests (delivered_at);

CREATE TABLE IF NOT EXISTS fix_request_notifications (
  id TEXT PRIMARY KEY,
  fix_request_id TEXT NOT NULL,
  event TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_email TEXT,
  status TEXT NOT NULL,
  provider TEXT,
  provider_message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fix_request_notifications_request
  ON fix_request_notifications (fix_request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_fix_request_notifications_status
  ON fix_request_notifications (status, created_at);
