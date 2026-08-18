# Lane 1 promise audit — 2026-08-15 (fleet worker)

- **Branch:** `lane1/promise-audit-20260815-fleet`
- **Worktree:** `/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260815-062536`
- **Date:** 2026-08-15
- **Worker:** `fleet-dispatch-lane-worker-seo-fix-kit-1` (sealed packet)
- **Base for live check:** `https://seofixkit.com`
- **Commit baseline:** `7e88184` (origin/main, "test(promise-audit): pin remaining live-surface sub-claims (lane 1 audit) (#149)")

## Scope

Audit every claim in the README `## What is live in this repo` section and on
the live `/demo`, `/methodology`, and `/packages` pages against the code,
routes, constants, and deployed Worker that back each claim. Fix any drift
found, and pin every corrected claim so it cannot silently regress.

This packet owns:

- offline regression locks in `shared/promise-audit.test.mjs` (62 pins),
- live spot-check script in `scripts/live-promise-spot-check.mjs`,
- the page copy in `worker/routes/pages.js`,
- the report file at `.lane/reports/lane1-promise-audit-20260815-fleet.md`.

## Method

1. **Baseline** — `origin/main` already contains PR #149 (the earlier
   2026-08-15 lane-1 audit commit that pinned remaining live-surface
   sub-claims). Ran the full offline promise-audit suite: 62/62 green.
2. **Live spot-check** — ran `node scripts/live-promise-spot-check.mjs`
   against `https://seofixkit.com`: 19/20 surfaces green. The only failure
   was the drift this audit then fixed (see below).
3. **Copy-vs-code sweep** — manually compared every public-surface claim in
   `worker/routes/pages.js` and `public/.well-known/skill.md` against the
   engine output (`shared/audit-engine.js`, `worker/routes/demo-proof.js`)
   and the billing/offer behavior (`shared/offers.js`, `src/App.jsx`,
   `worker/routes/billing.js`). Found two genuine overclaims, both live on
   the deployed site and both previously unpinned.

## Drift found and fixed

### 1. `/demo`: "each with an exact snippet" overclaim

Live copy (old): "Issues that are real still surface — noindex, a canonical
conflict, a missing share image, missing schema — **each with an exact
snippet**."

The engine's own stored demo output (`worker/routes/demo-proof.js`) shows the
canonical-conflict and noindex findings carry **no snippet** (empty `snippet`
fields); only social-image, apple-touch-icon, and schema entries do. The page
itself elsewhere says "exact snippet **when the engine can generate one**".
"Each with an exact snippet" therefore overclaims. This is the same class of
overclaim PR #110 removed from the README ("stop calling generated engine
markup an exact snippet").

Fixed to: "...with a suggested fix and an exact snippet when the engine can
generate one."

### 2. `/packages`: Proof Monitoring "only appears in private billing when configured" overclaim

Live copy (old): "Only appears in private billing when the Dodo subscription
product and webhook entitlement sync are configured."

The code (`shared/offers.js` offer catalog, `worker/routes/billing.js`
`getBillingSummary`, `src/App.jsx` `OfferLadder` and the account
`monitoring-offer-panel`) always renders the Proof Monitoring offer in private
billing — labeled "Config gated" / "Beta monitoring allowance". Only the
**checkout** is gated (config + entitlement schema). "Only appears when
configured" therefore overclaims.

Fixed to: "Checkout only opens when the Dodo subscription product and webhook
entitlement sync are configured; until then it stays a config-gated offer in
private billing."

## Regression pins added

- `worker/routes/pages.test.mjs` — pins the corrected demo qualifier
  (`doesNotMatch` "each with an exact snippet"; `match` "with a suggested fix
  and an exact snippet when the engine can generate one") and the corrected
  packages boundary (`doesNotMatch` the old "Only appears" wording; `match`
  the new checkout-gated wording).
- `scripts/live-promise-spot-check.mjs` — `/demo` now asserts the snippet
  qualifier string; `/packages` now asserts the checkout-gated wording, so a
  stale deploy or copy drift fails the live check.
- `shared/promise-audit.test.mjs` — extends the packages-page pin with the
  truthful billing-visibility boundary (offer visible, checkout gated) and the
  negative pin against the old overclaim; extends the spot-check-copy pin with
  the new `/demo` and `/packages` strings.

## Verification

- `node --test worker/routes/pages.test.mjs shared/promise-audit.test.mjs scripts/live-promise-spot-check.test.mjs` → 90/90 pass.
- `node --test shared/promise-audit.test.mjs` → 62/62 pass.
- `node --test worker/routes/pages.test.mjs` → 14/14 pass.
- `node --test scripts/live-promise-spot-check.test.mjs` → 14/14 pass.
- `node scripts/live-promise-spot-check.mjs` against `https://seofixkit.com`:
  19/20 surfaces pass; the 1 failure is `/packages` still serving the old
  overclaiming copy on the deployed Worker. The new pins fail exactly when
  the deployed copy drifts, and this PR's copy fix makes the live check green
  once the Worker deploys. The old copy is confirmed live today (`curl`
  shows "Only appears in private billing" on the deployed `/packages`).

No other drift found: every other README "What is live in this repo" bullet
and public-page claim maps to a green pin, and the live machine surfaces
(`/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/api/health`, `/api/deep-health`,
`POST /api/public-check`, www→apex 301s) all pass.

## Files changed

- `worker/routes/pages.js` — fixed the two overclaiming copy strings.
- `worker/routes/pages.test.mjs` — added offline pins for both corrections.
- `scripts/live-promise-spot-check.mjs` — added live assertions for both.
- `shared/promise-audit.test.mjs` — extended pins for both.
- `.lane/reports/lane1-promise-audit-20260815-fleet.md` — this report.
