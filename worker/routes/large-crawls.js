import { publicAuditUrlStatus } from "../../shared/audit-engine.js";
import { buildCrawlInventory } from "../../shared/crawl-inventory.js";
import { largeCrawlProofWriteStatus } from "../../shared/large-crawl-proof-writer.js";
import {
  LARGE_RENDERED_CRAWL_MAX_RETRIES,
  claimNextLargeRenderedCrawlBatch,
  createLargeRenderedCrawlJob,
  largeRenderedCrawlMergeReadiness,
  largeRenderedCrawlProofFromPage,
  largeRenderedCrawlResponse,
  normalizeLargeRenderedCrawlRequest,
  retryLargeRenderedCrawlFailures
} from "../../shared/large-rendered-crawl.js";
import {
  apiAccessResponse,
  apiAccessStatus,
  auditAuthorizationStatus,
  betaAccessResponse,
  betaAccessStatus
} from "../lib/auth.js";
import { runD1BatchChunks } from "../lib/db.js";
import { jsonNoStore } from "../lib/http.js";
import { checkQuotaSet, sha256Hex, workerLargeCrawlId } from "../lib/security.js";
import { cleanText, dayWindow, parseJson, safeHostname } from "../lib/text.js";
import { deliverApiWebhooks } from "../lib/webhooks.js";
import { auditUrl } from "./audits.js";

const LARGE_RENDERED_CRAWL_LEASE_MS = 15 * 60 * 1000;

const LARGE_RENDERED_CRAWL_SYNC_FRONTIER_LIMIT = 1000;

async function createLargeRenderedCrawl(request, env, ctx) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  const body = await request.json().catch(() => ({}));
  return createLargeRenderedCrawlForAccess(request, env, access, body, { api: false, ctx });
}

async function apiCreateLargeRenderedCrawl(request, env, ctx) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const body = await request.json().catch(() => ({}));
  return createLargeRenderedCrawlForAccess(request, env, access, body, { api: true, ctx });
}

async function createLargeRenderedCrawlForAccess(request, env, access, body = {}, options = {}) {
  if (!env.WAITLIST_DB) return jsonNoStore({ error: "Large crawl storage is not configured." }, 503);
  const normalized = normalizeLargeRenderedCrawlRequest(body, body.url || body.targetUrl || body.target_url || "");
  if (!normalized.ok) return jsonNoStore({ error: normalized.error || "Enter a valid public website URL." }, 400);
  const publicUrlCheck = publicAuditUrlStatus(normalized.targetUrl);
  if (!publicUrlCheck.ok) return jsonNoStore({ error: publicUrlCheck.error }, 400);
  const authorization = await auditAuthorizationStatus(env, access, normalized.targetUrl);
  if (!authorization.ok) {
    return jsonNoStore(
      {
        error: authorization.error,
        code: authorization.code,
        site: authorization.site
      },
      authorization.status || 403
    );
  }
  const existing = await activeLargeRenderedCrawlForTarget(env, access, normalized.targetUrl);
  if (existing?.id) {
    const response = await largeRenderedCrawlResponseForRow(env, existing);
    return jsonNoStore(
      options.api
        ? {
            ok: true,
            deduped: true,
            large_crawl: apiLargeRenderedCrawlResponse(response),
            large_crawl_id: existing.id,
            status_url: `/v1/large-crawls/${existing.id}`
          }
        : {
            ok: true,
            mode: "queued",
            deduped: true,
            largeCrawl: response,
            largeCrawlId: existing.id,
            statusUrl: `/api/large-crawls/${existing.id}`
          },
      202
    );
  }
  const activeCount = await activeLargeRenderedCrawlCount(env, access);
  if (activeCount >= 1) {
    return jsonNoStore(
      {
        error: "You already have a large rendered crawl running. Wait for it to finish, retry, or cancel it before starting another.",
        code: "LARGE_CRAWL_ACTIVE_LIMIT"
      },
      429
    );
  }
  const quota = await largeCrawlQuotaStatus(request, env, access, normalized.targetUrl);
  if (!quota.ok) return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  const billing = largeCrawlBillingStatus(env, access);
  if (!billing.ok) return jsonNoStore({ error: billing.error, code: billing.code }, billing.status);

  const inventory = await buildCrawlInventory(normalized.targetUrl, {
    includeUrls: true,
    maxUrls: Math.min(normalized.targetPages, LARGE_RENDERED_CRAWL_SYNC_FRONTIER_LIMIT),
    maxSitemaps: 25,
    fetcher: fetch
  });
  const created = createLargeRenderedCrawlJob({
    ownerEmail: access.ownerEmail,
    accessMode: access.accessMode || "self-serve",
    targetUrl: normalized.targetUrl,
    targetPages: normalized.targetPages,
    batchSize: normalized.batchSize,
    maxConcurrency: normalized.maxConcurrency,
    crawlDelayMs: normalized.crawlDelayMs,
    inventoryUrls: inventory.urls || [],
    seedUrls: normalized.seedUrls,
    idFactory: workerLargeCrawlId
  });
  created.job.ownerSessionHash = access.sessionHash || "";
  created.job.ownerInviteId = access.inviteId || "";
  created.job.inventoryStatus = inventory.status || "empty";
  created.job.inventorySummary = inventory.summary || {};
  created.job.frontierIngestionStatus = largeCrawlFrontierIngestionStatus(created.frontierRows.length, normalized.targetPages, inventory);
  created.job.frontierStoredCount = created.frontierRows.length;
  created.job.incrementalMode = Boolean(body.incrementalMode || body.incremental_mode);
  created.job.previousCrawlJobId = created.job.incrementalMode
    ? (await latestLargeRenderedCrawlForTarget(env, access, normalized.targetUrl))?.id || ""
    : "";
  created.job.crawlFingerprint = await largeCrawlFingerprint(normalized.targetUrl, created.frontierRows);
  created.job.mergeStatus = "blocked";
  await insertLargeRenderedCrawl(env, created);
  if (created.job.frontierIngestionStatus === "partial") {
    options.ctx?.waitUntil?.(ingestRemainingLargeRenderedCrawlFrontier(env, created.job.id, normalized, access));
  }
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(created.job.id).first();
  const response = await largeRenderedCrawlResponseForRow(env, row);
  await deliverApiWebhooks(env, access.ownerEmail, "large_crawl.created", {
    large_crawl: apiLargeRenderedCrawlResponse(response)
  }).catch(() => {});
  return jsonNoStore(
    options.api
      ? {
          ok: true,
          large_crawl: apiLargeRenderedCrawlResponse(response),
          large_crawl_id: created.job.id,
          status_url: `/v1/large-crawls/${created.job.id}`
        }
      : {
          ok: true,
          mode: "queued",
          largeCrawl: response,
          largeCrawlId: created.job.id,
          statusUrl: `/api/large-crawls/${created.job.id}`
        },
    202
  );
}

async function listLargeRenderedCrawls(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  const rows = await listLargeRenderedCrawlRows(env, access);
  const crawls = [];
  for (const row of rows) crawls.push(await largeRenderedCrawlResponseForRow(env, row));
  return jsonNoStore({ ok: true, largeCrawls: crawls });
}

async function apiListLargeRenderedCrawls(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const rows = await listLargeRenderedCrawlRows(env, access);
  const crawls = [];
  for (const row of rows) crawls.push(apiLargeRenderedCrawlResponse(await largeRenderedCrawlResponseForRow(env, row)));
  return jsonNoStore({ ok: true, large_crawls: crawls });
}

async function getLargeRenderedCrawl(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  const loaded = await loadLargeRenderedCrawlFromRequest(request, env, access, "/api/large-crawls/");
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  return jsonNoStore({ ok: true, largeCrawl: await largeRenderedCrawlResponseForRow(env, loaded.row) });
}

async function apiGetLargeRenderedCrawl(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const loaded = await loadLargeRenderedCrawlFromRequest(request, env, access, "/v1/large-crawls/");
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  return jsonNoStore({ ok: true, large_crawl: apiLargeRenderedCrawlResponse(await largeRenderedCrawlResponseForRow(env, loaded.row)) });
}

async function retryLargeRenderedCrawl(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return retryLargeRenderedCrawlForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiRetryLargeRenderedCrawl(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return retryLargeRenderedCrawlForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function retryLargeRenderedCrawlForAccess(request, env, access, prefix, options = {}) {
  const id = pathId(request.url, prefix, "/retry");
  const loaded = await loadLargeRenderedCrawl(env, access, id);
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_frontier WHERE crawl_job_id = ? AND status = 'failed'`
  ).bind(id).all();
  const retryResult = retryLargeRenderedCrawlFailures(
    largeCrawlJobFromRow(loaded.row),
    loaded.batches.map(largeCrawlBatchFromRow),
    (rows.results || []).map(largeCrawlFrontierFromRow)
  );
  const now = new Date().toISOString();
  const retryableBatchIds = retryResult.batches
    .filter((batch) => batch.status === "queued")
    .map((batch) => batch.id);
  if (retryableBatchIds.length) {
    await runD1BatchChunks(env, [
      ...retryableBatchIds.map((batchId) =>
        env.WAITLIST_DB.prepare(
          `UPDATE large_crawl_batches SET status = 'queued', error = NULL, updated_at = ? WHERE id = ? AND crawl_job_id = ?`
        ).bind(now, batchId, id)
      ),
      ...retryResult.frontierRows.map((row) =>
        env.WAITLIST_DB.prepare(
          `UPDATE large_crawl_frontier SET status = ?, last_error = ?, updated_at = ? WHERE id = ? AND crawl_job_id = ?`
        ).bind(row.status, row.lastError || null, now, row.id, id)
      ),
      env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_jobs SET status = 'queued', error = NULL, updated_at = ? WHERE id = ?`
      ).bind(now, id)
    ]);
  }
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(id).first();
  const response = await largeRenderedCrawlResponseForRow(env, row);
  return jsonNoStore(
    options.api
      ? { ok: true, retryable_batch_count: retryableBatchIds.length, large_crawl: apiLargeRenderedCrawlResponse(response) }
      : { ok: true, retryableBatchCount: retryableBatchIds.length, largeCrawl: response }
  );
}

async function claimLargeRenderedCrawlBatch(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return claimLargeRenderedCrawlBatchForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiClaimLargeRenderedCrawlBatch(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return claimLargeRenderedCrawlBatchForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function claimLargeRenderedCrawlBatchForAccess(request, env, access, prefix, options = {}) {
  const id = pathId(request.url, prefix, "/batches/claim");
  const proofWriter = largeCrawlProofWriteStatus({
    headers: request.headers,
    env,
    trustedRenderer: options.trustedRenderer
  });
  if (!proofWriter.ok) {
    return jsonNoStore({ error: proofWriter.error, code: proofWriter.code }, proofWriter.status);
  }
  await expireStaleLargeCrawlLeases(env, id);
  const loaded = await loadLargeRenderedCrawl(env, access, id);
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  const claimed = claimNextLargeRenderedCrawlBatch(largeCrawlJobFromRow(loaded.row), loaded.batches.map(largeCrawlBatchFromRow));
  if (!claimed.ok) return jsonNoStore({ error: claimed.error }, 409);
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_jobs SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`
  ).bind(now, now, id).run();
  const batchClaim = await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_batches
     SET status = 'running', retry_count = ?, leased_at = ?, started_at = COALESCE(started_at, ?), error = NULL, updated_at = ?
     WHERE id = ? AND crawl_job_id = ? AND status IN ('queued', 'failed')`
  ).bind(claimed.batch.retryCount, now, now, now, claimed.batch.id, id).run();
  if (Number(batchClaim?.meta?.changes || 0) !== 1) {
    return jsonNoStore({ error: "Large crawl batch was claimed by another worker. Try again." }, 409);
  }
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_frontier SET status = 'rendering', updated_at = ? WHERE batch_id = ? AND status IN ('queued', 'failed')`
  ).bind(now, claimed.batch.id).run();
  const responseBatch = { ...claimed.batch, status: "running", leasedAt: now, startedAt: claimed.batch.startedAt || now, updatedAt: now };
  const proofToken = await largeCrawlProofLeaseToken(env, id, claimed.batch.id, now);
  const urls = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_frontier WHERE batch_id = ? AND status = 'rendering' ORDER BY priority ASC LIMIT 1000`
  ).bind(claimed.batch.id).all();
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(id).first();
  const response = await largeRenderedCrawlResponseForRow(env, row);
  const apiClaimBody = {
    ok: true,
    large_crawl: apiLargeRenderedCrawlResponse(response),
    batch: apiLargeCrawlBatchResponse(responseBatch),
    urls: (urls.results || []).map((item) => apiLargeCrawlFrontierResponse(largeCrawlFrontierFromRow(item)))
  };
  const betaClaimBody = {
    ok: true,
    largeCrawl: response,
    batch: largeCrawlBatchResponse(responseBatch),
    urls: (urls.results || []).map(largeCrawlFrontierFromRow)
  };
  apiClaimBody.proof_url = `/v1/large-crawls/${id}/batches/${claimed.batch.id}/proof`;
  betaClaimBody.proofUrl = `/api/large-crawls/${id}/batches/${claimed.batch.id}/proof`;
  if (proofToken) {
    apiClaimBody.proof_token = proofToken;
    betaClaimBody.proofToken = proofToken;
  }
  return jsonNoStore(
    options.api
      ? apiClaimBody
      : betaClaimBody
  );
}

async function expireStaleLargeCrawlLeases(env, jobId) {
  if (!env.WAITLIST_DB || !jobId) return;
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - LARGE_RENDERED_CRAWL_LEASE_MS).toISOString();
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id FROM large_crawl_batches
     WHERE crawl_job_id = ?
       AND status = 'running'
       AND leased_at IS NOT NULL
       AND leased_at < ?`
  ).bind(jobId, staleBefore).all();
  const batchIds = (rows.results || []).map((row) => row.id).filter(Boolean);
  if (!batchIds.length) return;
  await runD1BatchChunks(env, batchIds.flatMap((batchId) => [
    env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_frontier SET status = 'queued', updated_at = ? WHERE batch_id = ? AND status = 'rendering'`
    ).bind(now, batchId),
    env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_batches SET status = 'queued', leased_at = NULL, error = NULL, updated_at = ? WHERE id = ? AND crawl_job_id = ?`
    ).bind(now, batchId, jobId)
  ]));
}

async function processLargeRenderedCrawlBatch(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return processLargeRenderedCrawlBatchForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiProcessLargeRenderedCrawlBatch(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return processLargeRenderedCrawlBatchForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function processLargeRenderedCrawlBatchForAccess(request, env, access, prefix, options = {}) {
  const body = await request.json().catch(() => ({}));
  const jobId = pathId(request.url, prefix, "/batches/process");
  const claimRequest = new Request(request.url.replace("/batches/process", "/batches/claim"), {
    method: "POST",
    headers: request.headers
  });
  const claimedResponse = await claimLargeRenderedCrawlBatchForAccess(claimRequest, env, access, prefix, options);
  const claimedBody = await claimedResponse.clone().json().catch(() => ({}));
  if (!claimedResponse.ok) return claimedResponse;
  const batchId = claimedBody.batch?.batch_id || claimedBody.batch?.id || "";
  await refreshLargeRenderedCrawlBatchLease(env, jobId, batchId);
  const claimedUrls = Array.isArray(claimedBody.urls) ? claimedBody.urls : [];
  const urls = claimedUrls.slice(0, Math.min(Math.max(Number(body.limit || 10), 1), 50));
  await deferUnprocessedLargeCrawlUrls(env, batchId, urls);
  const pages = [];
  const failures = [];
  for (const row of urls) {
    const url = row.url;
    try {
      const report = await auditUrl(url, env, {
        maxPages: 1,
        pageSpeed: false,
        appOrigin: new URL(request.url).origin,
        crawlInventoryMaxUrls: 1,
        renderedCrawlTarget: 0
      });
      const page = report.pages?.[0];
      if (!page) throw new Error("No rendered page proof was returned.");
      pages.push({ ...page, frontierId: row.frontier_id || row.id });
    } catch (error) {
      failures.push({
        frontierId: row.frontier_id || row.id,
        url,
        error: cleanText(error?.message || "Rendered proof failed.", 500)
      });
    }
    await refreshLargeRenderedCrawlBatchLease(env, jobId, batchId);
  }
  await refreshLargeRenderedCrawlBatchLease(env, jobId, batchId);
  const proofUrl = new URL(request.url);
  proofUrl.pathname = `${prefix}${jobId}/batches/${batchId}/proof`;
  const proofRequest = new Request(proofUrl.href, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pages, failures })
  });
  const savedResponse = await saveLargeRenderedCrawlBatchProofForAccess(proofRequest, env, access, prefix, {
    ...options,
    trustedRenderer: true
  });
  const savedBody = await savedResponse.clone().json().catch(() => ({}));
  return jsonNoStore(
    options.api
      ? { ...savedBody, processed_url_count: pages.length + failures.length, rendered_count: pages.length, failed_count: failures.length }
      : { ...savedBody, processedUrlCount: pages.length + failures.length, renderedCount: pages.length, failedCount: failures.length },
    savedResponse.status
  );
}

async function refreshLargeRenderedCrawlBatchLease(env, jobId, batchId) {
  if (!env.WAITLIST_DB || !jobId || !batchId) return;
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_batches
     SET leased_at = ?, updated_at = ?
     WHERE id = ?
       AND crawl_job_id = ?
       AND status = 'running'`
  ).bind(now, now, batchId, jobId).run();
}

async function runDueLargeRenderedCrawlWorkers(env) {
  if (!env.WAITLIST_DB || !env.BROWSER) return;
  const batchLimit = Math.min(Math.max(Number(env.SEOFIXKIT_LARGE_CRAWL_WORKER_BATCHES || 1), 1), 5);
  const urlLimit = Math.min(Math.max(Number(env.SEOFIXKIT_LARGE_CRAWL_WORKER_URLS || 10), 1), 50);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM large_crawl_jobs
     WHERE status IN ('queued', 'retrying', 'running')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at ASC
     LIMIT ?`
  ).bind(new Date().toISOString(), batchLimit).all();
  for (const row of rows.results || []) {
    const now = new Date().toISOString();
    const heartbeatId = workerLargeCrawlId("lwh");
    const workerId = `scheduled-${heartbeatId.slice(-8)}`;
    await env.WAITLIST_DB.prepare(
      `INSERT INTO large_crawl_worker_heartbeats
        (id, worker_id, crawl_job_id, batch_id, status, browser_runtime, concurrency, last_error, last_seen_at, created_at)
       VALUES (?, ?, ?, NULL, 'processing', 'cloudflare-browser-run', ?, NULL, ?, ?)`
    ).bind(heartbeatId, workerId, row.id, urlLimit, now, now).run();
    const request = new Request(`https://seofixkit.com/api/large-crawls/${encodeURIComponent(row.id)}/batches/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: urlLimit })
    });
    try {
      await processLargeRenderedCrawlBatchForAccess(
        request,
        env,
        {
          ok: true,
          ownerEmail: row.owner_email,
          accessMode: row.access_mode || "worker",
          sessionHash: row.owner_session_hash || "scheduled-large-crawl-worker",
          inviteId: row.owner_invite_id || ""
        },
        "/api/large-crawls/",
        { api: false, trustedRenderer: true }
      );
      await env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_worker_heartbeats SET status = 'idle', last_seen_at = ? WHERE id = ?`
      ).bind(new Date().toISOString(), heartbeatId).run();
    } catch (error) {
      await env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_worker_heartbeats SET status = 'failed', last_error = ?, last_seen_at = ? WHERE id = ?`
      ).bind(cleanText(error?.message || "Large crawl worker failed.", 500), new Date().toISOString(), heartbeatId).run();
    }
  }
}

async function deferUnprocessedLargeCrawlUrls(env, batchId, processingRows = []) {
  if (!env.WAITLIST_DB || !batchId) return;
  const processingIds = processingRows
    .map((row) => row.frontier_id || row.frontierId || row.id || "")
    .filter(Boolean);
  const now = new Date().toISOString();
  if (!processingIds.length) {
    await env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_frontier SET status = 'queued', updated_at = ? WHERE batch_id = ? AND status = 'rendering'`
    ).bind(now, batchId).run();
    return;
  }
  const placeholders = processingIds.map(() => "?").join(", ");
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_frontier
     SET status = 'queued', updated_at = ?
     WHERE batch_id = ? AND status = 'rendering' AND id NOT IN (${placeholders})`
  ).bind(now, batchId, ...processingIds).run();
}

async function saveLargeRenderedCrawlBatchProof(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return saveLargeRenderedCrawlBatchProofForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiSaveLargeRenderedCrawlBatchProof(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return saveLargeRenderedCrawlBatchProofForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function saveLargeRenderedCrawlBatchProofForAccess(request, env, access, prefix, options = {}) {
  const { jobId, batchId } = largeCrawlBatchProofPath(request.url, prefix);
  const proofWriter = largeCrawlProofWriteStatus({
    headers: request.headers,
    env,
    trustedRenderer: options.trustedRenderer
  });
  if (!proofWriter.ok) {
    return jsonNoStore({ error: proofWriter.error, code: proofWriter.code }, proofWriter.status);
  }
  const loaded = await loadLargeRenderedCrawl(env, access, jobId);
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  const batchRow = loaded.batches.find((batch) => batch.id === batchId);
  if (!batchRow?.id) return jsonNoStore({ error: "Large crawl batch not found." }, 404);
  const batch = largeCrawlBatchFromRow(batchRow);
  const body = await request.json().catch(() => ({}));
  if (!largeCrawlBatchLeaseIsActive(batch) && !(await largeCrawlProofLeaseTokenIsValid(request, body, env, jobId, batch))) {
    return jsonNoStore({ error: "Large crawl batch does not have an active renderer lease.", code: "ACTIVE_RENDERER_LEASE_REQUIRED" }, 409);
  }
  const pages = Array.isArray(body.pages) ? body.pages : [];
  const failures = Array.isArray(body.failures) ? body.failures : [];
  const now = new Date().toISOString();
  const frontier = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_frontier WHERE batch_id = ? ORDER BY priority ASC`
  ).bind(batchId).all();
  const frontierRows = (frontier.results || []).map(largeCrawlFrontierFromRow);
  const statements = [];
  for (const page of pages) {
    const frontierRow = findLargeCrawlFrontierRow(frontierRows, batchId, page);
    if (!frontierRow || frontierRow.status !== "rendering") continue;
    const proof = largeRenderedCrawlProofFromPage(largeCrawlJobFromRow(loaded.row), batch, frontierRow, page, now);
    statements.push(largeCrawlProofInsertStatement(env, proof));
    statements.push(
      env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_frontier SET status = 'rendered', last_error = NULL, updated_at = ? WHERE id = ?`
      ).bind(now, frontierRow.id)
    );
  }
  for (const failure of failures) {
    const frontierRow = findLargeCrawlFrontierRow(frontierRows, batchId, failure);
    if (!frontierRow || frontierRow.status !== "rendering") continue;
    const retryCount = Number(frontierRow.retryCount || 0) + 1;
    const lastError = cleanText(failure.error || failure.message || "Rendered proof failed.", 500);
    statements.push(
      env.WAITLIST_DB.prepare(
        `UPDATE large_crawl_frontier SET status = 'failed', retry_count = ?, last_error = ?, updated_at = ? WHERE id = ?`
      ).bind(retryCount, lastError, now, frontierRow.id)
    );
    if (retryCount >= LARGE_RENDERED_CRAWL_MAX_RETRIES) {
      statements.push(
        env.WAITLIST_DB.prepare(
          `INSERT INTO large_crawl_dead_letters
            (id, crawl_job_id, batch_id, frontier_id, url, error, retry_count, status, created_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL)`
        ).bind(workerLargeCrawlId("lcd"), jobId, batchId, frontierRow.id, frontierRow.url, lastError, retryCount, now)
      );
    }
  }
  await runD1BatchChunks(env, statements);
  await refreshLargeCrawlCounters(env, jobId, batchId);
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(jobId).first();
  const response = await largeRenderedCrawlResponseForRow(env, row);
  if (response.status === "ready_to_merge") {
    await deliverApiWebhooks(env, access.ownerEmail, "large_crawl.ready_to_merge", {
      large_crawl: apiLargeRenderedCrawlResponse(response)
    }).catch(() => {});
  }
  const updatedBatchRow = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_batches WHERE id = ? LIMIT 1`).bind(batchId).first();
  return jsonNoStore(
    options.api
      ? { ok: true, large_crawl: apiLargeRenderedCrawlResponse(response), batch: apiLargeCrawlBatchResponse(largeCrawlBatchFromRow(updatedBatchRow)) }
      : { ok: true, largeCrawl: response, batch: largeCrawlBatchResponse(largeCrawlBatchFromRow(updatedBatchRow)) }
  );
}

async function markLargeRenderedCrawlReadyToMerge(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return markLargeRenderedCrawlReadyToMergeForAccess(request, env, access, "/api/large-crawls/", { api: false });
}

async function apiMarkLargeRenderedCrawlReadyToMerge(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  return markLargeRenderedCrawlReadyToMergeForAccess(request, env, access, "/v1/large-crawls/", { api: true });
}

async function markLargeRenderedCrawlReadyToMergeForAccess(request, env, access, prefix, options = {}) {
  const id = pathId(request.url, prefix, "/merge");
  const loaded = await loadLargeRenderedCrawl(env, access, id, { includeSample: true });
  if (!loaded.ok) return jsonNoStore({ error: loaded.error }, loaded.status || 404);
  const response = await largeRenderedCrawlResponseForRow(env, loaded.row);
  const readiness = response.mergeReadiness;
  if (!readiness.ready) {
    return jsonNoStore({ error: "Large crawl cannot merge yet.", blockers: readiness.blockers, progress: readiness.progress }, 409);
  }
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_jobs SET status = 'ready_to_merge', merge_status = 'ready', updated_at = ? WHERE id = ?`
  ).bind(now, id).run();
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(id).first();
  const updated = await largeRenderedCrawlResponseForRow(env, row);
  return jsonNoStore(
    options.api
      ? { ok: true, status: "ready_to_merge", large_crawl: apiLargeRenderedCrawlResponse(updated) }
      : { ok: true, status: "ready_to_merge", largeCrawl: updated }
  );
}

async function insertLargeRenderedCrawl(env, created = {}) {
  const job = created.job;
  const jobStatement = env.WAITLIST_DB.prepare(
    `INSERT INTO large_crawl_jobs
      (id, owner_email, owner_session_hash, owner_invite_id, access_mode, target_url, target_host, incremental_mode, previous_crawl_job_id, crawl_fingerprint, target_pages, batch_size, max_concurrency, crawl_delay_ms, max_retries, status, frontier_url_count, frontier_stored_count, frontier_ingestion_status, rendered_url_count, failed_url_count, completed_batch_count, total_batch_count, inventory_status, inventory_summary_json, merge_status, report_id, error, created_at, updated_at, started_at, completed_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    job.id,
    job.ownerEmail,
    job.ownerSessionHash || null,
    job.ownerInviteId || null,
    job.accessMode || "self-serve",
    job.targetUrl,
    job.targetHost,
    job.incrementalMode ? 1 : 0,
    job.previousCrawlJobId || null,
    job.crawlFingerprint || null,
    job.targetPages,
    job.batchSize,
    job.maxConcurrency,
    job.crawlDelayMs,
    job.maxRetries,
    job.status,
    job.frontierUrlCount,
    job.frontierStoredCount || job.frontierUrlCount,
    job.frontierIngestionStatus || "complete",
    job.renderedUrlCount,
    job.failedUrlCount,
    job.completedBatchCount,
    job.totalBatchCount,
    job.inventoryStatus || null,
    JSON.stringify(job.inventorySummary || {}),
    job.mergeStatus || "blocked",
    job.reportId || null,
    job.error || null,
    job.createdAt,
    job.updatedAt,
    job.startedAt || null,
    job.completedAt || null,
    job.expiresAt
  );
  const batchStatements = (created.batches || []).map((batch) =>
    env.WAITLIST_DB.prepare(
      `INSERT INTO large_crawl_batches
        (id, crawl_job_id, batch_index, start_index, end_index, planned_url_count, rendered_url_count, failed_url_count, status, retry_count, error, leased_at, started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      batch.id,
      batch.crawlJobId,
      batch.batchIndex,
      batch.startIndex,
      batch.endIndex,
      batch.plannedUrlCount,
      batch.renderedUrlCount,
      batch.failedUrlCount,
      batch.status,
      batch.retryCount,
      batch.error || null,
      batch.leasedAt || null,
      batch.startedAt || null,
      batch.completedAt || null,
      batch.createdAt,
      batch.updatedAt
    )
  );
  await env.WAITLIST_DB.batch([jobStatement, ...batchStatements]);
  await runD1BatchChunks(env, (created.frontierRows || []).map((row) => largeCrawlFrontierInsertStatement(env, row)), 100);
}

async function ingestRemainingLargeRenderedCrawlFrontier(env, jobId, normalized = {}, access = {}) {
  if (!env.WAITLIST_DB || !jobId || !normalized.targetUrl) return;
  try {
    const inventory = await buildCrawlInventory(normalized.targetUrl, {
      includeUrls: true,
      maxUrls: normalized.targetPages,
      fetcher: fetch
    });
    const full = createLargeRenderedCrawlJob({
      id: jobId,
      ownerEmail: access.ownerEmail,
      accessMode: access.accessMode || "self-serve",
      targetUrl: normalized.targetUrl,
      targetPages: normalized.targetPages,
      batchSize: normalized.batchSize,
      maxConcurrency: normalized.maxConcurrency,
      crawlDelayMs: normalized.crawlDelayMs,
      inventoryUrls: inventory.urls || [],
      seedUrls: normalized.seedUrls,
      idFactory: workerLargeCrawlId
    });
    const [existingUrls, existingBatches] = await Promise.all([
      env.WAITLIST_DB.prepare(`SELECT normalized_url FROM large_crawl_frontier WHERE crawl_job_id = ?`).bind(jobId).all(),
      env.WAITLIST_DB.prepare(`SELECT batch_index FROM large_crawl_batches WHERE crawl_job_id = ?`).bind(jobId).all()
    ]);
    const urlSet = new Set((existingUrls.results || []).map((row) => row.normalized_url).filter(Boolean));
    const batchIndexSet = new Set((existingBatches.results || []).map((row) => Number(row.batch_index || 0)).filter(Boolean));
    const missingBatches = full.batches.filter((batch) => !batchIndexSet.has(Number(batch.batchIndex || 0)));
    const missingFrontierRows = full.frontierRows.filter((row) => !urlSet.has(row.normalizedUrl || row.url || ""));
    await runD1BatchChunks(env, missingBatches.map((batch) => largeCrawlBatchInsertStatement(env, batch)), 100);
    await runD1BatchChunks(env, missingFrontierRows.map((row) => largeCrawlFrontierInsertStatement(env, row)), 100);
    const now = new Date().toISOString();
    const fingerprint = await largeCrawlFingerprint(normalized.targetUrl, full.frontierRows);
    await env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_jobs
       SET frontier_url_count = ?, frontier_stored_count = ?, frontier_ingestion_status = ?, total_batch_count = ?, inventory_status = ?, inventory_summary_json = ?, crawl_fingerprint = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      full.frontierRows.length,
      full.frontierRows.length,
      largeCrawlFrontierIngestionStatus(full.frontierRows.length, normalized.targetPages, inventory),
      full.batches.length,
      inventory.status || "empty",
      JSON.stringify(inventory.summary || {}),
      fingerprint,
      now,
      jobId
    ).run();
  } catch (error) {
    await env.WAITLIST_DB.prepare(
      `UPDATE large_crawl_jobs SET frontier_ingestion_status = 'failed', error = ?, updated_at = ? WHERE id = ?`
    ).bind(cleanText(error?.message || "Frontier ingestion failed.", 500), new Date().toISOString(), jobId).run();
  }
}

function largeCrawlFrontierIngestionStatus(frontierCount = 0, targetPages = 0, inventory = {}) {
  const stored = Number(frontierCount || 0);
  if (!stored) return "empty";
  if (stored >= Number(targetPages || 0)) return "complete";
  return inventory.summary?.truncated ? "partial" : "complete";
}

function largeCrawlBatchInsertStatement(env, batch = {}) {
  return env.WAITLIST_DB.prepare(
    `INSERT INTO large_crawl_batches
      (id, crawl_job_id, batch_index, start_index, end_index, planned_url_count, rendered_url_count, failed_url_count, status, retry_count, error, leased_at, started_at, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    batch.id,
    batch.crawlJobId,
    batch.batchIndex,
    batch.startIndex,
    batch.endIndex,
    batch.plannedUrlCount,
    batch.renderedUrlCount,
    batch.failedUrlCount,
    batch.status,
    batch.retryCount,
    batch.error || null,
    batch.leasedAt || null,
    batch.startedAt || null,
    batch.completedAt || null,
    batch.createdAt,
    batch.updatedAt
  );
}

function largeCrawlFrontierInsertStatement(env, row = {}) {
  return env.WAITLIST_DB.prepare(
    `INSERT INTO large_crawl_frontier
      (id, crawl_job_id, batch_id, batch_index, url, normalized_url, status, retry_count, last_error, discovered_from, depth, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id,
    row.crawlJobId,
    row.batchId,
    row.batchIndex,
    row.url,
    row.normalizedUrl,
    row.status,
    row.retryCount,
    row.lastError || null,
    row.discoveredFrom || null,
    row.depth || 0,
    row.priority || 0,
    row.createdAt,
    row.updatedAt
  );
}

function largeCrawlProofInsertStatement(env, row = {}) {
  return env.WAITLIST_DB.prepare(
    `INSERT OR REPLACE INTO large_crawl_url_proofs
      (id, crawl_job_id, batch_id, frontier_id, url, final_url, status_code, content_type, title, description, h1s_json, canonical, robots, internal_links_count, external_links_count, schema_types_json, resource_timing_json, issue_facts_json, rendered_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id,
    row.crawlJobId,
    row.batchId,
    row.frontierId,
    row.url,
    row.finalUrl || null,
    row.statusCode || 0,
    row.contentType || null,
    row.title || null,
    row.description || null,
    JSON.stringify(row.h1s || []),
    row.canonical || null,
    row.robots || null,
    row.internalLinksCount || 0,
    row.externalLinksCount || 0,
    JSON.stringify(row.schemaTypes || []),
    JSON.stringify(row.resourceTiming || {}),
    JSON.stringify(row.issueFacts || {}),
    row.renderedAt,
    row.createdAt
  );
}

async function listLargeRenderedCrawlRows(env, access) {
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM large_crawl_jobs
     WHERE owner_email = ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at DESC
     LIMIT 50`
  ).bind(access.ownerEmail, new Date().toISOString()).all();
  return rows.results || [];
}

async function loadLargeRenderedCrawlFromRequest(request, env, access, prefix) {
  const id = pathId(request.url, prefix);
  return loadLargeRenderedCrawl(env, access, id);
}

async function loadLargeRenderedCrawl(env, access, id) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_jobs WHERE id = ? AND owner_email = ? LIMIT 1`
  ).bind(id, access.ownerEmail).first();
  if (!row?.id) return { ok: false, status: 404, error: "Large crawl not found." };
  const batches = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_batches WHERE crawl_job_id = ? ORDER BY batch_index ASC`
  ).bind(id).all();
  return { ok: true, row, batches: batches.results || [] };
}

async function largeRenderedCrawlResponseForRow(env, row = {}) {
  const loaded = await loadLargeRenderedCrawl(env, { ownerEmail: row.owner_email }, row.id);
  const frontier = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_frontier WHERE crawl_job_id = ? ORDER BY priority ASC LIMIT 20`
  ).bind(row.id).all();
  const proofs = await env.WAITLIST_DB.prepare(
    `SELECT * FROM large_crawl_url_proofs WHERE crawl_job_id = ? ORDER BY rendered_at DESC LIMIT 20`
  ).bind(row.id).all();
  const deadLetters = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count FROM large_crawl_dead_letters WHERE crawl_job_id = ? AND status = 'open'`
  ).bind(row.id).first();
  const job = largeCrawlJobFromRow(row);
  const batches = (loaded.batches || []).map(largeCrawlBatchFromRow);
  const sampleFrontier = (frontier.results || []).map(largeCrawlFrontierFromRow);
  const sampleProof = (proofs.results || []).map(largeCrawlProofFromRow);
  const response = largeRenderedCrawlResponse(job, batches, sampleFrontier, sampleProof);
  return {
    ...response,
    inventory: {
      status: row.inventory_status || "",
      summary: parseJson(row.inventory_summary_json, {})
    },
    incrementalMode: Boolean(row.incremental_mode),
    previousCrawlJobId: row.previous_crawl_job_id || "",
    crawlFingerprint: row.crawl_fingerprint || "",
    frontierIngestionStatus: row.frontier_ingestion_status || "pending",
    frontierStoredCount: Number(row.frontier_stored_count || row.frontier_url_count || 0),
    mergeStatus: row.merge_status || "blocked",
    mergeReadiness: largeRenderedCrawlMergeReadiness(job, batches, [], []),
    deadLetterCount: Number(deadLetters?.count || 0)
  };
}

async function refreshLargeCrawlCounters(env, jobId, batchId) {
  const now = new Date().toISOString();
  const [batchProofs, batchFailures, batchQueued, batchRendering] = await Promise.all([
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_url_proofs WHERE batch_id = ?`).bind(batchId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_frontier WHERE batch_id = ? AND status = 'failed'`).bind(batchId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_frontier WHERE batch_id = ? AND status = 'queued'`).bind(batchId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_frontier WHERE batch_id = ? AND status = 'rendering'`).bind(batchId).first()
  ]);
  const failedRows = Number(batchFailures?.count || 0);
  const queuedRows = Number(batchQueued?.count || 0);
  const renderingRows = Number(batchRendering?.count || 0);
  const batchStatus = failedRows ? "failed" : renderingRows ? "running" : queuedRows ? "queued" : "completed";
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_batches
     SET status = ?, rendered_url_count = ?, failed_url_count = ?, completed_at = ?, error = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    batchStatus,
    Number(batchProofs?.count || 0),
    failedRows,
    batchStatus === "completed" ? now : null,
    failedRows ? `${failedRows} URL proofs failed in this batch.` : null,
    now,
    batchId
  ).run();

  const [renderedRows, failedUrls, completedBatches, failedBatches, totalBatches, job] = await Promise.all([
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_url_proofs WHERE crawl_job_id = ?`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_frontier WHERE crawl_job_id = ? AND status = 'failed'`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_batches WHERE crawl_job_id = ? AND status = 'completed'`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_batches WHERE crawl_job_id = ? AND status = 'failed'`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM large_crawl_batches WHERE crawl_job_id = ?`).bind(jobId).first(),
    env.WAITLIST_DB.prepare(`SELECT frontier_url_count, frontier_ingestion_status FROM large_crawl_jobs WHERE id = ? LIMIT 1`).bind(jobId).first()
  ]);
  const renderedCount = Number(renderedRows?.count || 0);
  const failedCount = Number(failedUrls?.count || 0);
  const completedCount = Number(completedBatches?.count || 0);
  const failedBatchCount = Number(failedBatches?.count || 0);
  const totalBatchCount = Number(totalBatches?.count || 0);
  const frontierCount = Number(job?.frontier_url_count || 0);
  const frontierIngestionComplete = ["", "complete"].includes(job?.frontier_ingestion_status || "complete");
  const ready = frontierIngestionComplete && frontierCount > 0 && renderedCount >= frontierCount && completedCount === totalBatchCount && failedCount === 0 && failedBatchCount === 0;
  const status = ready ? "ready_to_merge" : failedBatchCount || failedCount ? "retrying" : "running";
  await env.WAITLIST_DB.prepare(
    `UPDATE large_crawl_jobs
     SET status = ?, rendered_url_count = ?, failed_url_count = ?, completed_batch_count = ?, total_batch_count = ?, merge_status = ?, updated_at = ?, completed_at = ?
     WHERE id = ?`
  ).bind(status, renderedCount, failedCount, completedCount, totalBatchCount, ready ? "ready" : "blocked", now, ready ? now : null, jobId).run();
}

async function activeLargeRenderedCrawlForTarget(env, access, targetUrl) {
  return env.WAITLIST_DB.prepare(
    `SELECT *
     FROM large_crawl_jobs
     WHERE owner_email = ?
       AND target_url = ?
       AND status IN ('queued', 'running', 'retrying', 'ready_to_merge')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(access.ownerEmail, targetUrl, new Date().toISOString()).first();
}

async function activeLargeRenderedCrawlCount(env, access) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM large_crawl_jobs
     WHERE owner_email = ?
       AND status IN ('queued', 'running', 'retrying')
       AND (expires_at IS NULL OR expires_at > ?)`
  ).bind(access.ownerEmail, new Date().toISOString()).first();
  return Number(row?.count || 0);
}

async function latestLargeRenderedCrawlForTarget(env, access, targetUrl) {
  return env.WAITLIST_DB.prepare(
    `SELECT id
     FROM large_crawl_jobs
     WHERE owner_email = ?
       AND target_url = ?
       AND status IN ('ready_to_merge', 'completed')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at DESC
     LIMIT 1`
  ).bind(access.ownerEmail, targetUrl, new Date().toISOString()).first();
}

async function largeCrawlQuotaStatus(request, env, access, targetUrl) {
  const day = dayWindow(new Date());
  const targetKey = safeHostname(targetUrl).replace(/[^a-z0-9.-]/gi, "").slice(0, 120);
  const sessionKey = String(access.sessionHash || access.apiTokenId || access.ownerEmail || "").slice(0, 32);
  return checkQuotaSet(env, [
    {
      bucket: `large-crawl:session-day:${day.key}:${sessionKey}`,
      limit: 2,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily large-crawl limit reached. Try again tomorrow."
    },
    {
      bucket: `large-crawl:target-day:${day.key}:${targetKey}`,
      limit: 1,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "That site already has a large crawl queued today."
    }
  ]);
}

function largeCrawlBillingStatus(env, access = {}) {
  if (access.accessMode === "founder-override") return { ok: true };
  if (String(env.SEOFIXKIT_LARGE_CRAWL_ENABLED || "").toLowerCase() === "true") return { ok: true };
  return {
    ok: false,
    status: 402,
    code: "LARGE_CRAWL_PLAN_REQUIRED",
    error: "Large rendered crawls require an enabled large-crawl plan before browser workers run."
  };
}

function largeCrawlJobFromRow(row = {}) {
  return {
    id: row.id || "",
    ownerEmail: row.owner_email || "",
    accessMode: row.access_mode || "self-serve",
    targetUrl: row.target_url || "",
    targetHost: row.target_host || "",
    incrementalMode: Boolean(row.incremental_mode),
    previousCrawlJobId: row.previous_crawl_job_id || "",
    crawlFingerprint: row.crawl_fingerprint || "",
    targetPages: Number(row.target_pages || 0),
    batchSize: Number(row.batch_size || 1000),
    maxConcurrency: Number(row.max_concurrency || 4),
    crawlDelayMs: Number(row.crawl_delay_ms || 250),
    maxRetries: Number(row.max_retries || LARGE_RENDERED_CRAWL_MAX_RETRIES),
    status: row.status || "queued",
    frontierUrlCount: Number(row.frontier_url_count || 0),
    frontierIngestionStatus: row.frontier_ingestion_status || "pending",
    renderedUrlCount: Number(row.rendered_url_count || 0),
    failedUrlCount: Number(row.failed_url_count || 0),
    completedBatchCount: Number(row.completed_batch_count || 0),
    totalBatchCount: Number(row.total_batch_count || 0),
    reportId: row.report_id || "",
    error: row.error || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    expiresAt: row.expires_at || ""
  };
}

function largeCrawlBatchFromRow(row = {}) {
  return {
    id: row.id || "",
    crawlJobId: row.crawl_job_id || "",
    batchIndex: Number(row.batch_index || 0),
    startIndex: Number(row.start_index || 0),
    endIndex: Number(row.end_index || 0),
    plannedUrlCount: Number(row.planned_url_count || 0),
    renderedUrlCount: Number(row.rendered_url_count || 0),
    failedUrlCount: Number(row.failed_url_count || 0),
    status: row.status || "queued",
    retryCount: Number(row.retry_count || 0),
    error: row.error || "",
    leasedAt: row.leased_at || "",
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function largeCrawlFrontierFromRow(row = {}) {
  return {
    id: row.id || "",
    crawlJobId: row.crawl_job_id || "",
    batchId: row.batch_id || "",
    batchIndex: Number(row.batch_index || 0),
    url: row.url || "",
    normalizedUrl: row.normalized_url || row.url || "",
    status: row.status || "queued",
    retryCount: Number(row.retry_count || 0),
    lastError: row.last_error || "",
    discoveredFrom: row.discovered_from || "",
    depth: Number(row.depth || 0),
    priority: Number(row.priority || 0),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function largeCrawlProofFromRow(row = {}) {
  return {
    id: row.id || "",
    crawlJobId: row.crawl_job_id || "",
    batchId: row.batch_id || "",
    frontierId: row.frontier_id || "",
    url: row.url || "",
    finalUrl: row.final_url || "",
    statusCode: Number(row.status_code || 0),
    title: row.title || "",
    canonical: row.canonical || "",
    renderedAt: row.rendered_at || ""
  };
}

function apiLargeRenderedCrawlResponse(response = {}) {
  return {
    large_crawl_id: response.id || "",
    status: response.status || "queued",
    url: response.targetUrl || "",
    target_host: response.targetHost || "",
    target_pages: response.targetPages || 0,
    batch_size: response.batchSize || 1000,
    max_concurrency: response.maxConcurrency || 4,
    crawl_delay_ms: response.crawlDelayMs || 250,
    max_retries: response.maxRetries || LARGE_RENDERED_CRAWL_MAX_RETRIES,
    progress: response.progress || {},
    batches: (response.batches || []).map(apiLargeCrawlBatchResponse),
    sample_frontier: (response.sampleFrontier || []).map(apiLargeCrawlFrontierResponse),
    sample_proof: response.sampleProof || [],
    inventory: response.inventory || {},
    incremental_mode: Boolean(response.incrementalMode),
    previous_crawl_job_id: response.previousCrawlJobId || "",
    crawl_fingerprint: response.crawlFingerprint || "",
    frontier_ingestion_status: response.frontierIngestionStatus || "pending",
    frontier_stored_count: response.frontierStoredCount || 0,
    merge_status: response.mergeStatus || "blocked",
    merge_readiness: response.mergeReadiness || {},
    dead_letter_count: response.deadLetterCount || 0,
    report_id: response.reportId || "",
    error: response.error || "",
    created_at: response.createdAt || "",
    updated_at: response.updatedAt || "",
    started_at: response.startedAt || "",
    completed_at: response.completedAt || "",
    expires_at: response.expiresAt || ""
  };
}

function largeCrawlBatchResponse(batch = {}) {
  return {
    id: batch.id || "",
    batchIndex: Number(batch.batchIndex || 0),
    startIndex: Number(batch.startIndex || 0),
    endIndex: Number(batch.endIndex || 0),
    plannedUrlCount: Number(batch.plannedUrlCount || 0),
    renderedUrlCount: Number(batch.renderedUrlCount || 0),
    failedUrlCount: Number(batch.failedUrlCount || 0),
    status: batch.status || "queued",
    retryCount: Number(batch.retryCount || 0),
    error: batch.error || "",
    updatedAt: batch.updatedAt || ""
  };
}

function apiLargeCrawlBatchResponse(batch = {}) {
  return {
    batch_id: batch.id || "",
    batch_index: Number(batch.batchIndex || batch.batch_index || 0),
    start_index: Number(batch.startIndex || batch.start_index || 0),
    end_index: Number(batch.endIndex || batch.end_index || 0),
    planned_url_count: Number(batch.plannedUrlCount || batch.planned_url_count || 0),
    rendered_url_count: Number(batch.renderedUrlCount || batch.rendered_url_count || 0),
    failed_url_count: Number(batch.failedUrlCount || batch.failed_url_count || 0),
    status: batch.status || "queued",
    retry_count: Number(batch.retryCount || batch.retry_count || 0),
    error: batch.error || "",
    updated_at: batch.updatedAt || batch.updated_at || ""
  };
}

function apiLargeCrawlFrontierResponse(row = {}) {
  return {
    frontier_id: row.id || "",
    batch_id: row.batchId || row.batch_id || "",
    url: row.url || "",
    status: row.status || "queued",
    retry_count: Number(row.retryCount || row.retry_count || 0),
    last_error: row.lastError || row.last_error || ""
  };
}

function findLargeCrawlFrontierRow(frontierRows = [], batchId = "", input = {}) {
  const wantedId = input.frontierId || input.frontier_id || "";
  const wantedUrl = canonicalLargeCrawlProofUrl(input.url || input.targetUrl || input.target_url || "");
  if (!wantedId && !wantedUrl) return null;
  return frontierRows.find((row) => {
    if (row.batchId !== batchId) return false;
    if (wantedId && row.id !== wantedId) return false;
    if (wantedUrl && canonicalLargeCrawlProofUrl(row.url) !== wantedUrl) return false;
    return true;
  }) || null;
}

function largeCrawlBatchLeaseIsActive(batch = {}, nowMs = Date.now()) {
  if (batch.status !== "running" || !batch.leasedAt) return false;
  const leasedAt = Date.parse(batch.leasedAt);
  return Number.isFinite(leasedAt) && leasedAt >= nowMs - LARGE_RENDERED_CRAWL_LEASE_MS;
}

async function largeCrawlProofLeaseToken(env, jobId, batchId, leasedAt) {
  const secret = String(env.SEOFIXKIT_LARGE_CRAWL_WORKER_TOKEN || "").trim();
  if (!secret || !jobId || !batchId || !leasedAt) return "";
  return sha256Hex(`${secret}:${jobId}:${batchId}:${leasedAt}`);
}

async function largeCrawlProofLeaseTokenIsValid(request, body, env, jobId, batch = {}) {
  if (batch.status !== "running") return false;
  const supplied = String(
    request.headers.get("x-seofixkit-proof-token") ||
    body.proofToken ||
    body.proof_token ||
    ""
  ).trim();
  if (!supplied) return false;
  const expected = await largeCrawlProofLeaseToken(env, jobId, batch.id, batch.leasedAt);
  return constantTimeEqual(supplied, expected);
}

function constantTimeEqual(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  const maxLength = Math.max(leftText.length, rightText.length);
  let diff = leftText.length ^ rightText.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }
  return maxLength > 0 && diff === 0;
}

function largeCrawlBatchProofPath(rawUrl, prefix) {
  const pathname = new URL(rawUrl).pathname;
  const value = pathname.slice(prefix.length);
  const match = value.match(/^([^/]+)\/batches\/([^/]+)\/proof$/);
  return {
    jobId: decodeURIComponent(match?.[1] || ""),
    batchId: decodeURIComponent(match?.[2] || "")
  };
}

function pathId(rawUrl, prefix, suffix = "") {
  const pathname = new URL(rawUrl).pathname;
  const withoutPrefix = pathname.slice(prefix.length);
  const value = suffix && withoutPrefix.endsWith(suffix)
    ? withoutPrefix.slice(0, -suffix.length)
    : withoutPrefix;
  return decodeURIComponent(value.replace(/^\/|\/$/g, ""));
}

function stripUrlHash(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return String(value || "").split("#")[0];
  }
}

function canonicalLargeCrawlProofUrl(value = "") {
  const stripped = stripUrlHash(value);
  try {
    const url = new URL(stripped);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
    }
    return url.href;
  } catch {
    return String(stripped || "").replace(/\/+$/g, "");
  }
}

async function largeCrawlFingerprint(targetUrl = "", frontierRows = []) {
  return sha256Hex([
    targetUrl,
    ...(frontierRows || []).slice(0, 50000).map((row) => row.normalizedUrl || row.url || "")
  ].join("\n"));
}

export {
  LARGE_RENDERED_CRAWL_LEASE_MS,
  LARGE_RENDERED_CRAWL_SYNC_FRONTIER_LIMIT,
  activeLargeRenderedCrawlCount,
  activeLargeRenderedCrawlForTarget,
  apiClaimLargeRenderedCrawlBatch,
  apiCreateLargeRenderedCrawl,
  apiGetLargeRenderedCrawl,
  apiLargeCrawlBatchResponse,
  apiLargeCrawlFrontierResponse,
  apiLargeRenderedCrawlResponse,
  apiListLargeRenderedCrawls,
  apiMarkLargeRenderedCrawlReadyToMerge,
  apiProcessLargeRenderedCrawlBatch,
  apiRetryLargeRenderedCrawl,
  apiSaveLargeRenderedCrawlBatchProof,
  claimLargeRenderedCrawlBatch,
  claimLargeRenderedCrawlBatchForAccess,
  createLargeRenderedCrawl,
  createLargeRenderedCrawlForAccess,
  deferUnprocessedLargeCrawlUrls,
  expireStaleLargeCrawlLeases,
  findLargeCrawlFrontierRow,
  getLargeRenderedCrawl,
  ingestRemainingLargeRenderedCrawlFrontier,
  insertLargeRenderedCrawl,
  largeCrawlBatchFromRow,
  largeCrawlBatchInsertStatement,
  largeCrawlBatchProofPath,
  largeCrawlBatchResponse,
  largeCrawlBatchLeaseIsActive,
  largeCrawlBillingStatus,
  largeCrawlFingerprint,
  largeCrawlFrontierFromRow,
  largeCrawlFrontierIngestionStatus,
  largeCrawlFrontierInsertStatement,
  largeCrawlJobFromRow,
  largeCrawlProofFromRow,
  largeCrawlProofInsertStatement,
  largeCrawlQuotaStatus,
  largeRenderedCrawlResponseForRow,
  latestLargeRenderedCrawlForTarget,
  listLargeRenderedCrawlRows,
  listLargeRenderedCrawls,
  loadLargeRenderedCrawl,
  loadLargeRenderedCrawlFromRequest,
  markLargeRenderedCrawlReadyToMerge,
  markLargeRenderedCrawlReadyToMergeForAccess,
  pathId,
  processLargeRenderedCrawlBatch,
  processLargeRenderedCrawlBatchForAccess,
  refreshLargeCrawlCounters,
  retryLargeRenderedCrawl,
  retryLargeRenderedCrawlForAccess,
  runDueLargeRenderedCrawlWorkers,
  saveLargeRenderedCrawlBatchProof,
  saveLargeRenderedCrawlBatchProofForAccess,
  stripUrlHash
};
