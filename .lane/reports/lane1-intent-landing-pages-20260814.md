# Lane 1 report — intent-matching SEO/GEO landing pages with machine-readable proof

Date: 2026-08-14
Branch: `lane1/intent-landing-pages` (from fresh `origin/main` @ `51cf111`)
PR: https://github.com/nish3451/seo-fix-kit/pull/137

## What was delivered

Three Worker-served, intent-matching public landing pages, each with
machine-readable proof (JSON-LD) and truthful boundaries:

- `/small-business-seo-audit` — proof-backed small-business SEO audit
- `/rendered-vs-static-seo-audit` — rendered-vs-static false-positive guard
- `/ai-answer-readiness` — site-proof AI Answer Readiness boundary

Each page carries:
- Unique `<title>`, meta description, and canonical
- A visible FAQ rendered from the same array as FAQPage JSON-LD, plus
  WebPage and SoftwareApplication JSON-LD (3 blocks total)
- A "What this page does not claim" section and links into `/check` and `/demo`
- No claim of live answer-engine sampling, AI citation monitoring, or rankings

## Files changed

| Path | Why |
|------|-----|
| `worker/routes/pages.js` | Added `ldBlock`, extended `publicProductPageHtml` with `faq` + `softwareDescription` JSON-LD, added the 3 page functions, llms.txt/homeMarkdown entries, exports |
| `worker/index.js` | Imported + routed the 3 landing pages |
| `server/index.js` | Express mirror routes for local dev |
| `shared/audit-engine.js` | `rootSitemap` includes the 3 paths |
| `public/sitemap.xml` | Static sitemap lists the 3 URLs |
| `public/.well-known/skill.md` | Agent-facing skill file lists the 3 pages |
| `README.md` | "What is live" + Cloudflare-path claims updated |
| `worker/routes/pages.test.mjs` | New landing-page suite; sitemap/llms/skill expectations updated |
| `scripts/live-promise-spot-check.mjs` + `.test.mjs` | 3 new live page spot-checks |
| `shared/promise-audit.test.mjs` | README promise + Worker route claims extended |

## Evidence

- `npm run check` exit 0 (full chain: billing, product-truth, audit, worker
  dispatch, pages, public-check, audit-engine, account, ai-answer-readiness,
  growth, repair-queue, repair-proof-receipt, repair-implementation-pack,
  repair-agent, developer-api, remediation, audit-batch-runner, webhooks,
  app-contract, promise-audit, live-promise-spot-check, funnel-walk,
  large-crawl, canary-dry-run, check-inventory, vite build)
- `node --test worker/routes/pages.test.mjs`: 11/11 pass (landing pages emit 3
  JSON-LD blocks each, visible FAQ, unique titles, no-overclaim copy)
- `node --test scripts/live-promise-spot-check.test.mjs`: 14/14 pass
- Live Express mirror: all 3 pages HTTP 200 with 3 `application/ld+json`
  blocks and correct canonicals (verified 2026-08-14, then server stopped)
- Branch pushed; PR #137 open; CI check pending at report time

## Context

This item was attempted twice before (PR #78, PR #112) but never merged — the
work lived only on the stale `seo-fix-kit/lane1-intent-landing-pages-refresh`
branch, which diverged ~3,600 lines from current main and could not be rebased.
This lane re-implemented the same proven content/approach on fresh `origin/main`.

## Notes

- Claims were published to `lane-1.json` before editing and left otherwise untouched.
- No shared report files were written; this report is lane-unique.
- `node_modules` is untracked (gitignored), not part of the branch.
