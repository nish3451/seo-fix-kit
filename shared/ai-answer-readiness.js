const HELPFUL_SCHEMA_TYPES = new Set([
  "article",
  "blogposting",
  "breadcrumblist",
  "faqpage",
  "howto",
  "localbusiness",
  "organization",
  "product",
  "service",
  "softwareapplication"
]);

const QUESTION_PATTERNS = [
  /\?$/,
  /\bfaq\b/i,
  /\bfrequently asked\b/i,
  /\bhow (do|does|to|much|many)\b/i,
  /\bwhat (is|are|does|do)\b/i,
  /\bwhy (does|do|is|are)\b/i,
  /\bwhen (should|do|does|is)\b/i
];

export function buildAiAnswerReadiness(report = {}, options = {}) {
  const pages = pageEvidenceRows(report.pages || []);
  if (!pages.length) {
    return {
      status: "skipped",
      source: "ai-answer-readiness-proof",
      note: "AI Answer Readiness needs rendered page proof. It does not sample AI engines or monitor citations.",
      summary: { pagesChecked: 0, repairOpportunityCount: 0 },
      checks: {},
      findings: [],
      repairOpportunities: []
    };
  }

  const llmsTxt = normalizeDiscoveryFile(options.llmsTxt || report.llmsTxt || report.llms_txt);
  const trafficIndex = buildTrafficIndex(
    options.keywordRows ||
      options.keywordRankRows ||
      report.keywordRankAudit?.rows ||
      report.keyword_rank_audit?.rows ||
      []
  );
  const checks = {
    contentDepth: contentDepthCheck(pages),
    structuredData: structuredDataCheck(pages),
    sourceClarity: sourceClarityCheck(pages),
    answerStructure: answerStructureCheck(pages),
    discoveryFiles: discoveryFilesCheck(report.crawlInventory || report.crawl_inventory, llmsTxt)
  };
  const repairOpportunities = aiReadinessRepairOpportunities(checks, trafficIndex);
  const findings = repairOpportunities.map(repairToFinding);
  const summary = aiReadinessSummary(pages, checks, repairOpportunities, trafficIndex);

  return {
    status: "ready",
    source: "ai-answer-readiness-proof",
    note: "AI Answer Readiness is derived from rendered page, sitemap, schema, canonical, link, and optional llms.txt proof. It does not sample AI engines, monitor citations, or claim AI visibility.",
    summary,
    checks,
    findings,
    repairOpportunities
  };
}

export function aiAnswerReadinessBriefLines(audit = {}) {
  if (audit.status !== "ready") return [];
  const summary = audit.summary || {};
  const lines = [
    "## AI Answer Readiness",
    "",
    "This section uses site proof only. It does not sample answer engines or monitor AI citations.",
    `Readiness score: ${summary.readinessScore ?? 0}/100`,
    `Pages checked: ${summary.pagesChecked || 0}`,
    `Pages with helpful schema: ${summary.pagesWithHelpfulSchema || 0}`,
    `Pages with question-led structure: ${summary.pagesWithQuestionStructure || 0}`,
    `Optional llms.txt: ${summary.llmsTxtStatus || "unknown"}`,
    summary.trafficRanked
      ? `Prioritization: imported Search Console traffic (${summary.trafficRowsUsed || 0} rows). Faults with more clicks and impressions on the affected pages come first.`
      : "Prioritization: proof order. Import Search Console rows to rank faults by the traffic behind them.",
    ""
  ];

  if (audit.repairOpportunities?.length) {
    lines.push("### AI Answer Readiness repair actions", "");
    for (const item of audit.repairOpportunities.slice(0, 8)) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
    }
    lines.push("");
  } else {
    lines.push("No AI Answer Readiness repair actions were created from this proof pass.", "");
  }

  return lines;
}

export function aiAnswerReadinessSummaryCopy(audit = {}) {
  if (audit.status !== "ready") return "";
  const summary = audit.summary || {};
  const repairCount = summary.repairOpportunityCount || audit.repairOpportunities?.length || 0;
  const trafficNote = summary.trafficRanked
    ? " Faults are ranked by imported Search Console clicks and impressions on the affected pages."
    : " Faults stay in proof order until Search Console rows are imported.";
  if (!repairCount) {
    return `The rendered pages show enough extractable content, canonical clarity, helpful structure, and optional discovery context for this proof pass. This is not an AI visibility score.${trafficNote}`;
  }
  return `${repairCount} proof-derived readiness ${repairCount === 1 ? "repair" : "repairs"} found across ${summary.pagesChecked || 0} rendered ${summary.pagesChecked === 1 ? "page" : "pages"}. This is not live answer-engine sampling or citation monitoring.${trafficNote}`;
}

function pageEvidenceRows(pages = []) {
  return pages.map((page) => {
    const rendered = page.rendered || {};
    const staticFacts = page.static || {};
    const url = rendered.finalUrl || page.finalUrl || page.url || "";
    const headings = rendered.headings || staticFacts.headings || [];
    const internalLinks = rendered.internalLinks || staticFacts.internalLinks || [];
    const schemaTypes = normalizeSchemaTypes(rendered.schemaTypes || staticFacts.schemaTypes || []);
    const status = Number(page.status ?? rendered.status ?? staticFacts.status ?? 0);
    const ok = page.ok !== false && rendered.ok !== false && staticFacts.ok !== false;
    return {
      url,
      pageUrl: page.url || url,
      pageLabel: safePathLabel(page.url || url),
      ok,
      status,
      title: cleanText(rendered.title || staticFacts.title || "", 180),
      description: cleanText(rendered.description || staticFacts.description || "", 220),
      h1s: rendered.h1s || staticFacts.h1s || [],
      headings,
      bodyText: cleanText(rendered.bodyText || staticFacts.bodyText || rendered.bodySample || staticFacts.bodySample || "", 4000),
      wordCount: Number(rendered.wordCount || staticFacts.wordCount || 0),
      staticWordCount: Number(staticFacts.wordCount || 0),
      canonical: rendered.canonical || staticFacts.canonical || "",
      robots: rendered.robots || staticFacts.robots || "",
      internalLinks,
      schemaTypes
    };
  });
}

function contentDepthCheck(pages = []) {
  const indexablePages = pages.filter(isIndexable);
  const lowContentPages = indexablePages
    .filter((page) => page.wordCount < 250)
    .map(pageSummary)
    .slice(0, 10);
  const appShellPages = indexablePages
    .filter((page) => page.staticWordCount < 80 && page.wordCount < 160)
    .map(pageSummary)
    .slice(0, 10);

  return {
    status: lowContentPages.length ? "needs_repair" : "passed",
    pagesChecked: pages.length,
    lowContentPages,
    appShellPages,
    pagesWithEnoughText: indexablePages.filter((page) => page.wordCount >= 250).length
  };
}

function structuredDataCheck(pages = []) {
  const indexablePages = pages.filter(isIndexable);
  const pagesWithHelpfulSchema = indexablePages.filter(hasHelpfulSchema);
  const missingPages = indexablePages
    .filter((page) => !hasHelpfulSchema(page))
    .map(pageSummary)
    .slice(0, 10);

  return {
    status: !indexablePages.length || pagesWithHelpfulSchema.length ? "passed" : "needs_review",
    pagesWithHelpfulSchema: pagesWithHelpfulSchema.length,
    missingPages,
    helpfulTypes: [...new Set(indexablePages.flatMap((page) => page.schemaTypes).filter((type) => HELPFUL_SCHEMA_TYPES.has(type)))].sort()
  };
}

function sourceClarityCheck(pages = []) {
  const indexablePages = pages.filter(isIndexable);
  const missingCanonicalPages = indexablePages
    .filter((page) => !page.canonical)
    .map(pageSummary)
    .slice(0, 10);
  const isolatedPages = indexablePages
    .filter((page) => page.internalLinks.length === 0)
    .map(pageSummary)
    .slice(0, 10);

  return {
    status: missingCanonicalPages.length || isolatedPages.length ? "needs_repair" : "passed",
    missingCanonicalPages,
    isolatedPages,
    pagesWithCanonical: indexablePages.filter((page) => Boolean(page.canonical)).length,
    pagesWithInternalLinks: indexablePages.filter((page) => page.internalLinks.length > 0).length
  };
}

function answerStructureCheck(pages = []) {
  const indexablePages = pages.filter(isIndexable);
  const pagesWithQuestionStructure = indexablePages.filter(hasQuestionStructure);
  const sectionedPages = indexablePages.filter((page) => (page.headings || []).length >= 3);
  const missingPages = indexablePages
    .filter((page) => !hasQuestionStructure(page) && page.wordCount >= 250)
    .map(pageSummary)
    .slice(0, 10);

  return {
    status: !indexablePages.length || pagesWithQuestionStructure.length || sectionedPages.length ? "passed" : "needs_review",
    pagesWithQuestionStructure: pagesWithQuestionStructure.length,
    pagesWithSectionHeadings: sectionedPages.length,
    missingPages
  };
}

function discoveryFilesCheck(inventory = {}, llmsTxt = {}) {
  const summary = inventory?.summary || {};
  const sitemapReady = ["ready", "empty"].includes(inventory?.status) && Number(summary.sitemapsFetched || 0) > 0;
  const llmsOk = Boolean(llmsTxt.ok && (llmsTxt.contentLength > 0 || llmsTxt.bodySample));
  return {
    status: sitemapReady && llmsOk ? "passed" : "advisory",
    sitemapReady,
    sitemapsFetched: Number(summary.sitemapsFetched || 0),
    sitemapUrlsDiscovered: Number(summary.urlsDiscovered || 0),
    llmsTxt: {
      ok: llmsOk,
      status: llmsTxt.status || null,
      url: llmsTxt.url || "",
      contentLength: llmsTxt.contentLength || 0,
      error: llmsTxt.error || ""
    }
  };
}

function aiReadinessRepairOpportunities(checks = {}, trafficIndex = emptyTrafficIndex()) {
  const items = [];
  const add = (item) => {
    const affectedPages = sortPagesByTraffic(item.affectedPages || [], trafficIndex);
    const lead = affectedPages[0] || {};
    items.push({
      priority: items.length + 1,
      confidence: item.confidence || "needs-review",
      estimatedEffort: item.estimatedEffort || "30-90 min",
      workType: item.workType || "content",
      source: "ai-answer-readiness-proof",
      ...item,
      affectedPages,
      pageUrl: item.pageUrl || lead.url || "",
      pageLabel: item.pageLabel || lead.label || ""
    });
  };

  if (checks.contentDepth?.lowContentPages?.length) {
    const pages = checks.contentDepth.lowContentPages;
    const lead = sortPagesByTraffic(pages, trafficIndex)[0] || pages[0];
    add({
      issueId: "ai-answer-readiness-content-depth",
      severity: "warning",
      title: "AI Answer Readiness: rendered pages lack extractable detail",
      affectedPages: pages,
      pageUrl: lead.url,
      pageLabel: lead.label,
      proof: `${pages.length} rendered ${pages.length === 1 ? "page has" : "pages have"} fewer than 250 words, led by ${lead.label} with ${lead.wordCount} words.`,
      why: "Answer systems and search crawlers need visible, page-specific text they can parse, summarize, and cite. This is a readiness heuristic, not a ranking rule.",
      fix: "Add visible page-specific explanation, proof, examples, FAQs, comparisons, and next steps before relying on structured data or metadata alone.",
      acceptance: "Rerun the audit and confirm the page has at least 250 rendered words with visible, page-specific detail.",
      estimatedEffort: "45-120 min"
    });
  }

  if (checks.structuredData?.status === "needs_review") {
    const pages = checks.structuredData.missingPages || [];
    add({
      issueId: "ai-answer-readiness-structured-data",
      severity: "notice",
      title: "AI Answer Readiness: helpful structured data was not proven",
      affectedPages: pages,
      proof: "No rendered page exposed FAQPage, Article, Product, Service, Organization, LocalBusiness, SoftwareApplication, HowTo, or BreadcrumbList schema.",
      why: "Truthful schema can clarify page entities, relationships, products, services, and FAQs for search features and machine readers.",
      fix: "Add JSON-LD that matches visible content. Start with Organization/Service for service pages, Product for product pages, FAQPage for visible FAQs, and BreadcrumbList for hierarchical pages.",
      acceptance: "Rerun the audit and confirm rendered JSON-LD includes helpful schema types that match visible page content.",
      workType: "code"
    });
  }

  if (checks.sourceClarity?.status === "needs_repair") {
    const pages = uniquePages([
      ...(checks.sourceClarity.missingCanonicalPages || []),
      ...(checks.sourceClarity.isolatedPages || [])
    ]);
    add({
      issueId: "ai-answer-readiness-source-clarity",
      severity: (checks.sourceClarity.missingCanonicalPages || []).length ? "warning" : "notice",
      title: "AI Answer Readiness: preferred source pages are unclear",
      affectedPages: pages,
      proof: [
        checks.sourceClarity.missingCanonicalPages?.length
          ? `${checks.sourceClarity.missingCanonicalPages.length} page${checks.sourceClarity.missingCanonicalPages.length === 1 ? "" : "s"} lacked rendered canonical URLs.`
          : "",
        checks.sourceClarity.isolatedPages?.length
          ? `${checks.sourceClarity.isolatedPages.length} page${checks.sourceClarity.isolatedPages.length === 1 ? "" : "s"} had no rendered internal links.`
          : ""
      ].filter(Boolean).join(" "),
      why: "Canonical URLs and internal links help crawlers and answer systems identify the preferred source page and related context.",
      fix: "Add one canonical URL per indexable page and link important related pages with normal rendered anchor tags.",
      acceptance: "Rerun the audit and confirm every indexable readiness page has one rendered canonical URL and at least one rendered internal link.",
      workType: "technical"
    });
  }

  if (checks.answerStructure?.status === "needs_review") {
    add({
      issueId: "ai-answer-readiness-answer-structure",
      severity: "notice",
      title: "AI Answer Readiness: question-led sections are missing",
      affectedPages: checks.answerStructure.missingPages || [],
      proof: "The rendered crawl did not prove FAQ, HowTo, question-style headings, or enough section structure to expose direct answers.",
      why: "Question-led headings and clearly sectioned answers make it easier for users, search snippets, and machine readers to extract specific answers.",
      fix: "Add visible sections that answer common buyer questions, objections, pricing/fit questions, and use-case questions. Add FAQ schema only after the FAQ is visible.",
      acceptance: "Rerun the audit and confirm the rendered page includes visible question-led headings, FAQ/HowTo structure, or enough section headings to expose direct answers.",
      estimatedEffort: "30-90 min"
    });
  }

  if (checks.discoveryFiles?.llmsTxt && !checks.discoveryFiles.llmsTxt.ok) {
    add({
      issueId: "ai-answer-readiness-llms-txt",
      severity: "notice",
      title: "AI Answer Readiness: optional llms.txt is not reachable",
      affectedPages: [],
      proof: `GET /llms.txt returned ${checks.discoveryFiles.llmsTxt.status || checks.discoveryFiles.llmsTxt.error || "no usable text"}. This is advisory only; it is not a ranking, visibility, or citation failure.`,
      why: "An llms.txt file can give AI agents a concise public map of useful product pages and boundaries, but it is optional and not proof of AI visibility.",
      fix: "Publish a concise /llms.txt that links to current public docs, product pages, support, pricing/package pages, and explicit product limits.",
      acceptance: "GET /llms.txt returns 200 with concise public product context, and public copy still avoids AI visibility or citation guarantees.",
      estimatedEffort: "15-30 min",
      workType: "content"
    });
  }

  return prioritizeReadinessRepairs(items, trafficIndex);
}

function repairToFinding(item = {}, index = 0) {
  return {
    id: item.issueId || `ai-answer-readiness-${index + 1}`,
    type: "ai-answer-readiness",
    severity: item.severity || "notice",
    title: item.title || "AI Answer Readiness repair",
    why: item.why || "This is a proof-derived readiness issue, not live answer-engine monitoring.",
    evidence: item.proof || "",
    fix: item.fix || "",
    acceptance: item.acceptance || "",
    confidence: item.confidence || "needs-review",
    source: item.source || "ai-answer-readiness-proof",
    pageUrl: item.pageUrl || null,
    pageLabel: item.pageLabel || null,
    trafficRanked: Boolean(item.trafficRanked),
    trafficClicks: Number(item.trafficClicks || 0),
    trafficImpressions: Number(item.trafficImpressions || 0)
  };
}

function aiReadinessSummary(pages = [], checks = {}, repairs = [], trafficIndex = emptyTrafficIndex()) {
  const penalty =
    (checks.contentDepth?.lowContentPages?.length ? 28 : 0) +
    (checks.structuredData?.status === "needs_review" ? 16 : 0) +
    (checks.sourceClarity?.status === "needs_repair" ? 18 : 0) +
    (checks.answerStructure?.status === "needs_review" ? 10 : 0) +
    (checks.discoveryFiles?.llmsTxt && !checks.discoveryFiles.llmsTxt.ok ? 4 : 0);
  const trafficRanked = Boolean(trafficIndex.rowCount);
  return {
    method: "proof-derived-readiness-v1",
    pagesChecked: pages.length,
    readinessScore: Math.max(0, 100 - penalty),
    repairOpportunityCount: repairs.length,
    pagesWithEnoughText: checks.contentDepth?.pagesWithEnoughText || 0,
    lowContentPages: checks.contentDepth?.lowContentPages?.length || 0,
    appShellPages: checks.contentDepth?.appShellPages?.length || 0,
    pagesWithHelpfulSchema: checks.structuredData?.pagesWithHelpfulSchema || 0,
    helpfulSchemaTypes: checks.structuredData?.helpfulTypes || [],
    pagesWithCanonical: checks.sourceClarity?.pagesWithCanonical || 0,
    pagesWithInternalLinks: checks.sourceClarity?.pagesWithInternalLinks || 0,
    pagesWithQuestionStructure: checks.answerStructure?.pagesWithQuestionStructure || 0,
    sitemapReady: Boolean(checks.discoveryFiles?.sitemapReady),
    sitemapUrlsDiscovered: checks.discoveryFiles?.sitemapUrlsDiscovered || 0,
    llmsTxtStatus: checks.discoveryFiles?.llmsTxt?.ok ? "reachable" : "not_reachable",
    trafficRanked,
    trafficRowsUsed: trafficIndex.rowCount || 0,
    prioritization: trafficRanked ? "imported-search-console-traffic" : "proof-order"
  };
}

function hasHelpfulSchema(page = {}) {
  return (page.schemaTypes || []).some((type) => HELPFUL_SCHEMA_TYPES.has(type));
}

function hasQuestionStructure(page = {}) {
  if ((page.schemaTypes || []).some((type) => ["faqpage", "howto"].includes(type))) return true;
  const headingText = (page.headings || []).map((heading) => heading.text || "").filter(Boolean);
  if (headingText.some((text) => QUESTION_PATTERNS.some((pattern) => pattern.test(text)))) return true;
  const combined = `${page.title} ${page.description} ${page.bodyText}`;
  return QUESTION_PATTERNS.some((pattern) => pattern.test(combined));
}

function isIndexable(page = {}) {
  const status = Number(page.status || 0);
  if (page.ok === false) return false;
  if (status && (status < 200 || status >= 300)) return false;
  return !String(page.robots || "").toLowerCase().includes("noindex");
}

function pageSummary(page = {}) {
  return {
    url: page.pageUrl || page.url || "",
    label: page.pageLabel || safePathLabel(page.pageUrl || page.url || ""),
    title: page.title || "",
    wordCount: page.wordCount || 0,
    schemaTypes: page.schemaTypes || []
  };
}

function normalizeSchemaTypes(types = []) {
  return (types || [])
    .flatMap((type) => String(type || "").split(","))
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeDiscoveryFile(file = {}) {
  return {
    ok: Boolean(file.ok),
    status: file.status ?? null,
    url: cleanText(file.url || "", 600),
    contentType: cleanText(file.contentType || file.content_type || "", 120),
    contentLength: Number(file.contentLength || file.content_length || byteLength(file.body || file.bodySample || file.body_sample || "")),
    bodySample: cleanText(file.bodySample || file.body_sample || file.body || "", 500),
    error: cleanText(file.error || "", 300)
  };
}

function safePathLabel(value = "") {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? "home" : url.pathname || "page";
  } catch {
    return "page";
  }
}

function cleanText(input = "", maxLength = 500) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function byteLength(value = "") {
  return new TextEncoder().encode(String(value || "")).length;
}

function emptyTrafficIndex() {
  return { rowCount: 0, byUrl: new Map() };
}

function buildTrafficIndex(rows = []) {
  const byUrl = new Map();
  let rowCount = 0;
  for (const row of rows || []) {
    const pageUrl =
      row.pageUrl ||
      row.page_url ||
      row.page ||
      row.url ||
      row.landingPage ||
      row.landing_page ||
      "";
    const key = normalizePageKey(pageUrl);
    if (!key) continue;
    const clicks = positiveMetric(row.clicks ?? row.currentClicks ?? row.current_clicks);
    const impressions = positiveMetric(row.impressions ?? row.currentImpressions ?? row.current_impressions);
    const current = byUrl.get(key) || { clicks: 0, impressions: 0, rows: 0 };
    current.clicks += clicks;
    current.impressions += impressions;
    current.rows += 1;
    byUrl.set(key, current);
    rowCount += 1;
  }
  return { rowCount, byUrl };
}

function pageTraffic(page = {}, trafficIndex = emptyTrafficIndex()) {
  const key = normalizePageKey(page.url || page.pageUrl || "");
  if (!key) return { clicks: 0, impressions: 0, rows: 0 };
  return trafficIndex.byUrl.get(key) || { clicks: 0, impressions: 0, rows: 0 };
}

function sumPageTraffic(pages = [], trafficIndex = emptyTrafficIndex()) {
  const seen = new Set();
  const total = { clicks: 0, impressions: 0, rows: 0 };
  for (const page of pages || []) {
    const key = normalizePageKey(page.url || page.pageUrl || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const traffic = trafficIndex.byUrl.get(key);
    if (!traffic) continue;
    total.clicks += traffic.clicks;
    total.impressions += traffic.impressions;
    total.rows += traffic.rows;
  }
  return total;
}

function sortPagesByTraffic(pages = [], trafficIndex = emptyTrafficIndex()) {
  return [...(pages || [])].sort((left, right) => {
    const a = pageTraffic(left, trafficIndex);
    const b = pageTraffic(right, trafficIndex);
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    if (b.impressions !== a.impressions) return b.impressions - a.impressions;
    return 0;
  });
}

function uniquePages(pages = []) {
  const seen = new Set();
  const unique = [];
  for (const page of pages || []) {
    const key = normalizePageKey(page.url || page.pageUrl || "") || `${page.label || ""}|${unique.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(page);
  }
  return unique;
}

function prioritizeReadinessRepairs(items = [], trafficIndex = emptyTrafficIndex()) {
  const trafficRanked = Boolean(trafficIndex.rowCount);
  const scored = items.map((item, index) => ({
    item,
    index,
    traffic: sumPageTraffic(item.affectedPages || [], trafficIndex)
  }));
  if (trafficRanked) {
    scored.sort((left, right) => {
      if (right.traffic.clicks !== left.traffic.clicks) return right.traffic.clicks - left.traffic.clicks;
      if (right.traffic.impressions !== left.traffic.impressions) return right.traffic.impressions - left.traffic.impressions;
      return left.index - right.index;
    });
  }
  return scored.map((entry, index) => {
    const proof = trafficRanked ? trafficProofSuffix(entry.traffic) : "";
    return {
      ...entry.item,
      priority: index + 1,
      trafficRanked,
      trafficClicks: entry.traffic.clicks,
      trafficImpressions: entry.traffic.impressions,
      proof: proof ? `${entry.item.proof} ${proof}` : entry.item.proof
    };
  });
}

function trafficProofSuffix(traffic = {}) {
  const clicks = Number(traffic.clicks || 0);
  const impressions = Number(traffic.impressions || 0);
  if (clicks || impressions) {
    return `Imported Search Console rows show ${formatCount(clicks)} clicks and ${formatCount(impressions)} impressions on the affected pages.`;
  }
  return "No imported Search Console rows matched these pages.";
}

function normalizePageKey(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    let path = url.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    url.pathname = path;
    return url.href;
  } catch {
    return String(value || "")
      .split("#")[0]
      .replace(/\/$/, "")
      .trim()
      .toLowerCase();
  }
}

function positiveMetric(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return number;
}

function formatCount(value) {
  return Math.round(positiveMetric(value)).toLocaleString("en-US");
}
