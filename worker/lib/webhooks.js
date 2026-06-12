import { isPrivateHostname, resolvesToPrivateAddress } from "../../shared/url-safety.js";
import { hmacSha256Hex } from "./security.js";
import { cleanText, parseJson } from "./text.js";

function cleanWebhookEvents(events = []) {
  const allowed = new Set(["audit.completed", "audit.failed", "large_crawl.created", "large_crawl.ready_to_merge"]);
  const values = Array.isArray(events) ? events : [];
  const cleaned = values.filter((event) => allowed.has(String(event)));
  return cleaned.length ? [...new Set(cleaned)] : ["audit.completed", "audit.failed"];
}

async function apiWebhookSigningSecret(env, webhookId) {
  // Fail closed: without a dedicated secret, webhook signatures would be
  // forgeable, so refuse to sign rather than fall back to a known seed.
  const seed = String(env.SEOFIXKIT_API_WEBHOOK_SECRET || "");
  if (!seed) {
    throw new Error("Webhook signing is not configured. Set the SEOFIXKIT_API_WEBHOOK_SECRET secret.");
  }
  const digest = await hmacSha256Hex(seed, webhookId);
  return `whsec_${digest.slice(0, 32)}`;
}

async function apiWebhookSignature(env, webhookId, timestamp, body) {
  const secret = await apiWebhookSigningSecret(env, webhookId);
  return hmacSha256Hex(secret, `${timestamp}.${body}`);
}

async function deliverApiWebhooks(env, ownerEmail, eventType, data = {}) {
  if (!env.WAITLIST_DB) return;
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM api_webhooks
     WHERE owner_email = ?
       AND status = 'active'
       AND revoked_at IS NULL
     ORDER BY created_at ASC
     LIMIT 20`
  )
    .bind(ownerEmail)
    .all();
  const webhooks = (rows.results || []).filter((row) => parseJson(row.events_json, []).includes(eventType));
  for (const webhook of webhooks) {
    const now = new Date().toISOString();
    const payload = {
      id: crypto.randomUUID(),
      event: eventType,
      created_at: now,
      data
    };
    const body = JSON.stringify(payload);
    const eventId = payload.id;
    await env.WAITLIST_DB.prepare(
      `INSERT INTO api_webhook_events
        (id, webhook_id, owner_email, event_type, audit_job_id, report_id, status, http_status, error, payload_json, created_at, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        eventId,
        webhook.id,
        ownerEmail,
        eventType,
        data.audit?.audit_id || null,
        data.audit?.report_id || data.report?.id || null,
        "pending",
        null,
        null,
        body,
        now,
        null
      )
      .run();
    try {
      const urlStatus = publicWebhookUrlStatus(webhook.url);
      if (!urlStatus.ok) throw new Error(urlStatus.error);
      if (await resolvesToPrivateAddress(new URL(urlStatus.url).hostname)) {
        throw new Error("Webhook host resolves to a private or internal address.");
      }
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "SEO Fix Kit Webhooks",
          "x-seofixkit-event": eventType,
          "x-seofixkit-signature": `t=${timestamp},v1=${await apiWebhookSignature(env, webhook.id, timestamp, body)}`
        },
        body,
        redirect: "manual"
      });
      const deliveredAt = new Date().toISOString();
      const status = response.ok ? "delivered" : "failed";
      const error = response.ok ? "" : `HTTP ${response.status}`;
      await env.WAITLIST_DB.batch([
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhook_events
           SET status = ?, http_status = ?, error = ?, delivered_at = ?
           WHERE id = ?`
        ).bind(status, response.status, error || null, deliveredAt, eventId),
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhooks
           SET last_delivery_at = ?, last_delivery_status = ?, last_error = ?, updated_at = ?
           WHERE id = ?`
        ).bind(deliveredAt, status, error || null, deliveredAt, webhook.id)
      ]);
    } catch (error) {
      const deliveredAt = new Date().toISOString();
      const message = cleanText(error?.message || "Webhook delivery failed.", 500);
      await env.WAITLIST_DB.batch([
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhook_events
           SET status = 'failed', error = ?, delivered_at = ?
           WHERE id = ?`
        ).bind(message, deliveredAt, eventId),
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhooks
           SET last_delivery_at = ?, last_delivery_status = 'failed', last_error = ?, updated_at = ?
           WHERE id = ?`
        ).bind(deliveredAt, message, deliveredAt, webhook.id)
      ]);
    }
  }
}

function publicWebhookUrlStatus(value) {
  let parsed = null;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    return { ok: false, error: "Enter a valid HTTPS webhook URL." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Webhook URLs must use HTTPS." };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateHostname(host)
  ) {
    return { ok: false, error: "Use a public HTTPS webhook URL, not a private or local address." };
  }

  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return { ok: true, url: parsed.href };
}

export {
  apiWebhookSignature,
  apiWebhookSigningSecret,
  cleanWebhookEvents,
  deliverApiWebhooks,
  publicWebhookUrlStatus
};
