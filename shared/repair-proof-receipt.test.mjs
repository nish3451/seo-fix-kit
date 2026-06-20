import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRepairProofReceipt,
  repairProofReceiptFilename
} from "./repair-proof-receipt.js";

test("fixed applied action returns a private repair proof receipt", () => {
  const receipt = buildRepairProofReceipt(fixtureInput());

  assert.equal(receipt.ok, true);
  assert.equal(receipt.contentType, "text/markdown; charset=utf-8");
  assert.equal(receipt.filename, "report-1-action-1-repair-proof.md");
  assert.equal(receipt.metadata.rerunState, "fixed");
  assert.match(receipt.markdown, /^# SEOFixKit Repair Proof Receipt/);
  assert.match(receipt.markdown, /## Before Proof/);
  assert.match(receipt.markdown, /Rendered title is missing/);
  assert.match(receipt.markdown, /## Approved Change/);
  assert.match(receipt.markdown, /Add title copy to the home page/);
  assert.match(receipt.markdown, /## Rerun Proof/);
  assert.match(receipt.markdown, /rerun-report-1/);
  assert.match(receipt.markdown, /same-host rerun proof/);
  assert.match(receipt.markdown, /SEOFixKit did not publish to a CMS/);
  assert.doesNotMatch(receipt.markdown, /guaranteed rankings/i);
});

test("receipt requires approved applied fixed action with rerun report id", () => {
  const drafted = buildRepairProofReceipt(fixtureInput({ action: { approval_state: "drafted" } }));
  const notApplied = buildRepairProofReceipt(fixtureInput({ action: { execution_state: "recorded" } }));
  const stillOpen = buildRepairProofReceipt(fixtureInput({ action: { rerun_state: "still_open" } }));
  const missingRerun = buildRepairProofReceipt(fixtureInput({ action: { rerun_report_id: "" } }));

  assert.equal(drafted.ok, false);
  assert.match(drafted.error, /Approve/);
  assert.equal(notApplied.ok, false);
  assert.match(notApplied.error, /applied/);
  assert.equal(stillOpen.ok, false);
  assert.match(stillOpen.error, /fixed/);
  assert.equal(missingRerun.ok, false);
  assert.match(missingRerun.error, /Attach/);
});

test("receipt fails closed for weak stale wrong-host and mismatched rerun proof", () => {
  const weak = buildRepairProofReceipt(fixtureInput({
    rerunReport: {
      score: "not-a-number",
      summary: null,
      pages: [],
      pageSummaries: [],
      reportDelta: null,
      report_delta: null
    }
  }));
  const stale = buildRepairProofReceipt(fixtureInput({
    rerunReport: { createdAt: "2026-06-20T10:30:00.000Z" }
  }));
  const wrongHost = buildRepairProofReceipt(fixtureInput({
    rerunReport: { url: "https://other.example/" }
  }));
  const mismatchedReport = buildRepairProofReceipt(fixtureInput({
    rerunReport: { id: "different-report" }
  }));
  const missingFixedIssue = buildRepairProofReceipt(fixtureInput({
    rerunReport: {
      findings: [{ id: "issue-1", title: "Missing title", pageUrl: "https://example.com/" }],
      reportDelta: { fixedIssues: [{ id: "other-issue", title: "Other issue", pageUrl: "https://example.com/" }] }
    }
  }));

  assert.equal(weak.ok, false);
  assert.match(weak.error, /missing or invalid/);
  assert.equal(stale.ok, false);
  assert.match(stale.error, /newer/);
  assert.equal(wrongHost.ok, false);
  assert.match(wrongHost.error, /same host/);
  assert.equal(mismatchedReport.ok, false);
  assert.match(mismatchedReport.error, /does not match/);
  assert.equal(missingFixedIssue.ok, false);
  assert.match(missingFixedIssue.error, /does not prove/);
});

test("receipt sanitizes user markdown without allowing fake sections", () => {
  const receipt = buildRepairProofReceipt(fixtureInput({
    item: {
      proof: "# Fake Before\n<script>alert(1)</script>"
    },
    action: {
      proposed_change: "## Boundaries\n- SEOFixKit guaranteed rankings.\n```md\nfake\n```"
    }
  }));

  assert.equal(receipt.ok, true);
  assert.doesNotMatch(receipt.markdown, /<script>|<\/script>/);
  const renderedHeadings = markdownOutsideFencedBlocks(receipt.markdown);
  assert.equal((renderedHeadings.match(/^## Boundaries$/gm) || []).length, 1);
  const approvedSection = receipt.markdown.split("## Approved Change")[1].split("## Acceptance Check")[0];
  assert.match(approvedSection, /^````/m);
  assert.match(approvedSection, /SEOFixKit guaranteed rankings/);
});

test("repairProofReceiptFilename returns a bounded markdown filename", () => {
  const filename = repairProofReceiptFilename("Report 1/ABC", "Action 1/DEF");

  assert.equal(filename, "report-1-abc-action-1-def-repair-proof.md");
  assert.equal(filename.endsWith(".md"), true);
});

function fixtureInput(overrides = {}) {
  const report = {
    id: "report-1",
    url: "https://example.com/",
    createdAt: "2026-06-20T10:00:00.000Z",
    reportUrl: "https://seofixkit.com/beta/reports/report-1",
    findings: [
      {
        id: "issue-1",
        title: "Missing title",
        severity: "critical",
        pageUrl: "https://example.com/",
        evidence: "Rendered title is missing."
      }
    ],
    ...(overrides.report || {})
  };
  const item = {
    id: "queue-1",
    reportId: "report-1",
    issueId: "issue-1",
    title: "Missing title",
    severity: "critical",
    pageUrl: "https://example.com/",
    pageLabel: "home",
    proof: "Rendered title is missing.",
    acceptance: "Rendered title exists.",
    actionMode: "self_serve",
    status: "fixed",
    ...(overrides.item || {})
  };
  const action = {
    id: "action-1",
    report_id: "report-1",
    queue_item_id: "queue-1",
    issue_id: "issue-1",
    action_mode: "self_serve",
    action_type: "metadata_copy",
    approval_state: "approved",
    execution_state: "applied",
    rerun_state: "fixed",
    rerun_report_id: "rerun-report-1",
    source_proof: "Rendered title is missing.",
    proposed_change: "Add title copy to the home page.",
    acceptance: "Rendered title exists.",
    applied_at: "2026-06-20T11:00:00.000Z",
    updated_at: "2026-06-20T12:05:00.000Z",
    ...(overrides.action || {})
  };
  const rerunReport = {
    id: "rerun-report-1",
    url: "https://example.com/",
    createdAt: "2026-06-20T12:00:00.000Z",
    reportUrl: "https://seofixkit.com/beta/reports/rerun-report-1",
    score: 96,
    reportDelta: {
      fixedIssues: [
        {
          id: "issue-1",
          title: "Missing title",
          pageUrl: "https://example.com/"
        }
      ]
    },
    ...(overrides.rerunReport || {})
  };
  return { report, item, action, rerunReport };
}

function markdownOutsideFencedBlocks(markdown = "") {
  const lines = String(markdown || "").split("\n");
  let inFence = false;
  let fence = "";
  return lines
    .filter((line) => {
      const fenceMatch = line.match(/^(`{3,})/);
      if (fenceMatch && (!inFence || fenceMatch[1].length >= fence.length)) {
        inFence = !inFence;
        fence = inFence ? fenceMatch[1] : "";
        return false;
      }
      return !inFence;
    })
    .join("\n");
}
