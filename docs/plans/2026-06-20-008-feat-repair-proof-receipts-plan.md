# Repair Proof Receipts Plan

## Why

SEOFixKit is not 11/10 launch-ready until a repaired issue can end with a simple owner-visible proof artifact. The app can already draft a repair, approve it, mark it applied, and validate a same-host rerun as fixed. The missing step is a private receipt that connects the original issue, the approved/applied change, and the rerun proof without claiming SEOFixKit published to a CMS, merged GitHub code, or guaranteed rankings.

## Scope

- Add a private markdown proof receipt for fixed repair actions.
- Expose it in the owner UI only after an action is approved, applied, and proven fixed by a rerun report.
- Expose the same receipt through the owner Developer API for agent workflows.
- Keep all access owner-scoped and no-indexed.
- Update product truth copy so public docs say proof receipts exist after rerun proof, while execution remains owner/operator-applied.

## Non-Goals

- No automatic CMS publishing.
- No GitHub branch or pull request creation.
- No ranking, traffic, indexing, citation, or revenue guarantee.
- No subscription, agency workspace, or monitoring expansion in this slice.

## Requirements

- Receipt generation must fail closed when the action is not approved, not applied, not fixed, or missing a rerun report id.
- Receipt generation must verify the rerun report belongs to the same owner and proves the same issue fixed using the existing rerun proof rules.
- Receipts must include original issue context, source proof, approved change, action mode/type, applied/fixed state, rerun report id, generated timestamp, and clear boundaries.
- Receipt endpoints must return markdown with `cache-control: no-store`, `x-robots-tag: noindex, nofollow`, and attachment disposition.
- UI helper tests must prove receipt URLs and availability rules.
- Worker and local dev routes must stay behaviorally aligned.

## Implementation

- Add `shared/repair-proof-receipt.js` and focused unit tests.
- Add beta endpoint: `GET /api/reports/:reportId/repair-actions/:actionId/proof.md`.
- Add Developer API endpoint: `GET /v1/audits/:auditId/repair-actions/:actionId/proof.md`.
- Add local Express parity for both endpoints.
- Add UI helper/link next to the implementation pack after fixed proof.
- Update API docs summary and product truth surfaces.

## Verification

- Run focused shared, worker route, worker dispatch, UI contract, and local security smoke tests.
- Run product truth tests.
- Run full `npm run check`.
- Run Cloudflare dry-run.
- Run required review gates before merge/deploy.
