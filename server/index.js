import express from "express";
import cors from "cors";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { auditUrl } from "./audit/analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();
const port = Number(process.env.PORT || 8787);
const auditReports = new Map();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "seo-fix-kit", version: "0.3.0" });
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
  if (!isBetaAuthorized(req, req.body?.password)) {
    res.status(401).json({ error: "Private beta password required." });
    return;
  }
  res.set("cache-control", "no-store").json({ ok: true, status: "unlocked" });
});

app.get("/admin/leads.csv", (req, res) => {
  const expected = process.env.ADMIN_EXPORT_TOKEN || "";
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = bearer || req.query.token || "";

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

app.get("/api/demo-audit", async (req, res) => {
  try {
    if (!isBetaAuthorized(req)) {
      res.status(401).json({ error: "Private beta password required." });
      return;
    }
    const report = await auditUrl(`http://127.0.0.1:${port}/fixture/rendered-page`, {
      maxPages: 1
    });
    res.set("cache-control", "no-store").json(saveLocalReport(report, req));
  } catch (error) {
    res.status(500).json({
      error: error.message || "The demo audit failed."
    });
  }
});

app.post("/api/audit", async (req, res) => {
  try {
    if (!isBetaAuthorized(req, req.body?.password)) {
      res.status(401).json({ error: "Private beta password required." });
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
      maxPages: Math.min(Math.max(Number(maxPages || 4), 1), 8)
    });
    res.set("cache-control", "no-store").json(saveLocalReport(report, req));
  } catch (error) {
    res.status(500).json({
      error: error.message || "The audit failed. Try another URL."
    });
  }
});

app.get("/api/reports/:id/brief.md", (req, res) => {
  if (!isBetaAuthorized(req)) {
    res.status(401).type("text").send("Private beta password required.");
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report) {
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
  if (!isBetaAuthorized(req)) {
    res.status(401).json({ error: "Private beta password required." });
    return;
  }
  const report = auditReports.get(req.params.id);
  if (!report) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
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
    <link rel="canonical" href="http://127.0.0.1:${port}/fixture/rendered-page" />
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

function isBetaAuthorized(req, bodyPassword = "") {
  const expected = process.env.BETA_ACCESS_PASSWORD || "local-beta";
  const supplied = String(bodyPassword || req.get("x-beta-password") || "");
  return constantTimeEqual(supplied, expected);
}

function saveLocalReport(report, req) {
  const id = makePrivateReportId(report.url);
  const origin = `http://${req.get("host")}`;
  const saved = {
    ...report,
    id,
    reportPath: `/beta/reports/${id}`,
    reportUrl: `${origin}/beta/reports/${id}`
  };
  auditReports.set(id, saved);
  return saved;
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
