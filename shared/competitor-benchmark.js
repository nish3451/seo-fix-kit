const MAX_COMPETITOR_REPAIRS = 8;

export function buildCompetitorBenchmark(targetReport = {}, competitorReports = []) {
  const competitors = competitorReports
    .filter((report) => report && report.url)
    .slice(0, 5)
    .map((report) => benchmarkSite(report, targetReport));

  if (!competitors.length) {
    return {
      status: "skipped",
      source: "homepage-proof-snapshot",
      summary: {
        competitorsCompared: 0
      },
      target: benchmarkSite(targetReport),
      competitors: [],
      repairOpportunities: []
    };
  }

  const target = benchmarkSite(targetReport);
  const ranked = [target, ...competitors]
    .filter((site) => site.host)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const targetRank = ranked.findIndex((site) => site.host === target.host && site.url === target.url) + 1 || ranked.length;
  const bestCompetitor = competitors
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
  const competitorAverageScore = Math.round(
    competitors.reduce((total, site) => total + Number(site.score || 0), 0) / competitors.length
  );
  const repairOpportunities = benchmarkRepairOpportunities(targetReport, competitors);

  return {
    status: "ready",
    source: "homepage-proof-snapshot",
    note: "Competitor snapshots compare public homepages with the same proof engine. They are not backlink, keyword-volume, or rank-tracking data.",
    summary: {
      competitorsCompared: competitors.length,
      targetRank,
      totalSitesRanked: ranked.length,
      targetScore: target.score,
      competitorAverageScore,
      bestCompetitorHost: bestCompetitor?.host || "",
      bestCompetitorScore: bestCompetitor?.score || 0,
      scoreGapToBest: Math.max(0, Number(bestCompetitor?.score || 0) - Number(target.score || 0)),
      repairOpportunityCount: repairOpportunities.length
    },
    target,
    competitors,
    repairOpportunities
  };
}

export function competitorBenchmarkBriefLines(benchmark = {}) {
  if (benchmark.status !== "ready" || !benchmark.competitors?.length) return [];
  const lines = [
    "## Competitor benchmark",
    "",
    `Compared against: ${benchmark.competitors.map((site) => site.host).join(", ")}`,
    `Target rank: ${benchmark.summary?.targetRank || "unknown"} of ${benchmark.summary?.totalSitesRanked || benchmark.competitors.length + 1}`,
    `Best competitor: ${benchmark.summary?.bestCompetitorHost || "unknown"} (${benchmark.summary?.bestCompetitorScore || 0}/100)`,
    ""
  ];

  if (benchmark.repairOpportunities?.length) {
    lines.push("### Competitor gap repairs", "");
    for (const item of benchmark.repairOpportunities.slice(0, MAX_COMPETITOR_REPAIRS)) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
    }
    lines.push("");
  } else {
    lines.push("No competitor-backed repair gaps were found in this homepage benchmark.", "");
  }

  return lines;
}

export function competitorBenchmarkSummaryCopy(benchmark = {}) {
  if (benchmark.status !== "ready" || !benchmark.competitors?.length) {
    return "No competitor benchmark was included in this report.";
  }
  const compared = benchmark.summary?.competitorsCompared || benchmark.competitors.length;
  const gap = Number(benchmark.summary?.scoreGapToBest || 0);
  if (gap > 0) {
    return `Compared ${compared} competitor homepage${compared === 1 ? "" : "s"}. The strongest competitor scored ${gap} points higher, and the repair gaps below show what to fix first.`;
  }
  return `Compared ${compared} competitor homepage${compared === 1 ? "" : "s"}. The target is at or above the strongest competitor on this proof snapshot.`;
}

function benchmarkSite(report = {}, targetReport = {}) {
  const findings = (report.findings || []).filter((finding) => finding?.severity !== "good");
  const issueAreas = unique(findings.map(findingArea).filter(Boolean));
  const performanceScore = Number.isFinite(report.performance?.performanceScore)
    ? Number(report.performance.performanceScore)
    : null;
  const strengths = targetReport.url
    ? targetIssueAreas(targetReport)
        .filter((area) => !issueAreas.includes(area))
        .map(areaLabel)
        .slice(0, 5)
    : [];

  return {
    url: report.url || "",
    host: safeHost(report.url || report.origin || ""),
    score: Number(report.score || 0),
    pagesScanned: Number(report.summary?.pagesScanned || report.pages?.length || 0),
    critical: Number(report.summary?.critical || 0),
    warnings: Number(report.summary?.warnings || 0),
    notices: Number(report.summary?.notices || 0),
    issueCount: findings.length,
    issueAreas,
    strengths,
    performanceScore,
    renderedLoadMs: Number(report.pages?.[0]?.rendered?.loadDurationMs || 0),
    title: report.pages?.[0]?.rendered?.title || "",
    h1: report.pages?.[0]?.rendered?.h1s?.[0] || "",
    topFindings: findings.slice(0, 5).map((finding) => ({
      severity: finding.severity || "notice",
      title: finding.title || "",
      evidence: finding.evidence || "",
      area: findingArea(finding)
    }))
  };
}

function benchmarkRepairOpportunities(targetReport = {}, competitors = []) {
  const targetFindings = (targetReport.findings || [])
    .filter((finding) => finding?.severity && finding.severity !== "good")
    .filter((finding) => findingArea(finding) !== "performance" || competitors.some((site) => site.performanceScore !== null));
  const opportunities = [];
  const seen = new Set();

  for (const finding of targetFindings) {
    const area = findingArea(finding);
    if (!area || seen.has(area)) continue;
    const cleanCompetitors = competitors.filter((site) => !site.issueAreas.includes(area));
    if (!cleanCompetitors.length) continue;
    seen.add(area);
    opportunities.push({
      priority: 0,
      severity: finding.severity || "warning",
      title: `Competitor gap: ${areaLabel(area)}`,
      pageUrl: finding.pageUrl || null,
      pageLabel: finding.pageLabel || null,
      proof: `${cleanCompetitors.map((site) => site.host).join(", ")} did not show this issue in the benchmark snapshot. Your audit proof: ${finding.evidence || finding.title}`,
      fix: finding.fix || "Fix the verified issue and rerun the audit.",
      acceptance: finding.acceptance || "Rerun the audit and confirm the competitor gap no longer appears.",
      competitorHosts: cleanCompetitors.map((site) => site.host),
      estimatedEffort: estimatedEffortForArea(area),
      workType: workTypeForArea(area)
    });
  }

  return opportunities
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.competitorHosts.length - a.competitorHosts.length)
    .slice(0, MAX_COMPETITOR_REPAIRS)
    .map((item, index) => ({ ...item, priority: index + 1 }));
}

function targetIssueAreas(report = {}) {
  return unique(
    (report.findings || [])
      .filter((finding) => finding?.severity && finding.severity !== "good")
      .map(findingArea)
      .filter(Boolean)
  );
}

function findingArea(finding = {}) {
  const text = `${finding.title || ""} ${finding.why || ""} ${finding.fix || ""}`.toLowerCase();
  if (text.includes("pagespeed") || text.includes("largest contentful paint") || text.includes("total blocking time") || text.includes("layout shift") || text.includes("render-blocking") || text.includes("unused javascript") || text.includes("speed index")) return "performance";
  if (text.includes("structured data") || text.includes("schema") || text.includes("json-ld") || text.includes("microdata") || text.includes("rdfa")) return "structured-data";
  if (text.includes("canonical")) return "canonical";
  if (text.includes("hreflang")) return "hreflang";
  if (text.includes("broken internal link") || text.includes("redirecting internal link") || text.includes("internal links")) return "internal-links";
  if (text.includes("broken image") || text.includes("image")) return "images";
  if (text.includes("meta description") || text.includes("snippet")) return "meta-description";
  if (text.includes("title")) return "title";
  if (text.includes("h1") || text.includes("heading")) return "headings";
  if (text.includes("robots") || text.includes("sitemap")) return "crawl-discovery";
  if (text.includes("https") || text.includes("ssl") || text.includes("mixed content") || text.includes("hsts") || text.includes("security header")) return "security";
  if (text.includes("thin") || text.includes("word count") || text.includes("content")) return "content-depth";
  if (text.includes("viewport") || text.includes("mobile")) return "mobile";
  if (text.includes("social")) return "social";
  return slug(text.split(" on ")[0] || finding.title || "seo-issue").slice(0, 60);
}

function areaLabel(area = "") {
  const labels = {
    "content-depth": "Content depth",
    "crawl-discovery": "Crawl discovery",
    "internal-links": "Internal links",
    "meta-description": "Meta description",
    "structured-data": "Structured data"
  };
  return labels[area] || titleCase(area.replace(/-/g, " "));
}

function estimatedEffortForArea(area = "") {
  if (["title", "meta-description", "canonical", "social"].includes(area)) return "5-15 min";
  if (["structured-data", "images", "internal-links", "hreflang", "mobile"].includes(area)) return "15-45 min";
  if (["security", "content-depth", "crawl-discovery"].includes(area)) return "30-90 min";
  if (area === "performance") return "45-120 min";
  return "15-30 min";
}

function workTypeForArea(area = "") {
  if (["title", "meta-description", "content-depth", "images", "internal-links", "social"].includes(area)) return "content";
  if (["structured-data", "canonical", "mobile"].includes(area)) return "code";
  if (["performance", "security", "crawl-discovery", "hreflang"].includes(area)) return "technical";
  return "review";
}

function severityRank(severity = "") {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  if (severity === "notice") return 2;
  return 3;
}

function safeHost(value = "") {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value = "") {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
