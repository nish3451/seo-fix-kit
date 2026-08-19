// Submit the live sitemap URL set to IndexNow (Bing/Naver/Seznam/Yandex).
//
// Usage:
//   node scripts/submit-indexnow.mjs            # verify key file live, then submit
//   node scripts/submit-indexnow.mjs --dry-run  # print what would happen, no network writes
//
// Requirements: the IndexNow key file must already be live on the production
// host (the worker route in worker/index.js serves it once the repo change is
// released). The script refuses to submit until both key-file locations return
// the exact key text, because a submission with an unreachable key is silently
// discarded by the engines.
//
// Exit codes: 0 = accepted by every endpoint, 2 = key file not live yet,
// 3 = one or more endpoints rejected the submission.
import { INDEX_NOW_ENDPOINTS, INDEX_NOW_HOST, indexNowKeyFileBody, indexNowKeyFilePaths, buildIndexNowPayload } from "../shared/index-now.js";

const ORIGIN = `https://${INDEX_NOW_HOST}`;

export function parseSitemapLocs(xml) {
  const locs = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) locs.push(m[1]);
  return locs;
}

export async function fetchSitemapUrls({ fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`${ORIGIN}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap fetch failed: HTTP ${res.status}`);
  const locs = parseSitemapLocs(await res.text());
  if (locs.length === 0) throw new Error("sitemap returned zero <loc> entries");
  return locs;
}

export async function verifyKeyFileLive({ fetchImpl = globalThis.fetch } = {}) {
  const expected = indexNowKeyFileBody().trim();
  const results = [];
  for (const path of indexNowKeyFilePaths()) {
    const url = `${ORIGIN}${path}`;
    let ok = false;
    let detail = "";
    try {
      const res = await fetchImpl(url);
      const body = (await res.text()).trim();
      ok = res.status === 200 && body === expected;
      detail = ok ? "key matches" : `HTTP ${res.status}, body mismatch`;
    } catch (err) {
      detail = `fetch failed: ${err.message}`;
    }
    results.push({ url, ok, detail });
  }
  return results;
}

export async function submitUrlList(urlList, { endpoints = INDEX_NOW_ENDPOINTS, fetchImpl = globalThis.fetch } = {}) {
  const payload = buildIndexNowPayload(urlList);
  const outcomes = [];
  for (const endpoint of endpoints) {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload)
      });
      outcomes.push({ endpoint, status: res.status, ok: res.status === 200 || res.status === 202 });
    } catch (err) {
      outcomes.push({ endpoint, status: 0, ok: false, error: err.message });
    }
  }
  return outcomes;
}

export async function main({ dryRun = false, fetchImpl = globalThis.fetch } = {}) {
  const keyChecks = await verifyKeyFileLive({ fetchImpl });
  const keyLive = keyChecks.every((c) => c.ok);
  console.log(`IndexNow key file check (${ORIGIN}):`);
  for (const c of keyChecks) console.log(`  ${c.ok ? "OK " : "MISS"} ${c.url} (${c.detail})`);

  if (!keyLive && !dryRun) {
    console.error(
      "\nKey file is not live yet. Merge + release the worker change that serves the key file, then re-run this script."
    );
    return { ok: false, code: 2, keyChecks };
  }

  const urls = await fetchSitemapUrls({ fetchImpl });
  console.log(`\nSitemap URL set (${urls.length} URLs):`);
  for (const u of urls) console.log(`  ${u}`);

  if (dryRun) {
    console.log("\nDry run: would submit the above URL set to:");
    for (const e of INDEX_NOW_ENDPOINTS) console.log(`  POST ${e}`);
    return { ok: true, code: 0, keyChecks, urls, dryRun: true };
  }

  const outcomes = await submitUrlList(urls, { fetchImpl });
  console.log("\nSubmission results:");
  let allOk = true;
  for (const o of outcomes) {
    allOk = allOk && o.ok;
    console.log(`  ${o.ok ? "ACCEPTED" : "REJECTED"} ${o.endpoint} (HTTP ${o.status}${o.error ? `, ${o.error}` : ""})`);
  }
  return { ok: allOk, code: allOk ? 0 : 3, keyChecks, urls, outcomes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  try {
    const result = await main({ dryRun });
    process.exitCode = result.code;
  } catch (err) {
    console.error(`submit-indexnow failed: ${err.message}`);
    process.exitCode = 1;
  }
}
