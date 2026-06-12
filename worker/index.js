import puppeteer from "@cloudflare/puppeteer";
import {
  DODO_DISPUTE_EVENTS,
  DODO_PAYMENT_FAILURE_EVENTS,
  DODO_PAYMENT_PROCESSING_EVENTS,
  DODO_PAYMENT_SUCCESS_EVENTS,
  DODO_REFUND_FAILURE_EVENTS,
  DODO_REFUND_SUCCESS_EVENTS,
  PAID_STATUSES,
  dodoAdaptiveCurrencyFeesInclusive,
  dodoApiKey,
  dodoBaseUrl,
  dodoBrandId,
  dodoCheckoutConfigStatus,
  dodoCountryFromRequest,
  dodoProductId,
  dodoProductMatches,
  dodoWebhookSecret,
  extractDodoPayment,
  hasDodoCheckoutConfig,
  verifyDodoWebhookSignature
} from "../shared/dodo.js";
import {
  ADMIN_EDITABLE_FIX_REQUEST_STATUSES,
  adminNotificationEmail,
  buildOpsDigestEmail,
  buildPaymentNotificationEmail,
  buildStatusNotificationEmail,
  fixRequestStatusLabel,
  isEmailConfigured,
  normalizeFixRequestStatus
} from "../shared/fulfillment.js";
import {
  buildWhiteLabelReportHtml,
  defaultBranding,
  normalizeBrandingInput,
  whiteLabelReportFilename
} from "../shared/white-label-report.js";
import { isPrivateHostname, resolvesToPrivateAddress } from "../shared/url-safety.js";
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
import { crawlDepthSummary } from "../shared/crawl-depth.js";
import { buildCrawlInventory } from "../shared/crawl-inventory.js";
import {
  normalizeRenderedCrawlTarget,
  renderedCrawlTargetSummary
} from "../shared/rendered-crawl-scale.js";
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
import {
  appendReportDeltaBrief,
  buildReportDelta
} from "../shared/report-delta.js";
import {
  VERSION,
  clampPageLimit,
  competitorUrlsKey,
  createAuditEngine,
  escapeHtml,
  issuePatternKey,
  normalizeCompetitorUrlsList,
  normalizeUrl,
  parseAuditCompetitorUrls,
  publicAuditUrlStatus,
  rootSitemap
} from "../shared/audit-engine.js";
import {
  EMAIL_PROVIDER,
  sendWorkerEmail
} from "./lib/email.js";
import {
  cookieValue,
  json,
  jsonNoStore,
  secureHeaders,
  withPrivateHeaders,
  withSecurityHeaders
} from "./lib/http.js";
import {
  checkQuotaSet,
  constantTimeEqual,
  csvCell,
  hmacSha256Hex,
  randomToken,
  requestIpHash,
  sha256Hex,
  workerLargeCrawlId
} from "./lib/security.js";
import {
  claimHostFromInput,
  clampScheduleInterval,
  cleanAccessMode,
  cleanAccessToken,
  cleanInviteCode,
  cleanIsoDateText,
  cleanReportDomain,
  cleanText,
  cleanUrlText,
  dayWindow,
  hourWindow,
  isSafeReportId,
  isSafeUuid,
  isoDaysFromDate,
  isoDaysFromNow,
  isoSecondsFromNow,
  normalizeDnsHost,
  normalizeDnsTxt,
  normalizeEmail,
  parseJson,
  randomHex,
  safeHostname,
  scheduleCadenceLabel,
  workerAppHost
} from "./lib/text.js";
import {
  adminAccessStatus,
  adminDeniedJson,
  apiAccessResponse,
  apiAccessStatus,
  auditAuthorizationStatus,
  betaAccessResponse,
  betaAccessStatus,
  betaSessionTokenFromRequest,
  clearSessionCookie,
  createAdminSession,
  createBetaSession,
  logAdminAction,
  revokeAdminSession
} from "./lib/auth.js";
import {
  cleanupExpiredRows,
  countRows,
  runD1BatchChunks
} from "./lib/db.js";
import {
  PRESERVED_FIX_REQUEST_STATUSES,
  REPORT_RETENTION_DAYS,
  deleteReportRowsWithBlobs,
  hydrateReportRow,
  ownerReportRow,
  preserveFixRequestReports,
  reportJsonForRow,
  saveAuditReport,
  saveAuditReportWithContext
} from "./lib/report-data.js";
import {
  apiAuditResponse,
  apiIssueResponse,
  apiProjectResponse,
  apiReportResponse,
  auditJobResponse,
  auditScheduleResponse,
  billingFixRequestResponse,
  fixRequestResponse,
  siteClaimResponse,
  siteVerificationText
} from "./lib/serializers.js";
import {
  apiWebhookSigningSecret,
  cleanWebhookEvents,
  deliverApiWebhooks,
  publicWebhookUrlStatus
} from "./lib/webhooks.js";
import {
  demoHtml,
  homeMarkdown,
  llmsText,
  privacyHtml,
  supportHtml,
  termsHtml
} from "./routes/pages.js";
import {
  DEFAULT_INVITE_TTL_DAYS,
  betaLogin,
  betaLogout,
  betaSession,
  createSiteClaim,
  joinWaitlist,
  listSiteClaims,
  randomInviteCode,
  requestAccessLink,
  verifyAccessLink,
  verifySiteClaim
} from "./routes/access.js";
import {
  createTeamMember,
  getReportCollaboration,
  getSavedReport,
  getTeamMembers,
  reportIdFromSuffixPath,
  revokeTeamMember,
  saveReportCollaboration,
  summarizeIssuePatterns
} from "./routes/reports.js";
import {
  activeAuditJobCount,
  activeAuditJobForTarget,
  auditQuotaStatus,
  auditUrl,
  createAuditJob,
  createAuditSchedule,
  deleteAuditSchedule,
  enqueueAuditJob,
  failStaleRunningAuditJobs,
  getAuditJob,
  listAuditSchedules,
  processAuditJob,
  renderedFixture,
  resumeStaleQueuedAuditJobs,
  runDueAuditSchedules,
  runPrivateAudit,
  runPrivateDemoAudit
} from "./routes/audits.js";
import {
  apiCreateAudit,
  apiCreateProject,
  apiDeleteAudit,
  apiGetAudit,
  apiGetAuditIssues,
  apiGetAuditReport,
  apiListAudits,
  apiListProjects,
  createDeveloperApiToken,
  createDeveloperWebhook,
  getDeveloperApiSummary,
  revokeDeveloperApiToken,
  revokeDeveloperWebhook
} from "./routes/developer-api.js";
import {
  createReportDomain,
  createReportShare,
  getClientReport,
  getClientReportPdf,
  getPrivateReportPdf,
  getReportBranding,
  getReportDomainChallenge,
  listReportDomains,
  listReportShares,
  revokeReportDomain,
  revokeReportShare,
  saveReportBranding,
  unlockClientReport,
  verifyReportDomain
} from "./routes/shares.js";
import {
  FIX_PACK_OFFER,
  dodoConfigMissing,
  getBillingSummary,
  getFixPackPricingPreview,
  getPublicFixPackPricing,
  handleDodoWebhook,
  isAllowedAdminStatusTransition,
  logFixRequestEvent,
  notifyFixRequestStatus,
  requestFixPack,
  validateFinalReportForFixRequest
} from "./routes/billing.js";

const LARGE_RENDERED_CRAWL_LEASE_MS = 15 * 60 * 1000;
const LARGE_RENDERED_CRAWL_SYNC_FRONTIER_LIMIT = 1000;
export default {
  async scheduled(_event, env, ctx) {
    if (env.WAITLIST_DB) {
      ctx.waitUntil(cleanupExpiredRows(env));
      ctx.waitUntil(
        failStaleRunningAuditJobs(env).then(() =>
          resumeStaleQueuedAuditJobs(env, { appOrigin: "https://seofixkit.com" })
        )
      );
      ctx.waitUntil(runDueAuditSchedules(env));
      if (String(env.SEOFIXKIT_LARGE_CRAWL_WORKERS_ENABLED || "").toLowerCase() === "true") {
        ctx.waitUntil(runDueLargeRenderedCrawlWorkers(env));
      }
      ctx.waitUntil(sendDailyOpsDigest(env));
      ctx.waitUntil(sendUrgentOpsAlerts(env));
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = message.body || {};
      if (body.kind === "audit-job" && isSafeUuid(String(body.jobId || ""))) {
        await processAuditJob(env, body.jobId, { appOrigin: body.appOrigin || "https://seofixkit.com" });
      }
      message.ack();
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "seo-fix-kit",
          runtime: "cloudflare-worker",
          browserRun: Boolean(env.BROWSER),
          waitlistDb: Boolean(env.WAITLIST_DB),
          emailNotifications: isEmailConfigured(env),
          version: VERSION
        });
      }

      if (url.pathname === "/api/waitlist" && request.method === "POST") {
        return joinWaitlist(request, env);
      }

      if (url.pathname === "/api/access/request" && request.method === "POST") {
        return requestAccessLink(request, env);
      }

      if (url.pathname === "/api/access/verify" && request.method === "POST") {
        return verifyAccessLink(request, env);
      }

      if (url.pathname === "/api/beta/login" && request.method === "POST") {
        return betaLogin(request, env);
      }

      if (url.pathname === "/api/beta/session" && request.method === "GET") {
        return betaSession(request, env);
      }

      if (url.pathname === "/api/beta/logout" && request.method === "POST") {
        return betaLogout(request, env);
      }

      if (url.pathname === "/api/beta/fix-request" && request.method === "POST") {
        return requestFixPack(request, env);
      }

      if (url.pathname === "/api/pricing-preview" && request.method === "GET") {
        return getFixPackPricingPreview(request, env);
      }

      if (url.pathname === "/api/public-pricing" && request.method === "GET") {
        return getPublicFixPackPricing(request, env, ctx);
      }

      if (url.pathname === "/api/billing/summary" && request.method === "GET") {
        return getBillingSummary(request, env);
      }

      if (url.pathname === "/api/account/summary" && request.method === "GET") {
        return getAccountSummary(request, env);
      }

      if (url.pathname === "/api/audit/schedules" && request.method === "GET") {
        return listAuditSchedules(request, env);
      }

      if (url.pathname === "/api/audit/schedules" && request.method === "POST") {
        return createAuditSchedule(request, env);
      }

      if (url.pathname.startsWith("/api/audit/schedules/") && request.method === "DELETE") {
        return deleteAuditSchedule(request, env);
      }

      if (url.pathname === "/api/developer" && request.method === "GET") {
        return getDeveloperApiSummary(request, env);
      }

      if (url.pathname === "/api/developer/tokens" && request.method === "POST") {
        return createDeveloperApiToken(request, env);
      }

      if (url.pathname.startsWith("/api/developer/tokens/") && request.method === "DELETE") {
        return revokeDeveloperApiToken(request, env);
      }

      if (url.pathname === "/api/developer/webhooks" && request.method === "POST") {
        return createDeveloperWebhook(request, env);
      }

      if (url.pathname.startsWith("/api/developer/webhooks/") && request.method === "DELETE") {
        return revokeDeveloperWebhook(request, env);
      }

      if (url.pathname === "/api/team" && request.method === "GET") {
        return getTeamMembers(request, env);
      }

      if (url.pathname === "/api/team/members" && request.method === "POST") {
        return createTeamMember(request, env);
      }

      if (url.pathname.startsWith("/api/team/members/") && request.method === "DELETE") {
        return revokeTeamMember(request, env);
      }

      if (url.pathname === "/api/branding" && request.method === "GET") {
        return getReportBranding(request, env);
      }

      if (url.pathname === "/api/branding" && request.method === "POST") {
        return saveReportBranding(request, env);
      }

      if (url.pathname === "/api/report-domains" && request.method === "GET") {
        return listReportDomains(request, env);
      }

      if (url.pathname === "/api/report-domains" && request.method === "POST") {
        return createReportDomain(request, env);
      }

      if (url.pathname.startsWith("/api/report-domains/") && url.pathname.endsWith("/verify") && request.method === "POST") {
        return verifyReportDomain(request, env);
      }

      if (url.pathname.startsWith("/api/report-domains/") && request.method === "DELETE") {
        return revokeReportDomain(request, env);
      }

      if (url.pathname.startsWith("/api/report-shares/") && request.method === "DELETE") {
        return revokeReportShare(request, env);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/shares") && request.method === "GET") {
        return listReportShares(request, env);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/share") && request.method === "POST") {
        return createReportShare(request, env);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/client.pdf") && request.method === "GET") {
        return getPrivateReportPdf(request, env);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/collaboration") && request.method === "GET") {
        return getReportCollaboration(request, env);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/collaboration") && request.method === "PATCH") {
        return saveReportCollaboration(request, env);
      }

      if (url.pathname.startsWith("/r/") && url.pathname.endsWith("/unlock") && request.method === "POST") {
        return unlockClientReport(request, env);
      }

      if (url.pathname === "/.well-known/seofixkit-report-domain.txt" && request.method === "GET") {
        return getReportDomainChallenge(request, env);
      }

      if (url.pathname.startsWith("/r/") && url.pathname.endsWith(".pdf") && request.method === "GET") {
        return getClientReportPdf(request, env);
      }

      if (url.pathname.startsWith("/r/") && request.method === "GET") {
        return getClientReport(request, env);
      }

      if (url.pathname === "/v1/projects" && request.method === "GET") {
        return apiListProjects(request, env);
      }

      if (url.pathname === "/v1/projects" && request.method === "POST") {
        return apiCreateProject(request, env);
      }

      if (url.pathname === "/v1/audits" && request.method === "POST") {
        return apiCreateAudit(request, env, ctx);
      }

      if (url.pathname === "/v1/audits" && request.method === "GET") {
        return apiListAudits(request, env);
      }

      if (url.pathname.startsWith("/v1/audits/") && url.pathname.endsWith("/issues") && request.method === "GET") {
        return apiGetAuditIssues(request, env);
      }

      if (url.pathname.startsWith("/v1/audits/") && url.pathname.endsWith("/report") && request.method === "GET") {
        return apiGetAuditReport(request, env);
      }

      if (url.pathname.startsWith("/v1/audits/") && request.method === "GET") {
        return apiGetAudit(request, env);
      }

      if (url.pathname.startsWith("/v1/audits/") && request.method === "DELETE") {
        return apiDeleteAudit(request, env);
      }

      if (url.pathname === "/v1/large-crawls" && request.method === "POST") {
        return apiCreateLargeRenderedCrawl(request, env, ctx);
      }

      if (url.pathname === "/v1/large-crawls" && request.method === "GET") {
        return apiListLargeRenderedCrawls(request, env);
      }

      if (url.pathname.startsWith("/v1/large-crawls/") && url.pathname.endsWith("/retry") && request.method === "POST") {
        return apiRetryLargeRenderedCrawl(request, env);
      }

      if (url.pathname.startsWith("/v1/large-crawls/") && url.pathname.endsWith("/batches/claim") && request.method === "POST") {
        return apiClaimLargeRenderedCrawlBatch(request, env);
      }

      if (url.pathname.startsWith("/v1/large-crawls/") && url.pathname.endsWith("/batches/process") && request.method === "POST") {
        return apiProcessLargeRenderedCrawlBatch(request, env);
      }

      if (url.pathname.startsWith("/v1/large-crawls/") && url.pathname.includes("/batches/") && url.pathname.endsWith("/proof") && request.method === "POST") {
        return apiSaveLargeRenderedCrawlBatchProof(request, env);
      }

      if (url.pathname.startsWith("/v1/large-crawls/") && url.pathname.endsWith("/merge") && request.method === "POST") {
        return apiMarkLargeRenderedCrawlReadyToMerge(request, env);
      }

      if (url.pathname.startsWith("/v1/large-crawls/") && request.method === "GET") {
        return apiGetLargeRenderedCrawl(request, env);
      }

      if (url.pathname === "/api/sites" && request.method === "GET") {
        return listSiteClaims(request, env);
      }

      if (url.pathname === "/api/sites/claim" && request.method === "POST") {
        return createSiteClaim(request, env);
      }

      if (url.pathname === "/api/sites/verify" && request.method === "POST") {
        return verifySiteClaim(request, env);
      }

      if (url.pathname === "/admin/session" && request.method === "POST") {
        return createAdminSession(request, env);
      }

      if (url.pathname === "/admin/session" && request.method === "DELETE") {
        return revokeAdminSession(request, env);
      }

      if (url.pathname === "/api/webhooks/dodo" && request.method === "POST") {
        return handleDodoWebhook(request, env, ctx);
      }

      if (url.pathname === "/api/audit" && request.method === "POST") {
        return runPrivateAudit(request, env, ctx);
      }

      if (url.pathname.startsWith("/api/audit/jobs/") && request.method === "GET") {
        return getAuditJob(request, env);
      }

      if (url.pathname === "/api/large-crawls" && request.method === "POST") {
        return createLargeRenderedCrawl(request, env, ctx);
      }

      if (url.pathname === "/api/large-crawls" && request.method === "GET") {
        return listLargeRenderedCrawls(request, env);
      }

      if (url.pathname.startsWith("/api/large-crawls/") && url.pathname.endsWith("/retry") && request.method === "POST") {
        return retryLargeRenderedCrawl(request, env);
      }

      if (url.pathname.startsWith("/api/large-crawls/") && url.pathname.endsWith("/batches/claim") && request.method === "POST") {
        return claimLargeRenderedCrawlBatch(request, env);
      }

      if (url.pathname.startsWith("/api/large-crawls/") && url.pathname.endsWith("/batches/process") && request.method === "POST") {
        return processLargeRenderedCrawlBatch(request, env);
      }

      if (url.pathname.startsWith("/api/large-crawls/") && url.pathname.includes("/batches/") && url.pathname.endsWith("/proof") && request.method === "POST") {
        return saveLargeRenderedCrawlBatchProof(request, env);
      }

      if (url.pathname.startsWith("/api/large-crawls/") && url.pathname.endsWith("/merge") && request.method === "POST") {
        return markLargeRenderedCrawlReadyToMerge(request, env);
      }

      if (url.pathname.startsWith("/api/large-crawls/") && request.method === "GET") {
        return getLargeRenderedCrawl(request, env);
      }

      if (url.pathname.startsWith("/api/reports/")) {
        return getSavedReport(request, env);
      }

      if (url.pathname === "/admin/summary") {
        return getAdminSummary(request, env);
      }

      if (url.pathname === "/admin/invites" && request.method === "POST") {
        return createInvite(request, env);
      }

      if (url.pathname.startsWith("/admin/fix-requests/") && request.method === "PATCH") {
        return updateFixRequestAdmin(request, env);
      }

      if (url.pathname === "/admin/leads.csv") {
        return exportLeadsCsv(request, env);
      }

      if (url.pathname === "/api/demo-audit") {
        return runPrivateDemoAudit(request, env);
      }

      if (url.pathname === "/fixture/rendered-page") {
        return new Response(renderedFixture(url.origin), {
          headers: secureHeaders({
            "content-type": "text/html; charset=utf-8",
            "x-robots-tag": "noindex, nofollow"
          })
        });
      }

      if (url.pathname === "/fixture/robots.txt") {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/fixture/sitemap.xml\n`, {
          headers: secureHeaders({ "content-type": "text/plain; charset=utf-8" })
        });
      }

      if (url.pathname === "/fixture/sitemap.xml") {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/fixture/rendered-page</loc></url></urlset>`,
          { headers: secureHeaders({ "content-type": "application/xml; charset=utf-8" }) }
        );
      }

      if (url.pathname === "/robots.txt") {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`, {
          headers: secureHeaders({ "content-type": "text/plain; charset=utf-8" })
        });
      }

      if (url.pathname === "/sitemap.xml") {
        return new Response(rootSitemap(url.origin), {
          headers: secureHeaders({ "content-type": "application/xml; charset=utf-8" })
        });
      }

      if (url.pathname === "/llms.txt") {
        return new Response(llmsText(url.origin), {
          headers: secureHeaders({ "content-type": "text/plain; charset=utf-8" })
        });
      }

      if (url.pathname === "/privacy") {
        return new Response(privacyHtml(url.origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/support") {
        return new Response(supportHtml(url.origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/terms") {
        return new Response(termsHtml(url.origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/demo") {
        return new Response(demoHtml(url.origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/beta" || url.pathname.startsWith("/beta/")) {
        const indexUrl = new URL("/", request.url);
        const response = await env.ASSETS.fetch(new Request(indexUrl, request));
        return withPrivateHeaders(response);
      }

      if (
        url.pathname === "/" &&
        (request.headers.get("accept") || "").includes("text/markdown")
      ) {
        return new Response(homeMarkdown(url.origin), {
          headers: secureHeaders({ "content-type": "text/markdown; charset=utf-8" })
        });
      }

      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      return json(
        {
          error:
            error?.message ||
            "The audit failed. Try a smaller site or run again in a moment."
        },
        500
      );
    }
  }
};

async function exportLeadsCsv(request, env) {
  if (!env.WAITLIST_DB) {
    return new Response("Waitlist storage is not configured.", { status: 503 });
  }

  const admin = await adminAccessStatus(request, env, "export-leads");
  if (!admin.ok) {
    return new Response(admin.error || "Unauthorized", {
      status: admin.status || 401,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": "Bearer"
      }
    });
  }
  await logAdminAction(request, env, "export-leads", true, admin.actorEmail);

  const { results } = await env.WAITLIST_DB.prepare(
    `SELECT
      email,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      landing_path,
      referrer,
      country,
      created_at,
      updated_at
     FROM waitlist_leads
     ORDER BY created_at DESC
     LIMIT 10000`
  ).all();

  const columns = [
    "email",
    "source",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "landing_path",
    "referrer",
    "country",
    "created_at",
    "updated_at"
  ];
  const rows = [columns.join(",")];

  for (const lead of results || []) {
    rows.push(columns.map((column) => csvCell(lead[column])).join(","));
  }

  return new Response(`${rows.join("\n")}\n`, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="seofixkit-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}

async function getAdminSummary(request, env) {
  const admin = await adminAccessStatus(request, env, "view-summary");
  if (!admin.ok) return adminDeniedJson(admin);
  if (!env.WAITLIST_DB) return json({ error: "Admin storage is not configured." }, 503);
  await logAdminAction(request, env, "view-summary", true, admin.actorEmail);

  const includeTest = new URL(request.url).searchParams.get("includeTest") === "1";
  const fixWhere = includeTest ? "" : "is_test = 0";
  const today = new Date().toISOString().slice(0, 10);
  const soon = isoDaysFromNow(7);
  const [
    waitlist,
    invites,
    sessions,
    audits,
    auditsToday,
    expiring,
    fixRequests,
    recentAudits,
    issuePatterns,
    recentInvites,
    fixStatusCounts,
    fixQueue,
    notificationRows,
    eventRows,
    opsHealth
  ] = await Promise.all([
    countRows(env, "waitlist_leads"),
    countRows(env, "beta_invites"),
    countRows(env, "beta_sessions", "revoked_at IS NULL AND expires_at > ?", [new Date().toISOString()]),
    countRows(env, "audit_reports"),
    countRows(env, "audit_reports", "created_at >= ?", [`${today}T00:00:00.000Z`]),
    countRows(env, "audit_reports", "expires_at IS NOT NULL AND expires_at <= ?", [soon]),
    countRows(env, "fix_requests", fixWhere),
    env.WAITLIST_DB.prepare(
      `SELECT id, url, target_host, owner_email, score, summary_json, created_at, expires_at
       FROM audit_reports
       ORDER BY created_at DESC
       LIMIT 20`
    ).all(),
    env.WAITLIST_DB.prepare(
      `SELECT report_json
       FROM audit_reports
       ORDER BY created_at DESC
       LIMIT 25`
    ).all(),
    env.WAITLIST_DB.prepare(
      `SELECT id, owner_email, label, status, max_uses, used_count, expires_at, created_at
       FROM beta_invites
       ORDER BY created_at DESC
       LIMIT 20`
    ).all(),
    env.WAITLIST_DB.prepare(
      `SELECT status, COUNT(*) AS count
       FROM fix_requests
       ${fixWhere ? `WHERE ${fixWhere}` : ""}
       GROUP BY status`
    ).all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM fix_requests
       ${fixWhere ? `WHERE ${fixWhere}` : ""}
       ORDER BY
        CASE status
          WHEN 'paid' THEN 0
          WHEN 'in_progress' THEN 1
          WHEN 'checkout_created' THEN 2
          WHEN 'delivered' THEN 3
          ELSE 4
        END,
        updated_at DESC
       LIMIT 50`
    ).all(),
    env.WAITLIST_DB.prepare(
      `SELECT fix_request_id, event, recipient_type, recipient_email, status, provider, provider_message_id, error, created_at
       FROM fix_request_notifications
       ORDER BY created_at DESC
       LIMIT 100`
    ).all(),
    env.WAITLIST_DB.prepare(
      `SELECT fix_request_id, event, actor_type, actor_email, from_status, to_status, reason, created_at
       FROM fix_request_events
       ORDER BY created_at DESC
       LIMIT 200`
    ).all(),
    buildOpsSnapshot(env, { includeTest })
  ]);
  const notificationsByFixRequest = groupNotificationsByFixRequest(notificationRows.results || []);
  const eventsByFixRequest = groupEventsByFixRequest(eventRows.results || []);
  const dodoConfig = dodoCheckoutConfigStatus(env);

  return jsonNoStore({
    ok: true,
    metrics: {
      waitlist,
      invites,
      activeSessions: sessions,
      audits,
      auditsToday,
      reportsExpiringSoon: expiring,
      fixRequests,
      fixRequestStatuses: Object.fromEntries(
        (fixStatusCounts.results || []).map((row) => [row.status || "unknown", row.count || 0])
      ),
      emailNotificationsConfigured: isEmailConfigured(env)
    },
    opsHealth,
    paymentHealth: {
      dodo: {
        checkoutReady: dodoConfig.checkoutReady,
        environment: dodoConfig.environment || "",
        missing: dodoConfigMissing(dodoConfig)
      }
    },
    includeTest,
    offer: {
      ...FIX_PACK_OFFER,
      pricing: {
        source: "dodo",
        status: dodoConfig.checkoutReady ? "available_at_checkout" : "unavailable",
        environment: dodoConfig.environment || "",
        missing: dodoConfigMissing(dodoConfig)
      }
    },
    recentAudits: (recentAudits.results || []).map((row) => {
      const summary = parseJson(row.summary_json, {});
      return {
        id: row.id,
        url: row.url,
        targetHost: row.target_host,
        ownerEmail: row.owner_email,
        score: row.score,
        pagesScanned: summary.pagesScanned || 0,
        totalFindings: summary.totalFindings || 0,
        guardedFalsePositives: summary.guardedFalsePositives || 0,
        reportPath: `/beta/reports/${row.id}`,
        createdAt: row.created_at,
        expiresAt: row.expires_at
      };
    }),
    issuePatterns: summarizeIssuePatterns(
      await Promise.all((issuePatterns.results || []).map((row) => hydrateReportRow(env, row)))
    ),
    invites: (recentInvites.results || []).map((invite) => ({
      id: invite.id,
      ownerEmail: invite.owner_email,
      label: invite.label,
      status: invite.status,
      maxUses: invite.max_uses,
      usedCount: invite.used_count,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at
    })),
    fixQueue: (fixQueue.results || []).map((row) =>
      fixRequestAdminResponse(row, notificationsByFixRequest.get(row.id) || [], eventsByFixRequest.get(row.id) || [])
    )
  });
}

async function createInvite(request, env) {
  const admin = await adminAccessStatus(request, env, "create-invite");
  if (!admin.ok) return adminDeniedJson(admin);
  if (!env.WAITLIST_DB) return json({ error: "Invite storage is not configured." }, 503);

  const body = await request.json().catch(() => ({}));
  const ownerEmail = normalizeEmail(body.email || body.ownerEmail);
  if (!ownerEmail) return json({ error: "Enter a valid invite email." }, 400);

  const code = cleanInviteCode(body.code || randomInviteCode());
  if (!code) return json({ error: "Invite code must be at least 8 letters or numbers." }, 400);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const codeHash = await sha256Hex(code);
  const maxUses = Math.min(Math.max(Number(body.maxUses || 1), 1), 10);
  const expiresAt = body.expiresAt || isoDaysFromNow(Number(body.ttlDays || DEFAULT_INVITE_TTL_DAYS));
  const label = cleanText(body.label || "Private beta invite", 120);

  await env.WAITLIST_DB.prepare(
    `INSERT INTO beta_invites
      (id, code_hash, owner_email, label, status, max_uses, used_count, created_at, expires_at, created_by)
     VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?, ?)`
  )
    .bind(id, codeHash, ownerEmail, label, maxUses, now, expiresAt, admin.actorEmail)
    .run();
  await logAdminAction(request, env, "create-invite", true, admin.actorEmail, ownerEmail);

  return jsonNoStore({
    ok: true,
    invite: {
      id,
      ownerEmail,
      code,
      label,
      maxUses,
      usedCount: 0,
      expiresAt,
      url: `${new URL(request.url).origin}/beta?email=${encodeURIComponent(ownerEmail)}&invite=${encodeURIComponent(code)}`
    }
  });
}

async function updateFixRequestAdmin(request, env) {
  const admin = await adminAccessStatus(request, env, "update-fix-request");
  if (!admin.ok) return adminDeniedJson(admin);
  if (!env.WAITLIST_DB) return json({ error: "Fix request storage is not configured." }, 503);

  const id = decodeURIComponent(new URL(request.url).pathname.slice("/admin/fix-requests/".length));
  if (!isSafeUuid(id)) return jsonNoStore({ error: "Fix request not found." }, 404);

  const existing = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE id = ? LIMIT 1")
    .bind(id)
    .first();
  if (!existing?.id) return jsonNoStore({ error: "Fix request not found." }, 404);

  const body = await request.json().catch(() => ({}));
  const requestedStatus = normalizeFixRequestStatus(body.status, existing.status || "new");
  const unchangedWebhookStatus = requestedStatus === existing.status && requestedStatus === "paid";
  if (!ADMIN_EDITABLE_FIX_REQUEST_STATUSES.has(requestedStatus) && !unchangedWebhookStatus) {
    return jsonNoStore({ error: "Choose a valid fulfillment status." }, 400);
  }
  if (!isAllowedAdminStatusTransition(existing.status || "new", requestedStatus)) {
    return jsonNoStore({ error: "This status change is blocked. Payment and refund states are controlled by Dodo." }, 409);
  }
  if (
    ["in_progress", "delivered"].includes(requestedStatus) &&
    (!existing.paid_at || !existing.payment_id) &&
    existing.status !== "paid" &&
    existing.status !== "in_progress" &&
    existing.status !== "delivered"
  ) {
    return jsonNoStore({ error: "Payment must be confirmed before fulfillment starts." }, 409);
  }

  const now = new Date().toISOString();
  const assignedTo = cleanText(body.assignedTo || body.assigned_to || "", 160);
  const adminNote = cleanText(body.adminNote || body.admin_note || "", 2000);
  const customerNote = cleanText(body.customerNote || body.customer_note || "", 2000);
  let deliveryUrl = cleanUrlText(body.deliveryUrl || body.delivery_url || "", 600);
  const finalReportId = cleanText(body.finalReportId || body.final_report_id || "", 180);
  const dueAt = cleanIsoDateText(body.dueAt || body.due_at || existing.due_at || "");
  const nextUpdateAt = cleanIsoDateText(body.nextUpdateAt || body.next_update_at || existing.next_update_at || "");
  const statusReason = cleanText(body.statusReason || body.status_reason || "", 500);
  const finalReportStatus = finalReportId
    ? await validateFinalReportForFixRequest(env, existing, finalReportId)
    : { ok: true, beforeAfterSummary: null };
  if (!finalReportStatus.ok) return jsonNoStore({ error: finalReportStatus.error }, 400);
  if (requestedStatus === "delivered" && !deliveryUrl && finalReportId) {
    deliveryUrl = `${new URL(request.url).origin}/beta/reports/${encodeURIComponent(finalReportId)}`;
  }
  if (requestedStatus === "delivered" && (!deliveryUrl || !finalReportId || !customerNote)) {
    return jsonNoStore(
      { error: "Delivery needs a delivery link, validated final rerun report, and customer-facing note." },
      400
    );
  }
  const inProgressAt =
    requestedStatus === "in_progress" && !existing.in_progress_at ? now : existing.in_progress_at || "";
  const deliveredAt = requestedStatus === "delivered" && !existing.delivered_at ? now : existing.delivered_at || "";
  const beforeAfterSummaryJson = finalReportStatus.beforeAfterSummary
    ? JSON.stringify(finalReportStatus.beforeAfterSummary)
    : existing.before_after_summary_json || "";

  await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET status = ?,
         assigned_to = ?,
         admin_note = ?,
         customer_note = ?,
         delivery_url = ?,
         final_report_id = ?,
         due_at = ?,
         next_update_at = ?,
         status_reason = ?,
         in_progress_at = ?,
         delivered_at = ?,
         before_after_summary_json = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      requestedStatus,
      assignedTo,
      adminNote,
      customerNote,
      deliveryUrl,
      finalReportId,
      dueAt,
      nextUpdateAt,
      statusReason,
      inProgressAt,
      deliveredAt,
      beforeAfterSummaryJson,
      now,
      id
    )
    .run();
  await logFixRequestEvent(env, {
    fixRequestId: id,
    event: "admin_status_update",
    actorType: "admin",
    actorEmail: admin.actorEmail,
    fromStatus: existing.status || "new",
    toStatus: requestedStatus,
    reason: statusReason || adminNote,
    detail: {
      assignedTo,
      deliveryUrl,
      finalReportId,
      dueAt,
      nextUpdateAt,
      hadCustomerNote: Boolean(customerNote)
    }
  });
  await logAdminAction(request, env, "update-fix-request", true, admin.actorEmail, `${id}:${requestedStatus}`);

  const updated = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE id = ? LIMIT 1")
    .bind(id)
    .first();
  if (updated && PRESERVED_FIX_REQUEST_STATUSES.includes(updated.status)) {
    await preserveFixRequestReports(env, updated);
  }
  if (requestedStatus === "in_progress" && existing.status !== "in_progress") {
    await notifyFixRequestStatus(env, updated, "in_progress");
  }
  if (
    requestedStatus === "delivered" &&
    (!updated.delivery_notified_at ||
      existing.status !== "delivered" ||
      existing.delivery_url !== updated.delivery_url ||
      existing.final_report_id !== updated.final_report_id)
  ) {
    await notifyFixRequestStatus(env, updated, "delivered");
  }
  const notifications = await env.WAITLIST_DB.prepare(
    `SELECT event, recipient_type, recipient_email, status, provider, provider_message_id, error, created_at
     FROM fix_request_notifications
     WHERE fix_request_id = ?
     ORDER BY created_at DESC
     LIMIT 20`
  )
    .bind(id)
    .all();
  const events = await env.WAITLIST_DB.prepare(
    `SELECT event, actor_type, actor_email, from_status, to_status, reason, created_at
     FROM fix_request_events
     WHERE fix_request_id = ?
     ORDER BY created_at DESC
     LIMIT 20`
  )
    .bind(id)
    .all();

  return jsonNoStore({
    ok: true,
    request: fixRequestAdminResponse(updated, notifications.results || [], events.results || [])
  });
}

async function createLargeRenderedCrawl(request, env, ctx) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  const body = await request.json().catch(() => ({}));
  return createLargeRenderedCrawlForAccess(request, env, access, body, { api: false, ctx });
}

async function apiCreateLargeRenderedCrawl(request, env, ctx) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const body = await request.json().catch(() => ({}));
  return createLargeRenderedCrawlForAccess(request, env, access, body, { api: true, ctx });
}

async function createLargeRenderedCrawlForAccess(request, env, access, body = {}, options = {}) {
  if (!env.WAITLIST_DB) return jsonNoStore({ error: "Large crawl storage is not configured." }, 503);
  const normalized = normalizeLargeRenderedCrawlRequest(body, body.url || body.targetUrl || body.target_url || "");
  if (!normalized.ok) return jsonNoStore({ error: normalized.error || "Enter a valid public website URL." }, 400);
  const publicUrlCheck = publicAuditUrlStatus(normalized.targetUrl);
  if (!publicUrlCheck.ok) return jsonNoStore({ error: publicUrlCheck.error }, 400);
  const authorization = await auditAuthorizationStatus(env, access, normalized.targetUrl);
  if (!authorization.ok) {
    return jsonNoStore(
      {
        error: authorization.error,
        code: authorization.code,
        site: authorization.site
      },
      authorization.status || 403
    );
  }
  const existing = await activeLargeRenderedCrawlForTarget(env, access, normalized.targetUrl);
  if (existing?.id) {
    const response = await largeRenderedCrawlResponseForRow(env, existing);
    return jsonNoStore(
      options.api
        ? {
            ok: true,
            deduped: true,
            large_crawl: apiLargeRenderedCrawlResponse(response),
            large_crawl_id: existing.id,
            status_url: `/v1/large-crawls/${existing.id}`
          }
        : {
            ok: true,
            mode: "queued",
            deduped: true,
            largeCrawl: response,
            largeCrawlId: existing.id,
            statusUrl: `/api/large-crawls/${existing.id}`
          },
      202
    );
  }
  const activeCount = await activeLargeRenderedCrawlCount(env, access);
  if (activeCount >= 1) {
    return jsonNoStore(
      {
        error: "You already have a large rendered crawl running. Wait for it to finish, retry, or cancel it before starting another.",
        code: "LARGE_CRAWL_ACTIVE_LIMIT"
      },
      429
    );
  }
  const quota = await largeCrawlQuotaStatus(request, env, access, normalized.targetUrl);
  if (!quota.ok) return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  const billing = largeCrawlBillingStatus(env, access);
  if (!billing.ok) return jsonNoStore({ error: billing.error, code: billing.code }, billing.status);

  const inventory = await buildCrawlInventory(normalized.targetUrl, {
    includeUrls: true,
    maxUrls: Math.min(normalized.targetPages, LARGE_RENDERED_CRAWL_SYNC_FRONTIER_LIMIT),
    maxSitemaps: 25,
    fetcher: fetch
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
    idFactory: workerLargeCrawlId
  });
  created.job.ownerSessionHash = access.sessionHash || "";
  created.job.ownerInviteId = access.inviteId || "";
  created.job.inventoryStatus = inventory.status || "empty";
  created.job.inventorySummary = inventory.summary || {};
  created.job.frontierIngestionStatus = largeCrawlFrontierIngestionStatus(created.frontierRows.length, normalized.targetPages, inventory);
  created.job.frontierStoredCount = created.frontierRows.length;
  created.job.incrementalMode = Boolean(body.incrementalMode || body.incremental_mode);
  created.job.previousCrawlJobId = created.job.incrementalMode
    ? (await latestLargeRenderedCrawlForTarget(env, access, normalized.targetUrl))?.id || ""
    : "";
  created.job.crawlFingerprint = await largeCrawlFingerprint(normalized.targetUrl, created.frontierRows);
  created.job.mergeStatus = "blocked";
  await insertLargeRenderedCrawl(env, created);
  if (created.job.frontierIngestionStatus === "partial") {
    options.ctx?.waitUntil?.(ingestRemainingLargeRenderedCrawlFrontier(env, created.job.id, normalized, access));
  }
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(created.job.id).first();
  const response = await largeRenderedCrawlResponseForRow(env, row);
  await deliverApiWebhooks(env, access.ownerEmail, "large_crawl.created", {
    large_crawl: apiLargeRenderedCrawlResponse(response)
  }).catch(() => {});
  return jsonNoStore(
    options.api
      ? {
          ok: true,
          large_crawl: apiLargeRenderedCrawlResponse(response),
          large_crawl_id: created.job.id,
          status_url: `/v1/large-crawls/${created.job.id}`,
          claim_url: `/v1/large-crawls/${created.job.id}/batches/claim`
        }
      : {
          ok: true,
          mode: "queued",
          largeCrawl: response,
          largeCrawlId: created.job.id,
          statusUrl: `/api/large-crawls/${created.job.id}`,
          claimUrl: `/api/large-crawls/${created.job.id}/batches/claim`
        },
    202
  );
}

async function listLargeRenderedCrawls(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  const rows = await listLargeRenderedCrawlRows(env, access);
  const crawls = [];
  for (const row of rows) crawls.push(await largeRenderedCrawlResponseForRow(env, row));
  return jsonNoStore({ ok: true, largeCrawls: crawls });
}

async function apiListLargeRenderedCrawls(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const rows = await listLargeRenderedCrawlRows(env, access);
  const crawls = [];
  for (const row of rows) crawls.push(apiLargeRenderedCrawlResponse(await largeRenderedCrawlResponseForRow(env, row)));
  return jsonNoStore({ ok: true, large_crawls: crawls });
}

async function getLargeRenderedCrawl(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  const loaded = await loadLargeRenderedCrawlFromRequest(request, env, access, "/api/large-crawls/");
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  return jsonNoStore({ ok: true, largeCrawl: await largeRenderedCrawlResponseForRow(env, loaded.row) });
}

async function apiGetLargeRenderedCrawl(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const loaded = await loadLargeRenderedCrawlFromRequest(request, env, access, "/v1/large-crawls/");
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  return jsonNoStore({ ok: true, large_crawl: apiLargeRenderedCrawlResponse(await largeRenderedCrawlResponseForRow(env, loaded.row)) });
}

async function retryLargeRenderedCrawl(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return retryLargeRenderedCrawlForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiRetryLargeRenderedCrawl(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return retryLargeRenderedCrawlForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function retryLargeRenderedCrawlForAccess(request, env, access, prefix, options = {}) {
  const id = pathId(request.url, prefix, "/retry");
  const loaded = await loadLargeRenderedCrawl(env, access, id);
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_frontier WHERE crawl_job_id = ? AND status = 'failed'`
  ).bind(id).all();
  const retryResult = retryLargeRenderedCrawlFailures(
    largeCrawlJobFromRow(loaded.row),
    loaded.batches.map(largeCrawlBatchFromRow),
    (rows.results || []).map(largeCrawlFrontierFromRow)
  );
  const now = new Date().toISOString();
  const retryableBatchIds = retryResult.batches
    .filter((batch) => batch.status === "queued")
    .map((batch) => batch.id);
  if (retryableBatchIds.length) {
    await runD1BatchChunks(env, [
      ...retryableBatchIds.map((batchId) =>
        env.WAITLIST_DB.prepare(
          `UPDATE large_crawl_batches SET status = 'queued', error = NULL, updated_at = ? WHERE id = ? AND crawl_job_id = ?`
        ).bind(now, batchId, id)
      ),
      ...retryResult.frontierRows.map((row) =>
        env.WAITLIST_DB.prepare(
          `UPDATE large_crawl_frontier SET status = ?, last_error = ?, updated_at = ? WHERE id = ? AND crawl_job_id = ?`
        ).bind(row.status, row.lastError || null, now, row.id, id)
      ),
      env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_jobs SET status = 'queued', error = NULL, updated_at = ? WHERE id = ?`
      ).bind(now, id)
    ]);
  }
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(id).first();
  const response = await largeRenderedCrawlResponseForRow(env, row);
  return jsonNoStore(
    options.api
      ? { ok: true, retryable_batch_count: retryableBatchIds.length, large_crawl: apiLargeRenderedCrawlResponse(response) }
      : { ok: true, retryableBatchCount: retryableBatchIds.length, largeCrawl: response }
  );
}

async function claimLargeRenderedCrawlBatch(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return claimLargeRenderedCrawlBatchForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiClaimLargeRenderedCrawlBatch(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return claimLargeRenderedCrawlBatchForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function claimLargeRenderedCrawlBatchForAccess(request, env, access, prefix, options = {}) {
  const id = pathId(request.url, prefix, "/batches/claim");
  await expireStaleLargeCrawlLeases(env, id);
  const loaded = await loadLargeRenderedCrawl(env, access, id);
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  const claimed = claimNextLargeRenderedCrawlBatch(largeCrawlJobFromRow(loaded.row), loaded.batches.map(largeCrawlBatchFromRow));
  if (!claimed.ok) return jsonNoStore({ error: claimed.error }, 409);
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_jobs SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`
  ).bind(now, now, id).run();
  const batchClaim = await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_batches
     SET status = 'running', retry_count = ?, leased_at = ?, started_at = COALESCE(started_at, ?), error = NULL, updated_at = ?
     WHERE id = ? AND crawl_job_id = ? AND status IN ('queued', 'failed')`
  ).bind(claimed.batch.retryCount, now, now, now, claimed.batch.id, id).run();
  if (Number(batchClaim?.meta?.changes || 0) !== 1) {
    return jsonNoStore({ error: "Large crawl batch was claimed by another worker. Try again." }, 409);
  }
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_frontier SET status = 'rendering', updated_at = ? WHERE batch_id = ? AND status IN ('queued', 'failed')`
  ).bind(now, claimed.batch.id).run();
  const urls = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_frontier WHERE batch_id = ? AND status = 'rendering' ORDER BY priority ASC LIMIT 1000`
  ).bind(claimed.batch.id).all();
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(id).first();
  const response = await largeRenderedCrawlResponseForRow(env, row);
  return jsonNoStore(
    options.api
      ? {
          ok: true,
          large_crawl: apiLargeRenderedCrawlResponse(response),
          batch: apiLargeCrawlBatchResponse(claimed.batch),
          urls: (urls.results || []).map((item) => apiLargeCrawlFrontierResponse(largeCrawlFrontierFromRow(item))),
          proof_url: `/v1/large-crawls/${id}/batches/${claimed.batch.id}/proof`
        }
      : {
          ok: true,
          largeCrawl: response,
          batch: largeCrawlBatchResponse(claimed.batch),
          urls: (urls.results || []).map(largeCrawlFrontierFromRow),
          proofUrl: `/api/large-crawls/${id}/batches/${claimed.batch.id}/proof`
        }
  );
}

async function expireStaleLargeCrawlLeases(env, jobId) {
  if (!env.WAITLIST_DB || !jobId) return;
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - LARGE_RENDERED_CRAWL_LEASE_MS).toISOString();
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id FROM large_crawl_batches
     WHERE crawl_job_id = ?
       AND status = 'running'
       AND leased_at IS NOT NULL
       AND leased_at < ?`
  ).bind(jobId, staleBefore).all();
  const batchIds = (rows.results || []).map((row) => row.id).filter(Boolean);
  if (!batchIds.length) return;
  await runD1BatchChunks(env, batchIds.flatMap((batchId) => [
    env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_frontier SET status = 'queued', updated_at = ? WHERE batch_id = ? AND status = 'rendering'`
    ).bind(now, batchId),
    env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_batches SET status = 'queued', leased_at = NULL, error = NULL, updated_at = ? WHERE id = ? AND crawl_job_id = ?`
    ).bind(now, batchId, jobId)
  ]));
}

async function processLargeRenderedCrawlBatch(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return processLargeRenderedCrawlBatchForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiProcessLargeRenderedCrawlBatch(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return processLargeRenderedCrawlBatchForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function processLargeRenderedCrawlBatchForAccess(request, env, access, prefix, options = {}) {
  const body = await request.json().catch(() => ({}));
  const claimRequest = new Request(request.url.replace("/batches/process", "/batches/claim"), {
    method: "POST",
    headers: request.headers
  });
  const claimedResponse = await claimLargeRenderedCrawlBatchForAccess(claimRequest, env, access, prefix, options);
  const claimedBody = await claimedResponse.clone().json().catch(() => ({}));
  if (!claimedResponse.ok) return claimedResponse;
  const batchId = claimedBody.batch?.batch_id || claimedBody.batch?.id || "";
  const claimedUrls = Array.isArray(claimedBody.urls) ? claimedBody.urls : [];
  const urls = claimedUrls.slice(0, Math.min(Math.max(Number(body.limit || 10), 1), 50));
  await deferUnprocessedLargeCrawlUrls(env, batchId, urls);
  const pages = [];
  const failures = [];
  for (const row of urls) {
    const url = row.url;
    try {
      const report = await auditUrl(url, env, {
        maxPages: 1,
        pageSpeed: false,
        appOrigin: new URL(request.url).origin,
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
  }
  const proofUrl = new URL(request.url);
  proofUrl.pathname = `${prefix}${pathId(request.url, prefix, "/batches/process")}/batches/${batchId}/proof`;
  const proofRequest = new Request(proofUrl.href, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pages, failures })
  });
  const savedResponse = await saveLargeRenderedCrawlBatchProofForAccess(proofRequest, env, access, prefix, options);
  const savedBody = await savedResponse.clone().json().catch(() => ({}));
  return jsonNoStore(
    options.api
      ? { ...savedBody, processed_url_count: pages.length + failures.length, rendered_count: pages.length, failed_count: failures.length }
      : { ...savedBody, processedUrlCount: pages.length + failures.length, renderedCount: pages.length, failedCount: failures.length },
    savedResponse.status
  );
}

async function runDueLargeRenderedCrawlWorkers(env) {
  if (!env.WAITLIST_DB || !env.BROWSER) return;
  const batchLimit = Math.min(Math.max(Number(env.SEOFIXKIT_LARGE_CRAWL_WORKER_BATCHES || 1), 1), 5);
  const urlLimit = Math.min(Math.max(Number(env.SEOFIXKIT_LARGE_CRAWL_WORKER_URLS || 10), 1), 50);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM large_crawl_jobs
     WHERE status IN ('queued', 'retrying', 'running')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at ASC
     LIMIT ?`
  ).bind(new Date().toISOString(), batchLimit).all();
  for (const row of rows.results || []) {
    const now = new Date().toISOString();
    const heartbeatId = workerLargeCrawlId("lwh");
    const workerId = `scheduled-${heartbeatId.slice(-8)}`;
    await env.WAITLIST_DB.prepare(
      `INSERT INTO large_crawl_worker_heartbeats
        (id, worker_id, crawl_job_id, batch_id, status, browser_runtime, concurrency, last_error, last_seen_at, created_at)
       VALUES (?, ?, ?, NULL, 'processing', 'cloudflare-browser-run', ?, NULL, ?, ?)`
    ).bind(heartbeatId, workerId, row.id, urlLimit, now, now).run();
    const request = new Request(`https://seofixkit.com/api/large-crawls/${encodeURIComponent(row.id)}/batches/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: urlLimit })
    });
    try {
      await processLargeRenderedCrawlBatchForAccess(
        request,
        env,
        {
          ok: true,
          ownerEmail: row.owner_email,
          accessMode: row.access_mode || "worker",
          sessionHash: row.owner_session_hash || "scheduled-large-crawl-worker",
          inviteId: row.owner_invite_id || ""
        },
        "/api/large-crawls/",
        { api: false }
      );
      await env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_worker_heartbeats SET status = 'idle', last_seen_at = ? WHERE id = ?`
      ).bind(new Date().toISOString(), heartbeatId).run();
    } catch (error) {
      await env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_worker_heartbeats SET status = 'failed', last_error = ?, last_seen_at = ? WHERE id = ?`
      ).bind(cleanText(error?.message || "Large crawl worker failed.", 500), new Date().toISOString(), heartbeatId).run();
    }
  }
}

async function deferUnprocessedLargeCrawlUrls(env, batchId, processingRows = []) {
  if (!env.WAITLIST_DB || !batchId) return;
  const processingIds = processingRows
    .map((row) => row.frontier_id || row.frontierId || row.id || "")
    .filter(Boolean);
  const now = new Date().toISOString();
  if (!processingIds.length) {
    await env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_frontier SET status = 'queued', updated_at = ? WHERE batch_id = ? AND status = 'rendering'`
    ).bind(now, batchId).run();
    return;
  }
  const placeholders = processingIds.map(() => "?").join(", ");
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_frontier
     SET status = 'queued', updated_at = ?
     WHERE batch_id = ? AND status = 'rendering' AND id NOT IN (${placeholders})`
  ).bind(now, batchId, ...processingIds).run();
}

async function saveLargeRenderedCrawlBatchProof(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return saveLargeRenderedCrawlBatchProofForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiSaveLargeRenderedCrawlBatchProof(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return saveLargeRenderedCrawlBatchProofForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function saveLargeRenderedCrawlBatchProofForAccess(request, env, access, prefix, options = {}) {
  const { jobId, batchId } = largeCrawlBatchProofPath(request.url, prefix);
  const loaded = await loadLargeRenderedCrawl(env, access, jobId);
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  const batchRow = loaded.batches.find((batch) => batch.id === batchId);
  if (!batchRow?.id) return jsonNoStore({ error: "Large crawl batch not found." }, 404);
  const body = await request.json().catch(() => ({}));
  const pages = Array.isArray(body.pages) ? body.pages : [];
  const failures = Array.isArray(body.failures) ? body.failures : [];
  const now = new Date().toISOString();
  const frontier = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_frontier WHERE batch_id = ? ORDER BY priority ASC`
  ).bind(batchId).all();
  const frontierRows = (frontier.results || []).map(largeCrawlFrontierFromRow);
  const statements = [];
  for (const page of pages) {
    const frontierRow = findLargeCrawlFrontierRow(frontierRows, batchId, page);
    if (!frontierRow) continue;
    const proof = largeRenderedCrawlProofFromPage(largeCrawlJobFromRow(loaded.row), largeCrawlBatchFromRow(batchRow), frontierRow, page, now);
    statements.push(largeCrawlProofInsertStatement(env, proof));
    statements.push(
      env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_frontier SET status = 'rendered', last_error = NULL, updated_at = ? WHERE id = ?`
      ).bind(now, frontierRow.id)
    );
  }
  for (const failure of failures) {
    const frontierRow = findLargeCrawlFrontierRow(frontierRows, batchId, failure);
    if (!frontierRow) continue;
    const retryCount = Number(frontierRow.retryCount || 0) + 1;
    const lastError = cleanText(failure.error || failure.message || "Rendered proof failed.", 500);
    statements.push(
      env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_frontier SET status = 'failed', retry_count = ?, last_error = ?, updated_at = ? WHERE id = ?`
      ).bind(retryCount, lastError, now, frontierRow.id)
    );
    if (retryCount >= LARGE_RENDERED_CRAWL_MAX_RETRIES) {
      statements.push(
        env.WAITLIST_DB.prepare(
          `INSERT INTO large_crawl_dead_letters
            (id, crawl_job_id, batch_id, frontier_id, url, error, retry_count, status, created_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL)`
        ).bind(workerLargeCrawlId("lcd"), jobId, batchId, frontierRow.id, frontierRow.url, lastError, retryCount, now)
      );
    }
  }
  await runD1BatchChunks(env, statements);
  await refreshLargeCrawlCounters(env, jobId, batchId);
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(jobId).first();
  const response = await largeRenderedCrawlResponseForRow(env, row);
  if (response.status === "ready_to_merge") {
    await deliverApiWebhooks(env, access.ownerEmail, "large_crawl.ready_to_merge", {
      large_crawl: apiLargeRenderedCrawlResponse(response)
    }).catch(() => {});
  }
  const batch = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_batches WHERE id = ? LIMIT 1`).bind(batchId).first();
  return jsonNoStore(
    options.api
      ? { ok: true, large_crawl: apiLargeRenderedCrawlResponse(response), batch: apiLargeCrawlBatchResponse(largeCrawlBatchFromRow(batch)) }
      : { ok: true, largeCrawl: response, batch: largeCrawlBatchResponse(largeCrawlBatchFromRow(batch)) }
  );
}

async function markLargeRenderedCrawlReadyToMerge(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return markLargeRenderedCrawlReadyToMergeForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiMarkLargeRenderedCrawlReadyToMerge(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return markLargeRenderedCrawlReadyToMergeForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function markLargeRenderedCrawlReadyToMergeForAccess(request, env, access, prefix, options = {}) {
  const id = pathId(request.url, prefix, "/merge");
  const loaded = await loadLargeRenderedCrawl(env, access, id, { includeSample: true });
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  const response = await largeRenderedCrawlResponseForRow(env, loaded.row);
  const readiness = response.mergeReadiness;
  if (!readiness.ready) {
    return jsonNoStore({ error: "Large crawl cannot merge yet.", blockers: readiness.blockers, progress: readiness.progress }, 409);
  }
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_jobs SET status = 'ready_to_merge', merge_status = 'ready', updated_at = ? WHERE id = ?`
  ).bind(now, id).run();
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(id).first();
  const updated = await largeRenderedCrawlResponseForRow(env, row);
  return jsonNoStore(
    options.api
      ? { ok: true, status: "ready_to_merge", large_crawl: apiLargeRenderedCrawlResponse(updated) }
      : { ok: true, status: "ready_to_merge", largeCrawl: updated }
  );
}

async function insertLargeRenderedCrawl(env, created = {}) {
  const job = created.job;
  const jobStatement = env.WAITLIST_DB.prepare(
    `INSERT INTO large_crawl_jobs
      (id, owner_email, owner_session_hash, owner_invite_id, access_mode, target_url, target_host, incremental_mode, previous_crawl_job_id, crawl_fingerprint, target_pages, batch_size, max_concurrency, crawl_delay_ms, max_retries, status, frontier_url_count, frontier_stored_count, frontier_ingestion_status, rendered_url_count, failed_url_count, completed_batch_count, total_batch_count, inventory_status, inventory_summary_json, merge_status, report_id, error, created_at, updated_at, started_at, completed_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    job.id,
    job.ownerEmail,
    job.ownerSessionHash || null,
    job.ownerInviteId || null,
    job.accessMode || "self-serve",
    job.targetUrl,
    job.targetHost,
    job.incrementalMode ? 1 : 0,
    job.previousCrawlJobId || null,
    job.crawlFingerprint || null,
    job.targetPages,
    job.batchSize,
    job.maxConcurrency,
    job.crawlDelayMs,
    job.maxRetries,
    job.status,
    job.frontierUrlCount,
    job.frontierStoredCount || job.frontierUrlCount,
    job.frontierIngestionStatus || "complete",
    job.renderedUrlCount,
    job.failedUrlCount,
    job.completedBatchCount,
    job.totalBatchCount,
    job.inventoryStatus || null,
    JSON.stringify(job.inventorySummary || {}),
    job.mergeStatus || "blocked",
    job.reportId || null,
    job.error || null,
    job.createdAt,
    job.updatedAt,
    job.startedAt || null,
    job.completedAt || null,
    job.expiresAt
  );
  const batchStatements = (created.batches || []).map((batch) =>
    env.WAITLIST_DB.prepare(
      `INSERT INTO large_crawl_batches
        (id, crawl_job_id, batch_index, start_index, end_index, planned_url_count, rendered_url_count, failed_url_count, status, retry_count, error, leased_at, started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      batch.id,
      batch.crawlJobId,
      batch.batchIndex,
      batch.startIndex,
      batch.endIndex,
      batch.plannedUrlCount,
      batch.renderedUrlCount,
      batch.failedUrlCount,
      batch.status,
      batch.retryCount,
      batch.error || null,
      batch.leasedAt || null,
      batch.startedAt || null,
      batch.completedAt || null,
      batch.createdAt,
      batch.updatedAt
    )
  );
  await env.WAITLIST_DB.batch([jobStatement, ...batchStatements]);
  await runD1BatchChunks(env, (created.frontierRows || []).map((row) => largeCrawlFrontierInsertStatement(env, row)), 100);
}

async function ingestRemainingLargeRenderedCrawlFrontier(env, jobId, normalized = {}, access = {}) {
  if (!env.WAITLIST_DB || !jobId || !normalized.targetUrl) return;
  try {
    const inventory = await buildCrawlInventory(normalized.targetUrl, {
      includeUrls: true,
      maxUrls: normalized.targetPages,
      fetcher: fetch
    });
    const full = createLargeRenderedCrawlJob({
      id: jobId,
      ownerEmail: access.ownerEmail,
      accessMode: access.accessMode || "self-serve",
      targetUrl: normalized.targetUrl,
      targetPages: normalized.targetPages,
      batchSize: normalized.batchSize,
      maxConcurrency: normalized.maxConcurrency,
      crawlDelayMs: normalized.crawlDelayMs,
      inventoryUrls: inventory.urls || [],
      seedUrls: normalized.seedUrls,
      idFactory: workerLargeCrawlId
    });
    const [existingUrls, existingBatches] = await Promise.all([
      env.WAITLIST_DB.prepare(`SELECT normalized_url FROM large_crawl_frontier WHERE crawl_job_id = ?`).bind(jobId).all(),
      env.WAITLIST_DB.prepare(`SELECT batch_index FROM large_crawl_batches WHERE crawl_job_id = ?`).bind(jobId).all()
    ]);
    const urlSet = new Set((existingUrls.results || []).map((row) => row.normalized_url).filter(Boolean));
    const batchIndexSet = new Set((existingBatches.results || []).map((row) => Number(row.batch_index || 0)).filter(Boolean));
    const missingBatches = full.batches.filter((batch) => !batchIndexSet.has(Number(batch.batchIndex || 0)));
    const missingFrontierRows = full.frontierRows.filter((row) => !urlSet.has(row.normalizedUrl || row.url || ""));
    await runD1BatchChunks(env, missingBatches.map((batch) => largeCrawlBatchInsertStatement(env, batch)), 100);
    await runD1BatchChunks(env, missingFrontierRows.map((row) => largeCrawlFrontierInsertStatement(env, row)), 100);
    const now = new Date().toISOString();
    const fingerprint = await largeCrawlFingerprint(normalized.targetUrl, full.frontierRows);
    await env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_jobs
       SET frontier_url_count = ?, frontier_stored_count = ?, frontier_ingestion_status = ?, total_batch_count = ?, inventory_status = ?, inventory_summary_json = ?, crawl_fingerprint = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      full.frontierRows.length,
      full.frontierRows.length,
      largeCrawlFrontierIngestionStatus(full.frontierRows.length, normalized.targetPages, inventory),
      full.batches.length,
      inventory.status || "empty",
      JSON.stringify(inventory.summary || {}),
      fingerprint,
      now,
      jobId
    ).run();
  } catch (error) {
    await env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_jobs SET frontier_ingestion_status = 'failed', error = ?, updated_at = ? WHERE id = ?`
    ).bind(cleanText(error?.message || "Frontier ingestion failed.", 500), new Date().toISOString(), jobId).run();
  }
}

function largeCrawlFrontierIngestionStatus(frontierCount = 0, targetPages = 0, inventory = {}) {
  const stored = Number(frontierCount || 0);
  if (!stored) return "empty";
  if (stored >= Number(targetPages || 0)) return "complete";
  return inventory.summary?.truncated ? "partial" : "complete";
}

function largeCrawlBatchInsertStatement(env, batch = {}) {
  return env.WAITLIST_DB.prepare(
    `INSERT INTO large_crawl_batches
      (id, crawl_job_id, batch_index, start_index, end_index, planned_url_count, rendered_url_count, failed_url_count, status, retry_count, error, leased_at, started_at, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    batch.id,
    batch.crawlJobId,
    batch.batchIndex,
    batch.startIndex,
    batch.endIndex,
    batch.plannedUrlCount,
    batch.renderedUrlCount,
    batch.failedUrlCount,
    batch.status,
    batch.retryCount,
    batch.error || null,
    batch.leasedAt || null,
    batch.startedAt || null,
    batch.completedAt || null,
    batch.createdAt,
    batch.updatedAt
  );
}

function largeCrawlFrontierInsertStatement(env, row = {}) {
  return env.WAITLIST_DB.prepare(
    `INSERT INTO large_crawl_frontier
      (id, crawl_job_id, batch_id, batch_index, url, normalized_url, status, retry_count, last_error, discovered_from, depth, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id,
    row.crawlJobId,
    row.batchId,
    row.batchIndex,
    row.url,
    row.normalizedUrl,
    row.status,
    row.retryCount,
    row.lastError || null,
    row.discoveredFrom || null,
    row.depth || 0,
    row.priority || 0,
    row.createdAt,
    row.updatedAt
  );
}

function largeCrawlProofInsertStatement(env, row = {}) {
  return env.WAITLIST_DB.prepare(
    `INSERT OR REPLACE INTO large_crawl_url_proofs
      (id, crawl_job_id, batch_id, frontier_id, url, final_url, status_code, content_type, title, description, h1s_json, canonical, robots, internal_links_count, external_links_count, schema_types_json, resource_timing_json, issue_facts_json, rendered_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id,
    row.crawlJobId,
    row.batchId,
    row.frontierId,
    row.url,
    row.finalUrl || null,
    row.statusCode || 0,
    row.contentType || null,
    row.title || null,
    row.description || null,
    JSON.stringify(row.h1s || []),
    row.canonical || null,
    row.robots || null,
    row.internalLinksCount || 0,
    row.externalLinksCount || 0,
    JSON.stringify(row.schemaTypes || []),
    JSON.stringify(row.resourceTiming || {}),
    JSON.stringify(row.issueFacts || {}),
    row.renderedAt,
    row.createdAt
  );
}

async function listLargeRenderedCrawlRows(env, access) {
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM large_crawl_jobs
     WHERE owner_email = ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at DESC
     LIMIT 50`
  ).bind(access.ownerEmail, new Date().toISOString()).all();
  return rows.results || [];
}

async function loadLargeRenderedCrawlFromRequest(request, env, access, prefix) {
  const id = pathId(request.url, prefix);
  return loadLargeRenderedCrawl(env, access, id);
}

async function loadLargeRenderedCrawl(env, access, id) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_jobs WHERE id = ? AND owner_email = ? LIMIT 1`
  ).bind(id, access.ownerEmail).first();
  if (!row?.id) return { ok: false, status: 404, error: "Large crawl not found." };
  const batches = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_batches WHERE crawl_job_id = ? ORDER BY batch_index ASC`
  ).bind(id).all();
  return { ok: true, row, batches: batches.results || [] };
}

async function largeRenderedCrawlResponseForRow(env, row = {}) {
  const loaded = await loadLargeRenderedCrawl(env, { ownerEmail: row.owner_email }, row.id);
  const frontier = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_frontier WHERE crawl_job_id = ? ORDER BY priority ASC LIMIT 20`
  ).bind(row.id).all();
  const proofs = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_url_proofs WHERE crawl_job_id = ? ORDER BY rendered_at DESC LIMIT 20`
  ).bind(row.id).all();
  const deadLetters = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count FROM large_crawl_dead_letters WHERE crawl_job_id = ? AND status = 'open'`
  ).bind(row.id).first();
  const job = largeCrawlJobFromRow(row);
  const batches = (loaded.batches || []).map(largeCrawlBatchFromRow);
  const sampleFrontier = (frontier.results || []).map(largeCrawlFrontierFromRow);
  const sampleProof = (proofs.results || []).map(largeCrawlProofFromRow);
  const response = largeRenderedCrawlResponse(job, batches, sampleFrontier, sampleProof);
  return {
    ...response,
    inventory: {
      status: row.inventory_status || "",
      summary: parseJson(row.inventory_summary_json, {})
    },
    incrementalMode: Boolean(row.incremental_mode),
    previousCrawlJobId: row.previous_crawl_job_id || "",
    crawlFingerprint: row.crawl_fingerprint || "",
    frontierIngestionStatus: row.frontier_ingestion_status || "pending",
    frontierStoredCount: Number(row.frontier_stored_count || row.frontier_url_count || 0),
    mergeStatus: row.merge_status || "blocked",
    mergeReadiness: largeRenderedCrawlMergeReadiness(job, batches, [], []),
    deadLetterCount: Number(deadLetters?.count || 0)
  };
}

async function refreshLargeCrawlCounters(env, jobId, batchId) {
  const now = new Date().toISOString();
  const [batchProofs, batchFailures, batchQueued, batchRendering] = await Promise.all([
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_url_proofs WHERE batch_id = ?`).bind(batchId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_frontier WHERE batch_id = ? AND status = 'failed'`).bind(batchId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_frontier WHERE batch_id = ? AND status = 'queued'`).bind(batchId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_frontier WHERE batch_id = ? AND status = 'rendering'`).bind(batchId).first()
  ]);
  const failedRows = Number(batchFailures?.count || 0);
  const queuedRows = Number(batchQueued?.count || 0);
  const renderingRows = Number(batchRendering?.count || 0);
  const batchStatus = failedRows ? "failed" : renderingRows ? "running" : queuedRows ? "queued" : "completed";
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_batches
     SET status = ?, rendered_url_count = ?, failed_url_count = ?, completed_at = ?, error = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    batchStatus,
    Number(batchProofs?.count || 0),
    failedRows,
    batchStatus === "completed" ? now : null,
    failedRows ? `${failedRows} URL proofs failed in this batch.` : null,
    now,
    batchId
  ).run();

  const [renderedRows, failedUrls, completedBatches, failedBatches, totalBatches, job] = await Promise.all([
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_url_proofs WHERE crawl_job_id = ?`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_frontier WHERE crawl_job_id = ? AND status = 'failed'`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_batches WHERE crawl_job_id = ? AND status = 'completed'`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_batches WHERE crawl_job_id = ? AND status = 'failed'`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_batches WHERE crawl_job_id = ?`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT frontier_url_count, frontier_ingestion_status FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(jobId).first()
  ]);
  const renderedCount = Number(renderedRows?.count || 0);
  const failedCount = Number(failedUrls?.count || 0);
  const completedCount = Number(completedBatches?.count || 0);
  const failedBatchCount = Number(failedBatches?.count || 0);
  const totalBatchCount = Number(totalBatches?.count || 0);
  const frontierCount = Number(job?.frontier_url_count || 0);
  const frontierIngestionComplete = ["", "complete"].includes(job?.frontier_ingestion_status || "complete");
  const ready = frontierIngestionComplete && frontierCount > 0 && renderedCount >= frontierCount && completedCount === totalBatchCount && failedCount === 0 && failedBatchCount === 0;
  const status = ready ? "ready_to_merge" : failedBatchCount || failedCount ? "retrying" : "running";
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_jobs
     SET status = ?, rendered_url_count = ?, failed_url_count = ?, completed_batch_count = ?, total_batch_count = ?, merge_status = ?, updated_at = ?, completed_at = ?
     WHERE id = ?`
  ).bind(status, renderedCount, failedCount, completedCount, totalBatchCount, ready ? "ready" : "blocked", now, ready ? now : null, jobId).run();
}

async function activeLargeRenderedCrawlForTarget(env, access, targetUrl) {
  return env.WAITLIST_DB.prepare(
    `SELECT *
     FROM large_crawl_jobs
     WHERE owner_email = ?
       AND target_url = ?
       AND status IN ('queued', 'running', 'retrying', 'ready_to_merge')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(access.ownerEmail, targetUrl, new Date().toISOString()).first();
}

async function activeLargeRenderedCrawlCount(env, access) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM large_crawl_jobs
     WHERE owner_email = ?
       AND status IN ('queued', 'running', 'retrying')
       AND (expires_at IS NULL OR expires_at > ?)`
  ).bind(access.ownerEmail, new Date().toISOString()).first();
  return Number(row?.count || 0);
}

async function latestLargeRenderedCrawlForTarget(env, access, targetUrl) {
  return env.WAITLIST_DB.prepare(
    `SELECT id
     FROM large_crawl_jobs
     WHERE owner_email = ?
       AND target_url = ?
       AND status IN ('ready_to_merge', 'completed')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at DESC
     LIMIT 1`
  ).bind(access.ownerEmail, targetUrl, new Date().toISOString()).first();
}

async function largeCrawlQuotaStatus(request, env, access, targetUrl) {
  const day = dayWindow(new Date());
  const targetKey = safeHostname(targetUrl).replace(/[^a-z0-9.-]/gi, "").slice(0, 120);
  const sessionKey = String(access.sessionHash || access.apiTokenId || access.ownerEmail || "").slice(0, 32);
  return checkQuotaSet(env, [
    {
      bucket: `large-crawl:session-day:${day.key}:${sessionKey}`,
      limit: 2,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily large-crawl limit reached. Try again tomorrow."
    },
    {
      bucket: `large-crawl:target-day:${day.key}:${targetKey}`,
      limit: 1,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "That site already has a large crawl queued today."
    }
  ]);
}

function largeCrawlBillingStatus(env, access = {}) {
  if (access.accessMode === "founder-override") return { ok: true };
  if (String(env.SEOFIXKIT_LARGE_CRAWL_ENABLED || "").toLowerCase() === "true") return { ok: true };
  return {
    ok: false,
    status: 402,
    code: "LARGE_CRAWL_PLAN_REQUIRED",
    error: "Large rendered crawls require an enabled large-crawl plan before browser workers run."
  };
}

function largeCrawlJobFromRow(row = {}) {
  return {
    id: row.id || "",
    ownerEmail: row.owner_email || "",
    accessMode: row.access_mode || "self-serve",
    targetUrl: row.target_url || "",
    targetHost: row.target_host || "",
    incrementalMode: Boolean(row.incremental_mode),
    previousCrawlJobId: row.previous_crawl_job_id || "",
    crawlFingerprint: row.crawl_fingerprint || "",
    targetPages: Number(row.target_pages || 0),
    batchSize: Number(row.batch_size || 1000),
    maxConcurrency: Number(row.max_concurrency || 4),
    crawlDelayMs: Number(row.crawl_delay_ms || 250),
    maxRetries: Number(row.max_retries || LARGE_RENDERED_CRAWL_MAX_RETRIES),
    status: row.status || "queued",
    frontierUrlCount: Number(row.frontier_url_count || 0),
    frontierIngestionStatus: row.frontier_ingestion_status || "pending",
    renderedUrlCount: Number(row.rendered_url_count || 0),
    failedUrlCount: Number(row.failed_url_count || 0),
    completedBatchCount: Number(row.completed_batch_count || 0),
    totalBatchCount: Number(row.total_batch_count || 0),
    reportId: row.report_id || "",
    error: row.error || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    expiresAt: row.expires_at || ""
  };
}

function largeCrawlBatchFromRow(row = {}) {
  return {
    id: row.id || "",
    crawlJobId: row.crawl_job_id || "",
    batchIndex: Number(row.batch_index || 0),
    startIndex: Number(row.start_index || 0),
    endIndex: Number(row.end_index || 0),
    plannedUrlCount: Number(row.planned_url_count || 0),
    renderedUrlCount: Number(row.rendered_url_count || 0),
    failedUrlCount: Number(row.failed_url_count || 0),
    status: row.status || "queued",
    retryCount: Number(row.retry_count || 0),
    error: row.error || "",
    leasedAt: row.leased_at || "",
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function largeCrawlFrontierFromRow(row = {}) {
  return {
    id: row.id || "",
    crawlJobId: row.crawl_job_id || "",
    batchId: row.batch_id || "",
    batchIndex: Number(row.batch_index || 0),
    url: row.url || "",
    normalizedUrl: row.normalized_url || row.url || "",
    status: row.status || "queued",
    retryCount: Number(row.retry_count || 0),
    lastError: row.last_error || "",
    discoveredFrom: row.discovered_from || "",
    depth: Number(row.depth || 0),
    priority: Number(row.priority || 0),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function largeCrawlProofFromRow(row = {}) {
  return {
    id: row.id || "",
    crawlJobId: row.crawl_job_id || "",
    batchId: row.batch_id || "",
    frontierId: row.frontier_id || "",
    url: row.url || "",
    finalUrl: row.final_url || "",
    statusCode: Number(row.status_code || 0),
    title: row.title || "",
    canonical: row.canonical || "",
    renderedAt: row.rendered_at || ""
  };
}

function apiLargeRenderedCrawlResponse(response = {}) {
  return {
    large_crawl_id: response.id || "",
    status: response.status || "queued",
    url: response.targetUrl || "",
    target_host: response.targetHost || "",
    target_pages: response.targetPages || 0,
    batch_size: response.batchSize || 1000,
    max_concurrency: response.maxConcurrency || 4,
    crawl_delay_ms: response.crawlDelayMs || 250,
    max_retries: response.maxRetries || LARGE_RENDERED_CRAWL_MAX_RETRIES,
    progress: response.progress || {},
    batches: (response.batches || []).map(apiLargeCrawlBatchResponse),
    sample_frontier: (response.sampleFrontier || []).map(apiLargeCrawlFrontierResponse),
    sample_proof: response.sampleProof || [],
    inventory: response.inventory || {},
    incremental_mode: Boolean(response.incrementalMode),
    previous_crawl_job_id: response.previousCrawlJobId || "",
    crawl_fingerprint: response.crawlFingerprint || "",
    frontier_ingestion_status: response.frontierIngestionStatus || "pending",
    frontier_stored_count: response.frontierStoredCount || 0,
    merge_status: response.mergeStatus || "blocked",
    merge_readiness: response.mergeReadiness || {},
    dead_letter_count: response.deadLetterCount || 0,
    report_id: response.reportId || "",
    error: response.error || "",
    created_at: response.createdAt || "",
    updated_at: response.updatedAt || "",
    started_at: response.startedAt || "",
    completed_at: response.completedAt || "",
    expires_at: response.expiresAt || ""
  };
}

function largeCrawlBatchResponse(batch = {}) {
  return {
    id: batch.id || "",
    batchIndex: Number(batch.batchIndex || 0),
    startIndex: Number(batch.startIndex || 0),
    endIndex: Number(batch.endIndex || 0),
    plannedUrlCount: Number(batch.plannedUrlCount || 0),
    renderedUrlCount: Number(batch.renderedUrlCount || 0),
    failedUrlCount: Number(batch.failedUrlCount || 0),
    status: batch.status || "queued",
    retryCount: Number(batch.retryCount || 0),
    error: batch.error || "",
    updatedAt: batch.updatedAt || ""
  };
}

function apiLargeCrawlBatchResponse(batch = {}) {
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

function apiLargeCrawlFrontierResponse(row = {}) {
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
  const wantedUrl = stripUrlHash(input.url || input.targetUrl || input.target_url || "");
  return frontierRows.find((row) => row.batchId === batchId && row.id === wantedId) ||
    frontierRows.find((row) => row.batchId === batchId && stripUrlHash(row.url) === wantedUrl) ||
    null;
}

function largeCrawlBatchProofPath(rawUrl, prefix) {
  const pathname = new URL(rawUrl).pathname;
  const value = pathname.slice(prefix.length);
  const match = value.match(/^([^/]+)\/batches\/([^/]+)\/proof$/);
  return {
    jobId: decodeURIComponent(match?.[1] || ""),
    batchId: decodeURIComponent(match?.[2] || "")
  };
}

function pathId(rawUrl, prefix, suffix = "") {
  const pathname = new URL(rawUrl).pathname;
  const withoutPrefix = pathname.slice(prefix.length);
  const value = suffix && withoutPrefix.endsWith(suffix)
    ? withoutPrefix.slice(0, -suffix.length)
    : withoutPrefix;
  return decodeURIComponent(value.replace(/^\/|\/$/g, ""));
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

async function largeCrawlFingerprint(targetUrl = "", frontierRows = []) {
  return sha256Hex([
    targetUrl,
    ...(frontierRows || []).slice(0, 50000).map((row) => row.normalizedUrl || row.url || "")
  ].join("\n"));
}

async function getAccountSummary(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Account storage is not configured." }, 503);

  const [reports, fixRequests, auditJobs, siteClaims, auditSchedules] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT id, url, target_host, score, summary_json, created_at, expires_at
       FROM audit_reports
       WHERE owner_email = ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail, new Date().toISOString())
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM fix_requests
       WHERE owner_email = ?
         AND is_test = 0
       ORDER BY updated_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM audit_jobs
       WHERE owner_email = ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY updated_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail, new Date().toISOString())
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM site_claims
       WHERE owner_email = ?
         AND revoked_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM audit_schedules
       WHERE owner_email = ?
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all()
  ]);

  const recentReports = (reports.results || []).map((row) => {
    const summary = parseJson(row.summary_json, {});
    return {
      id: row.id,
      url: row.url,
      targetHost: row.target_host || safeHostname(row.url),
      score: row.score,
      pagesScanned: summary.pagesScanned || 0,
      totalFindings: summary.totalFindings || 0,
      guardedFalsePositives: summary.guardedFalsePositives || 0,
      reportPath: `/beta/reports/${row.id}`,
      createdAt: row.created_at,
      expiresAt: row.expires_at || ""
    };
  });
  const requests = (fixRequests.results || []).map((row) => billingFixRequestResponse(row));
  const recentAuditJobs = (auditJobs.results || []).map(auditJobResponse);
  const sites = (siteClaims.results || []).map(siteClaimResponse);
  const schedules = (auditSchedules.results || []).map(auditScheduleResponse);
  const verifiedSites = sites.filter((site) => site.status === "verified").length;

  return jsonNoStore({
    ok: true,
    owner: {
      email: access.ownerEmail,
      accessMode: access.accessMode
    },
    metrics: {
      reports: recentReports.length,
      fixRequests: requests.length,
      openFixRequests: requests.filter((request) => !["delivered", "refunded"].includes(request.status)).length,
      runningAudits: recentAuditJobs.filter((job) => ["queued", "running"].includes(job.status)).length,
      verifiedSites,
      monitors: schedules.length
    },
    recentReports,
    recentAuditJobs,
    sites,
    schedules,
    fixRequests: requests,
    nextActions: accountNextActions(recentReports, requests, sites, recentAuditJobs)
  });
}

function accountNextActions(reports, requests, sites = [], jobs = []) {
  if (!sites.some((site) => site.status === "verified")) {
    return [{ id: "verify-site", label: "Verify your site", detail: "Add a DNS TXT record or HTTPS file before self-serve audits run." }];
  }
  if (jobs.some((job) => ["queued", "running"].includes(job.status))) {
    return [{ id: "audit-running", label: "Audit running", detail: "The report will appear as soon as rendering and proof collection finish." }];
  }
  if (!reports.length) {
    return [{ id: "run-audit", label: "Run your first audit", detail: "Start with your homepage or highest-value product page." }];
  }
  if (reports.some((report) => Number(report.totalFindings || 0) > 0) && !requests.length) {
    return [{ id: "review-fixes", label: "Review proven fixes", detail: "Open a report and start a Fix Pack only when the findings are real." }];
  }
  if (requests.some((request) => ["paid", "in_progress"].includes(request.status))) {
    return [{ id: "watch-delivery", label: "Watch delivery status", detail: "Your billing page shows due dates, notes, delivery links, and rerun proof." }];
  }
  return [{ id: "rerun-later", label: "Keep the report handy", detail: "Rerun after meaningful content, template, or metadata changes." }];
}

function fixRequestAdminResponse(row, notifications = [], events = [], now = new Date().toISOString()) {
  return {
    ...fixRequestResponse(row, now),
    reportId: row.report_id,
    ownerEmail: row.owner_email,
    note: row.note || "",
    adminNote: row.admin_note || "",
    assignedTo: row.assigned_to || "",
    checkoutUrl: row.checkout_url || "",
    checkoutCreatedAt: row.checkout_created_at || "",
    productId: row.product_id || "",
    paymentId: row.payment_id || "",
    lastNotificationAt: row.last_notification_at || "",
    notificationError: row.notification_error || "",
    deliveryNotifiedAt: row.delivery_notified_at || "",
    deliveryNotificationError: row.delivery_notification_error || "",
    reportPath: `/beta/reports/${row.report_id}`,
    briefPath: `/api/reports/${row.report_id}/brief.md`,
    notifications: notifications.map((notification) => ({
      event: notification.event || "",
      recipientType: notification.recipient_type,
      recipientEmail: notification.recipient_email || "",
      status: notification.status,
      provider: notification.provider || "",
      providerMessageId: notification.provider_message_id || "",
      error: notification.error || "",
      createdAt: notification.created_at
    })),
    events: events.map((event) => ({
      event: event.event,
      actorType: event.actor_type || "",
      actorEmail: event.actor_email || "",
      fromStatus: event.from_status || "",
      toStatus: event.to_status || "",
      reason: event.reason || "",
      createdAt: event.created_at
    }))
  };
}

function groupNotificationsByFixRequest(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.fix_request_id)) groups.set(row.fix_request_id, []);
    groups.get(row.fix_request_id).push(row);
  }
  return groups;
}

function groupEventsByFixRequest(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.fix_request_id)) groups.set(row.fix_request_id, []);
    groups.get(row.fix_request_id).push(row);
  }
  return groups;
}

async function buildOpsSnapshot(env, options = {}) {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const fixWhere = options.includeTest ? "" : "is_test = 0";
  const openWhere = `${fixWhere ? `${fixWhere} AND ` : ""}status IN ('paid', 'in_progress')`;
  const dayAgo = isoSecondsFromNow(-24 * 60 * 60);
  const [
    openPaid,
    inProgress,
    overdue,
    deliveredToday,
    webhookErrors,
    emailErrors,
    oldestOpen,
    lastDigest,
    runningJobs,
    queuedJobs,
    failedJobs24h,
    overdueSchedules
  ] = await Promise.all([
    countRows(env, "fix_requests", openWhere),
    countRows(env, "fix_requests", `${fixWhere ? `${fixWhere} AND ` : ""}status = 'in_progress'`),
    countRows(env, "fix_requests", `${openWhere} AND due_at IS NOT NULL AND due_at < ?`, [now]),
    countRows(env, "fix_requests", `${fixWhere ? `${fixWhere} AND ` : ""}delivered_at >= ?`, [`${today}T00:00:00.000Z`]),
    countRows(env, "dodo_webhook_events", "status = 'error'"),
    countRows(env, "fix_request_notifications", "status = 'error'"),
    env.WAITLIST_DB.prepare(`SELECT created_at FROM fix_requests WHERE ${openWhere} ORDER BY created_at ASC LIMIT 1`).first(),
    env.WAITLIST_DB.prepare(`SELECT digest_key, status, sent_at, error FROM ops_digest_runs ORDER BY created_at DESC LIMIT 1`).first(),
    countRows(env, "audit_jobs", "status = 'running'"),
    countRows(env, "audit_jobs", "status = 'queued'"),
    countRows(env, "audit_jobs", "status = 'failed' AND completed_at >= ?", [dayAgo]),
    countRows(env, "audit_schedules", "status = 'active' AND next_run_at < ?", [isoSecondsFromNow(-60 * 60)])
  ]);
  return {
    openPaid,
    inProgress,
    overdue,
    deliveredToday,
    webhookErrors,
    emailErrors,
    oldestOpenCreatedAt: oldestOpen?.created_at || "",
    lastDigest: lastDigest || null,
    runningJobs,
    queuedJobs,
    failedJobs24h,
    overdueSchedules
  };
}

// Same-day urgent alerts for conditions that should not wait for the daily
// digest. Each condition alerts at most once per day via an INSERT OR IGNORE
// marker row in ops_digest_runs.
async function sendUrgentOpsAlerts(env) {
  if (!env.WAITLIST_DB) return;
  const adminEmail = adminNotificationEmail(env);
  if (!adminEmail || !isEmailConfigured(env)) return;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const [webhookErrors24h, notificationErrors, failedJobsHour, overduePaid] = await Promise.all([
    countRows(env, "dodo_webhook_events", "status = 'error' AND last_received_at >= ?", [isoSecondsFromNow(-24 * 60 * 60)]),
    countRows(env, "fix_requests", "is_test = 0 AND notification_error != ''"),
    countRows(env, "audit_jobs", "status = 'failed' AND completed_at >= ?", [isoSecondsFromNow(-60 * 60)]),
    countRows(env, "fix_requests", "is_test = 0 AND status IN ('paid', 'in_progress') AND due_at IS NOT NULL AND due_at < ?", [now])
  ]);

  const conditions = [];
  if (webhookErrors24h > 0) {
    conditions.push({ key: "webhook-errors", line: `${webhookErrors24h} Dodo webhook event(s) errored in the last 24 hours.` });
  }
  if (notificationErrors > 0) {
    conditions.push({ key: "notification-errors", line: `${notificationErrors} paid request(s) have customer email notification errors.` });
  }
  if (failedJobsHour >= 5) {
    conditions.push({ key: "audit-failures", line: `${failedJobsHour} audits failed in the last hour.` });
  }
  if (overduePaid > 0) {
    conditions.push({ key: "overdue-paid", line: `${overduePaid} paid Fix Pack request(s) are past their due date.` });
  }

  for (const condition of conditions) {
    const alertKey = `alert:${condition.key}:${today}`;
    const inserted = await env.WAITLIST_DB.prepare(
      `INSERT OR IGNORE INTO ops_digest_runs (digest_key, status, summary_json, sent_at, error, created_at, updated_at)
       VALUES (?, 'running', '', '', '', ?, ?)`
    )
      .bind(alertKey, now, now)
      .run();
    if (inserted?.meta?.changes === 0) continue;
    try {
      await sendWorkerEmail(env, {
        to: adminEmail,
        subject: `SEO Fix Kit alert: ${condition.line}`,
        text: `${condition.line}\n\nAdmin queue: https://seofixkit.com/beta/admin`,
        html: `<p>${escapeHtml(condition.line)}</p><p><a href="https://seofixkit.com/beta/admin">Open admin queue</a></p>`,
        tag: "ops-alert"
      });
      await env.WAITLIST_DB.prepare(
        `UPDATE ops_digest_runs SET status = 'sent', sent_at = ?, updated_at = ? WHERE digest_key = ?`
      )
        .bind(new Date().toISOString(), new Date().toISOString(), alertKey)
        .run();
    } catch (error) {
      await env.WAITLIST_DB.prepare(
        `UPDATE ops_digest_runs SET status = 'error', error = ?, updated_at = ? WHERE digest_key = ?`
      )
        .bind(String(error?.message || "Alert failed.").slice(0, 1000), new Date().toISOString(), alertKey)
        .run();
    }
  }
}

async function sendDailyOpsDigest(env) {
  if (!env.WAITLIST_DB) return;
  const digestKey = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const inserted = await env.WAITLIST_DB.prepare(
    `INSERT OR IGNORE INTO ops_digest_runs (digest_key, status, summary_json, sent_at, error, created_at, updated_at)
     VALUES (?, 'running', '', '', '', ?, ?)`
  )
    .bind(digestKey, now, now)
    .run();
  if (inserted?.meta?.changes === 0) return;

  let snapshot = null;
  try {
    snapshot = await buildOpsSnapshot(env);
    const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com").replace(/\/+$/, "");
    const adminEmail = adminNotificationEmail(env);
    if (!adminEmail || !isEmailConfigured(env)) {
      await env.WAITLIST_DB.prepare(
        `UPDATE ops_digest_runs SET status = 'skipped', summary_json = ?, error = ?, updated_at = ? WHERE digest_key = ?`
      )
        .bind(JSON.stringify(snapshot), "missing_email_config", new Date().toISOString(), digestKey)
        .run();
      return;
    }

    const email = buildOpsDigestEmail({ appOrigin, snapshot });
    await sendWorkerEmail(env, {
      to: adminEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      tag: "ops-digest"
    });
    await env.WAITLIST_DB.prepare(
      `UPDATE ops_digest_runs SET status = 'sent', summary_json = ?, sent_at = ?, error = '', updated_at = ? WHERE digest_key = ?`
    )
      .bind(JSON.stringify(snapshot), new Date().toISOString(), new Date().toISOString(), digestKey)
      .run();
  } catch (error) {
    await env.WAITLIST_DB.prepare(
      `UPDATE ops_digest_runs SET status = 'error', summary_json = ?, error = ?, updated_at = ? WHERE digest_key = ?`
    )
      .bind(JSON.stringify(snapshot || {}), String(error?.message || "Digest failed.").slice(0, 1000), new Date().toISOString(), digestKey)
      .run();
  }
}
