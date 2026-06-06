CREATE TABLE IF NOT EXISTS backlink_import_batches (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  target_host TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'import',
  row_count INTEGER NOT NULL DEFAULT 0,
  live_count INTEGER NOT NULL DEFAULT 0,
  lost_count INTEGER NOT NULL DEFAULT 0,
  risky_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backlink_import_batches_owner_host ON backlink_import_batches(owner_email, target_host, imported_at);

CREATE TABLE IF NOT EXISTS backlink_edges (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  target_host TEXT NOT NULL,
  import_batch_id TEXT,
  source_url TEXT NOT NULL,
  source_host TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  rel TEXT,
  first_seen TEXT,
  last_seen TEXT,
  status TEXT NOT NULL DEFAULT 'imported',
  source_status INTEGER NOT NULL DEFAULT 0,
  target_status INTEGER NOT NULL DEFAULT 0,
  live INTEGER NOT NULL DEFAULT 0,
  risky_signals_json TEXT NOT NULL DEFAULT '[]',
  proof_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (import_batch_id) REFERENCES backlink_import_batches(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_backlink_edges_unique ON backlink_edges(owner_email, source_url, target_url, anchor_text);
CREATE INDEX IF NOT EXISTS idx_backlink_edges_target ON backlink_edges(owner_email, target_host, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_backlink_edges_source ON backlink_edges(source_host, updated_at);

CREATE TABLE IF NOT EXISTS keyword_import_batches (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  target_host TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'gsc-import',
  row_count INTEGER NOT NULL DEFAULT 0,
  query_count INTEGER NOT NULL DEFAULT 0,
  landing_page_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_keyword_import_batches_owner_host ON keyword_import_batches(owner_email, target_host, imported_at);

CREATE TABLE IF NOT EXISTS keyword_rank_observations (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  target_host TEXT NOT NULL,
  import_batch_id TEXT,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  page_url TEXT,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  previous_clicks REAL NOT NULL DEFAULT 0,
  previous_impressions REAL NOT NULL DEFAULT 0,
  previous_ctr REAL NOT NULL DEFAULT 0,
  previous_position REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'import',
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (import_batch_id) REFERENCES keyword_import_batches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_keyword_rank_observations_query ON keyword_rank_observations(owner_email, target_host, normalized_query, observed_at);
CREATE INDEX IF NOT EXISTS idx_keyword_rank_observations_page ON keyword_rank_observations(owner_email, target_host, page_url, observed_at);

CREATE TABLE IF NOT EXISTS keyword_volume_observations (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  target_host TEXT NOT NULL,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  country TEXT,
  language TEXT,
  monthly_volume INTEGER,
  cpc_micro INTEGER,
  competition TEXT,
  source TEXT NOT NULL DEFAULT 'import',
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_keyword_volume_observations_query ON keyword_volume_observations(owner_email, target_host, normalized_query, observed_at);
