import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRemediationBrief } from "../shared/remediation-brief.js";

const report = {
  id: "r_demo",
  url: "https://example.com/",
  score: 71,
  summary: {
    pagesScanned: 4,
    maxPages: 10,
    critical: 1,
    warnings: 1,
    notices: 0,
    guardedFalsePositives: 2
  },
  findings: [
    {
      id: "missing-h1-1",
      severity: "critical",
      title: "Missing H1 on homepage",
      pageUrl: "https://example.com/",
      pageLabel: "Homepage",
      evidence: "Rendered page had no H1.",
      fix: "Add a clear H1.",
      source: "rendered"
    },
    {
      id: "guard-1",
      severity: "good",
      title: "Static duplicate H1 false positive"
    }
  ],
  repairPlan: [
    {
      title: "Missing H1 on homepage",
      fix: "Add one visible H1 that matches the page purpose.",
      workType: "content",
      estimatedEffort: "15 min"
    }
  ],
  reportDelta: {
    status: "ready",
    summary: {
      fixedIssuesCount: 2,
      newIssuesCount: 1,
      persistentIssuesCount: 1
    },
    previous: {
      reportPath: "/beta/reports/r_previous"
    }
  }
};

const brief = buildRemediationBrief(report);
assert.equal(brief.mode, "owner_review_required");
assert.equal(brief.summary.priorityRepairs, 1);
assert.equal(brief.priorityQueue[0].title, "Missing H1 on homepage");
assert.match(brief.priorityQueue[0].acceptanceChecks.join("\n"), /Rerun the saved audit/);
assert.match(brief.support.safeHandoff, /Do not claim rankings/);
assert.equal(brief.proofHistory.fixedIssues, 2);
assert.equal(brief.proofHistory.previousReportPath, "/beta/reports/r_previous");

const repairOnlyBrief = buildRemediationBrief({
  id: "r_repair_only",
  url: "https://example.com/",
  score: 82,
  summary: { pagesScanned: 12, warnings: 0 },
  findings: [],
  repairPlan: [
    {
      title: "Rendered crawl scale plan needs staged batches",
      proof: "50K target stored as staged rendered crawl plan.",
      fix: "Process batches before claiming full rendered validation.",
      source: "rendered-crawl-scale"
    }
  ]
});
assert.equal(repairOnlyBrief.mode, "owner_review_required");
assert.equal(repairOnlyBrief.support.fixPackEligible, true);
assert.equal(repairOnlyBrief.priorityQueue[0].source, "rendered-crawl-scale");

const duplicateTitleBrief = buildRemediationBrief({
  id: "r_duplicate_titles",
  url: "https://example.com/",
  findings: [
    {
      id: "missing-meta-home",
      severity: "warning",
      title: "Missing meta description",
      pageUrl: "https://example.com/",
      evidence: "Homepage description missing."
    },
    {
      id: "missing-meta-pricing",
      severity: "warning",
      title: "Missing meta description",
      pageUrl: "https://example.com/pricing",
      evidence: "Pricing description missing."
    }
  ],
  repairPlan: [
    {
      title: "Missing meta description",
      pageUrl: "https://example.com/",
      fix: "Write a homepage meta description."
    },
    {
      title: "Missing meta description",
      pageUrl: "https://example.com/pricing",
      fix: "Write a pricing page meta description."
    }
  ]
});
assert.equal(duplicateTitleBrief.priorityQueue[0].id, "missing-meta-home");
assert.equal(duplicateTitleBrief.priorityQueue[1].id, "missing-meta-pricing");
assert.equal(duplicateTitleBrief.priorityQueue[1].pageUrl, "https://example.com/pricing");

const routeSource = readFileSync(new URL("../worker/routes/reports.js", import.meta.url), "utf8");
assert.match(routeSource, /remediation-brief\.json/);
assert.match(routeSource, /buildRemediationBrief\(report\)/);

const localServerSource = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
assert.match(localServerSource, /api\/reports\/:id\/remediation-brief\.json/);
assert.match(localServerSource, /report\.remediationBrief = buildRemediationBrief\(report\)/);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSource, /RemediationBriefPanel/);
assert.match(appSource, /Download remediation JSON/);

console.log(JSON.stringify({ ok: true, checked: "remediation brief" }, null, 2));
