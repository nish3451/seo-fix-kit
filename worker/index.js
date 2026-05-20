import puppeteer from "@cloudflare/puppeteer";
import {
  DODO_PAYMENT_FAILURE_EVENTS,
  DODO_PAYMENT_SUCCESS_EVENTS,
  PAID_STATUSES,
  dodoAdaptiveCurrencyFeesInclusive,
  dodoApiKey,
  dodoBaseUrl,
  dodoCountryFromRequest,
  dodoProductId,
  dodoProductMatches,
  dodoWebhookSecret,
  extractDodoPayment,
  hasDodoCheckoutConfig,
  verifyDodoWebhookSignature
} from "../shared/dodo.js";

const DOCS = {
  javascript:
    "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  title: "https://developers.google.com/search/docs/appearance/title-link",
  snippets: "https://developers.google.com/search/docs/appearance/snippet",
  structuredData:
    "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data"
};

const MAX_HTML_BYTES = 1_000_000;
const VERSION = "0.7.0";
const SESSION_COOKIE = "sfk_beta_session";
const BETA_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const REPORT_RETENTION_DAYS = 30;
const DEFAULT_INVITE_TTL_DAYS = 14;
const FIX_PACK_OFFER = {
  name: "SEO Fix Pack",
  priceLabel: "$99 beta",
  productKey: "seofixkit_fix_pack",
  description: "One proof-backed repair pass for this report plus one rerun after fixes."
};

export default {
  async scheduled(_event, env, ctx) {
    if (env.WAITLIST_DB) {
      ctx.waitUntil(cleanupExpiredRows(env));
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (env.WAITLIST_DB && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/"))) {
        ctx?.waitUntil?.(cleanupExpiredRows(env));
      }

      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "seo-fix-kit",
          runtime: "cloudflare-worker",
          browserRun: Boolean(env.BROWSER),
          waitlistDb: Boolean(env.WAITLIST_DB),
          version: VERSION
        });
      }

      if (url.pathname === "/api/waitlist" && request.method === "POST") {
        return joinWaitlist(request, env);
      }

      if (url.pathname === "/api/beta/login" && request.method === "POST") {
        return betaLogin(request, env);
      }

      if (url.pathname === "/api/beta/session" && request.method === "GET") {
        return betaSession(request, env);
      }

      if (url.pathname === "/api/beta/logout" && request.method === "POST") {
        return betaLogout(request, env);
      }

      if (url.pathname === "/api/beta/fix-request" && request.method === "POST") {
        return requestFixPack(request, env);
      }

      if (url.pathname === "/api/webhooks/dodo" && request.method === "POST") {
        return handleDodoWebhook(request, env);
      }

      if (url.pathname.startsWith("/api/reports/")) {
        return getSavedReport(request, env);
      }

      if (url.pathname === "/admin/summary") {
        return getAdminSummary(request, env);
      }

      if (url.pathname === "/admin/invites" && request.method === "POST") {
        return createInvite(request, env);
      }

      if (url.pathname === "/admin/leads.csv") {
        return exportLeadsCsv(request, env);
      }

      if (url.pathname === "/api/audit" && request.method === "POST") {
        return runPrivateAudit(request, env);
      }

      if (url.pathname === "/api/demo-audit") {
        return runPrivateDemoAudit(request, env);
      }

      if (url.pathname === "/fixture/rendered-page") {
        return new Response(renderedFixture(url.origin), {
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }

      if (url.pathname === "/fixture/robots.txt") {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/fixture/sitemap.xml\n`, {
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }

      if (url.pathname === "/fixture/sitemap.xml") {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/fixture/rendered-page</loc></url></urlset>`,
          { headers: { "content-type": "application/xml; charset=utf-8" } }
        );
      }

      if (url.pathname === "/robots.txt") {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`, {
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }

      if (url.pathname === "/sitemap.xml") {
        return new Response(rootSitemap(url.origin), {
          headers: { "content-type": "application/xml; charset=utf-8" }
        });
      }

      if (url.pathname === "/llms.txt") {
        return new Response(llmsText(url.origin), {
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }

      if (url.pathname === "/privacy") {
        return new Response(privacyHtml(url.origin), {
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }

      if (url.pathname === "/beta" || url.pathname.startsWith("/beta/")) {
        const indexUrl = new URL("/", request.url);
        const response = await env.ASSETS.fetch(new Request(indexUrl, request));
        return withPrivateHeaders(response);
      }

      if (
        url.pathname === "/" &&
        (request.headers.get("accept") || "").includes("text/markdown")
      ) {
        return new Response(homeMarkdown(url.origin), {
          headers: { "content-type": "text/markdown; charset=utf-8" }
        });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json(
        {
          error:
            error?.message ||
            "The audit failed. Try a smaller site or run again in a moment."
        },
        500
      );
    }
  }
};

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

  return json({ ok: true, status: "joined" });
}

async function exportLeadsCsv(request, env) {
  if (!env.WAITLIST_DB) {
    return new Response("Waitlist storage is not configured.", { status: 503 });
  }

  const admin = await adminAccessStatus(request, env, "export-leads");
  if (!admin.ok) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": "Bearer"
      }
    });
  }
  await logAdminAction(request, env, "export-leads", true, admin.actorEmail);

  const { results } = await env.WAITLIST_DB.prepare(
    `SELECT
      email,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      landing_path,
      referrer,
      country,
      created_at,
      updated_at
     FROM waitlist_leads
     ORDER BY created_at DESC
     LIMIT 10000`
  ).all();

  const columns = [
    "email",
    "source",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "landing_path",
    "referrer",
    "country",
    "created_at",
    "updated_at"
  ];
  const rows = [columns.join(",")];

  for (const lead of results || []) {
    rows.push(columns.map((column) => csvCell(lead[column])).join(","));
  }

  return new Response(`${rows.join("\n")}\n`, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="seofixkit-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}

async function getAdminSummary(request, env) {
  const admin = await adminAccessStatus(request, env, "view-summary");
  if (!admin.ok) return jsonNoStore({ error: "Unauthorized" }, 401);
  if (!env.WAITLIST_DB) return json({ error: "Admin storage is not configured." }, 503);
  await logAdminAction(request, env, "view-summary", true, admin.actorEmail);

  const today = new Date().toISOString().slice(0, 10);
  const soon = isoDaysFromNow(7);
  const [
    waitlist,
    invites,
    sessions,
    audits,
    auditsToday,
    expiring,
    fixRequests,
    recentAudits,
    issuePatterns,
    recentInvites
  ] = await Promise.all([
    countRows(env, "waitlist_leads"),
    countRows(env, "beta_invites"),
    countRows(env, "beta_sessions", "revoked_at IS NULL AND expires_at > ?", [new Date().toISOString()]),
    countRows(env, "audit_reports"),
    countRows(env, "audit_reports", "created_at >= ?", [`${today}T00:00:00.000Z`]),
    countRows(env, "audit_reports", "expires_at IS NOT NULL AND expires_at <= ?", [soon]),
    countRows(env, "fix_requests"),
    env.WAITLIST_DB.prepare(
      `SELECT id, url, target_host, owner_email, score, summary_json, created_at, expires_at
       FROM audit_reports
       ORDER BY created_at DESC
       LIMIT 20`
    ).all(),
    env.WAITLIST_DB.prepare(
      `SELECT report_json
       FROM audit_reports
       ORDER BY created_at DESC
       LIMIT 50`
    ).all(),
    env.WAITLIST_DB.prepare(
      `SELECT id, owner_email, label, status, max_uses, used_count, expires_at, created_at
       FROM beta_invites
       ORDER BY created_at DESC
       LIMIT 20`
    ).all()
  ]);

  return jsonNoStore({
    ok: true,
    metrics: {
      waitlist,
      invites,
      activeSessions: sessions,
      audits,
      auditsToday,
      reportsExpiringSoon: expiring,
      fixRequests
    },
    offer: FIX_PACK_OFFER,
    recentAudits: (recentAudits.results || []).map((row) => {
      const summary = parseJson(row.summary_json, {});
      return {
        id: row.id,
        url: row.url,
        targetHost: row.target_host,
        ownerEmail: row.owner_email,
        score: row.score,
        pagesScanned: summary.pagesScanned || 0,
        totalFindings: summary.totalFindings || 0,
        guardedFalsePositives: summary.guardedFalsePositives || 0,
        reportPath: `/beta/reports/${row.id}`,
        createdAt: row.created_at,
        expiresAt: row.expires_at
      };
    }),
    issuePatterns: summarizeIssuePatterns(issuePatterns.results || []),
    invites: (recentInvites.results || []).map((invite) => ({
      id: invite.id,
      ownerEmail: invite.owner_email,
      label: invite.label,
      status: invite.status,
      maxUses: invite.max_uses,
      usedCount: invite.used_count,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at
    }))
  });
}

async function createInvite(request, env) {
  const admin = await adminAccessStatus(request, env, "create-invite");
  if (!admin.ok) return jsonNoStore({ error: "Unauthorized" }, 401);
  if (!env.WAITLIST_DB) return json({ error: "Invite storage is not configured." }, 503);

  const body = await request.json().catch(() => ({}));
  const ownerEmail = normalizeEmail(body.email || body.ownerEmail);
  if (!ownerEmail) return json({ error: "Enter a valid invite email." }, 400);

  const code = cleanInviteCode(body.code || randomInviteCode());
  if (!code) return json({ error: "Invite code must be at least 8 letters or numbers." }, 400);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const codeHash = await sha256Hex(code);
  const maxUses = Math.min(Math.max(Number(body.maxUses || 1), 1), 10);
  const expiresAt = body.expiresAt || isoDaysFromNow(Number(body.ttlDays || DEFAULT_INVITE_TTL_DAYS));
  const label = cleanText(body.label || "Private beta invite", 120);

  await env.WAITLIST_DB.prepare(
    `INSERT INTO beta_invites
      (id, code_hash, owner_email, label, status, max_uses, used_count, created_at, expires_at, created_by)
     VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?, ?)`
  )
    .bind(id, codeHash, ownerEmail, label, maxUses, now, expiresAt, admin.actorEmail)
    .run();
  await logAdminAction(request, env, "create-invite", true, admin.actorEmail, ownerEmail);

  return jsonNoStore({
    ok: true,
    invite: {
      id,
      ownerEmail,
      code,
      label,
      maxUses,
      usedCount: 0,
      expiresAt,
      url: `${new URL(request.url).origin}/beta?email=${encodeURIComponent(ownerEmail)}&invite=${encodeURIComponent(code)}`
    }
  });
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

async function runPrivateAudit(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  let targetUrl = "";
  try {
    targetUrl = normalizeUrl(body.url || "");
  } catch {
    return json({ error: "Enter a valid public website URL." }, 400);
  }
  const publicUrlCheck = publicAuditUrlStatus(targetUrl);
  if (!publicUrlCheck.ok) {
    return json({ error: publicUrlCheck.error }, 400);
  }

  const quota = await auditQuotaStatus(request, env, access, targetUrl);
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  const report = await auditUrl(targetUrl, env, {
    maxPages: clampPageLimit(body.maxPages || 10),
    appOrigin: new URL(request.url).origin
  });
  const saved = await saveAuditReport(report, request, env, access);
  return jsonNoStore(saved);
}

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
  const now = new Date().toISOString();
  const note = cleanText(body.note || "", 1000);
  const fixRequest = await getOrCreateFixRequest(env, row, access, summary, note, now);

  if (fixRequest.status === "paid") {
    return jsonNoStore({
      ok: true,
      mode: "paid",
      request: fixRequestResponse(fixRequest, now),
      offer: FIX_PACK_OFFER
    });
  }

  if (fixRequest.checkout_url && fixRequest.checkout_session_id) {
    return jsonNoStore({
      ok: true,
      mode: "checkout",
      checkoutUrl: fixRequest.checkout_url,
      request: fixRequestResponse(fixRequest, now),
      offer: FIX_PACK_OFFER
    });
  }

  if (!hasDodoCheckoutConfig(env)) {
    return jsonNoStore({
      ok: true,
      mode: "request",
      checkoutAvailable: false,
      message: "Fix request saved. Dodo checkout is not configured yet.",
      request: fixRequestResponse(fixRequest, now),
      offer: FIX_PACK_OFFER
    });
  }

  let checkout;
  try {
    checkout = await createDodoFixPackCheckout(request, env, row, fixRequest, access);
  } catch (error) {
    return jsonNoStore(
      {
        error: error?.message || "Dodo checkout could not be created.",
        code: error?.code || "DODO_CHECKOUT_ERROR",
        request: fixRequestResponse(fixRequest, now),
        offer: FIX_PACK_OFFER
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
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      checkout.checkoutSessionId,
      checkout.checkoutUrl,
      checkoutCreatedAt,
      dodoProductId(env),
      checkoutCreatedAt,
      fixRequest.id
    )
    .run();

  return jsonNoStore({
    ok: true,
    mode: "checkout",
    checkoutUrl: checkout.checkoutUrl,
    request: {
      ...fixRequestResponse(fixRequest, checkoutCreatedAt),
      status: "checkout_created",
      checkoutSessionId: checkout.checkoutSessionId,
      offer: FIX_PACK_OFFER,
      checkoutCreatedAt
    },
    offer: FIX_PACK_OFFER
  });
}

async function getOrCreateFixRequest(env, reportRow, access, summary, note, now) {
  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE report_id = ? AND owner_email = ?
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(reportRow.id, access.ownerEmail)
    .first();
  if (existing?.id) return existing;

  const id = crypto.randomUUID();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_requests
      (id, report_id, owner_email, target_url, target_host, score, issue_count, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`
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
      now,
      now
    )
    .run();

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
    created_at: now,
    updated_at: now
  };
}

function fixRequestResponse(row, now = new Date().toISOString()) {
  return {
    id: row.id,
    status: row.status || "new",
    targetUrl: row.target_url,
    targetHost: row.target_host,
    score: row.score,
    issueCount: row.issue_count,
    checkoutSessionId: row.checkout_session_id || "",
    paidAt: row.paid_at || "",
    createdAt: row.created_at || now,
    updatedAt: row.updated_at || now
  };
}

async function createDodoFixPackCheckout(request, env, reportRow, fixRequest, access) {
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
      target_host: reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase()
    }
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const response = await fetch(`${dodoBaseUrl(env)}/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
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

async function handleDodoWebhook(request, env) {
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
    const result = await processDodoPaymentWebhook(env, eventType, payment);
    await markDodoWebhookProcessed(env, webhookId, result.status || "processed", "", result.fixRequestId || payment.metadataFixRequestId || "");
    return jsonNoStore({ received: true, ...result });
  } catch (error) {
    await markDodoWebhookProcessed(env, webhookId, "error", error?.message || "Webhook processing failed.", payment.metadataFixRequestId || "");
    return jsonNoStore({ error: "Webhook processing failed." }, 500);
  }
}

async function reserveDodoWebhookEvent(env, { webhookId, eventType, payment, payloadHash, payloadText }) {
  if (!webhookId) throw new Error("Missing Dodo webhook id.");
  const now = new Date().toISOString();
  const existing = await env.WAITLIST_DB.prepare("SELECT status FROM dodo_webhook_events WHERE webhook_id = ?")
    .bind(webhookId)
    .first();
  if (existing?.status === "processed") return { duplicate: true };
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

  await env.WAITLIST_DB.prepare(
    `INSERT INTO dodo_webhook_events
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
  return { duplicate: false };
}

async function processDodoPaymentWebhook(env, eventType, payment) {
  if (!payment.paymentId && !payment.checkoutSessionId && !payment.metadataFixRequestId) {
    return { ok: false, ignored: true, status: "ignored", reason: "missing_payment_identity" };
  }
  if (!dodoProductMatches(payment, dodoProductId(env))) {
    return { ok: false, ignored: true, status: "ignored", reason: "product_mismatch" };
  }
  if (payment.metadataProductKey && payment.metadataProductKey !== FIX_PACK_OFFER.productKey) {
    return { ok: false, ignored: true, status: "ignored", reason: "product_key_mismatch" };
  }

  const fixRequest = await findFixRequestForPayment(env, payment);
  if (!fixRequest?.id) {
    return { ok: false, ignored: true, status: "ignored", reason: "fix_request_not_found" };
  }

  const now = new Date().toISOString();
  if (DODO_PAYMENT_SUCCESS_EVENTS.has(eventType)) {
    if (payment.status && !PAID_STATUSES.has(payment.status)) {
      return { ok: false, ignored: true, status: "ignored", reason: "not_paid", fixRequestId: fixRequest.id };
    }
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = 'paid',
           payment_id = ?,
           checkout_session_id = COALESCE(checkout_session_id, ?),
           paid_at = COALESCE(paid_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.paymentId, payment.checkoutSessionId, now, now, fixRequest.id)
      .run();
    return { ok: true, status: "processed", paid: true, fixRequestId: fixRequest.id };
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
    return { ok: true, status: "processed", paid: false, fixRequestId: fixRequest.id };
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
  return null;
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

async function runPrivateDemoAudit(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  const origin = new URL(request.url).origin;
  const report = await auditUrl(`${origin}/fixture/rendered-page`, env, {
    maxPages: 1,
    appOrigin: origin
  });
  const saved = await saveAuditReport(report, request, env, access);
  return jsonNoStore(saved);
}

async function saveAuditReport(report, request, env, access) {
  const origin = new URL(request.url).origin;
  const id = makePrivateReportId(report.url);
  const now = new Date().toISOString();
  const expiresAt = isoDaysFromNow(REPORT_RETENTION_DAYS);
  const targetHost = new URL(report.url).hostname.toLowerCase();
  const saved = {
    ...report,
    id,
    reportPath: `/beta/reports/${id}`,
    reportUrl: `${origin}/beta/reports/${id}`,
    owner: {
      email: access.ownerEmail,
      inviteId: access.inviteId || null,
      accessMode: access.accessMode || "invite"
    },
    retention: {
      expiresAt,
      days: REPORT_RETENTION_DAYS
    }
  };

  await env.WAITLIST_DB.prepare(
    `INSERT INTO audit_reports
      (id, url, origin, score, summary_json, report_json, created_at, updated_at, owner_email, owner_session_hash, target_host, expires_at, owner_invite_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      saved.url,
      saved.origin,
      saved.score,
      JSON.stringify(saved.summary || {}),
      JSON.stringify(saved),
      now,
      now,
      access.ownerEmail,
      access.sessionHash,
      targetHost,
      expiresAt,
      access.inviteId || null
    )
    .run();

  return saved;
}

async function getSavedReport(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) {
    return json({ error: "Report storage is not configured." }, 503);
  }

  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname.slice("/api/reports/".length));
  const wantsBrief = relative.endsWith("/brief.md");
  const id = wantsBrief ? relative.slice(0, -"/brief.md".length) : relative;
  if (!isSafeReportId(id)) {
    return json({ error: "Report not found." }, 404);
  }

  const row = await env.WAITLIST_DB.prepare(
    `SELECT report_json, owner_email, owner_invite_id, expires_at FROM audit_reports WHERE id = ? LIMIT 1`
  )
    .bind(id)
    .first();
  if (!row?.report_json) {
    return json({ error: "Report not found." }, 404);
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    await env.WAITLIST_DB.prepare(`DELETE FROM audit_reports WHERE id = ?`).bind(id).run();
    return json({ error: "Report expired." }, 404);
  }
  if (row.owner_email && row.owner_email !== access.ownerEmail) {
    return json({ error: "Report not found." }, 404);
  }
  if (
    row.owner_invite_id &&
    access.accessMode !== "founder-override" &&
    row.owner_invite_id !== access.inviteId
  ) {
    return json({ error: "Report not found." }, 404);
  }

  const report = JSON.parse(row.report_json);
  report.reportUrl = `${url.origin}${report.reportPath || `/beta/reports/${id}`}`;

  if (wantsBrief) {
    return new Response(report.repairBrief || "# SEO Fix Kit repair brief\n", {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="seofixkit-${id}.md"`,
        "content-type": "text/markdown; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      }
    });
  }

  return jsonNoStore(report);
}

async function auditUrl(inputUrl, env, options = {}) {
  const startedAt = Date.now();
  const startUrl = normalizeUrl(inputUrl);
  const origin = new URL(startUrl).origin;
  let crawlOrigin = origin;
  const maxPages = clampPageLimit(options.maxPages || 10);

  const robots =
    origin === options.appOrigin
      ? { ok: true, status: 200, url: `${origin}/robots.txt`, body: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n` }
      : await fetchText(`${origin}/robots.txt`);
  const sitemap =
    origin === options.appOrigin
      ? { ok: true, status: 200, url: `${origin}/sitemap.xml`, body: rootSitemap(origin) }
      : await fetchText(`${origin}/sitemap.xml`);
  const browser = await puppeteer.launch(env.BROWSER);
  const pages = [];
  const queue = [startUrl];
  const visited = new Set();

  try {
    while (queue.length && pages.length < maxPages) {
      const nextUrl = stripHash(queue.shift());
      if (visited.has(nextUrl)) continue;
      visited.add(nextUrl);

      const page = await inspectPage(nextUrl, browser);
      if (!page.isHtml) continue;
      pages.push(page);
      if (pages.length === 1 && page.rendered?.finalUrl) {
        crawlOrigin = new URL(page.rendered.finalUrl).origin;
      }

      for (const link of page.rendered.internalLinks) {
        const href = stripHash(link.href);
        if (!href.startsWith(crawlOrigin)) continue;
        if (
          isLikelyHtmlUrl(href) &&
          !visited.has(href) &&
          !queue.includes(href) &&
          queue.length + pages.length < maxPages
        ) {
          queue.push(href);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const findings = buildFindings({
    pages,
    startUrl,
    robots,
    sitemap
  });
  const score = scoreFindings(findings);
  const pageSummaries = buildPageSummaries(pages, findings, startUrl);
  const summary = summarize(findings, pages, maxPages);
  const repairPlan = buildRepairPlan(findings);
  const fixPack = buildFixPack(pages[0], origin, findings);

  return {
    id: `${new URL(startUrl).hostname.replace(/[^a-z0-9]+/gi, "-")}-${startedAt.toString(36)}`,
    url: startUrl,
    origin,
    scannedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    score,
    summary,
    warnings: [],
    docs: DOCS,
    pages,
    pageSummaries,
    findings,
    repairPlan,
    repairBrief: buildRepairBrief({
      startUrl,
      score,
      summary,
      pages,
      findings,
      repairPlan
    }),
    fixPack
  };
}

async function inspectPage(url, browser) {
  const staticFetch = await fetchText(url);
  const isHtml = isHtmlResponse(staticFetch, url);
  const finalUrl = staticFetch.url || url;
  const finalUrlCheck = publicAuditUrlStatus(finalUrl);
  const safeToRender = finalUrlCheck.ok;
  const staticFacts = extractStaticFacts(staticFetch.body || "", finalUrl, staticFetch);
  const rendered = isHtml && safeToRender ? await extractRenderedFacts(browser, finalUrl) : staticFacts;

  return {
    url,
    finalUrl,
    redirected: stripHash(finalUrl) !== stripHash(url),
    renderSkippedReason: isHtml && !safeToRender ? finalUrlCheck.error || "Final URL left the audited origin." : "",
    status: staticFetch.status,
    ok: staticFetch.ok,
    contentType: staticFetch.contentType,
    isHtml,
    static: staticFacts,
    rendered
  };
}

async function extractRenderedFacts(browser, url) {
  const page = await browser.newPage();
  const started = Date.now();

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 25_000
    });

    await wait(350);

    const facts = await page.evaluate(() => {
      const absolute = (value) => {
        try {
          return value ? new URL(value, location.href).href : null;
        } catch {
          return value || null;
        }
      };
      const metaByName = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || null;
      const metaByProperty = (property) =>
        document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") || null;
      const text = (node) => (node?.textContent || "").trim().replace(/\s+/g, " ");
      const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
        (node) => ({ level: node.tagName.toLowerCase(), text: text(node) })
      );
      const links = [...document.querySelectorAll("a[href]")]
        .map((node) => ({
          text: text(node),
          href: absolute(node.getAttribute("href")),
          rawHref: node.getAttribute("href")
        }))
        .filter((link) => link.href && link.href.startsWith("http"));
      const images = [...document.querySelectorAll("img")].map((node) => ({
        src: absolute(node.getAttribute("src")),
        alt: node.getAttribute("alt") || ""
      }));
      const schemaTypes = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .flatMap((node) => {
          try {
            const parsed = JSON.parse(node.textContent || "{}");
            return (Array.isArray(parsed) ? parsed : [parsed])
              .map((item) => item["@type"])
              .filter(Boolean);
          } catch {
            return ["invalid-json"];
          }
        });
      const bodyText = text(document.body);
      const origin = location.origin;

      return {
        source: "rendered-dom",
        finalUrl: location.href,
        title: document.title || "",
        description: metaByName("description"),
        robots: metaByName("robots"),
        canonical: absolute(document.querySelector('link[rel="canonical"]')?.getAttribute("href")),
        lang: document.documentElement.getAttribute("lang") || null,
        viewport: metaByName("viewport"),
        charset: document.characterSet || null,
        doctype: document.doctype ? document.doctype.name : null,
        hreflangs: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(
          (node) => ({
            hreflang: node.getAttribute("hreflang"),
            href: absolute(node.getAttribute("href"))
          })
        ),
        h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
        headings,
        links,
        internalLinks: links.filter((link) => new URL(link.href).origin === origin),
        externalLinks: links.filter((link) => new URL(link.href).origin !== origin),
        images,
        imagesMissingAlt: images.filter((image) => !image.alt || !image.alt.trim()),
        openGraph: {
          title: metaByProperty("og:title"),
          description: metaByProperty("og:description"),
          image: absolute(metaByProperty("og:image")),
          type: metaByProperty("og:type")
        },
        twitter: {
          card: metaByName("twitter:card"),
          title: metaByName("twitter:title"),
          description: metaByName("twitter:description"),
          image: absolute(metaByName("twitter:image"))
        },
        favicon: absolute(document.querySelector('link[rel~="icon"]')?.getAttribute("href")),
        appleTouchIcon: absolute(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")),
        schemaTypes,
        wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
        bodySample: bodyText.slice(0, 280)
      };
    });

    return {
      ...facts,
      status: response?.status() || null,
      loadDurationMs: Date.now() - started
    };
  } finally {
    await page.close();
  }
}

function extractStaticFacts(html, url, fetchResult = {}) {
  const base = new URL(url);
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] || "";
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const body = withoutScripts.match(/<body[\s\S]*?<\/body>/i)?.[0] || withoutScripts;
  const bodyText = decodeEntities(stripTags(body)).replace(/\s+/g, " ").trim();
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: absolute(match[1], base.href),
      rawHref: match[1],
      text: decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim()
    }))
    .filter((link) => link.href?.startsWith("http"));
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => ({
    src: absolute(attr(match[0], "src"), base.href),
    alt: attr(match[0], "alt") || ""
  }));
  const headings = [];
  for (const match of html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    headings.push({
      level: match[1].toLowerCase(),
      text: decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim()
    });
  }
  const schemaTypes = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      try {
        const parsed = JSON.parse(match[1] || "{}");
        return (Array.isArray(parsed) ? parsed : [parsed])
          .map((item) => item["@type"])
          .filter(Boolean);
      } catch {
        return ["invalid-json"];
      }
    });

  return {
    source: "static-html",
    finalUrl: url,
    status: fetchResult.status || null,
    title: decodeEntities(stripTags(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")),
    description: meta(head, "name", "description"),
    robots: meta(head, "name", "robots"),
    canonical: absolute(linkRel(head, "canonical"), base.href),
    lang: html.match(/<html\b[^>]*lang=["']([^"']+)["']/i)?.[1] || null,
    viewport: meta(head, "name", "viewport"),
    charset:
      html.match(/<meta\b[^>]*charset=["']?([^"'\s/>]+)/i)?.[1] ||
      (meta(head, "http-equiv", "content-type") || "").match(/charset=([^;]+)/i)?.[1] ||
      null,
    doctype: html.trimStart().toLowerCase().startsWith("<!doctype html") ? "html" : null,
    hreflangs: [...head.matchAll(/<link\b(?=[^>]*rel=["'][^"']*alternate[^"']*["'])(?=[^>]*hreflang=["']([^"']+)["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/gi)].map(
      (match) => ({
        hreflang: match[1],
        href: absolute(match[2], base.href)
      })
    ),
    h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
    headings,
    links,
    internalLinks: links.filter((link) => new URL(link.href).origin === base.origin),
    externalLinks: links.filter((link) => new URL(link.href).origin !== base.origin),
    images,
    imagesMissingAlt: images.filter((image) => !image.alt || !image.alt.trim()),
    openGraph: {
      title: meta(head, "property", "og:title"),
      description: meta(head, "property", "og:description"),
      image: absolute(meta(head, "property", "og:image"), base.href),
      type: meta(head, "property", "og:type")
    },
    twitter: {
      card: meta(head, "name", "twitter:card"),
      title: meta(head, "name", "twitter:title"),
      description: meta(head, "name", "twitter:description"),
      image: absolute(meta(head, "name", "twitter:image"), base.href)
    },
    favicon: absolute(linkRel(head, "icon"), base.href),
    appleTouchIcon: absolute(linkRel(head, "apple-touch-icon"), base.href),
    schemaTypes,
    wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    bodySample: bodyText.slice(0, 280)
  };
}

function buildFindings({ pages, startUrl, robots, sitemap }) {
  const findings = [];
  let activePage = null;
  const add = (finding) => {
    const pageFields = activePage
      ? {
          pageUrl: activePage.url,
          finalUrl: activePage.finalUrl || activePage.rendered?.finalUrl || activePage.url,
          pageLabel: pathLabel(activePage.url, startUrl)
        }
      : {};
    findings.push({
      id: `${finding.type}-${findings.length + 1}`,
      confidence: finding.confidence || "verified",
      ...pageFields,
      ...finding
    });
  };

  for (const page of pages) {
    activePage = page;
    const rendered = page.rendered;
    const staticFacts = page.static;
    const label = pathLabel(page.url, startUrl);

    if (page.redirected || stripHash(rendered.finalUrl || page.finalUrl || page.url) !== stripHash(page.url)) {
      add({
        type: "issue",
        severity: "notice",
        title: `URL redirects before rendering on ${label}`,
        why: "Redirects are normal, but audit evidence should show the final URL search engines and users reach.",
        evidence: `Requested ${page.url}; final URL ${rendered.finalUrl || page.finalUrl}.`,
        fix: "Make sure canonicals, internal links, and sitemaps point at the final preferred URL.",
        confidence: "needs-review"
      });
    }

    if (staticFacts.h1s.length === 0 && rendered.h1s.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: H1 exists after render`,
        why: "A static-only crawler would report a missing H1, but the rendered page contains one.",
        evidence: `Rendered H1: "${rendered.h1s[0]}"`,
        fix: "Do not add another H1 just to satisfy a static crawler.",
        source: DOCS.javascript
      });
    }

    if (staticFacts.internalLinks.length === 0 && rendered.internalLinks.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: internal links exist after render`,
        why: "Static HTML did not expose links, but the browser-rendered DOM did.",
        evidence: `${rendered.internalLinks.length} rendered internal links found.`,
        fix: "Keep the rendered links crawlable as real anchor tags.",
        source: DOCS.javascript
      });
    }

    if (staticFacts.wordCount < 50 && rendered.wordCount >= 250) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: rendered content is not thin`,
        why: "The static HTML looks thin, but users and modern crawlers see substantial rendered content.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "No thin-content fix is needed for this page based on rendered text.",
        source: DOCS.javascript
      });
    }

    if (!rendered.title || rendered.title.length < 12) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing or weak title on ${label}`,
        why: "A clear title helps searchers identify the page.",
        evidence: rendered.title ? `Current title: "${rendered.title}"` : "No title found.",
        fix: "Add a unique, descriptive title for this page.",
        source: DOCS.title,
        snippet: `<title>${escapeHtml(suggestTitle(page.url, rendered))}</title>`
      });
    } else if (rendered.title.length > 65) {
      add({
        type: "issue",
        severity: "warning",
        title: `Long title on ${label}`,
        why: "Long titles are often rewritten or truncated in search results.",
        evidence: `${rendered.title.length} characters: "${rendered.title}"`,
        fix: "Shorten the title and put the main page promise first.",
        source: DOCS.title,
        snippet: `<title>${escapeHtml(trimSentence(rendered.title, 58))}</title>`
      });
    }

    if (!rendered.description) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing meta description on ${label}`,
        why: "A useful description can influence the snippet shown in search.",
        evidence: "No meta description found in the rendered page.",
        fix: "Add a concise page-specific meta description.",
        source: DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    } else if (rendered.description.length < 70 || rendered.description.length > 165) {
      add({
        type: "issue",
        severity: "warning",
        title: `Meta description needs tightening on ${label}`,
        why:
          "Google may rewrite snippets, but a clear page-specific description gives it better source material.",
        evidence: `${rendered.description.length} characters: "${rendered.description}"`,
        fix: "Rewrite it as one clear value proposition.",
        source: DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    }

    if (!rendered.h1s.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing H1 on ${label}`,
        why: "The H1 should state the main topic visible on the page.",
        evidence: "No rendered H1 found.",
        fix: "Add one visible H1 that matches the page purpose.",
        source: DOCS.javascript,
        snippet: `<h1>${escapeHtml(suggestTitle(page.url, rendered))}</h1>`
      });
    } else if (rendered.h1s.length > 1) {
      add({
        type: "issue",
        severity: "warning",
        title: `Multiple H1s on ${label}`,
        why: "Multiple H1s can make the page hierarchy less clear.",
        evidence: `${rendered.h1s.length} rendered H1s: ${rendered.h1s.join(" | ")}`,
        fix: "Keep one primary H1 and move secondary headings to H2."
      });
    }

    const hierarchyIssue = headingHierarchyIssue(rendered.headings || []);
    if (hierarchyIssue) {
      add({
        type: "issue",
        severity: "warning",
        title: `Heading hierarchy needs cleanup on ${label}`,
        why: "Headings should describe the page outline in order so users, assistive tech, and crawlers can understand the structure.",
        evidence: hierarchyIssue,
        fix: "Use one H1, then move section headings through H2 and H3 without skipping levels.",
        confidence: "needs-review"
      });
    }

    if (rendered.wordCount < 250) {
      add({
        type: "issue",
        severity: "warning",
        title: `Thin rendered content on ${label}`,
        why:
          "This is a heuristic, not a ranking rule. Thin pages often fail to answer the query well.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "Add useful page-specific detail, proof, examples, and next steps.",
        confidence: "needs-review"
      });
    }

    if (!rendered.internalLinks.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `No rendered internal links on ${label}`,
        why: "Internal links help crawlers discover and understand related pages.",
        evidence: "No internal anchor links found in the rendered DOM.",
        fix: "Add links to important related pages using normal anchor tags.",
        source: DOCS.javascript
      });
    }

    if (!rendered.canonical) {
      add({
        type: "issue",
        severity: "warning",
        title: `Missing canonical URL on ${label}`,
        why: "Canonical tags help clarify the preferred URL for similar pages.",
        evidence: "No rendered rel=canonical tag found.",
        fix: "Add a canonical tag that points to the preferred URL.",
        source: DOCS.javascript,
        snippet: `<link rel="canonical" href="${page.url}" />`
      });
    }

    if (!rendered.viewport) {
      add({
        type: "issue",
        severity: "warning",
        title: `Viewport meta tag missing on ${label}`,
        why: "Mobile pages need a viewport tag so layouts render at the intended width.",
        evidence: "No rendered viewport meta tag found.",
        fix: "Add a responsive viewport meta tag.",
        snippet: '<meta name="viewport" content="width=device-width, initial-scale=1" />'
      });
    }

    if (!rendered.lang) {
      add({
        type: "issue",
        severity: "notice",
        title: `HTML language missing on ${label}`,
        why: "The lang attribute helps browsers, translation tools, and assistive tech understand the page language.",
        evidence: "No lang attribute found on the rendered html element.",
        fix: 'Add a truthful language code such as <html lang="en">.',
        snippet: '<html lang="en">'
      });
    }

    if (!rendered.charset) {
      add({
        type: "issue",
        severity: "notice",
        title: `Character encoding missing on ${label}`,
        why: "A charset declaration prevents text rendering surprises.",
        evidence: "No rendered charset could be confirmed.",
        fix: "Declare UTF-8 in the document head.",
        snippet: '<meta charset="utf-8" />'
      });
    }

    if (!rendered.doctype) {
      add({
        type: "issue",
        severity: "notice",
        title: `HTML doctype missing on ${label}`,
        why: "A doctype keeps browsers out of quirks mode.",
        evidence: "No HTML doctype was found before rendering.",
        fix: "Start the document with <!doctype html>.",
        snippet: "<!doctype html>"
      });
    }

    if ((rendered.robots || "").toLowerCase().includes("noindex")) {
      add({
        type: "issue",
        severity: "critical",
        title: `Noindex found on ${label}`,
        why: "A noindex directive tells search engines not to index the page.",
        evidence: `Robots meta: "${rendered.robots}"`,
        fix: "Remove noindex if this page should appear in search."
      });
    }

    if (!rendered.openGraph.image || !rendered.twitter.image) {
      add({
        type: "issue",
        severity: "warning",
        title: `Social share image incomplete on ${label}`,
        why: "This affects how the page looks when shared. It is not a direct ranking claim.",
        evidence: `og:image: ${rendered.openGraph.image || "missing"}; twitter:image: ${
          rendered.twitter.image || "missing"
        }`,
        fix: "Add 1200x630 Open Graph and Twitter images.",
        snippet: buildSocialSnippet(page.url, rendered)
      });
    }

    if (!rendered.appleTouchIcon) {
      add({
        type: "issue",
        severity: "notice",
        title: `Apple touch icon missing on ${label}`,
        why: "This improves mobile saved-page presentation. It is not a ranking claim.",
        evidence: "No apple-touch-icon link found.",
        fix: "Add an Apple touch icon.",
        snippet: '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />'
      });
    }

    if (rendered.images.length > 0 && rendered.imagesMissingAlt.length > 0) {
      add({
        type: "issue",
        severity: "warning",
        title: `Images missing alt text on ${label}`,
        why: "Alt text improves accessibility and can help image understanding.",
        evidence: `${rendered.imagesMissingAlt.length}/${rendered.images.length} images have empty alt text.`,
        fix: "Add useful alt text to informative images. Leave decorative images empty intentionally.",
        confidence: "needs-review"
      });
    }

    if (!rendered.schemaTypes.length) {
      add({
        type: "enhancement",
        severity: "notice",
        title: `Structured data opportunity on ${label}`,
        why: "Structured data can make content eligible for richer search features when guidelines are met.",
        evidence: "No JSON-LD structured data found.",
        fix: "Add truthful schema that matches visible content.",
        source: DOCS.structuredData,
        snippet: buildSchemaSnippet(page.url, rendered)
      });
    }
  }
  activePage = null;

  if (!robots.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Robots.txt not found",
      why: "Robots.txt gives crawlers explicit discovery guidance.",
      evidence: `GET /robots.txt returned ${robots.status || "no response"}.`,
      fix: "Add a robots.txt file that references your sitemap.",
      snippet: "User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml"
    });
  }

  if (!sitemap.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Sitemap not found",
      why: "A sitemap helps crawlers discover important URLs.",
      evidence: `GET /sitemap.xml returned ${sitemap.status || "no response"}.`,
      fix: "Publish a sitemap and reference it from robots.txt."
    });
  }

  return findings;
}

function buildRepairPlan(findings) {
  return findings
    .filter((finding) => finding.severity !== "good")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding, index) => ({
      priority: index + 1,
      severity: finding.severity,
      title: finding.title,
      pageUrl: finding.pageUrl || null,
      pageLabel: finding.pageLabel || null,
      proof: finding.evidence,
      fix: finding.fix,
      confidence: finding.confidence || "verified",
      source: finding.source || null,
      snippet: finding.snippet || null,
      estimatedEffort: estimatedEffort(finding),
      workType: workType(finding),
      acceptance: acceptanceCheck(finding)
    }));
}

function buildRepairBrief({ startUrl, score, summary, pages, findings, repairPlan }) {
  const lines = [
    "# SEO Fix Kit repair brief",
    "",
    `Site: ${startUrl}`,
    `Scanned pages: ${summary.pagesScanned}`,
    `Score: ${score}/100`,
    `Issues: ${summary.critical} critical, ${summary.warnings} warnings, ${summary.notices} notices`,
    `False positives avoided: ${summary.guardedFalsePositives}`,
    ""
  ];

  if (!repairPlan.length) {
    lines.push("## Fix order", "", "No critical repairs found in this scan.", "");
  } else {
    lines.push("## Fix order", "");
    for (const item of repairPlan) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
      if (item.snippet) {
        lines.push("", "```html", fenceSafe(item.snippet), "```", "");
      }
    }
  }

  const guarded = findings.filter((finding) => finding.severity === "good");
  if (guarded.length) {
    lines.push("## Do not fix these false positives", "");
    for (const finding of guarded) {
      lines.push(`- ${finding.title}: ${finding.evidence}`);
    }
    lines.push("");
  }

  if (pages[0]?.rendered) {
    const facts = pages[0].rendered;
    lines.push("## Rendered proof snapshot", "");
    lines.push(`- Rendered title: ${facts.title || "missing"}`);
    lines.push(`- Rendered description: ${facts.description || "missing"}`);
    lines.push(`- Rendered H1s: ${facts.h1s?.join(" | ") || "none"}`);
    lines.push(`- Rendered word count: ${facts.wordCount ?? "unknown"}`);
    lines.push(`- Rendered internal links: ${facts.internalLinks?.length ?? 0}`);
    lines.push(`- Rendered schema types: ${facts.schemaTypes?.join(", ") || "none"}`);
    lines.push("");
  }

  lines.push("Re-run SEO Fix Kit after shipping changes and keep only fixes that match visible page content.");
  return lines.join("\n");
}

function buildFixPack(page, origin, findings = []) {
  if (!page) return [];
  const issueFixes = findings
    .filter((finding) => finding.severity !== "good" && finding.snippet)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding) => ({
      title: `Fix: ${finding.title}`,
      body: `${finding.fix} Proof: ${finding.evidence}`,
      snippet: finding.snippet
    }));

  return [
    ...issueFixes,
    {
      title: "Social preview tags",
      body: "Use this when og:image or twitter:image is missing.",
      snippet: buildSocialSnippet(page.url, page.rendered)
    },
    {
      title: "Canonical tag",
      body: "Use this when the page has one preferred public URL.",
      snippet: `<link rel="canonical" href="${page.url}" />`
    },
    {
      title: "Basic WebSite schema",
      body: "Use truthful schema that matches visible content.",
      snippet: buildSchemaSnippet(origin, page.rendered)
    }
  ].filter(dedupeFix);
}

function severityRank(severity) {
  return { critical: 0, warning: 1, notice: 2, good: 3 }[severity] ?? 4;
}

function acceptanceCheck(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("title")) {
    return "The rendered page has a unique, descriptive title that is not obviously truncated.";
  }
  if (title.includes("description")) {
    return "The rendered page has one useful meta description, roughly 70-165 characters.";
  }
  if (title.includes("h1")) {
    return "The rendered page has one visible H1 that matches the main page purpose.";
  }
  if (title.includes("internal links")) {
    return "The rendered DOM exposes normal internal anchor links to important pages.";
  }
  if (title.includes("canonical")) {
    return "The rendered head includes one rel=canonical pointing to the preferred URL.";
  }
  if (title.includes("noindex")) {
    return "The rendered robots meta does not include noindex for pages that should rank.";
  }
  if (title.includes("social share")) {
    return "The rendered head includes og:image and twitter:image using a 1200x630 image.";
  }
  if (title.includes("apple touch")) {
    return "The rendered head links an Apple touch icon.";
  }
  if (title.includes("alt text")) {
    return "Informative images have useful alt text, while decorative images are intentionally empty.";
  }
  if (title.includes("structured data")) {
    return "JSON-LD validates and matches content that is visible on the page.";
  }
  if (title.includes("viewport")) {
    return "The rendered head includes a mobile-friendly viewport meta tag.";
  }
  if (title.includes("language")) {
    return "The rendered html element has the correct lang attribute.";
  }
  if (title.includes("encoding")) {
    return "The rendered document declares UTF-8 character encoding.";
  }
  if (title.includes("doctype")) {
    return "The HTML document starts in standards mode with <!doctype html>.";
  }
  if (title.includes("redirect")) {
    return "Canonicals, sitemap URLs, and internal links point at the final preferred URL.";
  }
  if (title.includes("robots.txt")) {
    return "GET /robots.txt returns 200 and references the sitemap.";
  }
  if (title.includes("sitemap")) {
    return "GET /sitemap.xml returns 200 and lists indexable canonical URLs.";
  }
  return "Re-run the audit and confirm this finding is gone or marked needs-review with evidence.";
}

function dedupeFix(fix, index, fixes) {
  return fixes.findIndex((item) => item.snippet === fix.snippet) === index;
}

function fenceSafe(value) {
  return String(value || "").replaceAll("```", "` ` `");
}

function buildSocialSnippet(url, facts) {
  const title = escapeHtml(facts.title || suggestTitle(url, facts));
  const description = escapeHtml(facts.description || suggestDescription(facts));
  const origin = new URL(url).origin;
  const image = `${origin}/og-image.png`;
  return [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ].join("\n");
}

function buildSchemaSnippet(url, facts) {
  const origin = new URL(url).origin;
  return `<script type="application/ld+json">\n${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: facts.title || new URL(url).hostname,
      url: origin,
      description: facts.description || suggestDescription(facts)
    },
    null,
    2
  )}\n</script>`;
}

async function fetchText(url) {
  try {
    let currentUrl = url;
    let response = null;
    for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
      const status = publicAuditUrlStatus(currentUrl);
      if (!status.ok) {
        return {
          ok: false,
          status: null,
          url: currentUrl,
          contentType: "",
          body: "",
          error: status.error
        };
      }

      response = await fetch(currentUrl, {
        redirect: "manual",
        headers: { "user-agent": `SEOFixKit/${VERSION} (+https://seofixkit.com; evidence-backed SEO audit)` }
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) break;
      currentUrl = new URL(location, currentUrl).href;
    }

    if (!response) {
      throw new Error("No response returned.");
    }

    const contentType = response.headers.get("content-type") || "";
    const body =
      contentType.includes("text") ||
      contentType.includes("html") ||
      contentType.includes("xml")
        ? await readTextLimited(response, MAX_HTML_BYTES)
        : "";
    return { ok: response.ok, status: response.status, url: response.url || currentUrl, contentType, body };
  } catch (error) {
    return { ok: false, status: null, url, contentType: "", body: "", error: error.message };
  }
}

function isHtmlResponse(fetchResult, url) {
  const contentType = (fetchResult.contentType || "").toLowerCase();
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) return true;
  if (
    isLikelyHtmlUrl(url) &&
    (contentType.includes("application/octet-stream") ||
      contentType.includes("binary/octet-stream") ||
      contentType.includes("text/plain"))
  ) {
    return true;
  }
  if (contentType) return false;
  return isLikelyHtmlUrl(url);
}

function isLikelyHtmlUrl(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return !/\.(txt|xml|json|csv|pdf|png|jpe?g|gif|webp|svg|ico|css|js|map|zip)$/i.test(pathname);
  } catch {
    return false;
  }
}

async function readTextLimited(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("HTML byte limit exceeded");
      break;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total > maxBytes ? maxBytes : total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk.slice(0, Math.max(0, merged.length - offset)), offset);
    offset += chunk.byteLength;
    if (offset >= merged.length) break;
  }
  return new TextDecoder().decode(merged);
}

function buildPageSummaries(pages, findings, startUrl) {
  return pages.map((page) => {
    const pageFindings = findings.filter(
      (finding) => finding.pageUrl === page.url && finding.severity !== "good"
    );
    const guards = findings.filter(
      (finding) => finding.pageUrl === page.url && finding.severity === "good"
    );
    const facts = page.rendered || {};
    const staticFacts = page.static || {};
    return {
      url: page.url,
      path: pathLabel(page.url, startUrl),
      status: page.status,
      finalUrl: facts.finalUrl || page.finalUrl || page.url,
      score: scoreFindings(pageFindings),
      critical: pageFindings.filter((finding) => finding.severity === "critical").length,
      warnings: pageFindings.filter((finding) => finding.severity === "warning").length,
      notices: pageFindings.filter((finding) => finding.severity === "notice").length,
      guards: guards.length,
      title: facts.title || "",
      h1: facts.h1s?.[0] || "",
      wordCount: facts.wordCount || 0,
      internalLinks: facts.internalLinks?.length || 0,
      schemaTypes: facts.schemaTypes || [],
      staticWordCount: staticFacts.wordCount || 0,
      staticH1: staticFacts.h1s?.[0] || "",
      staticInternalLinks: staticFacts.internalLinks?.length || 0
    };
  });
}

function summarize(findings, pages, maxPages = pages.length) {
  return {
    pagesScanned: pages.length,
    maxPages,
    crawlLimitHit: pages.length >= maxPages,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    notices: findings.filter((finding) => finding.severity === "notice").length,
    guardedFalsePositives: findings.filter((finding) => finding.severity === "good").length,
    totalFindings: findings.length
  };
}

function scoreFindings(findings) {
  let score = 100;
  for (const finding of findings) {
    if (finding.severity === "critical") score -= 12;
    if (finding.severity === "warning") score -= 5;
    if (finding.severity === "notice") score -= 1;
  }
  return Math.max(0, Math.min(100, score));
}

function headingHierarchyIssue(headings = []) {
  if (!headings.length) return "";
  const levels = headings.map((heading) => Number(String(heading.level).replace("h", "")));
  if (levels[0] !== 1) {
    return `First rendered heading is H${levels[0]} instead of H1.`;
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] - levels[index - 1] > 1) {
      return `Heading jumps from H${levels[index - 1]} to H${levels[index]}.`;
    }
  }
  return "";
}

function estimatedEffort(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("robots") || title.includes("sitemap")) return "15-30 min";
  if (title.includes("title") || title.includes("description") || title.includes("canonical")) return "5-15 min";
  if (title.includes("social") || title.includes("schema") || title.includes("viewport")) return "15-45 min";
  if (title.includes("thin") || title.includes("internal links") || title.includes("heading")) return "30-90 min";
  return "15-30 min";
}

function workType(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("title") || title.includes("description") || title.includes("thin") || title.includes("alt")) {
    return "content";
  }
  if (title.includes("schema") || title.includes("canonical") || title.includes("viewport") || title.includes("social")) {
    return "code";
  }
  if (title.includes("robots") || title.includes("sitemap") || title.includes("redirect")) {
    return "technical";
  }
  return "review";
}

function attr(html, name) {
  return html.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] || null;
}

function meta(head, key, value) {
  const match = head.match(
    new RegExp(`<meta\\b(?=[^>]*${key}=["']${escapeRegExp(value)}["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>`, "i")
  );
  return match?.[1] || null;
}

function linkRel(head, rel) {
  const match = head.match(
    new RegExp(`<link\\b(?=[^>]*rel=["'][^"']*${escapeRegExp(rel)}[^"']*["'])(?=[^>]*href=["']([^"']*)["'])[^>]*>`, "i")
  );
  return match?.[1] || null;
}

function absolute(value, base) {
  try {
    return value ? new URL(value, base).href : null;
  } catch {
    return value || null;
  }
}

function normalizeUrl(input) {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  return url.href;
}

function normalizeEmail(input) {
  const email = String(input || "").trim().toLowerCase();
  if (email.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function cleanInviteCode(input) {
  const code = String(input || "").trim();
  if (code.length < 8 || code.length > 120) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return "";
  return code;
}

function randomInviteCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clampPageLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(Math.round(parsed), 1), 10);
}

function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
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
    `SELECT token_hash, owner_email, invite_id, expires_at, revoked_at
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
    accessMode: row.invite_id ? "invite" : "founder-override",
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

async function auditQuotaStatus(request, env, access, targetUrl) {
  if (!env.WAITLIST_DB) {
    return { ok: false, error: "Report storage is not configured." };
  }

  const now = new Date();
  const hour = hourWindow(now);
  const day = dayWindow(now);
  const ipHash = await requestIpHash(request);
  const targetHost = new URL(targetUrl).hostname.toLowerCase();
  const sessionKey = access.sessionHash.slice(0, 24);
  const targetKey = targetHost.replace(/[^a-z0-9.-]/gi, "").slice(0, 120);

  return checkQuotaSet(env, [
    {
      bucket: `audit:ip:${hour.key}:${ipHash}`,
      limit: 12,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Audit limit reached for this network this hour. Try again later."
    },
    {
      bucket: `audit:session-hour:${hour.key}:${sessionKey}`,
      limit: 8,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Audit limit reached for this beta session this hour. Try again later."
    },
    {
      bucket: `audit:session-day:${day.key}:${sessionKey}`,
      limit: 30,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily beta audit limit reached. Try again tomorrow."
    },
    {
      bucket: `audit:target:${hour.key}:${targetKey}`,
      limit: 4,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "That site has been audited several times this hour. Try again later."
    }
  ]);
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
  await env.WAITLIST_DB.prepare(
    `UPDATE beta_invites
     SET used_count = used_count + 1,
      used_at = ?,
      last_used_ip_hash = ?,
      status = CASE WHEN used_count + 1 >= max_uses THEN 'used' ELSE status END
     WHERE id = ?`
  )
    .bind(now, ipHash, row.id)
    .run();

  return { ok: true, inviteId: row.id, accessMode: "invite" };
}

async function checkQuotaSet(env, checks) {
  const rows = await Promise.all(
    checks.map((check) =>
      env.WAITLIST_DB.prepare(`SELECT count FROM audit_usage WHERE bucket = ? LIMIT 1`)
        .bind(check.bucket)
        .first()
    )
  );

  for (let index = 0; index < checks.length; index += 1) {
    const count = Number(rows[index]?.count || 0);
    if (count >= checks[index].limit) {
      return {
        ok: false,
        error: checks[index].error,
        resetAt: checks[index].resetAt.toISOString()
      };
    }
  }

  const updatedAt = new Date().toISOString();
  await Promise.all(
    checks.map((check) =>
      env.WAITLIST_DB.prepare(
        `INSERT INTO audit_usage (bucket, count, window_start, updated_at)
         VALUES (?, 1, ?, ?)
         ON CONFLICT(bucket) DO UPDATE SET
          count = audit_usage.count + 1,
          updated_at = excluded.updated_at`
      )
        .bind(check.bucket, check.windowStart, updatedAt)
        .run()
    )
  );

  return { ok: true };
}

async function adminAccessStatus(request, env, action) {
  const ok = isAdminAuthorized(request, env);
  const actorEmail =
    cleanText(request.headers.get("cf-access-authenticated-user-email") || "", 254) ||
    "bearer-admin";
  if (!ok) {
    await logAdminAction(request, env, action, false, actorEmail);
    return { ok: false, actorEmail };
  }
  return { ok: true, actorEmail };
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

async function countRows(env, table, where = "", bindings = []) {
  const sql = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  const statement = env.WAITLIST_DB.prepare(sql);
  const row = bindings.length ? await statement.bind(...bindings).first() : await statement.first();
  return Number(row?.count || 0);
}

function summarizeIssuePatterns(rows) {
  const counts = new Map();
  for (const row of rows) {
    const report = parseJson(row.report_json, {});
    for (const finding of report.findings || []) {
      if (finding.severity === "good") continue;
      const key = issuePatternKey(finding.title || "Unknown issue");
      const current = counts.get(key) || {
        title: key,
        count: 0,
        critical: 0,
        warnings: 0,
        notices: 0
      };
      current.count += 1;
      if (finding.severity === "critical") current.critical += 1;
      if (finding.severity === "warning") current.warnings += 1;
      if (finding.severity === "notice") current.notices += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

function issuePatternKey(title) {
  return String(title || "Unknown issue")
    .replace(/\son\s(home|\/[^\s]+)/i, "")
    .replace(/\sneeds cleanup.*/i, " needs cleanup")
    .trim();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
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
      (token_hash, owner_email, created_at, expires_at, last_seen_at, ip_hash, user_agent, invite_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(tokenHash, access.ownerEmail, now, expiresAt, now, ipHash, userAgent, access.inviteId || null)
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

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("=") || "");
    }
  }
  return "";
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestIpHash(request) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return (await sha256Hex(ip)).slice(0, 32);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || ""))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hourWindow(now) {
  const resetAt = new Date(now);
  resetAt.setUTCMinutes(0, 0, 0);
  resetAt.setUTCHours(resetAt.getUTCHours() + 1);
  return {
    key: now.toISOString().slice(0, 13),
    resetAt
  };
}

function dayWindow(now) {
  const resetAt = new Date(now);
  resetAt.setUTCHours(0, 0, 0, 0);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);
  return {
    key: now.toISOString().slice(0, 10),
    resetAt
  };
}

function isoSecondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isoDaysFromNow(days) {
  return isoSecondsFromNow(days * 24 * 60 * 60);
}

async function cleanupExpiredRows(env) {
  const now = new Date().toISOString();
  await env.WAITLIST_DB.batch([
    env.WAITLIST_DB.prepare(`DELETE FROM audit_reports WHERE expires_at IS NOT NULL AND expires_at < ?`).bind(now),
    env.WAITLIST_DB.prepare(`DELETE FROM beta_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).bind(now, isoSecondsFromNow(-24 * 60 * 60)),
    env.WAITLIST_DB.prepare(`DELETE FROM audit_usage WHERE updated_at < ?`).bind(isoSecondsFromNow(-7 * 24 * 60 * 60))
  ]);
}

function publicAuditUrlStatus(value) {
  let parsed = null;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Enter a valid public website URL." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Only public http and https URLs can be audited." };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateHostname(host)
  ) {
    return { ok: false, error: "Use a public website URL, not a private or local address." };
  }

  return { ok: true };
}

function isPrivateHostname(host) {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  return host === "::1" || host.startsWith("[") || host.endsWith(".invalid");
}

function makePrivateReportId(url) {
  const host = new URL(url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42)
    .toLowerCase();
  return `${host || "report"}-${crypto.randomUUID()}`;
}

function isSafeReportId(value) {
  return /^[a-z0-9][a-z0-9.-]{12,120}$/i.test(value);
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ""));
  const rightBytes = new TextEncoder().encode(String(right || ""));
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return maxLength > 0 && diff === 0;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function stripHash(value) {
  const url = new URL(value);
  url.hash = "";
  return url.href.replace(/\/$/, url.pathname === "/" ? "/" : "");
}

function pathLabel(url, startUrl) {
  const parsed = new URL(url);
  if (stripHash(url) === stripHash(startUrl)) return "home";
  return parsed.pathname || "page";
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function suggestTitle(url, facts) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const firstH1 = facts.h1s?.[0];
  return trimSentence(firstH1 || `${host} page`, 58);
}

function suggestDescription(facts = {}) {
  const base =
    facts.bodySample ||
    facts.title ||
    "Clear page summary that explains the offer, audience, and next action.";
  return trimSentence(base.replace(/\s+/g, " "), 150);
}

function trimSentence(value, max) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}...`;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function jsonNoStore(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

function withPrivateHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderedFixture(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proof Demo App Shell</title>
    <meta name="description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
    <link rel="canonical" href="${origin}/fixture/rendered-page" />
  </head>
  <body>
    <div id="app">Loading app shell...</div>
    <script>
      document.getElementById("app").innerHTML = \`
        <main>
          <h1>Rendered SaaS page with real content</h1>
          <p>This demo intentionally ships a thin static shell, then renders the real page content with JavaScript. A weak static-only SEO audit would say the page has no H1, no internal links, and thin content. SEO Fix Kit should not make that mistake.</p>
          <p>Founders need verified findings, not busywork. The page includes enough rendered text to show that the final browser-visible page is materially different from the raw HTML response.</p>
          <p>Use this fixture to prove that the audit sees what users and modern rendering systems see after JavaScript runs. The report should guard false positives instead of telling the user to add duplicate headings or unnecessary internal links.</p>
          <p>The right output is evidence, confidence, and a practical fix only when a real fix is needed.</p>
          <nav>
            <a href="/fixture/rendered-page">Overview</a>
            <a href="/fixture/rendered-page?tab=pricing">Pricing</a>
            <a href="/fixture/rendered-page?tab=docs">Docs</a>
          </nav>
        </main>
      \`;
    </script>
  </body>
</html>`;
}

function llmsText(origin) {
  return `# SEO Fix Kit

SEO Fix Kit is currently locked for private beta.

Live product claims:
- The public homepage is a coming-soon waitlist.
- Visitors can submit an email address for private beta outreach.
- The public audit API is locked while private beta is prepared.

Current product boundary:
- Does not provide backlink databases.
- Does not provide keyword volume databases.
- Does not replace Ahrefs or Semrush.
- Does not currently provide public self-serve audits.

Useful routes:
- ${origin}/
- ${origin}/api/health
- ${origin}/llms.txt
- ${origin}/privacy
`;
}

function homeMarkdown(origin) {
  return `# SEO Fix Kit

Coming soon.

SEO Fix Kit is locked for private beta. Join the waitlist for evidence-backed SEO audits and developer repair briefs.

Start at ${origin}/.
`;
}

function privacyHtml(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy - SEO Fix Kit</title>
    <meta name="description" content="SEO Fix Kit waitlist privacy note." />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      body { margin: 0; min-width: 320px; }
      main { margin: 0 auto; max-width: 760px; padding: 48px 22px; }
      a { color: #98f0cc; font-weight: 760; text-decoration: none; }
      h1 { font-size: clamp(42px, 8vw, 76px); letter-spacing: 0; line-height: .92; margin: 0 0 24px; }
      p, li { color: rgba(251,248,239,.76); font-size: 18px; line-height: 1.62; }
      ul { padding-left: 22px; }
    </style>
  </head>
  <body>
    <main>
      <a href="${origin}/">SEO Fix Kit</a>
      <h1>Privacy</h1>
      <p>SEO Fix Kit collects the email address you submit on the waitlist so we can contact you about private beta access and product updates.</p>
      <ul>
        <li>We store your email address, signup source, UTM fields, landing path, referrer, browser user agent, country code when Cloudflare provides it, and signup timestamps.</li>
        <li>We do not sell the waitlist.</li>
        <li>We do not use the waitlist to send unrelated promotions.</li>
        <li>To be removed from outreach, reply to any email we send and ask to be removed.</li>
      </ul>
      <p>Last updated: May 20, 2026.</p>
    </main>
  </body>
</html>`;
}

function rootSitemap(origin) {
  const urls = ["/", "/llms.txt", "/privacy"];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((path) => `<url><loc>${origin}${path}</loc></url>`)
    .join("")}</urlset>`;
}
