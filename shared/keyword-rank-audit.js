import {
  isPrivateHost,
  normalizeHttpUrl
} from "./url-safety.js";

const MAX_KEYWORD_ROWS = 250;
const LOW_CTR_THRESHOLD = 0.02;
const LOW_CTR_MIN_IMPRESSIONS = 100;
const PAGE_TWO_MIN_POSITION = 10;
const PAGE_TWO_MAX_POSITION = 20;
const DECLINE_MIN_PREVIOUS_CLICKS = 10;

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
  "how",
  "in",
  "is",
  "near",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with"
]);

export function parseKeywordRows(input = {}, targetUrl = "", options = {}) {
  const raw =
    input.keywordRows ??
    input.keyword_rows ??
    input.keywordRankRows ??
    input.keyword_rank_rows ??
    input.keywordCsv ??
    input.keyword_csv ??
    input.searchConsoleRows ??
    input.search_console_rows ??
    input.gscRows ??
    input.gsc_rows ??
    "";
  const rows = Array.isArray(raw) ? raw : parseKeywordText(raw);
  const normalized = [];
  const seen = new Set();
  const targetHost = safeHost(targetUrl);
  const limit = Math.min(Math.max(Number(options.limit || MAX_KEYWORD_ROWS), 1), MAX_KEYWORD_ROWS);

  for (const row of rows) {
    if (normalized.length >= limit) break;
    const query = cleanText(row.query || row.keyword || row.searchTerm || row.search_term || row.term || "", 180);
    if (!query) continue;

    const pageUrl = normalizeHttpUrl(
      row.pageUrl ||
        row.page_url ||
        row.page ||
        row.url ||
        row.landingPage ||
        row.landing_page ||
        row.destination ||
        ""
    );
    if (pageUrl && !options.allowPrivate && isPrivateHost(pageUrl)) {
      return { ok: false, error: "Keyword landing page URLs must be public URLs." };
    }
    if (pageUrl && targetHost && safeHost(pageUrl) !== targetHost) {
      return { ok: false, error: "Keyword landing page URLs must match the audited host." };
    }

    const clicks = parseMetric(row.clicks || row.currentClicks || row.current_clicks);
    const impressions = parseMetric(row.impressions || row.currentImpressions || row.current_impressions);
    const ctr = parseCtr(row.ctr || row.currentCtr || row.current_ctr, clicks, impressions);
    const position = parseMetric(row.position || row.avgPosition || row.averagePosition || row.avg_position);
    const previousClicks = parseMetric(row.previousClicks || row.previous_clicks || row.clicksPrevious || row.clicks_previous);
    const previousImpressions = parseMetric(
      row.previousImpressions ||
        row.previous_impressions ||
        row.impressionsPrevious ||
        row.impressions_previous
    );
    const previousCtr = parseCtr(row.previousCtr || row.previous_ctr, previousClicks, previousImpressions);
    const previousPosition = parseMetric(
      row.previousPosition ||
        row.previous_position ||
        row.positionPrevious ||
        row.position_previous
    );
    const key = `${normalizeQuery(query)}|${pageUrl || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      id: `keyword-${normalized.length + 1}`,
      query,
      normalizedQuery: normalizeQuery(query),
      pageUrl,
      clicks,
      impressions,
      ctr,
      position,
      previousClicks,
      previousImpressions,
      previousCtr,
      previousPosition,
      source: cleanText(row.source || row.dataSource || row.data_source || "import", 80)
    });
  }

  return { ok: true, rows: normalized };
}

export function keywordRowsKey(rows = []) {
  return (rows || [])
    .map((row) => [
      row.query || "",
      row.pageUrl || "",
      metricKey(row.clicks),
      metricKey(row.impressions),
      metricKey(row.ctr),
      metricKey(row.position),
      metricKey(row.previousClicks),
      metricKey(row.previousPosition)
    ].join("|"))
    .sort()
    .join("\n");
}

export function keywordRowsSummary(rows = []) {
  return {
    keyword_rows_count: (rows || []).length,
    keyword_queries_count: new Set((rows || []).map((row) => row.normalizedQuery || normalizeQuery(row.query || "")).filter(Boolean)).size,
    keyword_pages_count: new Set((rows || []).map((row) => stripHash(row.pageUrl || "")).filter(Boolean)).size
  };
}

export function buildKeywordRankAudit(report = {}, input = [], options = {}) {
  const parsed = parseKeywordRows({ keywordRows: input }, report.url || "", {
    allowPrivate: options.allowPrivate,
    limit: options.limit || MAX_KEYWORD_ROWS
  });
  if (!parsed.ok || !parsed.rows.length) {
    return {
      status: "skipped",
      source: "self-serve-keyword-import",
      summary: { imported: 0 },
      rows: [],
      repairOpportunities: []
    };
  }

  const pageMap = renderedPageMap(report.pages || []);
  const rows = parsed.rows.map((row) => enrichKeywordRow(row, pageMap));
  const checks = buildKeywordChecks(rows);
  const repairOpportunities = keywordRepairOpportunities(checks);
  const summary = keywordSummary(rows, checks, repairOpportunities);

  return {
    status: "ready",
    source: "self-serve-keyword-import",
    note: "Keyword audit uses supplied Search Console or rank-tracker rows plus rendered page proof. It is not a keyword volume, rank-tracking, or backlink database.",
    summary,
    rows,
    checks,
    repairOpportunities
  };
}

export function keywordRankAuditBriefLines(audit = {}) {
  if (audit.status !== "ready" || !audit.rows?.length) return [];
  const lines = [
    "## Keyword/rank audit",
    "",
    `Imported keyword rows: ${audit.summary?.imported || audit.rows.length}`,
    `Unique queries: ${audit.summary?.queries || 0}`,
    `Landing pages supplied: ${audit.summary?.landingPages || 0}`,
    `Landing pages matched in rendered crawl: ${audit.summary?.matchedLandingPages || 0}/${audit.summary?.landingPages || 0}`,
    `Total clicks: ${audit.summary?.totalClicks || 0}`,
    `Total impressions: ${audit.summary?.totalImpressions || 0}`,
    `Average CTR: ${formatPercent(audit.summary?.averageCtr || 0)}`,
    `Average position: ${formatPosition(audit.summary?.averagePosition || 0)}`,
    ""
  ];

  if (audit.repairOpportunities?.length) {
    lines.push("### Keyword repair actions", "");
    for (const item of audit.repairOpportunities.slice(0, 8)) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
    }
    lines.push("");
  } else {
    lines.push("No keyword repair actions were created from the imported rows.", "");
  }

  return lines;
}

export function keywordRankAuditSummaryCopy(audit = {}) {
  if (audit.status !== "ready") return "";
  const summary = audit.summary || {};
  return [
    `Imported ${summary.imported || 0} keyword rows across ${summary.queries || 0} queries.`,
    `${summary.pageTwoOpportunities || 0} page-two opportunities, ${summary.lowCtrOpportunities || 0} low-CTR opportunities, and ${summary.cannibalizationGroups || 0} cannibalization groups were found.`
  ].join(" ");
}

function parseKeywordText(input = "") {
  const text = String(input || "").trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const first = splitDelimitedLine(lines[0]);
  const hasHeader = first.some((cell) =>
    /^(query|keyword|search_term|page|page_url|landing_page|clicks|impressions|ctr|position|avg_position)$/i.test(cell)
  );
  const headers = hasHeader
    ? first.map(normalizeHeader)
    : ["query", "pageUrl", "clicks", "impressions", "ctr", "position", "previousClicks", "previousPosition"];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const cells = splitDelimitedLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] || "";
      return row;
    }, {});
  });
}

function splitDelimitedLine(line = "") {
  const delimiter = line.includes("\t") ? "\t" : ",";
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value = "") {
  const key = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases = {
    query: "query",
    keyword: "query",
    search_query: "query",
    search_term: "query",
    term: "query",
    page: "pageUrl",
    page_url: "pageUrl",
    url: "pageUrl",
    landing_page: "pageUrl",
    landing_url: "pageUrl",
    clicks: "clicks",
    impressions: "impressions",
    ctr: "ctr",
    position: "position",
    avg_position: "position",
    average_position: "position",
    previous_clicks: "previousClicks",
    clicks_previous: "previousClicks",
    previous_impressions: "previousImpressions",
    impressions_previous: "previousImpressions",
    previous_ctr: "previousCtr",
    previous_position: "previousPosition",
    position_previous: "previousPosition"
  };
  return aliases[key] || key;
}

function enrichKeywordRow(row, pageMap) {
  const key = stripHash(row.pageUrl || "");
  const page = key ? pageMap.get(key) : null;
  const rendered = page?.rendered || page?.static || {};
  const title = cleanText(rendered.title || "", 180);
  const h1 = cleanText((rendered.h1s || [])[0] || "", 180);
  const description = cleanText(rendered.description || "", 220);
  const bodyText = cleanText(rendered.bodyText || "", 1500);
  const queryTokens = meaningfulTokens(row.query);
  const titleCoverage = tokenCoverage(queryTokens, `${title} ${h1} ${description}`);
  const bodyCoverage = tokenCoverage(queryTokens, bodyText);

  return {
    ...row,
    pageLabel: row.pageUrl ? safePathLabel(row.pageUrl) : "query-only row",
    pageMatched: Boolean(page),
    renderedTitle: title,
    renderedH1: h1,
    renderedDescription: description,
    queryIntentTokens: queryTokens,
    titleIntentCoverage: titleCoverage,
    bodyIntentCoverage: bodyCoverage,
    queryInTitleOrH1: titleCoverage >= 0.6,
    queryInBody: bodyCoverage >= 0.6
  };
}

function buildKeywordChecks(rows) {
  const lowCtrRows = rows
    .filter((row) =>
      row.impressions >= LOW_CTR_MIN_IMPRESSIONS &&
      row.position > 0 &&
      row.position <= PAGE_TWO_MIN_POSITION &&
      row.ctr >= 0 &&
      row.ctr < LOW_CTR_THRESHOLD
    )
    .sort(opportunitySort);
  const pageTwoRows = rows
    .filter((row) => row.impressions >= 50 && row.position > PAGE_TWO_MIN_POSITION && row.position <= PAGE_TWO_MAX_POSITION)
    .sort(opportunitySort);
  const zeroClickRows = rows
    .filter((row) => row.impressions >= LOW_CTR_MIN_IMPRESSIONS && row.clicks === 0 && row.position > 0 && row.position <= PAGE_TWO_MAX_POSITION)
    .sort(opportunitySort);
  const decliningRows = rows
    .filter((row) => {
      const clickDrop = row.previousClicks >= DECLINE_MIN_PREVIOUS_CLICKS && row.clicks <= row.previousClicks * 0.7;
      const positionDrop = row.previousPosition > 0 && row.position > 0 && row.position - row.previousPosition >= 3;
      return clickDrop || positionDrop;
    })
    .sort(opportunitySort);
  const cannibalizationGroups = [...groupBy(rows.filter((row) => row.pageUrl), (row) => row.normalizedQuery).values()]
    .map((group) => {
      const pages = [...new Map(group.map((row) => [stripHash(row.pageUrl), row])).values()];
      return { keyword: group[0]?.query || "", normalizedKeyword: group[0]?.normalizedQuery || "", rows: group, pages };
    })
    .filter((group) => group.pages.length > 1)
    .sort((a, b) => sumImpressions(b.rows) - sumImpressions(a.rows));
  const landingMismatchRows = rows
    .filter((row) =>
      row.pageMatched &&
      row.impressions >= 50 &&
      row.queryIntentTokens.length >= 2 &&
      row.titleIntentCoverage < 0.5
    )
    .sort(opportunitySort);
  const missingLandingPageRows = rows
    .filter((row) => row.pageUrl && !row.pageMatched)
    .sort(opportunitySort);
  const queryOnlyRows = rows
    .filter((row) => !row.pageUrl)
    .sort(opportunitySort);

  return {
    lowCtrRows: lowCtrRows.slice(0, 12),
    pageTwoRows: pageTwoRows.slice(0, 12),
    zeroClickRows: zeroClickRows.slice(0, 12),
    decliningRows: decliningRows.slice(0, 12),
    cannibalizationGroups: cannibalizationGroups.slice(0, 8),
    landingMismatchRows: landingMismatchRows.slice(0, 12),
    missingLandingPageRows: missingLandingPageRows.slice(0, 12),
    queryOnlyRows: queryOnlyRows.slice(0, 12)
  };
}

function keywordRepairOpportunities(checks) {
  const repairs = [];
  const addRepair = (item) => {
    repairs.push({
      priority: repairs.length + 1,
      confidence: "needs-review",
      estimatedEffort: item.estimatedEffort || "30-90 min",
      workType: item.workType || "content",
      acceptance: item.acceptance || "Rerun with fresh keyword rows and confirm this keyword proof no longer appears.",
      source: "keyword-rank-audit",
      ...item
    });
  };

  if (checks.lowCtrRows.length) {
    const row = checks.lowCtrRows[0];
    addRepair({
      severity: "warning",
      title: "High-impression keywords have low CTR",
      proof: `${checks.lowCtrRows.length} imported keyword rows rank in the top 10 with CTR below ${formatPercent(LOW_CTR_THRESHOLD)}, led by "${row.query}" on ${row.pageLabel} at ${formatPercent(row.ctr)} CTR.`,
      fix: "Rewrite the page title and meta description around the proven query intent, then make the on-page H1 and opening copy match that promise.",
      acceptance: "Fresh Search Console rows show CTR at or above the site baseline for these top-10 queries."
    });
  }

  if (checks.pageTwoRows.length) {
    const row = checks.pageTwoRows[0];
    addRepair({
      severity: "notice",
      title: "Page-two keywords are close to traffic",
      proof: `${checks.pageTwoRows.length} keyword rows sit in positions 11-20, led by "${row.query}" at position ${formatPosition(row.position)} with ${formatCount(row.impressions)} impressions.`,
      fix: "Strengthen the matching landing page with missing subtopics, internal links from relevant hubs, and clearer title/H1 language for the query.",
      acceptance: "Fresh keyword rows show the target queries moving into the top 10 or receiving materially more clicks."
    });
  }

  if (checks.zeroClickRows.length) {
    const row = checks.zeroClickRows[0];
    addRepair({
      severity: "notice",
      title: "High-impression keywords get zero clicks",
      proof: `${checks.zeroClickRows.length} imported keyword rows have impressions but no clicks, led by "${row.query}" with ${formatCount(row.impressions)} impressions at position ${formatPosition(row.position)}.`,
      fix: "Check intent fit, SERP title/snippet appeal, and whether the page answers the query directly above the fold.",
      acceptance: "Fresh keyword rows show nonzero clicks or the query is intentionally deprioritized."
    });
  }

  if (checks.decliningRows.length) {
    const row = checks.decliningRows[0];
    addRepair({
      severity: "warning",
      title: "Imported keywords show ranking or click declines",
      proof: `${checks.decliningRows.length} keyword rows declined versus the previous period, led by "${row.query}" from ${formatCount(row.previousClicks)} to ${formatCount(row.clicks)} clicks.`,
      fix: "Refresh the affected pages, compare against current SERP intent, restore lost internal links, and update stale claims or examples.",
      acceptance: "Fresh keyword rows show clicks or average position recovering for the affected queries."
    });
  }

  if (checks.cannibalizationGroups.length) {
    const group = checks.cannibalizationGroups[0];
    addRepair({
      severity: "warning",
      title: "Multiple landing pages compete for the same query",
      proof: `${checks.cannibalizationGroups.length} query groups map to multiple landing pages, led by "${group.keyword}" across ${group.pages.length} pages.`,
      fix: "Pick one primary URL for each query intent, merge or differentiate overlapping pages, and link secondary pages to the primary page.",
      acceptance: "Fresh keyword rows show one primary landing page for the query, or the pages target clearly different intents."
    });
  }

  if (checks.landingMismatchRows.length) {
    const row = checks.landingMismatchRows[0];
    addRepair({
      severity: "notice",
      title: "Ranking pages do not clearly reflect query intent",
      proof: `${checks.landingMismatchRows.length} matched landing pages do not cover the imported query in the rendered title/H1/description, led by "${row.query}" on ${row.pageLabel}.`,
      fix: "Update title, H1, intro copy, and supporting sections so the page visibly answers the query it already ranks for.",
      acceptance: "Rerun the audit and confirm the rendered title/H1/description cover the imported query intent."
    });
  }

  if (checks.missingLandingPageRows.length) {
    const row = checks.missingLandingPageRows[0];
    addRepair({
      severity: "notice",
      title: "Keyword landing pages were not crawled in this proof run",
      proof: `${checks.missingLandingPageRows.length} imported keyword landing pages were not present in the rendered crawl, including ${row.pageUrl}.`,
      fix: "Increase crawl depth, audit the ranking page directly, or confirm the imported page URL still resolves and is linked internally.",
      acceptance: "The keyword landing page appears in a rendered audit and can be checked against the query proof.",
      workType: "technical"
    });
  }

  return repairs;
}

function keywordSummary(rows, checks, repairOpportunities) {
  const landingPages = new Set(rows.map((row) => stripHash(row.pageUrl || "")).filter(Boolean));
  const matchedLandingPages = new Set(rows.filter((row) => row.pageMatched).map((row) => stripHash(row.pageUrl || "")).filter(Boolean));
  const totalClicks = rows.reduce((sum, row) => sum + positiveNumber(row.clicks), 0);
  const totalImpressions = rows.reduce((sum, row) => sum + positiveNumber(row.impressions), 0);
  const weightedPositionNumerator = rows.reduce((sum, row) => sum + positiveNumber(row.position) * Math.max(positiveNumber(row.impressions), 1), 0);
  const weightedPositionDenominator = rows.reduce((sum, row) => sum + Math.max(positiveNumber(row.impressions), 1), 0);

  return {
    imported: rows.length,
    queries: new Set(rows.map((row) => row.normalizedQuery).filter(Boolean)).size,
    landingPages: landingPages.size,
    matchedLandingPages: matchedLandingPages.size,
    totalClicks,
    totalImpressions,
    averageCtr: totalImpressions ? totalClicks / totalImpressions : 0,
    averagePosition: weightedPositionDenominator ? weightedPositionNumerator / weightedPositionDenominator : 0,
    lowCtrOpportunities: checks.lowCtrRows.length,
    pageTwoOpportunities: checks.pageTwoRows.length,
    zeroClickOpportunities: checks.zeroClickRows.length,
    decliningRows: checks.decliningRows.length,
    cannibalizationGroups: checks.cannibalizationGroups.length,
    landingMismatchRows: checks.landingMismatchRows.length,
    missingLandingPageRows: checks.missingLandingPageRows.length,
    queryOnlyRows: checks.queryOnlyRows.length,
    repairOpportunityCount: repairOpportunities.length
  };
}

function renderedPageMap(pages = []) {
  const map = new Map();
  for (const page of pages || []) {
    for (const value of [page.url, page.finalUrl, page.rendered?.finalUrl, page.static?.finalUrl]) {
      const key = stripHash(value || "");
      if (key && !map.has(key)) map.set(key, page);
    }
  }
  return map;
}

function opportunitySort(left, right) {
  return positiveNumber(right.impressions) - positiveNumber(left.impressions) ||
    positiveNumber(left.position) - positiveNumber(right.position);
}

function groupBy(items, keyFn) {
  const grouped = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key) continue;
    const group = grouped.get(key) || [];
    group.push(item);
    grouped.set(key, group);
  }
  return grouped;
}

function sumImpressions(rows = []) {
  return rows.reduce((sum, row) => sum + positiveNumber(row.impressions), 0);
}

function meaningfulTokens(value = "") {
  return normalizeSearchText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 8);
}

function tokenCoverage(tokens = [], text = "") {
  if (!tokens.length) return 0;
  const haystack = normalizeSearchText(text);
  if (!haystack) return 0;
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  return matched / tokens.length;
}

function normalizeQuery(value = "") {
  return normalizeSearchText(value).slice(0, 180);
}

function normalizeSearchText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMetric(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCtr(value, clicks, impressions) {
  if (value !== null && value !== undefined && value !== "") {
    const text = String(value).trim();
    const parsed = parseMetric(text);
    if (text.includes("%") || parsed > 1) return parsed / 100;
    return parsed;
  }
  return impressions > 0 ? clicks / impressions : 0;
}

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
}

function metricKey(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "";
}

function safeHost(value = "") {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function safePathLabel(value = "") {
  try {
    const url = new URL(value);
    return `${url.pathname || "/"}${url.search || ""}`;
  } catch {
    return value || "";
  }
}

function stripHash(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return String(value || "").split("#")[0];
  }
}

function cleanText(value = "", maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function formatCount(value) {
  return Math.round(positiveNumber(value)).toLocaleString("en-US");
}

function formatPercent(value) {
  return `${Math.round(positiveNumber(value) * 1000) / 10}%`;
}

function formatPosition(value) {
  const number = positiveNumber(value);
  return number ? (Math.round(number * 10) / 10).toString() : "n/a";
}
