import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditUrl } from "../../server/audit/engine.js";
import { escapeHtml, rootSitemap } from "../../shared/audit-engine.js";
import { DEMO_PROOF, DEMO_FIXTURE_PATH, demoProofSnippet } from "./demo-proof.js";
import { renderedFixture } from "./audits.js";
import { checkHtml } from "./public-check.js";
import {
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  packagesHtml,
  privacyHtml,
  supportHtml,
  termsHtml
} from "./pages.js";

const origin = "https://seofixkit.com";
const expectedSitemapUrls = [
  `${origin}/`,
  `${origin}/demo`,
  `${origin}/check`,
  `${origin}/methodology`,
  `${origin}/packages`,
  `${origin}/privacy`,
  `${origin}/support`,
  `${origin}/terms`
];

test("public proof pages expose methodology and package ladder without overclaims", () => {
  const methodology = methodologyHtml(origin);
  const packages = packagesHtml(origin);
  const combined = `${methodology}\n${packages}`;

  assert.match(methodology, /Proof first\. Repairs second\. Claims last\./);
  assert.match(methodology, /proof-derived AI Answer Readiness/);
  assert.match(methodology, /No AI visibility tracking/);
  assert.match(methodology, /draft-only growth briefs/);
  assert.match(methodology, /No hidden site writes/);
  assert.match(
    methodology,
    new RegExp(`<a href="${origin}/check">${origin}/check</a>`),
    "methodology must link the anonymous one-page check URL instead of leaving it plain text"
  );
  assert.match(
    methodology,
    new RegExp(`<a class="cta" href="${origin}/check">Check one page now</a>`),
    "methodology must carry a clickable CTA into the anonymous one-page check"
  );
  // Scout regression guard: every mention of the anonymous check URL on the
  // methodology page must be clickable (a link href or a link's anchor text),
  // never printed as plain text.
  {
    const checkUrl = `${origin}/check`;
    const totalMentions = methodology.split(checkUrl).length - 1;
    const hrefMentions = methodology.split(`href="${checkUrl}"`).length - 1;
    const linkTextMentions = methodology.split(`>${checkUrl}<`).length - 1;
    assert.ok(totalMentions > 0, "methodology must mention the anonymous one-page check");
    assert.equal(
      totalMentions,
      hrefMentions + linkTextMentions,
      `every /check mention on the methodology page must be a clickable link (${totalMentions} mentions, ${hrefMentions} link hrefs, ${linkTextMentions} link texts)`
    );
  }
  assert.match(methodology, /Why not just use a free AI SEO agent skill\?/);
  assert.match(methodology, /Open-source SEO tooling is good at that/, "the free-skill answer must not disparage open source");
  assert.match(methodology, /no live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/i);
  assert.match(
    methodology,
    new RegExp(`<a href="${origin}/packages">package ladder</a>`),
    "the free-skill answer must link the package ladder"
  );
  assert.match(
    methodology,
    new RegExp(`<a href="${origin}/check">${origin}/check</a>`),
    "the free-skill answer must keep a working link into the anonymous check"
  );
  assert.match(packages, /Wondering why a hosted service at all, when free installable AI SEO agent skills exist\?/);
  assert.match(
    packages,
    new RegExp(`<a href="${origin}/methodology">methodology page</a>`),
    "packages must cross-link the methodology free-skill answer"
  );
  assert.match(packages, /SEO Fix Pack/);
  assert.match(packages, /\$99\.00 one-time/);
  assert.match(packages, /Dodo shows the final checkout price/);
  assert.match(packages, /Proof Monitoring/);
  assert.match(packages, /Config-gated subscription/);
  assert.match(packages, /Access activates after Dodo webhook entitlement/);
  assert.match(packages, /Roadmap/);
  assert.doesNotMatch(combined, /completed 50K rendered validation/i);
  assert.doesNotMatch(combined, /guaranteed rankings/i);
});

test("machine-readable public surfaces list proof pages and limits", () => {
  const llms = llmsText(origin);
  const markdown = homeMarkdown(origin);
  const sitemap = rootSitemap(origin);

  assert.deepEqual(parseSitemapUrls(sitemap), expectedSitemapUrls);
  for (const path of ["/demo", "/methodology", "/packages", "/check"]) {
    assert.match(llms, new RegExp(`${origin}${path}`));
    assert.match(markdown, new RegExp(`${origin}${path}`));
    assert.match(sitemap, new RegExp(`${origin}${path}`));
  }
  assert.match(llms, /anonymous one-page check/i);
  assert.match(llms, /single-page proof check with per-network and per-site rate limits/i);
  assert.match(llms, new RegExp(`${origin}/llms\\.txt`));
  assert.match(llms, new RegExp(`${origin}/api/deep-health`));
  assert.doesNotMatch(sitemap, /\/llms\.txt/);
  assert.match(llms, /Does not provide live AI-engine visibility tracking/);
  assert.match(llms, /Proof Monitoring checkout is config-gated/);
  assert.match(llms, /Does not claim paid Proof Monitoring is active/);
  assert.match(llms, /Does not auto-publish growth content/);
  assert.match(llms, /implementation packs and repair proof receipts are private handoff\/proof documents/i);
  assert.match(llms, /does not publish CMS changes/i);
  assert.match(llms, /Agent-readable acquisition and action surfaces/);
  assert.match(llms, /\/api\/developer\/tokens/);
  assert.match(llms, /POST \/v1\/audits/);
  assert.match(llms, /GET \/v1\/audits\/\{audit_id\}\/repair-actions\/\{action_id\}\/implementation\.md/);
  assert.match(llms, /repair_action\.fixed/);
  assert.match(llms, /There is no live SEO Fix Kit MCP endpoint today/);
  assert.match(llms, /Does not expose unauthenticated agent actions/);
  assert.match(llms, /Hosted-only differentiators vs free installable SEO agent skills:/);
  assert.match(llms, /robots\.txt and sitemap crawl inventory up to 50,000 discovered URLs/);
  assert.match(llms, /staged large rendered crawl jobs for 50,000-page targets \(early access/);
  assert.match(llms, /never sold as completed 50K rendered validation/);
  assert.match(llms, /Persistent repair queue: proven issues stay tracked across saved reports with approval state, acceptance checks, status, and fixed-rerun proof receipts/);
  assert.match(llms, /Owner-approved implementation packs: private handoff documents with source proof and approval state/);
  assert.match(llms, /Paid Fix Pack fulfillment: one proof-backed repair pass per report plus one rerun after fixes/);
  assert.match(llms, new RegExp(`The plain answer is on ${origin}/methodology`));
  assert.match(llms, /no live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
  assert.match(markdown, new RegExp(`Anonymous one-page check: ${origin}/check`));
});

test("public proof pages carry a site footer with terms and privacy links", () => {
  const demo = demoHtml(origin);
  const methodology = methodologyHtml(origin);
  const packages = packagesHtml(origin);

  for (const html of [demo, methodology, packages]) {
    assert.match(html, /<footer class="site-footer">/, "proof pages must carry a site footer");
    assert.match(html, new RegExp(`href="${origin}/terms"`), "proof pages must link to terms");
    assert.match(html, new RegExp(`href="${origin}/privacy"`), "proof pages must link to privacy");
    assert.match(html, new RegExp(`href="${origin}/support"`), "proof pages must link to support");
  }
});

test("policy pages cross-link each other and the live anonymous check", () => {
  const privacy = privacyHtml(origin);
  const terms = termsHtml(origin);
  const support = supportHtml(origin);

  for (const html of [privacy, terms, support]) {
    assert.match(html, new RegExp(`href="${origin}/terms"`), "policy pages must link to terms");
    assert.match(html, new RegExp(`href="${origin}/privacy"`), "policy pages must link to privacy");
    assert.match(html, new RegExp(`href="${origin}/support"`), "policy pages must link to support");
    assert.match(
      html,
      new RegExp(`href="${origin}/check">Check one page now</a>`),
      "policy pages must carry a path to the live anonymous one-page check"
    );
  }
  assert.match(
    privacy,
    new RegExp(`href="${origin}/methodology"`),
    "the privacy page must not be a dead end"
  );
  assert.match(
    privacy,
    new RegExp(`href="${origin}/packages"`),
    "the privacy page must reach the package ladder"
  );
});

test("public demo and support pages carry enough buyer-facing detail", () => {
  const demo = demoHtml(origin);
  const support = supportHtml(origin);

  assert.ok(visibleWordCount(demo) >= 250, "demo page should not look thin to rendered audits");
  assert.ok(visibleWordCount(support) >= 250, "support page should not look thin to rendered audits");
  assert.match(demo, /What this sample proves/);
  assert.match(demo, /What this sample does not claim/);
  assert.match(demo, new RegExp(`Anonymous one-page checks are live at ${origin}/check`));
  assert.match(demo, /Check one page now/);
  assert.match(demo, /Neither the sample nor the one-page check promises rankings, traffic, indexing, revenue, AI citations/i);
  assert.doesNotMatch(demo, /not a public anonymous audit/i, "the demo no longer claims anonymous checks are unavailable");
  assert.match(support, /Delivery expectations/);
  assert.match(support, /do not send secrets, private keys, passwords, payment card numbers, or production credentials/i);
  assert.match(support, /We do not log into private CMS accounts, publish changes, merge code, or call provider admin APIs/i);
  assert.match(support, /Ownership and deletion/);
  assert.match(support, /sites you own or are authorized to audit/i);
});

test("public one-page check page is a truthful, searchable entry path", () => {
  const check = checkHtml(origin);

  assert.ok(visibleWordCount(check) >= 250, "check page should not look thin to rendered audits");
  assert.match(check, /Check One Page for SEO Proof/);
  assert.match(check, new RegExp(`rel="canonical" href="${origin}/check"`));
  assert.match(check, /id="check-form"/);
  assert.match(check, /Check this page/);
  assert.match(check, new RegExp(`${origin}/api/public-check`));
  assert.match(check, /Rendered evidence/);
  assert.match(check, /Guarded false positives/);
  assert.match(check, /Findings when present/);
  assert.match(check, /Measured handoff/);
  assert.match(check, /does not guarantee rankings, traffic, indexing, revenue, AI citations/i);
  assert.match(check, /Request private access/);
  assert.match(check, /Rate-limited per network and per site/i);
  assert.match(check, /no report or URL is stored/i);
  assert.match(check, /Frequently asked questions/);
  assert.match(check, /What does the one-page check measure\?/);
  assert.match(check, /Is anything about my check stored\?/);
  assert.match(check, /Is this a full site audit\?/);
  assert.match(check, /Does this check promise rankings or traffic\?/);
  assert.doesNotMatch(check, /noindex/i, "the entry page must stay searchable");
});

test("demo brief is verbatim real engine output for the public test page", async () => {
  const server = http.createServer((req, res) => {
    const fixtureOrigin = `http://${req.headers.host}`;
    if (req.url.startsWith(DEMO_FIXTURE_PATH)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" });
      res.end(renderedFixture(fixtureOrigin));
      return;
    }
    if (req.url === "/llms.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(`# SEO Fix Kit\n\nPublic proof pages:\n- ${fixtureOrigin}/demo\n- ${fixtureOrigin}/methodology\n- ${fixtureOrigin}/packages\n`);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const fixtureOrigin = `http://127.0.0.1:${server.address().port}`;
    // Same options the Worker's private demo audit uses: appOrigin synthesis
    // for robots/sitemap, one page, no PageSpeed pass.
    const report = await auditUrl(`${fixtureOrigin}${DEMO_FIXTURE_PATH}`, {
      maxPages: 1,
      pageSpeed: false,
      appOrigin: fixtureOrigin
    });

    assert.ok(report.findings.length >= DEMO_PROOF.guards.length + 1, "the engine must emit guarded findings plus real issues for the test page");
    for (const guard of DEMO_PROOF.guards) {
      const live = report.findings.find((finding) => finding.type === "guard" && finding.title === guard.title);
      assert.ok(live, `guarded finding missing from live engine output: ${guard.title}`);
      assert.equal(live.severity, guard.severity, `severity drifted for: ${guard.title}`);
      assert.equal(live.why, guard.why, `why drifted for: ${guard.title}`);
      assert.equal(live.evidence, guard.evidence, `evidence drifted for: ${guard.title}`);
      assert.equal(live.fix, guard.fix, `fix drifted for: ${guard.title}`);
    }

    const rendered = report.pages[0].rendered;
    const staticFacts = report.pages[0].static;
    assert.equal(staticFacts.wordCount, DEMO_PROOF.measured.staticWordCount);
    assert.equal(rendered.wordCount, DEMO_PROOF.measured.renderedWordCount);
    assert.equal(rendered.h1s[0], DEMO_PROOF.measured.renderedH1);
    assert.equal(rendered.internalLinks.length, DEMO_PROOF.measured.renderedInternalLinkCount);
    assert.equal(rendered.title, DEMO_PROOF.measured.renderedTitle);

    assert.ok(report.repairPlan.length >= DEMO_PROOF.repairPlan.length);
    for (const entry of DEMO_PROOF.repairPlan) {
      const live = report.repairPlan.find((item) => item.title === entry.title);
      assert.ok(live, `repair plan entry missing from live engine output: ${entry.title}`);
      assert.equal(live.fix, entry.fix, `fix drifted for: ${entry.title}`);
      assert.equal(live.snippet || "", entry.snippet.replaceAll("{ORIGIN}", fixtureOrigin), `snippet drifted for: ${entry.title}`);
    }

    const demo = demoHtml(origin);
    assert.match(demo, /Real engine output for the public test page/);
    assert.match(demo, /verbatim output from the SEO Fix Kit audit engine/i);
    assert.match(demo, new RegExp(`${origin}${DEMO_FIXTURE_PATH}`));
    for (const guard of DEMO_PROOF.guards) {
      const renderedEvidence = escapeHtml(guard.evidence)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(demo, new RegExp(renderedEvidence), `demo must render live evidence: ${guard.title}`);
    }
    assert.doesNotMatch(demo, /Sample developer brief/, "the demo must not show the hand-written brief anymore");
    assert.doesNotMatch(demo, /Rendered H1 is visible in the final DOM/, "the fabricated H1 evidence must be gone");
    assert.match(demo, /Check one page now/, "the demo must keep the low-friction entry into the live anonymous check");
  } finally {
    server.close();
  }
});

test("demo proof list reflows at 320px and 390px without hiding evidence", async () => {
  const { chromium } = await import("playwright");
  const html = demoHtml(origin);
  const expectedProofStrings = [
    ...DEMO_PROOF.guards.flatMap((guard) => [guard.title, guard.evidence, guard.why, guard.fix]),
    ...DEMO_PROOF.repairPlan.flatMap((item) => [
      item.title,
      item.fix,
      demoProofSnippet(item.snippet, origin)
    ].filter(Boolean))
  ].map((value) => String(value).replace(/\s+/g, " ").trim());

  assert.doesNotMatch(html, /overflow-x\s*:\s*hidden/i, "must wrap proof tokens instead of hiding document overflow");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const measured = await page.evaluate(() => {
        const root = document.documentElement;
        const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          htmlOverflowX: getComputedStyle(root).overflowX,
          bodyOverflowX: getComputedStyle(document.body).overflowX,
          overflowingItems: [...document.querySelectorAll("li")]
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => ({
              text: compact(el.innerText).slice(0, 220),
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth
            })),
          text: compact(document.body.textContent)
        };
      });

      assert.notEqual(measured.htmlOverflowX, "hidden", `html overflow-x must stay visible at ${width}px`);
      assert.notEqual(measured.bodyOverflowX, "hidden", `body overflow-x must stay visible at ${width}px`);
      assert.ok(
        measured.scrollWidth <= measured.clientWidth,
        `document overflow at ${width}px: scrollWidth=${measured.scrollWidth}/clientWidth=${measured.clientWidth} overflowing=${JSON.stringify(measured.overflowingItems)}`
      );
      assert.equal(
        measured.overflowingItems.length,
        0,
        `proof list items overflow at ${width}px: ${JSON.stringify(measured.overflowingItems)}`
      );
      for (const proof of expectedProofStrings) {
        assert.ok(
          measured.text.includes(proof),
          `proof string missing at ${width}px: ${proof.slice(0, 160)}`
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("static public skill and sitemap files keep buyer-facing boundaries", () => {
  const skill = readFileSync(new URL("../../public/.well-known/skill.md", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");

  assert.deepEqual(parseSitemapUrls(sitemap), expectedSitemapUrls);
  for (const path of ["/demo", "/methodology", "/packages", "/check", "/support", "/terms"]) {
    assert.match(skill, new RegExp(`${origin}${path}`));
    assert.match(sitemap, new RegExp(`${origin}${path}`));
  }

  assert.match(skill, /not live AI-engine sampling/i);
  assert.match(skill, /not auto-publishing/i);
  assert.match(skill, /roadmap until the required integrations, billing, and proof gates are live/i);
  assert.match(skill, /does not provide live AI-engine visibility tracking or AI citation monitoring/i);
  assert.match(skill, /does not guarantee rankings, traffic, indexing, or revenue/i);
  assert.match(skill, /Anonymous one-page checks are live/i);
  assert.match(skill, /single-page proof check/i);
  assert.match(skill, /## Agent Action Catalog/);
  assert.match(skill, /GET \/api\/developer/);
  assert.match(skill, /POST \/api\/developer\/tokens/);
  assert.match(skill, /POST \/v1\/audits/);
  assert.match(skill, /GET \/v1\/audits\/\{audit_id\}\/repair-actions\/\{action_id\}\/proof\.md/);
  assert.match(skill, /There is no live SEO Fix Kit MCP endpoint today/);
  assert.match(skill, /normal bearer API keys cannot lease or submit rendered proof/i);
  assert.match(skill, /must not claim SEO Fix Kit publishes CMS changes/i);
  assert.match(skill, /## Hosted-Only Differentiators vs Free Installable SEO Agent Skills/);
  assert.match(skill, /robots\.txt and sitemap crawl inventory up to 50,000 discovered URLs/);
  assert.match(skill, /staged large rendered crawl jobs for 50,000-page targets \(early access/);
  assert.match(skill, /never sold as completed 50K rendered validation/);
  assert.match(skill, /Persistent repair queue: proven issues stay tracked across saved reports with approval state, acceptance checks, status, and fixed-rerun proof receipts/);
  assert.match(skill, /Owner-approved implementation packs: private handoff documents with source proof and approval state/);
  assert.match(skill, /Paid Fix Pack fulfillment: one proof-backed repair pass per report plus one rerun after fixes/);
  assert.match(skill, new RegExp(`The plain answer is on the methodology page: ${origin}/methodology`));
  assert.match(skill, /no live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
  assert.doesNotMatch(skill, /guaranteed rankings|guarantees rankings|guarantees traffic/i);
  assert.doesNotMatch(skill, /provides live AI-engine visibility tracking/i);
  assert.doesNotMatch(sitemap, /\/llms\.txt/);
  assert.doesNotMatch(`${skill}\n${sitemap}`, /fixture|127\.0\.0\.1|localhost|private\.example/i);
});

test("Cloudflare asset routing sends public proof pages through the Worker", () => {
  const jsonc = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  const wrangler = JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, ""));
  const runWorkerFirst = wrangler.assets?.run_worker_first;

  // Boolean true runs the Worker before asset serving for every request, which
  // is what keeps www.seofixkit.com asset paths 301-ing onto the apex host. An
  // array must at least cover every public proof page; a missing or false
  // value would let assets bypass the Worker and be served from the www host.
  assert.equal(
    runWorkerFirst === true || Array.isArray(runWorkerFirst),
    true,
    "run_worker_first must be true or cover the public proof pages"
  );
  if (Array.isArray(runWorkerFirst)) {
    const covered = new Set(runWorkerFirst);
    for (const path of ["/demo", "/methodology", "/packages", "/check", "/support", "/terms", "/privacy"]) {
      assert.equal(covered.has(path), true, `${path} must be served by the Worker before SPA assets`);
    }
  }
});

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

function parseSitemapUrls(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}
