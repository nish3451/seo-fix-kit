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
- `shared/audit-engine.js` — `ROOT_PUBLIC_LASTMODS` for `/rendered-vs-static-seo-audit` only (`2026-08-22T12:07:56Z`)
- `public/sitemap.xml` — matching `<lastmod>` only
- `.lane/reports/lane1-free-rendered-vs-static-parity-20260822.md` — this file

## PR URL

https://github.com/nish3451/seo-fix-kit/pull/200

## Commands

```
python3 -c "import json; d=json.load(open('/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json')); print(d['claims'])"
# exit 0 — seven claim paths

git branch --show-current
# exit 0 — lane1/free-rendered-vs-static-parity-20260822

npm run test:public-pages
# exit 0 — tests 18, pass 18, fail 0
# includes: rendered-vs-static page names free static-vs-rendered checkers without overclaims
# includes: sitemap lastmod stays truthful relative to the page renderer (freshness discipline)

npm run test:live-promise-spot-check
# exit 0 — tests 20, pass 20, fail 0
# includes: live spot-check passes against the shipped public page copy
# includes: live spot-check flags a rendered-vs-static page that lost the free-checker comparison

npm run test:promise-audit
# exit 0 — tests 72, pass 72, fail 0

npm run check
# CHECK_EXIT=0
# test:public-pages tests 18 pass 18 fail 0
# test:live-promise-spot-check tests 20 pass 20 fail 0
# test:promise-audit tests 72 pass 72 fail 0
# test:canary-dry-run / indexnow / check-inventory fail 0
# vite build ✓ built in 651ms
```
