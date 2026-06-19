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
  repairActionRerunPatch,
  repairActionUpdateRequest
};
