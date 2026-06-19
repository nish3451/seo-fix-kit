import {
  canPatchRepairQueueStatus,
  cleanActionMode,
  cleanActionType,
  cleanApprovalState,
  cleanQueueStatus,
  cleanExecutionState,
  cleanRerunState,
  fallbackIssueId,
  isActionMode,
  isActionType,
  isApprovalState,
  isExecutionState,
  isRerunState
} from "./repair-queue.js";

function reportWithAuditRow(report = {}, row = {}, fallbackId = "") {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  return {
    ...report,
    id: report.id || report.reportId || row.id || fallbackId,
    url: report.url || row.url || "",
    targetHost: report.targetHost || report.target_host || row.target_host || "",
    createdAt: report.createdAt || report.created_at || row.created_at || "",
    scannedAt: report.scannedAt || report.scanned_at || "",
    updatedAt: report.updatedAt || report.updated_at || row.updated_at || ""
  };
}

function reportTimestampMs(report = {}) {
  const candidates = [
    report.createdAt,
    report.created_at,
    report.scannedAt,
    report.scanned_at,
    report.updatedAt,
    report.updated_at
  ];
  for (const candidate of candidates) {
    const timestamp = Date.parse(candidate || "");
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function rerunProofFreshAfterMs(action = {}, referenceReport = {}) {
  const appliedAtMs = Date.parse(action.applied_at || action.appliedAt || "");
  return Math.max(
    reportTimestampMs(referenceReport),
    Number.isFinite(appliedAtMs) ? appliedAtMs : 0
  );
}

function rerunProofBlockedByNewApply(action = {}, executionState = "", rerunState = "") {
  return proofBackedRerunState(rerunState) &&
    cleanExecutionState(executionState) === "applied" &&
    cleanExecutionState(action.execution_state || action.executionState) !== "applied";
}

function repairActionTransitionError(state = {}, messages = {}) {
  const approvalState = cleanApprovalState(state.approvalState || state.approval_state);
  const executionState = cleanExecutionState(state.executionState || state.execution_state);
  const rerunState = cleanRerunState(state.rerunState || state.rerun_state);
  const rerunReportId = cleanRerunReportId(state.rerunReportId || state.rerun_report_id);
  if (executionState === "applied" && approvalState !== "approved") {
    return messages.appliedBeforeApproved || "Applied repair actions must be approved first.";
  }
  if (proofBackedRerunState(rerunState) && executionState !== "applied") {
    return messages.rerunBeforeApplied || "Rerun repair states require an applied action.";
  }
  if (proofBackedRerunState(rerunState) && !rerunReportId) {
    return messages.missingRerunReport || "Rerun repair states need a rerun report.";
  }
  return "";
}

function normalizeRepairQueuePatchItems(itemInput, existingItems = []) {
  const items = Array.isArray(itemInput?.items)
    ? itemInput.items
    : Array.isArray(itemInput)
      ? itemInput
      : [itemInput];
  if (!items.length) return repairActionInputError("Repair queue update needs a mutable field.", 400);
  if (items.length > 1) return repairActionInputError("Save one repair item at a time.", 400);

  const byIssue = new Map(existingItems.map((item) => [item.issueId, item]));
  const item = items[0];
  const issueId = cleanText(item?.issueId || item?.issue_id || "", 160);
  const existing = byIssue.get(issueId);
  if (!existing?.id) return repairActionInputError("Repair item no longer exists in this report.", 400);

  const hasExplicitStatus = hasExplicitStatusField(item);
  const hasExplicitActionMode = hasExplicitActionModeField(item);
  const hasExplicitRerunStatus = hasExplicitRerunStatusField(item);
  if (!hasExplicitStatus && !hasExplicitActionMode && !hasExplicitRerunStatus) {
    return repairActionInputError("Repair queue update needs a mutable field.", 400);
  }
  if (hasExplicitActionMode && !hasValidExplicitActionModeField(item)) {
    return repairActionInputError("Repair action mode is not valid.", 400);
  }
  if (hasExplicitStatus && !canPatchRepairQueueStatus(item?.status)) {
    return repairActionInputError("Use repair actions to move drafted, approved, applied, fixed, or regressed repair states.", 400);
  }
  const status = hasExplicitStatus ? cleanQueueStatus(item?.status) : cleanQueueStatus(existing.status);

  if (hasExplicitRerunStatus && !isRerunState(item?.rerunStatus ?? item?.rerun_status)) {
    return repairActionInputError("Repair rerun status is not valid.", 400);
  }
  const rerunStatus = cleanRerunState(hasExplicitRerunStatus
    ? item?.rerunStatus ?? item?.rerun_status
    : existing.rerunStatus
  );
  if (hasExplicitRerunStatus && proofBackedRerunState(rerunStatus)) {
    return repairActionInputError("Use repair actions to attach rerun proof states.", 400);
  }

  const shouldResetRerunProof = hasExplicitStatus || hasExplicitRerunStatus;
  const update = {
    existing,
    status,
    actionMode: cleanActionMode(item?.actionMode || item?.action_mode || existing.actionMode),
    rerunStatus: shouldResetRerunProof ? "not_run" : existing.rerunStatus,
    rerunReportId: shouldResetRerunProof ? "" : existing.lastRerunReportId || ""
  };

  return { ok: true, update };
}

function normalizeRepairActionCreateInput(body = {}, item = {}) {
  if (hasExplicitActionModeField(body) && !hasValidExplicitActionModeField(body)) {
    return repairActionInputError("Repair action mode is not valid.", 400);
  }
  if (hasExplicitActionTypeField(body) && !hasValidExplicitActionTypeField(body)) {
    return repairActionInputError("Repair action type is not valid.", 400);
  }
  return {
    ok: true,
    actionMode: cleanActionMode(body.actionMode ?? body.action_mode ?? item.actionMode),
    actionType: cleanActionType(body.actionType ?? body.action_type)
  };
}

function normalizeRepairActionPatch(body = {}, action = {}, options = {}) {
  if (!hasKnownActionPatchField(body)) {
    return repairActionInputError("Repair action update needs a state field.", 400);
  }
  if (hasExplicitApprovalStateField(body) && !isApprovalState(body.approvalState ?? body.approval_state)) {
    return repairActionInputError("Repair approval state is not valid.", 400);
  }
  if (hasExplicitExecutionStateField(body) && !isExecutionState(body.executionState ?? body.execution_state)) {
    return repairActionInputError("Repair execution state is not valid.", 400);
  }
  if (hasExplicitRerunStateField(body) && !isRerunState(body.rerunState ?? body.rerun_state)) {
    return repairActionInputError("Repair rerun state is not valid.", 400);
  }

  const approvalState = cleanApprovalState(body.approvalState || body.approval_state || action.approval_state);
  const executionState = cleanExecutionState(body.executionState || body.execution_state || action.execution_state);
  const rerunState = cleanRerunState(body.rerunState || body.rerun_state || action.rerun_state);
  const requestedRerunReportId = rerunReportIdFromInput(body, action.rerun_report_id);
  const rerunReportId = needsRerunReport(rerunState) ? requestedRerunReportId : "";
  const transitionError = repairActionTransitionError(
    { approvalState, executionState, rerunState, rerunReportId },
    options.messages || {}
  );
  if (transitionError) return repairActionInputError(transitionError, 400);

  return {
    ok: true,
    approvalState,
    executionState,
    rerunState,
    rerunReportId
  };
}

function repairActionTransitionEvents(before = {}, after = {}) {
  const events = [];
  if (before.approval_state !== "approved" && after.approval_state === "approved") {
    events.push("repair_action.approved");
  }
  if (before.execution_state !== "applied" && after.execution_state === "applied") {
    events.push("repair_action.applied");
  }
  if (before.rerun_state !== "fixed" && after.rerun_state === "fixed") {
    events.push("repair_action.fixed");
  }
  if (before.rerun_state !== "regressed" && after.rerun_state === "regressed") {
    events.push("repair_action.regressed");
  }
  return events;
}

function repairActionWebhookPayload(action = {}, report = {}, options = {}) {
  const issue = repairProofIssueForAction(report, action);
  const reportId = action.report_id || report.id || "";
  const reportPath = options.reportPath || report.reportPath || (reportId ? `/beta/reports/${reportId}` : "");
  return {
    repair_action: {
      id: action.id || "",
      report_id: reportId,
      queue_item_id: action.queue_item_id || "",
      issue_id: action.issue_id || "",
      issue_title: issue.title || "",
      severity: issue.severity || "",
      page_url: issue.pageUrl || issue.page_url || "",
      page_label: issue.pageLabel || issue.page_label || "",
      action_mode: cleanActionMode(action.action_mode),
      action_type: cleanActionType(action.action_type),
      approval_state: cleanApprovalState(action.approval_state),
      execution_state: cleanExecutionState(action.execution_state),
      rerun_state: cleanRerunState(action.rerun_state),
      rerun_report_id: action.rerun_report_id || "",
      updated_at: action.updated_at || "",
      approved_at: action.approved_at || "",
      applied_at: action.applied_at || "",
      report_path: reportPath
    },
    report: {
      id: reportId,
      url: report.url || "",
      report_path: reportPath,
      report_url: report.reportUrl || ""
    }
  };
}

function proofBackedRerunState(state = "") {
  return cleanRerunState(state) !== "not_run";
}

function needsRerunReport(rerunStatus) {
  return proofBackedRerunState(cleanRerunState(rerunStatus));
}

function queueStatusFromActionState(state = {}) {
  const rerunState = cleanRerunState(state.rerunState || state.rerun_state);
  const executionState = cleanExecutionState(state.executionState || state.execution_state);
  const approvalState = cleanApprovalState(state.approvalState || state.approval_state);
  if (rerunState === "fixed") return "fixed";
  if (rerunState === "regressed") return "regressed";
  if (executionState === "applied") return "applied";
  if (approvalState === "approved") return "approved";
  if (approvalState === "ignored") return "ignored";
  return "drafted";
}

function rerunReportIdFromInput(value = {}, fallback = "") {
  return cleanRerunReportId(
    value.rerunReportId ??
    value.rerun_report_id ??
    value.lastRerunReportId ??
    value.last_rerun_report_id ??
    fallback
  );
}

function hasExplicitRerunStatusField(value = {}) {
  return Object.prototype.hasOwnProperty.call(value, "rerunStatus") ||
    Object.prototype.hasOwnProperty.call(value, "rerun_status");
}

function hasExplicitStatusField(value = {}) {
  return Object.prototype.hasOwnProperty.call(value, "status");
}

function hasExplicitActionModeField(value = {}) {
  return Object.prototype.hasOwnProperty.call(value, "actionMode") ||
    Object.prototype.hasOwnProperty.call(value, "action_mode");
}

function hasExplicitActionTypeField(value = {}) {
  return Object.prototype.hasOwnProperty.call(value, "actionType") ||
    Object.prototype.hasOwnProperty.call(value, "action_type");
}

function hasValidExplicitActionModeField(value = {}) {
  if (Object.prototype.hasOwnProperty.call(value, "actionMode") && !isActionMode(value.actionMode)) return false;
  if (Object.prototype.hasOwnProperty.call(value, "action_mode") && !isActionMode(value.action_mode)) return false;
  return true;
}

function hasValidExplicitActionTypeField(value = {}) {
  if (Object.prototype.hasOwnProperty.call(value, "actionType") && !isActionType(value.actionType)) return false;
  if (Object.prototype.hasOwnProperty.call(value, "action_type") && !isActionType(value.action_type)) return false;
  return true;
}

function hasKnownActionPatchField(value = {}) {
  return hasExplicitApprovalStateField(value) ||
    hasExplicitExecutionStateField(value) ||
    hasExplicitRerunStateField(value);
}

function hasExplicitApprovalStateField(value = {}) {
  return Object.prototype.hasOwnProperty.call(value, "approvalState") ||
    Object.prototype.hasOwnProperty.call(value, "approval_state");
}

function hasExplicitExecutionStateField(value = {}) {
  return Object.prototype.hasOwnProperty.call(value, "executionState") ||
    Object.prototype.hasOwnProperty.call(value, "execution_state");
}

function hasExplicitRerunStateField(value = {}) {
  return Object.prototype.hasOwnProperty.call(value, "rerunState") ||
    Object.prototype.hasOwnProperty.call(value, "rerun_state");
}

function repairActionInputError(error, status = 400) {
  return { ok: false, error, status };
}

function cleanRerunReportId(value) {
  const reportId = cleanText(value || "", 140);
  return reportId && isSafeReportId(reportId) ? reportId : "";
}

function validRerunProofReport(report = null) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return false;
  if (!comparableReportHost(report)) return false;
  return Number.isFinite(Number(report.score)) ||
    Boolean(report.summary && typeof report.summary === "object") ||
    Boolean(report.reportDelta && typeof report.reportDelta === "object") ||
    Boolean(report.report_delta && typeof report.report_delta === "object") ||
    Boolean(Array.isArray(report.pages) && report.pages.length) ||
    Boolean(Array.isArray(report.pageSummaries) && report.pageSummaries.length);
}

function rerunReportProvesIssue(proofReport = {}, issue = {}, rerunState = "") {
  if (!issue || typeof issue !== "object") return false;
  const cleanState = cleanRerunState(rerunState);
  const currentIssueMatch = reportProofIssues(proofReport).some((candidate) => issueMatches(candidate, issue));
  if (cleanState === "fixed") {
    return fixedProofIssues(proofReport).some((candidate) => issueMatches(candidate, issue)) ||
      (!currentIssueMatch && proofReportCoversIssuePage(proofReport, issue));
  }
  return currentIssueMatch;
}

function repairProofIssueForAction(report = {}, action = {}) {
  return {
    id: action.issue_id || "",
    issue_id: action.issue_id || "",
    source_proof: action.source_proof || "",
    ...reportIssueForAction(report, action)
  };
}

function comparableReportHost(report = {}) {
  const candidates = [
    report.targetHost,
    report.target_host,
    report.url,
    report.targetUrl,
    report.target_url
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    const host = safeHostname(value) || safeHostname(`https://${value}`);
    const normalized = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (normalized) return normalized;
  }
  return "";
}

function reportIssueForAction(report = {}, action = {}) {
  return (report.findings || []).find((finding) => finding.id === action.issue_id) ||
    reportRepairPlanItems(report).find((item, index) =>
      (item.issueId || item.issue_id || fallbackIssueId(item, index, "repair")) === action.issue_id
    ) ||
    {};
}

function reportProofIssues(report = {}) {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const repairPlan = reportRepairPlanItems(report).map((item, index) => ({
    ...item,
    id: item.id || item.issueId || item.issue_id || fallbackIssueId(item, index, "repair")
  }));
  return [...findings.filter((finding) => finding?.severity !== "good"), ...repairPlan];
}

function reportRepairPlanItems(report = {}) {
  return [
    ...(Array.isArray(report.repairPlan) ? report.repairPlan : []),
    ...(Array.isArray(report.repair_plan) ? report.repair_plan : [])
  ];
}

function fixedProofIssues(report = {}) {
  const delta = report.reportDelta || report.report_delta || {};
  const camel = Array.isArray(delta.fixedIssues) ? delta.fixedIssues : [];
  const snake = Array.isArray(delta.fixed_issues) ? delta.fixed_issues : [];
  return [...camel, ...snake];
}

function issueMatches(candidate = {}, issue = {}) {
  const candidateKey = issueProofKey(candidate);
  const issueKey = issueProofKey(issue);
  if (candidateKey && issueKey) return candidateKey === issueKey;
  const candidateId = cleanIssueId(candidate);
  const issueId = cleanIssueId(issue);
  if (candidateId && issueId && candidateId === issueId) return true;
  return false;
}

function cleanIssueId(issue = {}) {
  return cleanText(issue.id || issue.issueId || issue.issue_id || "", 180);
}

function issueProofKey(issue = {}) {
  const title = normalizeProofText(issue.title || "");
  if (!title) return "";
  return [
    normalizeProofText(issue.type || ""),
    title,
    normalizeProofUrl(issue.pageUrl || issue.page_url || ""),
    normalizeProofText(issue.source || "")
  ].join("|");
}

function proofReportCoversIssuePage(report = {}, issue = {}) {
  const pageKey = normalizeProofUrl(issue.pageUrl || issue.page_url || "");
  if (!pageKey) return true;
  if (normalizeProofUrl(report.url || report.targetUrl || report.target_url || "") === pageKey) return true;
  const pages = [
    ...(Array.isArray(report.pages) ? report.pages : []),
    ...(Array.isArray(report.pageSummaries) ? report.pageSummaries : []),
    ...(Array.isArray(report.page_summaries) ? report.page_summaries : [])
  ];
  return pages.some((page) => normalizeProofUrl(page?.url || page?.pageUrl || page?.page_url || "") === pageKey);
}

function normalizeProofText(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeProofUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    url.search = "";
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return normalizeProofText(text);
  }
}

function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSafeReportId(value) {
  return /^[a-z0-9][a-z0-9.-]{12,120}$/i.test(value);
}

export {
  comparableReportHost,
  cleanRerunReportId,
  normalizeRepairActionCreateInput,
  normalizeRepairActionPatch,
  normalizeRepairQueuePatchItems,
  proofBackedRerunState,
  queueStatusFromActionState,
  repairActionTransitionEvents,
  repairActionWebhookPayload,
  repairProofIssueForAction,
  reportTimestampMs,
  reportWithAuditRow,
  rerunProofBlockedByNewApply,
  rerunProofFreshAfterMs,
  rerunReportProvesIssue,
  validRerunProofReport
};
