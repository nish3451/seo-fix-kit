import { crawlDepthSummary } from "../../shared/crawl-depth.js";
import { fixRequestStatusLabel } from "../../shared/fulfillment.js";
import { keywordRowsSummary } from "../../shared/keyword-rank-audit.js";
import { localSeoInputSummary } from "../../shared/local-seo-audit.js";
import { renderedCrawlTargetSummary } from "../../shared/rendered-crawl-scale.js";
import { parseJson, safeHostname, scheduleCadenceLabel } from "./text.js";

function auditJobResponse(row = {}) {
  const reportId = row.report_id || "";
  return {
    id: row.id || "",
    status: row.status || "queued",
    targetUrl: row.target_url || "",
    targetHost: row.target_host || safeHostname(row.target_url || ""),
    competitorUrls: parseJson(row.competitor_urls_json, []),
    backlinkRowsCount: parseJson(row.backlink_rows_json, []).length,
    localSeoInput: localSeoInputSummary(parseJson(row.local_seo_input_json, { enabled: false })),
    keywordRowsInput: keywordRowsSummary(parseJson(row.keyword_rows_json, [])),
    renderedCrawlTarget: renderedCrawlTargetSummary(row.rendered_crawl_target || 0),
    maxPages: Number(row.max_pages || 10),
    crawlDepth: crawlDepthSummary(row.max_pages || 10),
    reportId,
    scheduleId: row.schedule_id || "",
    reportPath: reportId ? `/beta/reports/${reportId}` : "",
    error: row.error || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    expiresAt: row.expires_at || ""
  };
}

function auditScheduleResponse(row = {}) {
  const reportId = row.last_report_id || "";
  return {
    id: row.id || "",
    status: row.status || "active",
    targetUrl: row.target_url || "",
    targetHost: row.target_host || safeHostname(row.target_url || ""),
    maxPages: Number(row.max_pages || 10),
    intervalDays: Number(row.interval_days || 7),
    cadenceLabel: scheduleCadenceLabel(row.interval_days || 7),
    nextRunAt: row.next_run_at || "",
    lastRunAt: row.last_run_at || "",
    lastJobId: row.last_job_id || "",
    lastReportId: reportId,
    lastReportPath: reportId ? `/beta/reports/${reportId}` : "",
    lastError: row.last_error || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    pausedAt: row.paused_at || ""
  };
}

function apiProjectResponse(row = {}) {
  return {
    id: row.id || "",
    host: row.host || "",
    status: row.status || "pending",
    verification_method: row.verification_method || "",
    verified_at: row.verified_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    verification: siteClaimInstructions(row)
  };
}

function apiAuditResponse(row = {}) {
  const reportId = row.report_id || "";
  return {
    audit_id: row.id || "",
    status: apiAuditStatus(row.status),
    url: row.target_url || "",
    target_host: row.target_host || safeHostname(row.target_url || ""),
    competitor_urls: parseJson(row.competitor_urls_json, []),
    backlink_rows_count: parseJson(row.backlink_rows_json, []).length,
    local_seo_input: localSeoInputSummary(parseJson(row.local_seo_input_json, { enabled: false })),
    keyword_rows_input: keywordRowsSummary(parseJson(row.keyword_rows_json, [])),
    rendered_crawl_target: renderedCrawlTargetSummary(row.rendered_crawl_target || 0),
    max_pages: Number(row.max_pages || 10),
    crawl_depth: crawlDepthSummary(row.max_pages || 10),
    report_id: reportId,
    report_url: reportId ? `/v1/audits/${row.id}/report` : "",
    issues_url: reportId ? `/v1/audits/${row.id}/issues` : "",
    error: row.error || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    started_at: row.started_at || "",
    completed_at: row.completed_at || ""
  };
}

function apiAuditStatus(status = "") {
  if (status === "completed") return "complete";
  return status || "queued";
}

function apiIssueResponse(finding = {}) {
  return {
    id: finding.id || "",
    severity: finding.severity || "notice",
    title: finding.title || "",
    page_url: finding.pageUrl || "",
    page_label: finding.pageLabel || "",
    evidence: finding.evidence || "",
    why: finding.why || "",
    fix: finding.fix || "",
    acceptance: finding.acceptance || "",
    confidence: finding.confidence || "verified",
    source: finding.source || ""
  };
}

function apiReportResponse(report = {}) {
  return {
    id: report.id || "",
    url: report.url || "",
    score: report.score || 0,
    summary: report.summary || {},
    crawl_depth: report.crawlDepth || crawlDepthSummary(report.summary?.maxPages || 10),
    crawl_inventory: report.crawlInventory || null,
    rendered_crawl_scale: report.renderedCrawlScale || null,
    crawl_intelligence: report.crawlIntelligence || null,
    report_delta: report.reportDelta || null,
    performance: report.performance || null,
    resource_waterfall: report.resourceWaterfall || report.pages?.[0]?.resourceWaterfall || null,
    competitor_benchmark: report.competitorBenchmark || null,
    backlink_audit: report.backlinkAudit || null,
    local_seo_audit: report.localSeoAudit || null,
    keyword_rank_audit: report.keywordRankAudit || null,
    platform_seo_audit: report.platformSeoAudit || null,
    findings: (report.findings || []).map(apiIssueResponse),
    repair_plan: report.repairPlan || [],
    repair_brief: report.repairBrief || "",
    pages: report.pages || [],
    report_path: report.reportPath || "",
    report_url: report.reportUrl || "",
    created_at: report.scannedAt || report.createdAt || "",
    expires_at: report.retention?.expiresAt || ""
  };
}

function siteClaimResponse(row = {}) {
  const instructions = siteClaimInstructions(row);
  return {
    id: row.id || "",
    host: row.host || "",
    status: row.status || "pending",
    verificationMethod: row.verification_method || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    verifiedAt: row.verified_at || "",
    lastCheckedAt: row.last_checked_at || "",
    ...instructions
  };
}

function siteClaimInstructions(row = {}) {
  const host = row.host || "";
  const token = row.verification_token || "";
  const proof = token ? siteVerificationText(token) : "";
  return {
    dnsName: host ? `_seofixkit.${host}` : "",
    dnsType: "TXT",
    dnsValue: proof,
    filePath: "/.well-known/seofixkit.txt",
    fileUrl: host ? `https://${host}/.well-known/seofixkit.txt` : "",
    fileContents: proof
  };
}

function siteVerificationText(token) {
  return `seofixkit-site-verification=${token}`;
}

function fixRequestResponse(row, now = new Date().toISOString()) {
  return {
    id: row.id,
    status: row.status || "new",
    statusLabel: fixRequestStatusLabel(row.status || "new"),
    targetUrl: row.target_url,
    targetHost: row.target_host,
    score: row.score,
    issueCount: row.issue_count,
    checkoutSessionId: row.checkout_session_id || "",
    customerNote: row.customer_note || "",
    deliveryUrl: row.delivery_url || "",
    finalReportId: row.final_report_id || "",
    inProgressAt: row.in_progress_at || "",
    deliveredAt: row.delivered_at || "",
    paidAt: row.paid_at || "",
    dueAt: row.due_at || "",
    nextUpdateAt: row.next_update_at || "",
    statusReason: row.status_reason || "",
    isTest: Boolean(row.is_test),
    refundedAt: row.refunded_at || "",
    beforeAfterSummary: parseJson(row.before_after_summary_json, null),
    createdAt: row.created_at || now,
    updatedAt: row.updated_at || now
  };
}

function billingFixRequestResponse(row, now = new Date().toISOString()) {
  return {
    ...fixRequestResponse(row, now),
    reportId: row.report_id,
    reportPath: `/beta/reports/${row.report_id}`,
    briefPath: `/api/reports/${row.report_id}/brief.md`
  };
}

export {
  apiAuditResponse,
  apiAuditStatus,
  apiIssueResponse,
  apiProjectResponse,
  apiReportResponse,
  auditJobResponse,
  auditScheduleResponse,
  billingFixRequestResponse,
  fixRequestResponse,
  siteClaimInstructions,
  siteClaimResponse,
  siteVerificationText
};
