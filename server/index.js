import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditUrl } from "./audit/analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();
const port = Number(process.env.PORT || 8787);

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
    const report = await auditUrl(`http://127.0.0.1:${port}/fixture/rendered-page`, {
      maxPages: 1
    });
    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: error.message || "The demo audit failed."
    });
  }
});

app.post("/api/audit", async (req, res) => {
  try {
    const { url, maxPages } = req.body || {};
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Enter a website URL to audit." });
      return;
    }

    const report = await auditUrl(url, {
      maxPages: Math.min(Math.max(Number(maxPages || 4), 1), 8)
    });
    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: error.message || "The audit failed. Try another URL."
    });
  }
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

app.use(express.static(path.join(rootDir, "dist")));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`SEO Fix Kit server running at http://127.0.0.1:${port}`);
});
