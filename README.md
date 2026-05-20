# SEO Fix Kit

SEO Fix Kit is a proof-backed SEO repair tool for sites that need clear fixes, not generic audit homework.

It is not trying to replace Ahrefs or Semrush keyword and backlink databases. The first wedge is narrower and sharper:

> Tell me what is wrong with my site, prove it, and generate the fix.

## What is live in this repo

- Rendered-page audit with Playwright.
- Static HTML vs rendered DOM comparison.
- Evidence-backed findings.
- Exact fix snippets for common SEO repairs.
- Copyable developer repair brief with priority, proof, acceptance checks, and snippets.
- Founder-friendly React interface.
- Cloudflare Worker target using Workers Static Assets and Browser Run.

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
- `/api/audit` handled by `worker/index.js`
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
