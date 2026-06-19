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
import { repairTableAll } from "../lib/repair-tables.js";
import { agencyWorkspaceAccessForOwner, monitoringAccessForOwner, offerCatalogForOwner } from "../lib/offers.js";
import {
  auditJobResponse,
  auditScheduleResponse,
  billingFixRequestResponse,
  siteClaimResponse
} from "../lib/serializers.js";
import { reportJsonForRow } from "../lib/report-data.js";
import { deriveRepairQueueItems } from "../../shared/repair-queue.js";
import { repairAccountSummaryFromItems } from "../../shared/account-repair-summary.js";

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
      .all(),
  ]);
  const reportRows = reports.results || [];
  const [repairQueueRows, repairActionRows] = await Promise.all([
    accountRepairQueueRowsForReports(env, access, reportRows),
    accountRepairActionRowsForReports(env, access, reportRows)
  ]);
  const fallbackReports = await accountFallbackRepairReports(
    env,
    access,
    reportRows,
    repairQueueRows.results || [],
    auditSchedules.results || []
  );
  const fallbackReportById = new Map(await Promise.all(
    fallbackReports.map(async (row) => [row.id, parseJson(await reportJsonForRow(env, row), {})])
  ));

  const reportContexts = reportRows.map((row) => {
    const summary = parseJson(row.summary_json, {});
    const report = fallbackReportById.get(row.id) || {};
    const response = {
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
    return { row, report, response };
  });
  const recentReports = reportContexts.map((context) => context.response);
  const requests = (fixRequests.results || []).map((row) => billingFixRequestResponse(row));
  const recentAuditJobs = (auditJobs.results || []).map(auditJobResponse);
  const sites = (siteClaims.results || []).map(siteClaimResponse);
  const schedules = (auditSchedules.results || []).map(auditScheduleResponse);
  const verifiedSites = sites.filter((site) => site.status === "verified").length;
  const repairAgentUnavailable = Boolean(repairQueueRows.repairTablesMissing || repairActionRows.repairTablesMissing);
  const repairAgent = {
    ...accountRepairAgentSummary(
      reportContexts,
      repairQueueRows.results || [],
      repairActionRows.results || [],
      schedules
    ),
    unavailable: repairAgentUnavailable
  };
  const offers = await offerCatalogForOwner(env, access.ownerEmail);
  const monitoring = await monitoringAccessForOwner(env, access.ownerEmail, schedules.length);
  const agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail);

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
      monitors: schedules.length,
      monitorLimit: monitoring.limit,
      repairItems: repairAgent.counts.total,
      openRepairs: repairAgent.counts.active,
      draftedActions: repairAgent.counts.awaitingApproval,
      approvedActions: repairAgent.counts.approvedActions,
      appliedRepairs: repairAgent.counts.appliedAwaitingRerun,
      regressedRepairs: repairAgent.counts.regressed + repairAgent.counts.monitorRegressions
    },
    recentReports,
    recentAuditJobs,
    sites,
    schedules,
    fixRequests: requests,
    repairAgent,
    offers,
    monitoring,
    agencyWorkspace,
    nextActions: accountNextActions(recentReports, requests, sites, recentAuditJobs, repairAgent)
  });
}

async function accountRepairQueueRowsForReports(env, access, reports = []) {
  const reportIds = accountReportIds(reports);
  if (!reportIds.length) return { results: [] };
  const placeholders = reportIds.map(() => "?").join(", ");
  return repairTableAll(env.WAITLIST_DB.prepare(
    `SELECT *
     FROM repair_queue_items
     WHERE owner_email = ?
       AND report_id IN (${placeholders})
     ORDER BY updated_at DESC`
  )
    .bind(access.ownerEmail, ...reportIds)
  );
}

async function accountRepairActionRowsForReports(env, access, reports = []) {
  const reportIds = accountReportIds(reports);
  if (!reportIds.length) return { results: [] };
  const placeholders = reportIds.map(() => "?").join(", ");
  return repairTableAll(env.WAITLIST_DB.prepare(
    `SELECT *
     FROM repair_agent_actions
     WHERE owner_email = ?
       AND report_id IN (${placeholders})
     ORDER BY updated_at DESC`
  )
    .bind(access.ownerEmail, ...reportIds)
  );
}

function accountReportIds(reports = []) {
  return [...new Set((reports || []).map((row) => row.id).filter(Boolean))];
}

async function accountFallbackRepairReports(env, access, reports = [], queueRows = [], schedules = []) {
  if (!reports.length) return [];
  const monitoredIds = new Set(
    (schedules || [])
      .filter((schedule) => schedule.status === "active")
      .map((schedule) => schedule.last_report_id || schedule.lastReportId)
      .filter(Boolean)
  );
  const queuedReportIds = new Set((queueRows || []).map((row) => row.report_id || row.reportId).filter(Boolean));
  const ids = reports
    .filter((row, index) => (!queuedReportIds.has(row.id) && index < 3) || monitoredIds.has(row.id))
    .map((row) => row.id)
    .filter(Boolean);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id, report_json
     FROM audit_reports
     WHERE owner_email = ?
       AND id IN (${placeholders})`
  )
    .bind(access.ownerEmail, ...ids)
    .all();
  return rows.results || [];
}

function accountNextActions(reports, requests, sites = [], jobs = [], repairAgent = {}) {
  if (jobs.some((job) => ["queued", "running"].includes(job.status))) {
    return [{ id: "audit-running", label: "Audit running", detail: "The report will appear as soon as rendering and proof collection finish." }];
  }
  if (!reports.length) {
    if (!sites.some((site) => site.status === "verified")) {
      return [{ id: "verify-site", label: "Verify your site", detail: "Add a DNS TXT record or HTTPS file before self-serve audits run." }];
    }
    return [{ id: "run-audit", label: "Run your first audit", detail: "Start with your homepage or highest-value product page." }];
  }
  const nextRepair = repairAgent.nextItems?.[0];
  if (repairAgent.unavailable && nextRepair) {
    return [{
      id: "repair-queue-unavailable",
      label: "Repair queue unavailable",
      detail: "Repair actions are temporarily unavailable while repair storage is being updated."
    }];
  }
  if (nextRepair) {
    return [{
      id: nextRepair.nextActionId,
      label: nextRepair.nextActionLabel,
      detail: nextRepair.nextActionDetail,
      href: nextRepair.reportPath
    }];
  }
  if (!sites.some((site) => site.status === "verified")) {
    return [{ id: "verify-site", label: "Verify your site", detail: "Add a DNS TXT record or HTTPS file before self-serve audits run." }];
  }
  if (reports.some((report) => Number(report.totalFindings || 0) > 0) && !requests.length) {
    return [{ id: "review-fixes", label: "Review proven fixes", detail: "Open a report and start a Fix Pack only when the findings are real." }];
  }
  if (requests.some((request) => ["paid", "in_progress"].includes(request.status))) {
    return [{ id: "watch-delivery", label: "Watch delivery status", detail: "Your billing page shows due dates, notes, delivery links, and rerun proof." }];
  }
  return [{ id: "rerun-later", label: "Keep the report handy", detail: "Rerun after meaningful content, template, or metadata changes." }];
}

function accountRepairAgentSummary(reportContexts = [], queueRows = [], actionRows = [], schedules = []) {
  const reportIds = new Set(reportContexts.map((context) => context.response.id));
  const queueRowsByReport = groupRowsByReport(queueRows.filter((row) => reportIds.has(row.report_id)));
  const actionRowsByReport = groupRowsByReport(actionRows.filter((row) => reportIds.has(row.report_id)));
  const contexts = reportContexts.map((context) => {
    const reportId = context.response.id;
    const report = {
      ...context.report,
      id: reportId,
      url: context.row.url || context.report.url || "",
      reportPath: context.response.reportPath
    };
    return {
      report,
      response: context.response,
      items: deriveRepairQueueItems(
        report,
        queueRowsByReport.get(reportId) || [],
        actionRowsByReport.get(reportId) || []
      )
    };
  });
  return repairAccountSummaryFromItems(contexts, schedules);
}

function groupRowsByReport(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const reportId = row.report_id || row.reportId || "";
    if (!reportId) continue;
    grouped.set(reportId, [...(grouped.get(reportId) || []), row]);
  }
  return grouped;
}

export { getAccountSummary };
