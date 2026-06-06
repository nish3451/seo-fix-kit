CREATE TABLE IF NOT EXISTS large_crawl_jobs (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  owner_session_hash TEXT,
  owner_invite_id TEXT,
  access_mode TEXT NOT NULL DEFAULT 'self-serve',
  target_url TEXT NOT NULL,
  target_host TEXT NOT NULL,
  incremental_mode INTEGER NOT NULL DEFAULT 0,
  previous_crawl_job_id TEXT,
  crawl_fingerprint TEXT,
  target_pages INTEGER NOT NULL DEFAULT 50000,
  batch_size INTEGER NOT NULL DEFAULT 1000,
  max_concurrency INTEGER NOT NULL DEFAULT 4,
  crawl_delay_ms INTEGER NOT NULL DEFAULT 250,
  max_retries INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'queued',
  frontier_url_count INTEGER NOT NULL DEFAULT 0,
  frontier_stored_count INTEGER NOT NULL DEFAULT 0,
  frontier_ingestion_status TEXT NOT NULL DEFAULT 'pending',
  rendered_url_count INTEGER NOT NULL DEFAULT 0,
  failed_url_count INTEGER NOT NULL DEFAULT 0,
  completed_batch_count INTEGER NOT NULL DEFAULT 0,
  total_batch_count INTEGER NOT NULL DEFAULT 0,
  inventory_status TEXT,
  inventory_summary_json TEXT NOT NULL DEFAULT '{}',
  merge_status TEXT NOT NULL DEFAULT 'blocked',
  report_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_large_crawl_jobs_owner_status ON large_crawl_jobs(owner_email, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_large_crawl_jobs_target ON large_crawl_jobs(owner_email, target_host, status, created_at);
CREATE INDEX IF NOT EXISTS idx_large_crawl_jobs_expires ON large_crawl_jobs(expires_at);

CREATE TABLE IF NOT EXISTS large_crawl_batches (
  id TEXT PRIMARY KEY,
  crawl_job_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  start_index INTEGER NOT NULL,
  end_index INTEGER NOT NULL,
  planned_url_count INTEGER NOT NULL DEFAULT 0,
  rendered_url_count INTEGER NOT NULL DEFAULT 0,
  failed_url_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  retry_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  leased_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (crawl_job_id) REFERENCES large_crawl_jobs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_large_crawl_batches_job_index ON large_crawl_batches(crawl_job_id, batch_index);
CREATE INDEX IF NOT EXISTS idx_large_crawl_batches_status ON large_crawl_batches(crawl_job_id, status, batch_index);

CREATE TABLE IF NOT EXISTS large_crawl_frontier (
  id TEXT PRIMARY KEY,
  crawl_job_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  discovered_from TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (crawl_job_id) REFERENCES large_crawl_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES large_crawl_batches(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_large_crawl_frontier_job_url ON large_crawl_frontier(crawl_job_id, normalized_url);
CREATE INDEX IF NOT EXISTS idx_large_crawl_frontier_batch_status ON large_crawl_frontier(batch_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_large_crawl_frontier_job_status ON large_crawl_frontier(crawl_job_id, status, priority);

CREATE TABLE IF NOT EXISTS large_crawl_url_proofs (
  id TEXT PRIMARY KEY,
  crawl_job_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  frontier_id TEXT NOT NULL,
  url TEXT NOT NULL,
  final_url TEXT,
  status_code INTEGER NOT NULL DEFAULT 0,
  content_type TEXT,
  title TEXT,
  description TEXT,
  h1s_json TEXT NOT NULL DEFAULT '[]',
  canonical TEXT,
  robots TEXT,
  internal_links_count INTEGER NOT NULL DEFAULT 0,
  external_links_count INTEGER NOT NULL DEFAULT 0,
  schema_types_json TEXT NOT NULL DEFAULT '[]',
  resource_timing_json TEXT NOT NULL DEFAULT '{}',
  issue_facts_json TEXT NOT NULL DEFAULT '{}',
  rendered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (crawl_job_id) REFERENCES large_crawl_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES large_crawl_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (frontier_id) REFERENCES large_crawl_frontier(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_large_crawl_url_proofs_frontier ON large_crawl_url_proofs(frontier_id);
CREATE INDEX IF NOT EXISTS idx_large_crawl_url_proofs_job ON large_crawl_url_proofs(crawl_job_id, rendered_at);

CREATE TABLE IF NOT EXISTS large_crawl_dead_letters (
  id TEXT PRIMARY KEY,
  crawl_job_id TEXT NOT NULL,
  batch_id TEXT,
  frontier_id TEXT,
  url TEXT,
  error TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (crawl_job_id) REFERENCES large_crawl_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_large_crawl_dead_letters_job ON large_crawl_dead_letters(crawl_job_id, status, created_at);

CREATE TABLE IF NOT EXISTS large_crawl_worker_heartbeats (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  crawl_job_id TEXT,
  batch_id TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  browser_runtime TEXT,
  concurrency INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_large_crawl_worker_heartbeats_seen ON large_crawl_worker_heartbeats(last_seen_at);

CREATE TABLE IF NOT EXISTS large_crawl_events (
  id TEXT PRIMARY KEY,
  crawl_job_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (crawl_job_id) REFERENCES large_crawl_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_large_crawl_events_job ON large_crawl_events(crawl_job_id, created_at);
