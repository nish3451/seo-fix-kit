import {
  json,
  jsonNoStore
} from "../lib/http.js";
import {
  parseJson,
  safeHostname
} from "../lib/text.js";
import {
  betaAccessResponse,
  betaAccessStatus
} from "../lib/auth.js";
import {
  auditJobResponse,
  auditScheduleResponse,
  billingFixRequestResponse,
  siteClaimResponse
} from "../lib/serializers.js";

async function getAccountSummary(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Account storage is not configured." }, 503);

  const [reports, fixRequests, auditJobs, siteClaims, auditSchedules] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT id, url, target_host, score, summary_json, created_at, expires_at
       FROM audit_reports
       WHERE owner_email = ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail, new Date().toISOString())
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM fix_requests
       WHERE owner_email = ?
         AND is_test = 0
       ORDER BY updated_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM audit_jobs
       WHERE owner_email = ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY updated_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail, new Date().toISOString())
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM site_claims
       WHERE owner_email = ?
         AND revoked_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM audit_schedules
       WHERE owner_email = ?
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all()
  ]);

  const recentReports = (reports.results || []).map((row) => {
    const summary = parseJson(row.summary_json, {});
    return {
      id: row.id,
      url: row.url,
      targetHost: row.target_host || safeHostname(row.url),
      score: row.score,
      pagesScanned: summary.pagesScanned || 0,
      totalFindings: summary.totalFindings || 0,
      guardedFalsePositives: summary.guardedFalsePositives || 0,
      reportPath: `/beta/reports/${row.id}`,
      createdAt: row.created_at,
      expiresAt: row.expires_at || ""
    };
  });
  const requests = (fixRequests.results || []).map((row) => billingFixRequestResponse(row));
  const recentAuditJobs = (auditJobs.results || []).map(auditJobResponse);
  const sites = (siteClaims.results || []).map(siteClaimResponse);
  const schedules = (auditSchedules.results || []).map(auditScheduleResponse);
  const verifiedSites = sites.filter((site) => site.status === "verified").length;

  return jsonNoStore({
    ok: true,
    owner: {
      email: access.ownerEmail,
      accessMode: access.accessMode
    },
    metrics: {
      reports: recentReports.length,
      fixRequests: requests.length,
      openFixRequests: requests.filter((request) => !["delivered", "refunded"].includes(request.status)).length,
      runningAudits: recentAuditJobs.filter((job) => ["queued", "running"].includes(job.status)).length,
      verifiedSites,
      monitors: schedules.length
    },
    recentReports,
    recentAuditJobs,
    sites,
    schedules,
    fixRequests: requests,
    nextActions: accountNextActions(recentReports, requests, sites, recentAuditJobs)
  });
}

function accountNextActions(reports, requests, sites = [], jobs = []) {
  if (!sites.some((site) => site.status === "verified")) {
    return [{ id: "verify-site", label: "Verify your site", detail: "Add a DNS TXT record or HTTPS file before self-serve audits run." }];
  }
  if (jobs.some((job) => ["queued", "running"].includes(job.status))) {
    return [{ id: "audit-running", label: "Audit running", detail: "The report will appear as soon as rendering and proof collection finish." }];
  }
  if (!reports.length) {
    return [{ id: "run-audit", label: "Run your first audit", detail: "Start with your homepage or highest-value product page." }];
  }
  if (reports.some((report) => Number(report.totalFindings || 0) > 0) && !requests.length) {
    return [{ id: "review-fixes", label: "Review proven fixes", detail: "Open a report and start a Fix Pack only when the findings are real." }];
  }
  if (requests.some((request) => ["paid", "in_progress"].includes(request.status))) {
    return [{ id: "watch-delivery", label: "Watch delivery status", detail: "Your billing page shows due dates, notes, delivery links, and rerun proof." }];
  }
  return [{ id: "rerun-later", label: "Keep the report handy", detail: "Rerun after meaningful content, template, or metadata changes." }];
}

export { getAccountSummary };
