# Lane 1 evidence: free static-vs-rendered checker names

## Item

Self-directed cycle. Chosen gap: `/rendered-vs-static-seo-audit` still sold rendered-vs-static proof without naming the three free checkers that already ship that check (LLM Pulse, Free SEO Auditor, geo-crawl-audit).

## Open PR check

PR #199 (`lane1/outreach-geo-listicles-b3-20260822`) was already merged on origin/main at this run (`1c8a264 Merge pull request #199`). Left untouched; this PR does not edit its three files.

## /proof 404

Live `https://seofixkit.com/proof` HTTP 404 is already on origin/main (`worker/index.js` pathname `=== "/proof"`). Not this PR. Deploy remains NEEDS-NISH.

## Files changed (seven claim paths)

- `worker/routes/pages.js` — comparison section + FAQ on `renderedVsStaticAuditHtml`
- `worker/routes/pages.test.mjs` — new no-overclaim test + refreshed `PUBLIC_PAGE_RENDERERS` locators
- `scripts/live-promise-spot-check.mjs` — five new copy expectations
- `scripts/live-promise-spot-check.test.mjs` — regression when the comparison heading is lost
- `shared/audit-engine.js` — `ROOT_PUBLIC_LASTMODS` for `/rendered-vs-static-seo-audit` only
- `public/sitemap.xml` — matching `<lastmod>` only
- `.lane/reports/lane1-free-rendered-vs-static-parity-20260822.md` — this file

## PR URL

Pending push and `gh pr create`.

## Commands

Pending `npm run test:public-pages`, `npm run test:live-promise-spot-check`, `npm run test:promise-audit`, `npm run check`.
