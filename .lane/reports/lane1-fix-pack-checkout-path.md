# Lane report: lane1/fix-pack-checkout-path

Date: 2026-08-14
Item: `/packages` Fix Pack tile has no checkout path — page presents the $99 paid offer as "LIVE CHECKOUT WHEN ELIGIBLE"
PR: https://github.com/nish3451/seo-fix-kit/pull/141

## What was wrong

The `/packages` Fix Pack tile (worker/routes/pages.js) presented the paid
offer with the badge "Live checkout when eligible" but its only link was
`Read support terms`. The "live checkout" claim had no route to reach it —
a support-only dead end.

## Why the fix takes the shape it does

Fix Pack checkout is deliberately report-scoped, not a public deep link:

- `POST /api/beta/fix-request` opens a Dodo checkout only for a saved report
  owned by the session with proven, non-closed repairs
  (worker/routes/billing.js `fixPackRepairContext`; no unauthenticated route
  exists — grep of worker/index.js confirms the only fix-pack route is the
  session POST).
- `shared/offers.js` marks the offer `checkoutState: "report_checkout"`,
  availability "Starts from a saved report with proven issues."
- README.md line 61: "Dodo-backed SEO Fix Pack checkout CTA inside reports
  when real fixes exist."

So there is no public URL that legitimately starts a Fix Pack checkout, and
inventing one (e.g. a bare Dodo payment link) would violate the repo's own
truthfulness contract (specs/002-fix-pack-checkout non-goal: "Do not invent
a fake payment link or mark a request paid without Dodo proof").

The missing "checkout path" is therefore the path into eligibility: a saved
report with real fixes. The tile now links it:

- `Start from a report with real fixes` -> `/check` (free anonymous one-page
  proof — the funnel into a report)
- `Request private access` -> `/` (secure email access link -> private
  audit -> saved report -> in-report checkout CTA)
- `Read support terms` -> `/support` (kept, secondary)

## Files changed

- worker/routes/pages.js — Fix Pack tile gains the two checkout-path links.
- worker/routes/pages.test.mjs — tile-scoped assertions pin the checkout
  path so the tile cannot regress into a support-only dead end.

## Verification

- `node --test worker/routes/pages.test.mjs` — 11/11 pass.
- `node --test shared/promise-audit.test.mjs` — 59/59 pass.
- `npm run build` — green (Vite build, part of the required `npm run check`
  chain).
- Rendered tile inspected: three links present, copy intact.

## Status

Pushed branch `lane1/fix-pack-checkout-path` (commit 7a83c98), PR #141 open
against main.
