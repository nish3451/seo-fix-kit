// First-party activation instrumentation for the private-beta funnel.
//
// All events are recorded server-side directly into the D1 access_events
// table. The helper is intentionally best-effort: it never throws and never
// blocks the request that called it. A caller can pass a Request object so
// the helper can derive referrer, user-agent, country, and IP hash, or it
// can pass those values explicitly when the caller already has them
// (for example after a server-side token verify).

import { cleanText } from "./text.js";
import { requestIpHash } from "./security.js";

// Stable, append-only step names. Ordering is meaningful for funnel
// analysis; keep the order in FUNNEL_STEPS the source of truth.
const FUNNEL_STEPS = Object.freeze([
  "beta_view",
  "beta_input",
  "beta_submit",
  "access_requested",
  "access_link_sent",
  "access_link_verified",
  "session_created",
  "audit_started"
]);

const KNOWN_FUNNEL_STEPS = new Set(FUNNEL_STEPS);

const EMAIL_RE = /\S+@\S+\.\S+/;

function isFunnelStep(value) {
  return typeof value === "string" && KNOWN_FUNNEL_STEPS.has(value);
}

function stepIndex(step) {
  const index = FUNNEL_STEPS.indexOf(step);
  return index === -1 ? null : index;
}

function normalizeOwnerEmail(value) {
  const text = cleanText(value || "", 254);
  if (!text) return "";
  return EMAIL_RE.test(text) ? text.toLowerCase() : "";
}

function normalizeFunnelKey(value) {
  return cleanText(value || "", 64).replace(/[^A-Za-z0-9._\-]/g, "");
}

function normalizeSource(value) {
  return cleanText(value || "", 80);
}

function normalizeLandingPath(value, fallback = "/") {
  const text = cleanText(value || fallback, 500);
  return text || "/";
}

function normalizeMetadata(value) {
  if (value == null) return "";
  if (typeof value === "string") return cleanText(value, 4000);
  try {
    return cleanText(JSON.stringify(value), 4000);
  } catch {
    return "";
  }
}

function deriveRequestFields(request) {
  if (!request) {
    return { referrer: "", userAgent: "", country: "" };
  }
  return {
    referrer: cleanText(request.headers?.get?.("referer") || "", 500),
    userAgent: cleanText(request.headers?.get?.("user-agent") || "", 500),
    country: cleanText(request?.cf?.country || "", 8)
  };
}

async function recordAccessEvent(env, options = {}) {
  if (!env?.WAITLIST_DB) return { ok: false, reason: "no_storage" };
  if (!options || typeof options !== "object") return { ok: false, reason: "bad_options" };

  const step = cleanText(options.step || "", 40);
  if (!isFunnelStep(step)) return { ok: false, reason: "unknown_step" };

  const funnelKey = normalizeFunnelKey(options.funnelKey);
  const ownerEmail = normalizeOwnerEmail(options.ownerEmail);
  const source = normalizeSource(options.source);
  const landingPath = normalizeLandingPath(options.landingPath, options.fallbackLandingPath || "/");
  const metadata = normalizeMetadata(options.metadata);

  const derived = options.request ? deriveRequestFields(options.request) : { referrer: "", userAgent: "", country: "" };
  const referrer = cleanText(options.referrer ?? derived.referrer, 500);
  const userAgent = cleanText(options.userAgent ?? derived.userAgent, 500);
  const country = cleanText(options.country ?? derived.country, 8);

  let ipHash = cleanText(options.ipHash || "", 64);
  if (!ipHash && options.request) {
    try {
      ipHash = await requestIpHash(options.request);
    } catch {
      ipHash = "";
    }
  }

  const now = cleanText(options.now || new Date().toISOString(), 32);

  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO access_events
        (step, funnel_key, owner_email, source, landing_path, referrer, user_agent, country, ip_hash, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        step,
        funnelKey,
        ownerEmail,
        source,
        landingPath,
        referrer,
        userAgent,
        country,
        ipHash,
        metadata,
        now
      )
      .run();
  } catch {
    // Instrumentation must never break the request that triggered it.
    return { ok: false, reason: "insert_failed" };
  }

  return { ok: true, step, funnelKey, ownerEmail };
}

// Summarize how many rows each step has in a given window. Returns step
// counts plus simple conversion rates relative to the first step in the
// window when that step is present. Designed for low-friction admin
// dashboard use; it does not materialise per-funnel-key paths.
async function summarizeAccessEvents(env, options = {}) {
  if (!env?.WAITLIST_DB) return { ok: false, reason: "no_storage", steps: {}, totals: {} };

  const nowMs = Date.now();
  const windowMs = Math.max(60 * 1000, Math.min(Number(options.windowMs || 7 * 24 * 60 * 60 * 1000), 90 * 24 * 60 * 60 * 1000));
  const sinceMs = nowMs - windowMs;
  const sinceIso = new Date(sinceMs).toISOString();

  let rows;
  try {
    const result = await env.WAITLIST_DB.prepare(
      `SELECT step, COUNT(*) AS count
       FROM access_events
       WHERE created_at >= ?
       GROUP BY step`
    )
      .bind(sinceIso)
      .all();
    rows = result?.results || [];
  } catch {
    return { ok: false, reason: "query_failed", steps: {}, totals: {} };
  }

  const counts = Object.fromEntries(FUNNEL_STEPS.map((step) => [step, 0]));
  for (const row of rows) {
    if (isFunnelStep(row.step)) {
      counts[row.step] = Number(row.count || 0);
    }
  }

  const baseline = counts[FUNNEL_STEPS[0]] || 0;
  const conversions = {};
  for (const step of FUNNEL_STEPS) {
    if (baseline <= 0) {
      conversions[step] = 0;
    } else {
      conversions[step] = Number(((counts[step] / baseline) * 100).toFixed(1));
    }
  }

  const totals = {
    sinceIso,
    windowMs,
    baseline,
    uniqueFunnelKeys: 0,
    uniqueEmails: 0
  };

  try {
    const uniqueRows = await env.WAITLIST_DB.prepare(
      `SELECT
        COUNT(DISTINCT CASE WHEN funnel_key != '' THEN funnel_key END) AS uniqueFunnelKeys,
        COUNT(DISTINCT CASE WHEN owner_email != '' THEN owner_email END) AS uniqueEmails
       FROM access_events
       WHERE created_at >= ?`
    )
      .bind(sinceIso)
      .first();
    if (uniqueRows) {
      totals.uniqueFunnelKeys = Number(uniqueRows.uniqueFunnelKeys || 0);
      totals.uniqueEmails = Number(uniqueRows.uniqueEmails || 0);
    }
  } catch {
    // No-op: uniqueness counts are best-effort.
  }

  return {
    ok: true,
    steps: counts,
    conversionPct: conversions,
    totals,
    order: FUNNEL_STEPS.slice()
  };
}

export {
  FUNNEL_STEPS,
  isFunnelStep,
  stepIndex,
  recordAccessEvent,
  summarizeAccessEvents
};
