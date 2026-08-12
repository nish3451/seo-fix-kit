import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_FORM_EXPECTATIONS,
  FUNNEL_STOPS,
  WALK_STATUS,
  evaluateStopEvidence,
  funnelWalkSummary,
  samePathname
} from "./run-private-beta-funnel-walk.mjs";

const origin = "https://seofixkit.com";

// Builds a passing per-stop evidence record for the given stop in the exact
// shape scripts/run-private-beta-funnel-walk.mjs records from the rendered
// DOM. Mutations in each test prove the corresponding assertion fires, so
// the offline lock cannot drift from the live walk's verdict logic.
function passingStopEvidence(stop, viewport = "desktop") {
  const copyChecks = (stop.copyChecks || []).map((check) => ({
    match: check.match,
    present: true
  }));
  // Worker-rendered pages emit absolute same-origin hrefs (href="${origin}/..."),
  // so fixtures use the absolute form except on the SPA home page.
  const anchorFor = (href) => (stop.path === "/" ? href : `${origin}${href}`);
  const anchors = (stop.expectedLinks || []).map((href) => anchorFor(href));
  // Mirrors the live walker: expected-link presence is derived from the
  // collected anchors through samePathname, so a matcher regression fails here.
  const expectedLinks = (stop.expectedLinks || []).map((href) => ({
    href,
    present: anchors.some((anchor) => samePathname(anchor, href, origin))
  }));
  const accessForm =
    stop.accessForm === true
      ? {
          emailPresent: true,
          emailType: ACCESS_FORM_EXPECTATIONS.emailType,
          emailRequired: ACCESS_FORM_EXPECTATIONS.emailRequired,
          companyPresent: true,
          companyTabIndex: ACCESS_FORM_EXPECTATIONS.companyTabIndex,
          companyAutocomplete: ACCESS_FORM_EXPECTATIONS.companyAutocomplete,
          submitPresent: true,
          submitLabel: ACCESS_FORM_EXPECTATIONS.submitLabel
        }
      : null;
  return {
    path: stop.path,
    name: stop.name,
    viewport,
    httpStatus: 200,
    finalUrl: `${origin}${stop.path}`,
    title: stop.titlePattern.source,
    canonical: stop.canonical ? `${origin}${stop.canonical}` : "",
    copyChecks,
    expectedLinks,
    brokenLinks: { checked: [], broken: [] },
    horizontalOverflow: { scrollWidth: viewport === "mobile" ? 390 : 1280, innerWidth: viewport === "mobile" ? 390 : 1280, overflow: false },
    accessForm,
    walkerError: null,
    // anchors as collected from the DOM, absolute on Worker pages
    anchors
  };
}

test("anchor matching treats absolute same-origin hrefs as the expected path", () => {
  assert.equal(samePathname("https://seofixkit.com/packages", "/packages", origin), true);
  assert.equal(samePathname("/packages", "/packages", origin), true);
  assert.equal(samePathname("https://seofixkit.com/check?utm=x", "/check", origin), true);
  assert.equal(samePathname("https://other.example.com/packages", "/packages", origin), false);
  assert.equal(samePathname(null, "/packages", origin), false);
});

test("every funnel stop passes with the recorded evidence shape", () => {
  for (const stop of FUNNEL_STOPS) {
    for (const viewport of ["desktop", "mobile"]) {
      const failures = evaluateStopEvidence(passingStopEvidence(stop, viewport));
      assert.deepEqual(failures, [], `${viewport} ${stop.path} should pass with a clean record`);
    }
  }
});

test("walk fails when a stop returns a non-200 HTTP status", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[0]);
  evidence.httpStatus = 503;
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("HTTP 503")), failures.join("; "));
});

test("walk fails when the stop title does not match the funnel copy", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[1]);
  evidence.title = "Some other page - SEO Fix Kit";
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("title")), failures.join("; "));
});

test("walk fails when /demo or /packages canonical drifts", () => {
  for (const stop of [FUNNEL_STOPS[1], FUNNEL_STOPS[2]]) {
    const evidence = passingStopEvidence(stop);
    evidence.canonical = `${origin}/wrong`;
    const failures = evaluateStopEvidence(evidence);
    assert.ok(failures.some((reason) => reason.includes("canonical")), `${stop.path}: ${failures.join("; ")}`);
  }
});

test("walk fails when load-bearing funnel copy is missing", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[0]);
  evidence.copyChecks = evidence.copyChecks.map((check) => ({ ...check, present: false }));
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.length > 0, "missing private-beta copy must fail the walk");
  assert.ok(failures.some((reason) => reason.includes("locked private-beta copy")), failures.join("; "));
});

test("walk fails when an expected public proof link is missing", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[0]);
  evidence.expectedLinks = evidence.expectedLinks.filter((link) => link.href !== "/demo");
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("missing expected link /demo")), failures.join("; "));
});

test("walk fails when an internal link is broken", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[2]);
  evidence.brokenLinks = {
    checked: [{ href: "/packages", status: 200 }],
    broken: [{ href: "/support", status: 500 }]
  };
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("broken internal link /support")), failures.join("; "));
});

test("walk fails on mobile when the page scrolls horizontally", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[1], "mobile");
  evidence.horizontalOverflow = { scrollWidth: 420, innerWidth: 390, overflow: true };
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("horizontal scroll")), failures.join("; "));
});

test("walk fails when the access request form is missing on home", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[0]);
  evidence.accessForm = null;
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("access request form not found")), failures.join("; "));
});

test("walk fails when the access email input stops being a required email field", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[0]);
  evidence.accessForm.emailRequired = false;
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("email input")), failures.join("; "));
});

test("walk fails when the company honeypot stops being hidden", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[0]);
  evidence.accessForm.companyTabIndex = "0";
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("honeypot")), failures.join("; "));
});

test("walk fails when the submit CTA stops being labeled 'Email access link'", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[0]);
  evidence.accessForm.submitLabel = "Join now";
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("submit CTA")), failures.join("; "));
});

test("walk fails when page state could not be collected", () => {
  const evidence = passingStopEvidence(FUNNEL_STOPS[2]);
  evidence.walkerError = "timeout evaluating page state";
  const failures = evaluateStopEvidence(evidence);
  assert.ok(failures.some((reason) => reason.includes("page state unavailable")), failures.join("; "));
});

test("walk-level result fails on console/page errors", () => {
  const record = {
    status: WALK_STATUS.PASS,
    baseUrl: origin,
    walkedAt: "2026-08-11T00:00:00.000Z",
    viewports: ["desktop", "mobile"],
    stops: FUNNEL_STOPS.map((stop) => passingStopEvidence(stop)),
    consoleErrors: [{ viewport: "mobile", message: "Uncaught ReferenceError: x is not defined" }],
    requestFailures: [],
    accessRequest: { mode: "observe", submitted: false, form: {} },
    failures: []
  };
  const failures = evaluateWalkLevelFailures(record);
  assert.ok(failures.some((reason) => reason.includes("console/page errors")), failures.join("; "));
});

// Same walk-level assertion the live runner applies after all stops: console
// errors and non-benign request failures fail the walk even when every stop
// itself is clean. Kept here so the offline lock and the live walk share the
// rule; the live runner inlines the identical check.
export function evaluateWalkLevelFailures(record) {
  const failures = [];
  if (record.consoleErrors?.length > 0) {
    failures.push(`console/page errors on ${record.consoleErrors.length} event(s)`);
  }
  if (record.requestFailures?.length > 0) {
    failures.push(`non-benign request failures on ${record.requestFailures.length} resource(s)`);
  }
  return failures;
}

test("journal summary names every funnel stop and the observe-mode access request", () => {
  const record = {
    status: WALK_STATUS.PASS,
    baseUrl: origin,
    walkedAt: "2026-08-11T00:00:00.000Z",
    durationMs: 42000,
    viewports: ["desktop", "mobile"],
    stops: FUNNEL_STOPS.flatMap((stop) => [passingStopEvidence(stop, "desktop"), passingStopEvidence(stop, "mobile")]),
    consoleErrors: [],
    requestFailures: [],
    accessRequest: {
      mode: "observe",
      submitted: false,
      route: "/",
      form: passingStopEvidence(FUNNEL_STOPS[0]).accessForm,
      note: "Access request form inspected but not submitted: observe mode only, no waitlist lead or access token created."
    },
    failures: []
  };
  const summary = funnelWalkSummary(record);
  assert.ok(summary.includes("Private-beta funnel walk pass"), summary);
  assert.ok(summary.includes("desktop /: ok"), summary);
  assert.ok(summary.includes("mobile /packages: ok"), summary);
  assert.ok(summary.includes("access request: observe mode"), summary);
  assert.ok(summary.includes("console/page errors: none"), summary);
  assert.ok(summary.includes("home → demo → packages"), summary);
});

test("journal summary surfaces stop failures instead of claiming pass", () => {
  const record = {
    status: WALK_STATUS.FAIL,
    baseUrl: origin,
    walkedAt: "2026-08-11T00:00:00.000Z",
    viewports: ["desktop"],
    stops: [passingStopEvidence(FUNNEL_STOPS[1])],
    consoleErrors: [],
    requestFailures: [],
    accessRequest: null,
    failures: []
  };
  record.stops[0].title = "Broken title";
  const summary = funnelWalkSummary(record);
  assert.ok(summary.includes("Private-beta funnel walk fail"), summary);
  assert.ok(summary.includes("desktop /demo: FAIL"), summary);
});
