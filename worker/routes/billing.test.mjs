import assert from "node:assert/strict";
import test from "node:test";
import {
  processDodoPaymentWebhook,
  requestFixPack
} from "./billing.js";
import { extractDodoPayment } from "../../shared/dodo.js";
import { sha256Hex } from "../lib/security.js";

test("Fix Pack checkout carries selected repair metadata to Dodo", async () => {
  const env = await fakeBillingEnv();
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/session-1",
      session_id: "dodo-session-1"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1",
        note: "Please repair this title first."
      })
    }), env);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, "checkout");
    assert.equal(body.checkoutUrl, "https://checkout.example.com/session-1");
    assert.equal(body.selectedRepair.queueItemId, "queue-1");
    assert.equal(body.selectedRepair.issueId, "issue-1");
    assert.equal(body.selectedRepair.title, "Missing title");
    assert.equal(body.selectedRepair.status, "approved");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 1);
  assert.equal(dodoRequests[0].url, "https://test.dodopayments.com/checkouts");
  assert.equal(dodoRequests[0].body.metadata.fix_request_id, env.fixRequests[0].id);
  assert.equal(dodoRequests[0].body.metadata.report_id, env.reportId);
  assert.equal(dodoRequests[0].body.metadata.repair_issue_id, "issue-1");
  assert.equal(dodoRequests[0].body.metadata.repair_queue_item_id, "queue-1");
  assert.equal(dodoRequests[0].body.metadata.repair_title, "Missing title");
  assert.equal(dodoRequests[0].body.metadata.repair_status, "approved");

  assert.equal(env.events.length, 1);
  assert.equal(env.events[0].event, "created");
  const eventDetail = JSON.parse(env.events[0].detail_json);
  assert.equal(eventDetail.selectedRepair.queueItemId, "queue-1");
  assert.equal(eventDetail.selectedRepair.issueId, "issue-1");
});

test("Fix Pack checkout rejects requested closed repairs instead of silently switching targets", async () => {
  const env = await fakeBillingEnv();
  env.queueItems[0].status = "fixed";
  env.queueItems.push({
    ...env.queueItems[0],
    id: "queue-2",
    issue_id: "issue-2",
    title: "Missing meta description",
    status: "open"
  });
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/session-closed-request",
      session_id: "dodo-session-closed-request"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1"
      })
    }), env);

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.code, "FIX_PACK_REPAIR_SELECTION_UNAVAILABLE");
    assert.equal(body.checkoutAvailable, false);
    assert.equal(body.selectedRepair, null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 0);
  assert.equal(env.fixRequests.length, 0);
  assert.equal(env.events.length, 0);
});

test("Fix Pack checkout rejects mismatched explicit repair identifiers", async () => {
  const env = await fakeBillingEnv();
  env.queueItems.push({
    ...env.queueItems[0],
    id: "queue-2",
    issue_id: "issue-2",
    title: "Missing meta description",
    status: "open"
  });
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/session-mismatched-repair",
      session_id: "dodo-session-mismatched-repair"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        selectedRepair: {
          queueItemId: "queue-1",
          issueId: "issue-2"
        }
      })
    }), env);

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.code, "FIX_PACK_REPAIR_SELECTION_UNAVAILABLE");
    assert.equal(body.checkoutAvailable, false);
    assert.equal(body.selectedRepair, null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 0);
  assert.equal(env.fixRequests.length, 0);
  assert.equal(env.events.length, 0);
});

test("Fix Pack checkout has no selected repair when every repair is closed", async () => {
  const env = await fakeBillingEnv();
  env.queueItems[0].status = "ignored";
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/session-no-active-repair",
      session_id: "dodo-session-no-active-repair"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1"
      })
    }), env);

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.checkoutAvailable, false);
    assert.equal(body.selectedRepair, null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 0);
  assert.equal(env.fixRequests.length, 0);
  assert.equal(env.events.length, 0);
});

test("Fix Pack checkout returns an existing paid request after its repair closes", async () => {
  const env = await fakeBillingEnv();
  env.queueItems[0].status = "fixed";
  env.repairTablesMissing = true;
  env.fixRequests.push({
    id: "fix-request-paid",
    report_id: env.reportId,
    owner_email: "owner@example.com",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 81,
    issue_count: 1,
    status: "paid",
    note: "",
    is_test: 0,
    checkout_session_id: "dodo-session-paid",
    checkout_url: "https://checkout.example.com/session-paid",
    checkout_created_at: new Date().toISOString(),
    checkout_repair_json: JSON.stringify({
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    }),
    product_id: "pdt_fix_pack",
    payment_id: "payment-paid",
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/unexpected",
      session_id: "dodo-session-unexpected"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1"
      })
    }), env);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, "paid");
    assert.equal(body.request.status, "paid");
    assert.equal(body.request.id, "fix-request-paid");
    assert.equal(body.selectedRepair, null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 0);
  assert.equal(env.fixRequests.length, 1);
});

test("Fix Pack checkout blocks rebuy after refund or dispute statuses", async () => {
  for (const status of ["refunded", "refund_failed", "disputed"]) {
    const env = await fakeBillingEnv();
    env.fixRequests.push({
      id: `fix-request-${status}`,
      report_id: env.reportId,
      owner_email: "owner@example.com",
      target_url: "https://example.com/",
      target_host: "example.com",
      score: 81,
      issue_count: 1,
      status,
      note: "",
      is_test: 0,
      checkout_session_id: `dodo-session-${status}`,
      checkout_url: `https://checkout.example.com/session-${status}`,
      checkout_created_at: new Date().toISOString(),
      checkout_repair_json: JSON.stringify({
        queueItemId: "queue-1",
        issueId: "issue-1",
        status: "approved"
      }),
      product_id: "pdt_fix_pack",
      payment_id: `payment-${status}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const dodoRequests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
      return new Response(JSON.stringify({
        checkout_url: "https://checkout.example.com/unexpected-rebuy",
        session_id: "dodo-session-unexpected-rebuy"
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    try {
      const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-beta-session": env.sessionToken
        },
        body: JSON.stringify({
          reportId: env.reportId,
          queueItemId: "queue-1"
        })
      }), env);

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.mode, status);
      assert.equal(body.checkoutAvailable, false);
      assert.equal(body.selectedRepair, null);
      assert.equal(body.request.status, status);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(dodoRequests.length, 0);
    assert.equal(env.fixRequests.length, 1);
  }
});

test("Fix Pack checkout materializes repair queue before Dodo metadata", async () => {
  const env = await fakeBillingEnv();
  env.queueItems = [];
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/materialized-repair",
      session_id: "dodo-session-materialized-repair"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        issueId: "issue-1"
      })
    }), env);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.selectedRepair.issueId, "issue-1");
    assert.ok(body.selectedRepair.queueItemId);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(env.queueItems.length, 1);
  assert.equal(env.queueItems[0].issue_id, "issue-1");
  assert.ok(env.queueItems[0].id);
  assert.equal(dodoRequests.length, 1);
  assert.equal(dodoRequests[0].body.metadata.repair_issue_id, "issue-1");
  assert.equal(dodoRequests[0].body.metadata.repair_queue_item_id, env.queueItems[0].id);
  assert.equal(JSON.parse(env.fixRequests[0].checkout_repair_json).queueItemId, env.queueItems[0].id);
});

test("Fix Pack checkout returns migration error when repair queue tables are unavailable", async () => {
  const env = await fakeBillingEnv();
  env.repairTablesMissing = true;
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/unexpected-repair-table-skew",
      session_id: "dodo-session-unexpected-repair-table-skew"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        issueId: "issue-1"
      })
    }), env);

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "REPAIR_QUEUE_MIGRATION_MISSING");
    assert.equal(body.checkoutAvailable, false);
    assert.equal(body.selectedRepair, null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 0);
  assert.equal(env.fixRequests.length, 0);
  assert.equal(env.events.length, 0);
});

test("Fix Pack checkout preflights checkout repair metadata column before Dodo", async () => {
  const env = await fakeBillingEnv();
  env.missingCheckoutRepairColumn = true;
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/unexpected-checkout-schema-skew",
      session_id: "dodo-session-unexpected-checkout-schema-skew"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1"
      })
    }), env);

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "FIX_PACK_CHECKOUT_SCHEMA_MISSING");
    assert.equal(body.checkoutAvailable, false);
    assert.equal(body.selectedRepair.queueItemId, "queue-1");
    assert.equal(body.request.status, "new");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 0);
  assert.equal(env.fixRequests.length, 1);
  assert.equal(env.events.length, 1);
});

test("Fix Pack checkout refreshes cached checkout when selected repair closes", async () => {
  const env = await fakeBillingEnv();
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const session = `dodo-session-refresh-${dodoRequests.length + 1}`;
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}"), session });
    return new Response(JSON.stringify({
      checkout_url: `https://checkout.example.com/${session}`,
      session_id: session
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const first = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1"
      })
    }), env);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.checkoutUrl, "https://checkout.example.com/dodo-session-refresh-1");
    assert.equal(firstBody.selectedRepair.queueItemId, "queue-1");
    assert.equal(env.fixRequests[0].checkout_session_id, "dodo-session-refresh-1");
    assert.deepEqual(JSON.parse(env.fixRequests[0].checkout_repair_json), {
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    });

    env.queueItems[0].status = "fixed";
    env.queueItems.push({
      ...env.queueItems[0],
      id: "queue-2",
      issue_id: "issue-2",
      title: "Missing meta description",
      status: "open"
    });

    const second = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId
      })
    }), env);
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.checkoutUrl, "https://checkout.example.com/dodo-session-refresh-2");
    assert.equal(secondBody.selectedRepair.queueItemId, "queue-2");
    assert.equal(env.fixRequests[0].checkout_session_id, "dodo-session-refresh-2");
    assert.deepEqual(JSON.parse(env.fixRequests[0].checkout_repair_json), {
      queueItemId: "queue-2",
      issueId: "issue-2",
      status: "open"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 2);
  assert.equal(dodoRequests[0].body.metadata.repair_queue_item_id, "queue-1");
  assert.equal(dodoRequests[1].body.metadata.repair_queue_item_id, "queue-2");

  const stalePayment = extractDodoPayment({
    id: "payment-stale",
    checkout_session_id: "dodo-session-refresh-1",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "owner@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: env.fixRequests[0].id,
      report_id: env.reportId,
      repair_issue_id: "issue-1",
      repair_queue_item_id: "queue-1",
      repair_title: "Missing title"
    }
  });
  const staleResult = await processDodoPaymentWebhook(env, "payment.succeeded", stalePayment, "wh_stale_checkout");
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.reason, "repair_target_mismatch");
});

test("Fix Pack checkout reuses cached checkout when selected repair is unchanged", async () => {
  const env = await fakeBillingEnv();
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/cached-repair-target",
      session_id: "dodo-session-cached-repair-target"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const first = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1"
      })
    }), env);
    assert.equal(first.status, 200);

    const second = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1"
      })
    }), env);
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.checkoutUrl, "https://checkout.example.com/cached-repair-target");
    assert.equal(secondBody.selectedRepair.queueItemId, "queue-1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 1);
  assert.equal(env.fixRequests[0].checkout_session_id, "dodo-session-cached-repair-target");
});

test("Dodo payment from an older matching checkout is recorded for follow-up", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push({
    id: "fix-request-1",
    report_id: env.reportId,
    owner_email: "owner@example.com",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 81,
    issue_count: 1,
    status: "checkout_created",
    note: "",
    is_test: 0,
    checkout_session_id: "dodo-session-old",
    checkout_url: "https://checkout.example.com/session-old",
    checkout_created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    checkout_repair_json: JSON.stringify({
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    }),
    product_id: "pdt_fix_pack",
    payment_id: "",
    paid_at: "",
    created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    checkout_url: "https://checkout.example.com/session-new",
    session_id: "dodo-session-new"
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

  try {
    const refreshed = await requestFixPack(new Request("https://seofixkit.test/api/beta/fix-request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({
        reportId: env.reportId,
        queueItemId: "queue-1"
      })
    }), env);
    assert.equal(refreshed.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(env.fixRequests[0].checkout_session_id, "dodo-session-new");

  const payment = extractDodoPayment({
    id: "payment-old-session",
    checkout_session_id: "dodo-session-old",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "owner@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: "fix-request-1",
      report_id: env.reportId,
      repair_issue_id: "issue-1",
      repair_queue_item_id: "queue-1",
      repair_title: "Missing title"
    }
  });

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_old_checkout");

  assert.equal(result.ok, true);
  assert.equal(result.status, "processed");
  assert.equal(env.fixRequests[0].status, "paid");
  assert.equal(env.fixRequests[0].payment_id, "payment-old-session");
  assert.equal(env.fixRequests[0].status_reason, "checkout_session_superseded");
  const paymentEvent = env.events.find((event) => event.event === "payment_succeeded");
  assert.ok(paymentEvent);
  const detail = JSON.parse(paymentEvent.detail_json);
  assert.equal(detail.checkoutSessionId, "dodo-session-old");
  assert.equal(detail.checkoutSessionState, "superseded");
});

test("Dodo payment with matching checkout session but wrong repair target is rejected", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push({
    id: "fix-request-1",
    report_id: env.reportId,
    owner_email: "owner@example.com",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 81,
    issue_count: 1,
    status: "checkout_created",
    note: "",
    is_test: 0,
    checkout_session_id: "dodo-session-1",
    checkout_url: "https://checkout.example.com/session-1",
    checkout_created_at: new Date().toISOString(),
    checkout_repair_json: JSON.stringify({
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    }),
    product_id: "pdt_fix_pack",
    payment_id: "",
    paid_at: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const payment = extractDodoPayment({
    id: "payment-wrong-repair",
    checkout_session_id: "dodo-session-1",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "owner@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: "fix-request-1",
      report_id: env.reportId,
      repair_issue_id: "issue-2",
      repair_queue_item_id: "queue-2",
      repair_title: "Wrong repair"
    }
  });

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_wrong_repair");

  assert.equal(result.ok, false);
  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "repair_target_mismatch");
  assert.equal(env.fixRequests[0].status, "checkout_created");
  assert.equal(env.fixRequests[0].payment_id, "");
  const rejectedEvent = env.events.find((event) => event.event === "payment_identity_rejected");
  assert.ok(rejectedEvent);
  assert.equal(rejectedEvent.reason, "repair_target_mismatch");
});

test("Dodo payment still validates customer email when checkout repair target matches", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push({
    id: "fix-request-1",
    report_id: env.reportId,
    owner_email: "owner@example.com",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 81,
    issue_count: 1,
    status: "checkout_created",
    note: "",
    is_test: 0,
    checkout_session_id: "dodo-session-1",
    checkout_url: "https://checkout.example.com/session-1",
    checkout_created_at: new Date().toISOString(),
    checkout_repair_json: JSON.stringify({
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    }),
    product_id: "pdt_fix_pack",
    payment_id: "",
    paid_at: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const payment = extractDodoPayment({
    id: "payment-email-mismatch",
    checkout_session_id: "dodo-session-1",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "other@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: "fix-request-1",
      report_id: env.reportId,
      repair_issue_id: "issue-1",
      repair_queue_item_id: "queue-1",
      repair_title: "Missing title"
    }
  });

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_email_mismatch");

  assert.equal(result.ok, false);
  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "customer_email_mismatch");
  assert.equal(env.fixRequests[0].status, "checkout_created");
  assert.equal(env.fixRequests[0].payment_id, "");
  const rejectedEvent = env.events.find((event) => event.event === "payment_identity_rejected");
  assert.ok(rejectedEvent);
  assert.equal(rejectedEvent.reason, "customer_email_mismatch");
});

test("Dodo payment for a checkout target missing after checkout is recorded for follow-up", async () => {
  const env = await fakeBillingEnv();
  env.queueItems = [];
  env.fixRequests.push({
    id: "fix-request-1",
    report_id: env.reportId,
    owner_email: "owner@example.com",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 81,
    issue_count: 1,
    status: "checkout_created",
    note: "",
    is_test: 0,
    checkout_session_id: "dodo-session-1",
    checkout_url: "https://checkout.example.com/session-1",
    checkout_created_at: new Date().toISOString(),
    checkout_repair_json: JSON.stringify({
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    }),
    product_id: "pdt_fix_pack",
    payment_id: "",
    paid_at: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const payment = extractDodoPayment({
    id: "payment-missing-repair",
    checkout_session_id: "dodo-session-1",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "owner@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: "fix-request-1",
      report_id: env.reportId,
      repair_issue_id: "issue-1",
      repair_queue_item_id: "queue-1",
      repair_title: "Missing title"
    }
  });

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_missing_repair");

  assert.equal(result.ok, true);
  assert.equal(result.status, "processed");
  assert.equal(env.fixRequests[0].status, "paid");
  assert.equal(env.fixRequests[0].payment_id, "payment-missing-repair");
  assert.equal(env.fixRequests[0].status_reason, "repair_target_missing");
  const paymentEvent = env.events.find((event) => event.event === "payment_succeeded");
  assert.ok(paymentEvent);
  const detail = JSON.parse(paymentEvent.detail_json);
  assert.equal(detail.repairTargetState, "missing");
});

test("Dodo payment is recorded when repair queue lookup is unavailable after checkout", async () => {
  const env = await fakeBillingEnv();
  env.repairTablesMissing = true;
  env.fixRequests.push({
    id: "fix-request-1",
    report_id: env.reportId,
    owner_email: "owner@example.com",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 81,
    issue_count: 1,
    status: "checkout_created",
    note: "",
    is_test: 0,
    checkout_session_id: "dodo-session-1",
    checkout_url: "https://checkout.example.com/session-1",
    checkout_created_at: new Date().toISOString(),
    checkout_repair_json: JSON.stringify({
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    }),
    product_id: "pdt_fix_pack",
    payment_id: "",
    paid_at: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const payment = extractDodoPayment({
    id: "payment-unavailable-repair",
    checkout_session_id: "dodo-session-1",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "owner@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: "fix-request-1",
      report_id: env.reportId,
      repair_issue_id: "issue-1",
      repair_queue_item_id: "queue-1",
      repair_title: "Missing title"
    }
  });

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_unavailable_repair");

  assert.equal(result.ok, true);
  assert.equal(result.status, "processed");
  assert.equal(result.paid, true);
  assert.equal(env.fixRequests[0].status, "paid");
  assert.equal(env.fixRequests[0].payment_id, "payment-unavailable-repair");
  assert.equal(env.fixRequests[0].status_reason, "repair_target_unavailable");
  const paymentEvent = env.events.find((event) => event.event === "payment_succeeded");
  assert.ok(paymentEvent);
  const detail = JSON.parse(paymentEvent.detail_json);
  assert.equal(detail.repairTargetState, "unavailable");
});

test("Dodo payment for a checkout target closed after checkout is recorded for follow-up", async () => {
  const env = await fakeBillingEnv();
  env.queueItems[0].status = "fixed";
  env.fixRequests.push({
    id: "fix-request-1",
    report_id: env.reportId,
    owner_email: "owner@example.com",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 81,
    issue_count: 1,
    status: "checkout_created",
    note: "",
    is_test: 0,
    checkout_session_id: "dodo-session-1",
    checkout_url: "https://checkout.example.com/session-1",
    checkout_created_at: new Date().toISOString(),
    checkout_repair_json: JSON.stringify({
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    }),
    product_id: "pdt_fix_pack",
    payment_id: "",
    paid_at: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const payment = extractDodoPayment({
    id: "payment-closed-repair",
    checkout_session_id: "dodo-session-1",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "owner@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: "fix-request-1",
      report_id: env.reportId,
      repair_issue_id: "issue-1",
      repair_queue_item_id: "queue-1",
      repair_title: "Missing title"
    }
  });

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_closed_repair");

  assert.equal(result.ok, true);
  assert.equal(result.status, "processed");
  assert.equal(result.paid, true);
  assert.equal(env.fixRequests[0].status, "paid");
  assert.equal(env.fixRequests[0].payment_id, "payment-closed-repair");
  assert.equal(env.fixRequests[0].status_reason, "repair_target_closed");
  const paymentEvent = env.events.find((event) => event.event === "payment_succeeded");
  assert.ok(paymentEvent);
  const detail = JSON.parse(paymentEvent.detail_json);
  assert.equal(detail.repairTargetState, "closed");
  assert.equal(detail.repairTargetStatus, "fixed");
});

test("Dodo payment success event preserves selected repair metadata", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push({
    id: "fix-request-1",
    report_id: env.reportId,
    owner_email: "owner@example.com",
    target_url: "https://example.com/",
    target_host: "example.com",
    score: 81,
    issue_count: 1,
    status: "checkout_created",
    note: "",
    is_test: 0,
    checkout_session_id: "dodo-session-1",
    checkout_url: "https://checkout.example.com/session-1",
    checkout_created_at: new Date().toISOString(),
    product_id: "pdt_fix_pack",
    checkout_repair_json: JSON.stringify({
      queueItemId: "queue-1",
      issueId: "issue-1",
      status: "approved"
    }),
    payment_id: "",
    paid_at: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const payment = extractDodoPayment({
    id: "payment-1",
    checkout_session_id: "dodo-session-1",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "owner@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: "fix-request-1",
      report_id: env.reportId,
      repair_issue_id: "issue-1",
      repair_queue_item_id: "queue-1",
      repair_title: "Missing title"
    }
  });

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_1");

  assert.equal(result.ok, true);
  assert.equal(result.paid, true);
  assert.equal(env.fixRequests[0].status, "paid");
  assert.equal(env.fixRequests[0].payment_id, "payment-1");
  const paymentEvent = env.events.find((event) => event.event === "payment_succeeded");
  assert.ok(paymentEvent);
  const detail = JSON.parse(paymentEvent.detail_json);
  assert.equal(detail.repairIssueId, "issue-1");
  assert.equal(detail.repairQueueItemId, "queue-1");
  assert.equal(detail.repairTitle, "Missing title");
  assert.equal(detail.checkoutSessionId, "dodo-session-1");
});

async function fakeBillingEnv() {
  const sessionToken = "test-session";
  const tokenHash = await sha256Hex(sessionToken);
  const reportId = "example-com-report-1";
  const now = new Date().toISOString();
  const report = {
    id: reportId,
    url: "https://example.com/",
    score: 81,
    summary: { totalFindings: 1 },
    findings: [{
      id: "issue-1",
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/",
      evidence: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      confidence: "verified",
      source: "rendered"
    }],
    repairPlan: []
  };
  const env = {
    sessionToken,
    reportId,
    DODO_SEOFIXKIT_API_KEY: "dodo-key",
    DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: "pdt_fix_pack",
    DODO_SEOFIXKIT_BRAND_ID: "brand-1",
    DODO_SEOFIXKIT_ENVIRONMENT: "test",
    DODO_SEOFIXKIT_WEBHOOK_SECRET: "whsec_test",
    sessions: [{
      token_hash: tokenHash,
      owner_email: "owner@example.com",
      invite_id: null,
      access_mode: "founder-override",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null
    }],
    reports: [{
      id: reportId,
      url: "https://example.com/",
      target_host: "example.com",
      owner_email: "owner@example.com",
      owner_invite_id: null,
      score: 81,
      summary_json: JSON.stringify(report.summary),
      report_json: JSON.stringify(report),
      expires_at: new Date(Date.now() + 60_000).toISOString()
    }],
    queueItems: [{
      id: "queue-1",
      report_id: reportId,
      owner_email: "owner@example.com",
      issue_id: "issue-1",
      title: "Missing title",
      severity: "critical",
      page_url: "https://example.com/",
      page_label: "home",
      proof: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      snippet: "",
      acceptance: "Rendered title exists.",
      confidence: "verified",
      source: "rendered",
      source_kind: "finding",
      estimated_effort: "",
      work_type: "",
      action_mode: "cms_draft",
      status: "approved",
      rerun_status: "not_run",
      last_rerun_report_id: "",
      created_at: now,
      updated_at: now,
      updated_by_email: "owner@example.com"
    }],
    actions: [{
      id: "action-1",
      report_id: reportId,
      owner_email: "owner@example.com",
      queue_item_id: "queue-1",
      issue_id: "issue-1",
      action_mode: "cms_draft",
      action_type: "metadata_copy",
      approval_state: "approved",
      execution_state: "not_started",
      rerun_state: "not_run",
      source_proof: "Rendered title is missing.",
      proposed_change: "Private draft title copy",
      acceptance: "Rendered title exists.",
      rerun_report_id: "",
      created_at: now,
      updated_at: now,
      approved_at: now,
      applied_at: "",
      updated_by_email: "owner@example.com"
    }],
    fixRequests: [],
    events: []
  };
  env.WAITLIST_DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return statement(sql, values, env);
        }
      };
    }
  };
  return env;
}

function statement(sql, values, env) {
  return {
    first: async () => first(sql, values, env),
    all: async () => all(sql, values, env),
    run: async () => run(sql, values, env)
  };
}

function first(sql, values, env) {
  if (sql.includes("FROM beta_sessions")) {
    return env.sessions.find((row) => row.token_hash === values[0]) || null;
  }
  if (sql.includes("SELECT checkout_repair_json FROM fix_requests")) {
    if (env.missingCheckoutRepairColumn) throw new Error("no such column: checkout_repair_json");
    return env.fixRequests[0] ? { checkout_repair_json: env.fixRequests[0].checkout_repair_json || "" } : null;
  }
  if (sql.includes("FROM fix_requests") && sql.includes("WHERE id = ?")) {
    return env.fixRequests.find((row) => row.id === values[0]) || null;
  }
  if (sql.includes("FROM fix_requests") && sql.includes("WHERE checkout_session_id = ?")) {
    return env.fixRequests.find((row) => row.checkout_session_id === values[0]) || null;
  }
  if (sql.includes("FROM fix_requests") && sql.includes("WHERE payment_id = ?")) {
    return env.fixRequests.find((row) => row.payment_id === values[0]) || null;
  }
  if (sql.includes("FROM audit_reports")) {
    return env.reports.find((row) => row.id === values[0]) || null;
  }
  if (sql.includes("FROM repair_queue_items")) {
    if (env.repairTablesMissing) throw new Error("no such table: repair_queue_items");
    const [id, reportId, ownerEmail] = values;
    return env.queueItems.find((row) =>
      row.id === id &&
      row.report_id === reportId &&
      row.owner_email === ownerEmail
    ) || null;
  }
  if (sql.includes("FROM fix_requests")) {
    const [reportId, ownerEmail] = values;
    return env.fixRequests.find((row) => row.report_id === reportId && row.owner_email === ownerEmail) || null;
  }
  throw new Error(`Unexpected first SQL: ${sql}`);
}

function all(sql, values, env) {
  if (sql.includes("FROM repair_queue_items")) {
    if (env.repairTablesMissing) throw new Error("no such table: repair_queue_items");
    const [reportId, ownerEmail] = values;
    return { results: env.queueItems.filter((row) => row.report_id === reportId && row.owner_email === ownerEmail) };
  }
  if (sql.includes("FROM repair_agent_actions")) {
    if (env.repairTablesMissing) throw new Error("no such table: repair_agent_actions");
    const [reportId, ownerEmail] = values;
    return { results: env.actions.filter((row) => row.report_id === reportId && row.owner_email === ownerEmail) };
  }
  throw new Error(`Unexpected all SQL: ${sql}`);
}

function run(sql, values, env) {
  if (sql.includes("UPDATE beta_sessions")) return { meta: { changes: 1 } };
  if (sql.includes("INSERT INTO repair_queue_items")) {
    if (!env.queueItems.some((row) => row.report_id === values[1] && row.issue_id === values[3])) {
      env.queueItems.push({
        id: values[0],
        report_id: values[1],
        owner_email: values[2],
        issue_id: values[3],
        title: values[4],
        severity: values[5],
        page_url: values[6],
        page_label: values[7],
        proof: values[8],
        fix: values[9],
        snippet: values[10],
        acceptance: values[11],
        confidence: values[12],
        source: values[13],
        source_kind: values[14],
        estimated_effort: values[15],
        work_type: values[16],
        action_mode: values[17],
        status: values[18],
        rerun_status: values[19],
        last_rerun_report_id: values[20],
        created_at: values[21],
        updated_at: values[22],
        updated_by_email: values[23]
      });
    }
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO fix_requests")) {
    env.fixRequests.push({
      id: values[0],
      report_id: values[1],
      owner_email: values[2],
      target_url: values[3],
      target_host: values[4],
      score: values[5],
      issue_count: values[6],
      status: "new",
      note: values[7],
      is_test: values[8],
      created_at: values[9],
      updated_at: values[10],
      checkout_session_id: "",
      checkout_url: "",
      checkout_created_at: "",
      product_id: "",
      checkout_repair_json: ""
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO fix_request_events")) {
    env.events.push({
      id: values[0],
      fix_request_id: values[1],
      event: values[2],
      actor_type: values[3],
      actor_email: values[4],
      from_status: values[5],
      to_status: values[6],
      reason: values[7],
      detail_json: values[8],
      created_at: values[9]
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("UPDATE fix_requests") && sql.includes("checkout_url")) {
    const row = env.fixRequests.find((row) => row.id === values[6]);
    if (row) {
      row.status = "checkout_created";
      row.checkout_session_id = values[0];
      row.checkout_url = values[1];
      row.checkout_created_at = values[2];
      row.product_id = values[3];
      row.checkout_repair_json = values[4];
      row.updated_at = values[5];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE fix_requests") && sql.includes("payment_id = ?")) {
    const row = env.fixRequests.find((row) => row.id === values[12]);
    if (row) {
      row.status = ["in_progress", "delivered", "refunded", "disputed"].includes(row.status) ? row.status : "paid";
      row.payment_id = values[0];
      row.checkout_session_id = row.checkout_session_id || values[1];
      row.payment_amount = values[2];
      row.payment_currency = values[3];
      row.payment_customer_email = values[4];
      row.dodo_business_id = values[5];
      row.dodo_brand_id = values[6];
      row.paid_at = row.paid_at || values[7];
      row.due_at = row.due_at || values[8];
      row.next_update_at = row.next_update_at || values[9];
      row.status_reason = values[10] || row.status_reason || "";
      row.updated_at = values[11];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE audit_reports") || sql.includes("UPDATE audit_jobs")) {
    return { meta: { changes: 1 } };
  }
  throw new Error(`Unexpected run SQL: ${sql}`);
}
