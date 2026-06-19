# Launch Readiness Hardening Plan

Created: 2026-06-19

## Problem

The live launch audit proved SEO Fix Kit is a strong paid beta, but not 11/10 launch-ready. Two immediate gaps are actionable without waiting on a real customer payment:

- Production does not route `/methodology` and `/packages` through the Worker, even though public copy and `llms.txt` advertise them.
- A real 1-page live audit of `https://seofixkit.com/` flags thin rendered content, missing helpful schema, and missing question-led sections.

## Scope

Fix the public trust surface and add regression coverage. Do not change payment semantics, pricing, or claim recurring plans are live. Do not fake a paid completion cycle.

## Implementation Units

### U1. Production Route Coverage

- Files: `wrangler.jsonc`, `worker/routes/pages.test.mjs`
- Change: Add `/methodology` and `/packages` to `assets.run_worker_first`.
- Tests: Extend public page tests to assert advertised public product pages are routed through the Worker before assets.

### U2. Homepage Trust And Readiness Content

- Files: `src/App.jsx`, `src/styles.css`
- Change: Add visible explanation sections for proof loop, Fix Pack, AI/GEO boundaries, and common buyer questions. Keep the first screen focused on access, but make the page deep enough to pass SEO Fix Kit's own AI Answer Readiness standard.
- Tests: Add/update app contract tests to assert homepage launch copy includes proof, package, question-led, and no-overclaim content.

### U3. Homepage Structured Data

- Files: `index.html`, `server/product-truth-smoke-test.js`
- Change: Add truthful `Organization`, `WebSite`, `SoftwareApplication`, and `FAQPage` JSON-LD that matches visible homepage content.
- Tests: Product-truth smoke test should verify the schema types and continue blocking unsupported claims.

## Verification

- `npm run test:public-pages`
- `npm run test:app-contract`
- `npm run test:product-truth`
- `npm run build`
- `npm run check`
- `npm audit --audit-level=low`
- `wrangler deploy --dry-run`
- Rendered browser checks for `/`, `/methodology`, and `/packages`
- Live verification after deploy for `/methodology`, `/packages`, `/api/health`, and `/api/public-pricing`

## Remaining Outside This Pass

- Real paid card payment, Dodo webhook, paid proposal approval, delivery, and rerun proof.
- CMS/GitHub execution integrations.
- Recurring subscription checkout for monitoring, repair agent, agency workspace, or growth add-on.
