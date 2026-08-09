// First-party activation funnel instrumentation for the public private-beta
// funnel (backlog item "Add first-party activation instrumentation for the
// private-beta funnel", accept clause).
//
// Privacy contract (pinned by worker/routes/funnel.test.mjs):
// - Events are allow-listed: page_view, access_form_shown,
//   access_request_success, access_request_failure, cta_activation.
// - Events carry only an allow-listed event name, a page path, and a
//   timestamp. Email, company, IP, user agent, referrer, and query strings
//   are never accepted or stored.
// - POST /api/funnel-event is the first-party beacon surface; it is
//   rate-limited per network per hour and never blocks the visitor flow.
// - GET /admin/funnel-summary is a read-only, admin-token-protected summary
//   of event counts and timestamps with no PII.
// - Rows are deleted after FUNNEL_RETENTION_DAYS by the scheduled cleanup in
//   worker/lib/db.js; retention/consent boundaries are documented on /privacy.
import {
  adminAccessStatus,
  adminDeniedJson,
  logAdminAction
} from "../lib/auth.js";
import { jsonNoStore } from "../lib/http.js";
import { checkQuotaSet, requestIpHash } from "../lib/security.js";
import { hourWindow, isoSecondsFromNow } from "../lib/text.js";

export const FUNNEL_API_PATH = "/api/funnel-event";
export const FUNNEL_SUMMARY_PATH = "/admin/funnel-summary";
export const FUNNEL_RETENTION_DAYS = 90;
export const FUNNEL_IP_HOURLY_LIMIT = 240;

export const FUNNEL_EVENT_NAMES = new Set([
  "page_view",
  "access_form_shown",
  "access_request_success",
  "access_request_failure",
  "cta_activation"
]);

// Page paths are restricted to plain internal-looking paths: they must start
// with "/", be short, and contain only unreserved URL characters. Query
// strings, fragments, dot-dot segments, and anything that could smuggle PII
// (e.g. ?email=...) are rejected outright.
export function sanitizeFunnelEvent({ event = "", page = "" }) {
  const eventName = String(event || "").trim();
  if (!FUNNEL_EVENT_NAMES.has(eventName)) {
    return { ok: false, error: "Unknown funnel event." };
  }
  const pagePath = String(page || "").trim();
  if (
    !pagePath.startsWith("/") ||
    pagePath.length > 200 ||
    pagePath.includes("//") ||
    pagePath.includes("..") ||
    /[^A-Za-z0-9._/-]/.test(pagePath)
  ) {
    return { ok: false, error: "Invalid page path." };
  }
  return { ok: true, eventName, pagePath };
}

// Best-effort insert: telemetry must never break the visitor-facing flow, so
// any database error is swallowed into a result the caller can ignore.
export async function recordFunnelEvent(env, { eventName, pagePath }) {
  if (!env.WAITLIST_DB) return { ok: false, error: "No database configured." };
  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO funnel_events (id, event_name, page_path, created_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), eventName, pagePath, new Date().toISOString())
      .run();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || "Funnel event insert failed.") };
  }
}

export async function trackFunnelEvent(request, env) {
  if (!env.WAITLIST_DB) {
    return jsonNoStore({ ok: false, error: "Funnel storage is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const clean = sanitizeFunnelEvent(body);
  if (!clean.ok) return jsonNoStore({ ok: false, error: clean.error }, 400);

  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  const quota = await checkQuotaSet(env, [
    {
      bucket: `funnel:ip-hour:${hour.key}:${ipHash}`,
      limit: FUNNEL_IP_HOURLY_LIMIT,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many events from this network. Try again later."
    }
  ]);
  if (!quota.ok) return jsonNoStore({ ok: false, error: quota.error }, 429);

  await recordFunnelEvent(env, { eventName: clean.eventName, pagePath: clean.pagePath });
  return jsonNoStore({ ok: true });
}

export async function getFunnelSummary(request, env) {
  const admin = await adminAccessStatus(request, env, "view-funnel-summary");
  if (!admin.ok) return adminDeniedJson(admin);
  if (!env.WAITLIST_DB) return jsonNoStore({ error: "Funnel storage is not configured." }, 503);
  await logAdminAction(request, env, "view-funnel-summary", true, admin.actorEmail);

  const retentionStart = isoSecondsFromNow(-FUNNEL_RETENTION_DAYS * 24 * 60 * 60);
  const [byEvent, byDay] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT event_name, COUNT(*) AS count, MIN(created_at) AS first_at, MAX(created_at) AS last_at
       FROM funnel_events
       GROUP BY event_name
       ORDER BY count DESC`
    )
      .bind()
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM funnel_events
       WHERE created_at >= ?
       GROUP BY day
       ORDER BY day ASC`
    )
      .bind(retentionStart)
      .all()
  ]);

  const byEventRows = byEvent.results || [];
  const byDayRows = byDay.results || [];
  return jsonNoStore({
    ok: true,
    retentionDays: FUNNEL_RETENTION_DAYS,
    total: byEventRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
    byEvent: Object.fromEntries(
      byEventRows.map((row) => [
        row.event_name,
        { count: Number(row.count || 0), firstAt: row.first_at, lastAt: row.last_at }
      ])
    ),
    byDay: byDayRows.map((row) => ({ day: row.day, count: Number(row.count || 0) }))
  });
}

// Inline first-party beacon for the server-rendered public pages. Emits a
// page_view on load and a cta_activation whenever an element marked
// data-funnel-cta is clicked. Uses sendBeacon so the request survives
// navigation; the response is intentionally ignored.
export function funnelBeaconScript() {
  return `<script>
      (function () {
        function funnelBeacon(eventName, pagePath) {
          try {
            navigator.sendBeacon("/api/funnel-event", new Blob([JSON.stringify({ event: eventName, page: pagePath })], { type: "application/json" }));
          } catch (error) {}
        }
        funnelBeacon("page_view", location.pathname);
        document.addEventListener("click", function (event) {
          var target = event.target;
          var link = target && target.closest ? target.closest("a[data-funnel-cta]") : null;
          if (!link) return;
          funnelBeacon("cta_activation", link.getAttribute("href") || "/");
        });
      })();
    </script>`;
}
