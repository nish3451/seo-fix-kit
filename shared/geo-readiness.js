function buildGeoReadinessAudit(report = {}) {
  const home = report.pages?.[0]?.rendered || {};
  if (!report.pages?.[0]?.finalUrl || !report.pages?.[0]?.rendered) {
    return {
      status: "skipped",
      source: "seo-geo-readiness",
      checks: {},
      summary: { passed: 0, total: 0, repairOpportunityCount: 0 },
      repairOpportunities: [],
      guidance: geoGuidance()
    };
  }
  const checks = {
    crawlableContent: Number(home.wordCount || 0) >= 250,
    entityClarity: Boolean(home.title && home.description && home.h1s?.length),
    answerReadySections: hasAnswerReadySections(home.headings || []),
    usefulSchema: hasUsefulSchema(home.schemaTypes || []),
    internalContext: Number(home.internalLinks?.length || 0) > 0
  };
  const repairOpportunities = [];

  if (!checks.entityClarity) {
    repairOpportunities.push({
      priority: repairOpportunities.length + 1,
      severity: "warning",
      title: "SEO/GEO entity clarity needs cleanup",
      proof: `Title: ${home.title || "missing"}; description: ${home.description || "missing"}; H1s: ${home.h1s?.join(" | ") || "missing"}.`,
      fix: "Make the page title, meta description, and primary H1 clearly name the company, offer, audience, and page purpose.",
      acceptance: "A rerun shows a clear title, description, and visible H1 that agree with the page content.",
      estimatedEffort: "15-45 min",
      workType: "content",
      source: "geo-readiness"
    });
  }

  if (!checks.answerReadySections) {
    repairOpportunities.push({
      priority: repairOpportunities.length + 1,
      severity: "notice",
      title: "Add answer-ready sections for buyer questions",
      proof: "Rendered headings do not show FAQ, how-it-works, pricing, comparison, or direct question sections.",
      fix: "Add concise sections that answer the buyer's real questions using visible, crawlable HTML. Keep claims specific and support them with proof.",
      acceptance: "A rerun shows crawlable headings and body copy that answer key buyer questions without hiding content behind scripts.",
      estimatedEffort: "30-90 min",
      workType: "content",
      source: "geo-readiness"
    });
  }

  if (!checks.usefulSchema) {
    repairOpportunities.push({
      priority: repairOpportunities.length + 1,
      severity: "notice",
      title: "Add truthful entity schema where useful",
      proof: `Rendered schema types: ${home.schemaTypes?.join(", ") || "none"}.`,
      fix: "Add Organization, WebSite, Product, Service, LocalBusiness, or FAQ schema only when it matches visible page content.",
      acceptance: "JSON-LD validates and the schema types match content users can see on the page.",
      estimatedEffort: "15-45 min",
      workType: "code",
      source: "geo-readiness"
    });
  }

  if (!checks.crawlableContent) {
    repairOpportunities.push({
      priority: repairOpportunities.length + 1,
      severity: "warning",
      title: "Make core answer content crawlable",
      proof: `${Number(home.wordCount || 0)} rendered words found on the primary page.`,
      fix: "Add useful visible page copy that explains the offer, use cases, proof, constraints, and next steps.",
      acceptance: "A rerun shows substantial rendered text and the repair no longer appears as thin content.",
      estimatedEffort: "30-90 min",
      workType: "content",
      source: "geo-readiness"
    });
  }

  return {
    status: "ready",
    source: "seo-geo-readiness",
    checks,
    summary: {
      passed: Object.values(checks).filter(Boolean).length,
      total: Object.keys(checks).length,
      repairOpportunityCount: repairOpportunities.length
    },
    repairOpportunities,
    guidance: geoGuidance()
  };
}

function geoGuidance() {
  return {
    llmsTxt:
      "llms.txt can be useful for some non-Google AI readers, but it is not required for Google Search or Google generative search surfaces.",
    priority:
      "Prioritize crawlable content, clear entity and offer language, accurate schema, internal context, and proof-backed answers."
  };
}

function geoReadinessBriefLines(audit = null) {
  if (!audit || audit.status !== "ready") return [];
  const lines = [
    "## SEO/GEO readiness",
    "",
    `- Checks passed: ${audit.summary.passed}/${audit.summary.total}`,
    `- Repair opportunities: ${audit.summary.repairOpportunityCount}`,
    `- Boundary: ${audit.guidance.llmsTxt}`,
    `- Priority: ${audit.guidance.priority}`
  ];
  if (audit.repairOpportunities.length) {
    lines.push(`- Top repair: ${audit.repairOpportunities[0].title}`);
  }
  lines.push("");
  return lines;
}

function hasAnswerReadySections(headings = []) {
  const joined = headings.map((heading) => heading.text || "").join(" ").toLowerCase();
  return ["faq", "frequently asked", "how it works", "pricing", "compare", "comparison", "why", "what is", "who is"].some((needle) =>
    joined.includes(needle)
  );
}

function hasUsefulSchema(schemaTypes = []) {
  const useful = new Set(["Organization", "WebSite", "Product", "Service", "LocalBusiness", "FAQPage", "SoftwareApplication"]);
  return schemaTypes.some((type) => useful.has(type));
}

export {
  buildGeoReadinessAudit,
  geoReadinessBriefLines
};
