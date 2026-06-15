import assert from "node:assert/strict";
import { largeCrawlProofWriteStatus } from "../shared/large-crawl-proof-writer.js";
import {
  claimLargeRenderedCrawlBatchForAccess,
  findLargeCrawlFrontierRow,
  largeCrawlBatchLeaseIsActive,
  saveLargeRenderedCrawlBatchProofForAccess
} from "../worker/routes/large-crawls.js";

const forgedProofRequest = new Request("https://seofixkit.com/api/large-crawls/job_1/batches/batch_1/proof", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    pages: [
      {
        frontierId: "frontier_1",
        url: "https://example.com/",
        rendered: { title: "Forged rendered proof" }
      }
    ]
  })
});

const forgedProofResponse = await saveLargeRenderedCrawlBatchProofForAccess(
  forgedProofRequest,
  {},
  { ownerEmail: "owner@example.com" },
  "/api/large-crawls/"
);
assert.equal(forgedProofResponse.status, 403);
const forgedProofBody = await forgedProofResponse.json();
assert.equal(forgedProofBody.code, "TRUSTED_RENDERER_REQUIRED");

const forgedClaimRequest = new Request("https://seofixkit.com/api/large-crawls/job_1/batches/claim", {
  method: "POST"
});
const forgedClaimResponse = await claimLargeRenderedCrawlBatchForAccess(
  forgedClaimRequest,
  {},
  { ownerEmail: "owner@example.com" },
  "/api/large-crawls/"
);
assert.equal(forgedClaimResponse.status, 403);
const forgedClaimBody = await forgedClaimResponse.json();
assert.equal(forgedClaimBody.code, "TRUSTED_RENDERER_REQUIRED");

assert.equal(largeCrawlProofWriteStatus({ trustedRenderer: true }).ok, true);
assert.equal(
  largeCrawlProofWriteStatus({
    headers: { "x-seofixkit-worker-token": "secret" },
    env: { SEOFIXKIT_LARGE_CRAWL_WORKER_TOKEN: "secret" }
  }).ok,
  true
);
assert.equal(
  largeCrawlProofWriteStatus({
    headers: { "x-seofixkit-worker-token": "wrong" },
    env: { SEOFIXKIT_LARGE_CRAWL_WORKER_TOKEN: "secret" }
  }).ok,
  false
);

assert.equal(
  largeCrawlBatchLeaseIsActive(
    { status: "running", leasedAt: "2026-06-15T12:00:00.000Z" },
    Date.parse("2026-06-15T12:05:00.000Z")
  ),
  true
);
assert.equal(
  largeCrawlBatchLeaseIsActive(
    { status: "running", leasedAt: "2026-06-15T12:00:00.000Z" },
    Date.parse("2026-06-15T12:20:01.000Z")
  ),
  false
);
assert.equal(
  largeCrawlBatchLeaseIsActive(
    { status: "completed", leasedAt: "2026-06-15T12:00:00.000Z" },
    Date.parse("2026-06-15T12:05:00.000Z")
  ),
  false
);

const frontierRows = [
  { id: "frontier_1", batchId: "batch_1", url: "https://example.com/a", status: "rendering" },
  { id: "frontier_2", batchId: "batch_1", url: "https://example.com/b", status: "rendering" },
  { id: "frontier_3", batchId: "batch_1", url: "https://example.com/foo/", status: "rendering" }
];
assert.equal(
  findLargeCrawlFrontierRow(frontierRows, "batch_1", {
    frontierId: "frontier_1",
    url: "https://example.com/b"
  }),
  null
);
assert.equal(
  findLargeCrawlFrontierRow(frontierRows, "batch_1", {
    frontierId: "frontier_1",
    url: "https://example.com/a"
  })?.id,
  "frontier_1"
);
assert.equal(
  findLargeCrawlFrontierRow(frontierRows, "batch_1", {
    frontierId: "frontier_3",
    url: "https://example.com/foo"
  })?.id,
  "frontier_3"
);

console.log(JSON.stringify({ ok: true, checked: "large crawl proof write trust gate" }, null, 2));
