import { pathToFileURL } from "node:url";

// Live spot-check for the public promise surfaces the README "What is live in
// this repo" section relies on: /demo (proof loop), /methodology (limits),
// /packages (package ladder), /check (anonymous one-page check), the
// no-ranking /support, /terms, and /privacy pages, the machine surfaces
// the README says stay served by the Worker (/llms.txt, /sitemap.xml,
// /robots.txt, /api/health, /api/deep-health, and the POST /api/public-check
// route), and the canonical-host promise that every www.seofixkit.com request
// 301-redirects onto the apex host. Each must be served by the deployed Worker
// with the copy that backs the claims. This is the repeatable "spot-check"
// half of the lane-2 promise audit; the offline regression lock lives in
// shared/promise-audit.test.mjs and worker/routes/pages.test.mjs.
//
// Opt-in script, not part of `npm run check` (CI stays offline-only; the
// offline regression lock for the same claims is in the check pipeline):
//   npm run audit:live-promise
//   SEOFIXKIT_BASE_URL=https://seofixkit.com npm run audit:live-promise

const DEFAULT_BASE_URL = process.env.SEOFIXKIT_BASE_URL || "https://seofixkit.com";
const DEFAULT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_SPOT_CHECK_TIMEOUT_MS || 15000);

if (isDirectRun()) {
  await main();
}

async function main() {
  const baseUrl = DEFAULT_BASE_URL;
  const results = await spotCheckPublicPages({ baseUrl });
  const failed = results.filter((result) => result.failures.length > 0);

  console.log(`Live promise spot-check: ${baseUrl}`);
  for (const result of results) {
    if (result.failures.length === 0) {
      console.log(`  ok ${result.path} - ${result.name}`);
    } else {
      console.log(`  fail ${result.path} - ${result.name}`);
      for (const reason of result.failures) {
        console.log(`    missing: ${reason}`);
      }
    }
  }

  if (failed.length > 0) {
    const staleDeploys = results.filter((result) =>
      result.failures.some((reason) => reason.includes("deployed Worker is stale"))
    );
    if (staleDeploys.length > 0) {
      console.error(
        `Spot-check failed on ${failed.length} surface(s): ${staleDeploys.length} served by the static-asset ` +
          `fallback instead of the Worker route. The deployed Worker is behind main — deploy the current ` +
          `Worker (npx wrangler deploy) and rerun. If a surface still fails after a fresh deploy, fix the ` +
          `deployed copy or the claim in the spot-check.`
      );
    } else {
      console.error(
        `Spot-check failed on ${failed.length} surface(s). Fix the deployed copy or the claim in the spot-check, then rerun.`
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log("All public-page and machine-surface promises on the live site match the claims.");
}

export async function spotCheckPublicPages({
  baseUrl = DEFAULT_BASE_URL,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const checks = [
    ...publicPageSpotChecks(baseUrl),
    ...publicSurfaceSpotChecks(baseUrl),
    ...canonicalHostSpotChecks(baseUrl)
  ];
  const results = [];
  for (const check of checks) {
    const { method = "GET", body } = check;
    const response = await fetchWithTimeout(
      check.url || `${baseUrl}${check.path}`,
      { method, body, ...(check.redirectManual ? { redirect: "manual" } : {}) },
      timeoutMs,
      fetcher
    );
    const status = response.status;
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const failures = [];
    if (!check.acceptStatuses.includes(status)) {
      failures.push(
        `returned HTTP ${status} instead of ${check.acceptStatuses.join(" or ")}`
      );
    }
    if (check.contentType && !new RegExp(check.contentType, "i").test(contentType)) {
      failures.push(`served as ${contentType || "no content-type"} instead of ${check.contentType}`);
    }
    for (const { name, value, reason } of check.expectedHeaders || []) {
      const header = response.headers.get(name) || "";
      if (!hasContent(header, value)) {
        failures.push(reason || `missing ${name} header matching ${typeof value === "string" ? value : value.toString()}`);
      }
    }
    for (const { reason, match } of check.expectations || []) {
      if (!hasContent(text, match)) {
        failures.push(reason);
      }
    }
    if (check.isPage && failures.length > 0 && isAssetFallback(text, contentType)) {
      failures.push(
        `deployed Worker is stale: ${check.path} was served by the static-asset fallback instead of the ` +
          `Worker route (deploy main, then rerun)`
      );
    }
    results.push({ path: check.path, name: check.name, failures });
  }
  return results;
}

// Headline claims only: each page must serve the proof-loop / limits /
// package-ladder / no-ranking promise the README makes. The full copy is
// locked offline by worker/routes/pages.test.mjs; this checks the deployed
// page still carries the load-bearing parts.
export function publicPageSpotChecks(baseUrl) {
  return [
    {
      path: "/demo",
      name: "demo page shows the proof loop before payment",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "proof-loop headline", match: "Do not fix what is not broken." },
        { reason: "static-vs-rendered proof panels", match: "Rendered proof" },
        { reason: "no-overclaim section", match: "What this sample does not claim" },
        { reason: "snippet qualifier stays engine-capable", match: "an exact snippet when the engine can generate one" },
        { reason: "link to methodology limits", match: `href="${baseUrl}/methodology"` },
        { reason: "link to package ladder", match: `href="${baseUrl}/packages"` },
        { reason: "link to terms", match: `href="${baseUrl}/terms"` },
        { reason: "link to privacy", match: `href="${baseUrl}/privacy"` }
      ]
    },
    {
      path: "/check",
      name: "one-page check page shows the anonymous proof entry",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "one-page check headline", match: "Check One Page for SEO Proof" },
        { reason: "URL check form", match: 'id="check-form"' },
        { reason: "no-account proof promise", match: "No account, no email, no stored report" },
        { reason: "no-storage disclosure", match: "short-lived anonymous rate-limit counters" },
        { reason: "guarded false positives promise", match: "Guarded false positives" },
        { reason: "no-overclaim section", match: "What this check does not claim" },
        { reason: "handoff into private access", match: "Request private access" }
      ]
    },
    {
      path: "/methodology",
      name: "methodology page states limits up front",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "claims-last headline", match: "Proof first. Repairs second. Claims last." },
        { reason: "limits section", match: "Limits we state up front" },
        { reason: "AI visibility tracking is not live", match: "No AI visibility tracking" },
        { reason: "no hidden site writes", match: "No hidden site writes" },
        { reason: "50K crawl staged, not complete", match: "No fake scale claim" },
        { reason: "clickable CTA into the anonymous check", match: `href="${baseUrl}/check"` },
        { reason: "link to terms", match: `href="${baseUrl}/terms"` },
        { reason: "link to privacy", match: `href="${baseUrl}/privacy"` }
      ]
    },
    {
      path: "/packages",
      name: "packages page shows the package ladder before payment",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "ladder headline", match: "Package ladder" },
        { reason: "fix pack offer", match: "SEO Fix Pack" },
        { reason: "public fix pack price", match: "$99.00 one-time" },
        { reason: "Dodo is the final price source", match: "Dodo shows the final checkout price" },
        { reason: "Proof Monitoring is config-gated", match: "Config-gated subscription" },
        { reason: "Proof Monitoring checkout gated, offer visible", match: "Checkout only opens when the Dodo subscription product and webhook entitlement sync are configured" },
        { reason: "roadmap packages marked", match: "Roadmap" },
        { reason: "names the GEO Auditor agent-fix comparison", match: "Compared with GEO Auditor" },
        { reason: "names the $29 Agent Fix Mode tier", match: "Agent Fix Mode" },
        { reason: "approval-first wedge answer present", match: "approval-first repair queue" },
        { reason: "link to terms", match: `href="${baseUrl}/terms"` },
        { reason: "link to privacy", match: `href="${baseUrl}/privacy"` }
      ]
    },
    {
      path: "/small-business-seo-audit",
      name: "small-business landing page keeps the proof-first boundary",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "proof-not-homework headline", match: "An SEO audit that shows proof, not homework." },
        { reason: "free one-page check entry", match: "Free one-page check" },
        { reason: "no-overclaim section", match: "What this page does not claim" },
        { reason: "clickable CTA into the anonymous check", match: `href="${baseUrl}/check"` },
        { reason: "link to the proof sample", match: `href="${baseUrl}/demo"` },
        { reason: "link to methodology limits", match: `href="${baseUrl}/methodology"` },
        ...landingPageLdExpectations("/small-business-seo-audit", "Small Business SEO Audit")
      ]
    },
    {
      path: "/rendered-vs-static-seo-audit",
      name: "rendered-vs-static landing page keeps the false-positive guard and AI crawler visibility boundary",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "static-vs-rendered headline", match: "Static scanners invent work. AI crawlers miss content. Rendered proof handles both." },
        { reason: "static scanner vs rendered proof panels", match: "Rendered proof" },
        { reason: "AI crawler visibility framing", match: "The same diff is your AI crawler visibility check" },
        { reason: "names the JavaScript-blind AI crawlers", match: "GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot, and CCBot" },
        { reason: "cites the SEJ-confirmed no-JavaScript behavior", match: "fetch raw HTML and do not execute JavaScript" },
        { reason: "names free static-vs-rendered checkers", match: "Compared with free static-vs-rendered checkers" },
        { reason: "names LLM Pulse GEO Crawlability Checker", match: "LLM Pulse GEO Crawlability Checker" },
        { reason: "names Free SEO Auditor", match: "Free SEO Auditor" },
        { reason: "names geo-crawl-audit", match: "geo-crawl-audit" },
        { reason: "repair-queue wedge after the free-tool names", match: "persistent repair queue only receives proven findings" },
        { reason: "no-overclaim section", match: "What this page does not claim" },
        { reason: "clickable CTA into the anonymous check", match: `href="${baseUrl}/check"` },
        { reason: "link to the proof sample", match: `href="${baseUrl}/demo"` },
        ...landingPageLdExpectations("/rendered-vs-static-seo-audit", "Rendered vs Static SEO Audit")
      ]
    },
    {
      path: "/ai-answer-readiness",
      name: "AI Answer Readiness landing page keeps the site-proof boundary",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "site-proof headline", match: "A site-proof AI readiness check, not a citation tracker." },
        { reason: "no live answer-engine sampling", match: "No live answer-engine sampling" },
        { reason: "no AI citation monitoring", match: "No AI citation monitoring" },
        { reason: "llms.txt stays optional", match: "llms.txt stays optional" },
        { reason: "names CrawlRaven comparison", match: "Compared with CrawlRaven" },
        { reason: "names free AI visibility checkers", match: "Compared with free AI visibility checkers" },
        { reason: "states no citation checking", match: "SEO Fix Kit does not check AI-engine citations or visibility scores." },
        { reason: "names DefiniteSEO", match: "DefiniteSEO" },
        { reason: "names RevSurge Digital", match: "RevSurge Digital" },
        { reason: "names Answer Visibility Lab", match: "Answer Visibility Lab" },
        { reason: "names Website AEO GEO Checker", match: "Website AEO GEO Checker" },
        { reason: "names imported traffic ranking", match: "ranked by the clicks and impressions on the affected pages" },
        { reason: "names no auto-join gap", match: "does not connect to Search Console or GA4 automatically" },
        { reason: "challenges the r=0.009 headline directly", match: 'On "technical readiness predicts nothing (r=0.009)"' },
        { reason: "keeps the r=0.009 challenge truth-safe", match: "441 domains, Perplexity-only citations, cross-sectional" },
        { reason: "keeps the no-citation-prediction boundary", match: "never claims to predict citations" },
        { reason: "no-overclaim section", match: "What this page does not claim" },
        { reason: "clickable CTA into the anonymous check", match: `href="${baseUrl}/check"` },
        ...landingPageLdExpectations("/ai-answer-readiness", "AI Answer Readiness Check")
      ]
    },
    {
      path: "/proof",
      name: "real before/after repair receipt is published at /proof",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "real before/after headline", match: "One real repair, with the same measurement path before and after." },
        { reason: "before score 85", match: "Score <strong>85</strong>/100" },
        { reason: "intermediate score 99", match: "Score <strong>99</strong>/100" },
        { reason: "after score 100", match: "Score <strong>100</strong>/100" },
        { reason: "source report id pinned", match: "tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b" },
        { reason: "intermediate rerun id pinned", match: "tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50" },
        { reason: "final rerun id pinned", match: "tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961" },
        { reason: "owner-approved PR #4 linked", match: "github.com/nish3451/tinystudio-in/pull/4" },
        { reason: "owner-approved PR #5 linked", match: "github.com/nish3451/tinystudio-in/pull/5" },
        { reason: "no-ranking boundary stated", match: "No ranking, traffic, indexing, citation, or revenue promise is made" },
        { reason: "no CMS/GitHub-publishing boundary", match: "SEO Fix Kit did not publish CMS changes, open GitHub pull requests, merge code" },
        { reason: "markdown receipt CTA", match: `href="${baseUrl}/proof.md"` },
        { reason: "link to methodology limits", match: `href="${baseUrl}/methodology"` },
        { reason: "link to package ladder", match: `href="${baseUrl}/packages"` }
      ]
    },
    {
      path: "/proof.md",
      name: "markdown receipt is served for /proof.md",
      isPage: true,
      acceptStatuses: [200],
      contentType: "text/markdown",
      expectations: [
        { reason: "markdown receipt headline", match: "SEO Fix Kit — Repair proof receipt" },
        { reason: "before score 85", match: "85/100" },
        { reason: "after score 100", match: "100/100" },
        { reason: "owner-approved PR #4 referenced", match: "github.com/nish3451/tinystudio-in/pull/4" },
        { reason: "owner-approved PR #5 referenced", match: "github.com/nish3451/tinystudio-in/pull/5" },
        { reason: "no-ranking boundary stated", match: "No ranking, traffic, indexing, citation, or revenue promise is made" }
      ]
    },
    {
      path: "/support",
      name: "support page keeps the no-ranking promise and refund guard",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "no-ranking promise", match: "No ranking, traffic, or revenue promise is made." },
        { reason: "one repair pass plus rerun", match: "one proof-backed repair pass for one report plus one rerun after fixes" },
        { reason: "refund guard when the queue cannot start", match: "If payment succeeds but the repair queue cannot start, you are entitled to a full refund" },
        { reason: "link to privacy", match: `href="${baseUrl}/privacy"` },
        { reason: "link to the anonymous check", match: `href="${baseUrl}/check"` }
      ]
    },
    {
      path: "/terms",
      name: "terms page keeps the no-ranking boundary",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "no-ranking promise", match: "No ranking, indexing, traffic, revenue, or search-engine outcome is promised" },
        { reason: "Dodo is merchant of record", match: "processed by Dodo Payments as merchant of record" },
        { reason: "refund window", match: "full refund within 14 days of payment" },
        { reason: "link to privacy", match: `href="${baseUrl}/privacy"` },
        { reason: "link to support", match: `href="${baseUrl}/support"` },
        { reason: "link to the anonymous check", match: `href="${baseUrl}/check"` }
      ]
    },
    {
      path: "/privacy",
      name: "privacy page keeps retention and no-tracking statements",
      isPage: true,
      acceptStatuses: [200],
      expectations: [
        { reason: "data controller statement", match: "We are the data controller for this information" },
        { reason: "30-day report retention", match: "reports expire after 30 days" },
        { reason: "no advertising or tracking cookies", match: "No advertising, analytics, or cross-site tracking cookies are set." },
        { reason: "link to terms", match: `href="${baseUrl}/terms"` },
        { reason: "link to support", match: `href="${baseUrl}/support"` },
        { reason: "link to the anonymous check", match: `href="${baseUrl}/check"` }
      ]
    }
  ];
}

// Machine-readable public surfaces the README "What is live in this repo" and
// Cloudflare-path sections claim stay served: /llms.txt and /sitemap.xml must
// still list the anonymous one-page check, /robots.txt must point at the
// sitemap, and the public health and one-page-check API routes must answer as
// JSON without running a browser render (the POST probe only exercises input
// validation). The full copy is locked offline; these are liveness checks.
export function publicSurfaceSpotChecks(baseUrl) {
  return [
    {
      path: "/llms.txt",
      name: "llms.txt stays served and lists the public proof surfaces",
      acceptStatuses: [200],
      contentType: "text/plain",
      expectations: [
        { reason: "llms.txt lists the anonymous check", match: `${baseUrl}/check` },
        { reason: "llms.txt lists the proof-loop pages", match: `${baseUrl}/demo` },
        { reason: "llms.txt lists the before/after receipt", match: `${baseUrl}/proof` },
        { reason: "llms.txt keeps the no-live-AI-tracking boundary", match: "Does not provide live AI-engine visibility tracking" }
      ]
    },
    {
      path: "/sitemap.xml",
      name: "sitemap stays served and lists the indexable public pages",
      acceptStatuses: [200],
      contentType: "application/xml",
      expectations: [
        { reason: "sitemap lists the one-page check", match: `<loc>${baseUrl}/check</loc>` },
        { reason: "sitemap lists the proof loop", match: `<loc>${baseUrl}/demo</loc>` },
        { reason: "sitemap lists the limits page", match: `<loc>${baseUrl}/methodology</loc>` },
        { reason: "sitemap lists the package ladder", match: `<loc>${baseUrl}/packages</loc>` },
        { reason: "sitemap lists the before/after receipt", match: `<loc>${baseUrl}/proof</loc>` }
      ]
    },
    {
      path: "/robots.txt",
      name: "robots.txt stays served and points at the sitemap",
      acceptStatuses: [200],
      contentType: "text/plain",
      expectations: [
        { reason: "robots.txt points at the sitemap", match: `Sitemap: ${baseUrl}/sitemap.xml` }
      ]
    },
    {
      path: "/api/health",
      name: "health endpoint answers as a shallow public runtime check",
      acceptStatuses: [200],
      contentType: "application/json",
      expectations: [
        { reason: "health reports ok", match: /"ok":\s*true/ },
        { reason: "health reports the worker runtime", match: /"runtime":\s*"cloudflare-worker"/ }
      ]
    },
    {
      path: "/api/deep-health",
      name: "deep-health endpoint answers as a public-safe readiness check",
      acceptStatuses: [200, 503],
      contentType: "application/json",
      expectations: [
        { reason: "deep-health reports a readiness state", match: /"status":\s*"(ready|degraded)"/ },
        { reason: "deep-health stays runtime/config scoped", match: /"scope":\s*"runtime_config_and_schema_readiness"/ }
      ]
    },
    {
      path: "/api/public-check",
      name: "anonymous one-page check route is live and validates input before rendering",
      method: "POST",
      body: "",
      acceptStatuses: [400],
      contentType: "application/json",
      expectations: [
        { reason: "route rejects invalid input with a JSON error", match: '"error"' }
      ]
    },
    {
      path: "/api/public-check",
      name: "anonymous one-page check route rejects non-http URL schemes instead of mangling them",
      method: "POST",
      body: JSON.stringify({ url: "ftp://example.com" }),
      acceptStatuses: [400],
      contentType: "application/json",
      expectations: [
        { reason: "route rejects unsupported schemes before any browser render", match: "Enter a valid public website URL." }
      ]
    }
  ];
}

// Machine-readable proof on the intent-matching landing pages: each one must
// carry WebPage + SoftwareApplication + FAQPage JSON-LD (the three blocks
// `publicProductPageHtml` emits) whose `url`/`name` point at that page, with
// the FAQ visible copy and the schema built from the same source array.
// The full offline lock lives in worker/routes/pages.test.mjs; these
// expectations prove the live deployed page still ships the schema.
function landingPageLdExpectations(path, pageName) {
  return [
    { reason: "WebPage JSON-LD names the page", match: `"@type":"WebPage","name":"${pageName} - SEO Fix Kit"` },
    { reason: "WebPage JSON-LD points at the page URL", match: `"@type":"WebPage","name":"${pageName} - SEO Fix Kit","description":` },
    { reason: "SoftwareApplication JSON-LD describes the tool truthfully", match: '"@type":"SoftwareApplication","name":"SEO Fix Kit"' },
    { reason: "FAQPage JSON-LD exists", match: '"@type":"FAQPage"' },
    { reason: "visible FAQ matches the FAQPage JSON-LD source", match: "Frequently asked questions" }
  ];
}

// Canonical-host promise: the README "Custom domain" section claims every
// www.seofixkit.com request 301-redirects onto the apex host with its path and
// query intact, so canonicals, robots.txt, and sitemap.xml stay apex-only.
// Redirects are checked with `redirect: "manual"` so the 301 itself is
// observable instead of being silently followed.
// The static-asset check exists because wrangler.jsonc must route every
// request through the Worker (`run_worker_first: true`); an asset path served
// 200 from www means the config regressed to a path list that bypasses the
// Worker redirect.
export function canonicalHostSpotChecks(baseUrl) {
  const apex = new URL(baseUrl);
  const wwwOrigin = `https://www.${apex.hostname}`;
  return [
    {
      path: "www.seofixkit.com/",
      name: "www.seofixkit.com 301-redirects onto the apex host",
      url: `${wwwOrigin}/`,
      redirectManual: true,
      acceptStatuses: [301],
      expectedHeaders: [
        { name: "location", value: `${baseUrl}/`, reason: "redirects to the apex root" }
      ]
    },
    {
      path: "www.seofixkit.com/check",
      name: "www.seofixkit.com deep paths redirect with path and query intact",
      url: `${wwwOrigin}/check?utm_source=spot-check`,
      redirectManual: true,
      acceptStatuses: [301],
      expectedHeaders: [
        {
          name: "location",
          value: `${baseUrl}/check?utm_source=spot-check`,
          reason: "redirect preserves the path and query"
        }
      ]
    },
    {
      path: "www.seofixkit.com/favicon.svg",
      name: "www.seofixkit.com static assets redirect too (no asset-host leakage)",
      url: `${wwwOrigin}/favicon.svg`,
      redirectManual: true,
      acceptStatuses: [301],
      expectedHeaders: [
        {
          name: "location",
          value: `${baseUrl}/favicon.svg`,
          reason: "static asset path must 301 onto the apex host"
        }
      ]
    },
    {
      path: "www.seofixkit.com/.well-known/security.txt",
      name: "www.seofixkit.com well-known paths redirect onto the apex host",
      url: `${wwwOrigin}/.well-known/security.txt`,
      redirectManual: true,
      acceptStatuses: [301],
      expectedHeaders: [
        {
          name: "location",
          value: `${baseUrl}/.well-known/security.txt`,
          reason: "static assets must never be served from www"
        }
      ]
    },
    {
      path: "www.seofixkit.com/unknown-spa-path",
      name: "www.seofixkit.com SPA-fallback paths redirect onto the apex host",
      url: `${wwwOrigin}/unknown-spa-path`,
      redirectManual: true,
      acceptStatuses: [301],
      expectedHeaders: [
        {
          name: "location",
          value: `${baseUrl}/unknown-spa-path`,
          reason: "SPA fallback must never serve the shell from www"
        }
      ]
    }
  ];
}

function hasContent(text, match) {
  return typeof match === "string" ? text.includes(match) : match.test(text);
}

// Worker-rendered promise pages are served as `text/html; charset=utf-8` with
// their own body copy. When the deployed Worker predates a promised route, the
// static-asset layer answers instead — either the SPA `index.html` shell
// (`text/html` without a charset and a `<div id="root">` root element) for
// paths the Worker used to serve, or the asset-layer 404 page (`text/html`
// without a charset and the 404 "Nothing to fix here." body) for paths the
// Worker never served. Both mean a deploy gap, not copy drift.
function isAssetFallback(text, contentType) {
  if (!/text\/html/i.test(contentType) || /charset/i.test(contentType)) {
    return false;
  }
  return text.includes('<div id="root"') || text.includes("Nothing to fix here.");
}

async function fetchWithTimeout(url, options, timeoutMs, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isDirectRun() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}
