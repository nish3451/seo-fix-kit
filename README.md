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
- Hidden `/beta` private audit workbench protected by `BETA_ACCESS_PASSWORD`.
- Saved private report URLs backed by D1 `audit_reports`.
- Hourly D1-backed audit quota for the private beta API.

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
- `/admin/leads.csv` exports waitlist leads when called with the admin export token
- `/beta` serves the private workbench with `noindex` and `no-store` headers
- `/api/audit` runs only with the beta password header
- `/api/reports/:id` and `/api/reports/:id/brief.md` return saved private reports
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

Migration `0004_audit_usage.sql` adds the private beta audit quota table.

The protected lead export requires the `ADMIN_EXPORT_TOKEN` Worker secret. The private beta audit app requires the `BETA_ACCESS_PASSWORD` Worker secret.

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
