import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import nodeVm from "node:vm";
import { auditUrl } from "../../server/audit/engine.js";
import { renderedFixture } from "./audits.js";
import {
  buildPublicCheckResponse,
  checkHtml,
  checkJsonLd,
  friendlyCheckError,
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

test("public check URL validation rejects single-label hostnames before any render", () => {
  // A dotless hostname is a typo, an intranet name, or a local alias — never
  // a public website. It must fail here with the friendly validation message
  // instead of sending the browser to `https://notaurl/` and returning a raw
  // `net::ERR_*` navigation failure.
  for (const input of ["notaurl", "example", "intranet", "https://printer/", "http://nish-laptop"]) {
    const result = validatePublicCheckUrl(input);
    assert.equal(result.ok, false, `dotless hostname must be rejected: ${input}`);
    assert.equal(result.error, "Enter a valid public website URL.", `friendly message for: ${input}`);
  }
  // Dotted public hosts and IP literals still pass through to the browser.
  assert.equal(validatePublicCheckUrl("example.com").ok, true);
  assert.equal(validatePublicCheckUrl("https://8.8.8.8/").ok, true);
});

test("public check browser failures are mapped to friendly, actionable error copy", () => {
  assert.equal(
    friendlyCheckError(new Error("net::ERR_NAME_NOT_RESOLVED at https://nonexistent-domain-xyzzy-12345.com/")),
    "That domain could not be found. Check the spelling and try again."
  );
  assert.equal(
    friendlyCheckError(new Error("net::ERR_CONNECTION_RESET at https://notaurl/")),
    "The site reset the connection. It may be down or blocking automated browsers."
  );
  assert.equal(
    friendlyCheckError(new Error("net::ERR_CONNECTION_REFUSED at https://down.site/")),
    "The site refused the connection. It may be down or blocking automated browsers."
  );
  assert.equal(
    friendlyCheckError(new Error("net::ERR_TIMED_OUT at https://slow.site/")),
    "The connection timed out before the page could load. Try again later or check the address."
  );
  assert.equal(
    friendlyCheckError(new Error("net::ERR_CONNECTION_TIMED_OUT at https://slow.site/")),
    "The connection timed out before the page could load. Try again later or check the address."
  );
  assert.equal(
    friendlyCheckError(new Error("net::ERR_SSL_PROTOCOL_ERROR at https://bad-tls.site/")),
    "The site did not serve a valid secure connection. Check that the address is spelled correctly."
  );
  assert.equal(
    friendlyCheckError(new Error("net::ERR_ABORTED")),
    "The page load was aborted before it finished. Try again in a moment."
  );
  assert.equal(
    friendlyCheckError(new Error("net::ERR_UNKNOWN_WEIRD at https://x.example/")),
    "Could not open that page in a real browser. The site may be down, blocking automated browsers, or the address may be wrong."
  );
  assert.equal(
    friendlyCheckError(new Error("page.goto: Timeout 25000ms exceeded.")),
    "The page took too long to load. Try again later or check the address."
  );
  // Unknown failures keep the previous truncated-message behavior.
  assert.equal(friendlyCheckError(new Error("some other engine failure")), "some other engine failure");
  assert.equal(friendlyCheckError(new Error()), "The check failed. Try another public URL.");
});

test("public check page validates the URL client-side before any network round trip", () => {
  const html = checkHtml(origin);
  assert.match(html, /function publicUrlError\(value\)/, "the page carries a client-side validator");
  assert.match(html, /single-label hostname/, "the validator mirrors the server-side public-URL rule");
  assert.ok(
    (html.match(/Enter a valid public website URL\./g) || []).length >= 2,
    "the validator emits the same friendly message the server emits"
  );
  const submit = html.match(/form\.addEventListener\("submit"[\s\S]*?finally\s*\{[\s\S]*?\}\)\(\);/);
  assert.ok(submit, "submit handler present");
  assert.match(submit[0], /validationError/, "a validation failure short-circuits before the fetch");
  assert.ok(
    /if \(validationError\) \{[\s\S]*?return;[\s\S]*?\}/.test(submit[0]),
    "validation failure returns without fetching"
  );
  assert.match(html, /id="url-input" name="url" type="text" inputmode="url"/, "scheme-less entries stay allowed client-side");
});

test("the page's inline client-side validator actually executes with the server's rules", () => {
  // The page is a template literal; a validator that only looks right in the
  // source but breaks when served (e.g. a collapsed regex escape) must fail
  // here. Execute the served function text in a fresh context and pin both
  // the rejection and the acceptance sides.
  const html = checkHtml(origin);
  const served = html.match(/function publicUrlError[\s\S]*?return "";\n        }/);
  assert.ok(served, "the served page includes the full validator function");
  assert.match(
    served[0],
    /:\\\/\\\//,
    "the served validator regex must keep its escaped slash (a bare // would comment out the rest of the line)"
  );

  const sandbox = { URL, String };
  nodeVm.createContext(sandbox);
  const validator = nodeVm.runInContext(`(${served[0]})`, sandbox);

  for (const input of ["notaurl", "example", "intranet", "http://printer/", "", "https://"]) {
    assert.equal(validator(input), "Enter a valid public website URL.", `client rejects: ${input}`);
  }
  for (const input of ["example.com", "https://example.com/x", "example.com/about?q=1", "8.8.8.8", "//example.com/a"]) {
    assert.equal(validator(input), "", `client accepts: ${input}`);
  }
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

function jsonLdBlocks(html) {
  return [...String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
