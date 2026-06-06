import {
  CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES,
  CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
  SELF_SERVE_MAX_CRAWL_PAGES
} from "./crawl-depth.js";

export const RENDERED_CRAWL_BATCH_PAGES = SELF_SERVE_MAX_CRAWL_PAGES;
export const RENDERED_CRAWL_TARGETS = [
  {
    id: "standard",
    label: "Standard rendered proof",
    pages: SELF_SERVE_MAX_CRAWL_PAGES,
    description: "Render the selected crawl depth in one queued proof run."
  },
  {
    id: "public-scale",
    label: "50K staged crawl plan",
    pages: CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
    description: "Plan CrawlRaven public-scale rendered batches without claiming they ran yet."
  },
  {
    id: "enterprise-scale",
    label: "100K staged crawl plan",
    pages: CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES,
    description: "Plan enterprise rendered batches for very large verified sites."
  }
];

export function normalizeRenderedCrawlTarget(value, options = {}) {
  const defaultPages = Number(options.defaultPages || 0);
  const maxPages = Number(options.maxPages || CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultPages;
  return Math.min(Math.max(Math.round(parsed), 0), maxPages);
}

export function renderedCrawlTargetSummary(value) {
  const pages = normalizeRenderedCrawlTarget(value);
  const tier = RENDERED_CRAWL_TARGETS.find((item) => item.pages === pages) || {
    id: pages ? "custom-scale" : "none",
    label: pages ? `${pages.toLocaleString("en-US")} staged pages` : "No staged target",
    pages,
    description: pages ? "Custom staged rendered crawl target." : "Only the selected crawl depth will render."
  };
  return {
    pages,
    tierId: tier.id,
    tierLabel: tier.label,
    description: tier.description,
    batchSize: RENDERED_CRAWL_BATCH_PAGES,
    plannedBatches: pages ? Math.ceil(pages / RENDERED_CRAWL_BATCH_PAGES) : 0,
    crawlRavenPublicPages: CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
    crawlRavenEnterprisePages: CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES
  };
}

export function buildRenderedCrawlScalePlan(report = {}, inventory = {}, options = {}) {
  const renderedPages = Number(report.summary?.pagesScanned || report.pages?.length || 0);
  const selectedMaxPages = Number(report.summary?.maxPages || report.crawlDepth?.pages || renderedPages || 0);
  const inventoryUrls = Number(inventory.summary?.urlsDiscovered || 0);
  const requestedTarget = normalizeRenderedCrawlTarget(
    options.renderedCrawlTarget || options.crawlScaleTarget || 0
  );
  const shouldPlan = requestedTarget > selectedMaxPages || inventoryUrls > selectedMaxPages;

  if (!shouldPlan) {
    return {
      status: "skipped",
      source: "rendered-crawl-scale-plan",
      summary: {
        renderedPages,
        selectedMaxPages,
        requestedTargetPages: requestedTarget,
        inventoryUrlsAvailable: inventoryUrls
      },
      batches: [],
      repairOpportunities: []
    };
  }

  const targetPages = requestedTarget || Math.min(Math.max(inventoryUrls, selectedMaxPages), CRAWLRAVEN_PUBLIC_CRAWL_PAGES);
  const plannedUrlCount = inventoryUrls ? Math.min(inventoryUrls, targetPages) : targetPages;
  const plannedBatches = Math.ceil(plannedUrlCount / RENDERED_CRAWL_BATCH_PAGES);
  const renderedCoveragePercent = plannedUrlCount
    ? Math.round((Math.min(renderedPages, plannedUrlCount) / plannedUrlCount) * 100)
    : 0;
  const batches = buildBatchPreview(inventory.sampleUrls || [], plannedUrlCount, renderedPages);
  const repairOpportunities = scaleRepairOpportunities({
    renderedPages,
    selectedMaxPages,
    requestedTarget: targetPages,
    inventoryUrls,
    plannedUrlCount,
    plannedBatches,
    inventory
  });

  return {
    status: "ready",
    source: "rendered-crawl-scale-plan",
    note: "This is a staged rendered-crawl plan. It does not claim the 50K or 100K rendered crawl has completed until every batch has proof.",
    summary: {
      renderedPages,
      selectedMaxPages,
      requestedTargetPages: targetPages,
      inventoryUrlsAvailable: inventoryUrls,
      plannedUrlCount,
      batchSize: RENDERED_CRAWL_BATCH_PAGES,
      plannedBatches,
      renderedCoveragePercent,
      unrenderedPlannedUrls: Math.max(plannedUrlCount - renderedPages, 0),
      crawlRavenPublicPages: CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
      crawlRavenEnterprisePages: CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES,
      publicScaleReady: plannedUrlCount >= CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
      enterpriseScaleReady: plannedUrlCount >= CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES,
      repairOpportunityCount: repairOpportunities.length
    },
    batches,
    repairOpportunities
  };
}

export function renderedCrawlScaleBriefLines(plan = {}) {
  if (plan.status !== "ready") return [];
  const summary = plan.summary || {};
  const lines = [
    "## Rendered crawl scale plan",
    "",
    `Rendered pages in this run: ${summary.renderedPages || 0}`,
    `Requested rendered target: ${summary.requestedTargetPages || 0}`,
    `Inventory URLs available: ${summary.inventoryUrlsAvailable || 0}`,
    `Planned rendered batches: ${summary.plannedBatches || 0}`,
    `Batch size: ${summary.batchSize || RENDERED_CRAWL_BATCH_PAGES}`,
    `Rendered coverage of staged plan: ${summary.renderedCoveragePercent || 0}%`,
    ""
  ];

  if (plan.repairOpportunities?.length) {
    lines.push("### Scale readiness actions", "");
    for (const item of plan.repairOpportunities.slice(0, 8)) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
    }
    lines.push("");
  }

  return lines;
}

export function renderedCrawlScaleSummaryCopy(plan = {}) {
  if (plan.status !== "ready") return "";
  const summary = plan.summary || {};
  return [
    `This report rendered ${summary.renderedPages || 0} pages and prepared a staged plan for ${formatCount(summary.plannedUrlCount || summary.requestedTargetPages || 0)} URLs.`,
    `At ${formatCount(summary.batchSize || RENDERED_CRAWL_BATCH_PAGES)} pages per rendered batch, that is ${formatCount(summary.plannedBatches || 0)} batches before a 50K/100K claim can be made.`
  ].join(" ");
}

function buildBatchPreview(sampleUrls = [], plannedUrlCount = 0, renderedPages = 0) {
  const batches = [];
  const previewCount = Math.min(Math.ceil(plannedUrlCount / RENDERED_CRAWL_BATCH_PAGES), 5);
  for (let index = 0; index < previewCount; index += 1) {
    const start = index * RENDERED_CRAWL_BATCH_PAGES;
    const end = Math.min(start + RENDERED_CRAWL_BATCH_PAGES, plannedUrlCount);
    batches.push({
      batch: index + 1,
      startIndex: start + 1,
      endIndex: end,
      plannedUrlCount: Math.max(end - start, 0),
      status: renderedPages >= end ? "rendered" : "planned",
      sampleUrls: index === 0 ? sampleUrls.slice(0, 10).map((item) => item.url || item).filter(Boolean) : []
    });
  }
  return batches;
}

function scaleRepairOpportunities({ renderedPages, selectedMaxPages, requestedTarget, inventoryUrls, plannedUrlCount, plannedBatches, inventory }) {
  const repairs = [];
  const addRepair = (item) => {
    repairs.push({
      priority: repairs.length + 1,
      confidence: "needs-review",
      estimatedEffort: item.estimatedEffort || "30-90 min",
      workType: item.workType || "technical",
      acceptance: item.acceptance || "Run staged rendered batches and verify each batch stores page-level proof.",
      source: "rendered-crawl-scale-plan",
      ...item
    });
  };

  if (requestedTarget > selectedMaxPages) {
    addRepair({
      severity: "warning",
      title: "Requested crawl scale needs staged rendered batches",
      proof: `This run rendered ${renderedPages} pages from a selected limit of ${selectedMaxPages}, while the staged target is ${requestedTarget} pages.`,
      fix: "Process the crawl target as resumable rendered batches, then merge batch reports only after every batch has page-level proof.",
      acceptance: "Every planned batch has a completed proof record before the product claims public-scale rendered coverage."
    });
  }

  if (!inventoryUrls) {
    addRepair({
      severity: "warning",
      title: "Large rendered crawl needs complete sitemap inventory",
      proof: "No sitemap inventory URLs were available to seed staged rendered batches.",
      fix: "Publish a complete sitemap index and reference it from robots.txt before running a large rendered crawl.",
      acceptance: "The sitemap inventory discovers the URLs needed for the staged crawl target."
    });
  } else if (inventoryUrls < requestedTarget) {
    addRepair({
      severity: "notice",
      title: "Sitemap inventory is smaller than the rendered crawl target",
      proof: `The staged target is ${requestedTarget} pages, but sitemap inventory found ${inventoryUrls} URLs.`,
      fix: "Confirm the sitemap index includes all canonical URLs, or lower the rendered target to match the verified inventory.",
      acceptance: "Sitemap inventory count matches the intended rendered crawl target."
    });
  }

  if (inventory?.summary?.truncated) {
    addRepair({
      severity: "notice",
      title: "Inventory was truncated before large-crawl planning finished",
      proof: "The sitemap inventory hit its configured cap before discovery completed.",
      fix: "Increase inventory limits or split sitemap indexes so the large rendered crawl can be planned from complete inputs.",
      acceptance: "Inventory discovery completes without truncation before staged rendering starts."
    });
  }

  if (plannedBatches > 1) {
    addRepair({
      severity: "notice",
      title: "Track large-crawl progress by batch",
      proof: `${plannedUrlCount} planned URLs require ${plannedBatches} rendered batches at ${RENDERED_CRAWL_BATCH_PAGES} pages per batch.`,
      fix: "Expose batch status, failed URLs, retry counts, and merged repair deltas before calling the large crawl complete.",
      acceptance: "The report shows completed, failed, retried, and pending rendered batches separately."
    });
  }

  return repairs;
}

function formatCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Math.round(number).toLocaleString("en-US");
}
