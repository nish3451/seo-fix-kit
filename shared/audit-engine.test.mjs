import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuditEngine,
  isSameOriginInfraFailure,
  isThrottledResource,
  normalizeUrl,
  publicAuditUrlStatus
} from "./audit-engine.js";
import { buildBacklinkAudit } from "./backlink-audit.js";
import { buildCrawlInventory } from "./crawl-inventory.js";
import { buildLocalSeoAudit } from "./local-seo-audit.js";
import { buildResourceWaterfall, resourceWaterfallFindings } from "./resource-waterfall.js";
import { fetchPublicUrl } from "./url-safety.js";

test("resource waterfall honors explicit non-blocking browser status", () => {
  const waterfall = buildResourceWaterfall({
    url: "https://public.example/",
    rendered: {
      finalUrl: "https://public.example/",
      navigationTiming: { domContentLoadedMs: 900 },
      resourceTimings: [
        {
          name: "https://public.example/assets/app.css",
          initiatorType: "link",
          renderBlockingStatus: "blocking",
          startTime: 10,
          duration: 120,
          transferSize: 30_000
        },
        {
          name: "https://public.example/assets/app.js",
          initiatorType: "script",
          renderBlockingStatus: "non-blocking",
          startTime: 20,
          duration: 430,
          transferSize: 220_000
        },
        {
          name: "https://static.cloudflareinsights.com/beacon.min.js",
          initiatorType: "script",
          renderBlockingStatus: "non-blocking",
          startTime: 30,
          duration: 60,
          transferSize: 12_000
        }
      ],
      resourceTimingsTotal: 3
    }
  });

  assert.equal(waterfall.summary.renderBlockingCandidates, 1);
  assert.deepEqual(
    waterfall.renderBlockingCandidates.map((resource) => resource.url),
    ["https://public.example/assets/app.css"]
  );
  assert.equal(resourceWaterfallFindings(waterfall).some((finding) => finding.title.includes("Render-blocking")), false);
});

test("resource waterfall keeps fallback render-blocking detection without browser status", () => {
  const waterfall = buildResourceWaterfall({
    url: "https://public.example/",
    rendered: {
      finalUrl: "https://public.example/",
      navigationTiming: { domContentLoadedMs: 900 },
      resourceTimings: [
        {
          name: "https://public.example/assets/app.css",
          initiatorType: "link",
          startTime: 10,
          duration: 120,
          transferSize: 30_000
        },
        {
          name: "https://public.example/assets/app.js",
          initiatorType: "script",
          startTime: 20,
          duration: 430,
          transferSize: 220_000
        }
      ],
      resourceTimingsTotal: 2
    }
  });

  assert.equal(waterfall.summary.renderBlockingCandidates, 2);
  assert.equal(resourceWaterfallFindings(waterfall).some((finding) => finding.title.includes("Render-blocking")), true);
});

test("resource waterfall applies fallback detection for unknown browser status", () => {
  const waterfall = buildResourceWaterfall({
    url: "https://public.example/",
    rendered: {
      finalUrl: "https://public.example/",
      navigationTiming: { domContentLoadedMs: 900 },
      resourceTimings: [
        {
          name: "https://public.example/assets/unknown-status.css",
          initiatorType: "link",
          renderBlockingStatus: "maybe-blocking",
          startTime: 10,
          duration: 120,
          transferSize: 30_000
        },
        {
          name: "https://public.example/assets/unknown-status.js",
          initiatorType: "script",
          renderBlockingStatus: "future-status",
          startTime: 20,
          duration: 430,
          transferSize: 220_000
        }
      ],
      resourceTimingsTotal: 2
    }
  });

  assert.equal(waterfall.summary.renderBlockingCandidates, 2);
  assert.equal(resourceWaterfallFindings(waterfall).some((finding) => finding.title.includes("Render-blocking")), true);
});

test("unavailable PageSpeed stays a proof note instead of repair work", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/"),
    fetchImpl: async () => new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    })
  });

  const report = await engine.auditUrl("https://public.example/", {
    maxPages: 1,
    pageSpeed: true,
    pageSpeedFetcher: async () => {
      throw new Error("PageSpeed Insights returned HTTP 429.");
    }
  });

  assert.equal(report.performance.status, "unavailable");
  assert.match(report.performance.reason, /HTTP 429/);
  assert.match(report.repairBrief, /PageSpeed Insights returned HTTP 429/);
  const findingText = report.findings
    .map((finding) => `${finding.title}\n${finding.why || ""}\n${finding.evidence || ""}\n${finding.fix || ""}`)
    .join("\n");
  const repairText = report.repairPlan
    .map((item) => `${item.title}\n${item.proof || ""}\n${item.fix || ""}\n${item.acceptance || ""}`)
    .join("\n");
  assert.deepEqual(report.findings.filter((finding) => finding.type === "performance"), []);
  assert.deepEqual(report.repairPlan.filter((item) => item.workType === "performance"), []);
  assert.doesNotMatch(findingText, /PageSpeed data unavailable|PageSpeed Insights returned HTTP 429/i);
  assert.doesNotMatch(repairText, /PageSpeed data unavailable|PageSpeed Insights returned HTTP 429/i);
});

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


// Regression: a site can declare og:image/twitter:image while pointing them at a
// file that does not load as an image. Presence alone was previously treated as
// a working social preview, and the suggested snippet hard-coded
// ${origin}/og-image.png even when that file did not exist on the audited site.
test("social images that are declared but not loadable produce a broken-preview finding", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        openGraph: { image: "https://public.example/social/og.png" },
        twitter: { image: "https://public.example/social/og.png" }
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (url === "https://public.example/social/og.png") {
        return new Response("not really an image", { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const broken = report.findings.find((finding) => /Social share image is not loadable/.test(finding.title));
  assert.ok(broken, "a declared-but-not-image social tag must be reported");
  // og:image and twitter:image point at the same URL, so the check is deduped:
  // the evidence names the single shared image URL and its broken response.
  assert.match(broken.evidence, /og:image \(https:\/\/public\.example\/social\/og\.png\): returned 200 with content-type text\/html/);
  assert.doesNotMatch(broken.evidence, /twitter:image \(https:\/\/public\.example\/social\/og\.png\)/, "a shared social image URL is checked once");
});

test("social images that are declared and loadable are not reported broken", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        openGraph: { image: "https://public.example/social/og.png" },
        twitter: { image: "https://public.example/social/og.png" }
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (url === "https://public.example/social/og.png") {
        return new Response("fake png bytes", { status: 200, headers: { "content-type": "image/png" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const broken = report.findings.find((finding) => /Social share image (is not loadable|incomplete)/.test(finding.title));
  assert.equal(broken, undefined, "a live social image must not be reported as broken");
});

test("social snippet never guesses an unverified og-image path when the audited page has no working social image", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        openGraph: {},
        twitter: {}
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const social = report.findings.find((finding) => /Social share image incomplete/.test(finding.title));
  assert.ok(social, "missing social tags must still be reported");
  assert.match(social.snippet, /Create https:\/\/public\.example\/og-image\.png \(1200x630\)/,
    "the snippet must tell the customer the og-image.png path is a placeholder they need to create");
});

test("social snippet uses the verified live og:image URL when one exists", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        openGraph: { image: "https://public.example/social/og.png" },
        twitter: { image: "https://public.example/social/og.png" }
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (url === "https://public.example/social/og.png") {
        return new Response("fake png bytes", { status: 200, headers: { "content-type": "image/png" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const social = report.findings.find((finding) => /Social share image incomplete/.test(finding.title));
  // og and twitter both present and live: no incomplete finding, no broken finding.
  assert.equal(social, undefined);
  const socialPreview = report.fixPack.find((fix) => fix.title === "Social preview tags");
  assert.ok(socialPreview, "the fix pack must still carry a social preview snippet");
  assert.match(socialPreview.snippet, /content="https:\/\/public\.example\/social\/og\.png"/);
  assert.doesNotMatch(socialPreview.snippet, /og-image\.png/);
});

// Regression: the apple-touch-icon check was presence-only and its published
// snippet hard-coded ${origin}/apple-touch-icon.png. A site could declare an
// icon that 404s and be reported clean, and a site with no icon was handed a
// tag pointing at a file it does not serve.
test("a declared apple-touch-icon that does not load as an image is reported", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        appleTouchIcon: "https://public.example/icons/apple-touch-icon.png"
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (url === "https://public.example/icons/apple-touch-icon.png") {
        return new Response("not really an image", { status: 404, headers: { "content-type": "text/html" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const broken = report.findings.find((finding) => /Apple touch icon is not loadable/.test(finding.title));
  assert.ok(broken, "a declared-but-dead apple-touch-icon must be reported");
  assert.match(
    broken.evidence,
    /apple-touch-icon \(https:\/\/public\.example\/icons\/apple-touch-icon\.png\): returned 404 with content-type text\/html/
  );
  assert.equal(broken.confidence, "needs-review");
  assert.equal(
    report.findings.some((finding) => /Apple touch icon missing/.test(finding.title)),
    false,
    "a page that declares an icon must not also be told the tag is missing"
  );
});

test("a declared apple-touch-icon that loads as an image is not reported", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        appleTouchIcon: "https://public.example/icons/apple-touch-icon.png"
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (url === "https://public.example/icons/apple-touch-icon.png") {
        return new Response("fake png bytes", { status: 200, headers: { "content-type": "image/png" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  assert.equal(
    report.findings.some((finding) => /Apple touch icon (is not loadable|missing)/.test(finding.title)),
    false,
    "a live apple-touch-icon must not be reported at all"
  );
});

test("apple touch icon snippet flags the placeholder path when no icon file exists", async () => {
  const requested = [];
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", { appleTouchIcon: null }),
    fetchImpl: async (url) => {
      requested.push(url);
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const missing = report.findings.find((finding) => /Apple touch icon missing/.test(finding.title));
  assert.ok(missing, "a missing apple-touch-icon must still be reported");
  assert.equal(
    requested.includes("https://public.example/apple-touch-icon.png"),
    true,
    "the engine must probe the conventional icon path before publishing it in a snippet"
  );
  assert.match(
    missing.snippet,
    /No icon file loaded at https:\/\/public\.example\/apple-touch-icon\.png during this audit\./,
    "the snippet must say the guessed path is a placeholder the customer has to create"
  );
  assert.doesNotMatch(missing.snippet, /href="\/apple-touch-icon\.png"/, "the snippet must not ship a bare hard-coded path");
  assert.doesNotMatch(missing.snippet, /sizes=/, "the audit does not measure icon dimensions, so it must not claim them");
});

test("apple touch icon snippet uses the conventional path once it is verified to load", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", { appleTouchIcon: null }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (url === "https://public.example/apple-touch-icon.png") {
        return new Response("fake png bytes", { status: 200, headers: { "content-type": "image/png" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const missing = report.findings.find((finding) => /Apple touch icon missing/.test(finding.title));
  assert.ok(missing, "an undeclared icon is still a missing tag even when the file exists");
  assert.match(missing.snippet, /href="https:\/\/public\.example\/apple-touch-icon\.png"/);
  assert.match(missing.snippet, /was verified to load as an image during this audit/);
  assert.doesNotMatch(missing.snippet, /No icon file loaded/);
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
          const gotoCall = (hooks.gotoCalls || 0) + 1;
          hooks.gotoCalls = gotoCall;
          // hooks.gotoTimeoutMs: the first navigation burns the timeout budget
          // (simulating a page that never reaches network idle), then throws a
          // timeout so the engine falls back to domcontentloaded.
          if (hooks.gotoTimeoutMs && gotoCall === 1) {
            await new Promise((resolve) => setTimeout(resolve, hooks.gotoTimeoutMs));
            throw new Error(`Navigation timeout of ${hooks.gotoTimeoutMs} ms exceeded`);
          }
          // hooks.gotoSettleMs: the first navigation takes that long but DOES
          // settle (network idle reached), for the slow-but-settled control.
          if (hooks.gotoSettleMs && gotoCall === 1) {
            await new Promise((resolve) => setTimeout(resolve, hooks.gotoSettleMs));
          }
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


// Regression: auditing 0509.io produced 8 critical "broken internal links"
// findings stamped confidence=verified. Every one was this crawler tripping that
// site's rate limiter; the same URLs returned 200 and 302 when requested politely.
// A product that sells proof cannot report its own footprint as the customer's bug.
test("throttle statuses are not treated as broken resources", () => {
  for (const status of [408, 425, 429, 503]) {
    assert.equal(
      isThrottledResource({ status, ok: false }),
      true,
      `${status} should count as throttled, not broken`
    );
  }
});

test("genuine failures are still not mistaken for throttling", () => {
  for (const status of [404, 410, 500, 502]) {
    assert.equal(
      isThrottledResource({ status, ok: false }),
      false,
      `${status} is a real failure and must still be reported`
    );
  }
  assert.equal(isThrottledResource(null), false);
  assert.equal(isThrottledResource({ ok: false }), false);
});


// Regression: a Cloudflare-hosted site whose origin briefly fails returns
// 522 (connection timed out) / 523 (origin unreachable) / 524 (origin did not
// answer in time) for every same-origin link at once. Those are Cloudflare-edge
// errors for the checked site's own origin — transient infrastructure, not
// per-link breakage — and Google backs off and retries 5xx instead of dropping
// the URLs. The public /check must not turn a scan-time origin hiccup into
// verified critical "broken internal links" findings the page does not have.
test("same-origin Cloudflare origin errors are not treated as broken internal links", () => {
  for (const status of [520, 521, 522, 523, 524, 525, 526]) {
    assert.equal(
      isSameOriginInfraFailure({ status, ok: false, kind: "internal" }),
      true,
      `same-origin ${status} should count as transient infra, not broken`
    );
  }
  for (const status of [522, 523, 524]) {
    assert.equal(
      isSameOriginInfraFailure({ status, ok: false, kind: "external" }),
      false,
      `an external target's ${status} is a real observation and must still be reported`
    );
  }
  for (const status of [522, 523, 524]) {
    assert.equal(
      isSameOriginInfraFailure({ status, ok: false, kind: "image" }),
      false,
      `${status} on images stays reportable; only same-origin links are transient`
    );
  }
  assert.equal(
    isSameOriginInfraFailure({ status: 404, ok: false, kind: "internal" }),
    false,
    "a real 404 on an internal link is still broken"
  );
  assert.equal(
    isSameOriginInfraFailure({ status: 502, ok: false, kind: "internal" }),
    false,
    "502 stays a real failure"
  );
  assert.equal(isSameOriginInfraFailure(null), false);
  assert.equal(isSameOriginInfraFailure({ ok: false }), false);
  assert.equal(isSameOriginInfraFailure({ status: 522, ok: false }), false);
});

test("same-origin 522/523/524 link failures never become critical broken-link findings", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        title: "Proof page with useful content",
        links: [
          { text: "About", href: "https://public.example/about", rawHref: "/about" },
          { text: "Contact", href: "https://public.example/contact", rawHref: "/contact" },
          { text: "Pricing", href: "https://public.example/pricing", rawHref: "/pricing" },
          { text: "Reference", href: "https://other.example/ref", rawHref: "https://other.example/ref" }
        ],
        internalLinks: [
          { text: "About", href: "https://public.example/about", rawHref: "/about" },
          { text: "Contact", href: "https://public.example/contact", rawHref: "/contact" },
          { text: "Pricing", href: "https://public.example/pricing", rawHref: "/pricing" }
        ],
        externalLinks: [
          { text: "Reference", href: "https://other.example/ref", rawHref: "https://other.example/ref" }
        ]
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (url === "https://public.example/about") {
        return new Response("origin unreachable", { status: 523, headers: { "content-type": "text/html" } });
      }
      if (url === "https://public.example/contact") {
        return new Response("connection timed out", { status: 522, headers: { "content-type": "text/html" } });
      }
      if (url === "https://public.example/pricing") {
        return new Response("origin did not answer in time", { status: 524, headers: { "content-type": "text/html" } });
      }
      if (url === "https://other.example/ref") {
        return new Response("origin unreachable", { status: 523, headers: { "content-type": "text/html" } });
      }
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const brokenInternal = (report.findings || []).filter((finding) => /Broken internal links/.test(finding.title || ""));
  assert.deepEqual(brokenInternal, [], "same-origin 522/523/524 failures must not be reported as broken internal links");
  assert.equal(report.summary.critical, 0, "a scan-time origin hiccup must not inflate the critical count");

  const brokenExternal = (report.findings || []).filter((finding) => /Broken external links/.test(finding.title || ""));
  assert.equal(brokenExternal.length, 1, "an external origin failure is still a real observation");
  assert.match(brokenExternal[0].evidence, /other\.example\/ref returned 523/, "external 523 stays evidenced");
});


// Regression: the free /check engine was reporting "Canonical URL is not
// reachable" when a same-origin canonical (e.g. self-referential, apex↔www,
// or www→apex) hit the same transient Cloudflare origin error that already
// guards same-origin internal links. Treating one transient origin hiccup as
// both "broken internal links" and "broken canonical" duplicates the same
// false positive at warning tier and turns the customer's own infrastructure
// blip into a critical-and-warning storm on a clean page.
test("same-origin 522/523/524 canonical failures never become 'Canonical URL is not reachable' findings", async () => {
  for (const status of [522, 523, 524]) {
    const engine = createAuditEngine({
      launchBrowser: async () =>
        fakeBrowser("https://public.example/", {
          title: "Proof page with useful content",
          canonical: "https://public.example/"
        }),
      fetchImpl: async (url) => {
        if (url === "https://public.example/") {
          return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" }
          });
        }
        if (url === "https://public.example/canonical") {
          return new Response("origin hiccup", { status, headers: { "content-type": "text/html" } });
        }
        return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
      },
      pagespeedDisabled: true
    });

    const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
    const canonicalFindings = (report.findings || []).filter((finding) => /Canonical URL is not reachable/i.test(finding.title || ""));
    assert.deepEqual(canonicalFindings, [], `same-origin canonical ${status} must not be reported as unreachable`);
    const canonicalNotice = (report.findings || []).filter((finding) => /Canonical URL redirects/i.test(finding.title || ""));
    assert.deepEqual(canonicalNotice, [], `same-origin canonical ${status} must not surface as a redirect notice either`);
  }
});


// Regression: a cross-origin canonical (declared on the page but pointing to a
// different host) must still surface 522/523/524 as a real reachability finding
// at warning tier. The infra-failure guard only applies to same-origin
// resources where the failure is the customer's own origin, not the third
// party they pointed their canonical at.
test("cross-origin canonical 522/523/524 is still reported as unreachable", async () => {
  for (const status of [522, 523, 524]) {
    const engine = createAuditEngine({
      launchBrowser: async () =>
        fakeBrowser("https://public.example/", {
          title: "Proof page with useful content",
          canonical: "https://other.example/canonical"
        }),
      fetchImpl: async (url) => {
        if (url === "https://public.example/") {
          return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" }
          });
        }
        if (url === "https://other.example/canonical") {
          return new Response("origin hiccup", { status, headers: { "content-type": "text/html" } });
        }
        return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
      },
      pagespeedDisabled: true
    });

    const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
    const canonicalFindings = (report.findings || []).filter((finding) => /Canonical URL is not reachable/i.test(finding.title || ""));
    assert.equal(canonicalFindings.length, 1, `cross-origin canonical ${status} stays a real observation`);
    assert.match(canonicalFindings[0].evidence, new RegExp(`other\\.example/canonical returned ${status}`), `evidence must cite the cross-origin ${status}`);
    const canonicalNotice = (report.findings || []).filter((finding) => /Canonical URL redirects/i.test(finding.title || ""));
    assert.deepEqual(canonicalNotice, [], `a failed cross-origin canonical ${status} is not a redirect notice`);
  }
});


// Regression: a www↔apex canonical lives on the customer's own infrastructure
// even though the hostname differs from the audited page. The strict origin
// comparison marked it kind "canonical", which bypassed the same-origin infra
// guard entirely and let one transient Cloudflare origin error become a false
// "Canonical URL is not reachable" warning on an otherwise clean page.
test("same-site www and apex canonical transient origin errors are guarded like same-origin", async () => {
  for (const status of [520, 521, 522, 523, 524, 525, 526]) {
    for (const [pageUrl, canonical] of [
      ["https://www.public.example/", "https://public.example/canonical"],
      ["https://public.example/", "https://www.public.example/canonical"]
    ]) {
      const engine = createAuditEngine({
        launchBrowser: async () =>
          fakeBrowser(pageUrl, {
            title: "Proof page with useful content",
            canonical
          }),
        fetchImpl: async (url) => {
          if (url === pageUrl) {
            return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
              status: 200,
              headers: { "content-type": "text/html; charset=utf-8" }
            });
          }
          if (url === canonical) {
            return new Response("origin hiccup", { status, headers: { "content-type": "text/html" } });
          }
          return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
        },
        pagespeedDisabled: true
      });

      const report = await engine.auditUrl(pageUrl, { maxPages: 1, pageSpeed: false });
      const canonicalFindings = (report.findings || []).filter((finding) => /Canonical URL is not reachable/i.test(finding.title || ""));
      assert.deepEqual(canonicalFindings, [], `www↔apex canonical ${status} on the same site must not be reported as unreachable`);
      const canonicalNotice = (report.findings || []).filter((finding) => /Canonical URL redirects/i.test(finding.title || ""));
      assert.deepEqual(canonicalNotice, [], `www↔apex canonical ${status} on the same site must not surface as a redirect notice either`);
    }
  }
});


// Regression: the canonical probe is a second network request to the customer's
// own site seconds after the page itself rendered fine. When that probe dies at
// the transport layer (timeout, connection reset, DNS hiccup) it carries no
// HTTP status at all — proof of nothing about the canonical URL. Reporting it
// as "Canonical URL is not reachable" turned our own probe timeout into the
// customer's warning-tier defect. A real HTTP answer (404, 410, 500) still is.
test("same-origin canonical probe transport failures are not reported as unreachable", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        title: "Proof page with useful content",
        canonical: "https://public.example/canonical"
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      throw new Error("The operation was aborted due to timeout");
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const canonicalFindings = (report.findings || []).filter((finding) => /Canonical URL is not reachable/i.test(finding.title || ""));
  assert.deepEqual(canonicalFindings, [], "a timed-out same-origin canonical probe is not proof of an unreachable canonical");
  const canonicalNotice = (report.findings || []).filter((finding) => /Canonical URL redirects/i.test(finding.title || ""));
  assert.deepEqual(canonicalNotice, [], "a timed-out same-origin canonical probe is not a redirect observation either");
});


// Guard rail for the transport-failure suppression above: when the same-origin
// canonical probe gets a REAL HTTP answer, the finding must keep firing so the
// guard cannot hide genuine breakage.
test("same-origin canonical returning a real error status stays reported as unreachable", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () =>
      fakeBrowser("https://public.example/", {
        title: "Proof page with useful content",
        canonical: "https://public.example/gone"
      }),
    fetchImpl: async (url) => {
      if (url === "https://public.example/") {
        return new Response("<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Useful content.</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const canonicalFindings = (report.findings || []).filter((finding) => /Canonical URL is not reachable/i.test(finding.title || ""));
  assert.equal(canonicalFindings.length, 1, "a same-origin canonical answering 404 is a real defect");
});


// Regression: 0509.io serves HSTS on every route, but /search took 7.6s to
// settle so no headers were captured, and the audit reported the header as
// missing. Verified with curl that the header is present for both a browser
// and the audit's own user-agent.
test("HSTS is not reported missing when no headers were captured", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/"),
    // A fetch that never yields headers is exactly the slow-page case.
    fetchImpl: async () => {
      throw new Error("fetch timed out");
    },
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const hsts = (report.findings || []).filter((f) => /HSTS/i.test(f.title || ""));
  assert.deepEqual(hsts, [], "an empty header capture must not prove the header is absent");
});

test("HSTS is still reported when headers were captured without it", async () => {
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/"),
    fetchImpl: async () =>
      new Response(
        "<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof</h1><p>Useful content here.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
      ),
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const hsts = (report.findings || []).filter((f) => /HSTS/i.test(f.title || ""));
  assert.equal(hsts.length, 1, "a real header capture with no HSTS must still be reported");
});


// Regression: markup that only exists inside <script> or <style> element bodies
// (JS template strings, CSS content) must not be counted as static headings,
// links, or images — no static crawler can see it.
test("static facts exclude headings, links, and images embedded in script and style bodies", async () => {
  const fixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Static fixture</title>
  </head>
  <body>
    <script>
      const template = '<h1>Script h1</h1><a href="/script-link">Script link</a><img src="/script-image.png">';
    </script>
    <style>
      .decoy { background: url("/style-image.png"); content: "<h2>Style h2</h2><a href='/style-link'>Style link</a>"; }
    </style>
    <h1>Real h1</h1>
    <a href="/real-link">Real link</a>
    <img src="/real-image.png" alt="Real image" />
  </body>
</html>`;
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/"),
    fetchImpl: async () =>
      new Response(fixture, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const page = report.pages[0];

  assert.deepEqual(page.static.h1s, ["Real h1"]);
  assert.deepEqual(page.static.headings, [{ level: "h1", text: "Real h1" }]);
  assert.deepEqual(
    page.static.internalLinks.map((link) => link.href),
    ["https://public.example/real-link"]
  );
  assert.deepEqual(
    page.static.images.map((image) => image.src),
    ["https://public.example/real-image.png"]
  );
});

// Regression: <noscript> fallback markup is real crawlable content for
// crawlers that do not run JavaScript, so static headings, links, and images
// must keep it while still excluding script-body decoys.
test("static facts preserve noscript fallback markup", async () => {
  const fixture = `<!doctype html>
<html lang="en">
  <head>
    <title>Noscript fixture</title>
  </head>
  <body>
    <script>
      const template = '<h2>Script decoy h2</h2><a href="/script-decoy">Script decoy</a><img src="/script-decoy.png">';
    </script>
    <noscript>
      <h2>Fallback h2</h2>
      <a href="/fallback-link">Fallback link</a>
      <img src="/fallback-image.png" alt="Fallback image" />
    </noscript>
    <p>Visible copy that stays in the word count.</p>
  </body>
</html>`;
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/"),
    fetchImpl: async () =>
      new Response(fixture, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const page = report.pages[0];

  assert.deepEqual(
    page.static.headings.map((heading) => heading.text),
    ["Fallback h2"]
  );
  assert.deepEqual(
    page.static.links.map((link) => link.href),
    ["https://public.example/fallback-link"]
  );
  assert.deepEqual(
    page.static.images.map((image) => image.src),
    ["https://public.example/fallback-image.png"]
  );
  // Word-count behavior is intentionally unchanged: noscript fallback text is
  // still excluded from the static word count, only element facts preserve it.
  assert.equal(page.static.wordCount, 8);
});

// Regression: the live fixture shape ships real headings/links/images inside a
// <script> template string. Static facts must not count them, and the
// rendered-vs-static guards must truthfully fire when the rendered DOM has them.
test("rendered-vs-static guards stay truthful for the live script-rendered fixture shape", async () => {
  const fixture = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proof Demo App Shell</title>
    <meta name="description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
  </head>
  <body>
    <div id="app">Loading app shell...</div>
    <script>
      document.getElementById("app").innerHTML = \`
        <main>
          <h1>Rendered SaaS page with real content</h1>
          <nav>
            <a href="/fixture/rendered-page">Overview</a>
            <a href="/fixture/rendered-page?tab=pricing">Pricing</a>
          </nav>
          <img src="/fixture/hero-large.jpg" alt="Large rendered demo hero" />
        </main>
      \`;
    </script>
  </body>
</html>`;
  const renderedLinks = [
    { text: "Overview", href: "https://public.example/fixture/rendered-page", rawHref: "/fixture/rendered-page" },
    { text: "Pricing", href: "https://public.example/fixture/rendered-page?tab=pricing", rawHref: "/fixture/rendered-page?tab=pricing" }
  ];
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", {
      h1s: ["Rendered SaaS page with real content"],
      headings: [{ level: "h1", text: "Rendered SaaS page with real content" }],
      links: renderedLinks,
      internalLinks: renderedLinks,
      images: [{ src: "https://public.example/fixture/hero-large.jpg", alt: "Large rendered demo hero", hasAlt: true }]
    }),
    fetchImpl: async () =>
      new Response(fixture, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const page = report.pages[0];

  assert.deepEqual(page.static.h1s, []);
  assert.deepEqual(page.static.internalLinks, []);
  assert.deepEqual(page.static.images, []);

  const guardTitles = report.findings
    .filter((finding) => finding.type === "guard")
    .map((finding) => finding.title);
  assert.ok(
    guardTitles.some((title) => title.includes("H1 exists after render")),
    `expected an H1 guard, got: ${guardTitles.join(" | ")}`
  );
  assert.ok(
    guardTitles.some((title) => title.includes("internal links exist after render")),
    `expected an internal-links guard, got: ${guardTitles.join(" | ")}`
  );
});

test("normalizeUrl adds https to scheme-less input and keeps valid http(s) URLs intact", () => {
  assert.equal(normalizeUrl("example.com/about?q=1"), "https://example.com/about?q=1");
  assert.equal(normalizeUrl("  example.com  "), "https://example.com/");
  assert.equal(normalizeUrl("//example.com/about"), "https://example.com/about");
  assert.equal(normalizeUrl("https://example.com/a?b=c#frag"), "https://example.com/a?b=c");
  assert.equal(normalizeUrl("HTTP://EXAMPLE.COM/a"), "http://example.com/a");
  assert.equal(normalizeUrl("example.com:8080/page"), "https://example.com:8080/page");
});

test("normalizeUrl rejects non-http schemes and embedded credentials instead of mangling them", () => {
  assert.throws(() => normalizeUrl("ftp://example.com"), /Unsupported URL scheme "ftp"/);
  assert.throws(() => normalizeUrl("javascript://example.com/x"), /Unsupported URL scheme "javascript"/);
  assert.throws(() => normalizeUrl("mailto:hello@example.com"), /embedded credentials/i);
  assert.throws(() => normalizeUrl("https://user:pass@example.com/"), /embedded credentials/i);
  assert.throws(() => normalizeUrl("https://user@example.com/"), /embedded credentials/i);
});

test("publicAuditUrlStatus keeps every audit target a public, dotted host", () => {
  // Single-label hostnames (typos, intranet names, local aliases) are never
  // public websites; every public audit surface shares this guard, so a
  // dotless target must fail here rather than reach a browser and return a
  // raw net:: navigation error.
  for (const input of ["https://notaurl/", "https://intranet/", "https://example", "http://printer/"]) {
    const result = publicAuditUrlStatus(input);
    assert.equal(result.ok, false, `dotless hostname must be rejected: ${input}`);
    assert.equal(result.error, "Enter a valid public website URL.", `friendly message for: ${input}`);
  }
  // Dotted public hosts, including public IP literals, still pass.
  assert.equal(publicAuditUrlStatus("https://example.com/").ok, true);
  assert.equal(publicAuditUrlStatus("https://8.8.8.8/").ok, true);
  assert.equal(publicAuditUrlStatus("https://example.com:8443/path").ok, true);
});

// Regression: aiconverter.app never reaches network idle (analytics beacons,
// polling), so the audit falls back to domcontentloaded. The elapsed time is
// then dominated by OUR navigation timeout — reporting "reached network idle in
// 26.9s" as a Slow rendered load finding sells our measurement policy as the
// customer's defect (same family as the throttled-link and empty-header bugs).
test("never-idle fallback does not become a slow-load repair finding", async () => {
  const hooks = { gotoTimeoutMs: 2600 };
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", {}, hooks),
    fetchImpl: async () =>
      new Response(
        "<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof</h1><p>Useful content here.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
      ),
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const rendered = report.pages?.[0]?.rendered || {};

  // The fallback measurement is genuinely long (over the slow-render
  // threshold), so this test would fail before the fix: the finding fired
  // purely from our own timeout budget.
  assert.equal(rendered.loadSettled, false, "fallback render must record that idle was never reached");
  assert.ok(rendered.loadDurationMs > 4000, "test setup must exceed the slow-render threshold");

  const slowLoad = (report.findings || []).filter((f) => /Slow rendered load/i.test(f.title || ""));
  assert.deepEqual(slowLoad, [], "a page that never settled must not become slow-load repair work");
  assert.ok(
    !(report.repairBrief || "").includes("reached network idle"),
    "the brief must not claim network idle was reached"
  );
  assert.match(report.repairBrief || "", /network idle never reached/);
});

test("settled slow pages still get a slow-load finding with truthful evidence", async () => {
  const hooks = { gotoSettleMs: 4200 };
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser("https://public.example/", {}, hooks),
    fetchImpl: async () =>
      new Response(
        "<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof</h1><p>Useful content here.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
      ),
    pagespeedDisabled: true
  });

  const report = await engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
  const rendered = report.pages?.[0]?.rendered || {};

  assert.equal(rendered.loadSettled, true, "a settling navigation must record idle as reached");
  const slowLoad = (report.findings || []).filter((f) => /Slow rendered load/i.test(f.title || ""));
  assert.equal(slowLoad.length, 1, "a genuinely slow page that settled must still be flagged");
  assert.match(slowLoad[0].evidence, /reached network idle/);
  assert.ok(!(report.repairBrief || "").includes("network idle never reached"));
});
