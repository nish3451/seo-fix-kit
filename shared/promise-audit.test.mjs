import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
