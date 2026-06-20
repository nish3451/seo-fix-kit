# Repair Delivery Readiness Plan

Created: 2026-06-20

## Problem

SEO Fix Kit now has guarded payment, proposal approval, delivery, and rerun proof gates. The gates are enforced, but the admin/customer repair loop still needs a clear machine-readable checklist that explains exactly why a paid Fix Pack can or cannot be delivered. Without that, the next real customer repair can stall on hidden validation errors instead of an obvious next action.

## Outcome

Expose a delivery readiness checklist on Fix Pack admin responses. The checklist must mirror the existing delivery rules: payment must be confirmed, proposal state must be available, at least one executable proposal must be owner-approved when executable proposals exist, and delivery still needs a customer note, delivery link, and final rerun report.

## Requirements

- R1. Do not change Dodo-controlled payment status rules.
- R2. Do not let admin mark unpaid requests delivered.
- R3. Do not remove the final rerun report, customer note, or delivery link requirements.
- R4. Surface delivery blockers as stable ids and short labels so ops/UI can show the next action.
- R5. Treat unavailable proposal state as a delivery blocker, matching current server enforcement.
- R6. Keep delivered requests visibly complete.

## Implementation Units

### U1. Shared Readiness Helper

- **Files:** `shared/fulfillment.js`, `server/dodo-payment-smoke-test.js`
- **Approach:** Add a pure helper that receives a fix request and proposal summary, then returns `readyForDelivery`, `readyForStart`, checks, and blockers.
- **Verification:** Smoke tests cover unpaid, unapproved, missing delivery proof, ready, unavailable proposal state, and delivered states.

### U2. Admin Response Surface

- **Files:** `worker/routes/admin.js`, `server/dodo-payment-smoke-test.js`
- **Approach:** Add the helper output to `fixRequestAdminResponse` beside `repairProposalSummary`.
- **Verification:** Existing admin response code uses the checklist without changing transitions.

## Out Of Scope

- Running the founder-password webhook drill.
- Creating a real payment.
- Changing checkout, webhook, refund, or delivery transition semantics.
- Adding public paid subscription CTAs.
