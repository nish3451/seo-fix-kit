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
  assert.match(liveSection, /Public `\/demo`, `\/methodology`, and `\/packages` pages/i);
  for (const path of ["/demo", "/methodology", "/packages"]) {
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
    "/beta"
  ];
  for (const route of claimedRoutes) {
    assert.ok(workerIndex.includes(route), `Worker must register route ${route}`);
  }
});

test("README abuse-control claim matches D1 buckets for every listed surface", () => {
  assert.match(liveSection, /D1-backed abuse controls/i);
  for (const bucket of ["waitlist:ip", "login:ip", "access:ip", "audit:ip", "audit:session", "audit:target", "audit:lite-day"]) {
    const source = bucket.startsWith("audit") ? auditsSource : readFileSync(new URL("../worker/routes/access.js", import.meta.url), "utf8");
    assert.ok(source.includes(`bucket: \`${bucket}`), `abuse control must cover ${bucket}`);
  }
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
  assert.match(liveSection, /Proof Monitoring has a config-gated Dodo subscription checkout path/i);
  assert.match(
    liveSection,
    /Repair Sprint checkout, Repair Agent checkout, and paid Agency Workspace checkout are not live yet/i
  );
  assert.match(offersSource, /statusLabel: "Config gated"/, "Proof Monitoring is labeled config-gated");
  const pausedCheckouts = (offersSource.match(/checkoutState: "paused"/g) || []).length;
  assert.ok(pausedCheckouts >= 3, `at least three non-live checkouts (found ${pausedCheckouts})`);
});

test("README AI Answer Readiness claim stays free of live AI sampling", () => {
  assert.match(liveSection, /no live AI-engine sampling or citation monitoring/i);
  assert.match(aiReadinessSource, /does not sample AI engines or monitor citations/);
  assert.match(aiReadinessSource, /not live answer-engine sampling or citation monitoring/);
});

test("README growth-opportunity claim stays draft-only", () => {
  assert.match(liveSection, /Draft-only growth opportunities/i);
  assert.match(growthSource, /status: "draft_only"/, "growth opportunities are draft-only records");
  assert.match(
    growthSource,
    /do not publish content, create CMS drafts, open pull requests, or promise rankings/,
    "no auto-publishing or ranking promises"
  );
});

test("README site-claim promise matches verified-host flow and apex/www folding", () => {
  assert.match(liveSection, /non-founder audits require a verified host \(apex and www count as one site\)/i);
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
  assert.match(liveSection, /without claiming SEOFixKit published or guaranteed the repair/i);
  assert.match(proofReceiptSource, /does not mean SEOFixKit published, merged, indexed, ranked, or guaranteed the change/);
  assert.match(proofReceiptSource, /Rankings, traffic, indexing, AI citations, and revenue are not guaranteed/);
});
