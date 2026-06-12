const FACET_PARAM_NAMES = new Set([
  "filter",
  "filter_color",
  "filter_size",
  "filter_brand",
  "variant",
  "sort",
  "orderby",
  "min_price",
  "max_price",
  "color",
  "size",
  "brand",
  "page",
  "paged"
]);

const WORDPRESS_ARCHIVE_PATTERNS = [
  /\/category\//i,
  /\/tag\//i,
  /\/author\//i,
  /\/\d{4}\/\d{2}\//i,
  /[?&]author=/i
];

const PRODUCT_PATH_PATTERNS = [
  /\/products?\//i,
  /\/product\//i,
  /\/shop\//i,
  /\/collections?\//i,
  /\/catalog\//i,
  /\/item\//i,
  /\/sku\//i
];

const CATEGORY_PATH_PATTERNS = [
  /\/collections?\//i,
  /\/categories?\//i,
  /\/category\//i,
  /\/shop\//i,
  /\/catalog\//i
];

const PLATFORM_SIGNATURES = [
  {
    id: "wordpress",
    name: "WordPress",
    category: "cms",
    patterns: [/wordpress/i, /\/wp-content\//i, /\/wp-includes\//i, /\/wp-json\b/i]
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    category: "ecommerce",
    patterns: [/woocommerce/i, /\/wp-content\/plugins\/woocommerce\//i, /wc-ajax=/i]
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "ecommerce",
    patterns: [/shopify/i, /cdn\.shopify\.com/i, /\.myshopify\.com/i]
  },
  {
    id: "magento",
    name: "Magento",
    category: "ecommerce",
    patterns: [/magento/i, /\/static\/frontend\//i, /\/media\/catalog\/product\//i, /mage\//i]
  },
  {
    id: "bigcommerce",
    name: "BigCommerce",
    category: "ecommerce",
    patterns: [/bigcommerce/i, /cdn\d+\.bigcommerce\.com/i, /\/stencil\//i]
  },
  {
    id: "prestashop",
    name: "PrestaShop",
    category: "ecommerce",
    patterns: [/prestashop/i, /\/modules\/ps_/i]
  }
];

const SEO_PLUGIN_PATTERNS = [
  { id: "yoast", name: "Yoast SEO", patterns: [/yoast/i, /yoast-seo/i] },
  { id: "rankmath", name: "Rank Math", patterns: [/rank-?math/i] },
  { id: "aioseo", name: "AIOSEO", patterns: [/aioseo/i, /all-in-one-seo/i] },
  { id: "seopress", name: "SEOPress", patterns: [/seopress/i] }
];

export function buildPlatformSeoAudit(report = {}) {
  const pages = Array.isArray(report.pages) ? report.pages : [];
  const evidenceRows = pages.map(pageEvidence);
  const signals = evidenceRows.flatMap((row) => row.signals);
  const detectedPlatforms = detectPlatforms(signals);
  const pluginResources = wordpressPluginResources(evidenceRows);
  const seoPlugins = detectSeoPlugins(signals);
  const productPages = evidenceRows.filter(isProductLikePage);
  const categoryPages = evidenceRows.filter(isCategoryLikePage);
  const ecommerceDetected =
    detectedPlatforms.some((platform) => platform.category === "ecommerce") ||
    productPages.length > 0 ||
    categoryPages.length > 0;
  const wordpressDetected = detectedPlatforms.some((platform) => platform.id === "wordpress");

  if (!wordpressDetected && !ecommerceDetected) {
    return {
      status: "skipped",
      source: "rendered-platform-proof",
      summary: { detectedPlatforms: 0, ecommerceDetected: false, wordpressDetected: false },
      repairOpportunities: []
    };
  }

  const checks = {
    productSchema: productSchemaCheck(productPages),
    breadcrumbSchema: breadcrumbSchemaCheck(productPages, categoryPages),
    facetedNavigation: facetedNavigationCheck(evidenceRows),
    categoryContent: categoryContentCheck(categoryPages),
    outOfStock: outOfStockCheck(productPages),
    wordpressArchives: wordpressArchiveCheck(evidenceRows),
    wordpressPlugins: wordpressPluginCheck(pluginResources),
    wordpressSeoPlugin: wordpressSeoPluginCheck(wordpressDetected, seoPlugins, evidenceRows)
  };
  const repairOpportunities = platformRepairOpportunities({ checks, wordpressDetected, ecommerceDetected });
  const summary = {
    detectedPlatforms: detectedPlatforms.length,
    detectedPlatformNames: detectedPlatforms.map((platform) => platform.name),
    ecommerceDetected,
    wordpressDetected,
    productLikePages: productPages.length,
    productSchemaPages: checks.productSchema.pagesWithSchema,
    productSchemaCoveragePercent: percent(checks.productSchema.pagesWithSchema, Math.max(productPages.length, 1)),
    breadcrumbSchemaPages: checks.breadcrumbSchema.pagesWithSchema,
    facetedLinks: checks.facetedNavigation.links.length,
    wordpressArchiveLinks: checks.wordpressArchives.links.length,
    wordpressPlugins: pluginResources.plugins.length,
    wordpressPluginResources: pluginResources.resources.length,
    seoPluginsDetected: seoPlugins.map((plugin) => plugin.name),
    repairOpportunityCount: repairOpportunities.length
  };

  return {
    status: "ready",
    source: "rendered-platform-proof",
    note: "Platform SEO audit uses rendered page proof and public resources. It does not log into CMS, Google Business Profile, Shopify admin, or private plugin settings.",
    detectedPlatforms,
    summary,
    checks,
    repairOpportunities
  };
}

export function platformSeoAuditBriefLines(audit = {}) {
  if (audit.status !== "ready") return [];
  const lines = [
    "## Platform SEO audit",
    "",
    `Detected platforms: ${audit.summary?.detectedPlatformNames?.join(", ") || "none"}`,
    `Product-like pages checked: ${audit.summary?.productLikePages || 0}`,
    `Product schema coverage: ${audit.summary?.productSchemaCoveragePercent || 0}%`,
    `Faceted or variant links: ${audit.summary?.facetedLinks || 0}`,
    `WordPress plugin resources: ${audit.summary?.wordpressPluginResources || 0}`,
    `WordPress archive links: ${audit.summary?.wordpressArchiveLinks || 0}`,
    ""
  ];

  if (audit.repairOpportunities?.length) {
    lines.push("### Platform repair actions", "");
    for (const item of audit.repairOpportunities.slice(0, 8)) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
    }
    lines.push("");
  } else {
    lines.push("No platform-specific repair actions were created from the rendered proof.", "");
  }

  return lines;
}

export function platformSeoSummaryCopy(audit = {}) {
  if (audit.status !== "ready") return "No WordPress or ecommerce platform signals were detected.";
  const names = audit.summary?.detectedPlatformNames?.join(", ") || "platform";
  return `${names} proof was detected from rendered pages. The audit checked product schema, breadcrumbs, faceted links, WordPress archives, and plugin resource impact.`;
}

function pageEvidence(page = {}) {
  const rendered = page.rendered || {};
  const staticFacts = page.static || {};
  const url = rendered.finalUrl || page.finalUrl || page.url || "";
  const resources = page.resourceWaterfall?.resources || [];
  const allLinks = [...(rendered.links || []), ...(staticFacts.links || [])];
  const scripts = [...(rendered.scripts || []), ...(staticFacts.scripts || [])];
  const stylesheets = [...(rendered.stylesheets || []), ...(staticFacts.stylesheets || [])];
  const imageChecks = page.imageChecks || [];
  const signals = [
    url,
    rendered.generator || "",
    staticFacts.generator || "",
    rendered.bodySample || "",
    ...allLinks.map((link) => `${link.href || ""} ${link.text || ""}`),
    ...scripts.map((script) => script.src || script),
    ...stylesheets.map((sheet) => sheet.href || sheet),
    ...resources.map((resource) => `${resource.url || ""} ${resource.label || ""} ${resource.type || ""}`)
  ].filter(Boolean);

  return {
    url,
    pageUrl: page.url || url,
    label: pathLabel(url || page.url || ""),
    title: rendered.title || staticFacts.title || "",
    description: rendered.description || staticFacts.description || "",
    h1s: rendered.h1s || staticFacts.h1s || [],
    robots: rendered.robots || staticFacts.robots || "",
    canonical: rendered.canonical || staticFacts.canonical || "",
    wordCount: Number(rendered.wordCount || staticFacts.wordCount || 0),
    bodyText: rendered.bodyText || staticFacts.bodyText || "",
    schemaTypes: rendered.schemaTypes || staticFacts.schemaTypes || [],
    imageChecks,
    links: allLinks,
    scripts,
    resources,
    signals
  };
}

function detectPlatforms(signals = []) {
  const textRows = signals.map((signal) => String(signal || ""));
  return PLATFORM_SIGNATURES.map((platform) => {
    const matches = [];
    for (const row of textRows) {
      for (const pattern of platform.patterns) {
        if (pattern.test(row)) {
          matches.push(cleanEvidence(row));
          break;
        }
      }
      if (matches.length >= 4) break;
    }
    if (!matches.length) return null;
    return {
      id: platform.id,
      name: platform.name,
      category: platform.category,
      confidence: matches.length >= 2 ? "high" : "medium",
      signals: [...new Set(matches)].slice(0, 4)
    };
  }).filter(Boolean);
}

function detectSeoPlugins(signals = []) {
  return SEO_PLUGIN_PATTERNS.map((plugin) => {
    const matches = signals
      .map((signal) => String(signal || ""))
      .filter((signal) => plugin.patterns.some((pattern) => pattern.test(signal)))
      .map(cleanEvidence)
      .slice(0, 3);
    if (!matches.length) return null;
    return { id: plugin.id, name: plugin.name, signals: [...new Set(matches)] };
  }).filter(Boolean);
}

function wordpressPluginResources(evidenceRows = []) {
  const resources = [];
  const plugins = new Map();
  for (const row of evidenceRows) {
    for (const resource of row.resources || []) {
      const plugin = wordpressPluginName(resource.url || "");
      if (!plugin) continue;
      const item = {
        plugin,
        url: resource.url,
        label: resource.label || plugin,
        type: resource.type || "resource",
        sizeBytes: Number(resource.sizeBytes || 0),
        durationMs: Number(resource.durationMs || 0),
        renderBlocking: isRenderBlockingResource(resource, row.scripts || [])
      };
      resources.push(item);
      const current = plugins.get(plugin) || { name: plugin, resources: 0, transferBytes: 0, slowResources: 0 };
      current.resources += 1;
      current.transferBytes += item.sizeBytes;
      if (item.durationMs >= 1000) current.slowResources += 1;
      plugins.set(plugin, current);
    }
  }
  return {
    resources: resources.slice(0, 50),
    plugins: [...plugins.values()].sort((a, b) => b.resources - a.resources || b.transferBytes - a.transferBytes)
  };
}

function wordpressPluginName(url = "") {
  const match = String(url || "").match(/\/wp-content\/plugins\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).replace(/[-_]+/g, " ") : "";
}

function isRenderBlockingResource(resource = {}, scripts = []) {
  if (resource.renderBlockingStatus === "blocking") return true;
  if (resource.renderBlockingStatus === "non-blocking") return false;
  if (resource.type === "stylesheet") return true;
  if (resource.type !== "script") return false;
  const tag = scripts.find((script) => script && typeof script === "object" && script.src === resource.url);
  if (!tag) return false;
  return !tag.async && !tag.defer && String(tag.type || "").toLowerCase() !== "module";
}

function isProductLikePage(row = {}) {
  if (hasSchema(row, "Product")) return true;
  if (PRODUCT_PATH_PATTERNS.some((pattern) => pattern.test(row.url || ""))) return true;
  const text = `${row.title} ${row.bodyText}`.toLowerCase();
  return /\b(add to cart|buy now|sku|sale price|regular price|out of stock|sold out)\b/.test(text);
}

function isCategoryLikePage(row = {}) {
  if (CATEGORY_PATH_PATTERNS.some((pattern) => pattern.test(row.url || ""))) return true;
  const text = `${row.title} ${row.bodyText}`.toLowerCase();
  return /\b(filter by|sort by|products|collection|category)\b/.test(text);
}

function productSchemaCheck(productPages = []) {
  const missing = productPages.filter((row) => !hasSchema(row, "Product"));
  return {
    status: productPages.length ? (missing.length ? "needs_repair" : "passed") : "not_applicable",
    pagesChecked: productPages.length,
    pagesWithSchema: productPages.length - missing.length,
    missingPages: missing.map(pageSummary).slice(0, 10)
  };
}

function breadcrumbSchemaCheck(productPages = [], categoryPages = []) {
  const pages = uniqueRows([...productPages, ...categoryPages]);
  const missing = pages.filter((row) => !hasSchema(row, "BreadcrumbList"));
  return {
    status: pages.length ? (missing.length ? "needs_review" : "passed") : "not_applicable",
    pagesChecked: pages.length,
    pagesWithSchema: pages.length - missing.length,
    missingPages: missing.map(pageSummary).slice(0, 10)
  };
}

function facetedNavigationCheck(evidenceRows = []) {
  const links = [];
  for (const row of evidenceRows) {
    for (const link of row.links || []) {
      const href = link.href || "";
      if (!isFacetedUrl(href)) continue;
      links.push({
        pageUrl: row.pageUrl,
        pageLabel: row.label,
        href,
        text: cleanText(link.text || "", 80)
      });
    }
  }
  return {
    status: links.length ? "needs_review" : "passed",
    links: dedupeBy(links, (link) => link.href).slice(0, 20)
  };
}

function categoryContentCheck(categoryPages = []) {
  const thin = categoryPages.filter((row) => row.wordCount > 0 && row.wordCount < 120);
  return {
    status: thin.length ? "needs_review" : "passed",
    thinPages: thin.map(pageSummary).slice(0, 10)
  };
}

function outOfStockCheck(productPages = []) {
  const pages = productPages.filter((row) => /\b(out of stock|sold out|unavailable)\b/i.test(row.bodyText || ""));
  return {
    status: pages.length ? "needs_review" : "passed",
    pages: pages.map(pageSummary).slice(0, 10)
  };
}

function wordpressArchiveCheck(evidenceRows = []) {
  const links = [];
  for (const row of evidenceRows) {
    for (const link of row.links || []) {
      const href = link.href || "";
      if (!WORDPRESS_ARCHIVE_PATTERNS.some((pattern) => pattern.test(href))) continue;
      links.push({
        pageUrl: row.pageUrl,
        pageLabel: row.label,
        href,
        text: cleanText(link.text || "", 80)
      });
    }
  }
  return {
    status: links.length ? "needs_review" : "passed",
    links: dedupeBy(links, (link) => link.href).slice(0, 20)
  };
}

function wordpressPluginCheck(pluginResources) {
  const blockingUrls = new Set(
    pluginResources.resources
      .filter((resource) => resource.renderBlocking)
      .map((resource) => resource.url)
  );
  const pluginCount = pluginResources.plugins.length;
  const resourceCount = pluginResources.resources.length;
  return {
    status: pluginCount >= 5 || resourceCount >= 10 || blockingUrls.size >= 4 ? "needs_review" : "passed",
    pluginCount,
    resourceCount,
    blockingResources: pluginResources.resources.filter((resource) => blockingUrls.has(resource.url)).slice(0, 10),
    plugins: pluginResources.plugins.slice(0, 10)
  };
}

function wordpressSeoPluginCheck(wordpressDetected, seoPlugins, evidenceRows = []) {
  if (!wordpressDetected) return { status: "not_applicable", plugins: [] };
  const hasCoreSeoTags = evidenceRows.some((row) => row.canonical && row.description);
  return {
    status: seoPlugins.length || hasCoreSeoTags ? "passed" : "needs_review",
    plugins: seoPlugins,
    hasCoreSeoTags
  };
}

function platformRepairOpportunities({ checks, wordpressDetected, ecommerceDetected }) {
  const items = [];
  const add = (item) => {
    items.push({
      priority: items.length + 1,
      confidence: item.confidence || "needs-review",
      estimatedEffort: item.estimatedEffort || "30-90 min",
      workType: item.workType || "technical",
      acceptance: item.acceptance || "Rerun the audit and confirm this platform-specific proof no longer appears.",
      ...item
    });
  };

  if (ecommerceDetected && checks.productSchema.status === "needs_repair") {
    add({
      severity: "warning",
      title: "Ecommerce product pages are missing Product schema",
      proof: `${checks.productSchema.missingPages.length} product-like page${checks.productSchema.missingPages.length === 1 ? "" : "s"} lacked rendered Product schema, including ${checks.productSchema.missingPages[0]?.url || "a product page"}.`,
      fix: "Add truthful Product schema with name, image, price, availability, and offer data that matches the visible product page.",
      workType: "code",
      acceptance: "Rendered product pages include valid Product JSON-LD matching visible price and availability."
    });
  }

  if (ecommerceDetected && checks.breadcrumbSchema.status === "needs_review") {
    add({
      severity: "notice",
      title: "Ecommerce pages lack BreadcrumbList schema",
      proof: `${checks.breadcrumbSchema.missingPages.length} product or category page${checks.breadcrumbSchema.missingPages.length === 1 ? "" : "s"} lacked rendered BreadcrumbList schema.`,
      fix: "Add visible breadcrumbs and BreadcrumbList schema that matches the page hierarchy.",
      workType: "code"
    });
  }

  if (ecommerceDetected && checks.facetedNavigation.links.length) {
    add({
      severity: "warning",
      title: "Faceted or variant URLs are crawlable",
      proof: `${checks.facetedNavigation.links.length} filter, sort, pagination, or variant URL${checks.facetedNavigation.links.length === 1 ? "" : "s"} appeared in rendered links, including ${checks.facetedNavigation.links[0].href}.`,
      fix: "Decide which filtered URLs deserve indexation, canonical duplicate combinations to the clean category/product URL, and block or noindex crawl-waste parameters.",
      estimatedEffort: "1-3 hours"
    });
  }

  if (ecommerceDetected && checks.categoryContent.thinPages.length) {
    add({
      severity: "notice",
      title: "Thin ecommerce category content",
      proof: `${checks.categoryContent.thinPages.length} category-like page${checks.categoryContent.thinPages.length === 1 ? "" : "s"} had very little rendered text.`,
      fix: "Add useful category copy, buying guidance, FAQs, and internal links that help users choose products.",
      workType: "content"
    });
  }

  if (ecommerceDetected && checks.outOfStock.pages.length) {
    add({
      severity: "notice",
      title: "Out-of-stock product handling needs review",
      proof: `${checks.outOfStock.pages.length} product-like page${checks.outOfStock.pages.length === 1 ? "" : "s"} contained sold-out or unavailable language.`,
      fix: "For temporary stockouts, keep the URL indexable and show alternatives. For discontinued products, redirect or canonicalize to the best replacement.",
      workType: "review"
    });
  }

  if (wordpressDetected && checks.wordpressArchives.links.length) {
    add({
      severity: "notice",
      title: "WordPress archive URLs are crawlable",
      proof: `${checks.wordpressArchives.links.length} category, tag, author, or date archive URL${checks.wordpressArchives.links.length === 1 ? "" : "s"} appeared in rendered links, including ${checks.wordpressArchives.links[0].href}.`,
      fix: "Noindex thin archives, add unique archive copy where they should rank, and keep important categories linked from navigation.",
      estimatedEffort: "30-90 min"
    });
  }

  if (wordpressDetected && checks.wordpressPlugins.status === "needs_review") {
    add({
      severity: "warning",
      title: "WordPress plugin resources may be slowing the page",
      proof: `${checks.wordpressPlugins.resourceCount} plugin resource${checks.wordpressPlugins.resourceCount === 1 ? "" : "s"} from ${checks.wordpressPlugins.pluginCount} plugin${checks.wordpressPlugins.pluginCount === 1 ? "" : "s"} loaded in the rendered browser.`,
      fix: "Disable unused plugins, conditionally load plugin assets only where needed, and defer non-critical plugin scripts.",
      estimatedEffort: "1-3 hours"
    });
  }

  if (wordpressDetected && checks.wordpressSeoPlugin.status === "needs_review") {
    add({
      severity: "notice",
      title: "WordPress SEO plugin configuration was not proven",
      proof: "The rendered page showed WordPress signals but no known SEO plugin signal and no complete canonical plus meta description pair.",
      fix: "Configure Yoast, Rank Math, AIOSEO, or equivalent template output for canonical URLs, meta descriptions, robots rules, and sitemaps.",
      workType: "review"
    });
  }

  return items;
}

function isFacetedUrl(value = "") {
  try {
    const url = new URL(value);
    if (!url.search) return false;
    for (const key of url.searchParams.keys()) {
      if (FACET_PARAM_NAMES.has(key.toLowerCase())) return true;
      if (/^(filter|attribute|pa_|utm_)/i.test(key)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function hasSchema(row, type) {
  const expected = String(type || "").toLowerCase();
  return (row.schemaTypes || []).some((item) => String(item || "").toLowerCase() === expected);
}

function pageSummary(row = {}) {
  return {
    url: row.pageUrl || row.url || "",
    label: row.label || pathLabel(row.pageUrl || row.url || ""),
    title: row.title || "",
    wordCount: row.wordCount || 0
  };
}

function uniqueRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.pageUrl || row.url || "";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeBy(items = [], keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function percent(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  if (!bottom) return 0;
  return Math.round((top / bottom) * 100);
}

function cleanEvidence(value = "") {
  return cleanText(String(value || "").replace(/\s+/g, " "), 180);
}

function cleanText(value = "", maxLength = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function pathLabel(value = "") {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? "home" : url.pathname;
  } catch {
    return value || "page";
  }
}
