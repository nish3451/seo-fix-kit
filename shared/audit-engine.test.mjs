import assert from "node:assert/strict";
import test from "node:test";
import { createAuditEngine } from "./audit-engine.js";
import { buildBacklinkAudit } from "./backlink-audit.js";
import { buildCrawlInventory } from "./crawl-inventory.js";
import { buildLocalSeoAudit } from "./local-seo-audit.js";
import { fetchPublicUrl } from "./url-safety.js";

test("audit discovery fetch blocks private-DNS redirect targets before fetch", async () => {
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    if (url === "https://public.example/llms.txt") {
      return new Response("", {
        status: 302,
        headers: { location: "https://private.example/metadata" }
      });
    }
    if (url === "https://public.example/") {
      return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    return new Response("", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  };
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/"),
    fetchImpl,
    pagespeedDisabled: true,
    privateAddressResolver: async (hostname) => hostname === "private.example"
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });

  assert.equal(report.llmsTxt.status, null);
  assert.match(report.llmsTxt.error, /private or internal address/i);
  assert.equal(fetched.includes("https://private.example/metadata"), false);
});

test("resource validation blocks private-DNS resources and redirect targets before fetch", async () => {
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    if (url === "https://redirect.example/resource") {
      return new Response("", {
        status: 302,
        headers: { location: "https://private.example/resource" }
      });
    }
    if (url === "https://public.example/") {
      return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    return new Response("", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  };
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", {
      canonical: "https://private.example/canonical",
      links: [{
        text: "redirect",
        href: "https://redirect.example/resource",
        rawHref: "https://redirect.example/resource"
      }],
      externalLinks: [{
        text: "redirect",
        href: "https://redirect.example/resource",
        rawHref: "https://redirect.example/resource"
      }]
    }),
    fetchImpl,
    pagespeedDisabled: true,
    privateAddressResolver: async (hostname) => hostname === "private.example"
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const page = report.pages[0];

  assert.equal(page.linkChecks[0].ok, false);
  assert.match(page.linkChecks[0].error, /private or internal address/i);
  assert.equal(page.canonicalCheck.ok, false);
  assert.match(page.canonicalCheck.error, /private or internal address/i);
  assert.equal(fetched.includes("https://redirect.example/resource"), true);
  assert.equal(fetched.includes("https://private.example/resource"), false);
  assert.equal(fetched.includes("https://private.example/canonical"), false);
});

test("rendered audit navigation rechecks private DNS before browser goto", async () => {
  const gotoUrls = [];
  let staticPageFetched = false;
  const fetchImpl = async (url) => {
    if (url === "https://public.example/") {
      staticPageFetched = true;
      return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    return new Response("", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  };
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", {}, { gotoUrls }),
    fetchImpl,
    pagespeedDisabled: true,
    privateAddressResolver: async (hostname) => hostname === "public.example" && staticPageFetched
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const page = report.pages[0];

  assert.match(page.renderSkippedReason, /private or internal address/i);
  assert.equal(gotoUrls.length, 0);
});

test("rendered browser audit aborts private-DNS subresources before load", async () => {
  const allowedRequests = [];
  const abortedRequests = [];
  const fetchImpl = async (url) => {
    if (url === "https://public.example/") {
      return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><img src=\"https://private.example/pixel.png\"></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    return new Response("", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  };
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", {}, {
      allowedRequests,
      abortedRequests,
      requestUrls: [
        "https://public.example/",
        "https://public.example/app.js",
        "https://private.example/pixel.png"
      ]
    }),
    fetchImpl,
    pagespeedDisabled: true,
    privateAddressResolver: async (hostname) => hostname === "private.example"
  });

  await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });

  assert.equal(allowedRequests.includes("https://public.example/app.js"), true);
  assert.equal(abortedRequests.includes("https://private.example/pixel.png"), true);
});

test("rendered browser audit aborts private-DNS subresources through Puppeteer interception fallback", async () => {
  const allowedRequests = [];
  const abortedRequests = [];
  const consultedHosts = [];
  const interceptionEnabled = [];
  const fetchImpl = async (url) => {
    if (url === "https://public.example/") {
      return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><script src=\"https://private.example/app.js\"></script></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    return new Response("", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  };
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", {}, {
      noRoute: true,
      interceptionEnabled,
      allowedRequests,
      abortedRequests,
      requestUrls: [
        "https://public.example/",
        "https://public.example/app.js",
        "https://private.example/app.js"
      ]
    }),
    fetchImpl,
    pagespeedDisabled: true,
    privateAddressResolver: async (hostname) => {
      consultedHosts.push(hostname);
      return hostname === "private.example";
    }
  });

  await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });

  assert.deepEqual(interceptionEnabled, [true]);
  assert.equal(allowedRequests.includes("https://public.example/app.js"), true);
  assert.equal(abortedRequests.includes("https://private.example/app.js"), true);
  assert.equal(consultedHosts.includes("private.example"), true);
});

test("fetchPublicUrl blocks private-DNS initial and redirect targets before fetch", async () => {
  const fetched = [];
  const fetcher = async (url) => {
    fetched.push(String(url));
    if (url === "https://public.example/source") {
      return new Response("", {
        status: 302,
        headers: { location: "https://private.example/metadata" }
      });
    }
    return new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  };
  const privateAddressResolver = async (hostname) => hostname === "private.example";

  await assert.rejects(
    () => fetchPublicUrl(fetcher, "https://private.example/source", {}, { privateAddressResolver }),
    /private or internal address/i
  );
  await assert.rejects(
    () => fetchPublicUrl(fetcher, "https://public.example/source", {}, { privateAddressResolver }),
    /private or internal address/i
  );

  assert.deepEqual(fetched, ["https://public.example/source"]);
  assert.equal(fetched.includes("https://private.example/metadata"), false);
});

test("crawl inventory uses private DNS guard before sitemap helper fetches", async () => {
  const fetched = [];
  const inventory = await buildCrawlInventory("https://public.example/", {
    includeUrls: true,
    fetcher: async (url) => {
      fetched.push(String(url));
      return new Response("<urlset></urlset>", {
        status: 200,
        headers: { "content-type": "application/xml" }
      });
    },
    privateAddressResolver: async (hostname) => hostname === "public.example"
  });

  assert.equal(inventory.status, "empty");
  assert.equal(fetched.length, 0);
  assert.match(inventory.warnings.join(" "), /private or internal address/i);
});

test("backlink audit uses private DNS guard for source helper fetches", async () => {
  const fetched = [];
  const audit = await buildBacklinkAudit(
    {
      url: "https://target.example/",
      pages: [{ url: "https://target.example/", finalUrl: "https://target.example/", ok: true, status: 200 }]
    },
    [{ sourceUrl: "https://private-source.example/page", targetUrl: "https://target.example/" }],
    {
      fetcher: async (url) => {
        fetched.push(String(url));
        return new Response("", { status: 200, headers: { "content-type": "text/html" } });
      },
      privateAddressResolver: async (hostname) => hostname === "private-source.example"
    }
  );

  assert.equal(audit.rows[0].sourceOk, false);
  assert.match(audit.rows[0].sourceError, /private or internal address/i);
  assert.deepEqual(fetched, []);
});

test("backlink audit uses private DNS guard for target helper fetches", async () => {
  const fetched = [];
  const audit = await buildBacklinkAudit(
    { url: "https://target.example/", pages: [] },
    [{ sourceUrl: "https://source.example/page", targetUrl: "https://target.example/" }],
    {
      fetcher: async (url) => {
        fetched.push(String(url));
        return new Response("<a href=\"https://target.example/\">target</a>", {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      },
      privateAddressResolver: async (hostname) => hostname === "target.example"
    }
  );

  assert.equal(audit.rows[0].sourceOk, true);
  assert.equal(audit.rows[0].targetOk, false);
  assert.deepEqual(fetched, ["https://source.example/page"]);
});

test("local SEO audit uses private DNS guard for citation helper fetches", async () => {
  const fetched = [];
  const audit = await buildLocalSeoAudit(
    { url: "https://target.example/", pages: [] },
    {
      businessName: "Acme Clinic",
      citations: [{ sourceUrl: "https://private-citation.example/listing", businessName: "Acme Clinic" }]
    },
    {
      fetcher: async (url) => {
        fetched.push(String(url));
        return new Response("Acme Clinic", { status: 200, headers: { "content-type": "text/plain" } });
      },
      privateAddressResolver: async (hostname) => hostname === "private-citation.example"
    }
  );

  assert.equal(audit.citationRows[0].sourceOk, false);
  assert.match(audit.citationRows[0].sourceError, /private or internal address/i);
  assert.deepEqual(fetched, []);
});

function fakeBrowser(finalUrl, overrides = {}, hooks = {}) {
  return {
    async newPage() {
      let routeHandler = null;
      let requestHandler = null;
      const page = {
        async route(pattern, handler) {
          hooks.routePatterns?.push(pattern);
          routeHandler = handler;
        },
        async setRequestInterception(enabled) {
          hooks.interceptionEnabled?.push(enabled);
        },
        on(event, handler) {
          if (event === "request") requestHandler = handler;
        },
        async goto(url) {
          hooks.gotoUrls?.push(url);
          if (routeHandler) {
            for (const requestUrl of hooks.requestUrls || []) {
              await routeHandler({
                request: () => ({ url: () => requestUrl }),
                continue: async () => hooks.allowedRequests?.push(requestUrl),
                abort: async () => hooks.abortedRequests?.push(requestUrl)
              });
            }
          }
          if (requestHandler) {
            for (const requestUrl of hooks.requestUrls || []) {
              await requestHandler({
                url: () => requestUrl,
                continue: async () => hooks.allowedRequests?.push(requestUrl),
                abort: async () => hooks.abortedRequests?.push(requestUrl)
              });
            }
          }
          return { status: () => 200 };
        },
        async evaluate() {
          return {
            source: "rendered-dom",
            finalUrl,
            title: "Proof page",
            description: "A proof-backed page.",
            generator: null,
            robots: null,
            canonical: finalUrl,
            lang: "en",
            viewport: "width=device-width, initial-scale=1",
            charset: "UTF-8",
            doctype: "html",
            hreflangs: [],
            h1s: ["Proof page"],
            headings: [{ level: "h1", text: "Proof page" }],
            links: [],
            internalLinks: [],
            externalLinks: [],
            images: [],
            imagesMissingAlt: [],
            scripts: [],
            stylesheets: [],
            openGraph: {},
            twitter: {},
            favicon: null,
            appleTouchIcon: null,
            schemaTypes: [],
            schemaErrors: [],
            navigationTiming: {},
            resourceTimings: [],
            resourceTimingsTotal: 0,
            wordCount: 12,
            bodyText: "Proof page with useful content.",
            bodySample: "Proof page with useful content.",
            ...overrides
          };
        },
        async close() {}
      };
      if (hooks.noRoute) delete page.route;
      return page;
    },
    async close() {}
  };
}
