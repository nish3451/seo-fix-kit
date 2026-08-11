import { pathToFileURL } from "node:url";

// Repeatable production walk of the private-beta funnel (backlog item
// "Live-surface walk of the private-beta funnel [bootstrap 2026-08-08,
// risk: green]").
//
// The item's accept clause is: "ux-walk of https://seofixkit.com home →
// /demo → /packages → access request (observe mode), console clean, links
// live, no mobile horizontal scroll; defects filed as fresh items". The
// verify clause is: "walk JSON summarized in journal". This script does both
// against the deployed Worker with a real browser (Playwright Chromium):
//
//   1. Walks the funnel stops in order on a desktop viewport and again on an
//      iPhone-13 mobile viewport: home (where the private-beta access request
//      form lives), /demo, and /packages.
//   2. Per stop records HTTP status, final URL, document title, canonical,
//      load-bearing funnel copy, console errors, page errors, broken internal
//      links, and (mobile) horizontal overflow.
//   3. Inspects the access request form in observe mode only: email input,
//      company honeypot, submit CTA, and the public proof/check links. The
//      form is never submitted, so the walk consumes no waitlist leads, no
//      access tokens, and no D1 writes.
//   4. Emits the walk JSON (the "summarized in journal" record) and prints a
//      human summary; exits 0 pass / 1 fail / 2 error.
//
// The walk is opt-in (it is a live read of the deployed product) and never
// part of `npm run check`; CI stays offline-only. The same per-stop
// assertions are locked offline by scripts/run-private-beta-funnel-walk.test.mjs,
// which runs inside `npm run check`:
//
//   npm run audit:funnel-walk
//   SEOFIXKIT_BASE_URL=https://seofixkit.com npm run audit:funnel-walk
//   SEOFIXKIT_FUNNEL_WALK_TIMEOUT_MS=120000 npm run audit:funnel-walk

const DEFAULT_BASE_URL = process.env.SEOFIXKIT_BASE_URL || "https://seofixkit.com";
const DEFAULT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_FUNNEL_WALK_TIMEOUT_MS || 120000);

export const WALK_STATUS = {
  PASS: "pass",
  FAIL: "fail"
};

// Exit codes: 0 pass, 1 walk failed (any stop's assertions broke), 2
// unexpected error (browser launch, unreachable site, walker bug).
export const WALK_EXIT_CODES = { pass: 0, fail: 1, error: 2 };

// The funnel stops in walk order, matching the item's accept clause
// (home → /demo → /packages → access request). The access request lives on
// the home stop; /demo and /packages are the public proof stops a visitor
// reaches from the home nav before deciding to request access.
export const FUNNEL_STOPS = [
  {
    path: "/",
    name: "home",
    acceptStatuses: [200],
    titlePattern: /SEO Fix Kit - Proof-Backed SEO Repair Beta/,
    copyChecks: [
      { match: "Private beta access.", reason: "home keeps the locked private-beta copy" },
      { match: "Email access link", reason: "home keeps the one-use email link CTA" }
    ],
    expectedLinks: ["/demo", "/methodology", "/packages", "/check"],
    accessForm: true
  },
  {
    path: "/demo",
    name: "demo",
    acceptStatuses: [200],
    titlePattern: /Proof-Backed SEO Repair Demo - SEO Fix Kit/,
    canonical: "/demo",
    copyChecks: [
      { match: "false positive", reason: "demo shows the guarded-false-positive proof boundary", ignoreCase: true },
      { match: "sample", reason: "demo stays a sample, not an anonymous audit", ignoreCase: true }
    ],
    expectedLinks: ["/", "/packages", "/check"]
  },
  {
    path: "/packages",
    name: "packages",
    acceptStatuses: [200],
    titlePattern: /Packages - SEO Fix Kit/,
    canonical: "/packages",
    copyChecks: [
      { match: "package ladder", reason: "packages shows the package ladder", ignoreCase: true },
      { match: "No ranking or traffic guarantee", reason: "packages keeps the no-ranking boundary" }
    ],
    expectedLinks: ["/", "/check", "/support"]
  }
];

// Where the access request form must be: email input, hidden company
// honeypot, submit CTA. Inspect only; never submit.
export const ACCESS_FORM_EXPECTATIONS = {
  emailSelector: "#email",
  emailType: "email",
  emailRequired: true,
  companySelector: "#company",
  companyTabIndex: "-1",
  companyAutocomplete: "off",
  submitLabel: "Email access link"
};

// Network request failures that are expected in a headless walk and are not
// product defects: Cloudflare RUM beacons (analytics, not funnel surface).
const BENIGN_REQUEST_FAILURES = [/cdn-cgi\/rum/i, /static\.cloudflareinsights\.com/i];

// NOTE: the direct-run block lives at the END of this module, after every
// const and function declaration. A top-level `await main()` before those
// declarations exist would hit the temporal dead zone because module
// evaluation suspends at the await.

async function main() {
  const baseUrl = DEFAULT_BASE_URL;
  try {
    const result = await runPrivateBetaFunnelWalk({ baseUrl, timeoutMs: DEFAULT_TIMEOUT_MS });
    console.log(JSON.stringify(result, null, 2));
    console.log("\n" + funnelWalkSummary(result));
    process.exitCode = WALK_EXIT_CODES[result.status];
  } catch (error) {
    console.error(`Funnel walk could not run: ${String(error?.message || error)}`);
    process.exitCode = WALK_EXIT_CODES.error;
  }
}

// Runs the full live walk with a real browser. Returns the walk record; see
// the module header for the shape. Exported for scripting reuse; the offline
// regression lock uses the pure helpers below, not this browser path.
export async function runPrivateBetaFunnelWalk({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  browser = null
}) {
  const start = Date.now();
  const { chromium } = await import("playwright");
  const launched = browser || (await chromium.launch({ headless: true }));

  const stops = [];
  const failures = [];
  let consoleErrors = [];
  let requestFailures = [];
  let accessRequest = null;

  try {
    for (const [viewportIndex, viewport] of [
      { name: "desktop", width: 1280, height: 900 },
      { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true, userAgent: mobileUserAgent() }
    ].entries()) {
      const context = await launched.newContext(viewport);
      const page = await context.newPage();
      const scopedConsoleErrors = [];
      const scopedRequestFailures = [];
      page.on("console", (message) => {
        if (message.type() === "error") scopedConsoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => scopedConsoleErrors.push(String(error?.message || error)));
      page.on("requestfailed", (request) => {
        const url = request.url();
        if (!BENIGN_REQUEST_FAILURES.some((pattern) => pattern.test(url))) {
          scopedRequestFailures.push({ url, error: String(request.failure()?.errorText || "failed") });
        }
      });

      for (const stop of FUNNEL_STOPS) {
        const evidence = await walkStop({
          baseUrl,
          stop,
          page,
          timeoutMs,
          viewport: viewport.name
        });
        stops.push(evidence);
        const stopFailures = evaluateStopEvidence(evidence);
        if (stopFailures.length > 0) {
          failures.push(...stopFailures.map((reason) => `${viewport.name} ${stop.path}: ${reason}`));
        }
        if (viewport.name === "desktop" && stop.path === "/" && stop.accessForm) {
          accessRequest = {
            mode: "observe",
            submitted: false,
            route: "/",
            form: stop.accessForm,
            note: "Access request form inspected but not submitted: observe mode only, no waitlist lead or access token created."
          };
        }
      }

      consoleErrors.push(...scopedConsoleErrors.map((text) => ({ viewport: viewport.name, message: text })));
      requestFailures.push(...scopedRequestFailures.map((failure) => ({ viewport: viewport.name, ...failure })));
      await context.close();
    }
  } finally {
    if (!browser) await launched.close().catch(() => {});
  }

  if (consoleErrors.length > 0) {
    failures.push(`console/page errors on ${consoleErrors.length} event(s): ${consoleErrors.map((entry) => entry.message).slice(0, 3).join(" | ")}`);
  }
  if (requestFailures.length > 0) {
    failures.push(
      `non-benign request failures on ${requestFailures.length} resource(s): ${requestFailures
        .map((failure) => failure.url)
        .slice(0, 3)
        .join(" | ")}`
    );
  }

  const status = failures.length === 0 ? WALK_STATUS.PASS : WALK_STATUS.FAIL;
  return {
    status,
    baseUrl,
    walkedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    viewports: ["desktop", "mobile"],
    stops,
    consoleErrors,
    requestFailures,
    accessRequest,
    failures
  };
}

function mobileUserAgent() {
  return (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
  );
}

// Walks one stop in one viewport and records raw evidence. Never submits the
// access form; the access request check is inspect-only.
async function walkStop({ baseUrl, stop, page, timeoutMs, viewport }) {
  const path = stop.path;
  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "networkidle",
    timeout: timeoutMs
  }).catch((error) => ({ status: () => 0, error: String(error?.message || error) }));

  await page.waitForTimeout(500);

  const httpStatus = typeof response.status === "function" ? response.status() : 0;
  const finalUrl = page.url();

  const pageState = await page
    .evaluate(() => {
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      const bodyText = document.body ? document.body.innerText : "";
      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => anchor.getAttribute("href"))
        .filter((href) => href && !href.startsWith("#") && !/^(mailto:|tel:|javascript:)/i.test(href));
      const scrollWidth = document.documentElement.scrollWidth;
      const innerWidth = window.innerWidth;
      const emailInput = document.querySelector("#email");
      const companyInput = document.querySelector("#company");
      const submitButton = Array.from(document.querySelectorAll("button[type='submit']")).find(
        (button) => (button.textContent || "").trim() === "Email access link"
      );
      return {
        title: document.title,
        canonical: canonicalLink ? canonicalLink.getAttribute("href") : "",
        bodyText,
        anchors: [...new Set(anchors)],
        scrollWidth,
        innerWidth,
        accessForm: {
          emailPresent: Boolean(emailInput),
          emailType: emailInput ? emailInput.getAttribute("type") : null,
          emailRequired: emailInput ? emailInput.hasAttribute("required") : false,
          companyPresent: Boolean(companyInput),
          companyTabIndex: companyInput ? companyInput.getAttribute("tabindex") : null,
          companyAutocomplete: companyInput ? companyInput.getAttribute("autocomplete") : null,
          submitPresent: Boolean(submitButton),
          submitLabel: submitButton ? submitButton.textContent.trim() : null
        }
      };
    })
    .catch((error) => ({
      title: "",
      canonical: "",
      bodyText: "",
      anchors: [],
      scrollWidth: 0,
      innerWidth: 0,
      accessForm: null,
      walkerError: String(error?.message || error)
    }));

  const brokenLinks = await checkLinksLive({ baseUrl, anchors: pageState.anchors, timeoutMs });
  const horizontalOverflow = pageState.scrollWidth > pageState.innerWidth + 1;

  const copyChecks = stop.copyChecks.map((check) => ({
    match: check.match,
    present: hasContent(pageState.bodyText, check.match, check.ignoreCase)
  }));

  const expectedLinks = stop.expectedLinks.map((href) => ({
    href,
    present: pageState.anchors.some((anchor) => anchor === href || anchor.startsWith(`${href}?`) || anchor.startsWith(`${href}#`))
  }));

  const accessForm =
    stop.accessForm && pageState.accessForm
      ? {
          emailPresent: pageState.accessForm.emailPresent,
          emailType: pageState.accessForm.emailType,
          emailRequired: pageState.accessForm.emailRequired,
          companyPresent: pageState.accessForm.companyPresent,
          companyTabIndex: pageState.accessForm.companyTabIndex,
          companyAutocomplete: pageState.accessForm.companyAutocomplete,
          submitPresent: pageState.accessForm.submitPresent,
          submitLabel: pageState.accessForm.submitLabel
        }
      : null;

  return {
    path,
    name: stop.name,
    viewport,
    httpStatus,
    finalUrl,
    title: pageState.title,
    canonical: pageState.canonical,
    copyChecks,
    expectedLinks,
    brokenLinks,
    horizontalOverflow: { scrollWidth: pageState.scrollWidth, innerWidth: pageState.innerWidth, overflow: horizontalOverflow },
    accessForm,
    walkerError: pageState.walkerError || (response.error ? response.error : null)
  };
}

// Fetches every same-origin anchor once and records non-200 results. A link
// is live when the final response (after redirects) is HTTP 200. External
// links and anchors on other hosts are out of scope for the funnel walk.
async function checkLinksLive({ baseUrl, anchors, timeoutMs }) {
  const origin = new URL(baseUrl).origin;
  const unique = [...new Set(anchors)].filter((href) => href.startsWith("/") || href.startsWith(origin));
  const broken = [];
  const checked = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await Promise.all(
      unique.map(async (href) => {
        const url = href.startsWith("/") ? `${origin}${href}` : href;
        try {
          const probe = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal
          });
          checked.push({ href, status: probe.status });
          if (probe.status !== 200) {
            broken.push({ href, status: probe.status });
          }
        } catch (error) {
          broken.push({ href, status: null, error: String(error?.message || error) });
        }
      })
    );
  } finally {
    clearTimeout(timer);
  }
  return { checked, broken };
}

// The item's per-stop assertions, kept in one place so the live walk and the
// offline regression lock cannot drift. Every field checked here is recorded
// by walkStop from the rendered DOM.
export function evaluateStopEvidence(evidence) {
  const failures = [];
  if (!evidence || typeof evidence !== "object") return ["missing stop evidence"];

  const stop = FUNNEL_STOPS.find((candidate) => candidate.path === evidence.path);
  if (!stop) return [`unknown stop path ${evidence.path}`];

  if (!stop.acceptStatuses.includes(evidence.httpStatus)) {
    failures.push(`returned HTTP ${evidence.httpStatus} instead of ${stop.acceptStatuses.join(" or ")}`);
  }
  if (typeof evidence.title !== "string" || !stop.titlePattern.test(evidence.title)) {
    failures.push(`title ${JSON.stringify(evidence.title || "")} does not match ${stop.titlePattern}`);
  }
  if (stop.canonical) {
    const canonicalMatches =
      typeof evidence.canonical === "string" &&
      (evidence.canonical === stop.canonical ||
        evidence.canonical === `${DEFAULT_BASE_URL}${stop.canonical}` ||
        evidence.canonical.endsWith(stop.canonical));
    if (!canonicalMatches) {
      failures.push(`canonical ${JSON.stringify(evidence.canonical || "")} is not ${stop.canonical}`);
    }
  }
  for (const check of stop.copyChecks || []) {
    const checkResult = (evidence.copyChecks || []).find((record) => record.match === check.match);
    if (!checkResult || checkResult.present !== true) {
      failures.push(check.reason || `missing copy ${check.match}`);
    }
  }
  for (const link of stop.expectedLinks || []) {
    const linkResult = (evidence.expectedLinks || []).find((record) => record.href === link);
    if (!linkResult || linkResult.present !== true) {
      failures.push(`missing expected link ${link}`);
    }
  }
  for (const broken of evidence.brokenLinks?.broken || []) {
    failures.push(`broken internal link ${broken.href} (${broken.status ?? broken.error})`);
  }
  if (evidence.horizontalOverflow?.overflow === true) {
    failures.push(
      `horizontal scroll on ${evidence.viewport}: scrollWidth ${evidence.horizontalOverflow.scrollWidth} > innerWidth ${evidence.horizontalOverflow.innerWidth}`
    );
  }
  if (stop.accessForm) {
    if (!evidence.accessForm) {
      failures.push("access request form not found");
    } else {
      const form = evidence.accessForm;
      if (form.emailPresent !== true || form.emailType !== ACCESS_FORM_EXPECTATIONS.emailType || form.emailRequired !== true) {
        failures.push("access request email input missing or not a required email field");
      }
      if (form.companyPresent !== true || form.companyTabIndex !== "-1" || form.companyAutocomplete !== "off") {
        failures.push("access request company honeypot missing or not hidden");
      }
      if (form.submitPresent !== true || form.submitLabel !== ACCESS_FORM_EXPECTATIONS.submitLabel) {
        failures.push("access request submit CTA missing or not labeled 'Email access link'");
      }
    }
  }
  if (evidence.walkerError) {
    failures.push(`page state unavailable: ${evidence.walkerError}`);
  }
  return failures;
}

// The human-readable journal summary of a walk result (the item's verify
// clause: "walk JSON summarized in journal").
export function funnelWalkSummary(result) {
  if (!result || !Array.isArray(result.stops)) return "Funnel walk produced no stops.";
  const perStop = {};
  for (const evidence of result.stops) {
    const failures = evaluateStopEvidence(evidence);
    perStop[`${evidence.viewport} ${evidence.path}`] = failures.length === 0 ? "ok" : `FAIL: ${failures.join("; ")}`;
  }
  const lines = [
    `Private-beta funnel walk ${result.status} (${result.baseUrl}, walkedAt ${result.walkedAt || ""})`,
    ...Object.entries(perStop).map(([stop, state]) => `  ${stop}: ${state}`)
  ];
  if (result.accessRequest) {
    lines.push(
      `  access request: ${result.accessRequest.mode} mode, form ${result.accessRequest.form ? "inspected" : "missing"} (${result.accessRequest.note})`
    );
  }
  if (result.consoleErrors?.length) {
    lines.push(`  console/page errors: ${result.consoleErrors.length}`);
    for (const entry of result.consoleErrors.slice(0, 5)) lines.push(`    ${entry.viewport}: ${entry.message}`);
  } else {
    lines.push("  console/page errors: none");
  }
  if (result.requestFailures?.length) {
    lines.push(`  non-benign request failures: ${result.requestFailures.length}`);
  } else {
    lines.push("  non-benign request failures: none");
  }
  lines.push(`  stops: ${result.stops.length} (${[...new Set(result.stops.map((stop) => stop.name))].join(" → ")}) across viewports ${(result.viewports || []).join(", ")}`);
  return lines.join("\n");
}

function hasContent(text, match, ignoreCase = false) {
  if (typeof text !== "string") return false;
  return ignoreCase ? text.toLowerCase().includes(match.toLowerCase()) : text.includes(match);
}

function isDirectRun() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}

if (isDirectRun()) {
  await main();
}
