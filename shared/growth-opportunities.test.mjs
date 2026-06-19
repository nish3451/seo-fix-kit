import assert from "node:assert/strict";
import test from "node:test";
import { buildGrowthOpportunities } from "./growth-opportunities.js";
import { buildWhiteLabelReportHtml } from "./white-label-report.js";

test("low-CTR keyword proof creates a draft-only page refresh brief", () => {
  const growth = buildGrowthOpportunities({
    keywordRankAudit: {
      status: "ready",
      checks: {
        lowCtrRows: [{
          query: "seo audit checklist",
          pageUrl: "https://example.com/checklist",
          pageLabel: "/checklist",
          impressions: 1200,
          ctr: 0.01,
          position: 4.8
        }],
        pageTwoRows: [],
        zeroClickRows: []
      }
    }
  });

  assert.equal(growth.status, "ready");
  const item = growth.opportunities.find((opportunity) => opportunity.id === "growth-keyword-page-refresh");
  assert.ok(item);
  assert.equal(item.draftOnly, true);
  assert.equal(item.status, "draft_only");
  assert.equal(item.type, "page_refresh");
  assert.match(item.proof, /seo audit checklist/);
  assert.match(item.draftBrief.summary, /seo audit checklist/);
});

test("competitor gap proof creates a comparison outline brief", () => {
  const growth = buildGrowthOpportunities({
    competitorBenchmark: {
      status: "ready",
      repairOpportunities: [{
        title: "Competitor gap: Content depth",
        proof: "rival.example did not show this issue. Your audit proof: 82 rendered words found.",
        pageUrl: "https://example.com/",
        pageLabel: "home"
      }]
    }
  });

  const item = growth.opportunities.find((opportunity) => opportunity.id === "growth-competitor-gap-outline");

  assert.ok(item);
  assert.equal(item.type, "comparison_outline");
  assert.equal(item.sourceKind, "competitor");
  assert.match(item.draftBrief.sections.join(" "), /buyer is comparing/i);
  assert.match(item.guardrail, /public observed proof/i);
});

test("no verified source data means no growth suggestions", () => {
  const growth = buildGrowthOpportunities({ url: "https://example.com/" });

  assert.equal(growth.status, "skipped");
  assert.equal(growth.opportunities.length, 0);
  assert.equal(growth.summary.opportunityCount, 0);
});

test("growth copy stays draft-only without autopublish or ranking promises", () => {
  const growth = buildGrowthOpportunities({
    keywordRankAudit: {
      status: "ready",
      checks: {
        lowCtrRows: [{
          query: "best seo fixes",
          pageLabel: "/seo-fixes",
          impressions: 900,
          ctr: 0.012,
          position: 6
        }],
        pageTwoRows: [{
          query: "seo repair template",
          pageLabel: "/templates",
          impressions: 400,
          clicks: 0,
          position: 14
        }],
        zeroClickRows: []
      }
    },
    aiAnswerReadiness: {
      status: "ready",
      repairOpportunities: [{
        title: "AI Answer Readiness: question-led sections are missing",
        proof: "The rendered crawl did not prove FAQ or question-style headings.",
        fix: "Add visible sections that answer common buyer questions."
      }]
    }
  });
  const copy = JSON.stringify(growth);

  assert.ok(growth.opportunities.length >= 2);
  assert.doesNotMatch(copy, /auto-?publish|publish automatically|ranking gains|guaranteed rankings|will rank|traffic guarantee/i);
  assert.match(copy, /draft_only/);
});

test("white-label report renders growth briefs with draft-only guardrails", () => {
  const growth = buildGrowthOpportunities({
    keywordRankAudit: {
      status: "ready",
      checks: {
        lowCtrRows: [{
          query: "seo audit checklist",
          pageLabel: "/checklist",
          impressions: 1200,
          ctr: 0.01,
          position: 4.8
        }],
        pageTwoRows: [],
        zeroClickRows: []
      }
    }
  });

  const html = buildWhiteLabelReportHtml({
    report: {
      url: "https://example.com/",
      score: 82,
      summary: { pagesScanned: 1 },
      growthOpportunities: growth
    },
    origin: "https://seofixkit.com",
    includeDraftBriefs: true
  });

  assert.match(html, /Draft-only growth/);
  assert.match(html, /proof-backed brief/);
  assert.match(html, /They do not publish content/);
  assert.doesNotMatch(html, /auto-?publish|publish automatically|ranking gains|guaranteed rankings|will rank|traffic guarantee/i);

  const publicHtml = buildWhiteLabelReportHtml({
    report: {
      url: "https://example.com/",
      score: 82,
      summary: { pagesScanned: 1 },
      growthOpportunities: growth
    },
    share: { id: "share-1" },
    origin: "https://seofixkit.com"
  });

  assert.doesNotMatch(publicHtml, /Draft-only growth|proof-backed brief|They do not publish content|Draft a reviewed content brief/i);
});
