import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNNEL_STEPS,
  isFunnelStep,
  stepIndex,
  recordAccessEvent,
  summarizeAccessEvents
} from "./access-events.js";

function makePrepared() {
  const calls = [];
  const stmt = {
    bind: (...args) => {
      calls.push(args);
      return stmt;
    },
    all: async () => ({ results: [] }),
    first: async () => null,
    run: async () => ({ meta: { changes: 1 } })
  };
  return { stmt, calls };
}

function makeEnv() {
  const prepared = makePrepared();
  return {
    env: {
      WAITLIST_DB: {
        prepare: (sql) => {
          prepared.calls.push({ sql });
          return prepared.stmt;
        }
      }
    },
    prepared
  };
}

test("FUNNEL_STEPS is a stable, ordered source of truth", () => {
  assert.deepEqual(FUNNEL_STEPS.slice(), [
    "beta_view",
    "beta_input",
    "beta_submit",
    "access_requested",
    "access_link_sent",
    "access_link_verified",
    "session_created",
    "audit_started"
  ]);
  for (const step of FUNNEL_STEPS) {
    assert.equal(isFunnelStep(step), true, `${step} should be a known step`);
    assert.ok(stepIndex(step) !== null, `${step} should have an index`);
  }
  assert.equal(isFunnelStep("not_a_real_step"), false);
  assert.equal(stepIndex("not_a_real_step"), null);
});

test("recordAccessEvent inserts known steps and ignores unknown steps", async () => {
  const { env, prepared } = makeEnv();
  const result = await recordAccessEvent(env, {
    step: "beta_view",
    funnelKey: "anon_abc",
    source: "homepage-access",
    landingPath: "/?utm_source=test",
    request: {
      headers: {
        get(name) {
          if (name === "referer") return "https://example.com/";
          if (name === "user-agent") return "Mozilla/5.0";
          return null;
        }
      },
      cf: { country: "US" }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(prepared.calls.length >= 1, true);
  const insertCall = prepared.calls.find((c) => Array.isArray(c));
  assert.ok(insertCall, "expected an insert call");
  assert.equal(insertCall[0], "beta_view");
  assert.equal(insertCall[1], "anon_abc");
  assert.equal(insertCall[2], "");
  assert.equal(insertCall[3], "homepage-access");
  assert.equal(insertCall[4], "/?utm_source=test");
  assert.equal(insertCall[5], "https://example.com/");
  assert.equal(insertCall[6], "Mozilla/5.0");
  assert.equal(insertCall[7], "US");

  const bad = await recordAccessEvent(env, { step: "anything_else" });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "unknown_step");
});

test("recordAccessEvent returns no_storage when WAITLIST_DB is missing", async () => {
  const result = await recordAccessEvent({}, { step: "beta_view" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_storage");
});

test("recordAccessEvent never throws when the insert fails", async () => {
  const env = {
    WAITLIST_DB: {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error("d1 down");
          }
        })
      })
    }
  };
  const result = await recordAccessEvent(env, { step: "beta_input" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "insert_failed");
});

test("recordAccessEvent normalizes owner email and invalid funnel keys", async () => {
  const { env, prepared } = makeEnv();
  await recordAccessEvent(env, {
    step: "beta_submit",
    funnelKey: "ab c/d$e",
    ownerEmail: "  Foo@Example.COM  ",
    source: "beta-gate-access"
  });
  const insertCall = prepared.calls.find((c) => Array.isArray(c));
  assert.equal(insertCall[1], "abcde");
  assert.equal(insertCall[2], "foo@example.com");
});

test("summarizeAccessEvents returns funnel counts and conversion rates", async () => {
  const counts = {
    beta_view: 100,
    beta_input: 40,
    beta_submit: 10,
    access_requested: 8,
    access_link_sent: 7,
    access_link_verified: 5,
    session_created: 4,
    audit_started: 2
  };
  const groupStmt = {
    bind: () => ({
      all: async () => ({
        results: Object.entries(counts).map(([step, count]) => ({ step, count }))
      })
    })
  };
  const uniqueStmt = {
    bind: () => ({
      first: async () => ({ uniqueFunnelKeys: 95, uniqueEmails: 6 })
    })
  };
  const env = {
    WAITLIST_DB: {
      prepare: (sql) => {
        if (/GROUP BY step/i.test(sql)) return groupStmt;
        if (/COUNT\(DISTINCT/i.test(sql)) return uniqueStmt;
        return { bind: () => ({ all: async () => ({ results: [] }), first: async () => null }) };
      }
    }
  };
  const summary = await summarizeAccessEvents(env, { windowMs: 7 * 24 * 60 * 60 * 1000 });
  assert.equal(summary.ok, true);
  assert.equal(summary.steps.beta_view, 100);
  assert.equal(summary.steps.session_created, 4);
  assert.equal(summary.conversionPct.beta_view, 100);
  assert.equal(summary.conversionPct.session_created, 4);
  assert.equal(summary.totals.uniqueFunnelKeys, 95);
  assert.equal(summary.totals.uniqueEmails, 6);
});

test("summarizeAccessEvents degrades gracefully when storage is missing", async () => {
  const summary = await summarizeAccessEvents({}, { windowMs: 1000 });
  assert.equal(summary.ok, false);
  assert.equal(summary.reason, "no_storage");
});
