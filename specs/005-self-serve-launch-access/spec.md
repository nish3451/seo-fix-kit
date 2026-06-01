# Spec: Self-Serve Launch Access

## Goal

Move SEO Fix Kit from invite-only beta toward self-serve SaaS without exposing Browser Run audits to anonymous abuse.

## Requirements

- Public visitors can request a secure access link by email.
- Access links expire quickly, are single-use, and are rate-limited by email and network.
- A verified access link creates a normal customer beta session, not a founder override session.
- The customer dashboard shows recent reports, Fix Pack requests, billing, and the next action.
- Existing invite-code login and founder override must keep working.
- Email sending must use Plunk from the Worker; no email provider secrets may reach the browser.
- If access email cannot send, the app must fail visibly instead of pretending an email was sent.
- Public policy/support pages must describe the paid Fix Pack limits, refunds/support path, data collection, and no ranking promise.

## Non-Goals

- No recurring subscription plan launch.
- No anonymous public audits.
- No automatic SEO code repair.
