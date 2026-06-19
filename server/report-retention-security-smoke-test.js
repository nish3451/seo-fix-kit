import assert from "node:assert/strict";
import {
  deleteReportRowsWithBlobs,
  preserveProtectedFixRequestReport,
  protectedFixRequestForReport,
  protectedRepairExecutionForReport
} from "../worker/lib/report-data.js";

const protectedStatuses = ["paid", "in_progress", "delivered", "refunded", "refund_failed", "disputed"];
const unprotectedStatuses = ["new", "checkout_created", "payment_failed"];
const protectedProposalApprovals = ["approved"];
const protectedProposalDeliveries = ["in_progress", "delivered"];

for (const status of protectedStatuses) {
  const reportId = "report-original-abc";
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    jobs: [{ id: `job_${status}`, report_id: reportId, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: `fix_${status}`, status, report_id: reportId, final_report_id: "" }]
  });
  const protectedFixRequest = await protectedFixRequestForReport(env, reportId);
  assert.equal(protectedFixRequest.id, `fix_${status}`);
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, []);
  assert.deepEqual(deleted.protectedIds, [reportId]);
  assert.deepEqual(deleted.preservedIds, [reportId]);
  assert.equal(env.reports.length, 1);
  assert.deepEqual(env.deletedKeys, []);
  assert.equal(await preserveProtectedFixRequestReport(env, reportId), true);
  assert.equal(env.reports[0].expires_at, null);
  assert.equal(env.jobs[0].expires_at, null);
}

for (const status of unprotectedStatuses) {
  const reportId = `report-${status.replaceAll("_", "-")}-abc`;
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: `fix_${status}`, status, report_id: reportId, final_report_id: "" }]
  });
  assert.equal(await protectedFixRequestForReport(env, reportId), null);
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, [reportId]);
  assert.deepEqual(deleted.protectedIds, []);
  assert.deepEqual(deleted.preservedIds, []);
  assert.deepEqual(deleted.failedBlobDeletes, []);
  assert.equal(env.reports.length, 0);
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
  const finalReportId = "proposal-final-proof-abc";
  const env = fakeEnv({
    reports: [{ id: finalReportId, report_json: `r2:reports/${finalReportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    jobs: [{ id: "job_proposal_final", report_id: finalReportId, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: "fix_proposal", status: "new", report_id: "report-original-abc", final_report_id: "" }],
    repairProposals: [
      {
        id: "proposal_approved",
        fix_request_id: "fix_proposal",
        report_id: "report-original-abc",
        final_report_id: finalReportId,
        approval_status: "approved",
        delivery_status: "delivered"
      }
    ]
  });
  const protectedProposal = await protectedRepairExecutionForReport(env, finalReportId);
  assert.equal(protectedProposal.id, "proposal_approved");
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, []);
  assert.deepEqual(deleted.protectedIds, [finalReportId]);
  assert.deepEqual(deleted.preservedIds, [finalReportId]);
  assert.deepEqual(env.deletedKeys, []);
  assert.equal(env.jobs[0].expires_at, null);
}

{
  const finalReportId = "proposal-unpaid-approved-abc";
  const env = fakeEnv({
    reports: [{ id: finalReportId, report_json: `r2:reports/${finalReportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: "fix_unpaid_proposal", status: "checkout_created", report_id: "report-original-abc", final_report_id: "" }],
    repairProposals: [
      {
        id: "proposal_unpaid_approved",
        fix_request_id: "fix_unpaid_proposal",
        report_id: "report-original-abc",
        final_report_id: finalReportId,
        approval_status: "approved",
        delivery_status: "draft"
      }
    ]
  });
  assert.equal(await protectedRepairExecutionForReport(env, finalReportId), null);
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, [finalReportId]);
  assert.deepEqual(deleted.protectedIds, []);
  assert.deepEqual(deleted.preservedIds, []);
  assert.deepEqual(env.deletedKeys, [`reports/${finalReportId}.json`]);
}

{
  const reportId = "proposal-draft-proof-abc";
  const env = fakeEnv({
    reports: [{ id: reportId, report_json: `r2:reports/${reportId}.json`, expires_at: "2026-01-01T00:00:00.000Z" }],
    fixRequests: [{ id: "fix_proposal_draft", status: "new", report_id: "report-original-abc", final_report_id: "" }],
    repairProposals: [
      {
        id: "proposal_draft",
        fix_request_id: "fix_proposal_draft",
        report_id: "report-original-abc",
        final_report_id: reportId,
        approval_status: "pending",
        delivery_status: "draft"
      }
    ]
  });
  assert.equal(await protectedRepairExecutionForReport(env, reportId), null);
  const deleted = await deleteReportRowsWithBlobs(env, env.reports);
  assert.deepEqual(deleted.deletedIds, [reportId]);
  assert.deepEqual(deleted.protectedIds, []);
  assert.deepEqual(env.deletedKeys, [`reports/${reportId}.json`]);
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

function fakeEnv({ reports = [], jobs = [], fixRequests = [], repairProposals = [], r2DeleteFails = false } = {}) {
  const env = {
    reports: reports.map((row) => ({ ...row })),
    jobs: jobs.map((row) => ({ ...row })),
    fixRequests: fixRequests.map((row) => ({ ...row })),
    repairProposals: repairProposals.map((row) => ({ ...row })),
    deletedKeys: [],
    deletionFailures: [],
    r2DeleteFails,
    WAITLIST_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            if (sql.includes("FROM repair_proposals")) {
              assert.deepEqual(values.slice(2), [
                ...protectedProposalApprovals,
                ...protectedStatuses,
                ...protectedProposalDeliveries
              ]);
            }
            return {
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

function firstRow(sql, values, env) {
  if (sql.includes("FROM repair_proposals")) {
    const reportIds = [values[0], values[1]];
    return env.repairProposals.find((row) => {
      const fixRequest = env.fixRequests.find((request) => request.id === row.fix_request_id);
      return (
        reportIds.includes(row.report_id) ||
        reportIds.includes(row.final_report_id)
      ) && (
        (protectedProposalApprovals.includes(row.approval_status) && protectedStatuses.includes(fixRequest?.status)) ||
        protectedProposalDeliveries.includes(row.delivery_status)
      );
    }) || null;
  }
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
    const reportIds = values.slice(1);
    let changes = 0;
    for (const report of env.reports) {
      if (reportIds.includes(report.id)) {
        report.expires_at = null;
        report.updated_at = values[0];
        changes += 1;
      }
    }
    return { meta: { changes } };
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
  throw new Error(`Unexpected run SQL: ${sql}`);
}

console.log(JSON.stringify({ ok: true, checked: "paid fix pack report evidence lock" }, null, 2));
