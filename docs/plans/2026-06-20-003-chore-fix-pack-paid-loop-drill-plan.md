# Fix Pack Paid-Loop Drill Plan

Created: 2026-06-20

## Problem

SEO Fix Kit is close to a sellable self-serve Fix Pack beta, but 11/10 launch readiness still lacks proof of the paid repair loop after checkout. A real customer payment must not be faked, and a live card purchase needs explicit money approval. The product still needs a safe operational drill that proves the production webhook processing, test-request isolation, repair proposal seeding, and owner approval boundary without turning a synthetic event into a real paid customer claim.

## Outcome

Add a production-safe test-only drill path for Fix Pack payment processing. It must prove that a signed Dodo-shaped payment event can be accepted, idempotently stored, mapped to a test Fix Pack request, seed repair proposals, and expose the next owner-approval step, while making it impossible to count the result as a real paid sale.

## Requirements

- R1. The drill must only target Fix Pack requests where `is_test = 1`.
- R2. The drill must never mark a non-test request paid.
- R3. The drill must reuse the same signed webhook endpoint and payment validation code as real Dodo events.
- R4. Drill output may include status, test request id, webhook status, proposal summary, and next action, but must not print secrets, raw checkout URLs, session ids, cookies, or full payloads.
- R5. Billing/customer-facing summaries must continue excluding test Fix Pack requests.
- R6. Tests must prove non-test requests are rejected by the drill helper/path and test requests can exercise the webhook processor.
- R7. Public readiness copy must continue saying this drill does not prove Dodo delivered a real paid webhook or that a customer card payment completed.

## Implementation Units

### U1. Test-Only Webhook Drill Helper

- **Goal:** Add reusable helper logic that creates a signed Dodo-shaped success event for a known test request and sends it through the existing webhook handler or processor without exposing secrets.
- **Files:** `scripts/run-live-audit-batch.mjs`, `scripts/run-live-audit-batch.test.mjs`, `shared/dodo.js` if signing helpers need reuse.
- **Approach:** Extend the existing live audit proof mode with an optional drill mode, for example `SEOFIXKIT_FIX_PACK_WEBHOOK_DRILL=1`. The drill should require `SEOFIXKIT_FIX_PACK_PROOF=1` and a test-mode request. It should summarize only sanitized proof.
- **Test scenarios:** Drill mode is disabled by default; drill refuses missing test-mode proof; sanitized output omits raw checkout URL/session id/signature; successful test request returns webhook/proposal status.
- **Verification:** `npm run test:audit-batch-runner`.

### U2. Server-Side Safety Guard

- **Goal:** Ensure synthetic/test drills cannot accidentally mark real customer requests paid.
- **Files:** `worker/routes/billing.js`, `worker/routes/billing.test.mjs`.
- **Approach:** Add a narrow exported helper or validation branch that can be used by drill tooling to require `is_test = 1` before processing a drill event. Do not weaken the real `/api/webhooks/dodo` path. If the drill posts to the real endpoint, the payload must carry a test marker and the processor must reject that marker for non-test requests.
- **Test scenarios:** Real-looking success event without drill marker still follows normal Dodo validation; drill-marked event for `is_test = 0` is ignored/rejected; drill-marked event for `is_test = 1` can move to paid and seed proposals.
- **Verification:** `npm run test:billing-route` and `npm run test:billing`.

### U3. Readiness Truth Boundary

- **Goal:** Keep launch-readiness claims honest after adding the drill.
- **Files:** `worker/routes/health.js`, `worker/index.test.mjs`, `README.md`.
- **Approach:** Mention the drill as a test-only proof boundary if exposed in docs, while keeping `/api/deep-health` limits clear that real card payment and real Dodo webhook delivery remain separate.
- **Test scenarios:** Deep health limits still mention real paid card/Dodo webhook/customer delivery are not proven by readiness checks.
- **Verification:** `npm run test:worker-dispatch` and `npm run test:product-truth`.

## Scope Boundaries

- Do not complete or simulate a non-test paid customer payment.
- Do not add admin ability to manually mark real requests paid.
- Do not claim the drill proves Dodo delivered an event from its infrastructure.
- Do not add new paid offers or subscription checkout in this pass.

## Final Verification

- `npm run test:audit-batch-runner`
- `npm run test:billing-route`
- `npm run test:billing`
- `npm run test:worker-dispatch`
- `npm run test:product-truth`
- `npm run check`
- `npm audit --audit-level=low`
- `gitleaks detect --no-banner --redact --source .`
- `npm run cf:dry-run`
- Installed `autoreview` on the exact final diff before PR/merge/deploy
