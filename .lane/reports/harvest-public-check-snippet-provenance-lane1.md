# Lane 1 report — harvest public-check-generated-snippet-provenance candidate round

Branch: `harvest/public-check-snippet-provenance-lane1`
Commit: `343e5ce` (pushed to origin, PR opened)

## What the item was

The abandoned "public-check-generated-snippet-provenance" candidate round left
5 worktrees (`seo-fix-kit-lane1-candidate-1..5`) holding finished, unharvested
changes. Investigation of each worktree against current main:

| Worktree | Held | Status in main |
|---|---|---|
| candidate-1 | `page_summaries` exposure in API report serializers + developer-api test | **Missing — harvested** |
| candidate-2 | "demo: show real engine output" (commit 902c0ef) | Already landed (PR #111, evolved) |
| candidate-3 | `loadSettled` truthfulness fix (never-idle fallback vs slow-load finding) + App.jsx annotations | **Missing — harvested** |
| candidate-4 | static facts from script-stripped HTML | Already landed (staticMarkup) |
| candidate-5 | same static-extraction fix + smoke-test guard loop | Static fix landed; **smoke-test guard loop missing — harvested** |

## Changes landed (commit 343e5ce)

1. **shared/audit-engine.js + src/App.jsx**: track `loadSettled` on rendered
   facts. When the `networkidle0` wait times out and the audit falls back to
   `domcontentloaded`, `loadDurationMs` is dominated by our own navigation
   timeout. Reporting it as a "Slow rendered load" finding, or as proof the
   page "reached network idle", sells our measurement policy as the customer's
   defect (same family as the throttled-link and empty-header bugs). The
   slow-load finding now only fires when the page actually settled; the repair
   brief annotates the fallback explicitly; the UI shows "network idle not
   reached" / "wait timed out" instead of a bare misleading number.
2. **worker/lib/serializers.js + server/index.js + worker/routes/developer-api.test.mjs**:
   expose the engine's `pageSummaries` as `page_summaries` in API report
   responses, with a regression test pinning per-page score fields.
3. **server/audit/smoke-test.js**: pin that the rendered fixture produces the
   "H1 exists after render" and "internal links exist after render" guards, so
   the static-vs-rendered proof loop cannot silently regress.

## Verification

- `node --test shared/audit-engine.test.mjs` — 33/33 pass (incl. 2 new loadSettled tests)
- `node --test worker/routes/developer-api.test.mjs` — 34/34 pass (incl. new per-page-scores test)
- `node --test worker/routes/public-check.test.mjs` — 9/9 pass
- `node --test worker/routes/pages.test.mjs` — 13/13 pass
- `node --test src/app-contract.test.mjs` — 14/14 pass
- `node server/audit/smoke-test.js` — passes with the new guard-title loop
- `npm run build` — succeeds
