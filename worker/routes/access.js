import { escapeHtml } from "../../shared/audit-engine.js";
import { isEmailConfigured } from "../../shared/fulfillment.js";
import {
  betaAccessResponse,
  betaAccessStatus,
  betaSessionTokenFromRequest,
  clearSessionCookie,
  createBetaSession
} from "../lib/auth.js";
import { sendWorkerEmail } from "../lib/email.js";
import { json, jsonNoStore } from "../lib/http.js";
import {
  checkQuotaSet,
  constantTimeEqual,
  randomToken,
  requestIpHash,
  sha256Hex
} from "../lib/security.js";
import { siteClaimResponse, siteVerificationText } from "../lib/serializers.js";
import {
  claimHostFromInput,
  cleanAccessToken,
  cleanInviteCode,
  cleanText,
  hourWindow,
  isoSecondsFromNow,
  normalizeDnsTxt,
  normalizeEmail
} from "../lib/text.js";
import { recordAccessEvent, isFunnelStep } from "../lib/access-events.js";

function funnelKeyFromRequest(request, body) {
  return cleanText(
    (body && (body.funnelKey || body.funnel_key)) ||
      request?.headers?.get?.("x-seofixkit-funnel-key") ||
      "",
    64
  );
}

function landingPathFromRequest(body, fallback = "/") {
  return cleanText(body?.landingPath || body?.landing_path || fallback, 500) || fallback;
}

const ACCESS_LINK_TTL_SECONDS = 60 * 15;

const DEFAULT_INVITE_TTL_DAYS = 14;

async function joinWaitlist(request, env) {
  if (!env.WAITLIST_DB) {
    return json({ error: "Waitlist storage is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  if (body.company) {
    return json({ ok: true, status: "joined" });
  }

  const submitMs = Number(body.timeToSubmitMs || 0);
  if (submitMs > 0 && submitMs < 1200) {
    return json({ ok: true, status: "joined" });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const quota = await waitlistQuotaStatus(request, env);
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  const now = new Date().toISOString();
  const utm = typeof body.utm === "object" && body.utm ? body.utm : {};
  const source = cleanText(body.source || "locked-homepage", 80);
  const utmSource = cleanText(utm.source || body.utm_source || "", 120);
  const utmMedium = cleanText(utm.medium || body.utm_medium || "", 120);
  const utmCampaign = cleanText(utm.campaign || body.utm_campaign || "", 180);
  const utmTerm = cleanText(utm.term || body.utm_term || "", 180);
  const utmContent = cleanText(utm.content || body.utm_content || "", 180);
  const landingPath = cleanText(body.landingPath || "/", 500);
  const referrer = cleanText(request.headers.get("referer") || "", 500);
  const userAgent = cleanText(request.headers.get("user-agent") || "", 500);
  const country = cleanText(request.cf?.country || "", 8);

  await env.WAITLIST_DB.prepare(
    `INSERT INTO waitlist_leads
      (email, source, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path, submit_ms, referrer, user_agent, country, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
      source = excluded.source,
      utm_source = excluded.utm_source,
      utm_medium = excluded.utm_medium,
      utm_campaign = excluded.utm_campaign,
      utm_term = excluded.utm_term,
      utm_content = excluded.utm_content,
      landing_path = excluded.landing_path,
      submit_ms = excluded.submit_ms,
      referrer = excluded.referrer,
      user_agent = excluded.user_agent,
      country = excluded.country,
      updated_at = excluded.updated_at`
  )
    .bind(
      email,
      source,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      landingPath,
      Number.isFinite(submitMs) ? Math.round(submitMs) : null,
      referrer,
      userAgent,
      country,
      now,
      now
    )
    .run();

  await recordAccessEvent(env, {
    step: "beta_submit",
    funnelKey: funnelKeyFromRequest(request, body),
    ownerEmail: email,
    source,
    landingPath,
    request,
    metadata: { submitMs: Number.isFinite(submitMs) ? Math.round(submitMs) : null }
  });

  return json({ ok: true, status: "joined" });
}

async function requestAccessLink(request, env) {
  if (!env.WAITLIST_DB) {
    return jsonNoStore({ error: "Access link storage is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  if (body.company) return jsonNoStore({ ok: true, status: "requested" });

  const submitMs = Number(body.timeToSubmitMs || 0);
  if (submitMs > 0 && submitMs < 1200) {
    return jsonNoStore({ ok: true, status: "requested" });
  }

  const ownerEmail = normalizeEmail(body.email || body.ownerEmail);
  if (!ownerEmail) return jsonNoStore({ error: "Enter a valid email address." }, 400);

  const quota = await accessLinkQuotaStatus(request, env, ownerEmail);
  if (!quota.ok) return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);

  if (!isEmailConfigured(env)) {
    return jsonNoStore({ error: "Access email is not configured yet. Use an invite code for now." }, 503);
  }

  const now = new Date().toISOString();
  const funnelKey = funnelKeyFromRequest(request, body);
  const landingPath = landingPathFromRequest(body, "/beta");
  await recordWaitlistLead(request, env, ownerEmail, body, "self-serve-access", now);

  await recordAccessEvent(env, {
    step: "access_requested",
    funnelKey,
    ownerEmail,
    source: "self-serve-access",
    landingPath,
    request,
    metadata: { submitMs: Number.isFinite(submitMs) ? Math.round(submitMs) : null }
  });

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = isoSecondsFromNow(ACCESS_LINK_TTL_SECONDS);
  await env.WAITLIST_DB.prepare(
    `INSERT INTO access_tokens
      (token_hash, owner_email, purpose, created_at, expires_at, used_at, ip_hash, user_agent)
     VALUES (?, ?, 'self_serve_access', ?, ?, NULL, ?, ?)`
  )
    .bind(
      tokenHash,
      ownerEmail,
      now,
      expiresAt,
      await requestIpHash(request),
      cleanText(request.headers.get("user-agent") || "", 500)
    )
    .run();

  const origin = new URL(request.url).origin;
  const returnTo = safeBetaReturnPath(body.returnTo || body.return_to || "");
  const accessUrl = `${origin}${returnTo}?access=${encodeURIComponent(token)}&email=${encodeURIComponent(ownerEmail)}`;
  try {
    await sendAccessLinkEmail(env, {
      ownerEmail,
      accessUrl,
      expiresAt,
      tokenHash
    });
  } catch (error) {
    await env.WAITLIST_DB.prepare("DELETE FROM access_tokens WHERE token_hash = ?").bind(tokenHash).run();
    return jsonNoStore({ error: error?.message || "Access email could not be sent." }, 503);
  }

  await recordAccessEvent(env, {
    step: "access_link_sent",
    funnelKey,
    ownerEmail,
    source: "self-serve-access",
    landingPath,
    request,
    metadata: { expiresAt }
  });

  return jsonNoStore({
    ok: true,
    status: "sent",
    message: "Check your email for a secure access link.",
    expiresAt
  });
}

async function verifyAccessLink(request, env) {
  if (!env.WAITLIST_DB) {
    return jsonNoStore({ error: "Access link storage is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const token = cleanAccessToken(body.token || "");
  if (!token) return jsonNoStore({ error: "Access link is invalid." }, 400);

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT token_hash, owner_email, expires_at, used_at
     FROM access_tokens
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();

  if (!row?.token_hash || row.used_at || row.expires_at <= now) {
    return jsonNoStore({ error: "Access link is expired or already used." }, 401);
  }

  const update = await env.WAITLIST_DB.prepare(
    `UPDATE access_tokens
     SET used_at = ?
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
  )
    .bind(now, tokenHash, now)
    .run();

  if (Number(update?.meta?.changes || 0) !== 1) {
    return jsonNoStore({ error: "Access link is expired or already used." }, 401);
  }

  await recordAccessEvent(env, {
    step: "access_link_verified",
    funnelKey: funnelKeyFromRequest(request, body),
    ownerEmail: row.owner_email,
    source: "self-serve-access",
    landingPath: landingPathFromRequest(body, "/beta"),
    request,
    metadata: { expiresAt: row.expires_at }
  });

  const session = await createBetaSession(request, env, {
    ownerEmail: row.owner_email,
    inviteId: null,
    accessMode: "self-serve"
  });
  await recordAccessEvent(env, {
    step: "session_created",
    funnelKey: funnelKeyFromRequest(request, body),
    ownerEmail: row.owner_email,
    source: "self-serve-access",
    landingPath: landingPathFromRequest(body, "/beta"),
    request,
    metadata: { accessMode: "self-serve", expiresAt: session.expiresAt }
  });
  const response = jsonNoStore({
    ok: true,
    status: "unlocked",
    ownerEmail: row.owner_email,
    accessMode: "self-serve",
    expiresAt: session.expiresAt
  });
  response.headers.append("set-cookie", session.cookie);
  return response;
}

// Only allow return paths inside the beta app so an emailed access link can
// never bounce someone to an arbitrary location.
function safeBetaReturnPath(value) {
  const path = String(value || "").trim();
  if (path.length > 200) return "/beta";
  if (!/^\/beta(\/[A-Za-z0-9._\/-]*)?$/.test(path) || path.includes("..") || path.includes("//")) {
    return "/beta";
  }
  return path;
}

async function sendAccessLinkEmail(env, { ownerEmail, accessUrl, expiresAt, tokenHash }) {
  const subject = "Your SEO Fix Kit access link";
  const expiresMinutes = Math.max(1, Math.round(ACCESS_LINK_TTL_SECONDS / 60));
  const text = [
    "Use this secure link to open SEO Fix Kit:",
    "",
    accessUrl,
    "",
    `This link expires in ${expiresMinutes} minutes and can be used once. If it expires, just request a new one.`,
    "SEO Fix Kit audits produce proof-backed repair briefs. No ranking promises are made."
  ].join("\n");
  const html = [
    "<p>Use this secure link to open SEO Fix Kit:</p>",
    `<p><a href="${escapeHtml(accessUrl)}">Open SEO Fix Kit</a></p>`,
    `<p>This link expires in ${expiresMinutes} minutes and can be used once. If it expires, just request a new one.</p>`,
    "<p>SEO Fix Kit audits produce proof-backed repair briefs. No ranking promises are made.</p>"
  ].join("");

  return sendWorkerEmail(env, {
    to: ownerEmail,
    subject,
    text,
    html,
    tag: "access-link"
  });
}

async function recordWaitlistLead(request, env, email, body = {}, sourceFallback = "locked-homepage", now = new Date().toISOString()) {
  const utm = typeof body.utm === "object" && body.utm ? body.utm : {};
  const submitMs = Number(body.timeToSubmitMs || 0);
  await env.WAITLIST_DB.prepare(
    `INSERT INTO waitlist_leads
      (email, source, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path, submit_ms, referrer, user_agent, country, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
      source = excluded.source,
      utm_source = excluded.utm_source,
      utm_medium = excluded.utm_medium,
      utm_campaign = excluded.utm_campaign,
      utm_term = excluded.utm_term,
      utm_content = excluded.utm_content,
      landing_path = excluded.landing_path,
      submit_ms = excluded.submit_ms,
      referrer = excluded.referrer,
      user_agent = excluded.user_agent,
      country = excluded.country,
      updated_at = excluded.updated_at`
  )
    .bind(
      email,
      cleanText(body.source || sourceFallback, 80),
      cleanText(utm.source || body.utm_source || "", 120),
      cleanText(utm.medium || body.utm_medium || "", 120),
      cleanText(utm.campaign || body.utm_campaign || "", 180),
      cleanText(utm.term || body.utm_term || "", 180),
      cleanText(utm.content || body.utm_content || "", 180),
      cleanText(body.landingPath || "/", 500),
      Number.isFinite(submitMs) ? Math.round(submitMs) : null,
      cleanText(request.headers.get("referer") || "", 500),
      cleanText(request.headers.get("user-agent") || "", 500),
      cleanText(request.cf?.country || "", 8),
      now,
      now
    )
    .run();
}

async function betaLogin(request, env) {
  if (!env.WAITLIST_DB) {
    return json({ error: "Private beta sessions are not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const ownerEmail = normalizeEmail(body.email);
  if (!ownerEmail) {
    return json({ error: "Enter your beta email address." }, 400);
  }

  const rawInviteCode = cleanInviteCode(body.inviteCode || body.password || "");
  const inviteCodeHash = rawInviteCode ? await sha256Hex(rawInviteCode) : "";
  const loginQuota = await loginQuotaStatus(request, env, ownerEmail, inviteCodeHash);
  if (!loginQuota.ok) {
    return jsonNoStore({ error: loginQuota.error, resetAt: loginQuota.resetAt }, 429);
  }

  const invite = await inviteAccessStatus(request, env, ownerEmail, rawInviteCode, inviteCodeHash);
  if (!invite.ok) return betaAccessResponse(invite);

  const session = await createBetaSession(request, env, {
    ownerEmail,
    inviteId: invite.inviteId,
    accessMode: invite.accessMode
  });
  await recordAccessEvent(env, {
    step: "session_created",
    funnelKey: funnelKeyFromRequest(request, body),
    ownerEmail,
    source: invite.accessMode === "founder-override" ? "founder-override" : "invite",
    landingPath: landingPathFromRequest(body, "/beta"),
    request,
    metadata: { accessMode: invite.accessMode, inviteId: invite.inviteId, expiresAt: session.expiresAt }
  });
  const response = jsonNoStore({
    ok: true,
    status: "unlocked",
    ownerEmail,
    inviteId: invite.inviteId,
    accessMode: invite.accessMode,
    expiresAt: session.expiresAt
  });
  response.headers.append("set-cookie", session.cookie);
  return response;
}

async function betaSession(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  return jsonNoStore({
    ok: true,
    status: "active",
    ownerEmail: access.ownerEmail,
    inviteId: access.inviteId,
    accessMode: access.accessMode,
    expiresAt: access.expiresAt
  });
}

async function betaLogout(request, env) {
  const token = betaSessionTokenFromRequest(request);
  if (token && env.WAITLIST_DB) {
    const tokenHash = await sha256Hex(token);
    await env.WAITLIST_DB.prepare(
      `UPDATE beta_sessions
       SET revoked_at = ?, last_seen_at = ?
       WHERE token_hash = ?`
    )
      .bind(new Date().toISOString(), new Date().toISOString(), tokenHash)
      .run();
  }

  const response = jsonNoStore({ ok: true, status: "locked" });
  response.headers.append("set-cookie", clearSessionCookie(request));
  return response;
}

async function listSiteClaims(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Site claim storage is not configured." }, 503);

  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM site_claims
     WHERE owner_email = ?
       AND revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(access.ownerEmail)
    .all();

  return jsonNoStore({
    ok: true,
    sites: (rows.results || []).map(siteClaimResponse)
  });
}

async function createSiteClaim(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Site claim storage is not configured." }, 503);

  const body = await request.json().catch(() => ({}));
  const host = claimHostFromInput(body.host || body.url || "");
  if (!host) return jsonNoStore({ error: "Enter a public website host to verify." }, 400);

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM site_claims
     WHERE owner_email = ?
       AND host = ?
       AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(access.ownerEmail, host)
    .first();
  if (existing?.id) {
    return jsonNoStore({ ok: true, site: siteClaimResponse(existing) });
  }

  const now = new Date().toISOString();
  const token = `sfk-${randomToken()}`;
  const id = crypto.randomUUID();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO site_claims
      (id, owner_email, host, verification_token, status, verification_method, created_at, updated_at, verified_at, last_checked_at, revoked_at)
     VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, NULL, NULL, NULL)`
  )
    .bind(id, access.ownerEmail, host, token, now, now)
    .run();

  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM site_claims WHERE id = ? LIMIT 1`).bind(id).first();
  return jsonNoStore({ ok: true, site: siteClaimResponse(row) });
}

async function verifySiteClaim(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Site claim storage is not configured." }, 503);

  const body = await request.json().catch(() => ({}));
  const claimId = cleanText(body.id || body.claimId || "", 80);
  const host = claimHostFromInput(body.host || body.url || "");
  const row = claimId
    ? await env.WAITLIST_DB.prepare(
        `SELECT *
         FROM site_claims
         WHERE id = ?
           AND owner_email = ?
           AND revoked_at IS NULL
         LIMIT 1`
      )
        .bind(claimId, access.ownerEmail)
        .first()
    : host
      ? await env.WAITLIST_DB.prepare(
          `SELECT *
           FROM site_claims
           WHERE host = ?
             AND owner_email = ?
             AND revoked_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1`
        )
          .bind(host, access.ownerEmail)
          .first()
      : null;

  if (!row?.id) return jsonNoStore({ error: "Site claim not found." }, 404);

  const [dnsVerified, fileVerified] = await Promise.all([
    verifySiteClaimDns(row.host, row.verification_token),
    verifySiteClaimHttpsFile(row.host, row.verification_token)
  ]);
  const now = new Date().toISOString();
  if (dnsVerified.ok || fileVerified.ok) {
    const method = dnsVerified.ok ? "dns-txt" : "https-file";
    await env.WAITLIST_DB.prepare(
      `UPDATE site_claims
       SET status = 'verified',
        verification_method = ?,
        verified_at = COALESCE(verified_at, ?),
        last_checked_at = ?,
        updated_at = ?
       WHERE id = ?`
    )
      .bind(method, now, now, now, row.id)
      .run();
    const updated = await env.WAITLIST_DB.prepare(`SELECT * FROM site_claims WHERE id = ? LIMIT 1`).bind(row.id).first();
    return jsonNoStore({ ok: true, verified: true, site: siteClaimResponse(updated) });
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE site_claims
     SET last_checked_at = ?,
      updated_at = ?
     WHERE id = ?`
  )
    .bind(now, now, row.id)
    .run();
  const updated = await env.WAITLIST_DB.prepare(`SELECT * FROM site_claims WHERE id = ? LIMIT 1`).bind(row.id).first();
  return jsonNoStore({
    ok: true,
    verified: false,
    site: siteClaimResponse(updated),
    message: dnsVerified.error || fileVerified.error || "Verification record was not found yet."
  });
}

async function verifySiteClaimDns(host, token) {
  const expected = siteVerificationText(token);
  const dnsName = `_seofixkit.${host}`;
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dnsName)}&type=TXT`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!response.ok) return { ok: false, error: "DNS verification lookup failed." };
    const payload = await response.json().catch(() => ({}));
    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    const matched = answers.some((answer) => normalizeDnsTxt(answer.data).includes(expected));
    return matched ? { ok: true } : { ok: false, error: "DNS TXT record was not found yet." };
  } catch {
    return { ok: false, error: "DNS verification lookup failed." };
  }
}

async function verifySiteClaimHttpsFile(host, token) {
  const expected = siteVerificationText(token);
  try {
    const response = await fetch(`https://${host}/.well-known/seofixkit.txt`, {
      headers: { accept: "text/plain" }
    });
    if (!response.ok) return { ok: false, error: "Verification file was not found yet." };
    const text = await readSmallText(response, 8192);
    return text.includes(expected)
      ? { ok: true }
      : { ok: false, error: "Verification file does not contain the expected token yet." };
  } catch {
    return { ok: false, error: "Verification file was not reachable." };
  }
}

async function readSmallText(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maxBytes - total;
    chunks.push(value.slice(0, remaining));
    total += Math.min(value.byteLength, remaining);
    if (value.byteLength > remaining) break;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function randomInviteCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function waitlistQuotaStatus(request, env) {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  return checkQuotaSet(env, [
    {
      bucket: `waitlist:ip:${hour.key}:${ipHash}`,
      limit: 20,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many waitlist attempts from this network. Try again later."
    }
  ]);
}

async function loginQuotaStatus(request, env, ownerEmail = "", inviteCodeHash = "") {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  const checks = [
    {
      bucket: `login:ip:${hour.key}:${ipHash}`,
      limit: 20,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many login attempts from this network. Try again later."
    }
  ];
  if (ownerEmail) {
    checks.push({
      bucket: `login:email:${hour.key}:${await sha256Hex(ownerEmail)}`,
      limit: 10,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many login attempts for this email. Try again later."
    });
  }
  if (inviteCodeHash) {
    checks.push({
      bucket: `login:invite:${hour.key}:${inviteCodeHash.slice(0, 32)}`,
      limit: 10,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many login attempts for this invite. Try again later."
    });
  }
  return checkQuotaSet(env, checks);
}

async function accessLinkQuotaStatus(request, env, ownerEmail = "") {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  const checks = [
    {
      bucket: `access:ip:${hour.key}:${ipHash}`,
      limit: 8,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many access link requests from this network. Try again later."
    }
  ];
  if (ownerEmail) {
    checks.push({
      bucket: `access:email:${hour.key}:${await sha256Hex(ownerEmail)}`,
      limit: 3,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many access links requested for this email. Try again later."
    });
  }
  return checkQuotaSet(env, checks);
}

async function inviteAccessStatus(request, env, ownerEmail, inviteCode, inviteCodeHash) {
  if (!inviteCode) {
    return {
      ok: false,
      status: 401,
      error: "Private beta invite code required."
    };
  }

  const founderPassword = String(env.BETA_ACCESS_PASSWORD || "");
  if (founderPassword && constantTimeEqual(inviteCode, founderPassword)) {
    return { ok: true, inviteId: null, accessMode: "founder-override" };
  }

  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, owner_email, status, max_uses, used_count, expires_at
     FROM beta_invites
     WHERE code_hash = ?
     LIMIT 1`
  )
    .bind(inviteCodeHash)
    .first();

  if (!row?.id || row.status !== "active") {
    return { ok: false, status: 401, error: "Private beta invite not found." };
  }
  if (row.owner_email !== ownerEmail) {
    return { ok: false, status: 401, error: "This invite is tied to another email." };
  }
  if (row.expires_at && row.expires_at <= now) {
    return { ok: false, status: 401, error: "Private beta invite expired." };
  }
  if (Number(row.used_count || 0) >= Number(row.max_uses || 1)) {
    return { ok: false, status: 401, error: "Private beta invite has already been used." };
  }

  const ipHash = await requestIpHash(request);
  const update = await env.WAITLIST_DB.prepare(
    `UPDATE beta_invites
     SET used_count = used_count + 1,
      used_at = ?,
      last_used_ip_hash = ?,
      status = CASE WHEN used_count + 1 >= max_uses THEN 'used' ELSE status END
     WHERE id = ?
      AND status = 'active'
      AND used_count < max_uses
      AND (expires_at IS NULL OR expires_at > ?)`
  )
    .bind(now, ipHash, row.id, now)
    .run();

  if (Number(update?.meta?.changes || 0) !== 1) {
    return { ok: false, status: 401, error: "Private beta invite has already been used." };
  }

  return { ok: true, inviteId: row.id, accessMode: "invite" };
}

// Record a client-side beacon (page-view or first-input) for the private-beta
// funnel. Rate-limited per network so it cannot be abused as a free
// analytics sink. Always returns 204 so the SPA beacon never throws.
async function recordAccessBeacon(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const step = cleanText(body.step || "", 40);
  if (!isFunnelStep(step)) {
    return new Response(null, { status: 204 });
  }
  const quota = await accessBeaconQuotaStatus(request, env);
  if (!quota.ok) {
    return new Response(null, { status: 204 });
  }
  const ownerEmail = normalizeEmail(body.email || "");
  await recordAccessEvent(env, {
    step,
    funnelKey: funnelKeyFromRequest(request, body),
    ownerEmail,
    source: cleanText(body.source || "spa-beacon", 80),
    landingPath: landingPathFromRequest(body, "/"),
    request,
    metadata: {
      beacon: true,
      timeOnPageMs: Number.isFinite(Number(body.timeOnPageMs)) ? Math.round(Number(body.timeOnPageMs)) : null
    }
  });
  return new Response(null, { status: 204 });
}

async function accessBeaconQuotaStatus(request, env) {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  return checkQuotaSet(env, [
    {
      bucket: `beacon:ip:${hour.key}:${ipHash}`,
      limit: 240,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many activation beacons from this network."
    }
  ]);
}

export {
  ACCESS_LINK_TTL_SECONDS,
  DEFAULT_INVITE_TTL_DAYS,
  accessBeaconQuotaStatus,
  accessLinkQuotaStatus,
  betaLogin,
  betaLogout,
  betaSession,
  createSiteClaim,
  inviteAccessStatus,
  joinWaitlist,
  listSiteClaims,
  loginQuotaStatus,
  randomInviteCode,
  readSmallText,
  recordAccessBeacon,
  recordWaitlistLead,
  requestAccessLink,
  safeBetaReturnPath,
  sendAccessLinkEmail,
  verifyAccessLink,
  verifySiteClaim,
  verifySiteClaimDns,
  verifySiteClaimHttpsFile,
  waitlistQuotaStatus
};
