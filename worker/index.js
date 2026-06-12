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
  buildCompetitorBenchmark,
  competitorBenchmarkBriefLines
} from "../shared/competitor-benchmark.js";
import {
  backlinkAuditBriefLines,
  buildBacklinkAudit,
  backlinkRowsKey,
  parseBacklinkRows
} from "../shared/backlink-audit.js";
import {
  buildLocalSeoAudit,
  localSeoAuditBriefLines,
  localSeoInputKey,
  localSeoInputSummary,
  parseLocalSeoInput
} from "../shared/local-seo-audit.js";
import {
  buildKeywordRankAudit,
  keywordRankAuditBriefLines,
  keywordRowsKey,
  keywordRowsSummary,
  parseKeywordRows
} from "../shared/keyword-rank-audit.js";
import {
  crawlDepthSummary,
  normalizeCrawlLimit
} from "../shared/crawl-depth.js";
import {
  buildCrawlInventory,
  crawlInventoryBriefLines
} from "../shared/crawl-inventory.js";
import {
  buildRenderedCrawlScalePlan,
  normalizeRenderedCrawlTarget,
  renderedCrawlTargetSummary,
  renderedCrawlScaleBriefLines
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
  buildCrawlIntelligence,
  crawlIntelligenceBriefLines
} from "../shared/crawl-intelligence.js";
import {
  appendReportDeltaBrief,
  buildReportDelta
} from "../shared/report-delta.js";
import {
  buildResourceWaterfall,
  resourceWaterfallBriefLines,
  resourceWaterfallFindings
} from "../shared/resource-waterfall.js";
import {
  buildPlatformSeoAudit,
  platformSeoAuditBriefLines
} from "../shared/platform-seo-audit.js";

const DOCS = {
  javascript:
    "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  title: "https://developers.google.com/search/docs/appearance/title-link",
  snippets: "https://developers.google.com/search/docs/appearance/snippet",
  structuredData:
    "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
  hreflang: "https://developers.google.com/search/docs/specialty/international/localized-versions",
  coreWebVitals: "https://developers.google.com/search/docs/appearance/core-web-vitals",
  linkBestPractices: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable"
};

const MAX_HTML_BYTES = 1_000_000;
const RESOURCE_LIMITS = {
  linksPerPage: 50,
  imagesPerPage: 25,
  maxRedirects: 5,
  timeoutMs: 7000,
  largeHtmlBytes: 500_000,
  largeImageBytes: 500_000,
  slowRenderMs: 4000
};
const PERFORMANCE_LIMITS = {
  poorScore: 50,
  needsImprovementScore: 75,
  lcpPoorMs: 4000,
  lcpNeedsImprovementMs: 2500,
  clsPoor: 0.25,
  clsNeedsImprovement: 0.1,
  tbtPoorMs: 600,
  tbtNeedsImprovementMs: 300,
  fcpNeedsImprovementMs: 1800,
  speedIndexNeedsImprovementMs: 3400
};
const VERSION = "0.9.0";
const SESSION_COOKIE = "sfk_beta_session";
const ADMIN_SESSION_COOKIE = "sfk_admin_session";
const BETA_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 2;
const ACCESS_LINK_TTL_SECONDS = 60 * 15;
const REPORT_RETENTION_DAYS = 30;
const REPORT_SHARE_PASSWORD_MIN_LENGTH = 10;
const REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS = 120_000;
const LARGE_RENDERED_CRAWL_LEASE_MS = 15 * 60 * 1000;
const LARGE_RENDERED_CRAWL_SYNC_FRONTIER_LIMIT = 1000;
const DEFAULT_INVITE_TTL_DAYS = 14;
const FIX_PACK_OFFER = {
  name: "SEO Fix Pack",
  productKey: "seofixkit_fix_pack",
  description: "One proof-backed repair pass for this report plus one rerun after fixes."
};
const FIX_PACK_DUE_DAYS = 5;
const FIX_PACK_NEXT_UPDATE_DAYS = 2;
const PAID_LIKE_FIX_REQUEST_STATUSES = new Set(["paid", "in_progress", "delivered"]);
const REBUY_BLOCKED_FIX_REQUEST_STATUSES = new Set(["refunded", "refund_failed", "disputed"]);
const CHECKOUT_URL_TTL_HOURS = 24;
const EMAIL_PROVIDER = "cloudflare_email";

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

async function joinWaitlist(request, env) {
  if (!env.WAITLIST_DB) {
    return json({ error: "Waitlist storage is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  if (body.company) {
    return json({ ok: true, status: "joined" });
  }

  const submitMs = Number(body.timeToSubmitMs || 0);
  if (submitMs > 0 && submitMs < 1200) {
    return json({ ok: true, status: "joined" });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const quota = await waitlistQuotaStatus(request, env);
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  const now = new Date().toISOString();
  const utm = typeof body.utm === "object" && body.utm ? body.utm : {};
  const source = cleanText(body.source || "locked-homepage", 80);
  const utmSource = cleanText(utm.source || body.utm_source || "", 120);
  const utmMedium = cleanText(utm.medium || body.utm_medium || "", 120);
  const utmCampaign = cleanText(utm.campaign || body.utm_campaign || "", 180);
  const utmTerm = cleanText(utm.term || body.utm_term || "", 180);
  const utmContent = cleanText(utm.content || body.utm_content || "", 180);
  const landingPath = cleanText(body.landingPath || "/", 500);
  const referrer = cleanText(request.headers.get("referer") || "", 500);
  const userAgent = cleanText(request.headers.get("user-agent") || "", 500);
  const country = cleanText(request.cf?.country || "", 8);

  await env.WAITLIST_DB.prepare(
    `INSERT INTO waitlist_leads
      (email, source, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path, submit_ms, referrer, user_agent, country, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
      source = excluded.source,
      utm_source = excluded.utm_source,
      utm_medium = excluded.utm_medium,
      utm_campaign = excluded.utm_campaign,
      utm_term = excluded.utm_term,
      utm_content = excluded.utm_content,
      landing_path = excluded.landing_path,
      submit_ms = excluded.submit_ms,
      referrer = excluded.referrer,
      user_agent = excluded.user_agent,
      country = excluded.country,
      updated_at = excluded.updated_at`
  )
    .bind(
      email,
      source,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      landingPath,
      Number.isFinite(submitMs) ? Math.round(submitMs) : null,
      referrer,
      userAgent,
      country,
      now,
      now
    )
    .run();

  return json({ ok: true, status: "joined" });
}

async function requestAccessLink(request, env) {
  if (!env.WAITLIST_DB) {
    return jsonNoStore({ error: "Access link storage is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  if (body.company) return jsonNoStore({ ok: true, status: "requested" });

  const submitMs = Number(body.timeToSubmitMs || 0);
  if (submitMs > 0 && submitMs < 1200) {
    return jsonNoStore({ ok: true, status: "requested" });
  }

  const ownerEmail = normalizeEmail(body.email || body.ownerEmail);
  if (!ownerEmail) return jsonNoStore({ error: "Enter a valid email address." }, 400);

  const quota = await accessLinkQuotaStatus(request, env, ownerEmail);
  if (!quota.ok) return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);

  if (!isEmailConfigured(env)) {
    return jsonNoStore({ error: "Access email is not configured yet. Use an invite code for now." }, 503);
  }

  const now = new Date().toISOString();
  await recordWaitlistLead(request, env, ownerEmail, body, "self-serve-access", now);

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = isoSecondsFromNow(ACCESS_LINK_TTL_SECONDS);
  await env.WAITLIST_DB.prepare(
    `INSERT INTO access_tokens
      (token_hash, owner_email, purpose, created_at, expires_at, used_at, ip_hash, user_agent)
     VALUES (?, ?, 'self_serve_access', ?, ?, NULL, ?, ?)`
  )
    .bind(
      tokenHash,
      ownerEmail,
      now,
      expiresAt,
      await requestIpHash(request),
      cleanText(request.headers.get("user-agent") || "", 500)
    )
    .run();

  const origin = new URL(request.url).origin;
  const accessUrl = `${origin}/beta?access=${encodeURIComponent(token)}&email=${encodeURIComponent(ownerEmail)}`;
  try {
    await sendAccessLinkEmail(env, {
      ownerEmail,
      accessUrl,
      expiresAt,
      tokenHash
    });
  } catch (error) {
    await env.WAITLIST_DB.prepare("DELETE FROM access_tokens WHERE token_hash = ?").bind(tokenHash).run();
    return jsonNoStore({ error: error?.message || "Access email could not be sent." }, 503);
  }

  return jsonNoStore({
    ok: true,
    status: "sent",
    message: "Check your email for a secure access link.",
    expiresAt
  });
}

async function verifyAccessLink(request, env) {
  if (!env.WAITLIST_DB) {
    return jsonNoStore({ error: "Access link storage is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const token = cleanAccessToken(body.token || "");
  if (!token) return jsonNoStore({ error: "Access link is invalid." }, 400);

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT token_hash, owner_email, expires_at, used_at
     FROM access_tokens
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();

  if (!row?.token_hash || row.used_at || row.expires_at <= now) {
    return jsonNoStore({ error: "Access link is expired or already used." }, 401);
  }

  const update = await env.WAITLIST_DB.prepare(
    `UPDATE access_tokens
     SET used_at = ?
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
  )
    .bind(now, tokenHash, now)
    .run();

  if (Number(update?.meta?.changes || 0) !== 1) {
    return jsonNoStore({ error: "Access link is expired or already used." }, 401);
  }

  const session = await createBetaSession(request, env, {
    ownerEmail: row.owner_email,
    inviteId: null,
    accessMode: "self-serve"
  });
  const response = jsonNoStore({
    ok: true,
    status: "unlocked",
    ownerEmail: row.owner_email,
    accessMode: "self-serve",
    expiresAt: session.expiresAt
  });
  response.headers.append("set-cookie", session.cookie);
  return response;
}

async function sendAccessLinkEmail(env, { ownerEmail, accessUrl, expiresAt, tokenHash }) {
  const subject = "Your SEO Fix Kit access link";
  const text = [
    "Use this secure link to open SEO Fix Kit:",
    "",
    accessUrl,
    "",
    `This link expires at ${expiresAt} and can be used once.`,
    "SEO Fix Kit audits produce proof-backed repair briefs. No ranking promises are made."
  ].join("\n");
  const html = [
    "<p>Use this secure link to open SEO Fix Kit:</p>",
    `<p><a href="${escapeHtml(accessUrl)}">Open SEO Fix Kit</a></p>`,
    `<p>This link expires at ${escapeHtml(expiresAt)} and can be used once.</p>`,
    "<p>SEO Fix Kit audits produce proof-backed repair briefs. No ranking promises are made.</p>"
  ].join("");

  return sendWorkerEmail(env, {
    to: ownerEmail,
    subject,
    text,
    html,
    tag: "access-link"
  });
}

function emailSender(env) {
  return String(env.SEOFIXKIT_EMAIL_FROM || "").trim();
}

const SUPPORT_EMAIL = "support@seofixkit.com";
const EMAIL_FOOTER_TEXT = `\n\n--\nSEO Fix Kit · https://seofixkit.com\nQuestions or issues? Email ${SUPPORT_EMAIL}.`;
const EMAIL_FOOTER_HTML = `<hr style="border:none;border-top:1px solid #dddddd;margin:24px 0 12px" /><p style="color:#666666;font-size:13px">SEO Fix Kit · <a href="https://seofixkit.com">seofixkit.com</a> · Questions or issues? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`;

async function sendWorkerEmail(env, { to, subject, text, html, tag }) {
  // Reply-To must use the binding's replyTo field; Email Service rejects it as
  // a custom header (only whitelisted and X-* headers are accepted). The
  // binding also takes string[] for multiple recipients directly.
  const replyTo = normalizeEmail(env.SEOFIXKIT_REPLY_TO || env.POSTMARK_REPLY_TO || "");
  const result = await env.EMAIL.send({
    from: emailSender(env),
    to,
    subject,
    html: `${html || ""}${EMAIL_FOOTER_HTML}`,
    text: `${text || ""}${EMAIL_FOOTER_TEXT}`,
    ...(replyTo ? { replyTo } : {}),
    ...(tag ? { headers: { "X-SEOFIXKIT-Tag": tag } } : {})
  });
  return { messageId: result?.messageId || "" };
}

async function recordWaitlistLead(request, env, email, body = {}, sourceFallback = "locked-homepage", now = new Date().toISOString()) {
  const utm = typeof body.utm === "object" && body.utm ? body.utm : {};
  const submitMs = Number(body.timeToSubmitMs || 0);
  await env.WAITLIST_DB.prepare(
    `INSERT INTO waitlist_leads
      (email, source, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path, submit_ms, referrer, user_agent, country, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
      source = excluded.source,
      utm_source = excluded.utm_source,
      utm_medium = excluded.utm_medium,
      utm_campaign = excluded.utm_campaign,
      utm_term = excluded.utm_term,
      utm_content = excluded.utm_content,
      landing_path = excluded.landing_path,
      submit_ms = excluded.submit_ms,
      referrer = excluded.referrer,
      user_agent = excluded.user_agent,
      country = excluded.country,
      updated_at = excluded.updated_at`
  )
    .bind(
      email,
      cleanText(body.source || sourceFallback, 80),
      cleanText(utm.source || body.utm_source || "", 120),
      cleanText(utm.medium || body.utm_medium || "", 120),
      cleanText(utm.campaign || body.utm_campaign || "", 180),
      cleanText(utm.term || body.utm_term || "", 180),
      cleanText(utm.content || body.utm_content || "", 180),
      cleanText(body.landingPath || "/", 500),
      Number.isFinite(submitMs) ? Math.round(submitMs) : null,
      cleanText(request.headers.get("referer") || "", 500),
      cleanText(request.headers.get("user-agent") || "", 500),
      cleanText(request.cf?.country || "", 8),
      now,
      now
    )
    .run();
}

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

async function createAdminSession(request, env) {
  if (!env.WAITLIST_DB) return jsonNoStore({ error: "Admin storage is not configured." }, 503);
  const body = await request.json().catch(() => ({}));
  const expected = String(env.ADMIN_EXPORT_TOKEN || "");
  const provided = String(body.token || "").trim();
  const actorEmail =
    normalizeEmail(body.email || "") ||
    cleanText(request.headers.get("cf-access-authenticated-user-email") || "", 254) ||
    "bearer-admin";
  if (!expected || !constantTimeEqual(provided, expected)) {
    const quota = await adminFailureQuotaStatus(request, env);
    await logAdminAction(request, env, "create-admin-session", false, actorEmail);
    return jsonNoStore(
      { error: quota.ok ? "Unauthorized" : quota.error, ...(quota.resetAt ? { resetAt: quota.resetAt } : {}) },
      quota.ok ? 401 : 429
    );
  }

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = isoSecondsFromNow(ADMIN_SESSION_TTL_SECONDS);
  await env.WAITLIST_DB.prepare(
    `INSERT INTO admin_sessions
      (token_hash, actor_email, created_at, expires_at, last_seen_at, revoked_at, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
  )
    .bind(
      tokenHash,
      actorEmail,
      now,
      expiresAt,
      now,
      await requestIpHash(request),
      cleanText(request.headers.get("user-agent") || "", 500)
    )
    .run();
  await logAdminAction(request, env, "create-admin-session", true, actorEmail);
  const response = jsonNoStore({ ok: true, actorEmail, expiresAt });
  response.headers.append("set-cookie", adminSessionCookie(request, token, ADMIN_SESSION_TTL_SECONDS));
  return response;
}

async function revokeAdminSession(request, env) {
  const token = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (token && env.WAITLIST_DB) {
    await env.WAITLIST_DB.prepare(
      `UPDATE admin_sessions SET revoked_at = ?, last_seen_at = ? WHERE token_hash = ?`
    )
      .bind(new Date().toISOString(), new Date().toISOString(), await sha256Hex(token))
      .run();
  }
  const response = jsonNoStore({ ok: true });
  response.headers.append("set-cookie", clearAdminSessionCookie(request));
  return response;
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
       LIMIT 50`
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
    issuePatterns: summarizeIssuePatterns(issuePatterns.results || []),
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

async function betaLogin(request, env) {
  if (!env.WAITLIST_DB) {
    return json({ error: "Private beta sessions are not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const ownerEmail = normalizeEmail(body.email);
  if (!ownerEmail) {
    return json({ error: "Enter your beta email address." }, 400);
  }

  const rawInviteCode = cleanInviteCode(body.inviteCode || body.password || "");
  const inviteCodeHash = rawInviteCode ? await sha256Hex(rawInviteCode) : "";
  const loginQuota = await loginQuotaStatus(request, env, ownerEmail, inviteCodeHash);
  if (!loginQuota.ok) {
    return jsonNoStore({ error: loginQuota.error, resetAt: loginQuota.resetAt }, 429);
  }

  const invite = await inviteAccessStatus(request, env, ownerEmail, rawInviteCode, inviteCodeHash);
  if (!invite.ok) return betaAccessResponse(invite);

  const session = await createBetaSession(request, env, {
    ownerEmail,
    inviteId: invite.inviteId,
    accessMode: invite.accessMode
  });
  const response = jsonNoStore({
    ok: true,
    status: "unlocked",
    ownerEmail,
    inviteId: invite.inviteId,
    accessMode: invite.accessMode,
    expiresAt: session.expiresAt
  });
  response.headers.append("set-cookie", session.cookie);
  return response;
}

async function betaSession(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return jsonNoStore({
    ok: true,
    status: "active",
    ownerEmail: access.ownerEmail,
    inviteId: access.inviteId,
    accessMode: access.accessMode,
    expiresAt: access.expiresAt
  });
}

async function betaLogout(request, env) {
  const token = betaSessionTokenFromRequest(request);
  if (token && env.WAITLIST_DB) {
    const tokenHash = await sha256Hex(token);
    await env.WAITLIST_DB.prepare(
      `UPDATE beta_sessions
       SET revoked_at = ?, last_seen_at = ?
       WHERE token_hash = ?`
    )
      .bind(new Date().toISOString(), new Date().toISOString(), tokenHash)
      .run();
  }

  const response = jsonNoStore({ ok: true, status: "locked" });
  response.headers.append("set-cookie", clearSessionCookie(request));
  return response;
}

async function runPrivateAudit(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  let targetUrl = "";
  try {
    targetUrl = normalizeUrl(body.url || "");
  } catch {
    return json({ error: "Enter a valid public website URL." }, 400);
  }
  const publicUrlCheck = publicAuditUrlStatus(targetUrl);
  if (!publicUrlCheck.ok) {
    return json({ error: publicUrlCheck.error }, 400);
  }

  const competitorInput = parseAuditCompetitorUrls(body, targetUrl);
  if (!competitorInput.ok) {
    return jsonNoStore({ error: competitorInput.error }, 400);
  }
  const competitorUrls = competitorInput.urls;
  const backlinkInput = parseBacklinkRows(body, targetUrl, { allowPrivate: false });
  if (!backlinkInput.ok) {
    return jsonNoStore({ error: backlinkInput.error }, 400);
  }
  const backlinkRows = backlinkInput.rows;
  const localSeoInput = parseLocalSeoInput(body, targetUrl, { allowPrivate: false });
  if (!localSeoInput.ok) {
    return jsonNoStore({ error: localSeoInput.error }, 400);
  }
  const localSeo = localSeoInput.input;
  const keywordInput = parseKeywordRows(body, targetUrl, { allowPrivate: false });
  if (!keywordInput.ok) {
    return jsonNoStore({ error: keywordInput.error }, 400);
  }
  const keywordRows = keywordInput.rows;
  const renderedCrawlTarget = normalizeRenderedCrawlTarget(
    body.renderedCrawlTarget || body.rendered_crawl_target || body.crawlScaleTarget || 0
  );
  const maxPages = clampPageLimit(body.maxPages || 10);

  // A homepage-only Lite check (1 page, no imports or extras) may run before
  // site verification so new users can see proof quality first.
  const liteEligible =
    maxPages <= 1 &&
    !competitorUrls.length &&
    !backlinkRows.length &&
    !keywordRows.length &&
    !localSeo?.enabled &&
    !renderedCrawlTarget;
  const authorization = await auditAuthorizationStatus(env, access, targetUrl, { allowLite: liteEligible });
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
  if (authorization.lite) {
    const liteQuota = await liteAuditQuotaStatus(env, access);
    if (!liteQuota.ok) {
      return jsonNoStore({ error: liteQuota.error, resetAt: liteQuota.resetAt }, 429);
    }
  }

  await failStaleRunningAuditJobs(env, access.ownerEmail);
  const existingJob = await activeAuditJobForTarget(env, access, targetUrl, competitorUrls, backlinkRows, localSeo, keywordRows, renderedCrawlTarget, maxPages);
  if (existingJob) {
    return jsonNoStore(
      {
        ok: true,
        mode: "queued",
        deduped: true,
        job: auditJobResponse(existingJob),
        jobId: existingJob.id,
        statusUrl: `/api/audit/jobs/${existingJob.id}`
      },
      202
    );
  }

  const activeCount = await activeAuditJobCount(env, access);
  if (activeCount >= 3) {
    return jsonNoStore(
      {
        error: "You already have 3 audits running. Wait for one to finish before starting another.",
        code: "AUDIT_JOBS_ACTIVE_LIMIT"
      },
      429
    );
  }

  const quota = await auditQuotaStatus(request, env, access, targetUrl);
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  const job = await createAuditJob(env, access, targetUrl, maxPages, {
    competitorUrls,
    backlinkRows,
    localSeo,
    keywordRows,
    renderedCrawlTarget
  });
  const appOrigin = new URL(request.url).origin;
  const processing = processAuditJob(env, job.id, { appOrigin });
  if (ctx?.waitUntil) {
    ctx.waitUntil(processing);
  } else {
    await processing;
  }

  return jsonNoStore(
    {
      ok: true,
      mode: "queued",
      job: auditJobResponse(job),
      jobId: job.id,
      statusUrl: `/api/audit/jobs/${job.id}`
    },
    202
  );
}

async function listAuditSchedules(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Schedule storage is not configured." }, 503);

  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_schedules
     WHERE owner_email = ?
       AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 20`
  )
    .bind(access.ownerEmail)
    .all();

  return jsonNoStore({
    ok: true,
    schedules: (rows.results || []).map(auditScheduleResponse)
  });
}

async function createAuditSchedule(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Schedule storage is not configured." }, 503);

  let targetUrl = "";
  try {
    targetUrl = normalizeUrl(body.url || body.targetUrl || "");
  } catch {
    return json({ error: "Enter a valid public website URL." }, 400);
  }
  const publicUrlCheck = publicAuditUrlStatus(targetUrl);
  if (!publicUrlCheck.ok) {
    return json({ error: publicUrlCheck.error }, 400);
  }

  const authorization = await auditAuthorizationStatus(env, access, targetUrl);
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

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_schedules
     WHERE owner_email = ?
       AND target_url = ?
       AND status = 'active'
     LIMIT 1`
  )
    .bind(access.ownerEmail, targetUrl)
    .first();
  if (existing?.id) {
    return jsonNoStore({ ok: true, schedule: auditScheduleResponse(existing), deduped: true });
  }

  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM audit_schedules
     WHERE owner_email = ?
       AND status = 'active'`
  )
    .bind(access.ownerEmail)
    .first();
  if (Number(count?.count || 0) >= 5) {
    return jsonNoStore(
      {
        error: "You already have 5 active monitors. Pause one before adding another.",
        code: "AUDIT_SCHEDULE_LIMIT"
      },
      429
    );
  }

  const now = new Date().toISOString();
  const intervalDays = clampScheduleInterval(body.intervalDays || 7);
  const schedule = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    owner_session_hash: access.sessionHash || "",
    owner_invite_id: access.inviteId || "",
    access_mode: access.accessMode || "invite",
    target_url: targetUrl,
    target_host: safeHostname(targetUrl),
    max_pages: clampPageLimit(body.maxPages || 10),
    interval_days: intervalDays,
    status: "active",
    next_run_at: now,
    last_run_at: "",
    last_job_id: "",
    last_report_id: "",
    last_error: "",
    created_at: now,
    updated_at: now,
    paused_at: ""
  };

  await env.WAITLIST_DB.prepare(
    `INSERT INTO audit_schedules
      (id, owner_email, owner_session_hash, owner_invite_id, access_mode, target_url, target_host, max_pages, interval_days, status, next_run_at, last_run_at, last_job_id, last_report_id, last_error, created_at, updated_at, paused_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      schedule.id,
      schedule.owner_email,
      schedule.owner_session_hash,
      schedule.owner_invite_id || null,
      schedule.access_mode,
      schedule.target_url,
      schedule.target_host,
      schedule.max_pages,
      schedule.interval_days,
      schedule.status,
      schedule.next_run_at,
      null,
      null,
      null,
      null,
      schedule.created_at,
      schedule.updated_at,
      null
    )
    .run();

  return jsonNoStore({ ok: true, schedule: auditScheduleResponse(schedule) });
}

async function deleteAuditSchedule(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Schedule storage is not configured." }, 503);

  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/audit/schedules/".length));
  if (!isSafeUuid(id)) return json({ error: "Monitor not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE audit_schedules
     SET status = 'paused', paused_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) {
    return json({ error: "Monitor not found." }, 404);
  }
  return jsonNoStore({ ok: true, status: "paused", id });
}

async function getDeveloperApiSummary(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);

  const [tokens, webhooks] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM api_tokens
       WHERE owner_email = ?
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM api_webhooks
       WHERE owner_email = ?
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all()
  ]);

  return jsonNoStore({
    ok: true,
    apiBaseUrl: "/v1",
    authHeader: "Authorization: Bearer YOUR_API_KEY",
    tokens: (tokens.results || []).map(apiTokenResponse),
    webhooks: (webhooks.results || []).map(apiWebhookResponse),
    docs: {
      startAudit: "POST /v1/audits",
      getAudit: "GET /v1/audits/{audit_id}",
      getIssues: "GET /v1/audits/{audit_id}/issues",
      getReport: "GET /v1/audits/{audit_id}/report",
      startLargeCrawl: "POST /v1/large-crawls",
      getLargeCrawl: "GET /v1/large-crawls/{large_crawl_id}",
      claimLargeCrawlBatch: "POST /v1/large-crawls/{large_crawl_id}/batches/claim",
      processLargeCrawlBatch: "POST /v1/large-crawls/{large_crawl_id}/batches/process",
      projects: "GET /v1/projects"
    }
  });
}

async function createDeveloperApiToken(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);

  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM api_tokens
     WHERE owner_email = ?
       AND status = 'active'`
  )
    .bind(access.ownerEmail)
    .first();
  if (Number(count?.count || 0) >= 5) {
    return jsonNoStore({ error: "You already have 5 active API keys. Revoke one before creating another." }, 429);
  }

  const now = new Date().toISOString();
  const tokenSecret = randomApiTokenSecret();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    token_hash: await sha256Hex(tokenSecret),
    token_prefix: `${tokenSecret.slice(0, 12)}...${tokenSecret.slice(-4)}`,
    label: cleanText(body.label || "API key", 80),
    scopes_json: JSON.stringify(["audits:read", "audits:write", "large_crawls:read", "large_crawls:write", "projects:read", "projects:write"]),
    status: "active",
    created_at: now,
    updated_at: now,
    last_used_at: "",
    revoked_at: ""
  };

  await env.WAITLIST_DB.prepare(
    `INSERT INTO api_tokens
      (id, owner_email, token_hash, token_prefix, label, scopes_json, status, created_at, updated_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.owner_email,
      row.token_hash,
      row.token_prefix,
      row.label,
      row.scopes_json,
      row.status,
      row.created_at,
      row.updated_at,
      null,
      null
    )
    .run();

  return jsonNoStore({
    ok: true,
    token: apiTokenResponse(row),
    tokenSecret,
    message: "Copy this API key now. It will not be shown again."
  });
}

async function revokeDeveloperApiToken(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/developer/tokens/".length));
  if (!isSafeUuid(id)) return json({ error: "API key not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE api_tokens
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "API key not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function createDeveloperWebhook(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);
  const urlCheck = publicWebhookUrlStatus(body.url || "");
  if (!urlCheck.ok) return jsonNoStore({ error: urlCheck.error }, 400);
  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM api_webhooks
     WHERE owner_email = ?
       AND status = 'active'`
  )
    .bind(access.ownerEmail)
    .first();
  if (Number(count?.count || 0) >= 5) {
    return jsonNoStore({ error: "You already have 5 active webhooks. Revoke one before adding another." }, 429);
  }

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    url: urlCheck.url,
    events_json: JSON.stringify(cleanWebhookEvents(body.events)),
    status: "active",
    created_at: now,
    updated_at: now,
    last_delivery_at: "",
    last_delivery_status: "",
    last_error: "",
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO api_webhooks
      (id, owner_email, url, events_json, status, created_at, updated_at, last_delivery_at, last_delivery_status, last_error, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.owner_email,
      row.url,
      row.events_json,
      row.status,
      row.created_at,
      row.updated_at,
      null,
      null,
      null,
      null
    )
    .run();

  return jsonNoStore({
    ok: true,
    webhook: apiWebhookResponse(row),
    signingSecret: await apiWebhookSigningSecret(env, row.id),
    message: "Copy this signing secret now. It will not be shown again."
  });
}

async function revokeDeveloperWebhook(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/developer/webhooks/".length));
  if (!isSafeUuid(id)) return json({ error: "Webhook not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE api_webhooks
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Webhook not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getTeamMembers(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  return jsonNoStore({
    ok: true,
    members: await teamMembersForOwner(env, access.ownerEmail)
  });
}

async function createTeamMember(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  const memberEmail = normalizeEmail(body.email || body.memberEmail);
  if (!memberEmail) return jsonNoStore({ error: "Enter a valid teammate email." }, 400);
  if (memberEmail === access.ownerEmail) return jsonNoStore({ error: "You are already the workspace owner." }, 400);

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM team_members
     WHERE owner_email = ?
       AND member_email = ?
       AND status = 'active'
     LIMIT 1`
  )
    .bind(access.ownerEmail, memberEmail)
    .first();
  if (existing?.id) return jsonNoStore({ ok: true, member: teamMemberResponse(existing), deduped: true });

  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM team_members
     WHERE owner_email = ?
       AND status = 'active'`
  )
    .bind(access.ownerEmail)
    .first();
  if (Number(count?.count || 0) >= 10) {
    return jsonNoStore({ error: "This workspace already has 10 active teammates." }, 429);
  }

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    member_email: memberEmail,
    member_name: cleanText(body.name || body.memberName || "", 120),
    role: cleanTeamRole(body.role),
    status: "active",
    created_at: now,
    updated_at: now,
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO team_members
      (id, owner_email, member_email, member_name, role, status, created_at, updated_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.owner_email,
      row.member_email,
      row.member_name || null,
      row.role,
      row.status,
      row.created_at,
      row.updated_at,
      null
    )
    .run();
  return jsonNoStore({ ok: true, member: teamMemberResponse(row) });
}

async function revokeTeamMember(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/team/members/".length));
  if (!isSafeUuid(id)) return json({ error: "Teammate not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE team_members
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Teammate not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getReportCollaboration(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = reportIdFromSuffixPath(url.pathname, "/collaboration");
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const report = parseJson(row.report_json, {});
  return jsonNoStore(await reportCollaborationResponse(env, access, reportId, report));
}

async function saveReportCollaboration(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = reportIdFromSuffixPath(url.pathname, "/collaboration");
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const report = parseJson(row.report_json, {});
  const result = await saveIssueCollaborations(env, access, reportId, report, body.items || []);
  if (!result.ok) return jsonNoStore({ error: result.error }, 400);
  return jsonNoStore(await reportCollaborationResponse(env, access, reportId, report));
}

async function getReportBranding(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  return jsonNoStore({
    ok: true,
    branding: await reportBrandingForOwner(env, access.ownerEmail)
  });
}

async function saveReportBranding(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);

  const current = await reportBrandingForOwner(env, access.ownerEmail);
  const branding = normalizeBrandingInput(body, current);
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_branding
      (owner_email, agency_name, logo_url, brand_color, accent_color, custom_domain, footer_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_email) DO UPDATE SET
       agency_name = excluded.agency_name,
       logo_url = excluded.logo_url,
       brand_color = excluded.brand_color,
       accent_color = excluded.accent_color,
       custom_domain = excluded.custom_domain,
       footer_text = excluded.footer_text,
       updated_at = excluded.updated_at`
  )
    .bind(
      access.ownerEmail,
      branding.agencyName,
      branding.logoUrl || null,
      branding.brandColor,
      branding.accentColor,
      branding.customDomain || null,
      branding.footerText || null,
      now,
      now
    )
    .run();

  return jsonNoStore({ ok: true, branding });
}

async function listReportShares(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = decodeURIComponent(url.pathname.slice("/api/reports/".length, -"/shares".length));
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const shares = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_share_links
     WHERE report_id = ?
       AND owner_email = ?
       AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(reportId, access.ownerEmail)
    .all();
  const customDomain = await primaryVerifiedReportDomain(env, access.ownerEmail);
  return jsonNoStore({
    ok: true,
    shares: (shares.results || []).map((share) => reportShareResponse(share, url.origin, customDomain, env))
  });
}

async function createReportShare(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = decodeURIComponent(url.pathname.slice("/api/reports/".length, -"/share".length));
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM report_share_links
     WHERE report_id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(reportId, access.ownerEmail)
    .first();
  if (Number(count?.count || 0) >= 10) {
    return jsonNoStore({ error: "This report already has 10 active client links." }, 429);
  }

  const report = parseJson(row.report_json, {});
  const now = new Date().toISOString();
  const password = String(body.password || "").trim();
  if (password && password.length < REPORT_SHARE_PASSWORD_MIN_LENGTH) {
    return jsonNoStore({ error: `Client report passwords must be at least ${REPORT_SHARE_PASSWORD_MIN_LENGTH} characters.` }, 400);
  }
  const expiresDays = Number(body.expiresDays || body.expires_days || 0);
  const share = {
    id: crypto.randomUUID(),
    report_id: reportId,
    owner_email: access.ownerEmail,
    client_name: cleanText(body.clientName || body.client_name || safeHostname(report.url || row.url || ""), 120),
    status: "active",
    password_hash: password ? await hashReportSharePassword(password) : "",
    password_hint: cleanText(body.passwordHint || body.password_hint || "", 120),
    expires_at: expiresDays > 0 ? isoDaysFromNow(Math.min(Math.max(expiresDays, 1), 180)) : "",
    created_at: now,
    updated_at: now,
    last_viewed_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_share_links
      (id, report_id, owner_email, client_name, status, password_hash, password_hint, expires_at, created_at, updated_at, last_viewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      share.id,
      share.report_id,
      share.owner_email,
      share.client_name || null,
      share.status,
      share.password_hash || null,
      share.password_hint || null,
      share.expires_at || null,
      share.created_at,
      share.updated_at,
      null
    )
    .run();

  const customDomain = await primaryVerifiedReportDomain(env, access.ownerEmail);
  return jsonNoStore({
    ok: true,
    share: reportShareResponse(share, url.origin, customDomain, env)
  });
}

async function getPrivateReportPdf(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = reportIdFromSuffixPath(url.pathname, "/client.pdf");
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const report = parseJson(row.report_json, {});
  const branding = await reportBrandingForOwner(env, access.ownerEmail);
  const share = {
    id: "",
    clientName: cleanText(url.searchParams.get("clientName") || safeHostname(report.url || row.url || ""), 120)
  };
  return renderWorkerWhiteLabelPdf(env, {
    report,
    branding,
    share,
    origin: url.origin
  });
}

async function revokeReportShare(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/report-shares/".length));
  if (!isSafeUuid(id)) return json({ error: "Client link not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE report_share_links
     SET status = 'revoked', updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Client link not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getClientReportPdf(request, env) {
  if (!env.WAITLIST_DB) return json({ error: "Client reports are not configured." }, 503);
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname, ".pdf");
  if (!isSafeUuid(id)) return json({ error: "Report link not found or expired." }, 404);
  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return json({ error: domainCheck.error }, 404);
  if (!share) return json({ error: "Report link not found or expired." }, 404);
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json, expires_at
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  if (!reportRow?.report_json || (reportRow.expires_at && reportRow.expires_at <= new Date().toISOString())) {
    return json({ error: "Report no longer exists." }, 404);
  }
  if (share.password_hash && !(await clientReportUnlocked(request, env, share))) {
    return clientReportLockedResponse(request, branding, shareToCamel(share), 401);
  }
  const report = parseJson(reportRow.report_json, {});
  return renderWorkerWhiteLabelPdf(env, {
    report,
    branding,
    share: shareToCamel(share),
    origin: url.origin
  });
}

async function getClientReport(request, env) {
  if (!env.WAITLIST_DB) return clientReportLockedResponse(request, defaultBranding(), { id: "" }, 503, "Client reports are not configured.");
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname);
  if (!isSafeUuid(id)) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, "Report link not found or expired.");

  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, domainCheck.error);
  if (!share) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, "Report link not found or expired.");
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json, expires_at
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  if (!reportRow?.report_json || (reportRow.expires_at && reportRow.expires_at <= new Date().toISOString())) {
    return clientReportLockedResponse(request, branding, shareToCamel(share), 404, "Report no longer exists.");
  }
  const report = parseJson(reportRow.report_json, {});

  if (share.password_hash && !(await clientReportUnlocked(request, env, share))) {
    return clientReportLockedResponse(request, branding, shareToCamel(share), 401);
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE report_share_links
     SET last_viewed_at = ?, updated_at = updated_at
     WHERE id = ?`
  )
    .bind(new Date().toISOString(), share.id)
    .run();

  return new Response(
    buildWhiteLabelReportHtml({
      report,
      branding,
      share: shareToCamel(share),
      origin: url.origin
    }),
    {
      headers: secureHeaders({
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      })
    }
  );
}

async function unlockClientReport(request, env) {
  if (!env.WAITLIST_DB) return clientReportLockedResponse(request, defaultBranding(), { id: "" }, 503, "Client reports are not configured.");
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname, "/unlock");
  if (!isSafeUuid(id)) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, "Report link not found or expired.");
  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, domainCheck.error);
  if (!share) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, "Report link not found or expired.");
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const password = await passwordFromRequest(request);
  const quota = await clientReportUnlockQuotaStatus(request, env, share);
  if (!quota.ok) return clientReportLockedResponse(request, branding, shareToCamel(share), 429, quota.error);
  if (!share.password_hash || await verifyReportSharePassword(password, share.password_hash)) {
    return new Response("", {
      status: 303,
      headers: secureHeaders({
        "cache-control": "no-store",
        "location": `/r/${encodeURIComponent(share.id)}`,
        "set-cookie": await clientReportCookie(request, env, share)
      })
    });
  }
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  const report = parseJson(reportRow?.report_json, {});
  return clientReportLockedResponse(request, branding, shareToCamel(share), 401, "Password did not match.", report);
}

async function apiListProjects(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM site_claims
     WHERE owner_email = ?
       AND revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 100`
  )
    .bind(access.ownerEmail)
    .all();
  return jsonNoStore({ ok: true, projects: (rows.results || []).map(apiProjectResponse) });
}

async function apiCreateProject(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const body = await request.json().catch(() => ({}));
  const host = claimHostFromInput(body.host || body.url || "");
  if (!host) return jsonNoStore({ error: "Enter a public website host to verify." }, 400);

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM site_claims
     WHERE owner_email = ?
       AND host = ?
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(access.ownerEmail, host)
    .first();
  if (existing?.id) return jsonNoStore({ ok: true, project: apiProjectResponse(existing) });

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    host,
    verification_token: `sfk-${randomHex(32)}`,
    status: "pending",
    verification_method: "",
    created_at: now,
    updated_at: now,
    verified_at: "",
    last_checked_at: "",
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO site_claims
      (id, owner_email, host, verification_token, status, verification_method, created_at, updated_at, verified_at, last_checked_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(row.id, row.owner_email, row.host, row.verification_token, row.status, null, row.created_at, row.updated_at, null, null, null)
    .run();
  return jsonNoStore({ ok: true, project: apiProjectResponse(row) }, 201);
}

async function apiCreateAudit(request, env, ctx) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const body = await request.json().catch(() => ({}));
  let targetUrl = "";
  try {
    targetUrl = normalizeUrl(body.url || body.targetUrl || "");
  } catch {
    return jsonNoStore({ error: "Enter a valid public website URL." }, 400);
  }
  const publicUrlCheck = publicAuditUrlStatus(targetUrl);
  if (!publicUrlCheck.ok) return jsonNoStore({ error: publicUrlCheck.error }, 400);
  const authorization = await auditAuthorizationStatus(env, access, targetUrl);
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
  const competitorInput = parseAuditCompetitorUrls(body, targetUrl);
  if (!competitorInput.ok) {
    return jsonNoStore({ error: competitorInput.error }, 400);
  }
  const competitorUrls = competitorInput.urls;
  const backlinkInput = parseBacklinkRows(body, targetUrl, { allowPrivate: false });
  if (!backlinkInput.ok) {
    return jsonNoStore({ error: backlinkInput.error }, 400);
  }
  const backlinkRows = backlinkInput.rows;
  const localSeoInput = parseLocalSeoInput(body, targetUrl, { allowPrivate: false });
  if (!localSeoInput.ok) {
    return jsonNoStore({ error: localSeoInput.error }, 400);
  }
  const localSeo = localSeoInput.input;
  const keywordInput = parseKeywordRows(body, targetUrl, { allowPrivate: false });
  if (!keywordInput.ok) {
    return jsonNoStore({ error: keywordInput.error }, 400);
  }
  const keywordRows = keywordInput.rows;
  const renderedCrawlTarget = normalizeRenderedCrawlTarget(
    body.rendered_crawl_target || body.renderedCrawlTarget || body.crawlScaleTarget || 0
  );
  const maxPages = clampPageLimit(body.max_pages || body.maxPages || 10);
  await failStaleRunningAuditJobs(env, access.ownerEmail);
  const existingJob = await activeAuditJobForTarget(env, access, targetUrl, competitorUrls, backlinkRows, localSeo, keywordRows, renderedCrawlTarget, maxPages);
  if (existingJob) {
    return jsonNoStore(
      {
        ok: true,
        deduped: true,
        audit: apiAuditResponse(existingJob),
        audit_id: existingJob.id,
        status_url: `/v1/audits/${existingJob.id}`
      },
      202
    );
  }
  const activeCount = await activeAuditJobCount(env, access);
  if (activeCount >= 3) {
    return jsonNoStore(
      {
        error: "You already have 3 audits running. Wait for one to finish before starting another.",
        code: "AUDIT_JOBS_ACTIVE_LIMIT"
      },
      429
    );
  }

  const quota = await auditQuotaStatus(request, env, access, targetUrl);
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  const job = await createAuditJob(env, access, targetUrl, maxPages, {
    competitorUrls,
    backlinkRows,
    localSeo,
    keywordRows,
    renderedCrawlTarget
  });
  const processing = processAuditJob(env, job.id, { appOrigin: new URL(request.url).origin });
  if (ctx?.waitUntil) ctx.waitUntil(processing);
  else await processing;
  return jsonNoStore(
    {
      ok: true,
      audit: apiAuditResponse(job),
      audit_id: job.id,
      status_url: `/v1/audits/${job.id}`,
      estimated_completion: isoSecondsFromNow(5 * 60)
    },
    202
  );
}

async function apiListAudits(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_jobs
     WHERE owner_email = ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(access.ownerEmail, new Date().toISOString())
    .all();
  return jsonNoStore({ ok: true, audits: (rows.results || []).map(apiAuditResponse) });
}

async function apiGetAudit(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/");
  if (!isSafeUuid(id)) return jsonNoStore({ error: "Audit not found." }, 404);
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_jobs
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return jsonNoStore({ error: "Audit not found." }, 404);
  return jsonNoStore({ ok: true, audit: apiAuditResponse(row) });
}

async function apiGetAuditIssues(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/", "/issues");
  const resolved = await resolveApiAuditReport(env, access, id);
  if (!resolved.ok) return jsonNoStore({ error: resolved.error }, resolved.status || 404);
  const findings = (resolved.report.findings || []).filter((finding) => finding.severity !== "good");
  return jsonNoStore({
    ok: true,
    auditId: resolved.job?.id || "",
    reportId: resolved.report.id,
    issues: findings.map(apiIssueResponse),
    total: findings.length
  });
}

async function apiGetAuditReport(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/", "/report");
  const resolved = await resolveApiAuditReport(env, access, id);
  if (!resolved.ok) return jsonNoStore({ error: resolved.error }, resolved.status || 404);
  return jsonNoStore({ ok: true, report: apiReportResponse(resolved.report) });
}

async function apiDeleteAudit(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/");
  if (!isSafeUuid(id)) return jsonNoStore({ error: "Audit not found." }, 404);
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, report_id
     FROM audit_jobs
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return jsonNoStore({ error: "Audit not found." }, 404);
  await env.WAITLIST_DB.prepare(`DELETE FROM audit_jobs WHERE id = ? AND owner_email = ?`).bind(id, access.ownerEmail).run();
  if (row.report_id) {
    await env.WAITLIST_DB.prepare(`DELETE FROM audit_reports WHERE id = ? AND owner_email = ?`).bind(row.report_id, access.ownerEmail).run();
  }
  return jsonNoStore({ ok: true, deleted: true, auditId: id });
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

function workerLargeCrawlId(prefix = "lc") {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function largeCrawlFingerprint(targetUrl = "", frontierRows = []) {
  return sha256Hex([
    targetUrl,
    ...(frontierRows || []).slice(0, 50000).map((row) => row.normalizedUrl || row.url || "")
  ].join("\n"));
}

async function runD1BatchChunks(env, statements = [], chunkSize = 100) {
  for (let index = 0; index < statements.length; index += chunkSize) {
    const chunk = statements.slice(index, index + chunkSize);
    if (chunk.length) await env.WAITLIST_DB.batch(chunk);
  }
}

async function activeAuditJobForTarget(env, access, targetUrl, competitorUrls = [], backlinkRows = [], localSeo = {}, keywordRows = [], renderedCrawlTarget = 0, maxPages = 10) {
  const competitorKey = competitorUrlsKey(competitorUrls);
  const backlinkKey = backlinkRowsKey(backlinkRows);
  const localSeoKey = localSeoInputKey(localSeo);
  const keywordKey = keywordRowsKey(keywordRows);
  const renderedTarget = normalizeRenderedCrawlTarget(renderedCrawlTarget);
  const pageLimit = clampPageLimit(maxPages || 10);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_jobs
     WHERE owner_email = ?
       AND target_url = ?
       AND status IN ('queued', 'running')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC
     LIMIT 10`
  )
    .bind(access.ownerEmail, targetUrl, new Date().toISOString())
    .all();
  const row = (rows.results || []).find(
    (item) =>
      competitorUrlsKey(parseJson(item.competitor_urls_json, [])) === competitorKey &&
      backlinkRowsKey(parseJson(item.backlink_rows_json, [])) === backlinkKey &&
      localSeoInputKey(parseJson(item.local_seo_input_json, { enabled: false })) === localSeoKey &&
      keywordRowsKey(parseJson(item.keyword_rows_json, [])) === keywordKey &&
      normalizeRenderedCrawlTarget(item.rendered_crawl_target || 0) === renderedTarget &&
      clampPageLimit(item.max_pages || 10) === pageLimit
  );
  return row?.id ? row : null;
}

async function activeAuditJobCount(env, access) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM audit_jobs
     WHERE owner_email = ?
       AND status IN ('queued', 'running')
       AND (expires_at IS NULL OR expires_at > ?)`
  )
    .bind(access.ownerEmail, new Date().toISOString())
    .first();
  return Number(row?.count || 0);
}

async function createAuditJob(env, access, targetUrl, maxPages, options = {}) {
  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    owner_session_hash: access.sessionHash || "",
    owner_invite_id: access.inviteId || "",
    access_mode: access.accessMode || "invite",
    target_url: targetUrl,
    target_host: safeHostname(targetUrl),
    competitor_urls_json: JSON.stringify(normalizeCompetitorUrlsList(options.competitorUrls || [], targetUrl)),
    backlink_rows_json: JSON.stringify(parseBacklinkRows({ backlinkRows: options.backlinkRows || [] }, targetUrl, { allowPrivate: false }).rows || []),
    local_seo_input_json: JSON.stringify(parseLocalSeoInput({ localSeo: options.localSeo || {} }, targetUrl, { allowPrivate: false }).input || { enabled: false }),
    keyword_rows_json: JSON.stringify(parseKeywordRows({ keywordRows: options.keywordRows || [] }, targetUrl, { allowPrivate: false }).rows || []),
    rendered_crawl_target: normalizeRenderedCrawlTarget(options.renderedCrawlTarget || 0),
    max_pages: maxPages,
    status: "queued",
    report_id: "",
    schedule_id: options.scheduleId || "",
    error: "",
    created_at: now,
    updated_at: now,
    started_at: "",
    completed_at: "",
    expires_at: isoDaysFromNow(REPORT_RETENTION_DAYS)
  };

  await env.WAITLIST_DB.prepare(
    `INSERT INTO audit_jobs
      (id, owner_email, owner_session_hash, owner_invite_id, access_mode, target_url, target_host, competitor_urls_json, backlink_rows_json, local_seo_input_json, keyword_rows_json, rendered_crawl_target, max_pages, status, report_id, schedule_id, error, created_at, updated_at, started_at, completed_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      job.id,
      job.owner_email,
      job.owner_session_hash,
      job.owner_invite_id || null,
      job.access_mode,
      job.target_url,
      job.target_host,
      job.competitor_urls_json,
      job.backlink_rows_json,
      job.local_seo_input_json,
      job.keyword_rows_json,
      job.rendered_crawl_target,
      job.max_pages,
      job.status,
      null,
      job.schedule_id || null,
      null,
      job.created_at,
      job.updated_at,
      null,
      null,
      job.expires_at
    )
    .run();

  await persistBacklinkImportHistory(env, access, targetUrl, parseJson(job.backlink_rows_json, []));
  await persistKeywordImportHistory(env, access, targetUrl, parseJson(job.keyword_rows_json, []));

  return job;
}

async function persistBacklinkImportHistory(env, access, targetUrl, rows = []) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const targetHost = safeHostname(targetUrl);
  const batchId = workerLargeCrawlId("bli");
  const statements = [
    env.WAITLIST_DB.prepare(
      `INSERT INTO backlink_import_batches
        (id, owner_email, target_host, source, row_count, live_count, lost_count, risky_count, imported_at, created_at)
       VALUES (?, ?, ?, 'audit-import', ?, 0, 0, 0, ?, ?)`
    ).bind(batchId, access.ownerEmail, targetHost, rows.length, now, now),
    ...rows.map((row) => {
      const sourceUrl = row.sourceUrl || "";
      const target = row.targetUrl || targetUrl;
      return env.WAITLIST_DB.prepare(
        `INSERT OR REPLACE INTO backlink_edges
          (id, owner_email, target_host, import_batch_id, source_url, source_host, target_url, anchor_text, rel, first_seen, last_seen, status, source_status, target_status, live, risky_signals_json, proof_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'imported', 0, 0, 0, '[]', ?, ?, ?)`
      ).bind(
        workerLargeCrawlId("ble"),
        access.ownerEmail,
        targetHost,
        batchId,
        sourceUrl,
        safeHostname(sourceUrl),
        target,
        row.anchorText || null,
        row.firstSeen || null,
        row.lastSeen || null,
        JSON.stringify({ source: "audit-import", statusHint: row.statusHint || "" }),
        now,
        now
      );
    })
  ];
  await runD1BatchChunks(env, statements);
}

async function persistKeywordImportHistory(env, access, targetUrl, rows = []) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const targetHost = safeHostname(targetUrl);
  const batchId = workerLargeCrawlId("kwi");
  const queryCount = new Set(rows.map((row) => row.normalizedQuery || String(row.query || "").toLowerCase()).filter(Boolean)).size;
  const pageCount = new Set(rows.map((row) => row.pageUrl || "").filter(Boolean)).size;
  const statements = [
    env.WAITLIST_DB.prepare(
      `INSERT INTO keyword_import_batches
        (id, owner_email, target_host, source, row_count, query_count, landing_page_count, imported_at, created_at)
       VALUES (?, ?, ?, 'audit-import', ?, ?, ?, ?, ?)`
    ).bind(batchId, access.ownerEmail, targetHost, rows.length, queryCount, pageCount, now, now),
    ...rows.map((row) =>
      env.WAITLIST_DB.prepare(
        `INSERT INTO keyword_rank_observations
          (id, owner_email, target_host, import_batch_id, query, normalized_query, page_url, clicks, impressions, ctr, position, previous_clicks, previous_impressions, previous_ctr, previous_position, source, observed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        workerLargeCrawlId("kro"),
        access.ownerEmail,
        targetHost,
        batchId,
        row.query || "",
        row.normalizedQuery || String(row.query || "").toLowerCase(),
        row.pageUrl || null,
        Number(row.clicks || 0),
        Number(row.impressions || 0),
        Number(row.ctr || 0),
        Number(row.position || 0),
        Number(row.previousClicks || 0),
        Number(row.previousImpressions || 0),
        Number(row.previousCtr || 0),
        Number(row.previousPosition || 0),
        row.source || "audit-import",
        now,
        now
      )
    )
  ];
  await runD1BatchChunks(env, statements);
}

async function runDueAuditSchedules(env) {
  if (!env.WAITLIST_DB) return;
  const now = new Date().toISOString();
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_schedules
     WHERE status = 'active'
       AND next_run_at <= ?
     ORDER BY next_run_at ASC
     LIMIT 5`
  )
    .bind(now)
    .all();

  for (const schedule of rows.results || []) {
    await runAuditSchedule(env, schedule);
  }
}

async function runAuditSchedule(env, schedule) {
  if (!schedule?.id) return;
  const now = new Date().toISOString();
  const access = {
    ownerEmail: schedule.owner_email,
    sessionHash: schedule.owner_session_hash || "",
    inviteId: schedule.owner_invite_id || "",
    accessMode: schedule.access_mode || "schedule"
  };

  const existing = await activeAuditJobForTarget(env, access, schedule.target_url, [], [], {}, [], 0, schedule.max_pages || 10);
  if (existing?.id) {
    const retryAt = isoDaysFromDate(now, 1);
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_schedules
       SET last_error = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind("Skipped because an audit is already queued or running for this URL.", retryAt, now, schedule.id)
      .run();
    return;
  }

  try {
    const job = await createAuditJob(
      env,
      access,
      schedule.target_url,
      clampPageLimit(schedule.max_pages || 10),
      { scheduleId: schedule.id }
    );
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_schedules
       SET last_run_at = ?, last_job_id = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`
    )
      .bind(now, job.id, now, schedule.id)
      .run();
    await processAuditJob(env, job.id, {
      appOrigin: String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com")
    });
  } catch (error) {
    const retryAt = isoDaysFromDate(now, 1);
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_schedules
       SET last_error = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(cleanText(error?.message || "Scheduled audit failed.", 260), retryAt, new Date().toISOString(), schedule.id)
      .run();
  }
}

const AUDIT_JOB_RUNNING_STALE_MINUTES = 20;
const AUDIT_JOB_QUEUED_STALE_MINUTES = 10;
const AUDIT_JOB_TIMEOUT_MESSAGE = "The audit timed out before finishing. Run it again.";

async function failStaleRunningAuditJobs(env, ownerEmail = "") {
  if (!env.WAITLIST_DB) return 0;
  const cutoff = isoSecondsFromNow(-AUDIT_JOB_RUNNING_STALE_MINUTES * 60);
  let where = `status = 'running' AND started_at IS NOT NULL AND started_at < ?`;
  const params = [cutoff];
  if (ownerEmail) {
    where += " AND owner_email = ?";
    params.push(ownerEmail);
  }
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id, schedule_id FROM audit_jobs WHERE ${where} LIMIT 25`
  )
    .bind(...params)
    .all();
  let failedCount = 0;
  for (const job of rows.results || []) {
    const now = new Date().toISOString();
    const updated = await env.WAITLIST_DB.prepare(
      `UPDATE audit_jobs
       SET status = 'failed', error = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'running' AND started_at < ?`
    )
      .bind(AUDIT_JOB_TIMEOUT_MESSAGE, now, now, job.id, cutoff)
      .run();
    if (Number(updated?.meta?.changes || 0) !== 1) continue;
    failedCount += 1;
    if (job.schedule_id) {
      await env.WAITLIST_DB.prepare(
        `UPDATE audit_schedules SET last_error = ?, next_run_at = ?, updated_at = ? WHERE id = ?`
      )
        .bind(AUDIT_JOB_TIMEOUT_MESSAGE, isoDaysFromDate(now, 1), now, job.schedule_id)
        .run();
    }
  }
  return failedCount;
}

async function resumeStaleQueuedAuditJobs(env, context = {}) {
  if (!env.WAITLIST_DB) return 0;
  const cutoff = isoSecondsFromNow(-AUDIT_JOB_QUEUED_STALE_MINUTES * 60);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id FROM audit_jobs
     WHERE status = 'queued' AND created_at < ?
     ORDER BY created_at ASC
     LIMIT 3`
  )
    .bind(cutoff)
    .all();
  let resumed = 0;
  for (const job of rows.results || []) {
    await processAuditJob(env, job.id, context);
    resumed += 1;
  }
  return resumed;
}

async function processAuditJob(env, jobId, context = {}) {
  if (!env.WAITLIST_DB || !isSafeUuid(jobId)) return;

  const startedAt = new Date().toISOString();
  const claimed = await env.WAITLIST_DB.prepare(
    `UPDATE audit_jobs
     SET status = 'running', started_at = ?, updated_at = ?
     WHERE id = ? AND status = 'queued'`
  )
    .bind(startedAt, startedAt, jobId)
    .run();
  if (Number(claimed?.meta?.changes || 0) !== 1) return;

  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM audit_jobs WHERE id = ? LIMIT 1`)
    .bind(jobId)
    .first();
  if (!row?.id) return;

  try {
    if (await resolvesToPrivateAddress(new URL(row.target_url).hostname)) {
      throw new Error("This URL points at a private or internal address and cannot be audited.");
    }
    const report = await auditUrl(row.target_url, env, {
      maxPages: clampPageLimit(row.max_pages || 10),
      appOrigin: context.appOrigin || "https://seofixkit.com",
      competitorUrls: parseJson(row.competitor_urls_json, []),
      backlinkRows: parseJson(row.backlink_rows_json, []),
      localSeo: parseJson(row.local_seo_input_json, { enabled: false }),
      keywordRows: parseJson(row.keyword_rows_json, []),
      renderedCrawlTarget: row.rendered_crawl_target || 0
    });
    const saved = await saveAuditReportWithContext(
      report,
      env,
      {
        ownerEmail: row.owner_email,
        sessionHash: row.owner_session_hash || "",
        inviteId: row.owner_invite_id || null,
        accessMode: row.access_mode || "invite"
      },
      context.appOrigin || "https://seofixkit.com"
    );
    const completedAt = new Date().toISOString();
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_jobs
       SET status = 'completed', report_id = ?, error = NULL, completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(saved.id, completedAt, completedAt, jobId)
      .run();
    if (row.schedule_id) {
      const schedule = await env.WAITLIST_DB.prepare(
        `SELECT interval_days FROM audit_schedules WHERE id = ? LIMIT 1`
      )
        .bind(row.schedule_id)
        .first();
      await env.WAITLIST_DB.prepare(
        `UPDATE audit_schedules
         SET last_report_id = ?, last_error = NULL, next_run_at = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(
          saved.id,
          isoDaysFromDate(completedAt, Number(schedule?.interval_days || 7)),
          completedAt,
          row.schedule_id
        )
        .run();
    }
    await deliverApiWebhooks(env, row.owner_email, "audit.completed", {
      audit: apiAuditResponse({
        ...row,
        status: "completed",
        report_id: saved.id,
        completed_at: completedAt,
        updated_at: completedAt
      }),
      report: apiReportResponse(saved)
    });
  } catch (error) {
    // Browser Run concurrency limits are transient: requeue instead of
    // failing, and let the cron resume the job. Jobs older than 2 hours
    // fail normally so a broken browser pool cannot loop forever.
    if (error?.code === "BROWSER_BUSY" && row.created_at && row.created_at > isoSecondsFromNow(-2 * 60 * 60)) {
      await env.WAITLIST_DB.prepare(
        `UPDATE audit_jobs
         SET status = 'queued', started_at = NULL, error = NULL, updated_at = ?
         WHERE id = ? AND status = 'running'`
      )
        .bind(new Date().toISOString(), jobId)
        .run();
      return;
    }
    const completedAt = new Date().toISOString();
    const message = cleanText(error?.message || "The audit failed. Try another URL.", 260);
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_jobs
       SET status = 'failed', error = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(message, completedAt, completedAt, jobId)
      .run();
    if (row.schedule_id) {
      await env.WAITLIST_DB.prepare(
        `UPDATE audit_schedules
         SET last_error = ?, next_run_at = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(message, isoDaysFromDate(completedAt, 1), completedAt, row.schedule_id)
        .run();
    }
    await deliverApiWebhooks(env, row.owner_email, "audit.failed", {
      audit: apiAuditResponse({
        ...row,
        status: "failed",
        error: message,
        completed_at: completedAt,
        updated_at: completedAt
      }),
      error: message
    });
  }
}

async function getAuditJob(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Audit job storage is not configured." }, 503);

  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/audit/jobs/".length));
  if (!isSafeUuid(id)) return json({ error: "Audit job not found." }, 404);

  let row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_jobs
     WHERE id = ? AND owner_email = ?
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return json({ error: "Audit job not found." }, 404);

  if (
    row.status === "running" &&
    row.started_at &&
    row.started_at < isoSecondsFromNow(-AUDIT_JOB_RUNNING_STALE_MINUTES * 60)
  ) {
    await failStaleRunningAuditJobs(env, access.ownerEmail);
    row = await env.WAITLIST_DB.prepare(`SELECT * FROM audit_jobs WHERE id = ? AND owner_email = ? LIMIT 1`)
      .bind(id, access.ownerEmail)
      .first();
    if (!row?.id) return json({ error: "Audit job not found." }, 404);
  }

  return jsonNoStore({
    ok: true,
    job: auditJobResponse(row)
  });
}

function auditJobResponse(row = {}) {
  const reportId = row.report_id || "";
  return {
    id: row.id || "",
    status: row.status || "queued",
    targetUrl: row.target_url || "",
    targetHost: row.target_host || safeHostname(row.target_url || ""),
    competitorUrls: parseJson(row.competitor_urls_json, []),
    backlinkRowsCount: parseJson(row.backlink_rows_json, []).length,
    localSeoInput: localSeoInputSummary(parseJson(row.local_seo_input_json, { enabled: false })),
    keywordRowsInput: keywordRowsSummary(parseJson(row.keyword_rows_json, [])),
    renderedCrawlTarget: renderedCrawlTargetSummary(row.rendered_crawl_target || 0),
    maxPages: Number(row.max_pages || 10),
    crawlDepth: crawlDepthSummary(row.max_pages || 10),
    reportId,
    scheduleId: row.schedule_id || "",
    reportPath: reportId ? `/beta/reports/${reportId}` : "",
    error: row.error || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    expiresAt: row.expires_at || ""
  };
}

function auditScheduleResponse(row = {}) {
  const reportId = row.last_report_id || "";
  return {
    id: row.id || "",
    status: row.status || "active",
    targetUrl: row.target_url || "",
    targetHost: row.target_host || safeHostname(row.target_url || ""),
    maxPages: Number(row.max_pages || 10),
    intervalDays: Number(row.interval_days || 7),
    cadenceLabel: scheduleCadenceLabel(row.interval_days || 7),
    nextRunAt: row.next_run_at || "",
    lastRunAt: row.last_run_at || "",
    lastJobId: row.last_job_id || "",
    lastReportId: reportId,
    lastReportPath: reportId ? `/beta/reports/${reportId}` : "",
    lastError: row.last_error || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    pausedAt: row.paused_at || ""
  };
}

function apiTokenResponse(row = {}) {
  return {
    id: row.id || "",
    label: row.label || "API key",
    tokenPrefix: row.token_prefix || "",
    scopes: parseJson(row.scopes_json, []),
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastUsedAt: row.last_used_at || "",
    revokedAt: row.revoked_at || ""
  };
}

function apiWebhookResponse(row = {}) {
  return {
    id: row.id || "",
    url: row.url || "",
    events: parseJson(row.events_json, []),
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastDeliveryAt: row.last_delivery_at || "",
    lastDeliveryStatus: row.last_delivery_status || "",
    lastError: row.last_error || ""
  };
}

async function teamMembersForOwner(env, ownerEmail) {
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM team_members
     WHERE owner_email = ?
       AND status = 'active'
     ORDER BY member_email ASC
     LIMIT 50`
  )
    .bind(ownerEmail)
    .all();
  return (rows.results || []).map(teamMemberResponse);
}

function teamMemberResponse(row = {}) {
  return {
    id: row.id || "",
    email: row.member_email || "",
    name: row.member_name || "",
    role: row.role || "editor",
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

async function reportCollaborationResponse(env, access, reportId, report) {
  const [members, saved] = await Promise.all([
    teamMembersForOwner(env, access.ownerEmail),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM issue_collaboration
       WHERE report_id = ?
         AND owner_email = ?`
    )
      .bind(reportId, access.ownerEmail)
      .all()
  ]);
  const savedByIssue = new Map((saved.results || []).map((item) => [item.issue_id, item]));
  return {
    ok: true,
    members,
    issues: reportIssuesForCollaboration(report).map((finding) =>
      issueCollaborationResponse(finding, savedByIssue.get(finding.id))
    ),
    updatedAt: new Date().toISOString()
  };
}

function issueCollaborationResponse(finding = {}, row = {}) {
  return {
    issueId: finding.id || "",
    title: finding.title || "",
    severity: finding.severity || "notice",
    pageLabel: finding.pageLabel || "",
    pageUrl: finding.pageUrl || "",
    proof: finding.evidence || "",
    fix: finding.fix || "",
    status: row?.status || "open",
    assigneeEmail: row?.assignee_email || "",
    note: row?.note || "",
    updatedAt: row?.updated_at || "",
    updatedByEmail: row?.updated_by_email || ""
  };
}

async function saveIssueCollaborations(env, access, reportId, report, items = []) {
  if (!Array.isArray(items)) return { ok: false, error: "Send collaboration items as a list." };
  const issues = reportIssuesForCollaboration(report);
  const issueIds = new Set(issues.map((issue) => issue.id));
  const members = await teamMembersForOwner(env, access.ownerEmail);
  const assignees = new Set(members.map((member) => member.email));
  const now = new Date().toISOString();

  for (const item of items.slice(0, 50)) {
    const issueId = cleanText(item?.issueId || item?.issue_id || "", 160);
    if (!issueIds.has(issueId)) return { ok: false, error: "Issue no longer exists in this report." };
    const assigneeEmail = normalizeEmail(item?.assigneeEmail || item?.assignee_email || "");
    if (assigneeEmail && !assignees.has(assigneeEmail)) {
      return { ok: false, error: "Assign the issue to an active teammate." };
    }
    const existing = await env.WAITLIST_DB.prepare(
      `SELECT id, created_at
       FROM issue_collaboration
       WHERE report_id = ?
         AND issue_id = ?
       LIMIT 1`
    )
      .bind(reportId, issueId)
      .first();
    const row = {
      id: existing?.id || crypto.randomUUID(),
      report_id: reportId,
      owner_email: access.ownerEmail,
      issue_id: issueId,
      assignee_email: assigneeEmail,
      status: cleanIssueStatus(item?.status),
      note: cleanText(item?.note || "", 1200),
      created_at: existing?.created_at || now,
      updated_at: now,
      updated_by_email: access.ownerEmail
    };
    await env.WAITLIST_DB.prepare(
      `INSERT INTO issue_collaboration
        (id, report_id, owner_email, issue_id, assignee_email, status, note, created_at, updated_at, updated_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(report_id, issue_id) DO UPDATE SET
         assignee_email = excluded.assignee_email,
         status = excluded.status,
         note = excluded.note,
         updated_at = excluded.updated_at,
         updated_by_email = excluded.updated_by_email`
    )
      .bind(
        row.id,
        row.report_id,
        row.owner_email,
        row.issue_id,
        row.assignee_email || null,
        row.status,
        row.note || null,
        row.created_at,
        row.updated_at,
        row.updated_by_email
      )
      .run();
  }
  return { ok: true };
}

function reportIssuesForCollaboration(report = {}) {
  return (report.findings || [])
    .filter((finding) => finding?.id && finding.severity !== "good")
    .slice(0, 50);
}

function reportIdFromSuffixPath(pathname, suffix) {
  return decodeURIComponent(pathname.slice("/api/reports/".length, -suffix.length));
}

function cleanTeamRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ["admin", "editor", "viewer"].includes(role) ? role : "editor";
}

function cleanIssueStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["open", "in_progress", "fixed", "ignored"].includes(status) ? status : "open";
}

async function reportBrandingForOwner(env, ownerEmail) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_branding
     WHERE owner_email = ?
     LIMIT 1`
  )
    .bind(ownerEmail)
    .first();
  return normalizeBrandingInput(reportBrandingFromRow(row), defaultBranding(ownerEmail));
}

async function listReportDomains(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Report domain storage is not configured." }, 503);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE owner_email = ?
       AND revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 20`
  )
    .bind(access.ownerEmail)
    .all();
  return jsonNoStore({
    ok: true,
    domains: (rows.results || []).map((row) => reportDomainResponse(row, env))
  });
}

async function createReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Report domain storage is not configured." }, 503);
  if (!reportDomainsEnabled(env)) return jsonNoStore({ error: "Report custom domains are not configured yet." }, 503);
  const body = await request.json().catch(() => ({}));
  const domainName = cleanReportDomain(body.domain || body.customDomain || "");
  if (!domainName) return jsonNoStore({ error: "Enter a valid report subdomain, like reports.example.com." }, 400);
  if (workerAppHost(domainName, env)) {
    return jsonNoStore({ error: "Use a customer-controlled report subdomain, not an app-owned hostname." }, 400);
  }

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE domain = ?
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(domainName)
    .first();
  if (existing?.id && existing.owner_email !== access.ownerEmail) {
    return jsonNoStore({ error: "That report domain is already connected to another workspace." }, 409);
  }
  if (existing?.id) return jsonNoStore({ ok: true, domain: reportDomainResponse(existing, env) });

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    domain: domainName,
    verification_token: `sfk-report-domain=${randomHex(24)}`,
    status: "pending",
    created_at: now,
    updated_at: now,
    verified_at: "",
    last_checked_at: "",
    last_error: "",
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_domains
      (id, owner_email, domain, verification_token, status, created_at, updated_at, verified_at, last_checked_at, last_error, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(row.id, row.owner_email, row.domain, row.verification_token, row.status, row.created_at, row.updated_at, null, null, null, null)
    .run();
  return jsonNoStore({ ok: true, domain: reportDomainResponse(row, env) }, 201);
}

async function verifyReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Report domain storage is not configured." }, 503);
  if (!reportDomainsEnabled(env)) return jsonNoStore({ error: "Report custom domains are not configured yet." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/report-domains/".length, -"/verify".length));
  if (!isSafeUuid(id)) return json({ error: "Report domain not found." }, 404);
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE id = ?
       AND owner_email = ?
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return json({ error: "Report domain not found." }, 404);
  if (workerAppHost(row.domain, env)) {
    return jsonNoStore({ error: "Use a customer-controlled report subdomain, not an app-owned hostname." }, 400);
  }

  const result = await verifyReportDomainChallenge(row, env);
  const now = new Date().toISOString();
  if (!result.ok) {
    await env.WAITLIST_DB.prepare(
      `UPDATE report_domains
       SET last_checked_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(now, result.error, now, id)
      .run();
    return jsonNoStore({
      ok: false,
      error: result.error,
      domain: reportDomainResponse({ ...row, last_checked_at: now, last_error: result.error, updated_at: now }, env)
    }, 400);
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE report_domains
     SET status = 'verified', verified_at = COALESCE(verified_at, ?), last_checked_at = ?, last_error = NULL, updated_at = ?
     WHERE id = ?`
  )
    .bind(now, now, now, id)
    .run();
  return jsonNoStore({
    ok: true,
    verified: true,
    domain: reportDomainResponse({ ...row, status: "verified", verified_at: row.verified_at || now, last_checked_at: now, last_error: "", updated_at: now }, env)
  });
}

async function revokeReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Report domain storage is not configured." }, 503);
  const id = decodeURIComponent(new URL(request.url).pathname.slice("/api/report-domains/".length));
  if (!isSafeUuid(id)) return json({ error: "Report domain not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE report_domains
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND revoked_at IS NULL`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Report domain not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getReportDomainChallenge(request, env) {
  if (!env.WAITLIST_DB) return new Response("Report domain storage is not configured.", { status: 503 });
  const domain = await reportDomainForHost(env, new URL(request.url).host);
  if (!domain?.id) {
    return new Response("Report domain challenge not found.", {
      status: 404,
      headers: secureHeaders({ "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" })
    });
  }
  return new Response(domain.verification_token || "", {
    headers: secureHeaders({ "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" })
  });
}

function reportDomainResponse(row = {}, env = {}) {
  const dnsName = reportDomainDnsName(row.domain || "");
  const cnameTarget = cleanReportDomain(env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || "") || "";
  return {
    id: row.id || "",
    domain: row.domain || "",
    status: row.status || "pending",
    verificationToken: row.verification_token || "",
    verificationMethod: "dns_txt",
    verificationPath: "",
    verificationUrl: "",
    dnsName,
    dnsType: "TXT",
    dnsValue: row.verification_token || "",
    cnameTarget,
    shareOrigin: row.status === "verified" && row.domain ? `https://${row.domain}` : "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    verifiedAt: row.verified_at || "",
    lastCheckedAt: row.last_checked_at || "",
    lastError: row.last_error || ""
  };
}

function reportDomainsEnabled(env = {}) {
  return Boolean(cleanReportDomain(env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || ""));
}

async function verifyReportDomainChallenge(row = {}, env = {}) {
  const ownership = await verifyReportDomainTxt(row.domain || "", row.verification_token || "");
  if (!ownership.ok) return ownership;
  return verifyReportDomainCname(row.domain || "", env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || "");
}

async function verifyReportDomainTxt(domain = "", token = "") {
  const expected = token || "";
  const dnsName = reportDomainDnsName(domain);
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

async function verifyReportDomainCname(domain = "", cnameTarget = "") {
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

function reportDomainDnsName(domain = "") {
  const clean = cleanReportDomain(domain);
  return clean ? `_seofixkit-report-domain.${clean}` : "";
}

async function reportDomainForHost(env, hostValue, { verifiedOnly = false } = {}) {
  const host = cleanReportDomain(hostValue);
  if (!host) return null;
  const statusClause = verifiedOnly ? "status = 'verified'" : "status IN ('pending', 'verified')";
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE domain = ?
       AND ${statusClause}
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(host)
    .first();
  return row?.id ? row : null;
}

async function primaryVerifiedReportDomain(env, ownerEmail) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE owner_email = ?
       AND status = 'verified'
       AND revoked_at IS NULL
     ORDER BY verified_at DESC, updated_at DESC
     LIMIT 1`
  )
    .bind(ownerEmail)
    .first();
  return row?.id ? row : null;
}

async function clientReportHostAccess(env, request, share) {
  const host = cleanReportDomain(new URL(request.url).host);
  if (!host || workerAppHost(host, env)) return { ok: true };
  const domain = await reportDomainForHost(env, host, { verifiedOnly: true });
  if (!domain) return { ok: false, error: "Report domain not verified." };
  if (share && domain.owner_email !== share.owner_email) return { ok: false, error: "Report link not found on this domain." };
  return { ok: true, domain };
}

function reportBrandingFromRow(row = {}) {
  return {
    agencyName: row?.agency_name || "",
    logoUrl: row?.logo_url || "",
    brandColor: row?.brand_color || "",
    accentColor: row?.accent_color || "",
    customDomain: row?.custom_domain || "",
    footerText: row?.footer_text || ""
  };
}

async function ownerReportRow(env, reportId, access) {
  if (!isSafeReportId(reportId)) return null;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT report_json, owner_email, owner_invite_id, expires_at, url
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(reportId)
    .first();
  if (!row?.report_json) return null;
  if (row.expires_at && row.expires_at <= new Date().toISOString()) return null;
  if (row.owner_email && row.owner_email !== access.ownerEmail) return null;
  if (
    row.owner_invite_id &&
    access.accessMode !== "founder-override" &&
    row.owner_invite_id !== access.inviteId
  ) {
    return null;
  }
  return row;
}

function reportShareResponse(row = {}, origin = "", customDomain = null, env = {}) {
  const shareOrigin = customDomain?.domain ? `https://${customDomain.domain}` : origin;
  return {
    id: row.id || "",
    reportId: row.report_id || "",
    clientName: row.client_name || "",
    status: row.status || "active",
    passwordProtected: Boolean(row.password_hash),
    passwordHint: row.password_hint || "",
    sharePath: row.id ? `/r/${row.id}` : "",
    shareUrl: row.id ? `${shareOrigin}/r/${row.id}` : "",
    pdfPath: row.id ? `/r/${row.id}.pdf` : "",
    pdfUrl: row.id ? `${shareOrigin}/r/${row.id}.pdf` : "",
    customDomain: customDomain ? reportDomainResponse(customDomain, env) : null,
    expiresAt: row.expires_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastViewedAt: row.last_viewed_at || ""
  };
}

function shareToCamel(row = {}) {
  return {
    id: row.id || "",
    reportId: row.report_id || "",
    ownerEmail: row.owner_email || "",
    clientName: row.client_name || "",
    status: row.status || "active",
    passwordHint: row.password_hint || "",
    expiresAt: row.expires_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastViewedAt: row.last_viewed_at || ""
  };
}

async function activeReportShare(env, id) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_share_links
     WHERE id = ?
     LIMIT 1`
  )
    .bind(id)
    .first();
  if (!row?.id || row.status !== "active") return null;
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    await env.WAITLIST_DB.prepare(
      `UPDATE report_share_links SET status = 'expired', updated_at = ? WHERE id = ?`
    )
      .bind(new Date().toISOString(), row.id)
      .run();
    return null;
  }
  return row;
}

function clientReportShareId(pathname, suffix = "") {
  const relative = pathname.slice("/r/".length);
  const id = suffix && relative.endsWith(suffix) ? relative.slice(0, -suffix.length) : relative;
  return decodeURIComponent(id || "");
}

function clientReportLockedResponse(request, branding, share, status = 401, error = "", report = {}) {
  const url = new URL(request.url);
  return new Response(
    buildWhiteLabelReportHtml({
      report,
      branding,
      share,
      origin: url.origin,
      locked: true,
      error
    }),
    {
      status,
      headers: secureHeaders({
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      })
    }
  );
}

async function renderWorkerWhiteLabelPdf(env, { report, branding, share, origin }) {
  if (!env.BROWSER) {
    return jsonNoStore({ error: "PDF export requires the Browser Run binding." }, 503);
  }
  const html = buildWhiteLabelReportHtml({ report, branding, share, origin });
  let browser = null;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
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
    const headers = secureHeaders();
    headers.set("cache-control", "no-store");
    headers.set("content-disposition", `attachment; filename="${whiteLabelReportFilename({ report, branding, share })}"`);
    headers.set("content-type", "application/pdf");
    headers.set("x-robots-tag", "noindex, nofollow");
    return new Response(pdf, { headers });
  } catch (error) {
    return jsonNoStore({ error: error?.message || "PDF export failed." }, 500);
  } finally {
    await browser?.close?.().catch(() => {});
  }
}

function clientReportCookieName(share) {
  return `sfk_report_${String(share.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 36)}`;
}

async function clientReportCookieValue(env, share) {
  // HMAC with a server secret so the unlock cookie cannot be minted offline
  // from share id + stored password hash alone.
  const secret = String(env.SEOFIXKIT_COOKIE_SECRET || "");
  if (!secret) {
    throw new Error("Report cookie signing is not configured. Set the SEOFIXKIT_COOKIE_SECRET secret.");
  }
  return hmacSha256Hex(secret, `${share.id}:${share.password_hash || ""}:client-report`);
}

async function clientReportCookie(request, env, share) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${clientReportCookieName(share)}=${encodeURIComponent(await clientReportCookieValue(env, share))}; Path=/r; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

async function clientReportUnlocked(request, env, share) {
  const value = cookieValue(request, clientReportCookieName(share));
  return Boolean(value) && constantTimeEqual(value, await clientReportCookieValue(env, share));
}

async function passwordFromRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return String(body.password || "");
  }
  if (contentType.includes("form")) {
    const form = await request.formData().catch(() => null);
    return String(form?.get("password") || "");
  }
  const text = await request.text().catch(() => "");
  return String(new URLSearchParams(text).get("password") || "");
}

async function clientReportUnlockQuotaStatus(request, env, share = {}) {
  if (!env.WAITLIST_DB) return { ok: true };
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  const shareKey = String(share.id || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  return checkQuotaSet(env, [
    {
      bucket: `client-report-unlock:ip:${hour.key}:${shareKey}:${ipHash}`,
      limit: 10,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many password attempts for this report link. Try again later."
    },
    {
      bucket: `client-report-unlock:share:${hour.key}:${shareKey}`,
      limit: 50,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many password attempts for this report link. Try again later."
    }
  ]);
}

async function hashReportSharePassword(password = "") {
  const salt = randomHex(16);
  const hash = await deriveReportSharePasswordHash(password, salt, REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

async function verifyReportSharePassword(password = "", storedHash = "") {
  const stored = String(storedHash || "");
  if (stored.startsWith("pbkdf2$")) {
    const [, algorithm, iterations, salt, expected] = stored.split("$");
    const iterationCount = Number(iterations || 0);
    if (algorithm !== "sha256" || !iterationCount || !salt || !expected) return false;
    const actual = await deriveReportSharePasswordHash(password, salt, iterationCount);
    return constantTimeEqual(actual, expected);
  }
  return constantTimeEqual(await sha256Hex(password), stored);
}

async function deriveReportSharePasswordHash(password = "", saltHex = "", iterations = REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function hexToBytes(hex = "") {
  const clean = String(hex || "").replace(/[^a-f0-9]/gi, "");
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes = new Uint8Array()) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function apiProjectResponse(row = {}) {
  return {
    id: row.id || "",
    host: row.host || "",
    status: row.status || "pending",
    verification_method: row.verification_method || "",
    verified_at: row.verified_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    verification: siteClaimInstructions(row)
  };
}

function apiAuditResponse(row = {}) {
  const reportId = row.report_id || "";
  return {
    audit_id: row.id || "",
    status: apiAuditStatus(row.status),
    url: row.target_url || "",
    target_host: row.target_host || safeHostname(row.target_url || ""),
    competitor_urls: parseJson(row.competitor_urls_json, []),
    backlink_rows_count: parseJson(row.backlink_rows_json, []).length,
    local_seo_input: localSeoInputSummary(parseJson(row.local_seo_input_json, { enabled: false })),
    keyword_rows_input: keywordRowsSummary(parseJson(row.keyword_rows_json, [])),
    rendered_crawl_target: renderedCrawlTargetSummary(row.rendered_crawl_target || 0),
    max_pages: Number(row.max_pages || 10),
    crawl_depth: crawlDepthSummary(row.max_pages || 10),
    report_id: reportId,
    report_url: reportId ? `/v1/audits/${row.id}/report` : "",
    issues_url: reportId ? `/v1/audits/${row.id}/issues` : "",
    error: row.error || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    started_at: row.started_at || "",
    completed_at: row.completed_at || ""
  };
}

function apiAuditStatus(status = "") {
  if (status === "completed") return "complete";
  return status || "queued";
}

function apiIssueResponse(finding = {}) {
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
    source: finding.source || ""
  };
}

function apiReportResponse(report = {}) {
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
    findings: (report.findings || []).map(apiIssueResponse),
    repair_plan: report.repairPlan || [],
    repair_brief: report.repairBrief || "",
    pages: report.pages || [],
    report_path: report.reportPath || "",
    report_url: report.reportUrl || "",
    created_at: report.scannedAt || report.createdAt || "",
    expires_at: report.retention?.expiresAt || ""
  };
}

function apiAuditIdFromPath(rawUrl, prefix, suffix = "") {
  const pathname = new URL(rawUrl).pathname;
  const withoutPrefix = pathname.slice(prefix.length);
  const value = suffix && withoutPrefix.endsWith(suffix)
    ? withoutPrefix.slice(0, -suffix.length)
    : withoutPrefix;
  return decodeURIComponent(value.replace(/^\/|\/$/g, ""));
}

async function resolveApiAuditReport(env, access, id) {
  let job = null;
  let reportId = id;
  if (isSafeUuid(id)) {
    job = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM audit_jobs
       WHERE id = ?
         AND owner_email = ?
       LIMIT 1`
    )
      .bind(id, access.ownerEmail)
      .first();
    if (job?.id) reportId = job.report_id || "";
  }
  if (!reportId) {
    if (job?.status === "failed") return { ok: false, status: 409, error: job.error || "Audit failed." };
    return { ok: false, status: 409, error: "Audit is still running." };
  }
  if (!isSafeReportId(reportId)) return { ok: false, status: 404, error: "Report not found." };
  const row = await env.WAITLIST_DB.prepare(
    `SELECT report_json, owner_email, expires_at
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(reportId, access.ownerEmail)
    .first();
  if (!row?.report_json) {
    if (job?.status === "queued" || job?.status === "running") return { ok: false, status: 409, error: "Audit is still running." };
    return { ok: false, status: 404, error: "Report not found." };
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    await env.WAITLIST_DB.prepare(`DELETE FROM audit_reports WHERE id = ?`).bind(reportId).run();
    return { ok: false, status: 404, error: "Report expired." };
  }
  return { ok: true, job, report: parseJson(row.report_json, {}) };
}

async function requestFixPack(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Fix request storage is not configured." }, 503);

  const body = await request.json().catch(() => ({}));
  const reportId = cleanText(body.reportId || "", 140);
  if (!isSafeReportId(reportId)) return json({ error: "Report not found." }, 404);

  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, owner_email, owner_invite_id, score, summary_json, report_json, expires_at
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(reportId)
    .first();
  if (!row?.id || row.owner_email !== access.ownerEmail) return json({ error: "Report not found." }, 404);
  if (
    row.owner_invite_id &&
    access.accessMode !== "founder-override" &&
    row.owner_invite_id !== access.inviteId
  ) {
    return json({ error: "Report not found." }, 404);
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString()) return json({ error: "Report expired." }, 404);

  const summary = parseJson(row.summary_json, {});
  const now = new Date().toISOString();
  const note = cleanText(body.note || "", 1000);
  const isTest = Boolean(body.testMode || body.isTest) && access.accessMode === "founder-override";
  const fixRequest = await getOrCreateFixRequest(env, row, access, summary, note, now, { isTest });

  if (PAID_LIKE_FIX_REQUEST_STATUSES.has(fixRequest.status)) {
    return jsonNoStore({
      ok: true,
      mode: fixRequest.status,
      request: fixRequestResponse(fixRequest, now),
      offer: FIX_PACK_OFFER
    });
  }

  if (REBUY_BLOCKED_FIX_REQUEST_STATUSES.has(fixRequest.status)) {
    return jsonNoStore({
      ok: true,
      mode: fixRequest.status,
      checkoutAvailable: false,
      message:
        "This Fix Pack was refunded or disputed, so checkout is closed for this report. Email support@seofixkit.com to restart a repair.",
      request: fixRequestResponse(fixRequest, now),
      offer: FIX_PACK_OFFER
    });
  }

  const cachedCheckoutFresh =
    fixRequest.status === "checkout_created" &&
    fixRequest.checkout_url &&
    fixRequest.checkout_session_id &&
    fixRequest.checkout_created_at &&
    fixRequest.checkout_created_at > isoSecondsFromNow(-CHECKOUT_URL_TTL_HOURS * 60 * 60);
  if (cachedCheckoutFresh) {
    return jsonNoStore({
      ok: true,
      mode: "checkout",
      checkoutUrl: fixRequest.checkout_url,
      request: fixRequestResponse(fixRequest, now),
      offer: FIX_PACK_OFFER
    });
  }

  if (!hasDodoCheckoutConfig(env)) {
    return jsonNoStore({
      ok: true,
      mode: "request",
      checkoutAvailable: false,
      message: "Fix request saved. Checkout is paused until payment and webhook config pass.",
      request: fixRequestResponse(fixRequest, now),
      offer: FIX_PACK_OFFER
    });
  }

  let checkout;
  try {
    checkout = await createDodoFixPackCheckout(request, env, row, fixRequest, access);
  } catch (error) {
    return jsonNoStore(
      {
        error: error?.message || "Dodo checkout could not be created.",
        code: error?.code || "DODO_CHECKOUT_ERROR",
        request: fixRequestResponse(fixRequest, now),
        offer: FIX_PACK_OFFER
      },
      503
    );
  }
  const checkoutCreatedAt = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET status = 'checkout_created',
         checkout_session_id = ?,
         checkout_url = ?,
         checkout_created_at = ?,
         product_id = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      checkout.checkoutSessionId,
      checkout.checkoutUrl,
      checkoutCreatedAt,
      dodoProductId(env),
      checkoutCreatedAt,
      fixRequest.id
    )
    .run();

  return jsonNoStore({
    ok: true,
    mode: "checkout",
    checkoutUrl: checkout.checkoutUrl,
    request: {
      ...fixRequestResponse(fixRequest, checkoutCreatedAt),
      status: "checkout_created",
      checkoutSessionId: checkout.checkoutSessionId,
      offer: FIX_PACK_OFFER,
      checkoutCreatedAt
    },
    offer: FIX_PACK_OFFER
  });
}

// Public, unauthenticated Fix Pack price for the homepage. Returns only the
// display price (no config internals), cached for an hour to keep Dodo calls
// off the public request path.
async function getPublicFixPackPricing(request, env, ctx) {
  const config = dodoCheckoutConfigStatus(env);
  if (!config.checkoutReady) return json({ ok: false }, 503);
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/public-pricing`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    // Base price without country/customer so one cached price serves everyone.
    const pricing = await previewDodoFixPackPricing({}, env, null);
    const response = new Response(
      JSON.stringify({ ok: true, pricing: { displayPrice: pricing.displayPrice || "" } }),
      {
        headers: secureHeaders({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=3600"
        })
      }
    );
    ctx?.waitUntil?.(cache.put(cacheKey, response.clone()));
    return response;
  } catch {
    return json({ ok: false }, 503);
  }
}

async function getFixPackPricingPreview(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);

  const config = dodoCheckoutConfigStatus(env);
  if (!config.checkoutReady) {
    return jsonNoStore(
      {
        ok: false,
        code: "PRICING_UNAVAILABLE",
        message: "Pricing is unavailable because checkout or webhook config is incomplete.",
        pricing: {
          status: "unavailable",
          source: "dodo",
          environment: config.environment || "",
          missing: dodoConfigMissing(config)
        }
      },
      503
    );
  }

  try {
    const pricing = await previewDodoFixPackPricing(request, env, access);
    return jsonNoStore({ ok: true, pricing });
  } catch (error) {
    return jsonNoStore(
      {
        ok: false,
        code: error?.code || "PRICING_UNAVAILABLE",
        message: error?.message || "Dodo pricing preview is unavailable.",
        pricing: {
          status: "unavailable",
          source: "dodo"
        }
      },
      503
    );
  }
}

async function getBillingSummary(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Billing storage is not configured." }, 503);

  const now = new Date().toISOString();
  const dodoConfig = dodoCheckoutConfigStatus(env);
  const pricing = await billingPricingState(request, env, access, dodoConfig);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE owner_email = ?
       AND is_test = 0
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(access.ownerEmail)
    .all();
  const fixRows = rows.results || [];
  const requests = fixRows.map((row) => billingFixRequestResponse(row, now));
  const payments = fixRows
    .filter((row) => row.payment_id || row.paid_at || row.refunded_at || row.dispute_event || row.status === "payment_failed")
    .map(billingPaymentResponse);

  return jsonNoStore({
    ok: true,
    owner: {
      email: access.ownerEmail
    },
    provider: {
      name: "Dodo Payments",
      source: "dodo",
      environment: dodoConfig.environment || "",
      checkoutReady: dodoConfig.checkoutReady,
      missing: dodoConfigMissing(dodoConfig)
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
    pricing,
    subscriptionState: {
      status: "not_live",
      label: "No recurring subscription",
      message: "SEO Fix Kit currently sells one-time Fix Pack requests. Recurring plans are not live yet."
    },
    subscriptions: [],
    requests,
    payments,
    generatedAt: now
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

async function listSiteClaims(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Site claim storage is not configured." }, 503);

  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM site_claims
     WHERE owner_email = ?
       AND revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(access.ownerEmail)
    .all();

  return jsonNoStore({
    ok: true,
    sites: (rows.results || []).map(siteClaimResponse)
  });
}

async function createSiteClaim(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Site claim storage is not configured." }, 503);

  const body = await request.json().catch(() => ({}));
  const host = claimHostFromInput(body.host || body.url || "");
  if (!host) return jsonNoStore({ error: "Enter a public website host to verify." }, 400);

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM site_claims
     WHERE owner_email = ?
       AND host = ?
       AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(access.ownerEmail, host)
    .first();
  if (existing?.id) {
    return jsonNoStore({ ok: true, site: siteClaimResponse(existing) });
  }

  const now = new Date().toISOString();
  const token = `sfk-${randomToken()}`;
  const id = crypto.randomUUID();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO site_claims
      (id, owner_email, host, verification_token, status, verification_method, created_at, updated_at, verified_at, last_checked_at, revoked_at)
     VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, NULL, NULL, NULL)`
  )
    .bind(id, access.ownerEmail, host, token, now, now)
    .run();

  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM site_claims WHERE id = ? LIMIT 1`).bind(id).first();
  return jsonNoStore({ ok: true, site: siteClaimResponse(row) });
}

async function verifySiteClaim(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Site claim storage is not configured." }, 503);

  const body = await request.json().catch(() => ({}));
  const claimId = cleanText(body.id || body.claimId || "", 80);
  const host = claimHostFromInput(body.host || body.url || "");
  const row = claimId
    ? await env.WAITLIST_DB.prepare(
        `SELECT *
         FROM site_claims
         WHERE id = ?
           AND owner_email = ?
           AND revoked_at IS NULL
         LIMIT 1`
      )
        .bind(claimId, access.ownerEmail)
        .first()
    : host
      ? await env.WAITLIST_DB.prepare(
          `SELECT *
           FROM site_claims
           WHERE host = ?
             AND owner_email = ?
             AND revoked_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1`
        )
          .bind(host, access.ownerEmail)
          .first()
      : null;

  if (!row?.id) return jsonNoStore({ error: "Site claim not found." }, 404);

  const [dnsVerified, fileVerified] = await Promise.all([
    verifySiteClaimDns(row.host, row.verification_token),
    verifySiteClaimHttpsFile(row.host, row.verification_token)
  ]);
  const now = new Date().toISOString();
  if (dnsVerified.ok || fileVerified.ok) {
    const method = dnsVerified.ok ? "dns-txt" : "https-file";
    await env.WAITLIST_DB.prepare(
      `UPDATE site_claims
       SET status = 'verified',
        verification_method = ?,
        verified_at = COALESCE(verified_at, ?),
        last_checked_at = ?,
        updated_at = ?
       WHERE id = ?`
    )
      .bind(method, now, now, now, row.id)
      .run();
    const updated = await env.WAITLIST_DB.prepare(`SELECT * FROM site_claims WHERE id = ? LIMIT 1`).bind(row.id).first();
    return jsonNoStore({ ok: true, verified: true, site: siteClaimResponse(updated) });
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE site_claims
     SET last_checked_at = ?,
      updated_at = ?
     WHERE id = ?`
  )
    .bind(now, now, row.id)
    .run();
  const updated = await env.WAITLIST_DB.prepare(`SELECT * FROM site_claims WHERE id = ? LIMIT 1`).bind(row.id).first();
  return jsonNoStore({
    ok: true,
    verified: false,
    site: siteClaimResponse(updated),
    message: dnsVerified.error || fileVerified.error || "Verification record was not found yet."
  });
}

async function auditAuthorizationStatus(env, access, targetUrl, options = {}) {
  if (access.accessMode === "founder-override") return { ok: true };
  const host = safeHostname(targetUrl);
  if (!host) return { ok: false, status: 400, error: "Enter a valid public website URL." };
  // A claim on the apex domain also covers www and vice versa — customers
  // rightly treat them as one site.
  const siblingHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, host, status, verified_at
     FROM site_claims
     WHERE owner_email = ?
       AND host IN (?, ?)
       AND status = 'verified'
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(access.ownerEmail, host, siblingHost)
    .first();
  if (row?.id) return { ok: true, site: siteClaimResponse(row) };
  if (options.allowLite) return { ok: true, lite: true };
  return {
    ok: false,
    status: 403,
    code: "SITE_VERIFICATION_REQUIRED",
    error: `Verify ${host} before running a self-serve audit. A homepage-only Lite check (1 page) runs without verification.`,
    site: siteClaimInstructions({ host, verification_token: "" })
  };
}

function siteClaimResponse(row = {}) {
  const instructions = siteClaimInstructions(row);
  return {
    id: row.id || "",
    host: row.host || "",
    status: row.status || "pending",
    verificationMethod: row.verification_method || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    verifiedAt: row.verified_at || "",
    lastCheckedAt: row.last_checked_at || "",
    ...instructions
  };
}

function siteClaimInstructions(row = {}) {
  const host = row.host || "";
  const token = row.verification_token || "";
  const proof = token ? siteVerificationText(token) : "";
  return {
    dnsName: host ? `_seofixkit.${host}` : "",
    dnsType: "TXT",
    dnsValue: proof,
    filePath: "/.well-known/seofixkit.txt",
    fileUrl: host ? `https://${host}/.well-known/seofixkit.txt` : "",
    fileContents: proof
  };
}

function siteVerificationText(token) {
  return `seofixkit-site-verification=${token}`;
}

function cleanWebhookEvents(events = []) {
  const allowed = new Set(["audit.completed", "audit.failed", "large_crawl.created", "large_crawl.ready_to_merge"]);
  const values = Array.isArray(events) ? events : [];
  const cleaned = values.filter((event) => allowed.has(String(event)));
  return cleaned.length ? [...new Set(cleaned)] : ["audit.completed", "audit.failed"];
}

async function apiWebhookSigningSecret(env, webhookId) {
  // Fail closed: without a dedicated secret, webhook signatures would be
  // forgeable, so refuse to sign rather than fall back to a known seed.
  const seed = String(env.SEOFIXKIT_API_WEBHOOK_SECRET || "");
  if (!seed) {
    throw new Error("Webhook signing is not configured. Set the SEOFIXKIT_API_WEBHOOK_SECRET secret.");
  }
  const digest = await hmacSha256Hex(seed, webhookId);
  return `whsec_${digest.slice(0, 32)}`;
}

async function apiWebhookSignature(env, webhookId, timestamp, body) {
  const secret = await apiWebhookSigningSecret(env, webhookId);
  return hmacSha256Hex(secret, `${timestamp}.${body}`);
}

async function deliverApiWebhooks(env, ownerEmail, eventType, data = {}) {
  if (!env.WAITLIST_DB) return;
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM api_webhooks
     WHERE owner_email = ?
       AND status = 'active'
       AND revoked_at IS NULL
     ORDER BY created_at ASC
     LIMIT 20`
  )
    .bind(ownerEmail)
    .all();
  const webhooks = (rows.results || []).filter((row) => parseJson(row.events_json, []).includes(eventType));
  for (const webhook of webhooks) {
    const now = new Date().toISOString();
    const payload = {
      id: crypto.randomUUID(),
      event: eventType,
      created_at: now,
      data
    };
    const body = JSON.stringify(payload);
    const eventId = payload.id;
    await env.WAITLIST_DB.prepare(
      `INSERT INTO api_webhook_events
        (id, webhook_id, owner_email, event_type, audit_job_id, report_id, status, http_status, error, payload_json, created_at, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        eventId,
        webhook.id,
        ownerEmail,
        eventType,
        data.audit?.audit_id || null,
        data.audit?.report_id || data.report?.id || null,
        "pending",
        null,
        null,
        body,
        now,
        null
      )
      .run();
    try {
      const urlStatus = publicWebhookUrlStatus(webhook.url);
      if (!urlStatus.ok) throw new Error(urlStatus.error);
      if (await resolvesToPrivateAddress(new URL(urlStatus.url).hostname)) {
        throw new Error("Webhook host resolves to a private or internal address.");
      }
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "SEO Fix Kit Webhooks",
          "x-seofixkit-event": eventType,
          "x-seofixkit-signature": `t=${timestamp},v1=${await apiWebhookSignature(env, webhook.id, timestamp, body)}`
        },
        body,
        redirect: "manual"
      });
      const deliveredAt = new Date().toISOString();
      const status = response.ok ? "delivered" : "failed";
      const error = response.ok ? "" : `HTTP ${response.status}`;
      await env.WAITLIST_DB.batch([
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhook_events
           SET status = ?, http_status = ?, error = ?, delivered_at = ?
           WHERE id = ?`
        ).bind(status, response.status, error || null, deliveredAt, eventId),
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhooks
           SET last_delivery_at = ?, last_delivery_status = ?, last_error = ?, updated_at = ?
           WHERE id = ?`
        ).bind(deliveredAt, status, error || null, deliveredAt, webhook.id)
      ]);
    } catch (error) {
      const deliveredAt = new Date().toISOString();
      const message = cleanText(error?.message || "Webhook delivery failed.", 500);
      await env.WAITLIST_DB.batch([
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhook_events
           SET status = 'failed', error = ?, delivered_at = ?
           WHERE id = ?`
        ).bind(message, deliveredAt, eventId),
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhooks
           SET last_delivery_at = ?, last_delivery_status = 'failed', last_error = ?, updated_at = ?
           WHERE id = ?`
        ).bind(deliveredAt, message, deliveredAt, webhook.id)
      ]);
    }
  }
}

async function verifySiteClaimDns(host, token) {
  const expected = siteVerificationText(token);
  const dnsName = `_seofixkit.${host}`;
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

async function verifySiteClaimHttpsFile(host, token) {
  const expected = siteVerificationText(token);
  try {
    const response = await fetch(`https://${host}/.well-known/seofixkit.txt`, {
      headers: { accept: "text/plain" }
    });
    if (!response.ok) return { ok: false, error: "Verification file was not found yet." };
    const text = await readSmallText(response, 8192);
    return text.includes(expected)
      ? { ok: true }
      : { ok: false, error: "Verification file does not contain the expected token yet." };
  } catch {
    return { ok: false, error: "Verification file was not reachable." };
  }
}

async function readSmallText(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maxBytes - total;
    chunks.push(value.slice(0, remaining));
    total += Math.min(value.byteLength, remaining);
    if (value.byteLength > remaining) break;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
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

async function billingPricingState(request, env, access, config) {
  if (!config.checkoutReady) {
    return {
      status: "unavailable",
      source: "dodo",
      environment: config.environment || "",
      missing: dodoConfigMissing(config),
      message: "Pricing is unavailable because checkout or webhook config is incomplete."
    };
  }

  try {
    return await previewDodoFixPackPricing(request, env, access);
  } catch (error) {
    return {
      status: "unavailable",
      source: "dodo",
      environment: config.environment || "",
      missing: [],
      message: error?.message || "Dodo pricing preview is unavailable."
    };
  }
}

async function getOrCreateFixRequest(env, reportRow, access, summary, note, now, options = {}) {
  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE report_id = ? AND owner_email = ?
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(reportRow.id, access.ownerEmail)
    .first();
  if (existing?.id) return existing;

  const id = crypto.randomUUID();
  const isTest = options.isTest ? 1 : 0;
  const insert = await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_requests
      (id, report_id, owner_email, target_url, target_host, score, issue_count, status, note, is_test, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
     ON CONFLICT(report_id, owner_email) DO NOTHING`
  )
    .bind(
      id,
      reportRow.id,
      access.ownerEmail,
      reportRow.url,
      reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
      reportRow.score,
      Number(summary.totalFindings || 0),
      note,
      isTest,
      now,
      now
    )
    .run();
  if (insert?.meta?.changes === 0) {
    const raced = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM fix_requests
       WHERE report_id = ? AND owner_email = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(reportRow.id, access.ownerEmail)
      .first();
    if (raced?.id) return raced;
  }
  await logFixRequestEvent(env, {
    fixRequestId: id,
    event: "created",
    actorType: "owner",
    actorEmail: access.ownerEmail,
    fromStatus: "",
    toStatus: "new",
    reason: note,
    detail: { reportId: reportRow.id, isTest: Boolean(isTest) }
  });

  return {
    id,
    report_id: reportRow.id,
    owner_email: access.ownerEmail,
    target_url: reportRow.url,
    target_host: reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
    score: reportRow.score,
    issue_count: Number(summary.totalFindings || 0),
    status: "new",
    note,
    is_test: isTest,
    created_at: now,
    updated_at: now
  };
}

function fixRequestResponse(row, now = new Date().toISOString()) {
  return {
    id: row.id,
    status: row.status || "new",
    statusLabel: fixRequestStatusLabel(row.status || "new"),
    targetUrl: row.target_url,
    targetHost: row.target_host,
    score: row.score,
    issueCount: row.issue_count,
    checkoutSessionId: row.checkout_session_id || "",
    customerNote: row.customer_note || "",
    deliveryUrl: row.delivery_url || "",
    finalReportId: row.final_report_id || "",
    inProgressAt: row.in_progress_at || "",
    deliveredAt: row.delivered_at || "",
    paidAt: row.paid_at || "",
    dueAt: row.due_at || "",
    nextUpdateAt: row.next_update_at || "",
    statusReason: row.status_reason || "",
    isTest: Boolean(row.is_test),
    refundedAt: row.refunded_at || "",
    beforeAfterSummary: parseJson(row.before_after_summary_json, null),
    createdAt: row.created_at || now,
    updatedAt: row.updated_at || now
  };
}

function billingFixRequestResponse(row, now = new Date().toISOString()) {
  return {
    ...fixRequestResponse(row, now),
    reportId: row.report_id,
    reportPath: `/beta/reports/${row.report_id}`,
    briefPath: `/api/reports/${row.report_id}/brief.md`
  };
}

function billingPaymentResponse(row) {
  const currency = normalizeCurrencyCode(row.payment_currency || row.refund_currency || "");
  const amountMinor = numberOrNull(row.payment_amount);
  const refundCurrency = normalizeCurrencyCode(row.refund_currency || "");
  const refundAmountMinor = numberOrNull(row.refund_amount);
  const type = row.refunded_at
    ? "refund"
    : row.dispute_event
      ? "dispute"
      : row.status === "payment_failed"
        ? "failed_payment"
        : "payment";

  return {
    id: row.payment_id || row.checkout_session_id || row.id,
    type,
    status: row.status || "",
    statusLabel: fixRequestStatusLabel(row.status || "new"),
    paymentId: row.payment_id || "",
    checkoutSessionId: row.checkout_session_id || "",
    refundId: row.refund_id || "",
    disputeEvent: row.dispute_event || "",
    amountMinor,
    currency,
    displayAmount: currency && amountMinor !== null ? formatMinorCurrency(amountMinor, currency) : "",
    refundAmountMinor,
    refundCurrency,
    displayRefundAmount: refundCurrency && refundAmountMinor !== null ? formatMinorCurrency(refundAmountMinor, refundCurrency) : "",
    targetHost: row.target_host,
    targetUrl: row.target_url,
    reportPath: `/beta/reports/${row.report_id}`,
    paidAt: row.paid_at || "",
    refundedAt: row.refunded_at || "",
    disputedAt: row.disputed_at || "",
    createdAt: row.paid_at || row.refunded_at || row.disputed_at || row.updated_at || row.created_at || ""
  };
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

function isAllowedAdminStatusTransition(currentStatus, requestedStatus) {
  const current = normalizeFixRequestStatus(currentStatus, "new");
  const requested = normalizeFixRequestStatus(requestedStatus, current);
  if (current === requested) return ADMIN_EDITABLE_FIX_REQUEST_STATUSES.has(requested) || requested === "paid";
  const allowed = {
    new: new Set(["checkout_created"]),
    checkout_created: new Set(["checkout_created"]),
    payment_failed: new Set(["checkout_created"]),
    paid: new Set(["in_progress", "delivered"]),
    in_progress: new Set(["delivered"]),
    delivered: new Set([]),
    refunded: new Set([]),
    refund_failed: new Set([]),
    disputed: new Set([])
  };
  return Boolean(allowed[current]?.has(requested));
}

const PRESERVED_FIX_REQUEST_STATUSES = ["paid", "in_progress", "delivered", "refunded", "refund_failed", "disputed"];

async function preserveFixRequestReports(env, fixRequest) {
  const ids = [fixRequest?.report_id, fixRequest?.final_report_id]
    .map((value) => String(value || ""))
    .filter((value) => isSafeReportId(value));
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(", ");
  await env.WAITLIST_DB.prepare(
    `UPDATE audit_reports SET expires_at = NULL, updated_at = ? WHERE id IN (${placeholders})`
  )
    .bind(new Date().toISOString(), ...ids)
    .run();
}

async function validateFinalReportForFixRequest(env, fixRequest, finalReportId) {
  if (!isSafeReportId(finalReportId)) return { ok: false, error: "Final rerun report was not found." };
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, owner_email, score, summary_json, created_at, expires_at
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(finalReportId)
    .first();
  if (!row?.id) return { ok: false, error: "Final rerun report was not found." };
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    return { ok: false, error: "Final rerun report is expired. Run the audit again first." };
  }
  if (row.owner_email !== fixRequest.owner_email) {
    return { ok: false, error: "Final rerun report belongs to another customer." };
  }
  const finalHost = row.target_host || safeHostname(row.url);
  const originalHost = fixRequest.target_host || safeHostname(fixRequest.target_url);
  if (finalHost !== originalHost) {
    return { ok: false, error: "Final rerun report must be for the same website." };
  }
  if (fixRequest.paid_at && row.created_at && row.created_at < fixRequest.paid_at) {
    return { ok: false, error: "Final rerun report must be created after payment." };
  }
  const summary = parseJson(row.summary_json, {});
  return {
    ok: true,
    beforeAfterSummary: {
      beforeReportId: fixRequest.report_id,
      finalReportId: row.id,
      beforeScore: Number(fixRequest.score || 0),
      afterScore: Number(row.score || 0),
      beforeFindings: Number(fixRequest.issue_count || 0),
      afterFindings: Number(summary.totalFindings || 0),
      generatedAt: new Date().toISOString()
    }
  };
}

async function previewDodoFixPackPricing(request, env, access) {
  const body = {
    product_cart: [{ product_id: dodoProductId(env), quantity: 1 }],
    adaptive_currency_fees_inclusive: dodoAdaptiveCurrencyFeesInclusive(env),
    customer: access?.ownerEmail ? { email: access.ownerEmail } : undefined
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const { response, payload } = await fetchDodoJson(`${dodoBaseUrl(env)}/checkouts/preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || "Dodo pricing preview failed."), {
      status: response.status,
      code: payload?.code || "DODO_PRICING_PREVIEW_ERROR"
    });
  }

  const pricing = parseDodoPricingPreview(payload);
  if (!pricing.displayPrice) {
    throw Object.assign(new Error("Dodo did not return a displayable price."), {
      code: "DODO_PRICING_FORMAT_ERROR"
    });
  }
  return {
    ...pricing,
    status: "available",
    source: "dodo",
    country: country || "",
    feesInclusive: dodoAdaptiveCurrencyFeesInclusive(env)
  };
}

async function createDodoFixPackCheckout(request, env, reportRow, fixRequest, access) {
  const returnUrl = new URL(request.url);
  returnUrl.pathname = `/beta/reports/${reportRow.id}`;
  returnUrl.search = "";
  returnUrl.searchParams.set("checkout", "return");
  returnUrl.searchParams.set("fixRequestId", fixRequest.id);

  const body = {
    product_cart: [{ product_id: dodoProductId(env), quantity: 1 }],
    return_url: returnUrl.toString(),
    adaptive_currency_fees_inclusive: dodoAdaptiveCurrencyFeesInclusive(env),
    customer: { email: access.ownerEmail },
    metadata: {
      product_key: FIX_PACK_OFFER.productKey,
      fix_request_id: fixRequest.id,
      report_id: reportRow.id,
      target_host: reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
      test_mode: fixRequest.is_test ? "1" : "0"
    }
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const { response, payload } = await fetchDodoJson(`${dodoBaseUrl(env)}/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message =
      payload?.code === "MERCHANT_NOT_LIVE"
        ? "Dodo live payments are not enabled for this merchant yet."
        : payload?.message || "Dodo checkout could not be created.";
    return Promise.reject(Object.assign(new Error(message), { status: response.status, code: payload?.code || "" }));
  }

  const checkoutUrl = payload.checkout_url || payload.payment_link || "";
  if (!checkoutUrl) throw new Error("Dodo did not return a checkout URL.");
  return {
    checkoutUrl,
    checkoutSessionId: payload.session_id || payload.checkout_session_id || payload.id || ""
  };
}

async function fetchDodoJson(url, options) {
  if (!url) {
    throw Object.assign(new Error("Dodo environment is not configured."), { code: "DODO_ENVIRONMENT_MISSING" });
  }
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function parseDodoPricingPreview(payload = {}) {
  const breakup = objectValue(payload.current_breakup) || objectValue(payload.breakup) || {};
  const currency = normalizeCurrencyCode(payload.currency || payload.payment_currency || payload.checkout_currency);
  const amountMinor = numberOrNull(
    breakup.total_amount ??
      payload.total_amount ??
      payload.amount_total ??
      payload.total_price ??
      payload.total ??
      payload.amount
  );
  const displayPrice =
    textValue(payload.display_price) ||
    textValue(payload.displayPrice) ||
    textValue(payload.formatted_total) ||
    textValue(payload.formattedTotal) ||
    (currency && amountMinor !== null ? formatMinorCurrency(amountMinor, currency) : "");

  return {
    displayPrice,
    currency,
    amountMinor,
    subtotalMinor: numberOrNull(breakup.subtotal ?? payload.subtotal),
    taxMinor: numberOrNull(breakup.tax ?? payload.tax),
    discountMinor: numberOrNull(breakup.discount ?? payload.discount)
  };
}

function dodoConfigMissing(config = {}) {
  const missing = [];
  if (!config.apiKey) missing.push("apiKey");
  if (!config.productId) missing.push("productId");
  if (!config.brandId) missing.push("brandId");
  if (!config.environment) missing.push("environment");
  if (!config.webhookSecret) missing.push("webhookSecret");
  return missing;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function textValue(value) {
  const text = String(value || "").trim();
  return text || "";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCurrencyCode(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function formatMinorCurrency(amountMinor, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(amountMinor / minorCurrencyDivisor(currency));
  } catch {
    return currency ? `${currency} ${amountMinor}` : String(amountMinor);
  }
}

function minorCurrencyDivisor(currency) {
  return new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]).has(currency)
    ? 1
    : 100;
}

async function handleDodoWebhook(request, env, ctx) {
  if (!env.WAITLIST_DB || !dodoWebhookSecret(env)) {
    return jsonNoStore({ error: "Dodo webhook is not configured." }, 503);
  }

  const payloadText = await request.text();
  const webhookId = request.headers.get("webhook-id") || request.headers.get("svix-id") || "";
  const webhookTimestamp =
    request.headers.get("webhook-timestamp") || request.headers.get("svix-timestamp") || "";
  const webhookSignature =
    request.headers.get("webhook-signature") || request.headers.get("svix-signature") || "";

  const verified = await verifyDodoWebhookSignature({
    payload: payloadText,
    webhookId,
    webhookTimestamp,
    webhookSignature,
    secret: dodoWebhookSecret(env)
  });
  if (!verified) return jsonNoStore({ error: "Invalid signature." }, 400);

  let event;
  try {
    event = JSON.parse(payloadText);
  } catch {
    return jsonNoStore({ error: "Invalid JSON payload." }, 400);
  }

  const eventType = String(event?.type || "");
  const payment = extractDodoPayment(event?.data || {});
  const payloadHash = await sha256Hex(payloadText);
  const reserved = await reserveDodoWebhookEvent(env, {
    webhookId,
    eventType,
    payment,
    payloadHash,
    payloadText
  });
  if (reserved.duplicate) return jsonNoStore({ received: true, duplicate: true });

  try {
    const result = await processDodoPaymentWebhook(env, eventType, payment, webhookId);
    await markDodoWebhookProcessed(env, webhookId, result.status || "processed", "", result.fixRequestId || payment.metadataFixRequestId || "");
    if (result.paymentNotification?.fixRequest) {
      const notification = notifyPaymentSucceeded(env, result.paymentNotification.fixRequest, payment);
      if (ctx?.waitUntil) ctx.waitUntil(notification);
      else await notification;
    }
    return jsonNoStore({ received: true, ...result });
  } catch (error) {
    await markDodoWebhookProcessed(env, webhookId, "error", error?.message || "Webhook processing failed.", payment.metadataFixRequestId || "");
    return jsonNoStore({ error: "Webhook processing failed." }, 500);
  }
}

async function reserveDodoWebhookEvent(env, { webhookId, eventType, payment, payloadHash, payloadText }) {
  if (!webhookId) throw new Error("Missing Dodo webhook id.");
  const now = new Date().toISOString();
  const inserted = await env.WAITLIST_DB.prepare(
    `INSERT OR IGNORE INTO dodo_webhook_events
      (webhook_id, event_type, payment_id, fix_request_id, status, error, payload_hash, payload_json,
       received_count, first_received_at, last_received_at, processed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'received', '', ?, ?, 1, ?, ?, '', ?, ?)`
  )
    .bind(
      webhookId,
      eventType,
      payment.paymentId,
      payment.metadataFixRequestId,
      payloadHash,
      payloadText.slice(0, 10000),
      now,
      now,
      now,
      now
    )
    .run();

  if (inserted?.meta?.changes === 1) return { duplicate: false };

  const existing = await env.WAITLIST_DB.prepare(
    "SELECT status, payload_hash FROM dodo_webhook_events WHERE webhook_id = ?"
  )
    .bind(webhookId)
    .first();
  if (existing?.payload_hash && existing.payload_hash !== payloadHash) {
    await markDodoWebhookProcessed(env, webhookId, "error", "Webhook id replayed with a different payload.", payment.metadataFixRequestId || "");
    throw new Error("Webhook id replayed with a different payload.");
  }
  if (existing?.status === "processed" || existing?.status === "ignored") return { duplicate: true };
  if (existing) {
    await env.WAITLIST_DB.prepare(
      `UPDATE dodo_webhook_events
       SET received_count = received_count + 1, last_received_at = ?, updated_at = ?
       WHERE webhook_id = ?`
    )
      .bind(now, now, webhookId)
      .run();
    return { duplicate: false };
  }
  throw new Error("Webhook receipt could not be reserved.");
}

async function processDodoPaymentWebhook(env, eventType, payment, webhookId = "") {
  if (!payment.paymentId && !payment.checkoutSessionId && !payment.metadataFixRequestId) {
    return { ok: false, ignored: true, status: "ignored", reason: "missing_payment_identity" };
  }

  const fixRequest = await findFixRequestForPayment(env, payment);
  if (!fixRequest?.id) {
    return { ok: false, ignored: true, status: "ignored", reason: "fix_request_not_found" };
  }

  const now = new Date().toISOString();
  const identity = dodoPaymentIdentityStatus(env, eventType, payment, fixRequest);
  if (!identity.ok) {
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_identity_rejected",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status || "new",
      reason: identity.reason,
      detail: { eventType, paymentId: payment.paymentId, webhookId }
    });
    return { ok: false, ignored: true, status: "ignored", reason: identity.reason, fixRequestId: fixRequest.id };
  }

  if (DODO_PAYMENT_SUCCESS_EVENTS.has(eventType)) {
    if (payment.status && !PAID_STATUSES.has(payment.status)) {
      return { ok: false, ignored: true, status: "ignored", reason: "not_paid", fixRequestId: fixRequest.id };
    }
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE
             WHEN status IN ('in_progress', 'delivered', 'refunded', 'disputed') THEN status
             ELSE 'paid'
           END,
           payment_id = ?,
           checkout_session_id = COALESCE(checkout_session_id, ?),
           payment_amount = ?,
           payment_currency = ?,
           payment_customer_email = ?,
           dodo_business_id = ?,
           dodo_brand_id = ?,
           paid_at = COALESCE(paid_at, ?),
           due_at = COALESCE(due_at, ?),
           next_update_at = COALESCE(next_update_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        payment.paymentId,
        payment.checkoutSessionId,
        payment.amount || null,
        payment.currency || "",
        payment.customerEmail || "",
        payment.businessId || "",
        payment.brandId || "",
        now,
        isoDaysFromNow(FIX_PACK_DUE_DAYS),
        isoDaysFromNow(FIX_PACK_NEXT_UPDATE_DAYS),
        now,
        fixRequest.id
      )
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_succeeded",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: PAID_LIKE_FIX_REQUEST_STATUSES.has(fixRequest.status) ? fixRequest.status : "paid",
      reason: payment.paymentId,
      detail: {
        webhookId,
        amount: payment.amount,
        currency: payment.currency,
        checkoutSessionId: payment.checkoutSessionId
      }
    });
    const updated = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE id = ? LIMIT 1")
      .bind(fixRequest.id)
      .first();
    await preserveFixRequestReports(env, updated || fixRequest);
    return {
      ok: true,
      status: "processed",
      paid: true,
      fixRequestId: fixRequest.id,
      paymentNotification: { fixRequest: updated || fixRequest }
    };
  }

  if (DODO_PAYMENT_FAILURE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE WHEN paid_at IS NOT NULL THEN status ELSE 'payment_failed' END,
           payment_id = COALESCE(payment_id, ?),
           checkout_session_id = COALESCE(checkout_session_id, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.paymentId, payment.checkoutSessionId, now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_failed",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.paid_at ? fixRequest.status || "new" : "payment_failed",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", paid: false, fixRequestId: fixRequest.id };
  }

  if (DODO_PAYMENT_PROCESSING_EVENTS.has(eventType)) {
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_processing",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status || "new",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", processing: true, fixRequestId: fixRequest.id };
  }

  if (DODO_REFUND_SUCCESS_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = 'refunded',
           refund_id = ?,
           refund_amount = ?,
           refund_currency = ?,
           refunded_at = COALESCE(refunded_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.refundId || "", payment.amount || null, payment.currency || "", now, now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "refund_succeeded",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: "refunded",
      reason: payment.refundId || eventType,
      detail: { webhookId, paymentId: payment.paymentId, amount: payment.amount, currency: payment.currency }
    });
    return { ok: true, status: "processed", refunded: true, fixRequestId: fixRequest.id };
  }

  if (DODO_REFUND_FAILURE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE WHEN status = 'refunded' THEN status ELSE 'refund_failed' END,
           refund_id = COALESCE(refund_id, ?),
           refund_amount = COALESCE(refund_amount, ?),
           refund_currency = COALESCE(refund_currency, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.refundId || "", payment.amount || null, payment.currency || "", now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "refund_failed",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status === "refunded" ? "refunded" : "refund_failed",
      reason: payment.refundId || eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", refundFailed: true, fixRequestId: fixRequest.id };
  }

  if (DODO_DISPUTE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE WHEN status = 'delivered' THEN status ELSE 'disputed' END,
           dispute_event = ?,
           disputed_at = COALESCE(disputed_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(eventType, now, now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "dispute_event",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status === "delivered" ? "delivered" : "disputed",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", disputed: true, fixRequestId: fixRequest.id };
  }

  return { ok: true, ignored: true, status: "ignored", reason: "unsupported_event", fixRequestId: fixRequest.id };
}

async function findFixRequestForPayment(env, payment) {
  if (payment.metadataFixRequestId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE id = ? LIMIT 1")
      .bind(payment.metadataFixRequestId)
      .first();
    if (row?.id) return row;
  }
  if (payment.checkoutSessionId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE checkout_session_id = ? LIMIT 1")
      .bind(payment.checkoutSessionId)
      .first();
    if (row?.id) return row;
  }
  if (payment.paymentId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE payment_id = ? LIMIT 1")
      .bind(payment.paymentId)
      .first();
    if (row?.id) return row;
  }
  return null;
}

function dodoPaymentIdentityStatus(env, eventType, payment, fixRequest) {
  if (DODO_REFUND_SUCCESS_EVENTS.has(eventType) || DODO_REFUND_FAILURE_EVENTS.has(eventType) || DODO_DISPUTE_EVENTS.has(eventType)) {
    if (!payment.paymentId || !fixRequest.payment_id || payment.paymentId !== fixRequest.payment_id) {
      return { ok: false, reason: "payment_id_mismatch" };
    }
    return { ok: true };
  }

  if (payment.metadataProductKey !== FIX_PACK_OFFER.productKey) {
    return { ok: false, reason: payment.metadataProductKey ? "product_key_mismatch" : "missing_product_key" };
  }
  if (!dodoProductMatches(payment, dodoProductId(env))) {
    return { ok: false, reason: payment.productIds.length ? "product_mismatch" : "missing_product_cart" };
  }
  if (payment.productQuantity !== 1) {
    return { ok: false, reason: "product_quantity_mismatch" };
  }
  const expectedBrandId = dodoBrandId(env);
  if (expectedBrandId && payment.brandId !== expectedBrandId) {
    return { ok: false, reason: payment.brandId ? "brand_mismatch" : "missing_brand_id" };
  }
  const expectedBusinessId = String(env.DODO_SEOFIXKIT_BUSINESS_ID || "");
  if (expectedBusinessId && payment.businessId !== expectedBusinessId) {
    return { ok: false, reason: payment.businessId ? "business_mismatch" : "missing_business_id" };
  }
  if (payment.metadataReportId && payment.metadataReportId !== fixRequest.report_id) {
    return { ok: false, reason: "report_id_mismatch" };
  }
  if (
    fixRequest.checkout_session_id &&
    payment.checkoutSessionId &&
    payment.checkoutSessionId !== fixRequest.checkout_session_id &&
    payment.metadataFixRequestId !== fixRequest.id
  ) {
    return { ok: false, reason: "checkout_session_mismatch" };
  }
  if (payment.customerEmail && normalizeEmail(payment.customerEmail) !== fixRequest.owner_email) {
    return { ok: false, reason: "customer_email_mismatch" };
  }
  if (!payment.amount || !payment.currency) {
    return { ok: false, reason: "missing_payment_amount" };
  }
  return { ok: true };
}

async function markDodoWebhookProcessed(env, webhookId, status, error = "", fixRequestId = "") {
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE dodo_webhook_events
     SET status = ?, error = ?, fix_request_id = COALESCE(NULLIF(fix_request_id, ''), ?), processed_at = ?, updated_at = ?
     WHERE webhook_id = ?`
  )
    .bind(status, String(error || "").slice(0, 1000), fixRequestId, status === "processed" ? now : "", now, webhookId)
    .run();
}

async function notifyPaymentSucceeded(env, fixRequest, payment) {
  const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com").replace(/\/+$/, "");
  const report = await reportForNotification(env, fixRequest.report_id);
  const recipients = [
    { type: "owner", email: normalizeEmail(fixRequest.owner_email) },
    { type: "admin", email: adminNotificationEmail(env) }
  ];
  const results = [];

  for (const recipient of recipients) {
    results.push(
      await sendFixPackPaymentEmail({
        env,
        appOrigin,
        fixRequest,
        report,
        payment,
        recipientType: recipient.type,
        recipientEmail: recipient.email
      })
    );
  }

  const now = new Date().toISOString();
  const errors = results
    .filter((result) => result.status !== "sent" && result.error)
    .map((result) => `${result.recipientType}:${result.error}`)
    .join("; ")
    .slice(0, 1000);
  await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET last_notification_at = ?,
         notification_error = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(now, errors, now, fixRequest.id)
    .run();
}

async function sendFixPackPaymentEmail({
  env,
  appOrigin,
  fixRequest,
  report,
  payment,
  recipientType,
  recipientEmail
}) {
  const event = "payment_succeeded";
  if (await hasSentFixRequestNotification(env, fixRequest.id, event, recipientType)) {
    return { recipientType, status: "duplicate" };
  }
  if (!recipientEmail) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail: "",
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_recipient"
    });
    return { recipientType, status: "skipped", error: "missing_recipient" };
  }

  if (!isEmailConfigured(env)) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_email_config"
    });
    return { recipientType, status: "skipped", error: "missing_email_config" };
  }

  const email = buildPaymentNotificationEmail({
    appOrigin,
    fixRequest,
    report,
    payment,
    recipientType
  });
  try {
    const payload = await sendWorkerEmail(env, {
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      tag: "fix-pack-payment"
    });
    const providerMessageId = payload.messageId;
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "sent",
      provider: EMAIL_PROVIDER,
      providerMessageId
    });
    return { recipientType, status: "sent", providerMessageId };
  } catch (error) {
    const message = String(error?.message || "Email send failed.").slice(0, 1000);
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "error",
      provider: EMAIL_PROVIDER,
      error: message
    });
    return { recipientType, status: "error", error: message };
  }
}

async function notifyFixRequestStatus(env, fixRequest, status) {
  const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com").replace(/\/+$/, "");
  const report = await reportForNotification(env, fixRequest.report_id);
  const event = status === "delivered" ? "delivery_ready" : "repair_started";
  const beforeAfter = parseJson(fixRequest.before_after_summary_json, null);
  const recipients = [
    { type: "owner", email: normalizeEmail(fixRequest.owner_email) },
    { type: "admin", email: adminNotificationEmail(env) }
  ];
  const results = [];

  for (const recipient of recipients) {
    results.push(
      await sendFixPackStatusEmail({
        env,
        appOrigin,
        fixRequest,
        report,
        status,
        event,
        beforeAfter,
        recipientType: recipient.type,
        recipientEmail: recipient.email
      })
    );
  }

  const now = new Date().toISOString();
  const errors = results
    .filter((result) => result.status !== "sent" && result.status !== "duplicate" && result.error)
    .map((result) => `${result.recipientType}:${result.error}`)
    .join("; ")
    .slice(0, 1000);
  if (status === "delivered") {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET delivery_notified_at = COALESCE(delivery_notified_at, ?),
           delivery_notification_error = ?,
           last_notification_at = ?,
           notification_error = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(now, errors, now, errors, now, fixRequest.id)
      .run();
  } else {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET last_notification_at = ?,
           notification_error = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(now, errors, now, fixRequest.id)
      .run();
  }
}

async function sendFixPackStatusEmail({
  env,
  appOrigin,
  fixRequest,
  report,
  status,
  event,
  beforeAfter,
  recipientType,
  recipientEmail
}) {
  if (await hasSentFixRequestNotification(env, fixRequest.id, event, recipientType)) {
    return { recipientType, status: "duplicate" };
  }
  if (!recipientEmail) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail: "",
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_recipient"
    });
    return { recipientType, status: "skipped", error: "missing_recipient" };
  }

  if (!isEmailConfigured(env)) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_email_config"
    });
    return { recipientType, status: "skipped", error: "missing_email_config" };
  }

  const email = buildStatusNotificationEmail({
    appOrigin,
    fixRequest,
    report,
    status,
    beforeAfter,
    recipientType
  });
  try {
    const payload = await sendWorkerEmail(env, {
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      tag: event === "delivery_ready" ? "fix-pack-delivery" : "fix-pack-status"
    });
    const providerMessageId = payload.messageId;
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "sent",
      provider: EMAIL_PROVIDER,
      providerMessageId
    });
    return { recipientType, status: "sent", providerMessageId };
  } catch (error) {
    const message = String(error?.message || "Email send failed.").slice(0, 1000);
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "error",
      provider: EMAIL_PROVIDER,
      error: message
    });
    return { recipientType, status: "error", error: message };
  }
}

async function hasSentFixRequestNotification(env, fixRequestId, event, recipientType) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id
     FROM fix_request_notifications
     WHERE fix_request_id = ? AND event = ? AND recipient_type = ? AND status = 'sent'
     LIMIT 1`
  )
    .bind(fixRequestId, event, recipientType)
    .first();
  return Boolean(row?.id);
}

async function logFixRequestNotification(env, {
  fixRequestId,
  event,
  recipientType,
  recipientEmail,
  status,
  provider,
  providerMessageId = "",
  error = ""
}) {
  await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_request_notifications
      (id, fix_request_id, event, recipient_type, recipient_email, status, provider, provider_message_id, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      fixRequestId,
      event,
      recipientType,
      recipientEmail,
      status,
      provider,
      providerMessageId,
      error,
      new Date().toISOString()
    )
    .run();
}

async function logFixRequestEvent(env, {
  fixRequestId,
  event,
  actorType,
  actorEmail = "",
  fromStatus = "",
  toStatus = "",
  reason = "",
  detail = {}
}) {
  if (!env.WAITLIST_DB || !fixRequestId) return;
  await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_request_events
      (id, fix_request_id, event, actor_type, actor_email, from_status, to_status, reason, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      fixRequestId,
      cleanText(event, 80),
      cleanText(actorType, 40),
      cleanText(actorEmail, 254),
      cleanText(fromStatus, 40),
      cleanText(toStatus, 40),
      cleanText(reason, 500),
      JSON.stringify(detail || {}).slice(0, 4000),
      new Date().toISOString()
    )
    .run();
}

async function reportForNotification(env, reportId) {
  if (!reportId) return {};
  const row = await env.WAITLIST_DB.prepare("SELECT report_json FROM audit_reports WHERE id = ? LIMIT 1")
    .bind(reportId)
    .first();
  return parseJson(row?.report_json, {});
}

async function runPrivateDemoAudit(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  const origin = new URL(request.url).origin;
  const report = await auditUrl(`${origin}/fixture/rendered-page`, env, {
    maxPages: 1,
    appOrigin: origin
  });
  const saved = await saveAuditReport(report, request, env, access);
  return jsonNoStore(saved);
}

async function saveAuditReport(report, request, env, access) {
  const origin = new URL(request.url).origin;
  return saveAuditReportWithContext(report, env, access, origin);
}

async function saveAuditReportWithContext(report, env, access, origin) {
  const id = makePrivateReportId(report.url);
  const now = new Date().toISOString();
  const expiresAt = isoDaysFromNow(REPORT_RETENTION_DAYS);
  const targetHost = new URL(report.url).hostname.toLowerCase();
  const previousReport = await latestSavedReportForDelta(env, access, targetHost, now);
  const reportDelta = buildReportDelta(report, previousReport);
  const saved = {
    ...report,
    id,
    reportPath: `/beta/reports/${id}`,
    reportUrl: `${origin}/beta/reports/${id}`,
    reportDelta,
    repairBrief: appendReportDeltaBrief(report.repairBrief || "", reportDelta),
    owner: {
      email: access.ownerEmail,
      inviteId: access.inviteId || null,
      accessMode: access.accessMode || "invite"
    },
    retention: {
      expiresAt,
      days: REPORT_RETENTION_DAYS
    }
  };
  const fitted = fitReportForStorage(compactAuditReportForStorage(saved));
  const storageReport = fitted.report;

  await env.WAITLIST_DB.prepare(
    `INSERT INTO audit_reports
      (id, url, origin, score, summary_json, report_json, created_at, updated_at, owner_email, owner_session_hash, target_host, expires_at, owner_invite_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      saved.url,
      saved.origin,
      saved.score,
      JSON.stringify(saved.summary || {}),
      fitted.json,
      now,
      now,
      access.ownerEmail,
      access.sessionHash,
      targetHost,
      expiresAt,
      access.inviteId || null
    )
    .run();

  return storageReport;
}

// D1 rejects rows near its ~2MB value limit, which would fail the save AFTER
// a long crawl completed. Trim stored page proof until the blob fits; scores,
// findings, and the repair brief always cover the full crawl.
const REPORT_STORAGE_MAX_BYTES = 1_500_000;

function fitReportForStorage(storageReport) {
  const encoder = new TextEncoder();
  let report = storageReport;
  let json = JSON.stringify(report);
  if (encoder.encode(json).length <= REPORT_STORAGE_MAX_BYTES) {
    return { report, json, trimmed: false };
  }

  let pageLimit = Array.isArray(report.pages) ? report.pages.length : 0;
  while (encoder.encode(json).length > REPORT_STORAGE_MAX_BYTES && pageLimit > 1) {
    pageLimit = Math.max(1, Math.floor(pageLimit / 2));
    report = {
      ...report,
      pages: report.pages.slice(0, pageLimit),
      storageNote: `Stored page-by-page proof was trimmed to ${pageLimit} pages to fit report storage. Scores, findings, and the repair brief still cover the full crawl.`
    };
    json = JSON.stringify(report);
  }

  let summaryLimit = Array.isArray(report.pageSummaries) ? report.pageSummaries.length : 0;
  while (encoder.encode(json).length > REPORT_STORAGE_MAX_BYTES && summaryLimit > 1) {
    summaryLimit = Math.max(1, Math.floor(summaryLimit / 2));
    report = { ...report, pageSummaries: report.pageSummaries.slice(0, summaryLimit) };
    json = JSON.stringify(report);
  }

  return { report, json, trimmed: true };
}

function compactAuditReportForStorage(report = {}) {
  return {
    ...report,
    pages: Array.isArray(report.pages) ? report.pages.slice(0, 1000).map(compactAuditPageForStorage) : [],
    pageSummaries: Array.isArray(report.pageSummaries) ? report.pageSummaries.slice(0, 1000) : [],
    resourceWaterfall: compactResourceWaterfallForStorage(report.resourceWaterfall)
  };
}

function compactAuditPageForStorage(page = {}) {
  return {
    ...page,
    static: compactRenderedFactsForStorage(page.static),
    rendered: compactRenderedFactsForStorage(page.rendered),
    linkChecks: compactResourceChecksForStorage(page.linkChecks, 60),
    imageChecks: compactResourceChecksForStorage(page.imageChecks, 60),
    resourceWaterfall: compactResourceWaterfallForStorage(page.resourceWaterfall)
  };
}

function compactRenderedFactsForStorage(facts = {}) {
  if (!facts || typeof facts !== "object") return facts;
  const compact = { ...facts };
  if (compact.bodyText && !compact.bodySample) compact.bodySample = cleanText(compact.bodyText, 280);
  delete compact.bodyText;
  delete compact.resourceTimings;
  if (compact.bodySample) compact.bodySample = cleanText(compact.bodySample, 280);
  compact.links = compactListForStorage(compact.links, 80);
  compact.images = compactListForStorage(compact.images, 80);
  compact.internalLinks = compactListForStorage(compact.internalLinks, 120);
  compact.externalLinks = compactListForStorage(compact.externalLinks, 60);
  compact.headings = compactListForStorage(compact.headings, 80);
  compact.h1s = compactListForStorage(compact.h1s, 20);
  compact.hreflangs = compactListForStorage(compact.hreflangs, 80);
  compact.schemaTypes = compactListForStorage(compact.schemaTypes, 40);
  compact.schemaErrors = compactListForStorage(compact.schemaErrors, 20);
  return compact;
}

function compactResourceChecksForStorage(checks = [], limit = 60) {
  if (!Array.isArray(checks)) return [];
  return checks.slice(0, limit).map((check) => ({
    url: check.url || "",
    finalUrl: check.finalUrl || "",
    label: cleanText(check.label || "", 220),
    kind: check.kind || "",
    ok: Boolean(check.ok),
    status: Number(check.status || 0),
    redirected: Boolean(check.redirected),
    error: cleanText(check.error || "", 300),
    evidence: cleanText(check.evidence || "", 400)
  }));
}

function compactResourceWaterfallForStorage(waterfall = null) {
  if (!waterfall || typeof waterfall !== "object") return waterfall || null;
  return {
    ...waterfall,
    resources: compactListForStorage(waterfall.resources, 25),
    slowResources: compactListForStorage(waterfall.slowResources, 10),
    heavyResources: compactListForStorage(waterfall.heavyResources, 10),
    renderBlockingCandidates: compactListForStorage(waterfall.renderBlockingCandidates, 10),
    thirdPartyHosts: compactListForStorage(waterfall.thirdPartyHosts, 10),
    repairOpportunities: compactListForStorage(waterfall.repairOpportunities, 10)
  };
}

function compactListForStorage(items = [], limit = 50) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, limit).map(compactValueForStorage);
}

function compactValueForStorage(value) {
  if (typeof value === "string") return cleanText(value, 500);
  if (!value || typeof value !== "object") return value;
  const compact = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "bodyText" || key === "resourceTimings") continue;
    compact[key] = typeof item === "string" ? cleanText(item, 500) : item;
  }
  return compact;
}

async function latestSavedReportForDelta(env, access, targetHost, now) {
  if (!env.WAITLIST_DB || !access.ownerEmail || !targetHost) return null;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT report_json
     FROM audit_reports
     WHERE owner_email = ?
       AND target_host = ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(access.ownerEmail, targetHost, now)
    .first();
  return parseJson(row?.report_json, null);
}

async function getSavedReport(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname.slice("/api/reports/".length));
  const wantsBrief = relative.endsWith("/brief.md");
  const id = wantsBrief ? relative.slice(0, -"/brief.md".length) : relative;
  if (!isSafeReportId(id)) {
    return json({ error: "Report not found." }, 404);
  }

  const row = await env.WAITLIST_DB.prepare(
    `SELECT report_json, owner_email, owner_invite_id, expires_at FROM audit_reports WHERE id = ? LIMIT 1`
  )
    .bind(id)
    .first();
  if (!row?.report_json) {
    return json({ error: "Report not found." }, 404);
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    await env.WAITLIST_DB.prepare(`DELETE FROM audit_reports WHERE id = ?`).bind(id).run();
    return json({ error: "Report expired." }, 404);
  }
  if (row.owner_email && row.owner_email !== access.ownerEmail) {
    return json({ error: "Report not found." }, 404);
  }
  if (
    row.owner_invite_id &&
    access.accessMode !== "founder-override" &&
    row.owner_invite_id !== access.inviteId
  ) {
    return json({ error: "Report not found." }, 404);
  }

  const report = JSON.parse(row.report_json);
  report.reportUrl = `${url.origin}${report.reportPath || `/beta/reports/${id}`}`;
  if (!row.expires_at && report.retention) {
    report.retention = { ...report.retention, expiresAt: "", preserved: true };
  }

  if (wantsBrief) {
    return new Response(report.repairBrief || "# SEO Fix Kit repair brief\n", {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="seofixkit-${id}.md"`,
        "content-type": "text/markdown; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      }
    });
  }

  const fixRequest = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE report_id = ? AND owner_email = ?
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (fixRequest?.id) {
    report.fixRequest = fixRequestResponse(fixRequest);
    if (fixRequest.final_report_id) {
      report.fixRequest.finalReportPath = `/beta/reports/${encodeURIComponent(fixRequest.final_report_id)}`;
    }
  }

  return jsonNoStore(report);
}

async function auditUrl(inputUrl, env, options = {}) {
  const startedAt = Date.now();
  const startUrl = normalizeUrl(inputUrl);
  const origin = new URL(startUrl).origin;
  let crawlOrigin = origin;
  const maxPages = clampPageLimit(options.maxPages || 10);

  const robots =
    origin === options.appOrigin
      ? { ok: true, status: 200, url: `${origin}/robots.txt`, body: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n` }
      : await fetchText(`${origin}/robots.txt`);
  const sitemap =
    origin === options.appOrigin
      ? { ok: true, status: 200, url: `${origin}/sitemap.xml`, body: rootSitemap(origin) }
      : await fetchText(`${origin}/sitemap.xml`);
  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
  } catch (error) {
    const busyError = new Error("Audit capacity is busy right now. Your audit stays queued and retries automatically.");
    busyError.code = "BROWSER_BUSY";
    busyError.cause = error;
    throw busyError;
  }
  const pages = [];
  const queue = [startUrl];
  const visited = new Set();
  const resourceValidationBudget = { remainingPages: maxPages > 50 ? 10 : maxPages };

  try {
    while (queue.length && pages.length < maxPages) {
      const nextUrl = stripHash(queue.shift());
      if (visited.has(nextUrl)) continue;
      visited.add(nextUrl);

      const page = await inspectPage(nextUrl, browser, { resourceValidationBudget });
      if (!page.isHtml) continue;
      pages.push(page);
      if (pages.length === 1 && page.rendered?.finalUrl) {
        crawlOrigin = new URL(page.rendered.finalUrl).origin;
      }

      for (const link of page.rendered.internalLinks) {
        const href = stripHash(link.href);
        if (!href.startsWith(crawlOrigin)) continue;
        if (
          isLikelyHtmlUrl(href) &&
          !visited.has(href) &&
          !queue.includes(href) &&
          queue.length + pages.length < maxPages
        ) {
          queue.push(href);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const performance = await collectPerformanceInsights(startUrl, pages[0], {
    pageSpeed: options.pageSpeed,
    pageSpeedApiKey: env.GOOGLE_PAGESPEED_API_KEY || env.PAGESPEED_API_KEY || "",
    disabled: env.SEOFIXKIT_PAGESPEED_DISABLED === "1"
  });

  const findings = buildFindings({
    pages,
    startUrl,
    robots,
    sitemap,
    performance
  });
  const score = scoreFindings(findings);
  const pageSummaries = buildPageSummaries(pages, findings, startUrl);
  const summary = summarize(findings, pages, maxPages);
  let repairPlan = buildRepairPlan(findings);
  const fixPack = buildFixPack(pages[0], origin, findings);
  const report = {
    id: `${new URL(startUrl).hostname.replace(/[^a-z0-9]+/gi, "-")}-${startedAt.toString(36)}`,
    url: startUrl,
    origin,
    scannedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    score,
    summary,
    crawlDepth: crawlDepthSummary(maxPages),
    warnings: [],
    docs: DOCS,
    performance,
    pages,
    pageSummaries,
    findings,
    repairPlan,
    repairBrief: "",
    fixPack
  };

  report.crawlInventory = await buildCrawlInventory(startUrl, {
    robots,
    sitemap,
    pages,
    maxUrls: options.crawlInventoryMaxUrls,
    maxSitemaps: options.crawlInventoryMaxSitemaps,
    fetcher: fetch
  });

  const renderedCrawlScale = buildRenderedCrawlScalePlan(report, report.crawlInventory, {
    renderedCrawlTarget: options.renderedCrawlTarget || options.crawlScaleTarget
  });
  if (renderedCrawlScale.status === "ready") {
    report.renderedCrawlScale = renderedCrawlScale;
    repairPlan = mergeRepairPlans(repairPlan, renderedCrawlScale.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const crawlIntelligence = buildCrawlIntelligence(report, report.crawlInventory);
  if (crawlIntelligence.status === "ready") {
    report.crawlIntelligence = crawlIntelligence;
    repairPlan = mergeRepairPlans(repairPlan, crawlIntelligence.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const competitorReports = await auditCompetitorUrls(startUrl, env, options);
  if (competitorReports.reports.length) {
    report.competitorBenchmark = buildCompetitorBenchmark(report, competitorReports.reports);
  }
  if (competitorReports.warnings.length) {
    report.warnings.push(...competitorReports.warnings);
  }

  const backlinkAudit = await buildBacklinkAudit(report, options.backlinks || options.backlinkRows || [], {
    allowPrivate: false,
    fetcher: fetch
  });
  if (backlinkAudit.status === "ready") {
    report.backlinkAudit = backlinkAudit;
    repairPlan = mergeRepairPlans(repairPlan, backlinkAudit.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const localSeoAudit = await buildLocalSeoAudit(report, options.localSeo || options.localSeoInput || {}, {
    allowPrivate: false,
    fetcher: fetch
  });
  if (localSeoAudit.status === "ready") {
    report.localSeoAudit = localSeoAudit;
    repairPlan = mergeRepairPlans(repairPlan, localSeoAudit.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const keywordRankAudit = buildKeywordRankAudit(report, options.keywordRows || options.keywordRankRows || [], {
    allowPrivate: false
  });
  if (keywordRankAudit.status === "ready") {
    report.keywordRankAudit = keywordRankAudit;
    repairPlan = mergeRepairPlans(repairPlan, keywordRankAudit.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const platformSeoAudit = buildPlatformSeoAudit(report);
  if (platformSeoAudit.status === "ready") {
    report.platformSeoAudit = platformSeoAudit;
    repairPlan = mergeRepairPlans(repairPlan, platformSeoAudit.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  report.repairBrief = buildRepairBrief({
    startUrl,
    score,
    summary,
    pages,
    findings,
    repairPlan,
    performance,
    competitorBenchmark: report.competitorBenchmark,
    crawlInventory: report.crawlInventory,
    renderedCrawlScale: report.renderedCrawlScale,
    crawlIntelligence: report.crawlIntelligence,
    backlinkAudit: report.backlinkAudit,
    localSeoAudit: report.localSeoAudit,
    keywordRankAudit: report.keywordRankAudit,
    platformSeoAudit: report.platformSeoAudit
  });

  return report;
}

async function inspectPage(url, browser, options = {}) {
  const staticFetch = await fetchText(url);
  const isHtml = isHtmlResponse(staticFetch, url);
  const finalUrl = staticFetch.url || url;
  const finalUrlCheck = publicAuditUrlStatus(finalUrl);
  const safeToRender = finalUrlCheck.ok;
  const staticFacts = extractStaticFacts(staticFetch.body || "", finalUrl, staticFetch);
  const rendered = isHtml && safeToRender ? await extractRenderedFacts(browser, finalUrl) : staticFacts;
  const shouldValidateResources = isHtml && consumeResourceValidationBudget(options.resourceValidationBudget);
  const resources = shouldValidateResources ? await validatePageResources(rendered) : emptyResourceChecks();
  const resourceWaterfall = buildResourceWaterfall({
    url,
    finalUrl,
    rendered
  });

  return {
    url,
    finalUrl,
    redirected: stripHash(finalUrl) !== stripHash(url),
    renderSkippedReason: isHtml && !safeToRender ? finalUrlCheck.error || "Final URL left the audited origin." : "",
    status: staticFetch.status,
    ok: staticFetch.ok,
    contentType: staticFetch.contentType,
    headers: staticFetch.headers || {},
    redirectChain: staticFetch.redirectChain || [],
    responseTimeMs: staticFetch.responseTimeMs || null,
    transferSize: staticFetch.contentLength || byteLength(staticFetch.body || ""),
    isHtml,
    static: staticFacts,
    rendered,
    linkChecks: resources.links,
    imageChecks: resources.images,
    canonicalCheck: resources.canonical,
    resourceWaterfall
  };
}

function consumeResourceValidationBudget(budget) {
  if (!budget) return true;
  if (Number(budget.remainingPages || 0) <= 0) return false;
  budget.remainingPages -= 1;
  return true;
}

async function auditCompetitorUrls(startUrl, env, options = {}) {
  if (options.skipCompetitors) return { reports: [], warnings: [] };
  const urls = normalizeCompetitorUrlsList(options.competitorUrls || options.competitors || [], startUrl);
  const reports = [];
  const warnings = [];

  for (const competitorUrl of urls) {
    try {
      const report = await auditUrl(competitorUrl, env, {
        maxPages: Math.min(clampPageLimit(options.competitorMaxPages || 1), 3),
        pageSpeed: options.competitorPageSpeed === true,
        skipCompetitors: true,
        crawlInventoryMaxUrls: 1,
        crawlInventoryMaxSitemaps: 1,
        renderedCrawlTarget: 0
      });
      reports.push(report);
    } catch (error) {
      warnings.push({
        title: "Competitor benchmark unavailable",
        body: `Could not benchmark ${competitorUrl}.`,
        detail: error?.message || "The competitor snapshot failed."
      });
    }
  }

  return { reports, warnings };
}

async function extractRenderedFacts(browser, url) {
  const page = await browser.newPage();
  const started = Date.now();

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 25_000
    });

    await wait(350);

    const facts = await page.evaluate(() => {
      const absolute = (value) => {
        try {
          return value ? new URL(value, location.href).href : null;
        } catch {
          return value || null;
        }
      };
      const metaByName = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || null;
      const metaByProperty = (property) =>
        document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") || null;
      const text = (node) => (node?.textContent || "").trim().replace(/\s+/g, " ");
      const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
        (node) => ({ level: node.tagName.toLowerCase(), text: text(node) })
      );
      const links = [...document.querySelectorAll("a[href]")]
        .map((node) => ({
          text: text(node),
          href: absolute(node.getAttribute("href")),
          rawHref: node.getAttribute("href")
        }))
        .filter((link) => link.href && link.href.startsWith("http"));
      const images = [...document.querySelectorAll("img")].map((node) => {
        const alt = node.getAttribute("alt");
        return {
          src: absolute(node.getAttribute("src")),
          alt: alt || "",
          hasAlt: node.hasAttribute("alt"),
          role: node.getAttribute("role") || "",
          ariaHidden: node.getAttribute("aria-hidden") === "true",
          width: node.getAttribute("width") || null,
          height: node.getAttribute("height") || null
        };
      });
      const scripts = [...document.querySelectorAll("script[src]")].map((node) => ({
        src: absolute(node.getAttribute("src")),
        type: node.getAttribute("type") || "",
        async: node.hasAttribute("async"),
        defer: node.hasAttribute("defer")
      }));
      const stylesheets = [...document.querySelectorAll('link[rel~="stylesheet"][href]')].map((node) => ({
        href: absolute(node.getAttribute("href")),
        media: node.getAttribute("media") || ""
      }));
      const schemaTypesFor = (value) => {
        const types = [];
        const visit = (item) => {
          if (!item || typeof item !== "object") return;
          const type = item["@type"];
          if (Array.isArray(type)) types.push(...type.filter(Boolean));
          else if (type) types.push(type);
          for (const key of ["@graph", "itemListElement", "mainEntity", "hasPart", "review", "offers", "aggregateRating", "breadcrumb"]) {
            const child = item[key];
            if (Array.isArray(child)) child.forEach(visit);
            else visit(child);
          }
        };
        if (Array.isArray(value)) value.forEach(visit);
        else visit(value);
        return types;
      };
      const schemaResults = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((node, index) => {
          try {
            const parsed = JSON.parse(node.textContent || "{}");
            const values = Array.isArray(parsed) ? parsed : [parsed];
            return {
              index: index + 1,
              types: schemaTypesFor(parsed),
              missingContext: values.some((item) => item && !item["@context"])
            };
          } catch {
            return {
              index: index + 1,
              types: ["invalid-json"],
              error: "JSON-LD could not be parsed."
            };
          }
      });
      const bodyText = text(document.body);
      const origin = location.origin;
      const number = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
      };
      const navigation = performance.getEntriesByType("navigation")[0] || null;
      const navigationTiming = navigation
        ? {
            startTimeMs: number(navigation.startTime),
            responseStartMs: number(navigation.responseStart),
            responseEndMs: number(navigation.responseEnd),
            domInteractiveMs: number(navigation.domInteractive),
            domContentLoadedMs: number(navigation.domContentLoadedEventEnd),
            loadEventMs: number(navigation.loadEventEnd),
            durationMs: number(navigation.duration),
            transferSize: number(navigation.transferSize),
            encodedBodySize: number(navigation.encodedBodySize),
            decodedBodySize: number(navigation.decodedBodySize),
            protocol: navigation.nextHopProtocol || ""
          }
        : {};
      const allResourceTimings = performance.getEntriesByType("resource")
        .map((entry) => ({
          name: entry.name,
          initiatorType: entry.initiatorType || "",
          startTime: number(entry.startTime),
          responseStart: number(entry.responseStart),
          responseEnd: number(entry.responseEnd),
          duration: number(entry.duration),
          transferSize: number(entry.transferSize),
          encodedBodySize: number(entry.encodedBodySize),
          decodedBodySize: number(entry.decodedBodySize),
          renderBlockingStatus: entry.renderBlockingStatus || "",
          nextHopProtocol: entry.nextHopProtocol || ""
        }))
        .sort((a, b) => a.startTime - b.startTime || b.duration - a.duration);
      const resourceTimings = allResourceTimings.slice(0, 150);

      return {
        source: "rendered-dom",
        finalUrl: location.href,
        title: document.title || "",
        description: metaByName("description"),
        generator: metaByName("generator"),
        robots: metaByName("robots"),
        canonical: absolute(document.querySelector('link[rel="canonical"]')?.getAttribute("href")),
        lang: document.documentElement.getAttribute("lang") || null,
        viewport: metaByName("viewport"),
        charset: document.characterSet || null,
        doctype: document.doctype ? document.doctype.name : null,
        hreflangs: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(
          (node) => ({
            hreflang: node.getAttribute("hreflang"),
            href: absolute(node.getAttribute("href"))
          })
        ),
        h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
        headings,
        links,
        internalLinks: links.filter((link) => new URL(link.href).origin === origin),
        externalLinks: links.filter((link) => new URL(link.href).origin !== origin),
        images,
        imagesMissingAlt: images.filter((image) => !image.hasAlt),
        scripts,
        stylesheets,
        openGraph: {
          title: metaByProperty("og:title"),
          description: metaByProperty("og:description"),
          image: absolute(metaByProperty("og:image")),
          url: absolute(metaByProperty("og:url")),
          type: metaByProperty("og:type")
        },
        twitter: {
          card: metaByName("twitter:card"),
          title: metaByName("twitter:title"),
          description: metaByName("twitter:description"),
          image: absolute(metaByName("twitter:image"))
        },
        favicon: absolute(document.querySelector('link[rel~="icon"]')?.getAttribute("href")),
        appleTouchIcon: absolute(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")),
        schemaTypes: schemaResults.flatMap((item) => item.types || []),
        schemaErrors: schemaResults
          .filter((item) => item.error || item.missingContext)
          .map((item) => item.error || `JSON-LD block ${item.index} is missing @context.`),
        navigationTiming,
        resourceTimings,
        resourceTimingsTotal: allResourceTimings.length,
        wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
        bodyText: bodyText.slice(0, 6000),
        bodySample: bodyText.slice(0, 280)
      };
    });

    return {
      ...facts,
      status: response?.status() || null,
      loadDurationMs: Date.now() - started
    };
  } finally {
    await page.close();
  }
}

function extractStaticFacts(html, url, fetchResult = {}) {
  const base = new URL(url);
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] || "";
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const body = withoutScripts.match(/<body[\s\S]*?<\/body>/i)?.[0] || withoutScripts;
  const bodyText = decodeEntities(stripTags(body)).replace(/\s+/g, " ").trim();
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: absolute(match[1], base.href),
      rawHref: match[1],
      text: decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim()
    }))
    .filter((link) => link.href?.startsWith("http"));
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => {
    const alt = attr(match[0], "alt");
    return {
      src: absolute(attr(match[0], "src"), base.href),
      alt: alt || "",
      hasAlt: alt !== null,
      role: attr(match[0], "role") || "",
      ariaHidden: attr(match[0], "aria-hidden") === "true",
      width: attr(match[0], "width") || null,
      height: attr(match[0], "height") || null
    };
  });
  const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match) => ({
    src: absolute(match[1], base.href),
    type: attr(match[0], "type") || "",
    async: attr(match[0], "async") !== null,
    defer: attr(match[0], "defer") !== null
  }));
  const stylesheets = [...html.matchAll(/<link\b(?=[^>]*rel=["'][^"']*stylesheet[^"']*["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/gi)].map((match) => ({
    href: absolute(match[1], base.href),
    media: attr(match[0], "media") || ""
  }));
  const schemaTypesFor = (value) => {
    const types = [];
    const visit = (item) => {
      if (!item || typeof item !== "object") return;
      const type = item["@type"];
      if (Array.isArray(type)) types.push(...type.filter(Boolean));
      else if (type) types.push(type);
      for (const key of ["@graph", "itemListElement", "mainEntity", "hasPart", "review", "offers", "aggregateRating", "breadcrumb"]) {
        const child = item[key];
        if (Array.isArray(child)) child.forEach(visit);
        else visit(child);
      }
    };
    if (Array.isArray(value)) value.forEach(visit);
    else visit(value);
    return types;
  };
  const headings = [];
  for (const match of html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    headings.push({
      level: match[1].toLowerCase(),
      text: decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim()
    });
  }
  const schemaResults = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match, index) => {
      try {
        const parsed = JSON.parse(match[1] || "{}");
        const values = Array.isArray(parsed) ? parsed : [parsed];
        return {
          index: index + 1,
          types: schemaTypesFor(parsed),
          missingContext: values.some((item) => item && !item["@context"])
        };
      } catch {
        return {
          index: index + 1,
          types: ["invalid-json"],
          error: "JSON-LD could not be parsed."
        };
      }
    });

  return {
    source: "static-html",
    finalUrl: url,
    status: fetchResult.status || null,
    title: decodeEntities(stripTags(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")),
    description: meta(head, "name", "description"),
    generator: meta(head, "name", "generator"),
    robots: meta(head, "name", "robots"),
    canonical: absolute(linkRel(head, "canonical"), base.href),
    lang: html.match(/<html\b[^>]*lang=["']([^"']+)["']/i)?.[1] || null,
    viewport: meta(head, "name", "viewport"),
    charset:
      html.match(/<meta\b[^>]*charset=["']?([^"'\s/>]+)/i)?.[1] ||
      (meta(head, "http-equiv", "content-type") || "").match(/charset=([^;]+)/i)?.[1] ||
      null,
    doctype: html.trimStart().toLowerCase().startsWith("<!doctype html") ? "html" : null,
    hreflangs: [...head.matchAll(/<link\b(?=[^>]*rel=["'][^"']*alternate[^"']*["'])(?=[^>]*hreflang=["']([^"']+)["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/gi)].map(
      (match) => ({
        hreflang: match[1],
        href: absolute(match[2], base.href)
      })
    ),
    h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
    headings,
    links,
    internalLinks: links.filter((link) => new URL(link.href).origin === base.origin),
    externalLinks: links.filter((link) => new URL(link.href).origin !== base.origin),
    images,
    imagesMissingAlt: images.filter((image) => !image.hasAlt),
    scripts,
    stylesheets,
    openGraph: {
      title: meta(head, "property", "og:title"),
      description: meta(head, "property", "og:description"),
      image: absolute(meta(head, "property", "og:image"), base.href),
      url: absolute(meta(head, "property", "og:url"), base.href),
      type: meta(head, "property", "og:type")
    },
    twitter: {
      card: meta(head, "name", "twitter:card"),
      title: meta(head, "name", "twitter:title"),
      description: meta(head, "name", "twitter:description"),
      image: absolute(meta(head, "name", "twitter:image"), base.href)
    },
    favicon: absolute(linkRel(head, "icon"), base.href),
    appleTouchIcon: absolute(linkRel(head, "apple-touch-icon"), base.href),
    schemaTypes: schemaResults.flatMap((item) => item.types || []),
    schemaErrors: schemaResults
      .filter((item) => item.error || item.missingContext)
      .map((item) => item.error || `JSON-LD block ${item.index} is missing @context.`),
    wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    bodyText: bodyText.slice(0, 6000),
    bodySample: bodyText.slice(0, 280)
  };
}

function buildFindings({ pages, startUrl, robots, sitemap, performance }) {
  const findings = [];
  let activePage = null;
  const add = (finding) => {
    const pageFields = activePage
      ? {
          pageUrl: activePage.url,
          finalUrl: activePage.finalUrl || activePage.rendered?.finalUrl || activePage.url,
          pageLabel: pathLabel(activePage.url, startUrl)
        }
      : {};
    findings.push({
      id: `${finding.type}-${findings.length + 1}`,
      confidence: finding.confidence || "verified",
      ...pageFields,
      ...finding
    });
  };

  for (const page of pages) {
    activePage = page;
    const rendered = page.rendered;
    const staticFacts = page.static;
    const label = pathLabel(page.url, startUrl);
    const finalUrl = rendered.finalUrl || page.finalUrl || page.url;
    const finalUrlObject = new URL(finalUrl);
    const linkChecks = page.linkChecks || [];
    const imageChecks = page.imageChecks || [];
    const brokenInternalLinks = linkChecks.filter((check) => check.kind === "internal" && isBrokenResource(check));
    const brokenExternalLinks = linkChecks.filter((check) => check.kind === "external" && isBrokenResource(check));
    const redirectedInternalLinks = linkChecks.filter(
      (check) => check.kind === "internal" && !isBrokenResource(check) && check.redirected
    );
    const brokenImages = imageChecks.filter(isBrokenResource);
    const oversizedImages = imageChecks.filter(
      (check) => !isBrokenResource(check) && check.contentLength > RESOURCE_LIMITS.largeImageBytes
    );
    const nonHttpsResources = [...(rendered.links || []), ...(rendered.images || [])].filter(
      (resource) =>
        finalUrlObject.protocol === "https:" &&
        (resource.href || resource.src || "").startsWith("http:")
    );
    const addRenderedGuard = ({ title, evidence, fix, source }) =>
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: ${title}`,
        why: "Static HTML missed data that exists in the rendered page.",
        evidence,
        fix,
        source: source || DOCS.javascript
      });

    if (page === pages[0]) {
      addPerformanceFindings(add, performance, label);
    }

    for (const finding of resourceWaterfallFindings(page.resourceWaterfall, label, DOCS.coreWebVitals)) {
      add(finding);
    }

    if (brokenInternalLinks.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `Broken internal links on ${label}`,
        why: "Broken internal links waste crawl paths and send users to dead pages.",
        evidence: formatResourceEvidence(brokenInternalLinks),
        fix: "Update each internal link to a live replacement URL, restore the missing page, or remove the link if it no longer has a valid destination.",
        source: DOCS.linkBestPractices
      });
    }

    if (brokenExternalLinks.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Broken external links on ${label}`,
        why: "Broken outbound references weaken the page experience and can make supporting proof look stale.",
        evidence: formatResourceEvidence(brokenExternalLinks),
        fix: "Replace broken references with live authoritative sources or remove the outbound links.",
        source: DOCS.linkBestPractices,
        confidence: "needs-review"
      });
    }

    if (redirectedInternalLinks.length) {
      add({
        type: "issue",
        severity: "notice",
        title: `Redirecting internal links on ${label}`,
        why: "Internal links should usually point directly to the final canonical URL instead of spending crawl budget on redirects.",
        evidence: formatResourceEvidence(redirectedInternalLinks),
        fix: "Update internal links so they point directly to the final destination URL."
      });
    }

    if (brokenImages.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Broken images on ${label}`,
        why: "Broken images hurt page quality, social previews, and image-search context.",
        evidence: formatResourceEvidence(brokenImages),
        fix: "Replace the missing image URLs, restore the assets, or remove image tags that no longer have valid files."
      });
    }

    if (oversizedImages.length) {
      add({
        type: "issue",
        severity: "notice",
        title: `Large image files on ${label}`,
        why: "Large images can slow down the page and make Core Web Vitals harder to pass.",
        evidence: formatResourceEvidence(oversizedImages),
        fix: "Compress these images, serve next-gen formats, and resize them to the rendered display dimensions.",
        source: DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (nonHttpsResources.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Non-HTTPS resources on ${label}`,
        why: "HTTP resources on an HTTPS page can create mixed-content warnings and weaken user trust.",
        evidence: `${nonHttpsResources.length} rendered resources use http://, including ${formatResourceUrl(nonHttpsResources[0].href || nonHttpsResources[0].src)}.`,
        fix: "Serve every link, script, image, and canonical asset over HTTPS."
      });
    }

    if (page.redirected || stripHash(rendered.finalUrl || page.finalUrl || page.url) !== stripHash(page.url)) {
      add({
        type: "issue",
        severity: "notice",
        title: `URL redirects before rendering on ${label}`,
        why: "Redirects are normal, but audit evidence should show the final URL search engines and users reach.",
        evidence: `Requested ${page.url}; final URL ${rendered.finalUrl || page.finalUrl}.`,
        fix: "Make sure canonicals, internal links, and sitemaps point at the final preferred URL.",
        confidence: "needs-review"
      });
    }

    if (page.redirectChain?.length > 1) {
      add({
        type: "issue",
        severity: "warning",
        title: `Long redirect chain before rendering on ${label}`,
        why: "Long redirect chains slow crawlers and users before the page can even render.",
        evidence: formatRedirectChain(page.redirectChain),
        fix: "Collapse the chain so the requested URL redirects once to the final canonical URL."
      });
    }

    if (rendered.loadDurationMs > RESOURCE_LIMITS.slowRenderMs) {
      add({
        type: "issue",
        severity: "warning",
        title: `Slow rendered load on ${label}`,
        why: "Slow rendering is a page-experience risk and can make Core Web Vitals harder to pass.",
        evidence: `Rendered audit reached network idle in ${rendered.loadDurationMs}ms.`,
        fix: "Reduce render-blocking scripts, compress heavy assets, defer non-critical JavaScript, and rerun with field Core Web Vitals data.",
        source: DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (page.transferSize > RESOURCE_LIMITS.largeHtmlBytes) {
      add({
        type: "issue",
        severity: "notice",
        title: `Large HTML response on ${label}`,
        why: "Large HTML responses slow the first crawl and usually point to unnecessary inline payload.",
        evidence: `Initial HTML response was about ${formatBytes(page.transferSize)}.`,
        fix: "Move large inline data out of the HTML, trim unused markup, and compress server responses.",
        source: DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (staticFacts.h1s.length === 0 && rendered.h1s.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: H1 exists after render`,
        why: "A static-only crawler would report a missing H1, but the rendered page contains one.",
        evidence: `Rendered H1: "${rendered.h1s[0]}"`,
        fix: "Do not add another H1 just to satisfy a static crawler.",
        source: DOCS.javascript
      });
    }

    if (staticFacts.internalLinks.length === 0 && rendered.internalLinks.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: internal links exist after render`,
        why: "Static HTML did not expose links, but the browser-rendered DOM did.",
        evidence: `${rendered.internalLinks.length} rendered internal links found.`,
        fix: "Keep the rendered links crawlable as real anchor tags.",
        source: DOCS.javascript
      });
    }

    if (staticFacts.wordCount < 50 && rendered.wordCount >= 250) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: rendered content is not thin`,
        why: "The static HTML looks thin, but users and modern crawlers see substantial rendered content.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "No thin-content fix is needed for this page based on rendered text.",
        source: DOCS.javascript
      });
    }

    if (!staticFacts.title && rendered.title) {
      addRenderedGuard({
        title: "title exists after render",
        evidence: `Rendered title: "${rendered.title}"`,
        fix: "Do not add a duplicate title just to satisfy a static crawler.",
        source: DOCS.title
      });
    }

    if (!staticFacts.description && rendered.description) {
      addRenderedGuard({
        title: "meta description exists after render",
        evidence: `Rendered description: "${rendered.description}"`,
        fix: "Keep the rendered meta description aligned with visible page content."
      });
    }

    if (!staticFacts.canonical && rendered.canonical) {
      addRenderedGuard({
        title: "canonical exists after render",
        evidence: `Rendered canonical: ${rendered.canonical}`,
        fix: "Do not add a second canonical; keep one preferred URL."
      });
    }

    if (!staticFacts.viewport && rendered.viewport) {
      addRenderedGuard({
        title: "viewport exists after render",
        evidence: `Rendered viewport: "${rendered.viewport}"`,
        fix: "Do not add a duplicate viewport tag."
      });
    }

    if ((!staticFacts.openGraph.image || !staticFacts.twitter.image) && rendered.openGraph.image && rendered.twitter.image) {
      addRenderedGuard({
        title: "social images exist after render",
        evidence: `Rendered og:image: ${rendered.openGraph.image}; twitter:image: ${rendered.twitter.image}`,
        fix: "Do not create duplicate social tags; keep the rendered tags stable."
      });
    }

    if ((staticFacts.schemaTypes || []).length === 0 && rendered.schemaTypes.length > 0) {
      addRenderedGuard({
        title: "structured data exists after render",
        evidence: `Rendered schema types: ${rendered.schemaTypes.join(", ")}`,
        fix: "Do not add duplicate JSON-LD; validate the rendered schema instead.",
        source: DOCS.structuredData
      });
    }

    if (rendered.schemaErrors?.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Structured data JSON is invalid on ${label}`,
        why: "Invalid JSON-LD can stop rich-result eligibility and creates false confidence if the audit only checks presence.",
        evidence: rendered.schemaErrors.slice(0, 3).join(" "),
        fix: "Fix the JSON-LD syntax and include @context and @type values that match visible page content.",
        source: DOCS.structuredData
      });
    }

    const hreflangIssues = validateHreflang(rendered.hreflangs || [], finalUrl);
    for (const issue of hreflangIssues) {
      add({
        type: "issue",
        severity: issue.severity,
        title: `${issue.title} on ${label}`,
        why: issue.why,
        evidence: issue.evidence,
        fix: issue.fix,
        source: DOCS.hreflang,
        confidence: issue.confidence || "verified"
      });
    }

    if (rendered.canonical && page.canonicalCheck && isBrokenResource(page.canonicalCheck)) {
      add({
        type: "issue",
        severity: "warning",
        title: `Canonical URL is not reachable on ${label}`,
        why: "Canonical tags should point to a live preferred URL that search engines can fetch.",
        evidence: formatResourceEvidence([page.canonicalCheck]),
        fix: "Update the canonical href to a live indexable URL, or restore the canonical destination.",
        source: DOCS.javascript
      });
    } else if (rendered.canonical && page.canonicalCheck?.redirected) {
      add({
        type: "issue",
        severity: "notice",
        title: `Canonical URL redirects on ${label}`,
        why: "Canonical tags should point directly to the final preferred URL.",
        evidence: formatResourceEvidence([page.canonicalCheck]),
        fix: "Change the canonical href to the final destination URL."
      });
    }

    if (rendered.canonical && rendered.openGraph?.url && canonicalKey(rendered.canonical) !== canonicalKey(rendered.openGraph.url)) {
      add({
        type: "issue",
        severity: "notice",
        title: `Canonical and og:url disagree on ${label}`,
        why: "Search and social tags should agree on the preferred URL for this page.",
        evidence: `Canonical: ${rendered.canonical}; og:url: ${rendered.openGraph.url}.`,
        fix: "Set og:url to the same final preferred URL used by rel=canonical.",
        confidence: "needs-review"
      });
    }

    if (rendered.canonical && (rendered.robots || "").toLowerCase().includes("noindex")) {
      add({
        type: "issue",
        severity: "critical",
        title: `Canonical conflicts with noindex on ${label}`,
        why: "A page should not ask search engines to consolidate signals through a canonical while also telling them not to index it.",
        evidence: `Canonical: ${rendered.canonical}; robots meta: "${rendered.robots}".`,
        fix: "If the page should rank, remove noindex. If it should not rank, remove misleading canonical consolidation."
      });
    }

    if (!rendered.title || rendered.title.length < 12) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing or weak title on ${label}`,
        why: "A clear title helps searchers identify the page.",
        evidence: rendered.title ? `Current title: "${rendered.title}"` : "No title found.",
        fix: "Add a unique, descriptive title for this page.",
        source: DOCS.title,
        snippet: `<title>${escapeHtml(suggestTitle(page.url, rendered))}</title>`
      });
    } else if (rendered.title.length > 65) {
      add({
        type: "issue",
        severity: "warning",
        title: `Long title on ${label}`,
        why: "Long titles are often rewritten or truncated in search results.",
        evidence: `${rendered.title.length} characters: "${rendered.title}"`,
        fix: "Shorten the title and put the main page promise first.",
        source: DOCS.title,
        snippet: `<title>${escapeHtml(trimSentence(rendered.title, 58))}</title>`
      });
    }

    if (!rendered.description) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing meta description on ${label}`,
        why: "A useful description can influence the snippet shown in search.",
        evidence: "No meta description found in the rendered page.",
        fix: "Add a concise page-specific meta description.",
        source: DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    } else if (rendered.description.length < 70 || rendered.description.length > 165) {
      add({
        type: "issue",
        severity: "warning",
        title: `Meta description needs tightening on ${label}`,
        why:
          "Google may rewrite snippets, but a clear page-specific description gives it better source material.",
        evidence: `${rendered.description.length} characters: "${rendered.description}"`,
        fix: "Rewrite it as one clear value proposition.",
        source: DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    }

    if (!rendered.h1s.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing H1 on ${label}`,
        why: "The H1 should state the main topic visible on the page.",
        evidence: "No rendered H1 found.",
        fix: "Add one visible H1 that matches the page purpose.",
        source: DOCS.javascript,
        snippet: `<h1>${escapeHtml(suggestTitle(page.url, rendered))}</h1>`
      });
    } else if (rendered.h1s.length > 1) {
      add({
        type: "issue",
        severity: "warning",
        title: `Multiple H1s on ${label}`,
        why: "Multiple H1s can make the page hierarchy less clear.",
        evidence: `${rendered.h1s.length} rendered H1s: ${rendered.h1s.join(" | ")}`,
        fix: "Keep one primary H1 and move secondary headings to H2."
      });
    }

    const hierarchyIssue = headingHierarchyIssue(rendered.headings || []);
    if (hierarchyIssue) {
      add({
        type: "issue",
        severity: "warning",
        title: `Heading hierarchy needs cleanup on ${label}`,
        why: "Headings should describe the page outline in order so users, assistive tech, and crawlers can understand the structure.",
        evidence: hierarchyIssue,
        fix: "Use one H1, then move section headings through H2 and H3 without skipping levels.",
        confidence: "needs-review"
      });
    }

    if (rendered.wordCount < 250) {
      add({
        type: "issue",
        severity: "warning",
        title: `Thin rendered content on ${label}`,
        why:
          "This is a heuristic, not a ranking rule. Thin pages often fail to answer the query well.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "Add useful page-specific detail, proof, examples, and next steps.",
        confidence: "needs-review"
      });
    }

    if (!rendered.internalLinks.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `No rendered internal links on ${label}`,
        why: "Internal links help crawlers discover and understand related pages.",
        evidence: "No internal anchor links found in the rendered DOM.",
        fix: "Add links to important related pages using normal anchor tags.",
        source: DOCS.javascript
      });
    }

    if (!rendered.canonical) {
      add({
        type: "issue",
        severity: "warning",
        title: `Missing canonical URL on ${label}`,
        why: "Canonical tags help clarify the preferred URL for similar pages.",
        evidence: "No rendered rel=canonical tag found.",
        fix: "Add a canonical tag that points to the preferred URL.",
        source: DOCS.javascript,
        snippet: `<link rel="canonical" href="${page.url}" />`
      });
    }

    if (!rendered.viewport) {
      add({
        type: "issue",
        severity: "warning",
        title: `Viewport meta tag missing on ${label}`,
        why: "Mobile pages need a viewport tag so layouts render at the intended width.",
        evidence: "No rendered viewport meta tag found.",
        fix: "Add a responsive viewport meta tag.",
        snippet: '<meta name="viewport" content="width=device-width, initial-scale=1" />'
      });
    }

    if (!rendered.lang) {
      add({
        type: "issue",
        severity: "notice",
        title: `HTML language missing on ${label}`,
        why: "The lang attribute helps browsers, translation tools, and assistive tech understand the page language.",
        evidence: "No lang attribute found on the rendered html element.",
        fix: 'Add a truthful language code such as <html lang="en">.',
        snippet: '<html lang="en">'
      });
    }

    if (!rendered.charset) {
      add({
        type: "issue",
        severity: "notice",
        title: `Character encoding missing on ${label}`,
        why: "A charset declaration prevents text rendering surprises.",
        evidence: "No rendered charset could be confirmed.",
        fix: "Declare UTF-8 in the document head.",
        snippet: '<meta charset="utf-8" />'
      });
    }

    if (!rendered.doctype) {
      add({
        type: "issue",
        severity: "notice",
        title: `HTML doctype missing on ${label}`,
        why: "A doctype keeps browsers out of quirks mode.",
        evidence: "No HTML doctype was found before rendering.",
        fix: "Start the document with <!doctype html>.",
        snippet: "<!doctype html>"
      });
    }

    if ((rendered.robots || "").toLowerCase().includes("noindex")) {
      add({
        type: "issue",
        severity: "critical",
        title: `Noindex found on ${label}`,
        why: "A noindex directive tells search engines not to index the page.",
        evidence: `Robots meta: "${rendered.robots}"`,
        fix: "Remove noindex if this page should appear in search."
      });
    }

    if (!rendered.openGraph.image || !rendered.twitter.image) {
      add({
        type: "issue",
        severity: "warning",
        title: `Social share image incomplete on ${label}`,
        why: "This affects how the page looks when shared. It is not a direct ranking claim.",
        evidence: `og:image: ${rendered.openGraph.image || "missing"}; twitter:image: ${
          rendered.twitter.image || "missing"
        }`,
        fix: "Add 1200x630 Open Graph and Twitter images.",
        snippet: buildSocialSnippet(page.url, rendered)
      });
    }

    if (!rendered.appleTouchIcon) {
      add({
        type: "issue",
        severity: "notice",
        title: `Apple touch icon missing on ${label}`,
        why: "This improves mobile saved-page presentation. It is not a ranking claim.",
        evidence: "No apple-touch-icon link found.",
        fix: "Add an Apple touch icon.",
        snippet: '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />'
      });
    }

    if (rendered.images.length > 0 && rendered.imagesMissingAlt.length > 0) {
      add({
        type: "issue",
        severity: "warning",
        title: `Images missing alt attributes on ${label}`,
        why: "Informative images need alt text for accessibility and image search context.",
        evidence: `${rendered.imagesMissingAlt.length}/${rendered.images.length} images have no alt attribute. Intentionally empty alt="" images are treated as decorative, not scored.`,
        fix: "Add useful alt text to informative images. Leave decorative images as alt=\"\" intentionally.",
        confidence: "needs-review"
      });
    }

    if (!rendered.schemaTypes.length || rendered.schemaTypes.every((type) => type === "invalid-json")) {
      add({
        type: "enhancement",
        severity: "notice",
        title: `Structured data opportunity on ${label}`,
        why: "Structured data can make content eligible for richer search features when guidelines are met.",
        evidence: "No JSON-LD structured data found.",
        fix: "Add truthful schema that matches visible content.",
        source: DOCS.structuredData,
        snippet: buildSchemaSnippet(page.url, rendered)
      });
    }

    if (finalUrlObject.protocol === "http:" && !isLocalhost(finalUrlObject.hostname)) {
      add({
        type: "issue",
        severity: "warning",
        title: `Page is not served over HTTPS on ${label}`,
        why: "HTTPS is table-stakes for user trust and browser security signals.",
        evidence: `Final rendered URL uses ${finalUrlObject.protocol}//.`,
        fix: "Enable HTTPS, redirect HTTP to HTTPS, and update canonical and sitemap URLs to HTTPS."
      });
    }

    if (finalUrlObject.protocol === "https:" && !headerValue(page.headers, "strict-transport-security")) {
      add({
        type: "issue",
        severity: "notice",
        title: `HSTS security header missing on ${label}`,
        why: "Strict-Transport-Security helps browsers keep repeat visits on HTTPS.",
        evidence: "The initial HTML response did not include a strict-transport-security header.",
        fix: "Add a Strict-Transport-Security header after confirming HTTPS works across the full host.",
        confidence: "needs-review"
      });
    }
  }
  activePage = null;

  if (!robots.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Robots.txt not found",
      why: "Robots.txt gives crawlers explicit discovery guidance.",
      evidence: `GET /robots.txt returned ${robots.status || "no response"}.`,
      fix: "Add a robots.txt file that references your sitemap.",
      snippet: "User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml"
    });
  }

  if (!sitemap.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Sitemap not found",
      why: "A sitemap helps crawlers discover important URLs.",
      evidence: `GET /sitemap.xml returned ${sitemap.status || "no response"}.`,
      fix: "Publish a sitemap and reference it from robots.txt."
    });
  }

  return findings;
}

function buildRepairPlan(findings) {
  return findings
    .filter((finding) => finding.severity !== "good")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding, index) => ({
      priority: index + 1,
      severity: finding.severity,
      title: finding.title,
      pageUrl: finding.pageUrl || null,
      pageLabel: finding.pageLabel || null,
      proof: finding.evidence,
      fix: finding.fix,
      confidence: finding.confidence || "verified",
      source: finding.source || null,
      snippet: finding.snippet || null,
      estimatedEffort: estimatedEffort(finding),
      workType: workType(finding),
      acceptance: acceptanceCheck(finding)
    }));
}

function mergeRepairPlans(basePlan = [], extraItems = []) {
  const merged = [...basePlan, ...(extraItems || [])];
  return merged.map((item, index) => ({
    ...item,
    priority: index + 1
  }));
}

function buildRepairBrief({ startUrl, score, summary, pages, findings, repairPlan, performance, competitorBenchmark, crawlInventory, renderedCrawlScale, crawlIntelligence, backlinkAudit, localSeoAudit, keywordRankAudit, platformSeoAudit }) {
  const lines = [
    "# SEO Fix Kit repair brief",
    "",
    `Site: ${startUrl}`,
    `Scanned pages: ${summary.pagesScanned}`,
    `Score: ${score}/100`,
    `Issues: ${summary.critical} critical, ${summary.warnings} warnings, ${summary.notices} notices`,
    `False positives avoided: ${summary.guardedFalsePositives}`,
    ""
  ];

  if (!repairPlan.length) {
    lines.push("## Fix order", "", "No critical repairs found in this scan.", "");
  } else {
    lines.push("## Fix order", "");
    for (const item of repairPlan) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
      if (item.snippet) {
        lines.push("", "```html", fenceSafe(item.snippet), "```", "");
      }
    }
  }

  const guarded = findings.filter((finding) => finding.severity === "good");
  if (guarded.length) {
    lines.push("## Do not fix these false positives", "");
    for (const finding of guarded) {
      lines.push(`- ${finding.title}: ${finding.evidence}`);
    }
    lines.push("");
  }

  if (pages[0]?.rendered) {
    const facts = pages[0].rendered;
    lines.push("## Rendered proof snapshot", "");
    lines.push(`- Rendered title: ${facts.title || "missing"}`);
    lines.push(`- Rendered description: ${facts.description || "missing"}`);
    lines.push(`- Rendered H1s: ${facts.h1s?.join(" | ") || "none"}`);
    lines.push(`- Rendered word count: ${facts.wordCount ?? "unknown"}`);
    lines.push(`- Rendered internal links: ${facts.internalLinks?.length ?? 0}`);
    lines.push(`- Broken rendered links: ${pages[0].linkChecks?.filter(isBrokenResource).length ?? 0}`);
    lines.push(`- Broken rendered images: ${pages[0].imageChecks?.filter(isBrokenResource).length ?? 0}`);
    lines.push(`- Rendered load time: ${facts.loadDurationMs ?? "unknown"}ms`);
    lines.push(`- Rendered schema types: ${facts.schemaTypes?.join(", ") || "none"}`);
    lines.push("");
  }

  if (performance && performance.status !== "skipped") {
    lines.push("## Performance proof snapshot", "");
    lines.push(`- Source: ${performance.source || "rendered-lab"}`);
    if (Number.isFinite(performance.performanceScore)) {
      lines.push(`- Mobile PageSpeed score: ${performance.performanceScore}/100`);
    }
    const metrics = performance.labMetrics || {};
    if (metrics.largestContentfulPaint?.display) lines.push(`- LCP: ${metrics.largestContentfulPaint.display}`);
    if (metrics.totalBlockingTime?.display) lines.push(`- TBT: ${metrics.totalBlockingTime.display}`);
    if (metrics.cumulativeLayoutShift?.display) lines.push(`- CLS: ${metrics.cumulativeLayoutShift.display}`);
    if (metrics.speedIndex?.display) lines.push(`- Speed Index: ${metrics.speedIndex.display}`);
    if (performance.fieldData?.overallCategory) {
      lines.push(`- Field data category: ${performance.fieldData.overallCategory}`);
    }
    if (performance.opportunities?.length) {
      lines.push(`- Top opportunity: ${performance.opportunities[0].title} (${performanceOpportunityEvidence(performance.opportunities[0])})`);
    }
    if (performance.reason) lines.push(`- Note: ${performance.reason}`);
    lines.push("");
  }

  lines.push(...resourceWaterfallBriefLines(pages[0]?.resourceWaterfall));
  lines.push(...competitorBenchmarkBriefLines(competitorBenchmark));
  lines.push(...crawlInventoryBriefLines(crawlInventory));
  lines.push(...renderedCrawlScaleBriefLines(renderedCrawlScale));
  lines.push(...crawlIntelligenceBriefLines(crawlIntelligence));
  lines.push(...backlinkAuditBriefLines(backlinkAudit));
  lines.push(...localSeoAuditBriefLines(localSeoAudit));
  lines.push(...keywordRankAuditBriefLines(keywordRankAudit));
  lines.push(...platformSeoAuditBriefLines(platformSeoAudit));

  lines.push("Re-run SEO Fix Kit after shipping changes and keep only fixes that match visible page content.");
  return lines.join("\n");
}

function buildFixPack(page, origin, findings = []) {
  if (!page) return [];
  const issueFixes = findings
    .filter((finding) => finding.severity !== "good" && finding.snippet)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding) => ({
      title: `Fix: ${finding.title}`,
      body: `${finding.fix} Proof: ${finding.evidence}`,
      snippet: finding.snippet
    }));

  return [
    ...issueFixes,
    {
      title: "Social preview tags",
      body: "Use this when og:image or twitter:image is missing.",
      snippet: buildSocialSnippet(page.url, page.rendered)
    },
    {
      title: "Canonical tag",
      body: "Use this when the page has one preferred public URL.",
      snippet: `<link rel="canonical" href="${page.url}" />`
    },
    {
      title: "Basic WebSite schema",
      body: "Use truthful schema that matches visible content.",
      snippet: buildSchemaSnippet(origin, page.rendered)
    }
  ].filter(dedupeFix);
}

function severityRank(severity) {
  return { critical: 0, warning: 1, notice: 2, good: 3 }[severity] ?? 4;
}

function acceptanceCheck(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("title")) {
    return "The rendered page has a unique, descriptive title that is not obviously truncated.";
  }
  if (title.includes("description")) {
    return "The rendered page has one useful meta description, roughly 70-165 characters.";
  }
  if (title.includes("h1")) {
    return "The rendered page has one visible H1 that matches the main page purpose.";
  }
  if (title.includes("internal links")) {
    return "The rendered DOM exposes normal internal anchor links to important pages.";
  }
  if (title.includes("broken") && title.includes("link")) {
    return "Every link in the finding returns a live 2xx/3xx response or has been removed intentionally.";
  }
  if (title.includes("broken") && title.includes("image")) {
    return "Every image in the finding loads successfully or has been removed intentionally.";
  }
  if (title.includes("redirecting internal")) {
    return "Internal links point directly to their final canonical destination.";
  }
  if (title.includes("canonical conflicts")) {
    return "The page either removes noindex because it should rank, or removes misleading canonical consolidation because it should stay out of search.";
  }
  if (title.includes("noindex")) {
    return "The rendered robots meta does not include noindex for pages that should rank.";
  }
  if (title.includes("canonical")) {
    return "The rendered head includes one rel=canonical pointing to the preferred URL.";
  }
  if (title.includes("hreflang")) {
    return "Hreflang tags are unique, valid, self-referencing where relevant, and point at live localized URLs.";
  }
  if (title.includes("json")) {
    return "JSON-LD parses cleanly and includes @context plus @type values matching visible content.";
  }
  if (title.includes("https") || title.includes("hsts") || title.includes("security")) {
    return "The page loads over HTTPS and sends the expected security headers without mixed-content resources.";
  }
  if (title.includes("pagespeed") || title.includes("largest contentful paint") || title.includes("total blocking time") || title.includes("layout shift")) {
    return "A rerun shows PageSpeed lab metrics back in the acceptable range and the repair evidence no longer appears.";
  }
  if (title.includes("slow") || title.includes("large image") || title.includes("large html")) {
    return "A rerun shows smaller transfer weight or faster rendered load, then field Core Web Vitals can be checked.";
  }
  if (title.includes("social share")) {
    return "The rendered head includes og:image and twitter:image using a 1200x630 image.";
  }
  if (title.includes("apple touch")) {
    return "The rendered head links an Apple touch icon.";
  }
  if (title.includes("alt")) {
    return "Informative images have useful alt text, while decorative images are intentionally empty.";
  }
  if (title.includes("structured data")) {
    return "JSON-LD validates and matches content that is visible on the page.";
  }
  if (title.includes("viewport")) {
    return "The rendered head includes a mobile-friendly viewport meta tag.";
  }
  if (title.includes("language")) {
    return "The rendered html element has the correct lang attribute.";
  }
  if (title.includes("encoding")) {
    return "The rendered document declares UTF-8 character encoding.";
  }
  if (title.includes("doctype")) {
    return "The HTML document starts in standards mode with <!doctype html>.";
  }
  if (title.includes("redirect")) {
    return "Canonicals, sitemap URLs, and internal links point at the final preferred URL.";
  }
  if (title.includes("robots.txt")) {
    return "GET /robots.txt returns 200 and references the sitemap.";
  }
  if (title.includes("sitemap")) {
    return "GET /sitemap.xml returns 200 and lists indexable canonical URLs.";
  }
  return "Re-run the audit and confirm this finding is gone or marked needs-review with evidence.";
}

function dedupeFix(fix, index, fixes) {
  return fixes.findIndex((item) => item.snippet === fix.snippet) === index;
}

function fenceSafe(value) {
  return String(value || "").replaceAll("```", "` ` `");
}

function buildSocialSnippet(url, facts) {
  const title = escapeHtml(facts.title || suggestTitle(url, facts));
  const description = escapeHtml(facts.description || suggestDescription(facts));
  const origin = new URL(url).origin;
  const image = `${origin}/og-image.png`;
  return [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ].join("\n");
}

function buildSchemaSnippet(url, facts) {
  const origin = new URL(url).origin;
  return `<script type="application/ld+json">\n${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: facts.title || new URL(url).hostname,
      url: origin,
      description: facts.description || suggestDescription(facts)
    },
    null,
    2
  )}\n</script>`;
}

async function collectPerformanceInsights(startUrl, homePage, options = {}) {
  const fallback = buildRenderedPerformanceSummary(homePage);
  if (!shouldRunPageSpeed(startUrl, options)) {
    return {
      status: "skipped",
      source: "rendered-lab",
      reason: "PageSpeed Insights skipped for local, private, or disabled runs.",
      ...fallback
    };
  }

  try {
    const raw = await fetchPageSpeedInsights(startUrl, options);
    return {
      ...fallback,
      ...parsePageSpeedResult(raw),
      status: "success",
      source: "pagespeed-insights-v5",
      strategy: "mobile"
    };
  } catch (error) {
    return {
      status: "unavailable",
      source: "rendered-lab",
      reason: error.message || "PageSpeed Insights did not return performance data.",
      ...fallback
    };
  }
}

function shouldRunPageSpeed(startUrl, options = {}) {
  if (options.pageSpeed === false || options.disabled) return false;
  if (options.pageSpeed === true) return true;
  const parsed = new URL(startUrl);
  return ["http:", "https:"].includes(parsed.protocol) && !isLocalhost(parsed.hostname);
}

async function fetchPageSpeedInsights(url, options = {}) {
  const endpoint = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.append("category", "performance");
  endpoint.searchParams.set("locale", "en_US");
  if (options.pageSpeedApiKey) {
    endpoint.searchParams.set("key", options.pageSpeedApiKey);
  }
  const response = await fetch(endpoint.href, {
    headers: {
      "user-agent": `SEOFixKit/${VERSION} (+https://seofixkit.com; PageSpeed proof audit)`
    },
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) {
    throw new Error(`PageSpeed Insights returned HTTP ${response.status}.`);
  }
  return response.json();
}

function parsePageSpeedResult(raw = {}) {
  const lighthouse = raw.lighthouseResult || {};
  const audits = lighthouse.audits || {};
  const rawScore = lighthouse.categories?.performance?.score;
  const performanceScore = Number.isFinite(rawScore) ? Math.round(rawScore * 100) : null;
  const labMetrics = {
    firstContentfulPaint: metricFromAudit(audits["first-contentful-paint"]),
    largestContentfulPaint: metricFromAudit(audits["largest-contentful-paint"]),
    totalBlockingTime: metricFromAudit(audits["total-blocking-time"]),
    cumulativeLayoutShift: metricFromAudit(audits["cumulative-layout-shift"]),
    speedIndex: metricFromAudit(audits["speed-index"])
  };
  const fieldMetrics = parseFieldMetrics(raw.loadingExperience);
  return {
    analysisTimestamp: raw.analysisUTCTimestamp || "",
    finalUrl: raw.id || "",
    performanceScore,
    category: scoreCategory(performanceScore),
    fieldData: {
      overallCategory: raw.loadingExperience?.overall_category || "",
      originFallback: Boolean(raw.loadingExperience?.origin_fallback),
      metrics: fieldMetrics
    },
    labMetrics,
    opportunities: topPageSpeedOpportunities(audits)
  };
}

function metricFromAudit(audit = {}) {
  return {
    title: audit.title || "",
    value: Number(audit.numericValue || 0),
    display: audit.displayValue || formatMetricValue(audit.numericValue),
    score: typeof audit.score === "number" ? Math.round(audit.score * 100) : null
  };
}

function parseFieldMetrics(loadingExperience = {}) {
  const metrics = loadingExperience.metrics || {};
  return {
    largestContentfulPaint: fieldMetric(metrics.LARGEST_CONTENTFUL_PAINT_MS, "ms"),
    interactionToNextPaint: fieldMetric(metrics.INTERACTION_TO_NEXT_PAINT, "ms"),
    cumulativeLayoutShift: fieldMetric(metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE, "ratio"),
    firstContentfulPaint: fieldMetric(metrics.FIRST_CONTENTFUL_PAINT_MS, "ms")
  };
}

function fieldMetric(metric, unit) {
  if (!metric) return null;
  const percentile =
    unit === "ratio" ? Number(metric.percentile || 0) / 100 : Number(metric.percentile || 0);
  return {
    percentile,
    display: unit === "ratio" ? percentile.toFixed(2) : `${Math.round(percentile)}ms`,
    category: metric.category || ""
  };
}

function topPageSpeedOpportunities(audits = {}) {
  const ids = [
    "render-blocking-resources",
    "unused-javascript",
    "unused-css-rules",
    "unminified-javascript",
    "unminified-css",
    "modern-image-formats",
    "uses-optimized-images",
    "uses-responsive-images",
    "offscreen-images",
    "total-byte-weight",
    "server-response-time",
    "largest-contentful-paint-element"
  ];
  return ids
    .map((id) => {
      const audit = audits[id];
      if (!audit) return null;
      const savingsMs = Number(audit.details?.overallSavingsMs || 0);
      const savingsBytes = Number(audit.details?.overallSavingsBytes || 0);
      const score = typeof audit.score === "number" ? audit.score : null;
      const hasSavings = savingsMs > 0 || savingsBytes > 0;
      const failed = score !== null && score < 0.9;
      if (!hasSavings && !failed) return null;
      return {
        id,
        title: audit.title || id,
        description: audit.description || "",
        displayValue: audit.displayValue || "",
        score: score === null ? null : Math.round(score * 100),
        savingsMs,
        savingsBytes
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes)
    .slice(0, 5);
}

function buildRenderedPerformanceSummary(homePage) {
  const rendered = homePage?.rendered || {};
  return {
    performanceScore: null,
    category: "",
    fieldData: {
      overallCategory: "",
      originFallback: false,
      metrics: {}
    },
    labMetrics: {
      renderedLoad: {
        title: "Rendered browser load",
        value: Number(rendered.loadDurationMs || 0),
        display: rendered.loadDurationMs ? `${Math.round(rendered.loadDurationMs)}ms` : "unknown",
        score: null
      },
      htmlTransfer: {
        title: "Initial HTML transfer",
        value: Number(homePage?.transferSize || 0),
        display: formatBytes(homePage?.transferSize || 0),
        score: null
      }
    },
    opportunities: []
  };
}

function addPerformanceFindings(add, performance = {}, label) {
  if (!performance || performance.status === "skipped") return;
  if (performance.status === "unavailable") {
    add({
      type: "performance",
      severity: "notice",
      title: `PageSpeed data unavailable on ${label}`,
      why: "PageSpeed data adds Lighthouse lab proof for performance fixes. The rendered audit still collected local load proof.",
      evidence: performance.reason || "PageSpeed Insights did not return a result.",
      fix: "Rerun the audit later, or add a PageSpeed API key if automated volume is hitting public limits.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
    return;
  }

  if (Number.isFinite(performance.performanceScore) && performance.performanceScore < PERFORMANCE_LIMITS.needsImprovementScore) {
    add({
      type: "performance",
      severity: performance.performanceScore < PERFORMANCE_LIMITS.poorScore ? "critical" : "warning",
      title: `Low mobile PageSpeed performance on ${label}`,
      why: "Page speed affects user experience and is part of the page-experience signal set.",
      evidence: `Mobile PageSpeed performance score is ${performance.performanceScore}/100 (${performance.category || "unknown"}).`,
      fix: "Prioritize the PageSpeed opportunities in this report, then rerun until the mobile performance score is at least 75.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const lcp = performance.labMetrics?.largestContentfulPaint;
  if (lcp?.value > PERFORMANCE_LIMITS.lcpNeedsImprovementMs) {
    add({
      type: "performance",
      severity: lcp.value > PERFORMANCE_LIMITS.lcpPoorMs ? "critical" : "warning",
      title: `Slow Largest Contentful Paint on ${label}`,
      why: "LCP measures when the main content becomes visible. Slow LCP usually means users wait too long for the page's main value.",
      evidence: `PageSpeed lab LCP is ${lcp.display || `${Math.round(lcp.value)}ms`}.`,
      fix: "Optimize the LCP element, reduce render-blocking work, preload the hero asset, and compress or resize above-the-fold media.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const tbt = performance.labMetrics?.totalBlockingTime;
  if (tbt?.value > PERFORMANCE_LIMITS.tbtNeedsImprovementMs) {
    add({
      type: "performance",
      severity: tbt.value > PERFORMANCE_LIMITS.tbtPoorMs ? "critical" : "warning",
      title: `High Total Blocking Time on ${label}`,
      why: "High blocking time means JavaScript is keeping the page from responding quickly.",
      evidence: `PageSpeed lab TBT is ${tbt.display || `${Math.round(tbt.value)}ms`}.`,
      fix: "Remove unused JavaScript, split bundles, defer non-critical scripts, and reduce third-party script work.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const cls = performance.labMetrics?.cumulativeLayoutShift;
  if (cls?.value > PERFORMANCE_LIMITS.clsNeedsImprovement) {
    add({
      type: "performance",
      severity: cls.value > PERFORMANCE_LIMITS.clsPoor ? "critical" : "warning",
      title: `Layout shift risk on ${label}`,
      why: "Unexpected layout shift makes pages feel unstable and can hurt Core Web Vitals.",
      evidence: `PageSpeed lab CLS is ${cls.display || cls.value.toFixed(2)}.`,
      fix: "Reserve dimensions for images, ads, embeds, and late-loading UI so content does not jump after render.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  for (const opportunity of performance.opportunities || []) {
    add({
      type: "performance",
      severity: opportunity.savingsMs > 1000 || opportunity.savingsBytes > 250_000 ? "warning" : "notice",
      title: `${opportunity.title} on ${label}`,
      why: "PageSpeed flagged this as a concrete performance repair opportunity.",
      evidence: performanceOpportunityEvidence(opportunity),
      fix: performanceOpportunityFix(opportunity),
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }
}

function performanceOpportunityEvidence(opportunity) {
  const savings = [];
  if (opportunity.savingsMs) savings.push(`${Math.round(opportunity.savingsMs)}ms potential savings`);
  if (opportunity.savingsBytes) savings.push(`${formatBytes(opportunity.savingsBytes)} potential transfer savings`);
  if (opportunity.displayValue) savings.push(opportunity.displayValue);
  if (opportunity.score !== null) savings.push(`audit score ${opportunity.score}/100`);
  return savings.join("; ") || opportunity.title;
}

function performanceOpportunityFix(opportunity) {
  const id = opportunity.id || "";
  if (id.includes("render-blocking")) return "Inline critical CSS, defer non-critical CSS/JS, and remove blocking assets from the initial render path.";
  if (id.includes("unused-javascript")) return "Delete unused scripts, split the bundle by route, and defer code that is not needed for the first view.";
  if (id.includes("unused-css")) return "Remove unused CSS rules and ship only the styles needed for this route.";
  if (id.includes("image") || id.includes("offscreen")) return "Compress images, serve WebP/AVIF where safe, lazy-load below-the-fold images, and size assets to their rendered dimensions.";
  if (id.includes("total-byte-weight")) return "Reduce total transfer weight by compressing assets, pruning unused code, and removing heavy third-party payloads.";
  if (id.includes("server-response")) return "Improve server response time with caching, faster backend work, or edge delivery.";
  if (id.includes("largest-contentful-paint")) return "Optimize the LCP element directly: preload it, compress it, and avoid hiding it behind client-side rendering.";
  return "Review the PageSpeed opportunity and apply the smallest code or content change that removes the measured bottleneck.";
}

function scoreCategory(score) {
  if (!Number.isFinite(score)) return "";
  if (score >= 90) return "fast";
  if (score >= PERFORMANCE_LIMITS.needsImprovementScore) return "good";
  if (score >= PERFORMANCE_LIMITS.poorScore) return "needs-improvement";
  return "poor";
}

function formatMetricValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number >= 1000 ? `${(number / 1000).toFixed(1)}s` : `${Math.round(number)}ms`;
}

async function validatePageResources(rendered = {}) {
  const pageUrl = rendered.finalUrl || "";
  const pageOrigin = pageUrl ? new URL(pageUrl).origin : "";
  const links = uniqueResources(rendered.links || [], "href")
    .slice(0, RESOURCE_LIMITS.linksPerPage)
    .map((link) => ({
      url: link.href,
      label: link.text || link.rawHref || link.href,
      kind: link.href && new URL(link.href).origin === pageOrigin ? "internal" : "external"
    }));
  const images = uniqueResources(
    (rendered.images || []).filter((image) => isHttpResourceUrl(image.src)),
    "src"
  )
    .slice(0, RESOURCE_LIMITS.imagesPerPage)
    .map((image) => ({
      url: image.src,
      label: image.alt || image.src,
      kind: "image"
    }));

  const [linkChecks, imageChecks, canonicalCheck] = await Promise.all([
    Promise.all(links.map(checkResource)),
    Promise.all(images.map(checkResource)),
    rendered.canonical
      ? checkResource({ url: rendered.canonical, label: "canonical", kind: "canonical" })
      : Promise.resolve(null)
  ]);

  return {
    links: linkChecks,
    images: imageChecks,
    canonical: canonicalCheck
  };
}

function isHttpResourceUrl(value = "") {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function emptyResourceChecks() {
  return { links: [], images: [], canonical: null };
}

async function checkResource(resource) {
  const checked = await fetchResource(resource.url, "HEAD");
  const result =
    checked.status === 403 || checked.status === 405
      ? await fetchResource(resource.url, "GET")
      : checked;
  return {
    ...resource,
    ...result,
    redirected: (result.redirectChain || []).length > 0
  };
}

async function fetchResource(url, method) {
  try {
    const result = publicAuditUrlStatus(url);
    if (!result.ok) {
      return {
        ok: false,
        status: null,
        finalUrl: url,
        contentType: "",
        contentLength: 0,
        headers: {},
        redirectChain: [],
        error: result.error
      };
    }

    let currentUrl = url;
    let response = null;
    const redirectChain = [];
    for (let redirectCount = 0; redirectCount <= RESOURCE_LIMITS.maxRedirects; redirectCount += 1) {
      response = await fetch(currentUrl, {
        method,
        redirect: "manual",
        headers: { "user-agent": `SEOFixKit/${VERSION} (+https://seofixkit.com; evidence-backed SEO audit)` },
        signal: AbortSignal.timeout(RESOURCE_LIMITS.timeoutMs)
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) break;
      const nextUrl = new URL(location, currentUrl).href;
      const nextStatus = publicAuditUrlStatus(nextUrl);
      if (!nextStatus.ok) {
        return {
          ok: false,
          status: response.status,
          finalUrl: nextUrl,
          contentType: "",
          contentLength: 0,
          headers: headersToObject(response.headers),
          redirectChain,
          error: nextStatus.error
        };
      }
      redirectChain.push({ status: response.status, from: currentUrl, to: nextUrl });
      currentUrl = nextUrl;
    }

    if (!response) throw new Error("No response returned.");

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: currentUrl,
      contentType: response.headers.get("content-type") || "",
      contentLength: Number(response.headers.get("content-length")) || 0,
      headers: headersToObject(response.headers),
      redirectChain,
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      contentType: "",
      contentLength: 0,
      headers: {},
      redirectChain: [],
      error: error.message
    };
  }
}

function validateHreflang(hreflangs = [], pageUrl = "") {
  const issues = [];
  if (!hreflangs.length) return issues;

  const seen = new Map();
  for (const tag of hreflangs) {
    const code = String(tag.hreflang || "").toLowerCase();
    if (!code || !/^(x-default|[a-z]{2,3}(-[a-z0-9]{2,8})*)$/i.test(code)) {
      issues.push({
        severity: "warning",
        title: "Invalid hreflang code",
        why: "Invalid hreflang values can prevent Google from understanding localized page alternates.",
        evidence: `Invalid hreflang value "${tag.hreflang || "missing"}" points to ${tag.href || "missing href"}.`,
        fix: "Use valid BCP 47 language or language-region codes, or x-default for the fallback URL."
      });
    }
    if (seen.has(code)) {
      issues.push({
        severity: "warning",
        title: "Duplicate hreflang tag",
        why: "Duplicate hreflang codes create conflicting alternate-page signals.",
        evidence: `${code} appears more than once: ${seen.get(code)} and ${tag.href || "missing href"}.`,
        fix: "Keep one hreflang entry per language or language-region code."
      });
    }
    seen.set(code, tag.href || "");
  }

  const pageKey = canonicalKey(pageUrl);
  const hasSelfReference = hreflangs.some((tag) => canonicalKey(tag.href) === pageKey);
  if (!hasSelfReference) {
    issues.push({
      severity: "notice",
      title: "Hreflang is missing a self-reference",
      why: "Each localized page should usually include itself in its hreflang cluster.",
      evidence: `No hreflang href matches the current page ${pageUrl}.`,
      fix: "Add a hreflang entry for the current page alongside the alternate language URLs.",
      confidence: "needs-review"
    });
  }

  if (hreflangs.length > 1 && !seen.has("x-default")) {
    issues.push({
      severity: "notice",
      title: "Hreflang cluster has no x-default",
      why: "An x-default URL gives Google a fallback page when no language or region fits.",
      evidence: `${hreflangs.length} hreflang tags were found, but none use x-default.`,
      fix: "Add an x-default hreflang entry when there is a neutral fallback URL.",
      confidence: "needs-review"
    });
  }

  return dedupeHreflangIssues(issues);
}

function dedupeHreflangIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.title}:${issue.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isBrokenResource(check) {
  return !check || !check.ok || !check.status || check.status >= 400;
}

function formatResourceEvidence(resources = []) {
  const shown = resources.slice(0, 5).map((resource) => {
    const status = resource.status || resource.error || "no response";
    const destination =
      resource.redirected && resource.finalUrl && resource.finalUrl !== resource.url
        ? ` -> ${formatResourceUrl(resource.finalUrl)}`
        : "";
    const size = resource.contentLength ? ` (${formatBytes(resource.contentLength)})` : "";
    return `${formatResourceUrl(resource.url)} returned ${status}${destination}${size}`;
  });
  const extra = resources.length > shown.length ? `; ${resources.length - shown.length} more` : "";
  return `${shown.join("; ")}${extra}.`;
}

function formatRedirectChain(chain = []) {
  if (!chain.length) return "No redirect chain recorded.";
  return chain
    .slice(0, 6)
    .map((step) => `${step.status}: ${formatResourceUrl(step.from)} -> ${formatResourceUrl(step.to)}`)
    .join("; ");
}

function formatResourceUrl(value = "") {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${url.search}`.replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return String(value || "unknown");
  }
}

function canonicalKey(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort?.();
    return url.href.replace(/\/$/, "");
  } catch {
    return String(value || "");
  }
}

function uniqueResources(items = [], key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item?.[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function headersToObject(headers) {
  const output = {};
  headers?.forEach?.((value, key) => {
    output[key.toLowerCase()] = value;
  });
  return output;
}

function headerValue(headers = {}, name) {
  return headers[String(name).toLowerCase()] || "";
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isLocalhost(hostname = "") {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) || hostname.endsWith(".local");
}

async function fetchText(url) {
  try {
    const started = Date.now();
    let currentUrl = url;
    let response = null;
    const redirectChain = [];
    for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
      const status = publicAuditUrlStatus(currentUrl);
      if (!status.ok) {
        return {
          ok: false,
          status: null,
          url: currentUrl,
          contentType: "",
          body: "",
          headers: {},
          redirectChain,
          responseTimeMs: Date.now() - started,
          contentLength: 0,
          error: status.error
        };
      }

      response = await fetch(currentUrl, {
        redirect: "manual",
        headers: { "user-agent": `SEOFixKit/${VERSION} (+https://seofixkit.com; evidence-backed SEO audit)` },
        signal: AbortSignal.timeout(15_000)
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) break;
      const nextUrl = new URL(location, currentUrl).href;
      redirectChain.push({ status: response.status, from: currentUrl, to: nextUrl });
      currentUrl = nextUrl;
    }

    if (!response) {
      throw new Error("No response returned.");
    }

    const contentType = response.headers.get("content-type") || "";
    const body =
      contentType.includes("text") ||
      contentType.includes("html") ||
      contentType.includes("xml")
        ? await readTextLimited(response, MAX_HTML_BYTES)
        : "";
    return {
      ok: response.ok,
      status: response.status,
      url: currentUrl,
      contentType,
      body,
      headers: headersToObject(response.headers),
      redirectChain,
      responseTimeMs: Date.now() - started,
      contentLength: Number(response.headers.get("content-length")) || byteLength(body)
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      contentType: "",
      body: "",
      headers: {},
      redirectChain: [],
      responseTimeMs: null,
      contentLength: 0,
      error: error.message
    };
  }
}

function isHtmlResponse(fetchResult, url) {
  const contentType = (fetchResult.contentType || "").toLowerCase();
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) return true;
  if (
    isLikelyHtmlUrl(url) &&
    (contentType.includes("application/octet-stream") ||
      contentType.includes("binary/octet-stream") ||
      contentType.includes("text/plain"))
  ) {
    return true;
  }
  if (contentType) return false;
  return isLikelyHtmlUrl(url);
}

function isLikelyHtmlUrl(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return !/\.(txt|xml|json|csv|pdf|png|jpe?g|gif|webp|svg|ico|css|js|map|zip)$/i.test(pathname);
  } catch {
    return false;
  }
}

async function readTextLimited(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("HTML byte limit exceeded");
      break;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total > maxBytes ? maxBytes : total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk.slice(0, Math.max(0, merged.length - offset)), offset);
    offset += chunk.byteLength;
    if (offset >= merged.length) break;
  }
  return new TextDecoder().decode(merged);
}

function buildPageSummaries(pages, findings, startUrl) {
  return pages.map((page) => {
    const pageFindings = findings.filter(
      (finding) => finding.pageUrl === page.url && finding.severity !== "good"
    );
    const guards = findings.filter(
      (finding) => finding.pageUrl === page.url && finding.severity === "good"
    );
    const facts = page.rendered || {};
    const staticFacts = page.static || {};
    return {
      url: page.url,
      path: pathLabel(page.url, startUrl),
      status: page.status,
      finalUrl: facts.finalUrl || page.finalUrl || page.url,
      score: scoreFindings(pageFindings),
      critical: pageFindings.filter((finding) => finding.severity === "critical").length,
      warnings: pageFindings.filter((finding) => finding.severity === "warning").length,
      notices: pageFindings.filter((finding) => finding.severity === "notice").length,
      guards: guards.length,
      title: facts.title || "",
      h1: facts.h1s?.[0] || "",
      wordCount: facts.wordCount || 0,
      internalLinks: facts.internalLinks?.length || 0,
      brokenLinks: page.linkChecks?.filter(isBrokenResource).length || 0,
      brokenImages: page.imageChecks?.filter(isBrokenResource).length || 0,
      loadDurationMs: facts.loadDurationMs || 0,
      schemaTypes: facts.schemaTypes || [],
      staticWordCount: staticFacts.wordCount || 0,
      staticH1: staticFacts.h1s?.[0] || "",
      staticInternalLinks: staticFacts.internalLinks?.length || 0
    };
  });
}

function summarize(findings, pages, maxPages = pages.length) {
  return {
    pagesScanned: pages.length,
    maxPages,
    crawlLimitHit: pages.length >= maxPages,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    notices: findings.filter((finding) => finding.severity === "notice").length,
    guardedFalsePositives: findings.filter((finding) => finding.severity === "good").length,
    totalFindings: findings.length,
    scoring: scoreBreakdown(findings)
  };
}

function scoreFindings(findings) {
  const { penalty } = scoreBreakdown(findings);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function scoreBreakdown(findings = []) {
  const groups = new Map();
  for (const finding of findings) {
    if (!finding || finding.severity === "good") continue;
    const key = scoreFindingKey(finding);
    const group = groups.get(key) || { key, critical: 0, warning: 0, notice: 0 };
    if (finding.severity === "critical") group.critical += 1;
    if (finding.severity === "warning") group.warning += 1;
    if (finding.severity === "notice") group.notice += 1;
    groups.set(key, group);
  }

  let penalty = 0;
  const repeated = [];
  for (const group of groups.values()) {
    const groupPenalty =
      severityPenalty(group.critical, "critical") +
      severityPenalty(group.warning, "warning") +
      severityPenalty(group.notice, "notice");
    penalty += groupPenalty;
    const count = group.critical + group.warning + group.notice;
    if (count > 1) {
      repeated.push({
        key: group.key,
        count,
        penalty: Number(groupPenalty.toFixed(2))
      });
    }
  }

  return {
    method: "deduped-template-penalty-v1",
    penalty: Number(penalty.toFixed(2)),
    repeated
  };
}

function severityPenalty(count, severity) {
  if (!count) return 0;
  const first = { critical: 12, warning: 5, notice: 1 }[severity] || 0;
  const repeat = { critical: 4, warning: 1.5, notice: 0.25 }[severity] || 0;
  const cap = { critical: 28, warning: 10, notice: 3 }[severity] || first;
  return Math.min(cap, first + Math.max(0, count - 1) * repeat);
}

function scoreFindingKey(finding) {
  return issuePatternKey(finding.title || "Unknown issue");
}

function headingHierarchyIssue(headings = []) {
  if (!headings.length) return "";
  const levels = headings.map((heading) => Number(String(heading.level).replace("h", "")));
  if (levels[0] !== 1) {
    return `First rendered heading is H${levels[0]} instead of H1.`;
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] - levels[index - 1] > 1) {
      return `Heading jumps from H${levels[index - 1]} to H${levels[index]}.`;
    }
  }
  return "";
}

function estimatedEffort(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("broken link") || title.includes("broken image")) return "15-45 min";
  if (title.includes("pagespeed") || title.includes("largest contentful paint") || title.includes("total blocking time") || title.includes("layout shift")) return "45-120 min";
  if (title.includes("robots") || title.includes("sitemap")) return "15-30 min";
  if (title.includes("title") || title.includes("description") || title.includes("canonical")) return "5-15 min";
  if (title.includes("social") || title.includes("schema") || title.includes("viewport")) return "15-45 min";
  if (title.includes("hreflang") || title.includes("security") || title.includes("https")) return "30-90 min";
  if (title.includes("slow") || title.includes("large")) return "45-120 min";
  if (title.includes("thin") || title.includes("internal links") || title.includes("heading")) return "30-90 min";
  return "15-30 min";
}

function workType(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("title") || title.includes("description") || title.includes("thin") || title.includes("alt")) {
    return "content";
  }
  if (title.includes("schema") || title.includes("canonical") || title.includes("viewport") || title.includes("social")) {
    return "code";
  }
  if (title.includes("broken link") || title.includes("broken image")) {
    return "content";
  }
  if (title.includes("robots") || title.includes("sitemap") || title.includes("redirect") || title.includes("hreflang") || title.includes("https") || title.includes("security") || title.includes("slow") || title.includes("large") || title.includes("pagespeed") || title.includes("largest contentful paint") || title.includes("total blocking time") || title.includes("layout shift")) {
    return "technical";
  }
  return "review";
}

function attr(html, name) {
  const wanted = String(name || "").toLowerCase();
  for (const match of String(html || "").matchAll(/\s([^\s=]+)\s*=\s*(["'])(.*?)\2/gi)) {
    if (match[1].toLowerCase() === wanted) return match[3] || null;
  }
  return null;
}

function meta(head, key, value) {
  for (const match of String(head || "").matchAll(/<meta\b[^>]*>/gi)) {
    if (attr(match[0], key) === value) return attr(match[0], "content");
  }
  return null;
}

function linkRel(head, rel) {
  const wanted = String(rel || "").toLowerCase();
  for (const match of String(head || "").matchAll(/<link\b[^>]*>/gi)) {
    const tokens = String(attr(match[0], "rel") || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.includes(wanted)) return attr(match[0], "href");
  }
  return null;
}

function absolute(value, base) {
  try {
    return value ? new URL(value, base).href : null;
  } catch {
    return value || null;
  }
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

function workerAppHost(host = "", env = {}) {
  const clean = cleanReportDomain(host);
  if (!clean) return true;
  const appHosts = new Set(
    [
      "seofixkit.com",
      "www.seofixkit.com",
      ...String(env.SEOFIXKIT_APP_HOSTS || "")
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
    const check = publicAuditUrlStatus(normalized);
    if (!check.ok) {
      return { ok: false, error: `Competitor ${value}: ${check.error}` };
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
    const check = publicAuditUrlStatus(url.href);
    if (!check.ok) return "";
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

function cleanInviteCode(input) {
  const code = String(input || "").trim();
  if (code.length < 8 || code.length > 120) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return "";
  return code;
}

function cleanAccessToken(input) {
  const token = String(input || "").trim();
  if (token.length < 32 || token.length > 160) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return "";
  return token;
}

function cleanAccessMode(input) {
  const mode = String(input || "").trim().toLowerCase();
  if (mode === "invite" || mode === "self-serve" || mode === "founder-override") return mode;
  if (mode === "api") return "api";
  return "invite";
}

function randomHex(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomApiTokenSecret() {
  return `sfk_live_${randomHex(24)}`;
}

function randomInviteCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clampPageLimit(value) {
  return normalizeCrawlLimit(value);
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

function safeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSafeUuid(input) {
  return /^[a-f0-9-]{32,40}$/i.test(String(input || ""));
}

function isAdminAuthorized(request, env) {
  const expected = String(env.ADMIN_EXPORT_TOKEN || "");
  if (!expected) return false;

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = bearer;
  return constantTimeEqual(token, expected);
}

async function betaAccessStatus(request, env) {
  if (!env.WAITLIST_DB) {
    return {
      ok: false,
      status: 503,
      error: "Private beta sessions are not configured."
    };
  }

  const token = betaSessionTokenFromRequest(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Private beta session required."
    };
  }

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT token_hash, owner_email, invite_id, access_mode, expires_at, revoked_at
     FROM beta_sessions
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();

  if (!row?.token_hash || row.revoked_at || row.expires_at <= now) {
    return {
      ok: false,
      status: 401,
      error: "Private beta session expired."
    };
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE beta_sessions SET last_seen_at = ? WHERE token_hash = ?`
  )
    .bind(now, tokenHash)
    .run();

  return {
    ok: true,
    ownerEmail: row.owner_email,
    inviteId: row.invite_id || null,
    accessMode: cleanAccessMode(row.access_mode || (row.invite_id ? "invite" : "founder-override")),
    sessionHash: row.token_hash,
    expiresAt: row.expires_at
  };
}

function betaAccessResponse(access) {
  const response = jsonNoStore({ error: access.error }, access.status);
  if (access.status === 401) {
    response.headers.append("set-cookie", clearSessionCookie());
  }
  return response;
}

async function apiAccessStatus(request, env) {
  if (!env.WAITLIST_DB) {
    return { ok: false, status: 503, error: "Developer API storage is not configured." };
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return { ok: false, status: 401, error: "API key required." };
  const tokenHash = await sha256Hex(bearer);
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, owner_email, token_hash, status
     FROM api_tokens
     WHERE token_hash = ?
       AND status = 'active'
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();
  if (!row?.id) return { ok: false, status: 401, error: "API key is invalid or revoked." };
  await env.WAITLIST_DB.prepare(
    `UPDATE api_tokens
     SET last_used_at = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(now, now, row.id)
    .run();
  return {
    ok: true,
    ownerEmail: row.owner_email,
    accessMode: "api",
    sessionHash: row.token_hash,
    apiTokenId: row.id
  };
}

function apiAccessResponse(access) {
  return jsonNoStore({ error: access.error || "API key required." }, access.status || 401);
}

async function auditQuotaStatus(request, env, access, targetUrl) {
  if (!env.WAITLIST_DB) {
    return { ok: false, error: "Report storage is not configured." };
  }

  const now = new Date();
  const hour = hourWindow(now);
  const day = dayWindow(now);
  const ipHash = await requestIpHash(request);
  const targetHost = new URL(targetUrl).hostname.toLowerCase();
  const sessionKey = access.sessionHash.slice(0, 24);
  const targetKey = targetHost.replace(/[^a-z0-9.-]/gi, "").slice(0, 120);

  return checkQuotaSet(env, [
    {
      bucket: `audit:ip:${hour.key}:${ipHash}`,
      limit: 12,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Audit limit reached for this network this hour. Try again later."
    },
    {
      bucket: `audit:session-hour:${hour.key}:${sessionKey}`,
      limit: 8,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Audit limit reached for this beta session this hour. Try again later."
    },
    {
      bucket: `audit:session-day:${day.key}:${sessionKey}`,
      limit: 30,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily beta audit limit reached. Try again tomorrow."
    },
    {
      bucket: `audit:target:${hour.key}:${targetKey}`,
      limit: 4,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "That site has been audited several times this hour. Try again later."
    }
  ]);
}

async function liteAuditQuotaStatus(env, access) {
  const day = dayWindow(new Date());
  return checkQuotaSet(env, [
    {
      bucket: `audit:lite-day:${day.key}:${normalizeEmail(access.ownerEmail)}`,
      limit: 3,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily Lite check limit reached. Verify your site for full self-serve audits, or try again tomorrow."
    }
  ]);
}

async function waitlistQuotaStatus(request, env) {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  return checkQuotaSet(env, [
    {
      bucket: `waitlist:ip:${hour.key}:${ipHash}`,
      limit: 20,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many waitlist attempts from this network. Try again later."
    }
  ]);
}

async function loginQuotaStatus(request, env, ownerEmail = "", inviteCodeHash = "") {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  const checks = [
    {
      bucket: `login:ip:${hour.key}:${ipHash}`,
      limit: 20,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many login attempts from this network. Try again later."
    }
  ];
  if (ownerEmail) {
    checks.push({
      bucket: `login:email:${hour.key}:${await sha256Hex(ownerEmail)}`,
      limit: 10,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many login attempts for this email. Try again later."
    });
  }
  if (inviteCodeHash) {
    checks.push({
      bucket: `login:invite:${hour.key}:${inviteCodeHash.slice(0, 32)}`,
      limit: 10,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many login attempts for this invite. Try again later."
    });
  }
  return checkQuotaSet(env, checks);
}

async function accessLinkQuotaStatus(request, env, ownerEmail = "") {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  const checks = [
    {
      bucket: `access:ip:${hour.key}:${ipHash}`,
      limit: 8,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many access link requests from this network. Try again later."
    }
  ];
  if (ownerEmail) {
    checks.push({
      bucket: `access:email:${hour.key}:${await sha256Hex(ownerEmail)}`,
      limit: 3,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many access links requested for this email. Try again later."
    });
  }
  return checkQuotaSet(env, checks);
}

async function adminFailureQuotaStatus(request, env) {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  return checkQuotaSet(env, [
    {
      bucket: `admin-fail:ip:${hour.key}:${ipHash}`,
      limit: 20,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many admin attempts from this network. Try again later."
    }
  ]);
}

async function inviteAccessStatus(request, env, ownerEmail, inviteCode, inviteCodeHash) {
  if (!inviteCode) {
    return {
      ok: false,
      status: 401,
      error: "Private beta invite code required."
    };
  }

  const founderPassword = String(env.BETA_ACCESS_PASSWORD || "");
  if (founderPassword && constantTimeEqual(inviteCode, founderPassword)) {
    return { ok: true, inviteId: null, accessMode: "founder-override" };
  }

  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, owner_email, status, max_uses, used_count, expires_at
     FROM beta_invites
     WHERE code_hash = ?
     LIMIT 1`
  )
    .bind(inviteCodeHash)
    .first();

  if (!row?.id || row.status !== "active") {
    return { ok: false, status: 401, error: "Private beta invite not found." };
  }
  if (row.owner_email !== ownerEmail) {
    return { ok: false, status: 401, error: "This invite is tied to another email." };
  }
  if (row.expires_at && row.expires_at <= now) {
    return { ok: false, status: 401, error: "Private beta invite expired." };
  }
  if (Number(row.used_count || 0) >= Number(row.max_uses || 1)) {
    return { ok: false, status: 401, error: "Private beta invite has already been used." };
  }

  const ipHash = await requestIpHash(request);
  const update = await env.WAITLIST_DB.prepare(
    `UPDATE beta_invites
     SET used_count = used_count + 1,
      used_at = ?,
      last_used_ip_hash = ?,
      status = CASE WHEN used_count + 1 >= max_uses THEN 'used' ELSE status END
     WHERE id = ?
      AND status = 'active'
      AND used_count < max_uses
      AND (expires_at IS NULL OR expires_at > ?)`
  )
    .bind(now, ipHash, row.id, now)
    .run();

  if (Number(update?.meta?.changes || 0) !== 1) {
    return { ok: false, status: 401, error: "Private beta invite has already been used." };
  }

  return { ok: true, inviteId: row.id, accessMode: "invite" };
}

async function checkQuotaSet(env, checks) {
  const updatedAt = new Date().toISOString();
  for (const check of checks) {
    const update = await env.WAITLIST_DB.prepare(
      `INSERT INTO audit_usage (bucket, count, window_start, updated_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(bucket) DO UPDATE SET
        count = audit_usage.count + 1,
        updated_at = excluded.updated_at
       WHERE audit_usage.count < ?`
    )
      .bind(check.bucket, check.windowStart, updatedAt, check.limit)
      .run();

    if (Number(update?.meta?.changes || 0) !== 1) {
      return {
        ok: false,
        error: check.error,
        resetAt: check.resetAt.toISOString()
      };
    }
  }

  return { ok: true };
}

async function adminAccessStatus(request, env, action) {
  const session = await adminSessionStatus(request, env);
  if (session.ok) return { ok: true, actorEmail: session.actorEmail };
  const ok = isAdminAuthorized(request, env);
  const actorEmail =
    cleanText(request.headers.get("cf-access-authenticated-user-email") || "", 254) ||
    "bearer-admin";
  if (!ok) {
    const quota = env.WAITLIST_DB ? await adminFailureQuotaStatus(request, env) : { ok: true };
    await logAdminAction(request, env, action, false, actorEmail);
    if (!quota.ok) {
      return { ok: false, status: 429, error: quota.error, resetAt: quota.resetAt, actorEmail };
    }
    return { ok: false, status: 401, error: "Unauthorized", actorEmail };
  }
  return { ok: true, actorEmail };
}

async function adminSessionStatus(request, env) {
  if (!env.WAITLIST_DB) return { ok: false };
  const token = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (!token) return { ok: false };
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT actor_email, expires_at, revoked_at
     FROM admin_sessions
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();
  if (!row?.actor_email || row.revoked_at || row.expires_at <= now) return { ok: false };
  await env.WAITLIST_DB.prepare(`UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?`)
    .bind(now, tokenHash)
    .run();
  return { ok: true, actorEmail: row.actor_email };
}

function adminDeniedJson(admin) {
  return jsonNoStore(
    {
      error: admin.error || "Unauthorized",
      ...(admin.resetAt ? { resetAt: admin.resetAt } : {})
    },
    admin.status || 401
  );
}

async function logAdminAction(request, env, action, success, actorEmail = "", detail = "") {
  if (!env.WAITLIST_DB) return;
  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO admin_audit_log
        (id, action, success, actor_email, ip_hash, user_agent, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        cleanText(action, 80),
        success ? 1 : 0,
        cleanText(actorEmail, 254),
        await requestIpHash(request),
        cleanText(request.headers.get("user-agent") || "", 500),
        cleanText(detail, 500),
        new Date().toISOString()
      )
      .run();
  } catch {
    // Admin logging must not break the protected action itself.
  }
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

async function countRows(env, table, where = "", bindings = []) {
  const sql = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  const statement = env.WAITLIST_DB.prepare(sql);
  const row = bindings.length ? await statement.bind(...bindings).first() : await statement.first();
  return Number(row?.count || 0);
}

function summarizeIssuePatterns(rows) {
  const counts = new Map();
  for (const row of rows) {
    const report = parseJson(row.report_json, {});
    for (const finding of report.findings || []) {
      if (finding.severity === "good") continue;
      const key = issuePatternKey(finding.title || "Unknown issue");
      const current = counts.get(key) || {
        title: key,
        count: 0,
        critical: 0,
        warnings: 0,
        notices: 0
      };
      current.count += 1;
      if (finding.severity === "critical") current.critical += 1;
      if (finding.severity === "warning") current.warnings += 1;
      if (finding.severity === "notice") current.notices += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

function issuePatternKey(title) {
  return String(title || "Unknown issue")
    .replace(/\son\s(home|\/[^\s]+)/i, "")
    .replace(/\sneeds cleanup.*/i, " needs cleanup")
    .trim();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

async function createBetaSession(request, env, access) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = isoSecondsFromNow(BETA_SESSION_TTL_SECONDS);
  const ipHash = await requestIpHash(request);
  const userAgent = cleanText(request.headers.get("user-agent") || "", 500);

  await env.WAITLIST_DB.prepare(
    `INSERT INTO beta_sessions
      (token_hash, owner_email, created_at, expires_at, last_seen_at, ip_hash, user_agent, invite_id, access_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      tokenHash,
      access.ownerEmail,
      now,
      expiresAt,
      now,
      ipHash,
      userAgent,
      access.inviteId || null,
      cleanAccessMode(access.accessMode)
    )
    .run();

  return {
    expiresAt,
    cookie: sessionCookie(request, token, BETA_SESSION_TTL_SECONDS)
  };
}

function betaSessionTokenFromRequest(request) {
  const headerToken = request.headers.get("x-beta-session") || "";
  if (headerToken) return headerToken.trim();
  return cookieValue(request, SESSION_COOKIE);
}

function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(request) {
  const secure = request && new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function adminSessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearAdminSessionCookie(request) {
  const secure = request && new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("=") || "");
    }
  }
  return "";
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestIpHash(request) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return (await sha256Hex(ip)).slice(0, 32);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || ""))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hourWindow(now) {
  const resetAt = new Date(now);
  resetAt.setUTCMinutes(0, 0, 0);
  resetAt.setUTCHours(resetAt.getUTCHours() + 1);
  return {
    key: now.toISOString().slice(0, 13),
    resetAt
  };
}

function dayWindow(now) {
  const resetAt = new Date(now);
  resetAt.setUTCHours(0, 0, 0, 0);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);
  return {
    key: now.toISOString().slice(0, 10),
    resetAt
  };
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

async function cleanupExpiredRows(env) {
  const now = new Date().toISOString();
  await env.WAITLIST_DB.batch([
    env.WAITLIST_DB.prepare(
      `DELETE FROM audit_reports
       WHERE expires_at IS NOT NULL AND expires_at < ?
         AND id NOT IN (
           SELECT report_id FROM fix_requests
           WHERE report_id IS NOT NULL AND report_id != ''
             AND status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
           UNION
           SELECT final_report_id FROM fix_requests
           WHERE final_report_id IS NOT NULL AND final_report_id != ''
             AND status IN ('paid', 'in_progress', 'delivered', 'refunded', 'refund_failed', 'disputed')
         )`
    ).bind(now),
    env.WAITLIST_DB.prepare(`DELETE FROM audit_jobs WHERE expires_at IS NOT NULL AND expires_at < ?`).bind(now),
    env.WAITLIST_DB.prepare(`DELETE FROM access_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)`).bind(now, isoSecondsFromNow(-24 * 60 * 60)),
    env.WAITLIST_DB.prepare(`DELETE FROM beta_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).bind(now, isoSecondsFromNow(-24 * 60 * 60)),
    env.WAITLIST_DB.prepare(`DELETE FROM admin_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).bind(now, isoSecondsFromNow(-24 * 60 * 60)),
    env.WAITLIST_DB.prepare(`DELETE FROM audit_usage WHERE updated_at < ?`).bind(isoSecondsFromNow(-7 * 24 * 60 * 60))
  ]);
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

function makePrivateReportId(url) {
  const host = new URL(url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42)
    .toLowerCase();
  return `${host || "report"}-${crypto.randomUUID()}`;
}

function isSafeReportId(value) {
  return /^[a-z0-9][a-z0-9.-]{12,120}$/i.test(value);
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ""));
  const rightBytes = new TextEncoder().encode(String(right || ""));
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return maxLength > 0 && diff === 0;
}

function csvCell(value) {
  let text = String(value ?? "");
  // Neutralize spreadsheet formula triggers in attacker-supplied fields
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function stripHash(value) {
  const url = new URL(value);
  url.hash = "";
  return url.href.replace(/\/$/, url.pathname === "/" ? "/" : "");
}

function pathLabel(url, startUrl) {
  const parsed = new URL(url);
  if (stripHash(url) === stripHash(startUrl)) return "home";
  return parsed.pathname || "page";
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;"
  };
  return String(value || "").replace(/[&"<>]/g, (character) => entities[character]);
}

function suggestTitle(url, facts) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const firstH1 = facts.h1s?.[0];
  return trimSentence(firstH1 || `${host} page`, 58);
}

function suggestDescription(facts = {}) {
  const base =
    facts.bodySample ||
    facts.title ||
    "Clear page summary that explains the offer, audience, and next action.";
  return trimSentence(base.replace(/\s+/g, " "), 150);
}

function trimSentence(value, max) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}...`;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: secureHeaders({ "content-type": "application/json; charset=utf-8" })
  });
}

function jsonNoStore(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: secureHeaders({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-robots-tag": "noindex, nofollow"
    })
  });
}

function withPrivateHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow");
  return withSecurityHeaders(new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  }));
}

function withSecurityHeaders(response) {
  const headers = secureHeaders(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function secureHeaders(input = {}) {
  const headers = new Headers(input);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("x-frame-options", "DENY");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  if ((headers.get("content-type") || "").includes("text/html")) {
    headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' https://cloudflareinsights.com",
        "form-action 'self' https://live.dodopayments.com https://test.dodopayments.com",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join("; ")
    );
  }
  return headers;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderedFixture(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Proof Demo App Shell</title>
    <meta name="description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
    <link rel="canonical" href="${origin}/fixture/rendered-page" />
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
        </main>
      \`;
    </script>
  </body>
</html>`;
}

function llmsText(origin) {
  return `# SEO Fix Kit

SEO Fix Kit is a private-beta, self-serve SEO audit and paid Fix Pack workflow.

Live product claims:
- Visitors can request a secure email access link.
- Verified sessions can run rate-limited private audits and save owner-only reports.
- Verified sessions can choose self-serve crawl depth up to 1,000 pages per queued audit.
- Reports include robots.txt and sitemap crawl inventory up to 50,000 discovered URLs.
- Large rendered crawl jobs (staged 50,000-page plans) are early access: they store frontier, batch, retry, proof, and merge-readiness state, and batches render gradually in the background over days to weeks.
- Reports include rendered crawl intelligence for internal link depth, low-inbound pages, sitemap-sample orphan candidates, duplicate metadata/content, parameterized URLs, and keyword-cannibalization heuristics.
- Saved reruns include audit-history deltas for fixed, new, and still-open proven issues.
- Reports include rendered browser resource-waterfall proof with slow, heavy, and render-blocking repair actions.
- Verified sessions can import backlink rows for live/lost link proof, repair actions, and import-backed link-edge history.
- Verified sessions can supply local business details, keywords, and citation URLs for local SEO proof and repair actions.
- Verified sessions can import Search Console or rank-tracker keyword rows for low-CTR, page-two, decline, cannibalization, intent-match, uncrawled landing-page repair actions, and rank observation history.
- Reports include rendered WordPress and ecommerce platform proof for Product schema, breadcrumbs, faceted links, archives, and plugin resource impact.
- Dodo is the source of truth for visible Fix Pack pricing and checkout.
- Paid Fix Pack fulfillment includes status, delivery notes, and one rerun after fixes.

Current product boundary:
- Does not sell or claim completed 50,000-page rendered validation; large crawls are early-access staged plans until every batch has page-level proof and merge readiness is clear.
- 100,000+ enterprise rendered crawls and browser-container fleet autoscaling are not live yet.
- Does not provide full-site rank, index, or orphan discovery beyond rendered crawl proof and sitemap inventory samples.
- Does not provide proprietary backlink discovery beyond supplied/imported link-edge history.
- Does not provide live keyword volume providers, traffic estimates, or continuous rank tracking yet.
- Does not scrape private Google Business Profile data or discover every citation automatically.
- Does not log into WordPress, Shopify, WooCommerce, Magento, or private CMS/plugin admin settings.
- Does not replace Ahrefs or Semrush.
- Does not provide anonymous public audits.
- Does not guarantee rankings, traffic, indexing, or revenue.

Useful routes:
- ${origin}/
- ${origin}/api/health
- ${origin}/llms.txt
- ${origin}/privacy
- ${origin}/support
- ${origin}/terms
- ${origin}/demo
`;
}

function homeMarkdown(origin) {
  return `# SEO Fix Kit

Proof-backed SEO audits and paid repair queue.

Request a secure email access link to run a rate-limited private audit. The paid Fix Pack is one proof-backed repair pass for one report plus one rerun after fixes. No ranking promise is made.

Start at ${origin}/.
`;
}

function demoHtml(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SEO Fix Kit Demo - Proof-Backed SEO Repair</title>
    <meta name="description" content="A public sample showing how SEO Fix Kit refuses static crawler false positives and turns verified issues into repair briefs." />
    <link rel="canonical" href="${origin}/demo" />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      body { margin: 0; min-width: 320px; }
      main { margin: 0 auto; max-width: 980px; padding: 36px 22px 60px; }
      a { color: #98f0cc; font-weight: 780; text-decoration: none; }
      header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 54px; }
      h1 { font-size: clamp(44px, 9vw, 104px); letter-spacing: 0; line-height: .9; margin: 0 0 18px; max-width: 780px; }
      h2 { font-size: clamp(24px, 3vw, 34px); margin: 0; }
      p, li { color: rgba(251,248,239,.75); font-size: 18px; line-height: 1.6; }
      .kicker { color: #98f0cc; font-size: 13px; font-weight: 880; letter-spacing: .08em; text-transform: uppercase; }
      .grid { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 34px 0; }
      .panel { background: rgba(251,248,239,.055); border: 1px solid rgba(251,248,239,.12); border-radius: 8px; padding: 20px; }
      .panel strong { color: #dcc062; display: block; font-size: 14px; margin-bottom: 10px; text-transform: uppercase; }
      .proof { border-color: rgba(152,240,204,.28); }
      .proof strong { color: #98f0cc; }
      .cta { align-items: center; background: #98f0cc; border-radius: 8px; color: #06100c; display: inline-flex; font-weight: 880; min-height: 48px; padding: 0 18px; }
      code { color: #fbf8ef; white-space: pre-wrap; }
      @media (max-width: 760px) { header { align-items: flex-start; gap: 18px; flex-direction: column; } .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <a href="${origin}/">SEO Fix Kit</a>
        <span class="kicker">Public sample</span>
      </header>
      <section>
        <p class="kicker">Proof loop</p>
        <h1>Do not fix what is not broken.</h1>
        <p>Weak SEO scanners read the raw app shell and invent work. SEO Fix Kit compares raw HTML with the rendered page, shows the proof, and only creates a repair when the browser-visible page is actually wrong.</p>
      </section>
      <section class="grid" aria-label="Sample audit outcome">
        <article class="panel">
          <strong>Static scanner</strong>
          <p>No H1. No internal links. Thin content. Needs cleanup.</p>
        </article>
        <article class="panel proof">
          <strong>Rendered proof</strong>
          <p>Browser render shows a real H1, normal internal links, and substantial page content.</p>
        </article>
        <article class="panel">
          <strong>Repair brief</strong>
          <p>No duplicate H1. No fake internal links. No busywork. Keep monitoring and rerun after real content changes.</p>
        </article>
      </section>
      <section class="panel proof">
        <h2>Sample developer brief</h2>
        <p>The paid beta turns verified findings into a repair queue with acceptance checks and one rerun after fixes.</p>
        <code>- Finding: False positive guarded. H1 exists after render.
- Evidence: Rendered H1 is visible in the final DOM.
- Action: Do not add another H1.
- Acceptance: Re-run audit; finding stays guarded, not queued as a fix.</code>
      </section>
      <p><a class="cta" href="${origin}/">Join waitlist</a></p>
    </main>
  </body>
</html>`;
}

function privacyHtml(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy - SEO Fix Kit</title>
    <meta name="description" content="SEO Fix Kit privacy note for waitlist, private beta audits, payments, and fulfillment." />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      body { margin: 0; min-width: 320px; }
      main { margin: 0 auto; max-width: 760px; padding: 48px 22px; }
      a { color: #98f0cc; font-weight: 760; text-decoration: none; }
      h1 { font-size: clamp(42px, 8vw, 76px); letter-spacing: 0; line-height: .92; margin: 0 0 24px; }
      p, li { color: rgba(251,248,239,.76); font-size: 18px; line-height: 1.62; }
      ul { padding-left: 22px; }
    </style>
  </head>
  <body>
    <main>
      <a href="${origin}/">SEO Fix Kit</a>
      <h1>Privacy</h1>
      <p>SEO Fix Kit collects the information needed to run self-serve access, create proof-backed SEO reports, process paid Fix Pack checkout, and deliver repair updates.</p>
      <ul>
        <li>We store your email address, signup source, UTM fields, landing path, referrer, browser user agent, country code when Cloudflare provides it, signup timestamps, and short-lived access-link records.</li>
        <li>Private audits store the website URL, rendered-page audit findings, screenshots or extracted page facts when available, report owner, beta session reference, target host, and report expiry timestamp.</li>
        <li>Fix Pack records store checkout status, Dodo payment identifiers, payment amount and currency, fulfillment notes, final rerun report links, delivery notifications, and admin audit events.</li>
        <li>Cloudflare hosts the app and database. Dodo processes checkout and payment webhooks. Cloudflare Email Service sends access, payment, delivery, and ops emails.</li>
        <li>Reports are retained for 30 days, except reports tied to a paid Fix Pack, which stay available while we operate the service. Admin logs, payment records, and notification logs are kept for operating, support, abuse prevention, and payment reconciliation.</li>
        <li>We do not sell your email address.</li>
        <li>We do not send unrelated promotions.</li>
        <li>To request deletion of beta data, email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> or reply to any email we send.</li>
      </ul>
      <p>Last updated: June 11, 2026.</p>
    </main>
  </body>
</html>`;
}

function supportHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Support",
    description: "SEO Fix Kit support, refunds, and repair delivery notes.",
    body: `
      <p>Email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> for any question, billing issue, or problem — including when an expected email never arrived. You can also reply to any SEO Fix Kit email; we use that thread to verify account ownership.</p>
      <ul>
        <li>Fix Pack covers one proof-backed repair pass for one report plus one rerun after fixes.</li>
        <li>No ranking, traffic, or revenue promise is made.</li>
        <li>If payment succeeds but the repair queue cannot start, ask for support from the payment confirmation email.</li>
        <li>Refunds are reviewed against the Dodo payment record, report proof, and fulfillment state.</li>
        <li>Security or abuse reports should include the affected URL, account email, and timestamp.</li>
      </ul>
      <p><a href="${origin}/privacy">Privacy</a> · <a href="${origin}/terms">Terms</a></p>
    `
  });
}

function termsHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Terms",
    description: "SEO Fix Kit product terms for audits, Fix Pack checkout, and fulfillment.",
    body: `
      <p>SEO Fix Kit provides proof-backed SEO audits and a paid Fix Pack repair queue. Use the product only for sites you own or are authorized to audit.</p>
      <ul>
        <li>Self-serve audits are rate-limited and may be paused for abuse, excessive load, or unsupported sites.</li>
        <li>Reports are diagnostic and may miss issues outside the crawl/render scope.</li>
        <li>The paid Fix Pack is a repair service for proven findings in one report plus one rerun after fixes.</li>
        <li>Checkout, payment status, refunds, and disputes are processed through Dodo.</li>
        <li>No ranking, indexing, traffic, revenue, or search-engine outcome is guaranteed.</li>
        <li>Questions about these terms or your account: <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</li>
      </ul>
      <p><a href="${origin}/privacy">Privacy</a> · <a href="${origin}/support">Support</a></p>
    `
  });
}

function policyPageHtml({ origin, title, description, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - SEO Fix Kit</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      body { margin: 0; min-width: 320px; }
      main { margin: 0 auto; max-width: 760px; padding: 48px 22px; }
      a { color: #98f0cc; font-weight: 760; text-decoration: none; }
      h1 { font-size: clamp(42px, 8vw, 76px); letter-spacing: 0; line-height: .92; margin: 0 0 24px; }
      p, li { color: rgba(251,248,239,.76); font-size: 18px; line-height: 1.62; }
      ul { padding-left: 22px; }
    </style>
  </head>
  <body>
    <main>
      <a href="${origin}/">SEO Fix Kit</a>
      <h1>${escapeHtml(title)}</h1>
      ${body}
      <p>Last updated: May 21, 2026.</p>
    </main>
  </body>
</html>`;
}

function rootSitemap(origin) {
  const urls = ["/", "/demo", "/privacy", "/support", "/terms", "/llms.txt"];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((path) => `<url><loc>${origin}${path}</loc></url>`)
    .join("")}</urlset>`;
}
