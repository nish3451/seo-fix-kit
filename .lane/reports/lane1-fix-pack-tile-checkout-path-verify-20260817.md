# Lane report: lane1-fix-pack-tile-checkout-path-verify-20260817

Date: 2026-08-17
Item: `/packages` Fix Pack tile has no checkout path — page presents the $99 paid offer as "LIVE CHECKOUT WHEN ELIGIBLE"
Result: **Already fixed and live on origin/main via PR #141 — verify only, no code change.**

## What the item asked for

The `/packages` Fix Pack tile (worker/routes/pages.js `packagesHtml`) presented
the $99 paid offer with the badge "Live checkout when eligible" but its only
link pointed to support terms, leaving the "live checkout" claim with no route
to reach it. The item requires the tile to have a real checkout path.

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
truthfulness contract (specs/002-fix-pack-checkout non-goal: "Do not invent a
fake payment link or mark a request paid without Dodo proof").

## The fix that already landed (PR #141)

Commit 48d40e6 (merged 2026-08-14, ancestor of current origin/main HEAD
450ebe7) gave the Fix Pack tile its checkout funnel on `/packages`:

- `Start from a report with real fixes` -> `/check` (free anonymous one-page
  proof — the funnel into a saved report)
- `Request private access` -> `/` (secure email access link -> private audit ->
  saved report -> in-report checkout CTA)
- `Read support terms` -> `/support` (kept, secondary)

The prior lane report `.lane/reports/lane1-fix-pack-checkout-path.md` recorded
the same fix at the time (PR #141). This item is a re-dispatch of the same item
text; independent re-verification below confirms the fix is still present on
main and live.

## Independent verification today (2026-08-17)

Offline (this worktree at origin/main HEAD 450ebe7, branch created fresh):

- `node --test worker/routes/pages.test.mjs` — 14/14 pass, including the
  tile-scoped assertions that pin the checkout-path links:
  - tile article matches `<article class="package-card live"> ... SEO Fix Pack`
  - tile contains `<a href="${origin}/check">Start from a report with real fixes</a>`
  - tile contains `<a href="${origin}/">Request private access</a>`
  - `$\99.00 one-time` price, "Dodo shows the final checkout price", and the
    config-gated Proof Monitoring boundary all still pinned.
- `node --test shared/promise-audit.test.mjs` — 62/62 pass.
- `node --test scripts/live-promise-spot-check.test.mjs` — 18/18 pass.

Rendered tile from `packagesHtml("https://seofixkit.com")` shows the Fix Pack
card with all three links present and the badge "Live checkout when eligible"
now backed by an actual path into eligibility.

Live site:

- `GET https://seofixkit.com/packages` — 200; rendered HTML contains
  `Start from a report with real fixes`, `Request private access`, and
  `Read support terms` inside the Fix Pack tile, so the deployed worker serves
  the fixed tile.
- `GET https://seofixkit.com/`, `GET https://seofixkit.com/check`,
  `GET https://seofixkit.com/support` — all 200 (every tile link resolves).

## Files changed

- .lane/reports/lane1-fix-pack-tile-checkout-path-verify-20260817.md — this
  verification report (force-added; `.lane/` is gitignored).

No product code change was needed: the item was already implemented, tested,
and live on origin/main via PR #141 before this lane ran.

## Status

Branch `lane1-fix-pack-tile-checkout-path-verify-20260817`, docs-only
verification commit, PR opened against main.