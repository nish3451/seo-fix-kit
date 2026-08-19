# Lane 1 report — full search-index coverage (Google + Bing/DuckDuckGo), 2026-08-15

Item: `ad9e691adf` — "Establish full search-index coverage: all 7 public pages
indexed on Google plus a Bing/DuckDuckGo presence" (scout 2026-08-09, rank 2,
risk green). Backlog:
`/home/nish/workspaces/agent-state/seo-fix-kit-improvement-loop/backlog.md`
line 501.

Branch: `lane1/search-index-coverage-20260815` (fresh `origin/main` `dc2090e`)
PR: https://github.com/nish3451/seo-fix-kit/pull/157 (expected; pushed with
this report)

## Outcome

The item's **agent-completable half is now re-landed on current main**; the
acceptance outcome itself (all public pages on Google, seofixkit.com first on
Bing/DDG) is **externally owned** and cannot be finished from a lane without
account credentials (Google Search Console / Bing Webmaster). The prior
attempt, PR #139 (2026-08-14), shipped the full code solution but **never
merged** — it went CONFLICTING as main moved 25+ commits past it. This lane
rebuilt both legs on fresh `origin/main`:

- **Credential-free IndexNow submission path** (feat cherry-picked verbatim
  from #139): Worker serves `/{key}.txt` + `/.well-known/{key}.txt` apex-only
  with `noindex`; local server parity; `npm run submit:indexnow` verifies the
  key file is live at both locations before POSTing the live sitemap URL set
  to `api.indexnow.org` + `www.bing.com/indexnow` (refuses otherwise, exit 2).
  This is the Bing + Bing-derived DuckDuckGo crawl trigger — no credentials.
- **Truthful per-page `<lastmod>`** on all 11 sitemap URLs (generated
  `rootSitemap()` + static `public/sitemap.xml` mirror) from the shared
  `ROOT_PUBLIC_LASTMODS` map, which this run **refreshed** for the post-#139
  main commits that changed public page copy/layout.
- Single canonical route list `ROOT_PUBLIC_PATHS` shared by sitemap and
  IndexNow; tests lock the URL set + every lastmod; `test:indexnow` wired into
  the canonical `npm run check` gate.
- Packet doc `docs/growth/search-index-coverage-2026-08-11.md` updated with a
  new "Re-verified 2026-08-15" section; owner-only manual kit (Google Search
  Console request-indexing, Bing Webmaster ownership) unchanged and exact.

## Why re-land instead of fixing #139

PR #139 was OPEN, `mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`, with a
green `check` — its conflict surface covered `shared/audit-engine.js`,
`server/index.js`, `worker/routes/pages.test.mjs` (and its docs commit
conflicted on README). The fleet pattern for this exact item (which had
already produced twin PRs #99 → #117 → #139, each superseding the last) is to
open a fresh PR from current main rather than rebase a stale conflicting one.
The cherry-pick landed with a single trivial conflict (main's share-image test
block vs the feat's sitemap-URL-array replacement), resolved by keeping both.

## What changed (vs #139's feat)

| Path | Change |
|------|--------|
| `shared/audit-engine.js` | `ROOT_PUBLIC_LASTMODS` refreshed: `/demo`, `/methodology`, `/packages`, `/small-business-seo-audit`, `/rendered-vs-static-seo-audit`, `/ai-answer-readiness` → `2026-08-15T07:14:01Z` (#150 live-page overclaim corrections); `/check` → `2026-08-15T04:27:51Z` (#146 320px-floor removal); `/`, `/privacy`, `/support`, `/terms` unchanged (no public-surface change since) |
| `public/sitemap.xml` | Same lastmod refresh in the static mirror |
| `worker/routes/pages.test.mjs` | Conflict resolution: main's SVG share-image test block kept alongside the feat's `ROOT_PUBLIC_PATHS`-based sitemap set |

Everything else is the #139 feat verbatim (IndexNow routes, submission
script + tests, lastmod generation, README, packet doc).

## Verification

- `npm run check` — **exit 0, 23 suites, zero failures** (includes new
  `test:indexnow` and the `test:check-inventory` gate, plus vite build).
- `node --test worker/routes/pages.test.mjs` 14/14, `scripts/submit-indexnow.test.mjs` 8/8,
  `worker/index.test.mjs` 13/13.
- `node scripts/submit-indexnow.mjs --dry-run` against live `https://seofixkit.com`:
  2x key `MISS` (expected pre-release — key-file routes not live until this PR
  ships), 11 sitemap URLs parsed, would POST both endpoints, exit 0.

## Live state re-verified 2026-08-15

- `https://seofixkit.com/sitemap.xml` HTTP 200, 11 locs, **zero lastmod**
  (loc-only, pre-release).
- `/indexnow` and `/.well-known/indexnow-key.txt` both HTTP **404** (no key
  file live).
- PR #139 still OPEN/CONFLICTING with green check (superseded by this PR).
- Bing/DDG/Google SERP receipts unchanged from the packet doc's standing
  evidence (Bing zero organic, DDG bot-challenged, Google CAPTCHA-walled from
  this box).

## Owner-only legs (unchanged from the packet doc)

1. Google Search Console: add property, DNS TXT verify, submit sitemap,
   request-indexing per URL.
2. Bing Webmaster Tools: add site, DNS TXT verify, submit sitemap.
3. After this PR merges and releases: `npm run submit:indexnow` (resume path
   fully documented in the packet doc).

## Files changed

See claims in `lane-1.json`. All changes are on this lane's branch; nothing
was pushed to main. `node_modules` is untracked (gitignored).
