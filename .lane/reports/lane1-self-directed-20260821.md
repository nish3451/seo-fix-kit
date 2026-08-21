# Lane 1 report — self-directed cycle 2026-08-21: static 404 page narrow-viewport overflow fix

Branch: `lane1/self-directed-20260821`
PR: https://github.com/nish3451/seo-fix-kit/pull/185
Date: 2026-08-21 (self-directed cycle)

## Item

Self-directed cycle (no free backlog item). Descended the ladder:

- **Tier 1 (public-promise gaps):** `npm run audit:live-promise` against
  `https://seofixkit.com` → 5 failing surfaces: `/proof`, `/proof.md`,
  `/llms.txt`, `/sitemap.xml`, `/ai-answer-readiness`. All five are the same
  stale-deploy class: the recorded live release
  (`release-state-seo-fix-kit.json`: sha `c53e28f` from 2026-08-17) predates
  the `/proof` publication (#138/#151) and the CrawlRaven copy (#169, merged
  into main as `6a334a3`). The repo code at origin/main has all the pinned
  copy (verified: `worker/routes/pages.js` lines 518/552 name CrawlRaven).
  This regression is already owned by open PR #176 (ICP precondition
  regression, same root cause) — not restarted here.
- **Tier 2 (UI/UX breakage):** found a live, uncovered narrow-viewport
  horizontal overflow on the static-asset 404 page (`public/404.html`).
- **Tier 4-7:** static-asset sweep found `public/404.html` as the only
  remaining `min-width: 320px` floor in the public asset set; all
  worker-rendered pages were already fixed by #147. No open PR covered the
  404 page (checked #146 merged, #147 merged, #112/#138 diffs).

## Finding

`public/404.html` shipped `body { margin: 0; min-width: 320px; }` — the same
bug class removed from every worker-rendered public page in #147 (shared
shell, demo shell, policy shell), but never applied to the asset-layer 404.
Measured live with Playwright (real rendering) before the fix:

| width | scrollWidth | wide elements |
| --- | --- | --- |
| 390px | 390 | 0 |
| 320px | 320 | 0 |
| 300px | 321 (1px over) | 2 (BODY, MAIN) |
| 280px | 320 (40px forced) | 8 |
| 240px | 320 (80px forced) | 12 |

The 404 page is the one surface guaranteed to serve even when the deployed
Worker is stale (asset layer, `not_found_handling: "404-page"`), so every
broken link on a narrow device hit horizontal overflow.

Secondary finding: the live-promise spot-check's stale-deploy detector only
recognized the SPA-shell fallback (`<div id="root">`). A stale Worker serving
a promised route that predates it answers with the asset-layer 404 page
(`text/html` without charset, "Nothing to fix here." body), so the live run
printed the misleading "Fix the deployed copy or the claim in the spot-check"
message instead of the stale-deploy diagnosis.

## Fix

`public/404.html`:
- Removed the `min-width: 320px` floor.
- `min-width: 0` on `main`, `header`, `.panel`, `.links`, `.cta`.
- `overflow-wrap: anywhere` on `p`; `overflow-wrap: break-word` on `h1`.
- No `overflow-x: hidden` anywhere (content wraps, never masked).

`worker/index.test.mjs`:
- Extended the deploy-surface 404 test: `assert.doesNotMatch(notFoundPage, /min-width:\s*320px/)`.
- New test `404 page reflows at narrow viewports without horizontal overflow`:
  Playwright sweep of the 404 page at 390/320/300/280/240px, asserting
  `scrollWidth <= clientWidth`, zero wide elements, `bodyMinWidth == 0px`.

`scripts/live-promise-spot-check.mjs`:
- `isSpaFallback` → `isAssetFallback`: also recognizes the asset-layer 404
  page (`text/html` without charset + "Nothing to fix here.") as a
  stale-deploy signal, so a promised route served by the 404 fallback now
  reports "deployed Worker is stale ... (deploy main, then rerun)" instead of
  a misleading copy-drift message.

`scripts/live-promise-spot-check.test.mjs`:
- New test `live spot-check flags a stale Worker serving the 404-page asset
  fallback`: pins the 404-fallback diagnosis and confirms worker-rendered
  pages are not falsely flagged.

## Evidence

- `npm run test:live-promise-spot-check` — 19/19 pass (was 18; +1 new).
- `npm run test:worker-dispatch` — 15/15 pass (was 14; +1 new).
- `npm run check` — full suite green incl. Vite build (exit 0).
- Playwright sweep of the fixed 404 page at 390/320/300/280/240px: ALL CLEAN
  (`scrollWidth == clientWidth`, zero wide elements, `bodyMinWidth == 0px`).
- Live walk: 5 failing live surfaces confirmed as stale-deploy (release
  `c53e28f` 2026-08-17 < main `6a334a3`), owned by PR #176.

## Files changed

- `public/404.html` — remove 320px floor, add min-width:0 + overflow-wrap to the static 404 page.
- `worker/index.test.mjs` — 404 floor ban + narrow-viewport reflow regression test.
- `scripts/live-promise-spot-check.mjs` — detect asset-layer 404 fallback as stale deploy.
- `scripts/live-promise-spot-check.test.mjs` — regression test for the 404-fallback diagnosis.

## Rollback

Revert the commit; the CSS-only asset change and the two test/spot-check
additions touch no route, copy, or engine logic.
