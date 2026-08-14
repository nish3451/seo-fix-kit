# Lane 1 report: Canonicalize www.seofixkit.com onto the apex host

Date: 2026-08-14
Worker: fleet-dispatch-lane-worker-seo-fix-kit-1

## Outcome

**Item already implemented and verified live.** No code change needed; the
canonicalization landed in commit `c05fae5` ("feat: canonicalize
www.seofixkit.com onto the apex host with 301 redirects (#70)", 2026-08-09),
which is on `origin/main` at the head of this worktree (`d2f75f7`).

This lane's scout item was stale: it was dispatched against a state that had
already been fixed. I verified the fix is complete and live rather than
re-implementing it.

## What the fix does (in repo)

- `worker/index.js`: `CANONICAL_HOST = "seofixkit.com"`; every request whose
  hostname is `www.seofixkit.com` gets an immediate 301 to the apex with path
  and query intact, before any route logic. All emitted URLs (page canonicals,
  social tags, robots.txt, sitemap.xml, llms.txt, fixture URLs) are built from
  the apex origin via `canonicalOrigin()`.
- `wrangler.jsonc`: both hosts routed to the Worker with `custom_domain`, and
  `assets.run_worker_first: true` so www static asset requests (favicon.svg,
  /assets/*) also hit the 301 instead of being served 200 from the asset store
  (no asset-host leakage into canonicals/sitemap indexing).
- `worker/index.test.mjs`: tests asserting www 301s (root, deep, api, sitemap,
  static assets) and apex-only canonicals/robots/sitemap/llms.txt.
- `scripts/live-promise-spot-check.mjs` + test: live checks for the same
  promises.
- `public/robots.txt` / `public/sitemap.xml` are apex-only already.
- `server/index.js` `localAppHost` and `worker/lib/text.js` `workerAppHost`
  list both hosts — these are deliberate app-host allowlists for report-domain
  routing, not serving URLs. No www leak.

## Verification performed

- `npm run test:worker-dispatch` — 12/12 pass, including the www→apex 301
  suite and the apex-only canonical/sitemap/robots/llms.txt suite.
- Live checks (2026-08-14):
  - `https://www.seofixkit.com/` → 301 `Location: https://seofixkit.com/`
  - `https://www.seofixkit.com/check?utm=1` → 301 `Location:
    https://seofixkit.com/check?utm=1` (path + query intact)
  - `https://www.seofixkit.com/sitemap.xml` → 301 `Location:
    https://seofixkit.com/sitemap.xml`
  - `https://seofixkit.com/sitemap.xml` → all `<loc>` apex-only
  - `https://seofixkit.com/methodology` → `<link rel="canonical"
    href="https://seofixkit.com/methodology" />`
- No residual `www.seofixkit.com` serving URLs anywhere in the codebase except
  the allowlists and the redirect/verification logic itself.

## Files claimed

- worker/index.js (already contains the redirect/canonical logic)
- worker/index.test.mjs (already contains the regression tests)
- wrangler.jsonc (already contains the routes + run_worker_first)

No files were modified — the claim was published because this lane verified
exactly these owned files rather than changing them.

## Recommendation for the lane controller

Mark item `38147c59f9` complete (or drop it as stale) — the scout that
produced it predates PR #70. Future scout items for this product should be
dispatched against a current checkout with a "verify or fix" posture when the
same surface may already be handled.
