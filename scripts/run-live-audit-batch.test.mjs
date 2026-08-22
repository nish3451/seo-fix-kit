import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  audit,
  betaCookieFromResponse,
  createAdminBetaSession,
  proveFixPackForReport,
  readFounderPassword,
  recommendOffer
} from "./run-live-audit-batch.mjs";

test("founder password prefers SEOFIXKIT_FOUNDER_PASSWORD over other sources", async () => {
  await withEnv({ SEOFIXKIT_FOUNDER_PASSWORD: "  env-password  ", BETA_ACCESS_PASSWORD: "beta-password" }, async () => {
    assert.equal(await readFounderPassword(), "env-password");
  });
});

test("founder password falls back to BETA_ACCESS_PASSWORD", async () => {
  await withEnv({ BETA_ACCESS_PASSWORD: "beta-password" }, async () => {
    assert.equal(await readFounderPassword(), "beta-password");
  });
});

test("founder password reads a trimmed value from SEOFIXKIT_FOUNDER_PASSWORD_FILE", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sfk-founder-pw-"));
  const passwordFile = path.join(dir, "founder-password");
  await writeFile(passwordFile, "file-password\n");
  try {
    await withEnv({ SEOFIXKIT_FOUNDER_PASSWORD_FILE: passwordFile }, async () => {
      assert.equal(await readFounderPassword(), "file-password");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("founder password fails loud when the configured password file is unreadable", async () => {
  const missingFile = path.join(tmpdir(), `sfk-missing-${Date.now()}`, "founder-password");
  await withEnv({ SEOFIXKIT_FOUNDER_PASSWORD_FILE: missingFile }, async () => {
    await assert.rejects(
      () => readFounderPassword(),
      (error) => {
        assert.match(error.message, /SEOFIXKIT_FOUNDER_PASSWORD_FILE/);
        assert.match(error.message, new RegExp(missingFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        return true;
      }
    );
  });
});

function withEnv(overrides, run) {
  const saved = Object.fromEntries(
    ["SEOFIXKIT_FOUNDER_PASSWORD", "BETA_ACCESS_PASSWORD", "SEOFIXKIT_FOUNDER_PASSWORD_FILE"].map(
      (name) => [name, process.env[name]]
    )
  );
  for (const [name, value] of Object.entries(overrides)) {
    process.env[name] = value;
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });
}

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

test("Fix Pack proof skips reports with no actionable findings", async () => {
  const calls = [];
  const result = await proveFixPackForReport({
    ...sampleReport("clean-report"),
    findings: [{ severity: "good", title: "False positive guarded" }]
  }, "beta=1", {
    baseUrl: "https://seofixkit.test",
    fetcher: async (url) => {
      calls.push(String(url));
      return jsonResponse({ error: "should not call" }, 500);
    }
  });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /No actionable findings/);
  assert.deepEqual(calls, []);
});

test("Fix Pack proof stores checkout boundary without raw checkout URL", async () => {
  const calls = [];
  const result = await proveFixPackForReport(sampleReport("finding-report"), "beta=1", {
    baseUrl: "https://seofixkit.test",
    fetcher: async (rawUrl, options = {}) => {
      const url = new URL(rawUrl);
      calls.push({
        pathname: url.pathname,
        cookie: options.headers?.cookie || "",
        body: JSON.parse(options.body || "{}")
      });
      if (url.pathname === "/api/beta/fix-request") {
        return jsonResponse({
          ok: true,
          mode: "checkout",
          checkoutUrl: "https://checkout.dodopayments.example/pay/private-token",
          request: {
            id: "fix_123",
            status: "checkout_created",
            checkoutSessionId: "checkout_session_private",
            checkoutCreatedAt: "2026-06-20T00:00:00.000Z",
            repairProposalSummary: { status: "skipped", total: 0 }
          },
          selectedRepair: {
            id: "issue_social_image",
            title: "Social share image incomplete on home",
            severity: "warning"
          }
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    }
  });

  assert.deepEqual(calls, [{
    pathname: "/api/beta/fix-request",
    cookie: "beta=1",
    body: { reportId: "finding-report" }
  }]);
  assert.equal(result.ok, true);
  assert.equal(result.status, "checkout");
  assert.equal(result.checkoutUrlPresent, true);
  assert.equal(result.checkoutHost, "checkout.dodopayments.example");
  assert.equal(result.request.id, "fix_123");
  assert.equal(result.request.checkoutSessionIdPresent, true);
  assert.equal(result.selectedRepair.title, "Social share image incomplete on home");
  assert.doesNotMatch(JSON.stringify(result), /private-token|checkout_session_private|https:\/\/checkout/);
});

test("admin proof session helper returns only the beta cookie", async () => {
  const calls = [];
  const cookie = await createAdminBetaSession("proof@example.com", "admin-secret", {
    baseUrl: "https://seofixkit.test",
    fetcher: async (rawUrl, options = {}) => {
      const url = new URL(rawUrl);
      calls.push({
        pathname: url.pathname,
        authorization: options.headers?.authorization || "",
        body: JSON.parse(options.body || "{}")
      });
      return new Response(JSON.stringify({
        ok: true,
        ownerEmail: "proof@example.com",
        accessMode: "founder-override",
        token: "must-not-be-used"
      }), {
        headers: {
          "content-type": "application/json",
          "set-cookie": "sfk_beta_session=proof-cookie; Path=/; HttpOnly; Secure"
        }
      });
    }
  });

  assert.equal(cookie, "sfk_beta_session=proof-cookie");
  assert.deepEqual(calls, [{
    pathname: "/admin/beta-session",
    authorization: "Bearer admin-secret",
    body: { ownerEmail: "proof@example.com" }
  }]);
});

test("admin proof session helper fails closed without beta cookie", async () => {
  await assert.rejects(
    () => createAdminBetaSession("proof@example.com", "admin-secret", {
      baseUrl: "https://seofixkit.test",
      fetcher: async () => jsonResponse({
        ok: true,
        ownerEmail: "proof@example.com",
        accessMode: "founder-override"
      })
    }),
    /did not return a beta session cookie/
  );
});

test("beta cookie parser ignores adjacent non-beta cookies", () => {
  const response = new Response("ok", {
    headers: {
      "set-cookie": "other=value; Path=/, sfk_beta_session=proof-cookie; Path=/; HttpOnly"
    }
  });

  assert.equal(betaCookieFromResponse(response), "sfk_beta_session=proof-cookie");
});

test("Fix Pack webhook drill runs only through a sanitized test checkout proof", async () => {
  const calls = [];
  const result = await proveFixPackForReport(sampleReport("finding-report"), "beta=1", {
    baseUrl: "https://seofixkit.test",
    ownerEmail: "owner@example.com",
    testMode: true,
    webhookDrill: true,
    webhookSecret: "test_webhook_secret",
    dodoConfig: {
      productId: "pdt_fix_pack",
      brandId: "brand-1"
    },
    fetcher: async (rawUrl, options = {}) => {
      const url = new URL(rawUrl);
      const body = JSON.parse(options.body || "{}");
      calls.push({
        pathname: url.pathname,
        body,
        headers: Object.fromEntries(Object.entries(options.headers || {}).filter(([key]) =>
          ["webhook-id", "webhook-timestamp", "webhook-signature"].includes(key)
        ))
      });
      if (url.pathname === "/api/beta/fix-request" && body.testMode) {
        const paid = calls.filter((call) => call.pathname === "/api/webhooks/dodo").length > 0;
        return jsonResponse({
          ok: true,
          mode: paid ? "paid" : "checkout",
          checkoutUrl: "https://checkout.dodopayments.example/pay/private-test-token",
          request: {
            id: "fix_test_123",
            status: paid ? "paid" : "checkout_created",
            isTest: true,
            checkoutSessionId: "checkout_session_private_test",
            checkoutCreatedAt: "2026-06-20T00:00:00.000Z",
            repairProposalSummary: paid
              ? { status: "ready", total: 2, created: 2, executable: 2 }
              : { status: "skipped", total: 0 }
          },
          selectedRepair: {
            queueItemId: "queue-123",
            issueId: "issue-123",
            title: "Missing title",
            severity: "critical",
            status: "approved"
          }
        });
      }
      if (url.pathname === "/api/webhooks/dodo") {
        assert.equal(body.type, "payment.succeeded");
        assert.equal(body.data.metadata.seofixkit_webhook_drill, "1");
        assert.equal(body.data.metadata.fix_request_id, "fix_test_123");
        assert.equal(body.data.customer.email, "owner@example.com");
        assert.equal(body.data.metadata.repair_queue_item_id, "queue-123");
        assert.equal(body.data.metadata.repair_issue_id, "issue-123");
        assert.equal(options.headers["webhook-id"].startsWith("evt_sfk_drill_"), true);
        assert.match(options.headers["webhook-signature"], /^v1,/);
        return jsonResponse({
          received: true,
          status: "processed",
          paid: true,
          fixRequestId: "fix_test_123"
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    }
  });

  assert.equal(result.status, "checkout");
  assert.equal(result.request.id, "fix_test_123");
  assert.equal(result.request.checkoutSessionIdPresent, true);
  assert.equal(result.webhookDrill.status, "processed");
  assert.equal(result.webhookDrill.paid, true);
  assert.equal(result.webhookDrill.afterWebhook.request.status, "paid");
  assert.deepEqual(result.webhookDrill.afterWebhook.request.proposalSummary, {
    status: "ready",
    total: 2,
    created: 2,
    executable: 2
  });
  assert.deepEqual(calls.map((call) => call.pathname), [
    "/api/beta/fix-request",
    "/api/webhooks/dodo",
    "/api/beta/fix-request"
  ]);
  assert.deepEqual(calls[0].body, { reportId: "finding-report", testMode: true });
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-test-token|checkout_session_private_test|test_webhook_secret|webhook-signature|https:\/\/checkout/
  );
});

test("Fix Pack webhook drill skips non-test checkout proof", async () => {
  const calls = [];
  const result = await proveFixPackForReport(sampleReport("finding-report"), "beta=1", {
    baseUrl: "https://seofixkit.test",
    webhookDrill: true,
    webhookSecret: "test_webhook_secret",
    dodoConfig: {
      productId: "pdt_fix_pack",
      brandId: "brand-1"
    },
    fetcher: async (rawUrl, options = {}) => {
      const url = new URL(rawUrl);
      calls.push(url.pathname);
      if (url.pathname === "/api/beta/fix-request") {
        return jsonResponse({
          ok: true,
          mode: "checkout",
          checkoutUrl: "https://checkout.dodopayments.example/pay/private-real-token",
          request: {
            id: "fix_real_123",
            status: "checkout_created",
            isTest: false,
            checkoutSessionId: "checkout_session_private_real",
            checkoutCreatedAt: "2026-06-20T00:00:00.000Z"
          },
          selectedRepair: {
            queueItemId: "queue-123",
            issueId: "issue-123",
            title: "Missing title",
            severity: "critical",
            status: "approved"
          }
        });
      }
      return jsonResponse({ error: "should not call webhook" }, 500);
    }
  });

  assert.equal(result.webhookDrill.status, "skipped");
  assert.match(result.webhookDrill.reason, /test-mode/);
  assert.deepEqual(calls, ["/api/beta/fix-request"]);
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
