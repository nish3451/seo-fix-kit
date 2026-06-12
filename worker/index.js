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
import {
  apiClaimLargeRenderedCrawlBatch,
  apiCreateLargeRenderedCrawl,
  apiGetLargeRenderedCrawl,
  apiListLargeRenderedCrawls,
  apiMarkLargeRenderedCrawlReadyToMerge,
  apiProcessLargeRenderedCrawlBatch,
  apiRetryLargeRenderedCrawl,
  apiSaveLargeRenderedCrawlBatchProof,
  claimLargeRenderedCrawlBatch,
  createLargeRenderedCrawl,
  getLargeRenderedCrawl,
  listLargeRenderedCrawls,
  markLargeRenderedCrawlReadyToMerge,
  processLargeRenderedCrawlBatch,
  retryLargeRenderedCrawl,
  runDueLargeRenderedCrawlWorkers,
  saveLargeRenderedCrawlBatchProof
} from "./routes/large-crawls.js";

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
