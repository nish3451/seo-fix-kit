# Lane 1 report: /demo engine-output code block overflow at 390px — re-verification

Date: 2026-08-20
Worker: fleet-dispatch-lane-worker-seo-fix-kit-1
Branch: `lane1/demo-engine-output-overflow-reverify-20260820`
Item: `7df5e43c0a` — "/demo engine-output code block overflows horizontally on
390px mobile (regression from #111) [scout 2026-08-13, raw]"

## Outcome

**Item already fixed, tested, and live on origin/main at HEAD `7783adc`.** No
code change was needed. This is a fresh re-verification cycle (the prior
`lane1-demo-engine-output-overflow-reverify-20260817` report (#163) confirmed
the same state on 2026-08-17 against `37edea4`; this run re-confirms it three
days later against the current origin/main HEAD `7783adc`, which added the
Repair Sprint checkout / proof path without touching the /demo CSS).

The original scout was filed 2026-08-13 against the state shipped by PR #111
(`948d43c`, 2026-08-12), which replaced the hand-written brief on /demo with
real engine output via `worker/routes/demo-proof.js`. PR #122 (`307b913`,
2026-08-13) fixed the resulting code-block overflow the same day, and PR #147
(`62d2f82`, 2026-08-15) hardened the shared narrow-viewport handling. All
three commits are ancestors of origin/main at HEAD `7783adc`.

## What the fix does (already in repo, unchanged between 37edea4 and 7783adc)

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

The diff of `worker/routes/pages.js` between the previously-verified HEAD
(`37edea4`) and the current HEAD (`7783adc`) touches only the Repair Sprint
copy and the new `/proof` page (`proofCaseHtml`). The `demoHtml` shell CSS
(`body { min-width: 0 }`, `main { min-width: 0 }`, `.panel { min-width: 0 }`,
`p, li { overflow-wrap: anywhere; word-break: break-word }`, and
`code { display: block; max-width: 100%; white-space: pre-wrap;
overflow-wrap: anywhere; word-break: break-word }`) is byte-identical
between the two HEADs.

## Re-verification evidence (2026-08-20, origin/main HEAD `7783adc`)

### 1. Independent Playwright sweep at 390px and 320px mobile

Headless Chromium, viewport `Wx844`, `isMobile+hasTouch`, rendered
`demoHtml("https://seofixkit.com")`. Every `code, li, p, h1, h2, .panel,
main` element was scanned; any element whose `getBoundingClientRect().right
> root.clientWidth + 1` is logged in `wideFromAny`.

```json
{
  "width": 320,
  "docScrollWidth": 320,
  "docClientWidth": 320,
  "bodyMinWidth": "0px",
  "htmlOverflowX": "visible",
  "bodyOverflowX": "visible",
  "codeCount": 6,
  "wideCodeCount": 0,
  "liCount": 10,
  "wideLiCount": 0,
  "wideFromAnyCount": 0,
  "missingProofCount": 0
}
{
  "width": 390,
  "docScrollWidth": 390,
  "docClientWidth": 390,
  "bodyMinWidth": "0px",
  "htmlOverflowX": "visible",
  "bodyOverflowX": "visible",
  "codeCount": 6,
  "wideCodeCount": 0,
  "liCount": 10,
  "wideLiCount": 0,
  "wideFromAnyCount": 0,
  "missingProofCount": 0
}
```

Every engine-output code block (6 of them) fits cleanly within the viewport
at both 390px and 320px. Zero `code`, zero `li`, and zero of any other
scanned element overflows. `bodyMinWidth` is `0px` (no 320px floor). The
document itself does not overflow horizontally
(`scrollWidth == clientWidth`). No element relies on `overflow-x: hidden`
to hide the symptom. Every guard title / evidence / why / fix and every
repair-plan title / fix / snippet string from `DEMO_PROOF` is still present
in the rendered text at both widths (`missingProofCount: 0`).

### 2. Offline regression lock: `node --test worker/routes/pages.test.mjs`

Full file run: **15/15 pass**, including the pinning regression test:

- `demo proof list reflows at 320px and 390px without hiding evidence` —
  asserts `scrollWidth <= clientWidth` at both viewports, zero overflowing
  `<li>` elements, html+body overflow-x not `"hidden"`, every proof string
  (`DEMO_PROOF.guards` titles/evidence/why/fix + `DEMO_PROOF.repairPlan`
  titles/fix/snippets) still present in the rendered text at both widths.
  Re-run solo: `ok 1 - demo proof list reflows at 320px and 390px without
  hiding evidence` (287 ms).
- `shared public-product shell reflows at narrow viewports without a 320px
  floor` — sweeps 5 shared-shell pages at 390/320/300/280/240px (incl.
  `/ai-answer-readiness`), asserts `bodyMinWidth == 0px`, no
  `overflow-x: hidden`, no `min-width: 320px` string in source.

### 3. Source-level pin (HEAD `7783adc`, `worker/routes/pages.js`)

- `demoHtml` CSS at lines 165-184 carries the fix verbatim:
  - `body { margin: 0; min-width: 0; }` (no 320px floor).
  - `main { … min-width: 0; }`.
  - `p, li { … overflow-wrap: anywhere; word-break: break-word; }`.
  - `.panel { … min-width: 0; }`.
  - `code { … display: block; max-width: 100%; white-space: pre-wrap;
    overflow-wrap: anywhere; word-break: break-word; }`.
- No `min-width: 320px` or `overflow-x: hidden` anywhere in the demo shell
  (grep returns zero matches in the demo block; matches elsewhere in the
  file belong to other routes and are out of this item's scope).

### 4. Commit ancestry on origin/main HEAD `7783adc`

```
7783adc Repair Sprint checkout, eligibility and delivery proof (#54)
  └── (newer commits since #163 are unrelated docs/merges)
   307b913 fix: wrap demo proof meta/script tokens on narrow viewports (#122)              <- fix
   62d2f82 fix(pages): collapse worker public pages below 320px and wrap long tokens (#147) <- hardening
   948d43c demo: show real engine output instead of a hand-written sample brief (#111)      <- origin
```

`307b913` (#122), `62d2f82` (#147), and `948d43c` (#111) are all ancestors
of `7783adc`. The 8 commits between `37edea4` and `7783adc` add /proof and
Repair Sprint checkout work; none of them modify `demoHtml` CSS.

## Files changed in this PR

- `.lane/reports/lane1-demo-engine-output-overflow-reverify-20260820.md` —
  this re-verification report. No product code changed.

## Rollback

Not applicable — no code change in this PR. To undo the underlying fix,
revert #122 and #147; both are CSS-only (`worker/routes/pages.js`) plus a
regression test (`worker/routes/pages.test.mjs`).

## Completion marker

LANE1_DEMO_ENGINE_OUTPUT_OVERFLOW_REVERIFY_20260820_COMPLETE
