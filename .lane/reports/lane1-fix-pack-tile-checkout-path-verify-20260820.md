# Lane report: lane1-fix-pack-tile-checkout-path-verify-20260820

Date: 2026-08-20
Item: `/packages` Fix Pack tile has no checkout path — page presents the $99 paid offer as "LIVE CHECKOUT WHEN ELIGIBLE"
Result: **Already fixed and live on origin/main via PR #141 — verify only, no code change.**

## What the item asked for

The `/packages` Fix Pack tile (worker/routes/pages.js `packagesHtml`) presents
the $99 paid offer with the badge "Live checkout when eligible" but needs a
real checkout path — a route that reaches the Fix Pack checkout, not a
support-only dead end.

## Why the checkout path is inherently report-scoped (not a public deep link)

Fix Pack checkout is deliberately report-scoped, so the "checkout path" on a
public page must be the path into eligibility, not a bare payment link:

- `POST /api/beta/fix-request` opens a Dodo checkout only for a saved report
  owned by the session with proven, non-closed repairs (worker/routes/billing.js
  `fixPackRepairContext`; no unauthenticated checkout route exists — the only
  fix-pack route is the session POST).
- `shared/offers.js` marks the offer `checkoutState: "report_checkout"` with
  availability "Starts from a saved report with proven issues."
- README.md: "Dodo-backed SEO Fix Pack checkout CTA inside reports when real
  fixes exist."

Inventing a public deep link to a Dodo payment would violate the repo's
truthfulness contract (specs/002-fix-pack-checkout non-goal: "Do not invent
a fake payment link or mark a request paid without Dodo proof").

## The fix that already landed (PR #141)

Commit 48d40e6 (merged 2026-08-14, verified ancestor of current origin/main
HEAD 994032f) gave the Fix Pack tile its checkout funnel on `/packages`:

- `Start from a report with real fixes` -> `/check` (free anonymous one-page
  proof — the funnel into a saved report)
- `Request private access` -> `/` (secure email access link -> private audit ->
  saved report -> in-report checkout CTA)
- `Read support terms` -> `/support` (kept, secondary)

The tile-scoped regression test in worker/routes/pages.test.mjs pins these
links so the tile cannot regress into a support-only dead end.

## Independent verification today (2026-08-20)

Offline (this worktree at origin/main HEAD 994032f, branch created fresh from
origin/main):

- `git merge-base --is-ancestor 48d40e6 origin/main` — confirms the fix commit
  is in current origin/main.
- `node --test worker/routes/pages.test.mjs shared/promise-audit.test.mjs scripts/live-promise-spot-check.test.mjs` — 104/104 pass, including the tile-scoped assertions:
  - tile article matches `<article class="package-card live"> ... SEO Fix Pack`
  - tile contains `<a href="${origin}/check">Start from a report with real fixes</a>`
  - tile contains `<a href="${origin}/">Request private access</a>`
  - `$99.00 one-time` price, "Dodo shows the final checkout price", and the
    config-gated Proof Monitoring boundary all still pinned.

Live site (2026-08-20):

- `GET https://seofixkit.com/packages` — 200; the Fix Pack tile contains the
  badge "Live checkout when eligible" and all three links, with correct
  absolute hrefs:
  - `<a href="https://seofixkit.com/check">Start from a report with real fixes</a>`
  - `<a href="https://seofixkit.com/">Request private access</a>`
  - `<a href="https://seofixkit.com/support">Read support terms</a>`

So the deployed worker serves the fixed tile, and every tile link resolves to
a live page (the /check, /, and /support routes are all live).

## Files changed

- .lane/reports/lane1-fix-pack-tile-checkout-path-verify-20260820.md — this
  verification report (force-added; `.lane/` is gitignored).

No product code change was needed: the item was already implemented, tested,
and live on origin/main via PR #141 before this lane ran.

## Status

Branch `lane1/fix-pack-tile-checkout-path-verify-20260820`, docs-only
verification commit, PR opened against main.
