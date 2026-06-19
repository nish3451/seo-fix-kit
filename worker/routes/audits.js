import puppeteer from "@cloudflare/puppeteer";
import {
  clampPageLimit,
  competitorUrlsKey,
  createAuditEngine,
  normalizeCompetitorUrlsList,
  normalizeUrl,
  parseAuditCompetitorUrls,
  publicAuditUrlStatus
} from "../../shared/audit-engine.js";
import { backlinkRowsKey, parseBacklinkRows } from "../../shared/backlink-audit.js";
import { keywordRowsKey, parseKeywordRows } from "../../shared/keyword-rank-audit.js";
import { localSeoInputKey, parseLocalSeoInput } from "../../shared/local-seo-audit.js";
import { normalizeRenderedCrawlTarget } from "../../shared/rendered-crawl-scale.js";
import { resolvesToPrivateAddress } from "../../shared/url-safety.js";
import { auditAuthorizationStatus, betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { runD1BatchChunks } from "../lib/db.js";
import { json, jsonNoStore } from "../lib/http.js";
import { monitoringAccessForOwner } from "../lib/offers.js";
import {
  REPORT_RETENTION_DAYS,
  saveAuditReport,
  saveAuditReportWithContext
} from "../lib/report-data.js";
import { checkQuotaSet, requestIpHash, workerLargeCrawlId } from "../lib/security.js";
import {
  apiAuditResponse,
  apiReportResponse,
  auditJobResponse,
  auditScheduleResponse
} from "../lib/serializers.js";
import {
  clampScheduleInterval,
  cleanText,
  dayWindow,
  hourWindow,
  isSafeUuid,
  isoDaysFromDate,
  isoDaysFromNow,
  isoSecondsFromNow,
  normalizeEmail,
  parseJson,
  safeHostname
} from "../lib/text.js";
import { deliverApiWebhooks } from "../lib/webhooks.js";

async function runPrivateAudit(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  let targetUrl = "";
  try {
    targetUrl = normalizeUrl(body.url || "");
  } catch {
    return json({ error: "Enter a valid public website URL." }, 400);
  }
  const publicUrlCheck = publicAuditUrlStatus(targetUrl);
  if (!publicUrlCheck.ok) {
    return json({ error: publicUrlCheck.error }, 400);
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
    body.renderedCrawlTarget || body.rendered_crawl_target || body.crawlScaleTarget || 0
  );
  const maxPages = clampPageLimit(body.maxPages || 10);

  // A homepage-only Lite check (1 page, no imports or extras) may run before
  // site verification so new users can see proof quality first.
  const liteEligible =
    maxPages <= 1 &&
    !competitorUrls.length &&
    !backlinkRows.length &&
    !keywordRows.length &&
    !localSeo?.enabled &&
    !renderedCrawlTarget;
  const authorization = await auditAuthorizationStatus(env, access, targetUrl, { allowLite: liteEligible });
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
  if (authorization.lite) {
    const liteQuota = await liteAuditQuotaStatus(env, access);
    if (!liteQuota.ok) {
      return jsonNoStore({ error: liteQuota.error, resetAt: liteQuota.resetAt }, 429);
    }
  }

  await failStaleRunningAuditJobs(env, access.ownerEmail);
  const existingJob = await activeAuditJobForTarget(env, access, targetUrl, competitorUrls, backlinkRows, localSeo, keywordRows, renderedCrawlTarget, maxPages);
  if (existingJob) {
    return jsonNoStore(
      {
        ok: true,
        mode: "queued",
        deduped: true,
        job: auditJobResponse(existingJob),
        jobId: existingJob.id,
        statusUrl: `/api/audit/jobs/${existingJob.id}`
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
      mode: "queued",
      job: auditJobResponse(job),
      jobId: job.id,
      statusUrl: `/api/audit/jobs/${job.id}`
    },
    202
  );
}

async function listAuditSchedules(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Schedule storage is not configured." }, 503);

  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_schedules
     WHERE owner_email = ?
       AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 20`
  )
    .bind(access.ownerEmail)
    .all();

  return jsonNoStore({
    ok: true,
    schedules: (rows.results || []).map(auditScheduleResponse),
    monitoring: await monitoringAccessForOwner(env, access.ownerEmail, (rows.results || []).length)
  });
}

async function createAuditSchedule(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Schedule storage is not configured." }, 503);

  let targetUrl = "";
  try {
    targetUrl = normalizeUrl(body.url || body.targetUrl || "");
  } catch {
    return json({ error: "Enter a valid public website URL." }, 400);
  }
  const publicUrlCheck = publicAuditUrlStatus(targetUrl);
  if (!publicUrlCheck.ok) {
    return json({ error: publicUrlCheck.error }, 400);
  }

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

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_schedules
     WHERE owner_email = ?
       AND target_url = ?
       AND status = 'active'
     LIMIT 1`
  )
    .bind(access.ownerEmail, targetUrl)
    .first();
  if (existing?.id) {
    return jsonNoStore({ ok: true, schedule: auditScheduleResponse(existing), deduped: true });
  }

  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM audit_schedules
     WHERE owner_email = ?
       AND status = 'active'`
  )
    .bind(access.ownerEmail)
    .first();
  const activeSchedules = Number(count?.count || 0);
  const monitoring = await monitoringAccessForOwner(env, access.ownerEmail, activeSchedules);
  if (activeSchedules >= monitoring.limit) {
    return jsonNoStore(
      {
        error: `You already have ${monitoring.limit} active monitors. Pause one before adding another.`,
        code: "MONITORING_ENTITLEMENT_LIMIT",
        monitoring
      },
      429
    );
  }

  const now = new Date().toISOString();
  const intervalDays = clampScheduleInterval(body.intervalDays || 7);
  if (intervalDays < Number(monitoring.cadenceDays || 7)) {
    return jsonNoStore(
      {
        error: `This monitoring entitlement allows audits every ${monitoring.cadenceDays} days or slower.`,
        code: "MONITORING_CADENCE_LIMIT",
        monitoring
      },
      429
    );
  }
  const schedule = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    owner_session_hash: access.sessionHash || "",
    owner_invite_id: access.inviteId || "",
    access_mode: access.accessMode || "invite",
    target_url: targetUrl,
    target_host: safeHostname(targetUrl),
    max_pages: clampPageLimit(body.maxPages || 10),
    interval_days: intervalDays,
    status: "active",
    next_run_at: now,
    last_run_at: "",
    last_job_id: "",
    last_report_id: "",
    last_error: "",
    created_at: now,
    updated_at: now,
    paused_at: ""
  };

  await env.WAITLIST_DB.prepare(
    `INSERT INTO audit_schedules
      (id, owner_email, owner_session_hash, owner_invite_id, access_mode, target_url, target_host, max_pages, interval_days, status, next_run_at, last_run_at, last_job_id, last_report_id, last_error, created_at, updated_at, paused_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      schedule.id,
      schedule.owner_email,
      schedule.owner_session_hash,
      schedule.owner_invite_id || null,
      schedule.access_mode,
      schedule.target_url,
      schedule.target_host,
      schedule.max_pages,
      schedule.interval_days,
      schedule.status,
      schedule.next_run_at,
      null,
      null,
      null,
      null,
      schedule.created_at,
      schedule.updated_at,
      null
    )
    .run();

  return jsonNoStore({
    ok: true,
    schedule: auditScheduleResponse(schedule),
    monitoring: {
      ...monitoring,
      activeCount: activeSchedules + 1,
      remaining: Math.max(0, monitoring.limit - activeSchedules - 1)
    }
  });
}

async function deleteAuditSchedule(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Schedule storage is not configured." }, 503);

  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/audit/schedules/".length));
  if (!isSafeUuid(id)) return json({ error: "Monitor not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE audit_schedules
     SET status = 'paused', paused_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) {
    return json({ error: "Monitor not found." }, 404);
  }
  return jsonNoStore({ ok: true, status: "paused", id });
}

async function activeAuditJobForTarget(env, access, targetUrl, competitorUrls = [], backlinkRows = [], localSeo = {}, keywordRows = [], renderedCrawlTarget = 0, maxPages = 10) {
  const competitorKey = competitorUrlsKey(competitorUrls);
  const backlinkKey = backlinkRowsKey(backlinkRows);
  const localSeoKey = localSeoInputKey(localSeo);
  const keywordKey = keywordRowsKey(keywordRows);
  const renderedTarget = normalizeRenderedCrawlTarget(renderedCrawlTarget);
  const pageLimit = clampPageLimit(maxPages || 10);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_jobs
     WHERE owner_email = ?
       AND target_url = ?
       AND status IN ('queued', 'running')
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC
     LIMIT 10`
  )
    .bind(access.ownerEmail, targetUrl, new Date().toISOString())
    .all();
  const row = (rows.results || []).find(
    (item) =>
      competitorUrlsKey(parseJson(item.competitor_urls_json, [])) === competitorKey &&
      backlinkRowsKey(parseJson(item.backlink_rows_json, [])) === backlinkKey &&
      localSeoInputKey(parseJson(item.local_seo_input_json, { enabled: false })) === localSeoKey &&
      keywordRowsKey(parseJson(item.keyword_rows_json, [])) === keywordKey &&
      normalizeRenderedCrawlTarget(item.rendered_crawl_target || 0) === renderedTarget &&
      clampPageLimit(item.max_pages || 10) === pageLimit
  );
  return row?.id ? row : null;
}

async function activeAuditJobCount(env, access) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM audit_jobs
     WHERE owner_email = ?
       AND status IN ('queued', 'running')
       AND (expires_at IS NULL OR expires_at > ?)`
  )
    .bind(access.ownerEmail, new Date().toISOString())
    .first();
  return Number(row?.count || 0);
}

async function createAuditJob(env, access, targetUrl, maxPages, options = {}) {
  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    owner_session_hash: access.sessionHash || "",
    owner_invite_id: access.inviteId || "",
    access_mode: access.accessMode || "invite",
    target_url: targetUrl,
    target_host: safeHostname(targetUrl),
    competitor_urls_json: JSON.stringify(normalizeCompetitorUrlsList(options.competitorUrls || [], targetUrl)),
    backlink_rows_json: JSON.stringify(parseBacklinkRows({ backlinkRows: options.backlinkRows || [] }, targetUrl, { allowPrivate: false }).rows || []),
    local_seo_input_json: JSON.stringify(parseLocalSeoInput({ localSeo: options.localSeo || {} }, targetUrl, { allowPrivate: false }).input || { enabled: false }),
    keyword_rows_json: JSON.stringify(parseKeywordRows({ keywordRows: options.keywordRows || [] }, targetUrl, { allowPrivate: false }).rows || []),
    rendered_crawl_target: normalizeRenderedCrawlTarget(options.renderedCrawlTarget || 0),
    max_pages: maxPages,
    status: "queued",
    report_id: "",
    schedule_id: options.scheduleId || "",
    error: "",
    created_at: now,
    updated_at: now,
    started_at: "",
    completed_at: "",
    expires_at: isoDaysFromNow(REPORT_RETENTION_DAYS)
  };

  await env.WAITLIST_DB.prepare(
    `INSERT INTO audit_jobs
      (id, owner_email, owner_session_hash, owner_invite_id, access_mode, target_url, target_host, competitor_urls_json, backlink_rows_json, local_seo_input_json, keyword_rows_json, rendered_crawl_target, max_pages, status, report_id, schedule_id, error, created_at, updated_at, started_at, completed_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      job.id,
      job.owner_email,
      job.owner_session_hash,
      job.owner_invite_id || null,
      job.access_mode,
      job.target_url,
      job.target_host,
      job.competitor_urls_json,
      job.backlink_rows_json,
      job.local_seo_input_json,
      job.keyword_rows_json,
      job.rendered_crawl_target,
      job.max_pages,
      job.status,
      null,
      job.schedule_id || null,
      null,
      job.created_at,
      job.updated_at,
      null,
      null,
      job.expires_at
    )
    .run();

  await persistBacklinkImportHistory(env, access, targetUrl, parseJson(job.backlink_rows_json, []));
  await persistKeywordImportHistory(env, access, targetUrl, parseJson(job.keyword_rows_json, []));

  return job;
}

async function persistBacklinkImportHistory(env, access, targetUrl, rows = []) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const targetHost = safeHostname(targetUrl);
  const batchId = workerLargeCrawlId("bli");
  const statements = [
    env.WAITLIST_DB.prepare(
      `INSERT INTO backlink_import_batches
        (id, owner_email, target_host, source, row_count, live_count, lost_count, risky_count, imported_at, created_at)
       VALUES (?, ?, ?, 'audit-import', ?, 0, 0, 0, ?, ?)`
    ).bind(batchId, access.ownerEmail, targetHost, rows.length, now, now),
    ...rows.map((row) => {
      const sourceUrl = row.sourceUrl || "";
      const target = row.targetUrl || targetUrl;
      return env.WAITLIST_DB.prepare(
        `INSERT OR REPLACE INTO backlink_edges
          (id, owner_email, target_host, import_batch_id, source_url, source_host, target_url, anchor_text, rel, first_seen, last_seen, status, source_status, target_status, live, risky_signals_json, proof_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'imported', 0, 0, 0, '[]', ?, ?, ?)`
      ).bind(
        workerLargeCrawlId("ble"),
        access.ownerEmail,
        targetHost,
        batchId,
        sourceUrl,
        safeHostname(sourceUrl),
        target,
        row.anchorText || null,
        row.firstSeen || null,
        row.lastSeen || null,
        JSON.stringify({ source: "audit-import", statusHint: row.statusHint || "" }),
        now,
        now
      );
    })
  ];
  await runD1BatchChunks(env, statements);
}

async function persistKeywordImportHistory(env, access, targetUrl, rows = []) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const targetHost = safeHostname(targetUrl);
  const batchId = workerLargeCrawlId("kwi");
  const queryCount = new Set(rows.map((row) => row.normalizedQuery || String(row.query || "").toLowerCase()).filter(Boolean)).size;
  const pageCount = new Set(rows.map((row) => row.pageUrl || "").filter(Boolean)).size;
  const statements = [
    env.WAITLIST_DB.prepare(
      `INSERT INTO keyword_import_batches
        (id, owner_email, target_host, source, row_count, query_count, landing_page_count, imported_at, created_at)
       VALUES (?, ?, ?, 'audit-import', ?, ?, ?, ?, ?)`
    ).bind(batchId, access.ownerEmail, targetHost, rows.length, queryCount, pageCount, now, now),
    ...rows.map((row) =>
      env.WAITLIST_DB.prepare(
        `INSERT INTO keyword_rank_observations
          (id, owner_email, target_host, import_batch_id, query, normalized_query, page_url, clicks, impressions, ctr, position, previous_clicks, previous_impressions, previous_ctr, previous_position, source, observed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        workerLargeCrawlId("kro"),
        access.ownerEmail,
        targetHost,
        batchId,
        row.query || "",
        row.normalizedQuery || String(row.query || "").toLowerCase(),
        row.pageUrl || null,
        Number(row.clicks || 0),
        Number(row.impressions || 0),
        Number(row.ctr || 0),
        Number(row.position || 0),
        Number(row.previousClicks || 0),
        Number(row.previousImpressions || 0),
        Number(row.previousCtr || 0),
        Number(row.previousPosition || 0),
        row.source || "audit-import",
        now,
        now
      )
    )
  ];
  await runD1BatchChunks(env, statements);
}

async function runDueAuditSchedules(env) {
  if (!env.WAITLIST_DB) return;
  const now = new Date().toISOString();
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_schedules
     WHERE status = 'active'
       AND next_run_at <= ?
     ORDER BY next_run_at ASC
     LIMIT 5`
  )
    .bind(now)
    .all();

  for (const schedule of rows.results || []) {
    await runAuditSchedule(env, schedule);
  }
}

async function runAuditSchedule(env, schedule) {
  if (!schedule?.id) return;
  const now = new Date().toISOString();
  const access = {
    ownerEmail: schedule.owner_email,
    sessionHash: schedule.owner_session_hash || "",
    inviteId: schedule.owner_invite_id || "",
    accessMode: schedule.access_mode || "schedule"
  };

  const existing = await activeAuditJobForTarget(env, access, schedule.target_url, [], [], {}, [], 0, schedule.max_pages || 10);
  if (existing?.id) {
    const retryAt = isoDaysFromDate(now, 1);
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_schedules
       SET last_error = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind("Skipped because an audit is already queued or running for this URL.", retryAt, now, schedule.id)
      .run();
    return;
  }

  try {
    const job = await createAuditJob(
      env,
      access,
      schedule.target_url,
      clampPageLimit(schedule.max_pages || 10),
      { scheduleId: schedule.id }
    );
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_schedules
       SET last_run_at = ?, last_job_id = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`
    )
      .bind(now, job.id, now, schedule.id)
      .run();
    await enqueueAuditJob(env, null, job.id, String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com"));
  } catch (error) {
    const retryAt = isoDaysFromDate(now, 1);
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_schedules
       SET last_error = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(cleanText(error?.message || "Scheduled audit failed.", 260), retryAt, new Date().toISOString(), schedule.id)
      .run();
  }
}

const AUDIT_JOB_RUNNING_STALE_MINUTES = 20;

const AUDIT_JOB_QUEUED_STALE_MINUTES = 10;

const AUDIT_JOB_TIMEOUT_MESSAGE = "The audit timed out before finishing. Run it again.";

async function failStaleRunningAuditJobs(env, ownerEmail = "") {
  if (!env.WAITLIST_DB) return 0;
  const cutoff = isoSecondsFromNow(-AUDIT_JOB_RUNNING_STALE_MINUTES * 60);
  let where = `status = 'running' AND started_at IS NOT NULL AND started_at < ?`;
  const params = [cutoff];
  if (ownerEmail) {
    where += " AND owner_email = ?";
    params.push(ownerEmail);
  }
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id, schedule_id FROM audit_jobs WHERE ${where} LIMIT 25`
  )
    .bind(...params)
    .all();
  let failedCount = 0;
  for (const job of rows.results || []) {
    const now = new Date().toISOString();
    const updated = await env.WAITLIST_DB.prepare(
      `UPDATE audit_jobs
       SET status = 'failed', error = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'running' AND started_at < ?`
    )
      .bind(AUDIT_JOB_TIMEOUT_MESSAGE, now, now, job.id, cutoff)
      .run();
    if (Number(updated?.meta?.changes || 0) !== 1) continue;
    failedCount += 1;
    if (job.schedule_id) {
      await env.WAITLIST_DB.prepare(
        `UPDATE audit_schedules SET last_error = ?, next_run_at = ?, updated_at = ? WHERE id = ?`
      )
        .bind(AUDIT_JOB_TIMEOUT_MESSAGE, isoDaysFromDate(now, 1), now, job.schedule_id)
        .run();
    }
  }
  return failedCount;
}

async function resumeStaleQueuedAuditJobs(env, context = {}) {
  if (!env.WAITLIST_DB) return 0;
  const cutoff = isoSecondsFromNow(-AUDIT_JOB_QUEUED_STALE_MINUTES * 60);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id FROM audit_jobs
     WHERE status = 'queued' AND created_at < ?
     ORDER BY created_at ASC
     LIMIT 3`
  )
    .bind(cutoff)
    .all();
  let resumed = 0;
  for (const job of rows.results || []) {
    await enqueueAuditJob(env, null, job.id, context.appOrigin || "https://seofixkit.com");
    resumed += 1;
  }
  return resumed;
}

// Queue-first job dispatch: survives Worker eviction and deploys, retries
// twice, then dead-letters. Falls back to in-invocation processing when the
// queue binding is missing (local dev) or the send fails.
async function enqueueAuditJob(env, ctx, jobId, appOrigin) {
  if (env.AUDIT_QUEUE) {
    try {
      await env.AUDIT_QUEUE.send({ kind: "audit-job", jobId, appOrigin });
      return;
    } catch {
      // fall through to inline processing
    }
  }
  const processing = processAuditJob(env, jobId, { appOrigin });
  if (ctx?.waitUntil) ctx.waitUntil(processing);
  else await processing;
}

async function processAuditJob(env, jobId, context = {}) {
  if (!env.WAITLIST_DB || !isSafeUuid(jobId)) return;

  const startedAt = new Date().toISOString();
  const claimed = await env.WAITLIST_DB.prepare(
    `UPDATE audit_jobs
     SET status = 'running', started_at = ?, updated_at = ?
     WHERE id = ? AND status = 'queued'`
  )
    .bind(startedAt, startedAt, jobId)
    .run();
  if (Number(claimed?.meta?.changes || 0) !== 1) return;

  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM audit_jobs WHERE id = ? LIMIT 1`)
    .bind(jobId)
    .first();
  if (!row?.id) return;

  try {
    if (await resolvesToPrivateAddress(new URL(row.target_url).hostname)) {
      throw new Error("This URL points at a private or internal address and cannot be audited.");
    }
    const report = await auditUrl(row.target_url, env, {
      maxPages: clampPageLimit(row.max_pages || 10),
      appOrigin: context.appOrigin || "https://seofixkit.com",
      competitorUrls: parseJson(row.competitor_urls_json, []),
      backlinkRows: parseJson(row.backlink_rows_json, []),
      localSeo: parseJson(row.local_seo_input_json, { enabled: false }),
      keywordRows: parseJson(row.keyword_rows_json, []),
      renderedCrawlTarget: row.rendered_crawl_target || 0
    });
    const saved = await saveAuditReportWithContext(
      report,
      env,
      {
        ownerEmail: row.owner_email,
        sessionHash: row.owner_session_hash || "",
        inviteId: row.owner_invite_id || null,
        accessMode: row.access_mode || "invite"
      },
      context.appOrigin || "https://seofixkit.com"
    );
    const completedAt = new Date().toISOString();
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_jobs
       SET status = 'completed', report_id = ?, error = NULL, completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(saved.id, completedAt, completedAt, jobId)
      .run();
    if (row.schedule_id) {
      const schedule = await env.WAITLIST_DB.prepare(
        `SELECT interval_days FROM audit_schedules WHERE id = ? LIMIT 1`
      )
        .bind(row.schedule_id)
        .first();
      await env.WAITLIST_DB.prepare(
        `UPDATE audit_schedules
         SET last_report_id = ?, last_error = NULL, next_run_at = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(
          saved.id,
          isoDaysFromDate(completedAt, Number(schedule?.interval_days || 7)),
          completedAt,
          row.schedule_id
        )
        .run();
    }
    await deliverApiWebhooks(env, row.owner_email, "audit.completed", {
      audit: apiAuditResponse({
        ...row,
        status: "completed",
        report_id: saved.id,
        completed_at: completedAt,
        updated_at: completedAt
      }),
      report: apiReportResponse(saved)
    });
  } catch (error) {
    // Browser Run concurrency limits are transient: requeue instead of
    // failing, and let the cron resume the job. Jobs older than 2 hours
    // fail normally so a broken browser pool cannot loop forever.
    if (error?.code === "BROWSER_BUSY" && row.created_at && row.created_at > isoSecondsFromNow(-2 * 60 * 60)) {
      await env.WAITLIST_DB.prepare(
        `UPDATE audit_jobs
         SET status = 'queued', started_at = NULL, error = NULL, updated_at = ?
         WHERE id = ? AND status = 'running'`
      )
        .bind(new Date().toISOString(), jobId)
        .run();
      return;
    }
    const completedAt = new Date().toISOString();
    const message = cleanText(error?.message || "The audit failed. Try another URL.", 260);
    await env.WAITLIST_DB.prepare(
      `UPDATE audit_jobs
       SET status = 'failed', error = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(message, completedAt, completedAt, jobId)
      .run();
    if (row.schedule_id) {
      await env.WAITLIST_DB.prepare(
        `UPDATE audit_schedules
         SET last_error = ?, next_run_at = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(message, isoDaysFromDate(completedAt, 1), completedAt, row.schedule_id)
        .run();
    }
    await deliverApiWebhooks(env, row.owner_email, "audit.failed", {
      audit: apiAuditResponse({
        ...row,
        status: "failed",
        error: message,
        completed_at: completedAt,
        updated_at: completedAt
      }),
      error: message
    });
  }
}

async function getAuditJob(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Audit job storage is not configured." }, 503);

  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/audit/jobs/".length));
  if (!isSafeUuid(id)) return json({ error: "Audit job not found." }, 404);

  let row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM audit_jobs
     WHERE id = ? AND owner_email = ?
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return json({ error: "Audit job not found." }, 404);

  if (
    row.status === "running" &&
    row.started_at &&
    row.started_at < isoSecondsFromNow(-AUDIT_JOB_RUNNING_STALE_MINUTES * 60)
  ) {
    await failStaleRunningAuditJobs(env, access.ownerEmail);
    row = await env.WAITLIST_DB.prepare(`SELECT * FROM audit_jobs WHERE id = ? AND owner_email = ? LIMIT 1`)
      .bind(id, access.ownerEmail)
      .first();
    if (!row?.id) return json({ error: "Audit job not found." }, 404);
  }

  return jsonNoStore({
    ok: true,
    job: auditJobResponse(row)
  });
}

async function runPrivateDemoAudit(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  const origin = new URL(request.url).origin;
  const report = await auditUrl(`${origin}/fixture/rendered-page`, env, {
    maxPages: 1,
    appOrigin: origin
  });
  const saved = await saveAuditReport(report, request, env, access);
  return jsonNoStore(saved);
}

async function auditUrl(inputUrl, env, options = {}) {
  const engine = createAuditEngine({
    launchBrowser: () => puppeteer.launch(env.BROWSER),
    pagespeedApiKey: env.GOOGLE_PAGESPEED_API_KEY || env.PAGESPEED_API_KEY || "",
    pagespeedDisabled: env.SEOFIXKIT_PAGESPEED_DISABLED === "1",
    privateAddressResolver: (hostname) => resolvesToPrivateAddress(hostname)
  });
  return engine.auditUrl(inputUrl, options);
}

async function auditQuotaStatus(request, env, access, targetUrl) {
  if (!env.WAITLIST_DB) {
    return { ok: false, error: "Report storage is not configured." };
  }

  const now = new Date();
  const hour = hourWindow(now);
  const day = dayWindow(now);
  const ipHash = await requestIpHash(request);
  const targetHost = new URL(targetUrl).hostname.toLowerCase();
  const sessionKey = access.sessionHash.slice(0, 24);
  const targetKey = targetHost.replace(/[^a-z0-9.-]/gi, "").slice(0, 120);

  return checkQuotaSet(env, [
    {
      bucket: `audit:ip:${hour.key}:${ipHash}`,
      limit: 12,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Audit limit reached for this network this hour. Try again later."
    },
    {
      bucket: `audit:session-hour:${hour.key}:${sessionKey}`,
      limit: 8,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Audit limit reached for this beta session this hour. Try again later."
    },
    {
      bucket: `audit:session-day:${day.key}:${sessionKey}`,
      limit: 30,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily beta audit limit reached. Try again tomorrow."
    },
    {
      bucket: `audit:target:${hour.key}:${targetKey}`,
      limit: 4,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "That site has been audited several times this hour. Try again later."
    }
  ]);
}

async function liteAuditQuotaStatus(env, access) {
  const day = dayWindow(new Date());
  return checkQuotaSet(env, [
    {
      bucket: `audit:lite-day:${day.key}:${normalizeEmail(access.ownerEmail)}`,
      limit: 3,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily Lite check limit reached. Verify your site for full self-serve audits, or try again tomorrow."
    }
  ]);
}

function renderedFixture(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Proof Demo App Shell</title>
    <meta name="description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
    <link rel="canonical" href="${origin}/fixture/rendered-page" />
  </head>
  <body>
    <div id="app">Loading app shell...</div>
    <script>
      document.getElementById("app").innerHTML = \`
        <main>
          <h1>Rendered SaaS page with real content</h1>
          <p>This demo intentionally ships a thin static shell, then renders the real page content with JavaScript. A weak static-only SEO audit would say the page has no H1, no internal links, and thin content. SEO Fix Kit should not make that mistake.</p>
          <p>Founders need verified findings, not busywork. The page includes enough rendered text to show that the final browser-visible page is materially different from the raw HTML response.</p>
          <p>Use this fixture to prove that the audit sees what users and modern rendering systems see after JavaScript runs. The report should guard false positives instead of telling the user to add duplicate headings or unnecessary internal links.</p>
          <p>The right output is evidence, confidence, and a practical fix only when a real fix is needed.</p>
          <nav>
            <a href="/fixture/rendered-page">Overview</a>
            <a href="/fixture/rendered-page?tab=pricing">Pricing</a>
            <a href="/fixture/rendered-page?tab=docs">Docs</a>
          </nav>
        </main>
      \`;
    </script>
  </body>
</html>`;
}

export {
  AUDIT_JOB_QUEUED_STALE_MINUTES,
  AUDIT_JOB_RUNNING_STALE_MINUTES,
  AUDIT_JOB_TIMEOUT_MESSAGE,
  activeAuditJobCount,
  activeAuditJobForTarget,
  auditQuotaStatus,
  auditUrl,
  createAuditJob,
  createAuditSchedule,
  deleteAuditSchedule,
  enqueueAuditJob,
  failStaleRunningAuditJobs,
  getAuditJob,
  listAuditSchedules,
  liteAuditQuotaStatus,
  persistBacklinkImportHistory,
  persistKeywordImportHistory,
  processAuditJob,
  renderedFixture,
  resumeStaleQueuedAuditJobs,
  runAuditSchedule,
  runDueAuditSchedules,
  runPrivateAudit,
  runPrivateDemoAudit
};
