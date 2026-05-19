import puppeteer from "@cloudflare/puppeteer";

const DOCS = {
  javascript:
    "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  snippets: "https://developers.google.com/search/docs/appearance/snippet",
  structuredData:
    "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data"
};

const MAX_HTML_BYTES = 1_000_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "seo-fix-kit",
          runtime: "cloudflare-worker",
          browserRun: Boolean(env.BROWSER),
          version: "0.3.0"
        });
      }

      if (url.pathname === "/api/audit" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (!body.url || typeof body.url !== "string") {
          return json({ error: "Enter a website URL to audit." }, 400);
        }

        const report = await auditUrl(body.url, env, {
          maxPages: Math.min(Math.max(Number(body.maxPages || 3), 1), 3),
          appOrigin: url.origin
        });
        return json(report);
      }

      if (url.pathname === "/api/demo-audit") {
        const report = await auditUrl(`${url.origin}/fixture/rendered-page`, env, {
          maxPages: 1,
          appOrigin: url.origin
        });
        return json(report);
      }

      if (url.pathname === "/fixture/rendered-page") {
        return new Response(renderedFixture(url.origin), {
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }

      if (url.pathname === "/fixture/robots.txt") {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/fixture/sitemap.xml\n`, {
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }

      if (url.pathname === "/fixture/sitemap.xml") {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/fixture/rendered-page</loc></url></urlset>`,
          { headers: { "content-type": "application/xml; charset=utf-8" } }
        );
      }

      if (url.pathname === "/robots.txt") {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`, {
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }

      if (url.pathname === "/sitemap.xml") {
        return new Response(rootSitemap(url.origin), {
          headers: { "content-type": "application/xml; charset=utf-8" }
        });
      }

      if (url.pathname === "/llms.txt") {
        return new Response(llmsText(url.origin), {
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }

      if (
        url.pathname === "/" &&
        (request.headers.get("accept") || "").includes("text/markdown")
      ) {
        return new Response(homeMarkdown(url.origin), {
          headers: { "content-type": "text/markdown; charset=utf-8" }
        });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json(
        {
          error:
            error?.message ||
            "The audit failed. Try a smaller site or run again in a moment."
        },
        500
      );
    }
  }
};

async function auditUrl(inputUrl, env, options = {}) {
  const startedAt = Date.now();
  const startUrl = normalizeUrl(inputUrl);
  const origin = new URL(startUrl).origin;
  const maxPages = options.maxPages || 3;

  const robots =
    origin === options.appOrigin
      ? { ok: true, status: 200, url: `${origin}/robots.txt`, body: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n` }
      : await fetchText(`${origin}/robots.txt`);
  const sitemap =
    origin === options.appOrigin
      ? { ok: true, status: 200, url: `${origin}/sitemap.xml`, body: rootSitemap(origin) }
      : await fetchText(`${origin}/sitemap.xml`);
  const browser = await puppeteer.launch(env.BROWSER);
  const pages = [];
  const queue = [startUrl];
  const visited = new Set();

  try {
    while (queue.length && pages.length < maxPages) {
      const nextUrl = stripHash(queue.shift());
      if (visited.has(nextUrl)) continue;
      visited.add(nextUrl);

      const page = await inspectPage(nextUrl, browser);
      pages.push(page);

      for (const link of page.rendered.internalLinks) {
        const href = stripHash(link.href);
        if (!href.startsWith(origin)) continue;
        if (!visited.has(href) && !queue.includes(href) && queue.length + pages.length < maxPages) {
          queue.push(href);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const findings = buildFindings({
    pages,
    startUrl,
    robots,
    sitemap
  });

  return {
    id: `${new URL(startUrl).hostname.replace(/[^a-z0-9]+/gi, "-")}-${startedAt.toString(36)}`,
    url: startUrl,
    origin,
    scannedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    score: scoreFindings(findings),
    summary: summarize(findings, pages),
    warnings: [],
    docs: DOCS,
    pages,
    findings,
    fixPack: buildFixPack(pages[0], origin)
  };
}

async function inspectPage(url, browser) {
  const staticFetch = await fetchText(url);
  const staticFacts = extractStaticFacts(staticFetch.body || "", url, staticFetch);
  const rendered = await extractRenderedFacts(browser, url);

  return {
    url,
    status: staticFetch.status,
    ok: staticFetch.ok,
    static: staticFacts,
    rendered
  };
}

async function extractRenderedFacts(browser, url) {
  const page = await browser.newPage();
  const started = Date.now();

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 25_000
    });

    await wait(350);

    const facts = await page.evaluate(() => {
      const absolute = (value) => {
        try {
          return value ? new URL(value, location.href).href : null;
        } catch {
          return value || null;
        }
      };
      const metaByName = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || null;
      const metaByProperty = (property) =>
        document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") || null;
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
        alt: node.getAttribute("alt") || ""
      }));
      const schemaTypes = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .flatMap((node) => {
          try {
            const parsed = JSON.parse(node.textContent || "{}");
            return (Array.isArray(parsed) ? parsed : [parsed])
              .map((item) => item["@type"])
              .filter(Boolean);
          } catch {
            return ["invalid-json"];
          }
        });
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
        favicon: absolute(document.querySelector('link[rel~="icon"]')?.getAttribute("href")),
        appleTouchIcon: absolute(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")),
        schemaTypes,
        wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
        bodySample: bodyText.slice(0, 280)
      };
    });

    return {
      ...facts,
      status: response?.status() || null,
      loadDurationMs: Date.now() - started
    };
  } finally {
    await page.close();
  }
}

function extractStaticFacts(html, url, fetchResult = {}) {
  const base = new URL(url);
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] || "";
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const body = withoutScripts.match(/<body[\s\S]*?<\/body>/i)?.[0] || withoutScripts;
  const bodyText = decodeEntities(stripTags(body)).replace(/\s+/g, " ").trim();
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: absolute(match[1], base.href),
      rawHref: match[1],
      text: decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim()
    }))
    .filter((link) => link.href?.startsWith("http"));
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => ({
    src: absolute(attr(match[0], "src"), base.href),
    alt: attr(match[0], "alt") || ""
  }));
  const headings = [];
  for (const match of html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    headings.push({
      level: match[1].toLowerCase(),
      text: decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim()
    });
  }
  const schemaTypes = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      try {
        const parsed = JSON.parse(match[1] || "{}");
        return (Array.isArray(parsed) ? parsed : [parsed])
          .map((item) => item["@type"])
          .filter(Boolean);
      } catch {
        return ["invalid-json"];
      }
    });

  return {
    source: "static-html",
    finalUrl: url,
    status: fetchResult.status || null,
    title: decodeEntities(stripTags(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")),
    description: meta(head, "name", "description"),
    robots: meta(head, "name", "robots"),
    canonical: absolute(linkRel(head, "canonical"), base.href),
    lang: html.match(/<html\b[^>]*lang=["']([^"']+)["']/i)?.[1] || null,
    h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
    headings,
    links,
    internalLinks: links.filter((link) => new URL(link.href).origin === base.origin),
    externalLinks: links.filter((link) => new URL(link.href).origin !== base.origin),
    images,
    imagesMissingAlt: images.filter((image) => !image.alt || !image.alt.trim()),
    openGraph: {
      title: meta(head, "property", "og:title"),
      description: meta(head, "property", "og:description"),
      image: absolute(meta(head, "property", "og:image"), base.href),
      type: meta(head, "property", "og:type")
    },
    twitter: {
      card: meta(head, "name", "twitter:card"),
      title: meta(head, "name", "twitter:title"),
      description: meta(head, "name", "twitter:description"),
      image: absolute(meta(head, "name", "twitter:image"), base.href)
    },
    favicon: absolute(linkRel(head, "icon"), base.href),
    appleTouchIcon: absolute(linkRel(head, "apple-touch-icon"), base.href),
    schemaTypes,
    wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    bodySample: bodyText.slice(0, 280)
  };
}

function buildFindings({ pages, startUrl, robots, sitemap }) {
  const findings = [];
  const add = (finding) =>
    findings.push({
      id: `${finding.type}-${findings.length + 1}`,
      confidence: "verified",
      ...finding
    });

  for (const page of pages) {
    const rendered = page.rendered;
    const staticFacts = page.static;
    const label = stripHash(page.url) === stripHash(startUrl) ? "home" : new URL(page.url).pathname;

    if (staticFacts.h1s.length === 0 && rendered.h1s.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: H1 exists after render`,
        why: "A static-only crawler would report a missing H1, but the rendered page contains one.",
        evidence: `Rendered H1: "${rendered.h1s[0]}"`,
        fix: "Do not add another H1 just to satisfy a static crawler.",
        source: DOCS.javascript
      });
    }

    if (staticFacts.internalLinks.length === 0 && rendered.internalLinks.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: internal links exist after render`,
        why: "Static HTML did not expose links, but the browser-rendered DOM did.",
        evidence: `${rendered.internalLinks.length} rendered internal links found.`,
        fix: "Keep the rendered links crawlable as real anchor tags.",
        source: DOCS.javascript
      });
    }

    if (staticFacts.wordCount < 50 && rendered.wordCount >= 250) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: rendered content is not thin`,
        why: "The static HTML looks thin, but users and modern crawlers see substantial rendered content.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "No thin-content fix is needed for this page based on rendered text.",
        source: DOCS.javascript
      });
    }

    if (!rendered.description || rendered.description.length < 70 || rendered.description.length > 165) {
      add({
        type: "issue",
        severity: "warning",
        title: `Meta description needs tightening on ${label}`,
        why: "A clear page-specific description gives Google better source material for snippets.",
        evidence: rendered.description
          ? `${rendered.description.length} characters: "${rendered.description}"`
          : "No rendered meta description found.",
        fix: "Rewrite it as one clear value proposition.",
        source: DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    }

    if (!rendered.h1s.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing H1 on ${label}`,
        why: "The H1 should state the main topic visible on the page.",
        evidence: "No rendered H1 found.",
        fix: "Add one visible H1 that matches the page purpose.",
        source: DOCS.javascript
      });
    }

    if (!rendered.internalLinks.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `No rendered internal links on ${label}`,
        why: "Internal links help crawlers discover and understand related pages.",
        evidence: "No rendered internal links found.",
        fix: "Add normal anchor links to key related pages.",
        source: DOCS.javascript
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

    if (!rendered.schemaTypes.length) {
      add({
        type: "enhancement",
        severity: "notice",
        title: `Structured data opportunity on ${label}`,
        why: "Structured data can make content eligible for richer search features when guidelines are met.",
        evidence: "No JSON-LD structured data found.",
        fix: "Add truthful schema that matches visible content.",
        source: DOCS.structuredData,
        snippet: buildSchemaSnippet(page.url, rendered)
      });
    }
  }

  if (!robots.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Robots.txt not found",
      why: "Robots.txt gives crawlers explicit discovery guidance.",
      evidence: `GET /robots.txt returned ${robots.status || "no response"}.`,
      fix: "Add a robots.txt file that references your sitemap."
    });
  }

  if (!sitemap.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Sitemap not found",
      why: "A sitemap helps crawlers discover important URLs.",
      evidence: `GET /sitemap.xml returned ${sitemap.status || "no response"}.`,
      fix: "Publish a sitemap and reference it from robots.txt."
    });
  }

  return findings;
}

function buildFixPack(page, origin) {
  if (!page) return [];
  return [
    {
      title: "Social preview tags",
      body: "Use this when og:image or twitter:image is missing.",
      snippet: buildSocialSnippet(page.url, page.rendered)
    },
    {
      title: "Canonical tag",
      body: "Use this when the page has one preferred public URL.",
      snippet: `<link rel="canonical" href="${page.url}" />`
    },
    {
      title: "Basic WebSite schema",
      body: "Use truthful schema that matches visible content.",
      snippet: buildSchemaSnippet(origin, page.rendered)
    }
  ];
}

function buildSocialSnippet(url, facts) {
  const title = escapeHtml(facts.title || new URL(url).hostname);
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
  return `<script type="application/ld+json">\n${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: facts.title || new URL(url).hostname,
      url: origin,
      description: facts.description || suggestDescription(facts)
    },
    null,
    2
  )}\n</script>`;
}

async function fetchText(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "SEOFixKit/0.3 (+https://seo-fix-kit.local)" }
    });
    const contentType = response.headers.get("content-type") || "";
    const body =
      contentType.includes("text") ||
      contentType.includes("html") ||
      contentType.includes("xml")
        ? await readTextLimited(response, MAX_HTML_BYTES)
        : "";
    return { ok: response.ok, status: response.status, url: response.url, body };
  } catch (error) {
    return { ok: false, status: null, url, body: "", error: error.message };
  }
}

async function readTextLimited(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("HTML byte limit exceeded");
      break;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total > maxBytes ? maxBytes : total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk.slice(0, Math.max(0, merged.length - offset)), offset);
    offset += chunk.byteLength;
    if (offset >= merged.length) break;
  }
  return new TextDecoder().decode(merged);
}

function summarize(findings, pages) {
  return {
    pagesScanned: pages.length,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    notices: findings.filter((finding) => finding.severity === "notice").length,
    guardedFalsePositives: findings.filter((finding) => finding.severity === "good").length,
    totalFindings: findings.length
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

function attr(html, name) {
  return html.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] || null;
}

function meta(head, key, value) {
  const match = head.match(
    new RegExp(`<meta\\b(?=[^>]*${key}=["']${escapeRegExp(value)}["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>`, "i")
  );
  return match?.[1] || null;
}

function linkRel(head, rel) {
  const match = head.match(
    new RegExp(`<link\\b(?=[^>]*rel=["'][^"']*${escapeRegExp(rel)}[^"']*["'])(?=[^>]*href=["']([^"']*)["'])[^>]*>`, "i")
  );
  return match?.[1] || null;
}

function absolute(value, base) {
  try {
    return value ? new URL(value, base).href : null;
  } catch {
    return value || null;
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

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function suggestDescription(facts = {}) {
  const base =
    facts.bodySample ||
    facts.title ||
    "Clear page summary that explains the offer, audience, and next action.";
  const cleaned = base.replace(/\s+/g, " ").trim();
  return cleaned.length <= 150 ? cleaned : `${cleaned.slice(0, 147).trim()}...`;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderedFixture(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proof Demo App Shell</title>
    <meta name="description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
    <link rel="canonical" href="${origin}/fixture/rendered-page" />
  </head>
  <body>
    <div id="app">Loading app shell...</div>
    <script>
      document.getElementById("app").innerHTML = \`
        <main>
          <h1>Rendered SaaS page with real content</h1>
          <p>This demo intentionally ships a thin static shell, then renders the real page content with JavaScript. A weak static-only SEO audit would say the page has no H1, no internal links, and thin content. SEO Fix Kit should not make that mistake.</p>
          <p>Founders need verified findings, not busywork. The page includes enough rendered text to show that the final browser-visible page is materially different from the raw HTML response.</p>
          <p>Use this fixture to prove that the audit sees what users and modern rendering systems see after JavaScript runs. The report should guard false positives instead of telling the user to add duplicate headings or unnecessary internal links.</p>
          <p>The right output is evidence, confidence, and a practical fix only when a real fix is needed.</p>
          <nav>
            <a href="/fixture/rendered-page">Overview</a>
            <a href="/fixture/rendered-page?tab=pricing">Pricing</a>
            <a href="/fixture/rendered-page?tab=docs">Docs</a>
          </nav>
        </main>
      \`;
    </script>
  </body>
</html>`;
}

function llmsText(origin) {
  return `# SEO Fix Kit

SEO Fix Kit audits a website, proves what is wrong, and generates a first repair pack.

Live product claims:
- Renders pages before judging common SEO issues.
- Compares static HTML against rendered DOM.
- Shows evidence for findings.
- Generates starter fix snippets for metadata, social previews, canonical tags, robots, sitemaps, and schema.
- Guards common false positives on JavaScript-rendered pages.

Current product boundary:
- Does not provide backlink databases.
- Does not provide keyword volume databases.
- Does not replace Ahrefs or Semrush.

Useful routes:
- ${origin}/
- ${origin}/api/health
- ${origin}/llms.txt
`;
}

function homeMarkdown(origin) {
  return `# SEO Fix Kit

Audit it. Prove it. Fix it.

SEO Fix Kit returns an evidence-backed SEO repair report. It renders pages before judging them, compares static HTML against rendered DOM, separates real SEO repairs from crawler false positives, and generates copy-paste starter fixes.

Start at ${origin}/.
`;
}

function rootSitemap(origin) {
  const urls = ["/", "/llms.txt"];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((path) => `<url><loc>${origin}${path}</loc></url>`)
    .join("")}</urlset>`;
}
