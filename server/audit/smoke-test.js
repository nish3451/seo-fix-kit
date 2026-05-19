import http from "node:http";
import { auditUrl } from "./analyzer.js";

const target = process.env.TEST_URL || "https://aiconverter.app/";

const report = await auditUrl(target, { maxPages: 2 });

if (!report || !Array.isArray(report.findings)) {
  throw new Error("Audit did not return findings.");
}

if (!report.pages?.[0]?.rendered) {
  throw new Error("Audit did not return rendered page facts.");
}

const home = report.pages[0].rendered;
const hasProofFields =
  typeof home.wordCount === "number" &&
  Array.isArray(home.h1s) &&
  Array.isArray(home.internalLinks);

if (!hasProofFields) {
  throw new Error("Rendered proof fields are missing.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      url: report.url,
      score: report.score,
      pages: report.summary.pagesScanned,
      findings: report.summary.totalFindings,
      guardedFalsePositives: report.summary.guardedFalsePositives
    },
    null,
    2
  )
);

const fixtureServer = http.createServer((req, res) => {
  if (req.url === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml\n");
    return;
  }
  if (req.url === "/sitemap.xml") {
    res.writeHead(200, { "content-type": "application/xml" });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://127.0.0.1:0/</loc></url>
</urlset>`);
    return;
  }
  if (req.url === "/llms.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("# Fixture\n\nThis is an AI-readable utility file, not an HTML page.");
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fixture Shell</title>
    <meta name="description" content="Rendered fixture page for audit testing." />
  </head>
  <body>
    <div id="root">Shell</div>
    <script>
      document.getElementById("root").innerHTML = '<main><h1>Rendered page title</h1><p>' + 'Useful rendered content. '.repeat(260) + '</p><a href="/llms.txt">AI guide</a><a href="/about">About</a></main>';
    </script>
  </body>
</html>`);
});

await new Promise((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
const address = fixtureServer.address();
const fixtureUrl = `http://127.0.0.1:${address.port}/`;
const fixtureReport = await auditUrl(fixtureUrl, { maxPages: 2 });
fixtureServer.close();

const guarded = fixtureReport.findings.filter(
  (finding) => finding.severity === "good" && finding.type === "guard"
);

if (guarded.length < 2) {
  throw new Error("False-positive guard findings were not created for rendered fixture.");
}

if (fixtureReport.pages.some((page) => page.url.endsWith("/llms.txt"))) {
  throw new Error("Plain-text utility files should not be audited as HTML pages.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      fixtureUrl,
      guardedFalsePositives: guarded.length
    },
    null,
    2
  )
);
