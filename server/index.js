import express from "express";
import cors from "cors";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { auditUrl } from "./audit/engine.js";
import { rootSitemap } from "../shared/audit-engine.js";
import {
  buildWhiteLabelReportHtml,
  defaultBranding,
  normalizeBrandingInput,
  whiteLabelReportFilename
} from "../shared/white-label-report.js";
import {
  aiAnswerReadinessHtml,
  demoHtml,
  llmsText,
  methodologyHtml,
  packagesHtml,
  privacyHtml,
  renderedVsStaticAuditHtml,
  smallBusinessSeoAuditHtml,
  supportHtml,
  termsHtml
} from "../worker/routes/pages.js";
import {
  buildPublicCheckResponse,
  checkHtml,
  publicCheckQuotaChecks,
  validatePublicCheckUrl
} from "../worker/routes/public-check.js";
import {
  backlinkRowsKey,
  parseBacklinkRows
} from "../shared/backlink-audit.js";
import {
  localSeoInputKey,
  localSeoInputSummary,
  parseLocalSeoInput
} from "../shared/local-seo-audit.js";
import {
  keywordRowsKey,
  keywordRowsSummary,
  parseKeywordRows
} from "../shared/keyword-rank-audit.js";
import {
  crawlDepthSummary,
  normalizeCrawlLimit
} from "../shared/crawl-depth.js";
import {
  buildCrawlInventory
} from "../shared/crawl-inventory.js";
import { resolvesToPrivateAddress } from "../shared/url-safety.js";
import { requestIpHash } from "../worker/lib/security.js";
import {
  agentActionResponse,
  apiRepairQueueStatusResponse,
  apiRepairQueueSummary,
  cleanActionMode,
  cleanQueueStatus,
  cleanRerunState,
  defaultProposedChangeForItem,
  deriveRepairQueueItems
} from "../shared/repair-queue.js";
import { repairAccountSummaryFromItems } from "../shared/account-repair-summary.js";
import { selectFixPackRepair } from "../shared/fix-pack-repair-selection.js";
import {
  repairActionDetailResponse,
  repairQueueItemDetailResponse
} from "../shared/repair-api-serializers.js";
import {
  buildRepairImplementationPack,
  repairImplementationItemForAction
} from "../shared/repair-implementation-pack.js";
import { buildRepairProofReceipt } from "../shared/repair-proof-receipt.js";
import {
  comparableReportHost,
  normalizeRepairActionCreateInput,
  normalizeRepairActionPatch,
  normalizeRepairQueuePatchItems,
  queueStatusFromActionState,
  repairActionTransitionEvents,
  repairActionWebhookPayload,
  repairProofIssueForAction,
  reportTimestampMs,
  rerunProofBlockedByNewApply,
  rerunProofFreshAfterMs,
  rerunReportProvesIssue,
  validRerunProofReport
} from "../shared/repair-action-rules.js";
import {
  normalizeRenderedCrawlTarget,
  renderedCrawlTargetSummary
} from "../shared/rendered-crawl-scale.js";
import {
  appendReportDeltaBrief,
  buildReportDelta
} from "../shared/report-delta.js";
import { buildRemediationBrief } from "../shared/remediation-brief.js";
import {
  LARGE_RENDERED_CRAWL_MAX_RETRIES,
  claimNextLargeRenderedCrawlBatch,
  completeLargeRenderedCrawlBatch,
  createLargeRenderedCrawlJob,
  largeRenderedCrawlMergeReadiness,
  largeRenderedCrawlProofFromPage,
  largeRenderedCrawlResponse,
  normalizeLargeRenderedCrawlRequest,
  retryLargeRenderedCrawlFailures
} from "../shared/large-rendered-crawl.js";
import { largeCrawlProofWriteStatus } from "../shared/large-crawl-proof-writer.js";
import { offerCatalog } from "../shared/offers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();
const port = Number(process.env.PORT || 8787);
const auditReports = new Map();
const auditJobs = new Map();
const auditSchedules = new Map();
const largeCrawlJobs = new Map();
const largeCrawlBatches = new Map();
const largeCrawlFrontier = new Map();
const largeCrawlProofs = new Map();
const largeCrawlDeadLetters = [];
const betaSessions = new Map();
const accessTokens = new Map();
const apiTokens = new Map();
const apiWebhooks = new Map();
const apiWebhookEvents = [];
const reportBrandingProfiles = new Map();
const reportShareLinks = new Map();
const reportDomains = new Map();
const teamMembers = new Map();
const issueCollaborations = new Map();
const localRepairQueueRows = new Map();
const localRepairActionRows = new Map();
const siteClaims = new Map();
const fixRequests = [];
// In-memory rate-limit counters for the anonymous one-page check, mirroring
// the Worker's D1-backed buckets (worker/routes/public-check.js). Entries
// expire by age so a long-running dev server does not leak memory.
const publicCheckQuotaCounts = new Map();

function localPublicCheckQuota(checks) {
  const now = Date.now();
  for (const check of checks) {
    const entry = publicCheckQuotaCounts.get(check.bucket) || { count: 0, createdAt: now };
    if (entry.count >= check.limit) {
      return { ok: false, error: check.error, resetAt: check.resetAt.toISOString() };
    }
    entry.count += 1;
    publicCheckQuotaCounts.set(check.bucket, entry);
  }
  for (const [key, entry] of publicCheckQuotaCounts) {
    if (now - entry.createdAt > 48 * 60 * 60 * 1000) {
      publicCheckQuotaCounts.delete(key);
    }
  }
  return { ok: true };
}
const VERSION = "0.9.0";
const SESSION_COOKIE = "sfk_beta_session";
const ADMIN_SESSION_COOKIE = "sfk_admin_session";
const BETA_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const REPORT_RETENTION_DAYS = 30;
const LARGE_RENDERED_CRAWL_LEASE_MS = 15 * 60 * 1000;
const LOCAL_WEBHOOK_TIMEOUT_MS = Math.max(Number(process.env.SEOFIXKIT_LOCAL_WEBHOOK_TIMEOUT_MS || 5000), 1);
const PROTECTED_FIX_REQUEST_STATUSES = new Set(["paid", "in_progress", "delivered", "refunded", "refund_failed", "disputed"]);
const LOCAL_REBUY_BLOCKED_FIX_REQUEST_STATUSES = new Set(["refunded", "refund_failed", "disputed"]);
const LOCAL_PENDING_FIX_REQUEST_STATUSES = new Set(["new", "checkout_created"]);
const FIX_PACK_OFFER = {
  name: "SEO Fix Pack",
  productKey: "seofixkit_fix_pack",
  description: "One proof-backed repair pass for this report plus one rerun after fixes."
};
const MONITORING_OFFER = {
  name: "Proof Monitoring",
  productKey: "seofixkit_proof_monitoring",
  offerKey: "proof_monitoring",
  description: "Weekly proof monitoring, report deltas, and change alerts for verified sites."
};
const DEMO_WATERFALL_SCRIPT = `window.__demoWaterfallScript = "${"x".repeat(340_000)}";`;
const DEMO_WATERFALL_STYLE = `body::before{content:"${"x".repeat(70_000)}";display:none}`;
const DEMO_WATERFALL_IMAGE = Buffer.alloc(720_000, 113);
const DEMO_PLATFORM_PLUGIN_SCRIPT = `window.__demoPlatformPlugin = true;${"/* plugin */".repeat(800)}`;
const DEMO_PLATFORM_PLUGIN_STYLE = `.demo-platform-plugin{display:block}${"/* css */".repeat(600)}`;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "seo-fix-kit", version: VERSION });
});

app.post("/api/waitlist", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (req.body?.company) {
    res.json({ ok: true, status: "joined" });
    return;
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  res.json({ ok: true, status: "joined", mode: "local-dev" });
});

app.post("/api/access/request", (req, res) => {
  const ownerEmail = normalizeEmail(req.body?.email || req.body?.ownerEmail);
  if (!ownerEmail) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = isoSecondsFromNow(15 * 60);
  accessTokens.set(tokenHash, {
    ownerEmail,
    createdAt: now,
    expiresAt,
    usedAt: ""
  });
  res.set("cache-control", "no-store").json({
    ok: true,
    status: "dev_link",
    message: "Local access link created.",
    accessUrl: `http://127.0.0.1:${port}/beta?access=${encodeURIComponent(token)}&email=${encodeURIComponent(ownerEmail)}`,
    expiresAt
  });
});

app.post("/api/access/verify", (req, res) => {
  const token = cleanAccessToken(req.body?.token || "");
  if (!token) {
    res.status(400).set("cache-control", "no-store").json({ error: "Access link is invalid." });
    return;
  }
  const tokenHash = sha256Hex(token);
  const record = accessTokens.get(tokenHash);
  if (!record || record.usedAt || record.expiresAt <= new Date().toISOString()) {
    res.status(401).set("cache-control", "no-store").json({ error: "Access link is expired or already used." });
    return;
  }
  record.usedAt = new Date().toISOString();
  const session = createLocalSession(req, record.ownerEmail, "self-serve");
  res
    .set("cache-control", "no-store")
    .set("set-cookie", sessionCookie(req, session.token, BETA_SESSION_TTL_SECONDS))
    .json({ ok: true, status: "unlocked", ownerEmail: record.ownerEmail, accessMode: "self-serve", expiresAt: session.expiresAt });
});

app.post("/api/beta/login", (req, res) => {
  const ownerEmail = normalizeEmail(req.body?.email || req.body?.ownerEmail);
  if (!ownerEmail) {
    res.status(400).json({ error: "Enter your beta email address." });
    return;
  }

  if (!isBetaPasswordValid(req.body?.inviteCode || req.body?.password)) {
    res.status(401).json({ error: "Private beta invite code required." });
    return;
  }

  const session = createLocalSession(req, ownerEmail, "founder-override");
  res
    .set("cache-control", "no-store")
    .set("set-cookie", sessionCookie(req, session.token, BETA_SESSION_TTL_SECONDS))
    .json({ ok: true, status: "unlocked", ownerEmail, expiresAt: session.expiresAt });
});

app.post("/api/beta/fix-request", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).json({ error: "Private beta session required." });
    return;
  }
  const reportId = String(req.body?.reportId || "");
  const report = auditReports.get(reportId);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  const existingFixRequest = fixRequests.slice().reverse().find((request) =>
    request.reportId === (report.id || reportId) &&
    request.ownerEmail === access.ownerEmail
  );
  if (existingFixRequest && PROTECTED_FIX_REQUEST_STATUSES.has(existingFixRequest.status)) {
    res.set("cache-control", "no-store").json({
      ok: true,
      mode: existingFixRequest.status,
      ...(LOCAL_REBUY_BLOCKED_FIX_REQUEST_STATUSES.has(existingFixRequest.status)
        ? {
          checkoutAvailable: false,
          message: "This Fix Pack was refunded or disputed, so checkout is closed for this report."
        }
        : {}),
      request: localFixRequestResponse(existingFixRequest),
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
    return;
  }
  const repairSelection = localFixPackRepairSelection(report, req.body || {});
  if (repairSelection.selectionConflict) {
    res.status(409).set("cache-control", "no-store").json({
      error: "Selected repair is no longer available for checkout. Refresh the report and choose an active repair.",
      code: "FIX_PACK_REPAIR_SELECTION_UNAVAILABLE",
      checkoutAvailable: false,
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
    return;
  }
  if (!repairSelection.selectedRepair) {
    res.status(409).set("cache-control", "no-store").json({
      error: "No active proof-backed repair is available for checkout.",
      checkoutAvailable: false,
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
    return;
  }
  if (existingFixRequest && LOCAL_PENDING_FIX_REQUEST_STATUSES.has(existingFixRequest.status)) {
    existingFixRequest.selectedRepair = repairSelection.selectedRepair;
    existingFixRequest.updatedAt = new Date().toISOString();
    if (existingFixRequest.status === "new" && process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL) {
      existingFixRequest.status = "checkout_created";
    }
    res.set("cache-control", "no-store").json({
      ok: true,
      mode: existingFixRequest.status === "checkout_created" ? "checkout" : "request",
      ...(existingFixRequest.status === "checkout_created" && process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL
        ? { checkoutUrl: process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL }
        : {
          checkoutAvailable: false,
          message: "Fix request saved. Dodo checkout is only created by the Cloudflare Worker."
        }),
      request: existingFixRequest,
      offer: FIX_PACK_OFFER,
      selectedRepair: repairSelection.selectedRepair
    });
    return;
  }
  const request = {
    id: randomUUID(),
    reportId: report.id || reportId,
    ownerEmail: access.ownerEmail,
    targetUrl: report.url,
    targetHost: new URL(report.url).hostname,
    score: report.score,
    issueCount: report.summary?.totalFindings || 0,
    status: process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL ? "checkout_created" : "new",
    offer: FIX_PACK_OFFER,
    customerNote: "",
    adminNote: "",
    assignedTo: "",
    deliveryUrl: "",
    finalReportId: "",
    selectedRepair: repairSelection.selectedRepair,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  fixRequests.push(request);
  if (process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL) {
    res.set("cache-control", "no-store").json({
      ok: true,
      mode: "checkout",
      checkoutUrl: process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL,
      request,
      offer: FIX_PACK_OFFER,
      selectedRepair: repairSelection.selectedRepair
    });
    return;
  }
  res.set("cache-control", "no-store").json({
    ok: true,
    mode: "request",
    checkoutAvailable: false,
    message: "Fix request saved. Dodo checkout is only created by the Cloudflare Worker.",
    request,
    offer: FIX_PACK_OFFER,
    selectedRepair: repairSelection.selectedRepair
  });
});

app.post("/api/beta/monitoring-checkout", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).json({ error: "Private beta session required." });
    return;
  }
  res.status(503).set("cache-control", "no-store").json({
    ok: false,
    code: "MONITORING_CHECKOUT_NOT_CONFIGURED",
    error: "Proof Monitoring checkout is only available in the Cloudflare Worker after the Dodo subscription product is configured.",
    message: "Proof Monitoring checkout is only available in the Cloudflare Worker after the Dodo subscription product is configured.",
    checkoutAvailable: false,
    offer: MONITORING_OFFER,
    target: {
      targetHost: "",
      siteClaimId: "",
      auditScheduleId: ""
    },
    monitoring: {
      offerKey: "proof_monitoring",
      status: "beta_allowance",
      checkoutLive: false
    }
  });
});

app.get("/api/pricing-preview", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).json({ error: "Private beta session required." });
    return;
  }
  res.status(503).json({
    ok: false,
    code: "PRICING_UNAVAILABLE",
    message: "Dodo pricing preview is only available in the Cloudflare Worker runtime.",
    pricing: {
      status: "unavailable",
      source: "dodo"
    }
  });
});

app.get("/api/billing/summary", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }

  const ownerFixRequests = fixRequests
    .filter((request) => request.ownerEmail === access.ownerEmail && !request.isTest)
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const localActiveMonitorCount = [...auditSchedules.values()].filter((schedule) =>
    schedule.ownerEmail === access.ownerEmail && schedule.status === "active"
  ).length;
  const localEligibleSiteCount = new Set([
    ...[...siteClaims.values()]
      .filter((site) => site.ownerEmail === access.ownerEmail && site.status === "verified" && !site.revokedAt)
      .map((site) => site.host),
    ...[...auditSchedules.values()]
      .filter((schedule) => schedule.ownerEmail === access.ownerEmail && schedule.status === "active")
      .map((schedule) => schedule.targetHost || safeHost(schedule.targetUrl))
  ].filter(Boolean)).size;
  res.set("cache-control", "no-store").json({
    ok: true,
    owner: {
      email: access.ownerEmail
    },
    provider: {
      name: "Dodo Payments",
      source: "dodo",
      environment: "local",
      checkoutReady: false,
      missing: ["workerRuntime"]
    },
    billingLayer: {
      name: "BillingSDK-compatible customer portal",
      mode: "worker-dodo-source-of-truth"
    },
    product: {
      ...FIX_PACK_OFFER,
      mode: "one_time_fix_pack",
      checkoutStartsFrom: "report",
      checkoutNote: "Start checkout from a report with proven fixes so payment stays tied to a repair brief."
    },
    pricing: {
      status: "unavailable",
      source: "dodo",
      environment: "local",
      missing: ["workerRuntime"],
      message: "Dodo pricing preview is only available in the Cloudflare Worker runtime."
    },
    offers: offerCatalog({ fixPackCheckoutReady: false, monitoringCheckoutReady: false }),
    subscriptionState: {
      status: "not_live",
      label: "No recurring subscription",
      message: "Proof Monitoring checkout is only available in the Cloudflare Worker after the Dodo subscription product is configured."
    },
    monitoring: {
      offerKey: "proof_monitoring",
      status: "beta_allowance",
      activeCount: localActiveMonitorCount,
      limit: 5,
      remaining: Math.max(0, 5 - localActiveMonitorCount),
      cadenceDays: 7,
      hasEligibleSite: localEligibleSiteCount > 0,
      eligibleSiteCount: localEligibleSiteCount,
      checkoutLive: false,
      checkoutReady: false,
      checkoutMissing: ["workerRuntime"],
      message: "Private beta includes weekly proof monitoring while paid monitoring checkout is Worker-only.",
      offer: MONITORING_OFFER
    },
    subscriptions: [],
    requests: ownerFixRequests.map(localBillingFixRequestResponse),
    payments: ownerFixRequests
      .filter((request) => request.paymentId || request.paidAt || request.refundedAt || request.disputeEvent || request.status === "payment_failed")
      .map(localBillingPaymentResponse),
    generatedAt: new Date().toISOString()
  });
});

app.get("/api/account/summary", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const reportRecords = [...auditReports.values()]
    .filter((report) => report.owner?.email === access.ownerEmail)
    .sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt)))
    .slice(0, 12);
  const reports = reportRecords.map((report) => ({
      id: report.id,
      url: report.url,
      targetHost: safeHost(report.url),
      score: report.score,
      pagesScanned: report.summary?.pagesScanned || 0,
      totalFindings: report.summary?.totalFindings || 0,
      guardedFalsePositives: report.summary?.guardedFalsePositives || 0,
      reportPath: report.reportPath,
      createdAt: report.scannedAt,
      expiresAt: report.retention?.expiresAt || ""
    }));
  const requests = fixRequests
    .filter((request) => request.ownerEmail === access.ownerEmail && !request.isTest)
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .slice(0, 12)
    .map(localAccountFixRequestResponse);
  const sites = [...siteClaims.values()]
    .filter((claim) => claim.ownerEmail === access.ownerEmail && !claim.revokedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 20)
    .map(siteClaimResponse);
  const jobs = [...auditJobs.values()]
    .filter((job) => job.ownerEmail === access.ownerEmail)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 12)
    .map(localAuditJobResponse);
  const schedules = [...auditSchedules.values()]
    .filter((schedule) => schedule.ownerEmail === access.ownerEmail && schedule.status === "active")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 20)
    .map(localAuditScheduleResponse);
  const repairAgent = localAccountRepairAgentSummary(access, reportRecords, reports, schedules);
  res.set("cache-control", "no-store").json({
    ok: true,
    owner: {
      email: access.ownerEmail,
      accessMode: access.accessMode || "self-serve"
    },
    metrics: {
      reports: reports.length,
      fixRequests: requests.length,
      openFixRequests: requests.filter((request) => !["delivered", "refunded"].includes(request.status)).length,
      runningAudits: jobs.filter((job) => ["queued", "running"].includes(job.status)).length,
      verifiedSites: sites.filter((site) => site.status === "verified").length,
      monitors: schedules.length,
      repairItems: repairAgent.counts.total,
      openRepairs: repairAgent.counts.active,
      draftedActions: repairAgent.counts.awaitingApproval,
      approvedActions: repairAgent.counts.approvedActions,
      appliedRepairs: repairAgent.counts.appliedAwaitingRerun,
      regressedRepairs: repairAgent.counts.regressed + repairAgent.counts.monitorRegressions
    },
    recentReports: reports,
    recentAuditJobs: jobs,
    sites,
    schedules,
    fixRequests: requests,
    repairAgent,
    nextActions: localAccountNextActions(reports, requests, sites, jobs, repairAgent)
  });
});

function localAccountNextActions(reports, requests, sites = [], jobs = [], repairAgent = {}) {
  if (jobs.some((job) => ["queued", "running"].includes(job.status))) {
    return [{ id: "audit-running", label: "Audit running", detail: "The report will appear when proof collection finishes." }];
  }
  if (!reports.length) {
    if (!sites.some((site) => site.status === "verified")) {
      return [{ id: "verify-site", label: "Verify your site", detail: "Verify a host before running self-serve audits." }];
    }
    return [{ id: "run-audit", label: "Run your first audit", detail: "Start with your homepage or highest-value product page." }];
  }
  const nextRepair = repairAgent.nextItems?.[0];
  if (repairAgent.unavailable && nextRepair) {
    return [{
      id: "repair-queue-unavailable",
      label: "Repair queue unavailable",
      detail: "Repair actions are temporarily unavailable while repair storage is being updated."
    }];
  }
  if (nextRepair) {
    return [{
      id: nextRepair.nextActionId,
      label: nextRepair.nextActionLabel,
      detail: nextRepair.nextActionDetail,
      href: nextRepair.reportPath
    }];
  }
  if (!sites.some((site) => site.status === "verified")) {
    return [{ id: "verify-site", label: "Verify your site", detail: "Verify a host before running self-serve audits." }];
  }
  if (reports.some((report) => Number(report.totalFindings || 0) > 0) && !requests.length) {
    return [{ id: "review-fixes", label: "Review proven fixes", detail: "Open a report and start a Fix Pack only when the findings are real." }];
  }
  if (requests.some((request) => ["paid", "in_progress"].includes(request.status))) {
    return [{ id: "watch-delivery", label: "Watch delivery status", detail: "Your billing page shows due dates, notes, delivery links, and rerun proof." }];
  }
  return [{ id: "rerun-later", label: "Keep the report handy", detail: "Rerun after meaningful content, template, or metadata changes." }];
}

function localAccountRepairAgentSummary(access = {}, reportRecords = [], reportResponses = [], schedules = []) {
  const responseById = new Map(reportResponses.map((report) => [report.id, report]));
  const contexts = reportRecords.map((report) => {
    const response = responseById.get(report.id) || {};
    return {
      report,
      response,
      items: localRepairQueueItems(access, report)
    };
  });
  return {
    ...repairAccountSummaryFromItems(contexts, schedules),
    unavailable: false
  };
}

app.get("/api/audit/schedules", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const schedules = [...auditSchedules.values()]
    .filter((schedule) => schedule.ownerEmail === access.ownerEmail && schedule.status === "active")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(localAuditScheduleResponse);
  res.set("cache-control", "no-store").json({ ok: true, schedules });
});

app.post("/api/audit/schedules", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  let normalized = "";
  try {
    normalized = normalizeUrl(req.body?.url || req.body?.targetUrl || "");
  } catch {
    res.status(400).set("cache-control", "no-store").json({ error: "Enter a valid public website URL." });
    return;
  }
  const urlCheck = publicAuditUrlStatus(normalized);
  if (!urlCheck.ok) {
    res.status(400).set("cache-control", "no-store").json({ error: urlCheck.error });
    return;
  }
  const authorization = localAuditAuthorizationStatus(access, normalized);
  if (!authorization.ok) {
    res.status(403).set("cache-control", "no-store").json({
      error: authorization.error,
      code: "SITE_VERIFICATION_REQUIRED",
      site: authorization.site
    });
    return;
  }
  const existing = [...auditSchedules.values()].find(
    (schedule) =>
      schedule.ownerEmail === access.ownerEmail &&
      schedule.targetUrl === normalized &&
      schedule.status === "active"
  );
  if (existing) {
    res.set("cache-control", "no-store").json({ ok: true, schedule: localAuditScheduleResponse(existing), deduped: true });
    return;
  }
  const activeCount = [...auditSchedules.values()].filter(
    (schedule) => schedule.ownerEmail === access.ownerEmail && schedule.status === "active"
  ).length;
  if (activeCount >= 5) {
    res.status(429).set("cache-control", "no-store").json({
      error: "You already have 5 active monitors. Pause one before adding another.",
      code: "AUDIT_SCHEDULE_LIMIT"
    });
    return;
  }
  const schedule = createLocalAuditSchedule(access, normalized, {
    maxPages: req.body?.maxPages,
    intervalDays: req.body?.intervalDays
  });
  res.set("cache-control", "no-store").json({ ok: true, schedule: localAuditScheduleResponse(schedule) });
});

app.delete("/api/audit/schedules/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const schedule = auditSchedules.get(req.params.id);
  if (!schedule || schedule.ownerEmail !== access.ownerEmail || schedule.status !== "active") {
    res.status(404).set("cache-control", "no-store").json({ error: "Monitor not found." });
    return;
  }
  const now = new Date().toISOString();
  schedule.status = "paused";
  schedule.pausedAt = now;
  schedule.updatedAt = now;
  res.set("cache-control", "no-store").json({ ok: true, status: "paused", id: schedule.id });
});

app.get("/api/developer", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  res.set("cache-control", "no-store").json(localDeveloperSummary(access));
});

app.post("/api/developer/tokens", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const activeCount = [...apiTokens.values()].filter((token) => token.ownerEmail === access.ownerEmail && token.status === "active").length;
  if (activeCount >= 5) {
    res.status(429).set("cache-control", "no-store").json({ error: "You already have 5 active API keys. Revoke one before creating another." });
    return;
  }
  const token = createLocalApiToken(access, req.body?.label);
  res.set("cache-control", "no-store").json({
    ok: true,
    token: localApiTokenResponse(token),
    tokenSecret: token.secret,
    message: "Copy this API key now. It will not be shown again."
  });
});

app.delete("/api/developer/tokens/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const token = apiTokens.get(req.params.id);
  if (!token || token.ownerEmail !== access.ownerEmail || token.status !== "active") {
    res.status(404).set("cache-control", "no-store").json({ error: "API key not found." });
    return;
  }
  const now = new Date().toISOString();
  token.status = "revoked";
  token.revokedAt = now;
  token.updatedAt = now;
  res.set("cache-control", "no-store").json({ ok: true, id: token.id, status: "revoked" });
});

app.post("/api/developer/webhooks", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const urlCheck = publicWebhookUrlStatus(req.body?.url || "");
  if (!urlCheck.ok) {
    res.status(400).set("cache-control", "no-store").json({ error: urlCheck.error });
    return;
  }
  const activeCount = [...apiWebhooks.values()].filter((webhook) => webhook.ownerEmail === access.ownerEmail && webhook.status === "active").length;
  if (activeCount >= 5) {
    res.status(429).set("cache-control", "no-store").json({ error: "You already have 5 active webhooks. Revoke one before adding another." });
    return;
  }
  const webhook = createLocalApiWebhook(access, urlCheck.url, req.body?.events);
  res.set("cache-control", "no-store").json({
    ok: true,
    webhook: localApiWebhookResponse(webhook),
    signingSecret: localWebhookSigningSecret(webhook.id),
    message: "Copy this signing secret now. It will not be shown again."
  });
});

app.delete("/api/developer/webhooks/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const webhook = apiWebhooks.get(req.params.id);
  if (!webhook || webhook.ownerEmail !== access.ownerEmail || webhook.status !== "active") {
    res.status(404).set("cache-control", "no-store").json({ error: "Webhook not found." });
    return;
  }
  const now = new Date().toISOString();
  webhook.status = "revoked";
  webhook.revokedAt = now;
  webhook.updatedAt = now;
  res.set("cache-control", "no-store").json({ ok: true, id: webhook.id, status: "revoked" });
});

app.get("/api/branding", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  res.set("cache-control", "no-store").json({
    ok: true,
    branding: localBrandingForOwner(access.ownerEmail)
  });
});

app.post("/api/branding", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const now = new Date().toISOString();
  const current = localBrandingForOwner(access.ownerEmail);
  const branding = normalizeBrandingInput(req.body || {}, current);
  reportBrandingProfiles.set(access.ownerEmail, {
    ...branding,
    ownerEmail: access.ownerEmail,
    createdAt: reportBrandingProfiles.get(access.ownerEmail)?.createdAt || now,
    updatedAt: now
  });
  res.set("cache-control", "no-store").json({ ok: true, branding });
});

app.get("/api/report-domains", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const domains = [...reportDomains.values()]
    .filter((domain) => domain.ownerEmail === access.ownerEmail && !domain.revokedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(localReportDomainResponse);
  res.set("cache-control", "no-store").json({ ok: true, domains });
});

app.post("/api/report-domains", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const domainName = cleanReportDomain(req.body?.domain || req.body?.customDomain || "");
  if (!domainName) {
    res.status(400).set("cache-control", "no-store").json({ error: "Enter a valid report subdomain, like reports.example.com." });
    return;
  }
  const existingForOtherOwner = [...reportDomains.values()].find(
    (domain) => domain.domain === domainName && domain.ownerEmail !== access.ownerEmail && !domain.revokedAt
  );
  if (existingForOtherOwner) {
    res.status(409).set("cache-control", "no-store").json({ error: "That report domain is already connected to another workspace." });
    return;
  }
  const existing = [...reportDomains.values()].find(
    (domain) => domain.domain === domainName && domain.ownerEmail === access.ownerEmail && !domain.revokedAt
  );
  const domain = existing || createLocalReportDomain(access, domainName);
  res.status(existing ? 200 : 201).set("cache-control", "no-store").json({
    ok: true,
    domain: localReportDomainResponse(domain)
  });
});

app.post("/api/report-domains/:id/verify", async (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const domain = reportDomains.get(req.params.id);
  if (!domain || domain.ownerEmail !== access.ownerEmail || domain.revokedAt) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report domain not found." });
    return;
  }
  const result = await verifyLocalReportDomain(domain, req.body || {});
  if (!result.ok) {
    domain.lastError = result.error;
    domain.lastCheckedAt = new Date().toISOString();
    domain.updatedAt = domain.lastCheckedAt;
    res.status(400).set("cache-control", "no-store").json({
      ok: false,
      error: result.error,
      domain: localReportDomainResponse(domain)
    });
    return;
  }
  const now = new Date().toISOString();
  domain.status = "verified";
  domain.verifiedAt = domain.verifiedAt || now;
  domain.lastCheckedAt = now;
  domain.updatedAt = now;
  domain.lastError = "";
  res.set("cache-control", "no-store").json({ ok: true, verified: true, domain: localReportDomainResponse(domain) });
});

app.delete("/api/report-domains/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const domain = reportDomains.get(req.params.id);
  if (!domain || domain.ownerEmail !== access.ownerEmail || domain.revokedAt) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report domain not found." });
    return;
  }
  const now = new Date().toISOString();
  domain.status = "revoked";
  domain.revokedAt = now;
  domain.updatedAt = now;
  res.set("cache-control", "no-store").json({ ok: true, id: domain.id, status: "revoked" });
});

app.get("/api/reports/:id/shares", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  const origin = `http://${req.get("host")}`;
  const shares = [...reportShareLinks.values()]
    .filter((share) => share.ownerEmail === access.ownerEmail && share.reportId === report.id && share.status === "active")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((share) => localReportShareResponse(share, origin));
  res.set("cache-control", "no-store").json({ ok: true, shares });
});

app.post("/api/reports/:id/share", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  const activeCount = [...reportShareLinks.values()].filter(
    (share) => share.ownerEmail === access.ownerEmail && share.reportId === report.id && share.status === "active"
  ).length;
  if (activeCount >= 10) {
    res.status(429).set("cache-control", "no-store").json({ error: "This report already has 10 active client links." });
    return;
  }
  const share = createLocalReportShare(access, report, req.body || {});
  const origin = `http://${req.get("host")}`;
  res.set("cache-control", "no-store").json({
    ok: true,
    share: localReportShareResponse(share, origin)
  });
});

app.delete("/api/report-shares/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const share = reportShareLinks.get(req.params.id);
  if (!share || share.ownerEmail !== access.ownerEmail || share.status !== "active") {
    res.status(404).set("cache-control", "no-store").json({ error: "Client link not found." });
    return;
  }
  const now = new Date().toISOString();
  share.status = "revoked";
  share.updatedAt = now;
  share.revokedAt = now;
  res.set("cache-control", "no-store").json({ ok: true, id: share.id, status: "revoked" });
});

app.get("/api/team", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  res.set("cache-control", "no-store").json({
    ok: true,
    members: localTeamMembers(access.ownerEmail)
  });
});

app.post("/api/team/members", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const memberEmail = normalizeEmail(req.body?.email || req.body?.memberEmail);
  if (!memberEmail) {
    res.status(400).set("cache-control", "no-store").json({ error: "Enter a valid teammate email." });
    return;
  }
  if (memberEmail === access.ownerEmail) {
    res.status(400).set("cache-control", "no-store").json({ error: "You are already the workspace owner." });
    return;
  }
  const existing = [...teamMembers.values()].find(
    (member) => member.ownerEmail === access.ownerEmail && member.memberEmail === memberEmail && member.status === "active"
  );
  if (existing) {
    res.set("cache-control", "no-store").json({ ok: true, member: localTeamMemberResponse(existing), deduped: true });
    return;
  }
  const activeCount = localTeamMembers(access.ownerEmail).length;
  if (activeCount >= 10) {
    res.status(429).set("cache-control", "no-store").json({ error: "This workspace already has 10 active teammates." });
    return;
  }
  const member = createLocalTeamMember(access, req.body || {});
  res.set("cache-control", "no-store").json({ ok: true, member: localTeamMemberResponse(member) });
});

app.delete("/api/team/members/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const member = teamMembers.get(req.params.id);
  if (!member || member.ownerEmail !== access.ownerEmail || member.status !== "active") {
    res.status(404).set("cache-control", "no-store").json({ error: "Teammate not found." });
    return;
  }
  const now = new Date().toISOString();
  member.status = "revoked";
  member.revokedAt = now;
  member.updatedAt = now;
  res.set("cache-control", "no-store").json({ ok: true, id: member.id, status: "revoked" });
});

app.get("/api/reports/:id/collaboration", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  res.set("cache-control", "no-store").json(localReportCollaborationResponse(access, report));
});

app.patch("/api/reports/:id/collaboration", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  const result = saveLocalIssueCollaborations(access, report, req.body?.items || []);
  if (!result.ok) {
    res.status(400).set("cache-control", "no-store").json({ error: result.error });
    return;
  }
  res.set("cache-control", "no-store").json(localReportCollaborationResponse(access, report));
});

app.get("/api/reports/:id/repair-queue", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  res.set("cache-control", "no-store").json(localRepairQueueResponse(access, report));
});

app.patch("/api/reports/:id/repair-queue", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  const result = saveLocalRepairQueue(access, report, req.body?.items || [req.body || {}]);
  if (!result.ok) {
    res.status(result.status || 400).set("cache-control", "no-store").json({ error: result.error });
    return;
  }
  res.set("cache-control", "no-store").json(localRepairQueueResponse(access, report));
});

app.post("/api/reports/:id/repair-actions", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  const result = createLocalRepairAction(access, report, req.body || {});
  if (!result.ok) {
    res.status(result.status || 400).set("cache-control", "no-store").json({ error: result.error });
    return;
  }
  res.status(201).set("cache-control", "no-store").json(result.body);
});

app.patch("/api/reports/:id/repair-actions/:actionId", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  const result = updateLocalRepairAction(access, report, req.params.actionId, req.body || {});
  if (!result.ok) {
    res.status(result.status || 400).set("cache-control", "no-store").json({ error: result.error });
    return;
  }
  res.set("cache-control", "no-store").json(result.body);
});

app.get("/api/reports/:id/repair-actions/:actionId/implementation.md", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  sendLocalImplementationPack(res, localRepairActionImplementationPack(access, report, req.params.actionId));
});

app.get("/api/reports/:id/repair-actions/:actionId/proof.md", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  sendLocalProofReceipt(res, localRepairActionProofReceipt(access, report, req.params.actionId));
});

app.get("/v1/projects", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const projects = [...siteClaims.values()]
    .filter((claim) => claim.ownerEmail === access.ownerEmail && !claim.revokedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(apiProjectResponse);
  res.set("cache-control", "no-store").json({ ok: true, projects });
});

app.post("/v1/projects", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const host = claimHostFromInput(req.body?.host || req.body?.url || "");
  if (!host) {
    res.status(400).set("cache-control", "no-store").json({ error: "Enter a public website host to verify." });
    return;
  }
  const existing = [...siteClaims.values()].find((claim) => claim.ownerEmail === access.ownerEmail && claim.host === host && !claim.revokedAt);
  if (existing) {
    res.set("cache-control", "no-store").json({ ok: true, project: apiProjectResponse(existing) });
    return;
  }
  const now = new Date().toISOString();
  const claim = {
    id: randomUUID(),
    ownerEmail: access.ownerEmail,
    host,
    verificationToken: `sfk-${randomBytes(32).toString("hex")}`,
    status: "pending",
    verificationMethod: "",
    createdAt: now,
    updatedAt: now,
    verifiedAt: "",
    lastCheckedAt: "",
    revokedAt: ""
  };
  siteClaims.set(claim.id, claim);
  res.status(201).set("cache-control", "no-store").json({ ok: true, project: apiProjectResponse(claim) });
});

app.post("/v1/audits", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const result = createLocalApiAudit(req, access);
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.get("/v1/audits", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const audits = [...auditJobs.values()]
    .filter((job) => job.ownerEmail === access.ownerEmail)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 50)
    .map(localApiAuditResponse);
  res.set("cache-control", "no-store").json({ ok: true, audits });
});

app.get("/v1/audits/:id/issues", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const resolved = resolveLocalApiAudit(access, req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  const findings = (resolved.report.findings || []).filter((finding) => finding.severity !== "good");
  const queue = localApiRepairQueueOverlay(access, resolved.report);
  res.set("cache-control", "no-store").json({
    ok: true,
    auditId: resolved.job?.id || "",
    reportId: resolved.report.id,
    issues: findings.map((finding) => apiIssueResponse(finding, queue.byIssue.get(finding.id), {
      repairQueueUnavailable: queue.unavailable
    })),
    total: findings.length
  });
});

app.get("/v1/audits/:id/report", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const resolved = resolveLocalApiAudit(access, req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  const queue = localApiRepairQueueOverlay(access, resolved.report);
  res.set("cache-control", "no-store").json({
    ok: true,
    report: apiReportResponse(resolved.report, {
      repairQueueItems: queue.items,
      repairQueueUnavailable: queue.unavailable
    })
  });
});

app.get("/v1/audits/:id/repair-queue", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const resolved = resolveLocalApiAudit(access, req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  res.set("cache-control", "no-store").json(localApiRepairQueueResponse(access, resolved));
});

app.patch("/v1/audits/:id/repair-queue", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const resolved = resolveLocalApiAudit(access, req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  const result = saveLocalRepairQueue(access, resolved.report, req.body?.items || [req.body || {}]);
  if (!result.ok) {
    res.status(result.status || 400).set("cache-control", "no-store").json({ error: result.error });
    return;
  }
  res.set("cache-control", "no-store").json(localApiRepairQueueResponse(access, resolved));
});

app.post("/v1/audits/:id/repair-actions", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const resolved = resolveLocalApiAudit(access, req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  const result = createLocalRepairAction(access, resolved.report, req.body || {});
  if (!result.ok) {
    res.status(result.status || 400).set("cache-control", "no-store").json({ error: result.error });
    return;
  }
  res.status(201).set("cache-control", "no-store").json(localApiRepairActionResponse(access, resolved, result.body?.action));
});

app.patch("/v1/audits/:id/repair-actions/:actionId", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const resolved = resolveLocalApiAudit(access, req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  const result = updateLocalRepairAction(access, resolved.report, req.params.actionId, req.body || {});
  if (!result.ok) {
    res.status(result.status || 400).set("cache-control", "no-store").json({ error: result.error });
    return;
  }
  res.set("cache-control", "no-store").json(localApiRepairActionResponse(access, resolved, result.body?.action));
});

app.get("/v1/audits/:id/repair-actions/:actionId/implementation.md", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const resolved = resolveLocalApiAudit(access, req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  sendLocalImplementationPack(res, localRepairActionImplementationPack(access, resolved.report, req.params.actionId));
});

app.get("/v1/audits/:id/repair-actions/:actionId/proof.md", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const resolved = resolveLocalApiAudit(access, req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  sendLocalProofReceipt(res, localRepairActionProofReceipt(access, resolved.report, req.params.actionId));
});

app.get("/v1/audits/:id", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const job = auditJobs.get(req.params.id);
  if (!job || job.ownerEmail !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Audit not found." });
    return;
  }
  res.set("cache-control", "no-store").json({ ok: true, audit: localApiAuditResponse(job) });
});

app.delete("/v1/audits/:id", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const job = auditJobs.get(req.params.id);
  if (!job || job.ownerEmail !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Audit not found." });
    return;
  }
  const protectedFixRequest = localProtectedFixRequestForReport(job.reportId, access.ownerEmail);
  if (protectedFixRequest) {
    res.status(409).set("cache-control", "no-store").json({
      error: "This audit report is locked because it is attached to a paid Fix Pack record.",
      code: "FIX_PACK_REPORT_LOCKED",
      fixRequestId: protectedFixRequest.id
    });
    return;
  }
  if (job.reportId) {
    cleanupLocalRepairsForDeletedReport(job.reportId, access.ownerEmail);
    auditReports.delete(job.reportId);
  }
  auditJobs.delete(job.id);
  res.set("cache-control", "no-store").json({ ok: true, deleted: true, auditId: req.params.id });
});

app.post("/v1/large-crawls", async (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const result = await createLocalLargeRenderedCrawl(req.body || {}, access, { api: true });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.get("/v1/large-crawls", (req, res) => {
  const access = localApiAccess(req);
  if (!access.ok) {
    res.status(access.status || 401).set("cache-control", "no-store").json({ error: access.error || "API key required." });
    return;
  }
  const largeCrawls = localLargeRenderedCrawlsForOwner(access)
    .map((item) => localApiLargeRenderedCrawlResponse(item.job));
  res.set("cache-control", "no-store").json({ ok: true, large_crawls: largeCrawls });
});

app.get("/v1/large-crawls/:id", (req, res) => {
  const resolved = resolveLocalLargeRenderedCrawl(localApiAccess(req), req.params.id, { api: true });
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  res.set("cache-control", "no-store").json({ ok: true, large_crawl: localApiLargeRenderedCrawlResponse(resolved.job) });
});

app.post("/v1/large-crawls/:id/retry", (req, res) => {
  const result = retryLocalLargeRenderedCrawl(localApiAccess(req), req.params.id, { api: true });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.post("/v1/large-crawls/:id/batches/claim", (req, res) => {
  const proofWriter = largeCrawlProofWriteStatus({ headers: req.headers, env: process.env });
  if (!proofWriter.ok) {
    return res.status(proofWriter.status).set("cache-control", "no-store").json({ error: proofWriter.error, code: proofWriter.code });
  }
  const result = claimLocalLargeRenderedCrawlBatch(localApiAccess(req), req.params.id, {
    api: true,
    trustedRenderer: true,
    trustedProofWriter: true
  });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.post("/v1/large-crawls/:id/batches/process", async (req, res) => {
  const proofWriter = largeCrawlProofWriteStatus({ headers: req.headers, env: process.env });
  if (!proofWriter.ok) {
    return res.status(proofWriter.status).set("cache-control", "no-store").json({ error: proofWriter.error, code: proofWriter.code });
  }
  const result = await processLocalLargeRenderedCrawlBatch(localApiAccess(req), req.params.id, req.body || {}, {
    api: true,
    trustedRenderer: true,
    trustedProofWriter: true
  });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.post("/v1/large-crawls/:id/batches/:batchId/proof", (req, res) => {
  const proofWriter = largeCrawlProofWriteStatus({ headers: req.headers, env: process.env });
  if (!proofWriter.ok) {
    return res.status(proofWriter.status).set("cache-control", "no-store").json({ error: proofWriter.error, code: proofWriter.code });
  }
  const body = req.body || {};
  const result = saveLocalLargeRenderedCrawlBatchProof(localApiAccess(req), req.params.id, req.params.batchId, {
    ...body,
    proofToken: req.get("x-seofixkit-proof-token") || body.proofToken || body.proof_token || ""
  }, {
    api: true,
    trustedRenderer: true
  });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.post("/v1/large-crawls/:id/merge", (req, res) => {
  const result = markLocalLargeRenderedCrawlReadyToMerge(localApiAccess(req), req.params.id, { api: true });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.get("/api/sites", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const sites = [...siteClaims.values()]
    .filter((claim) => claim.ownerEmail === access.ownerEmail && !claim.revokedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(siteClaimResponse);
  res.set("cache-control", "no-store").json({ ok: true, sites });
});

app.post("/api/sites/claim", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const host = claimHostFromInput(req.body?.host || req.body?.url || "");
  if (!host) {
    res.status(400).set("cache-control", "no-store").json({ error: "Enter a public website host to verify." });
    return;
  }
  const existing = [...siteClaims.values()].find((claim) => claim.ownerEmail === access.ownerEmail && claim.host === host && !claim.revokedAt);
  if (existing) {
    res.set("cache-control", "no-store").json({ ok: true, site: siteClaimResponse(existing) });
    return;
  }
  const now = new Date().toISOString();
  const claim = {
    id: randomUUID(),
    ownerEmail: access.ownerEmail,
    host,
    verificationToken: `sfk-${randomBytes(32).toString("hex")}`,
    status: "pending",
    verificationMethod: "",
    createdAt: now,
    updatedAt: now,
    verifiedAt: "",
    lastCheckedAt: "",
    revokedAt: ""
  };
  siteClaims.set(claim.id, claim);
  res.set("cache-control", "no-store").json({ ok: true, site: siteClaimResponse(claim) });
});

app.post("/api/sites/verify", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const claimId = cleanText(req.body?.id || req.body?.claimId || "", 80);
  const host = claimHostFromInput(req.body?.host || req.body?.url || "");
  const claim = claimId
    ? siteClaims.get(claimId)
    : [...siteClaims.values()].find((item) => item.ownerEmail === access.ownerEmail && item.host === host && !item.revokedAt);
  if (!claim || claim.ownerEmail !== access.ownerEmail || claim.revokedAt) {
    res.status(404).set("cache-control", "no-store").json({ error: "Site claim not found." });
    return;
  }
  const now = new Date().toISOString();
  claim.status = "verified";
  claim.verificationMethod = "local-dev";
  claim.verifiedAt ||= now;
  claim.lastCheckedAt = now;
  claim.updatedAt = now;
  res.set("cache-control", "no-store").json({ ok: true, verified: true, site: siteClaimResponse(claim) });
});

app.get("/api/beta/session", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res
      .status(401)
      .set("cache-control", "no-store")
      .set("set-cookie", clearSessionCookie(req))
      .json({ error: "Private beta session required." });
    return;
  }
  res.set("cache-control", "no-store").json({
    ok: true,
    status: "active",
    ownerEmail: access.ownerEmail,
    expiresAt: access.expiresAt
  });
});

app.post("/api/beta/logout", (req, res) => {
  const token = betaSessionTokenFromRequest(req);
  if (token) betaSessions.delete(sha256Hex(token));
  res
    .set("cache-control", "no-store")
    .set("set-cookie", clearSessionCookie(req))
    .json({ ok: true, status: "locked" });
});

app.get("/admin/leads.csv", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = bearer;

  if ((!expected || token !== expected) && cookieValue(req, ADMIN_SESSION_COOKIE) !== "local-admin") {
    res.status(401).type("text").send("Unauthorized");
    return;
  }

  res
    .set({
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="seofixkit-waitlist-local.csv"'
    })
    .type("text/csv")
    .send("email,source,utm_source,utm_medium,utm_campaign,landing_path,created_at,updated_at\n");
});

app.post("/admin/session", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "local-admin";
  if (String(req.body?.token || "") !== expected) {
    res.status(401).set("cache-control", "no-store").json({ error: "Unauthorized" });
    return;
  }
  res
    .set("cache-control", "no-store")
    .set("set-cookie", adminSessionCookie(req))
    .json({ ok: true, actorEmail: "local-admin", expiresAt: isoSecondsFromNow(60 * 60 * 2) });
});

app.delete("/admin/session", (req, res) => {
  res
    .set("cache-control", "no-store")
    .set("set-cookie", clearAdminSessionCookie(req))
    .json({ ok: true });
});

app.post("/admin/beta-session", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "local-admin";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== expected && cookieValue(req, ADMIN_SESSION_COOKIE) !== "local-admin") {
    res.status(401).set("cache-control", "no-store").json({ error: "Unauthorized" });
    return;
  }
  const ownerEmail = normalizeEmail(req.body?.ownerEmail || req.body?.email);
  if (!ownerEmail) {
    res.status(400).set("cache-control", "no-store").json({ error: "Enter a valid owner email." });
    return;
  }
  const session = createLocalSession(req, ownerEmail, "founder-override");
  res
    .set("cache-control", "no-store")
    .set("set-cookie", sessionCookie(req, session.token, BETA_SESSION_TTL_SECONDS))
    .json({
      ok: true,
      ownerEmail,
      accessMode: "founder-override",
      expiresAt: session.expiresAt
    });
});

app.get("/admin/summary", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "local-admin";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== expected && cookieValue(req, ADMIN_SESSION_COOKIE) !== "local-admin") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const reports = [...auditReports.values()].sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt)));
  res.set("cache-control", "no-store").json({
    ok: true,
    metrics: {
      waitlist: 0,
      invites: 1,
      activeSessions: betaSessions.size,
      audits: reports.length,
      auditsToday: reports.length,
      reportsExpiringSoon: reports.filter((report) => report.retention?.expiresAt).length,
      fixRequests: fixRequests.length,
      fixRequestStatuses: countFixRequestStatuses(fixRequests),
      emailNotificationsConfigured: false
    },
    offer: FIX_PACK_OFFER,
    recentAudits: reports.slice(0, 20).map((report) => ({
      id: report.id,
      url: report.url,
      targetHost: new URL(report.url).hostname,
      ownerEmail: report.owner?.email || "",
      score: report.score,
      pagesScanned: report.summary?.pagesScanned || 0,
      totalFindings: report.summary?.totalFindings || 0,
      guardedFalsePositives: report.summary?.guardedFalsePositives || 0,
      reportPath: report.reportPath,
      createdAt: report.scannedAt,
      expiresAt: report.retention?.expiresAt
    })),
    issuePatterns: summarizeIssuePatterns(reports),
    fixQueue: fixRequests.slice().reverse().map(localFixRequestAdminResponse),
    invites: [
      {
        id: "local-founder",
        ownerEmail: "local@example.com",
        label: "Local founder override",
        status: "active",
        maxUses: 999,
        usedCount: betaSessions.size,
        createdAt: new Date().toISOString(),
        expiresAt: null
      }
    ]
  });
});

app.patch("/admin/fix-requests/:id", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "local-admin";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== expected && cookieValue(req, ADMIN_SESSION_COOKIE) !== "local-admin") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const request = fixRequests.find((item) => item.id === req.params.id);
  if (!request) {
    res.status(404).json({ error: "Fix request not found." });
    return;
  }
  const status = String(req.body?.status || request.status || "new");
  const unchangedWebhookStatus = status === request.status && status === "paid";
  if (!["checkout_created", "in_progress", "delivered"].includes(status) && !unchangedWebhookStatus) {
    res.status(400).json({ error: "Choose a valid fulfillment status." });
    return;
  }
  if (["in_progress", "delivered"].includes(status) && !request.paidAt && request.status !== "paid" && request.status !== "in_progress" && request.status !== "delivered") {
    res.status(409).json({ error: "Payment must be confirmed before fulfillment starts." });
    return;
  }
  request.status = status;
  request.assignedTo = cleanText(req.body?.assignedTo || "", 160);
  request.adminNote = cleanText(req.body?.adminNote || "", 2000);
  request.customerNote = cleanText(req.body?.customerNote || "", 2000);
  request.deliveryUrl = cleanUrlText(req.body?.deliveryUrl || "", 600);
  request.finalReportId = cleanText(req.body?.finalReportId || "", 180);
  request.dueAt = cleanIsoDateText(req.body?.dueAt || request.dueAt || "");
  request.nextUpdateAt = cleanIsoDateText(req.body?.nextUpdateAt || request.nextUpdateAt || "");
  request.statusReason = cleanText(req.body?.statusReason || "", 500);
  request.inProgressAt = status === "in_progress" && !request.inProgressAt ? new Date().toISOString() : request.inProgressAt;
  request.deliveredAt = status === "delivered" && !request.deliveredAt ? new Date().toISOString() : request.deliveredAt;
  request.updatedAt = new Date().toISOString();
  res.set("cache-control", "no-store").json({ ok: true, request: localFixRequestAdminResponse(request) });
});

app.post("/admin/invites", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "local-admin";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== expected && cookieValue(req, ADMIN_SESSION_COOKIE) !== "local-admin") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ownerEmail = normalizeEmail(req.body?.email);
  if (!ownerEmail) {
    res.status(400).json({ error: "Enter a valid invite email." });
    return;
  }
  const code = randomBytes(12).toString("hex");
  res.set("cache-control", "no-store").json({
    ok: true,
    invite: {
      id: randomUUID(),
      ownerEmail,
      code,
      label: req.body?.label || "Local invite",
      maxUses: Number(req.body?.maxUses || 1),
      usedCount: 0,
      expiresAt: isoDaysFromNow(14),
      url: `http://127.0.0.1:${port}/beta?email=${encodeURIComponent(ownerEmail)}&invite=${code}`
    }
  });
});

app.get("/llms.txt", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/plain; charset=utf-8").send(llmsText(origin));
});

app.get("/demo", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(demoHtml(origin));
});

app.get("/check", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(checkHtml(origin));
});

app.get("/methodology", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(methodologyHtml(origin));
});

app.get("/packages", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(packagesHtml(origin));
});

app.get("/small-business-seo-audit", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(smallBusinessSeoAuditHtml(origin));
});

app.get("/rendered-vs-static-seo-audit", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(renderedVsStaticAuditHtml(origin));
});

app.get("/ai-answer-readiness", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(aiAnswerReadinessHtml(origin));
});

app.get("/privacy", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(privacyHtml(origin));
});

app.get("/support", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(supportHtml(origin));
});

app.get("/terms", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.set("content-type", "text/html; charset=utf-8").send(termsHtml(origin));
});

app.get("/api/demo-audit", async (req, res) => {
  try {
    const access = localBetaAccess(req);
    if (!access.ok) {
      res.status(401).json({ error: "Private beta session required." });
      return;
    }
    const fixturePath = {
      "crawl-intel": "crawl-intel",
      "keyword-rank": "crawl-intel",
      scale: "crawl-intel",
      platform: "platform-store",
      rendered: "rendered-page"
    }[req.query.fixture] || "rendered-page";
    const report = await auditUrl(`http://127.0.0.1:${port}/fixture/${fixturePath}`, {
      maxPages: fixturePath === "crawl-intel" ? 8 : 1,
      pageSpeed: false,
      allowPrivateKeywordRows: req.query.fixture === "keyword-rank",
      keywordRows: req.query.fixture === "keyword-rank" ? demoKeywordRows(`http://127.0.0.1:${port}/fixture/`) : [],
      renderedCrawlTarget: req.query.fixture === "scale" ? 50000 : 0
    });
    res.set("cache-control", "no-store").json(saveLocalReport(report, req, access));
  } catch (error) {
    res.status(500).json({
      error: error.message || "The demo audit failed."
    });
  }
});

app.post("/api/public-check", async (req, res) => {
  try {
    const body = req.body || {};
    const input = typeof body.url === "string" ? body.url : "";
    const validated = validatePublicCheckUrl(input);
    if (!validated.ok) {
      res.status(400).set("cache-control", "no-store").json({ error: validated.error });
      return;
    }
    const hostname = new URL(validated.url).hostname;
    if (await resolvesToPrivateAddress(hostname)) {
      res.status(400).set("cache-control", "no-store").json({
        error: "This URL points at a private or internal address and cannot be checked."
      });
      return;
    }
    const ipHash = await requestIpHash({
      headers: { get: (name) => String(req.headers[name.toLowerCase()] || "") }
    });
    const quota = localPublicCheckQuota(publicCheckQuotaChecks(ipHash, hostname));
    if (!quota.ok) {
      res.status(429).set("cache-control", "no-store").json({ error: quota.error, resetAt: quota.resetAt });
      return;
    }
    const origin = `http://${req.get("host")}`;
    const report = await auditUrl(validated.url, { maxPages: 1, appOrigin: origin });
    res.set("cache-control", "no-store").json(buildPublicCheckResponse(report));
  } catch (error) {
    const message = String(error?.message || "The check failed. Try another public URL.").slice(0, 260);
    res.status(422).set("cache-control", "no-store").json({ error: message });
  }
});

app.post("/api/audit", async (req, res) => {
  try {
    const access = localBetaAccess(req);
    if (!access.ok) {
      res.status(401).json({ error: "Private beta session required." });
      return;
    }
    const { url, maxPages } = req.body || {};
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Enter a website URL to audit." });
      return;
    }
    let normalized = "";
    try {
      normalized = normalizeUrl(url);
    } catch {
      res.status(400).json({ error: "Enter a valid public website URL." });
      return;
    }
    const urlCheck = publicAuditUrlStatus(normalized);
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }
    const authorization = localAuditAuthorizationStatus(access, normalized);
    if (!authorization.ok) {
      res.status(403).set("cache-control", "no-store").json({
        error: authorization.error,
        code: "SITE_VERIFICATION_REQUIRED",
        site: authorization.site
      });
      return;
    }

    const competitorInput = parseAuditCompetitorUrls(req.body || {}, normalized);
    if (!competitorInput.ok) {
      res.status(400).set("cache-control", "no-store").json({ error: competitorInput.error });
      return;
    }
    const competitorUrls = competitorInput.urls;
    const backlinkInput = parseBacklinkRows(req.body || {}, normalized, { allowPrivate: false });
    if (!backlinkInput.ok) {
      res.status(400).set("cache-control", "no-store").json({ error: backlinkInput.error });
      return;
    }
    const backlinkRows = backlinkInput.rows;
    const localSeoInput = parseLocalSeoInput(req.body || {}, normalized, { allowPrivate: false });
    if (!localSeoInput.ok) {
      res.status(400).set("cache-control", "no-store").json({ error: localSeoInput.error });
      return;
    }
    const localSeo = localSeoInput.input;
    const keywordInput = parseKeywordRows(req.body || {}, normalized, { allowPrivate: false });
    if (!keywordInput.ok) {
      res.status(400).set("cache-control", "no-store").json({ error: keywordInput.error });
      return;
    }
    const keywordRows = keywordInput.rows;
  const renderedCrawlTarget = normalizeRenderedCrawlTarget(
    req.body?.renderedCrawlTarget || req.body?.rendered_crawl_target || req.body?.crawlScaleTarget || 0
  );
  const normalizedMaxPages = normalizeCrawlLimit(maxPages || 10);

    const existingJob = localActiveAuditJobForTarget(access, normalized, competitorUrls, backlinkRows, localSeo, keywordRows, renderedCrawlTarget, normalizedMaxPages);
    if (existingJob) {
      res
        .status(202)
        .set("cache-control", "no-store")
        .json({
          ok: true,
          mode: "queued",
          deduped: true,
          job: localAuditJobResponse(existingJob),
          jobId: existingJob.id,
          statusUrl: `/api/audit/jobs/${existingJob.id}`
        });
      return;
    }

    const activeCount = localActiveAuditJobCount(access);
    if (activeCount >= 3) {
      res.status(429).set("cache-control", "no-store").json({
        error: "You already have 3 audits running. Wait for one to finish before starting another.",
        code: "AUDIT_JOBS_ACTIVE_LIMIT"
      });
      return;
    }

    const job = createLocalAuditJob(access, normalized, normalizedMaxPages, {
      competitorUrls,
      backlinkRows,
      localSeo,
      keywordRows,
      renderedCrawlTarget
    });
    const origin = `http://${req.get("host")}`;
    setTimeout(() => processLocalAuditJob(job.id, origin), 0);
    res
      .status(202)
      .set("cache-control", "no-store")
      .json({
        ok: true,
        mode: "queued",
        job: localAuditJobResponse(job),
        jobId: job.id,
        statusUrl: `/api/audit/jobs/${job.id}`
      });
  } catch (error) {
    res.status(500).json({
      error: error.message || "The audit failed. Try another URL."
    });
  }
});

app.get("/api/audit/jobs/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const job = auditJobs.get(req.params.id);
  if (!job || job.ownerEmail !== access.ownerEmail) {
    res.status(404).set("cache-control", "no-store").json({ error: "Audit job not found." });
    return;
  }
  res.set("cache-control", "no-store").json({ ok: true, job: localAuditJobResponse(job) });
});

app.post("/api/large-crawls", async (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const result = await createLocalLargeRenderedCrawl(req.body || {}, access);
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.get("/api/large-crawls", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  res.set("cache-control", "no-store").json({
    ok: true,
    largeCrawls: localLargeRenderedCrawlsForOwner(access).map((item) => localLargeRenderedCrawlResponse(item.job))
  });
});

app.get("/api/large-crawls/:id", (req, res) => {
  const resolved = resolveLocalLargeRenderedCrawl(localBetaAccess(req), req.params.id);
  if (!resolved.ok) {
    res.status(resolved.status).set("cache-control", "no-store").json({ error: resolved.error });
    return;
  }
  res.set("cache-control", "no-store").json({ ok: true, largeCrawl: localLargeRenderedCrawlResponse(resolved.job) });
});

app.post("/api/large-crawls/:id/retry", (req, res) => {
  const result = retryLocalLargeRenderedCrawl(localBetaAccess(req), req.params.id);
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.post("/api/large-crawls/:id/batches/claim", (req, res) => {
  const proofWriter = largeCrawlProofWriteStatus({ headers: req.headers, env: process.env });
  if (!proofWriter.ok) {
    return res.status(proofWriter.status).set("cache-control", "no-store").json({ error: proofWriter.error, code: proofWriter.code });
  }
  const result = claimLocalLargeRenderedCrawlBatch(localBetaAccess(req), req.params.id, {
    trustedRenderer: true,
    trustedProofWriter: true
  });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.post("/api/large-crawls/:id/batches/process", async (req, res) => {
  const proofWriter = largeCrawlProofWriteStatus({ headers: req.headers, env: process.env });
  if (!proofWriter.ok) {
    return res.status(proofWriter.status).set("cache-control", "no-store").json({ error: proofWriter.error, code: proofWriter.code });
  }
  const result = await processLocalLargeRenderedCrawlBatch(localBetaAccess(req), req.params.id, req.body || {}, {
    trustedRenderer: true,
    trustedProofWriter: true
  });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.post("/api/large-crawls/:id/batches/:batchId/proof", (req, res) => {
  const proofWriter = largeCrawlProofWriteStatus({ headers: req.headers, env: process.env });
  if (!proofWriter.ok) {
    return res.status(proofWriter.status).set("cache-control", "no-store").json({ error: proofWriter.error, code: proofWriter.code });
  }
  const body = req.body || {};
  const result = saveLocalLargeRenderedCrawlBatchProof(localBetaAccess(req), req.params.id, req.params.batchId, {
    ...body,
    proofToken: req.get("x-seofixkit-proof-token") || body.proofToken || body.proof_token || ""
  }, {
    trustedRenderer: true
  });
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.post("/api/large-crawls/:id/merge", (req, res) => {
  const result = markLocalLargeRenderedCrawlReadyToMerge(localBetaAccess(req), req.params.id);
  res.status(result.status).set("cache-control", "no-store").json(result.body);
});

app.get("/api/reports/:id/brief.md", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).type("text").send("Private beta session required.");
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || (report.owner?.email && report.owner.email !== access.ownerEmail)) {
    res.status(404).type("text").send("Report not found.");
    return;
  }
  res
    .set({
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="seofixkit-${req.params.id}.md"`,
      "x-robots-tag": "noindex, nofollow"
    })
    .type("text/markdown")
    .send(report.repairBrief || "# SEO Fix Kit repair brief\n");
});

app.get("/api/reports/:id/remediation-brief.json", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || (report.owner?.email && report.owner.email !== access.ownerEmail)) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  res
    .set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" })
    .json(buildRemediationBrief(report));
});

app.get("/api/reports/:id/client.pdf", async (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).set("cache-control", "no-store").json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || (report.owner?.email && report.owner.email !== access.ownerEmail)) {
    res.status(404).set("cache-control", "no-store").json({ error: "Report not found." });
    return;
  }
  const branding = localBrandingForOwner(access.ownerEmail);
  const share = { id: "", clientName: cleanText(req.query.clientName || safeHost(report.url), 120) };
  try {
    await sendLocalWhiteLabelPdf(res, {
      report,
      branding,
      share,
      origin: `http://${req.get("host")}`,
      includeDraftBriefs: true
    });
  } catch (error) {
    res.status(500).set("cache-control", "no-store").json({ error: error?.message || "Could not generate PDF." });
  }
});

app.get("/api/reports/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || (report.owner?.email && report.owner.email !== access.ownerEmail)) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  const fixRequest = fixRequests.find((request) => request.reportId === report.id && request.ownerEmail === access.ownerEmail);
  if (fixRequest) report.fixRequest = localFixRequestResponse(fixRequest);
  report.remediationBrief = buildRemediationBrief(report);
  res
    .set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" })
    .json(report);
});

app.get("/fixture/heavy-script.js", (req, res) => {
  res
    .set({
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(DEMO_WATERFALL_SCRIPT),
      "x-robots-tag": "noindex, nofollow"
    })
    .send(DEMO_WATERFALL_SCRIPT);
});

app.get("/fixture/heavy-style.css", (req, res) => {
  res
    .set({
      "content-type": "text/css",
      "content-length": Buffer.byteLength(DEMO_WATERFALL_STYLE),
      "x-robots-tag": "noindex, nofollow"
    })
    .send(DEMO_WATERFALL_STYLE);
});

app.get("/fixture/slow-script.js", (req, res) => {
  setTimeout(() => {
    const body = "window.__demoWaterfallSlowScript = true;";
    res
      .set({
        "content-type": "application/javascript",
        "content-length": Buffer.byteLength(body),
        "x-robots-tag": "noindex, nofollow"
      })
      .send(body);
  }, 1250);
});

app.get("/fixture/hero-large.jpg", (req, res) => {
  res
    .set({
      "content-type": "image/jpeg",
      "content-length": DEMO_WATERFALL_IMAGE.length,
      "x-robots-tag": "noindex, nofollow"
    })
    .send(DEMO_WATERFALL_IMAGE);
});

app.get("/fixture/wp-content/plugins/woocommerce/assets/js/frontend/cart-fragments.js", (req, res) => {
  res
    .set({
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(DEMO_PLATFORM_PLUGIN_SCRIPT),
      "x-robots-tag": "noindex, nofollow"
    })
    .send(DEMO_PLATFORM_PLUGIN_SCRIPT);
});

app.get("/fixture/wp-content/plugins/elementor/assets/js/frontend.js", (req, res) => {
  res
    .set({
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(DEMO_PLATFORM_PLUGIN_SCRIPT),
      "x-robots-tag": "noindex, nofollow"
    })
    .send(DEMO_PLATFORM_PLUGIN_SCRIPT);
});

app.get("/fixture/wp-content/plugins/contact-form-7/includes/js/index.js", (req, res) => {
  res
    .set({
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(DEMO_PLATFORM_PLUGIN_SCRIPT),
      "x-robots-tag": "noindex, nofollow"
    })
    .send(DEMO_PLATFORM_PLUGIN_SCRIPT);
});

app.get("/fixture/wp-content/plugins/revslider/public/assets/js/rbtools.min.js", (req, res) => {
  res
    .set({
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(DEMO_PLATFORM_PLUGIN_SCRIPT),
      "x-robots-tag": "noindex, nofollow"
    })
    .send(DEMO_PLATFORM_PLUGIN_SCRIPT);
});

app.get("/fixture/wp-content/plugins/woocommerce/assets/css/woocommerce.css", (req, res) => {
  res
    .set({
      "content-type": "text/css",
      "content-length": Buffer.byteLength(DEMO_PLATFORM_PLUGIN_STYLE),
      "x-robots-tag": "noindex, nofollow"
    })
    .send(DEMO_PLATFORM_PLUGIN_STYLE);
});

app.get("/fixture/rendered-page", (req, res) => {
  res.set({ "x-robots-tag": "noindex, nofollow" }).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Proof Demo App Shell</title>
    <meta name="description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
    <link rel="canonical" href="/fixture/rendered-page" />
    <link rel="stylesheet" href="/fixture/heavy-style.css" />
    <script src="/fixture/heavy-script.js"></script>
    <script src="/fixture/slow-script.js"></script>
  </head>
  <body>
    <div id="app">Loading app shell...</div>
    <script>
      document.getElementById("app").innerHTML = \`
        <main>
          <h1>Rendered SaaS page with real content</h1>
          <p>This demo intentionally ships a thin static shell, then renders the real page content with JavaScript. A weak static-only SEO audit would say the page has no H1, no internal links, and thin content. SEO Fix Kit should not make that mistake.</p>
          <p>Founders need verified findings, not busywork. The page includes enough rendered text to show that the final browser-visible page is materially different from the raw HTML response.</p>
          <p>Use this fixture to prove that the audit sees what users and modern rendering systems see after JavaScript runs. The report should guard false positives instead of telling the user to add duplicate headings or unnecessary internal links.</p>
          <p>The right output is evidence, confidence, and a practical fix only when a real fix is needed.</p>
          <nav>
            <a href="/fixture/rendered-page">Overview</a>
            <a href="/fixture/rendered-page?tab=pricing">Pricing</a>
            <a href="/fixture/rendered-page?tab=docs">Docs</a>
          </nav>
          <img src="/fixture/hero-large.jpg" alt="Large rendered demo hero" />
        </main>
      \`;
    </script>
  </body>
</html>`);
});

app.get("/fixture/platform-store", (req, res) => {
  res.set({ "x-robots-tag": "noindex, nofollow" }).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content="WordPress 6.5" />
    <title>Fixture WooCommerce Product</title>
    <meta name="description" content="A local WooCommerce fixture for platform SEO proof." />
    <link rel="canonical" href="/fixture/platform-store" />
    <link rel="stylesheet" href="/fixture/wp-content/plugins/woocommerce/assets/css/woocommerce.css" />
    <script src="/fixture/wp-content/plugins/woocommerce/assets/js/frontend/cart-fragments.js"></script>
    <script src="/fixture/wp-content/plugins/elementor/assets/js/frontend.js"></script>
    <script src="/fixture/wp-content/plugins/contact-form-7/includes/js/index.js"></script>
    <script src="/fixture/wp-content/plugins/revslider/public/assets/js/rbtools.min.js"></script>
    <script type="application/ld+json">{ "@context": "https://schema.org", "@type": "WebSite", "name": "Fixture Store" }</script>
  </head>
  <body>
    <main>
      <h1>Fixture WooCommerce Product</h1>
      <p>${"Useful product copy. ".repeat(90)}</p>
      <p>Sale price $49. Sold out. Add to cart when available. SKU WIDGET-1.</p>
      <a href="/fixture/product/widget?variant=blue">Blue variant</a>
      <a href="/fixture/shop?filter_color=blue&orderby=price">Filter by blue</a>
      <a href="/fixture/category/sale">Sale category</a>
      <a href="/fixture/tag/widgets">Widget tag</a>
      <img src="/fixture/hero-large.jpg" />
    </main>
  </body>
</html>`);
});

app.get("/fixture/crawl-intel", (req, res) => {
  res.set({ "x-robots-tag": "noindex, nofollow" }).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Blue Widget Repair Services</title>
    <meta name="description" content="Blue widget repair services for teams that need reliable widget support." />
    <link rel="canonical" href="/fixture/crawl-intel" />
  </head>
  <body>
    <main>
      <h1>Blue widget repair services</h1>
      <p>${"Blue widget repair hub content. ".repeat(120)}</p>
      <a href="/fixture/blue-widget-repair-a">Blue widget repair service A</a>
      <a href="/fixture/blue-widget-repair-b">Blue widget repair service B</a>
      <a href="/fixture/crawl-filter?sort=price&filter=blue">Sorted blue widgets</a>
      <a href="/fixture/crawl-depth-1">Deep support page</a>
    </main>
  </body>
</html>`);
});

app.get(["/fixture/blue-widget-repair-a", "/fixture/blue-widget-repair-b"], (req, res) => {
  res.set({ "x-robots-tag": "noindex, nofollow" }).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Blue Widget Repair Services</title>
    <meta name="description" content="Blue widget repair services for teams that need reliable widget support." />
    <link rel="canonical" href="${req.path}" />
  </head>
  <body>
    <main>
      <h1>Blue widget repair services</h1>
      <p>${"Blue widget repair duplicate content with the same service promise and same proof points. ".repeat(120)}</p>
      <a href="/fixture/crawl-intel">Back to hub</a>
    </main>
  </body>
</html>`);
});

app.get("/fixture/crawl-filter", (req, res) => {
  res.set({ "x-robots-tag": "noindex, nofollow" }).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Filtered Blue Widgets</title>
    <meta name="description" content="Filtered blue widget options." />
    <link rel="canonical" href="/fixture/crawl-intel" />
  </head>
  <body>
    <main>
      <h1>Filtered blue widgets</h1>
      <p>${"Filtered widget content. ".repeat(80)}</p>
      <a href="/fixture/crawl-intel">Clean hub</a>
    </main>
  </body>
</html>`);
});

app.get(/^\/fixture\/crawl-depth-(\d+)$/, (req, res) => {
  const level = Number(req.params[0]);
  res.set({ "x-robots-tag": "noindex, nofollow" }).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Deep Crawl Support Level ${level}</title>
    <meta name="description" content="Deep crawl support level ${level}." />
    <link rel="canonical" href="/fixture/crawl-depth-${level}" />
  </head>
  <body>
    <main>
      <h1>Deep crawl support level ${level}</h1>
      <p>${"Deep crawl support content. ".repeat(100)}</p>
      ${level < 4 ? `<a href="/fixture/crawl-depth-${level + 1}">Next deep level</a>` : ""}
    </main>
  </body>
</html>`);
});

app.get("/fixture/orphan-crawl-intel", (req, res) => {
  res
    .set({ "x-robots-tag": "noindex, nofollow" })
    .type("html")
    .send("<!doctype html><title>Orphan crawl intelligence</title><h1>Orphan crawl intelligence</h1>");
});

function demoKeywordRows(baseUrl) {
  return [
    {
      query: "blue widget repair",
      pageUrl: `${baseUrl}crawl-intel`,
      clicks: 5,
      impressions: 1000,
      ctr: "0.5%",
      position: 4,
      previousClicks: 30,
      previousPosition: 3
    },
    {
      query: "blue widget repair",
      pageUrl: `${baseUrl}blue-widget-repair-a`,
      clicks: 1,
      impressions: 400,
      ctr: "0.25%",
      position: 8
    },
    {
      query: "deep crawl support",
      pageUrl: `${baseUrl}crawl-depth-4`,
      clicks: 0,
      impressions: 350,
      ctr: "0%",
      position: 15
    },
    {
      query: "widget pricing guide",
      pageUrl: `${baseUrl}crawl-filter?sort=price&filter=blue`,
      clicks: 2,
      impressions: 180,
      ctr: "1.1%",
      position: 7
    },
    {
      query: "fixture rendered demo",
      pageUrl: `${baseUrl}rendered-page`,
      clicks: 0,
      impressions: 150,
      ctr: "0%",
      position: 12
    }
  ];
}

app.get("/robots.txt", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.type("text").send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.type("xml").send(rootSitemap(origin));
});

app.get("/fixture/robots.txt", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.type("text").send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/fixture/sitemap.xml\n`);
});

app.get("/fixture/sitemap.xml", (req, res) => {
  const origin = `http://${req.get("host")}`;
  res.type("xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/fixture/rendered-page</loc></url>
  <url><loc>${origin}/fixture/platform-store</loc></url>
  <url><loc>${origin}/fixture/crawl-intel</loc></url>
  <url><loc>${origin}/fixture/blue-widget-repair-a</loc></url>
  <url><loc>${origin}/fixture/blue-widget-repair-b</loc></url>
  <url><loc>${origin}/fixture/orphan-crawl-intel</loc></url>
</urlset>`);
});

app.get("/.well-known/seofixkit-report-domain.txt", (req, res) => {
  const domain = localReportDomainForHost(req.get("host"));
  if (!domain) {
    res.status(404).set("cache-control", "no-store").type("text").send("Report domain challenge not found.");
    return;
  }
  res.set("cache-control", "no-store").type("text").send(domain.verificationToken);
});

app.get("/r/:id.pdf", async (req, res) => {
  const share = localActiveReportShare(req.params.id);
  const domainCheck = localClientReportHostAccess(req, share);
  if (!domainCheck.ok) {
    res.status(404).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("text").send(domainCheck.error);
    return;
  }
  if (!share) {
    res.status(404).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("text").send("Report link not found or expired.");
    return;
  }
  const report = auditReports.get(share.reportId);
  if (!report) {
    res.status(404).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("text").send("Report no longer exists.");
    return;
  }
  if (share.passwordHash && !localReportShareUnlocked(req, share)) {
    res.status(401).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
      buildWhiteLabelReportHtml({
        report,
        branding: localBrandingForOwner(share.ownerEmail),
        share,
        origin: `http://${req.get("host")}`,
        locked: true
      })
    );
    return;
  }
  try {
    await sendLocalWhiteLabelPdf(res, {
      report,
      branding: localBrandingForOwner(share.ownerEmail),
      share,
      origin: `http://${req.get("host")}`
    });
  } catch (error) {
    res.status(500).set("cache-control", "no-store").json({ error: error?.message || "Could not generate PDF." });
  }
});

app.get("/r/:id", (req, res) => {
  const share = localActiveReportShare(req.params.id);
  const domainCheck = localClientReportHostAccess(req, share);
  if (!domainCheck.ok) {
    res.status(404).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
      buildWhiteLabelReportHtml({
        branding: defaultBranding(),
        share: { id: req.params.id },
        origin: `http://${req.get("host")}`,
        locked: true,
        error: domainCheck.error
      })
    );
    return;
  }
  if (!share) {
    res.status(404).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
      buildWhiteLabelReportHtml({
        branding: defaultBranding(),
        share: { id: req.params.id },
        origin: `http://${req.get("host")}`,
        locked: true,
        error: "Report link not found or expired."
      })
    );
    return;
  }
  const report = auditReports.get(share.reportId);
  if (!report) {
    res.status(404).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
      buildWhiteLabelReportHtml({
        branding: localBrandingForOwner(share.ownerEmail),
        share,
        origin: `http://${req.get("host")}`,
        locked: true,
        error: "Report no longer exists."
      })
    );
    return;
  }
  if (share.passwordHash && !localReportShareUnlocked(req, share)) {
    res.status(401).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
      buildWhiteLabelReportHtml({
        report,
        branding: localBrandingForOwner(share.ownerEmail),
        share,
        origin: `http://${req.get("host")}`,
        locked: true
      })
    );
    return;
  }
  share.lastViewedAt = new Date().toISOString();
  res.set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
    buildWhiteLabelReportHtml({
      report,
      branding: localBrandingForOwner(share.ownerEmail),
      share,
      origin: `http://${req.get("host")}`
    })
  );
});

app.post("/r/:id/unlock", (req, res) => {
  const share = localActiveReportShare(req.params.id);
  const domainCheck = localClientReportHostAccess(req, share);
  if (!domainCheck.ok) {
    res.status(404).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
      buildWhiteLabelReportHtml({
        branding: defaultBranding(),
        share: { id: req.params.id },
        origin: `http://${req.get("host")}`,
        locked: true,
        error: domainCheck.error
      })
    );
    return;
  }
  if (!share) {
    res.status(404).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
      buildWhiteLabelReportHtml({
        branding: defaultBranding(),
        share: { id: req.params.id },
        origin: `http://${req.get("host")}`,
        locked: true,
        error: "Report link not found or expired."
      })
    );
    return;
  }
  const password = String(req.body?.password || "");
  const report = auditReports.get(share.reportId) || {};
  if (!share.passwordHash || constantTimeEqual(sha256Hex(password), share.passwordHash)) {
    res
      .status(303)
      .set("cache-control", "no-store")
      .set("set-cookie", localReportShareCookie(req, share))
      .set("location", `/r/${encodeURIComponent(share.id)}`)
      .send("");
    return;
  }
  res.status(401).set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }).type("html").send(
    buildWhiteLabelReportHtml({
      report,
      branding: localBrandingForOwner(share.ownerEmail),
      share,
      origin: `http://${req.get("host")}`,
      locked: true,
      error: "Password did not match."
    })
  );
});

app.get(/^\/beta(\/.*)?$/, (req, res) => {
  res.set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" });
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.use(express.static(path.join(rootDir, "dist")));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, "127.0.0.1", () => {
    console.log(`SEO Fix Kit server running at http://127.0.0.1:${port}`);
  });
}

function isBetaPasswordValid(bodyPassword = "") {
  const expected = process.env.BETA_ACCESS_PASSWORD || "local-beta";
  const supplied = String(bodyPassword || "");
  return constantTimeEqual(supplied, expected);
}

function localBetaAccess(req) {
  const token = betaSessionTokenFromRequest(req);
  if (!token) return { ok: false };

  const sessionHash = sha256Hex(token);
  const session = betaSessions.get(sessionHash);
  if (!session || session.expiresAt <= new Date().toISOString()) {
    betaSessions.delete(sessionHash);
    return { ok: false };
  }

  session.lastSeenAt = new Date().toISOString();
  return {
    ok: true,
    ownerEmail: session.ownerEmail,
    accessMode: session.accessMode || "founder-override",
    sessionHash,
    expiresAt: session.expiresAt
  };
}

function localApiAccess(req) {
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return { ok: false, status: 401, error: "API key required." };
  const tokenHash = sha256Hex(bearer);
  const token = [...apiTokens.values()].find((item) => item.tokenHash === tokenHash && item.status === "active");
  if (!token) return { ok: false, status: 401, error: "API key is invalid or revoked." };
  token.lastUsedAt = new Date().toISOString();
  token.updatedAt = token.lastUsedAt;
  return {
    ok: true,
    ownerEmail: token.ownerEmail,
    accessMode: "api",
    sessionHash: token.tokenHash,
    apiTokenId: token.id
  };
}

function localProtectedFixRequestForReport(reportId = "", ownerEmail = "") {
  if (!reportId || !ownerEmail) return null;
  return fixRequests.find((request) =>
    request.ownerEmail === ownerEmail &&
    PROTECTED_FIX_REQUEST_STATUSES.has(request.status) &&
    (request.reportId === reportId || request.finalReportId === reportId)
  ) || null;
}

function localDeveloperSummary(access) {
  const tokens = [...apiTokens.values()]
    .filter((token) => token.ownerEmail === access.ownerEmail && token.status === "active")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(localApiTokenResponse);
  const webhooks = [...apiWebhooks.values()]
    .filter((webhook) => webhook.ownerEmail === access.ownerEmail && webhook.status === "active")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(localApiWebhookResponse);
  return {
    ok: true,
    apiBaseUrl: "/v1",
    authHeader: "Authorization: Bearer YOUR_API_KEY",
    tokens,
    webhooks,
    docs: {
      startAudit: "POST /v1/audits",
      getAudit: "GET /v1/audits/{audit_id}",
      getIssues: "GET /v1/audits/{audit_id}/issues",
      getRepairQueue: "GET /v1/audits/{audit_id}/repair-queue",
      updateRepairQueue: "PATCH /v1/audits/{audit_id}/repair-queue",
      createRepairAction: "POST /v1/audits/{audit_id}/repair-actions",
      updateRepairAction: "PATCH /v1/audits/{audit_id}/repair-actions/{action_id}",
      getRepairActionImplementationPack: "GET /v1/audits/{audit_id}/repair-actions/{action_id}/implementation.md",
      getRepairActionProofReceipt: "GET /v1/audits/{audit_id}/repair-actions/{action_id}/proof.md",
      getReport: "GET /v1/audits/{audit_id}/report",
      startLargeCrawl: "POST /v1/large-crawls",
      getLargeCrawl: "GET /v1/large-crawls/{large_crawl_id}",
      projects: "GET /v1/projects",
      webhookEvents: "audit.completed, audit.failed, repair_action.drafted, repair_action.approved, repair_action.applied, repair_action.fixed, repair_action.regressed"
    },
    issueFields: {
      repair_queue: "Safe per-issue queue status. Draft text is only returned from owner-authenticated repair-action surfaces and separate implementation-pack/proof-receipt endpoints."
    },
    workerOnlyDocs: {
      authHeader: "x-seofixkit-worker-token: WORKER_TOKEN",
      proofToken: "Send claim response proof_token/proofToken back with proof saves.",
      claimLargeCrawlBatch: "POST /v1/large-crawls/{large_crawl_id}/batches/claim",
      processLargeCrawlBatch: "POST /v1/large-crawls/{large_crawl_id}/batches/process",
      saveLargeCrawlProof: "POST /v1/large-crawls/{large_crawl_id}/batches/{batch_id}/proof"
    }
  };
}

function createLocalApiToken(access, label = "") {
  const now = new Date().toISOString();
  const secret = `sfk_test_${randomBytes(24).toString("hex")}`;
  const token = {
    id: randomUUID(),
    ownerEmail: access.ownerEmail,
    tokenHash: sha256Hex(secret),
    tokenPrefix: `${secret.slice(0, 12)}...${secret.slice(-4)}`,
    label: cleanText(label || "API key", 80),
    scopes: ["audits:read", "audits:write", "large_crawls:read", "large_crawls:write", "projects:read", "projects:write"],
    status: "active",
    secret,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: "",
    revokedAt: ""
  };
  apiTokens.set(token.id, token);
  return token;
}

function localApiTokenResponse(token = {}) {
  return {
    id: token.id || "",
    label: token.label || "API key",
    tokenPrefix: token.tokenPrefix || "",
    scopes: token.scopes || [],
    status: token.status || "active",
    createdAt: token.createdAt || "",
    updatedAt: token.updatedAt || "",
    lastUsedAt: token.lastUsedAt || "",
    revokedAt: token.revokedAt || ""
  };
}

function createLocalApiWebhook(access, url, events = []) {
  const now = new Date().toISOString();
  const webhook = {
    id: randomUUID(),
    ownerEmail: access.ownerEmail,
    url,
    events: cleanWebhookEvents(events),
    status: "active",
    createdAt: now,
    updatedAt: now,
    lastDeliveryAt: "",
    lastDeliveryStatus: "",
    lastError: "",
    revokedAt: ""
  };
  apiWebhooks.set(webhook.id, webhook);
  return webhook;
}

function localApiWebhookResponse(webhook = {}) {
  return {
    id: webhook.id || "",
    url: webhook.url || "",
    events: webhook.events || [],
    status: webhook.status || "active",
    createdAt: webhook.createdAt || "",
    updatedAt: webhook.updatedAt || "",
    lastDeliveryAt: webhook.lastDeliveryAt || "",
    lastDeliveryStatus: webhook.lastDeliveryStatus || "",
    lastError: webhook.lastError || ""
  };
}

function localBrandingForOwner(ownerEmail) {
  const saved = reportBrandingProfiles.get(ownerEmail);
  return normalizeBrandingInput(saved || {}, defaultBranding(ownerEmail));
}

function createLocalReportDomain(access, domainName) {
  const now = new Date().toISOString();
  const domain = {
    id: randomUUID(),
    ownerEmail: access.ownerEmail,
    domain: domainName,
    verificationToken: `sfk-report-domain=${randomBytes(24).toString("hex")}`,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    verifiedAt: "",
    lastCheckedAt: "",
    lastError: "",
    revokedAt: ""
  };
  reportDomains.set(domain.id, domain);
  return domain;
}

function localReportDomainResponse(domain = {}) {
  const dnsName = localReportDomainDnsName(domain.domain || "");
  const cnameTarget = cleanReportDomain(process.env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || "seofixkit.com") || "seofixkit.com";
  return {
    id: domain.id || "",
    domain: domain.domain || "",
    status: domain.status || "pending",
    verificationToken: domain.verificationToken || "",
    verificationMethod: "dns_txt",
    verificationPath: "",
    verificationUrl: "",
    dnsName,
    dnsType: "TXT",
    dnsValue: domain.verificationToken || "",
    cnameTarget,
    shareOrigin: domain.status === "verified" && domain.domain ? `https://${domain.domain}` : "",
    createdAt: domain.createdAt || "",
    updatedAt: domain.updatedAt || "",
    verifiedAt: domain.verifiedAt || "",
    lastCheckedAt: domain.lastCheckedAt || "",
    lastError: domain.lastError || ""
  };
}

async function verifyLocalReportDomain(domain, body = {}) {
  if (process.env.NODE_ENV !== "production" && body.devVerificationToken === domain.verificationToken) {
    return { ok: true };
  }
  const ownership = await verifyLocalReportDomainTxt(domain.domain, domain.verificationToken);
  if (!ownership.ok) return ownership;
  return verifyLocalReportDomainCname(domain.domain, process.env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || "seofixkit.com");
}

async function verifyLocalReportDomainTxt(domain = "", token = "") {
  const expected = token || "";
  const dnsName = localReportDomainDnsName(domain);
  if (!expected || !dnsName) return { ok: false, error: "Report domain verification is not configured." };
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dnsName)}&type=TXT`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!response.ok) return { ok: false, error: "DNS verification lookup failed." };
    const payload = await response.json().catch(() => ({}));
    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    const matched = answers.some((answer) => normalizeDnsTxt(answer.data).includes(expected));
    return matched ? { ok: true } : { ok: false, error: "DNS TXT record was not found yet." };
  } catch {
    return { ok: false, error: "DNS verification lookup failed." };
  }
}

async function verifyLocalReportDomainCname(domain = "", cnameTarget = "") {
  const domainName = cleanReportDomain(domain);
  const expected = cleanReportDomain(cnameTarget);
  if (!domainName || !expected) return { ok: false, error: "Report domain routing is not configured." };
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domainName)}&type=CNAME`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!response.ok) return { ok: false, error: "CNAME verification lookup failed." };
    const payload = await response.json().catch(() => ({}));
    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    const matched = answers.some((answer) => normalizeDnsHost(answer.data) === expected);
    return matched ? { ok: true } : { ok: false, error: "CNAME target was not found yet." };
  } catch {
    return { ok: false, error: "CNAME verification lookup failed." };
  }
}

function localReportDomainDnsName(domain = "") {
  const clean = cleanReportDomain(domain);
  return clean ? `_seofixkit-report-domain.${clean}` : "";
}

function localReportDomainForHost(hostValue, { verifiedOnly = false } = {}) {
  const host = cleanReportDomain(hostValue);
  if (!host) return null;
  return [...reportDomains.values()].find(
    (domain) =>
      domain.domain === host &&
      !domain.revokedAt &&
      (verifiedOnly ? domain.status === "verified" : ["pending", "verified"].includes(domain.status))
  ) || null;
}

function localPrimaryVerifiedReportDomain(ownerEmail) {
  return [...reportDomains.values()]
    .filter((domain) => domain.ownerEmail === ownerEmail && domain.status === "verified" && !domain.revokedAt)
    .sort((a, b) => String(b.verifiedAt || b.updatedAt).localeCompare(String(a.verifiedAt || a.updatedAt)))[0] || null;
}

function localClientReportHostAccess(req, share) {
  const host = cleanReportDomain(req.get("host"));
  if (!host || localAppHost(host)) return { ok: true };
  const domain = localReportDomainForHost(host, { verifiedOnly: true });
  if (!domain) return { ok: false, error: "Report domain not verified." };
  if (share && domain.ownerEmail !== share.ownerEmail) return { ok: false, error: "Report link not found on this domain." };
  return { ok: true, domain };
}

function createLocalReportShare(access, report, body = {}) {
  const now = new Date().toISOString();
  const password = String(body.password || "").trim();
  const expiresDays = Number(body.expiresDays || body.expires_days || 0);
  const share = {
    id: randomUUID(),
    reportId: report.id,
    ownerEmail: access.ownerEmail,
    clientName: cleanText(body.clientName || body.client_name || safeHost(report.url), 120),
    status: "active",
    passwordHash: password ? sha256Hex(password) : "",
    passwordHint: cleanText(body.passwordHint || body.password_hint || "", 120),
    expiresAt: expiresDays > 0 ? isoDaysFromNow(Math.min(Math.max(expiresDays, 1), 180)) : "",
    createdAt: now,
    updatedAt: now,
    lastViewedAt: "",
    revokedAt: ""
  };
  reportShareLinks.set(share.id, share);
  return share;
}

function localReportShareResponse(share, origin) {
  const domain = localPrimaryVerifiedReportDomain(share.ownerEmail);
  const shareOrigin = domain ? `https://${domain.domain}` : origin;
  return {
    id: share.id,
    reportId: share.reportId,
    clientName: share.clientName || "",
    status: share.status || "active",
    passwordProtected: Boolean(share.passwordHash),
    passwordHint: share.passwordHint || "",
    sharePath: `/r/${share.id}`,
    shareUrl: `${shareOrigin}/r/${share.id}`,
    pdfPath: `/r/${share.id}.pdf`,
    pdfUrl: `${shareOrigin}/r/${share.id}.pdf`,
    customDomain: domain ? localReportDomainResponse(domain) : null,
    expiresAt: share.expiresAt || "",
    createdAt: share.createdAt || "",
    updatedAt: share.updatedAt || "",
    lastViewedAt: share.lastViewedAt || ""
  };
}

function localActiveReportShare(id) {
  const share = reportShareLinks.get(String(id || ""));
  if (!share || share.status !== "active") return null;
  if (share.expiresAt && share.expiresAt <= new Date().toISOString()) {
    share.status = "expired";
    share.updatedAt = new Date().toISOString();
    return null;
  }
  return share;
}

function localReportShareCookieName(share) {
  return `sfk_report_${String(share.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 36)}`;
}

function localReportShareCookieValue(share) {
  return sha256Hex(`${share.id}:${share.passwordHash}:client-report`);
}

function localReportShareCookie(req, share) {
  const secure = req.protocol === "https" ? "; Secure" : "";
  return `${localReportShareCookieName(share)}=${encodeURIComponent(localReportShareCookieValue(share))}; Path=/r; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

function localReportShareUnlocked(req, share) {
  const value = cookieValue(req, localReportShareCookieName(share));
  return Boolean(value) && constantTimeEqual(value, localReportShareCookieValue(share));
}

async function sendLocalWhiteLabelPdf(res, { report, branding, share, origin, includeDraftBriefs = false }) {
  const html = buildWhiteLabelReportHtml({ report, branding, share, origin, includeDraftBriefs });
  const pdf = await renderLocalPdf(html);
  res
    .set({
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${whiteLabelReportFilename({ report, branding, share })}"`,
      "content-type": "application/pdf",
      "x-robots-tag": "noindex, nofollow"
    })
    .send(pdf);
}

async function renderLocalPdf(html) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "24px",
        right: "24px",
        bottom: "28px",
        left: "24px"
      }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function createLocalTeamMember(access, body = {}) {
  const now = new Date().toISOString();
  const member = {
    id: randomUUID(),
    ownerEmail: access.ownerEmail,
    memberEmail: normalizeEmail(body.email || body.memberEmail),
    memberName: cleanText(body.name || body.memberName || "", 120),
    role: cleanTeamRole(body.role),
    status: "active",
    createdAt: now,
    updatedAt: now,
    revokedAt: ""
  };
  teamMembers.set(member.id, member);
  return member;
}

function localTeamMembers(ownerEmail) {
  return [...teamMembers.values()]
    .filter((member) => member.ownerEmail === ownerEmail && member.status === "active")
    .sort((a, b) => String(a.memberEmail).localeCompare(String(b.memberEmail)))
    .map(localTeamMemberResponse);
}

function localTeamMemberResponse(member = {}) {
  return {
    id: member.id || "",
    email: member.memberEmail || "",
    name: member.memberName || "",
    role: member.role || "editor",
    status: member.status || "active",
    createdAt: member.createdAt || "",
    updatedAt: member.updatedAt || ""
  };
}

function localReportCollaborationResponse(access, report) {
  const issues = reportIssuesForCollaboration(report);
  const saved = new Map(
    [...issueCollaborations.values()]
      .filter((item) => item.ownerEmail === access.ownerEmail && item.reportId === report.id)
      .map((item) => [item.issueId, item])
  );
  return {
    ok: true,
    members: localTeamMembers(access.ownerEmail),
    issues: issues.map((finding) => localIssueCollaborationResponse(finding, saved.get(finding.id))),
    updatedAt: new Date().toISOString()
  };
}

function localIssueCollaborationResponse(finding = {}, saved = {}) {
  return {
    issueId: finding.id || "",
    title: finding.title || "",
    severity: finding.severity || "notice",
    pageLabel: finding.pageLabel || "",
    pageUrl: finding.pageUrl || "",
    proof: finding.evidence || "",
    fix: finding.fix || "",
    status: saved.status || "open",
    assigneeEmail: saved.assigneeEmail || "",
    note: saved.note || "",
    updatedAt: saved.updatedAt || "",
    updatedByEmail: saved.updatedByEmail || ""
  };
}

function saveLocalIssueCollaborations(access, report, items = []) {
  if (!Array.isArray(items)) return { ok: false, error: "Send collaboration items as a list." };
  const issues = reportIssuesForCollaboration(report);
  const issueIds = new Set(issues.map((issue) => issue.id));
  const assignees = new Set(localTeamMembers(access.ownerEmail).map((member) => member.email));
  const now = new Date().toISOString();
  for (const item of items.slice(0, 50)) {
    const issueId = cleanText(item?.issueId || item?.issue_id || "", 160);
    if (!issueIds.has(issueId)) return { ok: false, error: "Issue no longer exists in this report." };
    const assigneeEmail = normalizeEmail(item?.assigneeEmail || item?.assignee_email || "");
    if (assigneeEmail && !assignees.has(assigneeEmail)) {
      return { ok: false, error: "Assign the issue to an active teammate." };
    }
    const key = `${report.id}:${issueId}`;
    const current = issueCollaborations.get(key);
    issueCollaborations.set(key, {
      id: current?.id || randomUUID(),
      reportId: report.id,
      ownerEmail: access.ownerEmail,
      issueId,
      assigneeEmail,
      status: cleanIssueStatus(item?.status),
      note: cleanText(item?.note || "", 1200),
      createdAt: current?.createdAt || now,
      updatedAt: now,
      updatedByEmail: access.ownerEmail
    });
  }
  return { ok: true };
}

function localRepairQueueResponse(access, report) {
  const items = ensureLocalRepairQueueRows(access, report);
  return {
    ok: true,
    reportId: report.id,
    items,
    counts: localRepairQueueCounts(items),
    unavailable: false,
    updatedAt: new Date().toISOString()
  };
}

function localApiRepairQueueResponse(access, resolved = {}) {
  const report = resolved.report || {};
  const items = ensureLocalRepairQueueRows(access, report);
  return {
    ok: true,
    audit_id: resolved.job?.id || "",
    report_id: report.id || "",
    items: items.map(repairQueueItemDetailResponse),
    summary: apiRepairQueueSummary(items),
    unavailable: false
  };
}

function localApiRepairActionResponse(access, resolved = {}, action = {}) {
  const queue = localApiRepairQueueResponse(access, resolved);
  return {
    ok: true,
    action: repairActionDetailResponse(action),
    queue: {
      items: queue.items,
      summary: queue.summary
    }
  };
}

function localRepairActionImplementationPack(access, report, actionId = "") {
  const action = localRepairActionRows.get(String(actionId || ""));
  if (!action || action.report_id !== report.id || action.owner_email !== access.ownerEmail) {
    return { ok: false, status: 404, error: "Action not found." };
  }
  const item = repairImplementationItemForAction(ensureLocalRepairQueueRows(access, report), action);
  if (!item) return { ok: false, status: 409, error: "Repair item not found." };
  const pack = buildRepairImplementationPack({ report, item, action });
  if (!pack.ok) return { ok: false, status: pack.status || 400, error: pack.error };
  return { ok: true, pack };
}

function localRepairActionProofReceipt(access, report, actionId = "") {
  const action = localRepairActionRows.get(String(actionId || ""));
  if (!action || action.report_id !== report.id || action.owner_email !== access.ownerEmail) {
    return { ok: false, status: 404, error: "Action not found." };
  }
  const item = repairImplementationItemForAction(ensureLocalRepairQueueRows(access, report), action);
  if (!item) return { ok: false, status: 409, error: "Repair item not found." };
  const rerunReport = auditReports.get(action.rerun_report_id || "");
  if (!rerunReport || rerunReport.owner?.email !== access.ownerEmail) {
    return { ok: false, status: 404, error: "Rerun proof report not found." };
  }
  const receipt = buildRepairProofReceipt({ report, item, action, rerunReport });
  if (!receipt.ok) return { ok: false, status: receipt.status || 400, error: receipt.error };
  return { ok: true, receipt };
}

function sendLocalImplementationPack(res, result = {}) {
  if (!result.ok) {
    res.status(result.status || 400).set("cache-control", "no-store").json({ error: result.error || "Implementation pack is unavailable." });
    return;
  }
  res
    .status(200)
    .set({
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${result.pack.filename}"`,
      "content-type": result.pack.contentType,
      "x-robots-tag": "noindex, nofollow"
    })
    .send(result.pack.markdown);
}

function sendLocalProofReceipt(res, result = {}) {
  if (!result.ok) {
    res.status(result.status || 400).set("cache-control", "no-store").json({ error: result.error || "Proof receipt is unavailable." });
    return;
  }
  res
    .status(200)
    .set({
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${result.receipt.filename}"`,
      "content-type": result.receipt.contentType,
      "x-robots-tag": "noindex, nofollow"
    })
    .send(result.receipt.markdown);
}

function saveLocalRepairQueue(access, report, items = []) {
  const normalized = normalizeRepairQueuePatchItems(items, ensureLocalRepairQueueRows(access, report));
  if (!normalized.ok) return { ok: false, error: normalized.error, status: normalized.status || 400 };
  const update = normalized.update;
  localStoreRepairQueueRow(access, report, update.existing, {
    status: update.status,
    actionMode: update.actionMode,
    rerunStatus: update.rerunStatus,
    rerunReportId: update.rerunReportId
  });
  return { ok: true };
}

function createLocalRepairAction(access, report, body = {}) {
  const issueId = cleanText(body.issueId || body.issue_id || "", 160);
  const item = ensureLocalRepairQueueRows(access, report).find((candidate) => candidate.issueId === issueId);
  if (!item) return { ok: false, error: "Repair item no longer exists in this report.", status: 400 };
  const proposedChange = cleanText(body.proposedChange || body.proposed_change || defaultProposedChangeForItem(item), 4000);
  if (!proposedChange) return { ok: false, error: "Draft action needs a proposed change.", status: 400 };
  const normalized = normalizeRepairActionCreateInput(body, item);
  if (!normalized.ok) return { ok: false, error: normalized.error, status: normalized.status || 400 };
  const now = new Date().toISOString();
  const row = localStoreRepairQueueRow(access, report, item, {
    status: "drafted",
    actionMode: normalized.actionMode,
    rerunStatus: "not_run",
    rerunReportId: ""
  });
  const action = {
    id: randomUUID(),
    report_id: report.id,
    owner_email: access.ownerEmail,
    queue_item_id: row.id,
    issue_id: item.issueId,
    action_mode: row.action_mode,
    action_type: normalized.actionType,
    approval_state: "drafted",
    execution_state: "not_started",
    rerun_state: "not_run",
    source_proof: cleanText(item.proof, 1200),
    proposed_change: proposedChange,
    acceptance: cleanText(body.acceptance || item.acceptance, 1000),
    rerun_report_id: "",
    created_at: now,
    updated_at: now,
    approved_at: "",
    applied_at: "",
    updated_by_email: access.ownerEmail
  };
  localRepairActionRows.set(action.id, action);
  scheduleLocalRepairActionWebhook(access, report, "repair_action.drafted", action);
  return {
    ok: true,
    body: {
      ok: true,
      action: agentActionResponse(action),
      queue: localRepairQueueResponse(access, report)
    }
  };
}

function updateLocalRepairAction(access, report, actionId, body = {}) {
  const action = localRepairActionRows.get(String(actionId || ""));
  if (!action || action.report_id !== report.id || action.owner_email !== access.ownerEmail) {
    return { ok: false, error: "Action not found.", status: 404 };
  }
  const normalized = normalizeRepairActionPatch(body, action, {
    messages: {
      appliedBeforeApproved: "Repair action must be approved before it can be applied.",
      missingRerunReport: "Rerun repair actions need a rerun report."
    }
  });
  if (!normalized.ok) return { ok: false, error: normalized.error, status: normalized.status || 400 };
  const { approvalState, executionState, rerunState, rerunReportId } = normalized;
  const now = new Date().toISOString();
  if (rerunProofBlockedByNewApply(action, executionState, rerunState)) {
    return {
      ok: false,
      error: "Rerun repair states require a later rerun after the action is applied.",
      status: 400
    };
  }
  const proofFreshAfterMs = cleanRerunState(rerunState) !== "not_run" ? rerunProofFreshAfterMs(action, report) : 0;
  if (rerunReportId && !localOwnerHasReport(access, rerunReportId, report, {
    freshAfterMs: proofFreshAfterMs,
    issue: repairProofIssueForAction(report, action),
    rerunState
  })) {
    return { ok: false, error: "Rerun report not found.", status: 404 };
  }
  const patched = {
    ...action,
    approval_state: approvalState,
    execution_state: executionState,
    rerun_state: rerunState,
    rerun_report_id: rerunReportId,
    updated_at: now,
    approved_at: approvalState === "approved" && action.approval_state !== "approved" ? now : action.approved_at || "",
    applied_at: executionState === "applied" && action.execution_state !== "applied" ? now : action.applied_at || "",
    updated_by_email: access.ownerEmail
  };
  localRepairActionRows.set(patched.id, patched);
  localUpdateRepairQueueFromAction(access, report, patched);
  for (const eventType of repairActionTransitionEvents(action, patched)) {
    scheduleLocalRepairActionWebhook(access, report, eventType, patched);
  }
  return {
    ok: true,
    body: {
      ok: true,
      action: agentActionResponse(patched),
      queue: localRepairQueueResponse(access, report)
    }
  };
}

function scheduleLocalRepairActionWebhook(access, report, eventType, action = {}) {
  deliverLocalApiWebhooks(
    access.ownerEmail,
    eventType,
    repairActionWebhookPayload(action, report)
  ).catch((error) => {
    console.error("Local repair action webhook delivery failed", {
      eventType,
      actionId: action?.id || "",
      reportId: action?.report_id || "",
      error: error?.message || String(error)
    });
  });
}

function cleanupLocalRepairsForDeletedReport(reportId = "", ownerEmail = "") {
  if (!reportId || !ownerEmail) return;
  const now = new Date().toISOString();
  for (const [key, row] of [...localRepairQueueRows.entries()]) {
    if (row.owner_email !== ownerEmail) continue;
    if (row.report_id === reportId) {
      localRepairQueueRows.delete(key);
      continue;
    }
    if (row.last_rerun_report_id === reportId) {
      row.status = ["fixed", "regressed"].includes(row.status) ? "applied" : row.status;
      row.rerun_status = "not_run";
      row.last_rerun_report_id = null;
      row.updated_at = now;
      row.updated_by_email = ownerEmail;
    }
  }
  for (const [key, action] of [...localRepairActionRows.entries()]) {
    if (action.owner_email !== ownerEmail) continue;
    if (action.report_id === reportId) {
      localRepairActionRows.delete(key);
      continue;
    }
    if (action.rerun_report_id === reportId) {
      action.rerun_state = "not_run";
      action.rerun_report_id = "";
      action.updated_at = now;
      action.updated_by_email = ownerEmail;
    }
  }
}

function localRepairQueueItems(access, report) {
  const rows = [...localRepairQueueRows.values()]
    .filter((row) => row.owner_email === access.ownerEmail && row.report_id === report.id);
  const actions = [...localRepairActionRows.values()]
    .filter((row) => row.owner_email === access.ownerEmail && row.report_id === report.id);
  return deriveRepairQueueItems(report, rows, actions);
}

function ensureLocalRepairQueueRows(access, report) {
  const initialItems = localRepairQueueItems(access, report);
  for (const item of initialItems) {
    if (!item.id && item.issueId) localStoreRepairQueueRow(access, report, item);
  }
  return localRepairQueueItems(access, report);
}

function localStoreRepairQueueRow(access, report, item = {}, updates = {}) {
  const issueId = cleanText(item.issueId || item.issue_id || "", 160);
  const key = `${access.ownerEmail}:${report.id}:${issueId}`;
  const current = localRepairQueueRows.get(key);
  const now = new Date().toISOString();
  const row = {
    id: current?.id || item.id || `local-${report.id}-${issueId}`.replace(/[^a-z0-9.-]/gi, "-").slice(0, 120),
    report_id: report.id,
    owner_email: access.ownerEmail,
    issue_id: issueId,
    title: cleanText(item.title, 220),
    severity: item.severity || "notice",
    page_url: cleanText(item.pageUrl || item.page_url, 600),
    page_label: cleanText(item.pageLabel || item.page_label, 120),
    proof: cleanText(item.proof, 1200),
    fix: cleanText(item.fix, 1600),
    snippet: cleanText(item.snippet, 3000),
    acceptance: cleanText(item.acceptance, 1000),
    confidence: cleanText(item.confidence || "verified", 80),
    source: cleanText(item.source, 160),
    source_kind: item.sourceKind || item.source_kind || "finding",
    estimated_effort: cleanText(item.estimatedEffort || item.estimated_effort, 80),
    work_type: cleanText(item.workType || item.work_type, 80),
    action_mode: cleanActionMode(updates.actionMode || item.actionMode || item.action_mode),
    status: cleanQueueStatus(updates.status || item.status),
    rerun_status: cleanRerunState(updates.rerunStatus || item.rerunStatus || item.rerun_status),
    last_rerun_report_id: updates.rerunReportId || null,
    created_at: current?.created_at || now,
    updated_at: now,
    updated_by_email: access.ownerEmail
  };
  localRepairQueueRows.set(key, row);
  return row;
}

function localUpdateRepairQueueFromAction(access, report, action) {
  const item = ensureLocalRepairQueueRows(access, report).find((candidate) => candidate.issueId === action.issue_id);
  if (!item) return;
  localStoreRepairQueueRow(access, report, item, {
    status: queueStatusFromActionState(action),
    actionMode: action.action_mode,
    rerunStatus: action.rerun_state,
    rerunReportId: action.rerun_report_id || ""
  });
}

function localRepairQueueCounts(items = []) {
  return items.reduce((counts, item) => {
    counts.total += 1;
    counts[item.status] = (counts[item.status] || 0) + 1;
    if (item.latestAction) counts.withActions += 1;
    return counts;
  }, {
    total: 0,
    open: 0,
    in_progress: 0,
    drafted: 0,
    approved: 0,
    applied: 0,
    fixed: 0,
    ignored: 0,
    regressed: 0,
    withActions: 0
  });
}

function localOwnerHasReport(access, reportId, referenceReport = {}, options = {}) {
  if (reportId === referenceReport.id || reportId === referenceReport.reportId || reportId === referenceReport.report_id) return false;
  const report = auditReports.get(reportId);
  if (!report || report.owner?.email !== access.ownerEmail) return false;
  if (report.retention?.expiresAt && report.retention.expiresAt <= new Date().toISOString()) return false;
  if (!validRerunProofReport(report)) return false;
  const freshAfterMs = Number(options.freshAfterMs || 0);
  if (freshAfterMs > 0) {
    const proofTimestampMs = reportTimestampMs(report);
    if (!proofTimestampMs || proofTimestampMs <= freshAfterMs) return false;
  }
  if (comparableReportHost(report) !== comparableReportHost(referenceReport)) return false;
  if (cleanRerunState(options.rerunState || "") !== "not_run" && !rerunReportProvesIssue(report, options.issue, options.rerunState)) {
    return false;
  }
  return true;
}

function reportIssuesForCollaboration(report = {}) {
  return (report.findings || [])
    .filter((finding) => finding?.id && finding.severity !== "good")
    .slice(0, 50);
}

function cleanTeamRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ["admin", "editor", "viewer"].includes(role) ? role : "editor";
}

function cleanIssueStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["open", "in_progress", "fixed", "ignored"].includes(status) ? status : "open";
}

function createLocalSession(req, ownerEmail, accessMode = "founder-override") {
  const token = randomBytes(32).toString("hex");
  const sessionHash = sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = isoSecondsFromNow(BETA_SESSION_TTL_SECONDS);
  betaSessions.set(sessionHash, {
    ownerEmail,
    accessMode,
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
    userAgent: cleanText(req.get("user-agent") || "", 500)
  });
  return { token, expiresAt };
}

function betaSessionTokenFromRequest(req) {
  return req.get("x-beta-session") || cookieValue(req, SESSION_COOKIE);
}

function sessionCookie(req, token, maxAge) {
  const secure = req.protocol === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(req) {
  const secure = req?.protocol === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function adminSessionCookie(req) {
  const secure = req.protocol === "https" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=local-admin; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 2}${secure}`;
}

function clearAdminSessionCookie(req) {
  const secure = req?.protocol === "https" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function cookieValue(req, name) {
  const cookie = req.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("=") || "");
  }
  return "";
}

function localActiveAuditJobForTarget(access, targetUrl, competitorUrls = [], backlinkRows = [], localSeo = {}, keywordRows = [], renderedCrawlTarget = 0, maxPages = 10) {
  const competitorKey = competitorUrlsKey(competitorUrls);
  const backlinkKey = backlinkRowsKey(backlinkRows);
  const localSeoKey = localSeoInputKey(localSeo);
  const keywordKey = keywordRowsKey(keywordRows);
  const normalizedRenderedTarget = normalizeRenderedCrawlTarget(renderedCrawlTarget);
  const pageLimit = normalizeCrawlLimit(maxPages || 10);
  return [...auditJobs.values()]
    .filter(
      (job) =>
        job.ownerEmail === access.ownerEmail &&
        job.targetUrl === targetUrl &&
        competitorUrlsKey(job.competitorUrls || []) === competitorKey &&
        backlinkRowsKey(job.backlinkRows || []) === backlinkKey &&
        localSeoInputKey(job.localSeo || {}) === localSeoKey &&
        keywordRowsKey(job.keywordRows || []) === keywordKey &&
        normalizeRenderedCrawlTarget(job.renderedCrawlTarget || 0) === normalizedRenderedTarget &&
        normalizeCrawlLimit(job.maxPages || 10) === pageLimit &&
        ["queued", "running"].includes(job.status) &&
        (!job.expiresAt || job.expiresAt > new Date().toISOString())
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

function localActiveAuditJobCount(access) {
  return [...auditJobs.values()].filter(
    (job) =>
      job.ownerEmail === access.ownerEmail &&
      ["queued", "running"].includes(job.status) &&
      (!job.expiresAt || job.expiresAt > new Date().toISOString())
  ).length;
}

function createLocalAuditJob(access, targetUrl, maxPages, options = {}) {
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    ownerEmail: access.ownerEmail,
    ownerSessionHash: access.sessionHash || "",
    ownerInviteId: access.inviteId || "",
    accessMode: access.accessMode || "self-serve",
    targetUrl,
    targetHost: safeHost(targetUrl),
    competitorUrls: normalizeCompetitorUrlsList(options.competitorUrls || [], targetUrl),
    backlinkRows: parseBacklinkRows({ backlinkRows: options.backlinkRows || [] }, targetUrl, { allowPrivate: false }).rows || [],
    localSeo: parseLocalSeoInput({ localSeo: options.localSeo || {} }, targetUrl, { allowPrivate: false }).input || { enabled: false },
    keywordRows: parseKeywordRows({ keywordRows: options.keywordRows || [] }, targetUrl, { allowPrivate: false }).rows || [],
    renderedCrawlTarget: normalizeRenderedCrawlTarget(options.renderedCrawlTarget || 0),
    maxPages,
    status: "queued",
    reportId: "",
    scheduleId: options.scheduleId || "",
    error: "",
    createdAt: now,
    updatedAt: now,
    startedAt: "",
    completedAt: "",
    expiresAt: isoDaysFromNow(REPORT_RETENTION_DAYS)
  };
  auditJobs.set(job.id, job);
  return job;
}

function createLocalAuditSchedule(access, targetUrl, options = {}) {
  const now = new Date().toISOString();
  const schedule = {
    id: randomUUID(),
    ownerEmail: access.ownerEmail,
    ownerSessionHash: access.sessionHash || "",
    ownerInviteId: access.inviteId || "",
    accessMode: access.accessMode || "self-serve",
    targetUrl,
    targetHost: safeHost(targetUrl),
    maxPages: normalizeCrawlLimit(options.maxPages || 10),
    intervalDays: clampScheduleInterval(options.intervalDays || 7),
    status: "active",
    nextRunAt: now,
    lastRunAt: "",
    lastJobId: "",
    lastReportId: "",
    lastError: "",
    createdAt: now,
    updatedAt: now,
    pausedAt: ""
  };
  auditSchedules.set(schedule.id, schedule);
  return schedule;
}

function runDueLocalAuditSchedules(origin) {
  const now = new Date().toISOString();
  for (const schedule of [...auditSchedules.values()]
    .filter((item) => item.status === "active" && item.nextRunAt <= now)
    .sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt)))
    .slice(0, 5)) {
    const access = {
      ownerEmail: schedule.ownerEmail,
      sessionHash: schedule.ownerSessionHash,
      inviteId: schedule.ownerInviteId,
      accessMode: schedule.accessMode
    };
    if (localActiveAuditJobForTarget(access, schedule.targetUrl, [], [], {}, [], 0, schedule.maxPages || 10)) {
      schedule.lastError = "Skipped because an audit is already queued or running for this URL.";
      schedule.nextRunAt = isoDaysFromDate(now, 1);
      schedule.updatedAt = now;
      continue;
    }
    const job = createLocalAuditJob(access, schedule.targetUrl, schedule.maxPages, { scheduleId: schedule.id });
    schedule.lastRunAt = now;
    schedule.lastJobId = job.id;
    schedule.lastError = "";
    schedule.updatedAt = now;
    processLocalAuditJob(job.id, origin);
  }
}

function processLocalAuditJob(jobId, origin) {
  const job = auditJobs.get(jobId);
  if (!job || job.status !== "queued") return;

  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  setTimeout(async () => {
    try {
      const report = await auditUrl(job.targetUrl, {
        maxPages: normalizeCrawlLimit(job.maxPages || 10),
        competitorUrls: job.competitorUrls || [],
        backlinkRows: job.backlinkRows || [],
        localSeo: job.localSeo || {},
        keywordRows: job.keywordRows || [],
        renderedCrawlTarget: job.renderedCrawlTarget || 0
      });
      const saved = saveLocalReportWithOrigin(report, origin, {
        ownerEmail: job.ownerEmail,
        accessMode: job.accessMode,
        sessionHash: job.ownerSessionHash,
        inviteId: job.ownerInviteId || null
      });
      const completedAt = new Date().toISOString();
      job.status = "completed";
      job.reportId = saved.id;
      job.error = "";
      job.completedAt = completedAt;
      job.updatedAt = completedAt;
      if (job.scheduleId) {
        const schedule = auditSchedules.get(job.scheduleId);
        if (schedule) {
          schedule.lastReportId = saved.id;
          schedule.lastError = "";
          schedule.nextRunAt = isoDaysFromDate(completedAt, schedule.intervalDays || 7);
          schedule.updatedAt = completedAt;
        }
      }
      deliverLocalApiWebhooks(job.ownerEmail, "audit.completed", {
        audit: localApiAuditResponse(job),
        report: apiReportResponse(saved)
      }).catch(() => {});
    } catch (error) {
      const completedAt = new Date().toISOString();
      job.status = "failed";
      job.error = cleanText(error?.message || "The audit failed. Try another URL.", 260);
      job.completedAt = completedAt;
      job.updatedAt = completedAt;
      if (job.scheduleId) {
        const schedule = auditSchedules.get(job.scheduleId);
        if (schedule) {
          schedule.lastError = job.error;
          schedule.nextRunAt = isoDaysFromDate(completedAt, 1);
          schedule.updatedAt = completedAt;
        }
      }
      deliverLocalApiWebhooks(job.ownerEmail, "audit.failed", {
        audit: localApiAuditResponse(job),
        error: job.error
      }).catch(() => {});
    }
  }, 0);
}

function localAuditJobResponse(job = {}) {
  return {
    id: job.id || "",
    status: job.status || "queued",
    targetUrl: job.targetUrl || "",
    targetHost: job.targetHost || safeHost(job.targetUrl || ""),
    competitorUrls: job.competitorUrls || [],
    backlinkRowsCount: (job.backlinkRows || []).length,
    localSeoInput: localSeoInputSummary(job.localSeo || {}),
    keywordRowsInput: keywordRowsSummary(job.keywordRows || []),
    renderedCrawlTarget: renderedCrawlTargetSummary(job.renderedCrawlTarget || 0),
    maxPages: Number(job.maxPages || 10),
    crawlDepth: crawlDepthSummary(job.maxPages || 10),
    reportId: job.reportId || "",
    scheduleId: job.scheduleId || "",
    reportPath: job.reportId ? `/beta/reports/${job.reportId}` : "",
    error: job.error || "",
    createdAt: job.createdAt || "",
    updatedAt: job.updatedAt || "",
    startedAt: job.startedAt || "",
    completedAt: job.completedAt || "",
    expiresAt: job.expiresAt || ""
  };
}

async function createLocalLargeRenderedCrawl(body = {}, access = {}, options = {}) {
  if (!access.ok) {
    return authResult(access, options.api);
  }
  const normalized = normalizeLargeRenderedCrawlRequest(body, body.url || body.targetUrl || body.target_url || "");
  if (!normalized.ok) {
    return { status: 400, body: { error: normalized.error || "Enter a valid public website URL." } };
  }
  const publicUrlCheck = publicAuditUrlStatus(normalized.targetUrl);
  if (!publicUrlCheck.ok) return { status: 400, body: { error: publicUrlCheck.error } };
  const authorization = localAuditAuthorizationStatus(access, normalized.targetUrl);
  if (!authorization.ok) {
    return {
      status: 403,
      body: {
        error: authorization.error,
        code: "SITE_VERIFICATION_REQUIRED",
        site: authorization.site
      }
    };
  }
  const existing = localActiveLargeRenderedCrawlForTarget(access, normalized.targetUrl);
  if (existing) {
    return {
      status: 202,
      body: options.api
        ? {
            ok: true,
            deduped: true,
            large_crawl: localApiLargeRenderedCrawlResponse(existing),
            large_crawl_id: existing.id,
            status_url: `/v1/large-crawls/${existing.id}`
          }
        : {
            ok: true,
            mode: "queued",
            deduped: true,
            largeCrawl: localLargeRenderedCrawlResponse(existing),
            largeCrawlId: existing.id,
            statusUrl: `/api/large-crawls/${existing.id}`
          }
    };
  }
  const activeCount = localActiveLargeRenderedCrawlCount(access);
  if (activeCount >= 1) {
    return {
      status: 429,
      body: {
        error: "You already have a large rendered crawl running. Wait for it to finish, retry, or cancel it before starting another.",
        code: "LARGE_CRAWL_ACTIVE_LIMIT"
      }
    };
  }
  const billing = localLargeCrawlBillingStatus(access);
  if (!billing.ok) return { status: billing.status, body: { error: billing.error, code: billing.code } };

  const inventory = await buildCrawlInventory(normalized.targetUrl, {
    includeUrls: true,
    maxUrls: normalized.targetPages,
    maxSitemaps: 25,
    fetcher: fetch,
    privateAddressResolver: resolvesToPrivateAddress
  });
  const created = createLargeRenderedCrawlJob({
    ownerEmail: access.ownerEmail,
    accessMode: access.accessMode || "self-serve",
    targetUrl: normalized.targetUrl,
    targetPages: normalized.targetPages,
    batchSize: normalized.batchSize,
    maxConcurrency: normalized.maxConcurrency,
    crawlDelayMs: normalized.crawlDelayMs,
    inventoryUrls: inventory.urls || [],
    seedUrls: normalized.seedUrls,
    idFactory: localLargeCrawlId
  });
  created.job.ownerSessionHash = access.sessionHash || "";
  created.job.ownerInviteId = access.inviteId || "";
  created.job.inventoryStatus = inventory.status || "empty";
  created.job.inventorySummary = inventory.summary || {};
  created.job.frontierIngestionStatus = localLargeCrawlFrontierIngestionStatus(created.frontierRows.length, normalized.targetPages, inventory);
  created.job.frontierStoredCount = created.frontierRows.length;
  created.job.incrementalMode = Boolean(body.incrementalMode || body.incremental_mode);
  created.job.previousCrawlJobId = created.job.incrementalMode
    ? latestLocalLargeRenderedCrawlForTarget(access, normalized.targetUrl)?.id || ""
    : "";
  created.job.crawlFingerprint = localLargeCrawlFingerprint(normalized.targetUrl, created.frontierRows);
  created.job.mergeStatus = "blocked";
  storeLocalLargeRenderedCrawl(created);
  await deliverLocalApiWebhooks(access.ownerEmail, "large_crawl.created", {
    large_crawl: localApiLargeRenderedCrawlResponse(created.job)
  }).catch(() => {});

	  return {
	    status: 202,
	    body: options.api
	      ? {
	          ok: true,
	          large_crawl: localApiLargeRenderedCrawlResponse(created.job),
	          large_crawl_id: created.job.id,
	          status_url: `/v1/large-crawls/${created.job.id}`
	        }
	      : {
	          ok: true,
	          mode: "queued",
	          largeCrawl: localLargeRenderedCrawlResponse(created.job),
	          largeCrawlId: created.job.id,
	          statusUrl: `/api/large-crawls/${created.job.id}`
	        }
	  };
	}

function storeLocalLargeRenderedCrawl(created = {}) {
  largeCrawlJobs.set(created.job.id, created.job);
  largeCrawlBatches.set(created.job.id, created.batches || []);
  largeCrawlFrontier.set(created.job.id, created.frontierRows || []);
  largeCrawlProofs.set(created.job.id, created.proofRows || []);
}

function localLargeRenderedCrawlsForOwner(access = {}) {
  return [...largeCrawlJobs.values()]
    .filter((job) => job.ownerEmail === access.ownerEmail && (!job.expiresAt || job.expiresAt > new Date().toISOString()))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((job) => ({ job }));
}

function localActiveLargeRenderedCrawlForTarget(access = {}, targetUrl = "") {
  return [...largeCrawlJobs.values()]
    .filter(
      (job) =>
        job.ownerEmail === access.ownerEmail &&
        job.targetUrl === targetUrl &&
        ["queued", "running", "retrying", "ready_to_merge"].includes(job.status) &&
        (!job.expiresAt || job.expiresAt > new Date().toISOString())
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

function localActiveLargeRenderedCrawlCount(access = {}) {
  return [...largeCrawlJobs.values()].filter(
    (job) =>
      job.ownerEmail === access.ownerEmail &&
      ["queued", "running", "retrying"].includes(job.status) &&
      (!job.expiresAt || job.expiresAt > new Date().toISOString())
  ).length;
}

function latestLocalLargeRenderedCrawlForTarget(access = {}, targetUrl = "") {
  return [...largeCrawlJobs.values()]
    .filter(
      (job) =>
        job.ownerEmail === access.ownerEmail &&
        job.targetUrl === targetUrl &&
        ["ready_to_merge", "completed"].includes(job.status) &&
        (!job.expiresAt || job.expiresAt > new Date().toISOString())
    )
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
}

function resolveLocalLargeRenderedCrawl(access = {}, id = "", options = {}) {
  if (!access.ok) return { ok: false, ...authResult(access, options.api), error: authResult(access, options.api).body.error };
  const job = largeCrawlJobs.get(id);
  if (!job || job.ownerEmail !== access.ownerEmail) {
    return { ok: false, status: 404, error: "Large crawl not found." };
  }
  return {
    ok: true,
    job,
    batches: largeCrawlBatches.get(job.id) || [],
    frontierRows: largeCrawlFrontier.get(job.id) || [],
    proofRows: largeCrawlProofs.get(job.id) || []
  };
}

function retryLocalLargeRenderedCrawl(access = {}, id = "", options = {}) {
  const resolved = resolveLocalLargeRenderedCrawl(access, id, options);
  if (!resolved.ok) return { status: resolved.status, body: { error: resolved.error } };
  const result = retryLargeRenderedCrawlFailures(resolved.job, resolved.batches, resolved.frontierRows);
  largeCrawlJobs.set(id, result.job);
  largeCrawlBatches.set(id, result.batches);
  largeCrawlFrontier.set(id, result.frontierRows);
  const response = options.api ? localApiLargeRenderedCrawlResponse(result.job) : localLargeRenderedCrawlResponse(result.job);
  return {
    status: 200,
    body: options.api
      ? { ok: true, retryable_batch_count: result.retryableBatchCount, large_crawl: response }
      : { ok: true, retryableBatchCount: result.retryableBatchCount, largeCrawl: response }
  };
}

function claimLocalLargeRenderedCrawlBatch(access = {}, id = "", options = {}) {
  const proofWriter = largeCrawlProofWriteStatus({ trustedRenderer: options.trustedRenderer });
  if (!proofWriter.ok) return { status: proofWriter.status, body: { error: proofWriter.error, code: proofWriter.code } };
  expireStaleLocalLargeCrawlLeases(id);
  const resolved = resolveLocalLargeRenderedCrawl(access, id, options);
  if (!resolved.ok) return { status: resolved.status, body: { error: resolved.error } };
  const claimed = claimNextLargeRenderedCrawlBatch(resolved.job, resolved.batches);
  if (!claimed.ok) return { status: 409, body: { error: claimed.error } };
  const now = new Date().toISOString();
  const batches = resolved.batches.map((batch) => (batch.id === claimed.batch.id ? claimed.batch : batch));
  const frontierRows = resolved.frontierRows.map((row) =>
    row.batchId === claimed.batch.id && ["queued", "failed"].includes(row.status)
      ? { ...row, status: "rendering", updatedAt: now }
      : row
  );
  largeCrawlJobs.set(id, claimed.job);
  largeCrawlBatches.set(id, batches);
  largeCrawlFrontier.set(id, frontierRows);
  const responseBatch = { ...claimed.batch, status: "running", leasedAt: claimed.batch.leasedAt || now, startedAt: claimed.batch.startedAt || now, updatedAt: now };
  const proofToken = localLargeCrawlProofLeaseToken(id, claimed.batch.id, responseBatch.leasedAt);
  const urls = frontierRows
    .filter((row) => row.batchId === claimed.batch.id && row.status === "rendering")
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));
  const response = localLargeRenderedCrawlResponse(claimed.job);
  const trustedProofWriter = Boolean(options.trustedProofWriter);
  const apiClaimBody = {
    ok: true,
    large_crawl: localApiLargeRenderedCrawlResponse(claimed.job),
    batch: localApiLargeCrawlBatchResponse(responseBatch),
    urls: urls.map(localApiLargeCrawlFrontierResponse)
  };
  const betaClaimBody = {
    ok: true,
    largeCrawl: response,
    batch: responseBatch,
    urls
  };
  if (trustedProofWriter) {
    apiClaimBody.proof_url = `/v1/large-crawls/${id}/batches/${claimed.batch.id}/proof`;
    betaClaimBody.proofUrl = `/api/large-crawls/${id}/batches/${claimed.batch.id}/proof`;
    if (proofToken) {
      apiClaimBody.proof_token = proofToken;
      betaClaimBody.proofToken = proofToken;
    }
  }
  return {
    status: 200,
    body: options.api ? apiClaimBody : betaClaimBody
  };
}

async function processLocalLargeRenderedCrawlBatch(access = {}, id = "", body = {}, options = {}) {
  const claimedResult = claimLocalLargeRenderedCrawlBatch(access, id, options);
  if (claimedResult.status !== 200) return claimedResult;
  const claimedBatch = options.api ? claimedResult.body.batch : claimedResult.body.batch;
  const batchId = claimedBatch.batch_id || claimedBatch.id;
  refreshLocalLargeCrawlBatchLease(id, batchId);
  const urls = (options.api ? claimedResult.body.urls : claimedResult.body.urls || [])
    .slice(0, Math.min(Math.max(Number(body.limit || 10), 1), 1000));
  deferUnprocessedLocalLargeCrawlUrls(id, batchId, urls);
  const pages = [];
  const failures = [];
  for (const row of urls) {
    const url = row.url;
    try {
      const report = await auditUrl(url, {
        maxPages: 1,
        pageSpeed: false,
        crawlInventoryMaxUrls: 1,
        renderedCrawlTarget: 0
      });
      const page = report.pages?.[0];
      if (!page) throw new Error("No rendered page proof was returned.");
      pages.push({ ...page, frontierId: row.frontier_id || row.id });
    } catch (error) {
      failures.push({
        frontierId: row.frontier_id || row.id,
        url,
        error: cleanText(error?.message || "Rendered proof failed.", 500)
      });
    }
    refreshLocalLargeCrawlBatchLease(id, batchId);
  }
  refreshLocalLargeCrawlBatchLease(id, batchId);
  const saved = saveLocalLargeRenderedCrawlBatchProof(access, id, batchId, { pages, failures }, {
    ...options,
    trustedRenderer: true
  });
  if (saved.status !== 200) return saved;
  return {
    status: 200,
    body: options.api
      ? { ...saved.body, processed_url_count: pages.length + failures.length, rendered_count: pages.length, failed_count: failures.length }
      : { ...saved.body, processedUrlCount: pages.length + failures.length, renderedCount: pages.length, failedCount: failures.length }
  };
}

function refreshLocalLargeCrawlBatchLease(id = "", batchId = "") {
  if (!id || !batchId) return;
  const now = new Date().toISOString();
  largeCrawlBatches.set(id, (largeCrawlBatches.get(id) || []).map((batch) =>
    batch.id === batchId && batch.status === "running"
      ? { ...batch, leasedAt: now, updatedAt: now }
      : batch
  ));
}

function expireStaleLocalLargeCrawlLeases(id = "") {
  const batches = largeCrawlBatches.get(id) || [];
  const staleBefore = Date.now() - LARGE_RENDERED_CRAWL_LEASE_MS;
  const staleBatchIds = batches
    .filter((batch) => batch.status === "running" && batch.leasedAt && Date.parse(batch.leasedAt) < staleBefore)
    .map((batch) => batch.id);
  if (!staleBatchIds.length) return;
  const now = new Date().toISOString();
  const staleSet = new Set(staleBatchIds);
  largeCrawlBatches.set(id, batches.map((batch) =>
    staleSet.has(batch.id)
      ? { ...batch, status: "queued", leasedAt: "", error: "", updatedAt: now }
      : batch
  ));
  largeCrawlFrontier.set(id, (largeCrawlFrontier.get(id) || []).map((row) =>
    staleSet.has(row.batchId) && row.status === "rendering"
      ? { ...row, status: "queued", updatedAt: now }
      : row
  ));
}

function localLargeCrawlFrontierIngestionStatus(frontierCount = 0, targetPages = 0, inventory = {}) {
  const stored = Number(frontierCount || 0);
  if (!stored) return "empty";
  if (stored >= Number(targetPages || 0)) return "complete";
  return inventory.summary?.truncated ? "partial" : "complete";
}

function deferUnprocessedLocalLargeCrawlUrls(id = "", batchId = "", processingRows = []) {
  const processingIds = new Set(
    processingRows
      .map((row) => row.frontier_id || row.frontierId || row.id || "")
      .filter(Boolean)
  );
  const now = new Date().toISOString();
  largeCrawlFrontier.set(id, (largeCrawlFrontier.get(id) || []).map((row) =>
    row.batchId === batchId && row.status === "rendering" && !processingIds.has(row.id)
      ? { ...row, status: "queued", updatedAt: now }
      : row
  ));
}

function saveLocalLargeRenderedCrawlBatchProof(access = {}, id = "", batchId = "", body = {}, options = {}) {
  const proofWriter = largeCrawlProofWriteStatus({ trustedRenderer: options.trustedRenderer });
  if (!proofWriter.ok) return { status: proofWriter.status, body: { error: proofWriter.error, code: proofWriter.code } };
  const resolved = resolveLocalLargeRenderedCrawl(access, id, options);
  if (!resolved.ok) return { status: resolved.status, body: { error: resolved.error } };
  const batch = resolved.batches.find((item) => item.id === batchId);
  if (!batch) return { status: 404, body: { error: "Large crawl batch not found." } };
  if (!localLargeCrawlBatchLeaseIsActive(batch) && !localLargeCrawlProofLeaseTokenIsValid(body, id, batch)) {
    return {
      status: 409,
      body: { error: "Large crawl batch does not have an active renderer lease.", code: "ACTIVE_RENDERER_LEASE_REQUIRED" }
    };
  }
  const now = new Date().toISOString();
  const pages = Array.isArray(body.pages) ? body.pages : [];
  const failures = Array.isArray(body.failures) ? body.failures : [];
  let frontierRows = resolved.frontierRows;
  let proofRows = resolved.proofRows;

  for (const page of pages) {
    const frontierRow = findLargeCrawlFrontierRow(frontierRows, batchId, page);
    if (!frontierRow || frontierRow.status !== "rendering") continue;
    const proof = largeRenderedCrawlProofFromPage(resolved.job, batch, frontierRow, page, now);
    proofRows = [...proofRows.filter((row) => row.frontierId !== frontierRow.id), proof];
    frontierRows = frontierRows.map((row) =>
      row.id === frontierRow.id
        ? { ...row, status: "rendered", lastError: "", updatedAt: now }
        : row
    );
  }

  for (const failure of failures) {
    const frontierRow = findLargeCrawlFrontierRow(frontierRows, batchId, failure);
    if (!frontierRow || frontierRow.status !== "rendering") continue;
    const retryCount = Number(frontierRow.retryCount || 0) + 1;
    const lastError = cleanText(failure.error || failure.message || "Rendered proof failed.", 500);
    frontierRows = frontierRows.map((row) =>
      row.id === frontierRow.id
        ? { ...row, status: "failed", retryCount, lastError, updatedAt: now }
        : row
    );
    if (retryCount >= LARGE_RENDERED_CRAWL_MAX_RETRIES) {
      largeCrawlDeadLetters.push({
        id: localLargeCrawlId("lcd"),
        crawlJobId: id,
        batchId,
        frontierId: frontierRow.id,
        url: frontierRow.url,
        error: lastError,
        retryCount,
        status: "open",
        createdAt: now,
        resolvedAt: ""
      });
    }
  }

  const completed = completeLargeRenderedCrawlBatch(resolved.job, batch, resolved.batches, frontierRows, proofRows, now);
  const pendingRows = frontierRows.filter((row) => row.batchId === batch.id && ["queued", "rendering"].includes(row.status)).length;
  const completedBatch = pendingRows
    ? {
        ...completed.batch,
        status: completed.batch.failedUrlCount ? "failed" : "running",
        completedAt: "",
        error: completed.batch.failedUrlCount ? completed.batch.error : ""
      }
    : completed.batch;
  const batches = resolved.batches.map((item) => (item.id === batch.id ? completedBatch : item));
  const progress = largeRenderedCrawlResponse(completed.job, batches, frontierRows, proofRows).progress;
  const job = {
    ...completed.job,
    completedBatchCount: progress.completedBatches,
    failedUrlCount: progress.failedUrlCount,
    renderedUrlCount: progress.renderedUrlCount,
    status: progress.readyToMerge ? "ready_to_merge" : completed.job.status,
    mergeStatus: progress.readyToMerge ? "ready" : "blocked"
  };
  largeCrawlJobs.set(id, job);
  largeCrawlBatches.set(id, batches);
  largeCrawlFrontier.set(id, frontierRows);
  largeCrawlProofs.set(id, proofRows);
  if (job.status === "ready_to_merge") {
    deliverLocalApiWebhooks(job.ownerEmail, "large_crawl.ready_to_merge", {
      large_crawl: localApiLargeRenderedCrawlResponse(job)
    }).catch(() => {});
  }
  return {
    status: 200,
    body: options.api
      ? { ok: true, large_crawl: localApiLargeRenderedCrawlResponse(job), batch: localApiLargeCrawlBatchResponse(completedBatch) }
      : { ok: true, largeCrawl: localLargeRenderedCrawlResponse(job), batch: completedBatch }
  };
}

function markLocalLargeRenderedCrawlReadyToMerge(access = {}, id = "", options = {}) {
  const resolved = resolveLocalLargeRenderedCrawl(access, id, options);
  if (!resolved.ok) return { status: resolved.status, body: { error: resolved.error } };
  const readiness = largeRenderedCrawlMergeReadiness(resolved.job, resolved.batches, resolved.frontierRows, resolved.proofRows);
  if (!readiness.ready) {
    return {
      status: 409,
      body: options.api
        ? { error: "Large crawl cannot merge yet.", blockers: readiness.blockers, progress: readiness.progress }
        : { error: "Large crawl cannot merge yet.", blockers: readiness.blockers, progress: readiness.progress }
    };
  }
  const now = new Date().toISOString();
  const job = {
    ...resolved.job,
    status: "ready_to_merge",
    mergeStatus: "ready",
    updatedAt: now
  };
  largeCrawlJobs.set(id, job);
  return {
    status: 200,
    body: options.api
      ? { ok: true, status: "ready_to_merge", large_crawl: localApiLargeRenderedCrawlResponse(job) }
      : { ok: true, status: "ready_to_merge", largeCrawl: localLargeRenderedCrawlResponse(job) }
  };
}

function localLargeRenderedCrawlResponse(job = {}) {
  const batches = largeCrawlBatches.get(job.id) || [];
  const frontierRows = largeCrawlFrontier.get(job.id) || [];
  const proofRows = largeCrawlProofs.get(job.id) || [];
  return {
    ...largeRenderedCrawlResponse(job, batches, frontierRows, proofRows),
    inventory: {
      status: job.inventoryStatus || "",
      summary: job.inventorySummary || {}
    },
    incrementalMode: Boolean(job.incrementalMode),
    previousCrawlJobId: job.previousCrawlJobId || "",
    crawlFingerprint: job.crawlFingerprint || "",
    frontierIngestionStatus: job.frontierIngestionStatus || "pending",
    frontierStoredCount: Number(job.frontierStoredCount || frontierRows.length || 0),
    mergeStatus: job.mergeStatus || "blocked",
    mergeReadiness: largeRenderedCrawlMergeReadiness(job, batches, frontierRows, proofRows),
    deadLetterCount: largeCrawlDeadLetters.filter((row) => row.crawlJobId === job.id && row.status === "open").length
  };
}

function localApiLargeRenderedCrawlResponse(job = {}) {
  const response = localLargeRenderedCrawlResponse(job);
  return {
    large_crawl_id: response.id,
    status: response.status,
    url: response.targetUrl,
    target_host: response.targetHost,
    target_pages: response.targetPages,
    batch_size: response.batchSize,
    max_concurrency: response.maxConcurrency,
    crawl_delay_ms: response.crawlDelayMs,
    max_retries: response.maxRetries,
    progress: response.progress,
    batches: response.batches.map(localApiLargeCrawlBatchResponse),
    sample_frontier: response.sampleFrontier.map(localApiLargeCrawlFrontierResponse),
    sample_proof: response.sampleProof,
    inventory: response.inventory,
    incremental_mode: response.incrementalMode,
    previous_crawl_job_id: response.previousCrawlJobId,
    crawl_fingerprint: response.crawlFingerprint,
    frontier_ingestion_status: response.frontierIngestionStatus,
    frontier_stored_count: response.frontierStoredCount,
    merge_status: response.mergeStatus,
    merge_readiness: response.mergeReadiness,
    dead_letter_count: response.deadLetterCount,
    report_id: response.reportId,
    error: response.error,
    created_at: response.createdAt,
    updated_at: response.updatedAt,
    started_at: response.startedAt,
    completed_at: response.completedAt,
    expires_at: response.expiresAt
  };
}

function localApiLargeCrawlBatchResponse(batch = {}) {
  return {
    batch_id: batch.id || "",
    batch_index: Number(batch.batchIndex || batch.batch_index || 0),
    start_index: Number(batch.startIndex || batch.start_index || 0),
    end_index: Number(batch.endIndex || batch.end_index || 0),
    planned_url_count: Number(batch.plannedUrlCount || batch.planned_url_count || 0),
    rendered_url_count: Number(batch.renderedUrlCount || batch.rendered_url_count || 0),
    failed_url_count: Number(batch.failedUrlCount || batch.failed_url_count || 0),
    status: batch.status || "queued",
    retry_count: Number(batch.retryCount || batch.retry_count || 0),
    error: batch.error || "",
    updated_at: batch.updatedAt || batch.updated_at || ""
  };
}

function localApiLargeCrawlFrontierResponse(row = {}) {
  return {
    frontier_id: row.id || "",
    batch_id: row.batchId || row.batch_id || "",
    url: row.url || "",
    status: row.status || "queued",
    retry_count: Number(row.retryCount || row.retry_count || 0),
    last_error: row.lastError || row.last_error || ""
  };
}

function findLargeCrawlFrontierRow(frontierRows = [], batchId = "", input = {}) {
  const wantedId = input.frontierId || input.frontier_id || "";
  const wantedUrl = canonicalLargeCrawlProofUrl(input.url || input.targetUrl || input.target_url || "");
  if (!wantedId && !wantedUrl) return null;
  return frontierRows.find((row) => {
    if (row.batchId !== batchId) return false;
    if (wantedId && row.id !== wantedId) return false;
    if (wantedUrl && canonicalLargeCrawlProofUrl(row.url) !== wantedUrl) return false;
    return true;
  }) || null;
}

function localLargeCrawlBatchLeaseIsActive(batch = {}, nowMs = Date.now()) {
  if (batch.status !== "running" || !batch.leasedAt) return false;
  const leasedAt = Date.parse(batch.leasedAt);
  return Number.isFinite(leasedAt) && leasedAt >= nowMs - LARGE_RENDERED_CRAWL_LEASE_MS;
}

function localLargeCrawlProofLeaseToken(jobId = "", batchId = "", leasedAt = "") {
  const secret = String(process.env.SEOFIXKIT_LARGE_CRAWL_WORKER_TOKEN || "").trim();
  if (!secret || !jobId || !batchId || !leasedAt) return "";
  return sha256Hex(`${secret}:${jobId}:${batchId}:${leasedAt}`);
}

function localLargeCrawlProofLeaseTokenIsValid(body = {}, jobId = "", batch = {}) {
  if (batch.status !== "running") return false;
  const supplied = String(body.proofToken || body.proof_token || "").trim();
  if (!supplied) return false;
  return constantTimeEqual(supplied, localLargeCrawlProofLeaseToken(jobId, batch.id, batch.leasedAt));
}

function authResult(access = {}, api = false) {
  return {
    status: access.status || 401,
    body: { error: access.error || (api ? "API key required." : "Private beta session required.") }
  };
}

function localLargeCrawlBillingStatus(access = {}) {
  if (access.accessMode === "founder-override") return { ok: true };
  if (process.env.SEOFIXKIT_LARGE_CRAWL_ENABLED === "true") return { ok: true };
  return {
    ok: false,
    status: 402,
    code: "LARGE_CRAWL_PLAN_REQUIRED",
    error: "Large rendered crawls require an enabled large-crawl plan before browser workers run."
  };
}

function localLargeCrawlId(prefix = "lc") {
  return `${prefix}_${randomUUID()}`;
}

function localLargeCrawlFingerprint(targetUrl = "", frontierRows = []) {
  const hash = createHash("sha256");
  hash.update(targetUrl);
  for (const row of (frontierRows || []).slice(0, 50000)) {
    hash.update("\n");
    hash.update(row.normalizedUrl || row.url || "");
  }
  return hash.digest("hex");
}

function localAuditScheduleResponse(schedule = {}) {
  return {
    id: schedule.id || "",
    status: schedule.status || "active",
    targetUrl: schedule.targetUrl || "",
    targetHost: schedule.targetHost || safeHost(schedule.targetUrl || ""),
    maxPages: Number(schedule.maxPages || 10),
    intervalDays: Number(schedule.intervalDays || 7),
    cadenceLabel: scheduleCadenceLabel(schedule.intervalDays || 7),
    nextRunAt: schedule.nextRunAt || "",
    lastRunAt: schedule.lastRunAt || "",
    lastJobId: schedule.lastJobId || "",
    lastReportId: schedule.lastReportId || "",
    lastReportPath: schedule.lastReportId ? `/beta/reports/${schedule.lastReportId}` : "",
    lastError: schedule.lastError || "",
    createdAt: schedule.createdAt || "",
    updatedAt: schedule.updatedAt || "",
    pausedAt: schedule.pausedAt || ""
  };
}

function createLocalApiAudit(req, access) {
  let normalized = "";
  try {
    normalized = normalizeUrl(req.body?.url || req.body?.targetUrl || "");
  } catch {
    return { status: 400, body: { error: "Enter a valid public website URL." } };
  }
  const urlCheck = publicAuditUrlStatus(normalized);
  if (!urlCheck.ok) {
    return { status: 400, body: { error: urlCheck.error } };
  }
  const authorization = localAuditAuthorizationStatus(access, normalized);
  if (!authorization.ok) {
    return {
      status: 403,
      body: {
        error: authorization.error,
        code: "SITE_VERIFICATION_REQUIRED",
        site: authorization.site
      }
    };
  }
  const competitorInput = parseAuditCompetitorUrls(req.body || {}, normalized);
  if (!competitorInput.ok) {
    return { status: 400, body: { error: competitorInput.error } };
  }
  const competitorUrls = competitorInput.urls;
  const backlinkInput = parseBacklinkRows(req.body || {}, normalized, { allowPrivate: false });
  if (!backlinkInput.ok) {
    return { status: 400, body: { error: backlinkInput.error } };
  }
  const backlinkRows = backlinkInput.rows;
  const localSeoInput = parseLocalSeoInput(req.body || {}, normalized, { allowPrivate: false });
  if (!localSeoInput.ok) {
    return { status: 400, body: { error: localSeoInput.error } };
  }
  const localSeo = localSeoInput.input;
  const keywordInput = parseKeywordRows(req.body || {}, normalized, { allowPrivate: false });
  if (!keywordInput.ok) {
    return { status: 400, body: { error: keywordInput.error } };
  }
  const keywordRows = keywordInput.rows;
  const renderedCrawlTarget = normalizeRenderedCrawlTarget(
    req.body?.rendered_crawl_target || req.body?.renderedCrawlTarget || req.body?.crawlScaleTarget || 0
  );
  const maxPages = normalizeCrawlLimit(req.body?.max_pages || req.body?.maxPages || 10);
  const existingJob = localActiveAuditJobForTarget(access, normalized, competitorUrls, backlinkRows, localSeo, keywordRows, renderedCrawlTarget, maxPages);
  if (existingJob) {
    return {
      status: 202,
      body: {
        ok: true,
        deduped: true,
        audit: localApiAuditResponse(existingJob),
        audit_id: existingJob.id,
        status_url: `/v1/audits/${existingJob.id}`
      }
    };
  }
  const activeCount = localActiveAuditJobCount(access);
  if (activeCount >= 3) {
    return {
      status: 429,
      body: {
        error: "You already have 3 audits running. Wait for one to finish before starting another.",
        code: "AUDIT_JOBS_ACTIVE_LIMIT"
      }
    };
  }
  const job = createLocalAuditJob(access, normalized, maxPages, { competitorUrls, backlinkRows, localSeo, keywordRows, renderedCrawlTarget });
  const origin = `http://${req.get("host")}`;
  setTimeout(() => processLocalAuditJob(job.id, origin), 0);
  return {
    status: 202,
    body: {
      ok: true,
      audit: localApiAuditResponse(job),
      audit_id: job.id,
      status_url: `/v1/audits/${job.id}`,
      estimated_completion: isoSecondsFromNow(5 * 60)
    }
  };
}

function localApiAuditResponse(job = {}) {
  return {
    audit_id: job.id || "",
    status: apiAuditStatus(job.status),
    url: job.targetUrl || "",
    target_host: job.targetHost || safeHost(job.targetUrl || ""),
    competitor_urls: job.competitorUrls || [],
    backlink_rows_count: (job.backlinkRows || []).length,
    local_seo_input: localSeoInputSummary(job.localSeo || {}),
    keyword_rows_input: keywordRowsSummary(job.keywordRows || []),
    rendered_crawl_target: renderedCrawlTargetSummary(job.renderedCrawlTarget || 0),
    max_pages: Number(job.maxPages || 10),
    crawl_depth: crawlDepthSummary(job.maxPages || 10),
    report_id: job.reportId || "",
    report_url: job.reportId ? `/v1/audits/${job.id}/report` : "",
    issues_url: job.reportId ? `/v1/audits/${job.id}/issues` : "",
    error: job.error || "",
    created_at: job.createdAt || "",
    updated_at: job.updatedAt || "",
    started_at: job.startedAt || "",
    completed_at: job.completedAt || ""
  };
}

function resolveLocalApiAudit(access, id) {
  const job = auditJobs.get(id);
  if (job && job.ownerEmail !== access.ownerEmail) {
    return { ok: false, status: 404, error: "Audit not found." };
  }
  const reportId = job?.reportId || id;
  const report = auditReports.get(reportId);
  if (!report || report.owner?.email !== access.ownerEmail) {
    if (job && ["queued", "running"].includes(job.status)) {
      return { ok: false, status: 409, error: "Audit is still running." };
    }
    if (job && job.status === "failed") {
      return { ok: false, status: 409, error: job.error || "Audit failed." };
    }
    return { ok: false, status: 404, error: "Report not found." };
  }
  return { ok: true, job, report };
}

function apiIssueResponse(finding = {}, repairQueueItem = null, options = {}) {
  const repairQueue = repairQueueItem ? apiRepairQueueStatusResponse(repairQueueItem) : null;
  if (repairQueue) repairQueue.unavailable = Boolean(options.repairQueueUnavailable);
  return {
    id: finding.id || "",
    severity: finding.severity || "notice",
    title: finding.title || "",
    page_url: finding.pageUrl || "",
    page_label: finding.pageLabel || "",
    evidence: finding.evidence || "",
    why: finding.why || "",
    fix: finding.fix || "",
    acceptance: finding.acceptance || "",
    confidence: finding.confidence || "verified",
    source: finding.source || "",
    repair_queue: repairQueue
  };
}

function apiReportResponse(report = {}, options = {}) {
  const repairQueueItems = Array.isArray(options.repairQueueItems) ? options.repairQueueItems : [];
  const repairQueueUnavailable = Boolean(options.repairQueueUnavailable);
  const queueByIssue = new Map(repairQueueItems.map((item) => [item.issueId, item]));
  const repairQueue = repairQueueItems.length
    ? { ...apiRepairQueueSummary(repairQueueItems), unavailable: repairQueueUnavailable }
    : repairQueueUnavailable
      ? { ...apiRepairQueueSummary([]), unavailable: true }
      : null;
  return {
    id: report.id || "",
    url: report.url || "",
    score: report.score || 0,
    summary: report.summary || {},
    crawl_depth: report.crawlDepth || crawlDepthSummary(report.summary?.maxPages || 10),
    crawl_inventory: report.crawlInventory || null,
    rendered_crawl_scale: report.renderedCrawlScale || null,
    crawl_intelligence: report.crawlIntelligence || null,
    report_delta: report.reportDelta || null,
    performance: report.performance || null,
    resource_waterfall: report.resourceWaterfall || report.pages?.[0]?.resourceWaterfall || null,
    competitor_benchmark: report.competitorBenchmark || null,
    backlink_audit: report.backlinkAudit || null,
    local_seo_audit: report.localSeoAudit || null,
    keyword_rank_audit: report.keywordRankAudit || null,
    platform_seo_audit: report.platformSeoAudit || null,
    ai_answer_readiness: report.aiAnswerReadiness || null,
    growth_opportunities: report.growthOpportunities || null,
    findings: (report.findings || []).map((finding) => apiIssueResponse(finding, queueByIssue.get(finding.id), {
      repairQueueUnavailable
    })),
    repair_queue: repairQueue,
    repair_plan: report.repairPlan || [],
    repair_brief: report.repairBrief || "",
    pages: report.pages || [],
    report_path: report.reportPath || "",
    report_url: report.reportUrl || "",
    created_at: report.scannedAt || report.createdAt || "",
    expires_at: report.retention?.expiresAt || ""
  };
}

function localApiRepairQueueOverlay(access = {}, report = {}) {
  const items = access.ownerEmail ? ensureLocalRepairQueueRows(access, report) : deriveRepairQueueItems(report, [], []);
  return {
    items,
    byIssue: new Map(items.map((item) => [item.issueId, item])),
    unavailable: false
  };
}

function localFixPackRepairSelection(report = {}, body = {}) {
  const { items } = localApiRepairQueueOverlay({ ownerEmail: report.owner?.email || report.ownerEmail || "" }, report);
  const selection = selectFixPackRepair(items, body);
  return {
    selectedRepair: selection.selectedRepair,
    selectionConflict: Boolean(selection.conflict)
  };
}

function apiProjectResponse(claim = {}) {
  return {
    id: claim.id || "",
    host: claim.host || "",
    status: claim.status || "pending",
    verification_method: claim.verificationMethod || "",
    verified_at: claim.verifiedAt || "",
    created_at: claim.createdAt || "",
    updated_at: claim.updatedAt || "",
    verification: siteClaimInstructions(claim)
  };
}

function apiAuditStatus(status = "") {
  if (status === "completed") return "complete";
  return status || "queued";
}

function saveLocalReport(report, req, access) {
  const origin = `http://${req.get("host")}`;
  return saveLocalReportWithOrigin(report, origin, access);
}

function saveLocalReportWithOrigin(report, origin, access) {
  const id = makePrivateReportId(report.url);
  const expiresAt = isoDaysFromNow(REPORT_RETENTION_DAYS);
  const previousReport = latestLocalReportForDelta(report, access);
  const reportDelta = buildReportDelta(report, previousReport);
  const saved = {
    ...report,
    id,
    reportPath: `/beta/reports/${id}`,
    reportUrl: `${origin}/beta/reports/${id}`,
    reportDelta,
    repairBrief: appendReportDeltaBrief(report.repairBrief || "", reportDelta),
    owner: {
      email: access.ownerEmail
    },
    retention: {
      expiresAt,
      days: REPORT_RETENTION_DAYS
    }
  };
  auditReports.set(id, saved);
  return saved;
}

function latestLocalReportForDelta(report = {}, access = {}) {
  const targetHost = safeHost(report.url || "");
  if (!targetHost || !access.ownerEmail) return null;
  const now = new Date().toISOString();
  return [...auditReports.values()]
    .filter((item) => {
      if (item.owner?.email !== access.ownerEmail) return false;
      if (safeHost(item.url || "") !== targetHost) return false;
      if (item.retention?.expiresAt && item.retention.expiresAt <= now) return false;
      return true;
    })
    .sort((a, b) => String(b.scannedAt || b.createdAt || "").localeCompare(String(a.scannedAt || a.createdAt || "")))[0] || null;
}

function summarizeIssuePatterns(reports) {
  const counts = new Map();
  for (const report of reports) {
    for (const finding of report.findings || []) {
      if (finding.severity === "good") continue;
      const title = String(finding.title || "Unknown issue").replace(/\son\s(home|\/[^\s]+)/i, "").trim();
      const current = counts.get(title) || { title, count: 0, critical: 0, warnings: 0, notices: 0 };
      current.count += 1;
      if (finding.severity === "critical") current.critical += 1;
      if (finding.severity === "warning") current.warnings += 1;
      if (finding.severity === "notice") current.notices += 1;
      counts.set(title, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

function localFixRequestResponse(request) {
  return {
    id: request.id,
    status: request.status || "new",
    statusLabel: localFixRequestStatusLabel(request.status),
    targetUrl: request.targetUrl,
    targetHost: request.targetHost || safeHost(request.targetUrl),
    score: request.score,
    issueCount: request.issueCount,
    customerNote: request.customerNote || "",
    deliveryUrl: request.deliveryUrl || "",
    finalReportId: request.finalReportId || "",
    finalReportPath: request.finalReportId ? `/beta/reports/${request.finalReportId}` : "",
    inProgressAt: request.inProgressAt || "",
    deliveredAt: request.deliveredAt || "",
    paidAt: request.paidAt || "",
    dueAt: request.dueAt || "",
    nextUpdateAt: request.nextUpdateAt || "",
    statusReason: request.statusReason || "",
    isTest: Boolean(request.isTest),
    beforeAfterSummary: request.beforeAfterSummary || null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt || request.createdAt
  };
}

function localBillingFixRequestResponse(request) {
  return {
    ...localFixRequestResponse(request),
    reportId: request.reportId,
    reportPath: `/beta/reports/${request.reportId}`,
    briefPath: `/api/reports/${request.reportId}/brief.md`,
    deliveryReadiness: localCustomerDeliveryReadiness(request)
  };
}

function localAccountFixRequestResponse(request) {
  return {
    ...localFixRequestResponse(request),
    reportId: request.reportId,
    reportPath: `/beta/reports/${request.reportId}`,
    briefPath: `/api/reports/${request.reportId}/brief.md`
  };
}

function localBillingPaymentResponse(request) {
  const amountMinor = typeof request.paymentAmount === "number" ? request.paymentAmount : null;
  const refundAmountMinor = typeof request.refundAmount === "number" ? request.refundAmount : null;
  const type = request.refundedAt
    ? "refund"
    : request.disputeEvent
      ? "dispute"
      : request.status === "payment_failed"
        ? "failed_payment"
        : "payment";
  return {
    id: request.id,
    type,
    status: request.status || "",
    statusLabel: localFixRequestStatusLabel(request.status),
    displayReference: localBillingPaymentDisplayReference(type),
    amountMinor,
    currency: request.paymentCurrency || "",
    displayAmount: request.displayAmount || "",
    refundAmountMinor,
    refundCurrency: request.refundCurrency || "",
    displayRefundAmount: request.displayRefundAmount || "",
    targetHost: request.targetHost,
    targetUrl: request.targetUrl,
    reportPath: `/beta/reports/${request.reportId}`,
    paidAt: request.paidAt || "",
    refundedAt: request.refundedAt || "",
    disputedAt: request.disputedAt || "",
    createdAt: request.paidAt || request.refundedAt || request.disputedAt || request.updatedAt || request.createdAt || ""
  };
}

function localCustomerDeliveryReadiness(request = {}) {
  const status = request.status || "new";
  if (status === "delivered") {
    return {
      status: "delivered",
      readyForStart: true,
      readyForDelivery: true,
      blockers: []
    };
  }

  const paymentConfirmed = Boolean(
    request.paidAt ||
    request.paymentId ||
    ["paid", "in_progress", "delivered"].includes(status)
  );
  const deliverableStatus = ["paid", "in_progress"].includes(status);
  const blockers = [];
  if (!paymentConfirmed) blockers.push({ id: "payment_unconfirmed" });
  if (!deliverableStatus) blockers.push({ id: "status_not_deliverable" });
  if (deliverableStatus) blockers.push({ id: "proposal_state_unavailable" });
  if (!request.customerNote) blockers.push({ id: "customer_note_missing" });
  if (!request.deliveryUrl) blockers.push({ id: "delivery_link_missing" });
  if (!request.finalReportId) blockers.push({ id: "final_rerun_missing" });
  return {
    status: blockers.length ? "blocked" : "ready",
    readyForStart: deliverableStatus,
    readyForDelivery: blockers.length === 0,
    blockers
  };
}

function localBillingPaymentDisplayReference(type = "payment") {
  if (type === "refund") return "Dodo refund record";
  if (type === "dispute") return "Dodo dispute record";
  if (type === "failed_payment") return "Dodo payment attempt";
  return "Dodo payment record";
}

function localFixRequestAdminResponse(request) {
  return {
    ...localFixRequestResponse(request),
    reportId: request.reportId,
    ownerEmail: request.ownerEmail,
    assignedTo: request.assignedTo || "",
    adminNote: request.adminNote || "",
    reportPath: `/beta/reports/${request.reportId}`,
    briefPath: `/api/reports/${request.reportId}/brief.md`,
    notifications: []
  };
}

function countFixRequestStatuses(requests) {
  return requests.reduce((counts, request) => {
    counts[request.status || "new"] = (counts[request.status || "new"] || 0) + 1;
    return counts;
  }, {});
}

function localFixRequestStatusLabel(status) {
  const labels = {
    new: "Request saved",
    checkout_created: "Checkout opened",
    paid: "Payment confirmed",
    in_progress: "Repair in progress",
    delivered: "Delivered",
    payment_failed: "Payment failed",
    refunded: "Refunded",
    refund_failed: "Refund failed",
    disputed: "Disputed"
  };
  return labels[status] || labels.new;
}

function safeHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function stripUrlHash(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return String(value || "").split("#")[0];
  }
}

function canonicalLargeCrawlProofUrl(value = "") {
  const stripped = stripUrlHash(value);
  try {
    const url = new URL(stripped);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
    }
    return url.href;
  } catch {
    return String(stripped || "").replace(/\/+$/g, "");
  }
}

function makePrivateReportId(url) {
  const host = new URL(url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42)
    .toLowerCase();
  return `${host || "report"}-${randomUUID()}`;
}

function normalizeUrl(input) {
  const trimmed = String(input || "").trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  return url.href;
}

function cleanReportDomain(input) {
  let value = String(input || "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^https?:\/\//, "").split("/")[0].split("?")[0].split("#")[0].replace(/\.$/, "");
  value = value.split(":")[0];
  if (value.length < 4 || value.length > 253) return "";
  if (!value.includes(".")) return "";
  if (/[^a-z0-9.-]/.test(value)) return "";
  if (value.includes("..") || value.startsWith(".") || value.endsWith(".")) return "";
  if (value === "localhost" || value.endsWith(".localhost")) return "";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return "";
  if (value.endsWith(".internal") || value.endsWith(".invalid")) return "";
  return value;
}

function localAppHost(host = "") {
  const clean = cleanReportDomain(host);
  if (!clean) return true;
  const appHosts = new Set(
    [
      "127.0.0.1",
      "localhost",
      "seofixkit.com",
      "www.seofixkit.com",
      ...String(process.env.SEOFIXKIT_APP_HOSTS || "")
        .split(",")
        .map((value) => cleanReportDomain(value))
        .filter(Boolean)
    ]
  );
  return appHosts.has(clean) || clean.endsWith(".workers.dev");
}

function parseAuditCompetitorUrls(body = {}, targetUrl = "") {
  const input = body.competitorUrls ?? body.competitor_urls ?? body.competitors ?? "";
  const raw = Array.isArray(input)
    ? input
    : String(input || "")
        .split(/[\n,]+/)
        .map((value) => value.trim());
  const urls = [];
  const seen = new Set();
  const targetHost = normalizedHostname(targetUrl);

  for (const value of raw) {
    if (!value) continue;
    if (urls.length >= 5) break;
    let normalized = "";
    try {
      normalized = normalizeUrl(value);
    } catch {
      return { ok: false, error: "Enter valid competitor URLs, one per line." };
    }
    const urlCheck = publicAuditUrlStatus(normalized);
    if (!urlCheck.ok) {
      return { ok: false, error: `Competitor ${value}: ${urlCheck.error}` };
    }
    const host = normalizedHostname(normalized);
    if (!host || host === targetHost || seen.has(host)) continue;
    seen.add(host);
    urls.push(normalized);
  }

  return { ok: true, urls };
}

function normalizeCompetitorUrlsList(values = [], targetUrl = "") {
  const result = parseAuditCompetitorUrls({ competitorUrls: values }, targetUrl);
  return result.ok ? result.urls : [];
}

function competitorUrlsKey(values = []) {
  return normalizeCompetitorUrlsList(values).map(normalizedHostname).sort().join(",");
}

function normalizedHostname(value = "") {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function claimHostFromInput(input) {
  try {
    const url = new URL(normalizeUrl(String(input || "").trim()));
    const status = publicAuditUrlStatus(url.href);
    if (!status.ok) return "";
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function normalizeEmail(input) {
  const email = String(input || "").trim().toLowerCase();
  if (email.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function cleanAccessToken(input) {
  const token = String(input || "").trim();
  if (token.length < 32 || token.length > 160) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return "";
  return token;
}

function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanUrlText(input, maxLength) {
  const value = cleanText(input, maxLength);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href.slice(0, maxLength);
  } catch {
    return "";
  }
}

function cleanIsoDateText(input) {
  const value = cleanText(input, 80);
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isoSecondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isoDaysFromNow(days) {
  return isoSecondsFromNow(days * 24 * 60 * 60);
}

function isoDaysFromDate(value, days) {
  const start = new Date(value);
  const base = Number.isNaN(start.getTime()) ? Date.now() : start.getTime();
  return new Date(base + Number(days || 0) * 24 * 60 * 60 * 1000).toISOString();
}

function clampScheduleInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  if (parsed <= 7) return 7;
  if (parsed <= 14) return 14;
  return 30;
}

function scheduleCadenceLabel(value) {
  const days = clampScheduleInterval(value);
  if (days === 7) return "Weekly";
  if (days === 14) return "Every 2 weeks";
  return "Monthly";
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function publicAuditUrlStatus(value) {
  let parsed = null;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Enter a valid public website URL." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Only public http and https URLs can be audited." };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateHostname(host)
  ) {
    return { ok: false, error: "Use a public website URL, not a private or local address." };
  }

  return { ok: true };
}

function publicWebhookUrlStatus(value) {
  let parsed = null;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    return { ok: false, error: "Enter a valid HTTPS webhook URL." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Webhook URLs must use HTTPS." };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateHostname(host)
  ) {
    return { ok: false, error: "Use a public HTTPS webhook URL, not a private or local address." };
  }
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return { ok: true, url: parsed.href };
}

function localAuditAuthorizationStatus(access, targetUrl) {
  if (access.accessMode === "founder-override") return { ok: true };
  const host = safeHost(targetUrl);
  const claim = [...siteClaims.values()].find(
    (item) =>
      item.ownerEmail === access.ownerEmail &&
      item.host === host &&
      item.status === "verified" &&
      !item.revokedAt
  );
  if (claim) return { ok: true, site: siteClaimResponse(claim) };
  return {
    ok: false,
    error: `Verify ${host} before running a self-serve audit.`,
    site: siteClaimInstructions({ host, verificationToken: "" })
  };
}

function siteClaimResponse(claim = {}) {
  return {
    id: claim.id || "",
    host: claim.host || "",
    status: claim.status || "pending",
    verificationMethod: claim.verificationMethod || "",
    createdAt: claim.createdAt || "",
    updatedAt: claim.updatedAt || "",
    verifiedAt: claim.verifiedAt || "",
    lastCheckedAt: claim.lastCheckedAt || "",
    ...siteClaimInstructions(claim)
  };
}

function siteClaimInstructions(claim = {}) {
  const host = claim.host || "";
  const token = claim.verificationToken || "";
  const proof = token ? `seofixkit-site-verification=${token}` : "";
  return {
    dnsName: host ? `_seofixkit.${host}` : "",
    dnsType: "TXT",
    dnsValue: proof,
    filePath: "/.well-known/seofixkit.txt",
    fileUrl: host ? `https://${host}/.well-known/seofixkit.txt` : "",
    fileContents: proof
  };
}

function normalizeDnsTxt(value) {
  return String(value || "")
    .replace(/\\"/g, '"')
    .replaceAll('" "', "")
    .replaceAll('"', "")
    .trim();
}

function normalizeDnsHost(value) {
  return cleanReportDomain(String(value || "").replace(/\.$/, ""));
}

function cleanWebhookEvents(events = []) {
  const allowed = new Set([
    "audit.completed",
    "audit.failed",
    "large_crawl.created",
    "large_crawl.ready_to_merge",
    "repair_action.drafted",
    "repair_action.approved",
    "repair_action.applied",
    "repair_action.fixed",
    "repair_action.regressed"
  ]);
  const values = Array.isArray(events) ? events : [];
  const cleaned = values.filter((event) => allowed.has(String(event)));
  return cleaned.length ? [...new Set(cleaned)] : ["audit.completed", "audit.failed"];
}

function localWebhookSigningSecret(webhookId) {
  return `whsec_${createHmac("sha256", "local-seofixkit-webhooks").update(String(webhookId || "")).digest("hex").slice(0, 32)}`;
}

function localWebhookSignature(webhookId, timestamp, body) {
  return createHmac("sha256", localWebhookSigningSecret(webhookId))
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

async function deliverLocalApiWebhooks(ownerEmail, eventType, data = {}) {
  const webhooks = [...apiWebhooks.values()].filter(
    (webhook) =>
      webhook.ownerEmail === ownerEmail &&
      webhook.status === "active" &&
      (webhook.events || []).includes(eventType)
  );
  for (const webhook of webhooks) {
    const now = new Date().toISOString();
    const payload = {
      id: randomUUID(),
      event: eventType,
      created_at: now,
      data
    };
    const body = JSON.stringify(payload);
    const eventRecord = {
      id: payload.id,
      webhookId: webhook.id,
      ownerEmail,
      eventType,
      auditJobId: data.audit?.audit_id || "",
      reportId: data.audit?.report_id || data.report?.id || "",
      status: "pending",
      httpStatus: 0,
      error: "",
      payloadJson: body,
      createdAt: now,
      deliveredAt: ""
    };
    apiWebhookEvents.push(eventRecord);
    try {
      const webhookHost = new URL(webhook.url).hostname;
      if (await resolvesToPrivateAddress(webhookHost)) {
        throw new Error("Webhook host resolves to a private or internal address.");
      }
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await fetchLocalWebhook(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "SEO Fix Kit Webhooks/local",
          "x-seofixkit-event": eventType,
          "x-seofixkit-signature": `t=${timestamp},v1=${localWebhookSignature(webhook.id, timestamp, body)}`
        },
        body
      });
      const deliveredAt = new Date().toISOString();
      eventRecord.status = response.ok ? "delivered" : "failed";
      eventRecord.httpStatus = response.status;
      eventRecord.deliveredAt = deliveredAt;
      webhook.lastDeliveryAt = deliveredAt;
      webhook.lastDeliveryStatus = eventRecord.status;
      webhook.lastError = response.ok ? "" : `HTTP ${response.status}`;
      webhook.updatedAt = deliveredAt;
    } catch (error) {
      const deliveredAt = new Date().toISOString();
      eventRecord.status = "failed";
      eventRecord.error = cleanText(error?.message || "Webhook delivery failed.", 500);
      eventRecord.deliveredAt = deliveredAt;
      webhook.lastDeliveryAt = deliveredAt;
      webhook.lastDeliveryStatus = "failed";
      webhook.lastError = eventRecord.error;
      webhook.updatedAt = deliveredAt;
    }
  }
}

async function fetchLocalWebhook(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_WEBHOOK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Webhook delivery timed out after ${LOCAL_WEBHOOK_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isPrivateHostname(host) {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  return host === "::1" || host.startsWith("[") || host.endsWith(".invalid");
}

function constantTimeEqual(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  const maxLength = Math.max(leftText.length, rightText.length);
  let diff = leftText.length ^ rightText.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }

  return maxLength > 0 && diff === 0;
}

function resetLocalStateForTests() {
  auditReports.clear();
  auditJobs.clear();
  auditSchedules.clear();
  largeCrawlJobs.clear();
  largeCrawlBatches.clear();
  largeCrawlFrontier.clear();
  largeCrawlProofs.clear();
  largeCrawlDeadLetters.length = 0;
  betaSessions.clear();
  accessTokens.clear();
  apiTokens.clear();
  apiWebhooks.clear();
  apiWebhookEvents.length = 0;
  reportBrandingProfiles.clear();
  reportShareLinks.clear();
  reportDomains.clear();
  teamMembers.clear();
  issueCollaborations.clear();
  localRepairQueueRows.clear();
  localRepairActionRows.clear();
  siteClaims.clear();
  fixRequests.length = 0;
}

function seedProtectedLocalAuditForTests({
  ownerEmail = "owner@example.com",
  status = "paid",
  url = "https://example.com/",
  findingPageUrl = url,
  findings = null,
  reportDelta = null
} = {}) {
  const access = {
    ok: true,
    ownerEmail,
    accessMode: "founder-override",
    sessionHash: "test-session"
  };
  const token = createLocalApiToken(access, "Smoke test API key");
  const now = new Date().toISOString();
  const report = {
    id: makePrivateReportId(url),
    url,
    score: 91,
    summary: { totalFindings: 1, guardedFalsePositives: 0, pagesScanned: 1 },
    findings: Array.isArray(findings) ? findings : [{
      id: "finding-1",
      severity: "medium",
      title: "Missing title",
      pageUrl: findingPageUrl,
      evidence: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      confidence: "verified",
      source: "rendered"
    }],
    pages: [{ url: findingPageUrl }],
    scannedAt: now,
    reportPath: "",
    reportUrl: "",
    retention: { expiresAt: isoDaysFromNow(REPORT_RETENTION_DAYS), days: REPORT_RETENTION_DAYS },
    owner: { email: ownerEmail }
  };
  if (reportDelta && typeof reportDelta === "object" && !Array.isArray(reportDelta)) {
    report.reportDelta = reportDelta;
  }
  report.reportPath = `/beta/reports/${report.id}`;
  report.reportUrl = `http://127.0.0.1:${port}${report.reportPath}`;
  auditReports.set(report.id, report);

  const job = {
    id: randomUUID(),
    ownerEmail,
    ownerSessionHash: access.sessionHash,
    accessMode: access.accessMode,
    targetUrl: report.url,
    targetHost: safeHost(report.url),
    competitorUrls: [],
    backlinkRows: [],
    localSeo: { enabled: false },
    keywordRows: [],
    renderedCrawlTarget: 0,
    maxPages: 1,
    status: "completed",
    reportId: report.id,
    error: "",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: now,
    expiresAt: isoDaysFromNow(REPORT_RETENTION_DAYS)
  };
  auditJobs.set(job.id, job);

  const fixRequest = {
    id: randomUUID(),
    reportId: report.id,
    finalReportId: "",
    ownerEmail,
    targetUrl: report.url,
    targetHost: safeHost(report.url),
    score: report.score,
    issueCount: report.summary.totalFindings,
    status,
    offer: FIX_PACK_OFFER,
    createdAt: now,
    updatedAt: now
  };
  fixRequests.push(fixRequest);
  return {
    apiToken: token.secret,
    auditId: job.id,
    reportId: report.id,
    fixRequestId: fixRequest.id
  };
}

export {
  app,
  resetLocalStateForTests,
  seedProtectedLocalAuditForTests
};
