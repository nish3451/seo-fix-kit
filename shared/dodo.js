const DODO_LIVE_URL = "https://live.dodopayments.com";
const DODO_TEST_URL = "https://test.dodopayments.com";

export const DODO_PAYMENT_SUCCESS_EVENTS = new Set([
  "payment.succeeded",
  "payment.completed",
  "payment.paid"
]);

export const DODO_PAYMENT_FAILURE_EVENTS = new Set([
  "payment.failed",
  "payment.cancelled",
  "payment.canceled"
]);

export const PAID_STATUSES = new Set(["succeeded", "paid", "completed"]);

export function dodoApiKey(env) {
  return env.DODO_SEOFIXKIT_API_KEY || "";
}

export function dodoWebhookSecret(env) {
  return env.DODO_SEOFIXKIT_WEBHOOK_SECRET || env.DODO_SEOFIXKIT_WEBHOOK_KEY || "";
}

export function dodoProductId(env) {
  return env.DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID || "";
}

export function dodoBrandId(env) {
  return env.DODO_SEOFIXKIT_BRAND_ID || "";
}

export function dodoBaseUrl(env) {
  const mode = String(env.DODO_SEOFIXKIT_ENVIRONMENT || "live").toLowerCase();
  return mode.includes("test") ? DODO_TEST_URL : DODO_LIVE_URL;
}

export function dodoAdaptiveCurrencyFeesInclusive(env) {
  return String(env.DODO_SEOFIXKIT_ADAPTIVE_CURRENCY_FEES_INCLUSIVE || "true").toLowerCase() !== "false";
}

export function dodoCountryFromRequest(request) {
  const country = String(
    request?.cf?.country ||
      request?.headers?.get?.("cf-ipcountry") ||
      request?.headers?.get?.("x-country") ||
      ""
  ).toUpperCase();
  return /^[A-Z]{2}$/.test(country) && country !== "XX" ? country : "";
}

export function hasDodoCheckoutConfig(env) {
  return Boolean(dodoApiKey(env) && dodoProductId(env));
}

export async function verifyDodoWebhookSignature({
  payload,
  webhookId,
  webhookTimestamp,
  webhookSignature,
  secret,
  nowMs = Date.now(),
  toleranceSeconds = 5 * 60
}) {
  if (!payload || !webhookId || !webhookTimestamp || !webhookSignature || !secret) return false;

  const timestamp = Number(webhookTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) return false;

  const signedPayload = `${webhookId}.${webhookTimestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    decodeWebhookSecret(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = arrayBufferToBase64(digest);

  return webhookSignature
    .split(" ")
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => timingSafeEqual(part.replace(/^v1=/, "").replace(/^v1,/, ""), expected));
}

export function extractDodoPayment(payment = {}) {
  const metadata = objectOrEmpty(payment.metadata);
  return {
    paymentId: firstText(payment.payment_id, payment.paymentId, payment.id),
    checkoutSessionId: firstText(payment.checkout_session_id, payment.checkoutSessionId, payment.session_id, payment.sessionId),
    metadataFixRequestId: firstText(metadata.fix_request_id, metadata.fixRequestId),
    metadataReportId: firstText(metadata.report_id, metadata.reportId),
    metadataProductKey: firstText(metadata.product_key, metadata.productKey),
    productIds: extractProductIds(payment),
    amount: numberOrZero(payment.total_amount ?? payment.amount_total ?? payment.amount),
    currency: normalizeCurrency(payment.currency),
    status: String(payment.status || "").toLowerCase()
  };
}

export function dodoProductMatches(payment, expectedProductId) {
  if (!expectedProductId || !payment.productIds.length) return true;
  return payment.productIds.includes(expectedProductId);
}

function extractProductIds(payment = {}) {
  const carts = [payment.product_cart, payment.productCart, payment.line_items, payment.items].filter(Array.isArray).flat();
  return carts.map((item) => firstText(item?.product_id, item?.productId, item?.id)).filter(Boolean);
}

function decodeWebhookSecret(secret) {
  const normalized = String(secret || "").trim().replace(/^whsec_/, "");
  try {
    return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  } catch {
    return new TextEncoder().encode(secret);
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase();
}
