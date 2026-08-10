import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { auditUrl } from "../../server/audit/engine.js";
import { renderedFixture } from "./audits.js";
import {
  buildPublicCheckResponse,
  checkHtml,
  publicCheckQuotaChecks,
  validatePublicCheckUrl
} from "./public-check.js";

const origin = "https://seofixkit.com";

test("public check URL validation rejects malformed and private targets", () => {
  assert.equal(validatePublicCheckUrl("").ok, false);
  assert.equal(validatePublicCheckUrl("not a url").ok, false);
  assert.equal(validatePublicCheckUrl("http://localhost:3000/").ok, false);
  assert.equal(validatePublicCheckUrl("http://10.0.0.5/").ok, false);
  assert.equal(validatePublicCheckUrl("http://127.0.0.1/").ok, false);
  assert.equal(validatePublicCheckUrl("http://[::1]/").ok, false);
  assert.equal(validatePublicCheckUrl("http://my-site.local/").ok, false);
  assert.equal(validatePublicCheckUrl("https://my-site.internal/").ok, false);
  assert.equal(validatePublicCheckUrl("ftp://example.com/").ok, false);
  assert.equal(validatePublicCheckUrl("ftp://example.com/file.pdf").ok, false);
  assert.equal(validatePublicCheckUrl("mailto:hello@example.com").ok, false);
  assert.equal(validatePublicCheckUrl("https://user:pass@example.com/").ok, false);

  const ok = validatePublicCheckUrl("example.com/about?q=1");
  assert.equal(ok.ok, true);
  assert.equal(ok.url, "https://example.com/about?q=1");

  const protocolRelative = validatePublicCheckUrl("//example.com/about");
  assert.equal(protocolRelative.ok, true);
  assert.equal(protocolRelative.url, "https://example.com/about");
});

test("public check quota buckets cover per-network and per-site windows without storing the target host", async () => {
  const checks = await publicCheckQuotaChecks("iphash123", "Example.COM");
  const keys = checks.map((check) => check.bucket);
  assert.ok(keys.some((key) => key.startsWith("check:ip-hour:") && key.endsWith(":iphash123")), "per-IP hourly bucket");
  assert.ok(keys.some((key) => key.startsWith("check:ip-day:")), "per-IP daily bucket");
  const targetHourKey = keys.find((key) => key.startsWith("check:target-hour:"));
  assert.ok(targetHourKey, "per-site hourly bucket");
  assert.ok(keys.some((key) => key.startsWith("check:target-day:")), "per-site daily bucket");
  assert.doesNotMatch(targetHourKey, /example\.com/i, "the target host must never be stored in plaintext");
  assert.ok(/^check:target-hour:[^:]+:[0-9a-f]{32}$/.test(targetHourKey), "the target bucket ends in a 32-hex host hash");
  const sameHost = await publicCheckQuotaChecks("iphash123", "Example.COM");
  assert.deepEqual(
    sameHost.map((check) => check.bucket),
    keys,
    "the same host hashes to the same bucket keys"
  );
  const otherHost = await publicCheckQuotaChecks("iphash123", "other-site.example");
  assert.notDeepEqual(
    otherHost.map((check) => check.bucket),
    keys,
    "a different host hashes to different bucket keys"
  );
  assert.ok(checks.every((check) => Number(check.limit) > 0), "all limits are positive");
});

test("public check response is built only from engine fields with truthful copy", () => {
  const payload = buildPublicCheckResponse(makeEngineShapedReport());
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "one-page-check");
  assert.equal(payload.checkedUrl, "https://example.com/");
  assert.equal(payload.measured.staticWordCount, 3);
  assert.equal(payload.measured.renderedWordCount, 277);
  assert.equal(payload.measured.renderedH1, "Rendered SaaS page with real content");
  assert.equal(payload.measured.renderedInternalLinkCount, 3);
  assert.equal(payload.guards.length, 1);
  assert.equal(payload.guards[0].severity, "good");
  assert.equal(payload.guards[0].evidence, "277 rendered words found.");
  assert.equal(payload.findings[0].severity, "critical");
  assert.equal(payload.findings[0].title, "Canonical conflicts with noindex on home");
  assert.equal(payload.issues.guardedFalsePositives, 1);
  assert.equal(payload.issues.critical, 2);
  assert.ok(payload.nextStep.includes("private beta"), "next step hands off into private access");
  assert.ok(payload.boundary.includes("does not guarantee rankings"), "boundary keeps the no-ranking promise");
});

test("public check page is searchable and hands off into private access", () => {
  const html = checkHtml(origin);
  assert.ok(visibleWordCount(html) >= 250, "check page should not look thin to rendered audits");
  assert.match(html, /rel="canonical" href="https:\/\/seofixkit\.com\/check"/);
  assert.match(html, /id="check-form"/);
  assert.match(
    html,
    /id="url-input" name="url" type="text" inputmode="url"/,
    "the URL input must not block scheme-less entries client-side"
  );
  assert.match(html, /https:\/\/seofixkit\.com\/api\/public-check/);
  assert.match(html, /no report or URL is stored/i);
  assert.match(html, /short-lived anonymous rate-limit counters/i);
  assert.match(html, /Request private access/);
  assert.match(html, /href="https:\/\/seofixkit\.com\/">SEO Fix Kit<\/a>/);
  assert.match(html, /href="https:\/\/seofixkit\.com\/support"/, "the anonymous check links to support");
  assert.match(html, /href="https:\/\/seofixkit\.com\/terms"/, "the anonymous check links to terms");
  assert.match(html, /href="https:\/\/seofixkit\.com\/privacy"/, "the anonymous check links to the privacy policy that backs its nothing-stored copy");
  assert.doesNotMatch(html, /noindex/i, "the entry page must stay searchable");
});

// The fixture is the same public test page the private demo audit renders:
// a thin static shell that the browser fills with real content. The real
// engine must produce measured proof, a guarded false positive, and an
// actionable finding, and buildPublicCheckResponse must surface exactly
// those fields — nothing hand-written.
test("public check output is verbatim engine output for the public test page", async () => {
  const server = http.createServer((req, res) => {
    const fixtureOrigin = `http://${req.headers.host}`;
    if (req.url.startsWith("/fixture/rendered-page")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" });
      res.end(renderedFixture(fixtureOrigin));
      return;
    }
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(`User-agent: *\nAllow: /\n\nSitemap: ${fixtureOrigin}/sitemap.xml\n`);
      return;
    }
    if (req.url === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${fixtureOrigin}/fixture/rendered-page</loc></url></urlset>`);
      return;
    }
    if (req.url === "/llms.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(`# SEO Fix Kit\n\nPublic proof pages:\n- ${fixtureOrigin}/check\n- ${fixtureOrigin}/demo\n`);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const fixtureOrigin = `http://127.0.0.1:${server.address().port}`;
    const report = await auditUrl(`${fixtureOrigin}/fixture/rendered-page`, {
      maxPages: 1,
      pageSpeed: false,
      appOrigin: fixtureOrigin
    });
    const payload = buildPublicCheckResponse(report);

    assert.equal(payload.checkedUrl, `${fixtureOrigin}/fixture/rendered-page`);
    assert.equal(payload.measured.renderedWordCount, report.pages[0].rendered.wordCount);
    assert.ok(payload.measured.renderedWordCount >= 250, "fixture renders substantial content");
    assert.equal(payload.measured.renderedH1, report.pages[0].rendered.h1s[0]);
    assert.ok(payload.guards.length >= 1, "the engine must emit a guarded false positive");
    assert.equal(payload.guards[0].severity, "good");
    assert.ok(
      payload.findings.some((finding) => finding.title.includes("Canonical conflicts with noindex")),
      "the fixture must surface an actionable finding"
    );
    assert.equal(payload.issues.guardedFalsePositives, report.summary.guardedFalsePositives);
    assert.equal(payload.issues.critical, report.summary.critical);
    assert.ok(payload.nextStep.includes("private beta"));
    assert.ok(payload.boundary.includes("does not guarantee rankings"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// A minimal report in the exact shape the shared engine produces, used to
// pin the response mapping without a browser.
function makeEngineShapedReport() {
  return {
    url: "https://example.com/",
    scannedAt: "2026-08-09T00:00:00.000Z",
    durationMs: 1234,
    pages: [
      {
        url: "https://example.com/",
        finalUrl: "https://example.com/",
        static: { wordCount: 3 },
        rendered: {
          finalUrl: "https://example.com/",
          wordCount: 277,
          title: "Proof Demo App Shell",
          h1s: ["Rendered SaaS page with real content"],
          internalLinks: [{ href: "/a" }, { href: "/b" }, { href: "/c" }]
        }
      }
    ],
    summary: { critical: 2, warnings: 1, notices: 0, guardedFalsePositives: 1, totalFindings: 4 },
    findings: [
      {
        type: "guard",
        severity: "good",
        title: "False positive guarded on home: rendered content is not thin",
        why: "The static HTML looks thin, but users and modern crawlers see substantial rendered content.",
        evidence: "277 rendered words found.",
        fix: "No thin-content fix is needed for this page based on rendered text."
      },
      {
        type: "issue",
        severity: "critical",
        title: "Canonical conflicts with noindex on home",
        why: "A page should not consolidate signals while telling engines not to index it.",
        evidence: "Canonical: https://example.com/; robots meta: noindex.",
        fix: "If the page should rank, remove noindex."
      },
      {
        type: "issue",
        severity: "critical",
        title: "Noindex found on home",
        fix: "Remove noindex if this page should appear in search."
      },
      {
        type: "issue",
        severity: "warning",
        title: "Long title on home",
        fix: "Shorten the title."
      }
    ]
  };
}

function visibleWordCount(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
