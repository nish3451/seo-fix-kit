# SEO Fix Kit

SEO Fix Kit is a proof-backed SEO repair tool for sites that need clear fixes, not generic audit homework.

The public homepage is currently a private-beta access page. Visitors can request a secure one-use email link or check one public page anonymously before requesting access; full multi-page audits stay inside the private beta.

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
- AI Answer Readiness / SEO-GEO readiness checks derived from rendered content depth, helpful schema, canonical/internal-link clarity, question-led structure, sitemap context, and optional `/llms.txt` reachability; no live AI-engine sampling or citation monitoring.
- Draft-only growth opportunities from verified keyword, competitor, AI-readiness, and crawl gaps; no article-volume autopilot, auto-publishing, or ranking promises.
- False-positive guard section for static-vs-rendered mismatches.
- Generated fix snippets for common SEO repairs (proposed markup the engine builds, never a quote observed on the page).
- Copyable developer repair brief with priority, effort, proof, acceptance checks, and snippets.
- Persistent repair queue records for saved reports, with proof snapshots, acceptance checks, status, action mode, rerun state, and approval-safe agent action records.
- Report-level repair agent board with status filters, teammate assignment, notes, safe draft actions, approval/ignore controls, and no external publishing side effects.
- Private implementation packs for owner-approved repair actions, with source proof, approved change text, mode-specific handoff steps, acceptance checks, rollback notes, and rerun-proof instructions.
- Private repair proof receipts after fixed rerun proof, connecting the original issue, approved/applied change, and same-host rerun report without claiming SEOFixKit published or guaranteed the repair.
- Account-level repair agent feed that ranks open repairs, drafted actions awaiting approval, applied repairs needing rerun proof, and monitor regressions across recent reports.
- Repair proposal records tied to Fix Pack requests, with execution modes, owner approval, delivery state, final rerun proof references, and protected retention for paid proof.
- Server-owned offer catalog and entitlement scaffolding for Proof Monitoring, Repair Sprint, SEO/GEO Repair Agent, and Agency Workspace. Proof Monitoring has a config-gated Dodo subscription checkout path; distinct Repair Sprint checkout, Repair Agent checkout, and paid Agency Workspace checkout are not live yet.
- Founder-friendly React interface.
- Cloudflare Worker target using Workers Static Assets and Browser Run.
- Locked private-beta homepage with `/api/waitlist` and `/api/access/request` backed by D1.
- Public anonymous one-page URL check at `/check` and `POST /api/public-check`: real browser rendering of one public page, static-vs-rendered proof, guarded false positives, actionable findings when present, per-network and per-site rate limits with hashed, short-lived counters, no stored report, and a handoff into private beta access with no ranking promise.
- Public `/demo`, `/methodology`, and `/packages` pages showing the proof loop, limits, and package ladder before payment.
- Hidden `/beta` private audit workbench protected by invite code login or a secure one-use email access link.
- Expiring beta sessions backed by D1 `beta_sessions`.
- Explicit session access modes for invite, self-serve, and founder override sessions.
- Customer workspace summary API and dashboard at `/api/account/summary`.
- Admin-created beta invite codes backed by D1 `beta_invites`; the shared beta password is only a founder override.
- Single-use self-serve access tokens backed by D1 `access_tokens`.
- Site ownership claims backed by D1 `site_claims`; non-founder audits require a verified host (apex and www count as one site). A homepage-only Lite check (1 page, 3/day) runs without verification.
- Queued audit jobs backed by D1 `audit_jobs`, with status polling before the private report loads.
- Weekly self-serve audit monitors backed by D1 `audit_schedules`, with dashboard controls to add or pause monitors for verified hosts.
- Self-serve Developer API keys, `/v1/audits` JSON endpoints, project-style verified sites, safe `repair_queue` issue status, separate approved-action implementation-pack and fixed-proof receipt markdown endpoints, and audit/repair-action lifecycle webhooks.
- Saved private report URLs backed by D1 `audit_reports`, tied to the beta owner email and invite where available.
- 30-day report retention with cleanup for expired reports, sessions, and quota buckets.
- D1-backed abuse controls across access links, login, waitlist, network, session, daily, and target-site audit buckets.
- `/beta/admin` ops dashboard for waitlist, invites, audits, repeated issue patterns, and fix requests.
- Dodo-backed SEO Fix Pack checkout CTA inside reports when real fixes exist.
- Public `/support`, `/terms`, and `/privacy` pages with no ranking guarantees.

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

For a live spot-check that the public `/check`, `/demo`, `/methodology`, `/packages`,
`/support`, `/terms`, and `/privacy` pages on the deployed site still show the anonymous
proof check, proof loop, stated limits, package ladder, and no-ranking promise the README
makes, that `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/api/health`,
`/api/deep-health`, and the `POST /api/public-check` route are still served, and that
`www.seofixkit.com` still 301-redirects onto the apex host:

```bash
npm run audit:live-promise
```

For the repeatable live walk of the private-beta funnel (the backlog item
"Live-surface walk of the private-beta funnel"): a real-browser (Playwright
Chromium) walk of the funnel stops home → `/demo` → `/packages`, with the
access request form inspected in observe mode only (never submitted, so no
waitlist lead or access token is created), on desktop and an iPhone-13 mobile
viewport. It verifies each stop serves the expected title, canonical where one
exists, and load-bearing funnel copy; records console/page errors, broken
internal links, and mobile horizontal overflow; and emits the walk JSON (the
"summarized in journal" record) plus a human summary. Each live walk's result
is journaled verbatim in
`docs/growth/private-beta-funnel-walk-ledger.md`:

```bash
npm run audit:funnel-walk
```

The walk is opt-in live-read evidence and never part of `npm run check`; the
same per-stop assertions are locked offline by `test:funnel-walk`, which runs
inside `npm run check`.

## Founder-led ICP experiment

`docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md` is the written log for the
founder-led seven-day ICP acquisition experiment: up to 20 permission-safe, founder-sent
invitations to JavaScript-heavy SaaS founders to run their own URL through `/check`, with four
numeric gates (10 visits, 3 completed checks, 1 private-access request, 1 eligible Fix Pack
conversation or purchase) and a keep/kill decision on whether "JS SaaS founder who wants proven
fixes, not audit noise" remains the ICP. Outreach is founder-owned, never unattended promotion.
The execution kit (prospect candidates with live stack evidence and truthful per-channel
invitation copy, both prepared 2026-08-12) lives at
`docs/research/icp-experiment-prospect-candidates-2026-08-12.md` and
`docs/research/icp-experiment-invitation-copy-2026-08-12.txt`.

## Cloudflare path

Cloudflare cannot run the local Express + Chromium server directly. The deployable path is:

- React UI served by Workers Static Assets from `dist/`
- Public `/check`, `/demo`, `/methodology`, `/packages`, `/privacy`, `/support`, `/terms`, `/sitemap.xml`, and `/llms.txt` stay served by the Worker/public asset path
- `/api/health` is a shallow public runtime check; `/api/deep-health` is a public-safe readiness check for bindings, D1 schema, Dodo checkout/webhook config, and self-serve repair capabilities without exposing secrets, provider ids, checkout URLs, customer data, or table counts
- `/api/public-check` runs the anonymous one-page URL check for any visitor: one public page rendered in a real browser, proof fields and guarded false positives from the shared audit engine, findings when present, per-network and per-site rate limits with hashed, short-lived counters, and no stored report; `/check` is the indexable public entry page
- `/api/waitlist` handled by `worker/index.js` and stored in D1
- `/admin/summary` powers the private ops dashboard, and `/admin/leads.csv` exports waitlist leads when called with the admin export token
- `/admin/invites` creates invite codes for specific emails
- `/admin/beta-session` creates an admin-authorized founder-override beta session for production proof drills without returning raw session tokens
- `/beta` serves the private workbench with `noindex` and `no-store` headers
- `/api/beta/login` exchanges beta email + invite code for an expiring private session cookie
- `/api/access/request` sends a secure self-serve email access link, and `/api/access/verify` exchanges it for a customer beta session
- `/api/beta/session` checks the current beta session, and `/api/beta/logout` revokes it
- `/api/account/summary` powers the customer workspace dashboard
- `/api/sites`, `/api/sites/claim`, and `/api/sites/verify` manage DNS TXT / HTTPS file site ownership checks
- `/api/audit` creates a queued job only with a valid beta session; non-founder sessions must verify the target host first (apex/www folded; 1-page Lite checks run unverified with a daily cap); `maxPages` supports self-serve crawl-depth tiers up to 1,000 pages, optional `renderedCrawlTarget` stores a staged 50K/100K rendered-crawl plan, reports include browser resource-waterfall proof, rendered WordPress/ecommerce platform proof, proof-derived AI Answer Readiness / SEO-GEO readiness checks, draft-only growth opportunities, sitemap crawl inventory up to 50,000 discovered URLs, rendered crawl-intelligence proof, and saved-report deltas against the previous same-host audit, optional `competitorUrls` benchmarks up to five public competitor homepages, optional `backlinkRows`/`backlinkCsv` imports backlink rows for live link-audit proof, optional `keywordRows`/`keywordCsv` imports keyword/rank rows for keyword repair proof, and optional `localSeo` checks supplied local business proof
- `/api/audit/jobs/:id` returns queued/running/completed/failed status only to the job owner
- `/api/large-crawls`, `/api/large-crawls/:id`, `/api/large-crawls/:id/retry`, and `/api/large-crawls/:id/merge` power verified-host large rendered crawl jobs with stored frontier, batch progress, retries, previous-crawl metadata, crawl fingerprints, and merge gating
- Large-crawl renderer endpoints (`/api/large-crawls/:id/batches/claim`, `/api/large-crawls/:id/batches/process`, `/api/large-crawls/:id/batches/:batchId/proof`, and their `/v1` equivalents) are worker-only and require `x-seofixkit-worker-token`; bearer API keys alone can create and inspect jobs, not lease or submit rendered proof. Claim responses include a `proof_token` / `proofToken` tied to that lease; workers must send it back as `proof_token`, `proofToken`, or `x-seofixkit-proof-token` when saving proof.
- `/api/audit/schedules` lists and creates verified-host audit monitors; `/api/audit/schedules/:id` pauses a monitor
- `/api/developer`, `/api/developer/tokens`, and `/api/developer/webhooks` power self-serve API keys and webhook setup for audit and repair-action lifecycle events
- `/v1/audits`, `/v1/audits/:id`, `/v1/audits/:id/issues`, `/v1/audits/:id/report`, `/v1/audits/:id/repair-actions/:actionId/implementation.md`, `/v1/audits/:id/repair-actions/:actionId/proof.md`, `/v1/large-crawls`, `/v1/large-crawls/:id`, and `/v1/projects` expose bearer-token JSON/API markdown access; audit creation accepts `max_pages`/`maxPages`, `rendered_crawl_target`/`renderedCrawlTarget`, `competitor_urls`/`competitorUrls`, `backlink_rows`/`backlinkRows`, `keyword_rows`/`keywordRows`, and `local_seo`/`localSeo`; issue and report responses include owner-scoped `repair_queue` status without proposed-change text
- `/api/reports/:id` and `/api/reports/:id/brief.md` return saved private reports only to the report owner
- `/api/reports/:id/repair-proposals/:proposalId` lets the report owner approve or dismiss generated repair proposals
- `/api/branding`, `/api/reports/:id/share`, `/api/reports/:id/shares`, and `/api/report-shares/:id` power white-label client report links
- `/api/report-domains` and `/api/report-domains/:id/verify` power self-serve verified report subdomains for white-label client links
- Report-domain verification uses a DNS TXT challenge at `_seofixkit-report-domain.<customer-domain>` before white-label links use that host
- `/api/reports/:id/client.pdf` generates a branded PDF export for the report owner
- `/r/:id` and `/r/:id.pdf` render noindex client-facing web and PDF reports with saved agency branding and optional password protection
- `/api/team`, `/api/team/members`, and `/api/reports/:id/collaboration` power teammate assignees, issue notes, and repair status tracking with beta Agency Workspace limits until paid workspace entitlements are wired
- `/api/reports/:id/repair-queue`, `/api/reports/:id/repair-actions`, `/api/reports/:id/repair-actions/:actionId`, `/api/reports/:id/repair-actions/:actionId/implementation.md`, and `/api/reports/:id/repair-actions/:actionId/proof.md` power private proof-backed queue state, approval-safe action records, owner-approved implementation handoff packs, and fixed-rerun proof receipts
- `/api/beta/fix-request` creates a Dodo checkout session for the one-site SEO Fix Pack when Dodo config is present
- `/api/beta/monitoring-checkout` creates a Dodo checkout session for Proof Monitoring only when the monitoring subscription product config is present
- `/api/billing/summary` powers the private customer billing portal with Dodo pricing, Fix Pack requests, payment history, staged offer catalog, monitoring checkout state, and truthful subscription state
- `/api/webhooks/dodo` verifies Dodo Standard Webhooks signatures, marks successful Fix Pack payments, and syncs Proof Monitoring subscription events into offer entitlements
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

The dry-run runs through `scripts/wrangler-dry-run.mjs`, which names any malformed
ancestor `package.json` (e.g. the recurring zero-byte scaffold debris in `/home/nish`)
loudly on stderr and, when one is present, executes Wrangler from a shielded scratch
copy so the canary cannot be broken by a file outside this repo.

Apply D1 migrations after creating or changing the waitlist schema:

```bash
wrangler d1 migrations apply seofixkit_waitlist --remote
```

Migration `0004_audit_usage.sql` adds the private beta quota table. Migration `0005_beta_controls.sql` adds beta sessions, report ownership, target-host indexing, and report expiry. Migration `0006_ops_funnel.sql` adds invite codes, invite-bound ownership, fix requests, and admin audit logging. Migration `0007_fix_pack_checkout.sql` adds Dodo checkout/payment tracking and webhook idempotency. Migration `0008_fix_pack_fulfillment.sql` adds the paid Fix Pack delivery queue and payment notification log. Migration `0009_product_hardening.sql` adds webhook-only payment guardrails, test request separation, due dates, delivery notification state, status events, admin sessions, and ops digests. Migration `0010_self_serve_access.sql` adds self-serve access tokens and explicit beta session access modes. Migration `0011_site_claims.sql` adds DNS TXT / HTTPS file site ownership verification. Migration `0012_audit_jobs.sql` adds queued audit job status records. Migration `0013_audit_schedules.sql` adds weekly audit monitors and links scheduled runs back to audit jobs. Migration `0014_developer_api.sql` adds API keys, webhooks, and delivery logs. Migration `0015_white_label_reports.sql` adds agency branding and client report share links. Migration `0016_team_repair_board.sql` adds teammate assignees and issue-level repair tracking. Migration `0017_competitor_benchmarks.sql` stores queued audit competitor URLs for benchmark reports. Migration `0018_report_domains.sql` adds verified white-label report domains. Migration `0019_backlink_imports.sql` stores queued backlink import rows for link-audit reports. Migration `0020_local_seo_inputs.sql` stores queued local SEO inputs for local proof reports. Migration `0021_keyword_rank_inputs.sql` stores queued keyword/rank import rows for keyword proof reports. Migration `0022_rendered_crawl_targets.sql` stores staged rendered crawl targets for 50K/100K planning. Migration `0023_large_rendered_crawls.sql` adds the separate large-crawl job, batch, frontier, proof, dead-letter, worker-heartbeat, and event tables. Migration `0024_link_keyword_databases.sql` adds backlink import/link-edge tables and keyword rank/volume observation tables. Migration `0025_preserve_paid_fix_pack_reports.sql` preserves paid Fix Pack report proof and records blob deletion failures. Migration `0026_repair_execution.sql` adds repair proposals, approval state, execution mode, delivery state, and proposal events. Migration `0027_offer_entitlements.sql` adds staged offer entitlements and entitlement events. Migration `0028_agent_repair_queue.sql` adds repair queue items and approval-safe repair agent action records. Migration `0029_fix_pack_checkout_repair_target.sql` adds `checkout_repair_json` to store selected repair target metadata on Fix Pack requests.

The protected admin APIs require the `ADMIN_EXPORT_TOKEN` Worker secret. Browser admin use exchanges the token for a short-lived HttpOnly admin session cookie; scripts may still use `Authorization: Bearer ...`. The private beta login uses invite codes or self-serve email links; `BETA_ACCESS_PASSWORD` remains as a founder override only.

Large rendered crawls are expensive and separately entitlement-gated. Founder override sessions can create them locally; non-founder beta/API sessions require `SEOFIXKIT_LARGE_CRAWL_ENABLED=true` until plan billing is wired to account entitlements.

Large-crawl browser workers are also opt-in. Set `SEOFIXKIT_LARGE_CRAWL_WORKERS_ENABLED=true` to let the scheduled Worker process queued batches through Browser Run. `SEOFIXKIT_LARGE_CRAWL_WORKER_BATCHES` and `SEOFIXKIT_LARGE_CRAWL_WORKER_URLS` cap each scheduled tick.

## Dodo checkout

The paid repair CTA uses a hosted Dodo checkout session. The product is `SEO Fix Pack`, mapped through `DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID`; customer-facing copy must stay limited to one proof-backed repair pass plus one rerun, with no ranking promise.

Visible pricing comes from Dodo's checkout preview endpoint. If the API key, product id, brand id, explicit environment, or webhook secret is missing, the app pauses checkout instead of showing a hardcoded fallback price.

Fix Pack checkout can carry the selected repair queue issue in request/checkout metadata so fulfillment can start from the proven queue item. That metadata is context only; Dodo remains the source of truth for checkout, payment, refunds, disputes, and visible price.

Proof Monitoring checkout uses `DODO_SEOFIXKIT_PRODUCT_MONITORING_ID` and opens only from a verified workspace when Dodo subscription config is complete. A checkout URL does not activate monitoring; signed Dodo subscription webhooks upsert or revoke the `proof_monitoring` entitlement in `offer_entitlements`.

The private `/beta/billing` portal follows the BillingSDK self-serve billing pattern, but the implementation keeps Dodo calls inside the Worker. The official BillingSDK React transport currently adds generic client hooks around a separate API surface, so this repo uses the same customer-portal shape without moving Dodo provider logic or secrets into the browser.

For production rehearsals, the live audit batch runner can run a test-only Fix Pack webhook drill by setting `SEOFIXKIT_FIX_PACK_PROOF=1` and `SEOFIXKIT_FIX_PACK_WEBHOOK_DRILL=1`. The drill uses the admin token to create a founder-override proof session, creates only an `is_test` Fix Pack request, signs a Dodo-shaped webhook, and proves the Worker can process that test request without printing secrets, checkout URLs, or session ids. It does not prove a real card payment, Dodo-originated webhook delivery, or customer repair delivery.

Cloudflare vars in `wrangler.jsonc` hold the public Dodo brand/product identifiers and environment mode:

- `DODO_SEOFIXKIT_BRAND_ID`
- `DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID`
- `DODO_SEOFIXKIT_PRODUCT_MONITORING_ID`
- `DODO_SEOFIXKIT_ENVIRONMENT`
- `DODO_SEOFIXKIT_ADAPTIVE_CURRENCY_FEES_INCLUSIVE`

Cloudflare secrets hold private credentials:

- `DODO_SEOFIXKIT_API_KEY`
- `DODO_SEOFIXKIT_WEBHOOK_SECRET`
- `SEOFIXKIT_EMAIL_FROM`
- `SEOFIXKIT_API_WEBHOOK_SECRET` (seeds customer webhook signing; webhook delivery fails closed without it)
- `SEOFIXKIT_COOKIE_SECRET` (signs client-report unlock cookies; password unlock fails closed without it)

The Dodo webhook endpoint is:

```text
https://seofixkit.com/api/webhooks/dodo
```

## Fix Pack fulfillment

Paid requests move through `checkout_created`, webhook-only `paid`, `in_progress`, `delivered`, plus Dodo-driven `payment_failed`, `refunded`, `refund_failed`, and `disputed` states. Admin cannot mark a request paid manually.

The admin queue can assign an owner, keep private notes, set customer-visible notes, set due and next-update times, attach a delivery URL, and link a validated final rerun report. Delivery requires a customer note, delivery link, and final rerun report for the same owner, same host, and after payment. When repair proposals exist for a request, at least one executable proposal must be owner-approved before delivery can be marked complete. Repair Sprint eligibility is shown from approved proposal state, but a separate Repair Sprint checkout remains gated until its Dodo product and entitlement path are wired.

Access-link, payment-success, repair-started, delivery-ready, and daily ops digest emails use Cloudflare Email Service from the Worker through the `EMAIL` `send_email` binding in `wrangler.jsonc`. No API key is needed, but `seofixkit.com` must be onboarded to Email Service in the Cloudflare dashboard, and these Worker values must be set before email can send:

- `SEOFIXKIT_EMAIL_FROM` (for example `hello@seofixkit.com`, on the onboarded Email Service domain)
- `SEOFIXKIT_ADMIN_EMAIL`
- optional `SEOFIXKIT_REPLY_TO`

## Custom domain

`seofixkit.com` is the canonical host. The Worker config attaches both the apex and `www` hostnames:

```jsonc
"routes": [
  { "pattern": "seofixkit.com", "custom_domain": true },
  { "pattern": "www.seofixkit.com", "custom_domain": true }
]
```

The `www` hostname stays attached only so its requests reach the Worker, which
permanently 301-redirects every `www.seofixkit.com` request onto the apex host
with the path and query intact. Every URL the Worker serves (page canonicals,
social tags, `robots.txt`, `sitemap.xml`, `llms.txt`, and fixture URLs) is
generated from the apex origin, so canonicals and the sitemap are apex-only.

## Product boundary

This MVP can beat weak SEO audit tools on accuracy and fix quality. Competitor benchmarks are public homepage proof snapshots only. Self-serve rendered repair crawl currently supports up to 1,000 pages inside a normal report, while sitemap inventory can discover up to 50,000 URLs and separate large-crawl jobs can store 50,000-page frontier, batch, retry, proof, and incremental-crawl metadata. Large crawls are early access and must not be sold as completed 50,000-page rendered validation until every large-crawl batch has page-level proof and merge readiness is clear. Crawl intelligence is based on the rendered crawl and the sitemap inventory sample; orphan URLs and cannibalization are repair heuristics, not full-site rank or index data. Backlink data starts with supplied/imported rows and link-edge history; it does not provide proprietary backlink discovery. Keyword/rank data starts with supplied/imported Search Console or rank-tracker rows and observation history; it does not provide live keyword volume providers, traffic estimates, or continuous rank tracking yet. Local SEO audit uses supplied business details and citation URLs; it does not scrape private Google Business Profile data or discover every citation automatically. Platform SEO audit uses rendered public proof only; it does not log into WordPress, Shopify, WooCommerce, Magento, Google Business Profile, or private plugin/admin settings. AI Answer Readiness is proof-derived from rendered content, schema, canonical/link clarity, sitemap context, and optional `/llms.txt`; it does not sample answer engines or monitor citations. Growth opportunities are draft-only briefs from verified keyword, competitor, AI-readiness, or crawl gaps; they do not auto-publish, create CMS drafts, open pull requests, or promise rankings, traffic, citations, or revenue. Repair agent actions, implementation packs, and repair proof receipts are reviewable records, drafts, handoff documents, and proof artifacts only; they do not publish CMS changes, open GitHub pull requests, merge code, or call provider admin APIs. Paid Growth Add-On billing/integrations remain roadmap. Live AI-engine visibility tracking and AI citation monitoring are not live.
