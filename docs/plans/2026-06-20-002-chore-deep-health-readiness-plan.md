# Deep Health Readiness Plan

Created: 2026-06-20

## Problem

Production `/api/health` proves the Worker is alive, but `/api/deep-health` currently falls through to the public homepage. That leaves no safe JSON endpoint for checking whether the self-serve SaaS stack is ready: D1 schema, Dodo checkout/webhook config, repair queue/action tables, proposal approval, monitors, API/webhooks, and agency surfaces.

## Outcome

Add a public-safe `/api/deep-health` endpoint that returns booleans and readiness names only. It must not expose secrets, product ids, checkout URLs, customer data, table counts, or admin-only state.

## Requirements

- R1. `/api/deep-health` returns JSON and never falls through to the SPA/homepage.
- R2. The endpoint checks required bindings for audit, reports, queue, browser, D1, and email.
- R3. The endpoint checks production schema readiness for Fix Pack checkout, repair execution, repair queue/action records, monitors, API/webhooks, white-label, team, report-domain, offer entitlement, and large-crawl tables.
- R4. The endpoint reports Dodo checkout/webhook readiness without printing secrets or provider identifiers.
- R5. The endpoint exposes a simple status: `ready` only when critical checks pass, otherwise `degraded`.
- R6. Tests cover the routed JSON response and a degraded missing-schema response.

## Verification

- `npm run test:worker-dispatch`
- `npm run test:product-truth`
- `npm run check`
- `npm audit --audit-level=low`
- `gitleaks detect --no-banner --redact --source .`
- `npm run cf:dry-run`
- `autoreview --mode local`
- live `/api/deep-health` after deploy
