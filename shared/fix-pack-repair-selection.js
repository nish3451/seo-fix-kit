import { cleanQueueStatus } from "./repair-queue.js";

function selectFixPackRepair(items = [], body = {}) {
  const activeItems = items.filter((item) => item.id && !["fixed", "ignored"].includes(cleanQueueStatus(item.status)));
  const requestedIssueId = cleanText(
    body.issueId || body.issue_id || body.selectedRepair?.issueId || body.selected_repair?.issue_id || "",
    160
  );
  const requestedQueueItemId = cleanText(
    body.queueItemId || body.queue_item_id || body.selectedRepair?.queueItemId || body.selected_repair?.queue_item_id || "",
    160
  );
  const hasExplicitSelection = Boolean(requestedQueueItemId || requestedIssueId);
  const selectedByRequest = activeItems.find((item) => {
    if (requestedQueueItemId && item.id !== requestedQueueItemId) return false;
    if (requestedIssueId && item.issueId !== requestedIssueId) return false;
    return requestedQueueItemId || requestedIssueId;
  }) || null;
  if (hasExplicitSelection && !selectedByRequest) {
    return { selectedRepair: null, conflict: true };
  }
  const selected = selectedByRequest || activeItems[0] || null;
  if (!selected) return { selectedRepair: null, conflict: false };
  return {
    selectedRepair: {
      queueItemId: selected.id || "",
      issueId: selected.issueId || "",
      title: cleanText(selected.title || "Proof-backed repair", 180),
      severity: selected.severity || "notice",
      status: selected.status || "open",
      actionMode: selected.actionMode || "self_serve",
      proof: cleanText(selected.proof || "", 500),
      acceptance: cleanText(selected.acceptance || "", 500),
      priority: Number(selected.priority || 0)
    },
    conflict: false
  };
}

function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export { selectFixPackRepair };
