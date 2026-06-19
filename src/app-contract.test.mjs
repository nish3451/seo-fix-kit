import assert from "node:assert/strict";
import test from "node:test";
import { DEVELOPER_WEBHOOK_EVENTS, developerWebhookRequest } from "./developer-webhooks.js";
import { fixPackCheckoutBody, fixPackRepairTarget } from "./fix-pack-checkout.js";
import {
  repairActionApplyPatch,
  repairActionApprovalPatch,
  repairActionIgnorePatch,
  repairActionRerunPatch,
  repairActionUpdateRequest
} from "./repair-action-requests.js";

test("developer webhook UI subscribes to all repair lifecycle events", () => {
  const request = developerWebhookRequest("https://example.com/seofixkit-webhook");
  const payload = JSON.parse(request.init.body);

  assert.equal(request.endpoint, "/api/developer/webhooks");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "same-origin");
  assert.equal(request.init.headers["content-type"], "application/json");
  assert.equal(payload.url, "https://example.com/seofixkit-webhook");
  assert.deepEqual(payload.events, [
    "audit.completed",
    "audit.failed",
    "repair_action.drafted",
    "repair_action.approved",
    "repair_action.applied",
    "repair_action.fixed",
    "repair_action.regressed"
  ]);
  assert.deepEqual(payload.events, DEVELOPER_WEBHOOK_EVENTS);
});

test("Fix Pack checkout uses live repair queue targets when available", () => {
  const target = fixPackRepairTarget({
    repairPlan: [{ title: "Missing title", issueId: "issue-1", status: "open" }]
  }, [
    { id: "queue-1", issueId: "issue-1", title: "Missing title", status: "fixed" },
    { id: "queue-2", issueId: "issue-2", title: "Missing meta description", status: "open" }
  ]);
  const body = fixPackCheckoutBody("report-1", target);

  assert.equal(target.source, "repair_queue");
  assert.equal(target.queueItemId, "queue-2");
  assert.equal(target.issueId, "issue-2");
  assert.deepEqual(body.selectedRepair, {
    queueItemId: "queue-2",
    issueId: "issue-2",
    title: "Missing meta description"
  });
});

test("Fix Pack checkout omits immutable report-derived targets", () => {
  const target = fixPackRepairTarget({
    repairPlan: [{ title: "Missing title", issueId: "issue-1", status: "open" }]
  }, []);
  const body = fixPackCheckoutBody("report-1", target);

  assert.equal(target.source, "report");
  assert.equal(body.selectedRepair, null);
});

test("repair action UI contract uses action endpoint for lifecycle changes", () => {
  const cases = [
    ["approve", repairActionApprovalPatch(), { approvalState: "approved" }],
    ["ignore", repairActionIgnorePatch(), { approvalState: "ignored" }],
    ["apply", repairActionApplyPatch(), { approvalState: "approved", executionState: "applied" }],
    ["fixed", repairActionRerunPatch("fixed", "rerun-report-1"), { rerunState: "fixed", rerunReportId: "rerun-report-1" }],
    ["still open", repairActionRerunPatch("still_open", "rerun-report-1"), { rerunState: "still_open", rerunReportId: "rerun-report-1" }],
    ["regressed", repairActionRerunPatch("regressed", "rerun-report-1"), { rerunState: "regressed", rerunReportId: "rerun-report-1" }]
  ];

  for (const [label, patch, expected] of cases) {
    const request = repairActionUpdateRequest("report 1", "action/1", patch);
    assert.equal(request.endpoint, "/api/reports/report%201/repair-actions/action%2F1", label);
    assert.equal(request.init.method, "PATCH", label);
    assert.equal(request.init.credentials, "same-origin", label);
    assert.equal(request.init.headers["content-type"], "application/json", label);
    assert.deepEqual(JSON.parse(request.init.body), expected, label);
    assert.equal(request.endpoint.includes("/repair-queue"), false, label);
  }
});
