import assert from "node:assert/strict";
import test from "node:test";
import { isFunnelStep, FUNNEL_STEPS } from "../lib/access-events.js";
import {
  recordAccessBeacon,
  requestAccessLink
} from "./access.js";

function makeAccessEnv() {
  const inserts = [];
  let accessTokens = [];
  const stmt = {
    bind: (...args) => {
      inserts.push(args);
      return stmt;
    },
    all: async () => ({ results: [], meta: { changes: 0 } }),
    first: async () => null,
    run: async () => ({ meta: { changes: 1 } })
  };
  const env = {
    WAITLIST_DB: {
      prepare: (sql) => {
        if (/INSERT INTO access_events/i.test(sql)) {
          return {
            bind: (...args) => {
              inserts.push({ sql, args });
              return { run: async () => ({ meta: { changes: 1 } }) };
            }
          };
        }
        if (/INSERT INTO waitlist_leads/i.test(sql)) {
          return {
            bind: (...args) => {
              inserts.push({ sql, args });
              return { run: async () => ({ meta: { changes: 1 } }) };
            }
          };
        }
        if (/INSERT INTO access_tokens/i.test(sql)) {
          return {
            bind: (...args) => {
              inserts.push({ sql, args });
              accessTokens.push(args);
              return { run: async () => ({ meta: { changes: 1 } }) };
            }
          };
        }
        if (/audit_usage/i.test(sql)) {
          return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) };
        }
        return stmt;
      }
    },
    EMAIL: { send: async () => ({ ok: true, id: "mock-email" }) },
    SEOFIXKIT_EMAIL_FROM: "beta@seofixkit.test",
    _inserts: inserts,
    _accessTokens: accessTokens
  };
  return env;
}

function makeRequest({ url = "https://seofixkit.test/api/access/request", method = "POST", body, headers = {} } = {}) {
  const init = { method, headers: new Headers(headers) };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(url, init);
}

test("FUNNEL_STEPS is shared with the routes and the helper", () => {
  for (const step of FUNNEL_STEPS) {
    assert.equal(isFunnelStep(step), true);
  }
});

test("recordAccessBeacon accepts a known step and silently rejects unknown steps", async () => {
  const env = makeAccessEnv();
  const ok = await recordAccessBeacon(makeRequest({ body: { step: "beta_view", funnelKey: "fk_1" } }), env);
  assert.equal(ok.status, 204);
  const unknown = await recordAccessBeacon(makeRequest({ body: { step: "rogue" } }), env);
  assert.equal(unknown.status, 204);
  const accessEventInserts = env._inserts.filter((entry) => /INSERT INTO access_events/i.test(entry.sql));
  assert.equal(accessEventInserts.length, 1);
  assert.equal(accessEventInserts[0].args[0], "beta_view");
  assert.equal(accessEventInserts[0].args[1], "fk_1");
});

test("recordAccessBeacon tolerates empty bodies and never inserts when step is invalid", async () => {
  const env = makeAccessEnv();
  const response = await recordAccessBeacon(makeRequest({ body: "" }), env);
  assert.equal(response.status, 204);
  const inserts = env._inserts.filter((entry) => /INSERT INTO access_events/i.test(entry.sql));
  assert.equal(inserts.length, 0);
});

test("requestAccessLink records access_requested then access_link_sent in order", async () => {
  const env = makeAccessEnv();
  const request = makeRequest({
    body: {
      email: "Founder@Example.com",
      funnelKey: "fk_abc",
      landingPath: "/beta?invite=pending",
      source: "beta-gate-access"
    }
  });
  const response = await requestAccessLink(request, env);
  assert.equal(response.status, 200);
  const eventRows = env._inserts
    .filter((entry) => /INSERT INTO access_events/i.test(entry.sql))
    .map((entry) => entry.args[0]);
  assert.ok(eventRows.includes("access_requested"), "expected access_requested event");
  assert.ok(eventRows.includes("access_link_sent"), "expected access_link_sent event");
  const sentRow = env._inserts.find(
    (entry) => /INSERT INTO access_events/i.test(entry.sql) && entry.args[0] === "access_link_sent"
  );
  assert.equal(sentRow.args[2], "founder@example.com");
  assert.equal(sentRow.args[1], "fk_abc");
});

test("requestAccessLink does not record events when email is missing", async () => {
  const env = makeAccessEnv();
  const response = await requestAccessLink(makeRequest({ body: { funnelKey: "fk_x" } }), env);
  assert.equal(response.status, 400);
  const eventRows = env._inserts.filter((entry) => /INSERT INTO access_events/i.test(entry.sql));
  assert.equal(eventRows.length, 0);
});

import { getFunnelSummary } from "./admin.js";

function adminRequest(path, env) {
  return new Request(`https://seofixkit.test${path}`, {
    headers: { authorization: `Bearer ${env.ADMIN_EXPORT_TOKEN}` }
  });
}

function makeAdminEnv() {
  const prepared = {
    all: async () => ({ results: [] }),
    first: async () => null,
    run: async () => ({ meta: { changes: 1 } })
  };
  return {
    ADMIN_EXPORT_TOKEN: "test-admin-token",
    WAITLIST_DB: {
      prepare: (sql) => {
        if (/INSERT INTO admin_audit_log/i.test(sql)) {
          return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) };
        }
        if (/INSERT INTO audit_usage/i.test(sql)) {
          return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) };
        }
        return {
          bind: (...args) => {
            if (/GROUP BY step/i.test(sql)) {
              return {
                all: async () => ({
                  results: [
                    { step: "beta_view", count: 10 },
                    { step: "session_created", count: 2 }
                  ]
                })
              };
            }
            if (/COUNT\(DISTINCT/i.test(sql)) {
              return { first: async () => ({ uniqueFunnelKeys: 9, uniqueEmails: 2 }) };
            }
            return { first: async () => null, all: async () => ({ results: [] }) };
          }
        };
      }
    }
  };
}

test("getFunnelSummary returns steps and conversion rates for an authorized admin", async () => {
  const env = makeAdminEnv();
  const response = await getFunnelSummary(adminRequest("/admin/funnel?windowDays=7", env), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.windowDays, 7);
  assert.equal(body.steps.beta_view, 10);
  assert.equal(body.steps.session_created, 2);
  assert.equal(body.conversionPct.session_created, 20);
  assert.equal(body.totals.uniqueFunnelKeys, 9);
  assert.equal(body.totals.uniqueEmails, 2);
});

test("getFunnelSummary rejects callers without a valid admin token", async () => {
  const env = makeAdminEnv();
  const response = await getFunnelSummary(
    new Request("https://seofixkit.test/admin/funnel"),
    env
  );
  assert.equal(response.status, 401);
});
