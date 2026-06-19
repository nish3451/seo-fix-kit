import assert from "node:assert/strict";
import test from "node:test";
import { buildAiAnswerReadiness } from "./ai-answer-readiness.js";
import { deriveRepairQueueItems } from "./repair-queue.js";

test("low rendered content creates answer-readiness findings and queue items", () => {
  const audit = buildAiAnswerReadiness(thinAppShellReport());

  assert.equal(audit.status, "ready");
  assert.ok(audit.findings.some((finding) => finding.id === "ai-answer-readiness-content-depth"));
  assert.ok(audit.repairOpportunities.some((item) => item.issueId === "ai-answer-readiness-content-depth"));

  const report = {
    ...thinAppShellReport(),
    findings: audit.findings,
    repairPlan: audit.repairOpportunities
  };
  const items = deriveRepairQueueItems(report);
  const contentItem = items.find((item) => item.issueId === "ai-answer-readiness-content-depth");

  assert.ok(contentItem);
  assert.equal(contentItem.sourceKind, "finding");
  assert.match(contentItem.acceptance, /250 rendered words/);
});

test("valid rendered content, schema, canonical, links, and llms.txt avoids repair false positives", () => {
  const audit = buildAiAnswerReadiness(validAnswerReadyReport());

  assert.equal(audit.status, "ready");
  assert.equal(audit.repairOpportunities.length, 0);
  assert.equal(audit.findings.length, 0);
  assert.equal(audit.summary.llmsTxtStatus, "reachable");
});

test("missing llms.txt is advisory and does not claim ranking or citation failure", () => {
  const report = {
    ...validAnswerReadyReport(),
    llmsTxt: { ok: false, status: 404, url: "https://example.com/llms.txt", body: "" }
  };
  const audit = buildAiAnswerReadiness(report);
  const llmsItem = audit.repairOpportunities.find((item) => item.issueId === "ai-answer-readiness-llms-txt");

  assert.ok(llmsItem);
  assert.equal(llmsItem.severity, "notice");
  assert.match(llmsItem.proof, /advisory only/);
  assert.match(llmsItem.proof, /not a ranking, visibility, or citation failure/i);
  assert.doesNotMatch(`${llmsItem.title} ${llmsItem.fix}`, /AI visibility tracking|citation monitoring/i);
});

test("failed pages do not create content-readiness repair opportunities", () => {
  const failedPage = thinAppShellReport().pages[0];
  const report = {
    ...thinAppShellReport(),
    llmsTxt: {
      ok: true,
      status: 200,
      url: "https://example.com/llms.txt",
      body: "# Example"
    },
    pages: [
      {
        ...failedPage,
        ok: false,
        status: 500,
        rendered: {
          ...failedPage.rendered,
          ok: false,
          status: 500,
          wordCount: 0,
          bodyText: ""
        }
      },
      {
        ...failedPage,
        url: "https://example.com/status-only-500",
        finalUrl: "https://example.com/status-only-500",
        status: 500,
        rendered: {
          ...failedPage.rendered,
          finalUrl: "https://example.com/status-only-500",
          status: 500,
          wordCount: 0,
          bodyText: ""
        }
      }
    ]
  };

  const audit = buildAiAnswerReadiness(report);
  const issueIds = audit.repairOpportunities.map((item) => item.issueId);

  assert.equal(audit.status, "ready");
  assert.equal(audit.summary.lowContentPages, 0);
  assert.equal(audit.summary.appShellPages, 0);
  assert.equal(audit.summary.pagesWithEnoughText, 0);
  assert.equal(issueIds.includes("ai-answer-readiness-content-depth"), false);
  assert.equal(issueIds.includes("ai-answer-readiness-structured-data"), false);
  assert.equal(issueIds.includes("ai-answer-readiness-source-clarity"), false);
  assert.equal(issueIds.includes("ai-answer-readiness-answer-structure"), false);
  assert.deepEqual(issueIds, []);
});

function thinAppShellReport() {
  return {
    url: "https://example.com/",
    llmsTxt: { ok: false, status: 404, url: "https://example.com/llms.txt", body: "" },
    crawlInventory: {
      status: "empty",
      summary: { sitemapsFetched: 1, urlsDiscovered: 0 }
    },
    pages: [{
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      static: {
        title: "Example",
        wordCount: 12,
        h1s: [],
        internalLinks: [],
        schemaTypes: []
      },
      rendered: {
        finalUrl: "https://example.com/",
        title: "Example",
        description: "A short JavaScript app shell.",
        h1s: ["Example"],
        headings: [{ level: "h1", text: "Example" }],
        wordCount: 42,
        bodyText: "Example app shell with too little visible page-specific detail.",
        canonical: "",
        robots: "",
        internalLinks: [],
        schemaTypes: []
      }
    }]
  };
}

function validAnswerReadyReport() {
  const bodyText = [
    "SEO Fix Kit helps teams find proven SEO repairs from rendered browser proof.",
    "What does the audit prove? It compares rendered text, headings, schema, canonical tags, internal links, and sitemap context.",
    "How should teams use it? Teams review the repair queue, approve draft fixes, and rerun the audit after changes.",
    "The report includes examples, acceptance checks, visible proof, package limits, support routes, and clear next steps for a buyer.",
    "This page gives enough concrete context for a crawler or assistant to summarize the offer without relying on hidden JavaScript state.",
    "It also names what the product does not do: no ranking guarantee, no hidden CMS writes, and no live AI citation monitoring."
  ].join(" ");
  return {
    url: "https://example.com/",
    llmsTxt: {
      ok: true,
      status: 200,
      url: "https://example.com/llms.txt",
      body: "# Example\n\nUseful product context."
    },
    crawlInventory: {
      status: "ready",
      summary: { sitemapsFetched: 1, urlsDiscovered: 4 }
    },
    pages: [{
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      static: {
        title: "SEO Fix Kit",
        wordCount: 80,
        h1s: ["SEO Fix Kit"],
        internalLinks: [{ href: "https://example.com/methodology", text: "Methodology" }],
        schemaTypes: ["Organization", "FAQPage"]
      },
      rendered: {
        finalUrl: "https://example.com/",
        title: "SEO Fix Kit - Proof-backed SEO repair",
        description: "Find proven SEO repairs, approve safe drafts, and rerun after fixes.",
        h1s: ["SEO Fix Kit"],
        headings: [
          { level: "h1", text: "SEO Fix Kit" },
          { level: "h2", text: "What does the audit prove?" },
          { level: "h2", text: "How should teams use it?" },
          { level: "h2", text: "What is not included?" }
        ],
        wordCount: 280,
        bodyText,
        canonical: "https://example.com/",
        robots: "",
        internalLinks: [
          { href: "https://example.com/methodology", text: "Methodology" },
          { href: "https://example.com/packages", text: "Packages" }
        ],
        schemaTypes: ["Organization", "FAQPage", "BreadcrumbList"]
      }
    }]
  };
}
