# Lane 1 report: real before/after repair proof receipt reship (2026-08-15)

Branch: lane1/proof-receipt-reship-20260815
Item: c86782c66e — Ship a real before/after proof receipt from one completed
beta repair (research 2026-08-08, rank 4, risk amber)
Date: 2026-08-15

## Outcome

**Code shipped, tests green.** `/proof` (HTML) and `/proof.md` (markdown) now
serve the real before/after repair proof receipt for the first completed beta
repair: the founder-owned Tiny Studio portfolio repair, same measurement path
before (85/7), intermediate rerun (99/2), and final same-host rerun (100/0),
pinned to three report ids and two owner-approved PRs (#4 and #5), published
with consent and redaction.

## Why a reship

The item was previously worked on 2026-08-14 (branch
`lane1/proof-receipt-reship-20260814`, PR #138) and 2026-08-11 (PR #73), but
neither merged; main has never shipped `/proof`. This lane rebuilt the receipt
against current main (which moved 17 commits past the earlier merge-base),
updated the promise-audit pins that lock the README public-page wording, and
modernized the page to current public-page conventions.

## What changed

- `worker/routes/pages.js` — added `PROOF_CASE` constant,
  `proofCaseHtml(origin)`, `proofCaseMarkdown(origin)`; added `/proof` to
  `llmsText()` agent context and useful routes; exported the new functions.
  The page ships a canonical, `pageSocialHead` (og/twitter SVG image), a
  truthful `SoftwareApplication` JSON-LD block (matching the landing-page
  machine-proof convention), the before/intermediate/after score panels with
  pinned report ids, the receipt details dl, owner-approved change refs, the
  no-ranking / no-CMS-publishing boundary, and a site footer. It uses the
  current narrow-viewport-safe CSS (no 320px floor, no overflow hiding).
- `worker/index.js` — imported `proofCaseHtml`/`proofCaseMarkdown`; route
  handler serves HTML by default and `text/markdown` for `/proof.md` or
  `Accept: text/markdown`.
- `shared/audit-engine.js` — `rootSitemap()` lists `/proof`.
- `public/sitemap.xml` — `/proof` listed.
- `public/.well-known/skill.md` — `/proof` listed in public proof pages and
  agent context.
- `README.md` — `/proof` listed in public-page promises, live spot-check
  description, and Cloudflare path section.
- `scripts/live-promise-spot-check.mjs` — new `/proof` and `/proof.md` page
  checks; `/sitemap.xml` and `/llms.txt` checks now assert `/proof` is listed.
- `scripts/live-promise-spot-check.test.mjs` — registered the new pages in the
  spot-check pages map and the markdown map; updated expected count to 22.
- `worker/routes/pages.test.mjs` — new test pins scores, report ids, PR refs,
  boundaries, SoftwareApplication JSON-LD, canonical, and the no-320px-floor
  rule; `expectedSitemapUrls` and coverage arrays expanded.
- `worker/index.test.mjs` — new "Worker dispatch serves the real before/after
  repair proof receipt" test covers HTML, markdown via `Accept`, `/proof.md`
  direct path, canonical, and apex-only URLs.
- `shared/promise-audit.test.mjs` — updated the two README public-page wording
  pins to the new `/proof`-inclusive wording and added `/proof` to the
  Worker-routing assertion.

## Verification

- `npm run check` — all 21 test files green (61+13+3+15+10+33+15+4+5+6+11+7+40+34+13+5+14+62+18+23+7+2 = 0 failures).
- `node --test worker/routes/pages.test.mjs` — 15/15.
- `node --test scripts/live-promise-spot-check.test.mjs` — 18/18.
- `node --test worker/index.test.mjs` — 13/13.
- `npm run cf:dry-run` — exit 0.
- `git diff --check` — clean.

## Live deploy note

A merged PR alone will not put the receipt on `https://seofixkit.com/proof`; a
fresh Worker deploy must land afterward. The lane-2 ICP precondition
regression report recorded the fleet-release deploy machinery stuck behind
`c0c8e2e`; when that clears, this branch's route will go live without further
code changes.
