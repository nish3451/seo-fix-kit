import assert from "node:assert/strict";
import test from "node:test";
import { demoHtml, methodologyHtml, packagesHtml } from "../worker/routes/pages.js";
import { checkHtml } from "../worker/routes/public-check.js";
import { publicPageSpotChecks, spotCheckPublicPages } from "./live-promise-spot-check.mjs";

const origin = "https://seofixkit.com";
const pages = {
  "/demo": demoHtml(origin),
  "/check": checkHtml(origin),
  "/methodology": methodologyHtml(origin),
  "/packages": packagesHtml(origin)
};

function pageFetcher(overrides = {}) {
  return async (rawUrl) => {
    const url = new URL(rawUrl);
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

test("live spot-check covers the four promised public pages", () => {
  assert.deepEqual(
    publicPageSpotChecks(origin).map((check) => check.path),
    ["/demo", "/check", "/methodology", "/packages"]
  );
});

test("live spot-check passes against the shipped public page copy", async () => {
  const results = await spotCheckPublicPages({ baseUrl: origin, fetcher: pageFetcher() });
  assert.equal(results.length, 4);
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
