import http from "node:http";
import { auditUrl } from "./engine.js";
import {
  appendReportDeltaBrief,
  buildReportDelta
} from "../../shared/report-delta.js";

// The production engine has no static fallback when rendering fails, so the
// live target must reach network idle. aiconverter.app keeps analytics/ad
// connections open and never idles; the product site renders clean.
const target = process.env.TEST_URL || "https://seofixkit.com/";

const report = await auditUrl(target, { maxPages: 2, pageSpeed: false });

if (!report || !Array.isArray(report.findings)) {
  throw new Error("Audit did not return findings.");
}

if (!report.pages?.[0]?.rendered) {
  throw new Error("Audit did not return rendered page facts.");
}

const home = report.pages[0].rendered;
const hasProofFields =
  typeof home.wordCount === "number" &&
  Array.isArray(home.h1s) &&
  Array.isArray(home.internalLinks);

if (!hasProofFields) {
  throw new Error("Rendered proof fields are missing.");
}

if (!Array.isArray(report.repairPlan) || typeof report.repairBrief !== "string") {
  throw new Error("Repair handoff fields are missing.");
}

if (!Array.isArray(report.pageSummaries) || report.pageSummaries.length !== report.pages.length) {
  throw new Error("Page summary table data is missing.");
}

if (!report.summary || report.summary.maxPages < report.summary.pagesScanned) {
  throw new Error("Crawl limit summary is missing.");
}

if (!report.repairBrief.includes("# SEO Fix Kit repair brief")) {
  throw new Error("Repair brief is not copyable Markdown.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      url: report.url,
      score: report.score,
      pages: report.summary.pagesScanned,
      findings: report.summary.totalFindings,
      guardedFalsePositives: report.summary.guardedFalsePositives
    },
    null,
    2
  )
);

const heavyScriptBody = `window.__waterfallHeavyScript = "${"x".repeat(360_000)}";`;
const heavyStyleBody = `body::before{content:"${"x".repeat(80_000)}";display:none}`;
const largeImageBody = Buffer.alloc(760_000, 137);
const pluginScriptBody = `window.__fixturePluginLoaded = true;${"/* plugin */".repeat(800)}`;
const pluginStyleBody = `.fixture-plugin{display:block}${"/* css */".repeat(600)}`;

const fixtureServer = http.createServer((req, res) => {
  const fixtureOrigin = `http://${req.headers.host}`;

  if (req.url === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml\n");
    return;
  }
  if (req.url === "/sitemap.xml") {
    res.writeHead(200, { "content-type": "application/xml" });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${fixtureOrigin}/</loc></url>
  <url><loc>${fixtureOrigin}/technical</loc></url>
  <url><loc>${fixtureOrigin}/local</loc></url>
  <url><loc>${fixtureOrigin}/deep</loc></url>
  <url><loc>${fixtureOrigin}/crawl-intel</loc></url>
  <url><loc>${fixtureOrigin}/blue-widget-repair-a</loc></url>
  <url><loc>${fixtureOrigin}/blue-widget-repair-b</loc></url>
  <url><loc>${fixtureOrigin}/orphan-crawl-intel</loc></url>
  ${Array.from({ length: 20 }, (_, index) => `<url><loc>${fixtureOrigin}/deep-page-${index + 1}</loc></url>`).join("\n  ")}
</urlset>`);
    return;
  }
  if (req.url === "/llms.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("# Fixture\n\nThis is an AI-readable utility file, not an HTML page.");
    return;
  }
  if (req.url === "/broken") {
    res.writeHead(404, { "content-type": "text/html" });
    res.end("<!doctype html><title>Gone</title><h1>Gone</h1>");
    return;
  }
  if (req.url === "/canonical-missing") {
    res.writeHead(404, { "content-type": "text/html" });
    res.end("<!doctype html><title>Missing canonical</title><h1>Missing canonical</h1>");
    return;
  }
  if (req.url === "/missing-target") {
    res.writeHead(404, { "content-type": "text/html" });
    res.end("<!doctype html><title>Missing backlink target</title><h1>Missing backlink target</h1>");
    return;
  }
  if (req.url === "/redirect") {
    res.writeHead(301, { location: "/final" });
    res.end();
    return;
  }
  if (req.url === "/final") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>Final</title><h1>Final destination</h1>");
    return;
  }
  if (req.url === "/missing.png") {
    res.writeHead(404, { "content-type": "image/png" });
    res.end();
    return;
  }
  if (req.url === "/heavy-script.js") {
    res.writeHead(200, {
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(heavyScriptBody)
    });
    res.end(heavyScriptBody);
    return;
  }
  if (req.url === "/heavy-style.css") {
    res.writeHead(200, {
      "content-type": "text/css",
      "content-length": Buffer.byteLength(heavyStyleBody)
    });
    res.end(heavyStyleBody);
    return;
  }
  if (req.url === "/slow-script.js") {
    setTimeout(() => {
      const body = "window.__waterfallSlowScript = true;";
      res.writeHead(200, {
        "content-type": "application/javascript",
        "content-length": Buffer.byteLength(body)
      });
      res.end(body);
    }, 1250);
    return;
  }
  if (req.url === "/hero-large.jpg") {
    res.writeHead(200, {
      "content-type": "image/jpeg",
      "content-length": largeImageBody.length
    });
    res.end(largeImageBody);
    return;
  }
  if (req.url === "/wp-content/plugins/woocommerce/assets/js/frontend/cart-fragments.js") {
    res.writeHead(200, {
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(pluginScriptBody)
    });
    res.end(pluginScriptBody);
    return;
  }
  if (req.url === "/wp-content/plugins/elementor/assets/js/frontend.js") {
    res.writeHead(200, {
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(pluginScriptBody)
    });
    res.end(pluginScriptBody);
    return;
  }
  if (req.url === "/wp-content/plugins/contact-form-7/includes/js/index.js") {
    res.writeHead(200, {
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(pluginScriptBody)
    });
    res.end(pluginScriptBody);
    return;
  }
  if (req.url === "/wp-content/plugins/revslider/public/assets/js/rbtools.min.js") {
    res.writeHead(200, {
      "content-type": "application/javascript",
      "content-length": Buffer.byteLength(pluginScriptBody)
    });
    res.end(pluginScriptBody);
    return;
  }
  if (req.url === "/wp-content/plugins/woocommerce/assets/css/woocommerce.css") {
    res.writeHead(200, {
      "content-type": "text/css",
      "content-length": Buffer.byteLength(pluginStyleBody)
    });
    res.end(pluginStyleBody);
    return;
  }
  if (req.url === "/technical") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Technical SEO Validation Fixture</title>
    <meta name="description" content="A technical validation fixture with broken resources, duplicate hreflang tags, and invalid structured data for SEO Fix Kit testing." />
    <link rel="canonical" href="/canonical-missing" />
    <link rel="alternate" hreflang="en" href="/technical" />
    <link rel="alternate" hreflang="en" href="/final" />
    <meta property="og:image" content="/missing.png" />
    <meta name="twitter:image" content="/missing.png" />
    <link rel="stylesheet" href="/heavy-style.css" />
    <script src="/heavy-script.js"></script>
    <script src="/slow-script.js"></script>
    <script type="application/ld+json">{ "bad": true </script>
  </head>
  <body>
    <main>
      <h1>Technical validation fixture</h1>
      <p>${"Technical proof content. ".repeat(260)}</p>
      <a href="/broken">Broken internal link</a>
      <a href="/redirect">Redirecting internal link</a>
      <img src="/missing.png" alt="Missing image proof" />
      <img src="/hero-large.jpg" alt="Large hero proof" />
    </main>
  </body>
</html>`);
    return;
  }
  if (req.url === "/store-product") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content="WordPress 6.5" />
    <title>Fixture Woo Product</title>
    <meta name="description" content="A WooCommerce product fixture with platform-specific SEO problems." />
    <link rel="canonical" href="/store-product" />
    <link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css" />
    <script src="/wp-content/plugins/woocommerce/assets/js/frontend/cart-fragments.js"></script>
    <script src="/wp-content/plugins/elementor/assets/js/frontend.js"></script>
    <script src="/wp-content/plugins/contact-form-7/includes/js/index.js"></script>
    <script src="/wp-content/plugins/revslider/public/assets/js/rbtools.min.js"></script>
    <script type="application/ld+json">{ "@context": "https://schema.org", "@type": "WebSite", "name": "Fixture Store" }</script>
  </head>
  <body>
    <main>
      <h1>Fixture Woo Product</h1>
      <p>${"Useful product copy. ".repeat(80)}</p>
      <p>Sale price $49. Sold out. Add to cart when available. SKU WIDGET-1.</p>
      <a href="/product/widget?variant=blue">Blue variant</a>
      <a href="/shop?filter_color=blue&orderby=price">Filter by blue</a>
      <a href="/category/sale">Sale category</a>
      <a href="/tag/widgets">Widget tag</a>
      <img src="/hero-large.jpg" />
    </main>
  </body>
</html>`);
    return;
  }
  if (req.url === "/crawl-intel") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blue Widget Repair Services</title>
    <meta name="description" content="Blue widget repair services for teams that need reliable widget support." />
    <link rel="canonical" href="/crawl-intel" />
  </head>
  <body>
    <main>
      <h1>Blue widget repair services</h1>
      <p>${"Blue widget repair hub content. ".repeat(120)}</p>
      <a href="/blue-widget-repair-a">Blue widget repair service A</a>
      <a href="/blue-widget-repair-b">Blue widget repair service B</a>
      <a href="/crawl-filter?sort=price&filter=blue">Sorted blue widgets</a>
      <a href="/crawl-depth-1">Deep support page</a>
    </main>
  </body>
</html>`);
    return;
  }
  if (req.url === "/blue-widget-repair-a" || req.url === "/blue-widget-repair-b") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blue Widget Repair Services</title>
    <meta name="description" content="Blue widget repair services for teams that need reliable widget support." />
    <link rel="canonical" href="${req.url}" />
  </head>
  <body>
    <main>
      <h1>Blue widget repair services</h1>
      <p>${"Blue widget repair duplicate content with the same service promise and same proof points. ".repeat(120)}</p>
      <a href="/crawl-intel">Back to hub</a>
    </main>
  </body>
</html>`);
    return;
  }
  if (req.url?.startsWith("/crawl-filter")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Filtered Blue Widgets</title>
    <meta name="description" content="Filtered blue widget options." />
    <link rel="canonical" href="/crawl-intel" />
  </head>
  <body><main><h1>Filtered blue widgets</h1><p>${"Filtered widget content. ".repeat(80)}</p><a href="/crawl-intel">Clean hub</a></main></body>
</html>`);
    return;
  }
  const crawlDepthMatch = String(req.url || "").match(/^\/crawl-depth-(\d+)$/);
  if (crawlDepthMatch) {
    const level = Number(crawlDepthMatch[1]);
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Deep Crawl Support Level ${level}</title>
    <meta name="description" content="Deep crawl support level ${level}." />
    <link rel="canonical" href="/crawl-depth-${level}" />
  </head>
  <body>
    <main>
      <h1>Deep crawl support level ${level}</h1>
      <p>${"Deep crawl support content. ".repeat(100)}</p>
      ${level < 4 ? `<a href="/crawl-depth-${level + 1}">Next deep level</a>` : ""}
    </main>
  </body>
</html>`);
    return;
  }
  if (req.url === "/orphan-crawl-intel") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>Orphan crawl intelligence</title><h1>Orphan crawl intelligence</h1>");
    return;
  }
  if (req.url === "/source-live") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Live source</title></head>
  <body><a href="/technical">money keyword</a></body>
</html>`);
    return;
  }
  if (req.url === "/source-lost") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Lost source</title></head>
  <body><p>This page used to link to the fixture.</p></body>
</html>`);
    return;
  }
  if (req.url === "/casino-source") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Casino source</title></head>
  <body><a href="/missing-target">money keyword</a></body>
</html>`);
    return;
  }
  if (req.url === "/local") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fixture Dental Austin</title>
    <meta name="description" content="Fixture Dental Austin helps families with preventive dentistry in Austin." />
    <link rel="canonical" href="/local" />
    <script type="application/ld+json">{ "@context": "https://schema.org", "@type": "Organization", "name": "Fixture Dental Austin" }</script>
  </head>
  <body>
    <main>
      <h1>Fixture dentist Austin</h1>
      <p>Fixture Dental Austin helps local families with routine dental care and transparent appointment scheduling.</p>
      <p>Call (512) 555-0199 for appointments.</p>
    </main>
  </body>
</html>`);
    return;
  }
  if (req.url === "/citation-good") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Good citation</title></head>
  <body><p>Fixture Dental Austin, (512) 555-0199, 123 Local St, Austin, TX 78701</p></body>
</html>`);
    return;
  }
  if (req.url === "/citation-bad") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Bad citation</title></head>
  <body><p>Fixture Dental Austin, (512) 555-0000, 999 Old Rd, Austin, TX</p></body>
</html>`);
    return;
  }
  if (req.url === "/competitor") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Competitor Benchmark Fixture</title>
    <meta name="description" content="A clean competitor homepage fixture for SEO Fix Kit benchmark testing." />
    <link rel="canonical" href="/competitor" />
    <script type="application/ld+json">{ "@context": "https://schema.org", "@type": "WebSite", "name": "Competitor Fixture" }</script>
  </head>
  <body>
    <main>
      <h1>Competitor benchmark fixture</h1>
      <p>${"Useful competitor content. ".repeat(260)}</p>
      <a href="/final">Working internal link</a>
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Inline proof" />
    </main>
  </body>
</html>`);
    return;
  }
  if (req.url === "/deep") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Deep Crawl Fixture</title>
    <meta name="description" content="A fixture index with more than ten internal pages." />
    <link rel="canonical" href="/deep" />
  </head>
  <body>
    <main>
      <h1>Deep crawl fixture</h1>
      <p>${"Deep crawl content. ".repeat(260)}</p>
      ${Array.from({ length: 20 }, (_, index) => `<a href="/deep-page-${index + 1}">Deep page ${index + 1}</a>`).join("")}
    </main>
  </body>
</html>`);
    return;
  }
  const deepPageMatch = String(req.url || "").match(/^\/deep-page-(\d+)$/);
  if (deepPageMatch) {
    const pageNumber = Number(deepPageMatch[1]);
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Deep Page ${pageNumber}</title>
    <meta name="description" content="Deep crawl page ${pageNumber} for max page limit proof." />
    <link rel="canonical" href="/deep-page-${pageNumber}" />
  </head>
  <body>
    <main>
      <h1>Deep page ${pageNumber}</h1>
      <p>${"Deep page proof content. ".repeat(260)}</p>
      <a href="/deep">Back to deep index</a>
    </main>
  </body>
</html>`);
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fixture Shell</title>
    <meta name="description" content="Rendered fixture page for audit testing." />
  </head>
  <body>
    <div id="root">Shell</div>
    <script>
      document.getElementById("root").innerHTML = '<main><h1>Rendered page title</h1><p>' + 'Useful rendered content. '.repeat(260) + '</p><a href="/llms.txt">AI guide</a><a href="/about">About</a></main>';
    </script>
  </body>
</html>`);
});

await new Promise((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
const address = fixtureServer.address();
const fixtureUrl = `http://127.0.0.1:${address.port}/`;
const fixtureReport = await auditUrl(fixtureUrl, { maxPages: 2 });
const deepCrawlReport = await auditUrl(`${fixtureUrl}deep`, { maxPages: 12, pageSpeed: false });

if (deepCrawlReport.summary.maxPages !== 12 || deepCrawlReport.summary.pagesScanned !== 12) {
  throw new Error(`Deep crawl limit did not exceed the old 10-page cap: ${deepCrawlReport.summary.pagesScanned}/${deepCrawlReport.summary.maxPages}`);
}

if (deepCrawlReport.crawlDepth?.selfServeMaxPages < 1000) {
  throw new Error("Self-serve crawl depth metadata is missing.");
}

if (deepCrawlReport.crawlInventory?.summary?.urlsDiscovered < 20) {
  throw new Error("Crawl inventory did not discover the sitemap URL set.");
}

if (deepCrawlReport.crawlInventory?.summary?.inventoryLimit < 50000) {
  throw new Error("Crawl inventory public-scale cap metadata is missing.");
}

if (!deepCrawlReport.repairBrief.includes("Crawl inventory")) {
  throw new Error("Crawl inventory was not carried into the repair brief.");
}

const guarded = fixtureReport.findings.filter(
  (finding) => finding.severity === "good" && finding.type === "guard"
);

if (guarded.length < 2) {
  throw new Error("False-positive guard findings were not created for rendered fixture.");
}

if (!fixtureReport.repairBrief.includes("Do not fix these false positives")) {
  throw new Error("False-positive protections were not carried into the repair brief.");
}

if (fixtureReport.pages.some((page) => page.url.endsWith("/llms.txt"))) {
  throw new Error("Plain-text utility files should not be audited as HTML pages.");
}

if (fixtureReport.aiAnswerReadiness?.status !== "ready") {
  throw new Error("AI Answer Readiness was not carried through the main audit flow.");
}

if (!fixtureReport.findings.some((finding) => finding.type === "ai-answer-readiness")) {
  throw new Error("AI Answer Readiness findings were not merged into audit findings.");
}

if (!fixtureReport.repairPlan.some((item) => item.source === "ai-answer-readiness-proof")) {
  throw new Error("AI Answer Readiness repairs were not merged into the repair plan.");
}

if (!fixtureReport.repairBrief.includes("AI Answer Readiness")) {
  throw new Error("AI Answer Readiness was not carried into the repair brief.");
}

const technicalReport = await auditUrl(`${fixtureUrl}technical`, { maxPages: 1 });
const technicalTitles = technicalReport.findings.map((finding) => finding.title);

for (const expected of [
  "Broken internal links",
  "Redirecting internal links",
  "Broken images",
  "Canonical URL is not reachable",
  "Structured data JSON is invalid",
  "Duplicate hreflang tag"
]) {
  if (!technicalTitles.some((title) => title.includes(expected))) {
    throw new Error(`Technical validation finding missing: ${expected}`);
  }
}

if (!technicalReport.repairPlan.some((item) => item.title.includes("Broken internal links"))) {
  throw new Error("Broken link repair plan item is missing.");
}

const technicalWaterfall = technicalReport.pages?.[0]?.resourceWaterfall;
if (technicalWaterfall?.status !== "ready") {
  throw new Error("Resource waterfall proof is missing from the technical report.");
}

if ((technicalWaterfall.summary?.totalRequests || 0) < 4) {
  throw new Error("Resource waterfall did not capture the fixture resources.");
}

if ((technicalWaterfall.summary?.scriptBytes || 0) < 300_000) {
  throw new Error("Resource waterfall did not measure the heavy JavaScript payload.");
}

for (const expected of [
  "Heavy JavaScript payload",
  "Render-blocking resources",
  "Slow resource requests"
]) {
  if (!technicalTitles.some((title) => title.includes(expected))) {
    throw new Error(`Resource waterfall finding missing: ${expected}`);
  }
}

if (!technicalReport.repairBrief.includes("Resource waterfall proof snapshot")) {
  throw new Error("Resource waterfall proof was not carried into the repair brief.");
}

const platformReport = await auditUrl(`${fixtureUrl}store-product`, { maxPages: 1, pageSpeed: false });
const platformAudit = platformReport.platformSeoAudit;

if (platformAudit?.status !== "ready") {
  throw new Error("Platform SEO audit summary is missing.");
}

if (!platformAudit.summary.wordpressDetected || !platformAudit.summary.ecommerceDetected) {
  throw new Error("Platform SEO audit did not detect WordPress and ecommerce proof.");
}

if (!platformAudit.summary.detectedPlatformNames.includes("WooCommerce")) {
  throw new Error("WooCommerce platform signal was not detected.");
}

for (const expected of [
  "Product schema",
  "Faceted or variant",
  "WordPress archive",
  "WordPress plugin"
]) {
  if (!platformAudit.repairOpportunities.some((item) => item.title.includes(expected))) {
    throw new Error(`Platform SEO repair missing: ${expected}`);
  }
}

if (!platformReport.repairBrief.includes("Platform SEO audit")) {
  throw new Error("Platform SEO audit was not carried into the repair brief.");
}

const crawlIntelligenceReport = await auditUrl(`${fixtureUrl}crawl-intel`, { maxPages: 8, pageSpeed: false });
const crawlIntelligence = crawlIntelligenceReport.crawlIntelligence;

if (crawlIntelligence?.status !== "ready") {
  throw new Error("Crawl intelligence summary is missing.");
}

if (!crawlIntelligence.summary.orphanInventoryCandidates) {
  throw new Error("Crawl intelligence did not detect sitemap orphan candidates.");
}

if (!crawlIntelligence.summary.duplicateTitleGroups) {
  throw new Error("Crawl intelligence did not detect duplicate title groups.");
}

if (!crawlIntelligence.summary.duplicateContentPairs) {
  throw new Error("Crawl intelligence did not detect near-duplicate content pairs.");
}

if (!crawlIntelligence.summary.cannibalizationGroups) {
  throw new Error("Crawl intelligence did not detect keyword cannibalization groups.");
}

if (!crawlIntelligence.summary.parameterizedLinks) {
  throw new Error("Crawl intelligence did not detect parameterized internal links.");
}

if (!crawlIntelligence.repairOpportunities.some((item) => item.title.includes("Duplicate title"))) {
  throw new Error("Crawl intelligence duplicate-title repair action is missing.");
}

if (!crawlIntelligenceReport.repairBrief.includes("Crawl intelligence audit")) {
  throw new Error("Crawl intelligence was not carried into the repair brief.");
}

const renderedScaleReport = await auditUrl(`${fixtureUrl}crawl-intel`, {
  maxPages: 8,
  pageSpeed: false,
  renderedCrawlTarget: 50000
});
const renderedScale = renderedScaleReport.renderedCrawlScale;

if (renderedScale?.status !== "ready") {
  throw new Error("Rendered crawl scale plan is missing.");
}

if (!renderedScale.summary.plannedBatches || renderedScale.summary.requestedTargetPages !== 50000) {
  throw new Error("Rendered crawl scale plan did not preserve the 50K target.");
}

if (!renderedScale.repairOpportunities.some((item) => item.title.includes("staged rendered batches"))) {
  throw new Error("Rendered crawl scale staged-batch repair action is missing.");
}

if (!renderedScaleReport.repairBrief.includes("Rendered crawl scale plan")) {
  throw new Error("Rendered crawl scale plan was not carried into the repair brief.");
}

const firstRunDelta = buildReportDelta(fixtureReport, null);
if (firstRunDelta.status !== "first_run") {
  throw new Error("First-run audit delta status is missing.");
}

const repairDelta = buildReportDelta(fixtureReport, technicalReport);
if (repairDelta.status !== "ready" || repairDelta.summary.fixedIssuesCount < 3) {
  throw new Error("Audit history delta did not detect fixed issues.");
}

if (!appendReportDeltaBrief(fixtureReport.repairBrief, repairDelta).includes("Audit history delta")) {
  throw new Error("Audit history delta was not carried into the repair brief.");
}

const performanceReport = await auditUrl(`${fixtureUrl}technical`, {
  maxPages: 1,
  pageSpeed: true,
  pageSpeedFetcher: async () => mockPageSpeedResult()
});
const performanceTitles = performanceReport.findings.map((finding) => finding.title);

for (const expected of [
  "Low mobile PageSpeed performance",
  "Slow Largest Contentful Paint",
  "High Total Blocking Time",
  "Layout shift risk",
  "Eliminate render-blocking resources",
  "Reduce unused JavaScript"
]) {
  if (!performanceTitles.some((title) => title.includes(expected))) {
    throw new Error(`Performance finding missing: ${expected}`);
  }
}

if (!performanceReport.performance || performanceReport.performance.performanceScore !== 42) {
  throw new Error("PageSpeed performance summary is missing.");
}

if (!performanceReport.repairBrief.includes("Performance proof snapshot")) {
  throw new Error("Performance proof was not carried into the repair brief.");
}

const benchmarkReport = await auditUrl(`${fixtureUrl}technical`, {
  maxPages: 1,
  competitorUrls: [`http://localhost:${address.port}/competitor`],
  pageSpeed: false
});

if (benchmarkReport.competitorBenchmark?.status !== "ready") {
  throw new Error("Competitor benchmark summary is missing.");
}

if (!benchmarkReport.competitorBenchmark.repairOpportunities.length) {
  throw new Error("Competitor benchmark repair opportunities are missing.");
}

if (!benchmarkReport.repairBrief.includes("Competitor benchmark")) {
  throw new Error("Competitor benchmark was not carried into the repair brief.");
}

const backlinkReport = await auditUrl(`${fixtureUrl}technical`, {
  maxPages: 1,
  pageSpeed: false,
  allowPrivateBacklinks: true,
  backlinkRows: [
    {
      sourceUrl: `${fixtureUrl}source-live`,
      targetUrl: `${fixtureUrl}technical`,
      anchorText: "money keyword"
    },
    {
      sourceUrl: `${fixtureUrl}source-lost`,
      targetUrl: `${fixtureUrl}technical`,
      anchorText: "money keyword"
    },
    {
      sourceUrl: `${fixtureUrl}casino-source`,
      targetUrl: `${fixtureUrl}missing-target`,
      anchorText: "money keyword"
    }
  ]
});

if (backlinkReport.backlinkAudit?.status !== "ready") {
  throw new Error("Backlink audit summary is missing.");
}

if (!backlinkReport.backlinkAudit.summary.lost) {
  throw new Error("Backlink lost-link proof is missing.");
}

if (!backlinkReport.backlinkAudit.summary.toxicRisk) {
  throw new Error("Backlink risky-source proof is missing.");
}

if (!backlinkReport.backlinkAudit.summary.brokenTargets) {
  throw new Error("Backlink broken-target proof is missing.");
}

if (!backlinkReport.backlinkAudit.anchorRisks?.length) {
  throw new Error("Backlink anchor over-optimization proof is missing.");
}

if (!backlinkReport.repairBrief.includes("Backlink audit")) {
  throw new Error("Backlink audit was not carried into the repair brief.");
}

if (!backlinkReport.repairPlan.some((item) => item.title.includes("Backlinks") || item.title.includes("backlink") || item.title.includes("Anchor text"))) {
  throw new Error("Backlink repair plan items are missing.");
}

const localSeoReport = await auditUrl(`${fixtureUrl}local`, {
  maxPages: 1,
  pageSpeed: false,
  allowPrivateLocalSeo: true,
  localSeo: {
    businessName: "Fixture Dental Austin",
    phone: "(512) 555-0199",
    address: "123 Local St, Austin, TX 78701",
    googleBusinessProfileUrl: "https://maps.google.com/?cid=12345",
    localKeywords: ["fixture dentist Austin", "emergency dentist Austin"],
    citations: [
      {
        sourceUrl: `${fixtureUrl}citation-good`
      },
      {
        sourceUrl: `${fixtureUrl}citation-bad`
      }
    ]
  }
});

if (localSeoReport.localSeoAudit?.status !== "ready") {
  throw new Error("Local SEO audit summary is missing.");
}

if (localSeoReport.localSeoAudit.summary.napFieldsFoundOnSite >= localSeoReport.localSeoAudit.summary.napFieldsSupplied) {
  throw new Error("Local SEO missing NAP proof was not detected.");
}

if (localSeoReport.localSeoAudit.summary.localSchemaFound) {
  throw new Error("Local SEO missing LocalBusiness schema proof was not detected.");
}

if (!localSeoReport.localSeoAudit.summary.citationIssues) {
  throw new Error("Local SEO citation mismatch proof is missing.");
}

if (localSeoReport.localSeoAudit.summary.localKeywordsCovered >= localSeoReport.localSeoAudit.summary.localKeywordsChecked) {
  throw new Error("Local SEO local keyword gap proof is missing.");
}

if (!localSeoReport.repairBrief.includes("Local SEO audit")) {
  throw new Error("Local SEO audit was not carried into the repair brief.");
}

if (!localSeoReport.repairPlan.some((item) => item.title.includes("Local SEO") || item.title.includes("LocalBusiness") || item.title.includes("citations"))) {
  throw new Error("Local SEO repair plan items are missing.");
}

const keywordRankReport = await auditUrl(`${fixtureUrl}crawl-intel`, {
  maxPages: 8,
  pageSpeed: false,
  allowPrivateKeywordRows: true,
  keywordRows: [
    {
      query: "blue widget repair",
      pageUrl: `${fixtureUrl}crawl-intel`,
      clicks: 5,
      impressions: 1000,
      ctr: "0.5%",
      position: 4,
      previousClicks: 30,
      previousPosition: 3
    },
    {
      query: "blue widget repair",
      pageUrl: `${fixtureUrl}blue-widget-repair-a`,
      clicks: 1,
      impressions: 400,
      ctr: "0.25%",
      position: 8
    },
    {
      query: "deep crawl support",
      pageUrl: `${fixtureUrl}crawl-depth-4`,
      clicks: 0,
      impressions: 350,
      ctr: "0%",
      position: 15
    },
    {
      query: "widget pricing guide",
      pageUrl: `${fixtureUrl}crawl-filter?sort=price&filter=blue`,
      clicks: 2,
      impressions: 180,
      ctr: "1.1%",
      position: 7
    },
    {
      query: "fixture rendered demo",
      pageUrl: `${fixtureUrl}rendered-page`,
      clicks: 0,
      impressions: 150,
      ctr: "0%",
      position: 12
    }
  ]
});

const keywordRankAudit = keywordRankReport.keywordRankAudit;

if (keywordRankAudit?.status !== "ready") {
  throw new Error("Keyword/rank audit summary is missing.");
}

if (!keywordRankAudit.summary.lowCtrOpportunities) {
  throw new Error("Keyword/rank low-CTR proof is missing.");
}

if (!keywordRankAudit.summary.pageTwoOpportunities) {
  throw new Error("Keyword/rank page-two proof is missing.");
}

if (!keywordRankAudit.summary.decliningRows) {
  throw new Error("Keyword/rank decline proof is missing.");
}

if (!keywordRankAudit.summary.cannibalizationGroups) {
  throw new Error("Keyword/rank cannibalization proof is missing.");
}

if (!keywordRankAudit.summary.missingLandingPageRows) {
  throw new Error("Keyword/rank uncrawled landing-page proof is missing.");
}

if (!keywordRankReport.repairBrief.includes("Keyword/rank audit")) {
  throw new Error("Keyword/rank audit was not carried into the repair brief.");
}

if (!keywordRankReport.repairPlan.some((item) => item.source === "keyword-rank-audit")) {
  throw new Error("Keyword/rank repair plan items are missing.");
}

if (keywordRankReport.growthOpportunities?.status !== "ready") {
  throw new Error("Growth opportunities were not carried through the main audit flow.");
}

if (!keywordRankReport.growthOpportunities.opportunities.some((item) => item.sourceKind === "keyword")) {
  throw new Error("Keyword-backed growth opportunity is missing.");
}

if (!keywordRankReport.repairBrief.includes("Draft-only growth opportunities")) {
  throw new Error("Growth opportunities were not carried into the repair brief.");
}

fixtureServer.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      fixtureUrl,
      deepCrawlPages: deepCrawlReport.summary.pagesScanned,
      crawlInventoryUrls: deepCrawlReport.crawlInventory.summary.urlsDiscovered,
      crawlIntelligenceRepairs: crawlIntelligence.repairOpportunities.length,
      crawlIntelligenceDuplicates: crawlIntelligence.summary.duplicateContentPairs,
      renderedScaleBatches: renderedScale.summary.plannedBatches,
      renderedScaleRepairs: renderedScale.repairOpportunities.length,
      fixedSincePreviousAudit: repairDelta.summary.fixedIssuesCount,
      guardedFalsePositives: guarded.length,
      technicalFindings: technicalReport.findings.length,
      waterfallRequests: technicalWaterfall.summary.totalRequests,
      waterfallScriptBytes: technicalWaterfall.summary.scriptBytes,
      performanceFindings: performanceReport.findings.filter((finding) => finding.type === "performance").length,
      benchmarkCompetitors: benchmarkReport.competitorBenchmark.summary.competitorsCompared,
      benchmarkRepairs: benchmarkReport.competitorBenchmark.repairOpportunities.length,
      backlinkRows: backlinkReport.backlinkAudit.summary.imported,
      backlinkRepairs: backlinkReport.backlinkAudit.repairOpportunities.length,
      platformRepairs: platformAudit.repairOpportunities.length,
      platformPlugins: platformAudit.summary.wordpressPlugins,
      localSeoRepairs: localSeoReport.localSeoAudit.repairOpportunities.length,
      localSeoCitationIssues: localSeoReport.localSeoAudit.summary.citationIssues,
      keywordRankRows: keywordRankAudit.summary.imported,
      keywordRankRepairs: keywordRankAudit.repairOpportunities.length
    },
    null,
    2
  )
);

function mockPageSpeedResult() {
  return {
    id: "http://fixture.test/technical",
    analysisUTCTimestamp: "2026-06-05T00:00:00.000Z",
    loadingExperience: {
      overall_category: "SLOW",
      origin_fallback: true,
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4200, category: "SLOW" },
        INTERACTION_TO_NEXT_PAINT: { percentile: 390, category: "SLOW" },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 18, category: "NEEDS_IMPROVEMENT" }
      }
    },
    lighthouseResult: {
      categories: {
        performance: { score: 0.42 }
      },
      audits: {
        "first-contentful-paint": {
          title: "First Contentful Paint",
          numericValue: 2500,
          displayValue: "2.5 s",
          score: 0.5
        },
        "largest-contentful-paint": {
          title: "Largest Contentful Paint",
          numericValue: 4200,
          displayValue: "4.2 s",
          score: 0.2
        },
        "total-blocking-time": {
          title: "Total Blocking Time",
          numericValue: 760,
          displayValue: "760 ms",
          score: 0.1
        },
        "cumulative-layout-shift": {
          title: "Cumulative Layout Shift",
          numericValue: 0.18,
          displayValue: "0.18",
          score: 0.55
        },
        "speed-index": {
          title: "Speed Index",
          numericValue: 5100,
          displayValue: "5.1 s",
          score: 0.35
        },
        "render-blocking-resources": {
          title: "Eliminate render-blocking resources",
          displayValue: "Potential savings of 1,200 ms",
          score: 0,
          details: { overallSavingsMs: 1200 }
        },
        "unused-javascript": {
          title: "Reduce unused JavaScript",
          displayValue: "Potential savings of 90 KiB",
          score: 0.2,
          details: { overallSavingsBytes: 92_160 }
        }
      }
    }
  };
}
