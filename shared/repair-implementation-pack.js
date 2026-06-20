import {
  cleanActionMode,
  cleanActionType,
  cleanApprovalState,
  cleanExecutionState
} from "./repair-queue.js";

const IMPLEMENTATION_PACK_CONTENT_TYPE = "text/markdown; charset=utf-8";

function buildRepairImplementationPack({ report = {}, item = {}, action = {} } = {}) {
  const actionId = text(action.id || action.actionId, 160);
  const reportId = text(action.report_id || action.reportId || report.id || item.reportId || item.report_id, 160);
  const queueItemId = text(action.queue_item_id || action.queueItemId || item.id, 160);
  const issueId = text(action.issue_id || action.issueId || item.issueId || item.issue_id, 160);
  if (!actionId || !reportId || !issueId) {
    return packError("Implementation pack needs an existing repair action.", 400);
  }

  if (rawUnsupported(action.action_mode || action.actionMode) || rawUnsupported(item.actionMode || item.action_mode)) {
    return packError("Unsupported repair actions do not have implementation packs yet.", 409);
  }

  const approvalState = cleanApprovalState(action.approval_state || action.approvalState);
  if (approvalState === "drafted") return packError("Approve the repair action before creating an implementation pack.", 409);
  if (approvalState === "ignored") return packError("Ignored repair actions do not have implementation packs.", 409);

  const itemStatus = text(item.status || item.queue_status, 80).toLowerCase();
  if (itemStatus === "ignored") return packError("Ignored repair items do not have implementation packs.", 409);

  const actionMode = cleanActionMode(action.action_mode || action.actionMode || item.actionMode || item.action_mode);
  const actionType = cleanActionType(action.action_type || action.actionType);
  const executionState = cleanExecutionState(action.execution_state || action.executionState);
  const proposedChange = block(action.proposed_change || action.proposedChange, 7000);
  if (!proposedChange) return packError("Implementation pack needs an approved proposed change.", 409);

  const title = text(item.title || action.issue_title || "Proof-backed repair", 220);
  const pageUrl = text(item.pageUrl || item.page_url || report.url, 600);
  const pageLabel = text(item.pageLabel || item.page_label || pageUrl || "target page", 160);
  const severity = text(item.severity || action.severity || "notice", 80);
  const sourceProof = block(action.source_proof || action.sourceProof || item.proof || item.evidence, 3000);
  const acceptance = block(action.acceptance || item.acceptance, 2000);
  const sourceFix = block(item.fix, 2500);
  const snippet = block(item.snippet, 5000);
  const reportUrl = text(report.reportUrl || report.report_url || "", 600);
  const generatedAt = new Date().toISOString();
  const filename = implementationPackFilename(reportId, actionId);

  const markdown = [
    "# SEOFixKit Implementation Pack",
    "",
    "This private pack turns one owner-approved repair action into execution instructions. It does not mean SEOFixKit published, merged, or applied the change.",
    "",
    "## Repair Summary",
    "",
    bullet("Issue", title),
    bullet("Severity", severity),
    bullet("Target page", pageLabel),
    pageUrl ? bullet("Target URL", pageUrl) : "",
    reportId ? bullet("Report", reportId) : "",
    reportUrl ? bullet("Report URL", reportUrl) : "",
    bullet("Queue item", queueItemId || "n/a"),
    bullet("Repair action", actionId),
    bullet("Action mode", actionModeLabel(actionMode)),
    bullet("Action type", actionTypeLabel(actionType)),
    bullet("Approval", approvalState),
    bullet("Execution status", executionState),
    bullet("Generated", generatedAt),
    "",
    "## Source Proof",
    "",
    sourceProof ? fencedBlock(sourceProof, 3000) : "The original report contains the proof for this repair. Reopen the private report before applying the change.",
    sourceFix ? ["", "## Original Fix Guidance", "", fencedBlock(sourceFix, 2500)].join("\n") : "",
    snippet ? ["", "## Source Snippet", "", fencedBlock(snippet, 5000)].join("\n") : "",
    "",
    "## Approved Change",
    "",
    fencedBlock(proposedChange, 7000),
    "",
    "## Implementation Steps",
    "",
    modeSteps(actionMode).join("\n"),
    "",
    "## Acceptance Check",
    "",
    acceptance ? fencedBlock(acceptance, 2000) : "Rerun the audit and confirm the original finding is gone or intentionally accepted with fresh proof.",
    "",
    "## Rollback Note",
    "",
    rollbackNote(actionMode),
    "",
    "## Rerun Proof",
    "",
    "After the change is applied outside SEOFixKit, run a fresh audit for the same host and attach the rerun report to this repair action. Mark the action fixed only when the rerun proves the finding is gone.",
    "",
    "## Boundaries",
    "",
    "- This pack is private to the report owner or owner API token.",
    "- SEOFixKit did not publish to a CMS, open or merge a GitHub pull request, or call provider admin APIs for this pack.",
    "- Rankings, traffic, indexing, AI citations, and revenue are not guaranteed.",
    "- If the approved change no longer matches the current site, pause and draft a new repair action before applying anything."
  ].filter((part) => part !== "").join("\n");

  return {
    ok: true,
    markdown,
    contentType: IMPLEMENTATION_PACK_CONTENT_TYPE,
    filename,
    metadata: {
      reportId,
      queueItemId,
      issueId,
      actionId,
      actionMode,
      actionType,
      approvalState,
      executionState,
      generatedAt
    }
  };
}

function implementationPackFilename(reportId = "", actionId = "") {
  const report = slug(reportId, "report");
  const action = slug(actionId, "repair-action");
  return `${report}-${action}-implementation-pack.md`.slice(0, 180);
}

function repairImplementationItemForAction(items = [], action = {}) {
  const queueItemId = action.queue_item_id || action.queueItemId || "";
  if (queueItemId) return items.find((candidate) => candidate.id === queueItemId);
  const issueId = action.issue_id || action.issueId || "";
  return items.find((candidate) => candidate.issueId === issueId || candidate.issue_id === issueId);
}

function modeSteps(mode = "self_serve") {
  const steps = {
    self_serve: [
      "1. Open the target page in your site editor, CMS, or codebase.",
      "2. Apply only the approved change above.",
      "3. Save a local backup or note what changed before publishing.",
      "4. Publish or deploy through your normal workflow.",
      "5. Rerun SEOFixKit and attach the fresh report proof."
    ],
    teammate: [
      "1. Assign this pack to the teammate responsible for the page.",
      "2. Ask them to apply only the approved change above.",
      "3. Have them record what changed and where it shipped.",
      "4. Rerun SEOFixKit after the teammate confirms the change is live.",
      "5. Attach the rerun report before calling the repair fixed."
    ],
    fix_pack: [
      "1. Use this pack as the Fix Pack fulfillment checklist.",
      "2. Confirm the repair still matches the paid report and approved action.",
      "3. Deliver the change note and delivery link to the customer.",
      "4. Run the same-host rerun after the customer or operator applies the change.",
      "5. Mark delivery complete only after the rerun proof is attached."
    ],
    cms_draft: [
      "1. Create a draft edit in the CMS using the approved change above.",
      "2. Keep the CMS draft unpublished until the owner reviews it in the CMS.",
      "3. Record the CMS draft URL or internal reference outside public reports.",
      "4. Publish only after owner approval in the CMS workflow.",
      "5. Rerun SEOFixKit and attach the fresh proof."
    ],
    github_pr: [
      "1. Create a branch in the customer's repository.",
      "2. Apply only the approved change above.",
      "3. Open a pull request with the source proof, acceptance check, and rollback note.",
      "4. Wait for normal code review and CI before merge.",
      "5. Rerun SEOFixKit after deployment and attach the fresh proof."
    ]
  };
  return steps[mode] || steps.self_serve;
}

function rollbackNote(mode = "self_serve") {
  const notes = {
    self_serve: "Keep the previous page copy, metadata, or snippet so the site owner can restore it if the rerun regresses or the change is wrong.",
    teammate: "Ask the teammate to document the previous value and restore path before changing the page.",
    fix_pack: "Keep the delivery note, previous value, and customer-visible change summary so support can reverse or revise the repair if proof regresses.",
    cms_draft: "Keep the CMS draft history or previous published value. If proof regresses, revert the draft or restore the previous published version.",
    github_pr: "Keep the pull request small. If proof regresses after merge, revert the PR or apply a follow-up PR that restores the previous behavior."
  };
  return notes[mode] || notes.self_serve;
}

function actionModeLabel(mode = "") {
  return {
    self_serve: "Self-serve implementation",
    teammate: "Teammate handoff",
    fix_pack: "Fix Pack fulfillment",
    cms_draft: "CMS draft",
    github_pr: "GitHub PR draft"
  }[mode] || "Self-serve implementation";
}

function actionTypeLabel(type = "") {
  return {
    draft_fix: "Draft fix",
    metadata_copy: "Metadata copy",
    schema_snippet: "Schema snippet",
    fix_pack_handoff: "Fix Pack handoff",
    cms_draft: "CMS draft",
    github_pr_draft: "GitHub PR draft"
  }[type] || "Draft fix";
}

function packError(error, status = 400) {
  return { ok: false, status, error };
}

function bullet(label, value) {
  return `- ${label}: ${text(value, 1000) || "n/a"}`;
}

function block(value = "", max = 4000) {
  return sanitizeMarkdown(value, max, { multiline: true });
}

function text(value = "", max = 500) {
  return sanitizeMarkdown(value, max, { multiline: false });
}

function fencedBlock(value = "", max = 4000) {
  const content = block(value, max);
  const longestFence = Math.max(2, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestFence + 1));
  return `${fence}\n${content}\n${fence}`;
}

function sanitizeMarkdown(value = "", max = 500, options = {}) {
  const source = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "");
  const cleaned = options.multiline
    ? source
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    : source.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, max);
}

function slug(value = "", fallback = "item") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || fallback;
}

function rawUnsupported(value = "") {
  return String(value || "").trim().toLowerCase() === "unsupported";
}

export {
  IMPLEMENTATION_PACK_CONTENT_TYPE,
  buildRepairImplementationPack,
  implementationPackFilename,
  repairImplementationItemForAction
};
