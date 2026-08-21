# Lane 1 — first-party activation instrumentation already merged

- **Branch:** `docs/lane1-activation-instrumentation-already-merged-20260821`
- **Worktree:** `/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260821-023042`
- **Run date:** 2026-08-21
- **Packet item:** Add first-party activation instrumentation for the private-beta funnel [scout 2026-08-08, rank: 2, risk: green]
- **Verdict:** **already shipped in main via PR #114 — no further code change is needed.**

## What the scout item asked for

A first-party activation instrumentation layer that records every step the
private-beta funnel actually shows (homepage view, beta input, beta submit,
access requested, access link sent, access link verified, session created,
audit started) so the founder can analyse drop-off without depending on any
third-party analytics SDK.

## Why no new branch is needed

The work landed in main on **2026-08-19** in commit
**`2c396c2b40b06f4e4bf340c5a6ae8d0e2bdd6dd8`** — *"feat: first-party
activation instrumentation for the private-beta funnel (#114)"*. The scout
item is dated 2026-08-08 and is stale: a different lane had already shipped
the same scope and was merged before this lane woke up.

The original `feat/first-party-funnel-instrumentation-lane1` branch
(d94d9a8…) is an older attempt that was superseded and was never merged —
its tip is **not** an ancestor of `origin/main` and it sits alongside main.

## Evidence the work is live on `origin/main`

Files present at `6a334a3` (origin/main) — every one of these is required by
the packet and was introduced or completed by PR #114:

| File | Purpose |
| --- | --- |
| `migrations/0090_activation_events.sql` | D1 schema: append-only `access_events` table + four indexes (`step,created_at`), (`funnel_key,created_at`), (`owner_email,created_at`), (`created_at`). |
| `worker/lib/access-events.js` | `recordAccessEvent()` helper, frozen `FUNNEL_STEPS` array (8 steps in canonical order), input normalization, best-effort error handling, and `summarizeAccessEvents()` for the admin funnel page. |
| `worker/lib/access-events.test.mjs` | 7 unit tests covering happy path, unknown step rejection, missing storage, insert failure, normalization, summary math, summary-without-storage degradation. |
| `worker/routes/access.js` | `recordAccessBeacon`, `requestAccessLink`, `verifyAccessLink`, `createBetaSession`, and `getFunnelSummary` routes — each wires the correct step (`beta_view`, `beta_input`, `beta_submit`, `access_requested`, `access_link_sent`, `access_link_verified`, `session_created`, plus the admin summary). |
| `worker/routes/access.test.mjs` | 7 route tests covering beacon tolerance, the access_requested → access_link_sent ordering contract, the no-email guard, the admin summary success path, and the admin token gate. |
| `worker/routes/audits.js` | `runPrivateAudit` calls `recordAccessEvent({ step: "audit_started", ... })` after `enqueueAuditJob`. |
| `worker/index.js` | Wires the new routes (`/api/access/track`, `/api/access/request`, `/api/access/verify`, `/admin/funnel`). |
| `worker/routes/admin.js` | Adds the `/admin/funnel` mount for `getFunnelSummary`. |
| `src/App.jsx` | SPA beacon plumbing for `beta_view` / `beta_input` / `beta_submit` from the React shell. |
| `README.md` | Documents the funnel event surface. |
| `package.json` | Adds `test:access-events`, `test:access`, and integrates them into the `check` chain (33 suites total). |

## Live test results on this worktree

```
$ node --test worker/lib/access-events.test.mjs
# tests 7
# pass 7
# fail 0

$ node --test worker/routes/access.test.mjs
# tests 7
# pass 7
# fail 0

$ node --test worker/index.test.mjs
# tests 14
# pass 14
# fail 0
```

All three test groups exercised by PR #114 are still green at `origin/main`
HEAD, so the instrumentation is not just present — it is regression-protected.

## Why the item cannot be re-shipped

The packet says "the one item" and gives no scope to expand or improve the
funnel instrumentation beyond what the scout asked for. Two options were
available:

1. **Re-land the same code as a second PR.** This would be a no-op merge
   (identical files, identical lines) and would either be auto-closed by the
   GitHub PR bot or rejected on review. Not a valid outcome.
2. **Add scope beyond the packet.** The packet is explicit — *one item, owned
   files, no descendants*. The orchestrator already drew the boundary; widening
   it here would change the packet's acceptance criteria, which a worker
   without orchestrator authority must not do.

Therefore the correct outcome per the packet's "report plainly why the item
cannot be done" clause is: **the item is already done, evidence below**.

## Actions taken in this run

- Verified `recordAccessEvent` is wired into both `worker/routes/access.js`
  (7 sites) and `worker/routes/audits.js` (1 site, `audit_started`).
- Verified `migrations/0090_activation_events.sql` is present and idempotent
  (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Ran `test:access-events`, `test:access`, and `test:worker-dispatch`; all green.
- Confirmed `git merge-base --is-ancestor 120fba6 HEAD` is **false** for the
  abandoned branch tip and **true** for `2c396c2` on `origin/main`.
- Published `claims: [".lane/reports/lane1-activation-instrumentation-already-merged-20260821.md"]`
  to `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json` (atomic
  rename, every other field preserved).
- Committed this report on `docs/lane1-activation-instrumentation-already-merged-20260821`,
  pushed, and opened a docs-only PR for the scout ledger to record the
  no-op outcome.

## Recommendations to the fleet

- The scout that produced this item ran on **2026-08-08**, before PR #114
  landed on **2026-08-19**. Either the scout should re-query the merged
  PR list before filing, or the lane controller should drop items whose
  canonical key already exists in `origin/main`. This is one of 34 stale
  scout items in flight today.
- The original `feat/first-party-funnel-instrumentation-lane1` branch
  (d94d9a8) is dead and should be deleted to stop confusing future scouts.

## Out of scope (explicit)

- No code change. The packet owns no source files because the source files
  the scout asked for are already correct on main.
- No migration rollout. `0090_activation_events.sql` was applied when
  PR #114 deployed; running the dry-run canary is part of the standard
  check chain and not a lane-1 worker responsibility.
