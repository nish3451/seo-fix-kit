# Lane 1 report: /check FAQ + JSON-LD privacy wording regression pins

- **Branch:** `lane1/faq-jsonld-privacy-wording-pin-20260815`
- **Worktree:** `/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260815-082041`
- **Date:** 2026-08-15
- **Base:** `origin/main` @ `eefca59`
- **Item:** `/check` FAQ block + JSON-LD still carry the pre-#88 "nothing about your check is saved" wording, contradicting the post-#88 page body

## Outcome

The item's copy defect was **already fixed on main** by PR #135
(`b6f9935`, "fix: align /check FAQ and JSON-LD storage wording with hashed-counter
reality (#88)"), which is an ancestor of HEAD. Verified in this run:

- Zero occurrences of the pre-#88 wording anywhere in source:
  `grep -rn "nothing about your check\|anonymous and ephemeral"` over
  `worker/` and `public/` → no matches.
- `worker/routes/public-check.js` lines ~271 (JSON-LD `acceptedAnswer`) and ~407
  (visible FAQ `<p>`) both carry the post-#88 disclosure: "No report or URL from
  your check is stored. The only records are short-lived anonymous rate-limit
  counters: a hash of your network and a hash of the checked site, which expire
  automatically."
- The 2026-08-15 07:40 UTC fleet release swapped the live surface to current
  copy; the ICP-precondition re-verification report
  (`.lane/reports/lane1-icp-precondition-green-20260815.md`) already confirmed
  the live `/check` shows the corrected disclosure.

## What this run added

The item's own verify clause requires that the suite pin **both** FAQ surfaces
(visible FAQ and JSON-LD `acceptedAnswer`) to the post-#88 wording "so this
cannot silently regress". The suite only asserted the new wording was present,
never that the old wording was gone. This PR closes that gap:

- `worker/routes/public-check.test.mjs` — in the "public check page carries
  WebPage and truthful FAQ JSON-LD" test:
  - `assert.doesNotMatch(storedAnswer.acceptedAnswer.text, /nothing about your check is saved/i)`
  - `assert.doesNotMatch(html, /nothing about your check is saved/i)` (visible FAQ)

## Verification

- `npm run test:public-check` → 10/10 pass.
- `npm run check` (full suite incl. promise-audit, live-promise spot-check,
  funnel-walk, build) → all green.

## Files touched

- `worker/routes/public-check.test.mjs` — regression pins (2 assertions).
- `.lane/reports/lane1-faq-jsonld-privacy-wording-pin-20260815.md` — this report.

## Completion marker

RESOLVED
