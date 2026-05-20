import * as cheerio from "cheerio";
import { chromium } from "playwright";

const GOOGLE_DOCS = {
  javascript:
    "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  title: "https://developers.google.com/search/docs/appearance/title-link",
  snippets: "https://developers.google.com/search/docs/appearance/snippet",
  structuredData:
    "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data"
};

export async function auditUrl(inputUrl, options = {}) {
  const startedAt = Date.now();
  const maxPages = options.maxPages || 4;
  const startUrl = normalizeUrl(inputUrl);
  const origin = new URL(startUrl).origin;
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

    for (const link of page.rendered.internalLinks) {
      if (pages.length + queue.length >= maxPages) break;
      const href = stripHash(link.href);
      if (!href.startsWith(origin)) continue;
      if (isLikelyHtmlUrl(href) && !visited.has(href) && !queue.includes(href)) {
        queue.push(href);
      }
    }
  }

  if (browser) {
    await browser.close();
  }

  const findings = buildFindings({
    pages,
    startUrl,
    robots,
    sitemap,
    renderedAvailable: Boolean(browser)
  });

  const score = scoreFindings(findings);
  const summary = summarize(findings, pages);
  const repairPlan = buildRepairPlan(findings);
  const fixPack = buildFixPack(pages[0], origin, findings);

  return {
    id: makeReportId(startUrl, startedAt),
    url: startUrl,
    origin,
    scannedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    score,
    summary,
    warnings,
    docs: GOOGLE_DOCS,
    pages,
    findings,
    repairPlan,
    repairBrief: buildRepairBrief({
      startUrl,
      score,
      summary,
      pages,
      findings,
      repairPlan
    }),
    fixPack
  };
}

async function inspectPage(url, browser) {
  const staticFetch = await fetchText(url);
  const isHtml = isHtmlResponse(staticFetch, url);
  const staticFacts = extractStaticFacts(staticFetch.body || "", url, staticFetch);
  let renderedFacts = null;
  let renderedError = null;

  if (browser && isHtml) {
    try {
      renderedFacts = await extractRenderedFacts(browser, url);
    } catch (error) {
      renderedError = error.message;
    }
  }

  const rendered = renderedFacts || {
    ...staticFacts,
    source: "static-fallback",
    renderError: renderedError || "Rendered audit unavailable"
  };

  return {
    url,
    status: staticFetch.status,
    ok: staticFetch.ok,
    contentType: staticFetch.contentType,
    isHtml,
    static: staticFacts,
    rendered,
    renderError: renderedError
  };
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
    const images = [...document.querySelectorAll("img")].map((node) => ({
      src: absolute(node.getAttribute("src")),
      alt: node.getAttribute("alt") || "",
      width: node.getAttribute("width") || null,
      height: node.getAttribute("height") || null
    }));
    const schema = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((node) => {
        try {
          const parsed = JSON.parse(node.textContent || "{}");
          const values = Array.isArray(parsed) ? parsed : [parsed];
          return values.map((item) => item["@type"]).filter(Boolean);
        } catch {
          return ["invalid-json"];
        }
      })
      .flat();
    const bodyText = text(document.body);
    const origin = location.origin;

    return {
      source: "rendered-dom",
      finalUrl: location.href,
      title: document.title || "",
      description: metaByName("description"),
      robots: metaByName("robots"),
      canonical: absolute(document.querySelector('link[rel="canonical"]')?.getAttribute("href")),
      lang: document.documentElement.getAttribute("lang") || null,
      viewport: metaByName("viewport"),
      h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
      headings,
      links,
      internalLinks: links.filter((link) => new URL(link.href).origin === origin),
      externalLinks: links.filter((link) => new URL(link.href).origin !== origin),
      images,
      imagesMissingAlt: images.filter((image) => !image.alt || !image.alt.trim()),
      openGraph: {
        title: metaByProperty("og:title"),
        description: metaByProperty("og:description"),
        image: absolute(metaByProperty("og:image")),
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
      schemaTypes: schema,
      wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
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
    .map((node) => ({
      src: absolute($(node).attr("src")),
      alt: $(node).attr("alt") || "",
      width: $(node).attr("width") || null,
      height: $(node).attr("height") || null
    }));
  const schemaTypes = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((node) => {
      try {
        const parsed = JSON.parse($(node).text() || "{}");
        const values = Array.isArray(parsed) ? parsed : [parsed];
        return values.map((item) => item["@type"]).filter(Boolean);
      } catch {
        return ["invalid-json"];
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
    robots: metaByName("robots"),
    canonical: absolute($('link[rel="canonical"]').attr("href")),
    lang: $("html").attr("lang") || null,
    viewport: metaByName("viewport"),
    h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
    headings,
    links,
    internalLinks: links.filter((link) => new URL(link.href).origin === base.origin),
    externalLinks: links.filter((link) => new URL(link.href).origin !== base.origin),
    images,
    imagesMissingAlt: images.filter((image) => !image.alt || !image.alt.trim()),
    openGraph: {
      title: metaByProperty("og:title"),
      description: metaByProperty("og:description"),
      image: absolute(metaByProperty("og:image")),
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
    schemaTypes,
    wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    bodySample: bodyText.slice(0, 280)
  };
}

function buildFindings({ pages, startUrl, robots, sitemap, renderedAvailable }) {
  const findings = [];
  const home = pages[0];
  if (!home) return findings;

  const add = (finding) => {
    findings.push({
      id: `${finding.type}-${findings.length + 1}`,
      confidence: finding.confidence || "verified",
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
    const { rendered, static: staticFacts } = page;
    const label = pathLabel(page.url, startUrl);

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
        title: `Images missing alt text on ${label}`,
        why: "Alt text improves accessibility and can help image understanding.",
        evidence: `${rendered.imagesMissingAlt.length}/${rendered.images.length} images have empty alt text.`,
        fix: "Add useful alt text to informative images. Leave decorative images empty intentionally.",
        confidence: "needs-review"
      });
    }

    if (rendered.schemaTypes.length === 0) {
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
  }

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
      proof: finding.evidence,
      fix: finding.fix,
      confidence: finding.confidence || "verified",
      source: finding.source || null,
      snippet: finding.snippet || null,
      acceptance: acceptanceCheck(finding)
    }));
}

function buildRepairBrief({ startUrl, score, summary, pages, findings, repairPlan }) {
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
    lines.push(`- Rendered schema types: ${facts.schemaTypes?.join(", ") || "none"}`);
    lines.push("");
  }

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
  if (title.includes("canonical")) {
    return "The rendered head includes one rel=canonical pointing to the preferred URL.";
  }
  if (title.includes("noindex")) {
    return "The rendered robots meta does not include noindex for pages that should rank.";
  }
  if (title.includes("social share")) {
    return "The rendered head includes og:image and twitter:image using a 1200x630 image.";
  }
  if (title.includes("apple touch")) {
    return "The rendered head links an Apple touch icon.";
  }
  if (title.includes("alt text")) {
    return "Informative images have useful alt text, while decorative images are intentionally empty.";
  }
  if (title.includes("structured data")) {
    return "JSON-LD validates and matches content that is visible on the page.";
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

function summarize(findings, pages) {
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
    critical: counts.critical || 0,
    warnings: counts.warning || 0,
    notices: counts.notice || 0,
    guardedFalsePositives: counts.good || 0,
    totalFindings: counts.total
  };
}

function scoreFindings(findings) {
  let score = 100;
  for (const finding of findings) {
    if (finding.severity === "critical") score -= 12;
    if (finding.severity === "warning") score -= 5;
    if (finding.severity === "notice") score -= 1;
  }
  return Math.max(0, Math.min(100, score));
}

async function fetchText(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "SEOFixKit/0.3 (+https://seo-fix-kit.local; evidence-backed SEO audit)"
      },
      signal: AbortSignal.timeout(15000)
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
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      contentType: "",
      body: "",
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
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function makeReportId(url, startedAt) {
  const slug = new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${slug}-${startedAt.toString(36)}`;
}
