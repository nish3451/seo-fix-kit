CREATE TABLE IF NOT EXISTS repair_proposals (
  id TEXT PRIMARY KEY,
  fix_request_id TEXT,
  report_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  issue_id TEXT,
  issue_title TEXT,
  target_url TEXT,
  target_host TEXT,
  severity TEXT,
  source TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  execution_mode TEXT NOT NULL DEFAULT 'manual_task',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  delivery_status TEXT NOT NULL DEFAULT 'draft',
  generated_title TEXT,
  generated_summary TEXT,
  proof_json TEXT,
  proposal_json TEXT,
  acceptance_json TEXT,
  owner_note TEXT,
  admin_note TEXT,
  delivery_url TEXT,
  final_report_id TEXT,
  approved_at TEXT,
  approved_by_email TEXT,
  dismissed_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_proposals_owner_report
  ON repair_proposals(owner_email, report_id, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_proposals_fix_request_issue_unique
  ON repair_proposals(fix_request_id, issue_id)
  WHERE fix_request_id IS NOT NULL
    AND fix_request_id != ''
    AND issue_id IS NOT NULL
    AND issue_id != '';

CREATE INDEX IF NOT EXISTS idx_repair_proposals_fix_request
  ON repair_proposals(fix_request_id, approval_status, delivery_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_repair_proposals_final_report
  ON repair_proposals(final_report_id, delivery_status);

CREATE INDEX IF NOT EXISTS idx_repair_proposals_owner_status
  ON repair_proposals(owner_email, approval_status, delivery_status, updated_at);

CREATE TABLE IF NOT EXISTS repair_proposal_events (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  fix_request_id TEXT,
  event TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_email TEXT,
  from_status TEXT,
  to_status TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_proposal_events_proposal
  ON repair_proposal_events(proposal_id, created_at);

CREATE INDEX IF NOT EXISTS idx_repair_proposal_events_fix_request
  ON repair_proposal_events(fix_request_id, created_at);
