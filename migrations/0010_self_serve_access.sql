ALTER TABLE beta_sessions ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'founder-override';

UPDATE beta_sessions
SET access_mode = CASE
  WHEN invite_id IS NOT NULL AND invite_id != '' THEN 'invite'
  ELSE 'founder-override'
END
WHERE access_mode IS NULL OR access_mode = 'founder-override';

CREATE TABLE IF NOT EXISTS access_tokens (
  token_hash TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'self_serve_access',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_tokens_owner_email
  ON access_tokens (owner_email, created_at);

CREATE INDEX IF NOT EXISTS idx_access_tokens_expires_at
  ON access_tokens (expires_at);
