function repairActionUpdateRequest(reportId, actionId, body = {}) {
  return {
    endpoint: `/api/reports/${encodeURIComponent(reportId)}/repair-actions/${encodeURIComponent(actionId)}`,
    init: {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  };
}

function repairActionImplementationPackUrl(reportId, actionId) {
  return `/api/reports/${encodeURIComponent(reportId)}/repair-actions/${encodeURIComponent(actionId)}/implementation.md`;
}

function repairActionProofReceiptUrl(reportId, actionId) {
  return `/api/reports/${encodeURIComponent(reportId)}/repair-actions/${encodeURIComponent(actionId)}/proof.md`;
}

function repairActionImplementationPackAvailable(action = {}) {
  const approvalState = action.approvalState || action.approval_state || "";
  const executionState = action.executionState || action.execution_state || "";
  return Boolean(action.id && (approvalState === "approved" || executionState === "applied"));
}

function repairActionProofReceiptAvailable(action = {}) {
  const approvalState = action.approvalState || action.approval_state || "";
  const executionState = action.executionState || action.execution_state || "";
  const rerunState = action.rerunState || action.rerun_state || "";
  const rerunReportId = action.rerunReportId || action.rerun_report_id || "";
  return Boolean(
    action.id &&
    approvalState === "approved" &&
    executionState === "applied" &&
    rerunState === "fixed" &&
    rerunReportId
  );
}

function repairActionApprovalPatch() {
  return { approvalState: "approved" };
}

function repairActionIgnorePatch() {
  return { approvalState: "ignored" };
}

function repairActionApplyPatch() {
  return { approvalState: "approved", executionState: "applied" };
}

function repairActionRerunPatch(rerunState, rerunReportId) {
  return { rerunState, rerunReportId };
}

export {
  repairActionApplyPatch,
  repairActionApprovalPatch,
  repairActionIgnorePatch,
  repairActionImplementationPackAvailable,
  repairActionImplementationPackUrl,
  repairActionProofReceiptAvailable,
  repairActionProofReceiptUrl,
  repairActionRerunPatch,
  repairActionUpdateRequest
};
