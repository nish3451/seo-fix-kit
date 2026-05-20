# Plan

1. Add Dodo checkout/payment schema.
2. Add Dodo helper utilities and billing smoke tests.
3. Wire `/api/beta/fix-request` to create Dodo checkout sessions.
4. Add `/api/webhooks/dodo` with signature verification and idempotency.
5. Update the beta UI to redirect to checkout when available.
6. Configure Cloudflare secrets and deploy after checks pass.
