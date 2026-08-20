# Lane 1 report: /check FAQ + JSON-LD privacy wording — third re-verification

- **Date:** 2026-08-20
- **Worker:** fleet-dispatch-lane-worker-seo-fix-kit-1 (MiniMax-M3)
- **Branch:** `lane1-faq-jsonld-wording-reverify-20260820`
- **Base:** `origin/main` @ `7783adc` ("Repair Sprint checkout, eligibility and delivery proof (#54)")
- **Item:** `e45b46698c` — "`/check` FAQ block + JSON-LD still carry the pre-#88
  'nothing about your check is saved' wording, contradicting the post-#88 page body"

## Outcome

**The item is stale. No product change was needed or made.**

The defect it describes was fixed six days before this dispatch and has been
locked against regression since. Both prior lane runs of the same item reached
the same conclusion (2026-08-15, 2026-08-17). This run re-verified the claim
independently from scratch at the *current* `origin/main` head — source,
offline tests, and the live deployed surface — rather than trusting those
reports. Everything is clean.

## Provenance of the fix

| Commit | PR | What it did |
| --- | --- | --- |
| `b6f9935` | #135 (2026-08-14) | Replaced the pre-#88 overpromise with the truthful hashed-counter disclosure on both `/check` FAQ surfaces |
| `bc73285` | #152 (2026-08-15) | Added negative regression pins so the old wording cannot silently return |

Both confirmed ancestors of `origin/main` @ `7783adc` via
`git merge-base --is-ancestor`.

## Verification performed (2026-08-20)

### 1. Source — clean

`grep -rn "nothing about your check is saved\|anonymous and ephemeral"` over
`worker/ public/ shared/ src/ server/` returns **only** the two negative
assertions in `worker/routes/public-check.test.mjs` (lines 389, 393). That is
precisely where the phrase *should* appear — inside the guard that forbids it.

The live copy in `worker/routes/public-check.js` reads identically on both
surfaces:

- L270 — `checkJsonLd(origin)`, FAQPage `acceptedAnswer` for "Is anything about
  my check stored?"
- L409 — `checkHtml(origin)`, the visible FAQ `<p>` under the same question

> "No report or URL from your check is stored. The only records are short-lived
> anonymous rate-limit counters: a hash of your network and a hash of the
> checked site, which expire automatically."

Two further surfaces carry a consistent short form (L52 disclaimer constant,
L402 scope paragraph), so the page does not contradict itself anywhere.

### 2. Offline tests — green

- `node --test worker/routes/public-check.test.mjs` → **15/15 pass**
- `node --test worker/routes/pages.test.mjs` → **15/15 pass**

The pinning test ("public check page carries WebPage and truthful FAQ JSON-LD")
asserts the corrected wording present *and* the pre-#88 wording absent on both
the JSON-LD `acceptedAnswer` and the rendered HTML, plus a cross-check loop
requiring every schema answer to be readable in the rendered page.

### 3. Live surface — clean

`GET https://seofixkit.com/check` → `200`.

- Stale phrase `nothing about your check is saved`: **0 occurrences**
- Corrected disclosure: **2 occurrences** (JSON-LD + visible FAQ, as expected)
- Parsed the `application/ld+json` graph: types `WebPage, FAQPage`; the
  FAQPage entry "Is anything about my check stored?" returns the corrected
  answer verbatim, stale-phrase test `false`.

Deployed surface matches source at `origin/main`.

## Files claimed

- `.lane/reports/lane1-faq-jsonld-wording-reverify-20260820.md` (this report only)

No product or test files were modified.

## Recommendation for the lane controller

Close item `e45b46698c` and stop redispatching it. Three independent lanes
(2026-08-15, 2026-08-17, 2026-08-20) have now spent a full run each confirming
a fix that landed in #135 and was pinned in #152. The scout queue is holding a
snapshot of the repo from before 2026-08-14; items should be re-validated
against current `origin/main` before dispatch, or dispatched with an explicit
"verify or fix" posture so a lane can close a stale item cheaply instead of
re-proving it end to end.

## Completion marker

RESOLVED
