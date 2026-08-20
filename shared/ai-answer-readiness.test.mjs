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

test("without imported Search Console rows, readiness faults stay in proof order", () => {
  const audit = buildAiAnswerReadiness(trafficRankFixtureReport());
  const issueIds = audit.repairOpportunities.map((item) => item.issueId);

  assert.equal(audit.summary.trafficRanked, false);
  assert.equal(audit.summary.prioritization, "proof-order");
  assert.deepEqual(issueIds, [
    "ai-answer-readiness-content-depth",
    "ai-answer-readiness-source-clarity",
    "ai-answer-readiness-llms-txt"
  ]);
  assert.equal(audit.repairOpportunities[0].pageUrl, "https://example.com/");
  assert.doesNotMatch(audit.repairOpportunities[0].proof, /Imported Search Console rows/);
});

test("imported Search Console rows rank readiness faults by traffic on affected pages", () => {
  const audit = buildAiAnswerReadiness(trafficRankFixtureReport(), {
    keywordRows: [
      { query: "example pricing", pageUrl: "https://www.example.com/pricing", clicks: 900, impressions: 12000 },
      { query: "example home", pageUrl: "https://example.com/", clicks: 10, impressions: 400 }
    ]
  });
  const issueIds = audit.repairOpportunities.map((item) => item.issueId);
  const sourceItem = audit.repairOpportunities.find((item) => item.issueId === "ai-answer-readiness-source-clarity");
  const contentItem = audit.repairOpportunities.find((item) => item.issueId === "ai-answer-readiness-content-depth");
  const llmsItem = audit.repairOpportunities.find((item) => item.issueId === "ai-answer-readiness-llms-txt");

  assert.equal(audit.summary.trafficRanked, true);
  assert.equal(audit.summary.prioritization, "imported-search-console-traffic");
  assert.equal(audit.summary.trafficRowsUsed, 2);
  assert.deepEqual(issueIds, [
    "ai-answer-readiness-source-clarity",
    "ai-answer-readiness-content-depth",
    "ai-answer-readiness-llms-txt"
  ]);
  assert.equal(sourceItem.priority, 1);
  assert.equal(sourceItem.pageUrl, "https://example.com/pricing");
  assert.equal(sourceItem.trafficClicks, 900);
  assert.match(sourceItem.proof, /900 clicks and 12,000 impressions/);
  assert.equal(contentItem.priority, 2);
  assert.equal(contentItem.trafficClicks, 10);
  assert.equal(llmsItem.priority, 3);
  assert.equal(llmsItem.trafficClicks, 0);
  assert.match(llmsItem.proof, /No imported Search Console rows matched these pages/);
  assert.doesNotMatch(JSON.stringify(audit), /citation monitoring is live/i);
});

test("the highest-traffic thin page leads the content-depth repair", () => {
  const report = thinAppShellReport();
  report.pages = [
    report.pages[0],
    {
      ...report.pages[0],
      url: "https://example.com/guides",
      finalUrl: "https://example.com/guides",
      rendered: {
        ...report.pages[0].rendered,
        finalUrl: "https://example.com/guides",
        canonical: "https://example.com/guides",
        internalLinks: [{ href: "https://example.com/", text: "Home" }]
      }
    }
  ];
  const audit = buildAiAnswerReadiness(report, {
    keywordRows: [
      { query: "guides", pageUrl: "https://example.com/guides", clicks: 400, impressions: 8000 },
      { query: "home", pageUrl: "https://example.com/", clicks: 5, impressions: 90 }
    ]
  });
  const contentItem = audit.repairOpportunities.find((item) => item.issueId === "ai-answer-readiness-content-depth");

  assert.equal(contentItem.pageUrl, "https://example.com/guides");
  assert.equal(contentItem.pageLabel, "/guides");
  assert.match(contentItem.proof, /led by \/guides/);
  assert.equal(contentItem.trafficClicks, 405);
});

test("imported http:// rows match pages whose rendered evidence is https:// after a redirect", () => {
  const audit = buildAiAnswerReadiness(trafficRankFixtureReport(), {
    keywordRows: [
      { query: "example pricing", pageUrl: "http://www.example.com/pricing", clicks: 900, impressions: 12000 }
    ]
  });
  const sourceItem = audit.repairOpportunities.find((item) => item.issueId === "ai-answer-readiness-source-clarity");

  assert.equal(audit.summary.trafficRanked, true);
  assert.equal(sourceItem.priority, 1);
  assert.equal(sourceItem.pageUrl, "https://example.com/pricing");
  assert.equal(sourceItem.trafficClicks, 900);
  assert.match(sourceItem.proof, /900 clicks/);
});

test("complete imported rows win over capped keywordRankAudit rows for readiness prioritization", () => {
  const report = trafficRankFixtureReport();
  report.keywordRankAudit = {
    rows: [{ query: "truncated", pageUrl: "https://example.com/pricing", clicks: 1, impressions: 2 }]
  };
  const completeRows = Array.from({ length: 300 }, (_, i) => ({
    query: `kw ${i}`,
    pageUrl: i === 0 ? "https://example.com/pricing" : `https://example.com/unrelated-${i}`,
    clicks: i === 0 ? 900 : 1,
    impressions: i === 0 ? 12000 : 2
  }));
  const audit = buildAiAnswerReadiness(report, { keywordRows: completeRows });
  const sourceItem = audit.repairOpportunities.find((item) => item.issueId === "ai-answer-readiness-source-clarity");

  assert.equal(audit.summary.trafficRanked, true);
  assert.equal(audit.summary.trafficRowsUsed, 300);
  assert.equal(sourceItem.trafficClicks, 900);
  assert.match(sourceItem.proof, /900 clicks and 12,000 impressions/);
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

function trafficRankFixtureReport() {
  const pricingBody = [
    "Pricing for SEO Fix Kit is public on the packages page and stays diagnostic.",
    "What does the paid Fix Pack include? One proof-backed repair pass plus one rerun after fixes.",
    "How should teams compare plans? Start with the anonymous one-page check, then request private access for a saved report.",
    "This pricing page names the live $99 one-time Fix Pack, config-gated monitoring, and the Repair Sprint path without ranking promises.",
    "It also explains what is not sold: completed 50,000-page rendered validation, live AI citation monitoring, and guaranteed traffic."
  ].join(" ");
  return {
    url: "https://example.com/",
    llmsTxt: { ok: false, status: 404, url: "https://example.com/llms.txt", body: "" },
    crawlInventory: {
      status: "empty",
      summary: { sitemapsFetched: 1, urlsDiscovered: 0 }
    },
    pages: [
      {
        url: "https://example.com/",
        finalUrl: "https://example.com/",
        static: {
          title: "Example",
          wordCount: 12,
          h1s: ["Example"],
          internalLinks: [{ href: "https://example.com/pricing", text: "Pricing" }],
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
          canonical: "https://example.com/",
          robots: "",
          internalLinks: [{ href: "https://example.com/pricing", text: "Pricing" }],
          schemaTypes: ["Organization"]
        }
      },
      {
        url: "https://example.com/pricing",
        finalUrl: "https://example.com/pricing",
        static: {
          title: "Pricing",
          wordCount: 80,
          h1s: ["Pricing"],
          internalLinks: [],
          schemaTypes: []
        },
        rendered: {
          finalUrl: "https://example.com/pricing",
          title: "Pricing",
          description: "Public pricing for proof-backed SEO repair.",
          h1s: ["Pricing"],
          headings: [
            { level: "h1", text: "Pricing" },
            { level: "h2", text: "What does the paid Fix Pack include?" },
            { level: "h2", text: "How should teams compare plans?" }
          ],
          wordCount: 280,
          bodyText: pricingBody,
          canonical: "",
          robots: "",
          internalLinks: [],
          schemaTypes: ["Offer"]
        }
      }
    ]
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
