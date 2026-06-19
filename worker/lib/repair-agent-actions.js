import {
  defaultProposedChangeForItem,
  deriveRepairQueueItems,
  REPAIR_QUEUE_ITEM_LIMIT
} from "../../shared/repair-queue.js";
import {
  cleanRerunReportId,
  comparableReportHost,
  normalizeRepairActionCreateInput,
  normalizeRepairActionPatch,
  normalizeRepairQueuePatchItems,
  proofBackedRerunState,
  queueStatusFromActionState,
  repairActionTransitionEvents,
  repairProofIssueForAction,
  reportTimestampMs,
  reportWithAuditRow,
  rerunProofBlockedByNewApply,
  rerunProofFreshAfterMs,
  rerunReportProvesIssue,
  validRerunProofReport
} from "../../shared/repair-action-rules.js";
import { repairTableAll } from "./repair-tables.js";
import { reportJsonForRow } from "./report-data.js";
import { cleanText, parseJson } from "./text.js";

async function saveRepairQueueItems(env, access, reportId, report, body = {}) {
  const ensured = await ensureRepairQueueRows(env, access, reportId, report);
  const normalized = normalizeRepairQueuePatchItems(body, ensured.items);
  if (!normalized.ok) return repairActionError(normalized.error, normalized.status || 400);
  const now = new Date().toISOString();
  const update = normalized.update;
  const statement = env.WAITLIST_DB.prepare(
    `UPDATE repair_queue_items
     SET status = ?,
         action_mode = ?,
         rerun_status = ?,
         last_rerun_report_id = ?,
         updated_at = ?,
         updated_by_email = ?
     WHERE id = ?
       AND report_id = ?
       AND owner_email = ?`
  )
    .bind(
      update.status,
      update.actionMode,
      update.rerunStatus,
      update.rerunReportId || null,
      now,
      access.ownerEmail,
      update.existing.id,
      reportId,
      access.ownerEmail
    );
  const mutation = await runRepairMutationStatements(env.WAITLIST_DB, [statement]);
  if (mutationChangeCount(mutation, 0) !== 1) {
    return repairActionError("Repair item no longer exists in this report.", 409);
  }

  return { ok: true };
}

async function createRepairActionRecord(env, access, reportId, report, body = {}) {
  const ensured = await ensureRepairQueueRows(env, access, reportId, report);
  const issueId = cleanText(body.issueId || body.issue_id || "", 160);
  const item = ensured.items.find((candidate) => candidate.issueId === issueId);
  if (!item?.id) return repairActionError("Repair item no longer exists in this report.", 400);

  const proposedChange = cleanText(body.proposedChange || body.proposed_change || defaultProposedChangeForItem(item), 4000);
  if (!proposedChange) return repairActionError("Draft action needs a proposed change.", 400);
  const normalized = normalizeRepairActionCreateInput(body, item);
  if (!normalized.ok) return repairActionError(normalized.error, normalized.status || 400);

  const now = new Date().toISOString();
  const action = {
    id: crypto.randomUUID(),
    report_id: reportId,
    owner_email: access.ownerEmail,
    queue_item_id: item.id,
    issue_id: item.issueId,
    action_mode: normalized.actionMode,
    action_type: normalized.actionType,
    approval_state: "drafted",
    execution_state: "not_started",
    rerun_state: "not_run",
    source_proof: cleanText(item.proof, 1200),
    proposed_change: proposedChange,
    acceptance: cleanText(body.acceptance || item.acceptance, 1000),
    rerun_report_id: "",
    created_at: now,
    updated_at: now,
    approved_at: "",
    applied_at: "",
    updated_by_email: access.ownerEmail
  };

  const insertAction = env.WAITLIST_DB.prepare(
    `INSERT INTO repair_agent_actions
      (id, report_id, owner_email, queue_item_id, issue_id, action_mode, action_type, approval_state, execution_state, rerun_state, source_proof, proposed_change, acceptance, rerun_report_id, created_at, updated_at, approved_at, applied_at, updated_by_email)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE EXISTS (
       SELECT 1
       FROM repair_queue_items
       WHERE id = ?
         AND report_id = ?
         AND owner_email = ?
     )`
  )
    .bind(
      action.id,
      action.report_id,
      action.owner_email,
      action.queue_item_id,
      action.issue_id,
      action.action_mode,
      action.action_type,
      action.approval_state,
      action.execution_state,
      action.rerun_state,
      action.source_proof || null,
      action.proposed_change,
      action.acceptance || null,
      null,
      action.created_at,
      action.updated_at,
      null,
      null,
      action.updated_by_email,
      item.id,
      reportId,
      access.ownerEmail
    );
  const updateQueue = env.WAITLIST_DB.prepare(
    `UPDATE repair_queue_items
     SET status = 'drafted',
         action_mode = ?,
         rerun_status = 'not_run',
         last_rerun_report_id = NULL,
         updated_at = ?,
         updated_by_email = ?
     WHERE id = ?
       AND report_id = ?
       AND owner_email = ?`
  )
    .bind(action.action_mode, now, access.ownerEmail, item.id, reportId, access.ownerEmail);
  const mutation = await runRepairMutationStatements(env.WAITLIST_DB, [insertAction, updateQueue]);
  if (mutationChangeCount(mutation, 0) !== 1 || mutationChangeCount(mutation, 1) !== 1) {
    return repairActionError("Repair item no longer exists in this report.", 409);
  }

  return { ok: true, status: 201, action, events: ["repair_action.drafted"] };
}

async function updateRepairActionRecord(env, access, reportId, report, actionId, body = {}) {
  const action = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM repair_agent_actions
     WHERE id = ?
       AND report_id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(actionId, reportId, access.ownerEmail)
    .first();
  if (!action?.id) return repairActionError("Action not found.", 404);

  const normalized = normalizeRepairActionPatch(body, action);
  if (!normalized.ok) return repairActionError(normalized.error, normalized.status || 400);
  const { approvalState, executionState, rerunState, rerunReportId } = normalized;
  const now = new Date().toISOString();
  if (rerunProofBlockedByNewApply(action, executionState, rerunState)) {
    return repairActionError("Rerun repair states require a later rerun after the action is applied.", 400);
  }
  const proofFreshAfterMs = proofBackedRerunState(rerunState)
    ? rerunProofFreshAfterMs(action, report)
    : 0;
  if (rerunReportId && !(await ownerHasReport(env, access, rerunReportId, report, reportId, {
    freshAfterMs: proofFreshAfterMs,
    issue: repairProofIssueForAction(report, action),
    rerunState
  }))) {
    return repairActionError("Rerun report not found.", 404);
  }

  const approvedAt = approvalState === "approved" && action.approval_state !== "approved"
    ? now
    : action.approved_at || null;
  const appliedAt = executionState === "applied" && action.execution_state !== "applied"
    ? now
    : action.applied_at || null;
  const patchedAction = {
    ...action,
    approval_state: approvalState,
    execution_state: executionState,
    rerun_state: rerunState,
    rerun_report_id: rerunReportId,
    updated_at: now,
    approved_at: approvedAt || "",
    applied_at: appliedAt || "",
    updated_by_email: access.ownerEmail
  };

  const updateAction = env.WAITLIST_DB.prepare(
    `UPDATE repair_agent_actions
     SET approval_state = ?,
         execution_state = ?,
         rerun_state = ?,
         rerun_report_id = ?,
         updated_at = ?,
         approved_at = ?,
         applied_at = ?,
         updated_by_email = ?
     WHERE id = ?
       AND report_id = ?
       AND owner_email = ?
       AND EXISTS (
         SELECT 1
         FROM repair_queue_items
         WHERE id = ?
           AND report_id = ?
           AND owner_email = ?
       )`
  )
    .bind(
      approvalState,
      executionState,
      rerunState,
      rerunReportId || null,
      now,
      approvedAt,
      appliedAt,
      access.ownerEmail,
      actionId,
      reportId,
      access.ownerEmail,
      action.queue_item_id,
      reportId,
      access.ownerEmail
    );

  const updateQueue = queueUpdateFromActionStateStatement(env.WAITLIST_DB, access, reportId, action.queue_item_id, {
    approvalState,
    executionState,
    rerunState,
    rerunReportId,
    now
  });
  const mutation = await runRepairMutationStatements(env.WAITLIST_DB, [updateAction, updateQueue]);
  if (mutationChangeCount(mutation, 0) !== 1 || mutationChangeCount(mutation, 1) !== 1) {
    return repairActionError("Repair action could not be updated.", 409);
  }

  return {
    ok: true,
    action: patchedAction,
    events: repairActionTransitionEvents(action, patchedAction)
  };
}

async function ensureRepairQueueRows(env, access, reportId, report) {
  const [savedRows, actionRows] = await Promise.all([
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

  const initialItems = deriveRepairQueueItems(report, savedRows.results || [], actionRows.results || []);
  if (savedRows.repairTablesMissing || actionRows.repairTablesMissing) {
    return { items: initialItems, unavailable: true };
  }
  const existingIds = new Set((savedRows.results || []).map((row) => row.issue_id));
  const missing = initialItems.filter((item) => !existingIds.has(item.issueId));
  if (missing.length) {
    const now = new Date().toISOString();
    const statements = missing.slice(0, REPAIR_QUEUE_ITEM_LIMIT).map((item) =>
      env.WAITLIST_DB.prepare(
        `INSERT INTO repair_queue_items
          (id, report_id, owner_email, issue_id, title, severity, page_url, page_label, proof, fix, snippet, acceptance, confidence, source, source_kind, estimated_effort, work_type, action_mode, status, rerun_status, last_rerun_report_id, created_at, updated_at, updated_by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(report_id, issue_id) DO NOTHING`
      )
        .bind(
          crypto.randomUUID(),
          reportId,
          access.ownerEmail,
          item.issueId,
          item.title,
          item.severity,
          item.pageUrl || null,
          item.pageLabel || null,
          item.proof || null,
          item.fix || null,
          item.snippet || null,
          item.acceptance || null,
          item.confidence || null,
          item.source || null,
          item.sourceKind || "finding",
          item.estimatedEffort || null,
          item.workType || null,
          item.actionMode,
          item.status,
          item.rerunStatus,
          item.lastRerunReportId || null,
          now,
          now,
          access.ownerEmail
        )
    );
    await runRepairMutationStatements(env.WAITLIST_DB, statements);
  }

  const [freshRows, freshActions] = await Promise.all([
    repairTableAll(env.WAITLIST_DB.prepare(
      `SELECT *
       FROM repair_queue_items
       WHERE report_id = ?
         AND owner_email = ?
       ORDER BY updated_at DESC`
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

  return {
    items: deriveRepairQueueItems(report, freshRows.results || [], freshActions.results || []),
    unavailable: Boolean(freshRows.repairTablesMissing || freshActions.repairTablesMissing)
  };
}

function queueUpdateFromActionStateStatement(db, access, reportId, queueItemId, state) {
  const status = queueStatusFromActionState(state);
  return db.prepare(
    `UPDATE repair_queue_items
     SET status = ?,
         rerun_status = ?,
         last_rerun_report_id = ?,
         updated_at = ?,
         updated_by_email = ?
     WHERE id = ?
       AND report_id = ?
       AND owner_email = ?`
  )
    .bind(
      status,
      state.rerunState,
      state.rerunReportId || null,
      state.now,
      access.ownerEmail,
      queueItemId,
      reportId,
      access.ownerEmail
    );
}

async function runRepairMutationStatements(db, statements = []) {
  if (statements.length && db.batch) return db.batch(statements);
  const results = [];
  for (const statement of statements) results.push(await statement.run());
  return results;
}

function mutationChangeCount(results = [], index = 0) {
  return Number(results?.[index]?.meta?.changes ?? results?.[index]?.changes ?? 0);
}

async function ownerHasReport(env, access, reportId, referenceReport = {}, sourceReportId = "", options = {}) {
  if (!cleanRerunReportId(reportId)) return false;
  const referenceReportId = cleanRerunReportId(referenceReport.id || referenceReport.reportId || referenceReport.report_id);
  if (reportId === sourceReportId || (referenceReportId && reportId === referenceReportId)) return false;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, created_at, updated_at, report_json
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
       AND (expires_at IS NULL OR expires_at > ?)
     LIMIT 1`
  )
    .bind(reportId, access.ownerEmail, new Date().toISOString())
    .first();
  if (!row?.id) return false;
  const reportJson = await reportJsonForRow(env, row);
  const proofReport = reportWithAuditRow(parseJson(reportJson, null), row, reportId);
  if (!validRerunProofReport(proofReport)) return false;
  const freshAfterMs = Number(options.freshAfterMs || 0);
  if (freshAfterMs > 0) {
    const proofTimestampMs = reportTimestampMs(row);
    if (!proofTimestampMs || proofTimestampMs <= freshAfterMs) return false;
  }
  const referenceHost = comparableReportHost(referenceReport);
  const proofHost = comparableReportHost(row);
  if (!referenceHost || !proofHost || referenceHost !== proofHost) return false;
  if (proofBackedRerunState(options.rerunState || "") && !rerunReportProvesIssue(proofReport, options.issue, options.rerunState)) {
    return false;
  }
  return true;
}

function repairActionError(error, status = 400) {
  return { ok: false, error, status };
}

export {
  createRepairActionRecord,
  ensureRepairQueueRows,
  saveRepairQueueItems,
  updateRepairActionRecord
};
