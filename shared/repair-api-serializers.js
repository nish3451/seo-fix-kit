import {
  agentActionResponse,
  apiRepairQueueStatusResponse,
  cleanActionMode,
  cleanActionType,
  cleanApprovalState,
  cleanExecutionState,
  cleanRerunState
} from "./repair-queue.js";

function repairQueueItemDetailResponse(item = {}) {
  return {
    id: item.id || "",
    issue_id: item.issueId || "",
    title: item.title || "",
    severity: item.severity || "",
    page_url: item.pageUrl || "",
    page_label: item.pageLabel || "",
    status: item.status || "open",
    action_mode: item.actionMode || "self_serve",
    rerun_status: item.rerunStatus || "not_run",
    last_rerun_report_id: item.lastRerunReportId || "",
    proof: item.proof || "",
    fix: item.fix || "",
    acceptance: item.acceptance || "",
    priority: Number(item.priority || 0),
    latest_action: apiRepairQueueStatusResponse(item).latest_action,
    updated_at: item.updatedAt || ""
  };
}

function repairActionDetailResponse(action = {}) {
  const response = agentActionResponse(action);
  return {
    id: action.id || response.id || "",
    queue_item_id: action.queue_item_id || action.queueItemId || response.queueItemId || "",
    issue_id: action.issue_id || action.issueId || response.issueId || "",
    action_mode: cleanActionMode(action.action_mode || action.actionMode || response.actionMode),
    action_type: cleanActionType(action.action_type || action.actionType || response.actionType),
    approval_state: cleanApprovalState(action.approval_state || action.approvalState || response.approvalState),
    execution_state: cleanExecutionState(action.execution_state || action.executionState || response.executionState),
    rerun_state: cleanRerunState(action.rerun_state || action.rerunState || response.rerunState),
    source_proof: action.source_proof || action.sourceProof || response.sourceProof || "",
    proposed_change: action.proposed_change || action.proposedChange || response.proposedChange || "",
    acceptance: action.acceptance || response.acceptance || "",
    rerun_report_id: action.rerun_report_id || action.rerunReportId || response.rerunReportId || "",
    created_at: action.created_at || action.createdAt || response.createdAt || "",
    updated_at: action.updated_at || action.updatedAt || response.updatedAt || "",
    approved_at: action.approved_at || action.approvedAt || response.approvedAt || "",
    applied_at: action.applied_at || action.appliedAt || response.appliedAt || ""
  };
}

export {
  repairActionDetailResponse,
  repairQueueItemDetailResponse
};
