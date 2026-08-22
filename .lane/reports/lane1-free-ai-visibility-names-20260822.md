# Lane 1 — name four free AI visibility/citation checkers on /ai-answer-readiness (2026-08-22)

Item: `661eabb911` — Name four new free AI visibility/citation checker tools
(DefiniteSEO, RevSurge, Answer Visibility Lab, Website AEO).

Branch: `lane1-free-ai-visibility-names-20260822`
PR: https://github.com/nish3451/seo-fix-kit/pull/205 (base `main` @ 3956b19)

## S1 retire-check

`git grep -E "DefiniteSEO|RevSurge|Answer Visibility Lab|Website AEO GEO Checker" origin/main -- worker/routes/pages.js` was empty before work and still empty after `git fetch origin main` immediately before opening the PR. Item was not already resolved; PR opened.

## S4 live fetches (2026-08-22)

curl -sS -L, User-Agent `Mozilla/5.0 (compatible; SEOFixKitLane1/1.0)`, dated 2026-08-22.

| Name used in copy | URL | HTTP | Still-live? | One-line fact used in copy |
| --- | --- | ---: | --- | --- |
| DefiniteSEO | https://definiteseo.com/ai-visibility-checker | 200 (redirect to trailing slash) | yes | free AI visibility checker that sees whether ChatGPT and Google AI Overviews cite your site |
| RevSurge Digital | https://revsurgedigital.com/free-tools/geo-audit | 200 | yes | free GEO audit that checks whether AI answer engines can read, understand, and cite your website |
| Answer Visibility Lab | https://answervisibilitylab.com/geo-audit-tool | 200 | yes | free GEO audit tool that checks brand mentions and owned-URL citations across ChatGPT, Perplexity, Gemini, Claude, and Google AI Overviews |
| Website AEO GEO Checker | https://websiteaeogeochecker.com | 200 | yes | free AEO and GEO checker for AI search that shows how ChatGPT, Perplexity, Gemini, Claude AI, and Bing AI read your site |

None omitted. No scores or backlog numbers copied. Page-visible "free" only.

Fetched titles (receipt):
- DefiniteSEO: "Free AI Visibility Checker: See if AI Cites Your Site - DefiniteSEO"
- RevSurge: "Free GEO Audit Tool — Score Your AI Visibility in 60 Seconds - RevSurge Digital"
- Answer Visibility Lab: "GEO Audit Tool \| Answer Visibility Lab" (page also says "Free No signup" and defines an AI visibility checker as checking brand mentions and owned-URL citations)
- Website AEO GEO Checker: "Free AEO & GEO Checker - Free AEO Checker for AI Search"

## Copy diff summary

Inserted one `<section class="band">` in `aiAnswerReadinessHtml` immediately after "Compared with CrawlRaven" and immediately before `On "technical readiness predicts nothing (r=0.009)"`. Net +12 lines in `worker/routes/pages.js`. Neighboring sections, FAQ array, title/description/lead/softwareDescription, and all other functions untouched.

Verbatim anchors present:
- `<h2>Compared with free AI visibility checkers</h2>`
- `SEO Fix Kit does not check AI-engine citations or visibility scores.`
- `No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.`

Wedge: free tools if you only need a visibility score; SEO Fix Kit derives readiness from rendered pages, schema, links, sitemap context, and optional llms.txt, and only proven findings reach the persistent repair queue with a rerun proof receipt.

## Guard additions

`worker/routes/pages.test.mjs` (pages[2] block, after CrawlRaven FAQ assertion, before r=0.009 comment):
- heading + disclaimer assertions
- one `assert.match` per still-live display name (all four)

`PUBLIC_PAGE_RENDERERS` N=12:
- `/ai-answer-readiness` first range 569–659
- every other `pages.js` locator with original `lineStart >= 569` shifted +12 on both bounds
- locators with original start < 569 left byte-identical

`scripts/live-promise-spot-check.mjs` `/ai-answer-readiness` expectations: heading, no-citation-checking sentence, plus one `names NAME` match per still-live tool, appended after the CrawlRaven line. Page-entry count unchanged (24-result pin still valid).

## Lastmod pair

Both set to renderer commit IST Z-suffix from commit 1 (`e18d7c4`, `%aI` `2026-08-22T21:39:15+05:30`):

- `shared/audit-engine.js` `ROOT_PUBLIC_LASTMODS["/ai-answer-readiness"]` = `2026-08-22T21:39:15Z`
- `public/sitemap.xml` `/ai-answer-readiness` `<lastmod>` = `2026-08-22T21:39:15Z`

No other lastmod or key changed. `LASTMOD OK 2026-08-22T21:39:15Z`

## Acceptance test outputs

1. origin/main grep empty (exit 1) — held at start and before PR.
2. heading count = 1 in each of pages.js, pages.test.mjs, live-promise-spot-check.mjs.
3. Each of DefiniteSEO, RevSurge Digital, Answer Visibility Lab, Website AEO GEO Checker appears in all three files.
4. Lastmod pair identical (`LASTMOD OK 2026-08-22T21:39:15Z`).
5. `npm run test:public-pages` — 18 pass, fail 0.
   `npm run test:live-promise-spot-check` — 20 pass, fail 0.
   `npm run test:promise-audit` — 72 pass, fail 0.
   `npm run test:product-truth` — `{"ok":true,"checked":"product truth and offer gates"}` (file untouched).
6. `npm run check` — exit 0; Vite build `✓ built in 269ms`.
7. Two product commits on the branch, both pushed. Evidence committed separately under this path.
8. PR: https://github.com/nish3451/seo-fix-kit/pull/205

## Commits

1. `e18d7c4` fix(copy): name live free AI visibility checkers beside CrawlRaven on ai-answer-readiness
2. `576f727` chore(sitemap): align ai-answer-readiness lastmod with the renderer commit
3. this evidence file
