import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditUrl } from "../../server/audit/engine.js";
import { rootSitemap } from "../../shared/audit-engine.js";
import { DEMO_PROOF, DEMO_FIXTURE_PATH } from "./demo-proof.js";
import { renderedFixture } from "./audits.js";
import {
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  packagesHtml,
  supportHtml
} from "./pages.js";

const origin = "https://seofixkit.com";
const expectedSitemapUrls = [
  `${origin}/`,
  `${origin}/demo`,
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
  for (const path of ["/demo", "/methodology", "/packages"]) {
    assert.match(llms, new RegExp(`${origin}${path}`));
    assert.match(markdown, new RegExp(`${origin}${path}`));
    assert.match(sitemap, new RegExp(`${origin}${path}`));
  }
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
});

test("public demo and support pages carry enough buyer-facing detail", () => {
  const demo = demoHtml(origin);
  const support = supportHtml(origin);

  assert.ok(visibleWordCount(demo) >= 250, "demo page should not look thin to rendered audits");
  assert.ok(visibleWordCount(support) >= 250, "support page should not look thin to rendered audits");
  assert.match(demo, /What this sample proves/);
  assert.match(demo, /What this sample does not claim/);
  assert.match(demo, /not a public anonymous audit/i);
  assert.match(demo, /does not promise rankings, traffic, indexing, revenue, AI citations/i);
  assert.match(support, /Delivery expectations/);
  assert.match(support, /do not send secrets, private keys, passwords, payment card numbers, or production credentials/i);
  assert.match(support, /We do not log into private CMS accounts, publish changes, merge code, or call provider admin APIs/i);
  assert.match(support, /Ownership and deletion/);
  assert.match(support, /sites you own or are authorized to audit/i);
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

    const guard = report.findings.find((finding) => finding.type === "guard");
    assert.ok(guard, "the engine must emit a guarded finding for the test page");
    assert.equal(guard.severity, DEMO_PROOF.guard.severity);
    assert.equal(guard.title, DEMO_PROOF.guard.title);
    assert.equal(guard.why, DEMO_PROOF.guard.why);
    assert.equal(guard.evidence, DEMO_PROOF.guard.evidence);
    assert.equal(guard.fix, DEMO_PROOF.guard.fix);

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
    assert.match(demo, new RegExp(DEMO_PROOF.guard.evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(demo, /Real engine output for the public test page/);
    assert.match(demo, new RegExp(`${origin}${DEMO_FIXTURE_PATH}`));
    assert.match(demo, /verbatim output from the SEO Fix Kit audit engine/i);
  } finally {
    server.close();
  }
});

test("static public skill and sitemap files keep buyer-facing boundaries", () => {
  const skill = readFileSync(new URL("../../public/.well-known/skill.md", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");

  assert.deepEqual(parseSitemapUrls(sitemap), expectedSitemapUrls);
  for (const path of ["/demo", "/methodology", "/packages", "/support", "/terms"]) {
    assert.match(skill, new RegExp(`${origin}${path}`));
    assert.match(sitemap, new RegExp(`${origin}${path}`));
  }

  assert.match(skill, /not live AI-engine sampling/i);
  assert.match(skill, /not auto-publishing/i);
  assert.match(skill, /roadmap until the required integrations, billing, and proof gates are live/i);
  assert.match(skill, /does not provide live AI-engine visibility tracking or AI citation monitoring/i);
  assert.match(skill, /does not guarantee rankings, traffic, indexing, or revenue/i);
  assert.match(skill, /## Agent Action Catalog/);
  assert.match(skill, /GET \/api\/developer/);
  assert.match(skill, /POST \/api\/developer\/tokens/);
  assert.match(skill, /POST \/v1\/audits/);
  assert.match(skill, /GET \/v1\/audits\/\{audit_id\}\/repair-actions\/\{action_id\}\/proof\.md/);
  assert.match(skill, /There is no live SEO Fix Kit MCP endpoint today/);
  assert.match(skill, /normal bearer API keys cannot lease or submit rendered proof/i);
  assert.match(skill, /must not claim SEO Fix Kit publishes CMS changes/i);
  assert.doesNotMatch(skill, /guaranteed rankings|guarantees rankings|guarantees traffic/i);
  assert.doesNotMatch(skill, /provides live AI-engine visibility tracking/i);
  assert.doesNotMatch(sitemap, /\/llms\.txt/);
  assert.doesNotMatch(`${skill}\n${sitemap}`, /fixture|127\.0\.0\.1|localhost|private\.example/i);
});

test("Cloudflare asset routing sends public proof pages through the Worker", () => {
  const wrangler = JSON.parse(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"));
  const runWorkerFirst = new Set(wrangler.assets?.run_worker_first || []);

  for (const path of ["/demo", "/methodology", "/packages", "/support", "/terms", "/privacy"]) {
    assert.equal(runWorkerFirst.has(path), true, `${path} must be served by the Worker before SPA assets`);
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
