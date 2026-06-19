const CLOSED_REPAIR_STATUSES = new Set(["fixed", "ignored"]);

export function fixPackRepairTarget(report = {}, queueItems = []) {
  const liveRepair = (queueItems || []).find((item) =>
    repairId(item) && repairIssueId(item) && !CLOSED_REPAIR_STATUSES.has(repairStatus(item))
  );
  if (liveRepair) return repairTargetFromQueueItem(liveRepair);

  const repair =
    (report.repairPlan || []).find((item) => item?.title && !CLOSED_REPAIR_STATUSES.has(repairStatus(item))) ||
    (report.findings || []).find((item) => item?.id && item.severity !== "good") ||
    null;
  if (!repair) return null;
  return {
    source: "report",
    queueItemId: "",
    issueId: repairIssueId(repair) || repair.id || "",
    title: repair.title || "Proof-backed repair",
    severity: repair.severity || "notice",
    status: repairStatus(repair) || "open",
    priority: Number(repair.priority || 0)
  };
}

export function fixPackCheckoutBody(reportId, selectedRepair = null) {
  return {
    reportId,
    selectedRepair: explicitSelectedRepair(selectedRepair)
  };
}

function explicitSelectedRepair(selectedRepair = null) {
  if (
    !selectedRepair ||
    selectedRepair.source !== "repair_queue" ||
    !selectedRepair.queueItemId ||
    !selectedRepair.issueId
  ) {
    return null;
  }
  return {
    queueItemId: selectedRepair.queueItemId,
    issueId: selectedRepair.issueId,
    title: selectedRepair.title || ""
  };
}

function repairTargetFromQueueItem(item = {}) {
  return {
    source: "repair_queue",
    queueItemId: repairId(item),
    issueId: repairIssueId(item),
    title: item.title || "Proof-backed repair",
    severity: item.severity || "notice",
    status: repairStatus(item) || "open",
    priority: Number(item.priority || 0)
  };
}

function repairId(item = {}) {
  return item.queueItemId || item.queue_item_id || item.id || "";
}

function repairIssueId(item = {}) {
  return item.issueId || item.issue_id || item.id || "";
}

function repairStatus(item = {}) {
  return String(item.status || "").toLowerCase();
}
