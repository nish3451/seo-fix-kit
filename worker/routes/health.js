import { dodoCheckoutConfigStatus } from "../../shared/dodo.js";
import { isEmailConfigured } from "../../shared/fulfillment.js";
import { VERSION } from "../../shared/audit-engine.js";
import { jsonNoStore } from "../lib/http.js";

const SCHEMA_CHECKS = [
  { key: "accessLinks", label: "self-serve access links", sql: "SELECT 1 AS ok FROM access_tokens LIMIT 1", critical: true },
  { key: "siteClaims", label: "site ownership verification", sql: "SELECT 1 AS ok FROM site_claims LIMIT 1", critical: true },
  { key: "auditReports", label: "saved private reports", sql: "SELECT 1 AS ok FROM audit_reports LIMIT 1", critical: true },
  { key: "auditJobs", label: "queued audit jobs", sql: "SELECT 1 AS ok FROM audit_jobs LIMIT 1", critical: true },
  { key: "auditSchedules", label: "recurring audit monitors", sql: "SELECT 1 AS ok FROM audit_schedules LIMIT 1", critical: false },
  { key: "fixRequests", label: "Fix Pack requests", sql: "SELECT 1 AS ok FROM fix_requests LIMIT 1", critical: true },
  {
    key: "fixPackCheckoutColumns",
    label: "Fix Pack checkout columns",
    sql: "SELECT checkout_session_id, checkout_url, checkout_created_at, product_id FROM fix_requests LIMIT 1",
    critical: true
  },
  {
    key: "fixPackPaymentColumns",
    label: "Fix Pack payment columns",
    sql: "SELECT payment_id, paid_at FROM fix_requests LIMIT 1",
    critical: true
  },
  {
    key: "fixPackCheckoutTarget",
    label: "Fix Pack selected-repair checkout metadata",
    sql: "SELECT checkout_repair_json FROM fix_requests LIMIT 1",
    critical: true
  },
  {
    key: "dodoWebhookEvents",
    label: "Dodo webhook idempotency storage",
    sql: "SELECT webhook_id, event_type, payment_id, fix_request_id, status, payload_hash FROM dodo_webhook_events LIMIT 1",
    critical: true
  },
  { key: "repairProposals", label: "repair proposal approval", sql: "SELECT 1 AS ok FROM repair_proposals LIMIT 1", critical: true },
  { key: "repairProposalEvents", label: "repair proposal events", sql: "SELECT 1 AS ok FROM repair_proposal_events LIMIT 1", critical: false },
  { key: "repairQueueItems", label: "agent repair queue", sql: "SELECT 1 AS ok FROM repair_queue_items LIMIT 1", critical: true },
  { key: "repairAgentActions", label: "approval-safe repair actions", sql: "SELECT 1 AS ok FROM repair_agent_actions LIMIT 1", critical: true },
  { key: "offerEntitlements", label: "staged offer entitlements", sql: "SELECT 1 AS ok FROM offer_entitlements LIMIT 1", critical: false },
  { key: "developerTokens", label: "Developer API tokens", sql: "SELECT 1 AS ok FROM api_tokens LIMIT 1", critical: false },
  { key: "developerWebhooks", label: "Developer API webhooks", sql: "SELECT 1 AS ok FROM api_webhooks LIMIT 1", critical: false },
  { key: "whiteLabelShares", label: "white-label report links", sql: "SELECT 1 AS ok FROM report_share_links LIMIT 1", critical: false },
  { key: "teamMembers", label: "team repair workspace", sql: "SELECT 1 AS ok FROM team_members LIMIT 1", critical: false },
  { key: "reportDomains", label: "verified report domains", sql: "SELECT 1 AS ok FROM report_domains LIMIT 1", critical: false },
  { key: "largeCrawlJobs", label: "large crawl jobs", sql: "SELECT 1 AS ok FROM large_crawl_jobs LIMIT 1", critical: false }
];

async function getDeepHealth(_request, env = {}) {
  if (!["GET", "HEAD"].includes(_request.method)) {
    return jsonNoStore({ error: "Method not allowed." }, 405);
  }

  const bindings = bindingStatus(env);
  const schema = await schemaStatus(env);
  const dodo = dodoCheckoutConfigStatus(env);
  const billing = {
    checkoutReady: dodo.checkoutReady,
    webhookReady: dodo.webhookSecret,
    apiConfigured: dodo.apiKey,
    productConfigured: dodo.productId,
    brandConfigured: dodo.brandId,
    environment: dodo.environment || "missing"
  };
  const capabilities = capabilityStatus({ bindings, schema, billing });
  const criticalChecks = [
    bindings.waitlistDb,
    bindings.browserRun,
    bindings.auditQueue,
    bindings.reportStorage,
    bindings.emailNotifications,
    schema.criticalOk,
    billing.checkoutReady,
    billing.webhookReady
  ];
  const ok = criticalChecks.every(Boolean);

  const response = jsonNoStore({
    ok,
    status: ok ? "ready" : "degraded",
    service: "seo-fix-kit",
    runtime: "cloudflare-worker",
    version: VERSION,
    checkedAt: new Date().toISOString(),
    scope: "runtime_config_and_schema_readiness",
    limits: [
      "Ready means required bindings, provider config, and D1 schema checks passed.",
      "Ready does not prove a real paid card transaction, Dodo paid webhook delivery, completed repair delivery, or final rerun proof.",
      "Recurring monitoring, agency workspace, large crawl, and offer entitlement checks are storage/config readiness checks, not paid offer activation claims."
    ],
    bindings,
    billing,
    schema,
    capabilities
  }, ok ? 200 : 503);

  if (_request.method === "HEAD") {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  return response;
}

function bindingStatus(env = {}) {
  return {
    waitlistDb: Boolean(env.WAITLIST_DB),
    browserRun: Boolean(env.BROWSER),
    auditQueue: Boolean(env.AUDIT_QUEUE),
    reportStorage: Boolean(env.REPORTS),
    assets: Boolean(env.ASSETS),
    emailNotifications: isEmailConfigured(env)
  };
}

async function schemaStatus(env = {}) {
  if (!env.WAITLIST_DB) {
    const checks = SCHEMA_CHECKS.map((check) => ({
      key: check.key,
      label: check.label,
      ok: false,
      critical: check.critical,
      error: "D1 binding missing"
    }));
    return summarizeSchemaChecks(checks);
  }

  const checks = [];
  for (const check of SCHEMA_CHECKS) {
    checks.push(await runSchemaCheck(env, check));
  }
  return summarizeSchemaChecks(checks);
}

async function runSchemaCheck(env, check) {
  try {
    await firstPrepared(env.WAITLIST_DB.prepare(check.sql));
    return {
      key: check.key,
      label: check.label,
      ok: true,
      critical: check.critical
    };
  } catch (error) {
    return {
      key: check.key,
      label: check.label,
      ok: false,
      critical: check.critical,
      error: safeHealthError(error)
    };
  }
}

function firstPrepared(statement) {
  if (typeof statement?.first === "function") return statement.first();
  return statement.bind().first();
}

function summarizeSchemaChecks(checks) {
  const failed = checks.filter((check) => !check.ok);
  const failedCritical = failed.filter((check) => check.critical);
  return {
    ok: failed.length === 0,
    criticalOk: failedCritical.length === 0,
    checked: checks.length,
    failed: failed.map((check) => check.key),
    failedCritical: failedCritical.map((check) => check.key),
    checks
  };
}

function capabilityStatus({ bindings, schema, billing }) {
  const hasSchema = (key) => schema.checks.some((check) => check.key === key && check.ok);
  return {
    selfServeAudit: bindings.waitlistDb && bindings.browserRun && bindings.auditQueue && hasSchema("accessLinks") && hasSchema("siteClaims") && hasSchema("auditJobs"),
    fixPackCheckout:
      billing.checkoutReady &&
      hasSchema("fixRequests") &&
      hasSchema("fixPackCheckoutColumns") &&
      hasSchema("fixPackPaymentColumns") &&
      hasSchema("fixPackCheckoutTarget") &&
      hasSchema("dodoWebhookEvents") &&
      hasSchema("repairQueueItems"),
    repairExecution: hasSchema("repairProposals") && hasSchema("repairQueueItems") && hasSchema("repairAgentActions"),
    recurringMonitoring: hasSchema("auditSchedules"),
    developerApi: hasSchema("developerTokens") && hasSchema("developerWebhooks"),
    agencyWorkspace: hasSchema("whiteLabelShares") && hasSchema("teamMembers") && hasSchema("reportDomains"),
    largeCrawlEarlyAccess: hasSchema("largeCrawlJobs")
  };
}

function safeHealthError(error) {
  const message = String(error?.message || error || "schema check failed");
  if (/no such table/i.test(message)) return "table missing";
  if (/no such column/i.test(message)) return "column missing";
  if (/not found/i.test(message)) return "schema object missing";
  return "schema check failed";
}

export {
  bindingStatus,
  capabilityStatus,
  getDeepHealth,
  schemaStatus
};
