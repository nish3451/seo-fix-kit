# Lane 1 report — fix/apple-touch-icon-check-probe-lane1

## Item as dispatched

> Engine's apple-touch-icon check is presence-only and its published snippet hardcodes `${origin}/apple-touch-icon.p[…]

Repo: `nish3451/seo-fix-kit`. Worktree:
`/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260814-153048`.

Branch: `fix/apple-touch-icon-check-probe-lane1` (from `origin/main`,
commit `b5957e8`).

## Verdict: done — landed and pushed

- Branch `fix/apple-touch-icon-check-probe-lane1` created from
  `origin/main`.
- Two commits pushed to `origin/fix/apple-touch-icon-check-probe-lane1`:
  - `6100f3d` — engine + tests + demo-proof fixture
  - `a5fb866` — lane-1 report file
- A PR could not be opened from this worker — `gh` CLI is not installed
  on this host and no `GITHUB_TOKEN` is exported. The push URL printed by
  git is `https://github.com/nish3451/seo-fix-kit/pull/new/fix-apple-touch-icon-check-probe-lane1`,
  so the controller or a follow-up worker can open the PR with that head
  ref against `main`.

## What changed

### `shared/audit-engine.js`

- New `checkAppleTouchIcons(pages)` helper, alongside `checkSocialImages`.
  It reuses `checkResource` / `fetchResource` (HEAD with GET fallback on
  403/405, image content-type rule with the same extension fallback used
  for social images) so the engine treats the icon as a real network
  resource, not just a DOM fact.
- `auditUrl` now calls `checkAppleTouchIcons(pages)` and forwards the
  result into `buildFindings` via a new `appleTouchIcons` parameter.
- `buildFindings` declares the new parameter and computes a per-page
  `origin` inside the loop so it is in scope for the apple-touch-icon
  snippet.
- The apple-touch-icon branch now has two outcomes:
  1. **missing** (the previous behavior) — emitted when the rendered
     DOM has no `apple-touch-icon` link. Severity, why, and fix text are
     unchanged; only the snippet path is rewritten to
     `<link rel="apple-touch-icon" href="${origin}/apple-touch-icon.svg" />`
     so it is grounded in the audited origin and matches the file the
     site actually serves.
  2. **not loadable** — new warning finding emitted when the tag is
     present but the probe sees a non-image response (or any non-ok
     status). Evidence is formatted the same way as the social-image
     "is not loadable" finding so customers see a uniform reason string.

### `worker/routes/demo-proof.js`

- The stored `Apple touch icon missing on home` repair-plan entry now
  carries `snippet: <link rel="apple-touch-icon" href="{ORIGIN}/apple-touch-icon.svg" />`
  to match the live engine output. The `fix` text is unchanged.
  `pages.test.mjs` runs the live engine against the local fixture and
  asserts `live.snippet === entry.snippet.replaceAll("{ORIGIN}", origin)`;
  with the updated entry the assertion holds.

### `shared/audit-engine.test.mjs`

- `apple-touch-icon that is declared but not loadable produces a broken-icon finding`
  — declares `https://public.example/apple-touch-icon.png`, serves
  `text/html` for that URL. Asserts the new "not loadable" finding
  exists, the evidence names the URL and the wrong content-type, and the
  snippet uses `href="https://public.example/apple-touch-icon.svg"`.
- `apple-touch-icon that is declared and loadable is not reported broken`
  — declares the SVG icon, serves `image/svg+xml`. Asserts neither
  "missing" nor "not loadable" finding is emitted.
- `apple-touch-icon snippet uses the audited origin and a real path when the tag is missing`
  — no icon declared. Asserts the missing finding still fires and the
  snippet uses the audited origin and the SVG path, not the old
  hard-coded `/apple-touch-icon.png`.

## Test results

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `shared/audit-engine.test.mjs` | 32 | 32 | 0 |
| `worker/routes/pages.test.mjs` | 11 | 11 | 0 |
| `worker/routes/public-check.test.mjs` | 9 | 9 | 0 |
| `shared/promise-audit.test.mjs` | 59 | 59 | 0 |
| `scripts/live-promise-spot-check.test.mjs` | 14 | 14 | 0 |

The 3 new apple-touch-icon tests are part of the 32 in
`shared/audit-engine.test.mjs`.

## Live evidence

The fix follows the same architectural pattern already used for social
images — the comments at the top of `checkAppleTouchIcons` document why
"the engine probes the declared URL instead of trusting tag presence",
mirroring the comment block on `checkSocialImages`. A customer who
points their apple-touch-icon link at a dead file or at an HTML page now
gets a verified warning with the actual URL and response, instead of
silently passing.

## Files touched

- `shared/audit-engine.js`
- `shared/audit-engine.test.mjs`
- `worker/routes/demo-proof.js`

These match the `claims` list written to
`/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json` before
any edits, plus this report file (`.lane/reports/<branch>.md`).

## What I did not do

- No PR was opened (see "Verdict" above).
- No edits to `ops/audit-batches/*.json` historical audit records — those
  are immutable logs of past audits and the packet says only the live
  engine needs to change.
- No edits to `index.html`, `public/404.html`, `worker/routes/pages.js`,
  or `worker/routes/public-check.js` — those already use
  `${origin}/apple-touch-icon.svg`; only the engine and the demo-proof
  fixture were inconsistent with that convention.
