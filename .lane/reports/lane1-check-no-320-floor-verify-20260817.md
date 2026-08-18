# Lane 1 — re-verify /check has no 320px floor at origin/main

Branch: `docs/lane1-check-no-320-floor-verify`
Date: 2026-08-17
Item: "Live `/check` still has a hard 320px floor — at viewports below
320px the document overflows horizontally with no..."

## Status

Fix already landed at origin/main via #146 (`d82db0c fix(check): remove
the 320px floor on live /check`). This lane run is a re-verification
that the fix is still in place at HEAD on origin/main; no production
code change is proposed.

## Static checks against `worker/routes/public-check.js` HEAD

| check | expected | actual |
| --- | --- | --- |
| `body { margin: 0; min-width: 320px; }` present | false | false |
| `.box-min { min-width: 0 }` defined | true | true |
| `h1` has `overflow-wrap: break-word` | true | true |
| `<h1 class="box-min">` rendered | true | true |
| `<section class="box-min">` wraps headline | true | true |
| `.check-form input` has `min-width: 0` | true | true |

All six static checks pass on the file as shipped at HEAD
(`worker/routes/public-check.js`).

## Live reflow probe (chromium headless, same harness as the regression test)

Probed `checkHtml(origin)` rendered at five viewport widths:

| viewport | scrollWidth | clientWidth | overflowing elements |
| --- | --- | --- | --- |
| 280 | 280 | 280 | 0 |
| 240 | 240 | 240 | 0 |
| 200 | 200 | 200 | 0 |
| 180 | 180 | 180 | 0 |
| 160 | 160 | 160 | 9 (residual, paragraph-level min-content) |

The 280/240/200/180px sweep matches the original PR #146 evidence
table exactly. Below ~180px the residual overflow is bounded and comes
from paragraph-level min-content sizing (the URL placeholder
`https://example.com/about` and long inline URLs); real-world
browsers do not ship below 320 CSS px, and the 320px floor removal
is what the item asks for. The shared public-page shell (worker
public pages except /check) was additionally fixed in #147.

## Repository test suite

`node --test worker/routes/public-check.test.mjs` — **10/10 pass**
on origin/main HEAD, including the regression test that pins this
behaviour:

```
ok 6 - public check page has no 320px floor and reflows below 320px
```

The test asserts both that the body floor string is absent from the
emitted HTML and that chromium renders the page with zero document
or element overflow at 240px, 200px, and 180px.

## Files touched

- `.lane/reports/lane1-check-no-320-floor-verify-20260817.md` (this
  file) — docs-only verification record.

No production code touched in this lane run; the fix in
`worker/routes/public-check.js` was delivered by #146 (d82db0c) on
2026-08-15 and is intact at HEAD.

## Outcome

- Branch `docs/lane1-check-no-320-floor-verify` branched from
  origin/main.
- Docs-only verification commit added.
- PR opened: https://github.com/nish3451/seo-fix-kit/pull/165
