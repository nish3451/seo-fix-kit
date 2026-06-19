import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deleteReportRowsWithBlobs,
  preserveProtectedFixRequestReport,
  protectedFixRequestForReport
} from "../worker/lib/report-data.js";

const protectedStatuses = ["paid", "in_progress", "delivered", "refunded", "refund_failed", "disputed"];
const unprotectedStatuses = ["new", "checkout_created", "payment_failed"];
const repairMigration = readFileSync(new URL("../migrations/0026_agent_repair_queue.sql", import.meta.url), "utf8");

assert.match(repairMigration, /FOREIGN KEY \(report_id\) REFERENCES audit_reports\(id\) ON DELETE CASCADE/);
assert.match(repairMigration, /FOREIGN KEY \(queue_item_id\) REFERENCES repair_queue_items\(id\) ON DELETE CASCADE/);
assert.match(repairMigration, /idx_repair_queue_last_rerun_report/);
assert.match(repairMigration, /idx_repair_actions_report/);
assert.match(repairMigration, /idx_repair_actions_rerun_report/);
assert.match(repairMigration, /idx_audit_jobs_report_id/);

for (const status of protectedStatuses) {
  const reportId = "report-original-abc";
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    jobs: [{ id: `job_${status}`, report_id: reportId, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: `fix_${status}`, status, report_id: reportId, final_report_id: "" }],
    repairQueueItems: [{ id: `queue_${status}`, report_id: reportId }],
    repairActions: [{ id: `action_${status}`, report_id: reportId }]
  });
  const protectedFixRequest = await protectedFixRequestForReport(env, reportId);
  assert.equal(protectedFixRequest.id, `fix_${status}`);
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, []);
  assert.deepEqual(deleted.protectedIds, [reportId]);
  assert.deepEqual(deleted.preservedIds, [reportId]);
  assert.equal(env.reports.length, 1);
  assert.equal(env.repairQueueItems.length, 1);
  assert.equal(env.repairActions.length, 1);
  assert.deepEqual(env.deletedKeys, []);
  assert.equal(await preserveProtectedFixRequestReport(env, reportId), true);
  assert.equal(env.reports[0].expires_at, null);
  assert.equal(env.jobs[0].expires_at, null);
}

for (const status of unprotectedStatuses) {
  const reportId = `report-${status.replaceAll("_", "-")}-abc`;
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: `fix_${status}`, status, report_id: reportId, final_report_id: "" }],
    repairQueueItems: [{ id: `queue_${status}`, report_id: reportId }],
    repairActions: [{ id: `action_${status}`, report_id: reportId }]
  });
  assert.equal(await protectedFixRequestForReport(env, reportId), null);
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, [reportId]);
  assert.deepEqual(deleted.protectedIds, []);
  assert.deepEqual(deleted.preservedIds, []);
  assert.deepEqual(deleted.failedBlobDeletes, []);
  assert.equal(env.reports.length, 0);
  assert.equal(env.repairQueueItems.length, 0);
  assert.equal(env.repairActions.length, 0);
  assert.deepEqual(env.deletedKeys, [`reports/${reportId}.json`]);
}

{
  const finalReportId = "report-final-abc";
  const env = fakeEnv({
    reports: [{ id: finalReportId, report_json: `r2:reports/${finalReportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    jobs: [{ id: "job_final", report_id: finalReportId, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: "fix_final", status: "delivered", report_id: "report-original-abc", final_report_id: finalReportId }]
  });
  const protectedFixRequest = await protectedFixRequestForReport(env, finalReportId);
  assert.equal(protectedFixRequest.id, "fix_final");
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, []);
  assert.deepEqual(deleted.protectedIds, [finalReportId]);
  assert.deepEqual(deleted.preservedIds, [finalReportId]);
  assert.deepEqual(env.deletedKeys, []);
  assert.equal(env.jobs[0].expires_at, null);
}

{
  const reportId = "report-r2-failure-abc";
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [],
    r2DeleteFails: true
  });
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, [reportId]);
  assert.deepEqual(deleted.failedBlobDeletes.map((failure) => failure.key), [`reports/${reportId}.json`]);
  assert.equal(env.deletionFailures.length, 1);
  assert.deepEqual(env.deletionFailures[0], {
    blob_key: `reports/${reportId}.json`,
    report_id: reportId,
    error: "R2 unavailable",
    retry_count: 0,
    status: "pending"
  });
}

{
  const proofReportId = "report-proof-delete-abc";
  const env = fakeEnv({
    reports: [{ id: proofReportId, report_json: `r2:reports/${proofReportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    repairQueueItems: [{
      id: "queue-survivor",
      report_id: "report-original-abc",
      status: "regressed",
      rerun_status: "regressed",
      last_rerun_report_id: proofReportId,
      updated_by_email: "owner@example.com"
    }],
    repairActions: [{
      id: "action-survivor",
      report_id: "report-original-abc",
      rerun_state: "regressed",
      rerun_report_id: proofReportId,
      updated_by_email: "owner@example.com"
    }, {
      id: "action-owned-by-proof",
      report_id: proofReportId,
      rerun_state: "not_run",
      rerun_report_id: "",
      updated_by_email: "owner@example.com"
    }]
  });
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, [proofReportId]);
  assert.equal(env.repairQueueItems.length, 1);
  assert.equal(env.repairQueueItems[0].status, "applied");
  assert.equal(env.repairQueueItems[0].rerun_status, "not_run");
  assert.equal(env.repairQueueItems[0].last_rerun_report_id, null);
  assert.equal(env.repairActions.length, 1);
  assert.equal(env.repairActions[0].rerun_state, "not_run");
  assert.equal(env.repairActions[0].rerun_report_id, null);
}

{
  const reportId = "report-repair-cleanup-fails-abc";
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    repairQueueItems: [{
      id: "queue-cleanup-fails",
      report_id: "report-original-abc",
      status: "fixed",
      rerun_status: "fixed",
      last_rerun_report_id: reportId
    }],
    repairCleanupFails: true
  });
  await assert.rejects(
    () => deleteReportRowsWithBlobs(env, env.reports),
    /repair cleanup unavailable/
  );
  assert.equal(env.reports.length, 1);
  assert.equal(env.repairQueueItems[0].status, "fixed");
  assert.equal(env.repairQueueItems[0].last_rerun_report_id, reportId);
  assert.deepEqual(env.deletedKeys, []);
}

{
  const reportId = "report-before-repair-migration-abc";
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    jobs: [{ id: "job_before_repair_migration", report_id: reportId, expires_at: "2026-01-01T00:00:00.000Z" }],
    repairTablesMissing: true
  });
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, [reportId]);
  assert.deepEqual(deleted.protectedIds, []);
  assert.deepEqual(deleted.preservedIds, []);
  assert.equal(env.reports.length, 0);
  assert.equal(env.jobs.length, 0);
  assert.deepEqual(env.deletedKeys, [`reports/${reportId}.json`]);
}

{
  const reportId = "protected-before-repair-migration-abc";
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    jobs: [{ id: "job_protected_before_repair_migration", report_id: reportId, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: "fix_protected_before_repair_migration", status: "paid", report_id: reportId, final_report_id: "" }],
    repairTablesMissing: true
  });
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, []);
  assert.deepEqual(deleted.protectedIds, [reportId]);
  assert.deepEqual(deleted.preservedIds, [reportId]);
  assert.equal(env.reports.length, 1);
  assert.equal(env.jobs.length, 1);
  assert.deepEqual(env.deletedKeys, []);
}

function fakeEnv({
  reports = [],
  jobs = [],
  fixRequests = [],
  repairQueueItems = [],
  repairActions = [],
  r2DeleteFails = false,
  repairCleanupFails = false,
  repairTablesMissing = false
} = {}) {
  const env = {
    reports: reports.map((row) => ({ ...row })),
    jobs: jobs.map((row) => ({ ...row })),
    fixRequests: fixRequests.map((row) => ({ ...row })),
    repairQueueItems: repairQueueItems.map((row) => ({ ...row })),
    repairActions: repairActions.map((row) => ({ ...row })),
    deletedKeys: [],
    deletionFailures: [],
    r2DeleteFails,
    repairCleanupFails,
    repairTablesMissing,
    WAITLIST_DB: {
      async batch(statements) {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        return results;
      },
      prepare(sql) {
        return {
          bind(...values) {
            return {
              sql,
              values,
              first: async () => firstRow(sql, values, env),
              run: async () => runStatement(sql, values, env)
            };
          }
        };
      }
    },
    REPORTS: {
      delete: async (keys) => {
        if (env.r2DeleteFails) throw new Error("R2 unavailable");
        env.deletedKeys.push(...(Array.isArray(keys) ? keys : [keys]));
      }
    }
  };
  return env;
}

function maybeThrowRepairTablesMissing(sql, env) {
  if (!env.repairTablesMissing) return;
  if (!sql.includes("repair_queue_items") && !sql.includes("repair_agent_actions")) return;
  throw new Error("no such table: repair_queue_items");
}

function firstRow(sql, values, env) {
  if (sql.includes("FROM fix_requests")) {
    const reportId = values.at(-1);
    return env.fixRequests.find((row) =>
      protectedStatuses.includes(row.status) &&
      (row.report_id === reportId || row.final_report_id === reportId)
    ) || null;
  }
  throw new Error(`Unexpected first SQL: ${sql}`);
}

function runStatement(sql, values, env) {
  if (sql.includes("DELETE FROM audit_reports")) {
    const reportId = values[0];
    const protectedReport = env.fixRequests.some((row) =>
      protectedStatuses.includes(row.status) &&
      (row.report_id === reportId || row.final_report_id === reportId)
    );
    if (protectedReport) return { meta: { changes: 0 } };
    const before = env.reports.length;
    env.reports = env.reports.filter((row) => row.id !== reportId);
    return { meta: { changes: before - env.reports.length } };
  }
  if (sql.includes("UPDATE audit_reports")) {
    const reportId = values[1];
    const protectedReport = env.fixRequests.some((row) =>
      protectedStatuses.includes(row.status) &&
      (row.report_id === reportId || row.final_report_id === reportId)
    );
    const report = env.reports.find((row) => row.id === reportId);
    if (!protectedReport || !report) return { meta: { changes: 0 } };
    report.expires_at = null;
    report.updated_at = values[0];
    return { meta: { changes: 1 } };
  }
  if (sql.includes("UPDATE audit_jobs")) {
    const reportIds = sql.includes("IN (") ? values.slice(1) : [values[1]];
    let changes = 0;
    for (const job of env.jobs) {
      if (reportIds.includes(job.report_id)) {
        job.expires_at = null;
        job.updated_at = values[0];
        changes += 1;
      }
    }
    return { meta: { changes } };
  }
  if (sql.includes("DELETE FROM audit_jobs")) {
    if (isProtectedReport(env, values[1])) return { meta: { changes: 0 } };
    const before = env.jobs.length;
    env.jobs = env.jobs.filter((row) => row.report_id !== values[0]);
    return { meta: { changes: before - env.jobs.length } };
  }
  if (sql.includes("INSERT INTO audit_report_blob_deletion_failures")) {
    env.deletionFailures.push({
      blob_key: values[0],
      report_id: values[1],
      error: values[2],
      retry_count: 0,
      status: "pending"
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("UPDATE repair_agent_actions") && sql.includes("rerun_report_id IN")) {
    maybeThrowRepairTablesMissing(sql, env);
    if (env.repairCleanupFails) throw new Error("repair cleanup unavailable");
    const ids = values.slice(1);
    let changes = 0;
    for (const action of env.repairActions) {
      if (!ids.includes(action.rerun_report_id)) continue;
      action.rerun_state = "not_run";
      action.rerun_report_id = null;
      action.updated_at = values[0];
      action.updated_by_email = action.updated_by_email || action.owner_email || "";
      changes += 1;
    }
    return { meta: { changes } };
  }
  if (sql.includes("UPDATE repair_agent_actions") && sql.includes("rerun_report_id =")) {
    maybeThrowRepairTablesMissing(sql, env);
    if (env.repairCleanupFails) throw new Error("repair cleanup unavailable");
    const reportId = values[2];
    if (isProtectedReport(env, reportId)) return { meta: { changes: 0 } };
    let changes = 0;
    for (const action of env.repairActions) {
      if (action.rerun_report_id !== values[1]) continue;
      action.rerun_state = "not_run";
      action.rerun_report_id = null;
      action.updated_at = values[0];
      action.updated_by_email = action.updated_by_email || action.owner_email || "";
      changes += 1;
    }
    return { meta: { changes } };
  }
  if (sql.includes("UPDATE repair_queue_items") && sql.includes("last_rerun_report_id IN")) {
    maybeThrowRepairTablesMissing(sql, env);
    if (env.repairCleanupFails) throw new Error("repair cleanup unavailable");
    const ids = values.slice(1);
    let changes = 0;
    for (const item of env.repairQueueItems) {
      if (!ids.includes(item.last_rerun_report_id)) continue;
      if (["fixed", "regressed"].includes(item.status)) item.status = "applied";
      item.rerun_status = "not_run";
      item.last_rerun_report_id = null;
      item.updated_at = values[0];
      item.updated_by_email = item.updated_by_email || item.owner_email || "";
      changes += 1;
    }
    return { meta: { changes } };
  }
  if (sql.includes("UPDATE repair_queue_items") && sql.includes("last_rerun_report_id =")) {
    maybeThrowRepairTablesMissing(sql, env);
    if (env.repairCleanupFails) throw new Error("repair cleanup unavailable");
    const reportId = values[2];
    if (isProtectedReport(env, reportId)) return { meta: { changes: 0 } };
    let changes = 0;
    for (const item of env.repairQueueItems) {
      if (item.last_rerun_report_id !== values[1]) continue;
      if (["fixed", "regressed"].includes(item.status)) item.status = "applied";
      item.rerun_status = "not_run";
      item.last_rerun_report_id = null;
      item.updated_at = values[0];
      item.updated_by_email = item.updated_by_email || item.owner_email || "";
      changes += 1;
    }
    return { meta: { changes } };
  }
  if (sql.includes("DELETE FROM repair_agent_actions")) {
    maybeThrowRepairTablesMissing(sql, env);
    if (env.repairCleanupFails) throw new Error("repair cleanup unavailable");
    if (sql.includes("report_id =")) {
      if (isProtectedReport(env, values[1])) return { meta: { changes: 0 } };
      const before = env.repairActions.length;
      env.repairActions = env.repairActions.filter((row) => row.report_id !== values[0]);
      return { meta: { changes: before - env.repairActions.length } };
    }
    const ids = values;
    const before = env.repairActions.length;
    env.repairActions = env.repairActions.filter((row) => !ids.includes(row.report_id));
    return { meta: { changes: before - env.repairActions.length } };
  }
  if (sql.includes("DELETE FROM repair_queue_items")) {
    maybeThrowRepairTablesMissing(sql, env);
    if (env.repairCleanupFails) throw new Error("repair cleanup unavailable");
    if (sql.includes("report_id =")) {
      if (isProtectedReport(env, values[1])) return { meta: { changes: 0 } };
      const before = env.repairQueueItems.length;
      env.repairQueueItems = env.repairQueueItems.filter((row) => row.report_id !== values[0]);
      return { meta: { changes: before - env.repairQueueItems.length } };
    }
    const ids = values;
    const before = env.repairQueueItems.length;
    env.repairQueueItems = env.repairQueueItems.filter((row) => !ids.includes(row.report_id));
    return { meta: { changes: before - env.repairQueueItems.length } };
  }
  throw new Error(`Unexpected run SQL: ${sql}`);
}

function isProtectedReport(env, reportId) {
  return env.fixRequests.some((row) =>
    protectedStatuses.includes(row.status) &&
    (row.report_id === reportId || row.final_report_id === reportId)
  );
}

console.log(JSON.stringify({ ok: true, checked: "paid fix pack report evidence lock" }, null, 2));
