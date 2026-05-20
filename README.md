# SEO Fix Kit

SEO Fix Kit is a proof-backed SEO repair tool for sites that need clear fixes, not generic audit homework.

The public homepage is currently locked as a private-beta waitlist. Public visitors can join the email list; public self-serve audits are disabled until beta opens.

It is not trying to replace Ahrefs or Semrush keyword and backlink databases. The first wedge is narrower and sharper:

> Tell me what is wrong with my site, prove it, and generate the fix.

## What is live in this repo

- Rendered-page audit with Playwright.
- Static HTML vs rendered DOM comparison.
- Evidence-backed findings.
- 10-page private beta crawl with per-page scores and page proof.
- False-positive guard section for static-vs-rendered mismatches.
- Exact fix snippets for common SEO repairs.
- Copyable developer repair brief with priority, effort, proof, acceptance checks, and snippets.
- Founder-friendly React interface.
- Cloudflare Worker target using Workers Static Assets and Browser Run.
- Locked coming-soon homepage with `/api/waitlist` backed by D1.
- Hidden `/beta` private audit workbench protected by email + invite code login.
- Expiring beta sessions backed by D1 `beta_sessions`.
- Admin-created beta invite codes backed by D1 `beta_invites`; the shared beta password is only a founder override.
- Saved private report URLs backed by D1 `audit_reports`, tied to the beta owner email and invite where available.
- 30-day report retention with cleanup for expired reports, sessions, and quota buckets.
- D1-backed abuse controls across login, waitlist, network, session, daily, and target-site audit buckets.
- `/beta/admin` ops dashboard for waitlist, invites, audits, repeated issue patterns, and fix requests.
- Dodo-backed SEO Fix Pack checkout CTA inside reports when real fixes exist.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Check

```bash
npm run check
```

## Cloudflare path

Cloudflare cannot run the local Express + Chromium server directly. The deployable path is:

- React UI served by Workers Static Assets from `dist/`
- `/api/waitlist` handled by `worker/index.js` and stored in D1
- `/admin/summary` powers the private ops dashboard, and `/admin/leads.csv` exports waitlist leads when called with the admin export token
- `/admin/invites` creates invite codes for specific emails
- `/beta` serves the private workbench with `noindex` and `no-store` headers
- `/api/beta/login` exchanges beta email + invite code for an expiring private session cookie
- `/api/beta/session` checks the current beta session, and `/api/beta/logout` revokes it
- `/api/audit` runs only with a valid beta session
- `/api/reports/:id` and `/api/reports/:id/brief.md` return saved private reports only to the report owner
- `/api/beta/fix-request` creates a Dodo checkout session for the one-site SEO Fix Pack when Dodo config is present
- `/api/webhooks/dodo` verifies Dodo Standard Webhooks signatures and marks successful Fix Pack payments
- rendered checks powered by Cloudflare Browser Run through the `BROWSER` binding
- `/llms.txt` and same-URL Markdown for `/` kept truthful to the visible product

Local Cloudflare development needs remote bindings for Browser Run:

```bash
npm run dev:cf
```

Dry-run build:

```bash
npm run cf:dry-run
```

Apply D1 migrations after creating or changing the waitlist schema:

```bash
wrangler d1 migrations apply seofixkit_waitlist --remote
```

Migration `0004_audit_usage.sql` adds the private beta quota table. Migration `0005_beta_controls.sql` adds beta sessions, report ownership, target-host indexing, and report expiry. Migration `0006_ops_funnel.sql` adds invite codes, invite-bound ownership, fix requests, and admin audit logging. Migration `0007_fix_pack_checkout.sql` adds Dodo checkout/payment tracking and webhook idempotency.

The protected admin APIs require the `ADMIN_EXPORT_TOKEN` Worker secret and must be called with an `Authorization: Bearer ...` header. The private beta login uses invite codes; `BETA_ACCESS_PASSWORD` remains as a founder override only.

## Dodo checkout

The paid repair CTA uses a hosted Dodo checkout session. The product is `SEO Fix Pack`, mapped through `DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID`; customer-facing copy must stay limited to one proof-backed repair pass plus one rerun, with no ranking promise.

Cloudflare vars in `wrangler.jsonc` hold the public Dodo brand/product identifiers and environment mode:

- `DODO_SEOFIXKIT_BRAND_ID`
- `DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID`
- `DODO_SEOFIXKIT_ENVIRONMENT`
- `DODO_SEOFIXKIT_ADAPTIVE_CURRENCY_FEES_INCLUSIVE`

Cloudflare secrets hold private credentials:

- `DODO_SEOFIXKIT_API_KEY`
- `DODO_SEOFIXKIT_WEBHOOK_SECRET`

The Dodo webhook endpoint is:

```text
https://seofixkit.com/api/webhooks/dodo
```

## Custom domain

`seofixkit.com` is the production domain. The Worker config attaches both the apex and `www` hostnames:

```jsonc
"routes": [
  { "pattern": "seofixkit.com", "custom_domain": true },
  { "pattern": "www.seofixkit.com", "custom_domain": true }
]
```

## Product boundary

This MVP can beat weak SEO audit tools on accuracy and fix quality. It should not claim backlink intelligence, keyword volume, traffic estimates, or rank tracking until those data sources are integrated.
