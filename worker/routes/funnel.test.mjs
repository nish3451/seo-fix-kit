import assert from "node:assert/strict";
import test from "node:test";
import { requestAccessLink } from "./access.js";
import {
  FUNNEL_EVENT_NAMES,
  FUNNEL_IP_HOURLY_LIMIT,
  FUNNEL_RETENTION_DAYS,
  getFunnelSummary,
  recordFunnelEvent,
  sanitizeFunnelEvent,
  trackFunnelEvent
} from "./funnel.js";
import { hourWindow } from "../lib/text.js";
import { requestIpHash } from "../lib/security.js";

test("funnel event names are allow-listed", () => {
  for (const name of FUNNEL_EVENT_NAMES) {
    const clean = sanitizeFunnelEvent({ event: name, page: "/" });
    assert.equal(clean.ok, true, `${name} must be allowed`);
    assert.equal(clean.eventName, name);
  }
  assert.equal(sanitizeFunnelEvent({ event: "click", page: "/" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "", page: "/" }).ok, false);
  assert.equal(sanitizeFunnelEvent({}).ok, false);
});

test("funnel page paths reject query strings, fragments, and PII-shaped input", () => {
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/" }).ok, true);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/demo" }).ok, true);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/check" }).ok, true);

  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/demo?email=x@y.com" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/demo?utm_source=ads" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/demo#top" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "demo" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "https://evil.example/" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/a/../b" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/a//b" }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: "/".repeat(300) }).ok, false);
  assert.equal(sanitizeFunnelEvent({ event: "page_view", page: " " }).ok, false);
});

test("trackFunnelEvent records a valid first-party event", async () => {
  const store = fakeStore();
  const env = { WAITLIST_DB: fakeDb(store) };
  const response = await trackFunnelEvent(
    new Request("https://seofixkit.com/api/funnel-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "cta_activation", page: "/check" })
    }),
    env
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(store.funnelEvents.length, 1);
  assert.equal(store.funnelEvents[0].event_name, "cta_activation");
  assert.equal(store.funnelEvents[0].page_path, "/check");
  assert.ok(store.funnelEvents[0].created_at, "timestamp is recorded");
});

test("trackFunnelEvent rejects unknown events and unsafe page paths", async () => {
  const store = fakeStore();
  const env = { WAITLIST_DB: fakeDb(store) };
  const unknown = await trackFunnelEvent(
    new Request("https://seofixkit.com/api/funnel-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "click", page: "/" })
    }),
    env
  );
  assert.equal(unknown.status, 400);

  const withQuery = await trackFunnelEvent(
    new Request("https://seofixkit.com/api/funnel-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "page_view", page: "/?email=visitor@example.com" })
    }),
    env
  );
  assert.equal(withQuery.status, 400);
  assert.equal(store.funnelEvents.length, 0, "nothing may be stored for invalid input");
});

test("trackFunnelEvent is rate-limited per network per hour", async () => {
  const store = fakeStore();
  const env = { WAITLIST_DB: fakeDb(store) };
  const seededRequest = new Request("https://seofixkit.com/api/funnel-event", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({ event: "page_view", page: "/" })
  });
  const bucket = `funnel:ip-hour:${hourWindow(new Date()).key}:${await requestIpHash(seededRequest)}`;
  store.quota[bucket] = FUNNEL_IP_HOURLY_LIMIT;

  const response = await trackFunnelEvent(seededRequest, env);
  assert.equal(response.status, 429);
  assert.equal(store.funnelEvents.length, 0);
});

test("recordFunnelEvent is best-effort and never throws", async () => {
  const store = fakeStore();
  const env = { WAITLIST_DB: fakeDb(store) };
  const result = await recordFunnelEvent(env, { eventName: "page_view", pagePath: "/demo" });
  assert.equal(result.ok, true);
  assert.equal(store.funnelEvents.length, 1);

  const broken = await recordFunnelEvent({ WAITLIST_DB: null }, { eventName: "page_view", pagePath: "/" });
  assert.equal(broken.ok, false);

  const throwingEnv = {
    WAITLIST_DB: { prepare: () => { throw new Error("db down"); } }
  };
  const swallowed = await recordFunnelEvent(throwingEnv, { eventName: "page_view", pagePath: "/" });
  assert.equal(swallowed.ok, false);
});

test("funnel summary requires admin auth and returns counts without PII", async () => {
  const store = fakeStore();
  const today = new Date().toISOString().slice(0, 10);
  store.funnelEvents.push(
    { id: "1", event_name: "page_view", page_path: "/", created_at: `${today}T01:00:00.000Z` },
    { id: "2", event_name: "page_view", page_path: "/demo", created_at: `${today}T02:00:00.000Z` },
    { id: "3", event_name: "page_view", page_path: "/check", created_at: `${today}T03:00:00.000Z` },
    { id: "4", event_name: "cta_activation", page_path: "/check", created_at: `${today}T04:00:00.000Z` },
    { id: "5", event_name: "access_request_success", page_path: "/", created_at: `${today}T05:00:00.000Z` }
  );
  const env = {
    WAITLIST_DB: fakeDb(store),
    ADMIN_EXPORT_TOKEN: "admin-token"
  };

  const denied = await getFunnelSummary(
    new Request("https://seofixkit.com/admin/funnel-summary"),
    env
  );
  assert.equal(denied.status, 401);

  const response = await getFunnelSummary(
    new Request("https://seofixkit.com/admin/funnel-summary", {
      headers: { authorization: "Bearer admin-token" }
    }),
    env
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.retentionDays, FUNNEL_RETENTION_DAYS);
  assert.equal(body.total, 5);
  assert.equal(body.byEvent.page_view.count, 3);
  assert.equal(body.byEvent.cta_activation.count, 1);
  assert.equal(body.byEvent.access_request_success.count, 1);
  assert.ok(body.byEvent.page_view.firstAt);
  assert.ok(body.byEvent.page_view.lastAt);
  assert.ok(
    Object.keys(body.byEvent).every((name) => FUNNEL_EVENT_NAMES.has(name)),
    "summary only ever exposes allow-listed event names"
  );
  assert.ok(Array.isArray(body.byDay) && body.byDay.length === 1, "daily buckets are returned");
  assert.equal(body.byDay[0].day, today);
  assert.equal(body.byDay[0].count, 5);
  assert.ok(!JSON.stringify(body).includes("@"), "no email-shaped value may appear in the summary");
  assert.ok(!JSON.stringify(body).includes("email"), "no email field may appear in the summary");
});

test("access request success records access_request_success without PII", async () => {
  const store = fakeStore();
  const env = accessTestEnv(store);
  const response = await requestAccessLink(
    new Request("https://seofixkit.com/api/access/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "visitor@example.com",
        source: "test",
        landingPath: "/",
        timeToSubmitMs: 3000
      })
    }),
    env
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, "sent");

  const success = store.funnelEvents.filter((row) => row.event_name === "access_request_success");
  assert.equal(success.length, 1);
  assert.equal(success[0].page_path, "/");
  assert.equal(store.funnelEvents.length, 1, "only the success event is recorded");
  assert.ok(!JSON.stringify(store.funnelEvents).includes("visitor@example.com"), "email never stored");
});

test("access request failure records access_request_failure for invalid email", async () => {
  const store = fakeStore();
  const env = accessTestEnv(store);
  const response = await requestAccessLink(
    new Request("https://seofixkit.com/api/access/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", timeToSubmitMs: 3000 })
    }),
    env
  );
  assert.equal(response.status, 400);

  const failures = store.funnelEvents.filter((row) => row.event_name === "access_request_failure");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].page_path, "/");
});

test("access request failure records access_request_failure when email send fails", async () => {
  const store = fakeStore();
  const env = accessTestEnv(store);
  env.EMAIL.send = async () => {
    throw new Error("smtp down");
  };
  const response = await requestAccessLink(
    new Request("https://seofixkit.com/api/access/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "visitor@example.com", timeToSubmitMs: 3000 })
    }),
    env
  );
  assert.equal(response.status, 503);

  const failures = store.funnelEvents.filter((row) => row.event_name === "access_request_failure");
  assert.equal(failures.length, 1);
  assert.equal(store.funnelEvents.filter((row) => row.event_name === "access_request_success").length, 0);
});

test("bot-like access requests record no funnel events", async () => {
  const store = fakeStore();
  const env = accessTestEnv(store);

  const honeypot = await requestAccessLink(
    new Request("https://seofixkit.com/api/access/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bot@example.com", company: "spam" })
    }),
    env
  );
  assert.equal(honeypot.status, 200);

  const fastSubmit = await requestAccessLink(
    new Request("https://seofixkit.com/api/access/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bot2@example.com", timeToSubmitMs: 300 })
    }),
    env
  );
  assert.equal(fastSubmit.status, 200);
  assert.equal(store.funnelEvents.length, 0, "bot filters must not pollute the funnel");
});

// ---------------------------------------------------------------------------
// Fake D1: an in-memory store shaped like the real WAITLIST_DB for the SQL the
// funnel route and the access-request flow actually run.
// ---------------------------------------------------------------------------

function accessTestEnv(store) {
  return {
    WAITLIST_DB: fakeDb(store),
    EMAIL: { send: async () => ({ messageId: "msg-1" }) },
    SEOFIXKIT_EMAIL_FROM: "support@seofixkit.com",
    SEOFIXKIT_REPLY_TO: "support@seofixkit.com"
  };
}

function fakeStore() {
  return {
    funnelEvents: [],
    quota: {},
    accessTokens: [],
    adminAuditLog: []
  };
}

function fakeDb(store) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => first(sql, values, store),
            all: async () => all(sql, values, store),
            run: async () => run(sql, values, store)
          };
        }
      };
    }
  };
}

function first(sql) {
  if (sql.includes("FROM admin_sessions") || sql.includes("FROM access_tokens")) {
    return null;
  }
  throw new Error(`Unexpected first SQL: ${sql}`);
}

function all(sql, values, store) {
  if (sql.includes("GROUP BY event_name")) {
    const groups = new Map();
    for (const row of store.funnelEvents) {
      if (!groups.has(row.event_name)) groups.set(row.event_name, []);
      groups.get(row.event_name).push(row.created_at);
    }
    return {
      results: [...groups.entries()].map(([eventName, times]) => ({
        event_name: eventName,
        count: times.length,
        first_at: times.sort()[0],
        last_at: times.sort().at(-1)
      }))
    };
  }
  if (sql.includes("GROUP BY day")) {
    const groups = new Map();
    for (const row of store.funnelEvents) {
      const day = String(row.created_at || "").slice(0, 10);
      groups.set(day, (groups.get(day) || 0) + 1);
    }
    return {
      results: [...groups.entries()]
        .filter(([day]) => day && day >= String(values[0] || "").slice(0, 10))
        .map(([day, count]) => ({ day, count }))
    };
  }
  throw new Error(`Unexpected all SQL: ${sql}`);
}

function run(sql, values, store) {
  if (sql.includes("INSERT INTO funnel_events")) {
    store.funnelEvents.push({
      id: values[0],
      event_name: values[1],
      page_path: values[2],
      created_at: values[3]
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO audit_usage")) {
    const [bucket, , , limit] = values;
    const count = Number(store.quota[bucket] || 0);
    if (count >= Number(limit)) return { meta: { changes: 0 } };
    store.quota[bucket] = count + 1;
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO waitlist_leads")) {
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO access_tokens")) {
    store.accessTokens.push({
      token_hash: values[0],
      owner_email: values[1],
      purpose: values[2],
      created_at: values[3],
      expires_at: values[4],
      used_at: null,
      ip_hash: values[5],
      user_agent: values[6]
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("DELETE FROM access_tokens")) {
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO admin_audit_log")) {
    store.adminAuditLog.push({ action: values[1], success: values[2] });
    return { meta: { changes: 1 } };
  }
  throw new Error(`Unexpected run SQL: ${sql}`);
}
