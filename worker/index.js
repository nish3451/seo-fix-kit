import { isEmailConfigured } from "../shared/fulfillment.js";
import { VERSION, rootSitemap } from "../shared/audit-engine.js";
import { indexNowKeyFileBody, indexNowKeyFilePaths } from "../shared/index-now.js";
import {
  createAdminBetaSession,
  createInvite,
  exportLeadsCsv,
  getAdminSummary,
  sendDailyOpsDigest,
  sendUrgentOpsAlerts,
  updateFixRequestAdmin
} from "./routes/admin.js";
import { getAccountSummary } from "./routes/account.js";
import {
  json,
  secureHeaders,
  withPrivateHeaders,
  withSecurityHeaders
} from "./lib/http.js";
import { getDeepHealth } from "./routes/health.js";
import { isSafeUuid } from "./lib/text.js";
import { createAdminSession, revokeAdminSession } from "./lib/auth.js";
import { cleanupExpiredRows } from "./lib/db.js";
import {
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  packagesHtml,
  privacyHtml,
  supportHtml,
  termsHtml
} from "./routes/pages.js";
import { checkHtml, runPublicCheck } from "./routes/public-check.js";
import {
  betaLogin,
  betaLogout,
  betaSession,
  createSiteClaim,
  joinWaitlist,
  listSiteClaims,
  requestAccessLink,
  verifyAccessLink,
  verifySiteClaim
} from "./routes/access.js";
import {
  createTeamMember,
  getReportCollaboration,
  getSavedReport,
  getTeamMembers,
  revokeTeamMember,
  saveReportCollaboration,
  updateRepairProposalApproval
} from "./routes/reports.js";
import {
  createRepairAction,
  getRepairActionImplementationPack,
  getRepairActionProofReceipt,
  getRepairQueue,
  saveRepairQueue,
  updateRepairAction
} from "./routes/repair-agent.js";
import {
  createAuditSchedule,
  deleteAuditSchedule,
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
  apiCreateRepairAction,
  apiDeleteAudit,
  apiGetAudit,
  apiGetAuditIssues,
  apiGetAuditReport,
  apiGetRepairActionImplementationPack,
  apiGetRepairActionProofReceipt,
  apiGetRepairQueue,
  apiSaveRepairQueue,
  apiUpdateRepairAction,
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
  getBillingSummary,
  getFixPackPricingPreview,
  getPublicFixPackPricing,
  handleDodoWebhook,
  requestFixPack,
  requestMonitoringCheckout
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

// Canonical host: `www.seofixkit.com` is a serving alias that 301-redirects
// onto the apex host, and every URL the Worker emits (page canonicals, social
// tags, robots.txt, sitemap.xml, llms.txt, fixture URLs) is generated from the
// apex origin. This keeps canonicals, robots, and sitemap apex-only no matter
// which hostname carried the request, while the redirect converges crawlers
// and visitors on one host.
const CANONICAL_HOST = "seofixkit.com";
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

function canonicalOrigin(url) {
  const hostname = url.hostname.toLowerCase();
  return hostname === CANONICAL_HOST || hostname === `www.${CANONICAL_HOST}`
    ? CANONICAL_ORIGIN
    : url.origin;
}

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

    // Canonical host: permanently redirect every www.seofixkit.com request
    // onto the apex host with its path and query intact before any route
    // logic runs, so no content or API response is ever served from www.
    if (url.hostname.toLowerCase() === `www.${CANONICAL_HOST}`) {
      return new Response(null, {
        status: 301,
        headers: secureHeaders({ Location: `${CANONICAL_ORIGIN}${url.pathname}${url.search}` })
      });
    }

    const origin = canonicalOrigin(url);

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

      if (url.pathname === "/api/deep-health") {
        return getDeepHealth(request, env);
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

      if (url.pathname === "/api/beta/monitoring-checkout" && request.method === "POST") {
        return requestMonitoringCheckout(request, env);
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

      if (url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/repair-queue") && request.method === "GET") {
        return getRepairQueue(request, env);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/repair-queue") && request.method === "PATCH") {
        return saveRepairQueue(request, env);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/repair-actions") && request.method === "POST") {
        return createRepairAction(request, env, ctx);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.includes("/repair-actions/") && url.pathname.endsWith("/implementation.md") && request.method === "GET") {
        return getRepairActionImplementationPack(request, env, ctx);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.includes("/repair-actions/") && url.pathname.endsWith("/proof.md") && request.method === "GET") {
        return getRepairActionProofReceipt(request, env, ctx);
      }

      if (url.pathname.startsWith("/api/reports/") && url.pathname.includes("/repair-actions/") && request.method === "PATCH") {
        return updateRepairAction(request, env, ctx);
      }

      if (url.pathname.includes("/repair-proposals/") && request.method === "PATCH") {
        return updateRepairProposalApproval(request, env);
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

      if (url.pathname.startsWith("/v1/audits/") && url.pathname.endsWith("/repair-queue") && request.method === "GET") {
        return apiGetRepairQueue(request, env);
      }

      if (url.pathname.startsWith("/v1/audits/") && url.pathname.endsWith("/repair-queue") && request.method === "PATCH") {
        return apiSaveRepairQueue(request, env);
      }

      if (url.pathname.startsWith("/v1/audits/") && url.pathname.endsWith("/repair-actions") && request.method === "POST") {
        return apiCreateRepairAction(request, env, ctx);
      }

      if (url.pathname.startsWith("/v1/audits/") && url.pathname.includes("/repair-actions/") && url.pathname.endsWith("/implementation.md") && request.method === "GET") {
        return apiGetRepairActionImplementationPack(request, env);
      }

      if (url.pathname.startsWith("/v1/audits/") && url.pathname.includes("/repair-actions/") && url.pathname.endsWith("/proof.md") && request.method === "GET") {
        return apiGetRepairActionProofReceipt(request, env);
      }

      if (url.pathname.startsWith("/v1/audits/") && url.pathname.includes("/repair-actions/") && request.method === "PATCH") {
        return apiUpdateRepairAction(request, env, ctx);
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

      if (url.pathname === "/admin/beta-session" && request.method === "POST") {
        return createAdminBetaSession(request, env);
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

      if (url.pathname === "/api/public-check" && request.method === "POST") {
        return runPublicCheck(request, env);
      }

      if (url.pathname === "/fixture/rendered-page") {
        return new Response(renderedFixture(origin), {
          headers: secureHeaders({
            "content-type": "text/html; charset=utf-8",
            "x-robots-tag": "noindex, nofollow"
          })
        });
      }

      if (url.pathname === "/fixture/robots.txt") {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/fixture/sitemap.xml\n`, {
          headers: secureHeaders({ "content-type": "text/plain; charset=utf-8" })
        });
      }

      if (url.pathname === "/fixture/sitemap.xml") {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/fixture/rendered-page</loc></url></urlset>`,
          { headers: secureHeaders({ "content-type": "application/xml; charset=utf-8" }) }
        );
      }

      if (url.pathname === "/robots.txt") {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, {
          headers: secureHeaders({ "content-type": "text/plain; charset=utf-8" })
        });
      }

      // IndexNow key file: served at both the spec root and the .well-known
      // alias so Bing/Naver/Seznam/Yandex can validate the submission key
      // without any account credentials. Both paths are in wrangler.jsonc
      // run_worker_first so the SPA asset fallback never shadows them.
      for (const keyPath of indexNowKeyFilePaths()) {
        if (url.pathname === keyPath) {
          return new Response(indexNowKeyFileBody(), {
            headers: secureHeaders({
              "content-type": "text/plain; charset=utf-8",
              "x-robots-tag": "noindex, nofollow"
            })
          });
        }
      }

      if (url.pathname === "/sitemap.xml") {
        return new Response(rootSitemap(origin), {
          headers: secureHeaders({ "content-type": "application/xml; charset=utf-8" })
        });
      }

      if (url.pathname === "/llms.txt") {
        return new Response(llmsText(origin), {
          headers: secureHeaders({ "content-type": "text/plain; charset=utf-8" })
        });
      }

      if (url.pathname === "/privacy") {
        return new Response(privacyHtml(origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/support") {
        return new Response(supportHtml(origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/terms") {
        return new Response(termsHtml(origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/demo") {
        return new Response(demoHtml(origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/check") {
        return new Response(checkHtml(origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/methodology") {
        return new Response(methodologyHtml(origin), {
          headers: secureHeaders({ "content-type": "text/html; charset=utf-8" })
        });
      }

      if (url.pathname === "/packages") {
        return new Response(packagesHtml(origin), {
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
        return new Response(homeMarkdown(origin), {
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
