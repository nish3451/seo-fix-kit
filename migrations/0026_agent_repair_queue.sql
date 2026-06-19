CREATE TABLE IF NOT EXISTS repair_queue_items (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'notice',
  page_url TEXT,
  page_label TEXT,
  proof TEXT,
  fix TEXT,
  snippet TEXT,
  acceptance TEXT,
  confidence TEXT,
  source TEXT,
  source_kind TEXT NOT NULL DEFAULT 'finding',
  estimated_effort TEXT,
  work_type TEXT,
  action_mode TEXT NOT NULL DEFAULT 'self_serve',
  status TEXT NOT NULL DEFAULT 'open',
  rerun_status TEXT NOT NULL DEFAULT 'not_run',
  last_rerun_report_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_email TEXT,
  FOREIGN KEY (report_id) REFERENCES audit_reports(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_queue_report_issue
  ON repair_queue_items(report_id, issue_id);

CREATE INDEX IF NOT EXISTS idx_repair_queue_owner_status
  ON repair_queue_items(owner_email, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_repair_queue_owner_report
  ON repair_queue_items(owner_email, report_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_repair_queue_last_rerun_report
  ON repair_queue_items(last_rerun_report_id);

CREATE TABLE IF NOT EXISTS repair_agent_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  queue_item_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  action_mode TEXT NOT NULL DEFAULT 'self_serve',
  action_type TEXT NOT NULL DEFAULT 'draft_fix',
  approval_state TEXT NOT NULL DEFAULT 'drafted',
  execution_state TEXT NOT NULL DEFAULT 'not_started',
  rerun_state TEXT NOT NULL DEFAULT 'not_run',
  source_proof TEXT,
  proposed_change TEXT,
  acceptance TEXT,
  rerun_report_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  applied_at TEXT,
  updated_by_email TEXT,
  FOREIGN KEY (report_id) REFERENCES audit_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (queue_item_id) REFERENCES repair_queue_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repair_actions_owner_report
  ON repair_agent_actions(owner_email, report_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_repair_actions_report
  ON repair_agent_actions(report_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_repair_actions_queue_item
  ON repair_agent_actions(queue_item_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_repair_actions_owner_state
  ON repair_agent_actions(owner_email, approval_state, execution_state, updated_at);

CREATE INDEX IF NOT EXISTS idx_repair_actions_rerun_report
  ON repair_agent_actions(rerun_report_id);

CREATE INDEX IF NOT EXISTS idx_audit_jobs_report_id
  ON audit_jobs(report_id);
