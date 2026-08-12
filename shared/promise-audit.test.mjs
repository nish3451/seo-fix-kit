import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { parseAuditCompetitorUrls } from "./audit-engine.js";
import {
  CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES,
  CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
  SELF_SERVE_MAX_CRAWL_PAGES
} from "./crawl-depth.js";
import {
  LARGE_RENDERED_CRAWL_BATCH_SIZE,
  LARGE_RENDERED_CRAWL_TARGET_PAGES
} from "./large-rendered-crawl.js";
import { REPORT_RETENTION_DAYS } from "../worker/lib/report-data.js";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const liveSection = readme.split("## What is live in this repo")[1]?.split("## Run locally")[0] || "";
const workerIndex = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
const auditsSource = readFileSync(new URL("../worker/routes/audits.js", import.meta.url), "utf8");
const textSource = readFileSync(new URL("../worker/lib/text.js", import.meta.url), "utf8");
const pagesSource = readFileSync(new URL("../worker/routes/pages.js", import.meta.url), "utf8");
const wranglerJsonc = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const largeCrawlsSource = readFileSync(new URL("../worker/routes/large-crawls.js", import.meta.url), "utf8");
const offersSource = readFileSync(new URL("./offers.js", import.meta.url), "utf8");
const aiReadinessSource = readFileSync(new URL("./ai-answer-readiness.js", import.meta.url), "utf8");
const growthSource = readFileSync(new URL("./growth-opportunities.js", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../worker/lib/auth.js", import.meta.url), "utf8");
const accessSource = readFileSync(new URL("../worker/routes/access.js", import.meta.url), "utf8");
const proofReceiptSource = readFileSync(new URL("./repair-proof-receipt.js", import.meta.url), "utf8");
const keywordAuditSource = readFileSync(new URL("./keyword-rank-audit.js", import.meta.url), "utf8");
const auditEngineSource = readFileSync(new URL("./audit-engine.js", import.meta.url), "utf8");
const crawlIntelligenceSource = readFileSync(new URL("./crawl-intelligence.js", import.meta.url), "utf8");
const reportDeltaSource = readFileSync(new URL("./report-delta.js", import.meta.url), "utf8");
const crawlInventorySource = readFileSync(new URL("./crawl-inventory.js", import.meta.url), "utf8");
const crawlDepthSource = readFileSync(new URL("./crawl-depth.js", import.meta.url), "utf8");
const waterfallSource = readFileSync(new URL("./resource-waterfall.js", import.meta.url), "utf8");
const backlinkSource = readFileSync(new URL("./backlink-audit.js", import.meta.url), "utf8");
const localSeoSource = readFileSync(new URL("./local-seo-audit.js", import.meta.url), "utf8");
const platformSeoSource = readFileSync(new URL("./platform-seo-audit.js", import.meta.url), "utf8");
const briefSource = readFileSync(new URL("./remediation-brief.js", import.meta.url), "utf8");
const repairQueueSource = readFileSync(new URL("./repair-queue.js", import.meta.url), "utf8");
const implementationPackSource = readFileSync(new URL("./repair-implementation-pack.js", import.meta.url), "utf8");
const accountFeedSource = readFileSync(new URL("./account-repair-summary.js", import.meta.url), "utf8");
const renderedCrawlScaleSource = readFileSync(new URL("./rendered-crawl-scale.js", import.meta.url), "utf8");
const repairAgentSource = readFileSync(new URL("../worker/routes/repair-agent.js", import.meta.url), "utf8");
const developerApiSource = readFileSync(new URL("../worker/routes/developer-api.js", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../worker/routes/admin.js", import.meta.url), "utf8");
const accountSource = readFileSync(new URL("../worker/routes/account.js", import.meta.url), "utf8");
const fixPackCheckoutSource = readFileSync(new URL("../src/fix-pack-checkout.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const reportsSource = readFileSync(new URL("../worker/routes/reports.js", import.meta.url), "utf8");
const reportDataSource = readFileSync(new URL("../worker/lib/report-data.js", import.meta.url), "utf8");
const serverEngineSource = readFileSync(new URL("../server/audit/engine.js", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("../worker/lib/db.js", import.meta.url), "utf8");
const largeRenderedCrawlSource = readFileSync(new URL("./large-rendered-crawl.js", import.meta.url), "utf8");
const migrationsDir = new URL("../migrations", import.meta.url);
const allMigrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"))
  .join("\n");
function migrationHas(table) {
  return allMigrations.includes(`CREATE TABLE IF NOT EXISTS ${table}`);
}

test("README 'What is live in this repo' section exists and documents the self-serve crawl promise", () => {
  assert.ok(liveSection.length > 500, "README must keep a 'What is live in this repo' section");
  assert.match(liveSection, /1,000 pages per queued audit/i);
  assert.match(liveSection, /up to 50,000 sitemap URLs/i);
  assert.equal(SELF_SERVE_MAX_CRAWL_PAGES, 1000, "self-serve crawl cap is 1,000 pages");
  assert.equal(CRAWLRAVEN_PUBLIC_CRAWL_PAGES, 50000, "sitemap inventory cap is 50,000 URLs");
  assert.equal(CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES, 100000, "enterprise staged cap stays 100,000");
});

test("README large-crawl promise matches stored batch and target limits", () => {
  assert.match(liveSection, /50,000-page targets \(early access\)/i);
  assert.match(liveSection, /1,000-page batches/i);
  assert.equal(LARGE_RENDERED_CRAWL_TARGET_PAGES, 50000, "large-crawl target is 50,000 pages");
  assert.equal(LARGE_RENDERED_CRAWL_BATCH_SIZE, 1000, "large-crawl batch size is 1,000 pages");
});

test("README retention promise matches the code constant", () => {
  assert.match(liveSection, /30-day report retention/i);
  assert.equal(REPORT_RETENTION_DAYS, 30, "report retention is 30 days");
});

test("README competitor promise caps at five public homepages", () => {
  assert.match(liveSection, /up to five public competitor homepages/i);
  const input = {
    competitorUrls: Array.from({ length: 9 }, (_, index) => `https://competitor-${index}.example/`)
  };
  const result = parseAuditCompetitorUrls(input, "https://target.example/");
  assert.equal(result.ok, true);
  assert.equal(result.urls.length, 5, "competitor benchmarking accepts at most five URLs");
});

test("README Lite check promise matches the 1-page, 3/day quota", () => {
  assert.match(liveSection, /homepage-only Lite check \(1 page, 3\/day\)/i);
  assert.match(auditsSource, /maxPages <= 1/, "Lite eligibility is a homepage-only 1-page run");
  assert.match(auditsSource, /audit:lite-day/, "Lite quota uses a daily bucket");
  assert.match(auditsSource, /limit: 3/, "Lite checks are capped at three per day");
});

test("README weekly monitor promise matches the schedule interval", () => {
  assert.match(liveSection, /weekly self-serve audit monitors/i);
  assert.match(textSource, /clampScheduleInterval/, "schedule interval helper exists");
  assert.match(textSource, /if \(parsed <= 7\) return 7/, "default schedule interval is weekly");
});

test("README public page promise matches Worker routing and copy", () => {
  assert.match(liveSection, /Public `\/demo`, `\/methodology`, and `\/packages` pages showing the proof loop, limits, and package ladder before payment/i);
  for (const path of ["/demo", "/methodology", "/packages", "/check"]) {
    assert.ok(workerIndex.includes(`url.pathname === "${path}"`), `Worker must route ${path}`);
  }
  assert.match(pagesSource, /FIX_PACK_PUBLIC_PRICE/, "packages page price constant exists");
});

test("README Cloudflare path routes are actually registered in the Worker", () => {
  const claimedRoutes = [
    "/api/health",
    "/api/deep-health",
    "/api/waitlist",
    "/api/access/request",
    "/api/access/verify",
    "/api/beta/login",
    "/api/beta/session",
    "/api/beta/logout",
    "/api/account/summary",
    "/api/audit",
    "/api/audit/jobs/",
    "/api/large-crawls",
    "/api/audit/schedules",
    "/api/developer",
    "/api/developer/tokens",
    "/api/developer/webhooks",
    "/api/sites",
    "/api/sites/claim",
    "/api/sites/verify",
    "/api/reports/",
    "/api/webhooks/dodo",
    "/api/billing/summary",
    "/api/beta/fix-request",
    "/api/beta/monitoring-checkout",
    "/v1/audits",
    "/v1/projects",
    "/v1/large-crawls",
    "/admin/summary",
    "/admin/invites",
    "/admin/leads.csv",
    "/llms.txt",
    "/sitemap.xml",
    "/robots.txt",
    "/privacy",
    "/support",
    "/terms",
    "/demo",
    "/methodology",
    "/packages",
    "/check",
    "/api/public-check",
    "/beta"
  ];
  for (const route of claimedRoutes) {
    assert.ok(workerIndex.includes(route), `Worker must register route ${route}`);
  }
});

test("README abuse-control claim matches D1 buckets for every listed surface", () => {
  assert.match(liveSection, /D1-backed abuse controls/i);
  assert.match(liveSection, /across access links, login, waitlist, network, session, daily, and target-site audit buckets/i);
  for (const bucket of ["waitlist:ip", "login:ip", "access:ip", "audit:ip", "audit:session", "audit:target", "audit:lite-day", "check:ip-hour", "check:target-hour"]) {
    let source = auditsSource;
    if (bucket.startsWith("audit")) source = auditsSource;
    else if (bucket.startsWith("check")) source = readFileSync(new URL("../worker/routes/public-check.js", import.meta.url), "utf8");
    else source = readFileSync(new URL("../worker/routes/access.js", import.meta.url), "utf8");
    assert.ok(source.includes(`bucket: \`${bucket}`), `abuse control must cover ${bucket}`);
  }
});

test("quota target buckets never store a plaintext hostname, public or private", () => {
  const publicCheckSource = readFileSync(new URL("../worker/routes/public-check.js", import.meta.url), "utf8");
  // The anonymous /check target buckets hash the checked host (public surface).
  assert.match(
    publicCheckSource,
    /sha256Hex\(String\(targetHost[\s\S]*\)\.slice\(0, 32\)/,
    "the anonymous /check target bucket must store a host hash, never plaintext"
  );
  // The private audit target bucket hashes the audited host the same way, so
  // the shared audit_usage table never holds a readable target hostname.
  assert.match(
    auditsSource,
    /\(await sha256Hex\(targetHost\)\)\.slice\(0, 32\)/,
    "the private audit target bucket must store a host hash, never plaintext"
  );
  assert.doesNotMatch(
    auditsSource,
    /targetKey = targetHost\.replace/,
    "the private audit target bucket must not keep the plaintext hostname key"
  );
});

test("README anonymous one-page check claim matches the Worker, page, and rate limits", () => {
  assert.match(liveSection, /Public anonymous one-page URL check at `\/check` and `POST \/api\/public-check`/i);
  assert.match(liveSection, /per-network and per-site rate limits with hashed, short-lived counters/i);
  assert.match(liveSection, /no stored report/i);
  assert.match(liveSection, /handoff into private beta access with no ranking promise/i);
  assert.ok(workerIndex.includes('url.pathname === "/check"'), "Worker must route /check");
  assert.ok(workerIndex.includes('url.pathname === "/api/public-check"'), "Worker must route /api/public-check");
  const publicCheckSource = readFileSync(new URL("../worker/routes/public-check.js", import.meta.url), "utf8");
  assert.match(liveSection, /real browser rendering of one public page/i);
  assert.match(publicCheckSource, /maxPages: 1/, "the public check is a one-page run");
  assert.match(publicCheckSource, /opens the page in a real browser|open the page in a real browser/i, "the public check copy states real browser rendering");
  assert.match(publicCheckSource, /check:target-day/, "the check is rate-limited per site");
  assert.match(publicCheckSource, /does not guarantee rankings, traffic, indexing, revenue, AI citations/i, "the public check keeps the no-ranking boundary");
  assert.match(wranglerJsonc, /"run_worker_first":\s*true/, "/check (and every other path) is served by the Worker before SPA assets");
});

test("README homepage anonymous-check claim matches the CTA beside the email form", () => {
  assert.match(
    readme,
    /request a secure one-use email link or check one public page anonymously/i,
    "README promises both homepage entry paths"
  );
  assert.match(
    appSource,
    /<div className="access-entry">[\s\S]*<form className="waitlist-form"/,
    "the email access form stays beside the anonymous check entry"
  );
  assert.match(
    appSource,
    /<a className="check-entry-cta" href="\/check">/,
    "the homepage shows a primary CTA to the anonymous one-page check"
  );
  assert.match(
    appSource,
    /Anyone can check one public page now at[\s\S]*<a href="\/check">\/check<\/a>[\s\S]*with no account/,
    "the homepage FAQ names the anonymous /check entry path"
  );
});

// State-truthfulness pins. The numeric caps and routes above are locked to
// code; these claims describe what is NOT live or how limits are computed, so
// they were spot-checked once (PR #60) and are locked here so the README
// cannot silently drift into overclaiming.

test("README large-crawl daily rate matches the scheduled worker defaults", () => {
  assert.match(liveSection, /roughly 1,000 pages\/day/i);
  assert.match(wranglerJsonc, /"\*\/15 \* \* \* \*"/, "scheduled worker runs every 15 minutes");
  assert.match(largeCrawlsSource, /SEOFIXKIT_LARGE_CRAWL_WORKER_BATCHES \|\| 1/, "default is one batch per tick");
  assert.match(largeCrawlsSource, /SEOFIXKIT_LARGE_CRAWL_WORKER_URLS \|\| 10/, "default is ten URLs per batch");
  const ticksPerDay = (24 * 60) / 15;
  const pagesPerDay = ticksPerDay * 1 * 10;
  assert.ok(pagesPerDay >= 900 && pagesPerDay <= 1000, `default caps render ${pagesPerDay} pages/day, matching 'roughly 1,000'`);
});

test("README keyword-volume claim keeps a storage path without a live provider", () => {
  assert.match(liveSection, /keyword volume imports have a storage path but no live provider yet/i);
  const keywordVolumeMigration = readdirSync(new URL("../migrations", import.meta.url)).find((file) => {
    if (!file.endsWith(".sql")) return false;
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    return sql.includes("keyword_volume_observations");
  });
  assert.ok(keywordVolumeMigration, "a migration must store keyword volume rows");
  assert.match(keywordAuditSource, /not a keyword volume, rank-tracking, or backlink database/, "keyword audit does not claim a live volume provider");
});

test("README offer-catalog claim matches config-gated monitoring and paused checkouts", () => {
  assert.match(liveSection, /Server-owned offer catalog and entitlement scaffolding for Proof Monitoring, Repair Sprint, SEO\/GEO Repair Agent, and Agency Workspace/i);
  assert.match(liveSection, /Proof Monitoring has a config-gated Dodo subscription checkout path/i);
  assert.match(
    liveSection,
    /Repair Sprint checkout, Repair Agent checkout, and paid Agency Workspace checkout are not live yet/i
  );
  for (const name of ["Proof Monitoring", "Repair Sprint", "SEO/GEO Repair Agent", "Agency Workspace"]) {
    assert.match(offersSource, new RegExp(`name: "${name}"`), `offer catalog names ${name}`);
  }
  assert.match(offersSource, /statusLabel: "Config gated"/, "Proof Monitoring is labeled config-gated");
  const pausedCheckouts = (offersSource.match(/checkoutState: "paused"/g) || []).length;
  assert.ok(pausedCheckouts >= 3, `at least three non-live checkouts (found ${pausedCheckouts})`);
});

test("README AI Answer Readiness claim stays free of live AI sampling", () => {
  assert.match(liveSection, /no live AI-engine sampling or citation monitoring/i);
  assert.match(aiReadinessSource, /does not sample AI engines or monitor citations/);
  assert.match(aiReadinessSource, /not live answer-engine sampling or citation monitoring/);
});

test("README AI readiness derivation signals match the checks that compute them", () => {
  assert.match(liveSection, /AI Answer Readiness \/ SEO-GEO readiness checks derived from rendered content depth, helpful schema, canonical\/internal-link clarity, question-led structure, sitemap context/i);
  assert.match(aiReadinessSource, /contentDepth: contentDepthCheck/, "content depth check exists");
  assert.match(aiReadinessSource, /structuredData: structuredDataCheck/, "helpful schema check exists");
  assert.match(aiReadinessSource, /sourceClarity: sourceClarityCheck/, "canonical/internal-link clarity check exists");
  assert.match(aiReadinessSource, /answerStructure: answerStructureCheck/, "question-led structure check exists");
  assert.match(aiReadinessSource, /discoveryFiles: discoveryFilesCheck/, "sitemap/llms.txt discovery context check exists");
});

test("README growth-opportunity claim stays draft-only", () => {
  assert.match(liveSection, /Draft-only growth opportunities/i);
  assert.match(liveSection, /no article-volume autopilot, auto-publishing, or ranking promises/i);
  assert.match(growthSource, /status: "draft_only"/, "growth opportunities are draft-only records");
  assert.match(
    growthSource,
    /do not publish content, create CMS drafts, open pull requests, or promise rankings/,
    "no auto-publishing or ranking promises"
  );
});

test("README site-claim promise matches verified-host flow and apex/www folding", () => {
  assert.match(liveSection, /Site ownership claims backed by D1 `site_claims`/i);
  assert.match(liveSection, /non-founder audits require a verified host \(apex and www count as one site\)/i);
  assert.match(liveSection, /homepage-only Lite check \(1 page, 3\/day\) runs without verification/i);
  assert.match(accessSource, /verifySiteClaimDns/, "DNS TXT verification exists");
  assert.match(accessSource, /verifySiteClaimHttpsFile/, "HTTPS file verification exists");
  assert.match(authSource, /A claim on the apex domain also covers www/, "apex and www fold into one site");
});

test("README beta-invite claim keeps the shared password a founder override", () => {
  assert.match(liveSection, /the shared beta password is only a founder override/i);
  assert.match(accessSource, /BETA_ACCESS_PASSWORD/, "founder password env exists");
  assert.match(accessSource, /accessMode: "founder-override"/, "password path opens a founder-override session");
});

test("README repair-proof-receipt claim keeps publishing and ranking disclaimers", () => {
  assert.match(liveSection, /Private repair proof receipts after fixed rerun proof/i);
  assert.match(liveSection, /connecting the original issue, approved\/applied change, and same-host rerun report/i);
  assert.match(proofReceiptSource, /connects one owner-approved repair action to the same-host rerun proof/, "receipts connect the approved action to same-host rerun proof");
  assert.match(liveSection, /without claiming SEOFixKit published or guaranteed the repair/i);
  assert.match(proofReceiptSource, /does not mean SEOFixKit published, merged, indexed, ranked, or guaranteed the change/);
  assert.match(proofReceiptSource, /Rankings, traffic, indexing, AI citations, and revenue are not guaranteed/);
});

// Functional claim pins. The numeric caps, routes, and state-truthfulness
// claims above are locked; these pins tie the remaining "What is live in this
// repo" bullets (rendered audit, evidence, intelligence, deltas, validation
// pack, PSI, waterfall, imports, platform, briefs, queue/board/packs, feed,
// proposals, D1 tables, and dashboard surfaces) to the code that backs them.

test("README rendered-audit claims match Playwright, static-vs-rendered, and evidence-backed findings", () => {
  assert.match(liveSection, /Rendered-page audit with Playwright/i);
  assert.match(serverEngineSource, /launchAuditBrowser/, "server audit uses the Playwright browser launcher");
  assert.match(liveSection, /Static HTML vs rendered DOM comparison/i);
  assert.match(auditEngineSource, /staticFacts\.h1s\.length === 0 && rendered\.h1s\.length > 0/, "engine compares static HTML with rendered DOM");
  assert.match(liveSection, /Evidence-backed findings/i);
  assert.match(auditEngineSource, /evidence:/, "findings carry evidence fields");
});

test("README crawl-depth and page-proof claims match per-page scores", () => {
  assert.match(liveSection, /crawl-depth tiers up to 1,000 pages per queued audit/i);
  assert.match(crawlDepthSource, /pages: 1000/, "deep tier is 1,000 pages");
  assert.match(liveSection, /with per-page scores and page proof/i);
  assert.match(auditEngineSource, /buildPageSummaries/, "per-page summaries exist");
  assert.match(auditEngineSource, /score: scoreFindings\(pageFindings\)/, "each page gets a score");
});

test("README crawl-intelligence claim matches every listed signal", () => {
  assert.match(liveSection, /internal link graph depth/i);
  assert.match(liveSection, /low-inbound pages/i);
  assert.match(liveSection, /sitemap-sample orphan candidates/i);
  assert.match(liveSection, /duplicate titles\/descriptions\/H1s/i);
  assert.match(liveSection, /near-duplicate content/i);
  assert.match(liveSection, /parameterized internal URLs/i);
  assert.match(liveSection, /keyword-cannibalization heuristics/i);
  assert.match(crawlIntelligenceSource, /duplicateDescriptions/, "duplicate descriptions checked");
  assert.match(crawlIntelligenceSource, /duplicateH1s/, "duplicate H1s checked");
  assert.match(crawlIntelligenceSource, /duplicateContentPairs/, "near-duplicate content checked");
  assert.match(crawlIntelligenceSource, /orphanInventoryCandidates/, "sitemap orphan candidates checked");
  assert.match(crawlIntelligenceSource, /cannibalizationGroups/, "cannibalization heuristics checked");
  assert.match(crawlIntelligenceSource, /parameterizedLinks/, "parameterized internal URLs checked");
  assert.match(crawlIntelligenceSource, /lowInboundPages/, "low-inbound pages checked");
  assert.match(crawlIntelligenceSource, /graph\.depth/, "internal link graph depth computed");
});

test("README audit-history delta claim matches fixed, new, and still-open issues", () => {
  assert.match(liveSection, /Audit history deltas for saved reruns/i);
  assert.match(liveSection, /fixed, new, and still-open proven issues/i);
  assert.match(reportDeltaSource, /fixedIssues/, "fixed issues reported");
  assert.match(reportDeltaSource, /newIssues/, "new issues reported");
  assert.match(reportDeltaSource, /persistentIssues/, "still-open issues reported");
  assert.match(reportDeltaSource, /same owner and host/, "delta compares against the same host");
});

test("README technical validation pack covers every listed check", () => {
  assert.match(liveSection, /Technical validation pack/i);
  for (const signal of [
    /broken links/i,
    /redirecting internal links/i,
    /broken images/i,
    /canonical reachability/i,
    /hreflang mistakes/i,
    /invalid JSON-LD/i,
    /HTTPS\/HSTS/i,
    /large assets/i,
    /slow rendered loads/i
  ]) {
    assert.match(liveSection, signal, `README lists ${signal}`);
  }
  assert.match(auditEngineSource, /Redirecting internal links on/, "redirecting internal links checked");
  assert.match(auditEngineSource, /Broken internal links on/, "broken links checked");
  assert.match(auditEngineSource, /Broken images on/, "broken images checked");
  assert.match(auditEngineSource, /canonicalCheck/, "canonical reachability checked");
  assert.match(auditEngineSource, /validateHreflang/, "hreflang mistakes checked");
  assert.match(auditEngineSource, /JSON-LD could not be parsed/, "invalid JSON-LD checked");
  assert.match(auditEngineSource, /HSTS security header missing/, "HSTS checked");
  assert.match(auditEngineSource, /oversizedImages/, "large assets checked");
  assert.match(auditEngineSource, /Slow rendered load on/, "slow rendered loads checked");
});

test("README PageSpeed claim matches mobile score, lab metrics, and opportunities", () => {
  assert.match(liveSection, /PageSpeed Insights \/ Lighthouse performance proof/i);
  assert.match(auditEngineSource, /parsePageSpeedResult/, "PSI result parser exists");
  assert.match(auditEngineSource, /performanceScore/, "mobile performance score parsed");
  assert.match(auditEngineSource, /largestContentfulPaint/, "Core Web Vitals lab metrics parsed");
  assert.match(auditEngineSource, /totalBlockingTime/, "TBT lab metric parsed");
  assert.match(auditEngineSource, /topPageSpeedOpportunities/, "top opportunities parsed");
  assert.match(auditEngineSource, /Mobile PageSpeed performance score is/, "repair-ready PSI finding exists");
});

test("README resource-waterfall claim matches request, transfer, and slow/heavy/render-blocking evidence", () => {
  assert.match(liveSection, /Browser resource-waterfall proof/i);
  assert.match(liveSection, /request counts/i);
  assert.match(liveSection, /observed transfer size/i);
  assert.match(liveSection, /slow\/heavy\/render-blocking resource evidence/i);
  assert.match(waterfallSource, /totalRequests/, "request counts captured");
  assert.match(waterfallSource, /totalTransferBytes/, "observed transfer size captured");
  assert.match(waterfallSource, /slowResources/, "slow resources captured");
  assert.match(waterfallSource, /heavyResources/, "heavy resources captured");
  assert.match(waterfallSource, /renderBlockingCandidates/, "render-blocking candidates captured");
  assert.match(waterfallSource, /repairOpportunities/, "waterfall repair actions exist");
});

test("README backlink import claim matches live/lost proof, risk flags, and history tables", () => {
  assert.match(liveSection, /backlink import audit and import-history tables for supplied rows/i);
  assert.match(liveSection, /live\/lost link proof, risky source signals, broken target checks, anchor concentration flags, and repair actions/i);
  assert.match(backlinkSource, /summary\?\.live/, "live link proof counted");
  assert.match(backlinkSource, /summary\?\.lost/, "lost link proof counted");
  assert.match(backlinkSource, /riskySourceSignals/, "risky source signals flagged");
  assert.match(backlinkSource, /brokenTargets/, "broken target checks exist");
  assert.match(backlinkSource, /anchorTextRisks/, "anchor concentration flags exist");
  assert.match(backlinkSource, /backlinkRepairOpportunities/, "backlink repair actions exist");
  assert.ok(migrationHas("backlink_edges"), "backlink_edges history table exists");
  assert.ok(migrationHas("backlink_import_batches"), "backlink import batch table exists");
});

test("README local SEO claim matches NAP, LocalBusiness schema, and citation checks", () => {
  assert.match(liveSection, /local SEO audit for supplied business details, Google Business Profile URL, local keywords, and citation URLs/i);
  assert.match(liveSection, /NAP, LocalBusiness schema, citation consistency, and repair actions/i);
  assert.match(localSeoSource, /googleBusinessProfileUrl/, "GBP URL accepted");
  assert.match(localSeoSource, /napFieldsSupplied/, "NAP fields checked");
  assert.match(localSeoSource, /LocalBusiness schema is missing/, "LocalBusiness schema checked");
  assert.match(localSeoSource, /citation/i, "citation consistency checked");
  assert.match(allMigrations, /local_seo_input_json/, "local SEO inputs stored on queued audits");
});

test("README keyword/rank import claim matches listed repair actions and history tables", () => {
  assert.match(liveSection, /keyword\/rank import audit and trend-history tables/i);
  assert.match(liveSection, /low-CTR/i);
  assert.match(liveSection, /page-two/i);
  assert.match(liveSection, /zero-click/i);
  assert.match(liveSection, /decline/i);
  assert.match(liveSection, /cannibalization/i);
  assert.match(liveSection, /intent-match/i);
  assert.match(liveSection, /uncrawled landing-page/i);
  assert.match(keywordAuditSource, /lowCtrOpportunities/, "low-CTR opportunities exist");
  assert.match(keywordAuditSource, /pageTwoOpportunities/, "page-two opportunities exist");
  assert.match(keywordAuditSource, /zeroClickRows/, "zero-click rows exist");
  assert.match(keywordAuditSource, /decliningRows/, "decline rows exist");
  assert.match(keywordAuditSource, /cannibalizationGroups/, "cannibalization groups exist");
  assert.match(keywordAuditSource, /Ranking pages do not clearly reflect query intent/, "intent-match check exists");
  assert.match(keywordAuditSource, /were not crawled in this proof run/, "uncrawled landing-page check exists");
  assert.ok(migrationHas("keyword_rank_observations"), "trend-history table exists");
});

test("README platform audit claim matches schema, faceted, archive, and plugin checks", () => {
  assert.match(liveSection, /WordPress and ecommerce platform audit for detected stores\/CMS pages/i);
  assert.match(liveSection, /Product schema, BreadcrumbList schema, faceted\/variant URLs, WordPress archive links, and plugin resource repair actions/i);
  assert.match(platformSeoSource, /productSchema/, "Product schema checked");
  assert.match(platformSeoSource, /breadcrumbSchema/, "BreadcrumbList schema checked");
  assert.match(platformSeoSource, /facetedNavigation/, "faceted/variant URLs checked");
  assert.match(platformSeoSource, /wordpressArchiveLinks/, "WordPress archive links checked");
  assert.match(platformSeoSource, /wordpressPluginResources/, "plugin resource impact checked");
});

test("README false-positive guard and fix snippet claims match engine output", () => {
  assert.match(liveSection, /False-positive guard section/i);
  assert.match(auditEngineSource, /type: "guard"/, "guards are typed findings");
  assert.match(liveSection, /Generated fix snippets for common SEO repairs/i);
  assert.doesNotMatch(
    liveSection,
    /Exact fix snippets/,
    "README must not call generated engine markup an exact snippet (PR #102 rule: engine snippets are proposed repair markup, never a quote observed on the page)"
  );
  assert.match(auditEngineSource, /snippet: `<title>/, "title fix snippets exist");
  assert.match(auditEngineSource, /snippet: `<meta name="description"/, "description fix snippets exist");
});

test("README developer brief claim matches priority, effort, proof, acceptance, and snippets", () => {
  assert.match(liveSection, /Copyable developer repair brief/i);
  assert.match(briefSource, /priority: index \+ 1/, "brief orders repairs by priority");
  assert.match(briefSource, /estimatedEffort/, "brief includes effort");
  assert.match(briefSource, /proof/, "brief includes proof");
  assert.match(briefSource, /acceptanceChecks/, "brief includes acceptance checks");
  assert.match(liveSection, /with priority, effort, proof, acceptance checks, and snippets/i);
});

test("README repair queue claim matches persistent records with proof, status, and rerun state", () => {
  assert.match(liveSection, /Persistent repair queue records for saved reports, with proof snapshots, acceptance checks, status, action mode, rerun state, and approval-safe agent action records/i);
  assert.match(repairQueueSource, /queueItemResponse\(/, "queue records serialize saved proof snapshots");
  assert.match(allMigrations, /proof TEXT/, "queue items store proof snapshots");
  assert.match(allMigrations, /rerun_status TEXT/, "queue items keep rerun state");
  assert.ok(migrationHas("repair_queue_items"), "repair_queue_items table exists");
  assert.ok(migrationHas("repair_agent_actions"), "approval-safe agent action records exist");
});

test("README repair agent board claim matches assignment, notes, drafts, and approval controls", () => {
  assert.match(liveSection, /Report-level repair agent board with status filters, teammate assignment, notes, safe draft actions, approval\/ignore controls, and no external publishing side effects/i);
  assert.match(repairAgentSource, /status/, "board filters by status");
  assert.match(reportsSource, /assignee_email/, "teammate assignment exists");
  assert.match(reportsSource, /note/i, "notes exist");
  assert.match(repairAgentSource, /draft/i, "safe draft actions exist");
  assert.match(repairAgentSource, /approve|approval/i, "approval/ignore controls exist");
  assert.ok(migrationHas("team_members"), "team_members table exists");
  assert.ok(migrationHas("issue_collaboration"), "issue collaboration table exists");
});

test("README implementation pack claim matches proof, handoff, acceptance, rollback, and rerun proof", () => {
  assert.match(liveSection, /Private implementation packs for owner-approved repair actions, with source proof, approved change text, mode-specific handoff steps, acceptance checks, rollback notes, and rerun-proof instructions/i);
  assert.match(implementationPackSource, /rollbackNote/, "rollback notes exist");
  assert.match(implementationPackSource, /handoff/, "mode-specific handoff steps exist");
  assert.match(implementationPackSource, /acceptance/, "acceptance checks exist");
  assert.match(implementationPackSource, /rerun/, "rerun-proof instructions exist");
  assert.match(implementationPackSource, /source proof|sourceProof/i, "source proof exists");
});

test("README account repair feed claim matches ranked open, drafted, applied, and regression items", () => {
  assert.match(liveSection, /Account-level repair agent feed that ranks open repairs, drafted actions awaiting approval, applied repairs needing rerun proof, and monitor regressions across recent reports/i);
  assert.match(accountFeedSource, /monitorRegressionItem/, "monitor regressions ranked");
  assert.match(accountFeedSource, /awaitingApproval/, "drafted actions awaiting approval counted");
  assert.match(accountFeedSource, /rank: 0/, "items are ranked");
  assert.match(accountFeedSource, /rerun/, "applied repairs needing rerun proof surfaced");
});

test("README repair proposal claim matches records tied to Fix Pack requests", () => {
  assert.match(liveSection, /Repair proposal records tied to Fix Pack requests/i);
  assert.ok(migrationHas("repair_proposals"), "repair_proposals table exists");
  assert.ok(migrationHas("repair_proposal_events"), "repair proposal events table exists");
  assert.match(liveSection, /final rerun proof references/i);
  assert.match(liveSection, /protected retention for paid proof/i);
  assert.ok(
    /UPDATE audit_reports[\s\S]*expires_at = NULL[\s\S]*fix_requests[\s\S]*status IN \('paid'/.test(allMigrations),
    "paid Fix Pack reports keep protected retention"
  );
});

test("README React interface and Cloudflare Worker target claims match the build", () => {
  assert.match(liveSection, /Founder-friendly React interface/i);
  assert.match(mainSource, /createRoot/, "UI mounts a React root");
  assert.match(appSource, /React|useState|from "react"/, "UI components are React");
  assert.match(liveSection, /Cloudflare Worker target using Workers Static Assets and Browser Run/i);
  assert.match(wranglerJsonc, /"browser"/, "Browser Run binding configured");
  assert.match(wranglerJsonc, /assets/i, "Workers Static Assets configured");
});

test("README homepage, waitlist, and access claims match the Worker and D1", () => {
  assert.match(liveSection, /Locked private-beta homepage with `\/api\/waitlist` and `\/api\/access\/request` backed by D1/i);
  assert.match(workerIndex, /url\.pathname === "\/api\/waitlist"/, "waitlist endpoint registered");
  assert.match(workerIndex, /url\.pathname === "\/api\/access\/request"/, "access request endpoint registered");
  assert.match(accessSource, /INSERT INTO waitlist_leads/, "waitlist writes to D1");
  assert.match(accessSource, /access_tokens/, "access tokens backed by D1");
});

test("README beta workbench and session claims match D1-backed records", () => {
  assert.match(liveSection, /Hidden `\/beta` private audit workbench protected by invite code login or a secure one-use email access link/i);
  assert.match(workerIndex, /withPrivateHeaders\(response\)/, "/beta serves with private headers");
  assert.match(liveSection, /Expiring beta sessions backed by D1 `beta_sessions`/i);
  assert.ok(migrationHas("beta_sessions"), "beta_sessions table exists");
  assert.match(allMigrations, /beta_sessions.*expires_at|expires_at.*beta_sessions/s, "beta sessions expire");
  assert.match(liveSection, /Explicit session access modes for invite, self-serve, and founder override sessions/i);
  assert.match(accessSource, /accessMode: "self-serve"/, "self-serve mode exists");
  assert.match(accessSource, /accessMode: "invite"/, "invite mode exists");
  assert.match(accessSource, /accessMode: "founder-override"/, "founder-override mode exists");
  assert.match(liveSection, /Admin-created beta invite codes backed by D1 `beta_invites`/i);
  assert.match(liveSection, /Single-use self-serve access tokens backed by D1 `access_tokens`/i);
  assert.ok(migrationHas("access_tokens"), "single-use access tokens table exists");
  assert.ok(migrationHas("beta_invites"), "beta_invites table exists");
  assert.ok(migrationHas("site_claims"), "site_claims table exists");
  assert.ok(migrationHas("audit_jobs"), "audit_jobs table exists");
  assert.ok(migrationHas("audit_schedules"), "audit_schedules table exists");
  assert.ok(migrationHas("audit_reports"), "audit_reports table exists");
});

test("README account summary, developer API, admin ops, and Fix Pack CTA claims match code", () => {
  assert.match(liveSection, /Customer workspace summary API and dashboard at `\/api\/account\/summary`/i);
  assert.match(workerIndex, /url\.pathname === "\/api\/account\/summary"/, "account summary route registered");
  assert.match(accountSource, /repairAccountSummaryFromItems/, "account summary built from repair items");
  assert.match(liveSection, /Self-serve Developer API keys, `\/v1\/audits` JSON endpoints, project-style verified sites, safe `repair_queue` issue status, separate approved-action implementation-pack and fixed-proof receipt markdown endpoints, and audit\/repair-action lifecycle webhooks/i);
  assert.match(developerApiSource, /implementation\.md/, "implementation-pack markdown endpoint exists");
  assert.match(developerApiSource, /proof\.md/, "proof-receipt markdown endpoint exists");
  assert.match(developerApiSource, /webhook/i, "lifecycle webhooks exist");
  assert.match(developerApiSource, /projects: "GET \/v1\/projects"/, "project-style verified sites endpoint exists");
  assert.match(liveSection, /`\/beta\/admin` ops dashboard for waitlist, invites, audits, repeated issue patterns, and fix requests/i);
  assert.match(adminSource, /issuePatterns/, "repeated issue patterns surfaced");
  assert.match(adminSource, /fix.?request/i, "fix requests surfaced");
  assert.match(liveSection, /Dodo-backed SEO Fix Pack checkout CTA inside reports when real fixes exist/i);
  assert.match(fixPackCheckoutSource, /checkout/, "Fix Pack checkout path exists");
  assert.match(briefSource, /fixPackEligible/, "reports become Fix Pack eligible when real fixes exist");
  assert.match(liveSection, /Public `\/support`, `\/terms`, and `\/privacy` pages/i);
  for (const page of ["/support", "/terms", "/privacy"]) {
    assert.ok(workerIndex.includes(`url.pathname === "${page}"`), `Worker must route ${page}`);
  }
});

test("README large-crawl staged-plan claim keeps scale readiness honest", () => {
  assert.match(liveSection, /merge-readiness gates/i);
  assert.match(largeCrawlsSource, /readyToMerge|merge/i, "merge readiness gated");
  assert.match(liveSection, /scale-readiness repair actions/i);
  assert.match(renderedCrawlScaleSource, /repairOpportunities/, "scale readiness repair actions exist");
  assert.match(liveSection, /never sold as completed 50K rendered validation/i);
  const completed50kMentions = (pagesSource.match(/completed 50K rendered validation/gi) || []).length;
  const negated50kMentions = (pagesSource.match(/never sold as completed 50K rendered validation/gi) || []).length;
  assert.ok(negated50kMentions >= 1, "public pages state the staged 50K crawl boundary");
  assert.equal(
    completed50kMentions,
    negated50kMentions,
    "public pages only mention completed 50K rendered validation inside the never-sold-as negation"
  );
});

test("README sitemap inventory claim keeps rendered repair proof separate", () => {
  assert.match(liveSection, /discovering up to 50,000 sitemap URLs while keeping rendered repair proof separate/i);
  assert.match(crawlInventorySource, /CRAWLRAVEN_PUBLIC_CRAWL_PAGES|50000/, "inventory cap is 50,000 URLs");
  assert.ok(migrationHas("large_crawl_url_proofs"), "large-crawl proof stored separately");
});

test("README queued-job claim matches status polling before the private report loads", () => {
  assert.match(liveSection, /Queued audit jobs backed by D1 `audit_jobs`, with status polling before the private report loads/i);
  assert.match(appSource, /async function pollAuditJob/, "the UI polls job status before the report loads");
  assert.match(appSource, /\/api\/audit\/jobs\//, "polling hits the job status endpoint");
});

test("README saved-report claim matches owner email and invite-bound ownership", () => {
  assert.match(
    liveSection,
    /Saved private report URLs backed by D1 `audit_reports`, tied to the beta owner email and invite where available/i
  );
  assert.match(
    reportDataSource,
    /INSERT INTO audit_reports[\s\S]*owner_email[\s\S]*owner_invite_id/,
    "reports are stored with owner email and invite id"
  );
  assert.match(auditsSource, /owner_invite_id: access\.inviteId/, "queued audits carry the owner invite");
});

test("README public support, terms, and privacy pages keep no-ranking-guarantee copy", () => {
  assert.match(
    liveSection,
    /Public `\/support`, `\/terms`, and `\/privacy` pages with no ranking guarantees/i
  );
  assert.match(pagesSource, /No ranking or traffic guarantee/, "terms page carries no ranking guarantee");
  assert.match(pagesSource, /No ranking, traffic, or revenue promise is made/, "privacy page carries no ranking promise");
  assert.match(
    pagesSource,
    /No ranking, indexing, traffic, revenue, or search-engine outcome is promised/,
    "support page carries no ranking promise"
  );
});

// Lane-1 audit refinement. A fresh spot-check of every 'What is live in this
// repo' bullet found eleven sub-claims inside already-pinned bullets that had
// no regression pin of their own. Each pin below ties the README wording to
// the exact code that must keep backing it.

test("README inventory claim keeps robots.txt and sitemap discovery", () => {
  assert.match(liveSection, /High-scale crawl inventory from robots\.txt and sitemaps/i);
  assert.match(crawlInventorySource, /sitemapSeeds\(start, options\.robots, options\.sitemap\)/, "inventory seeds from robots.txt and sitemaps");
  assert.match(crawlInventorySource, /source: "robots-and-sitemaps"/, "inventory rows carry the robots/sitemap source");
});

test("README large-crawl claim keeps stored frontier, proof, and retry state", () => {
  assert.match(liveSection, /stored frontier\/proof\/retry state/i);
  assert.ok(migrationHas("large_crawl_frontier"), "large-crawl frontier table exists");
  assert.ok(migrationHas("large_crawl_url_proofs"), "large-crawl proof table exists");
  assert.match(largeRenderedCrawlSource, /retryLargeRenderedCrawlFailures/, "large-crawl retry logic exists");
  assert.match(largeCrawlsSource, /retryLargeRenderedCrawlFailures/, "large-crawl routes expose retries");
});

test("README competitor claim keeps competitor-backed repair gaps in reports and briefs", () => {
  assert.match(liveSection, /with competitor-backed repair gaps added to reports and briefs/i);
  assert.match(auditEngineSource, /competitorBenchmarkBriefLines/, "briefs include competitor-backed repair lines");
  assert.match(auditEngineSource, /competitorBenchmark: report\.competitorBenchmark/, "reports embed competitor benchmark gaps");
});

test("README AI readiness claim keeps optional /llms.txt reachability checks", () => {
  assert.match(liveSection, /optional `\/llms\.txt` reachability/i);
  assert.match(aiReadinessSource, /normalizeDiscoveryFile\(options\.llmsTxt/, "AI readiness accepts optional llms.txt proof");
  assert.match(aiReadinessSource, /discoveryFilesCheck/, "llms.txt reachability is checked");
});

test("README repair queue claim keeps acceptance checks, status, and action mode", () => {
  assert.match(liveSection, /Persistent repair queue records for saved reports/i);
  assert.match(repairQueueSource, /acceptance: cleanText\(/, "queue records keep acceptance checks");
  assert.match(repairQueueSource, /actionMode: cleanActionMode\(/, "queue records keep action mode");
  assert.match(allMigrations, /action_mode TEXT/, "queue items store action mode");
  assert.match(allMigrations, /status TEXT/i, "queue items store status");
});

test("README repair board claim keeps no external publishing side effects", () => {
  assert.match(liveSection, /and no external publishing side effects/i);
  assert.match(appSource, /Drafts are saved for review and do not publish anything\./, "board drafts never publish externally");
});

test("README implementation pack claim keeps approved change text", () => {
  assert.match(liveSection, /with source proof, approved change text/i);
  assert.match(implementationPackSource, /Implementation pack needs an approved proposed change\./, "pack requires an approved change");
  assert.match(implementationPackSource, /Apply only the approved change above\./, "pack instructs applying only the approved change");
});

test("README proposal claim keeps execution modes, owner approval, and delivery state", () => {
  assert.match(liveSection, /with execution modes, owner approval, delivery state/i);
  assert.match(allMigrations, /execution_mode TEXT/, "proposals store execution mode");
  assert.match(allMigrations, /approval_status TEXT/, "proposals store owner approval");
  assert.match(allMigrations, /delivery_status TEXT/, "proposals store delivery state");
  assert.match(reportsSource, /SET approval_status = \?/, "approve endpoint updates owner approval");
});

test("README schedule claim keeps dashboard add and pause controls", () => {
  assert.match(liveSection, /Weekly self-serve audit monitors backed by D1 `audit_schedules`, with dashboard controls to add or pause monitors for verified hosts/i);
  assert.match(appSource, /Adding weekly monitor\./, "dashboard adds monitors");
  assert.match(appSource, /await pauseAuditSchedule\(/, "dashboard pauses monitors");
});

test("README developer API claim keeps safe repair_queue issue status", () => {
  assert.match(liveSection, /safe `repair_queue` issue status/i);
  assert.match(developerApiSource, /Safe per-issue queue status\./, "API documents queue status as safe");
  assert.match(developerApiSource, /Draft text is only returned/, "draft change text stays owner-scoped");
});

test("README retention claim keeps cleanup for expired reports, sessions, and quota buckets", () => {
  assert.match(liveSection, /30-day report retention with cleanup for expired reports, sessions, and quota buckets/i);
  assert.match(dbSource, /cleanupExpiredRows/, "scheduled cleanup exists");
  assert.match(dbSource, /deleteReportRowsWithBlobs/, "expired reports are cleaned");
  assert.match(dbSource, /SELECT id, report_json FROM audit_reports/, "expired report rows are selected for cleanup");
  assert.match(dbSource, /DELETE FROM beta_sessions/, "expired sessions are cleaned");
  assert.match(dbSource, /DELETE FROM audit_usage/, "quota buckets are cleaned");
});
