# Lane 1 report: Canonicalize www.seofixkit.com onto the apex host — verification (2026-08-20)

Date: 2026-08-20
Worker: fleet-dispatch-lane-worker-seo-fix-kit-1-1787235036605017319-df79166065.service
Branch: lane1-canonicalize-www-apex-verify-20260820
Item: `38147c59f9` — "Canonicalize www.seofixkit.com onto the apex host with
301 redirects and apex-only canonicals/sitemap"

## Outcome

**Item already implemented, tested, and live on origin/main. No code change
was needed.** The canonicalization landed in commit `c05fae5` ("feat:
canonicalize www.seofixkit.com onto the apex host with 301 redirects (#70)",
2026-08-09), extended to static assets by `run_worker_first: true` (#107), and
the live-request regression spot-check was hardened by #89. This worktree is a
fresh checkout of `origin/main` at `7783adc` (2026-08-20). Prior lane workers
verified the same item on 2026-08-14, 2026-08-15, and 2026-08-17 (reports in
`.lane/reports/`). I re-verified independently against the live system and the
offline regression locks rather than re-implementing it. All item-scope checks
pass.

## What the fix does (already in repo)

- `worker/index.js`:
  - `CANONICAL_HOST = "seofixkit.com"`, `CANONICAL_ORIGIN = "https://seofixkit.com"`.
  - The Worker request handler runs a `www.seofixkit.com → apex` 301 before any
    route logic, preserving `pathname + search` intact — so no content, API, or
    asset response is ever served from the www host.
  - `canonicalOrigin(url)` returns the apex origin for both the apex host and
    the `www.` alias, so every emitted URL (page canonicals, social tags,
    robots.txt, sitemap.xml, llms.txt, fixture URLs, IndexNow key paths) is
    apex-only regardless of which hostname carried the request.
- `wrangler.jsonc`: both `seofixkit.com` and `www.seofixkit.com` routed to the
  Worker with `custom_domain`, and `assets.run_worker_first: true` so www
  static-asset requests (`favicon.svg`, `/assets/*`, `/security.txt`,
  `/.well-known/*`) hit the 301 instead of being served 200 from the asset
  store — no second-host leakage into canonicals/sitemap indexing.
- `worker/index.test.mjs` regression locks: "Worker dispatch 301-redirects
  www.seofixkit.com onto the apex host" (root, deep path with query,
  `/api/health`, `/sitemap.xml`, asset layer, SPA fallback) and "Worker
  dispatch serves apex-only canonicals, robots, sitemap, and llms.txt".
- `scripts/live-promise-spot-check.mjs` + test: `canonicalHostSpotChecks` for
  the same promises, observing the 301 itself with `redirect: "manual"`.
- `public/robots.txt` and `public/sitemap.xml`: apex-only already
  (`Sitemap: https://seofixkit.com/sitemap.xml`; every URL apex-origin).
- `index.html` and rendered pages: `<link rel="canonical"
  href="https://seofixkit.com/..." />`, `og:url`, JSON-LD, and social tags
  apex-only.
- `server/index.js` `localAppHost` and `worker/lib/text.js` `workerAppHost`
  list both hosts — deliberate app-host allowlists for report-domain routing,
  not serving URLs. `worker/lib/auth.js` `siblingHost` is generic www-stripping
  for cookie scope. No www serving leak.

## Verification performed (2026-08-20)

Offline (this worktree, fresh `origin/main` at `7783adc`):

- `npm run test:worker-dispatch` — **14/14 pass**, including the www→apex 301
  test (root, `/packages?utm_source=scout`, `/api/health`, `/sitemap.xml`,
  `/favicon.svg`, `/security.txt`, `/assets/*`, `/.well-known/security.txt`,
  SPA-fallback path) and the apex-only canonicals/robots/sitemap/llms.txt test.
- `npm run test:public-pages` — **15/15 pass**, including the
  `run_worker_first` asset-routing lock and the apex-only canonical asserts on
  rendered pages.
- `npm run test:promise-audit` — **71/71 pass**, pinning the README "what is
  live in this repo" claims about the canonical host.
- Repo-wide grep audit for `www.seofixkit.com`. Every remaining reference is
  expected and intentional: the redirect logic and its comments
  (`worker/index.js`), regression locks (`worker/index.test.mjs`,
  `worker/routes/pages.test.mjs`, `scripts/live-promise-spot-check.mjs` +
  `.test.mjs`), the wrangler `routes` config and comment, the deliberate
  app-host allowlists (`worker/lib/text.js`, `server/index.js`), and
  historical/contextual references (README, docs/research, prior
  `.lane/reports`). No serving URL leak.

Live spot-check (HTTPS, manual `Location` header, via
`npm run audit:live-promise` plus direct curls):

- `https://www.seofixkit.com/` → `301 Location: https://seofixkit.com/`
- `https://www.seofixkit.com/check` → `301` to apex (path intact)
- `https://www.seofixkit.com/sitemap.xml` → `301 Location:
  https://seofixkit.com/sitemap.xml`
- `https://www.seofixkit.com/llms.txt` → `301 Location:
  https://seofixkit.com/llms.txt`
- `https://www.seofixkit.com/favicon.svg` → `301` (static asset, no leak)
- `https://www.seofixkit.com/.well-known/security.txt` → `301`
- `https://www.seofixkit.com/unknown-spa-path` → `301`
- `https://seofixkit.com/sitemap.xml` → every `<loc>` is apex-only (the only
  `www.` substring anywhere is the XML namespace declaration
  `xmlns="http://www.sitemaps.org/..."`).
- `https://seofixkit.com/robots.txt` →
  `Sitemap: https://seofixkit.com/sitemap.xml`
- `https://seofixkit.com/methodology` →
  `<link rel="canonical" href="https://seofixkit.com/methodology" />`

All 5 canonical-host spot-checks in the live promise walk pass.

## Out-of-scope observation (flagging, not fixing)

The 2026-08-20 live promise walk also reported 4 failures on `/proof` and
`/proof.md` (HTTP 404 in production) plus the `/llms.txt` and `/sitemap.xml`
entries that list the proof receipt. This is a separate surface — the proof
receipt (last shipped by PR #138, `b9f7e32`) is a different lane's item, not
the canonical-host item, and its offline regression locks pass
(`test:public-pages` 15/15, including the proof-page content pins). The 404
indicates the deployed Worker copy does not match `origin/main`'s proof route,
so the deployed copy is behind or drifted — a deploy-surface concern for the
proof-receipt lane/controller, not this item. I did not modify anything for it.

## Files claimed

- `.lane/reports/lane1-canonicalize-www-apex-verify-20260820.md` (this
  report). No product files were modified — the item's owned files
  (`worker/index.js`, `worker/index.test.mjs`, `wrangler.jsonc`) already
  contain the fix and its regression locks, and the regression suites pass
  green on `origin/main`.

## Recommendation for the lane controller

Mark item `38147c59f9` complete (or drop as stale). The scout that produced it
predates PRs #70/#107/#89, and this is the fourth independent verification
that the fix is complete, tested, and live. Separately, the live `/proof` 404
should be dispatched to the proof-receipt lane as a deploy-copy regression.
