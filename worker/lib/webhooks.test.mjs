import assert from "node:assert/strict";
import test from "node:test";
import { deliverApiWebhook, deliverApiWebhooks } from "./webhooks.js";

test("deliverApiWebhooks retries transient failure and keeps one event row", async () => {
  const env = fakeWebhookEnv();
  let fetchCalls = 0;
  const fetcher = async () => {
    fetchCalls += 1;
    return new Response("", { status: fetchCalls === 1 ? 503 : 200 });
  };

  await deliverApiWebhooks(env, "owner@example.com", "audit.completed", {
    audit: { audit_id: "audit-1", report_id: "report-1" }
  }, {
    fetcher,
    resolvesToPrivateAddress: async () => false,
    sleep: async () => {}
  });

  assert.equal(fetchCalls, 2);
  assert.equal(env.events.length, 1);
  assert.equal(env.events[0].status, "delivered");
  assert.equal(env.events[0].http_status, 200);
  assert.equal(env.webhooks[0].last_delivery_status, "delivered");
});

test("deliverApiWebhook does not retry non-transient client errors", async () => {
  let fetchCalls = 0;
  const result = await deliverApiWebhook(fakeWebhookEnv(), fakeWebhook(), "audit.completed", "{}", {
    fetcher: async () => {
      fetchCalls += 1;
      return new Response("", { status: 400 });
    },
    resolvesToPrivateAddress: async () => false,
    sleep: async () => {},
    maxAttempts: 3,
    timeoutMs: 1000,
    eventBudgetMs: 3000
  });

  assert.equal(fetchCalls, 1);
  assert.deepEqual(result, { status: "failed", httpStatus: 400, error: "HTTP 400" });
});

test("deliverApiWebhook records timeout failure", async () => {
  const result = await deliverApiWebhook(fakeWebhookEnv(), fakeWebhook(), "audit.completed", "{}", {
    fetcher: async (_url, options = {}) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    resolvesToPrivateAddress: async () => false,
    sleep: async () => {},
    maxAttempts: 1,
    timeoutMs: 1,
    eventBudgetMs: 1000
  });

  assert.equal(result.status, "failed");
  assert.equal(result.httpStatus, 0);
  assert.match(result.error, /timed out/);
});

test("deliverApiWebhook rechecks private DNS before retrying", async () => {
  let fetchCalls = 0;
  let resolverCalls = 0;
  const result = await deliverApiWebhook(fakeWebhookEnv(), fakeWebhook(), "audit.completed", "{}", {
    fetcher: async () => {
      fetchCalls += 1;
      return new Response("", { status: 503 });
    },
    resolvesToPrivateAddress: async () => {
      resolverCalls += 1;
      return resolverCalls > 1;
    },
    sleep: async () => {},
    maxAttempts: 3,
    timeoutMs: 1000,
    eventBudgetMs: 3000
  });

  assert.equal(fetchCalls, 1);
  assert.equal(resolverCalls, 2);
  assert.deepEqual(result, {
    status: "failed",
    httpStatus: 503,
    error: "Webhook host resolves to a private or internal address."
  });
});

function fakeWebhook() {
  return {
    id: "webhook-1",
    owner_email: "owner@example.com",
    url: "https://hooks.example.com/seo",
    events_json: JSON.stringify(["audit.completed"]),
    status: "active",
    revoked_at: null
  };
}

function fakeWebhookEnv() {
  const env = {
    SEOFIXKIT_API_WEBHOOK_SECRET: "test-secret",
    SEOFIXKIT_WEBHOOK_MAX_ATTEMPTS: "3",
    SEOFIXKIT_WEBHOOK_TIMEOUT_MS: "1000",
    SEOFIXKIT_WEBHOOK_EVENT_BUDGET_MS: "3000",
    webhooks: [fakeWebhook()],
    events: [],
    WAITLIST_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return statement(sql, values, env);
          }
        };
      },
      batch(statements) {
        return Promise.all(statements.map((item) => item.run()));
      }
    }
  };
  return env;
}

function statement(sql, values, env) {
  return {
    all: async () => {
      if (sql.includes("FROM api_webhooks")) return { results: env.webhooks };
      throw new Error(`Unexpected all SQL: ${sql}`);
    },
    run: async () => {
      if (sql.includes("INSERT INTO api_webhook_events")) {
        env.events.push({
          id: values[0],
          webhook_id: values[1],
          owner_email: values[2],
          event_type: values[3],
          audit_job_id: values[4],
          report_id: values[5],
          status: values[6],
          http_status: values[7],
          error: values[8],
          payload_json: values[9],
          created_at: values[10],
          delivered_at: values[11]
        });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE api_webhook_events")) {
        const failedUpdate = sql.includes("SET status = 'failed'");
        const event = env.events.find((row) => row.id === values[failedUpdate ? 2 : 4]);
        Object.assign(event, failedUpdate
          ? {
              status: "failed",
              error: values[0],
              delivered_at: values[1]
            }
          : {
              status: values[0],
              http_status: values[1],
              error: values[2],
              delivered_at: values[3]
            });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE api_webhooks")) {
        const failedUpdate = sql.includes("last_delivery_status = 'failed'");
        const webhook = env.webhooks.find((row) => row.id === values[failedUpdate ? 3 : 4]);
        Object.assign(webhook, failedUpdate
          ? {
              last_delivery_at: values[0],
              last_delivery_status: "failed",
              last_error: values[1],
              updated_at: values[2]
            }
          : {
              last_delivery_at: values[0],
              last_delivery_status: values[1],
              last_error: values[2],
              updated_at: values[3]
            });
        return { meta: { changes: 1 } };
      }
      throw new Error(`Unexpected run SQL: ${sql}`);
    }
  };
}
