import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanActionMode,
  cleanApprovalState,
  cleanQueueStatus,
  defaultProposedChangeForItem,
  deriveRepairQueueItems,
  apiRepairQueueSummary,
  REPAIR_QUEUE_ITEM_LIMIT
} from "./repair-queue.js";

test("deriveRepairQueueItems creates finding and repair-plan-backed queue rows", () => {
  const report = fixtureReport();
  const items = deriveRepairQueueItems(report);

  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.issueId), ["issue-1", "repair-2-add-faq-schema"]);
  assert.equal(items[0].proof, "Rendered title is missing.");
  assert.equal(items[0].acceptance, "Rendered title exists.");
  assert.equal(items[1].sourceKind, "repair_plan");
  assert.equal(items[1].status, "open");
});

test("deriveRepairQueueItems preserves saved queue state and latest action", () => {
  const savedRows = [{
    id: "queue-1",
    report_id: "report-1",
    issue_id: "issue-1",
    title: "Old snapshot title",
    severity: "warning",
    action_mode: "fix_pack",
    status: "approved",
    rerun_status: "not_run",
    updated_at: "2026-06-18T10:00:00.000Z"
  }];
  const actionRows = [{
    id: "action-1",
    report_id: "report-1",
    queue_item_id: "queue-1",
    issue_id: "issue-1",
    action_mode: "fix_pack",
    action_type: "draft_fix",
    approval_state: "approved",
    execution_state: "not_started",
    rerun_state: "not_run",
    proposed_change: "Use the new title.",
    updated_at: "2026-06-18T11:00:00.000Z"
  }];

  const [item] = deriveRepairQueueItems(fixtureReport(), savedRows, actionRows);

  assert.equal(item.id, "queue-1");
  assert.equal(item.title, "Old snapshot title");
  assert.equal(item.status, "approved");
  assert.equal(item.actionMode, "fix_pack");
  assert.equal(item.latestAction.id, "action-1");
  assert.equal(item.latestAction.approvalState, "approved");
});

test("deriveRepairQueueItems includes persisted rows without report JSON and caps output", () => {
  const savedRows = Array.from({ length: REPAIR_QUEUE_ITEM_LIMIT + 5 }, (_, index) => ({
    id: `queue-${index}`,
    report_id: "report-1",
    issue_id: `issue-${index}`,
    title: `Persisted issue ${index}`,
    severity: "notice",
    status: "open",
    action_mode: "self_serve",
    rerun_status: "not_run",
    updated_at: "2026-06-18T10:00:00.000Z"
  }));

  const items = deriveRepairQueueItems({}, savedRows, []);

  assert.equal(items.length, REPAIR_QUEUE_ITEM_LIMIT);
  assert.equal(items[0].title, "Persisted issue 0");
});

test("apiRepairQueueSummary counts only applied repairs as needing rerun", () => {
  const summary = apiRepairQueueSummary([
    { status: "approved" },
    { status: "applied" },
    { status: "drafted", latestAction: { approvalState: "drafted" } },
    { status: "open", latestAction: { executionState: "applied" } },
    { status: "fixed", rerunStatus: "fixed", latestAction: { executionState: "applied" } },
    { status: "regressed", rerunStatus: "regressed", latestAction: { executionState: "applied" } },
    { status: "applied", rerunStatus: "still_open", latestAction: { executionState: "applied" } },
    { status: "applied", rerunStatus: "new", latestAction: { executionState: "applied" } }
  ]);

  assert.equal(summary.approved, 1);
  assert.equal(summary.applied, 3);
  assert.equal(summary.fixed, 1);
  assert.equal(summary.regressed, 1);
  assert.equal(summary.awaiting_approval, 1);
  assert.equal(summary.needs_rerun, 2);
});

test("queue cleaners fail closed to safe draft-only values", () => {
  assert.equal(cleanQueueStatus("published"), "open");
  assert.equal(cleanQueueStatus("regressed"), "regressed");
  assert.equal(cleanActionMode("admin_api_write"), "self_serve");
  assert.equal(cleanActionMode("cms_draft"), "cms_draft");
  assert.equal(cleanApprovalState("merged"), "drafted");
  assert.equal(cleanApprovalState("ignored"), "ignored");
});

test("defaultProposedChangeForItem builds reviewable copy without side effects", () => {
  const [item] = deriveRepairQueueItems(fixtureReport());
  const draft = defaultProposedChangeForItem(item);

  assert.match(draft, /Fix: Add a descriptive title/);
  assert.match(draft, /Acceptance check: Rendered title exists/);
});

function fixtureReport() {
  return {
    id: "report-1",
    findings: [{
      id: "issue-1",
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/",
      pageLabel: "home",
      evidence: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      confidence: "verified",
      source: "rendered"
    }],
    repairPlan: [{
      priority: 1,
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/",
      pageLabel: "home",
      proof: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      acceptance: "Rendered title exists.",
      confidence: "verified",
      source: "rendered",
      estimatedEffort: "5-15 min",
      workType: "metadata"
    }, {
      priority: 2,
      severity: "notice",
      title: "Add FAQ schema",
      pageUrl: "https://example.com/pricing",
      pageLabel: "/pricing",
      proof: "Competitor pages answer pricing FAQs with structured copy.",
      fix: "Draft an FAQ block that matches visible pricing copy.",
      acceptance: "FAQ content is visible before schema is added.",
      confidence: "verified",
      source: "competitor"
    }]
  };
}
