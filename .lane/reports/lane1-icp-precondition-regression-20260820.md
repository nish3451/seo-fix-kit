# Lane 1 report: ICP experiment precondition regression 2026-08-20

- **Branch:** `lane1-icp-precondition-regression-20260820`
- **Worktree:** `/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260820-230037`
- **Date:** 2026-08-20
- **Base for live check:** `https://seofixkit.com`
- **Origin/main baseline at run start:** `994032f` (fresh fetch 2026-08-20)

## Status

**Preconditions are NOT green today — do not start the seven-day window yet.**
`npm run audit:live-promise` against the deployed site fails on 4 surfaces, all
tied to the before/after repair receipt (`/proof`): `/proof` and `/proof.md`
return 404, and `/llms.txt` + `/sitemap.xml` no longer list the receipt. The
offline regression lock is green (`npm run test:live-promise-spot-check` 18/18
on current main), so the repo source is correct — this is the same
**deploy-machinery regression class as 2026-08-14**, not copy drift.

## Verification (live, 2026-08-20)

`npm run audit:live-promise` against `https://seofixkit.com` — **16/20 green,
4 fail**:

| Surface | Live result 2026-08-20 |
|---|---|
| `/proof` | **404** (missing receipt headline, before 85 / intermediate 99 / after 100, source report id, rerun ids, owner-approved PR #4/#5 links, no-ranking boundary, no-CMS/GitHub-publishing boundary, markdown receipt CTA) |
| `/proof.md` | **404** (missing markdown receipt, served as text/html instead of text/markdown, score pins, PR #4/#5 refs, no-ranking boundary) |
| `/llms.txt` | 200 but **missing the before/after receipt listing** |
| `/sitemap.xml` | 200 but **missing the before/after receipt URL** |
| `/demo`, `/methodology`, `/packages` | green |
| `/check` | green (no-storage disclosure present) |
| `/support`, `/terms`, `/privacy` | green |
| `/robots.txt`, `/api/health`, `/api/deep-health` | green |
| `POST /api/public-check` (validation + non-http rejection) | green |
| `www.seofixkit.com` root, `/check`, `/favicon.svg`, `/.well-known/security.txt`, `/unknown-spa-path` | all 301 → apex, green |

Direct curl confirmation:

- `https://seofixkit.com/proof` → HTTP 404, text/html
- `https://seofixkit.com/proof.md` → HTTP 404, text/html
- `https://seofixkit.com/llms.txt` → HTTP 200, text/plain (no `/proof` receipt entry)
- `https://seofixkit.com/sitemap.xml` → HTTP 200, application/xml (no receipt URL)
- `https://seofixkit.com/check` → HTTP 200; "No report or URL is stored: only
  short-lived anonymous rate-limit counters …" present
- Homepage bundle marker: `assets/index-9gz2OE-i.js` (matches recorded release marker)

## Root cause

Deployed Worker is **stale relative to origin/main**. The recorded release
(`agent-state/lanes/release-state-seo-fix-kit.json`: sha `c53e28f`, marker
`assets/index-9gz2OE-i.js`, deployment `9fd4664d-efe7-4706-8cb9-9afa5337bc61`)
predates the `/proof` before/after receipt publication (PR #138/#151 landed
`9a91c19` / `b9f7e32` and the spot-check pins `47bb34f`). The live site serves
the older bundle that has no `/proof` route and no receipt lines in
`/llms.txt`/`/sitemap.xml`.

The repo source is correct: the offline live-promise spot-check lock
(`npm run test:live-promise-spot-check`) is **18/18 green on origin/main
`994032f`** (which includes the `/proof` pins). This is the same stale
Worker+assets deployment pattern diagnosed 2026-08-14 — a deploy machinery
regression, not copy drift.

## Consequence for the experiment

The seven-day window must **not start**. `window_start` stays unfilled. The
founder should re-verify (`npm run audit:live-promise`) after the next fleet
release that actually swaps the live Worker to a bundle containing the `/proof`
route, before sending invitation #1. No invitations were sent by this run;
outreach remains founder-owned.

## Note on evidence trail

The experiment log's 2026-08-17 entry references
`.lane/reports/lane1-icp-precondition-reverify-20260817.md`, but that file is
**not tracked in the repo** (the tracked 2026-08-17 report is
`lane1-icp-precondition-green-20260815.md`... the 2026-08-17 entry's evidence
file appears to have been lost/never committed with PR #161). This run does not
fabricate that missing evidence; the 2026-08-20 entry below is the live truth.

## Files touched

- `docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md` — dated
  2026-08-20 precondition re-verification: NOT green, window must not start;
  root cause (stale deploy, `/proof` receipt missing live).
- `.lane/reports/lane1-icp-precondition-regression-20260820.md` — this evidence report.
