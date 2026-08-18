# Lane 1 report: /demo engine-output code block overflow at 390px — verification

Date: 2026-08-15
Worker: fleet-dispatch-lane-worker-seo-fix-kit-1
Branch: lane1-demo-engine-output-overflow-verify-20260815
Item: `7df5e43c0a` — "/demo engine-output code block overflows horizontally on
390px mobile (regression from #111) [scout 2026-08-13, raw]"

## Outcome

**Item already fixed, tested, and live.** No code change was needed. The scout
was filed 2026-08-13 against the state shipped by PR #111 (948d43c, 2026-08-12),
which replaced the hand-written brief on /demo with real engine output. PR #122
(307b913, 2026-08-13) fixed the resulting code-block overflow the same day, and
PR #147 (62d2f82, 2026-08-15) hardened the shared narrow-viewport handling.
Both commits are ancestors of origin/main at this worktree's HEAD (dc2090e).

I re-verified the fix independently against the live site and the offline
regression locks rather than re-implementing it. All checks pass.

## What the fix does (already in repo)

- PR #111 (`948d43c`) added `worker/routes/demo-proof.js` (verbatim engine
  output) and reworked `demoHtml` to render real guarded findings and repair
  plan items as `<code>` blocks inside `<li>` elements.
- PR #122 (`307b913`) added wrapping for the proof tokens those code blocks
  introduced: `overflow-wrap: anywhere; word-break: break-word` on `p, li`,
  `min-width: 0` on `.panel`, and `display: block; max-width: 100%;
  white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word` on
  `code` — without `overflow-x: hidden` (content wraps, never masked).
- PR #147 (`62d2f82`) removed the `body { min-width: 320px }` floor from the
  demo shell (`body { margin: 0; min-width: 0; }`, `main { min-width: 0 }`)
  and pinned the whole behavior with a Playwright regression test.

## Verification evidence

1. Live measurement, Playwright headless Chromium, mobile viewport emulation:

   | viewport | HTTP | scrollWidth | clientWidth | wide elements |
   | --- | --- | --- | --- | --- |
   | 390x844 | 200 | 390 | 390 | 0 |
   | 320x844 | 200 | 320 | 320 | 0 |

   The 390px scan covered every `code, pre, li, p, h1, h2` element on the page:
   zero elements had `scrollWidth > clientWidth + 1`. The engine-output code
   blocks wrap cleanly.

2. Live deploy carries the fix: `https://seofixkit.com/demo` serves
   `body { margin: 0; min-width: 0; }` and
   `overflow-wrap: anywhere; word-break: break-word` on the code-block CSS.

3. Offline regression lock: `npm run test:public-pages` — 14/14 pass,
   including `demo proof list reflows at 320px and 390px without hiding
   evidence` (asserts `scrollWidth <= clientWidth`, zero overflowing `<li>`
   elements, all proof strings still present, no `overflow-x: hidden`) and
   `shared public-product shell reflows at narrow viewports without a 320px
   floor` (sweeps 390/320/300/280/240px).

4. Commit ancestry: `307b913` (#122) and `62d2f82` (#147) are both ancestors
   of `dc2090e` (origin/main, HEAD of this worktree).

## Files changed

- `.lane/reports/lane1-demo-engine-output-overflow-verify-20260815.md` — this
  verification report. No product code changed.

## Rollback

Not applicable — no code change in this PR. To undo the underlying fix, revert
#122 and #147; both are CSS-only (pages.js) plus a regression test
(pages.test.mjs).
