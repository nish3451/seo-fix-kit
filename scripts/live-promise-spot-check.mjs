import { pathToFileURL } from "node:url";

// Live spot-check for the public promise pages the README "What is live in
// this repo" section relies on: /demo (proof loop), /methodology (limits),
// and /packages (package ladder) must be served by the deployed Worker with
// the copy that backs the claims. This is the repeatable "spot-check" half of
// the lane-2 promise audit; the offline regression lock lives in
// shared/promise-audit.test.mjs and worker/routes/pages.test.mjs.
//
// Opt-in script, not part of `npm run check` (CI stays offline-only; the
// offline regression lock for the same claims is in the check pipeline):
//   npm run audit:live-promise
//   SEOFIXKIT_BASE_URL=https://seofixkit.com npm run audit:live-promise

const DEFAULT_BASE_URL = process.env.SEOFIXKIT_BASE_URL || "https://seofixkit.com";
const DEFAULT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_SPOT_CHECK_TIMEOUT_MS || 15000);

if (isDirectRun()) {
  await main();
}

async function main() {
  const baseUrl = DEFAULT_BASE_URL;
  const results = await spotCheckPublicPages({ baseUrl });
  const failed = results.filter((result) => result.failures.length > 0);

  console.log(`Live promise spot-check: ${baseUrl}`);
  for (const result of results) {
    if (result.failures.length === 0) {
      console.log(`  ok ${result.path} - ${result.name}`);
    } else {
      console.log(`  fail ${result.path} - ${result.name}`);
      for (const reason of result.failures) {
        console.log(`    missing: ${reason}`);
      }
    }
  }

  if (failed.length > 0) {
    console.error(
      `Spot-check failed on ${failed.length} page(s). Fix the deployed copy or the claim in the spot-check, then rerun.`
    );
    process.exitCode = 1;
    return;
  }
  console.log("All public-page promises on the live site match the claims.");
}

export async function spotCheckPublicPages({
  baseUrl = DEFAULT_BASE_URL,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const checks = publicPageSpotChecks(baseUrl);
  const results = [];
  for (const check of checks) {
    const response = await fetchWithTimeout(`${baseUrl}${check.path}`, {}, timeoutMs, fetcher);
    const status = response.status;
    const text = await response.text();
    const failures = [];
    if (status !== 200) {
      failures.push(`page returned HTTP ${status} instead of 200`);
    }
    for (const { reason, match } of check.expectations) {
      if (!hasContent(text, match)) {
        failures.push(reason);
      }
    }
    results.push({ path: check.path, name: check.name, failures });
  }
  return results;
}

// Headline claims only: each page must serve the proof-loop / limits /
// package-ladder promise the README makes. The full copy is locked offline by
// worker/routes/pages.test.mjs; this checks the deployed page still carries
// the load-bearing parts.
export function publicPageSpotChecks(baseUrl) {
  return [
    {
      path: "/demo",
      name: "demo page shows the proof loop before payment",
      expectations: [
        { reason: "proof-loop headline", match: "Do not fix what is not broken." },
        { reason: "static-vs-rendered proof panels", match: "Rendered proof" },
        { reason: "no-overclaim section", match: "What this sample does not claim" },
        { reason: "link to methodology limits", match: `href="${baseUrl}/methodology"` },
        { reason: "link to package ladder", match: `href="${baseUrl}/packages"` }
      ]
    },
    {
      path: "/check",
      name: "one-page check page shows the anonymous proof entry",
      expectations: [
        { reason: "one-page check headline", match: "Check One Page for SEO Proof" },
        { reason: "URL check form", match: 'id="check-form"' },
        { reason: "no-account proof promise", match: "No account, no email, no stored report" },
        { reason: "guarded false positives promise", match: "Guarded false positives" },
        { reason: "no-overclaim section", match: "What this check does not claim" },
        { reason: "handoff into private access", match: "Request private access" }
      ]
    },
    {
      path: "/methodology",
      name: "methodology page states limits up front",
      expectations: [
        { reason: "claims-last headline", match: "Proof first. Repairs second. Claims last." },
        { reason: "limits section", match: "Limits we state up front" },
        { reason: "AI visibility tracking is not live", match: "No AI visibility tracking" },
        { reason: "no hidden site writes", match: "No hidden site writes" },
        { reason: "50K crawl staged, not complete", match: "No fake scale claim" }
      ]
    },
    {
      path: "/packages",
      name: "packages page shows the package ladder before payment",
      expectations: [
        { reason: "ladder headline", match: "Package ladder" },
        { reason: "fix pack offer", match: "SEO Fix Pack" },
        { reason: "public fix pack price", match: "$99.00 one-time" },
        { reason: "Dodo is the final price source", match: "Dodo shows the final checkout price" },
        { reason: "Proof Monitoring is config-gated", match: "Config-gated subscription" },
        { reason: "roadmap packages marked", match: "Roadmap" }
      ]
    }
  ];
}

function hasContent(text, match) {
  return typeof match === "string" ? text.includes(match) : match.test(text);
}

async function fetchWithTimeout(url, options, timeoutMs, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isDirectRun() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}
