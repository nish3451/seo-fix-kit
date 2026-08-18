# Lane 1 report: intent-matching SEO/GEO landing pages — verification + live proof pin

Date: 2026-08-15
Worker: fleet-dispatch-lane-worker-seo-fix-kit-1
Branch: `lane1/intent-landing-pages-verify-20260815`
Item: `96347045e9` — "Add intent-matching SEO/GEO landing pages with machine-readable proof [research 2026-08-08, rank: 2, risk: green]"

## Outcome

**Item already implemented, tested, and live on `origin/main`.** The
intent-matching SEO/GEO landing pages shipped in commit `de0fa20` ("feat: add
intent-matching SEO/GEO landing pages with machine-readable proof (#137)",
merged 2026-08-14). This dispatch's scout item describes a state PR #137
already fixed; a prior lane worker already reported the delivery
(`.lane/reports/lane1-intent-landing-pages-20260814.md`).

Rather than re-implementing, I verified the shipped state and closed one real
verification gap: the offline `worker/routes/pages.test.mjs` pins the three
JSON-LD blocks per landing page, but the live spot-check
(`scripts/live-promise-spot-check.mjs`) only asserted visible copy, not the
machine-readable proof the item's headline names. This lane makes the live
spot-check assert the JSON-LD proof too, so a deployed Worker that loses the
schema fails the repeatable live check instead of passing on copy alone.

## What is already landed (PR #137)

Three Worker-served, intent-matching public landing pages, each with unique
title/meta/canonical, a visible FAQ rendered from the same array as FAQPage
JSON-LD, truthful SoftwareApplication schema, a "What this page does not
claim" section, and links into `/check` and `/demo`:

- `/small-business-seo-audit`
- `/rendered-vs-static-seo-audit`
- `/ai-answer-readiness`

Wired into the Worker router, the Express local mirror, `llms.txt`,
`homeMarkdown`, `rootSitemap`, `public/sitemap.xml`, `.well-known/skill.md`,
and README. None claim live AI-engine sampling, AI citation monitoring, or
rankings.

## What this lane changed

| Path | Why |
|------|-----|
| `scripts/live-promise-spot-check.mjs` | Added `landingPageLdExpectations()` and wired it into the three landing-page spot-checks: each live page must now emit the WebPage JSON-LD naming that page, a SoftwareApplication block for the tool, an FAQPage block, and the visible FAQ (proving the schema still shares its source with the visible copy). |
| `scripts/live-promise-spot-check.test.mjs` | Four mutation tests proving the checks bite: lost FAQPage block, visible FAQ drifted from the FAQ schema source, renamed WebPage block, changed SoftwareApplication type. |
| `.lane/reports/lane1-intent-landing-pages-verify-20260815.md` | This report. |

## Evidence

Offline (this worktree, fresh `origin/main` + this branch):

- `node --test scripts/live-promise-spot-check.test.mjs` — 18/18 pass
  (was 14; +4 new JSON-LD mutation tests)
- `node --test worker/routes/pages.test.mjs` — 14/14 pass (landing pages
  still emit 3 JSON-LD blocks each, unique titles, no-overclaim copy)
- `npm run check` — exit 0 across every suite in the canonical chain
  (billing, product-truth, audit, worker dispatch, public pages,
  public-check, audit-engine, account, ai-answer-readiness, growth,
  repair-queue, repair-proof-receipt, repair-implementation-pack,
  repair-agent, developer-api, remediation, audit-batch-runner, webhooks,
  app-contract, promise-audit, live-promise-spot-check, funnel-walk,
  large-crawl, canary-dry-run, check-inventory) plus the vite build.
  Zero failures across all suites.

Live (deployed `https://seofixkit.com`, 2026-08-15):

- `npm run audit:live-promise` — all 20 checks pass, including the three
  landing pages now asserting WebPage + SoftwareApplication + FAQPage
  JSON-LD and the visible-FAQ source match on the live deployed pages.

## Recommendation for the lane controller

Mark item `96347045e9` complete. The feature landed via PR #137 on 2026-08-14
and this lane independently verified it both offline (pinned suites) and
live (deployed pages ship the machine-readable proof). The live spot-check
now guards the machine-readable proof surface going forward, so the item's
core promise can no longer regress silently on deploy.

## Notes

- Claims were published to `lane-1.json` (`scripts/live-promise-spot-check.mjs`,
  `scripts/live-promise-spot-check.test.mjs`,
  `.lane/reports/lane1-intent-landing-pages-verify-20260815.md`) before
  editing and no other field was modified.
- No shared report files were touched; this report is lane-unique.
- `node_modules` is untracked (gitignored), not part of the branch.
