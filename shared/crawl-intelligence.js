const MAX_CONTENT_PAIR_CHECKS = 250;
const DUPLICATE_CONTENT_THRESHOLD = 0.82;
const DEEP_PAGE_THRESHOLD = 3;
const LOW_INBOUND_THRESHOLD = 1;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "best",
  "by",
  "for",
  "from",
  "home",
  "in",
  "is",
  "near",
  "of",
  "on",
  "or",
  "our",
  "page",
  "services",
  "the",
  "to",
  "with",
  "your"
]);

const PARAMETER_RISK_NAMES = new Set([
  "filter",
  "sort",
  "orderby",
  "page",
  "paged",
  "variant",
  "color",
  "size",
  "brand",
  "min_price",
  "max_price",
  "q",
  "s",
  "search"
]);

export function buildCrawlIntelligence(report = {}, crawlInventory = {}) {
  const pages = (report.pages || []).map((page) => pageRow(page, report.url || report.origin || ""));
  if (!pages.length) {
    return {
      status: "skipped",
      source: "rendered-crawl-graph",
      summary: { crawledPages: 0 },
      repairOpportunities: []
    };
  }

  const graph = buildGraph(pages, report.url || pages[0]?.url || "");
  const duplicateTitles = duplicateGroups(pages, "title");
  const duplicateDescriptions = duplicateGroups(pages, "description");
  const duplicateH1s = duplicateGroups(pages, "h1");
  const duplicateContentPairs = contentSimilarityPairs(pages);
  const cannibalizationGroups = keywordCannibalizationGroups(pages);
  const parameterizedLinks = parameterLinks(pages);
  const orphanInventoryCandidates = inventoryOrphanCandidates(crawlInventory, graph);
  const lowInboundPages = pages
    .filter((page, index) => index > 0 && (graph.inboundCount.get(page.key) || 0) <= LOW_INBOUND_THRESHOLD)
    .map((page) => ({
      url: page.url,
      label: page.label,
      inboundLinks: graph.inboundCount.get(page.key) || 0,
      depth: graph.depth.get(page.key) ?? null
    }))
    .slice(0, 20);
  const deepPages = pages
    .filter((page) => (graph.depth.get(page.key) || 0) > DEEP_PAGE_THRESHOLD)
    .map((page) => ({
      url: page.url,
      label: page.label,
      depth: graph.depth.get(page.key)
    }))
    .slice(0, 20);

  const checks = {
    linkGraph: {
      nodes: pages.map((page) => ({
        url: page.url,
        label: page.label,
        depth: graph.depth.get(page.key) ?? null,
        inboundLinks: graph.inboundCount.get(page.key) || 0,
        outboundInternalLinks: graph.outboundCount.get(page.key) || 0
      })),
      edges: graph.edges.slice(0, 200)
    },
    orphanInventoryCandidates,
    lowInboundPages,
    deepPages,
    duplicateTitles,
    duplicateDescriptions,
    duplicateH1s,
    duplicateContentPairs,
    cannibalizationGroups,
    parameterizedLinks
  };
  const repairOpportunities = crawlIntelligenceRepairs(checks, crawlInventory);
  const summary = {
    crawledPages: pages.length,
    linkedEdges: graph.edges.length,
    maxDepth: maxNumber([...graph.depth.values()]),
    averageInboundLinks: average([...graph.inboundCount.values()]),
    orphanInventoryCandidates: orphanInventoryCandidates.length,
    lowInboundPages: lowInboundPages.length,
    deepPages: deepPages.length,
    duplicateTitleGroups: duplicateTitles.length,
    duplicateDescriptionGroups: duplicateDescriptions.length,
    duplicateH1Groups: duplicateH1s.length,
    duplicateContentPairs: duplicateContentPairs.length,
    cannibalizationGroups: cannibalizationGroups.length,
    parameterizedLinks: parameterizedLinks.length,
    repairOpportunityCount: repairOpportunities.length
  };

  return {
    status: "ready",
    source: "rendered-crawl-graph",
    note: "Crawl intelligence uses rendered internal links, sitemap inventory samples, and crawled page content. Keyword cannibalization is a proof heuristic, not rank-tracking data.",
    summary,
    checks,
    repairOpportunities
  };
}

export function crawlIntelligenceBriefLines(audit = {}) {
  if (audit.status !== "ready") return [];
  const summary = audit.summary || {};
  const lines = [
    "## Crawl intelligence audit",
    "",
    `Rendered crawl pages: ${summary.crawledPages || 0}`,
    `Rendered internal link edges: ${summary.linkedEdges || 0}`,
    `Maximum rendered crawl depth: ${summary.maxDepth || 0}`,
    `Sitemap orphan candidates: ${summary.orphanInventoryCandidates || 0}`,
    `Duplicate title groups: ${summary.duplicateTitleGroups || 0}`,
    `Duplicate content pairs: ${summary.duplicateContentPairs || 0}`,
    `Keyword cannibalization groups: ${summary.cannibalizationGroups || 0}`,
    `Parameterized internal links: ${summary.parameterizedLinks || 0}`,
    ""
  ];

  if (audit.repairOpportunities?.length) {
    lines.push("### Crawl-intelligence repair actions", "");
    for (const item of audit.repairOpportunities.slice(0, 8)) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
    }
    lines.push("");
  } else {
    lines.push("No crawl-intelligence repair actions were created from this crawl.", "");
  }

  return lines;
}

export function crawlIntelligenceSummaryCopy(audit = {}) {
  if (audit.status !== "ready") return "Rendered crawl intelligence was not available.";
  const summary = audit.summary || {};
  return `Rendered crawl graph found ${summary.linkedEdges || 0} internal link edges across ${summary.crawledPages || 0} pages, with ${summary.orphanInventoryCandidates || 0} sitemap orphan candidates, ${summary.duplicateContentPairs || 0} duplicate-content pairs, and ${summary.cannibalizationGroups || 0} cannibalization groups.`;
}

function pageRow(page = {}, startUrl = "") {
  const rendered = page.rendered || {};
  const fallback = page.static || {};
  const url = rendered.finalUrl || page.finalUrl || page.url || "";
  const title = cleanText(rendered.title || fallback.title || "", 180);
  const h1 = cleanText(rendered.h1s?.[0] || fallback.h1s?.[0] || "", 180);
  const description = cleanText(rendered.description || fallback.description || "", 260);
  const bodyText = cleanText(rendered.bodyText || fallback.bodyText || "", 6000);
  const links = (rendered.internalLinks || fallback.internalLinks || [])
    .map((link) => ({
      href: normalizeUrl(link.href || "", startUrl || url),
      text: cleanText(link.text || "", 120)
    }))
    .filter((link) => link.href);
  return {
    url,
    key: canonicalKey(url),
    label: pathLabel(url),
    title,
    h1,
    description,
    canonical: rendered.canonical || fallback.canonical || "",
    robots: rendered.robots || fallback.robots || "",
    wordCount: Number(rendered.wordCount || fallback.wordCount || 0),
    bodyText,
    fingerprint: contentFingerprint(bodyText),
    primaryKeyword: primaryKeyword(title || h1 || pathLabel(url)),
    links
  };
}

function buildGraph(pages = [], startUrl = "") {
  const pageKeys = new Set(pages.map((page) => page.key));
  const startKey = canonicalKey(startUrl || pages[0]?.url || "");
  const inboundCount = new Map(pages.map((page) => [page.key, 0]));
  const outboundCount = new Map(pages.map((page) => [page.key, 0]));
  const adjacency = new Map(pages.map((page) => [page.key, []]));
  const edges = [];

  for (const page of pages) {
    for (const link of page.links) {
      const targetKey = canonicalKey(link.href);
      if (!pageKeys.has(targetKey)) continue;
      if (targetKey === page.key) continue;
      edges.push({
        from: page.url,
        to: link.href,
        text: link.text
      });
      adjacency.get(page.key).push(targetKey);
      inboundCount.set(targetKey, (inboundCount.get(targetKey) || 0) + 1);
      outboundCount.set(page.key, (outboundCount.get(page.key) || 0) + 1);
    }
  }

  const depth = new Map();
  const queue = [{ key: pageKeys.has(startKey) ? startKey : pages[0]?.key, depth: 0 }].filter((item) => item.key);
  while (queue.length) {
    const current = queue.shift();
    if (depth.has(current.key)) continue;
    depth.set(current.key, current.depth);
    for (const nextKey of adjacency.get(current.key) || []) {
      if (!depth.has(nextKey)) queue.push({ key: nextKey, depth: current.depth + 1 });
    }
  }

  return { edges, inboundCount, outboundCount, adjacency, depth };
}

function duplicateGroups(pages = [], field = "") {
  const groups = new Map();
  for (const page of pages) {
    const raw = page[field] || "";
    const key = normalizeText(raw);
    if (!key || key.length < 12) continue;
    const current = groups.get(key) || { value: raw, pages: [] };
    current.pages.push(pageSummary(page));
    groups.set(key, current);
  }
  return [...groups.values()]
    .filter((group) => group.pages.length > 1)
    .sort((a, b) => b.pages.length - a.pages.length)
    .slice(0, 10);
}

function contentSimilarityPairs(pages = []) {
  const candidates = pages
    .filter((page) => page.fingerprint.tokens.length >= 40)
    .slice(0, MAX_CONTENT_PAIR_CHECKS);
  const pairs = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const similarity = jaccard(left.fingerprint.tokenSet, right.fingerprint.tokenSet);
      if (similarity < DUPLICATE_CONTENT_THRESHOLD) continue;
      pairs.push({
        similarityPercent: Math.round(similarity * 100),
        left: pageSummary(left),
        right: pageSummary(right)
      });
    }
  }
  return pairs
    .sort((a, b) => b.similarityPercent - a.similarityPercent)
    .slice(0, 10);
}

function keywordCannibalizationGroups(pages = []) {
  const groups = new Map();
  for (const page of pages) {
    const keyword = page.primaryKeyword;
    if (!keyword || keyword.split(" ").length < 2) continue;
    const current = groups.get(keyword) || { keyword, pages: [] };
    current.pages.push(pageSummary(page));
    groups.set(keyword, current);
  }
  return [...groups.values()]
    .filter((group) => group.pages.length > 1)
    .sort((a, b) => b.pages.length - a.pages.length)
    .slice(0, 10);
}

function parameterLinks(pages = []) {
  const links = [];
  for (const page of pages) {
    for (const link of page.links) {
      if (!parameterRisk(link.href)) continue;
      links.push({
        pageUrl: page.url,
        pageLabel: page.label,
        href: link.href,
        text: link.text
      });
    }
  }
  return dedupeBy(links, (link) => link.href).slice(0, 30);
}

function inventoryOrphanCandidates(crawlInventory = {}, graph = {}) {
  if (!["ready", "empty"].includes(crawlInventory.status)) return [];
  const linkedTargets = new Set((graph.edges || []).map((edge) => canonicalKey(edge.to)));
  const crawlNodes = new Set([...(graph.inboundCount?.keys?.() || [])]);
  return (crawlInventory.sampleUrls || [])
    .map((item) => ({
      url: item.url || "",
      label: pathLabel(item.url || ""),
      lastmod: item.lastmod || ""
    }))
    .filter((item) => item.url && !linkedTargets.has(canonicalKey(item.url)) && !crawlNodes.has(canonicalKey(item.url)))
    .slice(0, 20);
}

function crawlIntelligenceRepairs(checks = {}, crawlInventory = {}) {
  const items = [];
  const add = (item) => {
    items.push({
      priority: items.length + 1,
      confidence: item.confidence || "needs-review",
      estimatedEffort: item.estimatedEffort || "30-90 min",
      workType: item.workType || "technical",
      acceptance: item.acceptance || "Rerun the audit and confirm this crawl-intelligence proof no longer appears.",
      ...item
    });
  };

  if (checks.orphanInventoryCandidates?.length) {
    add({
      severity: "warning",
      title: "Sitemap URLs are not linked in the rendered crawl sample",
      proof: `${checks.orphanInventoryCandidates.length} sitemap URL${checks.orphanInventoryCandidates.length === 1 ? "" : "s"} from the inventory sample did not appear in rendered internal links, including ${checks.orphanInventoryCandidates[0].url}.`,
      fix: "Add crawlable internal links to important sitemap URLs, or remove low-value orphan URLs from the sitemap.",
      estimatedEffort: "30-90 min",
      acceptance: "Important sitemap URLs appear in rendered internal links from relevant hub pages."
    });
  } else if ((crawlInventory.summary?.uncrawledInventoryUrls || 0) > 0) {
    add({
      severity: "notice",
      title: "Sitemap inventory exceeds rendered proof depth",
      proof: `${crawlInventory.summary.uncrawledInventoryUrls} sitemap URL${crawlInventory.summary.uncrawledInventoryUrls === 1 ? "" : "s"} were discovered beyond the selected rendered crawl depth.`,
      fix: "Increase crawl depth for this host or prioritize the highest-value sitemap sections for rendered proof.",
      confidence: "needs-review",
      estimatedEffort: "5-15 min"
    });
  }

  if (checks.deepPages?.length) {
    add({
      severity: "notice",
      title: "Important pages are too deep in the rendered link graph",
      proof: `${checks.deepPages.length} crawled page${checks.deepPages.length === 1 ? "" : "s"} appeared deeper than ${DEEP_PAGE_THRESHOLD} clicks, including ${checks.deepPages[0].label} at depth ${checks.deepPages[0].depth}.`,
      fix: "Add links from relevant hub, category, footer, or navigation pages so important URLs are reachable within three clicks."
    });
  }

  if (checks.duplicateTitles?.length) {
    add({
      severity: "warning",
      title: "Duplicate title tags across crawled pages",
      proof: `${checks.duplicateTitles.length} duplicate title group${checks.duplicateTitles.length === 1 ? "" : "s"} found, including "${checks.duplicateTitles[0].value}" on ${checks.duplicateTitles[0].pages.length} pages.`,
      fix: "Rewrite each duplicated title so it reflects the page's unique intent and target query.",
      workType: "content",
      acceptance: "Each crawled indexable page has a unique rendered title."
    });
  }

  if (checks.duplicateDescriptions?.length) {
    add({
      severity: "notice",
      title: "Duplicate meta descriptions across crawled pages",
      proof: `${checks.duplicateDescriptions.length} duplicate description group${checks.duplicateDescriptions.length === 1 ? "" : "s"} found.`,
      fix: "Write unique descriptions for pages that should rank, or noindex/consolidate pages that are duplicates.",
      workType: "content"
    });
  }

  if (checks.duplicateContentPairs?.length) {
    add({
      severity: "warning",
      title: "Near-duplicate rendered content",
      proof: `${checks.duplicateContentPairs.length} near-duplicate page pair${checks.duplicateContentPairs.length === 1 ? "" : "s"} found, led by ${checks.duplicateContentPairs[0].left.label} and ${checks.duplicateContentPairs[0].right.label} at ${checks.duplicateContentPairs[0].similarityPercent}% similarity.`,
      fix: "Consolidate duplicates with canonicals or redirects, or rewrite the pages so each has distinct intent and useful content.",
      workType: "content",
      estimatedEffort: "1-3 hours"
    });
  }

  if (checks.cannibalizationGroups?.length) {
    add({
      severity: "notice",
      title: "Keyword cannibalization candidates",
      proof: `${checks.cannibalizationGroups.length} query-intent group${checks.cannibalizationGroups.length === 1 ? "" : "s"} had multiple crawled pages, including "${checks.cannibalizationGroups[0].keyword}" across ${checks.cannibalizationGroups[0].pages.length} pages.`,
      fix: "Pick one primary page for each query intent, merge overlapping pages, and use internal links from secondary pages to reinforce the primary page.",
      confidence: "needs-review",
      workType: "content"
    });
  }

  if (checks.parameterizedLinks?.length) {
    add({
      severity: "notice",
      title: "Parameterized internal URLs may waste crawl budget",
      proof: `${checks.parameterizedLinks.length} rendered internal URL${checks.parameterizedLinks.length === 1 ? "" : "s"} used filter, sort, search, pagination, or variant parameters, including ${checks.parameterizedLinks[0].href}.`,
      fix: "Canonical duplicate parameter URLs, noindex low-value variants, and link to clean canonical URLs where possible."
    });
  }

  if (checks.lowInboundPages?.length) {
    add({
      severity: "notice",
      title: "Low-inbound pages need stronger internal links",
      proof: `${checks.lowInboundPages.length} crawled page${checks.lowInboundPages.length === 1 ? "" : "s"} had ${LOW_INBOUND_THRESHOLD} or fewer rendered inbound links.`,
      fix: "Link important pages from relevant hubs, navigation, related-content blocks, or conversion paths.",
      confidence: "needs-review"
    });
  }

  return items;
}

function contentFingerprint(text = "") {
  const tokens = normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .slice(0, 600);
  return {
    tokens,
    tokenSet: new Set(tokens)
  };
}

function primaryKeyword(value = "") {
  const tokens = normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .slice(0, 4);
  if (tokens.length < 2) return "";
  return tokens.slice(0, Math.min(tokens.length, 3)).join(" ");
}

function parameterRisk(value = "") {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      const normalized = key.toLowerCase();
      if (PARAMETER_RISK_NAMES.has(normalized)) return true;
      if (/^(filter|utm_|ref|session|sid|attribute|pa_)/i.test(normalized)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function pageSummary(page = {}) {
  return {
    url: page.url || "",
    label: page.label || pathLabel(page.url || ""),
    title: page.title || "",
    h1: page.h1 || "",
    wordCount: page.wordCount || 0
  };
}

function normalizeUrl(value = "", base = "") {
  try {
    const url = new URL(value, base || undefined);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function canonicalKey(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.href;
  } catch {
    return String(value || "").replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

function pathLabel(value = "") {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? "home" : url.pathname;
  } catch {
    return value || "page";
  }
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value = "", maxLength = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function jaccard(left = new Set(), right = new Set()) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / (left.size + right.size - overlap);
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

function maxNumber(values = []) {
  return values.reduce((max, value) => Math.max(max, Number(value) || 0), 0);
}

function average(values = []) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value));
  if (!numbers.length) return 0;
  return Math.round((numbers.reduce((total, value) => total + value, 0) / numbers.length) * 10) / 10;
}
