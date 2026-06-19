import puppeteer from "@cloudflare/puppeteer";
import {
  buildWhiteLabelReportHtml,
  defaultBranding,
  normalizeBrandingInput,
  whiteLabelReportFilename
} from "../../shared/white-label-report.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { cookieValue, json, jsonNoStore, secureHeaders } from "../lib/http.js";
import { agencyWorkspaceAccessForOwner } from "../lib/offers.js";
import { ownerReportRow, reportJsonForRow } from "../lib/report-data.js";
import {
  checkQuotaSet,
  constantTimeEqual,
  hmacSha256Hex,
  requestIpHash,
  sha256Hex
} from "../lib/security.js";
import {
  cleanReportDomain,
  cleanText,
  hourWindow,
  isSafeUuid,
  isoDaysFromNow,
  normalizeDnsHost,
  normalizeDnsTxt,
  parseJson,
  randomHex,
  safeHostname,
  workerAppHost
} from "../lib/text.js";
import { reportIdFromSuffixPath } from "./reports.js";

const REPORT_SHARE_PASSWORD_MIN_LENGTH = 10;

const REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS = 120_000;

async function getReportBranding(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  return jsonNoStore({
    ok: true,
    branding: await reportBrandingForOwner(env, access.ownerEmail)
  });
}

async function saveReportBranding(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);

  const current = await reportBrandingForOwner(env, access.ownerEmail);
  const branding = normalizeBrandingInput(body, current);
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_branding
      (owner_email, agency_name, logo_url, brand_color, accent_color, custom_domain, footer_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_email) DO UPDATE SET
       agency_name = excluded.agency_name,
       logo_url = excluded.logo_url,
       brand_color = excluded.brand_color,
       accent_color = excluded.accent_color,
       custom_domain = excluded.custom_domain,
       footer_text = excluded.footer_text,
       updated_at = excluded.updated_at`
  )
    .bind(
      access.ownerEmail,
      branding.agencyName,
      branding.logoUrl || null,
      branding.brandColor,
      branding.accentColor,
      branding.customDomain || null,
      branding.footerText || null,
      now,
      now
    )
    .run();

  return jsonNoStore({ ok: true, branding });
}

async function listReportShares(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = decodeURIComponent(url.pathname.slice("/api/reports/".length, -"/shares".length));
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const shares = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_share_links
     WHERE report_id = ?
       AND owner_email = ?
       AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(reportId, access.ownerEmail)
    .all();
  const customDomain = await primaryVerifiedReportDomain(env, access.ownerEmail);
  const agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail, {
    clientLinks: (shares.results || []).length
  });
  return jsonNoStore({
    ok: true,
    shares: (shares.results || []).map((share) => reportShareResponse(share, url.origin, customDomain, env)),
    agencyWorkspace
  });
}

async function createReportShare(request, env) {
  const body = await request.json().catch(() => ({}));
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = decodeURIComponent(url.pathname.slice("/api/reports/".length, -"/share".length));
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM report_share_links
     WHERE report_id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(reportId, access.ownerEmail)
    .first();
  const agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail, {
    clientLinks: Number(count?.count || 0)
  });
  if (Number(count?.count || 0) >= agencyWorkspace.limits.clientLinksPerReport) {
    return jsonNoStore(
      {
        error: `This report already has ${agencyWorkspace.limits.clientLinksPerReport} active client links.`,
        code: "AGENCY_CLIENT_LINK_LIMIT",
        agencyWorkspace
      },
      429
    );
  }

  const report = parseJson(row.report_json, {});
  const now = new Date().toISOString();
  const password = String(body.password || "").trim();
  if (password && password.length < REPORT_SHARE_PASSWORD_MIN_LENGTH) {
    return jsonNoStore({ error: `Client report passwords must be at least ${REPORT_SHARE_PASSWORD_MIN_LENGTH} characters.` }, 400);
  }
  const expiresDays = Number(body.expiresDays || body.expires_days || 0);
  const share = {
    id: crypto.randomUUID(),
    report_id: reportId,
    owner_email: access.ownerEmail,
    client_name: cleanText(body.clientName || body.client_name || safeHostname(report.url || row.url || ""), 120),
    status: "active",
    password_hash: password ? await hashReportSharePassword(password) : "",
    password_hint: cleanText(body.passwordHint || body.password_hint || "", 120),
    expires_at: expiresDays > 0 ? isoDaysFromNow(Math.min(Math.max(expiresDays, 1), 180)) : "",
    created_at: now,
    updated_at: now,
    last_viewed_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_share_links
      (id, report_id, owner_email, client_name, status, password_hash, password_hint, expires_at, created_at, updated_at, last_viewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      share.id,
      share.report_id,
      share.owner_email,
      share.client_name || null,
      share.status,
      share.password_hash || null,
      share.password_hint || null,
      share.expires_at || null,
      share.created_at,
      share.updated_at,
      null
    )
    .run();

  const customDomain = await primaryVerifiedReportDomain(env, access.ownerEmail);
  return jsonNoStore({
    ok: true,
    share: reportShareResponse(share, url.origin, customDomain, env)
  });
}

async function getPrivateReportPdf(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  const url = new URL(request.url);
  const reportId = reportIdFromSuffixPath(url.pathname, "/client.pdf");
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const report = parseJson(row.report_json, {});
  const branding = await reportBrandingForOwner(env, access.ownerEmail);
  const share = {
    id: "",
    clientName: cleanText(url.searchParams.get("clientName") || safeHostname(report.url || row.url || ""), 120)
  };
  return renderWorkerWhiteLabelPdf(env, {
    report,
    branding,
    share,
    origin: url.origin
  });
}

async function revokeReportShare(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Client report storage is not configured." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/report-shares/".length));
  if (!isSafeUuid(id)) return json({ error: "Client link not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE report_share_links
     SET status = 'revoked', updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Client link not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getClientReportPdf(request, env) {
  if (!env.WAITLIST_DB) return json({ error: "Client reports are not configured." }, 503);
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname, ".pdf");
  if (!isSafeUuid(id)) return json({ error: "Report link not found or expired." }, 404);
  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return json({ error: domainCheck.error }, 404);
  if (!share) return json({ error: "Report link not found or expired." }, 404);
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json, expires_at
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  if (!reportRow?.report_json || (reportRow.expires_at && reportRow.expires_at <= new Date().toISOString())) {
    return json({ error: "Report no longer exists." }, 404);
  }
  if (share.password_hash && !(await clientReportUnlocked(request, env, share))) {
    return clientReportLockedResponse(request, branding, shareToCamel(share), 401);
  }
  const report = parseJson(await reportJsonForRow(env, reportRow), {});
  return renderWorkerWhiteLabelPdf(env, {
    report,
    branding,
    share: shareToCamel(share),
    origin: url.origin
  });
}

async function getClientReport(request, env) {
  if (!env.WAITLIST_DB) return clientReportLockedResponse(request, defaultBranding(), { id: "" }, 503, "Client reports are not configured.");
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname);
  if (!isSafeUuid(id)) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, "Report link not found or expired.");

  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, domainCheck.error);
  if (!share) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, "Report link not found or expired.");
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json, expires_at
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  if (!reportRow?.report_json || (reportRow.expires_at && reportRow.expires_at <= new Date().toISOString())) {
    return clientReportLockedResponse(request, branding, shareToCamel(share), 404, "Report no longer exists.");
  }
  const report = parseJson(await reportJsonForRow(env, reportRow), {});

  if (share.password_hash && !(await clientReportUnlocked(request, env, share))) {
    return clientReportLockedResponse(request, branding, shareToCamel(share), 401);
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE report_share_links
     SET last_viewed_at = ?, updated_at = updated_at
     WHERE id = ?`
  )
    .bind(new Date().toISOString(), share.id)
    .run();

  return new Response(
    buildWhiteLabelReportHtml({
      report,
      branding,
      share: shareToCamel(share),
      origin: url.origin
    }),
    {
      headers: secureHeaders({
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      })
    }
  );
}

async function unlockClientReport(request, env) {
  if (!env.WAITLIST_DB) return clientReportLockedResponse(request, defaultBranding(), { id: "" }, 503, "Client reports are not configured.");
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname, "/unlock");
  if (!isSafeUuid(id)) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, "Report link not found or expired.");
  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, domainCheck.error);
  if (!share) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, "Report link not found or expired.");
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const password = await passwordFromRequest(request);
  const quota = await clientReportUnlockQuotaStatus(request, env, share);
  if (!quota.ok) return clientReportLockedResponse(request, branding, shareToCamel(share), 429, quota.error);
  if (!share.password_hash || await verifyReportSharePassword(password, share.password_hash)) {
    return new Response("", {
      status: 303,
      headers: secureHeaders({
        "cache-control": "no-store",
        "location": `/r/${encodeURIComponent(share.id)}`,
        "set-cookie": await clientReportCookie(request, env, share)
      })
    });
  }
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  const report = parseJson(reportRow ? await reportJsonForRow(env, reportRow) : "", {});
  return clientReportLockedResponse(request, branding, shareToCamel(share), 401, "Password did not match.", report);
}

async function reportBrandingForOwner(env, ownerEmail) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_branding
     WHERE owner_email = ?
     LIMIT 1`
  )
    .bind(ownerEmail)
    .first();
  return normalizeBrandingInput(reportBrandingFromRow(row), defaultBranding(ownerEmail));
}

async function listReportDomains(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Report domain storage is not configured." }, 503);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE owner_email = ?
       AND revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 20`
  )
    .bind(access.ownerEmail)
    .all();
  return jsonNoStore({
    ok: true,
    domains: (rows.results || []).map((row) => reportDomainResponse(row, env))
  });
}

async function createReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Report domain storage is not configured." }, 503);
  if (!reportDomainsEnabled(env)) return jsonNoStore({ error: "Report custom domains are not configured yet." }, 503);
  const body = await request.json().catch(() => ({}));
  const domainName = cleanReportDomain(body.domain || body.customDomain || "");
  if (!domainName) return jsonNoStore({ error: "Enter a valid report subdomain, like reports.example.com." }, 400);
  if (workerAppHost(domainName, env)) {
    return jsonNoStore({ error: "Use a customer-controlled report subdomain, not an app-owned hostname." }, 400);
  }

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE domain = ?
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(domainName)
    .first();
  if (existing?.id && existing.owner_email !== access.ownerEmail) {
    return jsonNoStore({ error: "That report domain is already connected to another workspace." }, 409);
  }
  if (existing?.id) return jsonNoStore({ ok: true, domain: reportDomainResponse(existing, env) });

  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM report_domains
     WHERE owner_email = ?
       AND revoked_at IS NULL`
  )
    .bind(access.ownerEmail)
    .first();
  const activeDomains = Number(count?.count || 0);
  const agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail, { reportDomains: activeDomains });
  if (activeDomains >= agencyWorkspace.limits.reportDomains) {
    return jsonNoStore(
      {
        error: `This workspace already has ${agencyWorkspace.limits.reportDomains} active report domain.`,
        code: "AGENCY_REPORT_DOMAIN_LIMIT",
        agencyWorkspace
      },
      429
    );
  }

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    domain: domainName,
    verification_token: `sfk-report-domain=${randomHex(24)}`,
    status: "pending",
    created_at: now,
    updated_at: now,
    verified_at: "",
    last_checked_at: "",
    last_error: "",
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_domains
      (id, owner_email, domain, verification_token, status, created_at, updated_at, verified_at, last_checked_at, last_error, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(row.id, row.owner_email, row.domain, row.verification_token, row.status, row.created_at, row.updated_at, null, null, null, null)
    .run();
  return jsonNoStore({ ok: true, domain: reportDomainResponse(row, env) }, 201);
}

async function verifyReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Report domain storage is not configured." }, 503);
  if (!reportDomainsEnabled(env)) return jsonNoStore({ error: "Report custom domains are not configured yet." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/report-domains/".length, -"/verify".length));
  if (!isSafeUuid(id)) return json({ error: "Report domain not found." }, 404);
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE id = ?
       AND owner_email = ?
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return json({ error: "Report domain not found." }, 404);
  if (workerAppHost(row.domain, env)) {
    return jsonNoStore({ error: "Use a customer-controlled report subdomain, not an app-owned hostname." }, 400);
  }

  const result = await verifyReportDomainChallenge(row, env);
  const now = new Date().toISOString();
  if (!result.ok) {
    await env.WAITLIST_DB.prepare(
      `UPDATE report_domains
       SET last_checked_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(now, result.error, now, id)
      .run();
    return jsonNoStore({
      ok: false,
      error: result.error,
      domain: reportDomainResponse({ ...row, last_checked_at: now, last_error: result.error, updated_at: now }, env)
    }, 400);
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE report_domains
     SET status = 'verified', verified_at = COALESCE(verified_at, ?), last_checked_at = ?, last_error = NULL, updated_at = ?
     WHERE id = ?`
  )
    .bind(now, now, now, id)
    .run();
  return jsonNoStore({
    ok: true,
    verified: true,
    domain: reportDomainResponse({ ...row, status: "verified", verified_at: row.verified_at || now, last_checked_at: now, last_error: "", updated_at: now }, env)
  });
}

async function revokeReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Report domain storage is not configured." }, 503);
  const id = decodeURIComponent(new URL(request.url).pathname.slice("/api/report-domains/".length));
  if (!isSafeUuid(id)) return json({ error: "Report domain not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE report_domains
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND revoked_at IS NULL`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Report domain not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getReportDomainChallenge(request, env) {
  if (!env.WAITLIST_DB) return new Response("Report domain storage is not configured.", { status: 503 });
  const domain = await reportDomainForHost(env, new URL(request.url).host);
  if (!domain?.id) {
    return new Response("Report domain challenge not found.", {
      status: 404,
      headers: secureHeaders({ "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" })
    });
  }
  return new Response(domain.verification_token || "", {
    headers: secureHeaders({ "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" })
  });
}

function reportDomainResponse(row = {}, env = {}) {
  const dnsName = reportDomainDnsName(row.domain || "");
  const cnameTarget = cleanReportDomain(env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || "") || "";
  return {
    id: row.id || "",
    domain: row.domain || "",
    status: row.status || "pending",
    verificationToken: row.verification_token || "",
    verificationMethod: "dns_txt",
    verificationPath: "",
    verificationUrl: "",
    dnsName,
    dnsType: "TXT",
    dnsValue: row.verification_token || "",
    cnameTarget,
    shareOrigin: row.status === "verified" && row.domain ? `https://${row.domain}` : "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    verifiedAt: row.verified_at || "",
    lastCheckedAt: row.last_checked_at || "",
    lastError: row.last_error || ""
  };
}

function reportDomainsEnabled(env = {}) {
  return Boolean(cleanReportDomain(env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || ""));
}

async function verifyReportDomainChallenge(row = {}, env = {}) {
  const ownership = await verifyReportDomainTxt(row.domain || "", row.verification_token || "");
  if (!ownership.ok) return ownership;
  return verifyReportDomainCname(row.domain || "", env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || "");
}

async function verifyReportDomainTxt(domain = "", token = "") {
  const expected = token || "";
  const dnsName = reportDomainDnsName(domain);
  if (!expected || !dnsName) return { ok: false, error: "Report domain verification is not configured." };
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

async function verifyReportDomainCname(domain = "", cnameTarget = "") {
  const domainName = cleanReportDomain(domain);
  const expected = cleanReportDomain(cnameTarget);
  if (!domainName || !expected) return { ok: false, error: "Report domain routing is not configured." };
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domainName)}&type=CNAME`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!response.ok) return { ok: false, error: "CNAME verification lookup failed." };
    const payload = await response.json().catch(() => ({}));
    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    const matched = answers.some((answer) => normalizeDnsHost(answer.data) === expected);
    return matched ? { ok: true } : { ok: false, error: "CNAME target was not found yet." };
  } catch {
    return { ok: false, error: "CNAME verification lookup failed." };
  }
}

function reportDomainDnsName(domain = "") {
  const clean = cleanReportDomain(domain);
  return clean ? `_seofixkit-report-domain.${clean}` : "";
}

async function reportDomainForHost(env, hostValue, { verifiedOnly = false } = {}) {
  const host = cleanReportDomain(hostValue);
  if (!host) return null;
  const statusClause = verifiedOnly ? "status = 'verified'" : "status IN ('pending', 'verified')";
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE domain = ?
       AND ${statusClause}
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(host)
    .first();
  return row?.id ? row : null;
}

async function primaryVerifiedReportDomain(env, ownerEmail) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE owner_email = ?
       AND status = 'verified'
       AND revoked_at IS NULL
     ORDER BY verified_at DESC, updated_at DESC
     LIMIT 1`
  )
    .bind(ownerEmail)
    .first();
  return row?.id ? row : null;
}

async function clientReportHostAccess(env, request, share) {
  const host = cleanReportDomain(new URL(request.url).host);
  if (!host || workerAppHost(host, env)) return { ok: true };
  const domain = await reportDomainForHost(env, host, { verifiedOnly: true });
  if (!domain) return { ok: false, error: "Report domain not verified." };
  if (share && domain.owner_email !== share.owner_email) return { ok: false, error: "Report link not found on this domain." };
  return { ok: true, domain };
}

function reportBrandingFromRow(row = {}) {
  return {
    agencyName: row?.agency_name || "",
    logoUrl: row?.logo_url || "",
    brandColor: row?.brand_color || "",
    accentColor: row?.accent_color || "",
    customDomain: row?.custom_domain || "",
    footerText: row?.footer_text || ""
  };
}

function reportShareResponse(row = {}, origin = "", customDomain = null, env = {}) {
  const shareOrigin = customDomain?.domain ? `https://${customDomain.domain}` : origin;
  return {
    id: row.id || "",
    reportId: row.report_id || "",
    clientName: row.client_name || "",
    status: row.status || "active",
    passwordProtected: Boolean(row.password_hash),
    passwordHint: row.password_hint || "",
    sharePath: row.id ? `/r/${row.id}` : "",
    shareUrl: row.id ? `${shareOrigin}/r/${row.id}` : "",
    pdfPath: row.id ? `/r/${row.id}.pdf` : "",
    pdfUrl: row.id ? `${shareOrigin}/r/${row.id}.pdf` : "",
    customDomain: customDomain ? reportDomainResponse(customDomain, env) : null,
    expiresAt: row.expires_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastViewedAt: row.last_viewed_at || ""
  };
}

function shareToCamel(row = {}) {
  return {
    id: row.id || "",
    reportId: row.report_id || "",
    ownerEmail: row.owner_email || "",
    clientName: row.client_name || "",
    status: row.status || "active",
    passwordHint: row.password_hint || "",
    expiresAt: row.expires_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastViewedAt: row.last_viewed_at || ""
  };
}

async function activeReportShare(env, id) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_share_links
     WHERE id = ?
     LIMIT 1`
  )
    .bind(id)
    .first();
  if (!row?.id || row.status !== "active") return null;
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    await env.WAITLIST_DB.prepare(
      `UPDATE report_share_links SET status = 'expired', updated_at = ? WHERE id = ?`
    )
      .bind(new Date().toISOString(), row.id)
      .run();
    return null;
  }
  return row;
}

function clientReportShareId(pathname, suffix = "") {
  const relative = pathname.slice("/r/".length);
  const id = suffix && relative.endsWith(suffix) ? relative.slice(0, -suffix.length) : relative;
  return decodeURIComponent(id || "");
}

function clientReportLockedResponse(request, branding, share, status = 401, error = "", report = {}) {
  const url = new URL(request.url);
  return new Response(
    buildWhiteLabelReportHtml({
      report,
      branding,
      share,
      origin: url.origin,
      locked: true,
      error
    }),
    {
      status,
      headers: secureHeaders({
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      })
    }
  );
}

async function renderWorkerWhiteLabelPdf(env, { report, branding, share, origin }) {
  if (!env.BROWSER) {
    return jsonNoStore({ error: "PDF export requires the Browser Run binding." }, 503);
  }
  const html = buildWhiteLabelReportHtml({ report, branding, share, origin });
  let browser = null;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "24px",
        right: "24px",
        bottom: "28px",
        left: "24px"
      }
    });
    const headers = secureHeaders();
    headers.set("cache-control", "no-store");
    headers.set("content-disposition", `attachment; filename="${whiteLabelReportFilename({ report, branding, share })}"`);
    headers.set("content-type", "application/pdf");
    headers.set("x-robots-tag", "noindex, nofollow");
    return new Response(pdf, { headers });
  } catch (error) {
    return jsonNoStore({ error: error?.message || "PDF export failed." }, 500);
  } finally {
    await browser?.close?.().catch(() => {});
  }
}

function clientReportCookieName(share) {
  return `sfk_report_${String(share.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 36)}`;
}

async function clientReportCookieValue(env, share) {
  // HMAC with a server secret so the unlock cookie cannot be minted offline
  // from share id + stored password hash alone.
  const secret = String(env.SEOFIXKIT_COOKIE_SECRET || "");
  if (!secret) {
    throw new Error("Report cookie signing is not configured. Set the SEOFIXKIT_COOKIE_SECRET secret.");
  }
  return hmacSha256Hex(secret, `${share.id}:${share.password_hash || ""}:client-report`);
}

async function clientReportCookie(request, env, share) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${clientReportCookieName(share)}=${encodeURIComponent(await clientReportCookieValue(env, share))}; Path=/r; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

async function clientReportUnlocked(request, env, share) {
  const value = cookieValue(request, clientReportCookieName(share));
  return Boolean(value) && constantTimeEqual(value, await clientReportCookieValue(env, share));
}

async function passwordFromRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return String(body.password || "");
  }
  if (contentType.includes("form")) {
    const form = await request.formData().catch(() => null);
    return String(form?.get("password") || "");
  }
  const text = await request.text().catch(() => "");
  return String(new URLSearchParams(text).get("password") || "");
}

async function clientReportUnlockQuotaStatus(request, env, share = {}) {
  if (!env.WAITLIST_DB) return { ok: true };
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  const shareKey = String(share.id || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  return checkQuotaSet(env, [
    {
      bucket: `client-report-unlock:ip:${hour.key}:${shareKey}:${ipHash}`,
      limit: 10,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many password attempts for this report link. Try again later."
    },
    {
      bucket: `client-report-unlock:share:${hour.key}:${shareKey}`,
      limit: 50,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many password attempts for this report link. Try again later."
    }
  ]);
}

async function hashReportSharePassword(password = "") {
  const salt = randomHex(16);
  const hash = await deriveReportSharePasswordHash(password, salt, REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

async function verifyReportSharePassword(password = "", storedHash = "") {
  const stored = String(storedHash || "");
  if (stored.startsWith("pbkdf2$")) {
    const [, algorithm, iterations, salt, expected] = stored.split("$");
    const iterationCount = Number(iterations || 0);
    if (algorithm !== "sha256" || !iterationCount || !salt || !expected) return false;
    const actual = await deriveReportSharePasswordHash(password, salt, iterationCount);
    return constantTimeEqual(actual, expected);
  }
  return constantTimeEqual(await sha256Hex(password), stored);
}

async function deriveReportSharePasswordHash(password = "", saltHex = "", iterations = REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function hexToBytes(hex = "") {
  const clean = String(hex || "").replace(/[^a-f0-9]/gi, "");
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes = new Uint8Array()) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export {
  REPORT_SHARE_PASSWORD_MIN_LENGTH,
  REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS,
  activeReportShare,
  bytesToHex,
  clientReportCookie,
  clientReportCookieName,
  clientReportCookieValue,
  clientReportHostAccess,
  clientReportLockedResponse,
  clientReportShareId,
  clientReportUnlockQuotaStatus,
  clientReportUnlocked,
  createReportDomain,
  createReportShare,
  deriveReportSharePasswordHash,
  getClientReport,
  getClientReportPdf,
  getPrivateReportPdf,
  getReportBranding,
  getReportDomainChallenge,
  hashReportSharePassword,
  hexToBytes,
  listReportDomains,
  listReportShares,
  passwordFromRequest,
  primaryVerifiedReportDomain,
  renderWorkerWhiteLabelPdf,
  reportBrandingForOwner,
  reportBrandingFromRow,
  reportDomainDnsName,
  reportDomainForHost,
  reportDomainResponse,
  reportDomainsEnabled,
  reportShareResponse,
  revokeReportDomain,
  revokeReportShare,
  saveReportBranding,
  shareToCamel,
  unlockClientReport,
  verifyReportDomain,
  verifyReportDomainChallenge,
  verifyReportDomainCname,
  verifyReportDomainTxt,
  verifyReportSharePassword
};
