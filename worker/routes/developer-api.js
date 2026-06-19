import {
  clampPageLimit,
  normalizeUrl,
  parseAuditCompetitorUrls,
  publicAuditUrlStatus
} from "../../shared/audit-engine.js";
import { parseBacklinkRows } from "../../shared/backlink-audit.js";
import { parseKeywordRows } from "../../shared/keyword-rank-audit.js";
import { parseLocalSeoInput } from "../../shared/local-seo-audit.js";
import {
  deriveRepairQueueItems,
  apiRepairQueueSummary
} from "../../shared/repair-queue.js";
import {
  repairActionDetailResponse,
  repairQueueItemDetailResponse
} from "../../shared/repair-api-serializers.js";
import { normalizeRenderedCrawlTarget } from "../../shared/rendered-crawl-scale.js";
import {
  apiAccessResponse,
  apiAccessStatus,
  auditAuthorizationStatus,
  betaAccessResponse,
  betaAccessStatus
} from "../lib/auth.js";
import { json, jsonNoStore } from "../lib/http.js";
import { repairTableAll, requireRepairTables } from "../lib/repair-tables.js";
import {
  deleteReportRowsWithBlobs,
  protectedFixRequestForReport,
  reportJsonForRow
} from "../lib/report-data.js";
import { sha256Hex } from "../lib/security.js";
import {
  apiAuditResponse,
  apiIssueResponse,
  apiProjectResponse,
  apiReportResponse
} from "../lib/serializers.js";
import {
  claimHostFromInput,
  cleanText,
  isSafeReportId,
  isSafeUuid,
  isoSecondsFromNow,
  parseJson,
  randomHex
} from "../lib/text.js";
import {
  reportWithAuditRow,
  repairActionWebhookPayload
} from "../../shared/repair-action-rules.js";
import {
  createRepairActionRecord,
  ensureRepairQueueRows,
  saveRepairQueueItems,
  updateRepairActionRecord
} from "../lib/repair-agent-actions.js";
import {
  deliverApiWebhooks,
  apiWebhookSigningSecret,
  cleanWebhookEvents,
  publicWebhookUrlStatus
} from "../lib/webhooks.js";
import {
  activeAuditJobCount,
  activeAuditJobForTarget,
  auditQuotaStatus,
  createAuditJob,
  enqueueAuditJob,
  failStaleRunningAuditJobs
} from "./audits.js";

async function getDeveloperApiSummary(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);

  const [tokens, webhooks] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM api_tokens
       WHERE owner_email = ?
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM api_webhooks
       WHERE owner_email = ?
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all()
  ]);

  return jsonNoStore({
    ok: true,
    apiBaseUrl: "/v1",
    authHeader: "Authorization: Bearer YOUR_API_KEY",
    tokens: (tokens.results || []).map(apiTokenResponse),
    webhooks: (webhooks.results || []).map(apiWebhookResponse),
    docs: {
      startAudit: "POST /v1/audits",
      getAudit: "GET /v1/audits/{audit_id}",
      getIssues: "GET /v1/audits/{audit_id}/issues",
      getRepairQueue: "GET /v1/audits/{audit_id}/repair-queue",
      updateRepairQueue: "PATCH /v1/audits/{audit_id}/repair-queue",
      createRepairAction: "POST /v1/audits/{audit_id}/repair-actions",
      updateRepairAction: "PATCH /v1/audits/{audit_id}/repair-actions/{action_id}",
      getReport: "GET /v1/audits/{audit_id}/report",
      startLargeCrawl: "POST /v1/large-crawls",
      getLargeCrawl: "GET /v1/large-crawls/{large_crawl_id}",
      projects: "GET /v1/projects",
      webhookEvents: "audit.completed, audit.failed, repair_action.drafted, repair_action.approved, repair_action.applied, repair_action.fixed, repair_action.regressed"
    },
    issueFields: {
      repair_queue: "Safe per-issue queue status. Draft text is only returned from repair-action endpoints for the authenticated owner."
    },
    workerOnlyDocs: {
      authHeader: "x-seofixkit-worker-token: WORKER_TOKEN",
      proofToken: "Send claim response proof_token/proofToken back with proof saves.",
      claimLargeCrawlBatch: "POST /v1/large-crawls/{large_crawl_id}/batches/claim",
      processLargeCrawlBatch: "POST /v1/large-crawls/{large_crawl_id}/batches/process",
      saveLargeCrawlProof: "POST /v1/large-crawls/{large_crawl_id}/batches/{batch_id}/proof"
    }
  });
}

async function createDeveloperApiToken(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);

  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM api_tokens
     WHERE owner_email = ?
       AND status = 'active'`
  )
    .bind(access.ownerEmail)
    .first();
  if (Number(count?.count || 0) >= 5) {
    return jsonNoStore({ error: "You already have 5 active API keys. Revoke one before creating another." }, 429);
  }

  const now = new Date().toISOString();
  const tokenSecret = randomApiTokenSecret();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    token_hash: await sha256Hex(tokenSecret),
    token_prefix: `${tokenSecret.slice(0, 12)}...${tokenSecret.slice(-4)}`,
    label: cleanText(body.label || "API key", 80),
    scopes_json: JSON.stringify(["audits:read", "audits:write", "large_crawls:read", "large_crawls:write", "projects:read", "projects:write"]),
    status: "active",
    created_at: now,
    updated_at: now,
    last_used_at: "",
    revoked_at: ""
  };

  await env.WAITLIST_DB.prepare(
    `INSERT INTO api_tokens
      (id, owner_email, token_hash, token_prefix, label, scopes_json, status, created_at, updated_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.owner_email,
      row.token_hash,
      row.token_prefix,
      row.label,
      row.scopes_json,
      row.status,
      row.created_at,
      row.updated_at,
      null,
      null
    )
    .run();

  return jsonNoStore({
    ok: true,
    token: apiTokenResponse(row),
    tokenSecret,
    message: "Copy this API key now. It will not be shown again."
  });
}

async function revokeDeveloperApiToken(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/developer/tokens/".length));
  if (!isSafeUuid(id)) return json({ error: "API key not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE api_tokens
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "API key not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function createDeveloperWebhook(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);
  const urlCheck = publicWebhookUrlStatus(body.url || "");
  if (!urlCheck.ok) return jsonNoStore({ error: urlCheck.error }, 400);
  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM api_webhooks
     WHERE owner_email = ?
       AND status = 'active'`
  )
    .bind(access.ownerEmail)
    .first();
  if (Number(count?.count || 0) >= 5) {
    return jsonNoStore({ error: "You already have 5 active webhooks. Revoke one before adding another." }, 429);
  }

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    url: urlCheck.url,
    events_json: JSON.stringify(cleanWebhookEvents(body.events)),
    status: "active",
    created_at: now,
    updated_at: now,
    last_delivery_at: "",
    last_delivery_status: "",
    last_error: "",
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO api_webhooks
      (id, owner_email, url, events_json, status, created_at, updated_at, last_delivery_at, last_delivery_status, last_error, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.owner_email,
      row.url,
      row.events_json,
      row.status,
      row.created_at,
      row.updated_at,
      null,
      null,
      null,
      null
    )
    .run();

  return jsonNoStore({
    ok: true,
    webhook: apiWebhookResponse(row),
    signingSecret: await apiWebhookSigningSecret(env, row.id),
    message: "Copy this signing secret now. It will not be shown again."
  });
}

async function revokeDeveloperWebhook(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Developer API storage is not configured." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/developer/webhooks/".length));
  if (!isSafeUuid(id)) return json({ error: "Webhook not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE api_webhooks
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Webhook not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function apiListProjects(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM site_claims
     WHERE owner_email = ?
       AND revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 100`
  )
    .bind(access.ownerEmail)
    .all();
  return jsonNoStore({ ok: true, projects: (rows.results || []).map(apiProjectResponse) });
}

async function apiCreateProject(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const body = await request.json().catch(() => ({}));
  const host = claimHostFromInput(body.host || body.url || "");
  if (!host) return jsonNoStore({ error: "Enter a public website host to verify." }, 400);

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM site_claims
     WHERE owner_email = ?
       AND host = ?
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(access.ownerEmail, host)
    .first();
  if (existing?.id) return jsonNoStore({ ok: true, project: apiProjectResponse(existing) });

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    host,
    verification_token: `sfk-${randomHex(32)}`,
    status: "pending",
    verification_method: "",
    created_at: now,
    updated_at: now,
    verified_at: "",
    last_checked_at: "",
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO site_claims
      (id, owner_email, host, verification_token, status, verification_method, created_at, updated_at, verified_at, last_checked_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(row.id, row.owner_email, row.host, row.verification_token, row.status, null, row.created_at, row.updated_at, null, null, null)
    .run();
  return jsonNoStore({ ok: true, project: apiProjectResponse(row) }, 201);
}

async function apiCreateAudit(request, env, ctx) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const body = await request.json().catch(() => ({}));
  let targetUrl = "";
  try {
    targetUrl = normalizeUrl(body.url || body.targetUrl || "");
  } catch {
    return jsonNoStore({ error: "Enter a valid public website URL." }, 400);
  }
  const publicUrlCheck = publicAuditUrlStatus(targetUrl);
  if (!publicUrlCheck.ok) return jsonNoStore({ error: publicUrlCheck.error }, 400);
  const authorization = await auditAuthorizationStatus(env, access, targetUrl);
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
  const competitorInput = parseAuditCompetitorUrls(body, targetUrl);
  if (!competitorInput.ok) {
    return jsonNoStore({ error: competitorInput.error }, 400);
  }
  const competitorUrls = competitorInput.urls;
  const backlinkInput = parseBacklinkRows(body, targetUrl, { allowPrivate: false });
  if (!backlinkInput.ok) {
    return jsonNoStore({ error: backlinkInput.error }, 400);
  }
  const backlinkRows = backlinkInput.rows;
  const localSeoInput = parseLocalSeoInput(body, targetUrl, { allowPrivate: false });
  if (!localSeoInput.ok) {
    return jsonNoStore({ error: localSeoInput.error }, 400);
  }
  const localSeo = localSeoInput.input;
  const keywordInput = parseKeywordRows(body, targetUrl, { allowPrivate: false });
  if (!keywordInput.ok) {
    return jsonNoStore({ error: keywordInput.error }, 400);
  }
  const keywordRows = keywordInput.rows;
  const renderedCrawlTarget = normalizeRenderedCrawlTarget(
    body.rendered_crawl_target || body.renderedCrawlTarget || body.crawlScaleTarget || 0
  );
  const maxPages = clampPageLimit(body.max_pages || body.maxPages || 10);
  await failStaleRunningAuditJobs(env, access.ownerEmail);
  const existingJob = await activeAuditJobForTarget(env, access, targetUrl, competitorUrls, backlinkRows, localSeo, keywordRows, renderedCrawlTarget, maxPages);
  if (existingJob) {
    return jsonNoStore(
      {
        ok: true,
        deduped: true,
        audit: apiAuditResponse(existingJob),
        audit_id: existingJob.id,
        status_url: `/v1/audits/${existingJob.id}`
      },
      202
    );
  }
  const activeCount = await activeAuditJobCount(env, access);
  if (activeCount >= 3) {
    return jsonNoStore(
      {
        error: "You already have 3 audits running. Wait for one to finish before starting another.",
        code: "AUDIT_JOBS_ACTIVE_LIMIT"
      },
      429
    );
  }

  const quota = await auditQuotaStatus(request, env, access, targetUrl);
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  const job = await createAuditJob(env, access, targetUrl, maxPages, {
    competitorUrls,
    backlinkRows,
    localSeo,
    keywordRows,
    renderedCrawlTarget
  });
  await enqueueAuditJob(env, ctx, job.id, new URL(request.url).origin);
  return jsonNoStore(
    {
      ok: true,
      audit: apiAuditResponse(job),
      audit_id: job.id,
      status_url: `/v1/audits/${job.id}`,
      estimated_completion: isoSecondsFromNow(5 * 60)
    },
    202
  );
}

async function apiListAudits(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_jobs
     WHERE owner_email = ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(access.ownerEmail, new Date().toISOString())
    .all();
  return jsonNoStore({ ok: true, audits: (rows.results || []).map(apiAuditResponse) });
}

async function apiGetAudit(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/");
  if (!isSafeUuid(id)) return jsonNoStore({ error: "Audit not found." }, 404);
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_jobs
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return jsonNoStore({ error: "Audit not found." }, 404);
  return jsonNoStore({ ok: true, audit: apiAuditResponse(row) });
}

async function apiGetAuditIssues(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/", "/issues");
  const resolved = await resolveApiAuditReport(env, access, id);
  if (!resolved.ok) return jsonNoStore({ error: resolved.error }, resolved.status || 404);
  const findings = (resolved.report.findings || []).filter((finding) => finding.severity !== "good");
  const queue = await apiRepairQueueOverlay(env, access, resolved.report.id, resolved.report);
  return jsonNoStore({
    ok: true,
    auditId: resolved.job?.id || "",
    reportId: resolved.report.id,
    issues: findings.map((finding) => apiIssueResponse(finding, queue.byIssue.get(finding.id), {
      repairQueueUnavailable: queue.unavailable
    })),
    total: findings.length
  });
}

async function apiGetAuditReport(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/", "/report");
  const resolved = await resolveApiAuditReport(env, access, id);
  if (!resolved.ok) return jsonNoStore({ error: resolved.error }, resolved.status || 404);
  const queue = await apiRepairQueueOverlay(env, access, resolved.report.id, resolved.report);
  return jsonNoStore({
    ok: true,
    report: apiReportResponse(resolved.report, {
      repairQueueItems: queue.items,
      repairQueueUnavailable: queue.unavailable
    })
  });
}

async function apiGetRepairQueue(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/", "/repair-queue");
  const resolved = await resolveApiAuditReport(env, access, id);
  if (!resolved.ok) return jsonNoStore({ error: resolved.error }, resolved.status);
  const ensured = await ensureRepairQueueRows(env, access, resolved.report.id, resolved.report);
  const queue = {
    items: ensured.items,
    byIssue: new Map(ensured.items.map((item) => [item.issueId, item])),
    unavailable: Boolean(ensured.unavailable)
  };
  return jsonNoStore(apiRepairQueueResponseBody(resolved, queue));
}

async function apiSaveRepairQueue(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const repairTables = await requireRepairTables(env);
  if (!repairTables.ok) return repairTables.response;
  const id = apiAuditIdFromPath(request.url, "/v1/audits/", "/repair-queue");
  const resolved = await resolveApiAuditReport(env, access, id);
  if (!resolved.ok) return jsonNoStore({ error: resolved.error }, resolved.status);

  const reportId = resolved.report.id;
  const saved = await saveRepairQueueItems(env, access, reportId, resolved.report, body);
  if (!saved.ok) return jsonNoStore({ error: saved.error }, saved.status || 400);

  const queue = await apiRepairQueueOverlay(env, access, reportId, resolved.report);
  return jsonNoStore(apiRepairQueueResponseBody(resolved, queue));
}

async function apiCreateRepairAction(request, env, ctx = null) {
  const body = await request.json().catch(() => ({}));
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const repairTables = await requireRepairTables(env);
  if (!repairTables.ok) return repairTables.response;
  const id = apiAuditIdFromPath(request.url, "/v1/audits/", "/repair-actions");
  const resolved = await resolveApiAuditReport(env, access, id);
  if (!resolved.ok) return jsonNoStore({ error: resolved.error }, resolved.status);

  const reportId = resolved.report.id;
  const created = await createRepairActionRecord(env, access, reportId, resolved.report, body);
  if (!created.ok) return jsonNoStore({ error: created.error }, created.status || 400);
  for (const eventType of created.events || []) {
    scheduleApiRepairActionWebhook(env, access, ctx, eventType, created.action, resolved.report);
  }

  const queue = await apiRepairQueueOverlay(env, access, reportId, resolved.report);
  return jsonNoStore({
    ok: true,
    action: repairActionDetailResponse(created.action),
    queue: {
      items: queue.items.map(repairQueueItemDetailResponse),
      summary: apiRepairQueueSummary(queue.items)
    }
  }, created.status || 201);
}

async function apiUpdateRepairAction(request, env, ctx = null) {
  const body = await request.json().catch(() => ({}));
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const repairTables = await requireRepairTables(env);
  if (!repairTables.ok) return repairTables.response;
  const { auditId, actionId } = apiRepairActionPathParts(request.url);
  if (!isSafeUuid(actionId)) return json({ error: "Action not found." }, 404);
  const resolved = await resolveApiAuditReport(env, access, auditId);
  if (!resolved.ok) return jsonNoStore({ error: resolved.error }, resolved.status);
  const reportId = resolved.report.id;

  const updated = await updateRepairActionRecord(env, access, reportId, resolved.report, actionId, body);
  if (!updated.ok) {
    const respond = updated.status === 404 ? json : jsonNoStore;
    return respond({ error: updated.error }, updated.status || 400);
  }
  for (const eventType of updated.events || []) {
    scheduleApiRepairActionWebhook(env, access, ctx, eventType, updated.action, resolved.report);
  }
  const queue = await apiRepairQueueOverlay(env, access, reportId, resolved.report);
  return jsonNoStore({
    ok: true,
    action: repairActionDetailResponse(updated.action),
    queue: {
      items: queue.items.map(repairQueueItemDetailResponse),
      summary: apiRepairQueueSummary(queue.items)
    }
  });
}

async function apiDeleteAudit(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) return apiAccessResponse(access);
  const id = apiAuditIdFromPath(request.url, "/v1/audits/");
  if (!isSafeUuid(id)) return jsonNoStore({ error: "Audit not found." }, 404);
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, report_id
     FROM audit_jobs
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return jsonNoStore({ error: "Audit not found." }, 404);
  let jobDeletedWithReport = false;
  if (row.report_id) {
    const reportRow = await env.WAITLIST_DB.prepare(
      `SELECT id, report_json FROM audit_reports WHERE id = ? AND owner_email = ? LIMIT 1`
    ).bind(row.report_id, access.ownerEmail).first();
    if (reportRow?.id) {
      const deleted = await deleteReportRowsWithBlobs(env, [reportRow]);
      if (deleted.protectedIds.includes(row.report_id)) {
        const protectedFixRequest = await protectedFixRequestForReport(env, row.report_id);
        return jsonNoStore(
          {
            error: "This audit report is locked because it is attached to a paid Fix Pack record.",
            code: "FIX_PACK_REPORT_LOCKED",
            fixRequestId: protectedFixRequest?.id || ""
          },
          409
        );
      }
      if (!deleted.deletedIds.includes(row.report_id)) {
        return jsonNoStore({ error: "Audit report could not be deleted." }, 409);
      }
      jobDeletedWithReport = true;
    }
  }
  if (!jobDeletedWithReport) {
    await env.WAITLIST_DB.prepare(`DELETE FROM audit_jobs WHERE id = ? AND owner_email = ?`).bind(id, access.ownerEmail).run();
  }
  return jsonNoStore({ ok: true, deleted: true, auditId: id });
}

function apiTokenResponse(row = {}) {
  return {
    id: row.id || "",
    label: row.label || "API key",
    tokenPrefix: row.token_prefix || "",
    scopes: parseJson(row.scopes_json, []),
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastUsedAt: row.last_used_at || "",
    revokedAt: row.revoked_at || ""
  };
}

function apiWebhookResponse(row = {}) {
  return {
    id: row.id || "",
    url: row.url || "",
    events: parseJson(row.events_json, []),
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastDeliveryAt: row.last_delivery_at || "",
    lastDeliveryStatus: row.last_delivery_status || "",
    lastError: row.last_error || ""
  };
}

function apiAuditIdFromPath(rawUrl, prefix, suffix = "") {
  const pathname = new URL(rawUrl).pathname;
  const withoutPrefix = pathname.slice(prefix.length);
  const value = suffix && withoutPrefix.endsWith(suffix)
    ? withoutPrefix.slice(0, -suffix.length)
    : withoutPrefix;
  return decodeURIComponent(value.replace(/^\/|\/$/g, ""));
}

async function resolveApiAuditReport(env, access, id) {
  let job = null;
  let reportId = id;
  if (isSafeUuid(id)) {
    job = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM audit_jobs
       WHERE id = ?
         AND owner_email = ?
       LIMIT 1`
    )
      .bind(id, access.ownerEmail)
      .first();
    if (job?.id) reportId = job.report_id || "";
  }
  if (!reportId) {
    if (job?.status === "failed") return { ok: false, status: 409, error: job.error || "Audit failed." };
    return { ok: false, status: 409, error: "Audit is still running." };
  }
  if (!isSafeReportId(reportId)) return { ok: false, status: 404, error: "Report not found." };
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, report_json, owner_email, expires_at, url, target_host, created_at, updated_at
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(reportId, access.ownerEmail)
    .first();
  if (!row?.report_json) {
    if (job?.status === "queued" || job?.status === "running") return { ok: false, status: 409, error: "Audit is still running." };
    return { ok: false, status: 404, error: "Report not found." };
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    const deleted = await deleteReportRowsWithBlobs(env, [{ id: reportId, report_json: row.report_json }]);
    if (deleted.protectedIds.includes(reportId)) {
      row.expires_at = null;
      const reportJson = await reportJsonForRow(env, row);
      if (!reportJson) return { ok: false, status: 404, error: "Report not found." };
      const parsedReport = parseJson(reportJson, null);
      if (!parsedReport) return { ok: false, status: 404, error: "Report not found." };
      return { ok: true, job, report: reportWithAuditRow(parsedReport, row, reportId) };
    }
    return { ok: false, status: 404, error: "Report expired." };
  }
  const reportJson = await reportJsonForRow(env, row);
  if (!reportJson) return { ok: false, status: 404, error: "Report not found." };
  const parsedReport = parseJson(reportJson, null);
  if (!parsedReport) return { ok: false, status: 404, error: "Report not found." };
  return { ok: true, job, report: reportWithAuditRow(parsedReport, row, reportId) };
}

async function apiRepairQueueOverlay(env, access, reportId, report = {}) {
  if (!env.WAITLIST_DB || !isSafeReportId(reportId)) return { items: [], byIssue: new Map() };
  const [queueRows, actionRows] = await Promise.all([
    repairTableAll(env.WAITLIST_DB.prepare(
      `SELECT *
       FROM repair_queue_items
       WHERE report_id = ?
         AND owner_email = ?`
    )
      .bind(reportId, access.ownerEmail)
    ),
    repairTableAll(env.WAITLIST_DB.prepare(
      `SELECT *
       FROM repair_agent_actions
       WHERE report_id = ?
         AND owner_email = ?
       ORDER BY updated_at DESC
       LIMIT 200`
    )
      .bind(reportId, access.ownerEmail)
    )
  ]);
  const items = deriveRepairQueueItems(report, queueRows.results || [], actionRows.results || []);
  return {
    items,
    byIssue: new Map(items.map((item) => [item.issueId, item])),
    unavailable: Boolean(queueRows.repairTablesMissing || actionRows.repairTablesMissing)
  };
}

function apiRepairQueueResponseBody(resolved = {}, queue = {}) {
  return {
    ok: true,
    audit_id: resolved.job?.id || "",
    report_id: resolved.report?.id || "",
    items: (queue.items || []).map(repairQueueItemDetailResponse),
    summary: apiRepairQueueSummary(queue.items || []),
    unavailable: Boolean(queue.unavailable)
  };
}

function apiRepairActionPathParts(rawUrl) {
  const pathname = new URL(rawUrl).pathname;
  const prefix = "/v1/audits/";
  const marker = "/repair-actions/";
  if (!pathname.startsWith(prefix) || !pathname.includes(marker)) return { auditId: "", actionId: "" };
  const rest = pathname.slice(prefix.length);
  const markerIndex = rest.indexOf(marker.slice(1));
  return {
    auditId: decodeURIComponent(rest.slice(0, markerIndex).replace(/^\/|\/$/g, "")),
    actionId: decodeURIComponent(rest.slice(markerIndex + marker.length - 1).replace(/^\/|\/$/g, ""))
  };
}

function scheduleApiRepairActionWebhook(env, access, ctx, eventType, action = {}, report = {}) {
  const delivery = deliverApiWebhooks(
    env,
    access.ownerEmail,
    eventType,
    repairActionWebhookPayload(action, report)
  ).catch((error) => {
    console.error("API repair action webhook delivery failed", {
      eventType,
      actionId: action?.id || "",
      reportId: action?.report_id || "",
      error: error?.message || String(error)
    });
  });
  if (ctx?.waitUntil) ctx.waitUntil(delivery);
}

function randomApiTokenSecret() {
  return `sfk_live_${randomHex(24)}`;
}

export {
  apiAuditIdFromPath,
  apiCreateAudit,
  apiCreateProject,
  apiCreateRepairAction,
  apiDeleteAudit,
  apiGetAudit,
  apiGetAuditIssues,
  apiGetAuditReport,
  apiGetRepairQueue,
  apiSaveRepairQueue,
  apiUpdateRepairAction,
  apiListAudits,
  apiListProjects,
  apiTokenResponse,
  apiWebhookResponse,
  createDeveloperApiToken,
  createDeveloperWebhook,
  getDeveloperApiSummary,
  randomApiTokenSecret,
  resolveApiAuditReport,
  revokeDeveloperApiToken,
  revokeDeveloperWebhook
};
