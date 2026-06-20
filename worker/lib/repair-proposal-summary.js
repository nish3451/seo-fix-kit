function emptyRepairProposalSummary(status = "ready") {
  return { status, total: 0, approved: 0, approvedExecutable: 0, dismissed: 0, executable: 0, delivered: 0 };
}

async function repairProposalSummariesForFixRequests(env, fixRequestIds = [], ownerEmail = "") {
  const ids = [...new Set((fixRequestIds || []).filter(Boolean))];
  const summaries = new Map(ids.map((id) => [id, emptyRepairProposalSummary("ready")]));
  if (!ids.length) return summaries;
  if (!env.WAITLIST_DB) {
    for (const id of ids) summaries.set(id, emptyRepairProposalSummary("unavailable"));
    return summaries;
  }

  try {
    const placeholders = ids.map(() => "?").join(", ");
    const ownerClause = ownerEmail ? " AND owner_email = ?" : "";
    const rows = await env.WAITLIST_DB.prepare(
      `SELECT
         fix_request_id,
         COUNT(*) AS total,
         SUM(CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN approval_status = 'approved' AND execution_mode != 'unsupported' THEN 1 ELSE 0 END) AS approved_executable,
         SUM(CASE WHEN approval_status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
         SUM(CASE WHEN execution_mode != 'unsupported' THEN 1 ELSE 0 END) AS executable,
         SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) AS delivered
       FROM repair_proposals
       WHERE fix_request_id IN (${placeholders})${ownerClause}
       GROUP BY fix_request_id`
    )
      .bind(...ids, ...(ownerEmail ? [ownerEmail] : []))
      .all();
    for (const row of rows.results || []) {
      summaries.set(row.fix_request_id, {
        status: "ready",
        total: Number(row.total || 0),
        approved: Number(row.approved || 0),
        approvedExecutable: Number(row.approved_executable || 0),
        dismissed: Number(row.dismissed || 0),
        executable: Number(row.executable || 0),
        delivered: Number(row.delivered || 0)
      });
    }
  } catch {
    for (const id of ids) summaries.set(id, emptyRepairProposalSummary("unavailable"));
  }
  return summaries;
}

async function repairProposalSummaryForFixRequest(env, fixRequestId, ownerEmail = "") {
  if (!fixRequestId) return emptyRepairProposalSummary("skipped");
  const summaries = await repairProposalSummariesForFixRequests(env, [fixRequestId], ownerEmail);
  return summaries.get(fixRequestId) || emptyRepairProposalSummary("unavailable");
}

export {
  emptyRepairProposalSummary,
  repairProposalSummariesForFixRequests,
  repairProposalSummaryForFixRequest
};
