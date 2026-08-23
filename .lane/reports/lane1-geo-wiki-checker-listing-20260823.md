# Lane 1 — GEO Wiki checker listing + /methodology name (2026-08-23)

Item: `5e13c683b4` — List SEO Fix Kit on GEO Wiki and name its free 26-crawler access checker.

Branch: `lane1-geo-wiki-checker-listing-20260823`
PR: https://github.com/nish3451/seo-fix-kit/pull/209 (base `main`)

## Direction chosen

Follow the senior verdict exactly:

- Name GEO Wiki's free AI Crawler Access Checker on `/methodology` as the crawler-map competitor, with the repair queue + rerun proof wedge ("for sites that need fixes, not just a robots.txt map").
- Refresh `PUBLIC_PAGE_RENDERERS` after the insert (required).
- Do **not** touch `/ai-answer-readiness` for any reason (optional cross-link deleted from scope).
- On-board geo.wiki as discovery venue #24 with paste-ready correction-path email copy to `support@geo.wiki`, pending Nish's manual send. No account creation, browser submission, or automated send.
- Live-fetched facts at execution time matched the spec snapshot (26 tokens, 5 checks/day, updated 18 August 2026, 4 products). No substitution.
- `/proof` is HTTP 404 this run; no shipped sentence claims public repair receipts.

Sibling merge note: origin/main already carried AEO Engine's competitor answer (#208) between Juma and the tracker. The GEO Wiki section was inserted on that tip, between the tracker and agentic sections, as specified. Existing competitor wording was not changed. `PUBLIC_PAGE_RENDERERS` was shifted by N=6 (actual lines added by the verbatim block; the spec's "7" was a pre-count) from the live origin/main locators, not the stale 369-based snapshot.

## Live fact verification (fetched 2026-08-23, this run)

- https://geo.wiki/tools/ai-crawler-access — HTTP 200. "Enter a domain and see how it treats 26 AI crawler tokens…"; "Free, no account needed — 5 checks a day. Sign in for 15."; RFC 9309 quoted verdicts; UA-keyed edge-rule probes vs browser baseline; "24 of 26 — Google-Extended and Applebot-Extended exist only as robots.txt tokens"; "Updated 18 August 2026"; "Roster verified against operator docs 2026-08-18".
- https://geo.wiki/products — HTTP 200. Heading "GEO product directory"; "4 products"; Profound, Peec AI, LLMrefs, Otterly.AI; `mailto:support@geo.wiki?subject=Products%20correction`; zero `seofixkit` matches.
- https://geo.wiki/ — HTTP 200. Footer contact `support@geo.wiki`.
- https://seofixkit.com/proof — HTTP 404 (same as 2026-08-23 pre-execution). Title "Page not found - SEO Fix Kit".

Receipts: `docs/research/2026-08-23-geo-wiki-benchmark.md`.

## Test evidence

Commands run from the worktree root on 2026-08-23 after the renderer + lastmod updates:

1. `git rev-parse --abbrev-ref HEAD` → `lane1-geo-wiki-checker-listing-20260823`
2. `node --test worker/routes/pages.test.mjs` → `# tests 18 # pass 18 # fail 0` (includes freshness discipline).
3. `npm run test:product-truth` → `{"ok":true,"checked":"product truth and offer gates"}`
4. `grep -c "Why not just use" worker/routes/pages.js` → `9` (spec snapshot expected 8; origin/main already had AEO Engine's "Why not just use" from PR #208, so this insert is 8+1. Existing competitor sections were not edited.)
5. `grep -c "GEO Wiki's free AI Crawler Access Checker" worker/routes/pages.js worker/routes/pages.test.mjs` → `1` in `pages.js`; `2` in `pages.test.mjs` because the mandated guard block matches the heading in both the extract regex and the `indexOf` pin.
6. `/proof` HTTP status this run: **404** (recorded above and in the research receipt).

## Claims

Published to `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json` `claims` before editing:

```
["worker/routes/pages.js","worker/routes/pages.test.mjs","shared/audit-engine.js","public/sitemap.xml","docs/research/2026-08-23-geo-wiki-benchmark.md","docs/growth/discovery-venues-2026-08-10.md","docs/growth/discovery-venues-copy-2026-08-10.txt","MEMORY.md",".lane/reports/lane1-geo-wiki-checker-listing-20260823.md"]
```

No other lane-record field was modified.
