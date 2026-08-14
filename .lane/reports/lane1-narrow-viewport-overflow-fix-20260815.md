# Lane 1 report — narrow-viewport overflow fix on worker public pages

Branch: `lane1/narrow-viewport-overflow-fix-20260815`
PR: https://github.com/nish3451/seo-fix-kit/pull/147
Date: 2026-08-14/15 (self-directed cycle)

## Item

Self-directed cycle (no free backlog item). Descended the ladder:

- **Tier 1 (public-promise gaps):** live-promise audit green (`npm run audit:live-promise`
  — all public-page and machine-surface promises match). `/proof` 404 is owned by open
  PR #138 (its check is red on a stale README pin, lane-owned; not restarted here).
- **Tier 2 (UI/UX breakage):** found a live, uncovered narrow-viewport horizontal
  overflow on the shared worker public-page shells.

## Finding

All worker-rendered public pages except `/check` shipped a hard
`body { min-width: 320px }` floor in `worker/routes/pages.js`. Measured live with
Playwright (real rendering):

| page | 320px | 300px | 280px | 240px |
| --- | --- | --- | --- | --- |
| /ai-answer-readiness | 348 (28px over) | 348 (48px) | 348 (68px) | 348 (108px) |
| /methodology | 321 (1px) | 321 (21px) | 320 (40px) | 320 (80px) |
| /demo | 320 | 321 (21px) | 320 (40px) | 320 (80px) |
| /privacy /support /terms | 320 | 321 (21px) | 320 (40px) | 320 (80px) |

Wide-element scan at 320px on `/ai-answer-readiness`: three `<li>` elements at 326px
(no overflow-wrap on long tokens). Root cause pinned to the shared shells in
`worker/routes/pages.js`: `publicProductPageHtml` (line ~602), `demoHtml` (line ~165),
and `policyPageHtml`/`privacyHtml` (lines ~678/~805) all shipped
`body { margin: 0; min-width: 320px; }`.

No open PR covered this: #146 (`fix/check-no-320-floor-lane1`) touches only
`worker/routes/public-check.js` (the `/check` route); #112/#138 touch `pages.js` but
neither edits the shared shell CSS (checked diffs). The `/check` floor is deliberately
left to #146.

## Fix

`worker/routes/pages.js`:

- Removed the `min-width: 320px` floor from all three shells (shared product shell,
  demo shell, policy shell).
- `min-width: 0` on `main`, `.panel`, `.package-card`, `.check-list li`, `.faq-item`.
- `overflow-wrap: anywhere` on `p, li`; `overflow-wrap: break-word` on `h1, h2`.
- No `overflow-x: hidden` anywhere (content wraps, never masked).

`worker/routes/pages.test.mjs`:

- New test `shared public-product shell reflows at narrow viewports without a 320px
  floor`: sweeps 5 shared-shell pages at 390/320/300/280/240px, asserts
  `scrollWidth <= clientWidth`, zero wide elements, `bodyMinWidth == 0px`, no
  `overflow-x: hidden`, no `min-width: 320px` string.

## Evidence

- `npm run test:public-pages` — 14/14 pass (incl. the new regression test).
- `npm run test:promise-audit` — 59/59 pass.
- `npm run check` — full suite green incl. Vite build.
- Playwright sweep of all 9 worker public pages at 5 widths: ALL CLEAN
  (`scrollWidth == clientWidth`, zero wide elements) — see commit verification run.

## Files changed

- `worker/routes/pages.js` — remove 320px floor, add min-width:0 + overflow-wrap to the three public-page shells.
- `worker/routes/pages.test.mjs` — add the narrow-viewport reflow regression test.

## Rollback

Revert the two-file commit; the CSS-only change touches no route, copy, or engine logic.
