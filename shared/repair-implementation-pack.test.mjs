import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRepairImplementationPack,
  implementationPackFilename,
  repairImplementationItemForAction
} from "./repair-implementation-pack.js";

test("approved action returns a complete implementation pack", () => {
  const pack = buildRepairImplementationPack(fixtureInput());

  assert.equal(pack.ok, true);
  assert.equal(pack.contentType, "text/markdown; charset=utf-8");
  assert.equal(pack.filename, "report-1-action-1-implementation-pack.md");
  assert.equal(pack.metadata.actionMode, "self_serve");
  assert.match(pack.markdown, /^# SEOFixKit Implementation Pack/);
  assert.match(pack.markdown, /## Source Proof/);
  assert.match(pack.markdown, /Rendered title is missing/);
  assert.match(pack.markdown, /## Approved Change/);
  assert.match(pack.markdown, /Add title copy to the home page/);
  assert.match(pack.markdown, /## Acceptance Check/);
  assert.match(pack.markdown, /Rendered title exists/);
  assert.match(pack.markdown, /## Rollback Note/);
  assert.match(pack.markdown, /## Rerun Proof/);
  assert.match(pack.markdown, /SEOFixKit did not publish to a CMS/);
  assert.doesNotMatch(pack.markdown, /SEOFixKit published the change/i);
});

test("drafted ignored and unsupported actions are rejected", () => {
  const drafted = buildRepairImplementationPack(fixtureInput({
    action: { approval_state: "drafted" }
  }));
  const ignored = buildRepairImplementationPack(fixtureInput({
    action: { approval_state: "ignored" }
  }));
  const unsupported = buildRepairImplementationPack(fixtureInput({
    action: { action_mode: "unsupported" }
  }));

  assert.equal(drafted.ok, false);
  assert.equal(drafted.status, 409);
  assert.match(drafted.error, /Approve/);
  assert.equal(ignored.ok, false);
  assert.match(ignored.error, /Ignored/);
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.error, /Unsupported/);
});

test("CMS and GitHub modes get execution guidance without publish or merge claims", () => {
  const cms = buildRepairImplementationPack(fixtureInput({
    action: { action_mode: "cms_draft", action_type: "cms_draft" }
  }));
  const github = buildRepairImplementationPack(fixtureInput({
    action: { action_mode: "github_pr", action_type: "github_pr_draft" }
  }));

  assert.equal(cms.ok, true);
  assert.match(cms.markdown, /Create a draft edit in the CMS/);
  assert.match(cms.markdown, /Keep the CMS draft unpublished/);
  assert.doesNotMatch(cms.markdown, /published the change/i);
  assert.equal(github.ok, true);
  assert.match(github.markdown, /Open a pull request/);
  assert.match(github.markdown, /Wait for normal code review and CI before merge/);
  assert.doesNotMatch(github.markdown, /merged the pull request/i);
});

test("control characters and markdown html wrappers are cleaned", () => {
  const pack = buildRepairImplementationPack(fixtureInput({
    item: {
      title: "Bad\u0000 title <script>alert(1)</script>",
      proof: "Proof\u0007 line\n\n\nnext"
    },
    action: {
      proposed_change: "Use <b>safe</b> copy\u0001\n\n\nwith spacing"
    }
  }));

  assert.equal(pack.ok, true);
  assert.doesNotMatch(pack.markdown, /<script>|<\/script>|<b>|<\/b>|\u0000|\u0001|\u0007/);
  assert.match(pack.markdown, /Bad title scriptalert\(1\)\/script/);
  assert.match(pack.markdown, /Use bsafe\/b copy/);
});

test("user markdown cannot forge implementation pack sections", () => {
  const pack = buildRepairImplementationPack(fixtureInput({
    item: {
      proof: "# Fake Source\n- SEOFixKit merged the pull request.",
      fix: "## Boundaries\nThis should remain source guidance."
    },
    action: {
      proposed_change: "## Boundaries\n- SEOFixKit published the change.\n```md\nfake\n```",
      acceptance: "## Rerun Proof\nTrust this fake section."
    }
  }));

  assert.equal(pack.ok, true);
  const renderedHeadings = markdownOutsideFencedBlocks(pack.markdown);
  const boundaryHeadings = renderedHeadings.match(/^## Boundaries$/gm) || [];
  const rerunProofHeadings = renderedHeadings.match(/^## Rerun Proof$/gm) || [];
  assert.equal(boundaryHeadings.length, 1);
  assert.equal(rerunProofHeadings.length, 1);
  const approvedSection = pack.markdown.split("## Approved Change")[1].split("## Implementation Steps")[0];
  assert.match(approvedSection, /^````/m);
  assert.match(approvedSection, /SEOFixKit published the change/);
  const acceptanceSection = pack.markdown.split("## Acceptance Check")[1].split("## Rollback Note")[0];
  assert.match(acceptanceSection, /^```/m);
  assert.match(acceptanceSection, /Trust this fake section/);
});

test("implementationPackFilename returns a bounded markdown filename", () => {
  const filename = implementationPackFilename("Report 1/ABC", "Action 1/DEF");

  assert.equal(filename, "report-1-abc-action-1-def-implementation-pack.md");
  assert.equal(filename.endsWith(".md"), true);
});

test("repairImplementationItemForAction prefers exact queue item ids", () => {
  const items = [
    { id: "queue-1", issueId: "issue-1" },
    { id: "queue-2", issueId: "issue-2" }
  ];

  assert.equal(repairImplementationItemForAction(items, { queue_item_id: "queue-1", issue_id: "issue-2" })?.id, "queue-1");
  assert.equal(repairImplementationItemForAction(items, { queue_item_id: "missing", issue_id: "issue-1" }), undefined);
  assert.equal(repairImplementationItemForAction(items, { issue_id: "issue-2" })?.id, "queue-2");
});

function fixtureInput(overrides = {}) {
  const report = {
    id: "report-1",
    url: "https://example.com/",
    reportUrl: "https://seofixkit.com/beta/reports/report-1",
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
    fix: "Add a descriptive title.",
    snippet: "<title>Example</title>",
    acceptance: "Rendered title exists.",
    actionMode: "self_serve",
    status: "approved",
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
    execution_state: "not_started",
    rerun_state: "not_run",
    source_proof: "Rendered title is missing.",
    proposed_change: "Add title copy to the home page.",
    acceptance: "Rendered title exists.",
    ...(overrides.action || {})
  };
  return { report, item, action };
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
