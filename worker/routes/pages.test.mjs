import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditUrl } from "../../server/audit/engine.js";
import { ROOT_PUBLIC_LASTMODS, ROOT_PUBLIC_PATHS, escapeHtml, rootSitemap } from "../../shared/audit-engine.js";
import { DEMO_PROOF, DEMO_FIXTURE_PATH, demoProofSnippet } from "./demo-proof.js";
import { renderedFixture } from "./audits.js";
import { checkHtml } from "./public-check.js";
import {
  SOCIAL_IMAGE_PATH,
  aiAnswerReadinessHtml,
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  packagesHtml,
  privacyHtml,
  proofCaseHtml,
  proofCaseMarkdown,
  renderedVsStaticAuditHtml,
  smallBusinessSeoAuditHtml,
  supportHtml,
  termsHtml
} from "./pages.js";

const origin = "https://seofixkit.com";

// Every worker-rendered public page must ship the SVG share image as
// og:image/twitter:image (lane 1: "Every worker-rendered public page ships an
// SVG as og:image/twitter:image"). The root page is the SPA app shell served
// from index.html (not worker-rendered) and intentionally keeps its jpg
// waitlist share image. The image URL is absolute and points at the shipped
// public/og-image.svg asset, so a share of /demo, /packages, /check, or any
// other public page never renders without a preview image.
const allWorkerRenderedPublicPages = [
  { name: "/demo", html: demoHtml(origin) },
  { name: "/check", html: checkHtml(origin) },
  { name: "/methodology", html: methodologyHtml(origin) },
  { name: "/packages", html: packagesHtml(origin) },
  { name: "/small-business-seo-audit", html: smallBusinessSeoAuditHtml(origin) },
  { name: "/rendered-vs-static-seo-audit", html: renderedVsStaticAuditHtml(origin) },
  { name: "/ai-answer-readiness", html: aiAnswerReadinessHtml(origin) },
  { name: "/proof", html: proofCaseHtml(origin) },
  { name: "/privacy", html: privacyHtml(origin) },
  { name: "/support", html: supportHtml(origin) },
  { name: "/terms", html: termsHtml(origin) }
];

test("every worker-rendered public page ships the SVG share image as og:image and twitter:image", () => {
  const imageUrl = `${origin}${SOCIAL_IMAGE_PATH}`;
  for (const { name, html } of allWorkerRenderedPublicPages) {
    assert.match(
      html,
      new RegExp(`<meta property="og:image" content="${imageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `${name} must ship og:image pointing at the SVG share image`
    );
    assert.match(
      html,
      new RegExp(`<meta name="twitter:image" content="${imageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `${name} must ship twitter:image pointing at the SVG share image`
    );
    assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/, `${name} must keep the large-image card so the SVG renders`);
  }
});

test("the SVG share image exists and is a real 1200x630 SVG asset", () => {
  const svg = readFileSync(new URL(`../../public${SOCIAL_IMAGE_PATH}`, import.meta.url), "utf8");
  assert.match(svg, /^<svg /, "og-image.svg must be an SVG document");
  assert.match(svg, /viewBox="0 0 1200 630"/, "og-image.svg must use the 1200x630 share-image viewBox");
});
const expectedSitemapUrls = ROOT_PUBLIC_PATHS.map((path) => `${origin}${path}`);

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
  // SEOmator is named as a competitor on its own terms (39 free tools,
  // 251-check JS-rendering audit, dedicated GEO audit) and the answer must
  // stay inside the page's no-overclaim boundary: repair queue + rerun proof
  // is the wedge, never an AI-visibility parity claim.
  {
    const seomator = (methodology.match(/<h2>Why not just use SEOmator's free audits\?<\/h2>[\s\S]*?<\/section>/) || [])[0];
    assert.ok(seomator, "methodology must carry a dedicated SEOmator competitor answer");
    assert.match(seomator, /39 free SEO tools/);
    assert.match(seomator, /251-check rule engine/);
    assert.match(seomator, /renders JavaScript/);
    assert.match(seomator, /up to 50 pages/);
    assert.match(seomator, /14 AI-specific crawlers including GPTBot, ClaudeBot, and PerplexityBot/);
    assert.match(seomator, /<a href="https:\/\/seomator\.com\/free-tools"/);
    assert.match(seomator, /<a href="https:\/\/seomator\.com\/free-seo-audit-tool"/);
    assert.match(seomator, /<a href="https:\/\/seomator\.com\/geo-audit-tool"/);
    assert.match(seomator, /repair queue plus rerun proof/);
    assert.match(seomator, /No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
    assert.doesNotMatch(seomator, /AI visibility score tracking|AI citation monitoring (is|are) live/i);
  }
  // Volume Nine GEO Grader regression guard: named on its own terms (agency
  // tool, six categories, 60+ signals, robots.txt AI-crawler access check,
  // free, launched January 2026 per its own quick facts), placed between the
  // SEOmator and agentic answers, with the repair queue + rerun proof wedge
  // and the standing no-overclaim boundary.
  {
    const volnine = (methodology.match(/<h2>Why not just use Volume Nine's GEO Grader\?<\/h2>[\s\S]*?<\/section>/) || [])[0];
    const seomatorH2 = methodology.indexOf("<h2>Why not just use SEOmator's free audits?</h2>");
    const volnineH2 = methodology.indexOf("<h2>Why not just use Volume Nine's GEO Grader?</h2>");
    const agenticH2 = methodology.indexOf("<h2>Why not just use an agentic SEO auditor that files its own GitHub issues?</h2>");
    assert.ok(volnine, "methodology must carry a dedicated Volume Nine GEO Grader competitor answer");
    assert.ok(seomatorH2 > -1 && seomatorH2 < volnineH2 && volnineH2 < agenticH2, "Volume Nine section must sit between the SEOmator and agentic sections");
    assert.match(volnine, /Denver-based digital marketing agency/);
    assert.match(volnine, /launched in January 2026/);
    assert.match(volnine, /totally free/);
    assert.match(volnine, /60\+ signals across six categories/);
    assert.match(volnine, /discoverability, structured data, AI readiness, performance, reputation and trust, and LLM-ready content/);
    assert.match(volnine, /reads robots\.txt rules/);
    assert.match(volnine, /ChatGPT, Claude, Gemini, Perplexity, and Grok/);
    assert.match(volnine, /<a href="https:\/\/www\.v9digital\.com\/geo-grader\/" rel="nofollow noopener" target="_blank">/);
    assert.match(volnine, /<a href="https:\/\/geo\.v9digital\.com\/grader\/" rel="nofollow noopener" target="_blank">/);
    assert.match(volnine, /emails a detailed report with actionable to-dos/);
    assert.match(volnine, /repair queue plus rerun proof/);
    assert.match(volnine, /No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
    assert.doesNotMatch(volnine, /AI visibility score tracking|AI citation monitoring (is|are) live/i);
    assert.doesNotMatch(volnine, /guaranteed rankings|guarantees rankings|guarantees citations/i);
  }
  // Juma.ai GEO Audit regression guard: named on its own terms (free, no signup,
  // published open methodology of ten weighted dimensions, impact × effort matrix,
  // MCP run_geo_audit tool), placed between the Volume Nine and agentic
  // answers, with the repair queue + rerun proof wedge and the standing no-overclaim
  // boundary.
  {
    const juma = (methodology.match(/<h2>Why not just use Juma\.ai's free GEO Audit\?<\/h2>[\s\S]*?<\/section>/) || [])[0];
    const seomatorH2 = methodology.indexOf("<h2>Why not just use SEOmator's free audits?</h2>");
    const volnineH2 = methodology.indexOf("<h2>Why not just use Volume Nine's GEO Grader?</h2>");
    const jumaH2 = methodology.indexOf("<h2>Why not just use Juma.ai's free GEO Audit?</h2>");
    const agenticH2 = methodology.indexOf("<h2>Why not just use an agentic SEO auditor that files its own GitHub issues?</h2>");
    assert.ok(juma, "methodology must carry a dedicated Juma.ai GEO Audit competitor answer");
    assert.ok(seomatorH2 < volnineH2 && volnineH2 < jumaH2 && jumaH2 < agenticH2, "Juma section must sit between the Volume Nine and agentic sections");
    assert.match(juma, /no signup/);
    assert.match(juma, /ten weighted dimensions/);
    assert.match(juma, /impact × effort matrix/);
    assert.match(juma, /published open methodology/);
    assert.match(juma, /run_geo_audit/);
    assert.match(juma, /<a href="https:\/\/geo\.juma\.ai\/" rel="nofollow noopener" target="_blank">/);
    assert.match(juma, /<a href="https:\/\/geo\.juma\.ai\/methodology" rel="nofollow noopener" target="_blank">/);
    assert.match(juma, /<a href="https:\/\/juma\.ai\/mcp" rel="nofollow noopener" target="_blank">/);
    assert.match(juma, /rather than sampling ChatGPT, Claude, Gemini, or Perplexity live/);
    assert.match(juma, /repair queue plus rerun proof/);
    assert.match(juma, /No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
    assert.doesNotMatch(juma, /AI visibility score tracking|AI citation monitoring (is|are) live/i);
    assert.doesNotMatch(juma, /guaranteed rankings|guarantees rankings|guarantees citations/i);
  }
  // AEO Engine GEO Audit regression guard
  {
    const aeo = (methodology.match(/<h2>Why not just use AEO Engine's free GEO audit\?<\/h2>[\s\S]*?<\/section>/) || [])[0];
    const jumaH2 = methodology.indexOf("<h2>Why not just use Juma.ai's free GEO Audit?</h2>");
    const aeoH2 = methodology.indexOf("<h2>Why not just use AEO Engine's free GEO audit?</h2>");
    const trackerH2 = methodology.indexOf("<h2>Why not just use a tracker like Otterly.ai or Peec.ai?</h2>");
    assert.ok(aeo, "methodology must carry a dedicated AEO Engine competitor answer");
    assert.ok(jumaH2 < aeoH2 && aeoH2 < trackerH2, "AEO Engine section must sit between the Juma and tracker sections");
    assert.match(aeo, /AEO Engine/);
    assert.match(aeo, /free GEO audit/i);
    assert.match(aeo, /crawlability, schema, content structure, entity clarity, and citation readiness/);
    assert.match(aeo, /ChatGPT, Perplexity, Gemini, Claude, and Google AI Overviews/);
    assert.match(aeo, /human-managed, AI-powered Growth Engine/);
    assert.match(aeo, /turns GEO audit findings into shipped fixes/);
    assert.match(aeo, /embeddable GEO audit widget/);
    assert.match(aeo, /<a href="https:\/\/aeoengine\.ai" rel="nofollow noopener" target="_blank">/);
    assert.match(aeo, /<a href="https:\/\/aeoengine\.ai\/geo-audit"/);
    assert.match(aeo, /<a href="https:\/\/aeoengine\.ai\/embed\/geo-audit\?utm_source=embed&utm_medium=widget&utm_campaign=aeo_tools"/);
    assert.match(aeo, /repair queue plus rerun proof/);
    assert.match(aeo, /approval-first/);
    assert.match(aeo, /publish CMS changes, open pull requests, merge code, or call provider admin APIs/);
    assert.match(aeo, /No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
    assert.doesNotMatch(aeo, /AI visibility score tracking|AI citation monitoring (is|are) live/i);
    assert.doesNotMatch(aeo, /guaranteed rankings|guarantees rankings|guarantees citations/i);
    assert.doesNotMatch(aeo, /autonomous.*CMS|autonomous.*repo|autonomously/i);
  }
  // Funded AI-visibility tracker (Otterly.ai + Peec.ai) regression guard
  {
    const tracker = (methodology.match(/<h2>Why not just use a tracker like Otterly\.ai or Peec\.ai\?<\/h2>[\s\S]*?<\/section>/) || [])[0];
    const jumaH2 = methodology.indexOf("<h2>Why not just use Juma.ai's free GEO Audit?</h2>");
    const trackerH2 = methodology.indexOf("<h2>Why not just use a tracker like Otterly.ai or Peec.ai?</h2>");
    const agenticH2 = methodology.indexOf("<h2>Why not just use an agentic SEO auditor that files its own GitHub issues?</h2>");
    assert.ok(tracker, "methodology must carry a dedicated funded-tracker competitor answer");
    assert.ok(jumaH2 < trackerH2 && trackerH2 < agenticH2, "tracker section must sit between the Juma and agentic sections");
    assert.match(tracker, /Otterly\.ai/);
    assert.match(tracker, /Peec AI/);
    assert.match(tracker, /Peec\.ai/);
    assert.match(tracker, /40,000\+ Marketing Pros/);
    assert.match(tracker, /\$29\/mo/);
    assert.match(tracker, /Lite/);
    assert.match(tracker, /Tracking of 4 AI Search Engines/);
    assert.match(tracker, /ChatGPT, Google AI Overviews, Perplexity, MS Copilot/);
    assert.match(tracker, /Claude, Google AI Mode, Gemini/);
    assert.match(tracker, /paid add-ons/);
    assert.match(tracker, /3000\+ brands and agencies/);
    assert.match(tracker, /\$80\/mo/);
    assert.match(tracker, /Starter/);
    assert.match(tracker, /\$21M Series A/);
    assert.match(tracker, /Singular/);
    assert.match(tracker, /total funding to \$29M/);
    assert.match(tracker, /repair queue plus rerun proof/);
    assert.match(tracker, /No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
    assert.doesNotMatch(tracker, /AI visibility score tracking|AI citation monitoring (is|are) live/i);
    assert.doesNotMatch(tracker, /guaranteed rankings|guarantees rankings|guarantees citations/i);
    assert.match(tracker, /<a href="https:\/\/otterly\.ai" rel="nofollow noopener" target="_blank">/);
    assert.match(tracker, /<a href="https:\/\/otterly\.ai\/pricing" rel="nofollow noopener" target="_blank">/);
    assert.match(tracker, /<a href="https:\/\/peec\.ai" rel="nofollow noopener" target="_blank">/);
    assert.match(tracker, /<a href="https:\/\/peec\.ai\/pricing" rel="nofollow noopener" target="_blank">/);
    assert.match(tracker, /<a href="https:\/\/peec\.ai\/blog\/we-raised-21m-series-a-to-help-brands-win-in-ai-search" rel="nofollow noopener" target="_blank">/);
  }
  // Agentic SEO auditor (SEO Automation Club) regression guard
  {
    const agentic = (methodology.match(/<h2>Why not just use an agentic SEO auditor that files its own GitHub issues\?<\/h2>[\s\S]*?<\/section>/) || [])[0];
    assert.ok(agentic, "methodology must carry a dedicated agentic SEO auditor competitor answer");
    assert.match(agentic, /SEO Automation Club/);
    assert.match(agentic, /seoautomationclub\.com\/agentic-seo-autonomous-technical-audit-claude-code-github-issues/);
    assert.match(agentic, /scheduled|twice a week|cadence/);
    assert.match(agentic, /diff|previous run|baseline/);
    assert.match(agentic, /GitHub issues/);
    assert.match(agentic, /approval/);
    assert.match(agentic, /proof receipt/);
    assert.match(agentic, /rerun|re-measure/);
    assert.match(agentic, /No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
    assert.match(agentic, /issue-filing|edit.*code|AST/i, "must distinguish issue-filers from code-editing agents");
    assert.doesNotMatch(agentic, /73 issues|41 closed|6 days|guaranteed rankings|live AI-engine sampling is live|we apply your fixes/i);
  }
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
  // The Fix Pack tile itself must not be a support-only dead end: extract the
  // tile article and require at least one real checkout-path link in it.
  {
    const tile = (packages.match(/<article class="package-card live">[\s\S]*?<h2>SEO Fix Pack<\/h2>[\s\S]*?<\/article>/) || [])[0];
    assert.ok(tile, "the Fix Pack tile article must exist");
    assert.match(
      tile,
      new RegExp(`<a href="${origin}/check">Start from a report with real fixes</a>`),
      "the Fix Pack tile must link the checkout path into the report funnel"
    );
    assert.match(
      tile,
      new RegExp(`<a href="${origin}/">Request private access</a>`),
      "the Fix Pack tile must link the private access request"
    );
  }
  assert.doesNotMatch(combined, /completed 50K rendered validation/i);
  assert.doesNotMatch(combined, /guaranteed rankings/i);
  // Promise-audit 2026-08-15: the demo and packages pages must not drift back
  // into overclaiming. The engine only emits an exact snippet when it can
  // generate one (demo-proof.js repairPlan entries carry empty snippets), so
  // "each with an exact snippet" would overclaim; and Proof Monitoring stays
  // visible in private billing as a config-gated offer, only its checkout is
  // gated, so "only appears when configured" would overclaim.
  assert.doesNotMatch(
    demoHtml(origin),
    /each with an exact snippet/,
    "the demo must not claim every surfaced issue carries an exact snippet"
  );
  assert.match(
    demoHtml(origin),
    /with a suggested fix and an exact snippet when the engine can generate one/,
    "the demo must keep the engine-capable snippet qualifier"
  );
  assert.doesNotMatch(
    packages,
    /Only appears in private billing when the Dodo subscription product and webhook entitlement sync are configured/,
    "packages must not claim Proof Monitoring only appears in billing when configured"
  );
  assert.match(
    packages,
    /Checkout only opens when the Dodo subscription product and webhook entitlement sync are configured; until then it stays a config-gated offer in private billing/,
    "packages must keep the config-gated checkout boundary"
  );
});

test("packages page names the GEO Auditor agent-fix parity trade-off without overclaims", () => {
  const packages = packagesHtml(origin);
  // The competitor and its price/delivery mode are named plainly (verified on
  // geoauditor.app, 2026-08-21): free audit, $29 one-time report, Agent Fix Mode.
  assert.match(packages, /Compared with GEO Auditor/);
  assert.match(packages, /geoauditor\.app/);
  assert.match(packages, /\$29 one-time full report/);
  assert.match(packages, /Agent Fix Mode/);
  assert.match(packages, /40\+ signals across 6 AI platforms/);
  // The wedge answer must carry the three load-bearing halves: proof-backed
  // snippets, approval-first queue, rerun proof.
  assert.match(packages, /approval-first repair queue/);
  assert.match(packages, /exact snippet when the engine can generate one/);
  assert.match(packages, /proof receipt that says fixed, still-open, new, or regressed/);
  // Fair-to-competitor guard: name the trade-off, do not disparage.
  assert.match(packages, /reasonable choice/);
  // No-overclaim guards: SEO Fix Kit must not claim it applies fixes itself,
  // and the snippet qualifier must stay engine-capable.
  assert.doesNotMatch(packages, /applies all fixes/);
  assert.doesNotMatch(packages, /we apply your fixes/i);
  assert.doesNotMatch(packages, /each with an exact snippet/);
});

test("rendered-vs-static page names free static-vs-rendered checkers without overclaims", () => {
  const page = renderedVsStaticAuditHtml(origin);
  const section = (page.match(/<h2>Compared with free static-vs-rendered checkers<\/h2>[\s\S]*?<\/section>/) || [])[0];
  assert.ok(section, "rendered-vs-static page must carry a dedicated free-checker comparison");
  assert.match(section, /LLM Pulse GEO Crawlability Checker/);
  assert.match(section, /<a href="https:\/\/llmpulse\.ai\/geo-crawlability-checker"/);
  assert.match(section, /<a href="https:\/\/llmpulse\.ai\/free-ai-search-tools"/);
  assert.match(section, /Free SEO Auditor/);
  assert.match(section, /<a href="https:\/\/freeseoaudit\.vercel\.app\/"/);
  assert.match(section, /<a href="https:\/\/github\.com\/ravigupta0210\/seo-auditor"/);
  assert.match(section, /geo-crawl-audit/);
  assert.match(section, /<a href="https:\/\/github\.com\/abouchard11\/geo-crawl-audit"/);
  assert.match(section, /SSR_FULL \/ SSR_THIN \/ CSR_SHELL/);
  assert.match(section, /persistent repair queue only receives proven findings/);
  assert.match(section, /fixed, still-open, new, or regressed/);
  assert.match(section, /No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees/);
  assert.match(section, /fair choice/);
  assert.doesNotMatch(section, /no crawl cap/i);
  assert.doesNotMatch(section, /live AI-engine sampling is live/i);
  assert.doesNotMatch(page, /guaranteed rankings|guarantees citations/i);
  assert.match(page, /Why not use a free static-vs-rendered checker like LLM Pulse\?/);
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

  // Every sitemap URL must carry a truthful, parseable UTC W3C <lastmod>
  // (the re-crawl freshness hint), matching the shared ROOT_PUBLIC_LASTMODS.
  for (const path of ROOT_PUBLIC_PATHS) {
    assert.match(
      sitemap,
      new RegExp(`<loc>${origin}${path}</loc><lastmod>${ROOT_PUBLIC_LASTMODS[path]}</lastmod>`),
      `sitemap must carry the truthful lastmod for ${path}`
    );
    assert.match(ROOT_PUBLIC_LASTMODS[path], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${path} lastmod must be a UTC W3C datetime`);
  }
  assert.match(llms, /Does not provide live AI-engine visibility tracking/);
  assert.match(llms, /Proof Monitoring checkout is config-gated/);
  assert.match(llms, /Does not claim paid Proof Monitoring is active/);
  assert.match(llms, /Repair Sprint checkout is config-gated/);
  assert.match(llms, /Does not claim Repair Sprint checkout is active/);
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

// Sitemap freshness discipline (lane 1: "Establish full search-index coverage").
//
// The <lastmod> every URL ships in /sitemap.xml is the re-crawl freshness
// hint search engines use to decide whether a page has changed. If a
// lastmod is older than the actual change to the rendered HTML, the
// crawlers under-recrawl the truth and the indexing coverage gap this
// item exists to close widens silently. This test pins the discipline so
// future page edits cannot ship without refreshing the matching lastmod.
//
// Both timestamps are compared in the existing sitemap convention (commit
// local IST time, formatted as Z-suffixed UTC in the published sitemap).
// That is technically wrong (the Z should be UTC), but it is what the
// current sitemap and IndexNow payload use, and the discipline test must
// agree with the published artefact rather than redefine the convention.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_PAGE_RENDERERS = {
  "/": [
    { file: "src/App.jsx", lineStart: 35, lineEnd: 400 },
    { file: "index.html", lineStart: 1, lineEnd: 100 }
  ],
  "/demo": [{ file: "worker/routes/pages.js", lineStart: 156, lineEnd: 263 }],
  "/check": [{ file: "worker/routes/public-check.js", lineStart: 296, lineEnd: 800 }],
  "/methodology": [{ file: "worker/routes/pages.js", lineStart: 265, lineEnd: 375 }],
  "/packages": [{ file: "worker/routes/pages.js", lineStart: 378, lineEnd: 472 }],
  "/small-business-seo-audit": [
    { file: "worker/routes/pages.js", lineStart: 475, lineEnd: 522 },
    { file: "worker/routes/pages.js", lineStart: 679, lineEnd: 821 }
  ],
  "/rendered-vs-static-seo-audit": [
    { file: "worker/routes/pages.js", lineStart: 523, lineEnd: 586 },
    { file: "worker/routes/pages.js", lineStart: 679, lineEnd: 821 }
  ],
  "/ai-answer-readiness": [
    { file: "worker/routes/pages.js", lineStart: 587, lineEnd: 678 },
    { file: "worker/routes/pages.js", lineStart: 679, lineEnd: 821 }
  ],
  "/proof": [{ file: "worker/routes/pages.js", lineStart: 740, lineEnd: 866 }],
  "/privacy": [{ file: "worker/routes/pages.js", lineStart: 912, lineEnd: 951 }],
  "/support": [{ file: "worker/routes/pages.js", lineStart: 953, lineEnd: 986 }],
  "/terms": [{ file: "worker/routes/pages.js", lineStart: 1070, lineEnd: 1120 }]
};

function latestCommitIsoIst(renderer) {
  const output = execFileSync(
    "git",
    ["log", "-1", "--format=%aI", "-L", `${renderer.lineStart},${renderer.lineEnd}:${renderer.file}`],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  // %aI is strict ISO 8601 with offset (e.g. 2026-08-19T13:36:30+05:30) and is
  // emitted as the first line; the -L flag then appends the diff hunk. Take
  // only the first line so trailing diff hunks cannot leak into the
  // timestamp. Convert any non-IST offset to IST YYYY-MM-DDTHH:MM:SS so the
  // comparison can match the published lastmod convention (Z-suffixed IST).
  const firstLine = output.split("\n", 1)[0];
  const match = firstLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}:?\d{2})?$/);
  if (!match) return "";
  const [, base, tz] = match;
  if (!tz || tz === "+05:30" || tz === "+0530") return base;
  const ms = Date.parse(`${base}${tz}`);
  const istMs = ms + (5.5 * 60 * 60 * 1000 - parseTimezoneOffsetMinutes(tz) * 60 * 1000);
  return new Date(istMs).toISOString().slice(0, 19);
}

function parseTimezoneOffsetMinutes(tz) {
  const m = tz.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return 0;
  const [, sign, hh, mm] = m;
  return (sign === "-" ? -1 : 1) * (parseInt(hh, 10) * 60 + parseInt(mm, 10));
}

test("sitemap lastmod stays truthful relative to the page renderer (freshness discipline)", () => {
  const failures = [];
  for (const path of ROOT_PUBLIC_PATHS) {
    const ranges = PUBLIC_PAGE_RENDERERS[path];
    if (!ranges) {
      failures.push(`${path}: missing renderer locator in PUBLIC_PAGE_RENDERERS (refresh the map when adding a new public path)`);
      continue;
    }

    const lastmod = ROOT_PUBLIC_LASTMODS[path];
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(lastmod)) {
      failures.push(`${path}: lastmod ${lastmod} is not a UTC W3C datetime (existing convention uses Z-suffixed IST time)`);
      continue;
    }
    const lastmodIst = lastmod.slice(0, 19);
    let latestRendererCommitIst = "";
    let missingCommit = false;
    for (const renderer of ranges) {
      const commitIst = latestCommitIsoIst(renderer);
      if (!commitIst) {
        failures.push(`${path}: unable to read latest commit for ${renderer.file}:${renderer.lineStart}-${renderer.lineEnd}`);
        missingCommit = true;
        break;
      }
      if (commitIst > latestRendererCommitIst) latestRendererCommitIst = commitIst;
    }
    if (missingCommit) continue;
    if (lastmodIst < latestRendererCommitIst) {
      failures.push(
        `${path}: lastmod ${lastmod} (IST ${lastmodIst}) is older than the latest renderer commit (${latestRendererCommitIst} IST in ${ranges
          .map((r) => `${r.file}:${r.lineStart}-${r.lineEnd}`)
          .join(", ")}). Refresh ROOT_PUBLIC_LASTMODS[${path}] and the mirror in public/sitemap.xml so the re-crawl freshness hint stays truthful.`
      );
    }
  }
  assert.deepEqual(failures, [], failures.length === 1 ? failures[0] : failures.join("\n"));
});

test("intent-matching landing pages carry unique, truthful, machine-readable proof", () => {
  const pages = [
    { name: "small-business", path: "/small-business-seo-audit", html: smallBusinessSeoAuditHtml(origin) },
    { name: "rendered-vs-static", path: "/rendered-vs-static-seo-audit", html: renderedVsStaticAuditHtml(origin) },
    { name: "ai-answer-readiness", path: "/ai-answer-readiness", html: aiAnswerReadinessHtml(origin) }
  ];

  for (const { name, path, html } of pages) {
    // Unique per-page title, meta description, and canonical.
    assert.match(html, new RegExp(`<title>[^<]+ - SEO Fix Kit</title>`), `${name} must carry a page title`);
    assert.match(html, /<meta name="description" content="[^"]+" \/>/, `${name} must carry a meta description`);
    assert.match(html, new RegExp(`rel="canonical" href="${origin}${path}"`), `${name} must carry its own canonical`);
    // Machine-readable proof: WebPage + SoftwareApplication + FAQPage JSON-LD.
    const ldBlocks = html.match(/<script type="application\/ld\+json">/g) || [];
    assert.equal(ldBlocks.length, 3, `${name} must emit WebPage, SoftwareApplication, and FAQPage JSON-LD`);
    assert.match(html, /"@type"\s*:\s*"SoftwareApplication"/, `${name} must describe the tool truthfully as software`);
    assert.match(html, /"@type"\s*:\s*"FAQPage"/, `${name} must emit FAQPage JSON-LD`);
    // Visible FAQ must render from the same source as the JSON-LD FAQ.
    assert.match(html, /Frequently asked questions/, `${name} must render the FAQ section visibly`);
    assert.match(html, /class="faq-item"/, `${name} must render visible FAQ items`);
    // Landing pages stay boundary-honest.
    assert.match(html, /What this page does not claim/, `${name} must carry an explicit no-overclaim section`);
    assert.match(html, new RegExp(`href="${origin}/check"`), `${name} must link the anonymous one-page check`);
    assert.match(html, new RegExp(`href="${origin}/demo"`), `${name} must link the proof sample`);
    assert.match(html, /does not guarantee rankings|never guarantees rankings/, `${name} must keep the no-ranking promise`);
    assert.ok(visibleWordCount(html) >= 250, `${name} must not look thin to rendered audits`);
  }

  // Each landing page must be intent-specific, not a duplicate shell.
  const titles = pages.map(({ html }) => (html.match(/<title>([^<]+) - SEO Fix Kit<\/title>/) || [])[1]);
  assert.equal(new Set(titles).size, 3, "each landing page must have a unique title");
  assert.match(pages[0].html, /Small Business SEO Audit/);
  assert.match(pages[1].html, /Rendered vs Static SEO Audit/);
  assert.match(pages[2].html, /AI Answer Readiness Check/);
  // AI readiness boundary: no live answer-engine sampling, llms.txt optional.
  assert.match(pages[2].html, /No live answer-engine sampling/);
  assert.match(pages[2].html, /No AI citation monitoring/);
  assert.match(pages[2].html, /llms\.txt stays optional/);
  assert.match(pages[2].html, /does not sample live answer engines or monitor citations/);
  assert.match(pages[2].html, /Compared with CrawlRaven/);
  assert.match(pages[2].html, /ranked by the clicks and impressions on the affected pages/);
  assert.match(pages[2].html, /does not connect to Search Console or GA4 automatically/);
  assert.match(pages[2].html, /Does SEO Fix Kit rank AI readiness faults by traffic like CrawlRaven\?/);
  assert.match(pages[2].html, /Compared with free AI visibility checkers/);
  assert.match(pages[2].html, /SEO Fix Kit does not check AI-engine citations or visibility scores\./);
  assert.match(pages[2].html, /DefiniteSEO/);
  assert.match(pages[2].html, /RevSurge Digital/);
  assert.match(pages[2].html, /Answer Visibility Lab/);
  assert.match(pages[2].html, /Website AEO GEO Checker/);
  assert.match(pages[2].html, /Veuno/);
  // Direct challenge to the getaisearchscore.com r=0.009 headline stays truth-safe:
  // the null is real, but it does not refute proof-derived readiness.
  assert.match(pages[2].html, /On "technical readiness predicts nothing \(r=0\.009\)"/);
  assert.match(pages[2].html, /441 domains, Perplexity-only citations, cross-sectional/);
  assert.match(pages[2].html, /not on individual technical faults/);
  assert.match(pages[2].html, /judges readiness on the rendered page/);
  assert.match(pages[2].html, /never claims to predict citations/);
  assert.match(pages[2].html, /Content relevance is the citation driver; technical health is the hygiene floor/);
  assert.doesNotMatch(pages[2].html, /live AI citation monitoring is live/i);
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

test("shared public-product shell reflows at narrow viewports without a 320px floor", async () => {
  const { chromium } = await import("playwright");
  const shellPages = [
    { name: "/methodology", html: methodologyHtml(origin) },
    { name: "/packages", html: packagesHtml(origin) },
    { name: "/small-business-seo-audit", html: smallBusinessSeoAuditHtml(origin) },
    { name: "/rendered-vs-static-seo-audit", html: renderedVsStaticAuditHtml(origin) },
    { name: "/ai-answer-readiness", html: aiAnswerReadinessHtml(origin) }
  ];
  for (const { name, html } of shellPages) {
    assert.doesNotMatch(html, /min-width:\s*320px/, `${name} must not ship the 320px floor`);
    assert.doesNotMatch(html, /overflow-x\s*:\s*hidden/i, `${name} must wrap instead of hiding overflow`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const { name, html } of shellPages) {
      for (const width of [390, 320, 300, 280, 240]) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true });
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        const measured = await page.evaluate(() => {
          const root = document.documentElement;
          return {
            scrollWidth: root.scrollWidth,
            clientWidth: root.clientWidth,
            htmlOverflowX: getComputedStyle(root).overflowX,
            bodyOverflowX: getComputedStyle(document.body).overflowX,
            bodyMinWidth: getComputedStyle(document.body).minWidth,
            wideCount: [...document.querySelectorAll("*")]
              .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1).length
          };
        });
        assert.notEqual(measured.htmlOverflowX, "hidden", `${name} html overflow-x must stay visible at ${width}px`);
        assert.notEqual(measured.bodyOverflowX, "hidden", `${name} body overflow-x must stay visible at ${width}px`);
        assert.equal(measured.bodyMinWidth, "0px", `${name} must not keep the 320px floor at ${width}px`);
        assert.ok(
          measured.scrollWidth <= measured.clientWidth,
          `${name} overflow at ${width}px: scrollWidth=${measured.scrollWidth}/clientWidth=${measured.clientWidth}`
        );
        assert.equal(measured.wideCount, 0, `${name} has ${measured.wideCount} elements wider than the viewport at ${width}px`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("static public skill and sitemap files keep buyer-facing boundaries", () => {
  const skill = readFileSync(new URL("../../public/.well-known/skill.md", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");

  assert.deepEqual(parseSitemapUrls(sitemap), expectedSitemapUrls);
  for (const path of ["/demo", "/methodology", "/packages", "/check", "/proof", "/support", "/terms", "/small-business-seo-audit", "/rendered-vs-static-seo-audit", "/ai-answer-readiness"]) {
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
    for (const path of ["/demo", "/methodology", "/packages", "/check", "/proof", "/support", "/terms", "/privacy", "/small-business-seo-audit", "/rendered-vs-static-seo-audit", "/ai-answer-readiness"]) {
      assert.equal(covered.has(path), true, `${path} must be served by the Worker before SPA assets`);
    }
  }
});

test("real before/after proof receipt pins the same measurement path before and after", () => {
  const html = proofCaseHtml(origin);
  const markdown = proofCaseMarkdown(origin);

  assert.match(html, /One real repair, with the same measurement path before and after\./);
  assert.match(html, /Score <strong>85<\/strong>\/100 &middot; 7 findings/);
  assert.match(html, /Score <strong>99<\/strong>\/100 &middot; 2 findings/);
  assert.match(html, /Score <strong>100<\/strong>\/100 &middot; 0 findings/);
  assert.match(html, /tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b/);
  assert.match(html, /tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50/);
  assert.match(html, /tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961/);
  assert.match(html, /github\.com\/nish3451\/tinystudio-in\/pull\/4/);
  assert.match(html, /github\.com\/nish3451\/tinystudio-in\/pull\/5/);
  assert.match(html, new RegExp(`<a class="cta" href="${origin}/proof\\.md">`));
  assert.match(html, new RegExp(`href="${origin}/methodology"`));
  assert.match(html, new RegExp(`href="${origin}/packages"`));
  assert.match(html, /No ranking, traffic, indexing, citation, or revenue promise is made/);
  assert.match(html, /SEO Fix Kit did not publish CMS changes, open GitHub pull requests, merge code/);
  assert.match(html, /Founder-owned \(consented and redacted\)/);
  assert.doesNotMatch(html, /guaranteed rankings|guarantees traffic|guarantees revenue/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/seofixkit\.com\/proof" \/>/);
  assert.match(html, /"@type"\s*:\s*"SoftwareApplication"/, "the receipt must carry truthful machine-readable proof");
  assert.doesNotMatch(html, /min-width:\s*320px/, "the receipt must not ship the 320px floor");

  assert.match(markdown, /^# SEO Fix Kit .* Repair proof receipt/m);
  assert.match(markdown, /85\/100 with 7 findings/);
  assert.match(markdown, /100\/100 with 0 findings/);
  assert.match(markdown, /github\.com\/nish3451\/tinystudio-in\/pull\/4/);
  assert.match(markdown, /github\.com\/nish3451\/tinystudio-in\/pull\/5/);
  assert.match(markdown, /No ranking, traffic, indexing, citation, or revenue promise is made/);
  assert.match(markdown, new RegExp(`Anonymous one-page check: ${origin}/check`));
  assert.doesNotMatch(markdown, /guaranteed rankings|guarantees traffic|guarantees revenue/i);
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
