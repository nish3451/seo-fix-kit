# Lane 1 — re-verify /check has no 320px floor at origin/main HEAD

Branch: `docs/lane1-check-no-320-floor-verify-20260820`
Date: 2026-08-20
Item: "Live `/check` still has a hard 320px floor — at viewports below
320px the document overflows horizontally with no..."

## Status

Fix already landed at origin/main via #146 (`d82db0c fix(check): remove
the 320px floor on live /check`), re-verified on 2026-08-17 by #165
(`3bc4243 docs(lane-1): verify /check 320px floor removal still landed
at origin/main HEAD`). This lane run is another re-verification against
origin/main HEAD on 2026-08-20; **no production code change** is
proposed — the fix in `worker/routes/public-check.js` is intact.

## Static checks against `worker/routes/public-check.js` at HEAD

| check | expected | actual |
| --- | --- | --- |
| `body { margin: 0; min-width: 320px; }` present | false | false |
| `body { margin: 0; }` (floor removed) | true | true |
| `.box-min { min-width: 0 }` defined | true | true |
| `h1` has `overflow-wrap: break-word` | true | true |
| `<h1 class="box-min">` rendered | true | true |
| `<section class="box-min">` wraps headline | true | true |
| `.check-form input` has `min-width: 0` | true | true |
| `<code class="snippet box-min">` for generated markup | true | true |

All eight static checks pass on the file as shipped at HEAD
(`worker/routes/public-check.js`).

## Live reflow probe (chromium headless, same harness as the regression test)

Probe rendered `checkHtml('https://example.test')` in a real chromium
page at six viewport widths and measured `documentElement.scrollWidth`
vs `clientWidth` and the set of elements whose own `scrollWidth` exceeds
their `clientWidth + 1`.

| viewport | scrollWidth | clientWidth | body min-width | overflowing elements |
| --- | --- | --- | --- | --- |
| 320 | 320 | 320 | 0px | 0 |
| 280 | 280 | 280 | 0px | 0 |
| 240 | 240 | 240 | 0px | 0 |
| 200 | 200 | 200 | 0px | 0 |
| 180 | 180 | 180 | 0px | 0 |
| 160 | 160 | 160 | 0px | 9 (residual, paragraph-level min-content) |

The 320/280/240/200/180px sweep matches the original PR #146 evidence
table and the 2026-08-17 re-verification exactly: `scrollWidth ==
clientWidth` and zero overflowing elements. Below ~180px the residual
overflow is bounded and comes from paragraph-level min-content sizing
(the URL placeholder `https://example.com/about` and long inline URLs
in the snippet and lede); real-world browsers do not ship below 320
CSS px, and the 320px floor removal is what the item asks for. The
shared public-page shell (worker public pages other than /check) was
additionally fixed in #147.

## Repository test suite

`node --test worker/routes/public-check.test.mjs` — **15/15 pass** on
origin/main HEAD (7783adc), including the regression test that pins
this behaviour:

```
ok 11 - public check page has no 320px floor and reflows below 320px
```

The test asserts both that the body floor string is absent from the
emitted HTML and that chromium renders the page with zero document or
element overflow at 240px, 200px, and 180px.

## Files touched

- `.lane/reports/lane1-check-no-320-floor-verify-20260820.md` (this
  file) — docs-only verification record.

No production code touched in this lane run; the fix in
`worker/routes/public-check.js` was delivered by #146 (d82db0c) on
2026-08-15 and is intact at HEAD on 2026-08-20 (7783adc).

## Outcome

- Branch `docs/lane1-check-no-320-floor-verify-20260820` branches from
  origin/main HEAD (7783adc).
- PR opened against `main` (no production code changed; this run is a
  re-verification only).
- Item stays closed; the lane re-confirms the prior fix is still
  present and effective at origin/main HEAD on 2026-08-20.
