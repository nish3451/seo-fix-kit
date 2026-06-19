# Audit Signal Hardening Plan

Created: 2026-06-19

## Problem

The live SEO Fix Kit self-audit is mostly healthy, but two findings make the product look less ready than the actual page:

- PageSpeed public quota failures are shown as repair findings even though they are evidence limitations, not customer-controlled SEO issues.
- Browser-marked non-blocking scripts are still counted as render-blocking candidates by the fallback timing heuristic.

This weakens buyer trust because the Fix Pack can recommend work that is not a real site repair.

## Scope

Keep performance evidence visible, but only create repair findings for issues the audited site can actually fix. Do not remove PageSpeed, Resource Timing, or fallback coverage.

## Requirements

- R1. PageSpeed unavailable or quota-limited states remain visible in the report proof snapshot.
- R2. PageSpeed unavailable or quota-limited states do not count as actionable findings or Fix Pack repair work.
- R3. Resource waterfall classification honors explicit browser `renderBlockingStatus` values.
- R4. Resources marked `non-blocking` by the browser are not treated as render-blocking candidates.
- R5. Existing fallback render-blocking detection still works when the browser does not provide `renderBlockingStatus`.
- R6. Public demo and support pages should pass the product's own rendered content-depth standard.
- R7. The sitemap should list canonical HTML pages, while `llms.txt` stays directly reachable and documented outside the sitemap.

## Implementation Units

### U1. PageSpeed Source Limitation Handling

- Files: `shared/audit-engine.js`, `shared/audit-engine.test.mjs`
- Change: Treat unavailable PageSpeed as report context only.
- Test: Assert unavailable PageSpeed creates no finding while the performance snapshot still records status and reason.

### U2. Render-Blocking Candidate Classification

- Files: `shared/resource-waterfall.js`, `shared/audit-engine.test.mjs`
- Change: Trust explicit browser render-blocking status before applying the fallback timing heuristic.
- Test: Assert explicit `non-blocking` assets do not create a render-blocking finding, while status-less early scripts/styles still use fallback classification.

### U3. Launch Verification

- Run focused audit-engine tests, full local checks, security/deploy dry-run gates, and a live self-audit after deploy if the change ships.

### U4. Public Page Self-Audit Cleanup

- Files: `worker/routes/pages.js`, `worker/routes/pages.test.mjs`, `shared/audit-engine.js`, `public/sitemap.xml`, `server/local-developer-api-security-smoke-test.js`
- Change: Expand demo/support content with buyer-useful detail and remove `llms.txt` from sitemap URL sets.
- Test: Assert demo/support pages are no longer thin and sitemap output does not treat `llms.txt` as an indexable page.

## Out Of Scope

- New pricing, checkout changes, CMS/GitHub repair execution, or recurring monitoring offers.
- Hiding real performance opportunities when PageSpeed succeeds.
