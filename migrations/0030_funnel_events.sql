-- First-party activation funnel instrumentation for the public private-beta
-- funnel (backlog item "Add first-party activation instrumentation for the
-- private-beta funnel").
--
-- Privacy-safe by design: each row stores only an allow-listed event name, a
-- page path, and a timestamp. No email, company, IP address, user agent,
-- referrer, or URL query string is ever written here, so the summary surface
-- can never leak PII.
--
-- Events recorded:
--   page_view              - a public funnel page loaded
--   access_form_shown      - the homepage email access form was displayed
--   access_request_success - POST /api/access/request delivered an access link
--   access_request_failure - POST /api/access/request failed for a real visitor
--   cta_activation         - a public conversion CTA was clicked
--
-- Retention: rows older than 90 days are deleted by the scheduled cleanup
-- (worker/lib/db.js cleanupExpiredRows, FUNNEL_RETENTION_DAYS).

CREATE TABLE IF NOT EXISTS funnel_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  page_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_event_name_created_at
  ON funnel_events (event_name, created_at);

CREATE INDEX IF NOT EXISTS idx_funnel_events_created_at
  ON funnel_events (created_at);
