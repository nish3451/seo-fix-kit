import { appendReportDeltaBrief, buildReportDelta } from "../../shared/report-delta.js";
import { isRepairTablesMissingError } from "./repair-tables.js";
import { cleanText, isSafeReportId, isoDaysFromNow, parseJson } from "./text.js";

const REPORT_RETENTION_DAYS = 30;

async function ownerReportRow(env, reportId, access) {
  if (!isSafeReportId(reportId)) return null;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, report_json, owner_email, owner_invite_id, expires_at, url, target_host, created_at, updated_at
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(reportId)
    .first();
  if (!row?.report_json) return null;
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    const preserved = await preserveProtectedFixRequestReport(env, reportId);
    if (!preserved) return null;
    row.expires_at = null;
  }
  if (row.owner_email && row.owner_email !== access.ownerEmail) return null;
  if (
    row.owner_invite_id &&
    access.accessMode !== "founder-override" &&
    row.owner_invite_id !== access.inviteId
  ) {
    return null;
  }
  const hydrated = await hydrateReportRow(env, row);
  return hydrated?.report_json ? hydrated : null;
}

const PRESERVED_FIX_REQUEST_STATUSES = ["paid", "in_progress", "delivered", "refunded", "refund_failed", "disputed"];
const PRESERVED_REPAIR_PROPOSAL_APPROVAL_STATUSES = ["approved"];
const PRESERVED_REPAIR_PROPOSAL_DELIVERY_STATUSES = ["in_progress", "delivered"];

async function preserveFixRequestReports(env, fixRequest) {
  const ids = [fixRequest?.report_id, fixRequest?.final_report_id]
    .map((value) => String(value || ""))
    .filter((value) => isSafeReportId(value));
  const proposalIds = await repairProposalReportIdsForFixRequest(env, fixRequest?.id);
  await preserveReportIds(env, [...ids, ...proposalIds]);
}

async function repairProposalReportIdsForFixRequest(env, fixRequestId) {
  if (!env.WAITLIST_DB || !fixRequestId) return [];
  try {
    const rows = await env.WAITLIST_DB.prepare(
      `SELECT report_id, final_report_id
       FROM repair_proposals
       WHERE fix_request_id = ?`
    )
      .bind(fixRequestId)
      .all();
    return (rows.results || [])
      .flatMap((row) => [row.report_id, row.final_report_id])
      .map((value) => String(value || ""))
      .filter((value) => isSafeReportId(value));
  } catch {
    return [];
  }
}

async function preserveReportIds(env, reportIds = []) {
  const ids = [...new Set(reportIds.map((value) => String(value || "")).filter((value) => isSafeReportId(value)))];
  if (!ids.length) return { reportChanges: 0, jobChanges: 0 };
  const placeholders = ids.map(() => "?").join(", ");
  const now = new Date().toISOString();
  const reports = await env.WAITLIST_DB.prepare(
    `UPDATE audit_reports SET expires_at = NULL, updated_at = ? WHERE id IN (${placeholders})`
  )
    .bind(now, ...ids)
    .run();
  const jobs = await env.WAITLIST_DB.prepare(
    `UPDATE audit_jobs SET expires_at = NULL, updated_at = ? WHERE report_id IN (${placeholders})`
  )
    .bind(now, ...ids)
    .run();
  return {
    reportChanges: Number(reports?.meta?.changes || 0),
    jobChanges: Number(jobs?.meta?.changes || 0)
  };
}

async function protectedFixRequestForReport(env, reportId) {
  if (!env.WAITLIST_DB || !isSafeReportId(reportId)) return null;
  const placeholders = PRESERVED_FIX_REQUEST_STATUSES.map(() => "?").join(", ");
  return env.WAITLIST_DB.prepare(
    `SELECT id, status
     FROM fix_requests
     WHERE status IN (${placeholders})
       AND (report_id = ? OR final_report_id = ?)
     LIMIT 1`
  )
    .bind(...PRESERVED_FIX_REQUEST_STATUSES, reportId, reportId)
    .first();
}

async function protectedRepairExecutionForReport(env, reportId) {
  if (!env.WAITLIST_DB || !isSafeReportId(reportId)) return null;
  const approvalPlaceholders = PRESERVED_REPAIR_PROPOSAL_APPROVAL_STATUSES.map(() => "?").join(", ");
  const deliveryPlaceholders = PRESERVED_REPAIR_PROPOSAL_DELIVERY_STATUSES.map(() => "?").join(", ");
  const fixRequestPlaceholders = PRESERVED_FIX_REQUEST_STATUSES.map(() => "?").join(", ");
  try {
    return await env.WAITLIST_DB.prepare(
      `SELECT repair_proposals.id,
              repair_proposals.fix_request_id,
              repair_proposals.approval_status,
              repair_proposals.delivery_status,
              fix_requests.status AS fix_request_status
       FROM repair_proposals
       LEFT JOIN fix_requests ON fix_requests.id = repair_proposals.fix_request_id
       WHERE (repair_proposals.report_id = ? OR repair_proposals.final_report_id = ?)
         AND (
           (
             repair_proposals.approval_status IN (${approvalPlaceholders})
             AND fix_requests.status IN (${fixRequestPlaceholders})
           )
           OR repair_proposals.delivery_status IN (${deliveryPlaceholders})
         )
       LIMIT 1`
    )
      .bind(
        reportId,
        reportId,
        ...PRESERVED_REPAIR_PROPOSAL_APPROVAL_STATUSES,
        ...PRESERVED_FIX_REQUEST_STATUSES,
        ...PRESERVED_REPAIR_PROPOSAL_DELIVERY_STATUSES
      )
      .first();
  } catch {
    return null;
  }
}

async function preserveProtectedFixRequestReport(env, reportId) {
  if (!env.WAITLIST_DB || !isSafeReportId(reportId)) return false;
  const protectedFixRequest = await protectedFixRequestForReport(env, reportId);
  const protectedRepairExecution = protectedFixRequest ? null : await protectedRepairExecutionForReport(env, reportId);
  if (!protectedFixRequest && !protectedRepairExecution) return false;
  const preserved = await preserveReportIds(env, [reportId]);
  return preserved.reportChanges === 1;
}

async function saveAuditReport(report, request, env, access) {
  const origin = new URL(request.url).origin;
  return saveAuditReportWithContext(report, env, access, origin);
}

async function saveAuditReportWithContext(report, env, access, origin) {
  const id = makePrivateReportId(report.url);
  const now = new Date().toISOString();
  const expiresAt = isoDaysFromNow(REPORT_RETENTION_DAYS);
  const targetHost = new URL(report.url).hostname.toLowerCase();
  const previousReport = await latestSavedReportForDelta(env, access, targetHost, now);
  const reportDelta = buildReportDelta(report, previousReport);
  const saved = {
    ...report,
    id,
    reportPath: `/beta/reports/${id}`,
    reportUrl: `${origin}/beta/reports/${id}`,
    reportDelta,
    repairBrief: appendReportDeltaBrief(report.repairBrief || "", reportDelta),
    owner: {
      email: access.ownerEmail,
      inviteId: access.inviteId || null,
      accessMode: access.accessMode || "invite"
    },
    retention: {
      expiresAt,
      days: REPORT_RETENTION_DAYS
    }
  };
  const fitted = fitReportForStorage(compactAuditReportForStorage(saved));
  const storageReport = fitted.report;

  // Prefer R2 for the blob; fall back to inline D1 storage (size-guarded)
  // when the binding is missing or the put fails.
  let storedReportJson = fitted.json;
  if (env.REPORTS) {
    try {
      await env.REPORTS.put(reportR2Key(id), fitted.json, {
        httpMetadata: { contentType: "application/json" }
      });
      storedReportJson = `${R2_REPORT_MARKER}${reportR2Key(id)}`;
    } catch {
      storedReportJson = fitted.json;
    }
  }

  await env.WAITLIST_DB.prepare(
    `INSERT INTO audit_reports
      (id, url, origin, score, summary_json, report_json, created_at, updated_at, owner_email, owner_session_hash, target_host, expires_at, owner_invite_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      saved.url,
      saved.origin,
      saved.score,
      JSON.stringify(saved.summary || {}),
      storedReportJson,
      now,
      now,
      access.ownerEmail,
      access.sessionHash,
      targetHost,
      expiresAt,
      access.inviteId || null
    )
    .run();

  return storageReport;
}

// Report bodies live in R2; the D1 column keeps a marker pointing at the
// object so old inline rows and dev environments without the binding keep
// working unchanged.
const R2_REPORT_MARKER = "r2:";

function reportR2Key(reportId) {
  return `reports/${reportId}.json`;
}

async function reportJsonForRow(env, row) {
  const raw = String(row?.report_json || "");
  if (!raw.startsWith(R2_REPORT_MARKER)) return raw;
  if (!env.REPORTS) return "";
  const object = await env.REPORTS.get(raw.slice(R2_REPORT_MARKER.length));
  return object ? await object.text() : "";
}

async function hydrateReportRow(env, row) {
  if (row && String(row.report_json || "").startsWith(R2_REPORT_MARKER)) {
    row.report_json = await reportJsonForRow(env, row);
  }
  return row;
}

async function deleteReportRowsWithBlobs(env, rows = []) {
  const candidateRows = rows.filter((row) => isSafeReportId(row.id));
  if (!candidateRows.length) return { deletedIds: [], protectedIds: [], preservedIds: [], failedBlobDeletes: [] };
  const deletedRows = [];
  const protectedIds = [];
  const placeholders = PRESERVED_FIX_REQUEST_STATUSES.map(() => "?").join(", ");
  for (const row of candidateRows) {
    if (await preserveProtectedFixRequestReport(env, row.id)) {
      protectedIds.push(row.id);
      continue;
    }
    if (await deleteReportRowWithRepairCleanup(env, row, placeholders)) {
      deletedRows.push(row);
      continue;
    }
    if (await preserveProtectedFixRequestReport(env, row.id)) {
      protectedIds.push(row.id);
    }
  }
  const blobRows = deletedRows
    .map((row) => ({
      id: row.id,
      key: String(row.report_json || "").startsWith(R2_REPORT_MARKER)
        ? String(row.report_json || "").slice(R2_REPORT_MARKER.length)
        : ""
    }))
    .filter((row) => row.key);
  const failedBlobDeletes = [];
  if (env.REPORTS && blobRows.length) {
    try {
      await env.REPORTS.delete(blobRows.map((row) => row.key));
    } catch (error) {
      for (const row of blobRows) {
        const failure = {
          reportId: row.id,
          key: row.key,
          error: cleanText(error?.message || "Report blob deletion failed.", 500)
        };
        failedBlobDeletes.push(failure);
        await recordReportBlobDeletionFailure(env, failure);
      }
    }
  }
  return { deletedIds: deletedRows.map((row) => row.id), protectedIds, preservedIds: protectedIds, failedBlobDeletes };
}

async function deleteReportRowWithRepairCleanup(env, row, protectedStatusPlaceholders) {
  const now = new Date().toISOString();
  const cleanupAllowedPredicate = `EXISTS (
         SELECT 1
         FROM audit_reports candidate_report
         WHERE candidate_report.id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM fix_requests
             WHERE status IN (${protectedStatusPlaceholders})
               AND (report_id = candidate_report.id OR final_report_id = candidate_report.id)
           )
       )`;
  const statements = [
    env.WAITLIST_DB.prepare(
      `UPDATE repair_agent_actions
       SET rerun_state = 'not_run',
           rerun_report_id = NULL,
           updated_at = ?,
           updated_by_email = COALESCE(NULLIF(updated_by_email, ''), owner_email)
       WHERE rerun_report_id = ?
         AND ${cleanupAllowedPredicate}`
    ).bind(now, row.id, row.id, ...PRESERVED_FIX_REQUEST_STATUSES),
    env.WAITLIST_DB.prepare(
      `UPDATE repair_queue_items
       SET status = CASE
             WHEN status IN ('fixed', 'regressed') THEN 'applied'
             ELSE status
           END,
           rerun_status = 'not_run',
           last_rerun_report_id = NULL,
           updated_at = ?,
           updated_by_email = COALESCE(NULLIF(updated_by_email, ''), owner_email)
       WHERE last_rerun_report_id = ?
         AND ${cleanupAllowedPredicate}`
    ).bind(now, row.id, row.id, ...PRESERVED_FIX_REQUEST_STATUSES),
    env.WAITLIST_DB.prepare(
      `DELETE FROM repair_agent_actions
       WHERE report_id = ?
         AND ${cleanupAllowedPredicate}`
    ).bind(row.id, row.id, ...PRESERVED_FIX_REQUEST_STATUSES),
    env.WAITLIST_DB.prepare(
      `DELETE FROM repair_queue_items
       WHERE report_id = ?
         AND ${cleanupAllowedPredicate}`
    ).bind(row.id, row.id, ...PRESERVED_FIX_REQUEST_STATUSES),
    env.WAITLIST_DB.prepare(
      `DELETE FROM audit_jobs
       WHERE report_id = ?
         AND ${cleanupAllowedPredicate}`
    ).bind(row.id, row.id, ...PRESERVED_FIX_REQUEST_STATUSES),
    guardedReportDeleteStatement(env, row.id, protectedStatusPlaceholders)
  ];
  let results;
  try {
    results = await runReportDeletionBatch(env, statements);
  } catch (error) {
    if (!isRepairTablesMissingError(error)) throw error;
    results = await runReportDeletionBatch(env, [
      env.WAITLIST_DB.prepare(
        `DELETE FROM audit_jobs
         WHERE report_id = ?
           AND ${cleanupAllowedPredicate}`
      ).bind(row.id, row.id, ...PRESERVED_FIX_REQUEST_STATUSES),
      guardedReportDeleteStatement(env, row.id, protectedStatusPlaceholders)
    ]);
  }
  const deleted = results[results.length - 1];
  return Number(deleted?.meta?.changes || 0) === 1;
}

function guardedReportDeleteStatement(env, reportId, protectedStatusPlaceholders) {
  return env.WAITLIST_DB.prepare(
    `DELETE FROM audit_reports
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1
         FROM fix_requests
         WHERE status IN (${protectedStatusPlaceholders})
           AND (report_id = ? OR final_report_id = ?)
       )`
  )
    .bind(reportId, ...PRESERVED_FIX_REQUEST_STATUSES, reportId, reportId);
}

async function runReportDeletionBatch(env, statements = []) {
  if (typeof env.WAITLIST_DB.batch === "function") {
    return env.WAITLIST_DB.batch(statements);
  }
  const results = [];
  for (const statement of statements) {
    results.push(await statement.run());
  }
  return results;
}

async function recordReportBlobDeletionFailure(env, failure = {}) {
  if (!env.WAITLIST_DB || !failure.key) return;
  const now = new Date().toISOString();
  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO audit_report_blob_deletion_failures
        (blob_key, report_id, error, retry_count, status, created_at, updated_at)
       VALUES (?, ?, ?, 0, 'pending', ?, ?)
       ON CONFLICT(blob_key) DO UPDATE SET
         report_id = excluded.report_id,
         error = excluded.error,
         retry_count = retry_count + 1,
         status = 'pending',
         updated_at = excluded.updated_at`
    )
      .bind(failure.key, failure.reportId || "", failure.error || "Report blob deletion failed.", now, now)
      .run();
  } catch {
    // Older local databases may not have the retry table until migrations run.
  }
}

// D1 rejects rows near its ~2MB value limit, which would fail the save AFTER
// a long crawl completed. Trim stored page proof until the blob fits; scores,
// findings, and the repair brief always cover the full crawl.
const REPORT_STORAGE_MAX_BYTES = 1_500_000;

function fitReportForStorage(storageReport) {
  const encoder = new TextEncoder();
  let report = storageReport;
  let json = JSON.stringify(report);
  if (encoder.encode(json).length <= REPORT_STORAGE_MAX_BYTES) {
    return { report, json, trimmed: false };
  }

  let pageLimit = Array.isArray(report.pages) ? report.pages.length : 0;
  while (encoder.encode(json).length > REPORT_STORAGE_MAX_BYTES && pageLimit > 1) {
    pageLimit = Math.max(1, Math.floor(pageLimit / 2));
    report = {
      ...report,
      pages: report.pages.slice(0, pageLimit),
      storageNote: `Stored page-by-page proof was trimmed to ${pageLimit} pages to fit report storage. Scores, findings, and the repair brief still cover the full crawl.`
    };
    json = JSON.stringify(report);
  }

  let summaryLimit = Array.isArray(report.pageSummaries) ? report.pageSummaries.length : 0;
  while (encoder.encode(json).length > REPORT_STORAGE_MAX_BYTES && summaryLimit > 1) {
    summaryLimit = Math.max(1, Math.floor(summaryLimit / 2));
    report = { ...report, pageSummaries: report.pageSummaries.slice(0, summaryLimit) };
    json = JSON.stringify(report);
  }

  return { report, json, trimmed: true };
}

function compactAuditReportForStorage(report = {}) {
  return {
    ...report,
    pages: Array.isArray(report.pages) ? report.pages.slice(0, 1000).map(compactAuditPageForStorage) : [],
    pageSummaries: Array.isArray(report.pageSummaries) ? report.pageSummaries.slice(0, 1000) : [],
    resourceWaterfall: compactResourceWaterfallForStorage(report.resourceWaterfall)
  };
}

function compactAuditPageForStorage(page = {}) {
  return {
    ...page,
    static: compactRenderedFactsForStorage(page.static),
    rendered: compactRenderedFactsForStorage(page.rendered),
    linkChecks: compactResourceChecksForStorage(page.linkChecks, 60),
    imageChecks: compactResourceChecksForStorage(page.imageChecks, 60),
    resourceWaterfall: compactResourceWaterfallForStorage(page.resourceWaterfall)
  };
}

function compactRenderedFactsForStorage(facts = {}) {
  if (!facts || typeof facts !== "object") return facts;
  const compact = { ...facts };
  if (compact.bodyText && !compact.bodySample) compact.bodySample = cleanText(compact.bodyText, 280);
  delete compact.bodyText;
  delete compact.resourceTimings;
  if (compact.bodySample) compact.bodySample = cleanText(compact.bodySample, 280);
  compact.links = compactListForStorage(compact.links, 80);
  compact.images = compactListForStorage(compact.images, 80);
  compact.internalLinks = compactListForStorage(compact.internalLinks, 120);
  compact.externalLinks = compactListForStorage(compact.externalLinks, 60);
  compact.headings = compactListForStorage(compact.headings, 80);
  compact.h1s = compactListForStorage(compact.h1s, 20);
  compact.hreflangs = compactListForStorage(compact.hreflangs, 80);
  compact.schemaTypes = compactListForStorage(compact.schemaTypes, 40);
  compact.schemaErrors = compactListForStorage(compact.schemaErrors, 20);
  return compact;
}

function compactResourceChecksForStorage(checks = [], limit = 60) {
  if (!Array.isArray(checks)) return [];
  return checks.slice(0, limit).map((check) => ({
    url: check.url || "",
    finalUrl: check.finalUrl || "",
    label: cleanText(check.label || "", 220),
    kind: check.kind || "",
    ok: Boolean(check.ok),
    status: Number(check.status || 0),
    redirected: Boolean(check.redirected),
    error: cleanText(check.error || "", 300),
    evidence: cleanText(check.evidence || "", 400)
  }));
}

function compactResourceWaterfallForStorage(waterfall = null) {
  if (!waterfall || typeof waterfall !== "object") return waterfall || null;
  return {
    ...waterfall,
    resources: compactListForStorage(waterfall.resources, 25),
    slowResources: compactListForStorage(waterfall.slowResources, 10),
    heavyResources: compactListForStorage(waterfall.heavyResources, 10),
    renderBlockingCandidates: compactListForStorage(waterfall.renderBlockingCandidates, 10),
    thirdPartyHosts: compactListForStorage(waterfall.thirdPartyHosts, 10),
    repairOpportunities: compactListForStorage(waterfall.repairOpportunities, 10)
  };
}

function compactListForStorage(items = [], limit = 50) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, limit).map(compactValueForStorage);
}

function compactValueForStorage(value) {
  if (typeof value === "string") return cleanText(value, 500);
  if (!value || typeof value !== "object") return value;
  const compact = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "bodyText" || key === "resourceTimings") continue;
    compact[key] = typeof item === "string" ? cleanText(item, 500) : item;
  }
  return compact;
}

async function latestSavedReportForDelta(env, access, targetHost, now) {
  if (!env.WAITLIST_DB || !access.ownerEmail || !targetHost) return null;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT report_json
     FROM audit_reports
     WHERE owner_email = ?
       AND target_host = ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(access.ownerEmail, targetHost, now)
    .first();
  return parseJson(row ? await reportJsonForRow(env, row) : "", null);
}

function makePrivateReportId(url) {
  const host = new URL(url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42)
    .toLowerCase();
  return `${host || "report"}-${crypto.randomUUID()}`;
}

export {
  PRESERVED_FIX_REQUEST_STATUSES,
  PRESERVED_REPAIR_PROPOSAL_APPROVAL_STATUSES,
  PRESERVED_REPAIR_PROPOSAL_DELIVERY_STATUSES,
  R2_REPORT_MARKER,
  REPORT_RETENTION_DAYS,
  REPORT_STORAGE_MAX_BYTES,
  compactAuditPageForStorage,
  compactAuditReportForStorage,
  compactListForStorage,
  compactRenderedFactsForStorage,
  compactResourceChecksForStorage,
  compactResourceWaterfallForStorage,
  compactValueForStorage,
  deleteReportRowsWithBlobs,
  fitReportForStorage,
  hydrateReportRow,
  latestSavedReportForDelta,
  makePrivateReportId,
  ownerReportRow,
  preserveReportIds,
  preserveProtectedFixRequestReport,
  preserveFixRequestReports,
  protectedFixRequestForReport,
  protectedRepairExecutionForReport,
  reportJsonForRow,
  reportR2Key,
  saveAuditReport,
  saveAuditReportWithContext
};
