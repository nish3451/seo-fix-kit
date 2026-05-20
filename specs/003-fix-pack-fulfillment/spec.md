# Spec: SEO Fix Pack Fulfillment

## Goal

Turn a paid SEO Fix Pack checkout into a tracked fulfillment workflow so an admin can see paid requests, move work through delivery, and the customer can see honest post-checkout status.

## Requirements

- Keep the existing Dodo checkout and webhook flow.
- Track Fix Pack states in `fix_requests`: `checkout_created`, `paid`, `in_progress`, `delivered`, plus existing failure/new states.
- Show paid Fix Pack requests in `/beta/admin` with status, owner, target, report links, notes, delivery URL, and final rerun link.
- Let an authorized admin update status and fulfillment fields.
- Attach the customer-visible Fix Pack status to saved report responses.
- Show a checkout return confirmation on the report page.
- On payment success, send owner/admin notification email when email provider config exists; otherwise log that notification was skipped because config is missing.
- Preserve no-ranking-promise product truth.

## Non-Goals

- No automatic code repair.
- No fake payment success.
- No client-side access to payment or email provider secrets.
