import { normalizeEmail } from "./text.js";

const EMAIL_PROVIDER = "cloudflare_email";

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
  const replyTo = normalizeEmail(env.SEOFIXKIT_REPLY_TO || "");
  const result = await env.EMAIL.send({
    from: emailSender(env),
    to,
    subject,
    html: `${html || ""}${EMAIL_FOOTER_HTML}`,
    text: `${text || ""}${EMAIL_FOOTER_TEXT}`,
    ...(replyTo ? { replyTo } : {}),
    ...(tag ? { headers: { "X-SEOFIXKIT-Tag": tag } } : {})
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
