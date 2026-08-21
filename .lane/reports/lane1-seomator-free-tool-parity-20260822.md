# Lane 1 — SEOmator free-tool parity comparison on /methodology (2026-08-22)

Item: `985d43c444` — Raise SEOmator as a 39-free-tool competitor with JS
rendering + dedicated GEO audit (251 checks, 50-page crawls, 14 AI crawlers).

Branch: `growth/seomator-free-tool-parity-20260822`
PR: https://github.com/nish3451/seo-fix-kit/pull/192 (base `main` @ 82c89ac)

## Direction chosen

Accept criterion (a): truthful competitor comparison on `/methodology`.

- `worker/routes/pages.js` (`methodologyHtml`): new section **"Why not just
  use SEOmator's free audits?"** placed right after "Why the repair queue
  exists". Names SEOmator with receipt links, states its free suite fairly,
  explains repair queue + rerun proof as the wedge for sites that need fixes
  not findings lists, and re-anchors the no-overclaim boundary.
- `worker/routes/pages.test.mjs`: pins heading, all fact phrases ("39 free
  SEO tools", "251-check rule engine", "renders JavaScript", "up to 50 pages",
  "14 AI-specific crawlers including GPTBot, ClaudeBot, and PerplexityBot"),
  the three seomator.com receipt links, wedge phrasing ("repair queue plus
  rerun proof"), boundary sentence, plus a `doesNotMatch` anti-overclaim
  guard (no AI-visibility/citation-live claims inside the section).

## Live fact verification (fetched 2026-08-22, this run)

- https://seomator.com/free-tools — meta copy: "39 free SEO tools … No signup".
- https://seomator.com/free-seo-audit-tool — "251 checks", "251-rule engine",
  "render JavaScript", "16 categories". Note: backlog said 20 categories; the
  live page says 16, so the shipped copy uses only live-verified facts.
- https://seomator.com/geo-audit-tool — "up to 50 pages", "14 AI-specific
  crawlers across three priority tiers. Tier 1 includes GPTBot", "ClaudeBot,
  and PerplexityBot", "citability scores, E-E-A-T breakdowns, schema gap
  analysis".
- https://registry.npmjs.org/@seomator%2Fseo-audit — exists, latest 3.0.1.

## Test evidence

- `node --test worker/routes/pages.test.mjs`: 16/16 pass.
- `node --test shared/promise-audit.test.mjs scripts/live-promise-spot-check.test.mjs`: 91/91 pass.
- `npm run test:product-truth`: `{"ok":true}`.
- Local render check: `methodologyHtml('https://seofixkit.com')` contains the
  new section (15,500 bytes rendered).

## Pre-existing condition observed (not touched)

`npm run audit:live-promise` against the deployed site fails on 7 surfaces
(`/proof` 404; /packages missing Agent Fix Mode copy; /rendered-vs-static and
/ai-answer-readiness missing main copy). Verified via `git show origin/main`
that origin/main already contains that copy — this is the known deployed-
Worker-behind-main deploy stall recorded in MEMORY.md (2026-08-21), unrelated
to this PR. The offline promise lock that CI gates on is green.

## Claims

Published to `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json`
`claims` before editing: `worker/routes/pages.js`,
`worker/routes/pages.test.mjs`. No other lane-record field was modified.
