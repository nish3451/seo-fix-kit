// First-party activation funnel beacon for the public private-beta funnel.
//
// The SPA homepage (WaitlistPage) emits page_view + access_form_shown on
// mount and cta_activation on conversion CTA clicks. Access-request
// success/failure is recorded server-side by POST /api/access/request, so the
// client never sends a duplicate.
//
// Privacy contract (mirrors worker/routes/funnel.js): only allow-listed event
// names and plain page paths (no query strings, no email/company values) are
// sent. The beacon is best-effort: it never blocks or breaks the visitor flow.

const FUNNEL_EVENT_NAMES = new Set([
  "page_view",
  "access_form_shown",
  "access_request_success",
  "access_request_failure",
  "cta_activation"
]);

export function funnelEventPayload(eventName, pagePath) {
  const event = String(eventName || "").trim();
  if (!FUNNEL_EVENT_NAMES.has(event)) return null;
  const page = String(pagePath || "").trim();
  if (
    !page.startsWith("/") ||
    page.length > 200 ||
    page.includes("//") ||
    page.includes("..") ||
    /[^A-Za-z0-9._/-]/.test(page)
  ) {
    return null;
  }
  return { event, page };
}

export function funnelEvent(eventName, pagePath) {
  const payload = funnelEventPayload(eventName, pagePath);
  if (!payload) return;
  try {
    fetch("/api/funnel-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  } catch {
    // Best-effort telemetry; the visitor flow must never depend on it.
  }
}
