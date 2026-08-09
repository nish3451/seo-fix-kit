import assert from "node:assert/strict";
import test from "node:test";
import { rootSitemap } from "../shared/audit-engine.js";
import {
  aiAnswerReadinessHtml,
  demoHtml,
  llmsText,
  methodologyHtml,
  packagesHtml,
  privacyHtml,
  renderedVsStaticAuditHtml,
  smallBusinessSeoAuditHtml,
  supportHtml,
  termsHtml
} from "../worker/routes/pages.js";
import { checkHtml } from "../worker/routes/public-check.js";
import { canonicalHostSpotChecks, publicPageSpotChecks, publicSurfaceSpotChecks, spotCheckPublicPages } from "./live-promise-spot-check.mjs";

const origin = "https://seofixkit.com";
const pages = {
  "/demo": demoHtml(origin),
  "/check": checkHtml(origin),
  "/methodology": methodologyHtml(origin),
  "/packages": packagesHtml(origin),
  "/small-business-seo-audit": smallBusinessSeoAuditHtml(origin),
  "/rendered-vs-static-seo-audit": renderedVsStaticAuditHtml(origin),
  "/ai-answer-readiness": aiAnswerReadinessHtml(origin),
  "/support": supportHtml(origin),
  "/terms": termsHtml(origin),
  "/privacy": privacyHtml(origin)
};

function jsonBody(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

// Shipped machine-surface copy, mirroring worker/index.js route handlers.
const surfaces = {
  "/llms.txt": () => textResponse(llmsText(origin), "text/plain; charset=utf-8"),
  "/sitemap.xml": () => textResponse(rootSitemap(origin), "application/xml; charset=utf-8"),
  "/robots.txt": () =>
    textResponse(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, "text/plain; charset=utf-8"),
  "/api/health": () => jsonBody({ ok: true, service: "seo-fix-kit", runtime: "cloudflare-worker", version: "0.9.0" }),
  "/api/deep-health": () =>
    jsonBody({
      ok: true,
      status: "ready",
      service: "seo-fix-kit",
      runtime: "cloudflare-worker",
      version: "0.9.0",
      scope: "runtime_config_and_schema_readiness"
    }),
  "/api/public-check": () => jsonBody({ error: "Enter a valid public http(s) URL." }, 400)
};

function pageFetcher(overrides = {}) {
  return async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.hostname.startsWith("www.")) {
      const apexUrl = new URL(rawUrl);
      apexUrl.hostname = apexUrl.hostname.replace(/^www\./, "");
      return new Response(null, {
        status: 301,
        headers: { location: apexUrl.toString() }
      });
    }
    if (url.pathname in surfaces) {
      return surfaces[url.pathname]();
    }
    if (url.pathname in overrides) {
      return htmlResponse(overrides[url.pathname], 404);
    }
    if (!(url.pathname in pages)) {
      return htmlResponse("not found", 404);
    }
    return htmlResponse(pages[url.pathname]);
  };
}

function htmlResponse(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

function textResponse(body, contentType = "text/plain; charset=utf-8") {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

test("live spot-check covers the ten promised public pages", () => {
  assert.deepEqual(
    publicPageSpotChecks(origin).map((check) => check.path),
    [
      "/demo",
      "/check",
      "/methodology",
      "/packages",
      "/small-business-seo-audit",
      "/rendered-vs-static-seo-audit",
      "/ai-answer-readiness",
      "/support",
      "/terms",
      "/privacy"
    ]
  );
});

test("live spot-check covers the public machine surfaces", () => {
  assert.deepEqual(
    publicSurfaceSpotChecks(origin).map((check) => check.path),
    ["/llms.txt", "/sitemap.xml", "/robots.txt", "/api/health", "/api/deep-health", "/api/public-check"]
  );
});

test("live spot-check covers the www-to-apex canonical redirect", () => {
  assert.deepEqual(
    canonicalHostSpotChecks(origin).map((check) => check.path),
    ["www.seofixkit.com/", "www.seofixkit.com/check"]
  );
  for (const check of canonicalHostSpotChecks(origin)) {
    assert.equal(check.redirectManual, true, "redirect checks must observe the 301 itself");
    assert.equal(check.acceptStatuses[0], 301);
  }
});

test("live spot-check passes against the shipped public page copy", async () => {
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher: pageFetcher() });
  assert.equal(results.length, 18);
  for (const result of results) {
    assert.deepEqual(result.failures, [], `${result.path} must pass: ${result.name}`);
  }
});

test("live spot-check flags a page that lost its package price", async () => {
  const overrides = { "/packages": pages["/packages"].split("$99.00 one-time").join("price hidden") };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher: pageFetcher(overrides) });
  const packages = results.find((result) => result.path === "/packages");
  assert.ok(packages.failures.includes("public fix pack price"), "price claim must be reported");
});

test("live spot-check flags a missing page", async () => {
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher: pageFetcher({ "/demo": "gone" }) });
  const demo = results.find((result) => result.path === "/demo");
  assert.ok(
    demo.failures.some((failure) => failure.includes("HTTP 404")),
    "missing page must be reported as HTTP 404"
  );
});

test("live spot-check flags a stale Worker serving the SPA fallback", async () => {
  const spaShell =
    '<!doctype html><html><head><title>SEO Fix Kit - Proof-Backed SEO Repair Beta</title></head>' +
    '<body><div id="root"></div></body></html>';
  const spaFetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    const method = options.method || "GET";
    if (method === "POST") {
      return jsonBody({ error: "Enter a valid public http(s) URL." }, 400);
    }
    if (url.pathname === "/check") {
      return new Response(spaShell, { headers: { "content-type": "text/html" } });
    }
    if (url.pathname in surfaces) {
      return surfaces[url.pathname]();
    }
    return htmlResponse(pages[url.pathname]);
  };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher: spaFetcher });
  const check = results.find((result) => result.path === "/check");
  assert.ok(
    check.failures.some((failure) => failure.includes("deployed Worker is stale")),
    "SPA fallback must be reported as a stale deploy, not just missing copy"
  );
  assert.ok(
    check.failures.some((failure) => failure.includes("/check")),
    "the stale-deploy failure must name the affected route"
  );
  const demo = results.find((result) => result.path === "/demo");
  assert.deepEqual(demo.failures, [], "worker-rendered pages must not be flagged as stale");
});

test("live spot-check flags a www host that stops redirecting to the apex", async () => {
  const noRedirectFetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.hostname.startsWith("www.")) {
      return htmlResponse("<!doctype html><div id=\"root\"></div>");
    }
    return pageFetcher()(rawUrl, options);
  };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher: noRedirectFetcher });
  const redirect = results.find((result) => result.name.includes("301-redirects onto the apex host"));
  assert.ok(
    redirect.failures.some((failure) => failure.includes("HTTP 200")),
    "a www host serving 200 instead of 301 must be reported"
  );
  assert.ok(
    redirect.failures.some((failure) => failure.includes("redirects to the apex root")),
    "a redirect without the apex Location header must be reported"
  );
});

test("live spot-check flags a www redirect that drops the path or query", async () => {
  const rootOnlyFetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.hostname.startsWith("www.")) {
      return new Response(null, { status: 301, headers: { location: `${origin}/` } });
    }
    return pageFetcher()(rawUrl, options);
  };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher: rootOnlyFetcher });
  const redirect = results.find((result) => result.name.includes("path and query intact"));
  assert.ok(
    redirect.failures.some((failure) => failure.includes("redirect preserves the path and query")),
    "a redirect that drops the path and query must be reported"
  );
});

test("live spot-check flags llms.txt that no longer lists the anonymous check", async () => {
  const overrides = {
    "/llms.txt": () => textResponse(llmsText(origin).replaceAll(`${origin}/check`, `${origin}/gone`))
  };
  const fetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname === "/llms.txt") return overrides["/llms.txt"]();
    return pageFetcher()(rawUrl, options);
  };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher });
  const llms = results.find((result) => result.path === "/llms.txt");
  assert.ok(
    llms.failures.includes("llms.txt lists the anonymous check"),
    "llms.txt must keep listing /check"
  );
});

test("live spot-check flags a sitemap missing a promised page", async () => {
  const overrides = { "/sitemap.xml": () => textResponse(rootSitemap(origin).replace(`${origin}/check`, `${origin}/gone`)) };
  const fetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname === "/sitemap.xml") return overrides["/sitemap.xml"]();
    return pageFetcher()(rawUrl, options);
  };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher });
  const sitemap = results.find((result) => result.path === "/sitemap.xml");
  assert.ok(
    sitemap.failures.includes("sitemap lists the one-page check"),
    "sitemap must keep listing /check"
  );
});

test("live spot-check flags a wrong status or content type on a machine surface", async () => {
  const overrides = {
    "/api/health": () => htmlResponse("<!doctype html><div id=\"root\"></div>")
  };
  const fetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname === "/api/health") return overrides["/api/health"]();
    return pageFetcher()(rawUrl, options);
  };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher });
  const health = results.find((result) => result.path === "/api/health");
  assert.ok(
    health.failures.some((failure) => failure.includes("instead of application/json")),
    "a SPA shell answering /api/health must be reported as a content-type drift"
  );
  assert.ok(
    health.failures.some((failure) => failure.includes("health reports ok")),
    "the missing JSON payload must be reported"
  );
});

test("live spot-check accepts a degraded deep-health as a truthful readiness state", async () => {
  const overrides = {
    "/api/deep-health": () =>
      jsonBody(
        {
          ok: false,
          status: "degraded",
          service: "seo-fix-kit",
          runtime: "cloudflare-worker",
          scope: "runtime_config_and_schema_readiness"
        },
        503
      )
  };
  const fetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname === "/api/deep-health") return overrides["/api/deep-health"]();
    return pageFetcher()(rawUrl, options);
  };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher });
  const deepHealth = results.find((result) => result.path === "/api/deep-health");
  assert.deepEqual(
    deepHealth.failures,
    [],
    "a documented degraded readiness state must not fail the spot-check"
  );
});

test("live spot-check flags a public-check route that stopped validating input", async () => {
  const overrides = {
    "/api/public-check": () => jsonBody({ error: "Enter a valid public http(s) URL." }, 500)
  };
  const fetcher = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname === "/api/public-check") return overrides["/api/public-check"]();
    return pageFetcher()(rawUrl, options);
  };
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher });
  const publicCheck = results.find((result) => result.path === "/api/public-check");
  assert.ok(
    publicCheck.failures.some((failure) => failure.includes("HTTP 500")),
    "a route that no longer returns the validation 400 must be reported"
  );
});
