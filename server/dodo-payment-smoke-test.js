import assert from "node:assert/strict";
import {
  DODO_REFUND_SUCCESS_EVENTS,
  dodoCheckoutConfigStatus,
  dodoProductMatches,
  extractDodoPayment,
  hasDodoCheckoutConfig,
  verifyDodoWebhookSignature
} from "../shared/dodo.js";
import {
  ADMIN_EDITABLE_FIX_REQUEST_STATUSES,
  buildOpsDigestEmail,
  buildPaymentNotificationEmail,
  buildStatusNotificationEmail,
  fixRequestStatusLabel,
  isResendEmailConfigured,
  normalizeFixRequestStatus
} from "../shared/fulfillment.js";

const secret = "test_webhook_secret";
const payload = JSON.stringify({
  type: "payment.succeeded",
  data: {
    payment_id: "pay_123",
    checkout_session_id: "cks_123",
    brand_id: "brnd_123",
    business_id: "bus_123",
    status: "succeeded",
    currency: "USD",
    total_amount: 9900,
    customer: { email: "buyer@example.com" },
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: "fix_123",
      report_id: "report_123"
    },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }]
  }
});
const webhookId = "evt_123";
const webhookTimestamp = String(Math.floor(Date.now() / 1000));
const signature = await sign({ payload, webhookId, webhookTimestamp, secret });

assert.equal(
  await verifyDodoWebhookSignature({
    payload,
    webhookId,
    webhookTimestamp,
    webhookSignature: `v1,${signature}`,
    secret
  }),
  true
);
assert.equal(
  await verifyDodoWebhookSignature({
    payload,
    webhookId,
    webhookTimestamp,
    webhookSignature: `v1,${signature}`,
    secret: "wrong"
  }),
  false
);

const payment = extractDodoPayment(JSON.parse(payload).data);
assert.equal(payment.paymentId, "pay_123");
assert.equal(payment.checkoutSessionId, "cks_123");
assert.equal(payment.brandId, "brnd_123");
assert.equal(payment.businessId, "bus_123");
assert.equal(payment.customerEmail, "buyer@example.com");
assert.equal(payment.metadataFixRequestId, "fix_123");
assert.equal(payment.metadataProductKey, "seofixkit_fix_pack");
assert.deepEqual(payment.productIds, ["pdt_fix_pack"]);
assert.equal(dodoProductMatches(payment, "pdt_fix_pack"), true);
assert.equal(dodoProductMatches(payment, "pdt_other"), false);
assert.equal(dodoProductMatches({ productIds: [] }, "pdt_fix_pack"), false);
assert.equal(hasDodoCheckoutConfig({ DODO_SEOFIXKIT_API_KEY: "key", DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: "pdt" }), false);
assert.equal(
  hasDodoCheckoutConfig({
    DODO_SEOFIXKIT_API_KEY: "key",
    DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: "pdt",
    DODO_SEOFIXKIT_BRAND_ID: "brnd",
    DODO_SEOFIXKIT_ENVIRONMENT: "test",
    DODO_SEOFIXKIT_WEBHOOK_SECRET: "secret"
  }),
  true
);
assert.equal(dodoCheckoutConfigStatus({ DODO_SEOFIXKIT_ENVIRONMENT: "staging" }).environment, "");
assert.equal(dodoCheckoutConfigStatus({ DODO_SEOFIXKIT_ENVIRONMENT: "staging" }).checkoutReady, false);
assert.equal(normalizeFixRequestStatus("in_progress"), "in_progress");
assert.equal(normalizeFixRequestStatus("nonsense"), "new");
assert.equal(fixRequestStatusLabel("delivered"), "Delivered");
assert.equal(fixRequestStatusLabel("refunded"), "Refunded");
assert.equal(ADMIN_EDITABLE_FIX_REQUEST_STATUSES.has("paid"), false);
assert.equal(ADMIN_EDITABLE_FIX_REQUEST_STATUSES.has("delivered"), true);
assert.equal(DODO_REFUND_SUCCESS_EVENTS.has("refund.succeeded"), true);
assert.equal(isResendEmailConfigured({}), false);
assert.equal(
  isResendEmailConfigured({
    RESEND_API_KEY: "re_test",
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <hello@seofixkit.com>"
  }),
  true
);

const notification = buildPaymentNotificationEmail({
  appOrigin: "https://seofixkit.com",
  fixRequest: {
    report_id: "report_123",
    target_host: "example.com",
    target_url: "https://example.com/"
  },
  report: {},
  payment,
  recipientType: "owner"
});
assert.equal(notification.subject.includes("example.com"), true);
assert.equal(notification.text.includes("No ranking promises"), true);
assert.equal(notification.text.includes("USD 99.00"), true);

const delivery = buildStatusNotificationEmail({
  appOrigin: "https://seofixkit.com",
  fixRequest: {
    report_id: "report_123",
    final_report_id: "report_456",
    target_host: "example.com",
    target_url: "https://example.com/",
    delivery_url: "https://seofixkit.com/beta/reports/report_456",
    customer_note: "Canonical tags and social images are now fixed."
  },
  report: {},
  recipientType: "owner",
  status: "delivered",
  beforeAfter: {
    beforeScore: 72,
    afterScore: 91,
    beforeFindings: 6,
    afterFindings: 2
  }
});
assert.equal(delivery.subject.includes("delivery ready"), true);
assert.equal(delivery.text.includes("Score: 72 -> 91 (+19)"), true);

const digest = buildOpsDigestEmail({
  appOrigin: "https://seofixkit.com",
  snapshot: {
    openPaid: 2,
    inProgress: 1,
    deliveredToday: 1,
    overdue: 0,
    webhookErrors: 0,
    emailErrors: 0,
    oldestOpenCreatedAt: "2026-05-21T00:00:00.000Z"
  }
});
assert.equal(digest.subject.includes("2 paid open"), true);

console.log(JSON.stringify({ ok: true, checked: "dodo payment and fulfillment helpers" }));

async function sign({ payload, webhookId, webhookTimestamp, secret }) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${webhookId}.${webhookTimestamp}.${payload}`)
  );
  let binary = "";
  new Uint8Array(digest).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
