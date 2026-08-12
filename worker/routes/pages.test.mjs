import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rootSitemap } from "../../shared/audit-engine.js";
import { checkHtml } from "./public-check.js";
import {
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  packagesHtml,
  privacyHtml,
  proofCaseHtml,
  proofCaseMarkdown,
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
  `${origin}/terms`,
  `${origin}/proof`
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

test("real repair proof page publishes the completed beta case with boundaries", () => {
  const proof = proofCaseHtml(origin);
  const markdown = proofCaseMarkdown(origin);
  const combined = `${proof}\n${markdown}`;

  assert.match(proof, /Real Repair Proof Receipt/);
  assert.match(proof, /One real repair, proven before and after\./);
  assert.match(proof, /tinystudio\.in/);
  assert.match(proof, /tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b/, "before report id is real");
  assert.match(proof, /tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961/, "final rerun report id is real");
  assert.match(proof, /07acd07b3e11ee7504a0d95292a42cdd6f8a1ba1/, "merged repair commit is real");
  assert.match(proof, /a83e0e2ade3085725779a17b3837355f9abb02f7/, "merged HSTS commit is real");
  assert.match(proof, /score 85/, "before score is real");
  assert.match(proof, /score 100/, "after score is real");
  assert.match(proof, /7 findings/, "before finding count is real");
  assert.match(proof, /findings 0/, "after finding count is real");
  assert.match(proof, /Outcome: fixed|fixed — marked fixed/, "outcome states fixed");
  assert.match(combined, /not a third-party paying customer outcome/i, "case does not pretend to be a customer case");
  assert.match(combined, /did not publish to a CMS, open or merge a GitHub pull request/i, "no publishing claim");
  assert.match(combined, /Rankings, traffic, indexing, AI citations, and revenue are not guaranteed/i, "no-ranking boundary kept");
  assert.match(combined, /only as current as the final rerun capture/i, "currentness boundary kept");
  assert.match(combined, new RegExp(`${origin}/proof`), "page links its own public surface");
  assert.doesNotMatch(combined, /guarantees rankings|guarantees traffic/i);
});

test("machine-readable public surfaces list proof pages and limits", () => {
  const llms = llmsText(origin);
  const markdown = homeMarkdown(origin);
  const sitemap = rootSitemap(origin);

  assert.deepEqual(parseSitemapUrls(sitemap), expectedSitemapUrls);
  for (const path of ["/demo", "/methodology", "/packages", "/check", "/proof"]) {
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

test("static public skill and sitemap files keep buyer-facing boundaries", () => {
  const skill = readFileSync(new URL("../../public/.well-known/skill.md", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");

  assert.deepEqual(parseSitemapUrls(sitemap), expectedSitemapUrls);
  for (const path of ["/demo", "/methodology", "/packages", "/check", "/support", "/terms", "/proof"]) {
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
  const wrangler = JSON.parse(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"));
  const runWorkerFirst = new Set(wrangler.assets?.run_worker_first || []);

  for (const path of ["/demo", "/methodology", "/packages", "/check", "/proof", "/support", "/terms", "/privacy"]) {
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
