import assert from "node:assert/strict";
import test from "node:test";
import {
  INDEX_NOW_ENDPOINTS,
  INDEX_NOW_HOST,
  INDEX_NOW_KEY,
  buildIndexNowPayload,
  indexNowKeyFilePaths
} from "../shared/index-now.js";
import { ROOT_PUBLIC_PATHS } from "../shared/audit-engine.js";
import {
  fetchSitemapUrls,
  main,
  parseSitemapLocs,
  submitUrlList,
  verifyKeyFileLive
} from "./submit-indexnow.mjs";

function xmlSitemap(locs) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs
    .map((l) => `<url><loc>${l}</loc></url>`)
    .join("")}</urlset>`;
}

test("IndexNow key constants are coherent", () => {
  assert.match(INDEX_NOW_KEY, /^[0-9a-f]{32}$/);
  assert.equal(INDEX_NOW_HOST, "seofixkit.com");
  assert.deepEqual(indexNowKeyFilePaths(), [
    `/${INDEX_NOW_KEY}.txt`,
    `/.well-known/${INDEX_NOW_KEY}.txt`
  ]);
  assert.ok(INDEX_NOW_ENDPOINTS.includes("https://api.indexnow.org/indexnow"));
  assert.ok(INDEX_NOW_ENDPOINTS.includes("https://www.bing.com/indexnow"));
});

test("buildIndexNowPayload mirrors the full sitemap route set, apex-only", () => {
  const urls = ROOT_PUBLIC_PATHS.map((p) => `https://${INDEX_NOW_HOST}${p}`);
  const payload = buildIndexNowPayload(urls);
  assert.equal(payload.host, INDEX_NOW_HOST);
  assert.equal(payload.key, INDEX_NOW_KEY);
  assert.equal(payload.keyLocation, `https://${INDEX_NOW_HOST}/${INDEX_NOW_KEY}.txt`);
  assert.deepEqual(payload.urlList, urls);
  for (const u of payload.urlList) assert.doesNotMatch(u, /www\./);
});

test("parseSitemapLocs extracts every loc", () => {
  const locs = parseSitemapLocs(xmlSitemap(["/", "/demo", "/check"]));
  assert.deepEqual(locs, ["/", "/demo", "/check"]);
  assert.deepEqual(parseSitemapLocs("<urlset></urlset>"), []);
});

test("fetchSitemapUrls reads the live-style sitemap and rejects empty sets", async () => {
  const locs = ROOT_PUBLIC_PATHS.map((p) => `https://${INDEX_NOW_HOST}${p}`);
  const fetchImpl = async (url) =>
    new Response(xmlSitemap(locs), { status: 200, headers: { "content-type": "application/xml" } });
  const got = await fetchSitemapUrls({ fetchImpl });
  assert.deepEqual(got, locs);
  await assert.rejects(fetchSitemapUrls({ fetchImpl: async () => new Response("<urlset></urlset>", { status: 200 }) }));
  await assert.rejects(fetchSitemapUrls({ fetchImpl: async () => new Response("", { status: 500 }) }));
});

test("verifyKeyFileLive requires the exact key text at both locations", async () => {
  const good = async () => new Response(`${INDEX_NOW_KEY}\n`, { status: 200 });
  const results = await verifyKeyFileLive({ fetchImpl: good });
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.ok));
  assert.ok(results.every((r) => r.detail === "key matches"));

  const mismatch = async (url) =>
    url === `https://${INDEX_NOW_HOST}${indexNowKeyFilePaths()[0]}`
      ? new Response("wrong-key\n", { status: 200 })
      : new Response(`${INDEX_NOW_KEY}\n`, { status: 200 });
  const bad = await verifyKeyFileLive({ fetchImpl: mismatch });
  assert.equal(bad.filter((r) => r.ok).length, 1);
});

test("submitUrlList posts the payload and treats 200/202 as accepted", async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url, body: JSON.parse(opts.body) });
    return new Response("", { status: url.includes("bing.com") ? 202 : 200 });
  };
  const urls = [`https://${INDEX_NOW_HOST}/`, `https://${INDEX_NOW_HOST}/check`];
  const outcomes = await submitUrlList(urls, { fetchImpl });
  assert.equal(seen.length, INDEX_NOW_ENDPOINTS.length);
  assert.ok(outcomes.every((o) => o.ok));
  assert.ok(seen.every((s) => s.body.urlList.length === 2 && s.body.key === INDEX_NOW_KEY));

  const rejecting = await submitUrlList(urls, {
    fetchImpl: async () => new Response("", { status: 403 })
  });
  assert.ok(rejecting.every((o) => !o.ok));
});

test("main refuses to submit when the key file is not live yet (exit code 2)", async () => {
  const fetchImpl = async () => new Response("<html>SPA fallback</html>", { status: 200 });
  const result = await main({ fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.code, 2);
  assert.ok(result.keyChecks.every((c) => !c.ok));
});

test("main dry-run submits nothing and stays green without a live key file", async () => {
  let networkWrites = 0;
  const locs = ROOT_PUBLIC_PATHS.map((p) => `https://${INDEX_NOW_HOST}${p}`);
  const fetchImpl = async (url, opts) => {
    if (opts) networkWrites += 1;
    if (url.endsWith("/sitemap.xml")) return new Response(xmlSitemap(locs), { status: 200 });
    return new Response("<html>SPA fallback</html>", { status: 200 });
  };
  const result = await main({ dryRun: true, fetchImpl });
  assert.equal(result.code, 0);
  assert.equal(networkWrites, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.urls.length, ROOT_PUBLIC_PATHS.length);
});
