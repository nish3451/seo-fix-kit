import {
  CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
  SELF_SERVE_MAX_CRAWL_PAGES
} from "./crawl-depth.js";

export const LARGE_RENDERED_CRAWL_TARGET_PAGES = CRAWLRAVEN_PUBLIC_CRAWL_PAGES;
export const LARGE_RENDERED_CRAWL_BATCH_SIZE = SELF_SERVE_MAX_CRAWL_PAGES;
export const LARGE_RENDERED_CRAWL_MAX_RETRIES = 3;
export const LARGE_RENDERED_CRAWL_DEFAULT_CONCURRENCY = 4;
export const LARGE_RENDERED_CRAWL_MAX_CONCURRENCY = 8;
export const LARGE_RENDERED_CRAWL_MIN_DELAY_MS = 250;
export const LARGE_RENDERED_CRAWL_RETENTION_DAYS = 30;

export function normalizeLargeRenderedCrawlRequest(input = {}, targetUrl = "") {
  const normalizedTarget = normalizeHttpUrl(input.url || input.targetUrl || input.target_url || targetUrl || "");
  const targetHost = safeHost(normalizedTarget);
  const targetPages = clampNumber(input.targetPages || input.target_pages || input.maxPages || input.max_pages || LARGE_RENDERED_CRAWL_TARGET_PAGES, 1, LARGE_RENDERED_CRAWL_TARGET_PAGES);
  const batchSize = LARGE_RENDERED_CRAWL_BATCH_SIZE;
  const maxConcurrency = clampNumber(input.maxConcurrency || input.max_concurrency || LARGE_RENDERED_CRAWL_DEFAULT_CONCURRENCY, 1, LARGE_RENDERED_CRAWL_MAX_CONCURRENCY);
  const crawlDelayMs = clampNumber(input.crawlDelayMs || input.crawl_delay_ms || LARGE_RENDERED_CRAWL_MIN_DELAY_MS, LARGE_RENDERED_CRAWL_MIN_DELAY_MS, 10_000);
  const seedUrls = normalizeSeedUrls(input.seedUrls || input.seed_urls || [], normalizedTarget);

  return {
    ok: Boolean(normalizedTarget && targetHost),
    error: normalizedTarget ? "" : "Enter a valid public website URL.",
    targetUrl: normalizedTarget,
    targetHost,
    targetPages,
    batchSize,
    maxConcurrency,
    crawlDelayMs,
    seedUrls
  };
}

export function createLargeRenderedCrawlJob({
  id = "",
  ownerEmail = "",
  accessMode = "self-serve",
  targetUrl = "",
  targetPages = LARGE_RENDERED_CRAWL_TARGET_PAGES,
  batchSize = LARGE_RENDERED_CRAWL_BATCH_SIZE,
  maxConcurrency = LARGE_RENDERED_CRAWL_DEFAULT_CONCURRENCY,
  crawlDelayMs = LARGE_RENDERED_CRAWL_MIN_DELAY_MS,
  inventoryUrls = [],
  seedUrls = [],
  now = new Date().toISOString(),
  idFactory = defaultIdFactory
} = {}) {
  const normalizedTarget = normalizeHttpUrl(targetUrl);
  const targetHost = safeHost(normalizedTarget);
  const frontier = buildLargeCrawlFrontier({
    jobId: id || idFactory("lcj"),
    targetUrl: normalizedTarget,
    inventoryUrls,
    seedUrls,
    targetPages,
    batchSize,
    now,
    idFactory
  });
  const jobId = frontier.jobId;
  const batches = buildLargeCrawlBatches({
    jobId,
    frontierRows: frontier.rows,
    targetPages,
    batchSize,
    now,
    idFactory
  });

  return {
    job: {
      id: jobId,
      ownerEmail,
      accessMode,
      targetUrl: normalizedTarget,
      targetHost,
      targetPages,
      batchSize,
      maxConcurrency,
      crawlDelayMs,
      maxRetries: LARGE_RENDERED_CRAWL_MAX_RETRIES,
      status: frontier.rows.length ? "queued" : "needs_inventory",
      frontierUrlCount: frontier.rows.length,
      renderedUrlCount: 0,
      failedUrlCount: 0,
      completedBatchCount: 0,
      totalBatchCount: batches.length,
      reportId: "",
      error: frontier.rows.length ? "" : "No crawlable sitemap or seed URLs were available.",
      createdAt: now,
      updatedAt: now,
      startedAt: "",
      completedAt: "",
      expiresAt: isoDaysFromDate(now, LARGE_RENDERED_CRAWL_RETENTION_DAYS)
    },
    batches,
    frontierRows: frontier.rows,
    proofRows: []
  };
}

export function largeRenderedCrawlResponse(job = {}, batches = [], frontierRows = [], proofRows = []) {
  const progress = largeRenderedCrawlProgress(job, batches, frontierRows, proofRows);
  return {
    id: job.id || "",
    status: job.status || "queued",
    targetUrl: job.targetUrl || job.target_url || "",
    targetHost: job.targetHost || job.target_host || "",
    targetPages: Number(job.targetPages || job.target_pages || 0),
    batchSize: Number(job.batchSize || job.batch_size || LARGE_RENDERED_CRAWL_BATCH_SIZE),
    maxConcurrency: Number(job.maxConcurrency || job.max_concurrency || LARGE_RENDERED_CRAWL_DEFAULT_CONCURRENCY),
    crawlDelayMs: Number(job.crawlDelayMs || job.crawl_delay_ms || LARGE_RENDERED_CRAWL_MIN_DELAY_MS),
    maxRetries: Number(job.maxRetries || job.max_retries || LARGE_RENDERED_CRAWL_MAX_RETRIES),
    progress,
    batches: (batches || []).slice(0, 100).map(largeRenderedCrawlBatchResponse),
    sampleFrontier: (frontierRows || []).slice(0, 20).map(largeRenderedCrawlFrontierResponse),
    sampleProof: (proofRows || []).slice(0, 20).map(largeRenderedCrawlProofResponse),
    reportId: job.reportId || "",
    error: job.error || "",
    createdAt: job.createdAt || job.created_at || "",
    updatedAt: job.updatedAt || job.updated_at || "",
    startedAt: job.startedAt || job.started_at || "",
    completedAt: job.completedAt || job.completed_at || "",
    expiresAt: job.expiresAt || job.expires_at || ""
  };
}

export function largeRenderedCrawlProgress(job = {}, batches = [], frontierRows = [], proofRows = []) {
  const totalBatches = Number(job.totalBatchCount || job.total_batch_count || batches.length || 0);
  const completedBatches = Number(job.completedBatchCount || job.completed_batch_count || 0) || batches.filter((batch) => batch.status === "completed").length;
  const failedBatches = batches.filter((batch) => batch.status === "failed").length;
  const runningBatches = batches.filter((batch) => batch.status === "running").length;
  const frontierUrlCount = Number(job.frontierUrlCount || job.frontier_url_count || frontierRows.length || 0);
  const renderedUrlCount = Number(job.renderedUrlCount || job.rendered_url_count || 0) || proofRows.length;
  const failedUrlCount = Number(job.failedUrlCount || job.failed_url_count || 0) || frontierRows.filter((row) => row.status === "failed").length;
  const pendingUrlCount = Math.max(frontierUrlCount - renderedUrlCount - failedUrlCount, 0);
  const frontierIngestionComplete = ["", "complete"].includes(job.frontierIngestionStatus || job.frontier_ingestion_status || "complete");
  const readyToMerge = frontierIngestionComplete && frontierUrlCount > 0 && completedBatches === totalBatches && failedBatches === 0;

  return {
    totalBatches,
    completedBatches,
    failedBatches,
    runningBatches,
    queuedBatches: Math.max(totalBatches - completedBatches - failedBatches - runningBatches, 0),
    frontierUrlCount,
    renderedUrlCount,
    failedUrlCount,
    pendingUrlCount,
    renderedPercent: frontierUrlCount ? Math.round((renderedUrlCount / frontierUrlCount) * 100) : 0,
    batchPercent: totalBatches ? Math.round((completedBatches / totalBatches) * 100) : 0,
    readyToMerge,
    canClaim50kRendered: readyToMerge && renderedUrlCount >= LARGE_RENDERED_CRAWL_TARGET_PAGES
  };
}

export function claimNextLargeRenderedCrawlBatch(job = {}, batches = [], now = new Date().toISOString()) {
  if (!["queued", "running", "retrying"].includes(job.status || "queued")) {
    return { ok: false, error: "Large crawl job is not runnable." };
  }
  const batch = (batches || [])
    .sort((a, b) => Number(a.batchIndex || 0) - Number(b.batchIndex || 0))
    .find((item) => item.status === "queued" || (item.status === "failed" && Number(item.retryCount || 0) < LARGE_RENDERED_CRAWL_MAX_RETRIES));
  if (!batch) return { ok: false, error: "No runnable batch is available." };
  return {
    ok: true,
    job: {
      ...job,
      status: "running",
      startedAt: job.startedAt || now,
      updatedAt: now
    },
    batch: {
      ...batch,
      status: "running",
      retryCount: batch.status === "failed" ? Number(batch.retryCount || 0) + 1 : Number(batch.retryCount || 0),
      leasedAt: now,
      startedAt: batch.startedAt || now,
      updatedAt: now,
      error: ""
    }
  };
}

export function completeLargeRenderedCrawlBatch(job = {}, batch = {}, batches = [], frontierRows = [], proofRows = [], now = new Date().toISOString()) {
  const batchFrontier = (frontierRows || []).filter((row) => row.batchId === batch.id);
  const batchProof = (proofRows || []).filter((row) => row.batchId === batch.id);
  const failedRows = batchFrontier.filter((row) => row.status === "failed").length;
  const completedBatch = {
    ...batch,
    status: failedRows ? "failed" : "completed",
    renderedUrlCount: batchProof.length,
    failedUrlCount: failedRows,
    completedAt: failedRows ? "" : now,
    updatedAt: now,
    error: failedRows ? `${failedRows} URL proofs failed in this batch.` : ""
  };
  const allBatches = [completedBatch, ...((batches || job.batches || []).filter((item) => item.id !== batch.id))];
  const progress = largeRenderedCrawlProgress(job, allBatches, frontierRows, proofRows);
  return {
    job: {
      ...job,
      status: progress.readyToMerge ? "ready_to_merge" : failedRows ? "retrying" : "running",
      renderedUrlCount: progress.renderedUrlCount,
      failedUrlCount: progress.failedUrlCount,
      completedBatchCount: progress.completedBatches,
      updatedAt: now,
      completedAt: progress.readyToMerge ? now : ""
    },
    batch: completedBatch,
    progress
  };
}

export function retryLargeRenderedCrawlFailures(job = {}, batches = [], frontierRows = [], now = new Date().toISOString()) {
  const retryableBatches = new Set(
    (batches || [])
      .filter((batch) => batch.status === "failed" && Number(batch.retryCount || 0) < LARGE_RENDERED_CRAWL_MAX_RETRIES)
      .map((batch) => batch.id)
  );
  const updatedBatches = (batches || []).map((batch) =>
    retryableBatches.has(batch.id)
      ? { ...batch, status: "queued", error: "", updatedAt: now }
      : batch
  );
  const updatedFrontier = (frontierRows || []).map((row) =>
    retryableBatches.has(row.batchId) && row.status === "failed" && Number(row.retryCount || 0) < LARGE_RENDERED_CRAWL_MAX_RETRIES
      ? { ...row, status: "queued", lastError: "", updatedAt: now }
      : row
  );
  return {
    job: {
      ...job,
      status: retryableBatches.size ? "queued" : job.status,
      updatedAt: now
    },
    batches: updatedBatches,
    frontierRows: updatedFrontier,
    retryableBatchCount: retryableBatches.size
  };
}

export function largeRenderedCrawlProofFromPage(job = {}, batch = {}, frontierRow = {}, page = {}, now = new Date().toISOString()) {
  const rendered = page.rendered || page.static || {};
  return {
    id: defaultIdFactory("lcp"),
    crawlJobId: job.id || "",
    batchId: batch.id || frontierRow.batchId || "",
    frontierId: frontierRow.id || "",
    url: frontierRow.url || page.url || "",
    finalUrl: page.finalUrl || rendered.finalUrl || page.url || "",
    statusCode: Number(page.status || rendered.status || 0),
    contentType: page.contentType || "",
    title: cleanText(rendered.title || "", 220),
    description: cleanText(rendered.description || "", 320),
    h1s: (rendered.h1s || []).slice(0, 5),
    canonical: rendered.canonical || "",
    robots: rendered.robots || "",
    internalLinksCount: (rendered.internalLinks || []).length,
    externalLinksCount: (rendered.externalLinks || []).length,
    schemaTypes: (rendered.schemaTypes || []).slice(0, 20),
    resourceTiming: page.resourceWaterfall?.summary || {},
    issueFacts: {
      missingTitle: !rendered.title,
      missingDescription: !rendered.description,
      missingH1: !(rendered.h1s || []).length,
      noindex: /\bnoindex\b/i.test(rendered.robots || ""),
      canonical: rendered.canonical || "",
      wordCount: rendered.wordCount || 0
    },
    renderedAt: now,
    createdAt: now
  };
}

export function largeRenderedCrawlMergeReadiness(job = {}, batches = [], frontierRows = [], proofRows = []) {
  const progress = largeRenderedCrawlProgress(job, batches, frontierRows, proofRows);
  const blockers = [];
  const frontierIngestionStatus = job.frontierIngestionStatus || job.frontier_ingestion_status || "complete";
  if (!["", "complete"].includes(frontierIngestionStatus)) blockers.push("URL frontier ingestion is not complete yet.");
  if (!progress.frontierUrlCount) blockers.push("No URL frontier is stored.");
  if (progress.runningBatches) blockers.push("Rendered batches are still running.");
  if (progress.queuedBatches) blockers.push("Rendered batches are still queued.");
  if (progress.failedBatches || progress.failedUrlCount) blockers.push("Failed batches or URLs need retry or explicit exclusion.");
  if (progress.renderedUrlCount < progress.frontierUrlCount) blockers.push("Not every frontier URL has lightweight render proof.");
  return {
    ready: blockers.length === 0,
    blockers,
    progress
  };
}

function buildLargeCrawlFrontier({ jobId, targetUrl, inventoryUrls = [], seedUrls = [], targetPages, batchSize, now, idFactory }) {
  const targetHost = safeHost(targetUrl);
  const sources = [
    ...normalizeSeedUrls(seedUrls, targetUrl),
    ...normalizeInventoryUrls(inventoryUrls)
  ];
  if (targetUrl) sources.unshift(targetUrl);
  const seen = new Set();
  const rows = [];
  for (const item of sources) {
    if (rows.length >= targetPages) break;
    const url = normalizeHttpUrl(item.url || item);
    if (!url || safeHost(url) !== targetHost || seen.has(url)) continue;
    seen.add(url);
    rows.push({
      id: idFactory("lcf"),
      crawlJobId: jobId,
      batchId: "",
      url,
      normalizedUrl: stripHash(url),
      status: "queued",
      retryCount: 0,
      lastError: "",
      discoveredFrom: item.discoveredFrom || item.source || "sitemap-or-seed",
      depth: Number(item.depth || 0),
      priority: rows.length + 1,
      createdAt: now,
      updatedAt: now
    });
  }
  return { jobId, rows: assignFrontierBatches(rows, jobId, batchSize, idFactory, now) };
}

function buildLargeCrawlBatches({ jobId, frontierRows = [], targetPages, batchSize, now, idFactory }) {
  const totalBatches = Math.ceil(Math.min(frontierRows.length || targetPages, targetPages) / batchSize);
  return Array.from({ length: totalBatches }, (_, index) => {
    const batchIndex = index + 1;
    const startIndex = index * batchSize + 1;
    const endIndex = Math.min(startIndex + batchSize - 1, frontierRows.length || targetPages);
    const rows = frontierRows.filter((row) => row.batchIndex === batchIndex);
    return {
      id: rows[0]?.batchId || idFactory("lcb"),
      crawlJobId: jobId,
      batchIndex,
      startIndex,
      endIndex,
      plannedUrlCount: rows.length || Math.max(endIndex - startIndex + 1, 0),
      renderedUrlCount: 0,
      failedUrlCount: 0,
      status: rows.length ? "queued" : "waiting_for_frontier",
      retryCount: 0,
      error: "",
      leasedAt: "",
      startedAt: "",
      completedAt: "",
      createdAt: now,
      updatedAt: now
    };
  });
}

function assignFrontierBatches(rows, jobId, batchSize, idFactory, now) {
  const batchIds = new Map();
  return rows.map((row, index) => {
    const batchIndex = Math.floor(index / batchSize) + 1;
    if (!batchIds.has(batchIndex)) batchIds.set(batchIndex, idFactory("lcb"));
    return {
      ...row,
      crawlJobId: jobId,
      batchId: batchIds.get(batchIndex),
      batchIndex,
      updatedAt: now
    };
  });
}

function largeRenderedCrawlBatchResponse(batch = {}) {
  return {
    id: batch.id || "",
    batchIndex: Number(batch.batchIndex || batch.batch_index || 0),
    startIndex: Number(batch.startIndex || batch.start_index || 0),
    endIndex: Number(batch.endIndex || batch.end_index || 0),
    plannedUrlCount: Number(batch.plannedUrlCount || batch.planned_url_count || 0),
    renderedUrlCount: Number(batch.renderedUrlCount || batch.rendered_url_count || 0),
    failedUrlCount: Number(batch.failedUrlCount || batch.failed_url_count || 0),
    status: batch.status || "queued",
    retryCount: Number(batch.retryCount || batch.retry_count || 0),
    error: batch.error || "",
    updatedAt: batch.updatedAt || batch.updated_at || ""
  };
}

function largeRenderedCrawlFrontierResponse(row = {}) {
  return {
    id: row.id || "",
    batchId: row.batchId || row.batch_id || "",
    url: row.url || "",
    status: row.status || "queued",
    retryCount: Number(row.retryCount || row.retry_count || 0),
    lastError: row.lastError || row.last_error || ""
  };
}

function largeRenderedCrawlProofResponse(row = {}) {
  return {
    id: row.id || "",
    batchId: row.batchId || row.batch_id || "",
    url: row.url || "",
    finalUrl: row.finalUrl || row.final_url || "",
    statusCode: Number(row.statusCode || row.status_code || 0),
    title: row.title || "",
    canonical: row.canonical || "",
    renderedAt: row.renderedAt || row.rendered_at || ""
  };
}

function normalizeInventoryUrls(items = []) {
  return (items || [])
    .map((item) => ({
      url: normalizeHttpUrl(item.url || item.loc || item),
      source: item.source || "sitemap",
      discoveredFrom: item.discoveredFrom || "sitemap"
    }))
    .filter((item) => item.url);
}

function normalizeSeedUrls(items = [], targetUrl = "") {
  const values = Array.isArray(items) ? items : String(items || "").split(/\r?\n|,/);
  const targetHost = safeHost(targetUrl);
  return values
    .map((value) => normalizeHttpUrl(value.url || value))
    .filter((url) => url && (!targetHost || safeHost(url) === targetHost))
    .map((url) => ({ url, source: "seed", discoveredFrom: "manual-seed" }));
}

function normalizeHttpUrl(input = "") {
  try {
    const trimmed = String(input || "").trim();
    if (!trimmed) return "";
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.href;
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
    return url.href;
  } catch {
    return String(value || "").split("#")[0];
  }
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function cleanText(value = "", maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isoDaysFromDate(value, days) {
  const start = new Date(value);
  const base = Number.isNaN(start.getTime()) ? Date.now() : start.getTime();
  return new Date(base + Number(days || 0) * 24 * 60 * 60 * 1000).toISOString();
}

function defaultIdFactory(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
