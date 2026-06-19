CREATE TABLE IF NOT EXISTS offer_entitlements (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  offer_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  source TEXT NOT NULL DEFAULT 'manual',
  provider TEXT,
  product_id TEXT,
  subscription_id TEXT,
  limits_json TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_entitlements_owner_offer_active
  ON offer_entitlements(owner_email, offer_key)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_offer_entitlements_owner_status
  ON offer_entitlements(owner_email, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_offer_entitlements_provider_subscription
  ON offer_entitlements(provider, subscription_id);

CREATE TABLE IF NOT EXISTS offer_entitlement_events (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT,
  owner_email TEXT NOT NULL,
  offer_key TEXT NOT NULL,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offer_entitlement_events_owner
  ON offer_entitlement_events(owner_email, offer_key, created_at);
