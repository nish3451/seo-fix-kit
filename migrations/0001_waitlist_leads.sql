CREATE TABLE IF NOT EXISTS waitlist_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'locked-homepage',
  referrer TEXT,
  user_agent TEXT,
  country TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_waitlist_leads_created_at
  ON waitlist_leads (created_at);
