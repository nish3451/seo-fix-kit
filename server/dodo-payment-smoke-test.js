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
  isEmailConfigured,
  normalizeFixRequestStatus
} from "../shared/fulfillment.js";
import {
  OFFER_KEYS,
  agencyWorkspaceAccessFromEntitlements,
  monitoringAccessFromEntitlements,
  offerCatalog,
  repairSprintEligibilityFromProposals,
  sellableOffers
} from "../shared/offers.js";
import { repairProposalSummaryForFixRequest } from "../worker/routes/admin.js";
import { jsonForStorage } from "../worker/routes/billing.js";
import { repairProposalResponse } from "../worker/lib/serializers.js";
import { repairProposalApprovalWindowStatus } from "../worker/routes/reports.js";

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
const fakeEmailBinding = { send: async () => ({ messageId: "test-message-id" }) };
assert.equal(isEmailConfigured({}), false);
assert.equal(isEmailConfigured({ SEOFIXKIT_EMAIL_FROM: "hello@seofixkit.com" }), false);
assert.equal(isEmailConfigured({ EMAIL: fakeEmailBinding }), false);
assert.equal(
  isEmailConfigured({
    EMAIL: fakeEmailBinding,
    SEOFIXKIT_EMAIL_FROM: "hello@seofixkit.com"
  }),
  true
);
assert.equal(
  isEmailConfigured({
    EMAIL: fakeEmailBinding,
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

const proposal = repairProposalResponse({
  id: "proposal_123",
  fix_request_id: "fix_123",
  report_id: "report_123",
  owner_email: "buyer@example.com",
  issue_id: "meta-description",
  issue_title: "Missing meta description",
  target_url: "https://example.com/",
  target_host: "example.com",
  execution_mode: "generated_proposal",
  approval_status: "pending",
  delivery_status: "draft",
  generated_title: "Add a clear page summary",
  generated_summary: "Add a concise meta description that matches the page.",
  proof_json: JSON.stringify({ evidence: "No meta description was found." }),
  proposal_json: JSON.stringify({ field: "meta.description", value: "Practical SEO repair for example.com." }),
  acceptance_json: JSON.stringify(["Meta description is present on rerun"]),
  admin_note: "Private admin note must not leave the server."
});
assert.equal(proposal.executionModeLabel, "Generated proposal");
assert.equal(proposal.proof.evidence, "No meta description was found.");
assert.deepEqual(proposal.acceptance, ["Meta description is present on rerun"]);
assert.equal(Object.hasOwn(proposal, "admin_note"), false);
assert.equal(Object.hasOwn(proposal, "adminNote"), false);

const offers = offerCatalog({ fixPackCheckoutReady: true });
assert.equal(offers.find((offer) => offer.key === OFFER_KEYS.FIX_PACK).checkoutLive, true);
assert.equal(offers.find((offer) => offer.key === OFFER_KEYS.MONITORING).checkoutLive, false);
assert.equal(offers.find((offer) => offer.key === OFFER_KEYS.SEO_GEO_AGENT).checkoutState, "paused");
assert.equal(sellableOffers(offers).length, 1);
assert.equal(monitoringAccessFromEntitlements([], 2).status, "beta_allowance");
assert.equal(monitoringAccessFromEntitlements([], 2).remaining, 3);
assert.equal(
  monitoringAccessFromEntitlements([
    {
      offer_key: OFFER_KEYS.MONITORING,
      status: "active",
      limits_json: JSON.stringify({ monitoredSites: 10, cadenceDays: 7 })
    }
  ], 4).limit,
  10
);
assert.equal(
  repairSprintEligibilityFromProposals([{ executionMode: "generated_proposal", approvalStatus: "pending" }]).status,
  "needs_owner_approval"
);
assert.equal(
  repairSprintEligibilityFromProposals([{ executionMode: "generated_proposal", approvalStatus: "approved" }]).status,
  "approval_ready"
);
assert.equal(
  repairSprintEligibilityFromProposals([{ executionMode: "unsupported", approvalStatus: "approved" }]).status,
  "unsupported"
);
const proposalSummary = await repairProposalSummaryForFixRequest(fakeProposalSummaryEnv(), "fix_123");
assert.equal(proposalSummary.approved, 2);
assert.equal(proposalSummary.approvedExecutable, 1);
assert.equal(proposalSummary.executable, 2);
assert.equal(repairProposalApprovalWindowStatus("paid").ok, true);
assert.equal(repairProposalApprovalWindowStatus("in_progress").ok, true);
assert.equal(repairProposalApprovalWindowStatus("delivered").ok, false);
assert.equal(repairProposalApprovalWindowStatus("refunded").ok, false);
assert.equal(repairProposalApprovalWindowStatus("disputed").ok, false);
const storedProposalJson = jsonForStorage({ snippet: "\"".repeat(5000), fix: "Use complete JSON only." }, 4000, { truncated: true });
assert.equal(storedProposalJson.length <= 4000, true);
assert.equal(JSON.parse(storedProposalJson).fix, "Use complete JSON only.");
assert.equal(agencyWorkspaceAccessFromEntitlements([], { teamSeats: 2 }).limits.teamSeats, 10);
assert.equal(
  agencyWorkspaceAccessFromEntitlements([
    {
      offer_key: OFFER_KEYS.AGENCY_WORKSPACE,
      status: "active",
      limits_json: JSON.stringify({ teamSeats: 25, clientLinksPerReport: 20 })
    }
  ]).limits.clientLinksPerReport,
  20
);

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

function fakeProposalSummaryEnv() {
  const rows = [
    { fix_request_id: "fix_123", approval_status: "approved", delivery_status: "draft", execution_mode: "unsupported" },
    { fix_request_id: "fix_123", approval_status: "approved", delivery_status: "draft", execution_mode: "generated_proposal" },
    { fix_request_id: "fix_123", approval_status: "pending", delivery_status: "draft", execution_mode: "manual_task" }
  ];
  return {
    WAITLIST_DB: {
      prepare(sql) {
        assert.equal(sql.includes("approved_executable"), true);
        return {
          bind(fixRequestId) {
            const scoped = rows.filter((row) => row.fix_request_id === fixRequestId);
            return {
              first: async () => ({
                total: scoped.length,
                approved: scoped.filter((row) => row.approval_status === "approved").length,
                approved_executable: scoped.filter(
                  (row) => row.approval_status === "approved" && row.execution_mode !== "unsupported"
                ).length,
                dismissed: scoped.filter((row) => row.approval_status === "dismissed").length,
                executable: scoped.filter((row) => row.execution_mode !== "unsupported").length,
                delivered: scoped.filter((row) => row.delivery_status === "delivered").length
              })
            };
          }
        };
      }
    }
  };
}
