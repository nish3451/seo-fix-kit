# Fix Pack Proof Runner Plan

Created: 2026-06-20

## Problem

The live audit batch runner can create a production beta session, run an audit, and fetch the saved report, but it discards the session before proving the Fix Pack request path. A later invite for the same owner cannot read the old report because production correctly ties reports to the original invite id.

## Outcome

Add an optional proof mode that requests a Fix Pack from the saved report inside the same authenticated production session. This proves the real audit-to-checkout boundary without exposing private cookies, admin tokens, or raw checkout URLs.

## Requirements

- R1. Default audit batch behavior stays unchanged unless proof mode is enabled.
- R2. Proof mode runs only after an audit completes and the report has actionable findings.
- R3. Reports with zero actionable findings must skip Fix Pack proof and say why.
- R4. The output may show request status, checkout presence, checkout host, selected repair, and proposal summary, but must not persist or print the raw checkout URL.
- R5. A live run against a controlled SEO Fix Kit fixture should produce one saved report and a checkout-created or honest checkout-blocked boundary.

## Implementation

- Add `SEOFIXKIT_FIX_PACK_PROOF=1` to enable same-session Fix Pack proof.
- Add a `requestFixPack(reportId, cookie)` helper that calls `/api/beta/fix-request`.
- Add sanitized `fixPack` summary data to each audited target and to markdown output.
- Extend runner tests for zero-finding skip and finding-to-checkout summary.

## Verification

- `node --test scripts/run-live-audit-batch.test.mjs`
- `npm run check`
- `npm audit --audit-level=low`
- `gitleaks detect --no-banner --redact --source .`
- `autoreview --mode local`
- Live controlled fixture run with `SEOFIXKIT_FIX_PACK_PROOF=1`
