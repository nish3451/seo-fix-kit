import assert from "node:assert/strict";
import {
  LARGE_RENDERED_CRAWL_TARGET_PAGES,
  claimNextLargeRenderedCrawlBatch,
  completeLargeRenderedCrawlBatch,
  createLargeRenderedCrawlJob,
  largeRenderedCrawlMergeReadiness,
  largeRenderedCrawlProofFromPage,
  largeRenderedCrawlResponse,
  normalizeLargeRenderedCrawlRequest,
  retryLargeRenderedCrawlFailures
} from "../shared/large-rendered-crawl.js";

let idCounter = 0;
const idFactory = (prefix) => `${prefix}-${++idCounter}`;
const now = "2026-06-05T00:00:00.000Z";
const inventoryUrls = [
  "https://example.com/",
  ...Array.from({ length: 2005 }, (_, index) => `https://example.com/page-${index + 1}`)
];

const normalized = normalizeLargeRenderedCrawlRequest({
  target_url: "https://example.com/",
  target_pages: LARGE_RENDERED_CRAWL_TARGET_PAGES,
  batch_size: 2,
  max_concurrency: 4,
  crawl_delay_ms: 250,
  seed_urls: ["https://example.com/manual-seed", "https://offsite.example/page"]
});

assert.equal(normalized.ok, true);
assert.equal(normalized.targetPages, 50000);
assert.equal(normalized.batchSize, 1000);
assert.deepEqual(normalized.seedUrls.map((row) => row.url), ["https://example.com/manual-seed"]);

const created = createLargeRenderedCrawlJob({
  ownerEmail: "founder@example.com",
  targetUrl: normalized.targetUrl,
  targetPages: normalized.targetPages,
  batchSize: normalized.batchSize,
  maxConcurrency: normalized.maxConcurrency,
  crawlDelayMs: normalized.crawlDelayMs,
  seedUrls: normalized.seedUrls,
  inventoryUrls,
  now,
  idFactory
});

assert.equal(created.job.targetPages, 50000);
assert.equal(created.job.frontierUrlCount, 2007);
assert.equal(created.job.totalBatchCount, 3);
assert.equal(created.batches.length, 3);
assert.equal(created.batches[0].plannedUrlCount, 1000);

const claimed = claimNextLargeRenderedCrawlBatch(created.job, created.batches, now);
assert.equal(claimed.ok, true);
assert.equal(claimed.job.status, "running");
assert.equal(claimed.batch.status, "running");

const firstBatchFrontier = created.frontierRows.filter((row) => row.batchId === claimed.batch.id);
const proofRows = firstBatchFrontier.map((row) =>
  largeRenderedCrawlProofFromPage(
    claimed.job,
    claimed.batch,
    row,
    {
      url: row.url,
      finalUrl: row.url,
      status: 200,
      contentType: "text/html",
      rendered: {
        finalUrl: row.url,
        title: `Rendered ${row.priority}`,
        description: "A rendered proof row.",
        h1s: ["Proof page"],
        canonical: row.url,
        robots: "index,follow",
        internalLinks: [],
        externalLinks: [],
        schemaTypes: ["WebPage"],
        wordCount: 120
      }
    },
    now
  )
);
const renderedFrontier = created.frontierRows.map((row) =>
  row.batchId === claimed.batch.id ? { ...row, status: "rendered" } : row
);
const completed = completeLargeRenderedCrawlBatch(claimed.job, claimed.batch, created.batches, renderedFrontier, proofRows, now);
assert.equal(completed.batch.status, "completed");
assert.equal(completed.progress.readyToMerge, false);

const failedBatch = created.batches[1];
const failedFrontier = renderedFrontier.map((row) =>
  row.batchId === failedBatch.id ? { ...row, status: "failed", retryCount: 1, lastError: "render timeout" } : row
);
const retry = retryLargeRenderedCrawlFailures(
  { ...completed.job, status: "retrying" },
  created.batches.map((batch) => batch.id === failedBatch.id ? { ...batch, status: "failed", retryCount: 1 } : batch),
  failedFrontier,
  now
);
assert.equal(retry.retryableBatchCount, 1);
assert.equal(retry.batches.find((batch) => batch.id === failedBatch.id).status, "queued");
assert.equal(retry.frontierRows.find((row) => row.batchId === failedBatch.id).status, "queued");

const allProofRows = created.frontierRows.map((row) => ({
  id: `proof-${row.id}`,
  crawlJobId: created.job.id,
  batchId: row.batchId,
  frontierId: row.id,
  url: row.url,
  finalUrl: row.url,
  statusCode: 200,
  title: "Rendered",
  canonical: row.url,
  renderedAt: now
}));
const allBatchesComplete = created.batches.map((batch) => ({
  ...batch,
  status: "completed",
  renderedUrlCount: created.frontierRows.filter((row) => row.batchId === batch.id).length
}));
const allFrontierRendered = created.frontierRows.map((row) => ({ ...row, status: "rendered" }));
const response = largeRenderedCrawlResponse(
  {
    ...created.job,
    status: "ready_to_merge",
    renderedUrlCount: allProofRows.length,
    completedBatchCount: allBatchesComplete.length
  },
  allBatchesComplete,
  allFrontierRendered,
  allProofRows
);
const readiness = largeRenderedCrawlMergeReadiness(
  {
    ...created.job,
    renderedUrlCount: allProofRows.length,
    completedBatchCount: allBatchesComplete.length
  },
  allBatchesComplete,
  allFrontierRendered,
  allProofRows
);

assert.equal(response.progress.readyToMerge, true);
assert.equal(response.progress.canClaim50kRendered, false);
assert.equal(readiness.ready, true);

console.log(JSON.stringify({
  ok: true,
  targetPages: response.targetPages,
  frontierUrlCount: response.progress.frontierUrlCount,
  totalBatches: response.progress.totalBatches,
  readyToMerge: response.progress.readyToMerge,
  canClaim50kRendered: response.progress.canClaim50kRendered
}, null, 2));
