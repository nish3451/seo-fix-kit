# SEO Fix Kit

SEO Fix Kit is a proof-backed SEO repair tool for sites that need clear fixes, not generic audit homework.

The public homepage is currently a private-beta access page. Visitors can request a secure one-use email link; anonymous public audits stay disabled.

It is not trying to replace Ahrefs or Semrush keyword and backlink databases. The first wedge is narrower and sharper:

> Tell me what is wrong with my site, prove it, and generate the fix.

## What is live in this repo

- Rendered-page audit with Playwright.
- Static HTML vs rendered DOM comparison.
- Evidence-backed findings.
- Self-serve crawl-depth tiers up to 1,000 pages per queued audit, with per-page scores and page proof.
- High-scale crawl inventory from robots.txt and sitemaps, discovering up to 50,000 sitemap URLs while keeping rendered repair proof separate.
- Separate large rendered crawl jobs for 50,000-page targets (early access), with 1,000-page batches, stored frontier/proof/retry state, merge-readiness gates, and scale-readiness repair actions. Batches render gradually in the background - at default worker caps roughly 1,000 pages/day - so this is a staged plan, never sold as completed 50K rendered validation.
- Crawl intelligence from rendered proof, including internal link graph depth, low-inbound pages, sitemap-sample orphan candidates, duplicate titles/descriptions/H1s, near-duplicate content, parameterized internal URLs, and keyword-cannibalization heuristics.
- Audit history deltas for saved reruns, showing fixed, new, and still-open proven issues against the previous report for the same host.
- Technical validation pack for broken links, redirecting internal links, broken images, canonical reachability, hreflang mistakes, invalid JSON-LD, HTTPS/HSTS, large assets, and slow rendered loads.
- PageSpeed Insights / Lighthouse performance proof for public URLs, with mobile score, Core Web Vitals lab metrics, top opportunities, and repair-ready findings.
- Browser resource-waterfall proof from rendered scans, with request counts, observed transfer size, slow/heavy/render-blocking resource evidence, and repair actions.
- Self-serve competitor benchmarking for up to five public competitor homepages, with competitor-backed repair gaps added to reports and briefs.
- Self-serve backlink import audit and import-history tables for supplied rows, with live/lost link proof, risky source signals, broken target checks, anchor concentration flags, and repair actions.
- Self-serve local SEO audit for supplied business details, Google Business Profile URL, local keywords, and citation URLs, with NAP, LocalBusiness schema, citation consistency, and repair actions.
- Self-serve keyword/rank import audit and trend-history tables for supplied Search Console or rank-tracker rows, with low-CTR, page-two, zero-click, decline, cannibalization, intent-match, and uncrawled landing-page repair actions; keyword volume imports have a storage path but no live provider yet.
- Rendered WordPress and ecommerce platform audit for detected stores/CMS pages, with Product schema, BreadcrumbList schema, faceted/variant URLs, WordPress archive links, and plugin resource repair actions.
- False-positive guard section for static-vs-rendered mismatches.
- Exact fix snippets for common SEO repairs.
- Copyable developer repair brief with priority, effort, proof, acceptance checks, and snippets.
- Founder-friendly React interface.
- Cloudflare Worker target using Workers Static Assets and Browser Run.
- Locked private-beta homepage with `/api/waitlist` and `/api/access/request` backed by D1.
- Hidden `/beta` private audit workbench protected by invite code login or a secure one-use email access link.
- Expiring beta sessions backed by D1 `beta_sessions`.
- Explicit session access modes for invite, self-serve, and founder override sessions.
- Customer workspace summary API and dashboard at `/api/account/summary`.
- Admin-created beta invite codes backed by D1 `beta_invites`; the shared beta password is only a founder override.
- Single-use self-serve access tokens backed by D1 `access_tokens`.
- Site ownership claims backed by D1 `site_claims`; non-founder audits require an exact verified host.
- Queued audit jobs backed by D1 `audit_jobs`, with status polling before the private report loads.
- Weekly self-serve audit monitors backed by D1 `audit_schedules`, with dashboard controls to add or pause monitors for verified hosts.
- Self-serve Developer API keys, `/v1/audits` JSON endpoints, project-style verified sites, and audit completion webhooks.
- Saved private report URLs backed by D1 `audit_reports`, tied to the beta owner email and invite where available.
- 30-day report retention with cleanup for expired reports, sessions, and quota buckets.
- D1-backed abuse controls across access links, login, waitlist, network, session, daily, and target-site audit buckets.
- `/beta/admin` ops dashboard for waitlist, invites, audits, repeated issue patterns, and fix requests.
- Dodo-backed SEO Fix Pack checkout CTA inside reports when real fixes exist.
- Public `/support` and `/terms` pages with no ranking guarantees.

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
- `/api/access/request` sends a secure self-serve email access link, and `/api/access/verify` exchanges it for a customer beta session
- `/api/beta/session` checks the current beta session, and `/api/beta/logout` revokes it
- `/api/account/summary` powers the customer workspace dashboard
- `/api/sites`, `/api/sites/claim`, and `/api/sites/verify` manage DNS TXT / HTTPS file site ownership checks
- `/api/audit` creates a queued job only with a valid beta session; non-founder sessions must verify the exact target host first; `maxPages` supports self-serve crawl-depth tiers up to 1,000 pages, optional `renderedCrawlTarget` stores a staged 50K/100K rendered-crawl plan, reports include browser resource-waterfall proof, rendered WordPress/ecommerce platform proof, sitemap crawl inventory up to 50,000 discovered URLs, rendered crawl-intelligence proof, and saved-report deltas against the previous same-host audit, optional `competitorUrls` benchmarks up to five public competitor homepages, optional `backlinkRows`/`backlinkCsv` imports backlink rows for live link-audit proof, optional `keywordRows`/`keywordCsv` imports keyword/rank rows for keyword repair proof, and optional `localSeo` checks supplied local business proof
- `/api/audit/jobs/:id` returns queued/running/completed/failed status only to the job owner
- `/api/large-crawls`, `/api/large-crawls/:id`, `/api/large-crawls/:id/retry`, `/api/large-crawls/:id/batches/claim`, `/api/large-crawls/:id/batches/process`, `/api/large-crawls/:id/batches/:batchId/proof`, and `/api/large-crawls/:id/merge` power verified-host large rendered crawl jobs with stored frontier, browser-worker processing, batch progress, retries, proof ingest, previous-crawl metadata, crawl fingerprints, and merge gating
- `/api/audit/schedules` lists and creates verified-host audit monitors; `/api/audit/schedules/:id` pauses a monitor
- `/api/developer`, `/api/developer/tokens`, and `/api/developer/webhooks` power self-serve API keys and webhook setup
- `/v1/audits`, `/v1/audits/:id`, `/v1/audits/:id/issues`, `/v1/audits/:id/report`, `/v1/large-crawls`, `/v1/large-crawls/:id`, and `/v1/projects` expose bearer-token JSON API access; audit creation accepts `max_pages`/`maxPages`, `rendered_crawl_target`/`renderedCrawlTarget`, `competitor_urls`/`competitorUrls`, `backlink_rows`/`backlinkRows`, `keyword_rows`/`keywordRows`, and `local_seo`/`localSeo`
- `/api/reports/:id` and `/api/reports/:id/brief.md` return saved private reports only to the report owner
- `/api/branding`, `/api/reports/:id/share`, `/api/reports/:id/shares`, and `/api/report-shares/:id` power white-label client report links
- `/api/report-domains` and `/api/report-domains/:id/verify` power self-serve verified report subdomains for white-label client links
- Report-domain verification uses a DNS TXT challenge at `_seofixkit-report-domain.<customer-domain>` before white-label links use that host
- `/api/reports/:id/client.pdf` generates a branded PDF export for the report owner
- `/r/:id` and `/r/:id.pdf` render noindex client-facing web and PDF reports with saved agency branding and optional password protection
- `/api/team`, `/api/team/members`, and `/api/reports/:id/collaboration` power teammate assignees, issue notes, and repair status tracking
- `/api/beta/fix-request` creates a Dodo checkout session for the one-site SEO Fix Pack when Dodo config is present
- `/api/billing/summary` powers the private customer billing portal with Dodo pricing, Fix Pack requests, payment history, and truthful subscription state
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

Migration `0004_audit_usage.sql` adds the private beta quota table. Migration `0005_beta_controls.sql` adds beta sessions, report ownership, target-host indexing, and report expiry. Migration `0006_ops_funnel.sql` adds invite codes, invite-bound ownership, fix requests, and admin audit logging. Migration `0007_fix_pack_checkout.sql` adds Dodo checkout/payment tracking and webhook idempotency. Migration `0008_fix_pack_fulfillment.sql` adds the paid Fix Pack delivery queue and payment notification log. Migration `0009_product_hardening.sql` adds webhook-only payment guardrails, test request separation, due dates, delivery notification state, status events, admin sessions, and ops digests. Migration `0010_self_serve_access.sql` adds self-serve access tokens and explicit beta session access modes. Migration `0011_site_claims.sql` adds DNS TXT / HTTPS file site ownership verification. Migration `0012_audit_jobs.sql` adds queued audit job status records. Migration `0013_audit_schedules.sql` adds weekly audit monitors and links scheduled runs back to audit jobs. Migration `0014_developer_api.sql` adds API keys, webhooks, and delivery logs. Migration `0015_white_label_reports.sql` adds agency branding and client report share links. Migration `0016_team_repair_board.sql` adds teammate assignees and issue-level repair tracking. Migration `0017_competitor_benchmarks.sql` stores queued audit competitor URLs for benchmark reports. Migration `0018_report_domains.sql` adds verified white-label report domains. Migration `0019_backlink_imports.sql` stores queued backlink import rows for link-audit reports. Migration `0020_local_seo_inputs.sql` stores queued local SEO inputs for local proof reports. Migration `0021_keyword_rank_inputs.sql` stores queued keyword/rank import rows for keyword proof reports. Migration `0022_rendered_crawl_targets.sql` stores staged rendered crawl targets for 50K/100K planning. Migration `0023_large_rendered_crawls.sql` adds the separate large-crawl job, batch, frontier, proof, dead-letter, worker-heartbeat, and event tables. Migration `0024_link_keyword_databases.sql` adds backlink import/link-edge tables and keyword rank/volume observation tables.

The protected admin APIs require the `ADMIN_EXPORT_TOKEN` Worker secret. Browser admin use exchanges the token for a short-lived HttpOnly admin session cookie; scripts may still use `Authorization: Bearer ...`. The private beta login uses invite codes or self-serve email links; `BETA_ACCESS_PASSWORD` remains as a founder override only.

Large rendered crawls are expensive and separately entitlement-gated. Founder override sessions can create them locally; non-founder beta/API sessions require `SEOFIXKIT_LARGE_CRAWL_ENABLED=true` until plan billing is wired to account entitlements.

Large-crawl browser workers are also opt-in. Set `SEOFIXKIT_LARGE_CRAWL_WORKERS_ENABLED=true` to let the scheduled Worker process queued batches through Browser Run. `SEOFIXKIT_LARGE_CRAWL_WORKER_BATCHES` and `SEOFIXKIT_LARGE_CRAWL_WORKER_URLS` cap each scheduled tick.

## Dodo checkout

The paid repair CTA uses a hosted Dodo checkout session. The product is `SEO Fix Pack`, mapped through `DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID`; customer-facing copy must stay limited to one proof-backed repair pass plus one rerun, with no ranking promise.

Visible pricing comes from Dodo's checkout preview endpoint. If the API key, product id, brand id, explicit environment, or webhook secret is missing, the app pauses checkout instead of showing a hardcoded fallback price.

The private `/beta/billing` portal follows the BillingSDK self-serve billing pattern, but the implementation keeps Dodo calls inside the Worker. The official BillingSDK React transport currently adds generic client hooks around a separate API surface, so this repo uses the same customer-portal shape without moving Dodo provider logic or secrets into the browser.

Cloudflare vars in `wrangler.jsonc` hold the public Dodo brand/product identifiers and environment mode:

- `DODO_SEOFIXKIT_BRAND_ID`
- `DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID`
- `DODO_SEOFIXKIT_ENVIRONMENT`
- `DODO_SEOFIXKIT_ADAPTIVE_CURRENCY_FEES_INCLUSIVE`

Cloudflare secrets hold private credentials:

- `DODO_SEOFIXKIT_API_KEY`
- `DODO_SEOFIXKIT_WEBHOOK_SECRET`
- `SEOFIXKIT_EMAIL_FROM`

The Dodo webhook endpoint is:

```text
https://seofixkit.com/api/webhooks/dodo
```

## Fix Pack fulfillment

Paid requests move through `checkout_created`, webhook-only `paid`, `in_progress`, `delivered`, plus Dodo-driven `payment_failed`, `refunded`, `refund_failed`, and `disputed` states. Admin cannot mark a request paid manually.

The admin queue can assign an owner, keep private notes, set customer-visible notes, set due and next-update times, attach a delivery URL, and link a validated final rerun report. Delivery requires a customer note, delivery link, and final rerun report for the same owner, same host, and after payment.

Access-link, payment-success, repair-started, delivery-ready, and daily ops digest emails use Cloudflare Email Service from the Worker through the `EMAIL` `send_email` binding in `wrangler.jsonc`. No API key is needed, but `seofixkit.com` must be onboarded to Email Service in the Cloudflare dashboard, and these Worker values must be set before email can send:

- `SEOFIXKIT_EMAIL_FROM` (for example `hello@seofixkit.com`, on the onboarded Email Service domain)
- `SEOFIXKIT_ADMIN_EMAIL`
- optional `SEOFIXKIT_REPLY_TO`

## Custom domain

`seofixkit.com` is the production domain. The Worker config attaches both the apex and `www` hostnames:

```jsonc
"routes": [
  { "pattern": "seofixkit.com", "custom_domain": true },
  { "pattern": "www.seofixkit.com", "custom_domain": true }
]
```

## Product boundary

This MVP can beat weak SEO audit tools on accuracy and fix quality. Competitor benchmarks are public homepage proof snapshots only. Self-serve rendered repair crawl currently supports up to 1,000 pages inside a normal report, while sitemap inventory can discover up to 50,000 URLs and separate large-crawl jobs can store 50,000-page frontier, batch, retry, proof, and incremental-crawl metadata. Large crawls are early access and must not be sold as completed 50,000-page rendered validation until every large-crawl batch has page-level proof and merge readiness is clear. Crawl intelligence is based on the rendered crawl and the sitemap inventory sample; orphan URLs and cannibalization are repair heuristics, not full-site rank or index data. Backlink data starts with supplied/imported rows and link-edge history; it does not provide proprietary backlink discovery. Keyword/rank data starts with supplied/imported Search Console or rank-tracker rows and observation history; it does not provide live keyword volume providers, traffic estimates, or continuous rank tracking yet. Local SEO audit uses supplied business details and citation URLs; it does not scrape private Google Business Profile data or discover every citation automatically. Platform SEO audit uses rendered public proof only; it does not log into WordPress, Shopify, WooCommerce, Magento, Google Business Profile, or private plugin/admin settings.
