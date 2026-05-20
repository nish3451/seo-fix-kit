# SEO Fix Pack Checkout

## Outcome

Turn the existing “Get this fixed” action into a real Dodo checkout for the one-site SEO Fix Pack, then record checkout and payment state in SEO Fix Kit.

## Non-Goals

- Do not invent a fake payment link or mark a request paid without Dodo proof.
- Do not expose Dodo API keys, webhook secrets, or payment secrets to client code.
- Do not promise ranking outcomes; the paid offer is one proof-backed repair pass plus one rerun.

## Acceptance Checks

- The Dodo brand and product IDs are configured from server-side environment only.
- A beta report owner can create a checkout only for their own report.
- The checkout request records a fix request with checkout session metadata.
- Dodo webhooks require signature verification and are idempotent.
- Payment success marks the fix request paid; failure/cancel events do not.
- Existing audit checks and build still pass.

## Data Touched

- `fix_requests` rows gain checkout/payment state.
- New `dodo_webhook_events` rows store webhook receipt and processing status.
- Dodo checkout API is called server-side only.

## Rollback

If Dodo config is missing or the API fails, the UI records the fix request but does not redirect to checkout. The audit/report flow remains usable.
