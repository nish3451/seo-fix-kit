import assert from "node:assert/strict";
import test from "node:test";
import {
  apiCreateRepairAction,
  apiDeleteAudit,
  apiGetAuditIssues,
  apiGetAuditReport,
  apiGetRepairActionImplementationPack,
  apiGetRepairActionProofReceipt,
  apiGetRepairQueue,
  apiSaveRepairQueue,
  apiUpdateRepairAction
} from "./developer-api.js";
import { sha256Hex } from "../lib/security.js";

test("Developer API overlays safe repair queue and action status on issues", async () => {
  const env = await fakeDeveloperApiEnv();
  const request = apiRequest(`/v1/audits/${env.auditId}/issues`, env.apiToken);

  const response = await apiGetAuditIssues(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.total, 1);
  assert.equal(body.issues[0].id, "issue-1");
  assert.equal(body.issues[0].repair_queue.status, "drafted");
  assert.equal(body.issues[0].repair_queue.action_mode, "cms_draft");
  assert.equal(body.issues[0].repair_queue.latest_action.approval_state, "drafted");
  assert.equal(body.issues[0].repair_queue.latest_action.action_type, "metadata_copy");
  assert.doesNotMatch(JSON.stringify(body), /Private draft title copy/i);
});

test("Developer API report response includes repair queue summary", async () => {
  const env = await fakeDeveloperApiEnv();
  const request = apiRequest(`/v1/audits/${env.auditId}/report`, env.apiToken);

  const response = await apiGetAuditReport(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.report.id, env.reportId);
  assert.equal(body.report.repair_queue.total, 1);
  assert.equal(body.report.repair_queue.drafted, 1);
  assert.equal(body.report.repair_queue.awaiting_approval, 1);
  assert.equal(body.report.findings[0].repair_queue.latest_action.execution_state, "not_started");
});

test("Developer API report response includes per-page scores", async () => {
  const env = await fakeDeveloperApiEnv();
  const request = apiRequest(`/v1/audits/${env.auditId}/report`, env.apiToken);

  const response = await apiGetAuditReport(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(Array.isArray(body.report.page_summaries), true);
  assert.equal(body.report.page_summaries.length, 1);
  assert.equal(body.report.page_summaries[0].url, "https://example.com/");
  assert.equal(body.report.page_summaries[0].score, 75);
  assert.equal(body.report.page_summaries[0].path, "/");
  assert.equal(body.report.page_summaries[0].wordCount, 320);
});

test("Developer API exposes owner-only repair action workflow for API agents", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [] });

  const createResponse = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      actionMode: "cms_draft",
      actionType: "metadata_copy",
      proposedChange: "Draft the fixed title for review."
    })
  }), env);
  assert.equal(createResponse.status, 201);
  const createBody = await createResponse.json();
  assert.equal(createBody.action.proposed_change, "Draft the fixed title for review.");
  assert.equal(env.queueItems[0].status, "drafted");

  const queueResponse = await apiGetRepairQueue(apiRequest(`/v1/audits/${env.auditId}/repair-queue`, env.apiToken), env);
  assert.equal(queueResponse.status, 200);
  const queueBody = await queueResponse.json();
  assert.equal(queueBody.items[0].latest_action.id, env.actions[0].id);
  assert.equal(queueBody.items[0].latest_action.approval_state, "drafted");
  assert.equal(queueBody.items[0].latest_action.execution_state, "not_started");
  assert.equal(queueBody.items[0].latest_action.proposed_change, undefined);
  assert.equal(queueBody.items[0].latest_action.source_proof, undefined);
  assert.doesNotMatch(JSON.stringify(queueBody), /Draft the fixed title for review|source_proof|proposed_change/i);

  const rejectedFixedResponse = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied", rerunState: "fixed" })
    }
  ), env);
  assert.equal(rejectedFixedResponse.status, 400);

  const appliedResponse = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }
  ), env);
  assert.equal(appliedResponse.status, 200);
  const appliedBody = await appliedResponse.json();
  assert.equal(appliedBody.action.execution_state, "applied");
  assert.equal(appliedBody.queue.summary.needs_rerun, 1);

  const latestQueueResponse = await apiGetRepairQueue(apiRequest(`/v1/audits/${env.auditId}/repair-queue`, env.apiToken), env);
  assert.equal(latestQueueResponse.status, 200);
  const latestQueueBody = await latestQueueResponse.json();
  assert.equal(latestQueueBody.items[0].latest_action.action_type, "metadata_copy");
  assert.equal(latestQueueBody.items[0].latest_action.approval_state, "approved");
  assert.equal(latestQueueBody.items[0].latest_action.execution_state, "applied");
  assert.doesNotMatch(JSON.stringify(latestQueueBody), /Draft the fixed title for review|source_proof|proposed_change/i);

  const packResponse = await apiGetRepairActionImplementationPack(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/implementation.md`,
    env.apiToken
  ), env);
  assert.equal(packResponse.status, 200);
  assert.match(packResponse.headers.get("content-type") || "", /text\/markdown/);
  assert.equal(packResponse.headers.get("cache-control"), "no-store");
  assert.equal(packResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  const packMarkdown = await packResponse.text();
  assert.match(packMarkdown, /# SEOFixKit Implementation Pack/);
  assert.match(packMarkdown, /Draft the fixed title for review/);
  assert.match(packMarkdown, /Rendered title is missing/);
  assert.doesNotMatch(packMarkdown, /sfk_live_|token_hash|DODO_SEOFIXKIT_API_KEY/i);

  const missingTokenProof = await apiGetRepairActionProofReceipt(
    new Request(`https://seofixkit.test/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/proof.md`),
    env
  );
  assert.equal(missingTokenProof.status, 401);

  env.reports.push({
    id: "rerun-fixed-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-fixed-report-1"))
  });
  const fixedResponse = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "fixed", rerunReportId: "rerun-fixed-report-1" })
    }
  ), env);
  assert.equal(fixedResponse.status, 200);

  const receiptResponse = await apiGetRepairActionProofReceipt(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/proof.md`,
    env.apiToken
  ), env);
  assert.equal(receiptResponse.status, 200);
  assert.match(receiptResponse.headers.get("content-type") || "", /text\/markdown/);
  assert.equal(receiptResponse.headers.get("cache-control"), "no-store");
  assert.equal(receiptResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(receiptResponse.headers.get("content-disposition") || "", /repair-proof\.md/);
  const receiptMarkdown = await receiptResponse.text();
  assert.match(receiptMarkdown, /# SEOFixKit Repair Proof Receipt/);
  assert.match(receiptMarkdown, /Rerun Proof/);
  assert.match(receiptMarkdown, /rerun-fixed-report-1/);
  assert.doesNotMatch(receiptMarkdown, /sfk_live_|token_hash|DODO_SEOFIXKIT_API_KEY/i);

  env.tokens[0].owner_email = "other@example.com";
  const otherOwnerProof = await apiGetRepairActionProofReceipt(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/proof.md`,
    env.apiToken
  ), env);
  assert.equal(otherOwnerProof.status, 404);
});

test("Developer API implementation pack rejects drafts and other owners", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [] });
  const createResponse = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      proposedChange: "Draft the fixed title for review."
    })
  }), env);
  assert.equal(createResponse.status, 201);

  const draftPack = await apiGetRepairActionImplementationPack(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/implementation.md`,
    env.apiToken
  ), env);
  assert.equal(draftPack.status, 409);
  assert.match((await draftPack.json()).error, /Approve the repair action/i);

  await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved" })
    }
  ), env);

  env.tokens[0].owner_email = "other@example.com";
  const otherOwnerPack = await apiGetRepairActionImplementationPack(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/implementation.md`,
    env.apiToken
  ), env);
  assert.equal(otherOwnerPack.status, 404);
});

test("Developer API implementation pack fails closed for auth and stale queue state", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [] });
  const createResponse = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      proposedChange: "Draft the fixed title for review."
    })
  }), env);
  assert.equal(createResponse.status, 201);
  await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved" })
    }
  ), env);

  const missingToken = await apiGetRepairActionImplementationPack(
    new Request(`https://seofixkit.test/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(missingToken.status, 401);

  env.tokens[0].status = "revoked";
  const revokedToken = await apiGetRepairActionImplementationPack(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/implementation.md`,
    env.apiToken
  ), env);
  assert.equal(revokedToken.status, 401);
  env.tokens[0].status = "active";

  env.actions[0].action_mode = "unsupported";
  const unsupportedResponse = await apiGetRepairActionImplementationPack(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/implementation.md`,
    env.apiToken
  ), env);
  assert.equal(unsupportedResponse.status, 409);
  assert.match((await unsupportedResponse.json()).error, /Unsupported repair actions/i);
  env.actions[0].action_mode = "self_serve";

  env.queueItems[0].status = "ignored";
  const ignoredItemResponse = await apiGetRepairActionImplementationPack(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/implementation.md`,
    env.apiToken
  ), env);
  assert.equal(ignoredItemResponse.status, 409);
  assert.match((await ignoredItemResponse.json()).error, /Ignored repair items/i);
  env.queueItems[0].status = "approved";

  env.actions[0].queue_item_id = "missing-queue-row";
  const staleQueueResponse = await apiGetRepairActionImplementationPack(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}/implementation.md`,
    env.apiToken
  ), env);
  assert.equal(staleQueueResponse.status, 409);
  assert.match((await staleQueueResponse.json()).error, /Repair item not found/i);
});

test("Developer API repair action ignored state closes the queue item", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [] });
  const created = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      proposedChange: "Draft the fixed title for review."
    })
  }), env);
  assert.equal(created.status, 201);

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approval_state: "ignored" })
    }
  ), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.action.approval_state, "ignored");
  assert.equal(body.queue.items[0].status, "ignored");
  assert.equal(body.queue.summary.ignored, 1);
  assert.equal(env.queueItems[0].status, "ignored");
});

test("Developer API rejects unknown-only repair action patches", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "11111111-1111-4111-8111-111111111111";
  const actionUpdatedAt = env.actions[0].updated_at;
  const queueUpdatedAt = env.queueItems[0].updated_at;

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "inspect draft" })
    }
  ), env);

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /state field/i);
  assert.equal(env.actions[0].updated_at, actionUpdatedAt);
  assert.equal(env.queueItems[0].updated_at, queueUpdatedAt);
});

test("Developer API rejects unknown-only repair queue patches", async () => {
  const env = await fakeDeveloperApiEnv();
  const queueUpdatedAt = env.queueItems[0].updated_at;

  const emptyResponse = await apiSaveRepairQueue(apiRequest(
    `/v1/audits/${env.auditId}/repair-queue`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ items: [] })
    }
  ), env);

  assert.equal(emptyResponse.status, 400);
  const emptyBody = await emptyResponse.json();
  assert.match(emptyBody.error, /mutable field/i);
  assert.equal(env.queueItems[0].updated_at, queueUpdatedAt);

  const badModeResponse = await apiSaveRepairQueue(apiRequest(
    `/v1/audits/${env.auditId}/repair-queue`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ items: [{ issue_id: "issue-1", action_mode: "typo" }] })
    }
  ), env);

  assert.equal(badModeResponse.status, 400);
  const badModeBody = await badModeResponse.json();
  assert.match(badModeBody.error, /mode/i);
  assert.equal(env.queueItems[0].updated_at, queueUpdatedAt);

  const response = await apiSaveRepairQueue(apiRequest(
    `/v1/audits/${env.auditId}/repair-queue`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ items: [{ issue_id: "issue-1", note: "noop" }] })
    }
  ), env);

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /mutable field/i);
  assert.equal(env.queueItems[0].updated_at, queueUpdatedAt);
  assert.equal(env.queueItems[0].status, "drafted");
});

test("Developer API rejects invalid explicit repair action options", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [] });

  const badMode = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      actionMode: "typo",
      proposedChange: "Draft the fixed title for review."
    })
  }), env);
  assert.equal(badMode.status, 400);
  const badModeBody = await badMode.json();
  assert.match(badModeBody.error, /mode/i);

  const badType = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      actionType: "typo",
      proposedChange: "Draft the fixed title for review."
    })
  }), env);
  assert.equal(badType.status, 400);
  const badTypeBody = await badType.json();
  assert.match(badTypeBody.error, /type/i);
  assert.equal(env.actions.length, 0);
  assert.equal(env.queueItems[0].status, "open");
});

test("Developer API repair queue read materializes stable queue item ids", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [] });

  const response = await apiGetRepairQueue(apiRequest(`/v1/audits/${env.auditId}/repair-queue`, env.apiToken), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items[0].issue_id, "issue-1");
  assert.ok(body.items[0].id);
  assert.equal(env.queueItems.length, 1);
  assert.equal(env.queueItems[0].id, body.items[0].id);
});

test("Developer API overlays preserve old saved state before response caps", async () => {
  const reportId = "example-report-1";
  const env = await fakeDeveloperApiEnv({
    queueItems: [
      developerRepairQueueRow({
        id: "queue-fixed",
        report_id: reportId,
        issue_id: "issue-1",
        title: "Missing title",
        severity: "critical",
        status: "fixed",
        rerun_status: "fixed",
        last_rerun_report_id: "rerun-report-1",
        updated_at: "2020-01-01T00:00:00.000Z"
      }),
      ...Array.from({ length: 120 }, (_, index) => developerRepairQueueRow({
        id: `queue-old-${index}`,
        report_id: reportId,
        issue_id: `old-issue-${index}`,
        title: `Old saved repair ${index}`,
        severity: "notice",
        status: "ignored",
        updated_at: new Date(Date.parse("2020-01-02T00:00:00.000Z") + index * 1000).toISOString()
      }))
    ],
    actions: []
  });
  env.simulateRepairQueueSqlLimit = true;

  const queueResponse = await apiGetRepairQueue(apiRequest(`/v1/audits/${env.auditId}/repair-queue`, env.apiToken), env);
  assert.equal(queueResponse.status, 200);
  const queueBody = await queueResponse.json();
  assert.equal(queueBody.items[0].issue_id, "issue-1");
  assert.equal(queueBody.items[0].status, "fixed");
  assert.equal(queueBody.items[0].rerun_status, "fixed");

  const reportResponse = await apiGetAuditReport(apiRequest(`/v1/audits/${env.auditId}/report`, env.apiToken), env);
  assert.equal(reportResponse.status, 200);
  const reportBody = await reportResponse.json();
  assert.equal(reportBody.report.findings[0].repair_queue.status, "fixed");
  assert.equal(reportBody.report.repair_queue.fixed, 1);

  const issuesResponse = await apiGetAuditIssues(apiRequest(`/v1/audits/${env.auditId}/issues`, env.apiToken), env);
  assert.equal(issuesResponse.status, 200);
  const issuesBody = await issuesResponse.json();
  assert.equal(issuesBody.issues[0].repair_queue.status, "fixed");
});

test("Developer API repair queue read falls back before migration while writes fail closed", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [], missingRepairTables: true });

  const readResponse = await apiGetRepairQueue(apiRequest(`/v1/audits/${env.auditId}/repair-queue`, env.apiToken), env);
  assert.equal(readResponse.status, 200);
  const readBody = await readResponse.json();
  assert.equal(readBody.items.length, 1);
  assert.equal(readBody.items[0].issue_id, "issue-1");
  assert.equal(readBody.unavailable, true);

  const saveResponse = await apiSaveRepairQueue(apiRequest(
    `/v1/audits/${env.auditId}/repair-queue`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ items: [{ issue_id: "issue-1", status: "ignored" }] })
    }
  ), env);
  assert.equal(saveResponse.status, 503);
  assert.equal((await saveResponse.json()).code, "REPAIR_QUEUE_MIGRATION_MISSING");

  const createResponse = await apiCreateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions`,
    env.apiToken,
    {
      method: "POST",
      body: JSON.stringify({ issue_id: "issue-1", proposed_change: "Draft the fixed title for review." })
    }
  ), env);
  assert.equal(createResponse.status, 503);
  assert.equal((await createResponse.json()).code, "REPAIR_QUEUE_MIGRATION_MISSING");

  const updateResponse = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/77777777-7777-4777-8777-777777777777`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approval_state: "approved" })
    }
  ), env);
  assert.equal(updateResponse.status, 503);
  assert.equal((await updateResponse.json()).code, "REPAIR_QUEUE_MIGRATION_MISSING");
});

test("Developer API report and issue overlays fall back before repair migration", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [], missingRepairTables: true });

  const issuesResponse = await apiGetAuditIssues(apiRequest(`/v1/audits/${env.auditId}/issues`, env.apiToken), env);
  assert.equal(issuesResponse.status, 200);
  const issuesBody = await issuesResponse.json();
  assert.equal(issuesBody.total, 1);
  assert.equal(issuesBody.issues[0].repair_queue.status, "open");
  assert.equal(issuesBody.issues[0].repair_queue.action_mode, "self_serve");
  assert.equal(issuesBody.issues[0].repair_queue.latest_action, null);
  assert.equal(issuesBody.issues[0].repair_queue.unavailable, true);

  const reportResponse = await apiGetAuditReport(apiRequest(`/v1/audits/${env.auditId}/report`, env.apiToken), env);
  assert.equal(reportResponse.status, 200);
  const reportBody = await reportResponse.json();
  assert.equal(reportBody.report.id, env.reportId);
  assert.equal(reportBody.report.repair_queue.total, 1);
  assert.equal(reportBody.report.repair_queue.open, 1);
  assert.equal(reportBody.report.repair_queue.unavailable, true);
  assert.equal(reportBody.report.findings[0].repair_queue.status, "open");
  assert.equal(reportBody.report.findings[0].repair_queue.latest_action, null);
  assert.equal(reportBody.report.findings[0].repair_queue.unavailable, true);
  assert.doesNotMatch(JSON.stringify({ issuesBody, reportBody }), /Private draft title copy|source_proof|proposed_change/i);
});

test("Developer API action create clears stale rerun proof when reopening a fixed item", async () => {
  const env = await fakeDeveloperApiEnv({ actions: [] });
  env.queueItems[0].status = "fixed";
  env.queueItems[0].rerun_status = "fixed";
  env.queueItems[0].last_rerun_report_id = "rerun-report-1";

  const response = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      proposedChange: "Draft the corrected title again."
    })
  }), env);

  assert.equal(response.status, 201);
  assert.equal(env.queueItems[0].status, "drafted");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, null);
});

test("Developer API repair action webhooks deliver lifecycle transitions without private draft payload", async () => {
  const env = await fakeDeveloperApiEnv({ actions: [] });
  env.SEOFIXKIT_API_WEBHOOK_SECRET = "test-secret";
  env.webhooks = [{
    id: "webhook-1",
    owner_email: "owner@example.com",
    url: "https://hooks.example.com/seo",
    events_json: JSON.stringify([
      "repair_action.drafted",
      "repair_action.approved",
      "repair_action.applied",
      "repair_action.fixed",
      "repair_action.regressed"
    ]),
    status: "active",
    revoked_at: null,
    created_at: new Date().toISOString()
  }];
  const waitUntilPromises = [];
  const sentPayloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith("https://cloudflare-dns.com/dns-query")) {
      return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    sentPayloads.push(JSON.parse(options.body || "{}"));
    return new Response("", { status: 200 });
  };

  try {
    const created = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
      method: "POST",
      body: JSON.stringify({
        issueId: "issue-1",
        proposedChange: "Private draft title copy"
      })
    }), env, { waitUntil: (promise) => waitUntilPromises.push(promise) });
    assert.equal(created.status, 201);
    const approved = await apiUpdateRepairAction(apiRequest(
      `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
      env.apiToken,
      {
        method: "PATCH",
        body: JSON.stringify({ approvalState: "approved" })
      }
    ), env, { waitUntil: (promise) => waitUntilPromises.push(promise) });
    assert.equal(approved.status, 200);
    const applied = await apiUpdateRepairAction(apiRequest(
      `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
      env.apiToken,
      {
        method: "PATCH",
        body: JSON.stringify({ executionState: "applied" })
      }
    ), env, { waitUntil: (promise) => waitUntilPromises.push(promise) });
    assert.equal(applied.status, 200);
    env.reports.push({
      id: "rerun-fixed-report-1",
      owner_email: "owner@example.com",
      expires_at: new Date(Date.now() + 7_200_000).toISOString(),
      created_at: new Date(Date.now() + 60_000).toISOString(),
      updated_at: new Date(Date.now() + 60_000).toISOString(),
      url: "https://example.com/",
      target_host: "example.com",
      report_json: JSON.stringify(fixedRerunReport("rerun-fixed-report-1"))
    });
    const fixed = await apiUpdateRepairAction(apiRequest(
      `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
      env.apiToken,
      {
        method: "PATCH",
        body: JSON.stringify({ rerunState: "fixed", rerunReportId: "rerun-fixed-report-1" })
      }
    ), env, { waitUntil: (promise) => waitUntilPromises.push(promise) });
    assert.equal(fixed.status, 200);
    env.reports.push({
      id: "rerun-regressed-report-1",
      owner_email: "owner@example.com",
      expires_at: new Date(Date.now() + 7_200_000).toISOString(),
      created_at: new Date(Date.now() + 120_000).toISOString(),
      updated_at: new Date(Date.now() + 120_000).toISOString(),
      url: "https://example.com/",
      target_host: "example.com",
      report_json: JSON.stringify(stillOpenRerunReport("rerun-regressed-report-1"))
    });
    const regressed = await apiUpdateRepairAction(apiRequest(
      `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
      env.apiToken,
      {
        method: "PATCH",
        body: JSON.stringify({ rerunState: "regressed", rerunReportId: "rerun-regressed-report-1" })
      }
    ), env, { waitUntil: (promise) => waitUntilPromises.push(promise) });
    assert.equal(regressed.status, 200);
    await Promise.all(waitUntilPromises);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(env.events.map((event) => event.event_type), [
    "repair_action.drafted",
    "repair_action.approved",
    "repair_action.applied",
    "repair_action.fixed",
    "repair_action.regressed"
  ]);
  assert.equal(sentPayloads.length, 5);
  assert.equal(sentPayloads[0].data.repair_action.approval_state, "drafted");
  assert.equal(sentPayloads[1].data.repair_action.approval_state, "approved");
  assert.equal(sentPayloads[2].data.repair_action.execution_state, "applied");
  assert.equal(sentPayloads[3].data.repair_action.rerun_state, "fixed");
  assert.equal(sentPayloads[3].data.repair_action.rerun_report_id, "rerun-fixed-report-1");
  assert.equal(sentPayloads[4].data.repair_action.rerun_state, "regressed");
  assert.equal(sentPayloads[4].data.repair_action.rerun_report_id, "rerun-regressed-report-1");
  assert.doesNotMatch(JSON.stringify(sentPayloads), /Private draft title copy|source_proof|proposed_change/i);
  assert.equal(env.webhooks[0].last_delivery_status, "delivered");
});

test("Developer API rejects direct repair queue rerun closure", async () => {
  const env = await fakeDeveloperApiEnv();
  env.queueItems[0].status = "applied";
  env.actions[0].execution_state = "applied";
  env.actions[0].applied_at = new Date(Date.now() - 60_000).toISOString();
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await apiSaveRepairQueue(apiRequest(`/v1/audits/${env.auditId}/repair-queue`, env.apiToken, {
    method: "PATCH",
    body: JSON.stringify({
      items: [{
        issue_id: "issue-1",
        status: "fixed",
        rerun_status: "fixed",
        rerun_report_id: "rerun-report-1"
      }]
    })
  }), env);

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Use repair actions/i);
  assert.equal(env.queueItems[0].status, "applied");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, undefined);
});

test("Developer API rejects queue rerun proof older than applied action", async () => {
  const env = await fakeDeveloperApiEnv();
  env.queueItems[0].status = "applied";
  env.queueItems[0].updated_at = new Date().toISOString();
  env.actions[0].execution_state = "applied";
  env.actions[0].applied_at = new Date().toISOString();
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: "2021-01-01T00:00:00.000Z",
    updated_at: "2021-01-01T00:00:00.000Z",
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await apiSaveRepairQueue(apiRequest(`/v1/audits/${env.auditId}/repair-queue`, env.apiToken, {
    method: "PATCH",
    body: JSON.stringify({
      items: [{
        issue_id: "issue-1",
        status: "fixed",
        rerun_status: "fixed",
        rerun_report_id: "rerun-report-1"
      }]
    })
  }), env);

  assert.equal(response.status, 400);
  assert.equal(env.queueItems[0].status, "applied");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, undefined);
});

test("Developer API rejects queue proof when newer draft hides applied action", async () => {
  const env = await fakeDeveloperApiEnv();
  const appliedAt = new Date().toISOString();
  const draftAt = new Date(Date.now() + 60_000).toISOString();
  env.queueItems[0].status = "drafted";
  env.queueItems[0].updated_at = draftAt;
  env.actions = [
    {
      ...env.actions[0],
      id: "applied-action",
      approval_state: "approved",
      execution_state: "applied",
      applied_at: appliedAt,
      updated_at: appliedAt
    },
    {
      ...env.actions[0],
      id: "draft-action",
      approval_state: "drafted",
      execution_state: "not_started",
      applied_at: "",
      updated_at: draftAt
    }
  ];
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: "2021-01-01T00:00:00.000Z",
    updated_at: "2021-01-01T00:00:00.000Z",
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await apiSaveRepairQueue(apiRequest(`/v1/audits/${env.auditId}/repair-queue`, env.apiToken, {
    method: "PATCH",
    body: JSON.stringify({
      items: [{
        issue_id: "issue-1",
        status: "fixed",
        rerun_status: "fixed",
        rerun_report_id: "rerun-report-1"
      }]
    })
  }), env);

  assert.equal(response.status, 400);
  assert.equal(env.queueItems[0].status, "drafted");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, undefined);
});

test("Developer API repair action create does not persist when the queue row disappears", async () => {
  const env = await fakeDeveloperApiEnv({ queueItems: [], actions: [] });
  env.dropQueueBeforeActionInsert = true;

  const response = await apiCreateRepairAction(apiRequest(`/v1/audits/${env.auditId}/repair-actions`, env.apiToken, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      actionMode: "cms_draft",
      proposedChange: "Draft the fixed title for review."
    })
  }), env);

  assert.equal(response.status, 409);
  assert.equal(env.actions.length, 0);
  assert.equal(env.queueItems.length, 0);
});

test("Developer API repair action update does not persist when the queue row disappears", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "22222222-2222-4222-8222-222222222222";
  env.dropQueueBeforeActionUpdate = true;

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved" })
    }
  ), env);

  assert.equal(response.status, 409);
  assert.equal(env.actions[0].approval_state, "drafted");
  assert.equal(env.queueItems.length, 0);
});

test("Developer API audit delete removes report, repair rows, and audit job together", async () => {
  const env = await fakeDeveloperApiEnv();

  const response = await apiDeleteAudit(apiRequest(`/v1/audits/${env.auditId}`, env.apiToken, { method: "DELETE" }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.deleted, true);
  assert.equal(env.jobs.length, 0);
  assert.equal(env.reports.length, 0);
  assert.equal(env.queueItems.length, 0);
  assert.equal(env.actions.length, 0);
});

test("Developer API audit delete keeps job when report cleanup fails", async () => {
  const env = await fakeDeveloperApiEnv();
  env.reportCleanupFails = true;

  await assert.rejects(
    () => apiDeleteAudit(apiRequest(`/v1/audits/${env.auditId}`, env.apiToken, { method: "DELETE" }), env),
    /repair cleanup unavailable/
  );

  assert.equal(env.jobs.length, 1);
  assert.equal(env.reports.length, 1);
});

test("Developer API audit delete keeps job when report becomes protected", async () => {
  const env = await fakeDeveloperApiEnv({
    fixRequests: [{ id: "fix-1", status: "paid", report_id: "example-report-1", final_report_id: "" }]
  });

  const response = await apiDeleteAudit(apiRequest(`/v1/audits/${env.auditId}`, env.apiToken, { method: "DELETE" }), env);
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "FIX_PACK_REPORT_LOCKED");
  assert.equal(body.fixRequestId, "fix-1");
  assert.equal(env.jobs.length, 1);
  assert.equal(env.reports.length, 1);
  assert.equal(env.queueItems.length, 1);
});

test("Developer API rejects same-owner rerun proof from another host", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "33333333-3333-4333-8333-333333333333";
  env.reports.push({
    id: "rerun-other-host-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://other.example/",
    target_host: "other.example",
    report_json: JSON.stringify({ id: "rerun-other-host-1", url: "https://other.example/", findings: [], repairPlan: [] })
  });
  const applied = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }
  ), env);
  assert.equal(applied.status, 200);

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-other-host-1"
      })
    }
  ), env);

  assert.equal(response.status, 404);
  assert.equal(env.queueItems[0].status, "applied");
});

test("Developer API rejects source report as rerun proof", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "66666666-6666-4666-8666-666666666666";
  const applied = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }
  ), env);
  assert.equal(applied.status, 200);

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: env.reportId
      })
    }
  ), env);

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("Developer API clears stale rerun proof when a fixed repair is reopened", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "44444444-4444-4444-8444-444444444444";
  const applied = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied"
      })
    }
  ), env);
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const fixed = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }
  ), env);
  assert.equal(fixed.status, 200);

  const reopened = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "not_run" })
    }
  ), env);

  assert.equal(reopened.status, 200);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.actions[0].rerun_report_id, null);
  assert.equal(env.queueItems[0].status, "applied");
  assert.equal(env.queueItems[0].last_rerun_report_id, null);
});

test("Developer API rejects fixed proof in the same request that first applies it", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "77777777-7777-4777-8777-777777777777";
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied",
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }
  ), env);

  assert.equal(response.status, 400);
  assert.equal(env.actions[0].execution_state, "not_started");
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "drafted");
});

test("Developer API rejects terminal queue statuses without matching rerun proof", async () => {
  const env = await fakeDeveloperApiEnv();
  const cases = [
    { status: "drafted" },
    { status: "approved" },
    { status: "applied" },
    { status: "fixed" },
    { status: "regressed", rerun_status: "not_run" },
    { status: "open", rerun_status: "still_open" }
  ];

  for (const item of cases) {
    const response = await apiSaveRepairQueue(apiRequest(
      `/v1/audits/${env.auditId}/repair-queue`,
      env.apiToken,
      {
        method: "PATCH",
        body: JSON.stringify({ items: [{ issue_id: "issue-1", ...item }] })
      }
    ), env);

    assert.equal(response.status, 400);
    assert.equal(env.queueItems[0].status, "drafted");
    assert.equal(env.queueItems[0].rerun_status, "not_run");
    assert.ok(!env.queueItems[0].last_rerun_report_id);
  }
});

test("Developer API rejects stale fixed proof after apply", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "88888888-8888-4888-8888-888888888888";
  const applied = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }
  ), env);
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "fixed", rerunReportId: "rerun-report-1" })
    }
  ), env);

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].execution_state, "applied");
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("Developer API rejects stale still-open proof after apply", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "99999999-9999-4999-8999-999999999999";
  const applied = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }
  ), env);
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(stillOpenRerunReport("rerun-report-1"))
  });

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "still_open", rerunReportId: "rerun-report-1" })
    }
  ), env);

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].execution_state, "applied");
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("Developer API rejects same issue id proof from a different page", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const applied = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }
  ), env);
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(differentPageRerunReport("rerun-report-1"))
  });

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "still_open", rerunReportId: "rerun-report-1" })
    }
  ), env);

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("Developer API rejects missing R2 rerun proof body", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const applied = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }
  ), env);
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: "r2:reports/missing.json"
  });

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "fixed", rerunReportId: "rerun-report-1" })
    }
  ), env);

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("Developer API still-open rerun state requires applied action and proof", async () => {
  const env = await fakeDeveloperApiEnv();
  env.actions[0].id = "55555555-5555-4555-8555-555555555555";

  const response = await apiUpdateRepairAction(apiRequest(
    `/v1/audits/${env.auditId}/repair-actions/${env.actions[0].id}`,
    env.apiToken,
    {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", rerunState: "still_open" })
    }
  ), env);

  assert.equal(response.status, 400);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "drafted");
});

function apiRequest(path, token, options = {}) {
  return new Request(`https://seofixkit.test${path}`, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: options.body
  });
}

function fixedRerunReport(id) {
  return {
    id,
    url: "https://example.com/",
    score: 100,
    summary: { pagesScanned: 1, totalFindings: 0 },
    pages: [{ url: "https://example.com/" }],
    findings: [],
    repairPlan: [],
    reportDelta: {
      status: "ready",
      fixedIssues: [{
        id: "issue-1",
        title: "Missing title",
        pageUrl: "https://example.com/",
        source: "rendered"
      }]
    }
  };
}

function stillOpenRerunReport(id) {
  return {
    id,
    url: "https://example.com/",
    score: 75,
    summary: { pagesScanned: 1, totalFindings: 1 },
    pages: [{ url: "https://example.com/" }],
    findings: [{
      id: "issue-1",
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/",
      evidence: "Rendered title is still missing.",
      fix: "Add a descriptive title.",
      confidence: "verified",
      source: "rendered"
    }],
    repairPlan: []
  };
}

function differentPageRerunReport(id) {
  return {
    id,
    url: "https://example.com/other",
    score: 75,
    summary: { pagesScanned: 1, totalFindings: 1 },
    pages: [{ url: "https://example.com/other" }],
    findings: [{
      id: "issue-1",
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/other",
      evidence: "Rendered title is missing on another page.",
      fix: "Add a descriptive title.",
      confidence: "verified",
      source: "rendered"
    }],
    repairPlan: []
  };
}

async function fakeDeveloperApiEnv(overrides = {}) {
  const apiToken = "sfk_live_test_repair_queue";
  const reportId = "example-report-1";
  const auditId = "11111111-1111-4111-8111-111111111111";
  const now = new Date().toISOString();
  const report = {
    id: reportId,
    url: "https://example.com/",
    createdAt: "2020-01-01T00:00:00.000Z",
    findings: [{
      id: "issue-1",
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/",
      pageLabel: "home",
      evidence: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      acceptance: "Rendered title exists.",
      confidence: "verified",
      source: "rendered"
    }],
    repairPlan: [{
      issueId: "issue-1",
      priority: 1,
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/",
      pageLabel: "home",
      proof: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      acceptance: "Rendered title exists.",
      confidence: "verified",
      source: "rendered"
    }],
    pageSummaries: [{
      url: "https://example.com/",
      path: "/",
      status: 200,
      score: 75,
      critical: 1,
      warnings: 0,
      notices: 0,
      guards: 1,
      title: "Example",
      h1: "Example",
      wordCount: 320,
      internalLinks: 2,
      brokenLinks: 0,
      brokenImages: 0,
      loadDurationMs: 900,
      schemaTypes: ["Organization"]
    }]
  };

  const env = {
    apiToken,
    auditId,
    reportId,
    ownerEmail: "owner@example.com",
    tokens: [{
      id: "token-1",
      owner_email: "owner@example.com",
      token_hash: await sha256Hex(apiToken),
      status: "active",
      revoked_at: null
    }],
    jobs: [{
      id: auditId,
      owner_email: "owner@example.com",
      status: "completed",
      target_url: "https://example.com/",
      target_host: "example.com",
      competitor_urls_json: "[]",
      backlink_rows_json: "[]",
      local_seo_input_json: "{}",
      keyword_rows_json: "[]",
      rendered_crawl_target: 0,
      max_pages: 1,
      report_id: reportId,
      created_at: now,
      updated_at: now,
      completed_at: now
    }],
    reports: [{
      id: reportId,
      owner_email: "owner@example.com",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z",
      url: "https://example.com/",
      target_host: "example.com",
      report_json: JSON.stringify(report)
    }],
	    fixRequests: overrides.fixRequests || [],
	    queueItems: overrides.queueItems || [{
      id: "queue-1",
      report_id: reportId,
      owner_email: "owner@example.com",
      issue_id: "issue-1",
      title: "Missing title",
      severity: "critical",
      page_url: "https://example.com/",
      page_label: "home",
      proof: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      acceptance: "Rendered title exists.",
      confidence: "verified",
      source: "rendered",
      source_kind: "finding",
      action_mode: "cms_draft",
      status: "drafted",
      rerun_status: "not_run",
      updated_at: now,
      updated_by_email: "owner@example.com"
    }],
    actions: overrides.actions || [{
      id: "action-1",
      report_id: reportId,
      owner_email: "owner@example.com",
      queue_item_id: "queue-1",
      issue_id: "issue-1",
      action_mode: "cms_draft",
      action_type: "metadata_copy",
      approval_state: "drafted",
      execution_state: "not_started",
      rerun_state: "not_run",
      source_proof: "Rendered title is missing.",
      proposed_change: "Private draft title copy",
      acceptance: "Rendered title exists.",
      rerun_report_id: "",
      created_at: now,
      updated_at: now,
      approved_at: "",
      applied_at: "",
      updated_by_email: "owner@example.com"
	    }],
	    webhooks: [],
	    events: [],
	    reportCleanupFails: Boolean(overrides.reportCleanupFails),
	    missingRepairTables: Boolean(overrides.missingRepairTables)
	  };
  env.WAITLIST_DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return statement(sql, values, env);
        }
      };
    },
    batch: async (statements) => {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    }
  };
  return env;
}

function developerRepairQueueRow(overrides = {}) {
  return {
    id: "queue-1",
    report_id: "example-report-1",
    owner_email: "owner@example.com",
    issue_id: "issue-1",
    title: "Missing title",
    severity: "critical",
    page_url: "https://example.com/",
    page_label: "home",
    proof: "Rendered title is missing.",
    fix: "Add a descriptive title.",
    acceptance: "Rendered title exists.",
    confidence: "verified",
    source: "rendered",
    source_kind: "finding",
    action_mode: "self_serve",
    status: "open",
    rerun_status: "not_run",
    last_rerun_report_id: "",
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    updated_by_email: "owner@example.com",
    ...overrides
  };
}

function statement(sql, values, env) {
  const maybeMissingRepairTables = () => {
    if (env.missingRepairTables && /repair_queue_items|repair_agent_actions/.test(sql)) {
      throw new Error("no such table: repair_queue_items");
    }
  };
  return {
    first: async () => {
      maybeMissingRepairTables();
      return first(sql, values, env);
    },
    all: async () => {
      maybeMissingRepairTables();
      return all(sql, values, env);
    },
    run: async () => {
      maybeMissingRepairTables();
      return run(sql, values, env);
    }
  };
}

function first(sql, values, env) {
  if (sql.includes("FROM api_tokens")) {
    return env.tokens.find((row) => row.token_hash === values[0] && row.status === "active") || null;
  }
  if (sql.includes("FROM audit_jobs")) {
    const [id, ownerEmail] = values;
    return env.jobs.find((row) => row.id === id && row.owner_email === ownerEmail) || null;
  }
  if (sql.includes("FROM audit_reports")) {
    const [id, ownerEmail] = values;
    return env.reports.find((row) => row.id === id && row.owner_email === ownerEmail) || null;
  }
  if (sql.includes("FROM fix_requests")) {
    const reportId = values.at(-1);
    return env.fixRequests.find((row) =>
      ["paid", "in_progress", "delivered", "refunded", "refund_failed", "disputed"].includes(row.status) &&
      (row.report_id === reportId || row.final_report_id === reportId)
    ) || null;
  }
  if (sql.includes("FROM repair_queue_items")) {
    return env.queueItems[0] ? { id: env.queueItems[0].id } : null;
  }
	  if (sql.includes("FROM repair_agent_actions")) {
	    if (sql.includes("SELECT id FROM repair_agent_actions")) {
	      return env.actions[0] ? { id: env.actions[0].id } : null;
	    }
	    const [id, reportId, ownerEmail] = values;
	    const row = env.actions.find((row) => row.id === id && row.report_id === reportId && row.owner_email === ownerEmail);
	    return row ? { ...row } : null;
	  }
  throw new Error(`Unexpected first SQL: ${sql}`);
}

function all(sql, values, env) {
  if (sql.includes("FROM repair_queue_items")) {
    const [reportId, ownerEmail] = values;
    let results = env.queueItems.filter((row) => row.report_id === reportId && row.owner_email === ownerEmail);
    if (sql.includes("ORDER BY updated_at DESC")) {
      results = [...results].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    }
    const limit = sql.match(/LIMIT\s+(\d+)/i);
    if (env.simulateRepairQueueSqlLimit && limit) {
      results = results.slice(0, Number(limit[1]));
    }
    return { results };
  }
  if (sql.includes("FROM repair_agent_actions")) {
    const [reportId, ownerEmail] = values;
    return { results: env.actions.filter((row) => row.report_id === reportId && row.owner_email === ownerEmail) };
  }
	  if (sql.includes("FROM api_webhooks")) {
	    return { results: env.webhooks };
	  }
  throw new Error(`Unexpected all SQL: ${sql}`);
}

function run(sql, values, env) {
  if (sql.includes("UPDATE api_tokens")) return { meta: { changes: 1 } };
  if (sql.includes("UPDATE audit_reports")) {
    return { meta: { changes: isProtectedReport(env, values[1]) ? 1 : 0 } };
  }
  if (sql.includes("UPDATE audit_jobs")) {
    return { meta: { changes: isProtectedReport(env, values[1]) ? 1 : 0 } };
  }
  if (sql.includes("UPDATE repair_agent_actions") && sql.includes("WHERE rerun_report_id =")) {
    if (env.reportCleanupFails) throw new Error("repair cleanup unavailable");
    return { meta: { changes: 0 } };
  }
  if (sql.includes("UPDATE repair_queue_items") && sql.includes("WHERE last_rerun_report_id =")) {
    if (env.reportCleanupFails) throw new Error("repair cleanup unavailable");
    return { meta: { changes: 0 } };
  }
  if (sql.includes("DELETE FROM repair_agent_actions")) {
    if (env.reportCleanupFails) throw new Error("repair cleanup unavailable");
    if (isProtectedReport(env, values[1])) return { meta: { changes: 0 } };
    const before = env.actions.length;
    env.actions = env.actions.filter((row) => row.report_id !== values[0]);
    return { meta: { changes: before - env.actions.length } };
  }
  if (sql.includes("DELETE FROM repair_queue_items")) {
    if (env.reportCleanupFails) throw new Error("repair cleanup unavailable");
    if (isProtectedReport(env, values[1])) return { meta: { changes: 0 } };
    const before = env.queueItems.length;
    env.queueItems = env.queueItems.filter((row) => row.report_id !== values[0]);
    return { meta: { changes: before - env.queueItems.length } };
  }
  if (sql.includes("DELETE FROM audit_reports")) {
    if (isProtectedReport(env, values[0])) return { meta: { changes: 0 } };
    const before = env.reports.length;
    env.reports = env.reports.filter((row) => row.id !== values[0]);
    return { meta: { changes: before - env.reports.length } };
  }
  if (sql.includes("DELETE FROM audit_jobs")) {
    const before = env.jobs.length;
    if (sql.includes("report_id =")) {
      if (isProtectedReport(env, values[1])) return { meta: { changes: 0 } };
      env.jobs = env.jobs.filter((row) => row.report_id !== values[0]);
      return { meta: { changes: before - env.jobs.length } };
    }
    env.jobs = env.jobs.filter((row) => !(row.id === values[0] && row.owner_email === values[1]));
    return { meta: { changes: before - env.jobs.length } };
  }
  if (sql.includes("INSERT INTO repair_queue_items")) {
    if (!env.queueItems.some((row) => row.report_id === values[1] && row.issue_id === values[3])) {
      env.queueItems.push({
        id: values[0],
        report_id: values[1],
        owner_email: values[2],
        issue_id: values[3],
        title: values[4],
        severity: values[5],
        page_url: values[6],
        page_label: values[7],
        proof: values[8],
        fix: values[9],
        snippet: values[10],
        acceptance: values[11],
        confidence: values[12],
        source: values[13],
        source_kind: values[14],
        estimated_effort: values[15],
        work_type: values[16],
        action_mode: values[17],
        status: values[18],
        rerun_status: values[19],
        last_rerun_report_id: values[20],
        created_at: values[21],
        updated_at: values[22],
        updated_by_email: values[23]
      });
    }
    return { meta: { changes: 1 } };
  }
	  if (sql.includes("INSERT INTO repair_agent_actions")) {
    if (env.dropQueueBeforeActionInsert) env.queueItems = env.queueItems.filter((row) => row.id !== values[19]);
    if (sql.includes("WHERE EXISTS")) {
      const queueExists = env.queueItems.some((row) =>
        row.id === values[19] &&
        row.report_id === values[20] &&
        row.owner_email === values[21]
      );
      if (!queueExists) return { meta: { changes: 0 } };
    }
    env.actions.push({
      id: values[0],
      report_id: values[1],
      owner_email: values[2],
      queue_item_id: values[3],
      issue_id: values[4],
      action_mode: values[5],
      action_type: values[6],
      approval_state: values[7],
      execution_state: values[8],
      rerun_state: values[9],
      source_proof: values[10],
      proposed_change: values[11],
      acceptance: values[12],
      rerun_report_id: values[13],
      created_at: values[14],
      updated_at: values[15],
      approved_at: values[16],
      applied_at: values[17],
      updated_by_email: values[18]
    });
	    return { meta: { changes: 1 } };
	  }
	  if (sql.includes("INSERT INTO api_webhook_events")) {
	    env.events.push({
	      id: values[0],
	      webhook_id: values[1],
	      owner_email: values[2],
	      event_type: values[3],
	      audit_job_id: values[4],
	      report_id: values[5],
	      status: values[6],
	      http_status: values[7],
	      error: values[8],
	      payload_json: values[9],
	      created_at: values[10],
	      delivered_at: values[11]
	    });
	    return { meta: { changes: 1 } };
	  }
	  if (sql.includes("UPDATE repair_queue_items")) {
    const idIndex = sql.includes("SET status = 'drafted'") ? 3 : values.length - 3;
    const row = env.queueItems.find((item) => item.id === values[idIndex]);
    if (row) {
      if (sql.includes("SET status = 'drafted'")) {
        row.status = "drafted";
        row.action_mode = values[0];
        row.rerun_status = "not_run";
        row.last_rerun_report_id = null;
        row.updated_at = values[1];
        row.updated_by_email = values[2];
      } else if (sql.includes("action_mode")) {
        row.status = values[0];
        row.action_mode = values[1];
        row.rerun_status = values[2];
        row.last_rerun_report_id = values[3];
        row.updated_at = values[4];
        row.updated_by_email = values[5];
      } else {
        row.status = values[0];
        row.rerun_status = values[1];
        row.last_rerun_report_id = values[2];
        row.updated_at = values[3];
        row.updated_by_email = values[4];
      }
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE repair_agent_actions")) {
    const row = env.actions.find((action) => action.id === values[8]);
    if (env.dropQueueBeforeActionUpdate) env.queueItems = env.queueItems.filter((item) => item.id !== values[11]);
    if (sql.includes("EXISTS")) {
      const queueExists = env.queueItems.some((item) =>
        item.id === values[11] &&
        item.report_id === values[12] &&
        item.owner_email === values[13]
      );
      if (!queueExists) return { meta: { changes: 0 } };
    }
    if (row) {
      row.approval_state = values[0];
      row.execution_state = values[1];
      row.rerun_state = values[2];
      row.rerun_report_id = values[3];
      row.updated_at = values[4];
      row.approved_at = values[5];
      row.applied_at = values[6];
      row.updated_by_email = values[7];
    }
	    return { meta: { changes: row ? 1 : 0 } };
	  }
	  if (sql.includes("UPDATE api_webhook_events")) {
	    const failedUpdate = sql.includes("SET status = 'failed'");
	    const event = env.events.find((row) => row.id === values[failedUpdate ? 2 : 4]);
	    Object.assign(event, failedUpdate
	      ? {
	          status: "failed",
	          error: values[0],
	          delivered_at: values[1]
	        }
	      : {
	          status: values[0],
	          http_status: values[1],
	          error: values[2],
	          delivered_at: values[3]
	        });
	    return { meta: { changes: 1 } };
	  }
	  if (sql.includes("UPDATE api_webhooks")) {
	    const failedUpdate = sql.includes("last_delivery_status = 'failed'");
	    const webhook = env.webhooks.find((row) => row.id === values[failedUpdate ? 3 : 4]);
	    Object.assign(webhook, failedUpdate
	      ? {
	          last_delivery_at: values[0],
	          last_delivery_status: "failed",
	          last_error: values[1],
	          updated_at: values[2]
	        }
	      : {
	          last_delivery_at: values[0],
	          last_delivery_status: values[1],
	          last_error: values[2],
	          updated_at: values[3]
	        });
	    return { meta: { changes: 1 } };
	  }
	  throw new Error(`Unexpected run SQL: ${sql}`);
	}

function isProtectedReport(env, reportId) {
  return env.fixRequests.some((row) =>
    ["paid", "in_progress", "delivered", "refunded", "refund_failed", "disputed"].includes(row.status) &&
    (row.report_id === reportId || row.final_report_id === reportId)
  );
}
