import { issuePatternKey } from "./audit-engine.js";

const QUEUE_STATUSES = new Set([
  "open",
  "in_progress",
  "drafted",
  "approved",
  "applied",
  "fixed",
  "ignored",
  "regressed"
]);
const QUEUE_PATCH_STATUSES = new Set(["open", "in_progress", "ignored"]);

const ACTION_MODES = new Set([
  "self_serve",
  "teammate",
  "fix_pack",
  "cms_draft",
  "github_pr"
]);

const ACTION_TYPES = new Set([
  "draft_fix",
  "metadata_copy",
  "schema_snippet",
  "fix_pack_handoff",
  "cms_draft",
  "github_pr_draft"
]);

const APPROVAL_STATES = new Set(["drafted", "approved", "ignored"]);
const EXECUTION_STATES = new Set(["not_started", "recorded", "applied", "blocked"]);
const RERUN_STATES = new Set(["not_run", "fixed", "still_open", "regressed", "new"]);
const REPAIR_QUEUE_ITEM_LIMIT = 100;

function normalizedEnumValue(value) {
  return String(value || "").trim().toLowerCase();
}

function deriveRepairQueueItems(report = {}, savedRows = [], actionRows = []) {
  const savedByIssue = new Map((savedRows || []).map((row) => [row.issue_id || row.issueId, row]));
  const actionsByIssue = groupActionsByIssue(actionRows);
  const items = [];
  const seen = new Set();
  const consumedPlanKeys = new Set();
  const repairPlan = Array.isArray(report.repairPlan) ? report.repairPlan : [];
  const planByKey = new Map(
    repairPlan.map((item, index) => [repairPlanKey(item), { item, index }])
  );

  for (const finding of reportIssuesForQueue(report)) {
    const issueId = cleanId(finding.id) || fallbackIssueId(finding, items.length);
    if (seen.has(issueId)) continue;
    seen.add(issueId);
    const key = repairPlanKey(finding);
    const plan = planByKey.get(key)?.item || {};
    if (planByKey.has(key)) consumedPlanKeys.add(key);
    items.push(queueItemResponse({
      ...queueSnapshotFromFinding(finding, plan),
      issue_id: issueId,
      source_kind: "finding"
    }, savedByIssue.get(issueId), actionsByIssue.get(issueId)));
  }

  repairPlan.forEach((plan, index) => {
    const key = repairPlanKey(plan);
    if (consumedPlanKeys.has(key)) return;
    const issueId = cleanId(plan.issueId || plan.issue_id) || fallbackIssueId(plan, index, "repair");
    if (seen.has(issueId)) return;
    seen.add(issueId);
    items.push(queueItemResponse({
      ...queueSnapshotFromPlan(plan),
      issue_id: issueId,
      source_kind: "repair_plan"
    }, savedByIssue.get(issueId), actionsByIssue.get(issueId)));
  });

  for (const row of savedRows || []) {
    const issueId = cleanId(row.issue_id || row.issueId);
    if (!issueId || seen.has(issueId)) continue;
    seen.add(issueId);
    items.push(queueItemResponse({
      issue_id: issueId,
      source_kind: row.source_kind || row.sourceKind || "finding"
    }, row, actionsByIssue.get(issueId)));
  }

  return items
    .filter((item) => item.issueId && item.title)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.priority - b.priority)
    .slice(0, REPAIR_QUEUE_ITEM_LIMIT)
    .map((item, index) => ({ ...item, priority: index + 1 }));
}

function queueItemResponse(snapshot = {}, saved = {}, actions = []) {
  const latestAction = latestByUpdatedAt(actions);
  const lastAppliedAt = latestAppliedAt(actions);
  const row = saved?.id ? saved : {};
  return {
    id: row.id || "",
    reportId: row.report_id || snapshot.report_id || "",
    issueId: row.issue_id || snapshot.issue_id || "",
    title: row.title || snapshot.title || "",
    severity: cleanSeverity(row.severity || snapshot.severity),
    pageUrl: row.page_url || snapshot.page_url || "",
    pageLabel: row.page_label || snapshot.page_label || "",
    proof: row.proof || snapshot.proof || "",
    fix: row.fix || snapshot.fix || "",
    snippet: row.snippet || snapshot.snippet || "",
    acceptance: row.acceptance || snapshot.acceptance || "",
    confidence: row.confidence || snapshot.confidence || "verified",
    source: row.source || snapshot.source || "",
    estimatedEffort: row.estimated_effort || snapshot.estimated_effort || "",
    workType: row.work_type || snapshot.work_type || "",
    sourceKind: row.source_kind || snapshot.source_kind || "finding",
    actionMode: cleanActionMode(row.action_mode || snapshot.action_mode),
    status: cleanQueueStatus(row.status || snapshot.status),
    rerunStatus: cleanRerunState(row.rerun_status || snapshot.rerun_status),
    lastRerunReportId: row.last_rerun_report_id || "",
    actionCount: actions.length,
    latestAction: latestAction ? agentActionResponse(latestAction) : null,
    lastAppliedAt,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    updatedByEmail: row.updated_by_email || "",
    priority: Number(snapshot.priority || row.priority || 999)
  };
}

function queueSnapshotFromFinding(finding = {}, plan = {}) {
  return {
    priority: Number(plan.priority || 999),
    title: cleanText(finding.title || plan.title, 220),
    severity: cleanSeverity(finding.severity || plan.severity),
    page_url: cleanText(finding.pageUrl || plan.pageUrl, 600),
    page_label: cleanText(finding.pageLabel || plan.pageLabel, 120),
    proof: cleanText(finding.evidence || plan.proof, 1200),
    fix: cleanText(finding.fix || plan.fix, 1600),
    snippet: cleanText(finding.snippet || plan.snippet, 3000),
    acceptance: cleanText(plan.acceptance || finding.acceptance, 1000),
    confidence: cleanText(finding.confidence || plan.confidence || "verified", 80),
    source: cleanText(finding.source || plan.source, 160),
    estimated_effort: cleanText(plan.estimatedEffort || "", 80),
    work_type: cleanText(plan.workType || "", 80),
    action_mode: "self_serve",
    status: "open",
    rerun_status: "not_run"
  };
}

function queueSnapshotFromPlan(plan = {}) {
  return {
    priority: Number(plan.priority || 999),
    title: cleanText(plan.title, 220),
    severity: cleanSeverity(plan.severity),
    page_url: cleanText(plan.pageUrl, 600),
    page_label: cleanText(plan.pageLabel, 120),
    proof: cleanText(plan.proof, 1200),
    fix: cleanText(plan.fix, 1600),
    snippet: cleanText(plan.snippet, 3000),
    acceptance: cleanText(plan.acceptance, 1000),
    confidence: cleanText(plan.confidence || "verified", 80),
    source: cleanText(plan.source, 160),
    estimated_effort: cleanText(plan.estimatedEffort || "", 80),
    work_type: cleanText(plan.workType || "", 80),
    action_mode: "self_serve",
    status: "open",
    rerun_status: "not_run"
  };
}

function agentActionResponse(row = {}) {
  return {
    id: row.id || "",
    reportId: row.report_id || "",
    queueItemId: row.queue_item_id || "",
    issueId: row.issue_id || "",
    actionMode: cleanActionMode(row.action_mode),
    actionType: cleanActionType(row.action_type),
    approvalState: cleanApprovalState(row.approval_state),
    executionState: cleanExecutionState(row.execution_state),
    rerunState: cleanRerunState(row.rerun_state),
    sourceProof: row.source_proof || "",
    proposedChange: row.proposed_change || "",
    acceptance: row.acceptance || "",
    rerunReportId: row.rerun_report_id || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    approvedAt: row.approved_at || "",
    appliedAt: row.applied_at || "",
    updatedByEmail: row.updated_by_email || ""
  };
}

function apiRepairQueueStatusResponse(item = {}) {
  const latestAction = item.latestAction || null;
  return {
    queue_item_id: item.id || "",
    status: cleanQueueStatus(item.status),
    action_mode: cleanActionMode(item.actionMode || item.action_mode),
    rerun_status: cleanRerunState(item.rerunStatus || item.rerun_status),
    last_rerun_report_id: item.lastRerunReportId || item.last_rerun_report_id || "",
    action_count: Number(item.actionCount || item.action_count || 0),
    latest_action: latestAction ? apiRepairActionStatusResponse(latestAction) : null,
    updated_at: item.updatedAt || item.updated_at || ""
  };
}

function apiRepairActionStatusResponse(action = {}) {
  return {
    id: action.id || "",
    action_type: cleanActionType(action.actionType || action.action_type),
    approval_state: cleanApprovalState(action.approvalState || action.approval_state),
    execution_state: cleanExecutionState(action.executionState || action.execution_state),
    rerun_state: cleanRerunState(action.rerunState || action.rerun_state),
    rerun_report_id: action.rerunReportId || action.rerun_report_id || "",
    updated_at: action.updatedAt || action.updated_at || "",
    approved_at: action.approvedAt || action.approved_at || "",
    applied_at: action.appliedAt || action.applied_at || ""
  };
}

function apiRepairQueueSummary(items = []) {
  const counts = {
    total: 0,
    open: 0,
    in_progress: 0,
    drafted: 0,
    approved: 0,
    applied: 0,
    fixed: 0,
    ignored: 0,
    regressed: 0,
    with_actions: 0,
    awaiting_approval: 0,
    needs_rerun: 0
  };

  for (const item of items || []) {
    const status = cleanQueueStatus(item.status);
    counts.total += 1;
    counts[status] = (counts[status] || 0) + 1;
    if (Number(item.actionCount || 0) > 0 || item.latestAction) counts.with_actions += 1;
    if (status === "drafted" || item.latestAction?.approvalState === "drafted") counts.awaiting_approval += 1;
    if (repairNeedsRerun(item)) counts.needs_rerun += 1;
  }

  return counts;
}

function repairNeedsRerun(item = {}) {
  const status = cleanQueueStatus(item.status);
  const rerunStatus = cleanRerunState(item.rerunStatus || item.rerun_status);
  const latest = item.latestAction || item.latest_action || {};
  const latestExecution = cleanExecutionState(latest.executionState || latest.execution_state);
  if (["fixed", "regressed"].includes(status) || rerunStatus !== "not_run") return false;
  return status === "applied" || latestExecution === "applied";
}

function defaultProposedChangeForItem(item = {}) {
  const lines = [
    item.fix ? `Fix: ${item.fix}` : "",
    item.snippet ? `Snippet:\n${item.snippet}` : "",
    item.acceptance ? `Acceptance check: ${item.acceptance}` : ""
  ].filter(Boolean);
  return cleanText(lines.join("\n\n"), 4000);
}

function reportIssuesForQueue(report = {}) {
  return (Array.isArray(report.findings) ? report.findings : [])
    .filter((finding) => finding?.id && finding.severity !== "good")
    .slice(0, REPAIR_QUEUE_ITEM_LIMIT);
}

function repairPlanKey(item = {}) {
  return [
    issuePatternKey(item.title || ""),
    item.pageUrl || item.page_url || "",
    item.pageLabel || item.page_label || ""
  ].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

function fallbackIssueId(item = {}, index = 0, prefix = "issue") {
  return `${prefix}-${index + 1}-${slug(issuePatternKey(item.title || item.fix || "repair"))}`.slice(0, 120);
}

function groupActionsByIssue(rows = []) {
  const grouped = new Map();
  for (const row of rows || []) {
    const issueId = row.issue_id || row.issueId || "";
    if (!issueId) continue;
    grouped.set(issueId, [...(grouped.get(issueId) || []), row]);
  }
  return grouped;
}

function latestByUpdatedAt(rows = []) {
  return [...rows].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0] || null;
}

function latestAppliedAt(rows = []) {
  return [...rows]
    .filter((row) => cleanExecutionState(row.execution_state || row.executionState) === "applied")
    .map((row) => row.applied_at || row.appliedAt || "")
    .filter((value) => Number.isFinite(Date.parse(value || "")))
    .sort()
    .at(-1) || "";
}

function cleanQueueStatus(value) {
  const status = normalizedEnumValue(value);
  return QUEUE_STATUSES.has(status) ? status : "open";
}

function canPatchRepairQueueStatus(value) {
  return QUEUE_PATCH_STATUSES.has(normalizedEnumValue(value));
}

function cleanActionMode(value) {
  const mode = normalizedEnumValue(value);
  return ACTION_MODES.has(mode) ? mode : "self_serve";
}

function cleanActionType(value) {
  const type = normalizedEnumValue(value);
  return ACTION_TYPES.has(type) ? type : "draft_fix";
}

function cleanApprovalState(value) {
  const state = normalizedEnumValue(value);
  return APPROVAL_STATES.has(state) ? state : "drafted";
}

function cleanExecutionState(value) {
  const state = normalizedEnumValue(value);
  return EXECUTION_STATES.has(state) ? state : "not_started";
}

function cleanRerunState(value) {
  const state = normalizedEnumValue(value);
  return RERUN_STATES.has(state) ? state : "not_run";
}

function isApprovalState(value) {
  return APPROVAL_STATES.has(normalizedEnumValue(value));
}

function isExecutionState(value) {
  return EXECUTION_STATES.has(normalizedEnumValue(value));
}

function isRerunState(value) {
  return RERUN_STATES.has(normalizedEnumValue(value));
}

function isActionMode(value) {
  return ACTION_MODES.has(normalizedEnumValue(value));
}

function isActionType(value) {
  return ACTION_TYPES.has(normalizedEnumValue(value));
}

function cleanSeverity(value) {
  const severity = String(value || "").trim().toLowerCase();
  return ["critical", "warning", "notice", "good"].includes(severity) ? severity : "notice";
}

function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanId(input) {
  return cleanText(input, 160).replace(/[^a-z0-9._:-]/gi, "-");
}

function slug(input) {
  return String(input || "repair")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "repair";
}

function severityRank(severity) {
  return { critical: 0, warning: 1, notice: 2, good: 3 }[severity] ?? 4;
}

export {
  agentActionResponse,
  apiRepairQueueStatusResponse,
  apiRepairQueueSummary,
  canPatchRepairQueueStatus,
  cleanActionMode,
  cleanActionType,
  cleanApprovalState,
  cleanExecutionState,
  cleanQueueStatus,
  cleanRerunState,
  defaultProposedChangeForItem,
  deriveRepairQueueItems,
  fallbackIssueId,
  isActionMode,
  isActionType,
  isApprovalState,
  isExecutionState,
  isRerunState,
  REPAIR_QUEUE_ITEM_LIMIT
};
