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

test("receipt records the observed before/after outcome from both reports", () => {
  const receipt = buildRepairProofReceipt(fixtureInput());

  assert.equal(receipt.ok, true);
  assert.match(receipt.markdown, /## Observed Outcome/);
  assert.match(receipt.markdown, /do not attribute every change to this repair action/);
  assert.match(receipt.markdown, /- Score: 85 -> 96 \(\+11\)/);
  assert.match(receipt.markdown, /- Issues \(excluding confirmed false positives\): 1 -> 0 \(-1\)/);
  assert.match(receipt.markdown, /- Fixed issues recorded by the rerun report: 1/);
});

test("receipt keeps missing outcome numbers explicit instead of inventing them", () => {
  const receipt = buildRepairProofReceipt(fixtureInput({
    report: { score: null },
    rerunReport: {
      score: null,
      findings: null,
      summary: { pagesScanned: 1 },
      reportDelta: null,
      report_delta: null
    }
  }));

  assert.equal(receipt.ok, true);
  assert.match(receipt.markdown, /- Score: not recorded/);
  assert.match(receipt.markdown, /- Issues \(excluding confirmed false positives\): not recorded/);
  assert.match(receipt.markdown, /- Fixed issues recorded by the rerun report: not recorded/);
  assert.doesNotMatch(receipt.markdown, /- Score: 0\b/);
  assert.doesNotMatch(receipt.markdown, /- Score: \d+ ->/);
  assert.doesNotMatch(receipt.markdown, /- Issues \(excluding confirmed false positives\): \d+ ->/);
});

test("receipt renders empty and non-numeric scores as not recorded", () => {
  const empty = buildRepairProofReceipt(fixtureInput({ rerunReport: { score: "" } }));
  const notANumber = buildRepairProofReceipt(fixtureInput({
    report: { score: "not-a-number" },
    rerunReport: { score: "not-a-number" }
  }));

  assert.equal(empty.ok, true);
  assert.match(empty.markdown, /- Score: not recorded/);
  assert.doesNotMatch(empty.markdown, /- Score: 0\b/);
  assert.equal(notANumber.ok, true);
  assert.match(notANumber.markdown, /- Score: not recorded/);
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

test("receipt names before capture, rerun capture, and an anchored currentness warning", () => {
  const receipt = buildRepairProofReceipt(fixtureInput());

  assert.equal(receipt.ok, true);
  assert.equal(receipt.metadata.sourceCapturedAt, "2026-06-20T10:00:00.000Z");
  assert.equal(receipt.metadata.rerunCapturedAt, "2026-06-20T12:00:00.000Z");
  assert.match(receipt.markdown, /Source captured: 2026-06-20T10:00:00\.000Z/);
  assert.match(receipt.markdown, /Rerun proof captured: 2026-06-20T12:00:00\.000Z/);
  assert.match(receipt.markdown, /Rerun proof captured at 2026-06-20T12:00:00\.000Z\. If the site changed after that capture, rerun the audit before using this receipt as current proof\./);
});

test("receipt fails closed when the repair was reopened after rerun proof", () => {
  const reopened = buildRepairProofReceipt(fixtureInput({ item: { rerunStatus: "not_run" } }));
  const stillOpenItem = buildRepairProofReceipt(fixtureInput({ item: { rerunStatus: "still_open" } }));

  assert.equal(reopened.ok, false);
  assert.match(reopened.error, /reopened/);
  assert.equal(stillOpenItem.ok, false);
  assert.match(stillOpenItem.error, /reopened/);
});

test("receipt fails closed when the rerun proof lacks a capture timestamp", () => {
  const receipt = buildRepairProofReceipt(fixtureInput({
    report: { createdAt: "" },
    action: { applied_at: "" },
    rerunReport: { createdAt: "", scannedAt: "" }
  }));

  assert.equal(receipt.ok, false);
  assert.match(receipt.error, /capture timestamp/);
});

test("repairProofReceiptFilename returns a bounded markdown filename", () => {
  const filename = repairProofReceiptFilename("Report 1/ABC", "Action 1/DEF");

  assert.equal(filename, "report-1-abc-action-1-def-repair-proof.md");
  assert.equal(filename.endsWith(".md"), true);
});

test("real before/after receipt: Tiny Studio render-blocking repair (PR #4) generates from real report data", () => {
  // This pins the same report UUIDs, score, and PR ref the public /proof
  // page publishes (worker/routes/pages.js PROOF_CASE), so a future drift in
  // either side fails this regression lock.
  const receipt = buildRepairProofReceipt(tinyStudioRenderBlockingFixture());

  assert.equal(receipt.ok, true);
  assert.equal(
    receipt.filename,
    "tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b-action-tinystudio-in-pr4-render-blocking-repair-proof.md"
  );
  assert.equal(receipt.metadata.reportId, "tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b");
  assert.equal(receipt.metadata.actionId, "action-tinystudio-in-pr4-render-blocking");
  assert.equal(receipt.metadata.approvalState, "approved");
  assert.equal(receipt.metadata.executionState, "applied");
  assert.equal(receipt.metadata.rerunState, "fixed");
  assert.equal(receipt.metadata.rerunReportId, "tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961");
  assert.equal(receipt.metadata.sourceCapturedAt, "2026-06-15T10:00:00.000Z");
  assert.equal(receipt.metadata.rerunCapturedAt, "2026-06-20T10:30:00.000Z");

  // Same numbers as the public /proof page (PROOF_CASE.before/after): 85 -> 100, 7 -> 0.
  assert.match(receipt.markdown, /- Score: 85 -> 100 \(\+15\)/);
  assert.match(receipt.markdown, /- Issues \(excluding confirmed false positives\): 7 -> 0 \(-7\)/);
  assert.match(receipt.markdown, /- Fixed issues recorded by the rerun report: 7/);

  // Real report UUIDs, real PR ref, real source proof wording.
  assert.match(receipt.markdown, /tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b/);
  assert.match(receipt.markdown, /tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961/);
  assert.match(receipt.markdown, /Render-blocking external resources/);
  assert.match(receipt.markdown, /Google Fonts CSS at https:\/\/fonts\.googleapis\.com/);
  assert.match(receipt.markdown, /Move Google Fonts off the render path/);
  assert.match(receipt.markdown, /Action mode: GitHub PR draft/);
  assert.match(receipt.markdown, /Rerun host: tinystudio\.in/);

  // Boundary language: no ranking or traffic guarantee.
  assert.match(receipt.markdown, /SEOFixKit did not publish to a CMS, open or merge a GitHub pull request/);
  assert.match(receipt.markdown, /Rankings, traffic, indexing, AI citations, and revenue are not guaranteed/);
  assert.doesNotMatch(receipt.markdown, /guaranteed rankings|guarantees traffic|guarantees revenue/i);
});

test("real before/after receipt: intermediate rerun (99/2) is the same measurement path on the same host", () => {
  // PR #4 was the render-blocking fix; the intermediate 99/2 report proves
  // PR #4 already cleared the render-blocking + 4 other issues, and only
  // the HSTS notice + TLS-version advisory remained before PR #5 was merged.
  // This pins the SAME measurement path before -> intermediate on the same host.
  const receipt = buildRepairProofReceipt(tinyStudioIntermediateFixture());

  assert.equal(receipt.ok, true);
  assert.equal(receipt.metadata.reportId, "tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b");
  assert.equal(receipt.metadata.rerunReportId, "tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50");
  assert.equal(receipt.metadata.rerunCapturedAt, "2026-06-18T14:00:00.000Z");

  // 85 -> 99 score lift, 7 -> 2 issue drop, 5 fixed at intermediate.
  assert.match(receipt.markdown, /- Score: 85 -> 99 \(\+14\)/);
  assert.match(receipt.markdown, /- Issues \(excluding confirmed false positives\): 7 -> 2 \(-5\)/);
  assert.match(receipt.markdown, /- Fixed issues recorded by the rerun report: 5/);

  assert.match(receipt.markdown, /Render-blocking external resources/);
  assert.match(receipt.markdown, /Move Google Fonts off the render path/);
  assert.match(receipt.markdown, /tinystudio\.in/);
});

function fixtureInput(overrides = {}) {
  const report = {
    id: "report-1",
    url: "https://example.com/",
    createdAt: "2026-06-20T10:00:00.000Z",
    reportUrl: "https://seofixkit.com/beta/reports/report-1",
    score: 85,
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
    rerunStatus: "fixed",
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
    findings: [],
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

function tinyStudioRenderBlockingFixture() {
  // Same measurement path used by the public /proof page (PROOF_CASE.before -> PROOF_CASE.after).
  // This is the founder-owned Tiny Studio portfolio repair, render-blocking external resources issue,
  // fixed by owner-approved PR #4 (https://github.com/nish3451/tinystudio-in/pull/4).
  const report = {
    id: "tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b",
    url: "https://tinystudio.in/",
    host: "tinystudio.in",
    createdAt: "2026-06-15T10:00:00.000Z",
    reportUrl: "https://seofixkit.com/beta/reports/tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b",
    score: 85,
    findings: [
      { id: "render-blocking", title: "Render-blocking external resources", severity: "warning", pageUrl: "https://tinystudio.in/", evidence: "Google Fonts CSS at https://fonts.googleapis.com/css2?... blocks the render path before the first paint." },
      { id: "apple-touch-icon", title: "Missing apple-touch-icon", severity: "notice", pageUrl: "https://tinystudio.in/", evidence: "No apple-touch-icon link in head." },
      { id: "h1-hierarchy", title: "Heading hierarchy skip", severity: "notice", pageUrl: "https://tinystudio.in/", evidence: "H1 to H3 skip without H2." },
      { id: "llms-txt", title: "Missing /llms.txt", severity: "advisory", pageUrl: "https://tinystudio.in/", evidence: "No agent-readable index." },
      { id: "schema-opportunity", title: "Schema.org opportunity", severity: "advisory", pageUrl: "https://tinystudio.in/", evidence: "ContactPage JSON-LD opportunity." },
      { id: "social-images", title: "Social preview images", severity: "advisory", pageUrl: "https://tinystudio.in/", evidence: "No og:image or twitter:image." },
      { id: "email-obfuscation", title: "Cloudflare email-obfuscation broken", severity: "warning", pageUrl: "https://tinystudio.in/support", evidence: "JS-obfuscated mailto: links." }
    ]
  };
  const item = {
    id: "queue-tinystudio-in-render-blocking",
    reportId: report.id,
    issueId: "render-blocking",
    title: "Render-blocking external resources",
    severity: "warning",
    pageUrl: "https://tinystudio.in/",
    pageLabel: "home",
    proof: "Google Fonts CSS at https://fonts.googleapis.com/css2?... blocks the render path before the first paint.",
    acceptance: "PageSpeed Insights / Lighthouse mobile Performance score stays above 95 with no render-blocking resources.",
    actionMode: "github_pr",
    status: "fixed",
    rerunStatus: "fixed"
  };
  const action = {
    id: "action-tinystudio-in-pr4-render-blocking",
    report_id: report.id,
    queue_item_id: item.id,
    issue_id: "render-blocking",
    action_mode: "github_pr",
    action_type: "draft_fix",
    approval_state: "approved",
    execution_state: "applied",
    rerun_state: "fixed",
    rerun_report_id: "tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961",
    source_proof: "Google Fonts CSS at https://fonts.googleapis.com/css2?... blocks the render path before the first paint.",
    proposed_change: "Move Google Fonts off the render path: preload local woff2, drop the blocking <link rel=stylesheet>, and inline the critical CSS used by the hero.",
    acceptance: "PageSpeed Insights / Lighthouse mobile Performance score stays above 95 with no render-blocking resources.",
    applied_at: "2026-06-18T11:00:00.000Z",
    updated_at: "2026-06-20T12:05:00.000Z"
  };
  const rerunReport = {
    id: "tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961",
    url: "https://tinystudio.in/",
    host: "tinystudio.in",
    createdAt: "2026-06-20T10:30:00.000Z",
    reportUrl: "https://seofixkit.com/beta/reports/tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961",
    score: 100,
    findings: [],
    reportDelta: {
      fixedIssues: [
        { id: "render-blocking", title: "Render-blocking external resources", pageUrl: "https://tinystudio.in/" },
        { id: "apple-touch-icon", title: "Missing apple-touch-icon", pageUrl: "https://tinystudio.in/" },
        { id: "h1-hierarchy", title: "Heading hierarchy skip", pageUrl: "https://tinystudio.in/" },
        { id: "llms-txt", title: "Missing /llms.txt", pageUrl: "https://tinystudio.in/" },
        { id: "schema-opportunity", title: "Schema.org opportunity", pageUrl: "https://tinystudio.in/" },
        { id: "social-images", title: "Social preview images", pageUrl: "https://tinystudio.in/" },
        { id: "email-obfuscation", title: "Cloudflare email-obfuscation broken", pageUrl: "https://tinystudio.in/support" }
      ]
    }
  };
  return { report, item, action, rerunReport };
}

function tinyStudioIntermediateFixture() {
  // Intermediate rerun (99/2): after PR #4 was merged, the render-blocking
  // + 4 other issues were already fixed by the same owner-approved change.
  // This proves PR #4 was effective on the same measurement path on the
  // same host (only HSTS notice + TLS-version advisory remained, and were
  // closed by PR #5 in the final rerun).
  const report = {
    id: "tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b",
    url: "https://tinystudio.in/",
    host: "tinystudio.in",
    createdAt: "2026-06-15T10:00:00.000Z",
    reportUrl: "https://seofixkit.com/beta/reports/tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b",
    score: 85,
    findings: [
      { id: "render-blocking", title: "Render-blocking external resources", severity: "warning", pageUrl: "https://tinystudio.in/", evidence: "Google Fonts CSS at https://fonts.googleapis.com/css2?... blocks the render path before the first paint." },
      { id: "apple-touch-icon", title: "Missing apple-touch-icon", severity: "notice", pageUrl: "https://tinystudio.in/", evidence: "No apple-touch-icon link in head." },
      { id: "h1-hierarchy", title: "Heading hierarchy skip", severity: "notice", pageUrl: "https://tinystudio.in/", evidence: "H1 to H3 skip without H2." },
      { id: "llms-txt", title: "Missing /llms.txt", severity: "advisory", pageUrl: "https://tinystudio.in/", evidence: "No agent-readable index." },
      { id: "schema-opportunity", title: "Schema.org opportunity", severity: "advisory", pageUrl: "https://tinystudio.in/", evidence: "ContactPage JSON-LD opportunity." },
      { id: "social-images", title: "Social preview images", severity: "advisory", pageUrl: "https://tinystudio.in/", evidence: "No og:image or twitter:image." },
      { id: "email-obfuscation", title: "Cloudflare email-obfuscation broken", severity: "warning", pageUrl: "https://tinystudio.in/support", evidence: "JS-obfuscated mailto: links." }
    ]
  };
  const item = {
    id: "queue-tinystudio-in-render-blocking",
    reportId: report.id,
    issueId: "render-blocking",
    title: "Render-blocking external resources",
    severity: "warning",
    pageUrl: "https://tinystudio.in/",
    pageLabel: "home",
    proof: "Google Fonts CSS at https://fonts.googleapis.com/css2?... blocks the render path before the first paint.",
    acceptance: "PageSpeed Insights / Lighthouse mobile Performance score stays above 95 with no render-blocking resources.",
    actionMode: "github_pr",
    status: "fixed",
    rerunStatus: "fixed"
  };
  const action = {
    id: "action-tinystudio-in-pr4-render-blocking",
    report_id: report.id,
    queue_item_id: item.id,
    issue_id: "render-blocking",
    action_mode: "github_pr",
    action_type: "draft_fix",
    approval_state: "approved",
    execution_state: "applied",
    rerun_state: "fixed",
    rerun_report_id: "tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50",
    source_proof: "Google Fonts CSS at https://fonts.googleapis.com/css2?... blocks the render path before the first paint.",
    proposed_change: "Move Google Fonts off the render path: preload local woff2, drop the blocking <link rel=stylesheet>, and inline the critical CSS used by the hero.",
    acceptance: "PageSpeed Insights / Lighthouse mobile Performance score stays above 95 with no render-blocking resources.",
    applied_at: "2026-06-18T11:00:00.000Z",
    updated_at: "2026-06-18T15:00:00.000Z"
  };
  const rerunReport = {
    id: "tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50",
    url: "https://tinystudio.in/",
    host: "tinystudio.in",
    createdAt: "2026-06-18T14:00:00.000Z",
    reportUrl: "https://seofixkit.com/beta/reports/tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50",
    score: 99,
    findings: [
      { id: "hsts-header", title: "Strict-Transport-Security header missing", severity: "notice", pageUrl: "https://tinystudio.in/", evidence: "Strict-Transport-Security header is missing on the apex host." },
      { id: "tls-version-advisory", title: "TLS version advisory", severity: "advisory", pageUrl: "https://tinystudio.in/", evidence: "Consider TLS 1.3 only." }
    ],
    reportDelta: {
      fixedIssues: [
        { id: "render-blocking", title: "Render-blocking external resources", pageUrl: "https://tinystudio.in/" },
        { id: "apple-touch-icon", title: "Missing apple-touch-icon", pageUrl: "https://tinystudio.in/" },
        { id: "h1-hierarchy", title: "Heading hierarchy skip", pageUrl: "https://tinystudio.in/" },
        { id: "llms-txt", title: "Missing /llms.txt", pageUrl: "https://tinystudio.in/" },
        { id: "schema-opportunity", title: "Schema.org opportunity", pageUrl: "https://tinystudio.in/" }
      ]
    }
  };
  return { report, item, action, rerunReport };
}
