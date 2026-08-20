# Lane 1 report: same-origin canonical 522/523/524 — true coverage

## Item
Free /check engine still emits false same-origin findings at warning/notice tier — "Canonical URL is not reachable".

## Root cause
The previous fix (#143, commit a9e9a27) carried the right logic: in
`shared/audit-engine.js`, classify a canonical as `kind: "internal"` when its
origin matches the page's origin, so `isSameOriginInfraFailure` shields the
canonical check from 522/523/524. The shipped regression test, however, set
`canonical: "https://public.example/"` (the page URL itself). The canonical
check then fetched the page URL, which the fetch handler returned 200 for, so
the `/canonical` response with 522/523/524 was never exercised. The assertion
passed trivially — the test was a no-op that could not have caught a real
regression in the canonical-kind logic.

That no-op test is exactly why the packet stayed "still emits false
same-origin findings at warning/notice tier" — the production code was
correct but the coverage would not have caught anyone removing the
`canonicalKind = "internal"` branch, and the same-origin versus cross-origin
distinction was never actually exercised end-to-end.

## Fix
- `shared/audit-engine.test.mjs`:
  - **Rewrote the existing same-origin 522/523/524 canonical test** so the
    canonical is genuinely a different URL on the same origin
    (`https://public.example/canonical`), the fetch handler returns 522/523/524
    for that URL, and the assertions verify both the canonical check's
    `kind: "internal"` tag and the actual fetched `status` so the test cannot
    silently degrade into a 200-passes-everything case.
  - **Added a self-referential canonical test** (canonical === page URL) that
    pins the inherited 200 response and asserts neither the unreachable
    warning nor the redirect notice is emitted on a clean page.
  - The cross-origin 522/523/524 test is unchanged — cross-origin canonical
    failures must keep surfacing as real observations about the third party.

No production code in `shared/audit-engine.js` changes; the existing fix in
a9e9a27 is correct and now actually verified.

## Evidence
- `node --test shared/audit-engine.test.mjs`: 35/35 pass (33 prior + the
  rewritten same-origin 522/523/524 canonical test + the new self-referential
  canonical test).
- `node --test worker/routes/public-check.test.mjs`: 15/15 pass — the public
  surface contract is unchanged.
- Ad-hoc verification: a stand-alone probe confirmed the canonical check on
  `https://public.example/canonical` (same origin, status 523) tags
  `kind: "internal"`, fetches the actual 523, and emits no
  "Canonical URL is not reachable" finding.

## Files touched
- `shared/audit-engine.test.mjs` — rewrote the same-origin 522/523/524
  canonical test (different URL, assertions on kind + status) and added a
  self-referential canonical test.
- `.lane/reports/fix-check-canonical-same-origin-true-lane1.md` — this report.

## Notes
- Branch: `fix/check-canonical-same-origin-true-lane1` (off fresh
  `origin/main`).
- The earlier fix report at
  `.lane/reports/fix-check-canonical-same-origin-lane1.md` is left untouched
  as a historical record of the original fix.
- `memoryctl context` is gated by an unrelated pending raw note; no
  reusable shared-memory ledger was updated.
