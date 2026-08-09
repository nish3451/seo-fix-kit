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

  const sessionPack = await worker.fetch(sessionRequest(
    env,
    `/api/reports/${env.reportId}/repair-actions/${sessionActionBody.action.id}/implementation.md`
  ), env, fakeCtx());
  assert.equal(sessionPack.status, 200);
  assert.match(sessionPack.headers.get("content-type") || "", /text\/markdown/);
  assert.match(await sessionPack.text(), /# SEOFixKit Implementation Pack/);

  env.reports.push(fixedRerunReportRow("rerun-fixed-report-1"));
  const sessionFixedPatch = await worker.fetch(sessionRequest(
    env,
    `/api/reports/${env.reportId}/repair-actions/${sessionActionBody.action.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-fixed-report-1"
      })
    }
  ), env, fakeCtx());
  assert.equal(sessionFixedPatch.status, 200);
  const sessionProof = await worker.fetch(sessionRequest(
    env,
    `/api/reports/${env.reportId}/repair-actions/${sessionActionBody.action.id}/proof.md`
  ), env, fakeCtx());
  assert.equal(sessionProof.status, 200);
  assert.match(sessionProof.headers.get("content-type") || "", /text\/markdown/);
  assert.match(await sessionProof.text(), /# SEOFixKit Repair Proof Receipt/);

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

  const apiPack = await worker.fetch(apiRequest(
    apiEnv,
    `/v1/audits/${apiEnv.auditId}/repair-actions/${apiActionBody.action.id}/implementation.md`
  ), apiEnv, fakeCtx());
  assert.equal(apiPack.status, 200);
  assert.match(apiPack.headers.get("content-type") || "", /text\/markdown/);
  assert.match(await apiPack.text(), /# SEOFixKit Implementation Pack/);

  apiEnv.reports.push(fixedRerunReportRow("rerun-fixed-report-1"));
  const apiFixedPatch = await worker.fetch(apiRequest(
    apiEnv,
    `/v1/audits/${apiEnv.auditId}/repair-actions/${apiActionBody.action.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        rerun_state: "fixed",
        rerun_report_id: "rerun-fixed-report-1"
      })
    }
  ), apiEnv, fakeCtx());
  assert.equal(apiFixedPatch.status, 200);
  const apiProof = await worker.fetch(apiRequest(
    apiEnv,
    `/v1/audits/${apiEnv.auditId}/repair-actions/${apiActionBody.action.id}/proof.md`
  ), apiEnv, fakeCtx());
  assert.equal(apiProof.status, 200);
  assert.match(apiProof.headers.get("content-type") || "", /text\/markdown/);
  assert.match(await apiProof.text(), /# SEOFixKit Repair Proof Receipt/);
});

test("Worker dispatch 301-redirects www.seofixkit.com onto the apex host", async () => {
  const env = await fakeWorkerEnv();

  const root = await worker.fetch(new Request("https://www.seofixkit.com/"), env, fakeCtx());
  assert.equal(root.status, 301);
  assert.equal(root.headers.get("location"), "https://seofixkit.com/");
  assert.match(root.headers.get("strict-transport-security") || "", /max-age=31536000/);

  const deep = await worker.fetch(new Request("https://www.seofixkit.com/packages?utm_source=scout"), env, fakeCtx());
  assert.equal(deep.status, 301);
  assert.equal(deep.headers.get("location"), "https://seofixkit.com/packages?utm_source=scout");

  const api = await worker.fetch(new Request("https://www.seofixkit.com/api/health"), env, fakeCtx());
  assert.equal(api.status, 301);
  assert.equal(api.headers.get("location"), "https://seofixkit.com/api/health");

  const sitemap = await worker.fetch(new Request("https://www.seofixkit.com/sitemap.xml"), env, fakeCtx());
  assert.equal(sitemap.status, 301);
  assert.equal(sitemap.headers.get("location"), "https://seofixkit.com/sitemap.xml");
});

test("Worker dispatch serves apex-only canonicals, robots, sitemap, and llms.txt", async () => {
  const env = await fakeWorkerEnv();

  const sitemap = await worker.fetch(new Request("https://seofixkit.com/sitemap.xml"), env, fakeCtx());
  assert.equal(sitemap.status, 200);
  const sitemapBody = await sitemap.text();
  assert.match(sitemapBody, /<loc>https:\/\/seofixkit\.com\/<\/loc>/);
  assert.doesNotMatch(sitemapBody, /www\.seofixkit\.com/);

  const robots = await worker.fetch(new Request("https://seofixkit.com/robots.txt"), env, fakeCtx());
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/seofixkit\.com\/sitemap\.xml/);

  const methodology = await worker.fetch(new Request("https://seofixkit.com/methodology"), env, fakeCtx());
  assert.equal(methodology.status, 200);
  const methodologyBody = await methodology.text();
  assert.match(methodologyBody, /rel="canonical" href="https:\/\/seofixkit\.com\/methodology"/);
  assert.doesNotMatch(methodologyBody, /www\.seofixkit\.com/);

  const llms = await worker.fetch(new Request("https://seofixkit.com/llms.txt"), env, fakeCtx());
  assert.match(await llms.text(), /https:\/\/seofixkit\.com\/check/);
});

test("Worker dispatch exposes public-safe deep health readiness", async () => {
  const env = await fakeWorkerEnv();
  const response = await worker.fetch(new Request("https://seofixkit.test/api/deep-health"), env, fakeCtx());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.equal(body.ok, true);
  assert.equal(body.status, "ready");
  assert.equal(body.scope, "runtime_config_and_schema_readiness");
  assert.match(body.limits.join(" "), /does not prove a real paid card transaction/i);
  assert.match(body.limits.join(" "), /not paid offer activation claims/i);
  assert.equal(body.bindings.waitlistDb, true);
  assert.equal(body.bindings.browserRun, true);
  assert.equal(body.bindings.auditQueue, true);
  assert.equal(body.bindings.reportStorage, true);
  assert.equal(body.bindings.emailNotifications, true);
  assert.equal(body.billing.checkoutReady, true);
  assert.equal(body.billing.monitoringCheckoutReady, true);
  assert.equal(body.billing.monitoringProductConfigured, true);
  assert.equal(body.billing.webhookReady, true);
  assert.equal(body.billing.environment, "test");
  assert.equal(body.schema.criticalOk, true);
  assert.equal(body.capabilities.selfServeAudit, true);
  assert.equal(body.capabilities.fixPackCheckout, true);
  assert.equal(body.capabilities.repairExecution, true);
  assert.equal(body.capabilities.recurringMonitoring, true);
  assert.equal(body.capabilities.paidProofMonitoring, true);
  assert.equal(body.capabilities.developerApi, true);
  assert.equal(body.capabilities.agencyWorkspace, true);
  assert.equal(body.capabilities.largeCrawlEarlyAccess, true);
  assert.equal(body.schema.checks.some((check) => check.key === "fixPackCheckoutTarget" && check.ok), true);
  assert.doesNotMatch(JSON.stringify(body), /dodo-key|whsec|pdt_fix_pack|brand-1|owner@example\.com|checkoutUrl/i);
});

test("Worker deep health degrades when critical schema is missing", async () => {
  const env = await fakeWorkerEnv();
  env.missingHealthTables = new Set(["repair_queue_items"]);

  const response = await worker.fetch(new Request("https://seofixkit.test/api/deep-health"), env, fakeCtx());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.status, "degraded");
  assert.deepEqual(body.schema.failedCritical, ["repairQueueItems"]);
  assert.equal(body.capabilities.fixPackCheckout, false);
  assert.equal(body.capabilities.repairExecution, false);
  assert.equal(body.schema.checks.find((check) => check.key === "repairQueueItems").error, "table missing");
});

test("Worker deep health degrades when billing schema is incomplete", async () => {
  const env = await fakeWorkerEnv();
  env.missingHealthTables = new Set(["dodo_webhook_events"]);

  const response = await worker.fetch(new Request("https://seofixkit.test/api/deep-health"), env, fakeCtx());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.schema.failedCritical.includes("dodoWebhookEvents"), true);
  assert.equal(body.capabilities.fixPackCheckout, false);
  assert.equal(body.billing.checkoutReady, true);
  assert.equal(body.schema.checks.find((check) => check.key === "dodoWebhookEvents").error, "table missing");
});

test("Worker deep health does not overclaim paid monitoring when monitoring config is missing", async () => {
  const env = await fakeWorkerEnv();
  delete env.DODO_SEOFIXKIT_PRODUCT_MONITORING_ID;

  const response = await worker.fetch(new Request("https://seofixkit.test/api/deep-health"), env, fakeCtx());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.billing.monitoringCheckoutReady, false);
  assert.equal(body.billing.monitoringProductConfigured, false);
  assert.equal(body.capabilities.paidProofMonitoring, false);
});

test("Worker deep health does not overclaim paid monitoring when entitlement events schema is missing", async () => {
  const env = await fakeWorkerEnv();
  env.missingHealthTables = new Set(["offer_entitlement_events"]);

  const response = await worker.fetch(new Request("https://seofixkit.test/api/deep-health"), env, fakeCtx());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.schema.failed, ["offerEntitlementEvents"]);
  assert.equal(body.capabilities.paidProofMonitoring, false);
});

test("Worker deep health claims the route for HEAD and unsupported methods", async () => {
  const env = await fakeWorkerEnv();

  const headResponse = await worker.fetch(new Request("https://seofixkit.test/api/deep-health", {
    method: "HEAD"
  }), env, fakeCtx());
  assert.equal(headResponse.status, 200);
  assert.match(headResponse.headers.get("content-type") || "", /application\/json/);
  assert.equal(await headResponse.text(), "");

  const postResponse = await worker.fetch(new Request("https://seofixkit.test/api/deep-health", {
    method: "POST"
  }), env, fakeCtx());
  const body = await postResponse.json();
  assert.equal(postResponse.status, 405);
  assert.equal(body.error, "Method not allowed.");
});

test("Worker dispatch creates admin-only beta proof sessions without exposing tokens", async () => {
  const env = await fakeWorkerEnv();

  const denied = await worker.fetch(new Request("https://seofixkit.test/admin/beta-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerEmail: "proof@example.com" })
  }), env, fakeCtx());
  const deniedBody = await denied.json();
  assert.equal(denied.status, 401);
  assert.equal(deniedBody.error, "Unauthorized");
  assert.equal(denied.headers.get("set-cookie"), null);

  const response = await worker.fetch(new Request("https://seofixkit.test/admin/beta-session", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.ADMIN_EXPORT_TOKEN}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ ownerEmail: "proof@example.com" })
  }), env, fakeCtx());
  const body = await response.json();
  const cookie = response.headers.get("set-cookie") || "";

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.ownerEmail, "proof@example.com");
  assert.equal(body.accessMode, "founder-override");
  assert.equal(Object.hasOwn(body, "token"), false);
  assert.match(cookie, /sfk_beta_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.equal(env.betaSessions.some((row) =>
    row.owner_email === "proof@example.com" &&
    row.access_mode === "founder-override" &&
    !row.invite_id
  ), true);
  assert.doesNotMatch(JSON.stringify(body), /sfk_beta_session|test-admin-token/);
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

function fixedRerunReportRow(id) {
  const timestamp = new Date(Date.now() + 60_000).toISOString();
  return {
    id,
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify({
      id,
      url: "https://example.com/",
      createdAt: timestamp,
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
    }),
    summary_json: JSON.stringify({ totalFindings: 0 }),
    created_at: timestamp,
    updated_at: timestamp
  };
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
    BROWSER: {},
    AUDIT_QUEUE: {},
    REPORTS: {},
    EMAIL: { send() {} },
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <support@seofixkit.com>",
    DODO_SEOFIXKIT_API_KEY: "dodo-key",
    DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: "pdt_fix_pack",
    DODO_SEOFIXKIT_PRODUCT_MONITORING_ID: "pdt_monitoring",
    DODO_SEOFIXKIT_BRAND_ID: "brand-1",
    DODO_SEOFIXKIT_ENVIRONMENT: "test",
    DODO_SEOFIXKIT_WEBHOOK_SECRET: "whsec_test",
    ASSETS: {
      fetch: async () => new Response("asset fallback", { status: 404 })
    },
    ADMIN_EXPORT_TOKEN: "test-admin-token",
    adminAuditLog: []
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
  if (sql.includes("SELECT checkout_repair_json FROM fix_requests")) {
    if (env.missingCheckoutRepairColumn) throw new Error("no such column: checkout_repair_json");
    if (env.missingHealthTables?.has("fix_requests")) throw new Error("no such table: fix_requests");
    return { checkout_repair_json: "" };
  }
  if (!values.length && /^SELECT\b/i.test(sql) && /\bLIMIT\s+1\b/i.test(sql)) {
    const table = (sql.match(/FROM\s+([a-z_]+)/i) || [])[1] || "";
    if (env.missingHealthTables?.has(table)) throw new Error(`no such table: ${table}`);
    return { ok: 1 };
  }
  if (sql.includes("SELECT 1 AS ok FROM ")) {
    const table = (sql.match(/FROM\s+([a-z_]+)/i) || [])[1] || "";
    if (env.missingHealthTables?.has(table)) throw new Error(`no such table: ${table}`);
    return { ok: 1 };
  }
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
  if (sql.includes("INSERT INTO audit_usage")) {
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO beta_sessions")) {
    env.betaSessions.push({
      token_hash: values[0],
      owner_email: values[1],
      created_at: values[2],
      expires_at: values[3],
      last_seen_at: values[4],
      ip_hash: values[5],
      user_agent: values[6],
      invite_id: values[7],
      access_mode: values[8],
      revoked_at: null
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO admin_audit_log")) {
    env.adminAuditLog.push({ values });
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
