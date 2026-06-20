import assert from "node:assert/strict";
import test from "node:test";
import { getAccountSummary } from "./account.js";

test("account summary exposes owner-scoped drafted repair actions", async () => {
  const env = fakeAccountEnv({
    queueItems: [
      repairQueueRow({ status: "drafted" }),
      repairQueueRow({ id: "other-queue", owner_email: "other@example.com", issue_id: "other-issue" })
    ],
    actions: [
      repairActionRow({ approval_state: "drafted" }),
      repairActionRow({ id: "other-action", owner_email: "other@example.com", issue_id: "other-issue" })
    ]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.repairItems, 1);
  assert.equal(body.metrics.draftedActions, 1);
  assert.equal(body.repairAgent.counts.awaitingApproval, 1);
  assert.equal(body.nextActions[0].id, "approve-drafted-repair");
  assert.equal(body.repairAgent.nextItems[0].issueId, "issue-1");
  assert.equal(body.repairAgent.nextItems[0].targetHost, "example.com");
});

test("account summary derives open repairs from recent reports before queue rows exist", async () => {
  const env = fakeAccountEnv({ queueItems: [], actions: [] });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.repairItems, 1);
  assert.equal(body.metrics.openRepairs, 1);
  assert.equal(body.repairAgent.nextItems[0].status, "open");
  assert.equal(body.nextActions[0].id, "start-proof-repair");
});

test("account summary marks repair agent unavailable when repair tables are missing", async () => {
  const env = fakeAccountEnv({ queueItems: [], actions: [], missingRepairTables: true });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.repairItems, 1);
  assert.equal(body.repairAgent.unavailable, true);
  assert.equal(body.nextActions[0].id, "repair-queue-unavailable");
});

test("account summary gates monitoring offer when entitlement event schema is missing", async () => {
  const env = fakeAccountEnv({ missingEntitlementEventsSchema: true });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  const monitoringOffer = body.offers.find((offer) => offer.key === "proof_monitoring");
  assert.equal(monitoringOffer.checkoutLive, false);
  assert.equal(body.monitoring.checkoutLive, false);
});

test("account summary derives unmaterialized repairs from R2-backed report JSON", async () => {
  const reportJsonBody = reportJson();
  const env = fakeAccountEnv({
    reports: [reportRow({ report_json: "r2:reports/report-1.json" })],
    reportBlobs: { "reports/report-1.json": reportJsonBody },
    queueItems: [],
    actions: []
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.repairItems, 1);
  assert.equal(body.repairAgent.nextItems[0].issueId, "issue-1");
  assert.equal(body.nextActions[0].id, "start-proof-repair");
});

test("account summary derives unmaterialized repairs beside existing queue rows", async () => {
  const env = fakeAccountEnv({
    reports: [
      reportRow({
        id: "report-new",
        url: "https://example.com/new",
        report_json: reportJson({
          id: "report-new",
          findings: [{
            id: "issue-new",
            severity: "critical",
            title: "New unmaterialized issue",
            pageUrl: "https://example.com/new",
            pageLabel: "new",
            evidence: "Rendered title is missing.",
            fix: "Add a descriptive title.",
            confidence: "verified",
            source: "rendered"
          }],
          repairPlan: []
        })
      }),
      reportRow()
    ],
    queueItems: [repairQueueRow()]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.repairItems, 2);
  assert.deepEqual(
    body.repairAgent.nextItems.map((item) => item.issueId).sort(),
    ["issue-1", "issue-new"]
  );
});

test("account summary keeps capped-out saved repairs from reopening", async () => {
  const olderRows = Array.from({ length: 220 }, (_, index) => repairQueueRow({
    id: `old-queue-${index}`,
    report_id: `old-report-${index}`,
    issue_id: `old-issue-${index}`,
    status: "open"
  }));
  const env = fakeAccountEnv({
    reports: [reportRow()],
    queueItems: [
      ...olderRows,
      repairQueueRow({ status: "fixed", rerun_status: "fixed", last_rerun_report_id: "rerun-report-1" })
    ],
    actions: [
      repairActionRow({
        approval_state: "approved",
        execution_state: "applied",
        rerun_state: "fixed",
        rerun_report_id: "rerun-report-1"
      })
    ]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.repairItems, 0);
  assert.equal(body.metrics.openRepairs, 0);
  assert.equal(body.repairAgent.nextItems.length, 0);
});

test("account summary keeps verification first only before the first report", async () => {
  const newUserEnv = fakeAccountEnv({ reports: [], siteClaims: [], queueItems: [], actions: [] });
  const newUserResponse = await getAccountSummary(sessionRequest("/api/account"), newUserEnv);
  assert.equal(newUserResponse.status, 200);
  const newUserBody = await newUserResponse.json();
  assert.equal(newUserBody.nextActions[0].id, "verify-site");

  const reportEnv = fakeAccountEnv({ siteClaims: [], queueItems: [], actions: [] });
  const reportResponse = await getAccountSummary(sessionRequest("/api/account"), reportEnv);
  assert.equal(reportResponse.status, 200);
  const reportBody = await reportResponse.json();
  assert.equal(reportBody.nextActions[0].id, "start-proof-repair");
});

test("account summary points approved repairs toward apply", async () => {
  const env = fakeAccountEnv({
    queueItems: [repairQueueRow({ status: "approved", rerun_status: "not_run" })],
    actions: [repairActionRow({ approval_state: "approved", execution_state: "not_started" })]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.approvedActions, 1);
  assert.equal(body.nextActions[0].id, "apply-approved-repair");
});

test("account summary drops ignored repair actions from active repair counts", async () => {
  const env = fakeAccountEnv({
    queueItems: [repairQueueRow({ status: "ignored", rerun_status: "not_run" })],
    actions: [repairActionRow({ approval_state: "ignored", execution_state: "not_started" })]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.repairItems, 0);
  assert.equal(body.metrics.openRepairs, 0);
  assert.equal(body.repairAgent.counts.active, 0);
  assert.equal(body.repairAgent.nextItems.length, 0);
});

test("account summary points applied repairs toward rerun proof", async () => {
  const env = fakeAccountEnv({
    queueItems: [repairQueueRow({ status: "applied", rerun_status: "not_run" })],
    actions: [repairActionRow({ approval_state: "approved", execution_state: "applied" })]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.appliedRepairs, 1);
  assert.equal(body.metrics.approvedActions, 0);
  assert.equal(body.repairAgent.counts.approvedActions, 0);
  assert.equal(body.nextActions[0].id, "rerun-applied-repair");
  assert.match(body.nextActions[0].detail, /rerun proof/i);
});

test("account summary does not count regressed rerun proof as applied awaiting rerun", async () => {
  const env = fakeAccountEnv({
    queueItems: [repairQueueRow({ status: "regressed", rerun_status: "regressed" })],
    actions: [repairActionRow({ approval_state: "approved", execution_state: "applied", rerun_state: "regressed" })]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.appliedRepairs, 0);
  assert.equal(body.metrics.regressedRepairs, 1);
  assert.equal(body.metrics.approvedActions, 0);
  assert.equal(body.repairAgent.counts.approvedActions, 0);
  assert.equal(body.repairAgent.counts.appliedAwaitingRerun, 0);
});

test("account summary treats still-open rerun proof as review work, not rerun-needed", async () => {
  const env = fakeAccountEnv({
    queueItems: [repairQueueRow({ status: "applied", rerun_status: "still_open", last_rerun_report_id: "rerun-report-1" })],
    actions: [repairActionRow({ approval_state: "approved", execution_state: "applied", rerun_state: "still_open", rerun_report_id: "rerun-report-1" })]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.appliedRepairs, 0);
  assert.equal(body.metrics.approvedActions, 0);
  assert.equal(body.repairAgent.counts.approvedActions, 0);
  assert.equal(body.repairAgent.counts.appliedAwaitingRerun, 0);
  assert.equal(body.nextActions[0].id, "review-rerun-repair");
});

test("account summary surfaces monitor regressions ahead of ordinary repairs", async () => {
  const env = fakeAccountEnv({
    reports: [reportRow({
      report_json: reportJson({
        reportDelta: {
          status: "ready",
          note: "Compares this saved report with the earlier run.",
          summary: {
            newIssuesCount: 1,
            criticalDelta: 1,
            warningDelta: 0
          },
          newIssues: [{
            severity: "critical",
            title: "Canonical changed after deploy",
            evidence: "Latest rendered canonical points to a staging URL.",
            fix: "Restore the production canonical."
          }]
        }
      })
    })],
    schedules: [{
      id: "schedule-1",
      owner_email: "owner@example.com",
      status: "active",
      target_url: "https://example.com/",
      target_host: "example.com",
      interval_days: 7,
      last_report_id: "report-1",
      last_error: "",
      updated_at: nowIso()
    }]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.metrics.regressedRepairs, 1);
  assert.equal(body.repairAgent.nextItems[0].kind, "monitor_regression");
  assert.equal(body.nextActions[0].id, "review-monitor-regression");
});

test("account summary does not invent delivery readiness without proposal state", async () => {
  const env = fakeAccountEnv({
    fixRequests: [fixRequestRow({
      status: "paid",
      paid_at: nowIso(),
      payment_id: "payment-1",
      customer_note: "Ready for review",
      delivery_url: "https://seofixkit.com/beta/reports/final",
      final_report_id: "final-report-1"
    })]
  });

  const response = await getAccountSummary(sessionRequest("/api/account"), env);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.fixRequests.length, 1);
  assert.equal(body.fixRequests[0].status, "paid");
  assert.equal(body.fixRequests[0].deliveryReadiness, undefined);
  assert.equal(body.fixRequests[0].repairProposalSummary, undefined);
});

function sessionRequest(path) {
  return new Request(`https://seofixkit.test${path}`, {
    headers: {
      cookie: "sfk_beta_session=test-session"
    }
  });
}

function fakeAccountEnv(overrides = {}) {
  const env = {
    ownerEmail: "owner@example.com",
    reports: overrides.reports || [reportRow()],
    fixRequests: overrides.fixRequests || [],
    auditJobs: overrides.auditJobs || [],
    siteClaims: overrides.siteClaims || [{
      id: "site-1",
      owner_email: "owner@example.com",
      host: "example.com",
      status: "verified",
      verification_method: "dns",
      verification_token: "token",
      created_at: nowIso(),
      updated_at: nowIso(),
      verified_at: nowIso(),
      revoked_at: null
    }],
    schedules: overrides.schedules || [],
    queueItems: overrides.queueItems || [repairQueueRow()],
    actions: overrides.actions || [],
    entitlements: overrides.entitlements || [],
    reportBlobs: overrides.reportBlobs || {},
    missingRepairTables: Boolean(overrides.missingRepairTables),
    missingEntitlementSchema: Boolean(overrides.missingEntitlementSchema),
    missingEntitlementEventsSchema: Boolean(overrides.missingEntitlementEventsSchema),
    DODO_SEOFIXKIT_API_KEY: "test-api-key",
    DODO_SEOFIXKIT_PRODUCT_MONITORING_ID: "pdt_monitoring",
    DODO_SEOFIXKIT_BRAND_ID: "brand_seofixkit",
    DODO_SEOFIXKIT_ENVIRONMENT: "test",
    DODO_SEOFIXKIT_WEBHOOK_SECRET: "whsec_test"
  };
  env.REPORTS = {
    get: async (key) => {
      const value = env.reportBlobs[key];
      if (!value) return null;
      return { text: async () => value };
    }
  };
  env.WAITLIST_DB = {
    prepare(sql) {
      return {
        first: async () => first(sql, [], env),
        all: async () => all(sql, [], env),
        run: async () => run(sql, [], env),
        bind(...values) {
          return statement(sql, values, env);
        }
      };
    }
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
  if (sql.includes("FROM beta_sessions")) {
    return {
      token_hash: values[0],
      owner_email: env.ownerEmail,
      invite_id: null,
      access_mode: "founder-override",
      expires_at: futureIso(),
      revoked_at: null
    };
  }
  if (sql.includes("FROM offer_entitlements")) {
    if (env.missingEntitlementSchema) throw new Error("no such table: offer_entitlements");
    return env.entitlements[0] || null;
  }
  if (sql.includes("FROM offer_entitlement_events")) {
    if (env.missingEntitlementEventsSchema) throw new Error("no such table: offer_entitlement_events");
    return null;
  }
  throw new Error(`Unexpected first SQL: ${sql}`);
}

function all(sql, values, env) {
  const ownerEmail = values[0];
  if (sql.includes("FROM audit_reports")) {
    return { results: env.reports.filter((row) => row.owner_email === ownerEmail) };
  }
  if (sql.includes("FROM fix_requests")) {
    return { results: env.fixRequests.filter((row) => row.owner_email === ownerEmail) };
  }
  if (sql.includes("FROM audit_jobs")) {
    return { results: env.auditJobs.filter((row) => row.owner_email === ownerEmail) };
  }
  if (sql.includes("FROM site_claims")) {
    return { results: env.siteClaims.filter((row) => row.owner_email === ownerEmail && !row.revoked_at) };
  }
  if (sql.includes("FROM audit_schedules")) {
    return { results: env.schedules.filter((row) => row.owner_email === ownerEmail && row.status === "active") };
  }
  if (sql.includes("FROM offer_entitlements")) {
    if (env.missingEntitlementSchema) throw new Error("no such table: offer_entitlements");
    return { results: env.entitlements.filter((row) => row.owner_email === ownerEmail && !row.revoked_at) };
  }
  if (sql.includes("FROM repair_queue_items")) {
    if (env.missingRepairTables) throw new Error("no such table: repair_queue_items");
    const reportIds = sql.includes("report_id IN") ? new Set(values.slice(1)) : null;
    const rows = env.queueItems.filter((row) => {
      if (row.owner_email !== ownerEmail) return false;
      return reportIds ? reportIds.has(row.report_id) : true;
    });
    return { results: reportIds ? rows : rows.slice(0, 200) };
  }
  if (sql.includes("FROM repair_agent_actions")) {
    if (env.missingRepairTables) throw new Error("no such table: repair_agent_actions");
    const reportIds = sql.includes("report_id IN") ? new Set(values.slice(1)) : null;
    const rows = env.actions.filter((row) => {
      if (row.owner_email !== ownerEmail) return false;
      return reportIds ? reportIds.has(row.report_id) : true;
    });
    return { results: reportIds ? rows : rows.slice(0, 200) };
  }
  throw new Error(`Unexpected all SQL: ${sql}`);
}

function run(sql) {
  if (sql.includes("UPDATE beta_sessions")) return { meta: { changes: 1 } };
  throw new Error(`Unexpected run SQL: ${sql}`);
}

function reportRow(overrides = {}) {
  return {
    id: "report-1",
    owner_email: "owner@example.com",
    url: "https://example.com/",
    target_host: "example.com",
    score: 82,
    summary_json: JSON.stringify({ pagesScanned: 1, totalFindings: 1, guardedFalsePositives: 0 }),
    report_json: reportJson(),
    created_at: nowIso(),
    expires_at: futureIso(),
    ...overrides
  };
}

function reportJson(overrides = {}) {
  return JSON.stringify({
    id: "report-1",
    url: "https://example.com/",
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
      source: "rendered"
    }],
    ...overrides
  });
}

function repairQueueRow(overrides = {}) {
  return {
    id: "queue-1",
    report_id: "report-1",
    owner_email: "owner@example.com",
    issue_id: "issue-1",
    title: "Missing title",
    severity: "critical",
    page_url: "https://example.com/",
    page_label: "home",
    proof: "Rendered title is missing.",
    fix: "Add a descriptive title.",
    snippet: "",
    acceptance: "Rendered title exists.",
    confidence: "verified",
    source: "rendered",
    source_kind: "finding",
    estimated_effort: "",
    work_type: "",
    action_mode: "self_serve",
    status: "open",
    rerun_status: "not_run",
    last_rerun_report_id: "",
    created_at: nowIso(),
    updated_at: nowIso(),
    updated_by_email: "owner@example.com",
    ...overrides
  };
}

function repairActionRow(overrides = {}) {
  return {
    id: "action-1",
    report_id: "report-1",
    owner_email: "owner@example.com",
    queue_item_id: "queue-1",
    issue_id: "issue-1",
    action_mode: "self_serve",
    action_type: "draft_fix",
    approval_state: "drafted",
    execution_state: "not_started",
    rerun_state: "not_run",
    source_proof: "Rendered title is missing.",
    proposed_change: "Add a descriptive title.",
    acceptance: "Rendered title exists.",
    rerun_report_id: "",
    created_at: nowIso(),
    updated_at: nowIso(),
    approved_at: "",
    applied_at: "",
    updated_by_email: "owner@example.com",
    ...overrides
  };
}

function fixRequestRow(overrides = {}) {
  return {
    id: "fix-request-1",
    owner_email: "owner@example.com",
    report_id: "report-1",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 82,
    issue_count: 1,
    status: "checkout_created",
    checkout_session_id: "checkout-1",
    customer_note: "",
    delivery_url: "",
    final_report_id: "",
    in_progress_at: "",
    delivered_at: "",
    paid_at: "",
    due_at: "",
    next_update_at: "",
    status_reason: "",
    is_test: 0,
    refunded_at: "",
    before_after_summary_json: "",
    created_at: nowIso(),
    updated_at: nowIso(),
    ...overrides
  };
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso() {
  return new Date(Date.now() + 60_000).toISOString();
}
