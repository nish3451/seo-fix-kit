-- Unattached repair proposals (fix_request_id = '') are seeded on saved-report
-- view; without a uniqueness guarantee two concurrent first views can insert
-- the same issue twice because the 0026 partial index excludes '' rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_proposals_report_owner_issue_unattached
  ON repair_proposals(report_id, owner_email, issue_id)
  WHERE COALESCE(fix_request_id, '') = '';
