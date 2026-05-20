import assert from "node:assert/strict";
import {
  dodoProductMatches,
  extractDodoPayment,
  verifyDodoWebhookSignature
} from "../shared/dodo.js";

const secret = "test_webhook_secret";
const payload = JSON.stringify({
  type: "payment.succeeded",
  data: {
    payment_id: "pay_123",
    checkout_session_id: "cks_123",
    status: "succeeded",
    currency: "USD",
    total_amount: 9900,
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
assert.equal(payment.metadataFixRequestId, "fix_123");
assert.equal(payment.metadataProductKey, "seofixkit_fix_pack");
assert.deepEqual(payment.productIds, ["pdt_fix_pack"]);
assert.equal(dodoProductMatches(payment, "pdt_fix_pack"), true);
assert.equal(dodoProductMatches(payment, "pdt_other"), false);

console.log(JSON.stringify({ ok: true, checked: "dodo payment helpers" }));

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
