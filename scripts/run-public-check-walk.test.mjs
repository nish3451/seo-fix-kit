import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicCheckResponse } from "../worker/routes/public-check.js";
import {
  WALK_STATUS,
  findUnsupportedClaims,
  runPublicCheckWalk,
  validateWalkPayload,
  walkRecord
} from "./run-public-check-walk.mjs";

const origin = "https://seofixkit.com";

// A minimal report in the exact shape the shared engine produces, reused to
// build the walk payload through buildPublicCheckResponse - the same mapping
// the deployed Worker uses - so the walk test cannot drift from the API.
function makeEngineShapedReport() {
  return {
    url: `${origin}/fixture/rendered-page`,
    scannedAt: "2026-08-11T00:00:00.000Z",
    durationMs: 1234,
    pages: [
      {
        url: `${origin}/fixture/rendered-page`,
        finalUrl: `${origin}/fixture/rendered-page`,
        static: { wordCount: 3 },
        rendered: {
          finalUrl: `${origin}/fixture/rendered-page`,
          wordCount: 277,
          title: "Rendered fixture page",
          h1s: ["Rendered fixture page with real content"],
          internalLinks: [{ href: "/fixture/rendered-page" }, { href: "/fixture/robots.txt" }]
        }
      }
    ],
    summary: { critical: 1, warnings: 1, notices: 0, guardedFalsePositives: 1, totalFindings: 3 },
    findings: [
      {
        type: "guard",
        severity: "good",
        title: "False positive guarded on fixture: rendered content is not thin",
        why: "The static HTML looks thin, but the browser render shows substantial content.",
        evidence: "277 rendered words found.",
        fix: "No thin-content fix is needed for this page based on rendered text."
      },
      {
        type: "issue",
        severity: "critical",
        title: "Canonical conflicts with noindex on fixture",
        why: "A page should not consolidate signals while telling engines not to index it.",
        evidence: "Canonical: https://seofixkit.com/fixture/rendered-page; robots meta: noindex.",
        fix: "If the page should rank, remove noindex."
      },
      {
        type: "issue",
        severity: "warning",
        title: "Long title on fixture",
        fix: "Shorten the title."
      }
    ]
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function passingPayload() {
  return buildPublicCheckResponse(makeEngineShapedReport());
}

test("walk passes against the exact payload shape the API returns for the fixture", async () => {
  const payload = passingPayload();
  assert.deepEqual(validateWalkPayload(payload), []);
  const fetcher = async () => jsonResponse(payload);
  const result = await runPublicCheckWalk({ baseUrl: origin, fetcher });
  assert.equal(result.status, WALK_STATUS.PASS);
  assert.equal(result.proof.checkedUrl, `${origin}/fixture/rendered-page`);
  assert.equal(result.proof.measured.renderedWordCount, 277);
  assert.equal(result.proof.measured.renderedH1, "Rendered fixture page with real content");
  assert.equal(result.proof.issues.guardedFalsePositives, 1);
  assert.equal(result.proof.guards.length, 1);
  assert.equal(result.proof.guards[0].severity, "good");
  assert.equal(result.proof.findings.length, 2);
  assert.ok(result.proof.nextStep.includes("private beta"), "access conversion hands into the private beta");
  assert.ok(result.proof.boundary.includes("does not guarantee rankings"), "boundary keeps the no-ranking promise");
});

test("walk fails when proof fields are missing", async () => {
  const payload = passingPayload();
  delete payload.measured;
  delete payload.issues;
  delete payload.engineVersion;
  const failures = validateWalkPayload(payload);
  assert.ok(failures.includes("missing measured proof fields"));
  assert.ok(failures.includes("missing issues counts"));
  assert.ok(failures.includes("missing engineVersion"));
  const result = await runPublicCheckWalk({
    baseUrl: origin,
    fetcher: async () => jsonResponse(payload)
  });
  assert.equal(result.status, WALK_STATUS.FAIL);
  assert.ok(result.failures.length > 0);
});

test("walk fails when measured word counts are not real numbers", async () => {
  const payload = passingPayload();
  payload.measured.staticWordCount = "not a number";
  const failures = validateWalkPayload(payload);
  assert.ok(failures.includes("measured word counts are not numbers"));
});

test("walk fails when the next step or boundary stops handing into private access", async () => {
  const noHandoff = passingPayload();
  noHandoff.nextStep = "Nothing more to do.";
  const handoffFailures = validateWalkPayload(noHandoff);
  assert.ok(handoffFailures.some((failure) => failure.includes("nextStep")));

  const noBoundary = passingPayload();
  noBoundary.boundary = "This check will rank your page.";
  const boundaryFailures = validateWalkPayload(noBoundary);
  assert.ok(boundaryFailures.some((failure) => failure.includes("boundary")));
});

test("walk fails on unsupported result claims but not on truthful negated copy", () => {
  const payload = passingPayload();
  assert.deepEqual(findUnsupportedClaims(payload), [], "truthful boundary copy must not be flagged");

  const claimed = JSON.parse(JSON.stringify(payload));
  claimed.boundary = "This check guarantees rankings and traffic.";
  assert.deepEqual(findUnsupportedClaims(claimed), ["guarantees rankings"]);

  const promised = JSON.parse(JSON.stringify(payload));
  promised.nextStep = "It promises indexing for your site.";
  assert.deepEqual(findUnsupportedClaims(promised), ["promises indexing"]);

  const aiCitation = JSON.parse(JSON.stringify(payload));
  aiCitation.boundary = "We guarantee AI citations within a week.";
  assert.deepEqual(findUnsupportedClaims(aiCitation), ["guarantee AI citations"]);
});

test("walk reports needs-quota on 429 with the reset window", async () => {
  const result = await runPublicCheckWalk({
    baseUrl: origin,
    fetcher: async () =>
      jsonResponse(
        { error: "Daily one-page check limit reached from this network. Try again tomorrow.", resetAt: "2026-08-12T00:00:00.000Z" },
        429
      )
  });
  assert.equal(result.status, WALK_STATUS.NEEDS_QUOTA);
  assert.equal(result.resetAt, "2026-08-12T00:00:00.000Z");
});

test("walk fails when the endpoint is unreachable", async () => {
  const result = await runPublicCheckWalk({
    baseUrl: origin,
    fetcher: async () => {
      throw new Error("network down");
    }
  });
  assert.equal(result.status, WALK_STATUS.FAIL);
  assert.match(result.reason, /network down/);
});

test("walk fails on a non-200 non-429 response", async () => {
  const result = await runPublicCheckWalk({
    baseUrl: origin,
    fetcher: async () => jsonResponse({ error: "Check storage is not configured." }, 503)
  });
  assert.equal(result.status, WALK_STATUS.FAIL);
  assert.equal(result.httpStatus, 503);
});

test("walkRecord keeps only the fields the page renders and the verify acceptance names", () => {
  const record = walkRecord(passingPayload());
  assert.deepEqual(Object.keys(record).sort(), [
    "boundary",
    "checkedUrl",
    "engineVersion",
    "finalUrl",
    "findings",
    "guards",
    "issues",
    "measured",
    "nextStep",
    "scannedAt"
  ]);
  assert.equal(record.guards[0].why, undefined, "guard details stay out of the compact record");
  assert.equal(record.findings[0].evidence, undefined, "finding details stay out of the compact record");
});
