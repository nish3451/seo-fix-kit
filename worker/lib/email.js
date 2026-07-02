import { normalizeEmail } from "./text.js";

const EMAIL_PROVIDER = "cloudflare_email";
const INTERNAL_EMAIL_HEADER = "X-Nish-Internal-Email";
const INTERNAL_EMAIL_TAGS = new Set([
  "fix-pack-delivery",
  "fix-pack-payment",
  "fix-pack-status",
  "ops-alert",
  "ops-digest"
]);

function emailDomain(value) {
  const match = String(value || "").toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})\b/i);
  return match?.[1] || "";
}

function configuredInternalDomains(env, from) {
  const domains = new Set([emailDomain(from)].filter(Boolean));
  for (const domain of String(env.INTERNAL_EMAIL_DOMAINS || "").split(",")) {
    const normalized = domain.trim().toLowerCase().replace(/^@+/, "");
    if (normalized) domains.add(normalized);
  }
  return domains;
}

function allRecipientsMatchInternalDomains(env, to, from) {
  const domains = configuredInternalDomains(env, from);
  const recipients = Array.isArray(to) ? to : [to];
  return Boolean(
    domains.size &&
    recipients.length &&
    recipients.every((recipient) => domains.has(emailDomain(recipient)))
  );
}

function emailSender(env) {
  return String(env.SEOFIXKIT_EMAIL_FROM || "").trim();
}

const SUPPORT_EMAIL = "support@seofixkit.com";

const EMAIL_FOOTER_TEXT = `\n\n--\nSEO Fix Kit · https://seofixkit.com\nQuestions or issues? Email ${SUPPORT_EMAIL}.`;

const EMAIL_FOOTER_HTML = `<hr style="border:none;border-top:1px solid #dddddd;margin:24px 0 12px" /><p style="color:#666666;font-size:13px">SEO Fix Kit · <a href="https://seofixkit.com">seofixkit.com</a> · Questions or issues? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`;

async function sendWorkerEmail(env, { to, subject, text, html, tag }) {
  // Reply-To must use the binding's replyTo field; Email Service rejects it as
  // a custom header (only whitelisted and X-* headers are accepted). The
  // binding also takes string[] for multiple recipients directly.
  const from = emailSender(env);
  const replyTo = normalizeEmail(env.SEOFIXKIT_REPLY_TO || "");
  const headers = {};
  if (tag) headers["X-SEOFIXKIT-Tag"] = tag;
  const internalToken = String(env.INTERNAL_EMAIL_TOKEN || "").trim();
  if (internalToken && INTERNAL_EMAIL_TAGS.has(String(tag || "")) && allRecipientsMatchInternalDomains(env, to, from)) {
    headers[INTERNAL_EMAIL_HEADER] = internalToken;
  }
  const result = await env.EMAIL.send({
    from,
    to,
    subject,
    html: `${html || ""}${EMAIL_FOOTER_HTML}`,
    text: `${text || ""}${EMAIL_FOOTER_TEXT}`,
    ...(replyTo ? { replyTo } : {}),
    ...(Object.keys(headers).length ? { headers } : {})
  });
  return { messageId: result?.messageId || "" };
}

export {
  EMAIL_FOOTER_HTML,
  EMAIL_FOOTER_TEXT,
  EMAIL_PROVIDER,
  SUPPORT_EMAIL,
  emailSender,
  sendWorkerEmail
};
