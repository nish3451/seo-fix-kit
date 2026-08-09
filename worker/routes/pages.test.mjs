import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rootSitemap } from "../../shared/audit-engine.js";
import { checkHtml } from "./public-check.js";
import {
  aiAnswerReadinessHtml,
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  packagesHtml,
  renderedVsStaticAuditHtml,
  smallBusinessSeoAuditHtml,
  supportHtml
} from "./pages.js";

const origin = "https://seofixkit.com";
const expectedSitemapUrls = [
  `${origin}/`,
  `${origin}/demo`,
  `${origin}/check`,
  `${origin}/methodology`,
  `${origin}/packages`,
  `${origin}/small-business-seo-audit`,
  `${origin}/rendered-vs-static-seo-audit`,
  `${origin}/ai-answer-readiness`,
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
  for (const path of ["/demo", "/methodology", "/packages", "/check", "/small-business-seo-audit", "/rendered-vs-static-seo-audit", "/ai-answer-readiness"]) {
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
  assert.match(markdown, new RegExp(`Anonymous one-page check: ${origin}/check`));
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
  assert.match(check, /nothing about your check is stored/i);
  assert.doesNotMatch(check, /noindex/i, "the entry page must stay searchable");
});

test("intent-matching landing pages carry unique title, truthful FAQ/SoftwareApplication schema, and demo links", () => {
  const pages = {
    "/small-business-seo-audit": smallBusinessSeoAuditHtml(origin),
    "/rendered-vs-static-seo-audit": renderedVsStaticAuditHtml(origin),
    "/ai-answer-readiness": aiAnswerReadinessHtml(origin)
  };
  const titles = [];
  for (const [path, html] of Object.entries(pages)) {
    assert.ok(visibleWordCount(html) >= 250, `${path} should not look thin to rendered audits`);
    assert.match(html, new RegExp(`rel="canonical" href="${origin}${path}"`));
    assert.match(html, /<meta name="description" content="[^"]+" \/>/);
    assert.match(html, new RegExp(`href="${origin}/demo"`), `${path} must link to the proof sample`);
    assert.match(html, new RegExp(`href="${origin}/check"`), `${path} must link to the free one-page check`);
    assert.doesNotMatch(html, /noindex/i, `${path} must stay searchable`);
    assert.doesNotMatch(html, /provides live AI citation monitoring/i, `${path} must not claim live citation monitoring`);
    titles.push(html.match(/<title>([^<]+) - SEO Fix Kit<\/title>/)?.[1]);
    assert.equal(/"@type":\s*"WebPage"/.test(html), true, `${path} must carry WebPage schema`);
    assert.equal(/"@type":\s*"SoftwareApplication"/.test(html), true, `${path} must carry SoftwareApplication schema`);
    const faqBlock = parseJsonLd(html).find((block) => block["@type"] === "FAQPage");
    assert.ok(faqBlock, `${path} must carry FAQPage schema`);
    assert.ok(faqBlock.mainEntity.length >= 3, `${path} FAQ must have at least three visible questions`);
    for (const item of faqBlock.mainEntity) {
      assert.equal(item["@type"], "Question");
      assert.ok(item.name.length > 0, "FAQ questions must not be empty");
      assert.ok(item.acceptedAnswer.text.length > 0, "FAQ answers must not be empty");
      assert.ok(html.includes(escapeForHtml(item.name)), `FAQ question must be visible on ${path}`);
      assert.ok(html.includes(escapeForHtml(item.acceptedAnswer.text)), `FAQ answer must be visible on ${path}`);
    }
  }
  assert.equal(new Set(titles).size, titles.length, "each landing page must have a unique title");
});

test("landing pages keep the AI readiness boundary and small-business proof offer", () => {
  const smallBusiness = smallBusinessSeoAuditHtml(origin);
  const renderedVsStatic = renderedVsStaticAuditHtml(origin);
  const aiReadiness = aiAnswerReadinessHtml(origin);

  assert.match(smallBusiness, /An SEO audit that shows proof, not homework\./);
  assert.match(smallBusiness, /never guarantees rankings, traffic, indexing, or revenue/i);
  assert.match(renderedVsStatic, /Static crawlers invent work\. Rendered proof does not\./);
  assert.match(renderedVsStatic, /does not provide live answer-engine sampling or citation monitoring/i);
  assert.match(aiReadiness, /A site-proof AI readiness check, not a citation tracker\./);
  assert.match(aiReadiness, /No live answer-engine sampling/);
  assert.match(aiReadiness, /No AI citation monitoring/);
  assert.match(aiReadiness, /does not claim llms\.txt is required for Google Search/i);
  assert.doesNotMatch(aiReadiness, /visibility score tracking.*is live/i);
});

test("static public skill and sitemap files keep buyer-facing boundaries", () => {
  const skill = readFileSync(new URL("../../public/.well-known/skill.md", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");

  assert.deepEqual(parseSitemapUrls(sitemap), expectedSitemapUrls);
  for (const path of ["/demo", "/methodology", "/packages", "/check", "/support", "/terms", "/small-business-seo-audit", "/rendered-vs-static-seo-audit", "/ai-answer-readiness"]) {
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
  assert.doesNotMatch(skill, /guaranteed rankings|guarantees rankings|guarantees traffic/i);
  assert.doesNotMatch(skill, /provides live AI-engine visibility tracking/i);
  assert.doesNotMatch(sitemap, /\/llms\.txt/);
  assert.doesNotMatch(`${skill}\n${sitemap}`, /fixture|127\.0\.0\.1|localhost|private\.example/i);
});

test("Cloudflare asset routing sends public proof pages through the Worker", () => {
  const wrangler = JSON.parse(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"));
  const runWorkerFirst = new Set(wrangler.assets?.run_worker_first || []);

  for (const path of ["/demo", "/methodology", "/packages", "/check", "/support", "/terms", "/privacy"]) {
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

function parseJsonLd(html) {
  return [...String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1])
  );
}

function escapeForHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
