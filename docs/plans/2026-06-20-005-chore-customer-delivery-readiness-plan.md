# Customer Delivery Readiness Plan

Created: 2026-06-20

## Problem

The Fix Pack admin queue can now expose why a paid repair is or is not ready for delivery, but the customer billing surface still only shows raw status, due dates, notes, and links. That keeps the buyer dependent on support/admin interpretation instead of making the paid repair loop self-serve and transparent.

## Outcome

Expose the same delivery readiness truth to the customer billing portal. Customers should see the current blockers or ready state for each Fix Pack request without gaining admin-only data or changing payment/delivery rules.

## Requirements

- R1. Reuse the shared delivery readiness helper so admin and customer readiness cannot drift.
- R2. Include proposal approval state in billing readiness where proposal tables are available.
- R3. Treat unavailable proposal state as a customer-visible delivery blocker.
- R4. Keep Dodo payment status, refund/dispute handling, delivery validation, and admin transitions unchanged.
- R5. Show concise next-action text in `/beta/billing` without exposing private admin notes, checkout URLs, payment ids, or proposal internals.
- R6. Keep empty/no-request billing behavior unchanged.

## Implementation Units

### U1. Billing Readiness Data

- **Files:** `worker/routes/billing.js`, `worker/lib/serializers.js`, `server/dodo-payment-smoke-test.js`
- **Approach:** Aggregate proposal summary counts for the visible owner-scoped Fix Pack requests and pass that summary into the shared readiness serializer.
- **Verification:** Tests cover paid requests with executable proposals awaiting approval, paid ready requests, delivered requests, and proposal-table unavailable fallback.

### U2. Customer Billing UI

- **Files:** `src/App.jsx`, `src/styles.css`
- **Approach:** Render a compact readiness row for each Fix Pack request with a ready/delivered/blocked label and stable blocker labels.
- **Verification:** Existing app contract/build checks cover syntax and integration; the UI reads only the public billing response fields.

## Out Of Scope

- Marking any request delivered.
- Creating real or test payments.
- Showing admin-only notes, payment IDs, webhook events, or checkout URLs.
- Adding recurring subscriptions or new offer checkout.
