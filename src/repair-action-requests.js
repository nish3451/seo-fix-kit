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

function repairActionImplementationPackAvailable(action = {}) {
  const approvalState = action.approvalState || action.approval_state || "";
  const executionState = action.executionState || action.execution_state || "";
  return Boolean(action.id && (approvalState === "approved" || executionState === "applied"));
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
  repairActionRerunPatch,
  repairActionUpdateRequest
};
