# Lane 1 evidence: joshuaopolko + openaeo-audit checkers

## Item

`d742090ea8` — name two more free rendered-vs-static / AI-crawler-visibility checkers on `/rendered-vs-static-seo-audit`: joshuaopolko.com AI Readiness Scanner and the openaeo-audit npm package.

Not already resolved on origin/main (`45a7631`): zero matches for `joshuaopolko` or `openaeo-audit` before this branch.

## Live verification (2026-08-22, prune rule)

Fetched `https://joshuaopolko.com/aiscan/` and `https://registry.npmjs.org/openaeo-audit` (npm website 403s bots). Every clause in the spec bullets was still present:

- joshuaopolko: free / no-signup / deterministic scores in under 30 seconds; 5, 10, or 20 pages or one pasted URL; 14 AI crawlers + live HTTP verification; JSON-LD / citability / sitemap+IndexNow; CSR "invisible to 11 of 14" with Google-Extended, Bingbot, and Applebot as headless exceptions.
- openaeo-audit: MIT, zero dependencies, `npx openaeo-audit yoursite.com`, raw HTML / no JS execution, score out of 100, GPTBot/ClaudeBot/PerplexityBot robots, llms.txt, Organization/WebSite + FAQPage JSON-LD, priced-offer schema, answer-first opening, dateModified freshness, `--json`.

No clause pruned. Download counts deliberately omitted (volatile).

## Files changed

- `worker/routes/pages.js` — intro count Three→Five; two new checker bullets; FAQ names the five tools. Wedge paragraph and existing three bullets untouched. Net +2 lines (1130→1132).
- `worker/routes/pages.test.mjs` — pin assertions for both tools + FAQ sentence; `PUBLIC_PAGE_RENDERERS` refreshed with the spec's +2 map (privacy/support locators shifted, not re-anchored).
- `scripts/live-promise-spot-check.mjs` — four new substring expectations. `scripts/live-promise-spot-check.test.mjs` untouched.
- `shared/audit-engine.js` — `/rendered-vs-static-seo-audit` lastmod only (commit 2).
- `public/sitemap.xml` — matching `<lastmod>` only (commit 2).
- `.lane/reports/lane1-joshuaopolko-openaeo-audit-20260822.md` — this file.

## Branch

`lane1/joshuaopolko-openaeo-audit-20260822`
