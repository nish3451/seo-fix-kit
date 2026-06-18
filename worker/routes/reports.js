import { issuePatternKey } from "../../shared/audit-engine.js";
import { repairSprintEligibilityFromProposals } from "../../shared/offers.js";
import { buildRemediationBrief } from "../../shared/remediation-brief.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { json, jsonNoStore } from "../lib/http.js";
import { agencyWorkspaceAccessForOwner } from "../lib/offers.js";
import {
  deleteReportRowsWithBlobs,
  ownerReportRow,
  reportJsonForRow
} from "../lib/report-data.js";
import { fixRequestResponse, repairProposalResponse } from "../lib/serializers.js";
import { cleanText, isSafeReportId, isSafeUuid, normalizeEmail, parseJson } from "../lib/text.js";

async function getTeamMembers(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  return jsonNoStore({
    ok: true,
    members: await teamMembersForOwner(env, access.ownerEmail)
  });
}

async function createTeamMember(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  const memberEmail = normalizeEmail(body.email || body.memberEmail);
  if (!memberEmail) return jsonNoStore({ error: "Enter a valid teammate email." }, 400);
  if (memberEmail === access.ownerEmail) return jsonNoStore({ error: "You are already the workspace owner." }, 400);

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM team_members
     WHERE owner_email = ?
       AND member_email = ?
       AND status = 'active'
     LIMIT 1`
  )
    .bind(access.ownerEmail, memberEmail)
    .first();
  if (existing?.id) return jsonNoStore({ ok: true, member: teamMemberResponse(existing), deduped: true });

  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM team_members
     WHERE owner_email = ?
       AND status = 'active'`
  )
    .bind(access.ownerEmail)
    .first();
  const agency = await agencyWorkspaceAccessForOwner(env, access.ownerEmail, {
    teamSeats: Number(count?.count || 0)
  });
  if (Number(count?.count || 0) >= agency.limits.teamSeats) {
    return jsonNoStore(
      {
        error: `This workspace already has ${agency.limits.teamSeats} active teammates.`,
        code: "AGENCY_TEAM_SEAT_LIMIT",
        agencyWorkspace: agency
      },
      429
    );
  }

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    member_email: memberEmail,
    member_name: cleanText(body.name || body.memberName || "", 120),
    role: cleanTeamRole(body.role),
    status: "active",
    created_at: now,
    updated_at: now,
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO team_members
      (id, owner_email, member_email, member_name, role, status, created_at, updated_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.owner_email,
      row.member_email,
      row.member_name || null,
      row.role,
      row.status,
      row.created_at,
      row.updated_at,
      null
    )
    .run();
  return jsonNoStore({ ok: true, member: teamMemberResponse(row) });
}

async function revokeTeamMember(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/team/members/".length));
  if (!isSafeUuid(id)) return json({ error: "Teammate not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE team_members
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Teammate not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getReportCollaboration(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = reportIdFromSuffixPath(url.pathname, "/collaboration");
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const report = parseJson(row.report_json, {});
  return jsonNoStore(await reportCollaborationResponse(env, access, reportId, report));
}

async function saveReportCollaboration(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Team collaboration storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = reportIdFromSuffixPath(url.pathname, "/collaboration");
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const report = parseJson(row.report_json, {});
  const result = await saveIssueCollaborations(env, access, reportId, report, body.items || []);
  if (!result.ok) return jsonNoStore({ error: result.error }, 400);
  return jsonNoStore(await reportCollaborationResponse(env, access, reportId, report));
}

async function updateRepairProposalApproval(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Repair proposal storage is not configured." }, 503);

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/reports\/([^/]+)\/repair-proposals\/([^/]+)$/);
  const reportId = match ? decodeURIComponent(match[1]) : "";
  const proposalId = match ? decodeURIComponent(match[2]) : "";
  if (!isSafeReportId(reportId) || !isSafeUuid(proposalId)) return json({ error: "Repair proposal not found." }, 404);
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM repair_proposals
     WHERE id = ?
       AND report_id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(proposalId, reportId, access.ownerEmail)
    .first();
  if (!existing?.id) return json({ error: "Repair proposal not found." }, 404);

  const body = await request.json().catch(() => ({}));
  const action = cleanText(body.action || "", 40).toLowerCase();
  if (!["approve", "dismiss"].includes(action)) {
    return jsonNoStore({ error: "Choose approve or dismiss." }, 400);
  }
  if ((existing.delivery_status || "draft") !== "draft") {
    return jsonNoStore({ error: "Repair approval cannot be changed after delivery starts." }, 409);
  }
  if (action === "approve" && existing.execution_mode === "unsupported") {
    return jsonNoStore({ error: "This repair item is not executable yet and cannot be approved for delivery." }, 400);
  }
  const now = new Date().toISOString();
  const ownerNote = cleanText(body.ownerNote || body.owner_note || "", 1000);
  const nextApprovalStatus = action === "approve" ? "approved" : "dismissed";
  await env.WAITLIST_DB.prepare(
    `UPDATE repair_proposals
     SET approval_status = ?,
         owner_note = ?,
         approved_at = ?,
         approved_by_email = ?,
         dismissed_at = ?,
         updated_at = ?
     WHERE id = ?
       AND report_id = ?
       AND owner_email = ?`
  )
    .bind(
      nextApprovalStatus,
      ownerNote || existing.owner_note || "",
      action === "approve" ? now : existing.approved_at || null,
      action === "approve" ? access.ownerEmail : existing.approved_by_email || null,
      action === "dismiss" ? now : null,
      now,
      proposalId,
      reportId,
      access.ownerEmail
    )
    .run();
  await logRepairProposalEvent(env, {
    proposalId,
    fixRequestId: existing.fix_request_id || "",
    event: action === "approve" ? "owner_approved" : "owner_dismissed",
    actorEmail: access.ownerEmail,
    fromStatus: existing.approval_status || "pending",
    toStatus: nextApprovalStatus,
    detail: { reportId, hadOwnerNote: Boolean(ownerNote) }
  });
  const updated = await env.WAITLIST_DB.prepare("SELECT * FROM repair_proposals WHERE id = ? LIMIT 1")
    .bind(proposalId)
    .first();
  return jsonNoStore({ ok: true, proposal: repairProposalResponse(updated) });
}

async function logRepairProposalEvent(env, { proposalId, fixRequestId = "", event, actorEmail, fromStatus, toStatus, detail = {} }) {
  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO repair_proposal_events
        (id, proposal_id, fix_request_id, event, actor_type, actor_email, from_status, to_status, detail_json, created_at)
       VALUES (?, ?, ?, ?, 'owner', ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        proposalId,
        fixRequestId || null,
        event,
        actorEmail,
        fromStatus || "",
        toStatus || "",
        JSON.stringify(detail || {}).slice(0, 2000),
        new Date().toISOString()
      )
      .run();
  } catch {
    // Approval is the source of truth; event logging should not block owners.
  }
}

async function teamMembersForOwner(env, ownerEmail) {
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM team_members
     WHERE owner_email = ?
       AND status = 'active'
     ORDER BY member_email ASC
     LIMIT 50`
  )
    .bind(ownerEmail)
    .all();
  return (rows.results || []).map(teamMemberResponse);
}

function teamMemberResponse(row = {}) {
  return {
    id: row.id || "",
    email: row.member_email || "",
    name: row.member_name || "",
    role: row.role || "editor",
    status: row.status || "active",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

async function reportCollaborationResponse(env, access, reportId, report) {
  const [members, saved] = await Promise.all([
    teamMembersForOwner(env, access.ownerEmail),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM issue_collaboration
       WHERE report_id = ?
         AND owner_email = ?`
    )
      .bind(reportId, access.ownerEmail)
      .all()
  ]);
  const savedByIssue = new Map((saved.results || []).map((item) => [item.issue_id, item]));
  return {
    ok: true,
    members,
    issues: reportIssuesForCollaboration(report).map((finding) =>
      issueCollaborationResponse(finding, savedByIssue.get(finding.id))
    ),
    updatedAt: new Date().toISOString()
  };
}

function issueCollaborationResponse(finding = {}, row = {}) {
  return {
    issueId: finding.id || "",
    title: finding.title || "",
    severity: finding.severity || "notice",
    pageLabel: finding.pageLabel || "",
    pageUrl: finding.pageUrl || "",
    proof: finding.evidence || "",
    fix: finding.fix || "",
    status: row?.status || "open",
    assigneeEmail: row?.assignee_email || "",
    note: row?.note || "",
    updatedAt: row?.updated_at || "",
    updatedByEmail: row?.updated_by_email || ""
  };
}

async function saveIssueCollaborations(env, access, reportId, report, items = []) {
  if (!Array.isArray(items)) return { ok: false, error: "Send collaboration items as a list." };
  const issues = reportIssuesForCollaboration(report);
  const issueIds = new Set(issues.map((issue) => issue.id));
  const members = await teamMembersForOwner(env, access.ownerEmail);
  const assignees = new Set(members.map((member) => member.email));
  const now = new Date().toISOString();

  for (const item of items.slice(0, 50)) {
    const issueId = cleanText(item?.issueId || item?.issue_id || "", 160);
    if (!issueIds.has(issueId)) return { ok: false, error: "Issue no longer exists in this report." };
    const assigneeEmail = normalizeEmail(item?.assigneeEmail || item?.assignee_email || "");
    if (assigneeEmail && !assignees.has(assigneeEmail)) {
      return { ok: false, error: "Assign the issue to an active teammate." };
    }
    const existing = await env.WAITLIST_DB.prepare(
      `SELECT id, created_at
       FROM issue_collaboration
       WHERE report_id = ?
         AND issue_id = ?
       LIMIT 1`
    )
      .bind(reportId, issueId)
      .first();
    const row = {
      id: existing?.id || crypto.randomUUID(),
      report_id: reportId,
      owner_email: access.ownerEmail,
      issue_id: issueId,
      assignee_email: assigneeEmail,
      status: cleanIssueStatus(item?.status),
      note: cleanText(item?.note || "", 1200),
      created_at: existing?.created_at || now,
      updated_at: now,
      updated_by_email: access.ownerEmail
    };
    await env.WAITLIST_DB.prepare(
      `INSERT INTO issue_collaboration
        (id, report_id, owner_email, issue_id, assignee_email, status, note, created_at, updated_at, updated_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(report_id, issue_id) DO UPDATE SET
         assignee_email = excluded.assignee_email,
         status = excluded.status,
         note = excluded.note,
         updated_at = excluded.updated_at,
         updated_by_email = excluded.updated_by_email`
    )
      .bind(
        row.id,
        row.report_id,
        row.owner_email,
        row.issue_id,
        row.assignee_email || null,
        row.status,
        row.note || null,
        row.created_at,
        row.updated_at,
        row.updated_by_email
      )
      .run();
  }
  return { ok: true };
}

function reportIssuesForCollaboration(report = {}) {
  return (report.findings || [])
    .filter((finding) => finding?.id && finding.severity !== "good")
    .slice(0, 50);
}

function reportIdFromSuffixPath(pathname, suffix) {
  return decodeURIComponent(pathname.slice("/api/reports/".length, -suffix.length));
}

function cleanTeamRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ["admin", "editor", "viewer"].includes(role) ? role : "editor";
}

function cleanIssueStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["open", "in_progress", "fixed", "ignored"].includes(status) ? status : "open";
}

async function getSavedReport(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname.slice("/api/reports/".length));
  const wantsBrief = relative.endsWith("/brief.md");
  const wantsRemediationBrief = relative.endsWith("/remediation-brief.json");
  const id = wantsBrief
    ? relative.slice(0, -"/brief.md".length)
    : wantsRemediationBrief
      ? relative.slice(0, -"/remediation-brief.json".length)
      : relative;
  if (!isSafeReportId(id)) {
    return json({ error: "Report not found." }, 404);
  }

  const row = await env.WAITLIST_DB.prepare(
    `SELECT report_json, owner_email, owner_invite_id, expires_at FROM audit_reports WHERE id = ? LIMIT 1`
  )
    .bind(id)
    .first();
  if (!row?.report_json) {
    return json({ error: "Report not found." }, 404);
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    const deleted = await deleteReportRowsWithBlobs(env, [{ id, report_json: row.report_json }]);
    if (deleted.protectedIds.includes(id)) {
      row.expires_at = null;
    } else {
      return json({ error: "Report expired." }, 404);
    }
  }
  if (row.owner_email && row.owner_email !== access.ownerEmail) {
    return json({ error: "Report not found." }, 404);
  }
  if (
    row.owner_invite_id &&
    access.accessMode !== "founder-override" &&
    row.owner_invite_id !== access.inviteId
  ) {
    return json({ error: "Report not found." }, 404);
  }

  const reportJson = await reportJsonForRow(env, row);
  if (!reportJson) {
    return json({ error: "Report not found." }, 404);
  }
  const report = JSON.parse(reportJson);
  report.reportUrl = `${url.origin}${report.reportPath || `/beta/reports/${id}`}`;
  if (!row.expires_at && report.retention) {
    report.retention = { ...report.retention, expiresAt: "", preserved: true };
  }

  if (wantsBrief) {
    return new Response(report.repairBrief || "# SEO Fix Kit repair brief\n", {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="seofixkit-${id}.md"`,
        "content-type": "text/markdown; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      }
    });
  }

  if (wantsRemediationBrief) {
    return jsonNoStore(buildRemediationBrief(report));
  }

  const fixRequest = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE report_id = ? AND owner_email = ?
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (fixRequest?.id) {
    report.fixRequest = fixRequestResponse(fixRequest);
    if (fixRequest.final_report_id) {
      report.fixRequest.finalReportPath = `/beta/reports/${encodeURIComponent(fixRequest.final_report_id)}`;
    }
  }
  report.repairProposals = await repairProposalsForReport(env, id, access.ownerEmail);
  report.repairSprint = repairSprintEligibilityFromProposals(report.repairProposals, report.fixRequest || null);
  report.agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail);

  report.remediationBrief = buildRemediationBrief(report);
  return jsonNoStore(report);
}

async function repairProposalsForReport(env, reportId, ownerEmail) {
  try {
    const rows = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM repair_proposals
       WHERE report_id = ?
         AND owner_email = ?
       ORDER BY priority ASC, updated_at DESC
       LIMIT 50`
    )
      .bind(reportId, ownerEmail)
      .all();
    return (rows.results || []).map((row) => repairProposalResponse(row));
  } catch {
    return [];
  }
}

function summarizeIssuePatterns(rows) {
  const counts = new Map();
  for (const row of rows) {
    const report = parseJson(row.report_json, {});
    for (const finding of report.findings || []) {
      if (finding.severity === "good") continue;
      const key = issuePatternKey(finding.title || "Unknown issue");
      const current = counts.get(key) || {
        title: key,
        count: 0,
        critical: 0,
        warnings: 0,
        notices: 0
      };
      current.count += 1;
      if (finding.severity === "critical") current.critical += 1;
      if (finding.severity === "warning") current.warnings += 1;
      if (finding.severity === "notice") current.notices += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

export {
  cleanIssueStatus,
  cleanTeamRole,
  createTeamMember,
  getReportCollaboration,
  getSavedReport,
  getTeamMembers,
  issueCollaborationResponse,
  reportCollaborationResponse,
  reportIdFromSuffixPath,
  reportIssuesForCollaboration,
  revokeTeamMember,
  repairProposalsForReport,
  saveIssueCollaborations,
  saveReportCollaboration,
  summarizeIssuePatterns,
  teamMemberResponse,
  teamMembersForOwner,
  updateRepairProposalApproval
};
