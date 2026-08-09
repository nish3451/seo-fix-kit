import assert from "node:assert/strict";
import test from "node:test";
import { DEVELOPER_WEBHOOK_EVENTS, developerWebhookRequest } from "./developer-webhooks.js";
import { deliveryReadinessLabel, deliveryReadinessText } from "./delivery-readiness-copy.js";
import {
  fixPackCheckoutBody,
  fixPackCheckoutDisabled,
  fixPackCheckoutErrorOutcome,
  fixPackCheckoutOutcome,
  fixPackRepairTarget
} from "./fix-pack-checkout.js";
import { safeDodoCheckoutUrl } from "./dodo-checkout-url.js";
import {
  monitoringCheckoutDisabled,
  monitoringCheckoutErrorOutcome,
  monitoringCheckoutOutcome
} from "./monitoring-checkout.js";
import {
  repairActionApplyPatch,
  repairActionApprovalPatch,
  repairActionIgnorePatch,
  repairActionImplementationPackAvailable,
  repairActionImplementationPackUrl,
  repairActionProofReceiptAvailable,
  repairActionProofReceiptUrl,
  repairActionRerunPatch,
  repairActionUpdateRequest
} from "./repair-action-requests.js";
import { funnelEventPayload } from "./funnel-events.js";

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

test("Fix Pack checkout failures return a retryable error state", () => {
  const validCheckout = fixPackCheckoutOutcome({ checkoutUrl: "https://checkout.dodopayments.com/fix-pack" });
  assert.equal(validCheckout.status, "success");
  assert.equal(validCheckout.checkoutUrl, "https://checkout.dodopayments.com/fix-pack");

  const unsafeCheckout = fixPackCheckoutOutcome({ checkoutUrl: "javascript:alert(1)" });
  assert.equal(unsafeCheckout.status, "error");
  assert.equal(unsafeCheckout.checkoutUrl, "");

  const serverFailure = fixPackCheckoutOutcome({ ok: false, error: "Repair target changed. Refresh checkout." });
  assert.equal(serverFailure.status, "error");
  assert.equal(serverFailure.message, "Repair target changed. Refresh checkout.");
  assert.equal(serverFailure.checkoutUrl, "");
  assert.equal(
    fixPackCheckoutDisabled({ hasPriorityFixes: true, pricingStatus: "available", status: serverFailure.status }),
    false
  );

  const thrownFailure = fixPackCheckoutErrorOutcome(new Error("Checkout migration is not ready."));
  assert.equal(thrownFailure.status, "error");
  assert.equal(thrownFailure.message, "Checkout migration is not ready.");
  assert.equal(
    fixPackCheckoutDisabled({ hasPriorityFixes: true, pricingStatus: "available", status: thrownFailure.status }),
    false
  );
});

test("Proof Monitoring checkout only enables when subscription checkout is ready", () => {
  assert.equal(monitoringCheckoutDisabled({ checkoutReady: false, status: "idle" }), true);
  assert.equal(monitoringCheckoutDisabled({ checkoutReady: true, status: "idle" }), false);
  assert.equal(monitoringCheckoutDisabled({ checkoutReady: true, status: "submitting" }), true);
});

test("Proof Monitoring checkout outcome redirects only when a safe URL exists", () => {
  const checkout = monitoringCheckoutOutcome({
    ok: true,
    mode: "checkout",
    checkoutUrl: "https://checkout.dodopayments.com/monitoring",
    message: "Checkout opens at Dodo."
  });
  assert.equal(checkout.status, "redirecting");
  assert.equal(checkout.checkoutUrl, "https://checkout.dodopayments.com/monitoring");

  const customHostCheckout = monitoringCheckoutOutcome({
    ok: true,
    mode: "checkout",
    checkoutUrl: "https://checkout.example.com/monitoring"
  });
  assert.equal(customHostCheckout.status, "redirecting");
  assert.equal(customHostCheckout.checkoutUrl, "https://checkout.example.com/monitoring");

  const unsafeCheckout = monitoringCheckoutOutcome({
    ok: true,
    mode: "checkout",
    checkoutUrl: "javascript:alert(1)"
  });
  assert.equal(unsafeCheckout.status, "error");
  assert.equal(unsafeCheckout.checkoutUrl, "");

  const unavailable = monitoringCheckoutOutcome({
    ok: false,
    checkoutAvailable: false,
    message: "Proof Monitoring checkout is paused."
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.checkoutUrl, "");

  const thrown = monitoringCheckoutErrorOutcome(new Error("Dodo monitoring checkout failed."));
  assert.equal(thrown.status, "error");
  assert.equal(thrown.message, "Dodo monitoring checkout failed.");
});

test("Dodo checkout URL helper accepts only HTTPS provider URLs", () => {
  assert.equal(safeDodoCheckoutUrl("https://checkout.dodopayments.com/a"), "https://checkout.dodopayments.com/a");
  assert.equal(safeDodoCheckoutUrl("https://pay.dodopayments.com/a"), "https://pay.dodopayments.com/a");
  assert.equal(safeDodoCheckoutUrl("https://checkout.example.com/a"), "https://checkout.example.com/a");
  assert.equal(safeDodoCheckoutUrl("http://checkout.dodopayments.com/a"), "");
  assert.equal(safeDodoCheckoutUrl("javascript:alert(1)"), "");
  assert.equal(safeDodoCheckoutUrl("/relative"), "");
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

test("repair action UI exposes implementation pack only after approval", () => {
  assert.equal(
    repairActionImplementationPackUrl("report 1", "action/1"),
    "/api/reports/report%201/repair-actions/action%2F1/implementation.md"
  );
  assert.equal(repairActionImplementationPackAvailable({ id: "action-1", approvalState: "drafted" }), false);
  assert.equal(repairActionImplementationPackAvailable({ id: "action-1", approvalState: "ignored" }), false);
  assert.equal(repairActionImplementationPackAvailable({ id: "action-1", approvalState: "approved" }), true);
  assert.equal(repairActionImplementationPackAvailable({ id: "action-1", executionState: "applied" }), true);
});

test("repair action UI exposes proof receipt only after fixed rerun proof", () => {
  assert.equal(
    repairActionProofReceiptUrl("report 1", "action/1"),
    "/api/reports/report%201/repair-actions/action%2F1/proof.md"
  );
  assert.equal(repairActionProofReceiptAvailable({ id: "action-1", approvalState: "approved", executionState: "applied" }), false);
  assert.equal(repairActionProofReceiptAvailable({ id: "action-1", approvalState: "approved", executionState: "applied", rerunState: "still_open", rerunReportId: "rerun-1" }), false);
  assert.equal(repairActionProofReceiptAvailable({ id: "action-1", approvalState: "approved", executionState: "applied", rerunState: "fixed" }), false);
  assert.equal(repairActionProofReceiptAvailable({ id: "action-1", approvalState: "approved", executionState: "applied", rerunState: "fixed", rerunReportId: "rerun-1" }), true);
});

test("billing delivery readiness copy is customer-facing", () => {
  const text = deliveryReadinessText({
    status: "blocked",
    blockers: [
      { id: "customer_note_missing", label: "Add a customer-facing delivery note." },
      { id: "delivery_link_missing", label: "Add a delivery link." },
      { id: "final_rerun_missing", label: "Attach a final rerun report." }
    ]
  });

  assert.equal(
    text,
    "We are preparing your delivery update. We are preparing the delivery link. Final rerun proof is not attached yet."
  );
  assert.equal(text.includes("Add "), false);
  assert.equal(text.includes("Attach "), false);
});

test("billing delivery readiness label does not call blocked requests start-ready", () => {
  assert.equal(
    deliveryReadinessLabel({
      status: "blocked",
      readyForStart: true,
      readyForDelivery: false
    }),
    "Waiting on repair proof"
  );
});

test("billing delivery readiness copy covers ready delivered and proposal states", () => {
  assert.equal(
    deliveryReadinessText({ status: "ready", readyForDelivery: true }),
    "Delivery note, delivery link, approval, and rerun proof are ready."
  );
  assert.equal(
    deliveryReadinessText({ status: "delivered" }),
    "Delivery and rerun proof are attached."
  );
  assert.equal(
    deliveryReadinessText({ status: "blocked", blockers: [{ id: "approved_proposal_missing" }] }),
    "A repair proposal still needs your approval."
  );
  assert.equal(
    deliveryReadinessText({ status: "blocked", blockers: [{ id: "proposal_state_unavailable" }] }),
    "Repair proposal status is temporarily unavailable."
  );
});

test("billing delivery readiness copy hides unknown backend blocker labels", () => {
  const text = deliveryReadinessText({
    status: "blocked",
    blockers: [{ id: "future_internal_blocker", label: "Attach payment-secret-123 before delivery." }]
  });

  assert.equal(text, "We are still preparing this repair pass.");
  assert.equal(text.includes("payment-secret-123"), false);
  assert.equal(text.includes("Attach"), false);
});

test("funnel beacon payloads are allow-listed event names with plain page paths only", () => {
  assert.deepEqual(funnelEventPayload("page_view", "/"), { event: "page_view", page: "/" });
  assert.deepEqual(funnelEventPayload("access_form_shown", "/"), { event: "access_form_shown", page: "/" });
  assert.deepEqual(funnelEventPayload("cta_activation", "/check"), { event: "cta_activation", page: "/check" });

  assert.equal(funnelEventPayload("click", "/"), null, "unknown events never leave the browser");
  assert.equal(funnelEventPayload("page_view", ""), null);
  assert.equal(funnelEventPayload("page_view", "/demo?email=x@y.com"), null, "query strings never leave the browser");
  assert.equal(funnelEventPayload("page_view", "/demo#top"), null);
  assert.equal(funnelEventPayload("page_view", "https://evil.example/"), null);
  assert.equal(funnelEventPayload("page_view", "/a/../b"), null);
});
