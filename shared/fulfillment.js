export const FIX_REQUEST_STATUSES = new Set([
  "new",
  "checkout_created",
  "paid",
  "in_progress",
  "delivered",
  "payment_failed"
]);

export const ADMIN_EDITABLE_FIX_REQUEST_STATUSES = new Set([
  "checkout_created",
  "paid",
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
    payment_failed: "Payment failed"
  };
  return labels[normalizeFixRequestStatus(status)] || labels.new;
}

export function isResendEmailConfigured(env) {
  return Boolean(
    env?.RESEND_API_KEY &&
      env?.SEOFIXKIT_EMAIL_FROM &&
      String(env.SEOFIXKIT_EMAIL_FROM).includes("@")
  );
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
  const amount = payment?.amount && payment?.currency ? `${payment.currency} ${payment.amount}` : "";
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

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;"
  };
  return String(value || "").replace(/[&"<>]/g, (character) => entities[character]);
}
