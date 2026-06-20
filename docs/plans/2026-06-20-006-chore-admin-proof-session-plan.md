---
title: "chore: Add admin proof session for Fix Pack drill"
type: "chore"
date: "2026-06-20"
origin: "active goal: make SEOFixKit 11/10 self-serve and agentic"
---

# chore: Add admin proof session for Fix Pack drill

## Summary

Make the production Fix Pack proof runner able to run the safe test-only webhook drill through an admin-authorized beta session, without relying on a founder password stored on the local machine.

## Problem Frame

The live audit runner can prove a real report and Dodo checkout boundary today. The safer payment/webhook drill exists, but production execution currently requires a founder-override beta login password in Keychain. That blocked the launch-readiness proof pass even though the admin token was available. This leaves the payment-to-proposal proof path harder to verify than it needs to be.

## Requirements

- R1. Keep normal customer login, invite login, and self-serve access unchanged.
- R2. Add an admin-only route that creates a founder-override beta session for production proof runs.
- R3. Do not return raw beta session tokens in JSON; use the existing HttpOnly beta session cookie.
- R4. Log the admin action and fail closed without a valid admin token/session.
- R5. Update `scripts/run-live-audit-batch.mjs` so webhook drill mode uses the admin proof session instead of the missing founder password.
- R6. Keep the webhook drill test-only: it must still skip non-test Fix Pack requests and must not print checkout URLs, session ids, webhook signatures, or secrets.

## Implementation Units

### U1. Admin Proof Session Route

- **Files:** `worker/routes/admin.js`, `worker/index.js`, `worker/index.test.mjs`
- **Approach:** Add a small `/admin/beta-session` POST route protected by existing admin auth. It accepts an owner email, creates a `founder-override` beta session via the existing session helper, sets the existing beta cookie, and logs the action.
- **Verification:** Worker dispatch test proves unauthorized calls fail and authorized calls return a no-store response with the beta session cookie.

### U2. Live Proof Runner Support

- **Files:** `scripts/run-live-audit-batch.mjs`, `scripts/run-live-audit-batch.test.mjs`, `README.md`
- **Approach:** When `SEOFIXKIT_FIX_PACK_WEBHOOK_DRILL=1`, create the beta cookie through `/admin/beta-session` using the admin token. Keep ordinary non-drill runs on invite login and preserve founder-password fallback only when explicitly requested.
- **Verification:** Runner tests prove webhook drill mode obtains an admin proof cookie, sends `testMode: true`, processes the sanitized webhook drill, and still hides private checkout/webhook material.

## Scope Boundaries

- Do not mark real payments paid without Dodo webhook proof.
- Do not expose raw tokens or secrets.
- Do not change customer pricing, checkout, proposal approval, or delivery rules.
- Do not add CMS/GitHub execution in this slice.
