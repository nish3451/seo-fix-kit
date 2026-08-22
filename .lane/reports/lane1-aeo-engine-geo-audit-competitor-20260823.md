# Lane 1 — AEO Engine competitor answer on /methodology (2026-08-23)

Item: `5f873349bb` — Raise AEO Engine as a free GEO audit that also ships the fix and embeds on other sites.

Branch: `lane1-aeo-engine-geo-audit-competitor-20260823`
PR: https://github.com/nish3451/seo-fix-kit/pull/XXX (base `main`)

## Direction chosen

Add a live-evidence AEO Engine competitor section to `/methodology` between the Juma.ai and Otterly/Peec tracker sections, with the repair queue + rerun proof wedge and the standing no-overclaim boundary. Refresh `ROOT_PUBLIC_LASTMODS["/methodology"]` and `public/sitemap.xml` mechanical lastmod. Add a regression guard block and update `PUBLIC_PAGE_RENDERERS` line numbers.

- `worker/routes/pages.js` (`methodologyHtml`) — new AEO Engine section naming the free GEO audit, shipped-fix path, and embeddable widget with receipt links.
- `worker/routes/pages.test.mjs` — regression guard and `PUBLIC_PAGE_RENDERERS` refresh.
- `shared/audit-engine.js` — refreshed `ROOT_PUBLIC_LASTMODS["/methodology"]`.
- `public/sitemap.xml` — refreshed `/methodology` lastmod.
- `.lane/reports/lane1-aeo-engine-geo-audit-competitor-20260823.md` — this report.

## Live fact verification (fetched 2026-08-23, this run)

- https://aeoengine.ai/geo-audit — "GEO Audit Tool for Generative Engine Optimization"; free GEO audit that reviews crawlability, schema, content structure, entity clarity, and citation readiness; checks whether a site can be discovered, parsed, trusted, and cited by generative engines such as ChatGPT, Perplexity, Gemini, Claude, and Google AI Overviews; "AEO Engine turns GEO audit findings into shipped fixes"; "A human-managed, AI-powered Growth Engine".
- https://aeoengine.ai/embed/geo-audit — embeddable GEO Audit widget ("GEO Audit by AEO Engine") with iframe src `https://aeoengine.ai/embed/geo-audit?utm_source=embed&utm_medium=widget&utm_campaign=aeo_tools`.

## Test evidence

- `node --test worker/routes/pages.test.mjs`: pass (0 fail).
- `npm run test:product-truth`: `{"ok":true}`.
- Local render check: `methodologyHtml('https://seofixkit.com')` contains the new AEO Engine heading and boundary.

## Claims

Published to `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json` `claims` before editing: `worker/routes/pages.js`, `worker/routes/pages.test.mjs`, `shared/audit-engine.js`, `public/sitemap.xml`, `.lane/reports/lane1-aeo-engine-geo-audit-competitor-20260823.md`. No other lane-record field was modified.
