import assert from "node:assert/strict";
import test from "node:test";
import { audit, recommendOffer } from "./run-live-audit-batch.mjs";

test("audit polls queued job and returns completed report", async () => {
  const calls = [];
  const report = sampleReport("report-complete-abc");
  const fetcher = async (rawUrl) => {
    const url = new URL(rawUrl);
    calls.push(url.pathname);
    if (url.pathname === "/api/audit") {
      return jsonResponse({ ok: true, mode: "queued", statusUrl: "/api/audit/jobs/job-1" }, 202);
    }
    if (url.pathname === "/api/audit/jobs/job-1") {
      return jsonResponse({ ok: true, job: { id: "job-1", status: "complete", reportId: report.id } });
    }
    if (url.pathname === `/api/reports/${report.id}`) {
      return jsonResponse(report);
    }
    return jsonResponse({ error: "not found" }, 404);
  };

  const result = await audit("https://example.com", "beta=1", {
    baseUrl: "https://seofixkit.test",
    fetcher,
    pollIntervalMs: 0,
    pollTimeoutMs: 1000
  });

  assert.equal(result.id, report.id);
  assert.deepEqual(calls, ["/api/audit", "/api/audit/jobs/job-1", `/api/reports/${report.id}`]);
});

test("audit fails queued job with returned error", async () => {
  const fetcher = async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname === "/api/audit") {
      return jsonResponse({ ok: true, mode: "queued", statusUrl: "/api/audit/jobs/job-2" }, 202);
    }
    if (url.pathname === "/api/audit/jobs/job-2") {
      return jsonResponse({ ok: true, job: { id: "job-2", status: "failed", error: "Browser render failed." } });
    }
    return jsonResponse({ error: "not found" }, 404);
  };

  await assert.rejects(
    () => audit("https://example.com", "beta=1", {
      baseUrl: "https://seofixkit.test",
      fetcher,
      pollIntervalMs: 0,
      pollTimeoutMs: 1000
    }),
    /Browser render failed/
  );
});

test("audit times out queued job that never completes", async () => {
  const fetcher = async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname === "/api/audit") {
      return jsonResponse({ ok: true, mode: "queued", statusUrl: "/api/audit/jobs/job-3" }, 202);
    }
    if (url.pathname === "/api/audit/jobs/job-3") {
      return jsonResponse({ ok: true, job: { id: "job-3", status: "running" } });
    }
    return jsonResponse({ error: "not found" }, 404);
  };

  await assert.rejects(
    () => audit("https://example.com", "beta=1", {
      baseUrl: "https://seofixkit.test",
      fetcher,
      pollIntervalMs: 1,
      pollTimeoutMs: 5
    }),
    /timed out while running/
  );
});

test("audit bounds a hung status fetch by the poll timeout", async () => {
  const fetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname === "/api/audit") {
      return jsonResponse({ ok: true, mode: "queued", statusUrl: "/api/audit/jobs/job-4" }, 202);
    }
    if (url.pathname === "/api/audit/jobs/job-4") {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }
    return jsonResponse({ error: "not found" }, 404);
  };

  await assert.rejects(
    () => audit("https://example.com", "beta=1", {
      baseUrl: "https://seofixkit.test",
      fetcher,
      auditTimeoutMs: 1000,
      pollIntervalMs: 1,
      pollTimeoutMs: 5
    }),
    /timed out after/
  );
});

test("batch recommendation does not sell Fix Pack when audits have no findings", () => {
  const recommendation = recommendOffer({
    targets: [{
      status: "audited",
      report: { findings: 0 }
    }],
    repeatedIssues: []
  });

  assert.equal(recommendation.offer, "No paid offer yet");
  assert.match(recommendation.reason, /0 actionable findings/);
  assert.match(recommendation.reason, /Do not sell a Fix Pack/);
});

test("batch recommendation sells Fix Pack only when proven findings exist", () => {
  const recommendation = recommendOffer({
    targets: [{
      status: "audited",
      report: { findings: 2 }
    }],
    repeatedIssues: [{
      issue: "meta description",
      count: 2,
      projects: ["Example"]
    }]
  });

  assert.equal(recommendation.offer, "SEO Fix Pack");
  assert.equal(recommendation.price, "Dodo checkout price");
  assert.match(recommendation.reason, /2 actionable findings/);
});

function sampleReport(id) {
  return {
    id,
    reportUrl: `https://seofixkit.test/beta/reports/${id}`,
    url: "https://example.com/",
    score: 91,
    pages: [{ url: "https://example.com/" }],
    findings: [{ severity: "medium", title: "Missing social image" }]
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
