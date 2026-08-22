# Lane 1 — Volume Nine GEO Grader competitor comparison on /methodology (2026-08-22)

Item: `aad3d0097c` — Volume Nine GEO Grader (agency-backed free GEO audit with
6 categories + AI crawler access).

Branch: `lane1/volume-nine-geograder-competitor-20260822`
PR: https://github.com/nish3451/seo-fix-kit/pull/203 (base `main` @ 45a7631)

## Direction chosen

Truthful competitor comparison on `/methodology` only. No other surface.

- `worker/routes/pages.js` (`methodologyHtml`): new 6-line section **"Why not
  just use Volume Nine's GEO Grader?"** placed immediately after the SEOmator
  section and immediately before the agentic-auditor section (groups the two
  free GEO audits). Names Volume Nine (Denver agency, `v9digital.com`) with
  nofollow receipt links to the landing page and the grader app, states the
  vendor's own Quick Facts (launched January 2026, free), 60+ signals across
  six categories, robots.txt crawler-access check, and live model sampling,
  then wedges on repair queue + rerun proof and re-anchors the no-overclaim
  boundary. Vendor launch date used; third-party press dates never cited.
  `volumenine.com` is unrelated and is not linked.
- `worker/routes/pages.test.mjs`: inline regression guard (heading, placement
  between SEOmator and agentic, Denver agency, January 2026, totally free,
  60+ signals / six categories, robots.txt, model list, both receipt hrefs,
  inbox report, wedge phrasing, boundary sentence, plus `doesNotMatch`
  anti-overclaim guards). `PUBLIC_PAGE_RENDERERS` ranges from `/methodology`
  down shifted +6.
- `shared/audit-engine.js` + `public/sitemap.xml`: `/methodology` lastmod
  aligned to `2026-08-22T18:24:07Z` so the sitemap freshness discipline stays
  truthful.

## Live fact verification (fetched 2026-08-22)

- https://www.v9digital.com/geo-grader/ — fetched OK (1,530,757 bytes).
  - Place/Organization schema + footer: Headquartered in Denver, CO
    (`1312 17th St. #942, Denver, CO 80202`).
  - Quick Facts: `Launched: January 2026`; `Cost: Free`; `LLMs it analyzes
    against: ChatGPT, Perplexity, Grok, Claude, Gemini`; `It evaluates 60+
    signals`.
  - FAQ: "analyzes 60+ signals across discoverability, structured data, AI
    readiness, performance, reputation, and LLM-ready content".
  - Technical appendix: "checking robots.txt directives … verifies whether
    AI and search crawlers are explicitly allowed access".
  - FAQ: "Are AI models queried live during grading?" → "Yes, this is a large
    part of why the run times can take 3+ minutes".
  - Step 5: "A full, detailed report shows up in your inbox".
  - FAQ: "Some inputs can vary between runs".
- https://geo.v9digital.com/grader/ — GET 200. HEAD returns 405 Method Not
  Allowed (`Allow: GET`); GET is the live verification.
- Backlog said "launched Aug 22 2026"; vendor Quick Facts say January 2026.
  Shipped copy uses the vendor value.

## Test evidence

- `npm run test:public-pages`: 18/18 pass, `# fail 0` (includes the extended
  combined test, the freshness pin, and playwright reflow tests).
- `node --test shared/promise-audit.test.mjs scripts/live-promise-spot-check.test.mjs`:
  92/92 pass, `# fail 0`.
- `npm run test:product-truth`: `{"ok":true,"checked":"product truth and offer gates"}`.
- Local render check: `methodologyHtml('https://seofixkit.com')` prints
  `SECTION-OK` (Volume Nine heading present and the verbatim boundary
  `No live AI-engine sampling, no AI citation monitoring, and no ranking
  guarantees` is in the page).

## Claims

Published to `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json`
`claims` before editing any tracked file, atomically via temp+rename:

```json
["worker/routes/pages.js", "worker/routes/pages.test.mjs", "shared/audit-engine.js", "public/sitemap.xml", ".lane/reports/lane1-volume-nine-geograder-competitor-20260822.md"]
```

No other lane-record field was modified (`state`, `intended_claims`, and the
rest stayed byte-identical aside from controller-owned timestamps the
controller itself writes).
