# Lane 1 report — verify harvest public-check-generated-snippet-provenance candidate round

Branch: `lane1/verify-harvest-public-check-snippet-provenance-already-landed-20260820`
Worktree: `/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260820-160045`
Date: 2026-08-20

## TL;DR

The item "Harvest the abandoned 'public-check-generated-snippet-provenance' candidate round — 5 worktree(s) hold finished, unharvested work" has already been completed.

The harvest branch `harvest/public-check-snippet-provenance-lane1` was created on 2026-08-15 and merged into `origin/main` the same day via PR #145 (merge commit `19e29af`). The three pieces that never reached main were landed in commit `343e5ce`, and the lane-1 report was added in `bf3239a`. No new harvest is needed.

## Live evidence

### 1. The harvest branch exists and is on origin

```
$ git log --oneline origin/harvest/public-check-snippet-provenance-lane1
bf3239a docs(lane-1): report harvest of public-check candidate round
343e5ce harvest: land abandoned public-check candidate-round fixes
```

### 2. The work is already merged into main

```
$ git log --oneline origin/main --grep="harvest"
19e29af harvest: land abandoned public-check candidate-round fixes (lane 1) (#145)
```

PR #145 was merged by Nish on 2026-08-15 02:35 +0530 (commit `19e29af`).

### 3. The harvest code is in origin/main (HEAD 7783adc)

- `shared/audit-engine.js` carries `loadSettled` (lines 817, 826, 1013, 1392, 1972, 2707) — the
  network-idle truthfulness fix that prevents a `networkidle0` timeout from becoming a fake
  "Slow rendered load" finding.
- `server/index.js` exposes `page_summaries` (line 4678) so per-page scores reach API consumers.
- `server/audit/smoke-test.js` pins the "H1 exists after render" / "internal links exist after render"
  guard findings so the static-vs-rendered proof loop cannot silently regress.

### 4. The 5 candidate worktrees have nothing new to harvest

| Worktree | Branch tip | Hold status vs. main |
|---|---|---|
| `seo-fix-kit-lane1-candidate-1` | `ffd5c76` (detached) | No commits beyond main's ancestor at that tip; nothing to harvest |
| `seo-fix-kit-lane1-candidate-2` | `902c0ef` (on `seo-fix-kit/lane1-candidate-2`) | Already landed via PR #111; branch tip is older than the merged version |
| `seo-fix-kit-lane1-candidate-3` | `ffd5c76` (detached) | No commits beyond main's ancestor at that tip; nothing to harvest |
| `seo-fix-kit-lane1-candidate-4` | `ffd5c76` (detached) | No commits beyond main's ancestor at that tip; nothing to harvest |
| `seo-fix-kit-lane1-candidate-5` | `ffd5c76` (detached) | No commits beyond main's ancestor at that tip; nothing to harvest |

All 5 worktrees sit at or behind the merge base of the harvest branch — the harvest already pulled
out every piece that was both finished and missing from main.

### 5. The original report file is already on disk

`.lane/reports/harvest-public-check-snippet-provenance-lane1.md` (committed in `bf3239a`) documents
the per-worktree audit table and the verification commands that were run on the day the harvest
landed:

- `node --test shared/audit-engine.test.mjs` — 33/33 pass (incl. 2 new loadSettled tests)
- `node --test worker/routes/developer-api.test.mjs` — 34/34 pass (incl. new per-page-scores test)
- `node --test worker/routes/public-check.test.mjs` — 9/9 pass
- `node --test worker/routes/pages.test.mjs` — 13/13 pass
- `node --test src/app-contract.test.mjs` — 14/14 pass
- `node --test server/audit/smoke-test.js` — passes with the new guard-title loop
- `npm run build` — succeeds

## What this lane does

1. Creates this lane-specific report (the only file in the lane-1 worktree touched) so the
   controller and any future auditor can see the item was closed on 2026-08-15 and re-checked
   on 2026-08-20.
2. Publishes the claim path (this report) to the lane-1 record.
3. Pushes the branch and opens a verification PR against main (no code changes; docs/report only).

## Why this is "plainly cannot be done" rather than a no-op land

The packet says: "Finish by pushing a branch and opening a PR, or by reporting plainly why the
item cannot be done." This is the second path. The harvest was a one-time, irreversible land
of three code changes per commit `343e5ce`. Re-running it would either be a no-op (the code
is already in main) or destructive (revert or re-apply against a much-changed base, with
high risk of overlap with #143, #118, #157, #137, etc. that landed after the harvest).

The correct outcome is to leave the merged work alone, document that the item is closed, and
push a verification-only report on a lane-1 branch.

## Files touched

- `.lane/reports/lane1-verify-harvest-public-check-snippet-provenance-already-landed-20260820.md`
  (new — this report; only file in the worktree changed)
