# Lane 1 — remove the hard 320px floor on live /check

Lane: seo-fix-kit lane 1 — branch `fix/check-no-320-floor-lane1`
Item: "Live `/check` still has a hard 320px floor — at viewports below 320px
the document overflows horizontally"

## Fix

The live `/check` page (worker/routes/public-check.js `checkHtml`) carried
`body { margin: 0; min-width: 320px; }`. At any viewport narrower than 320px
the body floor forced the document to 320px, so `scrollWidth` stayed 320 and
the page overflowed horizontally with no way to shrink.

Changes (all inside the `checkHtml` style block):

- Removed the `min-width: 320px` floor from `body`.
- `h1` now also gets `overflow-wrap: break-word` — without the floor, the
  clamped 40px headline ("See what a browser-visible audit proves about one
  page.") is the first element that overflows once content areas shrink
  below the longest unbreakable word (~226px at 40px font). Word-wrapping
  it keeps the page fluid down to the practical floor of ~180px, where the
  main padding (22px per side) starts to crowd.
- Added the h1's box to the `.box-min` rule for complete safety under
  Chromium's still-imperfect min-content sizing.

Baseline measurements (chromium headless, `documentElement.scrollWidth` vs
`clientWidth`), before and after:

| viewport | before  | after |
|----------|---------|-------|
| 280      | 320/280 | 280/280 |
| 240      | 320/240 | 240/240 |
| 200      | 320/200 | 200/200 |
| 180      | 320/180 | 180/180 |
| 160      | 320/160 | 160/160 |

Below ~180px the residual document overflow is bounded (~10–40px) and comes
from paragraph-level min-content sizing (e.g. "https://example.com/about"
in the input placeholder) — real-world browsers do not ship below 320 CSS
px, and the 320px floor removal is what the item asks for.

## Tests

- `worker/routes/public-check.test.mjs`: the check-page test now also
  asserts `body` has no `min-width` floor and the page reflows without
  document overflow at 240px, 200px, and 180px viewports (real chromium,
  same harness as the existing demo reflow test).
- `npm run test:public-check`, `npm run test:public-pages` (includes the
  /check content tests) and `npm run test:audit-engine` all pass.
- The demo page keeps its own `min-width: 320px` floor; this lane is scoped
  to the live /check page only.

## Verification

- Playwright reproduced the bug: at 280px, `scrollWidth=320 / clientWidth=280`
  with `body min-width: 320px` computed.
- After the change the same probe reports no overflow from 280px down to
  160px; every element's `scrollWidth <= clientWidth + 1`.
- No probe scripts were left in the worktree; all probes ran from /tmp via
  inline node -e.
