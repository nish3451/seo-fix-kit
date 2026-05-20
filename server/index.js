import express from "express";
import cors from "cors";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { auditUrl } from "./audit/analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();
const port = Number(process.env.PORT || 8787);
const auditReports = new Map();
const betaSessions = new Map();
const fixRequests = [];
const VERSION = "0.8.0";
const SESSION_COOKIE = "sfk_beta_session";
const BETA_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const REPORT_RETENTION_DAYS = 30;
const FIX_PACK_OFFER = {
  name: "SEO Fix Pack",
  priceLabel: "$99 beta",
  productKey: "seofixkit_fix_pack",
  description: "One proof-backed repair pass for this report plus one rerun after fixes."
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "seo-fix-kit", version: VERSION });
});

app.post("/api/waitlist", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (req.body?.company) {
    res.json({ ok: true, status: "joined" });
    return;
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  res.json({ ok: true, status: "joined", mode: "local-dev" });
});

app.post("/api/beta/login", (req, res) => {
  const ownerEmail = normalizeEmail(req.body?.email || req.body?.ownerEmail);
  if (!ownerEmail) {
    res.status(400).json({ error: "Enter your beta email address." });
    return;
  }

  if (!isBetaPasswordValid(req.body?.inviteCode || req.body?.password)) {
    res.status(401).json({ error: "Private beta invite code required." });
    return;
  }

  const session = createLocalSession(req, ownerEmail);
  res
    .set("cache-control", "no-store")
    .set("set-cookie", sessionCookie(req, session.token, BETA_SESSION_TTL_SECONDS))
    .json({ ok: true, status: "unlocked", ownerEmail, expiresAt: session.expiresAt });
});

app.post("/api/beta/fix-request", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(String(req.body?.reportId || ""));
  if (!report || report.owner?.email !== access.ownerEmail) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  const request = {
    id: randomUUID(),
    reportId: report.id,
    ownerEmail: access.ownerEmail,
    targetUrl: report.url,
    targetHost: new URL(report.url).hostname,
    status: process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL ? "checkout_created" : "new",
    offer: FIX_PACK_OFFER,
    customerNote: "",
    adminNote: "",
    assignedTo: "",
    deliveryUrl: "",
    finalReportId: "",
    createdAt: new Date().toISOString()
  };
  fixRequests.push(request);
  if (process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL) {
    res.set("cache-control", "no-store").json({
      ok: true,
      mode: "checkout",
      checkoutUrl: process.env.DODO_SEOFIXKIT_MOCK_CHECKOUT_URL,
      request,
      offer: FIX_PACK_OFFER
    });
    return;
  }
  res.set("cache-control", "no-store").json({
    ok: true,
    mode: "request",
    checkoutAvailable: false,
    message: "Fix request saved. Dodo checkout is only created by the Cloudflare Worker.",
    request,
    offer: FIX_PACK_OFFER
  });
});

app.get("/api/beta/session", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res
      .status(401)
      .set("cache-control", "no-store")
      .set("set-cookie", clearSessionCookie(req))
      .json({ error: "Private beta session required." });
    return;
  }
  res.set("cache-control", "no-store").json({
    ok: true,
    status: "active",
    ownerEmail: access.ownerEmail,
    expiresAt: access.expiresAt
  });
});

app.post("/api/beta/logout", (req, res) => {
  const token = betaSessionTokenFromRequest(req);
  if (token) betaSessions.delete(sha256Hex(token));
  res
    .set("cache-control", "no-store")
    .set("set-cookie", clearSessionCookie(req))
    .json({ ok: true, status: "locked" });
});

app.get("/admin/leads.csv", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = bearer;

  if (!expected || token !== expected) {
    res.status(401).type("text").send("Unauthorized");
    return;
  }

  res
    .set({
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="seofixkit-waitlist-local.csv"'
    })
    .type("text/csv")
    .send("email,source,utm_source,utm_medium,utm_campaign,landing_path,created_at,updated_at\n");
});

app.get("/admin/summary", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "local-admin";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const reports = [...auditReports.values()].sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt)));
  res.set("cache-control", "no-store").json({
    ok: true,
    metrics: {
      waitlist: 0,
      invites: 1,
      activeSessions: betaSessions.size,
      audits: reports.length,
      auditsToday: reports.length,
      reportsExpiringSoon: reports.filter((report) => report.retention?.expiresAt).length,
      fixRequests: fixRequests.length,
      fixRequestStatuses: countFixRequestStatuses(fixRequests),
      emailNotificationsConfigured: false
    },
    offer: FIX_PACK_OFFER,
    recentAudits: reports.slice(0, 20).map((report) => ({
      id: report.id,
      url: report.url,
      targetHost: new URL(report.url).hostname,
      ownerEmail: report.owner?.email || "",
      score: report.score,
      pagesScanned: report.summary?.pagesScanned || 0,
      totalFindings: report.summary?.totalFindings || 0,
      guardedFalsePositives: report.summary?.guardedFalsePositives || 0,
      reportPath: report.reportPath,
      createdAt: report.scannedAt,
      expiresAt: report.retention?.expiresAt
    })),
    issuePatterns: summarizeIssuePatterns(reports),
    fixQueue: fixRequests.slice().reverse().map(localFixRequestAdminResponse),
    invites: [
      {
        id: "local-founder",
        ownerEmail: "local@example.com",
        label: "Local founder override",
        status: "active",
        maxUses: 999,
        usedCount: betaSessions.size,
        createdAt: new Date().toISOString(),
        expiresAt: null
      }
    ]
  });
});

app.patch("/admin/fix-requests/:id", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "local-admin";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const request = fixRequests.find((item) => item.id === req.params.id);
  if (!request) {
    res.status(404).json({ error: "Fix request not found." });
    return;
  }
  const status = String(req.body?.status || request.status || "new");
  if (!["checkout_created", "paid", "in_progress", "delivered"].includes(status)) {
    res.status(400).json({ error: "Choose a valid fulfillment status." });
    return;
  }
  request.status = status;
  request.assignedTo = cleanText(req.body?.assignedTo || "", 160);
  request.adminNote = cleanText(req.body?.adminNote || "", 2000);
  request.customerNote = cleanText(req.body?.customerNote || "", 2000);
  request.deliveryUrl = cleanUrlText(req.body?.deliveryUrl || "", 600);
  request.finalReportId = cleanText(req.body?.finalReportId || "", 180);
  request.inProgressAt = status === "in_progress" && !request.inProgressAt ? new Date().toISOString() : request.inProgressAt;
  request.deliveredAt = status === "delivered" && !request.deliveredAt ? new Date().toISOString() : request.deliveredAt;
  request.updatedAt = new Date().toISOString();
  res.set("cache-control", "no-store").json({ ok: true, request: localFixRequestAdminResponse(request) });
});

app.post("/admin/invites", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "local-admin";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ownerEmail = normalizeEmail(req.body?.email);
  if (!ownerEmail) {
    res.status(400).json({ error: "Enter a valid invite email." });
    return;
  }
  const code = randomBytes(12).toString("hex");
  res.set("cache-control", "no-store").json({
    ok: true,
    invite: {
      id: randomUUID(),
      ownerEmail,
      code,
      label: req.body?.label || "Local invite",
      maxUses: Number(req.body?.maxUses || 1),
      usedCount: 0,
      expiresAt: isoDaysFromNow(14),
      url: `http://127.0.0.1:${port}/beta?email=${encodeURIComponent(ownerEmail)}&invite=${code}`
    }
  });
});

app.get("/api/demo-audit", async (req, res) => {
  try {
    const access = localBetaAccess(req);
    if (!access.ok) {
      res.status(401).json({ error: "Private beta session required." });
      return;
    }
    const report = await auditUrl(`http://127.0.0.1:${port}/fixture/rendered-page`, {
      maxPages: 1
    });
    res.set("cache-control", "no-store").json(saveLocalReport(report, req, access));
  } catch (error) {
    res.status(500).json({
      error: error.message || "The demo audit failed."
    });
  }
});

app.post("/api/audit", async (req, res) => {
  try {
    const access = localBetaAccess(req);
    if (!access.ok) {
      res.status(401).json({ error: "Private beta session required." });
      return;
    }
    const { url, maxPages } = req.body || {};
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Enter a website URL to audit." });
      return;
    }
    let normalized = "";
    try {
      normalized = normalizeUrl(url);
    } catch {
      res.status(400).json({ error: "Enter a valid public website URL." });
      return;
    }
    const urlCheck = publicAuditUrlStatus(normalized);
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }

    const report = await auditUrl(normalized, {
      maxPages: Math.min(Math.max(Number(maxPages || 10), 1), 10)
    });
    res.set("cache-control", "no-store").json(saveLocalReport(report, req, access));
  } catch (error) {
    res.status(500).json({
      error: error.message || "The audit failed. Try another URL."
    });
  }
});

app.get("/api/reports/:id/brief.md", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).type("text").send("Private beta session required.");
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || (report.owner?.email && report.owner.email !== access.ownerEmail)) {
    res.status(404).type("text").send("Report not found.");
    return;
  }
  res
    .set({
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="seofixkit-${req.params.id}.md"`,
      "x-robots-tag": "noindex, nofollow"
    })
    .type("text/markdown")
    .send(report.repairBrief || "# SEO Fix Kit repair brief\n");
});

app.get("/api/reports/:id", (req, res) => {
  const access = localBetaAccess(req);
  if (!access.ok) {
    res.status(401).json({ error: "Private beta session required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report || (report.owner?.email && report.owner.email !== access.ownerEmail)) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  const fixRequest = fixRequests.find((request) => request.reportId === report.id && request.ownerEmail === access.ownerEmail);
  if (fixRequest) report.fixRequest = localFixRequestResponse(fixRequest);
  res
    .set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" })
    .json(report);
});

app.get("/fixture/rendered-page", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proof Demo App Shell</title>
    <meta name="description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
    <link rel="canonical" href="/fixture/rendered-page" />
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
</html>`);
});

app.get("/fixture/robots.txt", (req, res) => {
  res.type("text").send("User-agent: *\nAllow: /\n\nSitemap: /fixture/sitemap.xml\n");
});

app.get("/fixture/sitemap.xml", (req, res) => {
  res.type("xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://127.0.0.1:${port}/fixture/rendered-page</loc></url>
</urlset>`);
});

app.get(/^\/beta(\/.*)?$/, (req, res) => {
  res.set({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" });
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.use(express.static(path.join(rootDir, "dist")));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`SEO Fix Kit server running at http://127.0.0.1:${port}`);
});

function isBetaPasswordValid(bodyPassword = "") {
  const expected = process.env.BETA_ACCESS_PASSWORD || "local-beta";
  const supplied = String(bodyPassword || "");
  return constantTimeEqual(supplied, expected);
}

function localBetaAccess(req) {
  const token = betaSessionTokenFromRequest(req);
  if (!token) return { ok: false };

  const sessionHash = sha256Hex(token);
  const session = betaSessions.get(sessionHash);
  if (!session || session.expiresAt <= new Date().toISOString()) {
    betaSessions.delete(sessionHash);
    return { ok: false };
  }

  session.lastSeenAt = new Date().toISOString();
  return {
    ok: true,
    ownerEmail: session.ownerEmail,
    sessionHash,
    expiresAt: session.expiresAt
  };
}

function createLocalSession(req, ownerEmail) {
  const token = randomBytes(32).toString("hex");
  const sessionHash = sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = isoSecondsFromNow(BETA_SESSION_TTL_SECONDS);
  betaSessions.set(sessionHash, {
    ownerEmail,
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
    userAgent: cleanText(req.get("user-agent") || "", 500)
  });
  return { token, expiresAt };
}

function betaSessionTokenFromRequest(req) {
  return req.get("x-beta-session") || cookieValue(req, SESSION_COOKIE);
}

function sessionCookie(req, token, maxAge) {
  const secure = req.protocol === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(req) {
  const secure = req?.protocol === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function cookieValue(req, name) {
  const cookie = req.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("=") || "");
  }
  return "";
}

function saveLocalReport(report, req, access) {
  const id = makePrivateReportId(report.url);
  const origin = `http://${req.get("host")}`;
  const expiresAt = isoDaysFromNow(REPORT_RETENTION_DAYS);
  const saved = {
    ...report,
    id,
    reportPath: `/beta/reports/${id}`,
    reportUrl: `${origin}/beta/reports/${id}`,
    owner: {
      email: access.ownerEmail
    },
    retention: {
      expiresAt,
      days: REPORT_RETENTION_DAYS
    }
  };
  auditReports.set(id, saved);
  return saved;
}

function summarizeIssuePatterns(reports) {
  const counts = new Map();
  for (const report of reports) {
    for (const finding of report.findings || []) {
      if (finding.severity === "good") continue;
      const title = String(finding.title || "Unknown issue").replace(/\son\s(home|\/[^\s]+)/i, "").trim();
      const current = counts.get(title) || { title, count: 0, critical: 0, warnings: 0, notices: 0 };
      current.count += 1;
      if (finding.severity === "critical") current.critical += 1;
      if (finding.severity === "warning") current.warnings += 1;
      if (finding.severity === "notice") current.notices += 1;
      counts.set(title, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

function localFixRequestResponse(request) {
  return {
    id: request.id,
    status: request.status || "new",
    statusLabel: localFixRequestStatusLabel(request.status),
    targetUrl: request.targetUrl,
    targetHost: request.targetHost || safeHost(request.targetUrl),
    score: request.score,
    issueCount: request.issueCount,
    customerNote: request.customerNote || "",
    deliveryUrl: request.deliveryUrl || "",
    finalReportId: request.finalReportId || "",
    finalReportPath: request.finalReportId ? `/beta/reports/${request.finalReportId}` : "",
    inProgressAt: request.inProgressAt || "",
    deliveredAt: request.deliveredAt || "",
    paidAt: request.paidAt || "",
    createdAt: request.createdAt,
    updatedAt: request.updatedAt || request.createdAt
  };
}

function localFixRequestAdminResponse(request) {
  return {
    ...localFixRequestResponse(request),
    reportId: request.reportId,
    ownerEmail: request.ownerEmail,
    assignedTo: request.assignedTo || "",
    adminNote: request.adminNote || "",
    reportPath: `/beta/reports/${request.reportId}`,
    briefPath: `/api/reports/${request.reportId}/brief.md`,
    notifications: []
  };
}

function countFixRequestStatuses(requests) {
  return requests.reduce((counts, request) => {
    counts[request.status || "new"] = (counts[request.status || "new"] || 0) + 1;
    return counts;
  }, {});
}

function localFixRequestStatusLabel(status) {
  const labels = {
    new: "Request saved",
    checkout_created: "Checkout opened",
    paid: "Payment confirmed",
    in_progress: "Repair in progress",
    delivered: "Delivered",
    payment_failed: "Payment failed"
  };
  return labels[status] || labels.new;
}

function safeHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function makePrivateReportId(url) {
  const host = new URL(url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42)
    .toLowerCase();
  return `${host || "report"}-${randomUUID()}`;
}

function normalizeUrl(input) {
  const trimmed = String(input || "").trim();
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

function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanUrlText(input, maxLength) {
  const value = cleanText(input, maxLength);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href.slice(0, maxLength);
  } catch {
    return "";
  }
}

function isoSecondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isoDaysFromNow(days) {
  return isoSecondsFromNow(days * 24 * 60 * 60);
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
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

function constantTimeEqual(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  const maxLength = Math.max(leftText.length, rightText.length);
  let diff = leftText.length ^ rightText.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }

  return maxLength > 0 && diff === 0;
}
