# Lane 1 report: /demo engine-output code block overflow at 390px — re-verification

Date: 2026-08-17
Worker: fleet-dispatch-lane-worker-seo-fix-kit-1
Branch: `lane1/demo-engine-output-overflow-reverify-20260817`
Item: `7df5e43c0a` — "/demo engine-output code block overflows horizontally on
390px mobile (regression from #111) [scout 2026-08-13, raw]"

## Outcome

**Item already fixed, tested, and live on origin/main.** No code change was needed.
This is a fresh re-verification cycle (the prior `lane1-demo-engine-output-overflow-verify-20260815`
report (#158) confirmed the same state on 2026-08-15; this run re-confirms it
two days later against the current origin/main HEAD `37edea4`).

The original scout was filed 2026-08-13 against the state shipped by PR #111
(`948d43c`, 2026-08-12), which replaced the hand-written brief on /demo with
real engine output via `worker/routes/demo-proof.js`. PR #122 (`307b913`,
2026-08-13) fixed the resulting code-block overflow the same day, and PR #147
(`62d2f82`, 2026-08-15) hardened the shared narrow-viewport handling. Both
commits are ancestors of origin/main at HEAD `37edea4`.

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

## Re-verification evidence (2026-08-17, origin/main HEAD `37edea4`)

### 1. Independent Playwright sweep at 390px mobile (run from worktree HEAD)

Headless Chromium, viewport 390x844, isMobile+hasTouch, rendered
`demoHtml("https://seofixkit.com")`:

```json
{
  "docScrollWidth": 390,
  "docClientWidth": 390,
  "bodyMinWidth": "0px",
  "htmlOverflowX": "visible",
  "bodyOverflowX": "visible",
  "codeCount": 6,
  "wideCodeCount": 0,
  "liCount": 10,
  "wideLiCount": 0,
  "wideFromAny": []
}
```

Every `code, li, p, h1, h2` element was scanned: zero elements had
`scrollWidth > clientWidth + 1`. The engine-output code blocks (6 of them)
all fit cleanly within the 390px viewport. The document itself does not
overflow horizontally (`scrollWidth == clientWidth == 390`). No element
relies on `overflow-x: hidden` to hide the symptom.

### 2. Offline regression lock: `node --test worker/routes/pages.test.mjs`

Full file run: **14/14 pass**, including the pinning regression test:

- `demo proof list reflows at 320px and 390px without hiding evidence` —
  asserts `scrollWidth <= clientWidth` at both viewports, zero overflowing
  `<li>` elements, html+body overflow-x not `"hidden"`, every proof string
  (`DEMO_PROOF.guards` titles/evidence/why/fix + `DEMO_PROOF.repairPlan`
  titles/fix/snippets) still present in the rendered text at both widths.
  Re-run solo: `ok 1 - demo proof list reflows at 320px and 390px without
  hiding evidence` (280ms).
- `shared public-product shell reflows at narrow viewports without a 320px
  floor` — sweeps 5 shared-shell pages at 390/320/300/280/240px (incl.
  `/ai-answer-readiness`), asserts `bodyMinWidth == 0px`, no
  `overflow-x: hidden`, no `min-width: 320px` string in source.

### 3. Source-level pin (origin/main, `worker/routes/pages.js`)

- `demoHtml` CSS at lines 165-179 carries the fix verbatim:
  - `body { margin: 0; min-width: 0; }` (no 320px floor).
  - `main { … min-width: 0; }`.
  - `p, li { … overflow-wrap: anywhere; word-break: break-word; }`.
  - `.panel { … min-width: 0; }`.
  - `code { … display: block; max-width: 100%; white-space: pre-wrap;
    overflow-wrap: anywhere; word-break: break-word; }`.
- No `min-width: 320px` or `overflow-x: hidden` anywhere in the demo shell
  (grep returns zero matches in the demo block; matches in the codebase
  belong to other routes and are out of this item's scope).

### 4. Commit ancestry on origin/main HEAD `37edea4`

```
37edea4 docs(lane-1): verify www-to-apex canonicalization still landed at HEAD 21f0364 (#162)
21f0364 docs(lane-1): re-verify ICP experiment precondition GREEN 2026-08-17 (#161)
...
450ebe7 docs(lane-1): verify /demo engine-output overflow already fixed via #122 and #147 (#158)
...
307b913 fix: wrap demo proof meta/script tokens on narrow viewports (#122)              <- fix
62d2f82 fix(pages): collapse worker public pages below 320px and wrap long tokens (#147) <- hardening
948d43c demo: show real engine output instead of a hand-written sample brief (#111)      <- origin
```

`307b913` (#122) and `62d2f82` (#147) are both ancestors of `37edea4`.

## Files changed in this PR

- `.lane/reports/lane1-demo-engine-output-overflow-reverify-20260817.md` —
  this re-verification report. No product code changed.

## Rollback

Not applicable — no code change in this PR. To undo the underlying fix,
revert #122 and #147; both are CSS-only (`worker/routes/pages.js`) plus a
regression test (`worker/routes/pages.test.mjs`).
