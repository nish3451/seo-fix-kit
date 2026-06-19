const MAX_REPAIR_PROPOSALS = 25;

const REPAIR_EXECUTION_MODES = new Set([
  "generated_proposal",
  "cms_candidate",
  "github_pr_candidate",
  "manual_task",
  "unsupported"
]);

function buildRepairProposalsFromReport(report = {}, context = {}) {
  const targetUrl = context.targetUrl || report.url || "";
  const targetHost = context.targetHost || safeHost(targetUrl);
  const items = [
    ...(Array.isArray(report.findings) ? report.findings.map((item, index) => normalizeRepairItem(item, index, report, context, "finding")) : []),
    ...(Array.isArray(report.repairPlan) ? report.repairPlan.map((item, index) => normalizeRepairItem(item, index, report, context, "repair-plan")) : [])
  ]
    .filter((item) => item.title && item.severity !== "good")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.priority - b.priority);

  const proposals = [];
  const seen = new Set();
  for (const item of items) {
    const dedupeKey = `${slugify(item.title)}:${item.pageUrl || targetUrl}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const classification = classifyRepairItem(item);
    proposals.push({
      issueId: item.issueId || `repair-${item.priority}-${slugify(item.title)}`,
      issueTitle: item.title,
      targetUrl: item.pageUrl || targetUrl,
      targetHost,
      severity: item.severity || "notice",
      source: item.source || item.kind,
      priority: proposals.length + 1,
      executionMode: classification.mode,
      approvalStatus: "pending",
      deliveryStatus: "draft",
      generatedTitle: generatedProposalTitle(item, classification),
      generatedSummary: generatedProposalSummary(item, classification),
      proof: {
        evidence: item.proof,
        confidence: item.confidence || "verified",
        source: item.source || "",
        pageUrl: item.pageUrl || targetUrl
      },
      proposal: {
        fix: item.fix,
        snippet: item.snippet || "",
        workType: item.workType || classification.workType,
        estimatedEffort: item.estimatedEffort || "",
        modeReason: classification.reason,
        requiresOwnerApproval: true
      },
      acceptance: [item.acceptance || acceptanceForMode(item, classification)].filter(Boolean)
    });
    if (proposals.length >= Number(context.limit || MAX_REPAIR_PROPOSALS)) break;
  }
  return proposals;
}

function normalizeRepairItem(raw = {}, index, report = {}, context = {}, kind = "finding") {
  return {
    kind,
    priority: Number(raw.priority || index + 1),
    issueId: compactText(raw.id || raw.issueId || raw.issue_id || "", 160),
    title: compactText(raw.title || raw.name || "", 180),
    severity: compactText(raw.severity || "notice", 40),
    source: compactText(raw.source || "", 240),
    pageUrl: compactText(raw.pageUrl || raw.page_url || raw.url || "", 500),
    pageLabel: compactText(raw.pageLabel || raw.page_label || "", 120),
    proof: compactText(raw.evidence || raw.proof || raw.why || "", 1000),
    fix: compactText(raw.fix || raw.recommendation || raw.body || "", 1000),
    confidence: compactText(raw.confidence || "verified", 80),
    snippet: compactText(raw.snippet || "", 4000),
    estimatedEffort: compactText(raw.estimatedEffort || raw.estimated_effort || "", 80),
    workType: compactText(raw.workType || raw.work_type || "", 80),
    acceptance: compactText(raw.acceptance || raw.acceptanceCheck || raw.acceptance_check || "", 500),
    reportUrl: context.targetUrl || report.url || ""
  };
}

function classifyRepairItem(item = {}) {
  const haystack = `${item.title} ${item.fix} ${item.source} ${item.workType}`.toLowerCase();
  if (!item.fix && !item.snippet) {
    return {
      mode: "unsupported",
      workType: "review",
      reason: "The report proves an issue, but does not include enough repair detail to execute safely."
    };
  }
  if (hasAny(haystack, ["wordpress", "woocommerce", "shopify", "webflow", "cms", "platform-seo-audit"])) {
    return {
      mode: "cms_candidate",
      workType: item.workType || "content",
      reason: "Platform evidence exists, so this can become a CMS edit after owner approval and integration review."
    };
  }
  if (item.snippet && hasAny(haystack, ["schema", "canonical", "viewport", "doctype", "charset", "social share", "og:image", "twitter:image"])) {
    return {
      mode: "github_pr_candidate",
      workType: item.workType || "code",
      reason: "The audit produced a concrete head or markup snippet that can be reviewed as a code change."
    };
  }
  if (item.snippet && hasAny(haystack, ["title", "description", "h1", "alt"])) {
    return {
      mode: "generated_proposal",
      workType: item.workType || "content",
      reason: "The audit produced a concrete snippet or copy suggestion that still needs owner approval."
    };
  }
  if (
    hasAny(haystack, [
      "pagespeed",
      "core web vitals",
      "largest contentful paint",
      "total blocking time",
      "layout shift",
      "slow",
      "large image",
      "large html",
      "broken link",
      "broken image",
      "external link",
      "thin",
      "heading",
      "hreflang",
      "redirect",
      "https",
      "security",
      "robots",
      "sitemap",
      "backlink",
      "keyword"
    ])
  ) {
    return {
      mode: "manual_task",
      workType: item.workType || "technical",
      reason: "This needs customer, developer, or admin execution rather than a safe generated edit."
    };
  }
  return {
    mode: "manual_task",
    workType: item.workType || "review",
    reason: "The repair should be reviewed manually before execution."
  };
}

function generatedProposalTitle(item, classification) {
  const prefix = {
    generated_proposal: "Approve generated fix",
    cms_candidate: "Review CMS edit candidate",
    github_pr_candidate: "Review code change candidate",
    manual_task: "Assign manual repair",
    unsupported: "Needs unsupported-work review"
  }[classification.mode] || "Review repair";
  return `${prefix}: ${item.title}`;
}

function generatedProposalSummary(item, classification) {
  const fix = item.fix || "Review the evidence and decide whether this should be repaired.";
  return compactText(`${classification.reason} ${fix}`, 700);
}

function acceptanceForMode(item, classification) {
  if (classification.mode === "unsupported") return "Do not sell execution for this item until a safe repair path exists.";
  if (item.snippet) return "Owner approves the proposed change, then a rerun confirms the finding no longer appears.";
  return "Owner approves the task, execution is documented, and a rerun confirms the finding is gone or intentionally accepted.";
}

function normalizeRepairExecutionMode(value, fallback = "manual_task") {
  const mode = String(value || "").trim().toLowerCase();
  return REPAIR_EXECUTION_MODES.has(mode) ? mode : fallback;
}

function severityRank(severity = "") {
  return { critical: 0, warning: 1, notice: 2, good: 3 }[severity] ?? 4;
}

function hasAny(value = "", needles = []) {
  return needles.some((needle) => value.includes(needle));
}

function safeHost(value = "") {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function compactText(value = "", max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function slugify(value = "") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return slug || "repair";
}

export {
  MAX_REPAIR_PROPOSALS,
  REPAIR_EXECUTION_MODES,
  buildRepairProposalsFromReport,
  classifyRepairItem,
  normalizeRepairExecutionMode
};
