# Lane 1 report: /check FAQ + JSON-LD privacy wording — verification

- **Date:** 2026-08-17
- **Worker:** fleet-dispatch-lane-worker-seo-fix-kit-1
- **Branch:** `lane1-faq-jsonld-wording-verify-20260817`
- **Base:** `origin/main` @ `cb0ae84`
- **Item:** `e45b46698c` — "`/check` FAQ block + JSON-LD still carry the pre-#88
  'nothing about your check is saved' wording, contradicting the post-#88
  hashed-counter reality"

## Outcome

**Item already implemented, tested, and live.** No code change was needed. The
pre-#88 wording was removed from both `/check` FAQ surfaces by PR #135
(`b6f9935`, "fix: align /check FAQ and JSON-LD storage wording with
hashed-counter reality (#88)", 2026-08-14), and PR #152 (`bc73285`, 2026-08-15)
added regression pins on both surfaces so the contradiction cannot silently
regress. Both commits are ancestors of `origin/main` at the head of this
worktree (`cb0ae84`). A prior lane run dispatched the same scout item reached
the same conclusion on 2026-08-15
(`.lane/reports/lane1-faq-jsonld-privacy-wording-pin-20260815.md`).

I re-verified the fix independently against the live system and the offline
regression locks rather than re-implementing it. All checks pass.

## What the fix does (already in repo)

- `worker/routes/public-check.js` `checkJsonLd(origin)` — FAQPage
  `acceptedAnswer` for "Is anything about my check stored?" now reads: "No
  report or URL from your check is stored. The only records are short-lived
  anonymous rate-limit counters: a hash of your network and a hash of the
  checked site, which expire automatically."
- `worker/routes/public-check.js` `checkHtml(origin)` — the visible FAQ
  paragraph under the same question carries the identical post-#88 disclosure,
  so the schema and the page never disagree.
- `worker/routes/public-check.test.mjs` ("public check page carries WebPage and
  truthful FAQ JSON-LD") — pins the corrected wording *present* and the pre-#88
  wording *absent* on both surfaces:
  - `assert.match(storedAnswer.acceptedAnswer.text, /no report or URL from your
    check is stored/i)`
  - `assert.doesNotMatch(storedAnswer.acceptedAnswer.text, /nothing about your
    check is saved/i)` (JSON-LD)
  - `assert.doesNotMatch(html, /nothing about your check is saved/i)` (visible
    FAQ), plus the "every schema answer is a claim a visitor can read in the
    rendered page" loop that cross-checks JSON-LD against rendered HTML.

## Verification performed (2026-08-17)

Offline (this worktree, fresh `origin/main` `cb0ae84`):
- `npm run test:public-check` — 10/10 pass, including the wording pin test.
- `npm run test:public-pages` — 14/14 pass, including the `/check` copy pin
  (`/no report or URL is stored/i` and the visible FAQ question).
- Source-wide grep for `nothing about your check is saved` and
  `anonymous and ephemeral` over `worker/`, `public/`, `shared/`, `src/`,
  `server/`, `docs/`: the only matches are the two negative regression
  assertions in `worker/routes/public-check.test.mjs` — which is exactly what
  the pin test should contain.

Live (deployed `https://seofixkit.com/check`, fetched 2026-08-17):
- Visible HTML: pre-#88 phrase absent; the corrected disclosure "No report or
  URL from your check is stored" present.
- FAQPage JSON-LD `acceptedAnswer` for "Is anything about my check stored?":
  pre-#88 phrase absent; corrected disclosure present.
- The deployed surface therefore matches the source at `origin/main`.

## Files claimed

- `.lane/reports/lane1-faq-jsonld-wording-verify-20260817.md` (this report).
  No product files were modified — the item's owned file
  (`worker/routes/public-check.js`) already contains the post-#88 copy and its
  test file already pins both surfaces.

## Recommendation for the lane controller

Mark item `e45b46698c` complete — PR #135 fixed the copy, PR #152 pinned it,
and this is a further independent verification that both surfaces are clean
offline and live. This scout item is stale: it describes a state that PR #135
already fixed. Future scout items for this product should be dispatched against
a current checkout with a "verify or fix" posture for surfaces that may already
be handled.

## Completion marker

RESOLVED