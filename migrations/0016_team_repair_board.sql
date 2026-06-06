CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  member_email TEXT NOT NULL,
  member_name TEXT,
  role TEXT NOT NULL DEFAULT 'editor',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_owner_member_active
  ON team_members(owner_email, member_email)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_team_members_owner_status
  ON team_members(owner_email, status, updated_at);

CREATE TABLE IF NOT EXISTS issue_collaboration (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  assignee_email TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_email TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_collaboration_report_issue
  ON issue_collaboration(report_id, issue_id);

CREATE INDEX IF NOT EXISTS idx_issue_collaboration_owner_status
  ON issue_collaboration(owner_email, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_issue_collaboration_assignee
  ON issue_collaboration(owner_email, assignee_email, status);
