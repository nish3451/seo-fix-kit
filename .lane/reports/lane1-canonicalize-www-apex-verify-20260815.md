# Lane 1 report: Canonicalize www.seofixkit.com onto the apex host — verification

Date: 2026-08-15
Worker: fleet-dispatch-lane-worker-seo-fix-kit-1
Branch: lane1-canonicalize-www-apex-verify-20260815
Item: `38147c59f9` — "Canonicalize www.seofixkit.com onto the apex host with
301 redirects and apex-only canonicals/sitemap"

## Outcome

**Item already implemented, tested, and live.** No code change was needed.
The canonicalization landed in commit `c05fae5`
("feat: canonicalize www.seofixkit.com onto the apex host with 301 redirects
(#70)", 2026-08-09), which is on `origin/main` at the head of this worktree
(`bc73285`). This dispatch's scout item is stale — it describes a state that
PR #70 already fixed and a prior lane worker already verified on 2026-08-14
(`.lane/reports/lane1-canonicalize-www-apex-20260814.md`).

I re-verified the fix independently against the live system and the offline
regression locks rather than re-implementing it. All checks pass.

## What the fix does (already in repo)

- `worker/index.js`: `CANONICAL_HOST = "seofixkit.com"`; every request whose
  hostname is `www.seofixkit.com` gets an immediate 301 to the apex with path
  and query intact, before any route logic runs. All emitted URLs (page
  canonicals, social tags, robots.txt, sitemap.xml, llms.txt, fixture URLs)
  are built from the apex origin via `canonicalOrigin()`.
- `wrangler.jsonc`: both hosts routed to the Worker with `custom_domain`, and
  `assets.run_worker_first: true` so www static-asset requests (favicon.svg,
  /assets/*) also hit the 301 instead of being served 200 from the asset
  store (no asset-host leakage into canonicals/sitemap indexing).
- `worker/index.test.mjs`: tests asserting www 301s (root, deep path with
  query, API route, sitemap, static assets) and apex-only canonicals/robots/
  sitemap/llms.txt.
- `scripts/live-promise-spot-check.mjs` + test: live `canonicalHostSpotChecks`
  for the same promises (redirects checked with `redirect: "manual"` so the
  301 itself is observable).
- `public/robots.txt` / `public/sitemap.xml`: apex-only already.
- `server/index.js` `localAppHost` and `worker/lib/text.js` `workerAppHost`
  list both hosts — deliberate app-host allowlists for report-domain routing,
  not serving URLs. `worker/lib/auth.js` `siblingHost` is generic
  www-stripping for cookie scope. No www serving leak.

## Verification performed (2026-08-15)

Offline (this worktree, fresh origin/main):
- `npm run test:worker-dispatch` — 12/12 pass, including the www→apex 301
  suite and the apex-only canonical/sitemap/robots/llms.txt suite.
- Grep audit: only remaining `www.` references are the allowlists, the
  sibling-host helper, XML namespaces (`xmlns="http://www.w3.org/..."`), and
  the redirect/verification logic itself. No serving URL leaks.

Live:
- `https://www.seofixkit.com/` → 301 `Location: https://seofixkit.com/`
- `https://www.seofixkit.com/check?utm=1` → 301
  `Location: https://seofixkit.com/check?utm=1` (path + query intact)
- `https://www.seofixkit.com/sitemap.xml` → 301
  `Location: https://seofixkit.com/sitemap.xml`
- `https://www.seofixkit.com/favicon.svg` → 301 (static asset)
- `https://www.seofixkit.com/llms.txt` → 301
- `https://seofixkit.com/sitemap.xml` → all `<loc>` entries apex-only
  (`https://seofixkit.com/...`); the only `www.` occurrence is the XML
  namespace declaration
- `https://seofixkit.com/robots.txt` →
  `Sitemap: https://seofixkit.com/sitemap.xml`
- `https://seofixkit.com/methodology` →
  `<link rel="canonical" href="https://seofixkit.com/methodology" />`

## Files claimed

- `.lane/reports/lane1-canonicalize-www-apex-verify-20260815.md` (this
  report). No product files were modified — the item's owned files
  (worker/index.js, worker/index.test.mjs, wrangler.jsonc) already contain
  the fix and its regression locks.

## Recommendation for the lane controller

Mark item `38147c59f9` complete — the scout that produced it predates PR #70
and this is the second independent verification that the fix is complete and
live. Future scout items for this product should be dispatched against a
current checkout with a "verify or fix" posture for surfaces that may already
be handled.
