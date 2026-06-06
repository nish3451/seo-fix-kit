export const FIX_REQUEST_STATUSES = new Set([
  "new",
  "checkout_created",
  "paid",
  "in_progress",
  "delivered",
  "payment_failed",
  "refunded",
  "refund_failed",
  "disputed"
]);

export const ADMIN_EDITABLE_FIX_REQUEST_STATUSES = new Set([
  "checkout_created",
  "in_progress",
  "delivered"
]);

export function normalizeFixRequestStatus(value, fallback = "new") {
  const status = String(value || "").trim().toLowerCase();
  return FIX_REQUEST_STATUSES.has(status) ? status : fallback;
}

export function fixRequestStatusLabel(status) {
  const labels = {
    new: "Request saved",
    checkout_created: "Checkout opened",
    paid: "Payment confirmed",
    in_progress: "Repair in progress",
    delivered: "Delivered",
    payment_failed: "Payment failed",
    refunded: "Refunded",
    refund_failed: "Refund failed",
    disputed: "Disputed"
  };
  return labels[normalizeFixRequestStatus(status)] || labels.new;
}

export function isPostmarkEmailConfigured(env) {
  const serverToken = String(env?.POSTMARK_SERVER_TOKEN || "").trim();
  const fromEmail = normalizeEmail(senderEmail(env?.SEOFIXKIT_EMAIL_FROM || env?.POSTMARK_FROM_EMAIL || ""));
  return Boolean(serverToken && fromEmail);
}

export function adminNotificationEmail(env) {
  return normalizeEmail(env?.SEOFIXKIT_ADMIN_EMAIL || "");
}

export function buildPaymentNotificationEmail({ appOrigin, fixRequest, report, payment, recipientType }) {
  const reportUrl = `${appOrigin}/beta/reports/${encodeURIComponent(fixRequest.report_id)}`;
  const target = fixRequest.target_host || safeHost(fixRequest.target_url);
  const subject =
    recipientType === "admin"
      ? `SEO Fix Pack paid: ${target}`
      : `SEO Fix Pack payment confirmed for ${target}`;
  const amount = payment?.amount && payment?.currency ? formatMoneyMinorUnits(payment.currency, payment.amount) : "";
  const text = [
    recipientType === "admin"
      ? "A SEO Fix Pack payment was confirmed."
      : "Your SEO Fix Pack payment is confirmed.",
    "",
    `Site: ${fixRequest.target_url}`,
    `Report: ${reportUrl}`,
    amount ? `Amount: ${amount}` : "",
    payment?.paymentId ? `Payment ID: ${payment.paymentId}` : "",
    "",
    "Next status: repair in progress.",
    "No ranking promises are made; this covers the proven repair queue and one rerun after fixes."
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = [
    "<p>",
    recipientType === "admin"
      ? "A SEO Fix Pack payment was confirmed."
      : "Your SEO Fix Pack payment is confirmed.",
    "</p>",
    "<ul>",
    `<li><strong>Site:</strong> ${escapeHtml(fixRequest.target_url)}</li>`,
    `<li><strong>Report:</strong> <a href="${escapeHtml(reportUrl)}">${escapeHtml(reportUrl)}</a></li>`,
    amount ? `<li><strong>Amount:</strong> ${escapeHtml(amount)}</li>` : "",
    payment?.paymentId ? `<li><strong>Payment ID:</strong> ${escapeHtml(payment.paymentId)}</li>` : "",
    "</ul>",
    "<p>Next status: repair in progress.</p>",
    "<p>No ranking promises are made; this covers the proven repair queue and one rerun after fixes.</p>"
  ]
    .filter(Boolean)
    .join("");

  return {
    subject,
    text,
    html,
    reportUrl,
    reportTitle: report?.title || target
  };
}

export function buildStatusNotificationEmail({
  appOrigin,
  fixRequest,
  report,
  recipientType,
  status,
  beforeAfter = null
}) {
  const normalizedStatus = normalizeFixRequestStatus(status, fixRequest.status || "new");
  const reportUrl = `${appOrigin}/beta/reports/${encodeURIComponent(fixRequest.report_id)}`;
  const deliveryUrl = fixRequest.delivery_url || "";
  const finalReportUrl = fixRequest.final_report_id
    ? `${appOrigin}/beta/reports/${encodeURIComponent(fixRequest.final_report_id)}`
    : "";
  const target = fixRequest.target_host || safeHost(fixRequest.target_url);
  const customerNote = cleanEmailLine(fixRequest.customer_note || "");
  const subjectPrefix =
    normalizedStatus === "delivered"
      ? "SEO Fix Pack delivery ready"
      : "SEO Fix Pack repair started";
  const subject =
    recipientType === "admin"
      ? `${subjectPrefix}: ${target}`
      : `${subjectPrefix} for ${target}`;
  const intro =
    normalizedStatus === "delivered"
      ? recipientType === "admin"
        ? "A SEO Fix Pack delivery was marked ready."
        : "Your SEO Fix Pack delivery is ready."
      : recipientType === "admin"
        ? "A SEO Fix Pack repair was marked in progress."
        : "Your SEO Fix Pack repair is in progress.";
  const timeline = [
    fixRequest.due_at ? `Expected by: ${fixRequest.due_at}` : "",
    fixRequest.next_update_at ? `Next update by: ${fixRequest.next_update_at}` : ""
  ].filter(Boolean);
  const proof = beforeAfterSummaryLines(beforeAfter);
  const text = [
    intro,
    "",
    `Site: ${fixRequest.target_url}`,
    `Original report: ${reportUrl}`,
    deliveryUrl ? `Delivery: ${deliveryUrl}` : "",
    finalReportUrl ? `Final rerun: ${finalReportUrl}` : "",
    customerNote ? `Note: ${customerNote}` : "",
    ...timeline,
    ...proof,
    "",
    "No ranking promises are made; this covers the proven repair queue and one rerun after fixes."
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    "<ul>",
    `<li><strong>Site:</strong> ${escapeHtml(fixRequest.target_url)}</li>`,
    `<li><strong>Original report:</strong> <a href="${escapeHtml(reportUrl)}">${escapeHtml(reportUrl)}</a></li>`,
    deliveryUrl ? `<li><strong>Delivery:</strong> <a href="${escapeHtml(deliveryUrl)}">${escapeHtml(deliveryUrl)}</a></li>` : "",
    finalReportUrl ? `<li><strong>Final rerun:</strong> <a href="${escapeHtml(finalReportUrl)}">${escapeHtml(finalReportUrl)}</a></li>` : "",
    customerNote ? `<li><strong>Note:</strong> ${escapeHtml(customerNote)}</li>` : "",
    fixRequest.due_at ? `<li><strong>Expected by:</strong> ${escapeHtml(fixRequest.due_at)}</li>` : "",
    fixRequest.next_update_at ? `<li><strong>Next update by:</strong> ${escapeHtml(fixRequest.next_update_at)}</li>` : "",
    ...proof.map((line) => `<li>${escapeHtml(line)}</li>`),
    "</ul>",
    "<p>No ranking promises are made; this covers the proven repair queue and one rerun after fixes.</p>"
  ]
    .filter(Boolean)
    .join("");

  return { subject, text, html, reportUrl, reportTitle: report?.title || target };
}

export function buildOpsDigestEmail({ appOrigin, snapshot }) {
  const subject = `SEO Fix Kit ops digest: ${snapshot.openPaid} paid open, ${snapshot.overdue} overdue`;
  const text = [
    "SEO Fix Kit daily ops digest.",
    "",
    `Paid open: ${snapshot.openPaid}`,
    `In progress: ${snapshot.inProgress}`,
    `Delivered today: ${snapshot.deliveredToday}`,
    `Overdue: ${snapshot.overdue}`,
    `Webhook errors: ${snapshot.webhookErrors}`,
    `Email errors: ${snapshot.emailErrors}`,
    snapshot.oldestOpenCreatedAt ? `Oldest open request: ${snapshot.oldestOpenCreatedAt}` : "",
    "",
    `Admin: ${appOrigin}/beta/admin`
  ]
    .filter(Boolean)
    .join("\n");
  const html = [
    "<p>SEO Fix Kit daily ops digest.</p>",
    "<ul>",
    `<li><strong>Paid open:</strong> ${snapshot.openPaid}</li>`,
    `<li><strong>In progress:</strong> ${snapshot.inProgress}</li>`,
    `<li><strong>Delivered today:</strong> ${snapshot.deliveredToday}</li>`,
    `<li><strong>Overdue:</strong> ${snapshot.overdue}</li>`,
    `<li><strong>Webhook errors:</strong> ${snapshot.webhookErrors}</li>`,
    `<li><strong>Email errors:</strong> ${snapshot.emailErrors}</li>`,
    snapshot.oldestOpenCreatedAt ? `<li><strong>Oldest open request:</strong> ${escapeHtml(snapshot.oldestOpenCreatedAt)}</li>` : "",
    "</ul>",
    `<p><a href="${escapeHtml(`${appOrigin}/beta/admin`)}">Open admin queue</a></p>`
  ]
    .filter(Boolean)
    .join("");
  return { subject, text, html };
}

export function normalizeEmail(input) {
  const email = String(input || "").trim().toLowerCase();
  if (email.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function safeHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "site";
  }
}

function senderEmail(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1] : raw;
}

function cleanEmailLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function beforeAfterSummaryLines(summary) {
  if (!summary || typeof summary !== "object") return [];
  const lines = [];
  if (Number.isFinite(Number(summary.beforeScore)) && Number.isFinite(Number(summary.afterScore))) {
    const delta = Number(summary.afterScore) - Number(summary.beforeScore);
    lines.push(`Score: ${summary.beforeScore} -> ${summary.afterScore} (${delta >= 0 ? "+" : ""}${delta})`);
  }
  if (Number.isFinite(Number(summary.beforeFindings)) && Number.isFinite(Number(summary.afterFindings))) {
    const fixed = Math.max(0, Number(summary.beforeFindings) - Number(summary.afterFindings));
    lines.push(`Findings: ${summary.beforeFindings} -> ${summary.afterFindings} (${fixed} reduced)`);
  }
  return lines;
}

function formatMoneyMinorUnits(currency, amount) {
  const code = String(currency || "").toUpperCase();
  const value = Number(amount || 0);
  if (!code || !Number.isFinite(value)) return "";
  const zeroDecimalCurrencies = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const divisor = zeroDecimalCurrencies.has(code) ? 1 : 100;
  return `${code} ${(value / divisor).toFixed(divisor === 1 ? 0 : 2)}`;
}

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;"
  };
  return String(value || "").replace(/[&"<>]/g, (character) => entities[character]);
}
