import {
  agentActionResponse
} from "../../shared/repair-queue.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { json, jsonNoStore } from "../lib/http.js";
import { requireRepairTables } from "../lib/repair-tables.js";
import { ownerReportRow } from "../lib/report-data.js";
import { isSafeUuid, parseJson } from "../lib/text.js";
import { deliverApiWebhooks } from "../lib/webhooks.js";
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

async function getRepairQueue(request, env) {
  const context = await repairContext(request, env, "/repair-queue");
  if (!context.ok) return context.response;
  return jsonNoStore(await repairQueueResponse(context.env, context.access, context.reportId, context.report));
}

async function saveRepairQueue(request, env) {
  const body = await request.json().catch(() => ({}));
  const context = await repairContext(request, env, "/repair-queue");
  if (!context.ok) return context.response;
  const repairTables = await requireRepairTables(context.env);
  if (!repairTables.ok) return repairTables.response;

  const saved = await saveRepairQueueItems(context.env, context.access, context.reportId, context.report, body);
  if (!saved.ok) return jsonNoStore({ error: saved.error }, saved.status || 400);

  return jsonNoStore(await repairQueueResponse(context.env, context.access, context.reportId, context.report));
}

async function createRepairAction(request, env, ctx = null) {
  const body = await request.json().catch(() => ({}));
  const context = await repairContext(request, env, "/repair-actions", ctx);
  if (!context.ok) return context.response;
  const repairTables = await requireRepairTables(context.env);
  if (!repairTables.ok) return repairTables.response;

  const created = await createRepairActionRecord(context.env, context.access, context.reportId, context.report, body);
  if (!created.ok) return jsonNoStore({ error: created.error }, created.status || 400);
  for (const eventType of created.events || []) {
    scheduleRepairActionWebhook(context, eventType, created.action);
  }

  const queue = await repairQueueResponse(context.env, context.access, context.reportId, context.report);

  return jsonNoStore({
    ok: true,
    action: agentActionResponse(created.action),
    queue
  }, created.status || 201);
}

async function updateRepairAction(request, env, ctx = null) {
  const body = await request.json().catch(() => ({}));
  const actionId = repairActionIdFromPath(request.url);
  if (!isSafeUuid(actionId)) return json({ error: "Action not found." }, 404);
  const context = await repairContext(request, env, `/repair-actions/${actionId}`, ctx);
  if (!context.ok) return context.response;
  const repairTables = await requireRepairTables(context.env);
  if (!repairTables.ok) return repairTables.response;

  const updated = await updateRepairActionRecord(context.env, context.access, context.reportId, context.report, actionId, body);
  if (!updated.ok) {
    const respond = updated.status === 404 ? json : jsonNoStore;
    return respond({ error: updated.error }, updated.status || 400);
  }
  for (const eventType of updated.events || []) {
    scheduleRepairActionWebhook(context, eventType, updated.action);
  }

  const queue = await repairQueueResponse(context.env, context.access, context.reportId, context.report);

  return jsonNoStore({
    ok: true,
    action: agentActionResponse(updated.action),
    queue
  });
}

async function repairContext(request, env, suffix, ctx = null) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return { ok: false, response: betaAccessResponse(access) };
  if (!env.WAITLIST_DB) return { ok: false, response: json({ error: "Repair queue storage is not configured." }, 503) };
  const reportId = reportIdFromActionPath(request.url, suffix);
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return { ok: false, response: json({ error: "Report not found." }, 404) };
  const parsedReport = parseJson(row.report_json, null);
  if (!parsedReport) return { ok: false, response: json({ error: "Report not found." }, 404) };
  const report = reportWithAuditRow(parsedReport, row, reportId);
  return { ok: true, env, access, reportId, report, ctx };
}

async function repairQueueResponse(env, access, reportId, report) {
  const { items, unavailable } = await ensureRepairQueueRows(env, access, reportId, report);
  return {
    ok: true,
    reportId,
    items,
    counts: queueCounts(items),
    unavailable: Boolean(unavailable),
    updatedAt: new Date().toISOString()
  };
}

function reportIdFromActionPath(rawUrl, suffix) {
  const pathname = new URL(rawUrl).pathname;
  const prefix = "/api/reports/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return "";
  return decodeURIComponent(pathname.slice(prefix.length, -suffix.length));
}

function repairActionIdFromPath(rawUrl) {
  const pathname = new URL(rawUrl).pathname;
  const marker = "/repair-actions/";
  const index = pathname.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(pathname.slice(index + marker.length));
}

function queueCounts(items = []) {
  return items.reduce((counts, item) => {
    counts.total += 1;
    counts[item.status] = (counts[item.status] || 0) + 1;
    if (item.latestAction) counts.withActions += 1;
    return counts;
  }, {
    total: 0,
    open: 0,
    in_progress: 0,
    drafted: 0,
    approved: 0,
    applied: 0,
    fixed: 0,
    ignored: 0,
    regressed: 0,
    withActions: 0
  });
}

function scheduleRepairActionWebhook(context, eventType, action = {}) {
  const delivery = deliverApiWebhooks(
    context.env,
    context.access.ownerEmail,
    eventType,
    repairActionWebhookPayload(action, context.report)
  ).catch((error) => {
    console.error("Repair action webhook delivery failed", {
      eventType,
      actionId: action?.id || "",
      reportId: action?.report_id || "",
      error: error?.message || String(error)
    });
  });
  if (context.ctx?.waitUntil) context.ctx.waitUntil(delivery);
}

export {
  createRepairAction,
  getRepairQueue,
  saveRepairQueue,
  updateRepairAction
};
