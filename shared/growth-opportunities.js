const MAX_GROWTH_OPPORTUNITIES = 8;

export function buildGrowthOpportunities(report = {}) {
  const opportunities = [];
  const add = (item) => {
    if (!item?.title || !item?.proof) return;
    const id = item.id || `growth-${slug(item.title)}`;
    if (opportunities.some((opportunity) => opportunity.id === id)) return;
    opportunities.push({
      id,
      priority: opportunities.length + 1,
      status: "draft_only",
      draftOnly: true,
      confidence: item.confidence || "needs-review",
      estimatedEffort: item.estimatedEffort || "30-90 min",
      workType: item.workType || "content",
      acceptance: item.acceptance || "Review the draft, publish only after approval, then rerun with fresh proof.",
      source: "proof-derived-growth",
      ...item
    });
  };

  addKeywordRefresh(report.keywordRankAudit || report.keyword_rank_audit, add);
  addCompetitorGapBrief(report.competitorBenchmark || report.competitor_benchmark, add);
  addAiReadinessBrief(report.aiAnswerReadiness || report.ai_answer_readiness, add);
  addCrawlProofBrief(report.crawlIntelligence || report.crawl_intelligence, add);

  const trimmed = opportunities.slice(0, MAX_GROWTH_OPPORTUNITIES).map((item, index) => ({
    ...item,
    priority: index + 1
  }));

  return {
    status: trimmed.length ? "ready" : "skipped",
    source: "proof-derived-growth",
    note: "Growth opportunities are draft-only briefs from verified gaps. They do not publish content, create CMS drafts, open pull requests, or promise rankings, traffic, citations, or revenue.",
    summary: {
      opportunityCount: trimmed.length,
      draftOnly: true,
      keywordBacked: trimmed.filter((item) => item.sourceKind === "keyword").length,
      competitorBacked: trimmed.filter((item) => item.sourceKind === "competitor").length,
      aiReadinessBacked: trimmed.filter((item) => item.sourceKind === "ai_answer_readiness").length,
      crawlBacked: trimmed.filter((item) => item.sourceKind === "crawl").length
    },
    opportunities: trimmed
  };
}

export function growthOpportunitiesBriefLines(growth = {}) {
  if (growth.status !== "ready" || !growth.opportunities?.length) return [];
  const lines = [
    "## Draft-only growth opportunities",
    "",
    "These briefs come from verified gaps. They do not publish content or promise rankings, traffic, citations, or revenue.",
    ""
  ];

  for (const item of growth.opportunities.slice(0, MAX_GROWTH_OPPORTUNITIES)) {
    lines.push(`${item.priority}. ${item.title}`);
    lines.push(`   Proof: ${item.proof}`);
    lines.push(`   Draft: ${item.draftBrief?.summary || item.suggestedAction || item.fix || "Create a reviewed draft from the proof."}`);
    if (item.draftBrief?.sections?.length) {
      lines.push(`   Sections: ${item.draftBrief.sections.join(" | ")}`);
    }
    lines.push(`   Guardrail: ${item.guardrail || "Keep the output draft-only until reviewed and approved."}`);
    lines.push(`   Acceptance check: ${item.acceptance}`);
  }
  lines.push("");
  return lines;
}

export function growthOpportunitiesSummaryCopy(growth = {}) {
  if (growth.status !== "ready" || !growth.opportunities?.length) {
    return "No proof-backed growth briefs were created from this report.";
  }
  const summary = growth.summary || {};
  return `${summary.opportunityCount || growth.opportunities.length} draft-only growth ${summary.opportunityCount === 1 ? "brief" : "briefs"} were created from verified keyword, competitor, AI-readiness, or crawl gaps.`;
}

function addKeywordRefresh(audit = {}, add) {
  if (audit.status !== "ready") return;
  const lowCtr = audit.checks?.lowCtrRows?.[0];
  if (lowCtr) {
    add({
      id: "growth-keyword-page-refresh",
      sourceKind: "keyword",
      type: "page_refresh",
      title: "Draft a page refresh for a proven low-CTR query",
      pageUrl: lowCtr.pageUrl || "",
      pageLabel: lowCtr.pageLabel || "",
      proof: `"${lowCtr.query}" has ${formatCount(lowCtr.impressions)} impressions, position ${formatPosition(lowCtr.position)}, and ${formatPercent(lowCtr.ctr)} CTR on ${lowCtr.pageLabel || "the supplied landing page"}.`,
      suggestedAction: "Draft a tighter title, meta description, opening answer, and two supporting sections for the query intent.",
      draftBrief: {
        summary: `Refresh ${lowCtr.pageLabel || "the landing page"} around the proven query "${lowCtr.query}".`,
        sections: [
          `Direct answer for "${lowCtr.query}"`,
          "Proof, examples, or screenshots that support the answer",
          "Next step and internal links to related pages"
        ],
        audience: "Searchers already seeing the page but not clicking often enough"
      },
      guardrail: "Use the supplied query proof as direction only; keep the draft human-reviewed before publishing.",
      acceptance: "Fresh Search Console rows show CTR reviewed against the prior baseline, or the query is explicitly deprioritized with a note."
    });
  }

  const pageTwo = audit.checks?.pageTwoRows?.[0] || audit.checks?.zeroClickRows?.[0];
  if (pageTwo) {
    add({
      id: "growth-keyword-free-tool-idea",
      sourceKind: "keyword",
      type: "free_tool_idea",
      title: "Draft a free-tool or checklist idea from near-traffic queries",
      pageUrl: pageTwo.pageUrl || "",
      pageLabel: pageTwo.pageLabel || "",
      proof: `"${pageTwo.query}" has ${formatCount(pageTwo.impressions)} impressions at position ${formatPosition(pageTwo.position)} with ${formatCount(pageTwo.clicks)} clicks.`,
      suggestedAction: "Draft a lightweight checklist, calculator, template, or comparison helper that directly answers the query intent.",
      draftBrief: {
        summary: `Create a small useful asset for "${pageTwo.query}" and link it from the matched page.`,
        sections: [
          "Problem the searcher is trying to solve",
          "One interactive or downloadable asset",
          "How to use the result and where to go next"
        ],
        audience: "Searchers close to discovering the product"
      },
      guardrail: "Keep the idea as a reviewed brief; do not auto-generate or mass-publish pages.",
      acceptance: "A reviewed asset brief exists, is linked to the source proof, and is tested before any public launch.",
      estimatedEffort: "1-3 hours"
    });
  }
}

function addCompetitorGapBrief(benchmark = {}, add) {
  if (benchmark.status !== "ready") return;
  const repair = benchmark.repairOpportunities?.[0];
  if (!repair) return;
  add({
    id: "growth-competitor-gap-outline",
    sourceKind: "competitor",
    type: "comparison_outline",
    title: "Draft a comparison outline from a competitor-backed gap",
    pageUrl: repair.pageUrl || "",
    pageLabel: repair.pageLabel || "",
    proof: repair.proof || "A competitor-backed gap was found in the homepage benchmark.",
    suggestedAction: "Draft a comparison or proof section that shows how the fixed page now handles this topic better.",
    draftBrief: {
      summary: `Turn the ${cleanLabel(repair.title)} gap into a reviewed comparison outline.`,
      sections: [
        "What the buyer is comparing",
        "What the current page proves after the repair",
        "Where competitors are cleaner in the snapshot",
        "What evidence the page should show next"
      ],
      audience: "Buyers comparing alternatives"
    },
    guardrail: "Use public observed proof only; do not make unsupported claims about competitor private data.",
    acceptance: "The outline cites the benchmark proof and remains a draft until reviewed for accuracy."
  });
}

function addAiReadinessBrief(audit = {}, add) {
  if (audit.status !== "ready") return;
  const needsFaq =
    audit.repairOpportunities?.find((item) => /question-led|structured data|faq/i.test(`${item.title} ${item.fix}`)) ||
    audit.repairOpportunities?.[0];
  if (!needsFaq) return;
  add({
    id: "growth-ai-readiness-faq-brief",
    sourceKind: "ai_answer_readiness",
    type: "faq_block",
    title: "Draft a visible FAQ block from answer-readiness proof",
    pageUrl: needsFaq.pageUrl || "",
    pageLabel: needsFaq.pageLabel || "",
    proof: needsFaq.proof || "AI Answer Readiness found missing answer structure.",
    suggestedAction: "Draft visible question-and-answer sections before adding any matching FAQ schema.",
    draftBrief: {
      summary: "Add concise, visible answers for common buyer questions and objections.",
      sections: [
        "What problem does this solve?",
        "Who is it for?",
        "What proof is available today?",
        "What is not included?"
      ],
      audience: "Buyers and machine readers looking for direct answers"
    },
    guardrail: "Schema can only mirror visible, approved FAQ content; this is not an AI citation claim.",
    acceptance: "Rerun the audit and confirm visible question-led sections are present before schema is added.",
    estimatedEffort: "30-90 min"
  });
}

function addCrawlProofBrief(audit = {}, add) {
  if (audit.status !== "ready") return;
  const orphanRepair = audit.repairOpportunities?.find((item) => /orphan|internal link|hub|sitemap/i.test(`${item.title} ${item.fix}`));
  if (!orphanRepair) return;
  add({
    id: "growth-crawl-hub-brief",
    sourceKind: "crawl",
    type: "internal_link_hub",
    title: "Draft a hub section from crawl proof",
    pageUrl: orphanRepair.pageUrl || "",
    pageLabel: orphanRepair.pageLabel || "",
    proof: orphanRepair.proof,
    suggestedAction: "Draft a hub or resource section that links important sitemap URLs from relevant rendered pages.",
    draftBrief: {
      summary: "Create a reviewed hub section that helps users and crawlers discover important pages.",
      sections: [
        "Top pages that need discovery",
        "Why each page matters",
        "Suggested anchor text and source page"
      ],
      audience: "Users who need a guided path to related pages"
    },
    guardrail: "Only suggest links to verified public URLs; do not fabricate pages or anchors.",
    acceptance: "Rerun the crawl and confirm important URLs appear in rendered internal links.",
    estimatedEffort: "30-90 min"
  });
}

function cleanLabel(value = "") {
  return String(value || "growth").replace(/^Competitor gap:\s*/i, "").trim() || "growth";
}

function formatCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString("en-US") : "0";
}

function formatPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${(number * 100).toFixed(number > 0 && number < 0.01 ? 1 : 0)}%`;
}

function formatPosition(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "unknown";
  return number.toFixed(number < 10 ? 1 : 0);
}

function slug(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "opportunity";
}
