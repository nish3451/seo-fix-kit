import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SEOFIXKIT_LOCAL_WEBHOOK_TIMEOUT_MS = "25";
process.env.BETA_ACCESS_PASSWORD = "testpw";

const { app, resetLocalStateForTests, seedProtectedLocalAuditForTests } = await import("./index.js");

resetLocalStateForTests();

const originalFetch = globalThis.fetch;
const webhookDeliveries = [];
const privateWebhookDeliveries = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
    const query = new URL(url);
    const name = query.searchParams.get("name");
    const answer = name === "dns-private-webhook.example.com"
      ? [{ type: 1, data: "127.0.0.1" }]
      : [];
    return new Response(JSON.stringify({ Answer: answer }), {
      status: 200,
      headers: { "content-type": "application/dns-json" }
    });
  }
  if (url.startsWith("https://webhook.example.com/")) {
    webhookDeliveries.push({
      url,
      event: init.headers?.["x-seofixkit-event"] || "",
      signature: init.headers?.["x-seofixkit-signature"] || "",
      body: JSON.parse(init.body || "{}")
    });
    return new Response("", { status: 204 });
  }
  if (url.startsWith("https://dns-private-webhook.example.com/")) {
    privateWebhookDeliveries.push({ url });
    return new Response("", { status: 204 });
  }
  if (url.startsWith("https://timeout-webhook.example.com/")) {
    return new Promise((resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  }
  return originalFetch(input, init);
};

const server = await new Promise((resolve) => {
  const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
});

try {
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const publicRobots = await (await fetch(`${origin}/robots.txt`)).text();
  assert.match(publicRobots, new RegExp(`Sitemap: ${origin.replaceAll(".", "\\.")}/sitemap\\.xml`));
  const publicSitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  assert.match(publicSitemap, new RegExp(`${origin.replaceAll(".", "\\.")}/methodology`));
  assert.match(publicSitemap, new RegExp(`${origin.replaceAll(".", "\\.")}/llms\\.txt`));
  assert.doesNotMatch(publicSitemap, /\/fixture\/rendered-page/);
  const fixtureRobots = await (await fetch(`${origin}/fixture/robots.txt`)).text();
  assert.match(fixtureRobots, new RegExp(`Sitemap: ${origin.replaceAll(".", "\\.")}/fixture/sitemap\\.xml`));
  const fixtureSitemap = await (await fetch(`${origin}/fixture/sitemap.xml`)).text();
  assert.match(fixtureSitemap, /\/fixture\/rendered-page/);

  const seeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "paid"
  });

  const deleted = await fetch(`${origin}/v1/audits/${seeded.auditId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(deleted.status, 409);
  const deletedBody = await deleted.json();
  assert.equal(deletedBody.code, "FIX_PACK_REPORT_LOCKED");
  assert.equal(deletedBody.fixRequestId, seeded.fixRequestId);

  const auditResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}`, {
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(auditResponse.status, 200);
  const auditBody = await auditResponse.json();
  assert.equal(auditBody.audit.report_id, seeded.reportId);

  const reportResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/report`, {
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(reportResponse.status, 200);
  const reportBody = await reportResponse.json();
  assert.equal(reportBody.report.id, seeded.reportId);
  assert.equal(reportBody.report.repair_queue.total, 1);
  assert.equal(reportBody.report.repair_queue.unavailable, false);
  assert.equal(reportBody.report.findings[0].repair_queue.status, "open");
  assert.equal(reportBody.report.findings[0].repair_queue.unavailable, false);

  const issuesResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/issues`, {
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(issuesResponse.status, 200);
  const issuesBody = await issuesResponse.json();
  assert.equal(issuesBody.issues[0].repair_queue.status, "open");
  assert.equal(issuesBody.issues[0].repair_queue.unavailable, false);

  const apiQueueResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/repair-queue`, {
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(apiQueueResponse.status, 200);
  const apiQueueBody = await apiQueueResponse.json();
  assert.equal(apiQueueBody.audit_id, seeded.auditId);
  assert.equal(apiQueueBody.report_id, seeded.reportId);
  assert.equal(apiQueueBody.summary.total, 1);
  assert.equal(apiQueueBody.items[0].issue_id, "finding-1");
  assert.ok(apiQueueBody.items[0].id);
  assert.equal(apiQueueBody.items[0].status, "open");

  const apiActionResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/repair-actions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${seeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      issueId: "finding-1",
      proposedChange: "Draft the missing title for review."
    })
  });
  assert.equal(apiActionResponse.status, 201);
  const apiActionBody = await apiActionResponse.json();
  assert.equal(apiActionBody.action.approval_state, "drafted");
  assert.equal(apiActionBody.action.issue_id, "finding-1");
  assert.equal(apiActionBody.queue.summary.drafted, 1);

  const apiReportWithActionResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/report`, {
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(apiReportWithActionResponse.status, 200);
  const apiReportWithActionBody = await apiReportWithActionResponse.json();
  assert.equal(apiReportWithActionBody.report.findings[0].repair_queue.status, "drafted");
  assert.equal(apiReportWithActionBody.report.findings[0].repair_queue.latest_action.approval_state, "drafted");

  const apiPatchActionResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/repair-actions/${apiActionBody.action.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${seeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      approvalState: "approved",
      executionState: "applied"
    })
  });
  assert.equal(apiPatchActionResponse.status, 200);
  const apiPatchActionBody = await apiPatchActionResponse.json();
  assert.equal(apiPatchActionBody.action.execution_state, "applied");
  assert.equal(apiPatchActionBody.queue.summary.applied, 1);

  const loginResponse = await fetch(`${origin}/api/beta/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "paid-owner@example.com", password: "testpw" })
  });
  assert.equal(loginResponse.status, 200);
  const sessionCookie = loginResponse.headers.get("set-cookie");
  assert.ok(sessionCookie);

  const accountResponse = await fetch(`${origin}/api/account/summary`, {
    headers: { cookie: sessionCookie }
  });
  assert.equal(accountResponse.status, 200);
  const accountBody = await accountResponse.json();
  assert.equal(accountBody.metrics.appliedRepairs, 1);
  assert.equal(accountBody.nextActions[0].id, "rerun-applied-repair");

  const webhookResponse = await fetch(`${origin}/api/developer/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      url: "https://webhook.example.com/seofixkit",
      events: [
        "repair_action.drafted",
        "repair_action.approved",
        "repair_action.applied",
        "repair_action.fixed",
        "repair_action.regressed"
      ]
    })
  });
  assert.equal(webhookResponse.status, 200);
  const webhookBody = await webhookResponse.json();
  assert.equal(webhookBody.webhook.events.includes("repair_action.drafted"), true);

  const webhookSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled",
    url: "https://webhook-target.example.com/"
  });
  const webhookActionResponse = await fetch(`${origin}/v1/audits/${webhookSeeded.auditId}/repair-actions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${webhookSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      issueId: "finding-1",
      proposedChange: "Draft the local webhook title fix."
    })
  });
  assert.equal(webhookActionResponse.status, 201);
  const webhookActionBody = await webhookActionResponse.json();
  const webhookPatchResponse = await fetch(`${origin}/v1/audits/${webhookSeeded.auditId}/repair-actions/${webhookActionBody.action.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${webhookSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      approvalState: "approved",
      executionState: "applied"
    })
  });
  assert.equal(webhookPatchResponse.status, 200);
  await waitForCondition(() => webhookDeliveries.length >= 3, "repair action webhooks");
  const deliveredEvents = webhookDeliveries.map((delivery) => delivery.event);
  assert.deepEqual(deliveredEvents.slice(0, 3), [
    "repair_action.drafted",
    "repair_action.approved",
    "repair_action.applied"
  ]);
  const draftedPayload = webhookDeliveries[0].body.data.repair_action;
  assert.equal(draftedPayload.id, webhookActionBody.action.id);
  assert.equal(draftedPayload.issue_id, "finding-1");
  assert.equal(draftedPayload.report_id, webhookSeeded.reportId);
  assert.equal(draftedPayload.issue_title, "Missing title");
  assert.equal(Object.hasOwn(draftedPayload, "proposed_change"), false);
  assert.equal(Object.hasOwn(draftedPayload, "source_proof"), false);
  assert.match(webhookDeliveries[0].signature, /^t=\d+,v1=[a-f0-9]{64}$/);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const fixedProofSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled",
    url: "https://webhook-target.example.com/",
    findingPageUrl: "https://webhook-target.example.com/fixed-proof-only"
  });
  const webhookFixedResponse = await fetch(`${origin}/v1/audits/${webhookSeeded.auditId}/repair-actions/${webhookActionBody.action.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${webhookSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      approvalState: "approved",
      executionState: "applied",
      rerunState: "fixed",
      rerunReportId: fixedProofSeeded.reportId
    })
  });
  assert.equal(webhookFixedResponse.status, 200);
  await waitForCondition(() => webhookDeliveries.length >= 4, "repair action fixed webhook");
  const fixedPayload = webhookDeliveries[3].body.data.repair_action;
  assert.equal(webhookDeliveries[3].event, "repair_action.fixed");
  assert.equal(fixedPayload.rerun_state, "fixed");
  assert.equal(fixedPayload.rerun_report_id, fixedProofSeeded.reportId);
  assert.equal(Object.hasOwn(fixedPayload, "proposed_change"), false);
  assert.equal(Object.hasOwn(fixedPayload, "source_proof"), false);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const regressedProofSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled",
    url: "https://webhook-target.example.com/"
  });
  const webhookRegressedResponse = await fetch(`${origin}/v1/audits/${webhookSeeded.auditId}/repair-actions/${webhookActionBody.action.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${webhookSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      approvalState: "approved",
      executionState: "applied",
      rerunState: "regressed",
      rerunReportId: regressedProofSeeded.reportId
    })
  });
  assert.equal(webhookRegressedResponse.status, 200);
  await waitForCondition(() => webhookDeliveries.length >= 5, "repair action regressed webhook");
  const regressedPayload = webhookDeliveries[4].body.data.repair_action;
  assert.equal(webhookDeliveries[4].event, "repair_action.regressed");
  assert.equal(regressedPayload.rerun_state, "regressed");
  assert.equal(regressedPayload.rerun_report_id, regressedProofSeeded.reportId);
  assert.equal(Object.hasOwn(regressedPayload, "proposed_change"), false);
  assert.equal(Object.hasOwn(regressedPayload, "source_proof"), false);

  const timeoutWebhookResponse = await fetch(`${origin}/api/developer/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      url: "https://timeout-webhook.example.com/seofixkit",
      events: ["repair_action.drafted"]
    })
  });
  assert.equal(timeoutWebhookResponse.status, 200);
  const timeoutWebhookBody = await timeoutWebhookResponse.json();
  const timeoutWebhookSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled",
    url: "https://timeout-webhook-target.example.com/"
  });
  const timeoutActionResponse = await fetch(`${origin}/v1/audits/${timeoutWebhookSeeded.auditId}/repair-actions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${timeoutWebhookSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      issueId: "finding-1",
      proposedChange: "Draft the timeout webhook title fix."
    })
  });
  assert.equal(timeoutActionResponse.status, 201);
  await waitForCondition(async () => {
    const summaryResponse = await fetch(`${origin}/api/developer`, {
      headers: { cookie: sessionCookie }
    });
    const summary = await summaryResponse.json();
    const timeoutWebhook = summary.webhooks.find((webhook) => webhook.id === timeoutWebhookBody.webhook.id);
    return timeoutWebhook?.lastDeliveryStatus === "failed" && /timed out/i.test(timeoutWebhook.lastError || "");
  }, "timed-out webhook failure status");

  const privateDnsWebhookResponse = await fetch(`${origin}/api/developer/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      url: "https://dns-private-webhook.example.com/seofixkit",
      events: ["repair_action.drafted"]
    })
  });
  assert.equal(privateDnsWebhookResponse.status, 200);
  const privateDnsWebhookBody = await privateDnsWebhookResponse.json();
  const privateDnsWebhookSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled",
    url: "https://dns-private-webhook-target.example.com/"
  });
  const privateDnsActionResponse = await fetch(`${origin}/v1/audits/${privateDnsWebhookSeeded.auditId}/repair-actions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${privateDnsWebhookSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      issueId: "finding-1",
      proposedChange: "Draft the private DNS webhook title fix."
    })
  });
  assert.equal(privateDnsActionResponse.status, 201);
  await waitForCondition(async () => {
    const summaryResponse = await fetch(`${origin}/api/developer`, {
      headers: { cookie: sessionCookie }
    });
    const summary = await summaryResponse.json();
    const privateDnsWebhook = summary.webhooks.find((webhook) => webhook.id === privateDnsWebhookBody.webhook.id);
    return privateDnsWebhook?.lastDeliveryStatus === "failed" && /private|internal/i.test(privateDnsWebhook.lastError || "");
  }, "private-DNS webhook failure status");
  assert.equal(privateWebhookDeliveries.length, 0);

  const freshSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled"
  });
  const freshQueueResponse = await fetch(`${origin}/api/reports/${freshSeeded.reportId}/repair-queue`, {
    headers: { cookie: sessionCookie }
  });
  assert.equal(freshQueueResponse.status, 200);
  const freshQueueBody = await freshQueueResponse.json();
  assert.ok(freshQueueBody.items[0].id);

  const freshFixRequestResponse = await fetch(`${origin}/api/beta/fix-request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      reportId: freshSeeded.reportId,
      queueItemId: freshQueueBody.items[0].id
    })
  });
  assert.equal(freshFixRequestResponse.status, 200);
  const freshFixRequestBody = await freshFixRequestResponse.json();
  assert.equal(freshFixRequestBody.selectedRepair.queueItemId, freshQueueBody.items[0].id);
  const repeatedFreshFixRequestResponse = await fetch(`${origin}/api/beta/fix-request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      reportId: freshSeeded.reportId,
      queueItemId: freshQueueBody.items[0].id
    })
  });
  assert.equal(repeatedFreshFixRequestResponse.status, 200);
  const repeatedFreshFixRequestBody = await repeatedFreshFixRequestResponse.json();
  assert.equal(repeatedFreshFixRequestBody.request.id, freshFixRequestBody.request.id);
  assert.equal(repeatedFreshFixRequestBody.selectedRepair.queueItemId, freshQueueBody.items[0].id);
  const stalePendingQueuePatch = await fetch(`${origin}/api/reports/${freshSeeded.reportId}/repair-queue`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      items: [{
        issueId: freshQueueBody.items[0].issueId,
        status: "ignored",
        actionMode: "self_serve"
      }]
    })
  });
  assert.equal(stalePendingQueuePatch.status, 200);
  const stalePendingFixRequestResponse = await fetch(`${origin}/api/beta/fix-request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      reportId: freshSeeded.reportId,
      queueItemId: freshQueueBody.items[0].id
    })
  });
  assert.equal(stalePendingFixRequestResponse.status, 409);
  const stalePendingFixRequestBody = await stalePendingFixRequestResponse.json();
  assert.equal(stalePendingFixRequestBody.code, "FIX_PACK_REPAIR_SELECTION_UNAVAILABLE");

  const localClosedSelectionSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled",
    url: "https://closed-selection.example.com/"
  });
  const localClosedQueueResponse = await fetch(`${origin}/api/reports/${localClosedSelectionSeeded.reportId}/repair-queue`, {
    headers: { cookie: sessionCookie }
  });
  assert.equal(localClosedQueueResponse.status, 200);
  const localClosedQueueBody = await localClosedQueueResponse.json();
  const localClosedQueueItem = localClosedQueueBody.items[0];
  const localClosedQueuePatch = await fetch(`${origin}/api/reports/${localClosedSelectionSeeded.reportId}/repair-queue`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      items: [{
        issueId: localClosedQueueItem.issueId,
        status: "ignored",
        actionMode: "self_serve"
      }]
    })
  });
  assert.equal(localClosedQueuePatch.status, 200);
  const localClosedFixRequestResponse = await fetch(`${origin}/api/beta/fix-request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      reportId: localClosedSelectionSeeded.reportId,
      queueItemId: localClosedQueueItem.id
    })
  });
  assert.equal(localClosedFixRequestResponse.status, 409);
  const localClosedFixRequestBody = await localClosedFixRequestResponse.json();
  assert.equal(localClosedFixRequestBody.code, "FIX_PACK_REPAIR_SELECTION_UNAVAILABLE");
  assert.equal(localClosedFixRequestBody.selectedRepair, null);

  const localMismatchSelectionSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled",
    url: "https://mismatched-selection.example.com/"
  });
  const localMismatchQueueResponse = await fetch(`${origin}/api/reports/${localMismatchSelectionSeeded.reportId}/repair-queue`, {
    headers: { cookie: sessionCookie }
  });
  assert.equal(localMismatchQueueResponse.status, 200);
  const localMismatchQueueBody = await localMismatchQueueResponse.json();
  const localMismatchFixRequestResponse = await fetch(`${origin}/api/beta/fix-request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      reportId: localMismatchSelectionSeeded.reportId,
      selectedRepair: {
        queueItemId: localMismatchQueueBody.items[0].id,
        issueId: "different-issue"
      }
    })
  });
  assert.equal(localMismatchFixRequestResponse.status, 409);
  const localMismatchFixRequestBody = await localMismatchFixRequestResponse.json();
  assert.equal(localMismatchFixRequestBody.code, "FIX_PACK_REPAIR_SELECTION_UNAVAILABLE");
  assert.equal(localMismatchFixRequestBody.selectedRepair, null);

  const closeQueueResponse = await fetch(`${origin}/api/reports/${seeded.reportId}/repair-queue`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      items: [{
        issueId: "finding-1",
        status: "ignored",
        actionMode: "self_serve"
      }]
    })
  });
  assert.equal(closeQueueResponse.status, 200);
  const closeQueueBody = await closeQueueResponse.json();
  assert.equal(closeQueueBody.items[0].status, "ignored");

  const closedFixRequestResponse = await fetch(`${origin}/api/beta/fix-request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      reportId: seeded.reportId,
      queueItemId: apiActionBody.action.queue_item_id
    })
  });
  assert.equal(closedFixRequestResponse.status, 200);
  const closedFixRequestBody = await closedFixRequestResponse.json();
  assert.equal(closedFixRequestBody.mode, "paid");
  assert.equal(closedFixRequestBody.request.id, seeded.fixRequestId);
  assert.equal(closedFixRequestBody.selectedRepair, null);

  const staleProofSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled"
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const staleSourceSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled"
  });
  const staleSourceActionResponse = await fetch(`${origin}/v1/audits/${staleSourceSeeded.auditId}/repair-actions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${staleSourceSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      issueId: "finding-1",
      proposedChange: "Draft the stale-proof title fix."
    })
  });
  assert.equal(staleSourceActionResponse.status, 201);
  const staleSourceActionBody = await staleSourceActionResponse.json();
  const staleSourceApplyResponse = await fetch(`${origin}/v1/audits/${staleSourceSeeded.auditId}/repair-actions/${staleSourceActionBody.action.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${staleSourceSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      approvalState: "approved",
      executionState: "applied"
    })
  });
  assert.equal(staleSourceApplyResponse.status, 200);
  const staleQueueProofResponse = await fetch(`${origin}/v1/audits/${staleSourceSeeded.auditId}/repair-queue`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${staleSourceSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      items: [{
        issue_id: "finding-1",
        status: "applied",
        rerun_status: "still_open",
        rerun_report_id: staleProofSeeded.reportId
      }]
    })
  });
  assert.equal(staleQueueProofResponse.status, 400);

  const wrongPageSourceSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled"
  });
  const wrongPageActionResponse = await fetch(`${origin}/v1/audits/${wrongPageSourceSeeded.auditId}/repair-actions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${wrongPageSourceSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      issueId: "finding-1",
      proposedChange: "Draft the wrong-page title fix."
    })
  });
  assert.equal(wrongPageActionResponse.status, 201);
  const wrongPageActionBody = await wrongPageActionResponse.json();
  const wrongPageApplyResponse = await fetch(`${origin}/v1/audits/${wrongPageSourceSeeded.auditId}/repair-actions/${wrongPageActionBody.action.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${wrongPageSourceSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      approvalState: "approved",
      executionState: "applied"
    })
  });
  assert.equal(wrongPageApplyResponse.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const wrongPageProofSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled",
    url: "https://example.com/other"
  });
  const wrongPageProofResponse = await fetch(`${origin}/v1/audits/${wrongPageSourceSeeded.auditId}/repair-actions/${wrongPageActionBody.action.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${wrongPageSourceSeeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      rerunState: "still_open",
      rerunReportId: wrongPageProofSeeded.reportId
    })
  });
  assert.equal(wrongPageProofResponse.status, 404);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const rerunSeeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "cancelled"
  });
  const queueProofResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/repair-actions/${apiActionBody.action.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${seeded.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      rerunState: "still_open",
      rerunReportId: rerunSeeded.reportId
    })
  });
  assert.equal(queueProofResponse.status, 200);
  const queueProofBody = await queueProofResponse.json();
  assert.equal(queueProofBody.queue.items[0].rerun_status, "still_open");
  assert.equal(queueProofBody.queue.items[0].last_rerun_report_id, rerunSeeded.reportId);

  const deleteRerunProofResponse = await fetch(`${origin}/v1/audits/${rerunSeeded.auditId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(deleteRerunProofResponse.status, 200);

  const cleanedQueueResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/repair-queue`, {
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(cleanedQueueResponse.status, 200);
  const cleanedQueueBody = await cleanedQueueResponse.json();
  assert.equal(cleanedQueueBody.items[0].status, "applied");
  assert.equal(cleanedQueueBody.items[0].rerun_status, "not_run");
  assert.equal(cleanedQueueBody.items[0].last_rerun_report_id, "");

  const actionResponse = await fetch(`${origin}/api/reports/${seeded.reportId}/repair-actions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      issueId: "finding-1",
      proposedChange: "Draft the missing title for review."
    })
  });
  assert.equal(actionResponse.status, 201);
  const actionBody = await actionResponse.json();
  assert.equal(actionBody.action.executionState, "not_started");

  const invalidFixedResponse = await fetch(`${origin}/api/reports/${seeded.reportId}/repair-actions/${actionBody.action.id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify({
      approvalState: "approved",
      rerunState: "fixed",
      rerunReportId: seeded.reportId
    })
  });
  assert.equal(invalidFixedResponse.status, 400);
  const invalidFixedBody = await invalidFixedResponse.json();
  assert.match(invalidFixedBody.error, /applied action/i);

  console.log(JSON.stringify({ ok: true, checked: "local developer API paid report delete lock" }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function waitForCondition(predicate, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for ${label}.`);
}
