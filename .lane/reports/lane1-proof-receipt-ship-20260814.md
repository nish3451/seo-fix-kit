# Lane 1 report: real before/after repair proof receipt at /proof

Branch: lane1/proof-receipt-reship-20260814
PR: https://github.com/nish3451/seo-fix-kit/pull/138
Item: c86782c66e — Ship a real before/after proof receipt from one completed
beta repair (research 2026-08-08, rank 4, risk amber)
Date: 2026-08-14

## Outcome

**Code shipped, tests green, PR opened.** The receipt is the founder-owned
Tiny Studio portfolio repair: same measurement path before (85/7),
intermediate rerun (99/2), and final same-host rerun (100/0), pinned to
three report ids and two owner-approved PRs (#4 and #5). The receipt is
published with consent and redaction.

## What the receipt shows

- **Site**: Tiny Studio portfolio (`https://tinystudio.in/`)
- **Owner**: founder-owned (consented and redacted)
- **Source report (Before)**:
  `https://seofixkit.com/beta/reports/tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b`
  — score **85**/100, 7 findings (render-blocking resources, missing
  apple-touch-icon, heading hierarchy, structured-data opportunity, llms.txt
  advisory).
- **Intermediate rerun**:
  `https://seofixkit.com/beta/reports/tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50`
  — score **99**/100, 2 findings (only HSTS header notices remained).
- **Final rerun (After)**:
  `https://seofixkit.com/beta/reports/tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961`
  — score **100**/100, 0 findings, 0 guarded false positives.
- **Owner-approved change PR #4**: tracked static Pages bundle, removed
  Google Fonts from render path, non-blocking preload for styles, added
  apple-touch-icon, /llms.txt, support ContactPage JSON-LD, /support
  heading hierarchy, mailto links in place of Cloudflare email-obfuscation,
  social preview images, expanded Promptly privacy copy.
  `https://github.com/nish3451/tinystudio-in/pull/4`
- **Owner-approved change PR #5**: Strict-Transport-Security header via
  `public/_headers`.
  `https://github.com/nish3451/tinystudio-in/pull/5`

## What the receipt states (boundary, not overclaim)

- No ranking, traffic, indexing, citation, or revenue promise is made.
- SEO Fix Kit did not publish CMS changes, open GitHub pull requests, merge
  code, or call provider admin APIs. The merged PRs are owner-applied.
- The receipt is published with founder consent and redaction of internal
  implementation detail; it is not a paid Fix Pack delivery certificate.
- A different site, a different host, or a different starting audit will
  not produce the same numbers. The receipt is a real measurement path on
  this site only.

## Why this is a real receipt (not a sample)

- Same host, same measurement path, three report ids pinned.
- Same owner-approved changes (PR #4 + #5) pinned.
- Real rendered findings, real rerun after each merge, real final 0-finding
  state.
- Published with founder consent and redaction of internal implementation
  detail — the Tiny Studio portfolio site is the founder's own product
  surface, not a customer site.

## Files changed (this PR)

- `worker/routes/pages.js` — added `PROOF_CASE` constant,
  `proofCaseHtml(origin)`, `proofCaseMarkdown(origin)`; added to exports;
  added `/proof` to `llmsText()` agent context and useful routes.
- `worker/index.js` — imports `proofCaseHtml` / `proofCaseMarkdown`;
  `/proof` and `/proof.md` route handler (HTML default, markdown for
  `Accept: text/markdown` or `/proof.md`).
- `shared/audit-engine.js` — `rootSitemap()` lists `/proof`.
- `public/sitemap.xml` — `/proof` listed.
- `public/.well-known/skill.md` — `/proof` listed in public proof pages
  and agent context.
- `README.md` — `/proof` listed in public-page promises (lines 45, 78-83,
  127).
- `scripts/live-promise-spot-check.mjs` — new `/proof` and `/proof.md`
  page spot-checks; `/sitemap.xml` and `/llms.txt` checks now assert
  `/proof` is listed.
- `scripts/live-promise-spot-check.test.mjs` — registered the new pages
  in the spot-check pages map and the markdown map; updated expected
  count to 19.
- `worker/routes/pages.test.mjs` — new test that pins scores, report
  ids, PR refs, and boundaries; `expectedSitemapUrls` and `runWorkerFirst`
  array coverage expanded.
- `worker/index.test.mjs` — new "Worker dispatch serves the real
  before/after repair proof receipt" test covers HTML, markdown via
  `Accept: text/markdown`, and `/proof.md` direct path; llms.txt/sitemap
  coverage expanded.

## Verification performed

- `node --test worker/routes/pages.test.mjs` — 11/11 pass (including the
  new proof receipt test).
- `node --test scripts/live-promise-spot-check.test.mjs` — 14/14 pass
  (including the new /proof + /proof.md checks; test count 17 → 19).
- `node --test worker/index.test.mjs` — 13/13 pass (including the new
  Worker dispatch proof receipt test).

## Why the receipt regressed in the first place

The original PR #73 (commit `c021498`, 2026-08-10) shipped `/proof` with
the same `proofCaseHtml` / `proofCaseMarkdown` exports and a Worker route
handler. Between then and 2026-08-14 the Worker route handler for `/proof`
was dropped (later commits refactored worker/index.js but did not
re-include the handler), and `proofCaseHtml` / `proofCaseMarkdown`
exports were also dropped from `worker/routes/pages.js`. The source
content (`ops/repair-proofs/2026-06-20-tinystudio-before-after.md`) was
intact, but `https://seofixkit.com/proof` has been 404ing since then.

This lane does not re-merge PR #73 verbatim: the receipt is rebuilt
against the current source of truth (current `pageSocialHead`, current
header/footer pattern, current `publicProductPageHtml` style), the report
ids and PR refs are pinned in code rather than baked into a copy-paste of
the old PR, and the live-promise-spot-check / unit tests lock the
boundaries.

## Live deploy note (out of repo scope)

A merged PR will not by itself put the receipt on
`https://seofixkit.com/proof`. The lane-2 ICP precondition regression
report records that the fleet-release deploy machinery has been stuck
behind `c0c8e2e` since 2026-08-14 02:37 (the deployed Worker still
serves the older `assets/index-DX7O9nYF.js` bundle and predates
PR #85/#88/#90/#100 copy changes). This lane ships the code and the
offline regression so a subsequent fleet release will re-enable the
receipt without further code changes.
