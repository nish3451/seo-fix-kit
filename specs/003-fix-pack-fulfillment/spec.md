# Spec: SEO Fix Pack Fulfillment

## Goal

Turn a paid SEO Fix Pack checkout into a tracked fulfillment workflow so an admin can see paid requests, move work through delivery, and the customer can see honest post-checkout status.

## Requirements

- Keep the Dodo checkout and webhook flow as the payment source of truth.
- Track Fix Pack states in `fix_requests`: `checkout_created`, webhook-only `paid`, `in_progress`, `delivered`, `payment_failed`, `refunded`, `refund_failed`, and `disputed`.
- Show paid Fix Pack requests in `/beta/admin` with status, owner, target, report links, notes, delivery URL, due time, next-update time, final rerun link, notifications, and status events.
- Let an authorized admin update fulfillment fields, but not manually mark a request paid.
- Attach the customer-visible Fix Pack status to saved report responses.
- Show a checkout return confirmation on the report page.
- On payment success, repair start, and delivery, send owner/admin notification email when email provider config exists; otherwise log that notification was skipped because config is missing.
- Require delivery to include a customer note, delivery link, and validated final rerun report for the same owner and target host after payment.
- Keep test/smoke requests out of the default admin queue unless `includeTest=1` is requested.
- Send a daily admin ops digest with open, overdue, webhook-error, and email-error counts.
- Preserve no-ranking-promise product truth.

## Non-Goals

- No automatic code repair.
- No fake payment success.
- No client-side access to payment or email provider secrets.
