import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createAuditEngine } from "../../shared/audit-engine.js";
import { auditUrl } from "../../server/audit/engine.js";
import { renderedFixture } from "./audits.js";
import {
  buildPublicCheckResponse,
  checkHtml,
  checkJsonLd,
  friendlyCheckError,
  publicCheckQuotaChecks,
  runPublicCheck,
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

test("engine failures map to visitor copy, never raw browser diagnostics", () => {
  // Raw Playwright errors that used to reach the /check error box verbatim.
  assert.equal(
    friendlyCheckError("net::ERR_NAME_NOT_RESOLVED at https://not-a-url-at-all/"),
    "That address does not resolve to a website. Check the spelling and try again."
  );
  assert.equal(
    friendlyCheckError("net::ERR_CONNECTION_RESET at https://example.com/"),
    "The site did not respond. It may be down, blocking checkers, or the address may be wrong. Try another public URL."
  );
  assert.equal(
    friendlyCheckError("net::ERR_CONNECTION_TIMED_OUT at https://slow.example.com/"),
    "The site did not respond. It may be down, blocking checkers, or the address may be wrong. Try another public URL."
  );
  assert.equal(
    friendlyCheckError("net::ERR_CERT_AUTHORITY_INVALID at https://bad-cert.example.com/"),
    "The site has a certificate problem, so the check browser could not open it securely. Try another public URL."
  );
  assert.equal(
    friendlyCheckError("net::ERR_ABORTED at https://example.com/"),
    "The page did not finish loading. Try again in a moment."
  );
  // Any other net::ERR class still gets a human line instead of the protocol dump.
  assert.equal(
    friendlyCheckError("net::ERR_TOO_MANY_REDIRECTS at https://loopy.example.com/"),
    "The page could not be loaded from that address. Check the URL and try again."
  );
  // Unmatched engine wording is preserved so no failure mode is hidden.
  const engineWording = "PageSpeed Insights returned HTTP 500.";
  assert.equal(friendlyCheckError(engineWording), engineWording);
  // Unknown input keeps the generic fallback and stays bounded.
  const fallback = friendlyCheckError("");
  assert.equal(fallback, "The check failed. Try another public URL.");
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

// The bucket tests above pin KEY GENERATION only. This test drives the real
// route against an `audit_usage` table where every bucket is already at its
// cap and proves the handler returns 429 BEFORE the audit engine is touched.
// Without it, disabling the `!quota.ok` guard in public-check.js leaves the
// whole suite green (mutation-proved). A D1 insert reports
// `{ meta: { changes: 0 } }` when `WHERE count < limit` matches nothing, which
// is exactly what an exhausted bucket returns.
test("public check route returns 429 from an exhausted audit_usage bucket with zero audit-engine work", async () => {
  const statements = [];
  const exhaustedDb = {
    prepare(sql) {
      statements.push(String(sql));
      return {
        bind() {
          return {
            run: async () => ({ meta: { changes: 0 } })
          };
        }
      };
    }
  };

  // The audit engine reads these env bindings the moment it is wired up
  // (worker/routes/audits.js auditUrl). Recording those reads gives a direct,
  // deterministic "the engine was never invoked" signal — no browser, no
  // network. The target is a public literal IP, so the route's private-address
  // check also short-circuits syntactically without a DoH lookup.
  const engineBindingsRead = [];
  const env = new Proxy(
    {
      WAITLIST_DB: exhaustedDb,
      BROWSER: "engine-must-not-run",
      GOOGLE_PAGESPEED_API_KEY: "",
      PAGESPEED_API_KEY: "",
      SEOFIXKIT_PAGESPEED_DISABLED: "1"
    },
    {
      get(target, prop) {
        if (
          typeof prop === "string" &&
          ["BROWSER", "GOOGLE_PAGESPEED_API_KEY", "PAGESPEED_API_KEY", "SEOFIXKIT_PAGESPEED_DISABLED"].includes(prop)
        ) {
          engineBindingsRead.push(prop);
        }
        return target[prop];
      }
    }
  );

  const request = new Request("https://seofixkit.com/api/public-check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "198.51.100.7"
    },
    body: JSON.stringify({ url: "https://93.184.216.34/" })
  });

  const response = await runPublicCheck(request, env);

  assert.equal(response.status, 429, "an exhausted quota must reject the check with 429");
  assert.ok(
    statements.some((sql) => sql.includes("INSERT INTO audit_usage") && sql.includes("ON CONFLICT(bucket)")),
    "the route must enforce quota through the audit_usage table"
  );
  const body = await response.json();
  assert.match(body.error, /limit/i, "429 body explains the rate limit");
  assert.ok(body.resetAt, "429 body carries the bucket reset time");
  assert.deepEqual(engineBindingsRead, [], "the audit engine must never be wired up for an exhausted quota");
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
  const markupFinding = payload.findings.find((finding) => finding.title === "Long title on home");
  assert.equal(
    markupFinding.proposedMarkup,
    "<title>Rendered SaaS page with real content</title>",
    "the engine's generated repair markup is exposed as proposedMarkup"
  );
  assert.equal(
    "snippet" in markupFinding,
    false,
    "generated repair markup must never be exposed under an unlabeled snippet field"
  );
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

test("public check page labels generated repair markup as a proposed change, never an exact snippet", () => {
  const html = checkHtml(origin);
  assert.doesNotMatch(html, /exact snippet/i, "the page must not call generated markup an exact snippet");
  assert.doesNotMatch(html, /observed snippet/i, "the page must not call generated markup an observed snippet");
  assert.match(html, /proposed markup change/i, "the panel copy names the block a proposed markup change");
  assert.match(html, /finding\.proposedMarkup/, "the renderer reads the explicitly named field");
  assert.match(
    html,
    /Proposed change — generated repair markup, not a quote from the page/,
    "the code block carries an explicit label before the markup"
  );
  assert.match(html, /snippet-label/, "the label has a distinct style class");
});

test("public check page carries WebPage and truthful FAQ JSON-LD", () => {
  const blocks = jsonLdBlocks(checkHtml(origin));
  assert.ok(blocks.length >= 1, "check page should emit WebPage and FAQPage JSON-LD");
  const graph = blocks.flatMap((block) => (Array.isArray(block["@graph"]) ? block["@graph"] : [block]));
  const webpage = graph.find((node) => node["@type"] === "WebPage");
  const faq = graph.find((node) => node["@type"] === "FAQPage");

  assert.ok(webpage, "WebPage JSON-LD is present");
  assert.equal(webpage.name, "Check One Page for SEO Proof - SEO Fix Kit");
  assert.equal(webpage.url, "https://seofixkit.com/check");
  assert.equal(webpage.isPartOf.name, "SEO Fix Kit");
  assert.equal(webpage.publisher["@type"], "Organization");
  assert.equal(webpage.mainEntity["@id"], "https://seofixkit.com/check#faq");

  assert.ok(faq, "FAQPage JSON-LD is present");
  assert.ok(Array.isArray(faq.mainEntity) && faq.mainEntity.length >= 4, "FAQ has the visible questions");
  const questionNames = faq.mainEntity.map((question) => question.name);
  assert.ok(questionNames.includes("What does the one-page check measure?"));
  assert.ok(questionNames.includes("Is anything about my check stored?"));
  assert.ok(questionNames.includes("Is this a full site audit?"));
  assert.ok(questionNames.includes("Does this check promise rankings or traffic?"));
  for (const question of faq.mainEntity) {
    assert.ok(question.acceptedAnswer?.text, "every FAQ question has an answer");
  }

  const serialized = JSON.stringify(graph);
  assert.doesNotMatch(serialized, /guarantees rankings|guarantees traffic|guaranteed rankings/i, "schema must not overclaim");
  const noPromiseAnswer = faq.mainEntity.find((question) => question.name === "Does this check promise rankings or traffic?");
  assert.match(noPromiseAnswer.acceptedAnswer.text, /does not guarantee rankings, traffic, indexing, revenue, AI citations/i);
  const storedAnswer = faq.mainEntity.find((question) => question.name === "Is anything about my check stored?");
  assert.match(storedAnswer.acceptedAnswer.text, /nothing about your check is saved/i);

  // Every schema answer is a claim a visitor can read in the rendered page.
  const html = checkHtml(origin);
  for (const question of faq.mainEntity) {
    assert.match(html, new RegExp(escapeRegex(question.name)), `visible page shows the question: ${question.name}`);
    assert.match(html, new RegExp(escapeRegex(question.acceptedAnswer.text.slice(0, 60))), `visible page backs the answer for: ${question.name}`);
  }

  // The standalone builder must produce the same script the page embeds.
  assert.ok(checkJsonLd(origin).includes('"@type":"WebPage"'));
  assert.ok(checkJsonLd(origin).includes('"@type":"FAQPage"'));
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

// Regression: the public /check response is a direct mapping of the engine
// report, so same-origin Cloudflare origin hiccups (522 connection timed out,
// 523 origin unreachable, 524 origin did not answer in time) must never reach
// the anonymous surface as critical "broken internal links" findings. The
// report maps verbatim: if the engine emitted them, /check would show them —
// this pins the surface, not just the classifier.
test("public check never reports same-origin 522/523/524 link failures as critical broken links", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      miniFakeBrowser({
        finalUrl: "https://public.example/",
        title: "Proof page with useful content",
        description: "A proof-backed page.",
        canonical: "https://public.example/",
        hreflangs: [],
        h1s: ["Proof page"],
        headings: [{ level: "h1", text: "Proof page" }],
        links: [
          { text: "About", href: "https://public.example/about", rawHref: "/about" },
          { text: "Contact", href: "https://public.example/contact", rawHref: "/contact" },
          { text: "Pricing", href: "https://public.example/pricing", rawHref: "/pricing" },
          { text: "Reference", href: "https://other.example/ref", rawHref: "https://other.example/ref" }
        ],
        internalLinks: [
          { text: "About", href: "https://public.example/about", rawHref: "/about" },
          { text: "Contact", href: "https://public.example/contact", rawHref: "/contact" },
          { text: "Pricing", href: "https://public.example/pricing", rawHref: "/pricing" }
        ],
        externalLinks: [
          { text: "Reference", href: "https://other.example/ref", rawHref: "https://other.example/ref" }
        ],
        images: [],
        imagesMissingAlt: [],
        scripts: [],
        stylesheets: [],
        openGraph: {},
        twitter: {},
        schemaTypes: [],
        schemaErrors: [],
        navigationTiming: {},
        resourceTimings: [],
        resourceTimingsTotal: 0,
        wordCount: 18,
        bodyText: "Proof page with useful content.",
        bodySample: "Proof page with useful content."
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      const originFailures = {
        "https://public.example/about": 523,
        "https://public.example/contact": 522,
        "https://public.example/pricing": 524
      };
      if (originFailures[url]) {
        return new Response("origin not reachable", { status: originFailures[url], headers: { "content-type": "text/html" } });
      }
      if (url === "https://other.example/ref") {
        return new Response("origin unreachable", { status: 523, headers: { "content-type": "text/html" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const payload = buildPublicCheckResponse(report);

  assert.equal(payload.issues.critical, 0, "a scan-time origin hiccup must not surface as a critical on /check");
  assert.ok(
    !payload.findings.some((finding) => /Broken internal links/.test(finding.title || "")),
    "/check must not list a broken-internal-links finding for same-origin 522/523/524"
  );

  const external = payload.findings.find((finding) => /Broken external links/.test(finding.title || ""));
  assert.ok(external, "an external origin failure is still a real observation on /check");
  assert.equal(external.severity, "warning");
  assert.match(external.evidence, /other\.example\/ref returned 523/, "external 523 stays evidenced");
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
        fix: "Shorten the title.",
        snippet: "<title>Rendered SaaS page with real content</title>"
      }
    ]
  };
}

// Minimal browser double for the shared engine: only the render contract the
// engine needs (newPage -> goto -> evaluate -> close), returning the supplied
// rendered facts. No interception hooks are installed when route/on are absent.
function miniFakeBrowser(renderedFacts) {
  return {
    async newPage() {
      return {
        async goto() {
          return { status: () => 200 };
        },
        async evaluate() {
          return renderedFacts;
        },
        async close() {}
      };
    },
    async close() {}
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

// Pass-6 collapsed the waitlist-shell pages (/demo, /methodology, /packages)
// below 320px; /check was missed. This test pins the same collapse on
// /check so the 320px floor cannot come back, and so the regression fails
// before the fix and passes after it (red-before, green-after).
test("public check page collapses to viewport below 320px without hiding overflow", async () => {
  const { chromium } = await import("playwright");
  const html = checkHtml(origin);

  assert.doesNotMatch(
    html,
    /overflow-x\s*:\s*hidden/i,
    "/check must wrap shell content instead of hiding document overflow"
  );
  assert.doesNotMatch(
    html,
    /min-width\s*:\s*320px/i,
    "/check body must not pin the shell at 320px"
  );

  const widths = [240, 260, 280, 300, 320, 360, 390];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const measured = await page.evaluate(() => {
        const root = document.documentElement;
        const main = document.querySelector("main");
        const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          htmlOverflowX: getComputedStyle(root).overflowX,
          bodyOverflowX: getComputedStyle(document.body).overflowX,
          mainRight: main ? main.getBoundingClientRect().right : null,
          formRight: (() => {
            const form = document.querySelector("form.check-form");
            return form ? form.getBoundingClientRect().right : null;
          })(),
          text: compact(document.body.textContent)
        };
      });
      await page.close();

      assert.notEqual(
        measured.htmlOverflowX,
        "hidden",
        `/check html overflow-x must stay visible at ${width}px`
      );
      assert.notEqual(
        measured.bodyOverflowX,
        "hidden",
        `/check body overflow-x must stay visible at ${width}px`
      );
      assert.equal(
        measured.scrollWidth,
        measured.clientWidth,
        `/check shell must collapse to viewport at ${width}px: scrollWidth=${measured.scrollWidth} clientWidth=${measured.clientWidth}`
      );
      assert.ok(
        measured.mainRight === null || measured.mainRight <= width + 0.5,
        `/check main right edge must stay inside viewport at ${width}px: mainRight=${measured.mainRight}`
      );
      assert.ok(
        measured.formRight === null || measured.formRight <= width + 0.5,
        `/check form right edge must stay inside viewport at ${width}px: formRight=${measured.formRight}`
      );
      assert.ok(measured.text.length > 100, `/check must keep its body copy at ${width}px`);
    }
  } finally {
    await browser.close();
  }
});

function jsonLdBlocks(html) {
  return [...String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
