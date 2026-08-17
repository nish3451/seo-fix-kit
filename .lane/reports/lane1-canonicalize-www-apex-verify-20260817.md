# Lane 1 report: Canonicalize www.seofixkit.com onto the apex host — verification (2026-08-17)

Date: 2026-08-17
Worker: fleet-dispatch-lane-worker-seo-fix-kit-1
Branch: lane1-canonicalize-www-apex-verify-20260817
Item: `38147c59f9` — "Canonicalize www.seofixkit.com onto the apex host with
301 redirects and apex-only canonicals/sitemap"

## Outcome

**Item already implemented, tested, and live on origin/main.** No code change
was needed. The canonicalization landed in commit `c05fae5` ("feat:
canonicalize www.seofixkit.com onto the apex host with 301 redirects (#70)",
2026-08-09). It was extended to static assets in `f5b2349` / #107 ("fix: 301
every www.seofixkit.com request incl. static assets via `run_worker_first:
true`"). Both are on `origin/main` at the head of this worktree (`21f0364`).

This dispatch's scout item is stale: it was produced against a state that
PRs #70 and #107 already fixed. Two prior lane workers (2026-08-14 and
2026-08-15) also verified the fix. I re-verified independently against the live
system and the offline regression locks rather than re-implementing it. All
checks pass.

## What the fix does (already in repo)

- `worker/index.js`:
  - `CANONICAL_HOST = "seofixkit.com"`, `CANONICAL_ORIGIN = "https://seofixkit.com"`.
  - The Worker's request handler runs a `www.seofixkit.com → apex` 301 before
    any route logic, preserving `pathname + search` intact.
  - `canonicalOrigin(url)` returns the apex origin for both the apex host and
    the `www.` alias, so all emitted URLs (page canonicals, social tags,
    robots.txt, sitemap.xml, llms.txt, fixture URLs) are apex-only no matter
    which host carried the request.
- `wrangler.jsonc`: both `seofixkit.com` and `www.seofixkit.com` routed to the
  Worker with `custom_domain`, and `assets.run_worker_first: true` so www
  static-asset requests (`favicon.svg`, `/assets/*`) also hit the 301 instead
  of being served 200 from the asset store — no asset-host leakage into
  canonicals/sitemap indexing.
- `worker/index.test.mjs` regression locks: `Worker dispatch 301-redirects
  www.seofixkit.com onto the apex host` and `Worker dispatch serves
  apex-only canonicals, robots, sitemap, and llms.txt`.
- `scripts/live-promise-spot-check.mjs` + test: `canonicalHostSpotChecks` for
  the same promises; redirects are observed with `redirect: "manual"` so the
  301 itself is observable.
- `public/robots.txt` and `public/sitemap.xml`: apex-only already
  (`Sitemap: https://seofixkit.com/sitemap.xml`; every URL is apex-origin).
- `index.html` and the rendered HTML pages: `<link rel="canonical"
  href="https://seofixkit.com/..." />`, social tags apex-only.
- `server/index.js` `localAppHost` and `worker/lib/text.js` `workerAppHost`
  list both hosts — deliberate app-host allowlists for report-domain routing,
  not serving URLs. `worker/lib/auth.js` `siblingHost` is generic
  www-stripping for cookie scope. No www serving leak.

## Verification performed (2026-08-17)

Offline (this worktree, fresh `origin/main` at `21f0364`):

- `npm run test:worker-dispatch` — **12/12 pass**, including:
  - `Worker dispatch 301-redirects www.seofixkit.com onto the apex host`
    (covers root, `/packages?utm_source=scout`, `/api/health`,
    `/sitemap.xml`, and the asset layer for `/favicon.svg` + `/assets/*`)
  - `Worker dispatch serves apex-only canonicals, robots, sitemap, and
    llms.txt`
- Repo-wide grep audit for `www.seofixkit.com`. The remaining references are
  all expected and intentional:
  - `worker/index.js`, `worker/index.test.mjs`, `worker/routes/pages.test.mjs`
    — the redirect logic and its regression locks.
  - `worker/lib/text.js`, `server/index.js` — app-host allowlists (deliberate).
  - `wrangler.jsonc` — `routes` config (deliberate) and a comment explaining
    why `run_worker_first: true` is required.
  - `scripts/live-promise-spot-check.mjs` and its `.test.mjs` — the live
    spot-checks and their unit tests.
  - `.lane/reports/*` and `docs/research/*` — historical references.
  - `README.md` — historical/contextual reference.
  No serving URL leak.

Live spot-check (HTTPS, manual `Location` header):

- `https://www.seofixkit.com/` → `301 Location: https://seofixkit.com/`
- `https://www.seofixkit.com/packages?utm_source=scout` → `301 Location:
  https://seofixkit.com/packages?utm_source=scout` (path + query intact)
- `https://www.seofixkit.com/sitemap.xml` → `301 Location:
  https://seofixkit.com/sitemap.xml`
- `https://www.seofixkit.com/favicon.svg` → `301 Location:
  https://seofixkit.com/favicon.svg` (static asset, no leak)
- `https://www.seofixkit.com/llms.txt` → `301 Location:
  https://seofixkit.com/llms.txt`
- `https://seofixkit.com/sitemap.xml` → every `<loc>` is apex-only; the only
  `www.` substring is the XML namespace declaration
  (`xmlns="http://www.w3.org/..."`).
- `https://seofixkit.com/robots.txt` →
  `Sitemap: https://seofixkit.com/sitemap.xml`.
- `https://seofixkit.com/methodology` →
  `<link rel="canonical" href="https://seofixkit.com/methodology" />`.

## Files claimed

- `.lane/reports/lane1-canonicalize-www-apex-verify-20260817.md` (this
  report). No product files were modified — the item's owned files
  (`worker/index.js`, `worker/index.test.mjs`, `wrangler.jsonc`) already
  contain the fix and its regression locks, and the regression suite passes
  green on `origin/main`.

## Recommendation for the lane controller

Mark item `38147c59f9` complete (or drop it as stale). The scout that
produced it predates PRs #70 and #107 and this is the third independent
verification that the fix is complete, tested, and live. Future scout items
for this product should be dispatched against a current checkout with a
"verify or fix" posture for surfaces that may already be handled, since this
item has now re-surfaced three times for the same underlying change.
