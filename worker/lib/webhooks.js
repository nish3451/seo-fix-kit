import { isPrivateHostname, resolvesToPrivateAddress } from "../../shared/url-safety.js";
import { hmacSha256Hex } from "./security.js";
import { cleanText, parseJson } from "./text.js";

const WEBHOOK_DELIVERY_TIMEOUT_MS = 5000;
const WEBHOOK_DELIVERY_MAX_ATTEMPTS = 2;
const WEBHOOK_DELIVERY_EVENT_BUDGET_MS = 12000;
const WEBHOOK_DELIVERY_RETRY_BASE_MS = 250;

function cleanWebhookEvents(events = []) {
  const allowed = new Set([
    "audit.completed",
    "audit.failed",
    "large_crawl.created",
    "large_crawl.ready_to_merge",
    "repair_action.drafted",
    "repair_action.approved",
    "repair_action.applied",
    "repair_action.fixed",
    "repair_action.regressed"
  ]);
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

async function deliverApiWebhooks(env, ownerEmail, eventType, data = {}, options = {}) {
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
      const delivery = await deliverApiWebhook(env, webhook, eventType, body, {
        fetcher: options.fetcher || fetch,
        resolvesToPrivateAddress: options.resolvesToPrivateAddress || resolvesToPrivateAddress,
        sleep: options.sleep || sleep,
        maxAttempts: webhookDeliveryMaxAttempts(env),
        timeoutMs: webhookDeliveryTimeoutMs(env),
        eventBudgetMs: webhookDeliveryEventBudgetMs(env)
      });
      const deliveredAt = new Date().toISOString();
      await env.WAITLIST_DB.batch([
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhook_events
           SET status = ?, http_status = ?, error = ?, delivered_at = ?
           WHERE id = ?`
        ).bind(delivery.status, delivery.httpStatus || null, delivery.error || null, deliveredAt, eventId),
        env.WAITLIST_DB.prepare(
          `UPDATE api_webhooks
           SET last_delivery_at = ?, last_delivery_status = ?, last_error = ?, updated_at = ?
           WHERE id = ?`
        ).bind(deliveredAt, delivery.status, delivery.error || null, deliveredAt, webhook.id)
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

async function deliverApiWebhook(env, webhook, eventType, body, options = {}) {
  const maxAttempts = Math.max(Number(options.maxAttempts || WEBHOOK_DELIVERY_MAX_ATTEMPTS), 1);
  const timeoutMs = Math.max(Number(options.timeoutMs || WEBHOOK_DELIVERY_TIMEOUT_MS), 1000);
  const eventBudgetMs = Math.max(Number(options.eventBudgetMs || WEBHOOK_DELIVERY_EVENT_BUDGET_MS), 1000);
  const fetcher = options.fetcher || fetch;
  const privateAddressResolver = options.resolvesToPrivateAddress || resolvesToPrivateAddress;
  const sleepFn = options.sleep || sleep;
  const deadline = Date.now() + eventBudgetMs;
  let lastError = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remainingMs = Math.max(deadline - Date.now(), 0);
    if (remainingMs <= 0) {
      return { status: "failed", httpStatus: lastStatus || 0, error: lastError || "Webhook delivery budget exhausted." };
    }
    const urlStatus = publicWebhookUrlStatus(webhook.url);
    if (!urlStatus.ok) {
      return { status: "failed", httpStatus: lastStatus || 0, error: urlStatus.error };
    }
    if (await privateAddressResolver(new URL(urlStatus.url).hostname)) {
      return {
        status: "failed",
        httpStatus: lastStatus || 0,
        error: "Webhook host resolves to a private or internal address."
      };
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const response = await fetchWithTimeout(fetcher, urlStatus.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "SEO Fix Kit Webhooks",
          "x-seofixkit-event": eventType,
          "x-seofixkit-signature": `t=${timestamp},v1=${await apiWebhookSignature(env, webhook.id, timestamp, body)}`
        },
        body,
        redirect: "manual"
      }, Math.min(timeoutMs, remainingMs));
      lastStatus = response.status;
      if (response.ok) return { status: "delivered", httpStatus: response.status, error: "" };
      lastError = `HTTP ${response.status}`;
      if (!shouldRetryWebhookResponse(response.status) || attempt === maxAttempts) {
        return { status: "failed", httpStatus: response.status, error: lastError };
      }
    } catch (error) {
      lastError = cleanText(error?.message || "Webhook delivery failed.", 500);
      if (attempt === maxAttempts) {
        return { status: "failed", httpStatus: lastStatus || 0, error: lastError };
      }
    }
    const sleepMs = Math.min(webhookRetryDelayMs(attempt), Math.max(deadline - Date.now(), 0));
    if (sleepMs > 0) await sleepFn(sleepMs);
  }

  return { status: "failed", httpStatus: lastStatus || 0, error: lastError || "Webhook delivery failed." };
}

async function fetchWithTimeout(fetcher, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Webhook delivery timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function shouldRetryWebhookResponse(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function webhookRetryDelayMs(attempt) {
  return Math.min(WEBHOOK_DELIVERY_RETRY_BASE_MS * (2 ** Math.max(attempt - 1, 0)), 1000);
}

function webhookDeliveryTimeoutMs(env) {
  return Math.min(Math.max(Number(env.SEOFIXKIT_WEBHOOK_TIMEOUT_MS || WEBHOOK_DELIVERY_TIMEOUT_MS), 1000), 15000);
}

function webhookDeliveryMaxAttempts(env) {
  return Math.min(Math.max(Number(env.SEOFIXKIT_WEBHOOK_MAX_ATTEMPTS || WEBHOOK_DELIVERY_MAX_ATTEMPTS), 1), 5);
}

function webhookDeliveryEventBudgetMs(env) {
  return Math.min(Math.max(Number(env.SEOFIXKIT_WEBHOOK_EVENT_BUDGET_MS || WEBHOOK_DELIVERY_EVENT_BUDGET_MS), 1000), 30000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  deliverApiWebhook,
  deliverApiWebhooks,
  shouldRetryWebhookResponse,
  publicWebhookUrlStatus
};
