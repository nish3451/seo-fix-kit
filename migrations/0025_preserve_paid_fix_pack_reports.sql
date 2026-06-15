CREATE INDEX IF NOT EXISTS idx_fix_requests_report_status
  ON fix_requests(report_id, status);

CREATE INDEX IF NOT EXISTS idx_fix_requests_final_report_status
  ON fix_requests(final_report_id, status);

CREATE TABLE IF NOT EXISTS audit_report_blob_deletion_failures (
  blob_key TEXT PRIMARY KEY,
  report_id TEXT,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_report_blob_deletion_failures_status
  ON audit_report_blob_deletion_failures(status, updated_at);

UPDATE audit_reports
SET expires_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE expires_at IS NOT NULL
  AND id IN (
    SELECT report_id
    FROM fix_requests
    WHERE report_id IS NOT NULL
      AND report_id != ''
      AND status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
    UNION
    SELECT final_report_id
    FROM fix_requests
    WHERE final_report_id IS NOT NULL
      AND final_report_id != ''
      AND status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
  );

UPDATE audit_jobs
SET expires_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE expires_at IS NOT NULL
  AND report_id IN (
    SELECT report_id
    FROM fix_requests
    WHERE report_id IS NOT NULL
      AND report_id != ''
      AND status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
    UNION
    SELECT final_report_id
    FROM fix_requests
    WHERE final_report_id IS NOT NULL
      AND final_report_id != ''
      AND status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
  );
