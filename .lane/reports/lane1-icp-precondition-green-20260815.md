# Lane 1 report: ICP experiment precondition re-verified GREEN 2026-08-15

- **Branch:** `lane1/icp-precondition-green-20260815`
- **Worktree:** `/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260815-074532`
- **Date:** 2026-08-15
- **Base for live check:** `https://seofixkit.com`
- **Commit baseline:** `ea6ef33` (origin/main at run start)

## Status

The ICP experiment precondition (recorded in
`docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md` on
2026-08-14, evidence in `.lane/reports/lane1-icp-precondition-regression-20260814.md`)
is **GREEN again** — the seven-day window may start. The fleet release that
swapped the live Worker to a current bundle landed on 2026-08-15 07:40 UTC
(`agent-state/lanes/release-state-seo-fix-kit.json`: sha `ea6ef33`, marker
`assets/index-9gz2OE-i.js`, deployment `fb50029a-26d5-4924-b378-d7598012bae4`,
version `87ea055d-b352-43ec-9b4d-f56025d14584`), and every previously-failing
surface now serves the current copy.

Outreach remains founder-owned (per the experiment's acceptance criteria the
founder sends invitations and records rows); no invitations were sent by this
run. `window_start` stays unfilled in the experiment log until the founder
sends invitation #1.

## Verification (live, 2026-08-15)

`npm run audit:live-promise` against `https://seofixkit.com` — **20/20 green**
(16 public surfaces + 4 www→apex redirect surfaces):

- `/demo`, `/check`, `/methodology`, `/packages`, `/small-business-seo-audit`,
  `/rendered-vs-static-seo-audit`, `/ai-answer-readiness`, `/support`,
  `/terms`, `/privacy` — all pass their copy/truthfulness pins.
- `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/api/health`,
  `/api/deep-health` — pass.
- `POST /api/public-check` — live and rejects non-http schemes.
- `www.seofixkit.com` root, `/check`, and `/favicon.svg` — 301 onto apex.

Direct curl confirmation of every surface that failed the 2026-08-14 check:

| Surface (2026-08-14 failure) | 2026-08-15 live result |
|---|---|
| `/check` no-storage disclosure | "No report or URL is stored: only short-lived anonymous rate-limit counters …" present |
| `/demo` footer terms/privacy | `https://seofixkit.com/terms` + `/privacy` links present |
| `/methodology` CTA into `/check` | `/check` link present |
| `/methodology` footer terms/privacy | present |
| `/packages` footer terms/privacy | present |
| `/support` link to `/check` | present |
| `/terms` link to `/check` | present |
| `/privacy` links | present |
| `POST /api/public-check` ftp:// | returns HTTP 400 (was 422) |
| `www.seofixkit.com/favicon.svg` | 301 → `https://seofixkit.com/favicon.svg` (was 200) |
| Homepage bundle marker | `assets/index-9gz2OE-i.js` (was stale `index-DX7O9nYF.js`; release marker matches) |

The 2026-08-14 root-cause note (fleet release deployed a stale Worker + assets
bundle; repo source was correct) is resolved: the 2026-08-15 07:40 UTC release
recorded the new bundle marker and the live site serves it.

## Resume path for the founder

1. Start with the Day-0 checklist in the experiment log.
2. Pick the first 5–10 candidates from
   `docs/research/icp-experiment-prospect-candidates-2026-08-12.md` (the
   "Known to founder?" column).
3. Personalize copy from
   `docs/research/icp-experiment-invitation-copy-2026-08-12.txt`; send
   invitation #1; fill `window_start` and prospect-log row 1.
4. Daily: update G1–G4 counts and Day-N channel notes.
5. At window_end: fill the keep/kill decision, commit the log.

## Files touched

- `docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md` — dated
  2026-08-15 precondition re-verification: GREEN, window may start; known-limitation
  note refreshed.
- `.lane/reports/lane1-icp-precondition-green-20260815.md` — this evidence report.
