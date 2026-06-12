import { cookieValue, jsonNoStore } from "./http.js";
import {
  checkQuotaSet,
  constantTimeEqual,
  randomToken,
  requestIpHash,
  sha256Hex
} from "./security.js";
import { siteClaimInstructions, siteClaimResponse } from "./serializers.js";
import {
  cleanAccessMode,
  cleanText,
  hourWindow,
  isoSecondsFromNow,
  normalizeEmail,
  safeHostname
} from "./text.js";

const SESSION_COOKIE = "sfk_beta_session";

const ADMIN_SESSION_COOKIE = "sfk_admin_session";

const BETA_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 2;

async function createAdminSession(request, env) {
  if (!env.WAITLIST_DB) return jsonNoStore({ error: "Admin storage is not configured." }, 503);
  const body = await request.json().catch(() => ({}));
  const expected = String(env.ADMIN_EXPORT_TOKEN || "");
  const provided = String(body.token || "").trim();
  const actorEmail =
    normalizeEmail(body.email || "") ||
    cleanText(request.headers.get("cf-access-authenticated-user-email") || "", 254) ||
    "bearer-admin";
  if (!expected || !constantTimeEqual(provided, expected)) {
    const quota = await adminFailureQuotaStatus(request, env);
    await logAdminAction(request, env, "create-admin-session", false, actorEmail);
    return jsonNoStore(
      { error: quota.ok ? "Unauthorized" : quota.error, ...(quota.resetAt ? { resetAt: quota.resetAt } : {}) },
      quota.ok ? 401 : 429
    );
  }

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = isoSecondsFromNow(ADMIN_SESSION_TTL_SECONDS);
  await env.WAITLIST_DB.prepare(
    `INSERT INTO admin_sessions
      (token_hash, actor_email, created_at, expires_at, last_seen_at, revoked_at, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
  )
    .bind(
      tokenHash,
      actorEmail,
      now,
      expiresAt,
      now,
      await requestIpHash(request),
      cleanText(request.headers.get("user-agent") || "", 500)
    )
    .run();
  await logAdminAction(request, env, "create-admin-session", true, actorEmail);
  const response = jsonNoStore({ ok: true, actorEmail, expiresAt });
  response.headers.append("set-cookie", adminSessionCookie(request, token, ADMIN_SESSION_TTL_SECONDS));
  return response;
}

async function revokeAdminSession(request, env) {
  const token = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (token && env.WAITLIST_DB) {
    await env.WAITLIST_DB.prepare(
      `UPDATE admin_sessions SET revoked_at = ?, last_seen_at = ? WHERE token_hash = ?`
    )
      .bind(new Date().toISOString(), new Date().toISOString(), await sha256Hex(token))
      .run();
  }
  const response = jsonNoStore({ ok: true });
  response.headers.append("set-cookie", clearAdminSessionCookie(request));
  return response;
}

async function auditAuthorizationStatus(env, access, targetUrl, options = {}) {
  if (access.accessMode === "founder-override") return { ok: true };
  const host = safeHostname(targetUrl);
  if (!host) return { ok: false, status: 400, error: "Enter a valid public website URL." };
  // A claim on the apex domain also covers www and vice versa — customers
  // rightly treat them as one site.
  const siblingHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, host, status, verified_at
     FROM site_claims
     WHERE owner_email = ?
       AND host IN (?, ?)
       AND status = 'verified'
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(access.ownerEmail, host, siblingHost)
    .first();
  if (row?.id) return { ok: true, site: siteClaimResponse(row) };
  if (options.allowLite) return { ok: true, lite: true };
  return {
    ok: false,
    status: 403,
    code: "SITE_VERIFICATION_REQUIRED",
    error: `Verify ${host} before running a self-serve audit. A homepage-only Lite check (1 page) runs without verification.`,
    site: siteClaimInstructions({ host, verification_token: "" })
  };
}

function isAdminAuthorized(request, env) {
  const expected = String(env.ADMIN_EXPORT_TOKEN || "");
  if (!expected) return false;

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = bearer;
  return constantTimeEqual(token, expected);
}

async function betaAccessStatus(request, env) {
  if (!env.WAITLIST_DB) {
    return {
      ok: false,
      status: 503,
      error: "Private beta sessions are not configured."
    };
  }

  const token = betaSessionTokenFromRequest(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Private beta session required."
    };
  }

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT token_hash, owner_email, invite_id, access_mode, expires_at, revoked_at
     FROM beta_sessions
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();

  if (!row?.token_hash || row.revoked_at || row.expires_at <= now) {
    return {
      ok: false,
      status: 401,
      error: "Private beta session expired."
    };
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE beta_sessions SET last_seen_at = ? WHERE token_hash = ?`
  )
    .bind(now, tokenHash)
    .run();

  return {
    ok: true,
    ownerEmail: row.owner_email,
    inviteId: row.invite_id || null,
    accessMode: cleanAccessMode(row.access_mode || (row.invite_id ? "invite" : "founder-override")),
    sessionHash: row.token_hash,
    expiresAt: row.expires_at
  };
}

function betaAccessResponse(access) {
  const response = jsonNoStore({ error: access.error }, access.status);
  if (access.status === 401) {
    response.headers.append("set-cookie", clearSessionCookie());
  }
  return response;
}

async function apiAccessStatus(request, env) {
  if (!env.WAITLIST_DB) {
    return { ok: false, status: 503, error: "Developer API storage is not configured." };
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return { ok: false, status: 401, error: "API key required." };
  const tokenHash = await sha256Hex(bearer);
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, owner_email, token_hash, status
     FROM api_tokens
     WHERE token_hash = ?
       AND status = 'active'
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();
  if (!row?.id) return { ok: false, status: 401, error: "API key is invalid or revoked." };
  await env.WAITLIST_DB.prepare(
    `UPDATE api_tokens
     SET last_used_at = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(now, now, row.id)
    .run();
  return {
    ok: true,
    ownerEmail: row.owner_email,
    accessMode: "api",
    sessionHash: row.token_hash,
    apiTokenId: row.id
  };
}

function apiAccessResponse(access) {
  return jsonNoStore({ error: access.error || "API key required." }, access.status || 401);
}

async function adminFailureQuotaStatus(request, env) {
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  return checkQuotaSet(env, [
    {
      bucket: `admin-fail:ip:${hour.key}:${ipHash}`,
      limit: 20,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many admin attempts from this network. Try again later."
    }
  ]);
}

async function adminAccessStatus(request, env, action) {
  const session = await adminSessionStatus(request, env);
  if (session.ok) return { ok: true, actorEmail: session.actorEmail };
  const ok = isAdminAuthorized(request, env);
  const actorEmail =
    cleanText(request.headers.get("cf-access-authenticated-user-email") || "", 254) ||
    "bearer-admin";
  if (!ok) {
    const quota = env.WAITLIST_DB ? await adminFailureQuotaStatus(request, env) : { ok: true };
    await logAdminAction(request, env, action, false, actorEmail);
    if (!quota.ok) {
      return { ok: false, status: 429, error: quota.error, resetAt: quota.resetAt, actorEmail };
    }
    return { ok: false, status: 401, error: "Unauthorized", actorEmail };
  }
  return { ok: true, actorEmail };
}

async function adminSessionStatus(request, env) {
  if (!env.WAITLIST_DB) return { ok: false };
  const token = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (!token) return { ok: false };
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(
    `SELECT actor_email, expires_at, revoked_at
     FROM admin_sessions
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first();
  if (!row?.actor_email || row.revoked_at || row.expires_at <= now) return { ok: false };
  await env.WAITLIST_DB.prepare(`UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?`)
    .bind(now, tokenHash)
    .run();
  return { ok: true, actorEmail: row.actor_email };
}

function adminDeniedJson(admin) {
  return jsonNoStore(
    {
      error: admin.error || "Unauthorized",
      ...(admin.resetAt ? { resetAt: admin.resetAt } : {})
    },
    admin.status || 401
  );
}

async function logAdminAction(request, env, action, success, actorEmail = "", detail = "") {
  if (!env.WAITLIST_DB) return;
  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO admin_audit_log
        (id, action, success, actor_email, ip_hash, user_agent, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        cleanText(action, 80),
        success ? 1 : 0,
        cleanText(actorEmail, 254),
        await requestIpHash(request),
        cleanText(request.headers.get("user-agent") || "", 500),
        cleanText(detail, 500),
        new Date().toISOString()
      )
      .run();
  } catch {
    // Admin logging must not break the protected action itself.
  }
}

async function createBetaSession(request, env, access) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = isoSecondsFromNow(BETA_SESSION_TTL_SECONDS);
  const ipHash = await requestIpHash(request);
  const userAgent = cleanText(request.headers.get("user-agent") || "", 500);

  await env.WAITLIST_DB.prepare(
    `INSERT INTO beta_sessions
      (token_hash, owner_email, created_at, expires_at, last_seen_at, ip_hash, user_agent, invite_id, access_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      tokenHash,
      access.ownerEmail,
      now,
      expiresAt,
      now,
      ipHash,
      userAgent,
      access.inviteId || null,
      cleanAccessMode(access.accessMode)
    )
    .run();

  return {
    expiresAt,
    cookie: sessionCookie(request, token, BETA_SESSION_TTL_SECONDS)
  };
}

function betaSessionTokenFromRequest(request) {
  const headerToken = request.headers.get("x-beta-session") || "";
  if (headerToken) return headerToken.trim();
  return cookieValue(request, SESSION_COOKIE);
}

function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(request) {
  const secure = request && new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function adminSessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearAdminSessionCookie(request) {
  const secure = request && new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  BETA_SESSION_TTL_SECONDS,
  SESSION_COOKIE,
  adminAccessStatus,
  adminDeniedJson,
  adminFailureQuotaStatus,
  adminSessionCookie,
  adminSessionStatus,
  apiAccessResponse,
  apiAccessStatus,
  auditAuthorizationStatus,
  betaAccessResponse,
  betaAccessStatus,
  betaSessionTokenFromRequest,
  clearAdminSessionCookie,
  clearSessionCookie,
  createAdminSession,
  createBetaSession,
  isAdminAuthorized,
  logAdminAction,
  revokeAdminSession,
  sessionCookie
};
