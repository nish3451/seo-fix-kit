import * as cheerio from "cheerio";
import { chromium } from "playwright";
import {
  buildCompetitorBenchmark,
  competitorBenchmarkBriefLines
} from "../../shared/competitor-benchmark.js";
import {
  backlinkAuditBriefLines,
  buildBacklinkAudit
} from "../../shared/backlink-audit.js";
import {
  buildLocalSeoAudit,
  localSeoAuditBriefLines
} from "../../shared/local-seo-audit.js";
import {
  buildKeywordRankAudit,
  keywordRankAuditBriefLines
} from "../../shared/keyword-rank-audit.js";
import {
  crawlDepthSummary,
  normalizeCrawlLimit
} from "../../shared/crawl-depth.js";
import {
  buildCrawlInventory,
  crawlInventoryBriefLines
} from "../../shared/crawl-inventory.js";
import {
  buildRenderedCrawlScalePlan,
  renderedCrawlScaleBriefLines
} from "../../shared/rendered-crawl-scale.js";
import {
  isPrivateHost,
  publicUrlStatus
} from "../../shared/url-safety.js";
import {
  buildCrawlIntelligence,
  crawlIntelligenceBriefLines
} from "../../shared/crawl-intelligence.js";
import {
  buildResourceWaterfall,
  resourceWaterfallBriefLines,
  resourceWaterfallFindings
} from "../../shared/resource-waterfall.js";
import {
  buildPlatformSeoAudit,
  platformSeoAuditBriefLines
} from "../../shared/platform-seo-audit.js";

const GOOGLE_DOCS = {
  javascript:
    "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  title: "https://developers.google.com/search/docs/appearance/title-link",
  snippets: "https://developers.google.com/search/docs/appearance/snippet",
  structuredData:
    "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
  hreflang: "https://developers.google.com/search/docs/specialty/international/localized-versions",
  coreWebVitals: "https://developers.google.com/search/docs/appearance/core-web-vitals",
  linkBestPractices: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable"
};

const RESOURCE_LIMITS = {
  linksPerPage: 50,
  imagesPerPage: 25,
  maxRedirects: 5,
  timeoutMs: 7000,
  largeHtmlBytes: 500_000,
  largeImageBytes: 500_000,
  slowRenderMs: 4000
};

const PERFORMANCE_LIMITS = {
  poorScore: 50,
  needsImprovementScore: 75,
  lcpPoorMs: 4000,
  lcpNeedsImprovementMs: 2500,
  clsPoor: 0.25,
  clsNeedsImprovement: 0.1,
  tbtPoorMs: 600,
  tbtNeedsImprovementMs: 300,
  fcpNeedsImprovementMs: 1800,
  speedIndexNeedsImprovementMs: 3400
};

export async function auditUrl(inputUrl, options = {}) {
  const startedAt = Date.now();
  const maxPages = normalizeCrawlLimit(options.maxPages || 10);
  const startUrl = normalizeUrl(inputUrl);
  const origin = new URL(startUrl).origin;
  let crawlOrigin = origin;
  const robots = await fetchText(`${origin}/robots.txt`);
  const sitemap = await fetchText(`${origin}/sitemap.xml`);

  let browser = null;
  const warnings = [];

  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    warnings.push({
      title: "Rendered checks unavailable",
      body:
        "Playwright could not start Chromium, so this run used static HTML only. Run `npx playwright install chromium` to enable proof-grade rendered checks.",
      detail: error.message
    });
  }

  const pages = [];
  const visited = new Set();
  const queue = [startUrl];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    const normalized = stripHash(url);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const page = await inspectPage(normalized, browser);
    if (!page.isHtml) continue;
    pages.push(page);
    if (pages.length === 1 && page.rendered?.finalUrl) {
      crawlOrigin = new URL(page.rendered.finalUrl).origin;
    }

    for (const link of page.rendered.internalLinks) {
      if (pages.length + queue.length >= maxPages) break;
      const href = stripHash(link.href);
      if (!href.startsWith(crawlOrigin)) continue;
      if (isLikelyHtmlUrl(href) && !visited.has(href) && !queue.includes(href)) {
        queue.push(href);
      }
    }
  }

  if (browser) {
    await browser.close();
  }

  const performance = await collectPerformanceInsights(startUrl, pages[0], {
    pageSpeed: options.pageSpeed,
    pageSpeedFetcher: options.pageSpeedFetcher,
    pageSpeedApiKey:
      options.pageSpeedApiKey ||
      process.env.GOOGLE_PAGESPEED_API_KEY ||
      process.env.PAGESPEED_API_KEY ||
      ""
  });

  const findings = buildFindings({
    pages,
    startUrl,
    robots,
    sitemap,
    renderedAvailable: Boolean(browser),
    performance
  });

  const score = scoreFindings(findings);
  const pageSummaries = buildPageSummaries(pages, findings, startUrl);
  const summary = summarize(findings, pages, maxPages);
  let repairPlan = buildRepairPlan(findings);
  const fixPack = buildFixPack(pages[0], origin, findings);
  const report = {
    id: makeReportId(startUrl, startedAt),
    url: startUrl,
    origin,
    scannedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    score,
    summary,
    crawlDepth: crawlDepthSummary(maxPages),
    warnings,
    docs: GOOGLE_DOCS,
    performance,
    pages,
    pageSummaries,
    findings,
    repairPlan,
    repairBrief: "",
    fixPack
  };

  report.crawlInventory = await buildCrawlInventory(startUrl, {
    robots,
    sitemap,
    pages,
    maxUrls: options.crawlInventoryMaxUrls,
    maxSitemaps: options.crawlInventoryMaxSitemaps,
    fetcher: options.crawlInventoryFetcher || fetch,
    allowPrivate: Boolean(options.allowPrivateCrawlInventory || isPrivateHost(startUrl))
  });

  const renderedCrawlScale = buildRenderedCrawlScalePlan(report, report.crawlInventory, {
    renderedCrawlTarget: options.renderedCrawlTarget || options.crawlScaleTarget
  });
  if (renderedCrawlScale.status === "ready") {
    report.renderedCrawlScale = renderedCrawlScale;
    repairPlan = mergeRepairPlans(repairPlan, renderedCrawlScale.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const crawlIntelligence = buildCrawlIntelligence(report, report.crawlInventory);
  if (crawlIntelligence.status === "ready") {
    report.crawlIntelligence = crawlIntelligence;
    repairPlan = mergeRepairPlans(repairPlan, crawlIntelligence.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const competitorReports = await auditCompetitorUrls(startUrl, options);
  if (competitorReports.warnings.length) {
    warnings.push(...competitorReports.warnings);
  }
  if (competitorReports.reports.length) {
    report.competitorBenchmark = buildCompetitorBenchmark(report, competitorReports.reports);
  }

  const backlinkAudit = await buildBacklinkAudit(report, options.backlinks || options.backlinkRows || [], {
    allowPrivate: Boolean(options.allowPrivateBacklinks),
    fetcher: options.backlinkFetcher || fetch
  });
  if (backlinkAudit.status === "ready") {
    report.backlinkAudit = backlinkAudit;
    repairPlan = mergeRepairPlans(repairPlan, backlinkAudit.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const localSeoAudit = await buildLocalSeoAudit(report, options.localSeo || options.localSeoInput || {}, {
    allowPrivate: Boolean(options.allowPrivateLocalSeo),
    fetcher: options.localSeoFetcher || fetch
  });
  if (localSeoAudit.status === "ready") {
    report.localSeoAudit = localSeoAudit;
    repairPlan = mergeRepairPlans(repairPlan, localSeoAudit.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const keywordRankAudit = buildKeywordRankAudit(report, options.keywordRows || options.keywordRankRows || [], {
    allowPrivate: Boolean(options.allowPrivateKeywordRows)
  });
  if (keywordRankAudit.status === "ready") {
    report.keywordRankAudit = keywordRankAudit;
    repairPlan = mergeRepairPlans(repairPlan, keywordRankAudit.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  const platformSeoAudit = buildPlatformSeoAudit(report);
  if (platformSeoAudit.status === "ready") {
    report.platformSeoAudit = platformSeoAudit;
    repairPlan = mergeRepairPlans(repairPlan, platformSeoAudit.repairOpportunities);
    report.repairPlan = repairPlan;
  }

  report.repairBrief = buildRepairBrief({
    startUrl,
    score,
    summary,
    pages,
    findings,
    repairPlan,
    performance,
    competitorBenchmark: report.competitorBenchmark,
    crawlInventory: report.crawlInventory,
    renderedCrawlScale: report.renderedCrawlScale,
    crawlIntelligence: report.crawlIntelligence,
    backlinkAudit: report.backlinkAudit,
    localSeoAudit: report.localSeoAudit,
    keywordRankAudit: report.keywordRankAudit,
    platformSeoAudit: report.platformSeoAudit
  });

  return report;
}

async function inspectPage(url, browser) {
  const staticFetch = await fetchText(url);
  const isHtml = isHtmlResponse(staticFetch, url);
  const finalUrl = staticFetch.url || url;
  const staticFacts = extractStaticFacts(staticFetch.body || "", finalUrl, staticFetch);
  let renderedFacts = null;
  let renderedError = null;

  if (browser && isHtml) {
    try {
      renderedFacts = await extractRenderedFacts(browser, finalUrl);
    } catch (error) {
      renderedError = error.message;
    }
  }

  const rendered = renderedFacts || {
    ...staticFacts,
    source: "static-fallback",
    renderError: renderedError || "Rendered audit unavailable"
  };
  const resources = isHtml ? await validatePageResources(rendered) : emptyResourceChecks();
  const resourceWaterfall = buildResourceWaterfall({
    url,
    finalUrl,
    rendered
  });

  return {
    url,
    finalUrl,
    redirected: stripHash(finalUrl) !== stripHash(url),
    status: staticFetch.status,
    ok: staticFetch.ok,
    contentType: staticFetch.contentType,
    headers: staticFetch.headers || {},
    redirectChain: staticFetch.redirectChain || [],
    responseTimeMs: staticFetch.responseTimeMs || null,
    transferSize: staticFetch.contentLength || byteLength(staticFetch.body || ""),
    isHtml,
    static: staticFacts,
    rendered,
    linkChecks: resources.links,
    imageChecks: resources.images,
    canonicalCheck: resources.canonical,
    resourceWaterfall,
    renderError: renderedError
  };
}

async function auditCompetitorUrls(startUrl, options = {}) {
  if (options.skipCompetitors) return { reports: [], warnings: [] };
  const urls = normalizeCompetitorUrls(options.competitorUrls || options.competitors || [], startUrl);
  const reports = [];
  const warnings = [];

  for (const competitorUrl of urls) {
    try {
      const report = await auditUrl(competitorUrl, {
        maxPages: Math.min(clampPageLimit(options.competitorMaxPages || 1), 3),
        pageSpeed: options.competitorPageSpeed === true,
        skipCompetitors: true
      });
      reports.push(report);
    } catch (error) {
      warnings.push({
        title: "Competitor benchmark unavailable",
        body: `Could not benchmark ${competitorUrl}.`,
        detail: error.message || "The competitor snapshot failed."
      });
    }
  }

  return { reports, warnings };
}

async function extractRenderedFacts(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent:
      "SEOFixKit/0.3 (+https://seo-fix-kit.local; rendered SEO audit; respectful crawl)"
  });
  const page = await context.newPage();
  const started = Date.now();
  const response = await page.goto(url, {
    waitUntil: "networkidle",
    timeout: 25000
  });
  await page.waitForTimeout(500);

  const facts = await page.evaluate(() => {
    const absolute = (value) => {
      try {
        return value ? new URL(value, location.href).href : null;
      } catch {
        return value || null;
      }
    };

    const metaByName = (name) =>
      document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ||
      null;
    const metaByProperty = (property) =>
      document
        .querySelector(`meta[property="${property}"]`)
        ?.getAttribute("content") || null;
    const text = (node) => (node?.textContent || "").trim().replace(/\s+/g, " ");
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
      (node) => ({ level: node.tagName.toLowerCase(), text: text(node) })
    );
    const links = [...document.querySelectorAll("a[href]")]
      .map((node) => ({
        text: text(node),
        href: absolute(node.getAttribute("href")),
        rawHref: node.getAttribute("href")
      }))
      .filter((link) => link.href && link.href.startsWith("http"));
    const images = [...document.querySelectorAll("img")].map((node) => {
      const alt = node.getAttribute("alt");
      return {
        src: absolute(node.getAttribute("src")),
        alt: alt || "",
        hasAlt: node.hasAttribute("alt"),
        role: node.getAttribute("role") || "",
        ariaHidden: node.getAttribute("aria-hidden") === "true",
        width: node.getAttribute("width") || null,
        height: node.getAttribute("height") || null
      };
    });
    const scripts = [...document.querySelectorAll("script[src]")].map((node) => ({
      src: absolute(node.getAttribute("src")),
      type: node.getAttribute("type") || "",
      async: node.hasAttribute("async"),
      defer: node.hasAttribute("defer")
    }));
    const stylesheets = [...document.querySelectorAll('link[rel~="stylesheet"][href]')].map((node) => ({
      href: absolute(node.getAttribute("href")),
      media: node.getAttribute("media") || ""
    }));
    const schemaTypesFor = (value) => {
      const types = [];
      const visit = (item) => {
        if (!item || typeof item !== "object") return;
        const type = item["@type"];
        if (Array.isArray(type)) types.push(...type.filter(Boolean));
        else if (type) types.push(type);
        for (const key of ["@graph", "itemListElement", "mainEntity", "hasPart", "review", "offers", "aggregateRating", "breadcrumb"]) {
          const child = item[key];
          if (Array.isArray(child)) child.forEach(visit);
          else visit(child);
        }
      };
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
      return types;
    };
    const schemaResults = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((node, index) => {
        try {
          const parsed = JSON.parse(node.textContent || "{}");
          const values = Array.isArray(parsed) ? parsed : [parsed];
          return {
            index: index + 1,
            types: schemaTypesFor(parsed),
            missingContext: values.some((item) => item && !item["@context"])
          };
        } catch {
          return {
            index: index + 1,
            types: ["invalid-json"],
            error: "JSON-LD could not be parsed."
          };
        }
      });
    const bodyText = text(document.body);
    const origin = location.origin;
    const number = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
    };
    const navigation = performance.getEntriesByType("navigation")[0] || null;
    const navigationTiming = navigation
      ? {
          startTimeMs: number(navigation.startTime),
          responseStartMs: number(navigation.responseStart),
          responseEndMs: number(navigation.responseEnd),
          domInteractiveMs: number(navigation.domInteractive),
          domContentLoadedMs: number(navigation.domContentLoadedEventEnd),
          loadEventMs: number(navigation.loadEventEnd),
          durationMs: number(navigation.duration),
          transferSize: number(navigation.transferSize),
          encodedBodySize: number(navigation.encodedBodySize),
          decodedBodySize: number(navigation.decodedBodySize),
          protocol: navigation.nextHopProtocol || ""
        }
      : {};
    const allResourceTimings = performance.getEntriesByType("resource")
      .map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType || "",
        startTime: number(entry.startTime),
        responseStart: number(entry.responseStart),
        responseEnd: number(entry.responseEnd),
        duration: number(entry.duration),
        transferSize: number(entry.transferSize),
        encodedBodySize: number(entry.encodedBodySize),
        decodedBodySize: number(entry.decodedBodySize),
        renderBlockingStatus: entry.renderBlockingStatus || "",
        nextHopProtocol: entry.nextHopProtocol || ""
      }))
      .sort((a, b) => a.startTime - b.startTime || b.duration - a.duration);
    const resourceTimings = allResourceTimings.slice(0, 150);

    return {
      source: "rendered-dom",
      finalUrl: location.href,
      title: document.title || "",
      description: metaByName("description"),
      generator: metaByName("generator"),
      robots: metaByName("robots"),
      canonical: absolute(document.querySelector('link[rel="canonical"]')?.getAttribute("href")),
      lang: document.documentElement.getAttribute("lang") || null,
      viewport: metaByName("viewport"),
      charset: document.characterSet || null,
      doctype: document.doctype ? document.doctype.name : null,
      hreflangs: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(
        (node) => ({
          hreflang: node.getAttribute("hreflang"),
          href: absolute(node.getAttribute("href"))
        })
      ),
      h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
      headings,
      links,
      internalLinks: links.filter((link) => new URL(link.href).origin === origin),
      externalLinks: links.filter((link) => new URL(link.href).origin !== origin),
      images,
      imagesMissingAlt: images.filter((image) => !image.hasAlt),
      scripts,
      stylesheets,
      openGraph: {
        title: metaByProperty("og:title"),
        description: metaByProperty("og:description"),
        image: absolute(metaByProperty("og:image")),
        url: absolute(metaByProperty("og:url")),
        type: metaByProperty("og:type")
      },
      twitter: {
        card: metaByName("twitter:card"),
        title: metaByName("twitter:title"),
        description: metaByName("twitter:description"),
        image: absolute(metaByName("twitter:image"))
      },
      favicon:
        absolute(document.querySelector('link[rel~="icon"]')?.getAttribute("href")) ||
        null,
      appleTouchIcon:
        absolute(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")) ||
        null,
      schemaTypes: schemaResults.flatMap((item) => item.types || []),
      schemaErrors: schemaResults
        .filter((item) => item.error || item.missingContext)
        .map((item) => item.error || `JSON-LD block ${item.index} is missing @context.`),
      navigationTiming,
      resourceTimings,
      resourceTimingsTotal: allResourceTimings.length,
      wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
      bodyText: bodyText.slice(0, 6000),
      bodySample: bodyText.slice(0, 280)
    };
  });

  await context.close();
  return {
    ...facts,
    status: response?.status() || null,
    loadDurationMs: Date.now() - started
  };
}

function extractStaticFacts(html, url, fetchResult = {}) {
  const $ = cheerio.load(html || "");
  const base = new URL(url);
  const absolute = (value) => {
    try {
      return value ? new URL(value, base.href).href : null;
    } catch {
      return value || null;
    }
  };
  const text = (selector) => $(selector).first().text().trim().replace(/\s+/g, " ");
  const metaByName = (name) => $(`meta[name="${name}"]`).attr("content") || null;
  const metaByProperty = (property) =>
    $(`meta[property="${property}"]`).attr("content") || null;
  const headings = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((node) => ({
      level: node.tagName.toLowerCase(),
      text: $(node).text().trim().replace(/\s+/g, " ")
    }));
  const links = $("a[href]")
    .toArray()
    .map((node) => ({
      text: $(node).text().trim().replace(/\s+/g, " "),
      href: absolute($(node).attr("href")),
      rawHref: $(node).attr("href")
    }))
    .filter((link) => link.href && link.href.startsWith("http"));
  const images = $("img")
    .toArray()
    .map((node) => {
      const alt = $(node).attr("alt");
      return {
        src: absolute($(node).attr("src")),
        alt: alt || "",
        hasAlt: alt !== undefined,
        role: $(node).attr("role") || "",
        ariaHidden: $(node).attr("aria-hidden") === "true",
        width: $(node).attr("width") || null,
        height: $(node).attr("height") || null
      };
    });
  const scripts = $("script[src]")
    .toArray()
    .map((node) => ({
      src: absolute($(node).attr("src")),
      type: $(node).attr("type") || "",
      async: $(node).attr("async") !== undefined,
      defer: $(node).attr("defer") !== undefined
    }));
  const stylesheets = $('link[rel~="stylesheet"][href]')
    .toArray()
    .map((node) => ({
      href: absolute($(node).attr("href")),
      media: $(node).attr("media") || ""
    }));
  const schemaTypesFor = (value) => {
    const types = [];
    const visit = (item) => {
      if (!item || typeof item !== "object") return;
      const type = item["@type"];
      if (Array.isArray(type)) types.push(...type.filter(Boolean));
      else if (type) types.push(type);
      for (const key of ["@graph", "itemListElement", "mainEntity", "hasPart", "review", "offers", "aggregateRating", "breadcrumb"]) {
        const child = item[key];
        if (Array.isArray(child)) child.forEach(visit);
        else visit(child);
      }
    };
    if (Array.isArray(value)) value.forEach(visit);
    else visit(value);
    return types;
  };
  const schemaResults = $('script[type="application/ld+json"]')
    .toArray()
    .map((node, index) => {
      try {
        const parsed = JSON.parse($(node).text() || "{}");
        const values = Array.isArray(parsed) ? parsed : [parsed];
        return {
          index: index + 1,
          types: schemaTypesFor(parsed),
          missingContext: values.some((item) => item && !item["@context"])
        };
      } catch {
        return {
          index: index + 1,
          types: ["invalid-json"],
          error: "JSON-LD could not be parsed."
        };
      }
    });
  $("script:not([type='application/ld+json']),style,noscript").remove();
  const bodyText = $("body").text().trim().replace(/\s+/g, " ");

  return {
    source: "static-html",
    finalUrl: url,
    status: fetchResult.status || null,
    title: text("title"),
    description: metaByName("description"),
    generator: metaByName("generator"),
    robots: metaByName("robots"),
    canonical: absolute($('link[rel="canonical"]').attr("href")),
    lang: $("html").attr("lang") || null,
    viewport: metaByName("viewport"),
    charset:
      $("meta[charset]").attr("charset") ||
      ($('meta[http-equiv="content-type"]').attr("content") || "").match(/charset=([^;]+)/i)?.[1] ||
      null,
    doctype: (html || "").trimStart().toLowerCase().startsWith("<!doctype html")
      ? "html"
      : null,
    hreflangs: $('link[rel="alternate"][hreflang]')
      .toArray()
      .map((node) => ({
        hreflang: $(node).attr("hreflang") || "",
        href: absolute($(node).attr("href"))
      })),
    h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
    headings,
    links,
    internalLinks: links.filter((link) => new URL(link.href).origin === base.origin),
    externalLinks: links.filter((link) => new URL(link.href).origin !== base.origin),
    images,
    imagesMissingAlt: images.filter((image) => !image.hasAlt),
    scripts,
    stylesheets,
    openGraph: {
      title: metaByProperty("og:title"),
      description: metaByProperty("og:description"),
      image: absolute(metaByProperty("og:image")),
      url: absolute(metaByProperty("og:url")),
      type: metaByProperty("og:type")
    },
    twitter: {
      card: metaByName("twitter:card"),
      title: metaByName("twitter:title"),
      description: metaByName("twitter:description"),
      image: absolute(metaByName("twitter:image"))
    },
    favicon: absolute($('link[rel~="icon"]').attr("href")),
    appleTouchIcon: absolute($('link[rel="apple-touch-icon"]').attr("href")),
    schemaTypes: schemaResults.flatMap((item) => item.types || []),
    schemaErrors: schemaResults
      .filter((item) => item.error || item.missingContext)
      .map((item) => item.error || `JSON-LD block ${item.index} is missing @context.`),
    wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    bodyText: bodyText.slice(0, 6000),
    bodySample: bodyText.slice(0, 280)
  };
}

function buildFindings({ pages, startUrl, robots, sitemap, renderedAvailable, performance }) {
  const findings = [];
  const home = pages[0];
  if (!home) return findings;
  let activePage = null;

  const add = (finding) => {
    const pageFields = activePage
      ? {
          pageUrl: activePage.url,
          finalUrl: activePage.finalUrl || activePage.rendered?.finalUrl || activePage.url,
          pageLabel: pathLabel(activePage.url, startUrl)
        }
      : {};
    findings.push({
      id: `${finding.type}-${findings.length + 1}`,
      confidence: finding.confidence || "verified",
      ...pageFields,
      ...finding
    });
  };

  if (!renderedAvailable) {
    add({
      type: "rendering",
      severity: "warning",
      title: "Rendered audit was not available",
      why: "Static-only crawlers miss JavaScript-rendered content and can create false positives.",
      evidence: "The scan fell back to static HTML.",
      fix: "Install Chromium for Playwright and rerun the audit.",
      source: GOOGLE_DOCS.javascript,
      confidence: "needs-review",
      snippet: "npx playwright install chromium"
    });
  }

  for (const page of pages) {
    activePage = page;
    const { rendered, static: staticFacts } = page;
    const label = pathLabel(page.url, startUrl);
    const finalUrl = rendered.finalUrl || page.finalUrl || page.url;
    const finalUrlObject = new URL(finalUrl);
    const linkChecks = page.linkChecks || [];
    const imageChecks = page.imageChecks || [];
    const brokenInternalLinks = linkChecks.filter((check) => check.kind === "internal" && isBrokenResource(check));
    const brokenExternalLinks = linkChecks.filter((check) => check.kind === "external" && isBrokenResource(check));
    const redirectedInternalLinks = linkChecks.filter(
      (check) => check.kind === "internal" && !isBrokenResource(check) && check.redirected
    );
    const brokenImages = imageChecks.filter(isBrokenResource);
    const oversizedImages = imageChecks.filter(
      (check) => !isBrokenResource(check) && check.contentLength > RESOURCE_LIMITS.largeImageBytes
    );
    const nonHttpsResources = [...(rendered.links || []), ...(rendered.images || [])].filter(
      (resource) =>
        finalUrlObject.protocol === "https:" &&
        (resource.href || resource.src || "").startsWith("http:")
    );
    const addRenderedGuard = ({ title, evidence, fix, source }) =>
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: ${title}`,
        why: "Static HTML missed data that exists in the rendered page.",
        evidence,
        fix,
        source: source || GOOGLE_DOCS.javascript
      });

    if (page === home) {
      addPerformanceFindings(add, performance, label);
    }

    for (const finding of resourceWaterfallFindings(page.resourceWaterfall, label, GOOGLE_DOCS.coreWebVitals)) {
      add(finding);
    }

    if (brokenInternalLinks.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `Broken internal links on ${label}`,
        why: "Broken internal links waste crawl paths and send users to dead pages.",
        evidence: formatResourceEvidence(brokenInternalLinks),
        fix: "Update each internal link to a live replacement URL, restore the missing page, or remove the link if it no longer has a valid destination.",
        source: GOOGLE_DOCS.linkBestPractices
      });
    }

    if (brokenExternalLinks.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Broken external links on ${label}`,
        why: "Broken outbound references weaken the page experience and can make supporting proof look stale.",
        evidence: formatResourceEvidence(brokenExternalLinks),
        fix: "Replace broken references with live authoritative sources or remove the outbound links.",
        source: GOOGLE_DOCS.linkBestPractices,
        confidence: "needs-review"
      });
    }

    if (redirectedInternalLinks.length) {
      add({
        type: "issue",
        severity: "notice",
        title: `Redirecting internal links on ${label}`,
        why: "Internal links should usually point directly to the final canonical URL instead of spending crawl budget on redirects.",
        evidence: formatResourceEvidence(redirectedInternalLinks),
        fix: "Update internal links so they point directly to the final destination URL."
      });
    }

    if (brokenImages.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Broken images on ${label}`,
        why: "Broken images hurt page quality, social previews, and image-search context.",
        evidence: formatResourceEvidence(brokenImages),
        fix: "Replace the missing image URLs, restore the assets, or remove image tags that no longer have valid files."
      });
    }

    if (oversizedImages.length) {
      add({
        type: "issue",
        severity: "notice",
        title: `Large image files on ${label}`,
        why: "Large images can slow down the page and make Core Web Vitals harder to pass.",
        evidence: formatResourceEvidence(oversizedImages),
        fix: "Compress these images, serve next-gen formats, and resize them to the rendered display dimensions.",
        source: GOOGLE_DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (nonHttpsResources.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Non-HTTPS resources on ${label}`,
        why: "HTTP resources on an HTTPS page can create mixed-content warnings and weaken user trust.",
        evidence: `${nonHttpsResources.length} rendered resources use http://, including ${formatResourceUrl(nonHttpsResources[0].href || nonHttpsResources[0].src)}.`,
        fix: "Serve every link, script, image, and canonical asset over HTTPS."
      });
    }

    if (page.redirected || stripHash(rendered.finalUrl || page.finalUrl || page.url) !== stripHash(page.url)) {
      add({
        type: "issue",
        severity: "notice",
        title: `URL redirects before rendering on ${label}`,
        why: "Redirects are normal, but audit evidence should show the final URL search engines and users reach.",
        evidence: `Requested ${page.url}; final URL ${rendered.finalUrl || page.finalUrl}.`,
        fix: "Make sure canonicals, internal links, and sitemaps point at the final preferred URL.",
        confidence: "needs-review"
      });
    }

    if (page.redirectChain?.length > 1) {
      add({
        type: "issue",
        severity: "warning",
        title: `Long redirect chain before rendering on ${label}`,
        why: "Long redirect chains slow crawlers and users before the page can even render.",
        evidence: formatRedirectChain(page.redirectChain),
        fix: "Collapse the chain so the requested URL redirects once to the final canonical URL."
      });
    }

    if (rendered.loadDurationMs > RESOURCE_LIMITS.slowRenderMs) {
      add({
        type: "issue",
        severity: "warning",
        title: `Slow rendered load on ${label}`,
        why: "Slow rendering is a page-experience risk and can make Core Web Vitals harder to pass.",
        evidence: `Rendered audit reached network idle in ${rendered.loadDurationMs}ms.`,
        fix: "Reduce render-blocking scripts, compress heavy assets, defer non-critical JavaScript, and rerun with field Core Web Vitals data.",
        source: GOOGLE_DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (page.transferSize > RESOURCE_LIMITS.largeHtmlBytes) {
      add({
        type: "issue",
        severity: "notice",
        title: `Large HTML response on ${label}`,
        why: "Large HTML responses slow the first crawl and usually point to unnecessary inline payload.",
        evidence: `Initial HTML response was about ${formatBytes(page.transferSize)}.`,
        fix: "Move large inline data out of the HTML, trim unused markup, and compress server responses.",
        source: GOOGLE_DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (staticFacts.h1s.length === 0 && rendered.h1s.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: H1 exists after render`,
        why:
          "A static-only crawler would report a missing H1, but the rendered page contains one.",
        evidence: `Rendered H1: "${rendered.h1s[0]}"`,
        fix: "Do not add another H1 just to satisfy a static crawler.",
        source: GOOGLE_DOCS.javascript
      });
    }

    if (staticFacts.internalLinks.length === 0 && rendered.internalLinks.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: internal links exist after render`,
        why:
          "Static HTML did not expose links, but the browser-rendered DOM did.",
        evidence: `${rendered.internalLinks.length} rendered internal links found.`,
        fix: "Keep the rendered links crawlable as real anchor tags.",
        source: GOOGLE_DOCS.javascript
      });
    }

    if (staticFacts.wordCount < 50 && rendered.wordCount >= 250) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: rendered content is not thin`,
        why:
          "The static HTML looks thin, but users and modern crawlers see substantial rendered content.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "No thin-content fix is needed for this page based on rendered text.",
        source: GOOGLE_DOCS.javascript
      });
    }

    if (!staticFacts.title && rendered.title) {
      addRenderedGuard({
        title: "title exists after render",
        evidence: `Rendered title: "${rendered.title}"`,
        fix: "Do not add a duplicate title just to satisfy a static crawler.",
        source: GOOGLE_DOCS.title
      });
    }

    if (!staticFacts.description && rendered.description) {
      addRenderedGuard({
        title: "meta description exists after render",
        evidence: `Rendered description: "${rendered.description}"`,
        fix: "Keep the rendered meta description aligned with visible page content."
      });
    }

    if (!staticFacts.canonical && rendered.canonical) {
      addRenderedGuard({
        title: "canonical exists after render",
        evidence: `Rendered canonical: ${rendered.canonical}`,
        fix: "Do not add a second canonical; keep one preferred URL."
      });
    }

    if (!staticFacts.viewport && rendered.viewport) {
      addRenderedGuard({
        title: "viewport exists after render",
        evidence: `Rendered viewport: "${rendered.viewport}"`,
        fix: "Do not add a duplicate viewport tag."
      });
    }

    if ((!staticFacts.openGraph.image || !staticFacts.twitter.image) && rendered.openGraph.image && rendered.twitter.image) {
      addRenderedGuard({
        title: "social images exist after render",
        evidence: `Rendered og:image: ${rendered.openGraph.image}; twitter:image: ${rendered.twitter.image}`,
        fix: "Do not create duplicate social tags; keep the rendered tags stable."
      });
    }

    if ((staticFacts.schemaTypes || []).length === 0 && rendered.schemaTypes.length > 0) {
      addRenderedGuard({
        title: "structured data exists after render",
        evidence: `Rendered schema types: ${rendered.schemaTypes.join(", ")}`,
        fix: "Do not add duplicate JSON-LD; validate the rendered schema instead.",
        source: GOOGLE_DOCS.structuredData
      });
    }

    if (rendered.schemaErrors?.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Structured data JSON is invalid on ${label}`,
        why: "Invalid JSON-LD can stop rich-result eligibility and creates false confidence if the audit only checks presence.",
        evidence: rendered.schemaErrors.slice(0, 3).join(" "),
        fix: "Fix the JSON-LD syntax and include @context and @type values that match visible page content.",
        source: GOOGLE_DOCS.structuredData
      });
    }

    const hreflangIssues = validateHreflang(rendered.hreflangs || [], finalUrl);
    for (const issue of hreflangIssues) {
      add({
        type: "issue",
        severity: issue.severity,
        title: `${issue.title} on ${label}`,
        why: issue.why,
        evidence: issue.evidence,
        fix: issue.fix,
        source: GOOGLE_DOCS.hreflang,
        confidence: issue.confidence || "verified"
      });
    }

    if (rendered.canonical && page.canonicalCheck && isBrokenResource(page.canonicalCheck)) {
      add({
        type: "issue",
        severity: "warning",
        title: `Canonical URL is not reachable on ${label}`,
        why: "Canonical tags should point to a live preferred URL that search engines can fetch.",
        evidence: formatResourceEvidence([page.canonicalCheck]),
        fix: "Update the canonical href to a live indexable URL, or restore the canonical destination.",
        source: GOOGLE_DOCS.javascript
      });
    } else if (rendered.canonical && page.canonicalCheck?.redirected) {
      add({
        type: "issue",
        severity: "notice",
        title: `Canonical URL redirects on ${label}`,
        why: "Canonical tags should point directly to the final preferred URL.",
        evidence: formatResourceEvidence([page.canonicalCheck]),
        fix: "Change the canonical href to the final destination URL."
      });
    }

    if (rendered.canonical && rendered.openGraph?.url && canonicalKey(rendered.canonical) !== canonicalKey(rendered.openGraph.url)) {
      add({
        type: "issue",
        severity: "notice",
        title: `Canonical and og:url disagree on ${label}`,
        why: "Search and social tags should agree on the preferred URL for this page.",
        evidence: `Canonical: ${rendered.canonical}; og:url: ${rendered.openGraph.url}.`,
        fix: "Set og:url to the same final preferred URL used by rel=canonical.",
        confidence: "needs-review"
      });
    }

    if (rendered.canonical && (rendered.robots || "").toLowerCase().includes("noindex")) {
      add({
        type: "issue",
        severity: "critical",
        title: `Canonical conflicts with noindex on ${label}`,
        why: "A page should not ask search engines to consolidate signals through a canonical while also telling them not to index it.",
        evidence: `Canonical: ${rendered.canonical}; robots meta: "${rendered.robots}".`,
        fix: "If the page should rank, remove noindex. If it should not rank, remove misleading canonical consolidation."
      });
    }

    if (!rendered.title || rendered.title.length < 12) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing or weak title on ${label}`,
        why: "A clear title helps searchers identify the page.",
        evidence: rendered.title ? `Current title: "${rendered.title}"` : "No title found.",
        fix: "Add a unique, descriptive title for this page.",
        source: GOOGLE_DOCS.title,
        snippet: `<title>${escapeHtml(suggestTitle(page.url, rendered))}</title>`
      });
    } else if (rendered.title.length > 65) {
      add({
        type: "issue",
        severity: "warning",
        title: `Long title on ${label}`,
        why: "Long titles are often rewritten or truncated in search results.",
        evidence: `${rendered.title.length} characters: "${rendered.title}"`,
        fix: "Shorten the title and put the main page promise first.",
        source: GOOGLE_DOCS.title,
        snippet: `<title>${escapeHtml(trimSentence(rendered.title, 58))}</title>`
      });
    }

    if (!rendered.description) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing meta description on ${label}`,
        why: "A useful description can influence the snippet shown in search.",
        evidence: "No meta description found in the rendered page.",
        fix: "Add a concise page-specific meta description.",
        source: GOOGLE_DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    } else if (rendered.description.length > 165 || rendered.description.length < 70) {
      add({
        type: "issue",
        severity: "warning",
        title: `Meta description needs tightening on ${label}`,
        why:
          "Google may rewrite snippets, but a clear page-specific description gives it better source material.",
        evidence: `${rendered.description.length} characters: "${rendered.description}"`,
        fix: "Rewrite it as one clear value proposition.",
        source: GOOGLE_DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    }

    if (rendered.h1s.length === 0) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing H1 on ${label}`,
        why: "The H1 should state the main topic visible on the page.",
        evidence: "No rendered H1 found.",
        fix: "Add one visible H1 that matches the page purpose.",
        source: GOOGLE_DOCS.javascript,
        snippet: `<h1>${escapeHtml(suggestTitle(page.url, rendered))}</h1>`
      });
    } else if (rendered.h1s.length > 1) {
      add({
        type: "issue",
        severity: "warning",
        title: `Multiple H1s on ${label}`,
        why: "Multiple H1s can make the page hierarchy less clear.",
        evidence: `${rendered.h1s.length} rendered H1s: ${rendered.h1s.join(" | ")}`,
        fix: "Keep one primary H1 and move secondary headings to H2."
      });
    }

    const hierarchyIssue = headingHierarchyIssue(rendered.headings || []);
    if (hierarchyIssue) {
      add({
        type: "issue",
        severity: "warning",
        title: `Heading hierarchy needs cleanup on ${label}`,
        why: "Headings should describe the page outline in order so users, assistive tech, and crawlers can understand the structure.",
        evidence: hierarchyIssue,
        fix: "Use one H1, then move section headings through H2 and H3 without skipping levels.",
        confidence: "needs-review"
      });
    }

    if (rendered.wordCount < 250) {
      add({
        type: "issue",
        severity: "warning",
        title: `Thin rendered content on ${label}`,
        why:
          "This is a heuristic, not a ranking rule. Thin pages often fail to answer the query well.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "Add useful page-specific detail, proof, examples, and next steps.",
        confidence: "needs-review"
      });
    }

    if (rendered.internalLinks.length === 0) {
      add({
        type: "issue",
        severity: "critical",
        title: `No rendered internal links on ${label}`,
        why: "Internal links help crawlers discover and understand related pages.",
        evidence: "No internal anchor links found in the rendered DOM.",
        fix: "Add links to important related pages using normal anchor tags.",
        source: GOOGLE_DOCS.javascript
      });
    }

    if (!rendered.canonical) {
      add({
        type: "issue",
        severity: "warning",
        title: `Missing canonical URL on ${label}`,
        why: "Canonical tags help clarify the preferred URL for similar pages.",
        evidence: "No rendered rel=canonical tag found.",
        fix: "Add a canonical tag that points to the preferred URL.",
        source: GOOGLE_DOCS.javascript,
        snippet: `<link rel="canonical" href="${page.url}" />`
      });
    }

    if (!rendered.viewport) {
      add({
        type: "issue",
        severity: "warning",
        title: `Viewport meta tag missing on ${label}`,
        why: "Mobile pages need a viewport tag so layouts render at the intended width.",
        evidence: "No rendered viewport meta tag found.",
        fix: "Add a responsive viewport meta tag.",
        snippet: '<meta name="viewport" content="width=device-width, initial-scale=1" />'
      });
    }

    if (!rendered.lang) {
      add({
        type: "issue",
        severity: "notice",
        title: `HTML language missing on ${label}`,
        why: "The lang attribute helps browsers, translation tools, and assistive tech understand the page language.",
        evidence: "No lang attribute found on the rendered html element.",
        fix: 'Add a truthful language code such as <html lang="en">.',
        snippet: '<html lang="en">'
      });
    }

    if (!rendered.charset) {
      add({
        type: "issue",
        severity: "notice",
        title: `Character encoding missing on ${label}`,
        why: "A charset declaration prevents text rendering surprises.",
        evidence: "No rendered charset could be confirmed.",
        fix: "Declare UTF-8 in the document head.",
        snippet: '<meta charset="utf-8" />'
      });
    }

    if (!rendered.doctype) {
      add({
        type: "issue",
        severity: "notice",
        title: `HTML doctype missing on ${label}`,
        why: "A doctype keeps browsers out of quirks mode.",
        evidence: "No HTML doctype was found before rendering.",
        fix: "Start the document with <!doctype html>.",
        snippet: "<!doctype html>"
      });
    }

    if ((rendered.robots || "").toLowerCase().includes("noindex")) {
      add({
        type: "issue",
        severity: "critical",
        title: `Noindex found on ${label}`,
        why: "A noindex directive tells search engines not to index the page.",
        evidence: `Robots meta: "${rendered.robots}"`,
        fix: "Remove noindex if this page should appear in search."
      });
    }

    if (!rendered.openGraph.image || !rendered.twitter.image) {
      add({
        type: "issue",
        severity: "warning",
        title: `Social share image incomplete on ${label}`,
        why: "This affects how the page looks when shared. It is not a direct ranking claim.",
        evidence: `og:image: ${rendered.openGraph.image || "missing"}; twitter:image: ${
          rendered.twitter.image || "missing"
        }`,
        fix: "Add 1200x630 Open Graph and Twitter images.",
        snippet: buildSocialSnippet(page.url, rendered)
      });
    }

    if (!rendered.appleTouchIcon) {
      add({
        type: "issue",
        severity: "notice",
        title: `Apple touch icon missing on ${label}`,
        why: "This improves mobile saved-page presentation. It is not a ranking claim.",
        evidence: "No apple-touch-icon link found.",
        fix: "Add an Apple touch icon.",
        snippet: '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />'
      });
    }

    if (rendered.images.length > 0 && rendered.imagesMissingAlt.length > 0) {
      add({
        type: "issue",
        severity: "warning",
        title: `Images missing alt attributes on ${label}`,
        why: "Informative images need alt text for accessibility and image search context.",
        evidence: `${rendered.imagesMissingAlt.length}/${rendered.images.length} images have no alt attribute. Intentionally empty alt="" images are treated as decorative, not scored.`,
        fix: "Add useful alt text to informative images. Leave decorative images as alt=\"\" intentionally.",
        confidence: "needs-review"
      });
    }

    if (rendered.schemaTypes.length === 0 || rendered.schemaTypes.every((type) => type === "invalid-json")) {
      add({
        type: "enhancement",
        severity: "notice",
        title: `Structured data opportunity on ${label}`,
        why: "Structured data can make content eligible for richer search features when guidelines are met.",
        evidence: "No JSON-LD structured data found.",
        fix: "Add truthful schema that matches visible content.",
        source: GOOGLE_DOCS.structuredData,
        snippet: buildSchemaSnippet(page.url, rendered)
      });
    }

    if (finalUrlObject.protocol === "http:" && !isLocalhost(finalUrlObject.hostname)) {
      add({
        type: "issue",
        severity: "warning",
        title: `Page is not served over HTTPS on ${label}`,
        why: "HTTPS is table-stakes for user trust and browser security signals.",
        evidence: `Final rendered URL uses ${finalUrlObject.protocol}//.`,
        fix: "Enable HTTPS, redirect HTTP to HTTPS, and update canonical and sitemap URLs to HTTPS."
      });
    }

    if (finalUrlObject.protocol === "https:" && !headerValue(page.headers, "strict-transport-security")) {
      add({
        type: "issue",
        severity: "notice",
        title: `HSTS security header missing on ${label}`,
        why: "Strict-Transport-Security helps browsers keep repeat visits on HTTPS.",
        evidence: "The initial HTML response did not include a strict-transport-security header.",
        fix: "Add a Strict-Transport-Security header after confirming HTTPS works across the full host.",
        confidence: "needs-review"
      });
    }
  }
  activePage = null;

  if (!robots.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Robots.txt not found",
      why: "Robots.txt is useful for crawler guidance, even when everything is crawlable.",
      evidence: `GET /robots.txt returned ${robots.status || "no response"}.`,
      fix: "Add a simple robots.txt.",
      snippet: "User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml"
    });
  }

  if (!sitemap.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Sitemap not found",
      why: "A sitemap helps search engines discover important URLs.",
      evidence: `GET /sitemap.xml returned ${sitemap.status || "no response"}.`,
      fix: "Publish a sitemap and reference it from robots.txt."
    });
  }

  return findings;
}

function buildRepairPlan(findings) {
  return findings
    .filter((finding) => finding.severity !== "good")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding, index) => ({
      priority: index + 1,
      severity: finding.severity,
      title: finding.title,
      pageUrl: finding.pageUrl || null,
      pageLabel: finding.pageLabel || null,
      proof: finding.evidence,
      fix: finding.fix,
      confidence: finding.confidence || "verified",
      source: finding.source || null,
      snippet: finding.snippet || null,
      estimatedEffort: estimatedEffort(finding),
      workType: workType(finding),
      acceptance: acceptanceCheck(finding)
    }));
}

function mergeRepairPlans(basePlan = [], extraItems = []) {
  const merged = [...basePlan, ...(extraItems || [])];
  return merged.map((item, index) => ({
    ...item,
    priority: index + 1
  }));
}

function buildRepairBrief({ startUrl, score, summary, pages, findings, repairPlan, performance, competitorBenchmark, crawlInventory, renderedCrawlScale, crawlIntelligence, backlinkAudit, localSeoAudit, keywordRankAudit, platformSeoAudit }) {
  const lines = [
    "# SEO Fix Kit repair brief",
    "",
    `Site: ${startUrl}`,
    `Scanned pages: ${summary.pagesScanned}`,
    `Score: ${score}/100`,
    `Issues: ${summary.critical} critical, ${summary.warnings} warnings, ${summary.notices} notices`,
    `False positives avoided: ${summary.guardedFalsePositives}`,
    ""
  ];

  if (!repairPlan.length) {
    lines.push("## Fix order", "", "No critical repairs found in this scan.", "");
  } else {
    lines.push("## Fix order", "");
    for (const item of repairPlan) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
      if (item.snippet) {
        lines.push("", "```html", fenceSafe(item.snippet), "```", "");
      }
    }
  }

  const guarded = findings.filter((finding) => finding.severity === "good");
  if (guarded.length) {
    lines.push("## Do not fix these false positives", "");
    for (const finding of guarded) {
      lines.push(`- ${finding.title}: ${finding.evidence}`);
    }
    lines.push("");
  }

  if (pages[0]?.rendered) {
    const facts = pages[0].rendered;
    lines.push("## Rendered proof snapshot", "");
    lines.push(`- Rendered title: ${facts.title || "missing"}`);
    lines.push(`- Rendered description: ${facts.description || "missing"}`);
    lines.push(`- Rendered H1s: ${facts.h1s?.join(" | ") || "none"}`);
    lines.push(`- Rendered word count: ${facts.wordCount ?? "unknown"}`);
    lines.push(`- Rendered internal links: ${facts.internalLinks?.length ?? 0}`);
    lines.push(`- Broken rendered links: ${pages[0].linkChecks?.filter(isBrokenResource).length ?? 0}`);
    lines.push(`- Broken rendered images: ${pages[0].imageChecks?.filter(isBrokenResource).length ?? 0}`);
    lines.push(`- Rendered load time: ${facts.loadDurationMs ?? "unknown"}ms`);
    lines.push(`- Rendered schema types: ${facts.schemaTypes?.join(", ") || "none"}`);
    lines.push("");
  }

  if (performance && performance.status !== "skipped") {
    lines.push("## Performance proof snapshot", "");
    lines.push(`- Source: ${performance.source || "rendered-lab"}`);
    if (Number.isFinite(performance.performanceScore)) {
      lines.push(`- Mobile PageSpeed score: ${performance.performanceScore}/100`);
    }
    const metrics = performance.labMetrics || {};
    if (metrics.largestContentfulPaint?.display) lines.push(`- LCP: ${metrics.largestContentfulPaint.display}`);
    if (metrics.totalBlockingTime?.display) lines.push(`- TBT: ${metrics.totalBlockingTime.display}`);
    if (metrics.cumulativeLayoutShift?.display) lines.push(`- CLS: ${metrics.cumulativeLayoutShift.display}`);
    if (metrics.speedIndex?.display) lines.push(`- Speed Index: ${metrics.speedIndex.display}`);
    if (performance.fieldData?.overallCategory) {
      lines.push(`- Field data category: ${performance.fieldData.overallCategory}`);
    }
    if (performance.opportunities?.length) {
      lines.push(`- Top opportunity: ${performance.opportunities[0].title} (${performanceOpportunityEvidence(performance.opportunities[0])})`);
    }
    if (performance.reason) lines.push(`- Note: ${performance.reason}`);
    lines.push("");
  }

  lines.push(...resourceWaterfallBriefLines(pages[0]?.resourceWaterfall));
  lines.push(...competitorBenchmarkBriefLines(competitorBenchmark));
  lines.push(...crawlInventoryBriefLines(crawlInventory));
  lines.push(...renderedCrawlScaleBriefLines(renderedCrawlScale));
  lines.push(...crawlIntelligenceBriefLines(crawlIntelligence));
  lines.push(...backlinkAuditBriefLines(backlinkAudit));
  lines.push(...localSeoAuditBriefLines(localSeoAudit));
  lines.push(...keywordRankAuditBriefLines(keywordRankAudit));
  lines.push(...platformSeoAuditBriefLines(platformSeoAudit));

  lines.push("Re-run SEO Fix Kit after shipping changes and keep only fixes that match visible page content.");
  return lines.join("\n");
}

function buildFixPack(home, origin, findings = []) {
  if (!home) return [];
  const facts = home.rendered;
  const issueFixes = findings
    .filter((finding) => finding.severity !== "good" && finding.snippet)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding) => ({
      title: `Fix: ${finding.title}`,
      body: `${finding.fix} Proof: ${finding.evidence}`,
      snippet: finding.snippet
    }));

  const fallbackFixes = [
    {
      title: "Social preview tags",
      body: "Use this when og:image or twitter:image is missing.",
      snippet: buildSocialSnippet(home.url, facts)
    },
    {
      title: "Canonical tag",
      body: "Use this when the page has one preferred public URL.",
      snippet: `<link rel="canonical" href="${home.url}" />`
    },
    {
      title: "Basic WebSite schema",
      body: "Use truthful schema that matches visible content.",
      snippet: buildSchemaSnippet(origin, facts)
    }
  ];

  return dedupeFixes([...issueFixes, ...fallbackFixes]);
}

function severityRank(severity) {
  return { critical: 0, warning: 1, notice: 2, good: 3 }[severity] ?? 4;
}

function acceptanceCheck(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("title")) {
    return "The rendered page has a unique, descriptive title that is not obviously truncated.";
  }
  if (title.includes("description")) {
    return "The rendered page has one useful meta description, roughly 70-165 characters.";
  }
  if (title.includes("h1")) {
    return "The rendered page has one visible H1 that matches the main page purpose.";
  }
  if (title.includes("internal links")) {
    return "The rendered DOM exposes normal internal anchor links to important pages.";
  }
  if (title.includes("broken") && title.includes("link")) {
    return "Every link in the finding returns a live 2xx/3xx response or has been removed intentionally.";
  }
  if (title.includes("broken") && title.includes("image")) {
    return "Every image in the finding loads successfully or has been removed intentionally.";
  }
  if (title.includes("redirecting internal")) {
    return "Internal links point directly to their final canonical destination.";
  }
  if (title.includes("canonical conflicts")) {
    return "The page either removes noindex because it should rank, or removes misleading canonical consolidation because it should stay out of search.";
  }
  if (title.includes("noindex")) {
    return "The rendered robots meta does not include noindex for pages that should rank.";
  }
  if (title.includes("canonical")) {
    return "The rendered head includes one rel=canonical pointing to the preferred URL.";
  }
  if (title.includes("hreflang")) {
    return "Hreflang tags are unique, valid, self-referencing where relevant, and point at live localized URLs.";
  }
  if (title.includes("json")) {
    return "JSON-LD parses cleanly and includes @context plus @type values matching visible content.";
  }
  if (title.includes("https") || title.includes("hsts") || title.includes("security")) {
    return "The page loads over HTTPS and sends the expected security headers without mixed-content resources.";
  }
  if (title.includes("pagespeed") || title.includes("largest contentful paint") || title.includes("total blocking time") || title.includes("layout shift")) {
    return "A rerun shows PageSpeed lab metrics back in the acceptable range and the repair evidence no longer appears.";
  }
  if (title.includes("slow") || title.includes("large image") || title.includes("large html")) {
    return "A rerun shows smaller transfer weight or faster rendered load, then field Core Web Vitals can be checked.";
  }
  if (title.includes("social share")) {
    return "The rendered head includes og:image and twitter:image using a 1200x630 image.";
  }
  if (title.includes("apple touch")) {
    return "The rendered head links an Apple touch icon.";
  }
  if (title.includes("alt")) {
    return "Informative images have useful alt text, while decorative images are intentionally empty.";
  }
  if (title.includes("structured data")) {
    return "JSON-LD validates and matches content that is visible on the page.";
  }
  if (title.includes("viewport")) {
    return "The rendered head includes a mobile-friendly viewport meta tag.";
  }
  if (title.includes("language")) {
    return "The rendered html element has the correct lang attribute.";
  }
  if (title.includes("encoding")) {
    return "The rendered document declares UTF-8 character encoding.";
  }
  if (title.includes("doctype")) {
    return "The HTML document starts in standards mode with <!doctype html>.";
  }
  if (title.includes("redirect")) {
    return "Canonicals, sitemap URLs, and internal links point at the final preferred URL.";
  }
  if (title.includes("robots.txt")) {
    return "GET /robots.txt returns 200 and references the sitemap.";
  }
  if (title.includes("sitemap")) {
    return "GET /sitemap.xml returns 200 and lists indexable canonical URLs.";
  }
  if (title.includes("rendered audit")) {
    return "Rendered checks are available before trusting the audit output.";
  }
  return "Re-run the audit and confirm this finding is gone or marked needs-review with evidence.";
}

function dedupeFixes(fixes) {
  const seen = new Set();
  return fixes.filter((fix) => {
    const key = fix.snippet;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fenceSafe(value) {
  return String(value || "").replaceAll("```", "` ` `");
}

function buildSocialSnippet(url, facts) {
  const title = escapeHtml(facts.title || suggestTitle(url, facts));
  const description = escapeHtml(facts.description || suggestDescription(facts));
  const origin = new URL(url).origin;
  const image = `${origin}/og-image.png`;
  return [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ].join("\n");
}

function buildSchemaSnippet(url, facts) {
  const origin = new URL(url).origin;
  const name = facts.title?.split("|")[0]?.trim() || new URL(url).hostname;
  const description = facts.description || suggestDescription(facts);
  return `<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: origin,
    description
  },
  null,
  2
)}
</script>`;
}

function buildPageSummaries(pages, findings, startUrl) {
  return pages.map((page) => {
    const pageFindings = findings.filter(
      (finding) => finding.pageUrl === page.url && finding.severity !== "good"
    );
    const guards = findings.filter(
      (finding) => finding.pageUrl === page.url && finding.severity === "good"
    );
    const facts = page.rendered || {};
    const staticFacts = page.static || {};
    return {
      url: page.url,
      path: pathLabel(page.url, startUrl),
      status: page.status,
      finalUrl: facts.finalUrl || page.finalUrl || page.url,
      score: scoreFindings(pageFindings),
      critical: pageFindings.filter((finding) => finding.severity === "critical").length,
      warnings: pageFindings.filter((finding) => finding.severity === "warning").length,
      notices: pageFindings.filter((finding) => finding.severity === "notice").length,
      guards: guards.length,
      title: facts.title || "",
      h1: facts.h1s?.[0] || "",
      wordCount: facts.wordCount || 0,
      internalLinks: facts.internalLinks?.length || 0,
      brokenLinks: page.linkChecks?.filter(isBrokenResource).length || 0,
      brokenImages: page.imageChecks?.filter(isBrokenResource).length || 0,
      loadDurationMs: facts.loadDurationMs || 0,
      schemaTypes: facts.schemaTypes || [],
      staticWordCount: staticFacts.wordCount || 0,
      staticH1: staticFacts.h1s?.[0] || "",
      staticInternalLinks: staticFacts.internalLinks?.length || 0
    };
  });
}

function summarize(findings, pages, maxPages = pages.length) {
  const counts = findings.reduce(
    (acc, finding) => {
      acc[finding.severity] = (acc[finding.severity] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { total: 0, critical: 0, warning: 0, notice: 0, good: 0 }
  );
  return {
    pagesScanned: pages.length,
    maxPages,
    crawlLimitHit: pages.length >= maxPages,
    critical: counts.critical || 0,
    warnings: counts.warning || 0,
    notices: counts.notice || 0,
    guardedFalsePositives: counts.good || 0,
    totalFindings: counts.total,
    scoring: scoreBreakdown(findings)
  };
}

function headingHierarchyIssue(headings = []) {
  if (!headings.length) return "";
  const levels = headings.map((heading) => Number(heading.level.replace("h", "")));
  if (levels[0] !== 1) {
    return `First rendered heading is H${levels[0]} instead of H1.`;
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] - levels[index - 1] > 1) {
      return `Heading jumps from H${levels[index - 1]} to H${levels[index]}.`;
    }
  }
  return "";
}

function estimatedEffort(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("broken link") || title.includes("broken image")) return "15-45 min";
  if (title.includes("pagespeed") || title.includes("largest contentful paint") || title.includes("total blocking time") || title.includes("layout shift")) return "45-120 min";
  if (title.includes("robots") || title.includes("sitemap")) return "15-30 min";
  if (title.includes("title") || title.includes("description") || title.includes("canonical")) return "5-15 min";
  if (title.includes("social") || title.includes("schema") || title.includes("viewport")) return "15-45 min";
  if (title.includes("hreflang") || title.includes("security") || title.includes("https")) return "30-90 min";
  if (title.includes("slow") || title.includes("large")) return "45-120 min";
  if (title.includes("thin") || title.includes("internal links") || title.includes("heading")) return "30-90 min";
  return "15-30 min";
}

function workType(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("title") || title.includes("description") || title.includes("thin") || title.includes("alt")) {
    return "content";
  }
  if (title.includes("schema") || title.includes("canonical") || title.includes("viewport") || title.includes("social")) {
    return "code";
  }
  if (title.includes("broken link") || title.includes("broken image")) {
    return "content";
  }
  if (title.includes("robots") || title.includes("sitemap") || title.includes("redirect") || title.includes("hreflang") || title.includes("https") || title.includes("security") || title.includes("slow") || title.includes("large") || title.includes("pagespeed") || title.includes("largest contentful paint") || title.includes("total blocking time") || title.includes("layout shift")) {
    return "technical";
  }
  return "review";
}

function scoreFindings(findings) {
  const { penalty } = scoreBreakdown(findings);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function scoreBreakdown(findings = []) {
  const groups = new Map();
  for (const finding of findings) {
    if (!finding || finding.severity === "good") continue;
    const key = scoreFindingKey(finding);
    const group = groups.get(key) || { key, critical: 0, warning: 0, notice: 0 };
    if (finding.severity === "critical") group.critical += 1;
    if (finding.severity === "warning") group.warning += 1;
    if (finding.severity === "notice") group.notice += 1;
    groups.set(key, group);
  }

  let penalty = 0;
  const repeated = [];
  for (const group of groups.values()) {
    const groupPenalty =
      severityPenalty(group.critical, "critical") +
      severityPenalty(group.warning, "warning") +
      severityPenalty(group.notice, "notice");
    penalty += groupPenalty;
    const count = group.critical + group.warning + group.notice;
    if (count > 1) {
      repeated.push({
        key: group.key,
        count,
        penalty: Number(groupPenalty.toFixed(2))
      });
    }
  }

  return {
    method: "deduped-template-penalty-v1",
    penalty: Number(penalty.toFixed(2)),
    repeated
  };
}

function severityPenalty(count, severity) {
  if (!count) return 0;
  const first = { critical: 12, warning: 5, notice: 1 }[severity] || 0;
  const repeat = { critical: 4, warning: 1.5, notice: 0.25 }[severity] || 0;
  const cap = { critical: 28, warning: 10, notice: 3 }[severity] || first;
  return Math.min(cap, first + Math.max(0, count - 1) * repeat);
}

function scoreFindingKey(finding) {
  return String(finding.title || "unknown issue")
    .toLowerCase()
    .replace(/\s+on\s+\/.*$/, "")
    .replace(/\s+on\s+https?:\/\/.*$/, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "unknown issue";
}

async function validatePageResources(rendered = {}) {
  const pageUrl = rendered.finalUrl || "";
  const pageOrigin = pageUrl ? new URL(pageUrl).origin : "";
  const allowPrivateResources = pageUrl ? isPrivateHost(pageUrl) : false;
  const links = uniqueResources(rendered.links || [], "href")
    .filter((link) => isHttpResourceUrl(link.href))
    .slice(0, RESOURCE_LIMITS.linksPerPage)
    .map((link) => ({
      url: link.href,
      label: link.text || link.rawHref || link.href,
      kind: link.href && new URL(link.href).origin === pageOrigin ? "internal" : "external"
    }));
  const images = uniqueResources(
    (rendered.images || []).filter((image) => isHttpResourceUrl(image.src)),
    "src"
  )
    .slice(0, RESOURCE_LIMITS.imagesPerPage)
    .map((image) => ({
      url: image.src,
      label: image.alt || image.src,
      kind: "image"
    }));

  const [linkChecks, imageChecks, canonicalCheck] = await Promise.all([
    Promise.all(links.map((resource) => checkResource(resource, { allowPrivate: allowPrivateResources }))),
    Promise.all(images.map((resource) => checkResource(resource, { allowPrivate: allowPrivateResources }))),
    rendered.canonical
      ? checkResource({ url: rendered.canonical, label: "canonical", kind: "canonical" }, { allowPrivate: allowPrivateResources })
      : Promise.resolve(null)
  ]);

  return {
    links: linkChecks,
    images: imageChecks,
    canonical: canonicalCheck
  };
}

function emptyResourceChecks() {
  return { links: [], images: [], canonical: null };
}

async function checkResource(resource, options = {}) {
  const checked = await fetchResource(resource.url, "HEAD", options);
  const result =
    checked.status === 403 || checked.status === 405
      ? await fetchResource(resource.url, "GET", options)
      : checked;
  return {
    ...resource,
    ...result,
    redirected: (result.redirectChain || []).length > 0
  };
}

async function fetchResource(url, method, options = {}) {
  try {
    const response = await fetchWithRedirects(url, {
      method,
      timeoutMs: RESOURCE_LIMITS.timeoutMs,
      allowPrivate: Boolean(options.allowPrivate)
    });
    const headers = headersToObject(response.headers);
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || "",
      contentLength: Number(response.headers.get("content-length")) || 0,
      headers,
      redirectChain: response.redirectChain || [],
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      contentType: "",
      contentLength: 0,
      headers: {},
      redirectChain: [],
      error: error.message
    };
  }
}

async function fetchWithRedirects(url, { method = "GET", timeoutMs = 15000, allowPrivate = false } = {}) {
  let currentUrl = url;
  const redirectChain = [];
  let response = null;

  for (let redirectCount = 0; redirectCount <= RESOURCE_LIMITS.maxRedirects; redirectCount += 1) {
    const currentStatus = resourceUrlStatus(currentUrl, { allowPrivate });
    if (!currentStatus.ok) throw new Error(currentStatus.error);
    response = await fetch(currentStatus.url, {
      method,
      redirect: "manual",
      headers: {
        "user-agent": "SEOFixKit/0.9 (+https://seofixkit.com; evidence-backed SEO audit)"
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) break;
    const nextUrl = new URL(location, currentStatus.url).href;
    const nextStatus = resourceUrlStatus(nextUrl, { allowPrivate });
    if (!nextStatus.ok) throw new Error("Redirect target must be a public website URL.");
    redirectChain.push({
      status: response.status,
      from: currentStatus.url,
      to: nextStatus.url
    });
    currentUrl = nextStatus.url;
  }

  if (!response) {
    throw new Error("No response returned.");
  }

  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    url: currentUrl,
    redirectChain,
    text: () => response.text()
  };
}

function isHttpResourceUrl(value = "") {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function resourceUrlStatus(value = "", options = {}) {
  if (!options.allowPrivate) return publicUrlStatus(value);
  try {
    return { ok: true, url: normalizeUrl(value) };
  } catch {
    return { ok: false, error: "Enter a valid website URL." };
  }
}

function validateHreflang(hreflangs = [], pageUrl = "") {
  const issues = [];
  if (!hreflangs.length) return issues;

  const seen = new Map();
  for (const tag of hreflangs) {
    const code = String(tag.hreflang || "").toLowerCase();
    if (!code || !/^(x-default|[a-z]{2,3}(-[a-z0-9]{2,8})*)$/i.test(code)) {
      issues.push({
        severity: "warning",
        title: "Invalid hreflang code",
        why: "Invalid hreflang values can prevent Google from understanding localized page alternates.",
        evidence: `Invalid hreflang value "${tag.hreflang || "missing"}" points to ${tag.href || "missing href"}.`,
        fix: "Use valid BCP 47 language or language-region codes, or x-default for the fallback URL."
      });
    }
    if (seen.has(code)) {
      issues.push({
        severity: "warning",
        title: "Duplicate hreflang tag",
        why: "Duplicate hreflang codes create conflicting alternate-page signals.",
        evidence: `${code} appears more than once: ${seen.get(code)} and ${tag.href || "missing href"}.`,
        fix: "Keep one hreflang entry per language or language-region code."
      });
    }
    seen.set(code, tag.href || "");
  }

  const pageKey = canonicalKey(pageUrl);
  const hasSelfReference = hreflangs.some((tag) => canonicalKey(tag.href) === pageKey);
  if (!hasSelfReference) {
    issues.push({
      severity: "notice",
      title: "Hreflang is missing a self-reference",
      why: "Each localized page should usually include itself in its hreflang cluster.",
      evidence: `No hreflang href matches the current page ${pageUrl}.`,
      fix: "Add a hreflang entry for the current page alongside the alternate language URLs.",
      confidence: "needs-review"
    });
  }

  if (hreflangs.length > 1 && !seen.has("x-default")) {
    issues.push({
      severity: "notice",
      title: "Hreflang cluster has no x-default",
      why: "An x-default URL gives Google a fallback page when no language or region fits.",
      evidence: `${hreflangs.length} hreflang tags were found, but none use x-default.`,
      fix: "Add an x-default hreflang entry when there is a neutral fallback URL.",
      confidence: "needs-review"
    });
  }

  return dedupeHreflangIssues(issues);
}

function dedupeHreflangIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.title}:${issue.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collectPerformanceInsights(startUrl, homePage, options = {}) {
  const fallback = buildRenderedPerformanceSummary(homePage);
  if (!shouldRunPageSpeed(startUrl, options)) {
    return {
      status: "skipped",
      source: "rendered-lab",
      reason: "PageSpeed Insights skipped for local, private, or disabled runs.",
      ...fallback
    };
  }

  try {
    const raw = options.pageSpeedFetcher
      ? await options.pageSpeedFetcher(startUrl)
      : await fetchPageSpeedInsights(startUrl, options);
    return {
      ...fallback,
      ...parsePageSpeedResult(raw),
      status: "success",
      source: "pagespeed-insights-v5",
      strategy: "mobile"
    };
  } catch (error) {
    return {
      status: "unavailable",
      source: "rendered-lab",
      reason: error.message || "PageSpeed Insights did not return performance data.",
      ...fallback
    };
  }
}

function shouldRunPageSpeed(startUrl, options = {}) {
  if (options.pageSpeed === false) return false;
  if (options.pageSpeed === true || options.pageSpeedFetcher) return true;
  if (process.env.SEOFIXKIT_PAGESPEED_DISABLED === "1") return false;
  const parsed = new URL(startUrl);
  return ["http:", "https:"].includes(parsed.protocol) && !isLocalhost(parsed.hostname);
}

async function fetchPageSpeedInsights(url, options = {}) {
  const endpoint = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.append("category", "performance");
  endpoint.searchParams.set("locale", "en_US");
  if (options.pageSpeedApiKey) {
    endpoint.searchParams.set("key", options.pageSpeedApiKey);
  }
  const response = await fetch(endpoint.href, {
    headers: {
      "user-agent": "SEOFixKit/0.9 (+https://seofixkit.com; PageSpeed proof audit)"
    },
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) {
    throw new Error(`PageSpeed Insights returned HTTP ${response.status}.`);
  }
  return response.json();
}

function parsePageSpeedResult(raw = {}) {
  const lighthouse = raw.lighthouseResult || {};
  const audits = lighthouse.audits || {};
  const rawScore = lighthouse.categories?.performance?.score;
  const performanceScore = Number.isFinite(rawScore) ? Math.round(rawScore * 100) : null;
  const labMetrics = {
    firstContentfulPaint: metricFromAudit(audits["first-contentful-paint"]),
    largestContentfulPaint: metricFromAudit(audits["largest-contentful-paint"]),
    totalBlockingTime: metricFromAudit(audits["total-blocking-time"]),
    cumulativeLayoutShift: metricFromAudit(audits["cumulative-layout-shift"]),
    speedIndex: metricFromAudit(audits["speed-index"])
  };
  const fieldMetrics = parseFieldMetrics(raw.loadingExperience);
  return {
    analysisTimestamp: raw.analysisUTCTimestamp || "",
    finalUrl: raw.id || "",
    performanceScore,
    category: scoreCategory(performanceScore),
    fieldData: {
      overallCategory: raw.loadingExperience?.overall_category || "",
      originFallback: Boolean(raw.loadingExperience?.origin_fallback),
      metrics: fieldMetrics
    },
    labMetrics,
    opportunities: topPageSpeedOpportunities(audits)
  };
}

function metricFromAudit(audit = {}) {
  return {
    title: audit.title || "",
    value: Number(audit.numericValue || 0),
    display: audit.displayValue || formatMetricValue(audit.numericValue),
    score: typeof audit.score === "number" ? Math.round(audit.score * 100) : null
  };
}

function parseFieldMetrics(loadingExperience = {}) {
  const metrics = loadingExperience.metrics || {};
  return {
    largestContentfulPaint: fieldMetric(metrics.LARGEST_CONTENTFUL_PAINT_MS, "ms"),
    interactionToNextPaint: fieldMetric(metrics.INTERACTION_TO_NEXT_PAINT, "ms"),
    cumulativeLayoutShift: fieldMetric(metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE, "ratio"),
    firstContentfulPaint: fieldMetric(metrics.FIRST_CONTENTFUL_PAINT_MS, "ms")
  };
}

function fieldMetric(metric, unit) {
  if (!metric) return null;
  const percentile =
    unit === "ratio" ? Number(metric.percentile || 0) / 100 : Number(metric.percentile || 0);
  return {
    percentile,
    display: unit === "ratio" ? percentile.toFixed(2) : `${Math.round(percentile)}ms`,
    category: metric.category || ""
  };
}

function topPageSpeedOpportunities(audits = {}) {
  const ids = [
    "render-blocking-resources",
    "unused-javascript",
    "unused-css-rules",
    "unminified-javascript",
    "unminified-css",
    "modern-image-formats",
    "uses-optimized-images",
    "uses-responsive-images",
    "offscreen-images",
    "total-byte-weight",
    "server-response-time",
    "largest-contentful-paint-element"
  ];
  return ids
    .map((id) => {
      const audit = audits[id];
      if (!audit) return null;
      const savingsMs = Number(audit.details?.overallSavingsMs || 0);
      const savingsBytes = Number(audit.details?.overallSavingsBytes || 0);
      const score = typeof audit.score === "number" ? audit.score : null;
      const hasSavings = savingsMs > 0 || savingsBytes > 0;
      const failed = score !== null && score < 0.9;
      if (!hasSavings && !failed) return null;
      return {
        id,
        title: audit.title || id,
        description: audit.description || "",
        displayValue: audit.displayValue || "",
        score: score === null ? null : Math.round(score * 100),
        savingsMs,
        savingsBytes
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes)
    .slice(0, 5);
}

function buildRenderedPerformanceSummary(homePage) {
  const rendered = homePage?.rendered || {};
  return {
    performanceScore: null,
    category: "",
    fieldData: {
      overallCategory: "",
      originFallback: false,
      metrics: {}
    },
    labMetrics: {
      renderedLoad: {
        title: "Rendered browser load",
        value: Number(rendered.loadDurationMs || 0),
        display: rendered.loadDurationMs ? `${Math.round(rendered.loadDurationMs)}ms` : "unknown",
        score: null
      },
      htmlTransfer: {
        title: "Initial HTML transfer",
        value: Number(homePage?.transferSize || 0),
        display: formatBytes(homePage?.transferSize || 0),
        score: null
      }
    },
    opportunities: []
  };
}

function addPerformanceFindings(add, performance = {}, label) {
  if (!performance || performance.status === "skipped") return;
  if (performance.status === "unavailable") {
    add({
      type: "performance",
      severity: "notice",
      title: `PageSpeed data unavailable on ${label}`,
      why: "PageSpeed data adds Lighthouse lab proof for performance fixes. The rendered audit still collected local load proof.",
      evidence: performance.reason || "PageSpeed Insights did not return a result.",
      fix: "Rerun the audit later, or add a PageSpeed API key if automated volume is hitting public limits.",
      source: GOOGLE_DOCS.coreWebVitals,
      confidence: "needs-review"
    });
    return;
  }

  if (Number.isFinite(performance.performanceScore) && performance.performanceScore < PERFORMANCE_LIMITS.needsImprovementScore) {
    add({
      type: "performance",
      severity: performance.performanceScore < PERFORMANCE_LIMITS.poorScore ? "critical" : "warning",
      title: `Low mobile PageSpeed performance on ${label}`,
      why: "Page speed affects user experience and is part of the page-experience signal set.",
      evidence: `Mobile PageSpeed performance score is ${performance.performanceScore}/100 (${performance.category || "unknown"}).`,
      fix: "Prioritize the PageSpeed opportunities in this report, then rerun until the mobile performance score is at least 75.",
      source: GOOGLE_DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const lcp = performance.labMetrics?.largestContentfulPaint;
  if (lcp?.value > PERFORMANCE_LIMITS.lcpNeedsImprovementMs) {
    add({
      type: "performance",
      severity: lcp.value > PERFORMANCE_LIMITS.lcpPoorMs ? "critical" : "warning",
      title: `Slow Largest Contentful Paint on ${label}`,
      why: "LCP measures when the main content becomes visible. Slow LCP usually means users wait too long for the page's main value.",
      evidence: `PageSpeed lab LCP is ${lcp.display || `${Math.round(lcp.value)}ms`}.`,
      fix: "Optimize the LCP element, reduce render-blocking work, preload the hero asset, and compress or resize above-the-fold media.",
      source: GOOGLE_DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const tbt = performance.labMetrics?.totalBlockingTime;
  if (tbt?.value > PERFORMANCE_LIMITS.tbtNeedsImprovementMs) {
    add({
      type: "performance",
      severity: tbt.value > PERFORMANCE_LIMITS.tbtPoorMs ? "critical" : "warning",
      title: `High Total Blocking Time on ${label}`,
      why: "High blocking time means JavaScript is keeping the page from responding quickly.",
      evidence: `PageSpeed lab TBT is ${tbt.display || `${Math.round(tbt.value)}ms`}.`,
      fix: "Remove unused JavaScript, split bundles, defer non-critical scripts, and reduce third-party script work.",
      source: GOOGLE_DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const cls = performance.labMetrics?.cumulativeLayoutShift;
  if (cls?.value > PERFORMANCE_LIMITS.clsNeedsImprovement) {
    add({
      type: "performance",
      severity: cls.value > PERFORMANCE_LIMITS.clsPoor ? "critical" : "warning",
      title: `Layout shift risk on ${label}`,
      why: "Unexpected layout shift makes pages feel unstable and can hurt Core Web Vitals.",
      evidence: `PageSpeed lab CLS is ${cls.display || cls.value.toFixed(2)}.`,
      fix: "Reserve dimensions for images, ads, embeds, and late-loading UI so content does not jump after render.",
      source: GOOGLE_DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  for (const opportunity of performance.opportunities || []) {
    add({
      type: "performance",
      severity: opportunity.savingsMs > 1000 || opportunity.savingsBytes > 250_000 ? "warning" : "notice",
      title: `${opportunity.title} on ${label}`,
      why: "PageSpeed flagged this as a concrete performance repair opportunity.",
      evidence: performanceOpportunityEvidence(opportunity),
      fix: performanceOpportunityFix(opportunity),
      source: GOOGLE_DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }
}

function performanceOpportunityEvidence(opportunity) {
  const savings = [];
  if (opportunity.savingsMs) savings.push(`${Math.round(opportunity.savingsMs)}ms potential savings`);
  if (opportunity.savingsBytes) savings.push(`${formatBytes(opportunity.savingsBytes)} potential transfer savings`);
  if (opportunity.displayValue) savings.push(opportunity.displayValue);
  if (opportunity.score !== null) savings.push(`audit score ${opportunity.score}/100`);
  return savings.join("; ") || opportunity.title;
}

function performanceOpportunityFix(opportunity) {
  const id = opportunity.id || "";
  if (id.includes("render-blocking")) return "Inline critical CSS, defer non-critical CSS/JS, and remove blocking assets from the initial render path.";
  if (id.includes("unused-javascript")) return "Delete unused scripts, split the bundle by route, and defer code that is not needed for the first view.";
  if (id.includes("unused-css")) return "Remove unused CSS rules and ship only the styles needed for this route.";
  if (id.includes("image") || id.includes("offscreen")) return "Compress images, serve WebP/AVIF where safe, lazy-load below-the-fold images, and size assets to their rendered dimensions.";
  if (id.includes("total-byte-weight")) return "Reduce total transfer weight by compressing assets, pruning unused code, and removing heavy third-party payloads.";
  if (id.includes("server-response")) return "Improve server response time with caching, faster backend work, or edge delivery.";
  if (id.includes("largest-contentful-paint")) return "Optimize the LCP element directly: preload it, compress it, and avoid hiding it behind client-side rendering.";
  return "Review the PageSpeed opportunity and apply the smallest code or content change that removes the measured bottleneck.";
}

function scoreCategory(score) {
  if (!Number.isFinite(score)) return "";
  if (score >= 90) return "fast";
  if (score >= PERFORMANCE_LIMITS.needsImprovementScore) return "good";
  if (score >= PERFORMANCE_LIMITS.poorScore) return "needs-improvement";
  return "poor";
}

function formatMetricValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number >= 1000 ? `${(number / 1000).toFixed(1)}s` : `${Math.round(number)}ms`;
}

function isBrokenResource(check) {
  return !check || !check.ok || !check.status || check.status >= 400;
}

function formatResourceEvidence(resources = []) {
  const shown = resources.slice(0, 5).map((resource) => {
    const status = resource.status || resource.error || "no response";
    const destination =
      resource.redirected && resource.finalUrl && resource.finalUrl !== resource.url
        ? ` -> ${formatResourceUrl(resource.finalUrl)}`
        : "";
    const size = resource.contentLength ? ` (${formatBytes(resource.contentLength)})` : "";
    return `${formatResourceUrl(resource.url)} returned ${status}${destination}${size}`;
  });
  const extra = resources.length > shown.length ? `; ${resources.length - shown.length} more` : "";
  return `${shown.join("; ")}${extra}.`;
}

function formatRedirectChain(chain = []) {
  if (!chain.length) return "No redirect chain recorded.";
  return chain
    .slice(0, 6)
    .map((step) => `${step.status}: ${formatResourceUrl(step.from)} -> ${formatResourceUrl(step.to)}`)
    .join("; ");
}

function formatResourceUrl(value = "") {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${url.search}`.replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return String(value || "unknown");
  }
}

function canonicalKey(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort?.();
    return url.href.replace(/\/$/, "");
  } catch {
    return String(value || "");
  }
}

function uniqueResources(items = [], key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item?.[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function headersToObject(headers) {
  const output = {};
  headers?.forEach?.((value, key) => {
    output[key.toLowerCase()] = value;
  });
  return output;
}

function headerValue(headers = {}, name) {
  return headers[String(name).toLowerCase()] || "";
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isLocalhost(hostname = "") {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) || hostname.endsWith(".local");
}

async function fetchText(url) {
  try {
    const started = Date.now();
    const allowPrivate = isLocalhost(new URL(url).hostname);
    const response = await fetchWithRedirects(url, {
      method: "GET",
      timeoutMs: 15000,
      allowPrivate
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("text") || contentType.includes("html") || contentType.includes("xml")
      ? await response.text()
      : "";
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      contentType,
      headers: headersToObject(response.headers),
      redirectChain: response.redirectChain || [],
      responseTimeMs: Date.now() - started,
      contentLength: Number(response.headers.get("content-length")) || byteLength(body),
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      contentType: "",
      body: "",
      headers: {},
      redirectChain: [],
      responseTimeMs: null,
      contentLength: 0,
      error: error.message
    };
  }
}

function isHtmlResponse(fetchResult, url) {
  const contentType = (fetchResult.contentType || "").toLowerCase();
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) return true;
  if (
    isLikelyHtmlUrl(url) &&
    (contentType.includes("application/octet-stream") ||
      contentType.includes("binary/octet-stream") ||
      contentType.includes("text/plain"))
  ) {
    return true;
  }
  if (contentType) return false;
  return isLikelyHtmlUrl(url);
}

function isLikelyHtmlUrl(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return !/\.(txt|xml|json|csv|pdf|png|jpe?g|gif|webp|svg|ico|css|js|map|zip)$/i.test(pathname);
  } catch {
    return false;
  }
}

function normalizeUrl(input) {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  return url.href;
}

function normalizeCompetitorUrls(input, targetUrl) {
  const raw = Array.isArray(input)
    ? input
    : String(input || "")
        .split(/[\n,]+/)
        .map((value) => value.trim());
  const targetHost = normalizedHost(targetUrl);
  const seen = new Set();
  const urls = [];

  for (const value of raw) {
    if (!value || urls.length >= 5) continue;
    try {
      const normalized = normalizeUrl(String(value));
      const host = normalizedHost(normalized);
      if (!host || host === targetHost || seen.has(host)) continue;
      seen.add(host);
      urls.push(normalized);
    } catch {
      // Ignore malformed competitor suggestions. The public API validates them earlier.
    }
  }

  return urls;
}

function normalizedHost(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clampPageLimit(value) {
  return normalizeCrawlLimit(value);
}

function stripHash(value) {
  const url = new URL(value);
  url.hash = "";
  return url.href.replace(/\/$/, url.pathname === "/" ? "/" : "");
}

function pathLabel(url, startUrl) {
  const parsed = new URL(url);
  if (stripHash(url) === stripHash(startUrl)) return "home";
  return parsed.pathname || "page";
}

function suggestTitle(url, facts) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const firstH1 = facts.h1s?.[0];
  return trimSentence(firstH1 || `${host} page`, 58);
}

function suggestDescription(facts = {}) {
  const base =
    facts.bodySample ||
    facts.title ||
    "Clear page summary that explains the offer, audience, and next action.";
  return trimSentence(base.replace(/\s+/g, " "), 150);
}

function trimSentence(value, max) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}...`;
}

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;"
  };
  return String(value || "").replace(/[&"<>]/g, (character) => entities[character]);
}

function makeReportId(url, startedAt) {
  const slug = new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${slug}-${startedAt.toString(36)}`;
}
