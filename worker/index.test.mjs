import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";
import { sha256Hex } from "./lib/security.js";

test("Worker dispatch routes public pages and repair APIs", async () => {
  const env = await fakeWorkerEnv();

  const methodology = await worker.fetch(new Request("https://seofixkit.test/methodology"), env, fakeCtx());
  assert.equal(methodology.status, 200);
  assert.match(await methodology.text(), /Proof first\. Repairs second\. Claims last\./);

  const sessionQueue = await worker.fetch(new Request(`https://seofixkit.test/api/reports/${env.reportId}/repair-queue`, {
    headers: { cookie: `sfk_beta_session=${env.sessionToken}` }
  }), env, fakeCtx());
  assert.equal(sessionQueue.status, 200);
  const sessionBody = await sessionQueue.json();
  assert.equal(sessionBody.items[0].issueId, "issue-1");

  const apiQueue = await worker.fetch(new Request(`https://seofixkit.test/v1/audits/${env.auditId}/repair-queue`, {
    headers: { authorization: `Bearer ${env.apiToken}` }
  }), env, fakeCtx());
  assert.equal(apiQueue.status, 200);
  const apiBody = await apiQueue.json();
  assert.equal(apiBody.items[0].issue_id, "issue-1");

  const sessionQueuePatch = await worker.fetch(sessionRequest(env, `/api/reports/${env.reportId}/repair-queue`, {
    method: "PATCH",
    body: JSON.stringify({
      issueId: "issue-1",
      status: "ignored",
      actionMode: "self_serve"
    })
  }), env, fakeCtx());
  assert.equal(sessionQueuePatch.status, 200);
  assert.equal(env.queueItems[0].status, "ignored");

  const sessionAction = await worker.fetch(sessionRequest(env, `/api/reports/${env.reportId}/repair-actions`, {
    method: "POST",
    body: JSON.stringify({
      issueId: "issue-1",
      actionMode: "cms_draft",
      proposedChange: "Draft the fixed title for review."
    })
  }), env, fakeCtx());
  assert.equal(sessionAction.status, 201);
  const sessionActionBody = await sessionAction.json();
  assert.equal(sessionActionBody.action.approvalState, "drafted");
  assert.equal(env.actions.length, 1);
  assert.equal(env.queueItems[0].status, "drafted");

  const sessionActionPatch = await worker.fetch(sessionRequest(
    env,
    `/api/reports/${env.reportId}/repair-actions/${sessionActionBody.action.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied"
      })
    }
  ), env, fakeCtx());
  assert.equal(sessionActionPatch.status, 200);
  assert.equal(env.actions[0].approval_state, "approved");
  assert.equal(env.actions[0].execution_state, "applied");
  assert.equal(env.queueItems[0].status, "applied");

  const apiEnv = await fakeWorkerEnv();
  await worker.fetch(new Request(`https://seofixkit.test/v1/audits/${apiEnv.auditId}/repair-queue`, {
    headers: { authorization: `Bearer ${apiEnv.apiToken}` }
  }), apiEnv, fakeCtx());

  const apiQueuePatch = await worker.fetch(apiRequest(apiEnv, `/v1/audits/${apiEnv.auditId}/repair-queue`, {
    method: "PATCH",
    body: JSON.stringify({
      issue_id: "issue-1",
      status: "ignored",
      action_mode: "self_serve"
    })
  }), apiEnv, fakeCtx());
  assert.equal(apiQueuePatch.status, 200);
  assert.equal(apiEnv.queueItems[0].status, "ignored");

  const apiAction = await worker.fetch(apiRequest(apiEnv, `/v1/audits/${apiEnv.auditId}/repair-actions`, {
    method: "POST",
    body: JSON.stringify({
      issue_id: "issue-1",
      action_mode: "cms_draft",
      proposed_change: "Draft the fixed title for review."
    })
  }), apiEnv, fakeCtx());
  assert.equal(apiAction.status, 201);
  const apiActionBody = await apiAction.json();
  assert.equal(apiActionBody.action.approval_state, "drafted");
  assert.equal(apiEnv.actions.length, 1);
  assert.equal(apiEnv.queueItems[0].status, "drafted");

  const apiActionPatch = await worker.fetch(apiRequest(
    apiEnv,
    `/v1/audits/${apiEnv.auditId}/repair-actions/${apiActionBody.action.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        approval_state: "approved",
        execution_state: "applied"
      })
    }
  ), apiEnv, fakeCtx());
  assert.equal(apiActionPatch.status, 200);
  assert.equal(apiEnv.actions[0].approval_state, "approved");
  assert.equal(apiEnv.actions[0].execution_state, "applied");
  assert.equal(apiEnv.queueItems[0].status, "applied");
});

function fakeCtx() {
  return { waitUntil() {} };
}

function sessionRequest(env, path, init = {}) {
  return new Request(`https://seofixkit.test${path}`, {
    ...init,
    headers: {
      cookie: `sfk_beta_session=${env.sessionToken}`,
      ...(init.headers || {})
    }
  });
}

function apiRequest(env, path, init = {}) {
  return new Request(`https://seofixkit.test${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.apiToken}`,
      ...(init.headers || {})
    }
  });
}

async function fakeWorkerEnv() {
  const sessionToken = "test-session";
  const apiToken = "sfk_live_test_dispatch";
  const reportId = "example-com-report-1";
  const auditId = "11111111-1111-4111-8111-111111111111";
  const now = new Date().toISOString();
  const report = {
    id: reportId,
    url: "https://example.com/",
    createdAt: now,
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
    repairPlan: []
  };
  const env = {
    reportId,
    auditId,
    sessionToken,
    apiToken,
    betaSessions: [{
      token_hash: await sha256Hex(sessionToken),
      owner_email: "owner@example.com",
      invite_id: null,
      access_mode: "founder-override",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null
    }],
    apiTokens: [{
      id: "token-1",
      owner_email: "owner@example.com",
      token_hash: await sha256Hex(apiToken),
      status: "active",
      revoked_at: null
    }],
    reports: [{
      id: reportId,
      owner_email: "owner@example.com",
      owner_invite_id: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      url: "https://example.com/",
      target_host: "example.com",
      report_json: JSON.stringify(report),
      summary_json: JSON.stringify({ totalFindings: 1 }),
      created_at: now,
      updated_at: now
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
    queueItems: [],
    actions: [],
    ASSETS: {
      fetch: async () => new Response("asset fallback", { status: 404 })
    }
  };
  env.WAITLIST_DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return statement(sql, values, env);
        }
      };
    },
    batch: async (statements) => Promise.all(statements.map((statement) => statement.run()))
  };
  return env;
}

function statement(sql, values, env) {
  return {
    first: async () => first(sql, values, env),
    all: async () => all(sql, values, env),
    run: async () => run(sql, values, env)
  };
}

function first(sql, values, env) {
  if (sql.includes("SELECT id FROM repair_queue_items")) {
    return env.queueItems[0] || null;
  }
  if (sql.includes("SELECT id FROM repair_agent_actions")) {
    return env.actions[0] || null;
  }
  if (sql.includes("FROM beta_sessions")) {
    return env.betaSessions.find((row) => row.token_hash === values[0]) || null;
  }
  if (sql.includes("FROM api_tokens")) {
    return env.apiTokens.find((row) => row.token_hash === values[0] && row.status === "active") || null;
  }
  if (sql.includes("FROM repair_agent_actions")) {
    const [id, reportId, ownerEmail] = values;
    const row = env.actions.find((row) => row.id === id && row.report_id === reportId && row.owner_email === ownerEmail);
    return row ? { ...row } : null;
  }
  if (sql.includes("FROM audit_reports")) {
    const [id, ownerEmail] = values;
    return env.reports.find((row) => row.id === id && (!ownerEmail || row.owner_email === ownerEmail)) || null;
  }
  if (sql.includes("FROM audit_jobs")) {
    const [id, ownerEmail] = values;
    return env.jobs.find((row) => row.id === id && row.owner_email === ownerEmail) || null;
  }
  throw new Error(`Unexpected first SQL: ${sql}`);
}

function all(sql, values, env) {
  if (sql.includes("FROM repair_queue_items")) {
    const [reportId, ownerEmail] = values;
    return { results: env.queueItems.filter((row) => row.report_id === reportId && row.owner_email === ownerEmail).map((row) => ({ ...row })) };
  }
  if (sql.includes("FROM repair_agent_actions")) {
    const [reportId, ownerEmail] = values;
    return { results: env.actions.filter((row) => row.report_id === reportId && row.owner_email === ownerEmail).map((row) => ({ ...row })) };
  }
  if (sql.includes("FROM api_webhooks")) {
    return { results: [] };
  }
  throw new Error(`Unexpected all SQL: ${sql}`);
}

function run(sql, values, env) {
  if (sql.includes("UPDATE beta_sessions") || sql.includes("UPDATE api_tokens")) {
    return { meta: { changes: 1 } };
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
  if (sql.includes("UPDATE repair_queue_items") && sql.includes("SET status = ?,") && sql.includes("action_mode = ?")) {
    const [status, actionMode, rerunStatus, rerunReportId, updatedAt, updatedByEmail, id, reportId, ownerEmail] = values;
    const row = env.queueItems.find((row) => row.id === id && row.report_id === reportId && row.owner_email === ownerEmail);
    if (!row) return { meta: { changes: 0 } };
    Object.assign(row, {
      status,
      action_mode: actionMode,
      rerun_status: rerunStatus,
      last_rerun_report_id: rerunReportId || null,
      updated_at: updatedAt,
      updated_by_email: updatedByEmail
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO repair_agent_actions")) {
    const queueItem = env.queueItems.find((row) =>
      row.id === values[19] &&
      row.report_id === values[20] &&
      row.owner_email === values[21]
    );
    if (!queueItem) return { meta: { changes: 0 } };
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
  if (sql.includes("UPDATE repair_queue_items") && sql.includes("status = 'drafted'")) {
    const [actionMode, updatedAt, updatedByEmail, id, reportId, ownerEmail] = values;
    const row = env.queueItems.find((row) => row.id === id && row.report_id === reportId && row.owner_email === ownerEmail);
    if (!row) return { meta: { changes: 0 } };
    Object.assign(row, {
      status: "drafted",
      action_mode: actionMode,
      rerun_status: "not_run",
      last_rerun_report_id: null,
      updated_at: updatedAt,
      updated_by_email: updatedByEmail
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("UPDATE repair_agent_actions")) {
    const [approvalState, executionState, rerunState, rerunReportId, updatedAt, approvedAt, appliedAt, updatedByEmail, id, reportId, ownerEmail, queueItemId] = values;
    const action = env.actions.find((row) => row.id === id && row.report_id === reportId && row.owner_email === ownerEmail);
    const queueItem = env.queueItems.find((row) => row.id === queueItemId && row.report_id === reportId && row.owner_email === ownerEmail);
    if (!action || !queueItem) return { meta: { changes: 0 } };
    Object.assign(action, {
      approval_state: approvalState,
      execution_state: executionState,
      rerun_state: rerunState,
      rerun_report_id: rerunReportId || null,
      updated_at: updatedAt,
      approved_at: approvedAt,
      applied_at: appliedAt,
      updated_by_email: updatedByEmail
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("UPDATE repair_queue_items") && sql.includes("rerun_status = ?")) {
    const [status, rerunStatus, rerunReportId, updatedAt, updatedByEmail, id, reportId, ownerEmail] = values;
    const row = env.queueItems.find((row) => row.id === id && row.report_id === reportId && row.owner_email === ownerEmail);
    if (!row) return { meta: { changes: 0 } };
    Object.assign(row, {
      status,
      rerun_status: rerunStatus,
      last_rerun_report_id: rerunReportId || null,
      updated_at: updatedAt,
      updated_by_email: updatedByEmail
    });
    return { meta: { changes: 1 } };
  }
  throw new Error(`Unexpected run SQL: ${sql}`);
}
