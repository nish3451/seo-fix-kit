import {
  DODO_DISPUTE_EVENTS,
  DODO_PAYMENT_FAILURE_EVENTS,
  DODO_PAYMENT_PROCESSING_EVENTS,
  DODO_PAYMENT_SUCCESS_EVENTS,
  DODO_REFUND_FAILURE_EVENTS,
  DODO_REFUND_SUCCESS_EVENTS,
  PAID_STATUSES,
  dodoAdaptiveCurrencyFeesInclusive,
  dodoApiKey,
  dodoBaseUrl,
  dodoBrandId,
  dodoCheckoutConfigStatus,
  dodoCountryFromRequest,
  dodoProductId,
  dodoProductMatches,
  dodoWebhookSecret,
  extractDodoPayment,
  hasDodoCheckoutConfig,
  verifyDodoWebhookSignature
} from "../../shared/dodo.js";
import {
  ADMIN_EDITABLE_FIX_REQUEST_STATUSES,
  adminNotificationEmail,
  buildPaymentNotificationEmail,
  buildStatusNotificationEmail,
  fixRequestStatusLabel,
  isEmailConfigured,
  normalizeFixRequestStatus
} from "../../shared/fulfillment.js";
import { buildRepairProposalsFromReport } from "../../shared/repair-execution.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { EMAIL_PROVIDER, sendWorkerEmail } from "../lib/email.js";
import { json, jsonNoStore, secureHeaders } from "../lib/http.js";
import { offerCatalogForOwner } from "../lib/offers.js";
import { preserveFixRequestReports, reportJsonForRow } from "../lib/report-data.js";
import { isRepairTablesMissingError } from "../lib/repair-tables.js";
import { ensureRepairQueueRows } from "../lib/repair-agent-actions.js";
import { sha256Hex } from "../lib/security.js";
import { billingFixRequestResponse, fixRequestResponse } from "../lib/serializers.js";
import { cleanQueueStatus } from "../../shared/repair-queue.js";
import { selectFixPackRepair } from "../../shared/fix-pack-repair-selection.js";
import {
  cleanText,
  isSafeReportId,
  isoDaysFromNow,
  isoSecondsFromNow,
  normalizeEmail,
  parseJson,
  safeHostname
} from "../lib/text.js";

const FIX_PACK_OFFER = {
  name: "SEO Fix Pack",
  productKey: "seofixkit_fix_pack",
  description: "One proof-backed repair pass for this report plus one rerun after fixes."
};

const FIX_PACK_DUE_DAYS = 5;

const FIX_PACK_NEXT_UPDATE_DAYS = 2;

const PAID_LIKE_FIX_REQUEST_STATUSES = new Set(["paid", "in_progress", "delivered"]);

const REBUY_BLOCKED_FIX_REQUEST_STATUSES = new Set(["refunded", "refund_failed", "disputed"]);

const CHECKOUT_URL_TTL_HOURS = 24;

async function requestFixPack(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Fix request storage is not configured." }, 503);

  const body = await request.json().catch(() => ({}));
  const reportId = cleanText(body.reportId || "", 140);
  if (!isSafeReportId(reportId)) return json({ error: "Report not found." }, 404);

  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, owner_email, owner_invite_id, score, summary_json, report_json, expires_at
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(reportId)
    .first();
  if (!row?.id || row.owner_email !== access.ownerEmail) return json({ error: "Report not found." }, 404);
  if (
    row.owner_invite_id &&
    access.accessMode !== "founder-override" &&
    row.owner_invite_id !== access.inviteId
  ) {
    return json({ error: "Report not found." }, 404);
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString()) return json({ error: "Report expired." }, 404);

  const summary = parseJson(row.summary_json, {});
  const report = parseJson(await reportJsonForRow(env, row), {});
  const now = new Date().toISOString();
  const note = cleanText(body.note || "", 1000);
  const isTest = Boolean(body.testMode || body.isTest) && access.accessMode === "founder-override";
  const existingFixRequest = await latestFixRequestForReport(env, row.id, access.ownerEmail);
  const skippedProposalSeed = { status: "skipped", total: 0, created: 0, executable: 0 };

  if (existingFixRequest?.status === "delivered") {
    return jsonNoStore({
      ok: true,
      mode: existingFixRequest.status,
      request: fixRequestWithProposalSummary(existingFixRequest, skippedProposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
  }

  if (REBUY_BLOCKED_FIX_REQUEST_STATUSES.has(existingFixRequest?.status)) {
    return jsonNoStore({
      ok: true,
      mode: existingFixRequest.status,
      checkoutAvailable: false,
      message:
        "This Fix Pack was refunded or disputed, so checkout is closed for this report. Email support@seofixkit.com to restart a repair.",
      request: fixRequestWithProposalSummary(existingFixRequest, skippedProposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
  }

  if (PAID_LIKE_FIX_REQUEST_STATUSES.has(existingFixRequest?.status)) {
    const proposalSeed = await seedRepairProposalsForFixRequest(env, report, existingFixRequest, row, access, now);
    return jsonNoStore({
      ok: true,
      mode: existingFixRequest.status,
      request: fixRequestWithProposalSummary(existingFixRequest, proposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
  }

  const repairContext = await fixPackRepairContext(env, access, row.id, report, body);

  if (repairContext.unavailable) {
    return jsonNoStore({
      error: "Repair queue storage is not ready. Retry after the repair queue migration is applied.",
      code: "REPAIR_QUEUE_MIGRATION_MISSING",
      checkoutAvailable: false,
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    }, 503);
  }

  if (repairContext.selectionConflict) {
    return jsonNoStore({
      error: "Selected repair is no longer available for checkout. Refresh the report and choose an active repair.",
      code: "FIX_PACK_REPAIR_SELECTION_UNAVAILABLE",
      checkoutAvailable: false,
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    }, 409);
  }

  if (!repairContext.selectedRepair) {
    return jsonNoStore({
      error: "No active proof-backed repair is available for checkout.",
      checkoutAvailable: false,
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    }, 409);
  }

  const fixRequest = existingFixRequest || await getOrCreateFixRequest(env, row, access, summary, note, now, {
    isTest,
    selectedRepair: repairContext.selectedRepair
  });

  const cachedCheckoutFresh =
    fixRequest.status === "checkout_created" &&
    fixRequest.checkout_url &&
    fixRequest.checkout_session_id &&
    fixRequest.checkout_created_at &&
    fixRequest.checkout_created_at > isoSecondsFromNow(-CHECKOUT_URL_TTL_HOURS * 60 * 60) &&
    checkoutRepairTargetMatches(fixRequest, repairContext.selectedRepair);
  if (cachedCheckoutFresh) {
    return jsonNoStore({
      ok: true,
      mode: "checkout",
      checkoutUrl: fixRequest.checkout_url,
      request: fixRequestWithProposalSummary(fixRequest, skippedProposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: repairContext.selectedRepair
    });
  }

  if (!hasDodoCheckoutConfig(env)) {
    return jsonNoStore({
      ok: true,
      mode: "request",
      checkoutAvailable: false,
      message: "Fix request saved. Checkout is paused until payment and webhook config pass.",
      request: fixRequestWithProposalSummary(fixRequest, skippedProposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: repairContext.selectedRepair
    });
  }

  const checkoutSchema = await fixPackCheckoutSchemaStatus(env);
  if (!checkoutSchema.ok) {
    return jsonNoStore({
      error: "Fix Pack checkout storage is not ready. Retry after the checkout metadata migration is applied.",
      code: "FIX_PACK_CHECKOUT_SCHEMA_MISSING",
      checkoutAvailable: false,
      request: fixRequestResponse(fixRequest, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: repairContext.selectedRepair
    }, 503);
  }

  let checkout;
  try {
    checkout = await createDodoFixPackCheckout(request, env, row, fixRequest, access, repairContext.selectedRepair);
  } catch (error) {
    return jsonNoStore(
      {
        error: error?.message || "Dodo checkout could not be created.",
        code: error?.code || "DODO_CHECKOUT_ERROR",
        request: fixRequestWithProposalSummary(fixRequest, skippedProposalSeed, now),
        offer: FIX_PACK_OFFER,
        selectedRepair: repairContext.selectedRepair
      },
      503
    );
  }
  const checkoutCreatedAt = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET status = 'checkout_created',
         checkout_session_id = ?,
         checkout_url = ?,
         checkout_created_at = ?,
         product_id = ?,
         checkout_repair_json = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      checkout.checkoutSessionId,
      checkout.checkoutUrl,
      checkoutCreatedAt,
      dodoProductId(env),
      checkoutRepairTargetJson(repairContext.selectedRepair),
      checkoutCreatedAt,
      fixRequest.id
    )
    .run();

  return jsonNoStore({
    ok: true,
    mode: "checkout",
    checkoutUrl: checkout.checkoutUrl,
    request: {
      ...fixRequestWithProposalSummary(fixRequest, skippedProposalSeed, checkoutCreatedAt),
      status: "checkout_created",
      checkoutSessionId: checkout.checkoutSessionId,
      offer: FIX_PACK_OFFER,
      checkoutCreatedAt
    },
    offer: FIX_PACK_OFFER,
    selectedRepair: repairContext.selectedRepair
  });
}

// Public, unauthenticated Fix Pack price for the homepage. Returns only the
// display price (no config internals), cached for an hour to keep Dodo calls
// off the public request path.
async function getPublicFixPackPricing(request, env, ctx) {
  const config = dodoCheckoutConfigStatus(env);
  if (!config.checkoutReady) return json({ ok: false }, 503);
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/public-pricing`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    // Base price without country/customer so one cached price serves everyone.
    const pricing = await previewDodoFixPackPricing({}, env, null);
    const response = new Response(
      JSON.stringify({ ok: true, pricing: { displayPrice: pricing.displayPrice || "" } }),
      {
        headers: secureHeaders({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=3600"
        })
      }
    );
    ctx?.waitUntil?.(cache.put(cacheKey, response.clone()));
    return response;
  } catch {
    return json({ ok: false }, 503);
  }
}

async function getFixPackPricingPreview(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);

  const config = dodoCheckoutConfigStatus(env);
  if (!config.checkoutReady) {
    return jsonNoStore(
      {
        ok: false,
        code: "PRICING_UNAVAILABLE",
        message: "Pricing is unavailable because checkout or webhook config is incomplete.",
        pricing: {
          status: "unavailable",
          source: "dodo",
          environment: config.environment || "",
          missing: dodoConfigMissing(config)
        }
      },
      503
    );
  }

  try {
    const pricing = await previewDodoFixPackPricing(request, env, access);
    return jsonNoStore({ ok: true, pricing });
  } catch (error) {
    return jsonNoStore(
      {
        ok: false,
        code: error?.code || "PRICING_UNAVAILABLE",
        message: error?.message || "Dodo pricing preview is unavailable.",
        pricing: {
          status: "unavailable",
          source: "dodo"
        }
      },
      503
    );
  }
}

async function getBillingSummary(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Billing storage is not configured." }, 503);

  const now = new Date().toISOString();
  const dodoConfig = dodoCheckoutConfigStatus(env);
  const pricing = await billingPricingState(request, env, access, dodoConfig);
  const offers = await offerCatalogForOwner(env, access.ownerEmail, {
    fixPackCheckoutReady: dodoConfig.checkoutReady
  });
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE owner_email = ?
       AND is_test = 0
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(access.ownerEmail)
    .all();
  const fixRows = rows.results || [];
  const requests = fixRows.map((row) => billingFixRequestResponse(row, now));
  const payments = fixRows
    .filter((row) => row.payment_id || row.paid_at || row.refunded_at || row.dispute_event || row.status === "payment_failed")
    .map(billingPaymentResponse);

  return jsonNoStore({
    ok: true,
    owner: {
      email: access.ownerEmail
    },
    provider: {
      name: "Dodo Payments",
      source: "dodo",
      environment: dodoConfig.environment || "",
      checkoutReady: dodoConfig.checkoutReady,
      missing: dodoConfigMissing(dodoConfig)
    },
    billingLayer: {
      name: "BillingSDK-compatible customer portal",
      mode: "worker-dodo-source-of-truth"
    },
    product: {
      ...FIX_PACK_OFFER,
      mode: "one_time_fix_pack",
      checkoutStartsFrom: "report",
      checkoutNote: "Start checkout from a report with proven fixes so payment stays tied to a repair brief."
    },
    pricing,
    offers,
    subscriptionState: {
      status: "not_live",
      label: "No recurring subscription",
      message: "SEO Fix Kit currently sells one-time Fix Pack requests. Repair Agent and Growth Add-On subscriptions remain roadmap."
    },
    subscriptions: [],
    requests,
    payments,
    generatedAt: now
  });
}

async function billingPricingState(request, env, access, config) {
  if (!config.checkoutReady) {
    return {
      status: "unavailable",
      source: "dodo",
      environment: config.environment || "",
      missing: dodoConfigMissing(config),
      message: "Pricing is unavailable because checkout or webhook config is incomplete."
    };
  }

  try {
    return await previewDodoFixPackPricing(request, env, access);
  } catch (error) {
    return {
      status: "unavailable",
      source: "dodo",
      environment: config.environment || "",
      missing: [],
      message: error?.message || "Dodo pricing preview is unavailable."
    };
  }
}

async function getOrCreateFixRequest(env, reportRow, access, summary, note, now, options = {}) {
  const existing = await latestFixRequestForReport(env, reportRow.id, access.ownerEmail);
  if (existing?.id) return existing;

  const id = crypto.randomUUID();
  const isTest = options.isTest ? 1 : 0;
  const insert = await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_requests
      (id, report_id, owner_email, target_url, target_host, score, issue_count, status, note, is_test, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
     ON CONFLICT(report_id, owner_email) DO NOTHING`
  )
    .bind(
      id,
      reportRow.id,
      access.ownerEmail,
      reportRow.url,
      reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
      reportRow.score,
      Number(summary.totalFindings || 0),
      note,
      isTest,
      now,
      now
    )
    .run();
  if (insert?.meta?.changes === 0) {
    const raced = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM fix_requests
       WHERE report_id = ? AND owner_email = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(reportRow.id, access.ownerEmail)
      .first();
    if (raced?.id) return raced;
  }
  await logFixRequestEvent(env, {
    fixRequestId: id,
    event: "created",
    actorType: "owner",
    actorEmail: access.ownerEmail,
    fromStatus: "",
    toStatus: "new",
    reason: note,
    detail: {
      reportId: reportRow.id,
      isTest: Boolean(isTest),
      selectedRepair: options.selectedRepair || null
    }
  });

  return {
    id,
    report_id: reportRow.id,
    owner_email: access.ownerEmail,
    target_url: reportRow.url,
    target_host: reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
    score: reportRow.score,
    issue_count: Number(summary.totalFindings || 0),
    status: "new",
    note,
    is_test: isTest,
    created_at: now,
    updated_at: now
  };
}

async function latestFixRequestForReport(env, reportId, ownerEmail) {
  return env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE report_id = ? AND owner_email = ?
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(reportId, ownerEmail)
    .first();
}

async function fixPackRepairContext(env, access, reportId, report = {}, body = {}) {
  const { items, unavailable } = await ensureRepairQueueRows(env, access, reportId, report);
  const selection = selectFixPackRepair(items, body);
  return {
    items,
    unavailable: Boolean(unavailable),
    selectedRepair: selection.selectedRepair,
    selectionConflict: selection.conflict
  };
}

async function fixPackCheckoutSchemaStatus(env) {
  try {
    const statement = env.WAITLIST_DB.prepare("SELECT checkout_repair_json FROM fix_requests LIMIT 1");
    if (typeof statement.first === "function") {
      await statement.first();
    } else {
      await statement.bind().first();
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Fix Pack checkout metadata column is missing."
    };
  }
}

function checkoutRepairTarget(selectedRepair = null) {
  if (!selectedRepair) return { queueItemId: "", issueId: "", status: "" };
  return {
    queueItemId: cleanText(selectedRepair.queueItemId || selectedRepair.queue_item_id || "", 160),
    issueId: cleanText(selectedRepair.issueId || selectedRepair.issue_id || "", 160),
    status: selectedRepair.status ? cleanQueueStatus(selectedRepair.status) : ""
  };
}

function checkoutRepairTargetJson(selectedRepair = null) {
  return JSON.stringify(checkoutRepairTarget(selectedRepair));
}

function checkoutRepairTargetFromJson(value = "") {
  if (!value) return null;
  const parsed = parseJson(value, null);
  if (!parsed || typeof parsed !== "object") return null;
  return checkoutRepairTarget(parsed);
}

function checkoutRepairTargetMatches(fixRequest = {}, selectedRepair = null) {
  const stored = checkoutRepairTargetFromJson(fixRequest.checkout_repair_json || "");
  if (!stored) return false;
  const current = checkoutRepairTarget(selectedRepair);
  return stored.queueItemId === current.queueItemId &&
    stored.issueId === current.issueId &&
    stored.status === current.status;
}

async function seedRepairProposalsForFixRequest(env, report, fixRequest, reportRow, access, now) {
  if (!env.WAITLIST_DB || !fixRequest?.id || !report?.url) {
    return { status: "skipped", total: 0, created: 0, executable: 0 };
  }
  const proposals = buildRepairProposalsFromReport(report, {
    fixRequestId: fixRequest.id,
    ownerEmail: access.ownerEmail,
    reportId: reportRow.id,
    targetUrl: reportRow.url,
    targetHost: reportRow.target_host || safeHostname(reportRow.url),
    limit: 25
  });
  if (!proposals.length) return { status: "ready", total: 0, created: 0, executable: 0 };

  try {
    const existing = await env.WAITLIST_DB.prepare(
      `SELECT issue_id
       FROM repair_proposals
       WHERE fix_request_id = ?`
    )
      .bind(fixRequest.id)
      .all();
    const existingIssueIds = new Set((existing.results || []).map((row) => row.issue_id));
    let created = 0;
    for (const proposal of proposals) {
      if (existingIssueIds.has(proposal.issueId)) continue;
      const result = await env.WAITLIST_DB.prepare(
        `INSERT OR IGNORE INTO repair_proposals
          (id, fix_request_id, report_id, owner_email, issue_id, issue_title, target_url, target_host,
           severity, source, priority, execution_mode, approval_status, delivery_status, generated_title,
           generated_summary, proof_json, proposal_json, acceptance_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          fixRequest.id,
          reportRow.id,
          access.ownerEmail,
          proposal.issueId,
          proposal.issueTitle,
          proposal.targetUrl || reportRow.url,
          proposal.targetHost || reportRow.target_host || safeHostname(reportRow.url),
          proposal.severity,
          proposal.source,
          proposal.priority,
          proposal.executionMode,
          proposal.approvalStatus,
          proposal.deliveryStatus,
          proposal.generatedTitle,
          proposal.generatedSummary,
          jsonForStorage(proposal.proof || {}, 4000, {}),
          jsonForStorage(proposal.proposal || {}, 4000, { truncated: true }),
          jsonForStorage(proposal.acceptance || [], 2000, []),
          now,
          now
        )
        .run();
      created += Number(result?.meta?.changes || 0);
    }
    return {
      status: "ready",
      total: proposals.length,
      created,
      executable: proposals.filter((proposal) => proposal.executionMode !== "unsupported").length
    };
  } catch {
    return { status: "unavailable", total: 0, created: 0, executable: 0 };
  }
}

async function seedRepairProposalsForPaidFixRequest(env, fixRequest, now) {
  if (!env.WAITLIST_DB || !fixRequest?.id || !fixRequest?.report_id || !fixRequest?.owner_email) {
    return { status: "skipped", total: 0, created: 0, executable: 0 };
  }
  if (!["paid", "in_progress"].includes(fixRequest.status || "")) {
    return { status: "skipped", total: 0, created: 0, executable: 0 };
  }
  try {
    const reportRow = await env.WAITLIST_DB.prepare(
      `SELECT id, url, target_host, report_json
       FROM audit_reports
       WHERE id = ?
       LIMIT 1`
    )
      .bind(fixRequest.report_id)
      .first();
    const report = parseJson(await reportJsonForRow(env, reportRow || {}), {});
    return seedRepairProposalsForFixRequest(
      env,
      report,
      fixRequest,
      reportRow || { id: fixRequest.report_id, url: fixRequest.target_url || "", target_host: fixRequest.target_host || "" },
      { ownerEmail: fixRequest.owner_email },
      now
    );
  } catch {
    return { status: "unavailable", total: 0, created: 0, executable: 0 };
  }
}

function fixRequestWithProposalSummary(fixRequest, proposalSeed, now) {
  return {
    ...fixRequestResponse(fixRequest, now),
    repairProposalSummary: proposalSeed
  };
}

function jsonForStorage(value, maxLength, fallback) {
  const initial = JSON.stringify(value ?? fallback);
  if (initial.length <= maxLength) return initial;
  for (const maxStringLength of [3000, 2000, 1000, 500, 200, 80]) {
    const compacted = JSON.stringify(compactJsonStrings(value ?? fallback, maxStringLength));
    if (compacted.length <= maxLength) return compacted;
  }
  return JSON.stringify(fallback);
}

function compactJsonStrings(value, maxStringLength) {
  if (typeof value === "string") return value.slice(0, maxStringLength);
  if (Array.isArray(value)) return value.map((item) => compactJsonStrings(item, maxStringLength));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, compactJsonStrings(item, maxStringLength)])
  );
}

function billingPaymentResponse(row) {
  const currency = normalizeCurrencyCode(row.payment_currency || row.refund_currency || "");
  const amountMinor = numberOrNull(row.payment_amount);
  const refundCurrency = normalizeCurrencyCode(row.refund_currency || "");
  const refundAmountMinor = numberOrNull(row.refund_amount);
  const type = row.refunded_at
    ? "refund"
    : row.dispute_event
      ? "dispute"
      : row.status === "payment_failed"
        ? "failed_payment"
        : "payment";

  return {
    id: row.payment_id || row.checkout_session_id || row.id,
    type,
    status: row.status || "",
    statusLabel: fixRequestStatusLabel(row.status || "new"),
    paymentId: row.payment_id || "",
    checkoutSessionId: row.checkout_session_id || "",
    refundId: row.refund_id || "",
    disputeEvent: row.dispute_event || "",
    amountMinor,
    currency,
    displayAmount: currency && amountMinor !== null ? formatMinorCurrency(amountMinor, currency) : "",
    refundAmountMinor,
    refundCurrency,
    displayRefundAmount: refundCurrency && refundAmountMinor !== null ? formatMinorCurrency(refundAmountMinor, refundCurrency) : "",
    targetHost: row.target_host,
    targetUrl: row.target_url,
    reportPath: `/beta/reports/${row.report_id}`,
    paidAt: row.paid_at || "",
    refundedAt: row.refunded_at || "",
    disputedAt: row.disputed_at || "",
    createdAt: row.paid_at || row.refunded_at || row.disputed_at || row.updated_at || row.created_at || ""
  };
}

function isAllowedAdminStatusTransition(currentStatus, requestedStatus) {
  const current = normalizeFixRequestStatus(currentStatus, "new");
  const requested = normalizeFixRequestStatus(requestedStatus, current);
  if (current === requested) return ADMIN_EDITABLE_FIX_REQUEST_STATUSES.has(requested) || requested === "paid";
  const allowed = {
    new: new Set(["checkout_created"]),
    checkout_created: new Set(["checkout_created"]),
    payment_failed: new Set(["checkout_created"]),
    paid: new Set(["in_progress", "delivered"]),
    in_progress: new Set(["delivered"]),
    delivered: new Set([]),
    refunded: new Set([]),
    refund_failed: new Set([]),
    disputed: new Set([])
  };
  return Boolean(allowed[current]?.has(requested));
}

async function validateFinalReportForFixRequest(env, fixRequest, finalReportId) {
  if (!isSafeReportId(finalReportId)) return { ok: false, error: "Final rerun report was not found." };
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, owner_email, score, summary_json, created_at, expires_at
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(finalReportId)
    .first();
  if (!row?.id) return { ok: false, error: "Final rerun report was not found." };
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    return { ok: false, error: "Final rerun report is expired. Run the audit again first." };
  }
  if (row.owner_email !== fixRequest.owner_email) {
    return { ok: false, error: "Final rerun report belongs to another customer." };
  }
  const finalHost = row.target_host || safeHostname(row.url);
  const originalHost = fixRequest.target_host || safeHostname(fixRequest.target_url);
  if (finalHost !== originalHost) {
    return { ok: false, error: "Final rerun report must be for the same website." };
  }
  if (fixRequest.paid_at && row.created_at && row.created_at < fixRequest.paid_at) {
    return { ok: false, error: "Final rerun report must be created after payment." };
  }
  const summary = parseJson(row.summary_json, {});
  return {
    ok: true,
    beforeAfterSummary: {
      beforeReportId: fixRequest.report_id,
      finalReportId: row.id,
      beforeScore: Number(fixRequest.score || 0),
      afterScore: Number(row.score || 0),
      beforeFindings: Number(fixRequest.issue_count || 0),
      afterFindings: Number(summary.totalFindings || 0),
      generatedAt: new Date().toISOString()
    }
  };
}

async function previewDodoFixPackPricing(request, env, access) {
  const body = {
    product_cart: [{ product_id: dodoProductId(env), quantity: 1 }],
    adaptive_currency_fees_inclusive: dodoAdaptiveCurrencyFeesInclusive(env),
    customer: access?.ownerEmail ? { email: access.ownerEmail } : undefined
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const { response, payload } = await fetchDodoJson(`${dodoBaseUrl(env)}/checkouts/preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || "Dodo pricing preview failed."), {
      status: response.status,
      code: payload?.code || "DODO_PRICING_PREVIEW_ERROR"
    });
  }

  const pricing = parseDodoPricingPreview(payload);
  if (!pricing.displayPrice) {
    throw Object.assign(new Error("Dodo did not return a displayable price."), {
      code: "DODO_PRICING_FORMAT_ERROR"
    });
  }
  return {
    ...pricing,
    status: "available",
    source: "dodo",
    country: country || "",
    feesInclusive: dodoAdaptiveCurrencyFeesInclusive(env)
  };
}

async function createDodoFixPackCheckout(request, env, reportRow, fixRequest, access, selectedRepair = null) {
  const returnUrl = new URL(request.url);
  returnUrl.pathname = `/beta/reports/${reportRow.id}`;
  returnUrl.search = "";
  returnUrl.searchParams.set("checkout", "return");
  returnUrl.searchParams.set("fixRequestId", fixRequest.id);

  const body = {
    product_cart: [{ product_id: dodoProductId(env), quantity: 1 }],
    return_url: returnUrl.toString(),
    adaptive_currency_fees_inclusive: dodoAdaptiveCurrencyFeesInclusive(env),
    customer: { email: access.ownerEmail },
    metadata: {
      product_key: FIX_PACK_OFFER.productKey,
      fix_request_id: fixRequest.id,
      report_id: reportRow.id,
      target_host: reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
      test_mode: fixRequest.is_test ? "1" : "0",
      repair_issue_id: selectedRepair?.issueId || "",
      repair_queue_item_id: selectedRepair?.queueItemId || "",
      repair_title: cleanText(selectedRepair?.title || "", 120),
      repair_status: selectedRepair?.status || ""
    }
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const { response, payload } = await fetchDodoJson(`${dodoBaseUrl(env)}/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message =
      payload?.code === "MERCHANT_NOT_LIVE"
        ? "Dodo live payments are not enabled for this merchant yet."
        : payload?.message || "Dodo checkout could not be created.";
    return Promise.reject(Object.assign(new Error(message), { status: response.status, code: payload?.code || "" }));
  }

  const checkoutUrl = payload.checkout_url || payload.payment_link || "";
  if (!checkoutUrl) throw new Error("Dodo did not return a checkout URL.");
  return {
    checkoutUrl,
    checkoutSessionId: payload.session_id || payload.checkout_session_id || payload.id || ""
  };
}

async function fetchDodoJson(url, options) {
  if (!url) {
    throw Object.assign(new Error("Dodo environment is not configured."), { code: "DODO_ENVIRONMENT_MISSING" });
  }
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function parseDodoPricingPreview(payload = {}) {
  const breakup = objectValue(payload.current_breakup) || objectValue(payload.breakup) || {};
  const currency = normalizeCurrencyCode(payload.currency || payload.payment_currency || payload.checkout_currency);
  const amountMinor = numberOrNull(
    breakup.total_amount ??
      payload.total_amount ??
      payload.amount_total ??
      payload.total_price ??
      payload.total ??
      payload.amount
  );
  const displayPrice =
    textValue(payload.display_price) ||
    textValue(payload.displayPrice) ||
    textValue(payload.formatted_total) ||
    textValue(payload.formattedTotal) ||
    (currency && amountMinor !== null ? formatMinorCurrency(amountMinor, currency) : "");

  return {
    displayPrice,
    currency,
    amountMinor,
    subtotalMinor: numberOrNull(breakup.subtotal ?? payload.subtotal),
    taxMinor: numberOrNull(breakup.tax ?? payload.tax),
    discountMinor: numberOrNull(breakup.discount ?? payload.discount)
  };
}

function dodoConfigMissing(config = {}) {
  const missing = [];
  if (!config.apiKey) missing.push("apiKey");
  if (!config.productId) missing.push("productId");
  if (!config.brandId) missing.push("brandId");
  if (!config.environment) missing.push("environment");
  if (!config.webhookSecret) missing.push("webhookSecret");
  return missing;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function textValue(value) {
  const text = String(value || "").trim();
  return text || "";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCurrencyCode(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function formatMinorCurrency(amountMinor, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(amountMinor / minorCurrencyDivisor(currency));
  } catch {
    return currency ? `${currency} ${amountMinor}` : String(amountMinor);
  }
}

function minorCurrencyDivisor(currency) {
  return new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]).has(currency)
    ? 1
    : 100;
}

async function handleDodoWebhook(request, env, ctx) {
  if (!env.WAITLIST_DB || !dodoWebhookSecret(env)) {
    return jsonNoStore({ error: "Dodo webhook is not configured." }, 503);
  }

  const payloadText = await request.text();
  const webhookId = request.headers.get("webhook-id") || request.headers.get("svix-id") || "";
  const webhookTimestamp =
    request.headers.get("webhook-timestamp") || request.headers.get("svix-timestamp") || "";
  const webhookSignature =
    request.headers.get("webhook-signature") || request.headers.get("svix-signature") || "";

  const verified = await verifyDodoWebhookSignature({
    payload: payloadText,
    webhookId,
    webhookTimestamp,
    webhookSignature,
    secret: dodoWebhookSecret(env)
  });
  if (!verified) return jsonNoStore({ error: "Invalid signature." }, 400);

  let event;
  try {
    event = JSON.parse(payloadText);
  } catch {
    return jsonNoStore({ error: "Invalid JSON payload." }, 400);
  }

  const eventType = String(event?.type || "");
  const payment = extractDodoPayment(event?.data || {});
  const payloadHash = await sha256Hex(payloadText);
  const reserved = await reserveDodoWebhookEvent(env, {
    webhookId,
    eventType,
    payment,
    payloadHash,
    payloadText
  });
  if (reserved.duplicate) return jsonNoStore({ received: true, duplicate: true });

  try {
    const result = await processDodoPaymentWebhook(env, eventType, payment, webhookId);
    await markDodoWebhookProcessed(env, webhookId, result.status || "processed", "", result.fixRequestId || payment.metadataFixRequestId || "");
    if (result.paymentNotification?.fixRequest) {
      const notification = notifyPaymentSucceeded(env, result.paymentNotification.fixRequest, payment);
      if (ctx?.waitUntil) ctx.waitUntil(notification);
      else await notification;
    }
    return jsonNoStore({ received: true, ...result });
  } catch (error) {
    await markDodoWebhookProcessed(env, webhookId, "error", error?.message || "Webhook processing failed.", payment.metadataFixRequestId || "");
    return jsonNoStore({ error: "Webhook processing failed." }, 500);
  }
}

async function reserveDodoWebhookEvent(env, { webhookId, eventType, payment, payloadHash, payloadText }) {
  if (!webhookId) throw new Error("Missing Dodo webhook id.");
  const now = new Date().toISOString();
  const inserted = await env.WAITLIST_DB.prepare(
    `INSERT OR IGNORE INTO dodo_webhook_events
      (webhook_id, event_type, payment_id, fix_request_id, status, error, payload_hash, payload_json,
       received_count, first_received_at, last_received_at, processed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'received', '', ?, ?, 1, ?, ?, '', ?, ?)`
  )
    .bind(
      webhookId,
      eventType,
      payment.paymentId,
      payment.metadataFixRequestId,
      payloadHash,
      payloadText.slice(0, 10000),
      now,
      now,
      now,
      now
    )
    .run();

  if (inserted?.meta?.changes === 1) return { duplicate: false };

  const existing = await env.WAITLIST_DB.prepare(
    "SELECT status, payload_hash FROM dodo_webhook_events WHERE webhook_id = ?"
  )
    .bind(webhookId)
    .first();
  if (existing?.payload_hash && existing.payload_hash !== payloadHash) {
    await markDodoWebhookProcessed(env, webhookId, "error", "Webhook id replayed with a different payload.", payment.metadataFixRequestId || "");
    throw new Error("Webhook id replayed with a different payload.");
  }
  if (existing?.status === "processed" || existing?.status === "ignored") return { duplicate: true };
  if (existing) {
    await env.WAITLIST_DB.prepare(
      `UPDATE dodo_webhook_events
       SET received_count = received_count + 1, last_received_at = ?, updated_at = ?
       WHERE webhook_id = ?`
    )
      .bind(now, now, webhookId)
      .run();
    return { duplicate: false };
  }
  throw new Error("Webhook receipt could not be reserved.");
}

async function processDodoPaymentWebhook(env, eventType, payment, webhookId = "") {
  if (!payment.paymentId && !payment.checkoutSessionId && !payment.metadataFixRequestId) {
    return { ok: false, ignored: true, status: "ignored", reason: "missing_payment_identity" };
  }

  const fixRequest = await findFixRequestForPayment(env, payment);
  if (!fixRequest?.id) {
    return { ok: false, ignored: true, status: "ignored", reason: "fix_request_not_found" };
  }

  const now = new Date().toISOString();
  if (payment.metadataWebhookDrill && Number(fixRequest.is_test || 0) !== 1) {
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_identity_rejected",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status || "new",
      reason: "webhook_drill_requires_test_request",
      detail: { eventType, paymentId: payment.paymentId, webhookId }
    });
    return {
      ok: false,
      ignored: true,
      status: "ignored",
      reason: "webhook_drill_requires_test_request",
      fixRequestId: fixRequest.id
    };
  }
  const identity = await dodoPaymentIdentityStatus(env, eventType, payment, fixRequest);
  if (!identity.ok) {
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_identity_rejected",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status || "new",
      reason: identity.reason,
      detail: { eventType, paymentId: payment.paymentId, webhookId }
    });
    return { ok: false, ignored: true, status: "ignored", reason: identity.reason, fixRequestId: fixRequest.id };
  }

  if (DODO_PAYMENT_SUCCESS_EVENTS.has(eventType)) {
    if (payment.status && !PAID_STATUSES.has(payment.status)) {
      return { ok: false, ignored: true, status: "ignored", reason: "not_paid", fixRequestId: fixRequest.id };
    }
    const paymentStatusReason = identity.repairTargetState && identity.repairTargetState !== "active"
      ? `repair_target_${identity.repairTargetState}`
      : identity.checkoutSessionState === "superseded"
        ? "checkout_session_superseded"
        : "";
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE
             WHEN status IN ('in_progress', 'delivered', 'refunded', 'disputed') THEN status
             ELSE 'paid'
           END,
           payment_id = ?,
           checkout_session_id = COALESCE(checkout_session_id, ?),
           payment_amount = ?,
           payment_currency = ?,
           payment_customer_email = ?,
           dodo_business_id = ?,
           dodo_brand_id = ?,
           paid_at = COALESCE(paid_at, ?),
           due_at = COALESCE(due_at, ?),
           next_update_at = COALESCE(next_update_at, ?),
           status_reason = COALESCE(NULLIF(?, ''), status_reason),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        payment.paymentId,
        payment.checkoutSessionId,
        payment.amount || null,
        payment.currency || "",
        payment.customerEmail || "",
        payment.businessId || "",
        payment.brandId || "",
        now,
        isoDaysFromNow(FIX_PACK_DUE_DAYS),
        isoDaysFromNow(FIX_PACK_NEXT_UPDATE_DAYS),
        paymentStatusReason,
        now,
        fixRequest.id
      )
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_succeeded",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: PAID_LIKE_FIX_REQUEST_STATUSES.has(fixRequest.status) ? fixRequest.status : "paid",
      reason: payment.paymentId,
      detail: {
        webhookId,
        amount: payment.amount,
        currency: payment.currency,
        checkoutSessionId: payment.checkoutSessionId,
        repairIssueId: payment.metadataRepairIssueId || "",
        repairQueueItemId: payment.metadataRepairQueueItemId || "",
        repairTitle: payment.metadataRepairTitle || "",
        checkoutSessionState: identity.checkoutSessionState || "current",
        repairTargetState: identity.repairTargetState || "active",
        repairTargetStatus: identity.repairTargetStatus || ""
      }
    });
    const updated = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE id = ? LIMIT 1")
      .bind(fixRequest.id)
      .first();
    await seedRepairProposalsForPaidFixRequest(env, updated || { ...fixRequest, status: "paid" }, now);
    await preserveFixRequestReports(env, updated || fixRequest);
    return {
      ok: true,
      status: "processed",
      paid: true,
      fixRequestId: fixRequest.id,
      paymentNotification: { fixRequest: updated || fixRequest }
    };
  }

  if (DODO_PAYMENT_FAILURE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE WHEN paid_at IS NOT NULL THEN status ELSE 'payment_failed' END,
           payment_id = COALESCE(payment_id, ?),
           checkout_session_id = COALESCE(checkout_session_id, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.paymentId, payment.checkoutSessionId, now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_failed",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.paid_at ? fixRequest.status || "new" : "payment_failed",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", paid: false, fixRequestId: fixRequest.id };
  }

  if (DODO_PAYMENT_PROCESSING_EVENTS.has(eventType)) {
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_processing",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status || "new",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", processing: true, fixRequestId: fixRequest.id };
  }

  if (DODO_REFUND_SUCCESS_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = 'refunded',
           refund_id = ?,
           refund_amount = ?,
           refund_currency = ?,
           refunded_at = COALESCE(refunded_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.refundId || "", payment.amount || null, payment.currency || "", now, now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "refund_succeeded",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: "refunded",
      reason: payment.refundId || eventType,
      detail: { webhookId, paymentId: payment.paymentId, amount: payment.amount, currency: payment.currency }
    });
    return { ok: true, status: "processed", refunded: true, fixRequestId: fixRequest.id };
  }

  if (DODO_REFUND_FAILURE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE WHEN status = 'refunded' THEN status ELSE 'refund_failed' END,
           refund_id = COALESCE(refund_id, ?),
           refund_amount = COALESCE(refund_amount, ?),
           refund_currency = COALESCE(refund_currency, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.refundId || "", payment.amount || null, payment.currency || "", now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "refund_failed",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status === "refunded" ? "refunded" : "refund_failed",
      reason: payment.refundId || eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", refundFailed: true, fixRequestId: fixRequest.id };
  }

  if (DODO_DISPUTE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE WHEN status = 'delivered' THEN status ELSE 'disputed' END,
           dispute_event = ?,
           disputed_at = COALESCE(disputed_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(eventType, now, now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "dispute_event",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status === "delivered" ? "delivered" : "disputed",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", disputed: true, fixRequestId: fixRequest.id };
  }

  return { ok: true, ignored: true, status: "ignored", reason: "unsupported_event", fixRequestId: fixRequest.id };
}

async function findFixRequestForPayment(env, payment) {
  if (payment.metadataFixRequestId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE id = ? LIMIT 1")
      .bind(payment.metadataFixRequestId)
      .first();
    if (row?.id) return row;
  }
  if (payment.checkoutSessionId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE checkout_session_id = ? LIMIT 1")
      .bind(payment.checkoutSessionId)
      .first();
    if (row?.id) return row;
  }
  if (payment.paymentId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE payment_id = ? LIMIT 1")
      .bind(payment.paymentId)
      .first();
    if (row?.id) return row;
  }
  return null;
}

async function dodoPaymentIdentityStatus(env, eventType, payment, fixRequest) {
  if (DODO_REFUND_SUCCESS_EVENTS.has(eventType) || DODO_REFUND_FAILURE_EVENTS.has(eventType) || DODO_DISPUTE_EVENTS.has(eventType)) {
    if (!payment.paymentId || !fixRequest.payment_id || payment.paymentId !== fixRequest.payment_id) {
      return { ok: false, reason: "payment_id_mismatch" };
    }
    return { ok: true };
  }

  if (payment.metadataProductKey !== FIX_PACK_OFFER.productKey) {
    return { ok: false, reason: payment.metadataProductKey ? "product_key_mismatch" : "missing_product_key" };
  }
  if (!dodoProductMatches(payment, dodoProductId(env))) {
    return { ok: false, reason: payment.productIds.length ? "product_mismatch" : "missing_product_cart" };
  }
  if (payment.productQuantity !== 1) {
    return { ok: false, reason: "product_quantity_mismatch" };
  }
  const expectedBrandId = dodoBrandId(env);
  if (expectedBrandId && payment.brandId !== expectedBrandId) {
    return { ok: false, reason: payment.brandId ? "brand_mismatch" : "missing_brand_id" };
  }
  const expectedBusinessId = String(env.DODO_SEOFIXKIT_BUSINESS_ID || "");
  if (expectedBusinessId && payment.businessId !== expectedBusinessId) {
    return { ok: false, reason: payment.businessId ? "business_mismatch" : "missing_business_id" };
  }
  if (payment.metadataReportId && payment.metadataReportId !== fixRequest.report_id) {
    return { ok: false, reason: "report_id_mismatch" };
  }
  let checkoutSessionState = "current";
  if (
    fixRequest.checkout_session_id &&
    payment.checkoutSessionId &&
    payment.checkoutSessionId !== fixRequest.checkout_session_id
  ) {
    if (payment.metadataFixRequestId !== fixRequest.id || payment.metadataReportId !== fixRequest.report_id) {
      return { ok: false, reason: "checkout_session_mismatch" };
    }
    checkoutSessionState = "superseded";
  }
  let repairTargetState = null;
  const repairTarget = checkoutRepairTargetFromJson(fixRequest.checkout_repair_json || "");
  if (repairTarget) {
    if (cleanText(payment.metadataRepairQueueItemId || "", 160) !== repairTarget.queueItemId) {
      return { ok: false, reason: "repair_target_mismatch" };
    }
    if (cleanText(payment.metadataRepairIssueId || "", 160) !== repairTarget.issueId) {
      return { ok: false, reason: "repair_target_mismatch" };
    }
    const nextRepairTargetState = await checkoutRepairTargetFulfillmentState(env, fixRequest, repairTarget);
    if (!nextRepairTargetState.ok) return nextRepairTargetState;
    repairTargetState = nextRepairTargetState;
  }
  if (payment.customerEmail && normalizeEmail(payment.customerEmail) !== fixRequest.owner_email) {
    return { ok: false, reason: "customer_email_mismatch" };
  }
  if (!payment.amount || !payment.currency) {
    return { ok: false, reason: "missing_payment_amount" };
  }
  return {
    ok: true,
    checkoutSessionState,
    repairTargetState: repairTargetState?.state || "",
    repairTargetStatus: repairTargetState?.status || ""
  };
}

async function checkoutRepairTargetFulfillmentState(env, fixRequest = {}, repairTarget = {}) {
  if (!repairTarget.queueItemId || !repairTarget.issueId) return { ok: false, reason: "repair_target_mismatch" };
  let row = null;
  try {
    row = await env.WAITLIST_DB.prepare(
      `SELECT id, issue_id, status
       FROM repair_queue_items
       WHERE id = ?
         AND report_id = ?
         AND owner_email = ?
       LIMIT 1`
    )
      .bind(repairTarget.queueItemId, fixRequest.report_id, fixRequest.owner_email)
      .first();
  } catch (error) {
    if (isRepairTablesMissingError(error)) return { ok: true, state: "unavailable", status: "" };
    throw error;
  }
  if (!row?.id) return { ok: true, state: "missing", status: "" };
  if (row.issue_id !== repairTarget.issueId) return { ok: false, reason: "repair_target_mismatch" };
  const status = cleanQueueStatus(row.status);
  if (["fixed", "ignored"].includes(status)) return { ok: true, state: "closed", status };
  return { ok: true, state: "active", status };
}

async function markDodoWebhookProcessed(env, webhookId, status, error = "", fixRequestId = "") {
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE dodo_webhook_events
     SET status = ?, error = ?, fix_request_id = COALESCE(NULLIF(fix_request_id, ''), ?), processed_at = ?, updated_at = ?
     WHERE webhook_id = ?`
  )
    .bind(status, String(error || "").slice(0, 1000), fixRequestId, status === "processed" ? now : "", now, webhookId)
    .run();
}

async function notifyPaymentSucceeded(env, fixRequest, payment) {
  const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com").replace(/\/+$/, "");
  const report = await reportForNotification(env, fixRequest.report_id);
  const recipients = [
    { type: "owner", email: normalizeEmail(fixRequest.owner_email) },
    { type: "admin", email: adminNotificationEmail(env) }
  ];
  const results = [];

  for (const recipient of recipients) {
    results.push(
      await sendFixPackPaymentEmail({
        env,
        appOrigin,
        fixRequest,
        report,
        payment,
        recipientType: recipient.type,
        recipientEmail: recipient.email
      })
    );
  }

  const now = new Date().toISOString();
  const errors = results
    .filter((result) => result.status !== "sent" && result.error)
    .map((result) => `${result.recipientType}:${result.error}`)
    .join("; ")
    .slice(0, 1000);
  await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET last_notification_at = ?,
         notification_error = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(now, errors, now, fixRequest.id)
    .run();
}

async function sendFixPackPaymentEmail({
  env,
  appOrigin,
  fixRequest,
  report,
  payment,
  recipientType,
  recipientEmail
}) {
  const event = "payment_succeeded";
  if (await hasSentFixRequestNotification(env, fixRequest.id, event, recipientType)) {
    return { recipientType, status: "duplicate" };
  }
  if (!recipientEmail) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail: "",
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_recipient"
    });
    return { recipientType, status: "skipped", error: "missing_recipient" };
  }

  if (!isEmailConfigured(env)) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_email_config"
    });
    return { recipientType, status: "skipped", error: "missing_email_config" };
  }

  const email = buildPaymentNotificationEmail({
    appOrigin,
    fixRequest,
    report,
    payment,
    recipientType
  });
  try {
    const payload = await sendWorkerEmail(env, {
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      tag: "fix-pack-payment"
    });
    const providerMessageId = payload.messageId;
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "sent",
      provider: EMAIL_PROVIDER,
      providerMessageId
    });
    return { recipientType, status: "sent", providerMessageId };
  } catch (error) {
    const message = String(error?.message || "Email send failed.").slice(0, 1000);
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "error",
      provider: EMAIL_PROVIDER,
      error: message
    });
    return { recipientType, status: "error", error: message };
  }
}

async function notifyFixRequestStatus(env, fixRequest, status) {
  const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com").replace(/\/+$/, "");
  const report = await reportForNotification(env, fixRequest.report_id);
  const event = status === "delivered" ? "delivery_ready" : "repair_started";
  const beforeAfter = parseJson(fixRequest.before_after_summary_json, null);
  const recipients = [
    { type: "owner", email: normalizeEmail(fixRequest.owner_email) },
    { type: "admin", email: adminNotificationEmail(env) }
  ];
  const results = [];

  for (const recipient of recipients) {
    results.push(
      await sendFixPackStatusEmail({
        env,
        appOrigin,
        fixRequest,
        report,
        status,
        event,
        beforeAfter,
        recipientType: recipient.type,
        recipientEmail: recipient.email
      })
    );
  }

  const now = new Date().toISOString();
  const errors = results
    .filter((result) => result.status !== "sent" && result.status !== "duplicate" && result.error)
    .map((result) => `${result.recipientType}:${result.error}`)
    .join("; ")
    .slice(0, 1000);
  if (status === "delivered") {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET delivery_notified_at = COALESCE(delivery_notified_at, ?),
           delivery_notification_error = ?,
           last_notification_at = ?,
           notification_error = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(now, errors, now, errors, now, fixRequest.id)
      .run();
  } else {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET last_notification_at = ?,
           notification_error = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(now, errors, now, fixRequest.id)
      .run();
  }
}

async function sendFixPackStatusEmail({
  env,
  appOrigin,
  fixRequest,
  report,
  status,
  event,
  beforeAfter,
  recipientType,
  recipientEmail
}) {
  if (await hasSentFixRequestNotification(env, fixRequest.id, event, recipientType)) {
    return { recipientType, status: "duplicate" };
  }
  if (!recipientEmail) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail: "",
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_recipient"
    });
    return { recipientType, status: "skipped", error: "missing_recipient" };
  }

  if (!isEmailConfigured(env)) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_email_config"
    });
    return { recipientType, status: "skipped", error: "missing_email_config" };
  }

  const email = buildStatusNotificationEmail({
    appOrigin,
    fixRequest,
    report,
    status,
    beforeAfter,
    recipientType
  });
  try {
    const payload = await sendWorkerEmail(env, {
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      tag: event === "delivery_ready" ? "fix-pack-delivery" : "fix-pack-status"
    });
    const providerMessageId = payload.messageId;
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "sent",
      provider: EMAIL_PROVIDER,
      providerMessageId
    });
    return { recipientType, status: "sent", providerMessageId };
  } catch (error) {
    const message = String(error?.message || "Email send failed.").slice(0, 1000);
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "error",
      provider: EMAIL_PROVIDER,
      error: message
    });
    return { recipientType, status: "error", error: message };
  }
}

async function hasSentFixRequestNotification(env, fixRequestId, event, recipientType) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id
     FROM fix_request_notifications
     WHERE fix_request_id = ? AND event = ? AND recipient_type = ? AND status = 'sent'
     LIMIT 1`
  )
    .bind(fixRequestId, event, recipientType)
    .first();
  return Boolean(row?.id);
}

async function logFixRequestNotification(env, {
  fixRequestId,
  event,
  recipientType,
  recipientEmail,
  status,
  provider,
  providerMessageId = "",
  error = ""
}) {
  await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_request_notifications
      (id, fix_request_id, event, recipient_type, recipient_email, status, provider, provider_message_id, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      fixRequestId,
      event,
      recipientType,
      recipientEmail,
      status,
      provider,
      providerMessageId,
      error,
      new Date().toISOString()
    )
    .run();
}

async function logFixRequestEvent(env, {
  fixRequestId,
  event,
  actorType,
  actorEmail = "",
  fromStatus = "",
  toStatus = "",
  reason = "",
  detail = {}
}) {
  if (!env.WAITLIST_DB || !fixRequestId) return;
  await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_request_events
      (id, fix_request_id, event, actor_type, actor_email, from_status, to_status, reason, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      fixRequestId,
      cleanText(event, 80),
      cleanText(actorType, 40),
      cleanText(actorEmail, 254),
      cleanText(fromStatus, 40),
      cleanText(toStatus, 40),
      cleanText(reason, 500),
      JSON.stringify(detail || {}).slice(0, 4000),
      new Date().toISOString()
    )
    .run();
}

async function reportForNotification(env, reportId) {
  if (!reportId) return {};
  const row = await env.WAITLIST_DB.prepare("SELECT report_json FROM audit_reports WHERE id = ? LIMIT 1")
    .bind(reportId)
    .first();
  return parseJson(row ? await reportJsonForRow(env, row) : "", {});
}

export {
  CHECKOUT_URL_TTL_HOURS,
  FIX_PACK_DUE_DAYS,
  FIX_PACK_NEXT_UPDATE_DAYS,
  FIX_PACK_OFFER,
  PAID_LIKE_FIX_REQUEST_STATUSES,
  REBUY_BLOCKED_FIX_REQUEST_STATUSES,
  billingPaymentResponse,
  billingPricingState,
  createDodoFixPackCheckout,
  dodoConfigMissing,
  dodoPaymentIdentityStatus,
  fetchDodoJson,
  findFixRequestForPayment,
  formatMinorCurrency,
  getBillingSummary,
  getFixPackPricingPreview,
  getOrCreateFixRequest,
  getPublicFixPackPricing,
  handleDodoWebhook,
  hasSentFixRequestNotification,
  isAllowedAdminStatusTransition,
  jsonForStorage,
  logFixRequestEvent,
  logFixRequestNotification,
  markDodoWebhookProcessed,
  minorCurrencyDivisor,
  normalizeCurrencyCode,
  notifyFixRequestStatus,
  notifyPaymentSucceeded,
  numberOrNull,
  objectValue,
  parseDodoPricingPreview,
  previewDodoFixPackPricing,
  processDodoPaymentWebhook,
  reportForNotification,
  requestFixPack,
  reserveDodoWebhookEvent,
  sendFixPackPaymentEmail,
  sendFixPackStatusEmail,
  seedRepairProposalsForFixRequest,
  textValue,
  validateFinalReportForFixRequest
};
