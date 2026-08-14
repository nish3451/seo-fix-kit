# Lane 1 report: same-origin canonical 522/523/524 false findings

## Item
Free /check engine still emits false same-origin findings at warning/notice tier — "Canonical URL is not reachable".

## Root cause
`shared/audit-engine.js` classifies canonicals as `kind: "canonical"` always. The
`isSameOriginInfraFailure` guard added in #91 (same-origin 522/523/524 = transient
Cloudflare origin error, not a broken resource) only applies to `kind: "internal"`,
so a same-origin canonical (self-referential, apex↔www, www→apex) hitting the same
origin hiccup still produced the warning-tier "Canonical URL is not reachable"
finding — duplicating the false positive already suppressed for the page's own links.

## Fix
- `shared/audit-engine.js`: compute the canonical's origin; when it equals the audited
  page's origin, classify the canonical check as `kind: "internal"` so
  `isSameOriginInfraFailure` shields it. Cross-origin canonicals keep
  `kind: "canonical"` and stay reportable (a third party's origin failure is a real
  observation). Added `safeOrigin()` helper.
- `shared/audit-engine.test.mjs`: two regression tests following the #91 test pattern —
  same-origin 522/523/524 canonical produces neither the unreachable warning nor a
  redirect notice; cross-origin 522/523/524 canonical still surfaces the warning with
  evidence citing the third-party URL.

## Evidence
- `npm run test:audit-engine`: 31/31 pass (includes the two new tests).
- `npm run check`: only pre-existing environment failures in
  `scripts/wrangler-dry-run.test.mjs` — the scratch-root picker cannot find a clean
  root on this VPS. Reproduced on a pristine `origin/main` baseline worktree (7/7
  fail there), confirming it is environmental, not this diff.
- PR: https://github.com/nish3451/seo-fix-kit/pull/143
- Commit: a9e9a27

## Notes
- `memoryctl context` is gated: one unrelated pending raw note
  (meta-graduation-diagnosis-20260814, Meta ads lane) blocks all context retrieval.
  Checked compiled shared-memory directly; no relevant seo-fix-kit notes exist for
  this bug class. Did not curate/approve another lane's note.
