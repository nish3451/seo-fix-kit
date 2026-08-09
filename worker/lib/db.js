import { deleteReportRowsWithBlobs } from "./report-data.js";
import { isoSecondsFromNow } from "./text.js";
import { FUNNEL_RETENTION_DAYS } from "../routes/funnel.js";

async function runD1BatchChunks(env, statements = [], chunkSize = 100) {
  for (let index = 0; index < statements.length; index += chunkSize) {
    const chunk = statements.slice(index, index + chunkSize);
    if (chunk.length) await env.WAITLIST_DB.batch(chunk);
  }
}

async function countRows(env, table, where = "", bindings = []) {
  const sql = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  const statement = env.WAITLIST_DB.prepare(sql);
  const row = bindings.length ? await statement.bind(...bindings).first() : await statement.first();
  return Number(row?.count || 0);
}

async function cleanupExpiredRows(env) {
  const now = new Date().toISOString();
  const expiredReports = await env.WAITLIST_DB.prepare(
    `SELECT id, report_json FROM audit_reports
     WHERE expires_at IS NOT NULL AND expires_at < ?
       AND id NOT IN (
         SELECT report_id FROM fix_requests
         WHERE report_id IS NOT NULL AND report_id != ''
           AND status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
         UNION
         SELECT final_report_id FROM fix_requests
         WHERE final_report_id IS NOT NULL AND final_report_id != ''
           AND status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
       )
     LIMIT 200`
  )
    .bind(now)
    .all();
  await deleteReportRowsWithBlobs(env, expiredReports.results || []);
  await env.WAITLIST_DB.batch([
    env.WAITLIST_DB.prepare(
      `DELETE FROM audit_jobs
       WHERE expires_at IS NOT NULL
         AND expires_at < ?
         AND NOT EXISTS (
           SELECT 1
           FROM fix_requests
           WHERE status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
             AND (report_id = audit_jobs.report_id OR final_report_id = audit_jobs.report_id)
         )`
    ).bind(now),
    env.WAITLIST_DB.prepare(`DELETE FROM access_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)`).bind(now, isoSecondsFromNow(-24 * 60 * 60)),
    env.WAITLIST_DB.prepare(`DELETE FROM beta_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).bind(now, isoSecondsFromNow(-24 * 60 * 60)),
    env.WAITLIST_DB.prepare(`DELETE FROM admin_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).bind(now, isoSecondsFromNow(-24 * 60 * 60)),
    env.WAITLIST_DB.prepare(`DELETE FROM funnel_events WHERE created_at < ?`).bind(isoSecondsFromNow(-FUNNEL_RETENTION_DAYS * 24 * 60 * 60)),
    env.WAITLIST_DB.prepare(`DELETE FROM audit_usage WHERE updated_at < ?`).bind(isoSecondsFromNow(-7 * 24 * 60 * 60))
  ]);
}

export {
  cleanupExpiredRows,
  countRows,
  runD1BatchChunks
};
