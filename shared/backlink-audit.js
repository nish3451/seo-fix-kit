import {
  fetchPublicUrl,
  isPrivateHost,
  normalizeHttpUrl
} from "./url-safety.js";

const MAX_BACKLINK_ROWS = 100;
const FETCH_TIMEOUT_MS = 7000;
const MAX_SOURCE_HTML_BYTES = 350_000;

const RISKY_SOURCE_PATTERNS = [
  "casino",
  "betting",
  "gambling",
  "poker",
  "payday",
  "loan",
  "viagra",
  "pharma",
  "adult",
  "porn",
  "xxx",
  "togel",
  "torrent",
  "nulled",
  "warez",
  "essay",
  "cbd"
];

export function parseBacklinkRows(input = {}, targetUrl = "", options = {}) {
  const raw = input.backlinks ?? input.backlinkRows ?? input.backlink_rows ?? input.backlinkCsv ?? input.backlink_csv ?? "";
  const rows = Array.isArray(raw) ? raw : parseBacklinkText(raw);
  const normalized = [];
  const seen = new Set();
  const limit = Math.min(Math.max(Number(options.limit || MAX_BACKLINK_ROWS), 1), MAX_BACKLINK_ROWS);

  for (const row of rows) {
    if (normalized.length >= limit) break;
    const sourceUrl = normalizeHttpUrl(row.sourceUrl || row.source_url || row.source || row.url || row.referringPage || row.referring_page || "");
    if (!sourceUrl) continue;
    const linkTarget = normalizeHttpUrl(row.targetUrl || row.target_url || row.target || row.linkTarget || row.link_target || targetUrl);
    if (!linkTarget) {
      return { ok: false, error: "Each backlink row needs a valid target URL or audit target URL." };
    }
    if (!options.allowPrivate && (isPrivateHost(sourceUrl) || isPrivateHost(linkTarget))) {
      return { ok: false, error: "Backlink source and target URLs must be public URLs." };
    }
    const key = `${sourceUrl}|${linkTarget}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      id: `backlink-${normalized.length + 1}`,
      sourceUrl,
      targetUrl: linkTarget,
      anchorText: cleanText(row.anchorText || row.anchor_text || row.anchor || row.text || "", 160),
      statusHint: cleanText(row.status || row.linkStatus || row.link_status || "", 60),
      firstSeen: cleanText(row.firstSeen || row.first_seen || "", 60),
      lastSeen: cleanText(row.lastSeen || row.last_seen || "", 60)
    });
  }

  return { ok: true, rows: normalized };
}

export function backlinkRowsKey(rows = []) {
  return (rows || [])
    .map((row) => `${row.sourceUrl || ""}|${row.targetUrl || ""}|${row.anchorText || ""}`)
    .sort()
    .join("\n");
}

export async function buildBacklinkAudit(report = {}, input = [], options = {}) {
  const parsed = parseBacklinkRows({ backlinks: input }, report.url || "", {
    allowPrivate: options.allowPrivate,
    limit: options.limit || MAX_BACKLINK_ROWS
  });
  if (!parsed.ok || !parsed.rows.length) {
    return {
      status: "skipped",
      source: "self-serve-import",
      summary: { imported: 0 },
      rows: [],
      repairOpportunities: []
    };
  }

  const targetOrigin = safeOrigin(report.url || report.origin || "");
  const targetHost = safeHost(report.url || report.origin || "");
  const targetPageMap = pageStatusMap(report.pages || []);
  const rows = [];

  for (const row of parsed.rows) {
    rows.push(await inspectBacklinkRow(row, {
      fetcher: options.fetcher || fetch,
      privateAddressResolver: options.privateAddressResolver,
      targetOrigin,
      targetHost,
      targetPageMap
    }));
  }

  const anchorRisks = anchorTextRisks(rows, targetHost);
  const repairOpportunities = backlinkRepairOpportunities(rows, anchorRisks);
  const summary = backlinkSummary(rows, anchorRisks, repairOpportunities);

  return {
    status: "ready",
    source: "self-serve-import",
    note: "Backlink audit uses supplied backlink rows and live source-page proof. It is not a proprietary backlink index.",
    summary,
    rows,
    anchorRisks,
    repairOpportunities
  };
}

export function backlinkAuditBriefLines(audit = {}) {
  if (audit.status !== "ready" || !audit.rows?.length) return [];
  const lines = [
    "## Backlink audit",
    "",
    `Imported backlink rows: ${audit.summary?.imported || audit.rows.length}`,
    `Live backlinks: ${audit.summary?.live || 0}`,
    `Lost backlinks: ${audit.summary?.lost || 0}`,
    `Risky source signals: ${audit.summary?.toxicRisk || 0}`,
    `Broken backlink targets: ${audit.summary?.brokenTargets || 0}`,
    ""
  ];

  if (audit.repairOpportunities?.length) {
    lines.push("### Link-audit repair actions", "");
    for (const item of audit.repairOpportunities.slice(0, 8)) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
    }
    lines.push("");
  } else {
    lines.push("No backlink repair actions were created from the imported rows.", "");
  }

  return lines;
}

function parseBacklinkText(input = "") {
  const text = String(input || "").trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const first = splitDelimitedLine(lines[0]);
  const hasHeader = first.some((cell) => /^(source|source_url|referring_page|url|target|target_url|anchor|anchor_text|status)$/i.test(cell));
  const headers = hasHeader ? first.map(normalizeHeader) : ["sourceUrl", "targetUrl", "anchorText", "statusHint"];
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
    source: "sourceUrl",
    source_url: "sourceUrl",
    referring_page: "sourceUrl",
    referring_url: "sourceUrl",
    url: "sourceUrl",
    target: "targetUrl",
    target_url: "targetUrl",
    link_target: "targetUrl",
    anchor: "anchorText",
    anchor_text: "anchorText",
    text: "anchorText",
    status: "statusHint",
    link_status: "statusHint",
    first_seen: "firstSeen",
    last_seen: "lastSeen"
  };
  return aliases[key] || key;
}

async function inspectBacklinkRow(row, context) {
  const source = await fetchSource(row.sourceUrl, context.fetcher, context.privateAddressResolver);
  const links = source.html ? extractLinks(source.html, row.sourceUrl) : [];
  const matchingLinks = links.filter((link) => linkMatchesTarget(link.href, row.targetUrl, context.targetOrigin));
  const targetStatus = await targetStatusFor(row.targetUrl, context);
  const riskySignals = riskySourceSignals(row.sourceUrl);
  const live = source.ok && matchingLinks.length > 0;
  const lost = !live;
  const rel = matchingLinks.map((link) => link.rel).join(" ").trim();
  const anchorText = row.anchorText || matchingLinks[0]?.anchorText || "";

  return {
    ...row,
    sourceHost: safeHost(row.sourceUrl),
    targetHost: safeHost(row.targetUrl),
    sourceStatus: source.status || 0,
    sourceOk: source.ok,
    sourceError: source.error || "",
    targetStatus: targetStatus.status,
    targetOk: targetStatus.ok,
    targetEvidence: targetStatus.evidence,
    live,
    lost,
    foundTargetUrl: matchingLinks[0]?.href || "",
    discoveredAnchorText: anchorText,
    rel,
    nofollow: /\bnofollow\b/i.test(rel),
    sponsored: /\bsponsored\b/i.test(rel),
    riskySignals,
    proof: backlinkProof({ row, source, matchingLinks, targetStatus, riskySignals })
  };
}

async function fetchSource(url, fetcher, privateAddressResolver) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const { response } = await fetchPublicUrl(
      fetcher,
      url,
      {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "SEOFixKit/0.9 backlink-proof-audit"
        },
        signal: controller.signal
      },
      { privateAddressResolver }
    );
    const contentType = response.headers?.get?.("content-type") || "";
    const body = contentType.includes("text/html") || contentType.includes("application/xhtml")
      ? (await response.text()).slice(0, MAX_SOURCE_HTML_BYTES)
      : "";
    return {
      ok: response.ok,
      status: response.status,
      contentType,
      html: body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      html: "",
      error: error?.message || "Could not fetch source page."
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function targetStatusFor(targetUrl, context) {
  const normalized = stripHash(targetUrl);
  const known = context.targetPageMap.get(normalized);
  if (known) return known;
  if (safeHost(targetUrl) !== context.targetHost) {
    return { ok: true, status: 0, evidence: "Target is outside the audited host; status was not checked." };
  }
  try {
    let method = "HEAD";
    let { response, finalUrl } = await fetchPublicUrl(
      context.fetcher,
      targetUrl,
      {
        method: "HEAD",
        signal: AbortSignal.timeout ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
      },
      { privateAddressResolver: context.privateAddressResolver }
    );
    if (response.status === 403 || response.status === 405) {
      method = "GET";
      ({ response, finalUrl } = await fetchPublicUrl(
        context.fetcher,
        targetUrl,
        {
          method: "GET",
          signal: AbortSignal.timeout ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
        },
        { privateAddressResolver: context.privateAddressResolver }
      ));
    }
    return {
      ok: response.ok,
      status: response.status,
      evidence: `${method} ${finalUrl} returned ${response.status}.`
    };
  } catch {
    return { ok: false, status: 0, evidence: `Could not verify backlink target ${targetUrl}.` };
  }
}

function extractLinks(html = "", baseUrl = "") {
  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(match[1], "href");
    if (!href) continue;
    const absolute = absoluteUrl(href, baseUrl);
    if (!absolute) continue;
    links.push({
      href: absolute,
      rel: attr(match[1], "rel") || "",
      anchorText: cleanText(stripTags(match[2]), 160)
    });
    if (links.length >= 500) break;
  }
  return links;
}

function attr(attrs = "", name = "") {
  const wanted = String(name).toLowerCase();
  for (const match of String(attrs).matchAll(/([^\s=]+)\s*=\s*(["'])(.*?)\2/gi)) {
    if (match[1].toLowerCase() === wanted) return match[3] || "";
  }
  for (const match of String(attrs).matchAll(/([^\s=]+)\s*=\s*([^\s"'=<>`]+)/gi)) {
    if (match[1].toLowerCase() === wanted) return match[2] || "";
  }
  return "";
}

export function normalizeUrlForComparison(value = "") {
  try {
    const url = new URL(value);
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.href;
  } catch {
    return String(value || "");
  }
}

function linkMatchesTarget(href, targetUrl, targetOrigin) {
  const cleanHref = normalizeUrlForComparison(href);
  const cleanTarget = normalizeUrlForComparison(targetUrl);
  if (cleanHref === cleanTarget) return true;
  return !targetUrl && targetOrigin && cleanHref.startsWith(normalizeUrlForComparison(targetOrigin));
}

function riskySourceSignals(sourceUrl = "") {
  const parsed = new URL(sourceUrl);
  const text = `${parsed.hostname} ${parsed.pathname}`.toLowerCase();
  const tokenText = ` ${text.replace(/[^a-z0-9]+/g, " ").trim()} `;
  const tokens = new Set(tokenText.split(" ").filter(Boolean));
  const signals = RISKY_SOURCE_PATTERNS.filter((pattern) =>
    /[^a-z0-9]/.test(pattern)
      ? tokenText.includes(` ${pattern.replace(/[^a-z0-9]+/g, " ").trim()} `)
      : tokens.has(pattern)
  );
  const label = parsed.hostname.split(".").pop() || "";
  if (["xyz", "top", "click", "work", "zip"].includes(label)) signals.push(`high-risk tld .${label}`);
  return [...new Set(signals)].slice(0, 5);
}

function anchorTextRisks(rows = [], targetHost = "") {
  const anchors = rows
    .map((row) => cleanText(row.discoveredAnchorText || row.anchorText || "", 120).toLowerCase())
    .filter(Boolean);
  const total = anchors.length;
  if (total < 3) return [];
  const counts = anchors.reduce((map, anchor) => map.set(anchor, (map.get(anchor) || 0) + 1), new Map());
  const brandTokens = new Set(String(targetHost || "").replace(/^www\./, "").split(/[.-]/).filter((part) => part.length > 2));
  return [...counts.entries()]
    .map(([anchor, count]) => ({ anchor, count, share: count / total }))
    .filter((item) => item.count >= 3 && item.share >= 0.4 && !brandTokens.has(item.anchor))
    .sort((a, b) => b.share - a.share || b.count - a.count)
    .slice(0, 5);
}

function backlinkRepairOpportunities(rows = [], anchorRisks = []) {
  const items = [];
  const lost = rows.filter((row) => row.lost);
  if (lost.length) {
    items.push({
      severity: lost.length >= 3 ? "warning" : "notice",
      title: "Lost backlinks need reclaim review",
      proof: `${lost.length} imported backlink${lost.length === 1 ? "" : "s"} no longer linked to the target page. Example: ${lost[0].sourceUrl}`,
      fix: "Review whether the source page changed, the target URL moved, or outreach is needed. Restore missing target pages or ask the referring site to update the link.",
      acceptance: "Rerun the backlink audit and confirm the source pages link to the intended target URL again.",
      estimatedEffort: "30-90 min",
      workType: "outreach"
    });
  }

  const brokenTargets = rows.filter((row) => !row.targetOk);
  if (brokenTargets.length) {
    items.push({
      severity: "critical",
      title: "Backlinks point at broken target URLs",
      proof: `${brokenTargets.length} backlink target${brokenTargets.length === 1 ? "" : "s"} failed status checks. Example: ${brokenTargets[0].targetEvidence}`,
      fix: "Restore the target page, add a 301 redirect to the closest relevant page, or update campaign links to the live canonical URL.",
      acceptance: "Backlink target URLs return 2xx or intentional 3xx responses on rerun.",
      estimatedEffort: "15-45 min",
      workType: "technical"
    });
  }

  const risky = rows.filter((row) => row.riskySignals?.length);
  if (risky.length) {
    items.push({
      severity: "warning",
      title: "Toxic backlink risk needs review",
      proof: `${risky.length} source URL${risky.length === 1 ? "" : "s"} matched risky source patterns. Example: ${risky[0].sourceUrl} (${risky[0].riskySignals.join(", ")})`,
      fix: "Review these links in Google Search Console or another backlink source. Remove manipulative links where possible and consider disavow only for clear spam at scale.",
      acceptance: "Risky imported backlinks are marked reviewed, removed, or added to a documented disavow candidate list.",
      estimatedEffort: "45-120 min",
      workType: "review"
    });
  }

  for (const risk of anchorRisks) {
    items.push({
      severity: "notice",
      title: `Anchor text over-optimization risk: "${risk.anchor}"`,
      proof: `"${risk.anchor}" appears in ${Math.round(risk.share * 100)}% of imported anchor text (${risk.count} links).`,
      fix: "Diversify future link outreach toward branded, URL, and natural anchors. Do not create more exact-match paid or reciprocal anchors.",
      acceptance: "Future imported backlink rows show a healthier mix of brand, URL, topical, and natural anchors.",
      estimatedEffort: "30-90 min",
      workType: "content"
    });
  }

  return items.map((item, index) => ({
    priority: index + 1,
    confidence: item.title.includes("Toxic") || item.title.includes("Anchor") ? "needs-review" : "verified",
    source: null,
    snippet: null,
    pageUrl: null,
    pageLabel: null,
    ...item
  }));
}

function backlinkSummary(rows, anchorRisks, repairOpportunities) {
  return {
    imported: rows.length,
    live: rows.filter((row) => row.live).length,
    lost: rows.filter((row) => row.lost).length,
    toxicRisk: rows.filter((row) => row.riskySignals?.length).length,
    brokenTargets: rows.filter((row) => !row.targetOk).length,
    nofollow: rows.filter((row) => row.nofollow).length,
    sponsored: rows.filter((row) => row.sponsored).length,
    anchorRiskCount: anchorRisks.length,
    repairOpportunityCount: repairOpportunities.length
  };
}

function backlinkProof({ row, source, matchingLinks, targetStatus, riskySignals }) {
  if (!source.ok) return `Source ${row.sourceUrl} returned ${source.status || source.error || "no response"}.`;
  if (!matchingLinks.length) return `Source ${row.sourceUrl} returned ${source.status}, but no link to ${row.targetUrl} was found in the HTML.`;
  if (!targetStatus.ok) return targetStatus.evidence;
  if (riskySignals.length) return `Source URL matched risky patterns: ${riskySignals.join(", ")}.`;
  return `Source ${row.sourceUrl} links to ${matchingLinks[0].href} with anchor "${matchingLinks[0].anchorText || row.anchorText || "unknown"}".`;
}

function pageStatusMap(pages = []) {
  const map = new Map();
  for (const page of pages) {
    const status = {
      ok: Boolean(page.ok),
      status: Number(page.status || 0),
      evidence: `Crawled target ${page.url} returned ${page.status || "unknown"}.`
    };
    if (page.url) map.set(stripHash(page.url), status);
    if (page.finalUrl) map.set(stripHash(page.finalUrl), status);
  }
  return map;
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return "";
  }
}

function safeOrigin(value = "") {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function safeHost(value = "") {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stripHash(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return String(value || "");
  }
}

function stripTags(value = "") {
  return String(value).replace(/<[^>]*>/g, " ");
}

function cleanText(input = "", max = 200) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
