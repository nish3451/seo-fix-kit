import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  getBillingSummary,
  handleDodoWebhook,
  processDodoPaymentWebhook,
  processDodoSubscriptionWebhook,
  requestFixPack,
  requestMonitoringCheckout
} from "./billing.js";
import { extractDodoPayment, extractDodoSubscription } from "../../shared/dodo.js";
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

test("Dodo webhook drill marker cannot pay a non-test Fix Pack request", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-real",
    is_test: 0
  }));

  const payment = extractDodoPayment(paymentEventData(env, {
    id: "payment-drill-real",
    metadata: {
      seofixkit_webhook_drill: "1"
    }
  }));

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_drill_real");

  assert.equal(result.ok, false);
  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "webhook_drill_requires_test_request");
  assert.equal(env.fixRequests[0].status, "checkout_created");
  assert.equal(env.fixRequests[0].payment_id, "");
  const rejectedEvent = env.events.find((event) => event.event === "payment_identity_rejected");
  assert.ok(rejectedEvent);
  assert.equal(rejectedEvent.reason, "webhook_drill_requires_test_request");
});

test("Dodo webhook drill marker can pay only a test Fix Pack request and seed proposals", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-test",
    is_test: 1
  }));

  const payment = extractDodoPayment(paymentEventData(env, {
    id: "payment-drill-test",
    metadata: {
      seofixkit_webhook_drill: "1"
    }
  }));

  const result = await processDodoPaymentWebhook(env, "payment.succeeded", payment, "wh_drill_test");

  assert.equal(result.ok, true);
  assert.equal(result.status, "processed");
  assert.equal(result.paid, true);
  assert.equal(env.fixRequests[0].status, "paid");
  assert.equal(env.fixRequests[0].payment_id, "payment-drill-test");
  assert.equal(env.repairProposals.length, 1);
  assert.equal(env.repairProposals[0].fix_request_id, "fix-request-test");
  assert.equal(env.repairProposals[0].issue_id, "issue-1");
  const paymentEvent = env.events.find((event) => event.event === "payment_succeeded");
  assert.ok(paymentEvent);
});

test("billing summary exposes customer delivery readiness from repair proposal state", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-paid",
    status: "paid",
    payment_id: "payment-1",
    paid_at: "2026-06-20T00:00:00.000Z",
    customer_note: "",
    delivery_url: "",
    final_report_id: ""
  }));
  env.repairProposals.push({
    fix_request_id: "fix-request-paid",
    owner_email: "owner@example.com",
    approval_status: "pending",
    delivery_status: "draft",
    execution_mode: "generated_proposal"
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    display_price: "$99.00",
    currency: "USD",
    total_amount: 9900
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

  try {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0].repairProposalSummary, undefined);
    assert.equal(body.requests[0].deliveryReadiness.checks, undefined);
    assert.equal(body.requests[0].deliveryReadiness.readyForStart, true);
    assert.equal(body.requests[0].deliveryReadiness.readyForDelivery, false);
    assert.deepEqual(
      body.requests[0].deliveryReadiness.blockers.map((blocker) => blocker.id),
      ["approved_proposal_missing", "customer_note_missing", "delivery_link_missing", "final_rerun_missing"]
    );
    assert.deepEqual(
      body.requests[0].deliveryReadiness.blockers.map((blocker) => blocker.label),
      [undefined, undefined, undefined, undefined]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("billing summary marks delivery blocked when proposal state is unavailable", async () => {
  const env = await fakeBillingEnv();
  env.repairProposalsMissing = true;
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-paid",
    status: "paid",
    payment_id: "payment-1",
    paid_at: "2026-06-20T00:00:00.000Z",
    customer_note: "Ready for review",
    delivery_url: "https://seofixkit.com/beta/reports/final",
    final_report_id: "final"
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    display_price: "$99.00",
    currency: "USD",
    total_amount: 9900
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

  try {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.requests[0].repairProposalSummary, undefined);
    assert.equal(body.requests[0].deliveryReadiness.checks, undefined);
    assert.deepEqual(
      body.requests[0].deliveryReadiness.blockers.map((blocker) => blocker.id),
      ["proposal_state_unavailable"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("billing summary keeps empty Fix Pack state unchanged", async () => {
  const env = await fakeBillingEnv();

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.requests, []);
    assert.deepEqual(body.payments, []);
  });
});

test("Proof Monitoring checkout creates Dodo subscription checkout for verified owner", async () => {
  const env = await fakeBillingEnv();
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({
      checkout_url: "https://checkout.example.com/monitoring-1",
      session_id: "dodo-monitoring-session-1"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestMonitoringCheckout(new Request("https://seofixkit.test/api/beta/monitoring-checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({ targetHost: "example.com" })
    }), env);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, "checkout");
    assert.equal(body.checkoutUrl, "https://checkout.example.com/monitoring-1");
    assert.equal(body.target.targetHost, "example.com");
    assert.equal(body.monitoring.status, "beta_allowance");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 1);
  assert.equal(dodoRequests[0].url, "https://test.dodopayments.com/checkouts");
  assert.deepEqual(dodoRequests[0].body.product_cart, [{ product_id: "pdt_monitoring", quantity: 1 }]);
  assert.equal(dodoRequests[0].body.metadata.product_key, "seofixkit_proof_monitoring");
  assert.equal(dodoRequests[0].body.metadata.offer_key, "proof_monitoring");
  assert.equal(dodoRequests[0].body.metadata.owner_email, "owner@example.com");
  assert.equal(dodoRequests[0].body.metadata.target_host, "example.com");
  assert.equal(dodoRequests[0].body.metadata.site_claim_id, "site-claim-1");
  assert.equal(dodoRequests[0].body.metadata.audit_schedule_id, "schedule-1");
});

test("Proof Monitoring checkout fails closed when subscription product is not configured", async () => {
  const env = await fakeBillingEnv();
  delete env.DODO_SEOFIXKIT_PRODUCT_MONITORING_ID;
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({ checkout_url: "https://checkout.example.com/unexpected" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestMonitoringCheckout(new Request("https://seofixkit.test/api/beta/monitoring-checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({ targetHost: "example.com" })
    }), env);

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "MONITORING_CHECKOUT_NOT_CONFIGURED");
    assert.equal(body.checkoutAvailable, false);
    assert.deepEqual(body.missing, ["productId"]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 0);
});

test("Proof Monitoring checkout fails closed without an eligible verified site or monitor", async () => {
  for (const setup of [
    {
      label: "no eligible sites",
      prepare(env) {
        env.siteClaims = [];
        env.auditSchedules = [];
      },
      body: {}
    },
    {
      label: "requested host not owned",
      prepare() {},
      body: { targetHost: "other.com" }
    }
  ]) {
    const env = await fakeBillingEnv();
    setup.prepare(env);
    const dodoRequests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
      return new Response(JSON.stringify({ checkout_url: "https://checkout.example.com/unexpected" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    try {
      const response = await requestMonitoringCheckout(new Request("https://seofixkit.test/api/beta/monitoring-checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-beta-session": env.sessionToken
        },
        body: JSON.stringify(setup.body)
      }), env);

      assert.equal(response.status, 409, setup.label);
      const body = await response.json();
      assert.equal(body.ok, false, setup.label);
      assert.equal(body.code, "MONITORING_SITE_REQUIRED", setup.label);
      assert.equal(body.checkoutAvailable, false, setup.label);
      assert.ok(Array.isArray(body.eligibleSites), setup.label);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(dodoRequests.length, 0, setup.label);
  }
});

test("Proof Monitoring checkout fails closed when entitlement schema is unavailable", async () => {
  const env = await fakeBillingEnv();
  env.missingEntitlementSchema = true;
  const dodoRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    dodoRequests.push({ url: String(url), body: JSON.parse(options.body || "{}") });
    return new Response(JSON.stringify({ checkout_url: "https://checkout.example.com/unexpected" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await requestMonitoringCheckout(new Request("https://seofixkit.test/api/beta/monitoring-checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({ targetHost: "example.com" })
    }), env);

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "MONITORING_ENTITLEMENT_SCHEMA_MISSING");
    assert.equal(body.checkoutAvailable, false);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(dodoRequests.length, 0);
});

test("Proof Monitoring checkout rejects unsafe provider checkout URLs", async () => {
  const env = await fakeBillingEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    checkout_url: "javascript:alert(1)",
    session_id: "unsafe-session"
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

  try {
    const response = await requestMonitoringCheckout(new Request("https://seofixkit.test/api/beta/monitoring-checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beta-session": env.sessionToken
      },
      body: JSON.stringify({ targetHost: "example.com" })
    }), env);

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "DODO_CHECKOUT_URL_INVALID");
    assert.equal(body.checkoutAvailable, false);
    assert.equal(body.checkoutUrl, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Dodo subscription webhook activates Proof Monitoring entitlement", async () => {
  const env = await fakeBillingEnv();
  const subscription = extractDodoSubscription(subscriptionEventData({
    id: "sub-active-1",
    status: "active"
  }));

  const result = await processDodoSubscriptionWebhook(env, "subscription.active", subscription, "wh_sub_active");

  assert.equal(result.ok, true);
  assert.equal(result.status, "processed");
  assert.equal(result.offerKey, "proof_monitoring");
  assert.equal(result.entitlementStatus, "active");
  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].owner_email, "owner@example.com");
  assert.equal(env.entitlements[0].offer_key, "proof_monitoring");
  assert.equal(env.entitlements[0].status, "active");
  assert.equal(env.entitlements[0].provider, "dodo");
  assert.equal(env.entitlements[0].product_id, "pdt_monitoring");
  assert.equal(env.entitlements[0].subscription_id, "sub-active-1");
  assert.equal(env.entitlementEvents.at(-1).event, "subscription_active");
});

test("signed Dodo subscription webhook activates once and dedupes replay", async () => {
  const env = await fakeBillingEnv();
  const payload = {
    type: "subscription.active",
    data: subscriptionEventData({
      id: "sub-signed-1",
      status: "active"
    })
  };

  const first = await handleDodoWebhook(signedDodoWebhookRequest(payload, "wh_signed_sub_1", env), env, null);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.received, true);
  assert.equal(firstBody.status, "processed");
  assert.equal(env.entitlements.length, 1);
  assert.equal(env.dodoWebhookEvents[0].status, "processed");
  assert.equal(env.dodoWebhookEvents[0].payment_id, "sub-signed-1");

  const second = await handleDodoWebhook(signedDodoWebhookRequest(payload, "wh_signed_sub_1", env), env, null);
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.duplicate, true);
  assert.equal(env.entitlements.length, 1);
});

test("Dodo subscription webhook revokes Proof Monitoring entitlement on cancellation", async () => {
  const env = await fakeBillingEnv();
  const active = extractDodoSubscription(subscriptionEventData({ id: "sub-cancel-1", status: "active" }));
  await processDodoSubscriptionWebhook(env, "subscription.active", active, "wh_sub_cancel_active");
  const cancelled = extractDodoSubscription(subscriptionEventData({ id: "sub-cancel-1", status: "cancelled" }));

  const result = await processDodoSubscriptionWebhook(env, "subscription.cancelled", cancelled, "wh_sub_cancelled");

  assert.equal(result.ok, true);
  assert.equal(result.entitlementStatus, "cancelled");
  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].status, "cancelled");
  assert.ok(env.entitlements[0].revoked_at);
  assert.equal(env.entitlementEvents.at(-1).event, "subscription_inactive");
});

test("signed Dodo subscription.paused webhook revokes Proof Monitoring entitlement", async () => {
  const env = await fakeBillingEnv();
  const active = extractDodoSubscription(subscriptionEventData({ id: "sub-paused-1", status: "active" }));
  await processDodoSubscriptionWebhook(env, "subscription.active", active, "wh_paused_active");
  const payload = {
    type: "subscription.paused",
    data: subscriptionEventData({
      id: "sub-paused-1",
      status: "paused"
    })
  };

  const response = await handleDodoWebhook(signedDodoWebhookRequest(payload, "wh_paused_1", env), env, null);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.received, true);
  assert.equal(body.status, "processed");
  assert.equal(body.entitlementStatus, "paused");
  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].status, "paused");
  assert.ok(env.entitlements[0].revoked_at);
  assert.equal(env.dodoWebhookEvents.at(-1).status, "processed");
  assert.equal(env.dodoWebhookEvents.at(-1).payment_id, "sub-paused-1");
});

test("Dodo webhook signature gate rejects missing, wrong-secret, and stale requests with zero mutations", async () => {
  const payload = {
    type: "subscription.active",
    data: subscriptionEventData({
      id: "sub-unsigned-1",
      status: "active"
    })
  };
  const scenarios = [
    {
      label: "missing signature",
      buildRequest(env) {
        return signedDodoWebhookRequest(payload, "wh_missing_signature", env, { includeSignature: false });
      }
    },
    {
      label: "wrong secret",
      buildRequest(env) {
        return signedDodoWebhookRequest(payload, "wh_wrong_secret", env, { secret: "whsec_wrong" });
      }
    },
    {
      label: "stale timestamp",
      buildRequest(env) {
        return signedDodoWebhookRequest(payload, "wh_stale_timestamp", env, {
          timestamp: Math.floor(Date.now() / 1000) - 60 * 60
        });
      }
    }
  ];

  for (const scenario of scenarios) {
    const env = await fakeBillingEnv();
    const response = await handleDodoWebhook(scenario.buildRequest(env), env, null);

    assert.equal(response.status, 400, scenario.label);
    const body = await response.json();
    assert.equal(body.error, "Invalid signature.", scenario.label);

    // The gate must reject before any mutation: webhook ledger rows, entitlements,
    // entitlement events, fix requests, fix request events, and repair proposals
    // all have to stay untouched so a spoofed or replayed webhook cannot pay,
    // revoke, or activate anything.
    assert.equal(env.dodoWebhookEvents.length, 0, `${scenario.label}: webhook ledger mutated`);
    assert.equal(env.entitlements.length, 0, `${scenario.label}: entitlement mutated`);
    assert.equal(env.entitlementEvents.length, 0, `${scenario.label}: entitlement event mutated`);
    assert.equal(env.fixRequests.length, 0, `${scenario.label}: fix request mutated`);
    assert.equal(env.events.length, 0, `${scenario.label}: fix request event mutated`);
    assert.equal(env.repairProposals.length, 0, `${scenario.label}: repair proposal mutated`);
  }
});

test("Dodo subscription webhook reactivates recoverable on-hold monitoring", async () => {
  const env = await fakeBillingEnv();
  const active = extractDodoSubscription(subscriptionEventData({ id: "sub-on-hold-1", status: "active" }));
  await processDodoSubscriptionWebhook(env, "subscription.active", active, "wh_on_hold_active");
  const onHold = extractDodoSubscription(subscriptionEventData({ id: "sub-on-hold-1", status: "on_hold" }));
  await processDodoSubscriptionWebhook(env, "subscription.on_hold", onHold, "wh_on_hold");

  const recovered = extractDodoSubscription(subscriptionEventData({ id: "sub-on-hold-1", status: "active" }));
  const result = await processDodoSubscriptionWebhook(env, "subscription.active", recovered, "wh_on_hold_recovered");

  assert.equal(result.ok, true);
  assert.equal(result.ignored, false);
  assert.equal(result.entitlementStatus, "active");
  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].status, "active");
  assert.equal(env.entitlements[0].revoked_at, null);
  assert.equal(env.entitlementEvents.at(-1).event, "subscription_active");
});

test("Dodo subscription webhook reactivates failed monitoring after provider recovery", async () => {
  const env = await fakeBillingEnv();
  const active = extractDodoSubscription(subscriptionEventData({ id: "sub-failed-recovered-1", status: "active" }));
  await processDodoSubscriptionWebhook(env, "subscription.active", active, "wh_failed_recovered_active");
  const failed = extractDodoSubscription(subscriptionEventData({ id: "sub-failed-recovered-1", status: "failed" }));
  await processDodoSubscriptionWebhook(env, "subscription.failed", failed, "wh_failed_recovered_failed");

  const recovered = extractDodoSubscription(subscriptionEventData({ id: "sub-failed-recovered-1", status: "active" }));
  const result = await processDodoSubscriptionWebhook(env, "subscription.renewed", recovered, "wh_failed_recovered_renewed");

  assert.equal(result.ok, true);
  assert.equal(result.ignored, false);
  assert.equal(result.entitlementStatus, "active");
  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].status, "active");
  assert.equal(env.entitlements[0].revoked_at, null);
});

test("Dodo subscription webhook does not reactivate a cancelled subscription from stale active events", async () => {
  const env = await fakeBillingEnv();
  const active = extractDodoSubscription(subscriptionEventData({ id: "sub-stale-1", status: "active" }));
  await processDodoSubscriptionWebhook(env, "subscription.active", active, "wh_stale_active_initial");
  const cancelled = extractDodoSubscription(subscriptionEventData({ id: "sub-stale-1", status: "cancelled" }));
  await processDodoSubscriptionWebhook(env, "subscription.cancelled", cancelled, "wh_stale_cancelled");

  const staleActive = extractDodoSubscription(subscriptionEventData({ id: "sub-stale-1", status: "active" }));
  const result = await processDodoSubscriptionWebhook(env, "subscription.updated", staleActive, "wh_stale_active_retry");

  assert.equal(result.ok, true);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "subscription_previously_revoked");
  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].status, "cancelled");
  assert.ok(env.entitlements[0].revoked_at);
});

test("Dodo subscription.updated with pending or missing status does not activate monitoring", async () => {
  for (const status of ["pending", "missing"]) {
    const env = await fakeBillingEnv();
    const data = subscriptionEventData({
      id: `sub-updated-${status || "missing"}`,
      status
    });
    if (status === "missing") delete data.status;
    const subscription = extractDodoSubscription(data);

    const result = await processDodoSubscriptionWebhook(env, "subscription.updated", subscription, `wh_updated_${status || "missing"}`);

    assert.equal(result.ok, true, status);
    assert.equal(result.ignored, true, status);
    assert.equal(env.entitlements.length, 0, status);
  }
});

test("Dodo subscription webhook rejects wrong monitoring product", async () => {
  const env = await fakeBillingEnv();
  const subscription = extractDodoSubscription(subscriptionEventData({
    id: "sub-wrong-product",
    product_id: "pdt_other"
  }));

  const result = await processDodoSubscriptionWebhook(env, "subscription.active", subscription, "wh_sub_wrong_product");

  assert.equal(result.ok, true);
  assert.equal(result.status, "processed");
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "product_mismatch");
  assert.equal(env.entitlements.length, 0);
  assert.equal(env.entitlementEvents.at(-1).event, "subscription_product_identity_rejected");
});

test("Dodo subscription plan_changed revokes monitoring when product changes away", async () => {
  const env = await fakeBillingEnv();
  const active = extractDodoSubscription(subscriptionEventData({ id: "sub-plan-change-1", status: "active" }));
  await processDodoSubscriptionWebhook(env, "subscription.active", active, "wh_plan_change_active");
  const changed = extractDodoSubscription(subscriptionEventData({
    id: "sub-plan-change-1",
    status: "active",
    product_id: "pdt_other"
  }));

  const result = await processDodoSubscriptionWebhook(env, "subscription.plan_changed", changed, "wh_plan_changed");

  assert.equal(result.ok, true);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "product_mismatch");
  assert.equal(env.entitlements[0].status, "product_mismatch");
  assert.ok(env.entitlements[0].revoked_at);
});

test("Dodo subscription webhook rejects missing product cart and quantity mismatch", async () => {
  for (const scenario of [
    {
      label: "missing product",
      data: subscriptionEventData({ id: "sub-missing-product", product_cart: [] }),
      reason: "missing_product_cart"
    },
    {
      label: "top-level quantity mismatch",
      data: subscriptionEventData({
        id: "sub-quantity-mismatch",
        product_id: "pdt_monitoring",
        quantity: 2,
        useTopLevelProduct: true
      }),
      reason: "product_quantity_mismatch"
    }
  ]) {
    const env = await fakeBillingEnv();
    const subscription = extractDodoSubscription(scenario.data);

    const result = await processDodoSubscriptionWebhook(env, "subscription.active", subscription, `wh_${scenario.label.replaceAll(" ", "_")}`);

    assert.equal(result.ok, true, scenario.label);
    assert.equal(result.ignored, true, scenario.label);
    assert.equal(result.reason, scenario.reason, scenario.label);
    assert.equal(env.entitlements.length, 0, scenario.label);
  }
});

test("Dodo subscription parser does not double-count matching top-level product id", async () => {
  const env = await fakeBillingEnv();
  const data = subscriptionEventData({ id: "sub-duplicate-product" });
  data.product_id = "pdt_monitoring";
  data.quantity = 1;
  const subscription = extractDodoSubscription(data);

  assert.deepEqual(subscription.productIds, ["pdt_monitoring"]);
  assert.equal(subscription.productQuantity, 1);
  const result = await processDodoSubscriptionWebhook(env, "subscription.active", subscription, "wh_duplicate_product");

  assert.equal(result.ok, true);
  assert.equal(result.entitlementStatus, "active");
  assert.equal(env.entitlements.length, 1);
});

test("Dodo subscription webhook refuses activation without monitoring product config", async () => {
  const env = await fakeBillingEnv();
  delete env.DODO_SEOFIXKIT_PRODUCT_MONITORING_ID;
  const subscription = extractDodoSubscription(subscriptionEventData({
    id: "sub-missing-config"
  }));

  const result = await processDodoSubscriptionWebhook(env, "subscription.active", subscription, "wh_sub_missing_config");

  assert.equal(result.ok, false);
  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "monitoring_product_not_configured");
  assert.equal(env.entitlements.length, 0);
});

test("Dodo subscription webhook refuses entitlement mutation without a subscription id", async () => {
  const env = await fakeBillingEnv();
  const data = subscriptionEventData({ id: "", subscription_id: "" });
  delete data.id;
  delete data.subscription_id;
  const subscription = extractDodoSubscription(data);

  const result = await processDodoSubscriptionWebhook(env, "subscription.active", subscription, "wh_sub_missing_id");

  assert.equal(result.ok, false);
  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "missing_subscription_id");
  assert.equal(env.entitlements.length, 0);
});

test("billing summary exposes Proof Monitoring checkout and entitlement state", async () => {
  const env = await fakeBillingEnv();

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.provider.monitoringCheckoutReady, true);
    assert.equal(body.provider.monitoringEntitlementSchemaReady, true);
    assert.deepEqual(body.provider.monitoringMissing, []);
    assert.equal(body.monitoring.status, "beta_allowance");
    assert.equal(body.monitoring.checkoutReady, true);
    assert.equal(body.monitoring.hasEligibleSite, true);
    assert.equal(body.subscriptionState.status, "available");
    assert.deepEqual(body.subscriptions, []);
    const monitoringOffer = body.offers.find((offer) => offer.key === "proof_monitoring");
    assert.equal(monitoringOffer.checkoutLive, true);
    assert.equal(monitoringOffer.statusLabel, "Checkout live");
  });

  const active = extractDodoSubscription(subscriptionEventData({ id: "sub-summary-active", status: "active" }));
  await processDodoSubscriptionWebhook(env, "subscription.active", active, "wh_summary_active");

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    const body = await response.json();

    assert.equal(body.monitoring.status, "active");
    assert.equal(body.subscriptionState.status, "active");
    assert.equal(body.subscriptions.length, 1);
    assert.equal(body.subscriptions[0].offerKey, "proof_monitoring");
  });
});

test("billing summary gates monitoring checkout when entitlement event schema is missing", async () => {
  const env = await fakeBillingEnv();
  env.missingEntitlementEventsSchema = true;

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.provider.monitoringCheckoutReady, false);
    assert.equal(body.provider.monitoringEntitlementSchemaReady, false);
    assert.deepEqual(body.provider.monitoringMissing, []);
    assert.equal(body.monitoring.checkoutReady, false);
    assert.deepEqual(body.monitoring.checkoutMissing, ["entitlementSchema"]);
    assert.equal(body.subscriptionState.status, "not_live");
    const monitoringOffer = body.offers.find((offer) => offer.key === "proof_monitoring");
    assert.equal(monitoringOffer.checkoutLive, false);
  });
});

test("billing summary keeps monitoring checkout gated when product config is missing", async () => {
  const env = await fakeBillingEnv();
  delete env.DODO_SEOFIXKIT_PRODUCT_MONITORING_ID;

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.provider.monitoringCheckoutReady, false);
    assert.deepEqual(body.provider.monitoringMissing, ["productId"]);
    assert.equal(body.monitoring.checkoutReady, false);
    assert.equal(body.subscriptionState.status, "not_live");
    const monitoringOffer = body.offers.find((offer) => offer.key === "proof_monitoring");
    assert.equal(monitoringOffer.checkoutLive, false);
  });
});

test("billing summary marks delivery ready when approved proposal and proof are attached", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-ready",
    status: "in_progress",
    payment_id: "payment-ready",
    paid_at: "2026-06-20T00:00:00.000Z",
    customer_note: "We repaired the title and queued the rerun proof.",
    delivery_url: "https://seofixkit.com/beta/reports/final",
    final_report_id: "final"
  }));
  env.repairProposals.push({
    fix_request_id: "fix-request-ready",
    owner_email: "someone-else@example.com",
    approval_status: "approved",
    delivery_status: "draft",
    execution_mode: "generated_proposal"
  });
  env.repairProposals.push({
    fix_request_id: "fix-request-ready",
    owner_email: "owner@example.com",
    approval_status: "approved",
    delivery_status: "draft",
    execution_mode: "generated_proposal"
  });

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.requests[0].deliveryReadiness.status, "ready");
    assert.equal(body.requests[0].deliveryReadiness.readyForDelivery, true);
    assert.deepEqual(body.requests[0].deliveryReadiness.blockers, []);
    assert.equal(body.requests[0].repairProposalSummary, undefined);
    assert.equal(body.requests[0].checkoutSessionId, undefined);
  });
});

test("billing summary ignores proposal rows from another owner", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-owner-guard",
    status: "paid",
    payment_id: "payment-owner-guard",
    paid_at: "2026-06-20T00:00:00.000Z",
    customer_note: "Ready for proof",
    delivery_url: "https://seofixkit.com/beta/reports/final",
    final_report_id: "final"
  }));
  env.repairProposals.push({
    fix_request_id: "fix-request-owner-guard",
    owner_email: "someone-else@example.com",
    approval_status: "pending",
    delivery_status: "draft",
    execution_mode: "generated_proposal"
  });

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.requests[0].deliveryReadiness.status, "ready");
    assert.equal(body.requests[0].deliveryReadiness.readyForDelivery, true);
    assert.deepEqual(body.requests[0].deliveryReadiness.blockers, []);
  });
});

test("billing summary marks delivered requests delivered without blockers", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-delivered",
    status: "delivered",
    payment_id: "payment-delivered",
    paid_at: "2026-06-20T00:00:00.000Z",
    delivered_at: "2026-06-21T00:00:00.000Z"
  }));

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.requests[0].deliveryReadiness.status, "delivered");
    assert.equal(body.requests[0].deliveryReadiness.readyForStart, true);
    assert.equal(body.requests[0].deliveryReadiness.readyForDelivery, true);
    assert.deepEqual(body.requests[0].deliveryReadiness.blockers, []);
  });
});

test("billing summary hides customer-sensitive billing identifiers", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-paid",
    status: "paid",
    payment_id: "payment-secret",
    checkout_session_id: "checkout-secret",
    paid_at: "2026-06-20T00:00:00.000Z"
  }));

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.requests[0].checkoutSessionId, undefined);
    assert.equal(body.requests[0].repairProposalSummary, undefined);
    assert.equal(body.requests[0].deliveryReadiness.checks, undefined);
    assert.equal(body.payments[0].paymentId, undefined);
    assert.equal(body.payments[0].checkoutSessionId, undefined);
    assert.equal(body.payments[0].refundId, undefined);
    assert.equal(body.payments[0].disputeEvent, undefined);
    assert.equal(body.payments[0].displayReference, "Dodo payment record");
  });
});

test("billing summary uses customer-safe payment history references", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-payment",
    status: "paid",
    payment_id: "payment-secret",
    paid_at: "2026-06-20T00:00:00.000Z"
  }));
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-refund",
    status: "refunded",
    payment_id: "payment-refund-secret",
    refund_id: "refund-secret",
    paid_at: "2026-06-20T00:00:00.000Z",
    refunded_at: "2026-06-21T00:00:00.000Z"
  }));
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-dispute",
    status: "disputed",
    payment_id: "payment-dispute-secret",
    dispute_event: "chargeback",
    paid_at: "2026-06-20T00:00:00.000Z",
    disputed_at: "2026-06-21T00:00:00.000Z"
  }));
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-failed",
    status: "payment_failed",
    checkout_session_id: "checkout-failed-secret"
  }));

  await withDodoPricing(async () => {
    const response = await getBillingSummary(new Request("https://seofixkit.test/api/billing/summary", {
      headers: { "x-beta-session": env.sessionToken }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    const references = new Set(body.payments.map((payment) => payment.displayReference));
    assert.deepEqual(references, new Set([
      "Dodo payment record",
      "Dodo refund record",
      "Dodo dispute record",
      "Dodo payment attempt"
    ]));
    for (const payment of body.payments) {
      assert.equal(payment.paymentId, undefined);
      assert.equal(payment.checkoutSessionId, undefined);
      assert.equal(payment.refundId, undefined);
      assert.equal(payment.disputeEvent, undefined);
    }
  });
});

test("signed payment.failed marks an unpaid Fix Pack payment_failed and grants nothing", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, { id: "fix-request-1" }));
  const payload = {
    type: "payment.failed",
    data: paymentEventData(env, { id: "payment-failed-1", status: "failed" })
  };

  const response = await handleDodoWebhook(signedDodoWebhookRequest(payload, "wh_failed_1", env), env, null);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.received, true);
  assert.equal(body.ok, true);
  assert.equal(body.status, "processed");
  assert.equal(body.paid, false);
  assert.equal(body.fixRequestId, "fix-request-1");

  const fixRequest = env.fixRequests[0];
  assert.equal(fixRequest.status, "payment_failed");
  assert.equal(fixRequest.payment_id, "payment-failed-1");
  assert.equal(fixRequest.checkout_session_id, "dodo-session-1");
  assert.equal(fixRequest.paid_at, "");

  const failureEvent = env.events.find((event) => event.event === "payment_failed");
  assert.ok(failureEvent);
  assert.equal(failureEvent.from_status, "checkout_created");
  assert.equal(failureEvent.to_status, "payment_failed");
  assert.equal(failureEvent.reason, "payment.failed");
  assert.equal(env.events.filter((event) => event.event === "payment_succeeded").length, 0);
  assert.equal(env.entitlements.length, 0);
  assert.equal(env.repairProposals.length, 0);
  assert.equal(env.dodoWebhookEvents.at(-1).status, "processed");
  assert.equal(env.dodoWebhookEvents.at(-1).payment_id, "payment-failed-1");
});

test("signed payment failure never regresses already-paid Fix Packs and keeps payment identity", async () => {
  for (const status of ["paid", "in_progress"]) {
    const env = await fakeBillingEnv();
    env.fixRequests.push(checkoutFixRequest(env, {
      id: `fix-request-${status}`,
      status,
      payment_id: "payment-paid",
      paid_at: "2026-06-20T00:00:00.000Z"
    }));
    const payload = {
      type: "payment.failed",
      data: paymentEventData(env, {
        id: "payment-late",
        status: "failed",
        fixRequestId: `fix-request-${status}`
      })
    };

    const response = await handleDodoWebhook(signedDodoWebhookRequest(payload, `wh_late_${status}`, env), env, null);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true, status);
    assert.equal(body.paid, false, status);

    const fixRequest = env.fixRequests[0];
    assert.equal(fixRequest.status, status, status);
    assert.equal(fixRequest.payment_id, "payment-paid", status);
    assert.equal(fixRequest.paid_at, "2026-06-20T00:00:00.000Z", status);

    const failureEvent = env.events.find((event) => event.event === "payment_failed");
    assert.ok(failureEvent, status);
    assert.equal(failureEvent.from_status, status, status);
    assert.equal(failureEvent.to_status, status, status);
    assert.equal(env.events.filter((event) => event.event === "payment_succeeded").length, 0, status);
    assert.equal(env.entitlements.length, 0, status);
    assert.equal(env.repairProposals.length, 0, status);
  }
});

test("signed refund.succeeded closes a paid Fix Pack to refunded exactly once", async () => {
  const env = await fakeBillingEnv();
  env.fixRequests.push(checkoutFixRequest(env, {
    id: "fix-request-1",
    status: "paid",
    payment_id: "payment-paid",
    paid_at: "2026-06-20T00:00:00.000Z"
  }));
  const refundData = {
    id: "refund-1",
    payment_id: "payment-paid",
    refund_id: "refund-1",
    total_amount: 9900,
    currency: "USD",
    status: "succeeded",
    metadata: { fix_request_id: "fix-request-1" }
  };

  const first = await handleDodoWebhook(signedDodoWebhookRequest({ type: "refund.succeeded", data: refundData }, "wh_refund_1", env), env, null);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.received, true);
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.status, "processed");
  assert.equal(firstBody.refunded, true);

  const fixRequest = env.fixRequests[0];
  assert.equal(fixRequest.status, "refunded");
  assert.equal(fixRequest.refund_id, "refund-1");
  assert.equal(fixRequest.refund_amount, 9900);
  assert.equal(fixRequest.refund_currency, "USD");
  assert.ok(fixRequest.refunded_at);
  const refundedAt = fixRequest.refunded_at;

  const refundEvent = env.events.find((event) => event.event === "refund_succeeded");
  assert.ok(refundEvent);
  assert.equal(refundEvent.from_status, "paid");
  assert.equal(refundEvent.to_status, "refunded");
  assert.equal(refundEvent.reason, "refund-1");

  // A repeated refund with a fresh webhook id must not reopen or re-stamp the
  // refund: status stays refunded and refunded_at is preserved (COALESCE).
  const second = await handleDodoWebhook(signedDodoWebhookRequest({ type: "refund.succeeded", data: refundData }, "wh_refund_2", env), env, null);
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.refunded, true);
  assert.equal(env.fixRequests[0].status, "refunded");
  assert.equal(env.fixRequests[0].refund_id, "refund-1");
  assert.equal(env.fixRequests[0].refunded_at, refundedAt);
});

test("signed refund.failed marks refund_failed but keeps an already-refunded Fix Pack refunded", async () => {
  {
    const env = await fakeBillingEnv();
    env.fixRequests.push(checkoutFixRequest(env, {
      id: "fix-request-1",
      status: "paid",
      payment_id: "payment-paid",
      paid_at: "2026-06-20T00:00:00.000Z"
    }));
    const data = {
      id: "payment-paid",
      payment_id: "payment-paid",
      refund_id: "refund-fail-1",
      total_amount: 9900,
      currency: "USD",
      status: "failed",
      metadata: { fix_request_id: "fix-request-1" }
    };
    const response = await handleDodoWebhook(signedDodoWebhookRequest({ type: "refund.failed", data }, "wh_refund_fail_1", env), env, null);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.refundFailed, true);
    assert.equal(env.fixRequests[0].status, "refund_failed");
    assert.equal(env.fixRequests[0].refund_id, "refund-fail-1");
    const failureEvent = env.events.find((event) => event.event === "refund_failed");
    assert.equal(failureEvent.from_status, "paid");
    assert.equal(failureEvent.to_status, "refund_failed");
  }
  {
    const env = await fakeBillingEnv();
    env.fixRequests.push(checkoutFixRequest(env, {
      id: "fix-request-1",
      status: "refunded",
      payment_id: "payment-paid",
      refund_id: "refund-keep",
      refunded_at: "2026-06-21T00:00:00.000Z",
      paid_at: "2026-06-20T00:00:00.000Z"
    }));
    const data = {
      id: "payment-paid",
      payment_id: "payment-paid",
      refund_id: "refund-new",
      total_amount: 9900,
      currency: "USD",
      status: "failed",
      metadata: { fix_request_id: "fix-request-1" }
    };
    const response = await handleDodoWebhook(signedDodoWebhookRequest({ type: "refund.failed", data }, "wh_refund_fail_2", env), env, null);
    assert.equal(response.status, 200);
    const fixRequest = env.fixRequests[0];
    assert.equal(fixRequest.status, "refunded");
    assert.equal(fixRequest.refund_id, "refund-keep");
    assert.equal(fixRequest.refunded_at, "2026-06-21T00:00:00.000Z");
    const failureEvent = env.events.find((event) => event.event === "refund_failed");
    assert.equal(failureEvent.from_status, "refunded");
    assert.equal(failureEvent.to_status, "refunded");
  }
});

test("signed dispute webhooks dispute paid Fix Packs but preserve delivered ones", async () => {
  for (const eventType of ["dispute.opened", "dispute.lost"]) {
    const env = await fakeBillingEnv();
    env.fixRequests.push(checkoutFixRequest(env, {
      id: "fix-request-1",
      status: "paid",
      payment_id: "payment-paid",
      paid_at: "2026-06-20T00:00:00.000Z"
    }));
    const data = {
      id: "payment-paid",
      payment_id: "payment-paid",
      status: "disputed",
      metadata: { fix_request_id: "fix-request-1" }
    };
    const response = await handleDodoWebhook(signedDodoWebhookRequest({ type: eventType, data }, `wh_dispute_${eventType.replace(".", "_")}`, env), env, null);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.disputed, true, eventType);
    const fixRequest = env.fixRequests[0];
    assert.equal(fixRequest.status, "disputed", eventType);
    assert.equal(fixRequest.dispute_event, eventType, eventType);
    assert.ok(fixRequest.disputed_at, eventType);
    const disputeEvent = env.events.find((event) => event.event === "dispute_event");
    assert.equal(disputeEvent.from_status, "paid", eventType);
    assert.equal(disputeEvent.to_status, "disputed", eventType);
  }
  {
    const env = await fakeBillingEnv();
    env.fixRequests.push(checkoutFixRequest(env, {
      id: "fix-request-delivered",
      status: "delivered",
      payment_id: "payment-paid",
      paid_at: "2026-06-20T00:00:00.000Z",
      delivered_at: "2026-06-21T00:00:00.000Z"
    }));
    const data = {
      id: "payment-paid",
      payment_id: "payment-paid",
      status: "disputed",
      metadata: { fix_request_id: "fix-request-delivered" }
    };
    const response = await handleDodoWebhook(signedDodoWebhookRequest({ type: "dispute.opened", data }, "wh_dispute_delivered", env), env, null);
    assert.equal(response.status, 200);
    const fixRequest = env.fixRequests[0];
    assert.equal(fixRequest.status, "delivered");
    assert.equal(fixRequest.dispute_event, "dispute.opened");
    assert.ok(fixRequest.disputed_at);
    const disputeEvent = env.events.find((event) => event.event === "dispute_event");
    assert.equal(disputeEvent.from_status, "delivered");
    assert.equal(disputeEvent.to_status, "delivered");
  }
});

test("signed refund and dispute webhooks with mismatched payment identity mutate nothing", async () => {
  for (const eventType of ["refund.succeeded", "dispute.opened"]) {
    const env = await fakeBillingEnv();
    env.fixRequests.push(checkoutFixRequest(env, {
      id: "fix-request-1",
      status: "paid",
      payment_id: "payment-paid",
      paid_at: "2026-06-20T00:00:00.000Z"
    }));
    const data = {
      id: "payment-other",
      payment_id: "payment-other",
      refund_id: "refund-other",
      total_amount: 9900,
      currency: "USD",
      status: "succeeded",
      metadata: { fix_request_id: "fix-request-1" }
    };
    const response = await handleDodoWebhook(signedDodoWebhookRequest({ type: eventType, data }, `wh_mismatch_${eventType.replace(".", "_")}`, env), env, null);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.received, true, eventType);
    assert.equal(body.ignored, true, eventType);
    assert.equal(body.reason, "payment_id_mismatch", eventType);

    const fixRequest = env.fixRequests[0];
    assert.equal(fixRequest.status, "paid", eventType);
    assert.equal(fixRequest.payment_id, "payment-paid", eventType);
    assert.equal(fixRequest.refund_id, undefined, eventType);
    assert.equal(fixRequest.dispute_event, undefined, eventType);
    const rejectedEvent = env.events.find((event) => event.event === "payment_identity_rejected");
    assert.equal(rejectedEvent.reason, "payment_id_mismatch", eventType);
    assert.equal(env.dodoWebhookEvents.at(-1).status, "ignored", eventType);
  }
});

test("signed second subscription active while the first entitlement is active grants zero duplicate entitlements", async () => {
  const env = await fakeBillingEnv();
  const first = await handleDodoWebhook(signedDodoWebhookRequest({
    type: "subscription.active",
    data: subscriptionEventData({ id: "sub-1", status: "active" })
  }, "wh_second_sub_1", env), env, null);
  assert.equal(first.status, 200);
  assert.equal(env.entitlements.length, 1);
  const firstEntitlementId = env.entitlements[0].id;

  const second = await handleDodoWebhook(signedDodoWebhookRequest({
    type: "subscription.active",
    data: subscriptionEventData({ id: "sub-2", status: "active" })
  }, "wh_second_sub_2", env), env, null);
  assert.equal(second.status, 200);
  const body = await second.json();
  assert.equal(body.received, true);
  assert.equal(body.ok, true);
  assert.equal(body.status, "processed");
  assert.equal(body.ignored, true);
  assert.equal(body.reason, "active_entitlement_exists");
  assert.equal(body.entitlementStatus, "active");
  assert.equal(body.entitlementId, firstEntitlementId);

  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].id, firstEntitlementId);
  assert.equal(env.entitlements[0].subscription_id, "sub-1");
  assert.equal(env.entitlements[0].status, "active");
  assert.equal(env.entitlements[0].revoked_at, null);
  const ignoredEvent = env.entitlementEvents.at(-1);
  assert.equal(ignoredEvent.event, "subscription_ignored");
  assert.equal(ignoredEvent.from_status, "active");
  assert.equal(ignoredEvent.to_status, "active");
  assert.equal(env.dodoWebhookEvents.length, 2);
  assert.ok(env.dodoWebhookEvents.every((row) => row.status === "processed"));
});

test("signed second subscription active after the first is cancelled grants exactly one fresh entitlement", async () => {
  const env = await fakeBillingEnv();
  await handleDodoWebhook(signedDodoWebhookRequest({
    type: "subscription.active",
    data: subscriptionEventData({ id: "sub-1", status: "active" })
  }, "wh_cancel_flow_1", env), env, null);
  const cancelled = await handleDodoWebhook(signedDodoWebhookRequest({
    type: "subscription.cancelled",
    data: subscriptionEventData({ id: "sub-1", status: "cancelled" })
  }, "wh_cancel_flow_2", env), env, null);
  assert.equal(cancelled.status, 200);

  const second = await handleDodoWebhook(signedDodoWebhookRequest({
    type: "subscription.active",
    data: subscriptionEventData({ id: "sub-2", status: "active" })
  }, "wh_cancel_flow_3", env), env, null);
  assert.equal(second.status, 200);
  const body = await second.json();
  assert.equal(body.ok, true);
  assert.equal(body.ignored, false);
  assert.equal(body.entitlementStatus, "active");

  assert.equal(env.entitlements.length, 2);
  const firstEntitlement = env.entitlements.find((row) => row.subscription_id === "sub-1");
  const secondEntitlement = env.entitlements.find((row) => row.subscription_id === "sub-2");
  assert.ok(firstEntitlement);
  assert.ok(secondEntitlement);
  assert.equal(firstEntitlement.status, "cancelled");
  assert.ok(firstEntitlement.revoked_at);
  assert.equal(secondEntitlement.status, "active");
  assert.equal(secondEntitlement.revoked_at, null);
  assert.equal(env.entitlements.filter((row) => row.status === "active").length, 1);
  assert.equal(env.entitlementEvents.at(-1).event, "subscription_active");
  assert.equal(env.dodoWebhookEvents.length, 3);
  assert.ok(env.dodoWebhookEvents.every((row) => row.status === "processed"));
});

test("signed second subscription adopts an unattached active entitlement instead of double-granting", async () => {
  const env = await fakeBillingEnv();
  const now = new Date().toISOString();
  env.entitlements.push({
    id: "ent-unattached",
    owner_email: "owner@example.com",
    offer_key: "proof_monitoring",
    status: "active",
    source: "beta",
    provider: "dodo",
    product_id: "pdt_monitoring",
    subscription_id: "",
    limits_json: "{}",
    current_period_start: "",
    current_period_end: "",
    created_at: now,
    updated_at: now,
    revoked_at: null
  });

  const response = await handleDodoWebhook(signedDodoWebhookRequest({
    type: "subscription.active",
    data: subscriptionEventData({ id: "sub-2", status: "active" })
  }, "wh_adopt_sub_2", env), env, null);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.ignored, false);
  assert.equal(body.entitlementStatus, "active");
  assert.equal(body.entitlementId, "ent-unattached");

  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].id, "ent-unattached");
  assert.equal(env.entitlements[0].subscription_id, "sub-2");
  assert.equal(env.entitlements[0].status, "active");
  assert.equal(env.entitlementEvents.at(-1).event, "subscription_active");
});

test("signed subscription.renewed reactivates the same entitlement row without a second grant", async () => {
  const env = await fakeBillingEnv();
  const first = await handleDodoWebhook(signedDodoWebhookRequest({
    type: "subscription.active",
    data: subscriptionEventData({ id: "sub-renew-1", status: "active" })
  }, "wh_renew_1", env), env, null);
  assert.equal(first.status, 200);
  assert.equal(env.entitlements.length, 1);
  const entitlementId = env.entitlements[0].id;

  const renewed = await handleDodoWebhook(signedDodoWebhookRequest({
    type: "subscription.renewed",
    data: subscriptionEventData({ id: "sub-renew-1", status: "active" })
  }, "wh_renew_2", env), env, null);
  assert.equal(renewed.status, 200);
  const body = await renewed.json();
  assert.equal(body.ok, true);
  assert.equal(body.ignored, false);
  assert.equal(body.entitlementStatus, "active");
  assert.equal(body.entitlementId, entitlementId);

  assert.equal(env.entitlements.length, 1);
  assert.equal(env.entitlements[0].id, entitlementId);
  assert.equal(env.entitlements[0].subscription_id, "sub-renew-1");
  assert.equal(env.entitlements[0].status, "active");
  assert.equal(env.entitlements[0].revoked_at, null);
  assert.equal(env.entitlementEvents.at(-1).event, "subscription_active");
  assert.equal(env.entitlementEvents.at(-1).from_status, "active");
});

async function withDodoPricing(callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    display_price: "$99.00",
    currency: "USD",
    total_amount: 9900
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

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
    DODO_SEOFIXKIT_PRODUCT_MONITORING_ID: "pdt_monitoring",
    DODO_SEOFIXKIT_CHECKOUT_HOST_ALLOWLIST: "checkout.example.com",
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
    siteClaims: [{
      id: "site-claim-1",
      owner_email: "owner@example.com",
      host: "example.com",
      status: "verified",
      revoked_at: null,
      updated_at: now
    }],
    auditSchedules: [{
      id: "schedule-1",
      owner_email: "owner@example.com",
      target_url: "https://example.com/",
      target_host: "example.com",
      status: "active",
      interval_days: 7,
      max_pages: 10,
      updated_at: now
    }],
    fixRequests: [],
    repairProposals: [],
    entitlements: [],
    entitlementEvents: [],
    dodoWebhookEvents: [],
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

function checkoutFixRequest(env, overrides = {}) {
  return {
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
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

function paymentEventData(env, overrides = {}) {
  return {
    id: overrides.id || "payment-1",
    checkout_session_id: overrides.checkout_session_id || "dodo-session-1",
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: "owner@example.com" },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: overrides.fixRequestId || env.fixRequests[0]?.id || "fix-request-1",
      report_id: env.reportId,
      repair_issue_id: "issue-1",
      repair_queue_item_id: "queue-1",
      repair_title: "Missing title",
      ...(overrides.metadata || {})
    }
  };
}

function subscriptionEventData(overrides = {}) {
  const payload = {
    id: overrides.id || "sub-1",
    subscription_id: overrides.subscription_id || overrides.id || "sub-1",
    status: overrides.status || "active",
    brand_id: overrides.brand_id || "brand-1",
    customer: { email: overrides.customerEmail || "owner@example.com" },
    product_cart: overrides.product_cart === undefined
      ? [{ product_id: overrides.product_id || "pdt_monitoring", quantity: overrides.quantity || 1 }]
      : overrides.product_cart,
    current_period_start: "2026-06-20T00:00:00.000Z",
    current_period_end: "2026-07-20T00:00:00.000Z",
    metadata: {
      product_key: "seofixkit_proof_monitoring",
      offer_key: "proof_monitoring",
      owner_email: "owner@example.com",
      target_host: "example.com",
      site_claim_id: "site-claim-1",
      audit_schedule_id: "schedule-1",
      ...(overrides.metadata || {})
    }
  };
  if (overrides.useTopLevelProduct) {
    delete payload.product_cart;
    payload.product_id = overrides.product_id || "pdt_monitoring";
    payload.quantity = overrides.quantity || 1;
  }
  return payload;
}

function signedDodoWebhookRequest(payload, webhookId, env, options = {}) {
  const body = JSON.stringify(payload);
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp
  };
  if (options.includeSignature !== false) {
    const secret = options.secret ?? env.DODO_SEOFIXKIT_WEBHOOK_SECRET;
    const signature = createHmac("sha256", dodoWebhookSecretBytes(secret))
      .update(`${webhookId}.${timestamp}.${body}`)
      .digest("base64");
    headers["webhook-signature"] = `v1=${signature}`;
  }
  return new Request("https://seofixkit.test/api/webhooks/dodo", {
    method: "POST",
    headers,
    body
  });
}

function dodoWebhookSecretBytes(secret) {
  const normalized = String(secret || "").trim().replace(/^whsec_/, "");
  try {
    return Buffer.from(atob(normalized), "binary");
  } catch {
    return Buffer.from(secret);
  }
}

function statement(sql, values, env) {
  return {
    first: async () => first(sql, values, env),
    all: async () => all(sql, values, env),
    run: async () => run(sql, values, env)
  };
}

function snapshot(row) {
  return row ? { ...row } : row;
}

function first(sql, values, env) {
  if (sql.includes("FROM beta_sessions")) {
    return snapshot(env.sessions.find((row) => row.token_hash === values[0])) || null;
  }
  if (sql.includes("SELECT checkout_repair_json FROM fix_requests")) {
    if (env.missingCheckoutRepairColumn) throw new Error("no such column: checkout_repair_json");
    return env.fixRequests[0] ? { checkout_repair_json: env.fixRequests[0].checkout_repair_json || "" } : null;
  }
  if (sql.includes("FROM dodo_webhook_events")) {
    return snapshot(env.dodoWebhookEvents.find((row) => row.webhook_id === values[0])) || null;
  }
  if (sql.includes("FROM fix_requests") && sql.includes("WHERE id = ?")) {
    return snapshot(env.fixRequests.find((row) => row.id === values[0])) || null;
  }
  if (sql.includes("FROM fix_requests") && sql.includes("WHERE checkout_session_id = ?")) {
    return snapshot(env.fixRequests.find((row) => row.checkout_session_id === values[0])) || null;
  }
  if (sql.includes("FROM fix_requests") && sql.includes("WHERE payment_id = ?")) {
    return snapshot(env.fixRequests.find((row) => row.payment_id === values[0])) || null;
  }
  if (sql.includes("SELECT COUNT(*) AS count") && sql.includes("FROM audit_schedules")) {
    const [ownerEmail] = values;
    return {
      count: env.auditSchedules.filter((row) => row.owner_email === ownerEmail && row.status === "active").length
    };
  }
  if (sql.includes("FROM offer_entitlements") && sql.includes("provider = 'dodo'")) {
    if (env.missingEntitlementSchema) throw new Error("no such table: offer_entitlements");
    const [subscriptionId, offerKey] = values;
    return snapshot(env.entitlements.find((row) =>
      row.provider === "dodo" &&
      row.subscription_id === subscriptionId &&
      row.offer_key === offerKey
    )) || null;
  }
  if (sql.includes("FROM offer_entitlements") && sql.includes("owner_email = ?")) {
    if (env.missingEntitlementSchema) throw new Error("no such table: offer_entitlements");
    // Mirror the SQL text: the active-entitlement lookup excludes revoked rows
    // only while the statement actually carries `AND revoked_at IS NULL`, so a
    // mutation dropping that predicate changes mock behavior verbatim.
    const excludesRevoked = sql.includes("AND revoked_at IS NULL");
    const [ownerEmail, offerKey] = values;
    return snapshot(env.entitlements.find((row) =>
      row.owner_email === ownerEmail &&
      row.offer_key === offerKey &&
      (!excludesRevoked || !row.revoked_at)
    )) || null;
  }
  if (sql.includes("FROM offer_entitlements")) {
    if (env.missingEntitlementSchema) throw new Error("no such table: offer_entitlements");
    return snapshot(env.entitlements[0]) || null;
  }
  if (sql.includes("FROM offer_entitlement_events")) {
    if (env.missingEntitlementEventsSchema) throw new Error("no such table: offer_entitlement_events");
    return env.entitlementEvents[0] || null;
  }
  if (sql.includes("FROM audit_reports")) {
    return env.reports.find((row) => row.id === values[0]) || null;
  }
  if (sql.includes("FROM repair_queue_items")) {
    if (env.repairTablesMissing) throw new Error("no such table: repair_queue_items");
    const [id, reportId, ownerEmail] = values;
    return snapshot(env.queueItems.find((row) =>
      row.id === id &&
      row.report_id === reportId &&
      row.owner_email === ownerEmail
    )) || null;
  }
  if (sql.includes("FROM fix_requests")) {
    const [reportId, ownerEmail] = values;
    return snapshot(env.fixRequests.find((row) => row.report_id === reportId && row.owner_email === ownerEmail)) || null;
  }
  throw new Error(`Unexpected first SQL: ${sql}`);
}

function all(sql, values, env) {
  if (sql.includes("FROM fix_requests") && sql.includes("WHERE owner_email = ?")) {
    const [ownerEmail] = values;
    return {
      results: env.fixRequests
        .filter((row) => row.owner_email === ownerEmail && Number(row.is_test || 0) === 0)
        .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    };
  }
  if (sql.includes("FROM repair_proposals") && sql.includes("GROUP BY fix_request_id")) {
    if (env.repairProposalsMissing) throw new Error("no such table: repair_proposals");
    const ownerFiltered = sql.includes("owner_email = ?");
    const ownerEmail = ownerFiltered ? values[values.length - 1] : "";
    const ids = new Set(ownerFiltered ? values.slice(0, -1) : values);
    const grouped = new Map();
    for (const proposal of env.repairProposals.filter((row) =>
      ids.has(row.fix_request_id) &&
      (!ownerEmail || row.owner_email === ownerEmail)
    )) {
      const current = grouped.get(proposal.fix_request_id) || {
        fix_request_id: proposal.fix_request_id,
        total: 0,
        approved: 0,
        approved_executable: 0,
        dismissed: 0,
        executable: 0,
        delivered: 0
      };
      current.total += 1;
      if (proposal.approval_status === "approved") current.approved += 1;
      if (proposal.approval_status === "approved" && proposal.execution_mode !== "unsupported") {
        current.approved_executable += 1;
      }
      if (proposal.approval_status === "dismissed") current.dismissed += 1;
      if (proposal.execution_mode !== "unsupported") current.executable += 1;
      if (proposal.delivery_status === "delivered") current.delivered += 1;
      grouped.set(proposal.fix_request_id, current);
    }
    return { results: [...grouped.values()] };
  }
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
  if (sql.includes("FROM repair_proposals")) {
    const [fixRequestId] = values;
    return { results: env.repairProposals.filter((row) => row.fix_request_id === fixRequestId) };
  }
  if (sql.includes("FROM site_claims")) {
    const [ownerEmail] = values;
    return {
      results: env.siteClaims.filter((row) =>
        row.owner_email === ownerEmail &&
        row.status === "verified" &&
        !row.revoked_at
      )
    };
  }
  if (sql.includes("FROM audit_schedules")) {
    const [ownerEmail] = values;
    return {
      results: env.auditSchedules.filter((row) =>
        row.owner_email === ownerEmail &&
        row.status === "active"
      )
    };
  }
  if (sql.includes("FROM offer_entitlements")) {
    if (env.missingEntitlementSchema) throw new Error("no such table: offer_entitlements");
    const [ownerEmail] = values;
    return {
      results: env.entitlements.filter((row) =>
        row.owner_email === ownerEmail &&
        !row.revoked_at
      )
    };
  }
  throw new Error(`Unexpected all SQL: ${sql}`);
}

function run(sql, values, env) {
  if (sql.includes("UPDATE beta_sessions")) return { meta: { changes: 1 } };
  if (sql.includes("INSERT OR IGNORE INTO dodo_webhook_events")) {
    if (values.some((value) => value === undefined)) {
      throw new Error("D1_TYPE_ERROR: undefined bind value");
    }
    const existing = env.dodoWebhookEvents.find((row) => row.webhook_id === values[0]);
    if (existing) return { meta: { changes: 0 } };
    env.dodoWebhookEvents.push({
      webhook_id: values[0],
      event_type: values[1],
      payment_id: values[2],
      fix_request_id: values[3],
      status: "received",
      error: "",
      payload_hash: values[4],
      payload_json: values[5],
      received_count: 1,
      first_received_at: values[6],
      last_received_at: values[7],
      processed_at: "",
      created_at: values[8],
      updated_at: values[9]
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("UPDATE dodo_webhook_events") && sql.includes("received_count = received_count + 1")) {
    const row = env.dodoWebhookEvents.find((item) => item.webhook_id === values[2]);
    if (row) {
      row.received_count += 1;
      row.last_received_at = values[0];
      row.updated_at = values[1];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE dodo_webhook_events") && sql.includes("SET status = ?")) {
    const row = env.dodoWebhookEvents.find((item) => item.webhook_id === values[5]);
    if (row) {
      row.status = values[0];
      row.error = values[1];
      row.fix_request_id = row.fix_request_id || values[2];
      row.processed_at = values[3];
      row.updated_at = values[4];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
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
  if (sql.includes("INSERT OR IGNORE INTO repair_proposals")) {
    if (!env.repairProposals.some((row) => row.fix_request_id === values[1] && row.issue_id === values[4])) {
      env.repairProposals.push({
        id: values[0],
        fix_request_id: values[1],
        report_id: values[2],
        owner_email: values[3],
        issue_id: values[4],
        issue_title: values[5],
        target_url: values[6],
        target_host: values[7],
        severity: values[8],
        source: values[9],
        priority: values[10],
        execution_mode: values[11],
        approval_status: values[12],
        delivery_status: values[13],
        generated_title: values[14],
        generated_summary: values[15],
        proof_json: values[16],
        proposal_json: values[17],
        acceptance_json: values[18],
        created_at: values[19],
        updated_at: values[20]
      });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
  if (sql.includes("INSERT INTO offer_entitlements")) {
    env.entitlements.push({
      id: values[0],
      owner_email: values[1],
      offer_key: values[2],
      status: "active",
      source: "dodo_subscription",
      provider: "dodo",
      product_id: values[3],
      subscription_id: values[4],
      limits_json: values[5],
      current_period_start: values[6],
      current_period_end: values[7],
      created_at: values[8],
      updated_at: values[9],
      revoked_at: null
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("UPDATE offer_entitlements") && sql.includes("status = 'active'")) {
    const row = env.entitlements.find((item) => item.id === values[6]);
    if (row) {
      row.status = "active";
      row.source = "dodo_subscription";
      row.provider = "dodo";
      row.product_id = values[0];
      row.subscription_id = values[1];
      row.limits_json = values[2];
      row.current_period_start = values[3];
      row.current_period_end = values[4];
      row.revoked_at = null;
      row.updated_at = values[5];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE offer_entitlements") && sql.includes("revoked_at")) {
    const row = env.entitlements.find((item) => item.id === values[4]);
    if (row) {
      row.status = values[0];
      row.revoked_at = row.revoked_at || values[1];
      row.current_period_end = values[2] || row.current_period_end;
      row.updated_at = values[3];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("INSERT INTO offer_entitlement_events")) {
    if (env.missingEntitlementEventsSchema) throw new Error("no such table: offer_entitlement_events");
    env.entitlementEvents.push({
      id: values[0],
      entitlement_id: values[1],
      owner_email: values[2],
      offer_key: values[3],
      event: values[4],
      from_status: values[5],
      to_status: values[6],
      detail_json: values[7],
      created_at: values[8]
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
  if (sql.includes("UPDATE fix_requests") && sql.includes("payment_amount = ?")) {
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
  // The failure/refund/dispute arms below mirror the CASE and COALESCE
  // expressions in the statement text, so a mutation to billing.js that
  // changes the SQL semantics changes mock behavior verbatim instead of
  // being masked by the harness.
  if (sql.includes("UPDATE fix_requests") && sql.includes("WHEN paid_at")) {
    const row = env.fixRequests.find((item) => item.id === values[3]);
    if (row) {
      const paidPreservesStatus = sql.includes("WHEN paid_at IS NOT NULL");
      const failureStatus = (sql.match(/ELSE '([^']+)'/) || [])[1] || "payment_failed";
      row.status = paidPreservesStatus
        ? (row.paid_at ? row.status : failureStatus)
        : (row.paid_at ? failureStatus : row.status);
      row.payment_id = sql.includes("COALESCE(payment_id,") ? (row.payment_id || values[0]) : values[0];
      row.checkout_session_id = sql.includes("COALESCE(checkout_session_id,") ? (row.checkout_session_id || values[1]) : values[1];
      row.updated_at = values[2];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE fix_requests") && sql.includes("refund_id = ?")) {
    const row = env.fixRequests.find((item) => item.id === values[5]);
    if (row) {
      row.status = sql.includes("status = 'refunded'") ? "refunded" : "paid";
      row.refund_id = values[0];
      row.refund_amount = values[1];
      row.refund_currency = values[2];
      row.refunded_at = sql.includes("COALESCE(refunded_at,") ? (row.refunded_at || values[3]) : values[3];
      row.updated_at = values[4];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE fix_requests") && sql.includes("refund_failed")) {
    const row = env.fixRequests.find((item) => item.id === values[4]);
    if (row) {
      row.status = sql.includes("WHEN status = 'refunded'")
        ? (row.status === "refunded" ? "refunded" : "refund_failed")
        : "refund_failed";
      row.refund_id = sql.includes("COALESCE(refund_id,") ? (row.refund_id || values[0]) : values[0];
      row.refund_amount = sql.includes("COALESCE(refund_amount,") ? (row.refund_amount || values[1]) : values[1];
      row.refund_currency = sql.includes("COALESCE(refund_currency,") ? (row.refund_currency || values[2]) : values[2];
      row.updated_at = values[3];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE fix_requests") && sql.includes("dispute_event")) {
    const row = env.fixRequests.find((item) => item.id === values[3]);
    if (row) {
      const disputeStatus = sql.includes("ELSE 'disputed'") ? "disputed" : "paid";
      row.status = sql.includes("WHEN status = 'delivered'")
        ? (row.status === "delivered" ? "delivered" : disputeStatus)
        : disputeStatus;
      row.dispute_event = values[0];
      row.disputed_at = sql.includes("COALESCE(disputed_at,") ? (row.disputed_at || values[1]) : values[1];
      row.updated_at = values[2];
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
  if (sql.includes("UPDATE audit_reports") || sql.includes("UPDATE audit_jobs")) {
    return { meta: { changes: 1 } };
  }
  throw new Error(`Unexpected run SQL: ${sql}`);
}
