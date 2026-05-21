# Spec: Self-Serve Billing Portal

## Goal

Give private beta customers one place to see the live Dodo-priced SEO Fix Pack offer, their Fix Pack request statuses, and payment history without exposing payment secrets or pretending subscriptions exist.

## Requirements

- Keep Dodo as the source of truth for visible price, checkout, payment status, refunds, disputes, and webhook confirmation.
- Add a beta-session-protected billing summary API for the current owner.
- Include the SEO Fix Pack product, live Dodo pricing preview when available, customer Fix Pack requests, payment history, and the current subscription state.
- Show subscription state truthfully as not live because SEO Fix Kit currently sells a one-time Fix Pack, not a recurring plan.
- Do not expose Dodo API keys, webhook secrets, admin-only notes, admin tokens, or other private provider credentials to the browser.
- Do not create checkout from the billing page without a report; checkout must stay tied to a proven report and Fix Pack request.
- Add local Express parity so browser testing can cover the billing page without Cloudflare remote bindings.
- Keep the billing page private, noindex, and no-store through the existing beta shell.

## Non-Goals

- No recurring subscription launch in this step.
- No new payment provider.
- No client-side Dodo SDK or BillingSDK transport if it bypasses the Worker security boundary.
- No fake invoices or hardcoded prices.
