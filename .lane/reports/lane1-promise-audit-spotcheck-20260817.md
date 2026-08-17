# Lane 1 promise audit spot-check — seo-fix-kit

- **Branch:** `lane1/promise-audit-spotcheck-20260817`
- **Worktree:** `/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260817-105534`
- **Date:** 2026-08-17
- **Worker:** `fleet-dispatch-lane-worker-seo-fix-kit-1` (sealed packet)
- **Base for live check:** `https://seofixkit.com`
- **Commit baseline:** `37edea4` (origin/main HEAD, "docs(lane-1): verify www-to-apex canonicalization still landed at HEAD 21f0364 (#162)")

## Scope

Re-audit every claim in the README section `## What is live in this repo`
and every public claim on the live `/demo`, `/methodology`, and
`/packages` pages against the code, routes, constants, and the deployed
Worker that back each claim. Fix any drift found, and confirm the live
spot-check still serves the proof loop, limits, package ladder, and
no-ranking copy the README and routes make.

This packet owns:

- offline regression locks in `shared/promise-audit.test.mjs`
  (62 pins, all currently green),
- offline regression locks in `worker/routes/pages.test.mjs` (14 pins),
- offline regression locks in `scripts/live-promise-spot-check.test.mjs`
  (18 pins),
- offline regression locks in `src/app-contract.test.mjs` (14 pins),
- the live spot-check script in `scripts/live-promise-spot-check.mjs`,
- the report file at
  `.lane/reports/lane1-promise-audit-spotcheck-20260817.md`.

This is a re-verification run of the lane-1 promise audit pattern that
has landed at #133 (2026-08-14), #149 (2026-08-15 lane-1 refinement),
`lane1-promise-audit-20260815-fleet` (2026-08-15 fleet fix), #154 (live
landing-page JSON-LD pin), #156 (renderer naming), and the 2026-08-17
re-verifications #158 / #159 / #160 / #161 / #162. No README, route,
page, or spot-check edit was needed because every claim already has a
matching pin and every public surface already serves the matching copy.

## Method

1. **Baseline sync** — created `lane1/promise-audit-spotcheck-20260817`
   from `origin/main` at `37edea4`. Branch tracks `origin/main`; never
   pushes to `main`.
2. **Bullet extraction** — read the README between `## What is live in
   this repo` and the next `##` heading. 50 bullets captured.
3. **Pin mapping** — for every bullet and every named sub-claim, locate
   the matching regression pin in `shared/promise-audit.test.mjs`,
   `worker/routes/pages.test.mjs`,
   `scripts/live-promise-spot-check.test.mjs`, `shared/*.js` constants,
   `worker/routes/*.js` source, `src/App.jsx`, `worker/index.js`,
   `wrangler.jsonc`, and the `migrations/*.sql` files.
4. **Offline regression run** — re-run the four pinned test files
   against the current `37edea4` tree.
5. **Live spot-check** — run `node scripts/live-promise-spot-check.mjs`
   against `https://seofixkit.com` to confirm the deployed Worker still
   serves the proof-loop, limits, package-ladder, landing-page, support,
   terms, privacy, machine-surface, and www→apex claims.
6. **Drift report** — record any bullet or sub-claim without a matching
   pin, any pin that no longer matches the README wording, or any live
   spot-check that fails. None were found on this run.

## Bullet coverage map

The README "What is live in this repo" section has **50 bullets**. Each
bullet and every named sub-claim inside it is covered by at least one
regression pin in `shared/promise-audit.test.mjs` (62 pins), the
`scripts/live-promise-spot-check.mjs` live assertions (20 surface
checks), `worker/routes/pages.test.mjs`, the page source in
`worker/routes/pages.js`, and the source constants the page renders
from.

| #  | Bullet | Sub-claim | Pin location |
|----|--------|-----------|--------------|
| 1  | Rendered-page audit powered by Cloudflare Browser Run in the deployed Worker and Playwright for local development. | Both renderers named | `shared/promise-audit.test.mjs` — `match(liveSection, /Rendered-page audit powered by Cloudflare Browser Run … Playwright for local development/i)`; `worker/routes/audits.js` — `puppeteer.launch(env.BROWSER)`; `server/audit/engine.js` — `launchAuditBrowser` from `playwright-browser.js` |
| 2  | Static HTML vs rendered DOM comparison. | DOM compare vs static | `shared/audit-engine.js` — `staticFacts.h1s.length === 0 && rendered.h1s.length > 0` |
| 3  | Evidence-backed findings. | Findings carry evidence | `shared/audit-engine.js` — `evidence:` field |
| 4  | Self-serve crawl-depth tiers up to 1,000 pages per queued audit, with per-page scores and page proof. | 1,000-page tier, per-page scores | `shared/crawl-depth.js` — `pages: 1000`; `shared/audit-engine.js` — `buildPageSummaries`, `scoreFindings` |
| 5  | High-scale crawl inventory from robots.txt and sitemaps, discovering up to 50,000 sitemap URLs while keeping rendered repair proof separate. | Robots + sitemap discovery, 50K cap, separate proof table | `shared/crawl-inventory.js` — `sitemapSeeds(...)`, `source: "robots-and-sitemaps"`; migrations — `large_crawl_url_proofs` |
| 6  | Separate large rendered crawl jobs for 50,000-page targets (early access), with 1,000-page batches, stored frontier/proof/retry state, merge-readiness gates, and scale-readiness repair actions. | 50K target, 1K batches, frontier/proof/retry tables, merge gates, scale-readiness actions | `shared/large-rendered-crawl.js` — `LARGE_RENDERED_CRAWL_TARGET_PAGES=50000`, `LARGE_RENDERED_CRAWL_BATCH_SIZE=1000`; migrations — `large_crawl_frontier`, `large_crawl_url_proofs`; `worker/routes/large-crawls.js` — `retryLargeRenderedCrawlFailures`; `shared/rendered-crawl-scale.js` — `repairOpportunities` |
| 7  | Crawl intelligence from rendered proof: internal link graph depth, low-inbound pages, sitemap-sample orphan candidates, duplicate titles/descriptions/H1s, near-duplicate content, parameterized internal URLs, keyword-cannibalization heuristics. | All 7 signals | `shared/crawl-intelligence.js` — `duplicateDescriptions`, `duplicateH1s`, `duplicateContentPairs`, `orphanInventoryCandidates`, `cannibalizationGroups`, `parameterizedLinks`, `lowInboundPages`, `graph.depth` |
| 8  | Audit history deltas for saved reruns, showing fixed, new, and still-open proven issues against the previous report for the same host. | Fixed/new/persistent issues, same-host compare | `shared/report-delta.js` — `fixedIssues`, `newIssues`, `persistentIssues`, "same owner and host" |
| 9  | Technical validation pack: broken links, redirecting internal links, broken images, canonical reachability, hreflang mistakes, invalid JSON-LD, HTTPS/HSTS, large assets, slow rendered loads. | All 9 checks | `shared/audit-engine.js` — `Redirecting internal links on`, `Broken internal links on`, `Broken images on`, `canonicalCheck`, `validateHreflang`, `JSON-LD could not be parsed`, `HSTS security header missing`, `oversizedImages`, `Slow rendered load on` |
| 10 | PageSpeed Insights / Lighthouse performance proof for public URLs, with mobile score, Core Web Vitals lab metrics, top opportunities, and repair-ready findings. | PSI parser, mobile score, LCP, TBT, opportunities | `shared/audit-engine.js` — `parsePageSpeedResult`, `performanceScore`, `largestContentfulPaint`, `totalBlockingTime`, `topPageSpeedOpportunities`, "Mobile PageSpeed performance score is" |
| 11 | Browser resource-waterfall proof from rendered scans: request counts, observed transfer size, slow/heavy/render-blocking resource evidence, repair actions. | All 4 signals + repair actions | `shared/resource-waterfall.js` — `totalRequests`, `totalTransferBytes`, `slowResources`, `heavyResources`, `renderBlockingCandidates`, `repairOpportunities` |
| 12 | Self-serve competitor benchmarking for up to five public competitor homepages, with competitor-backed repair gaps added to reports and briefs. | 5-URL cap, competitor brief lines, competitor benchmark in report | `shared/audit-engine.js` — `parseAuditCompetitorUrls` (5-URL cap), `competitorBenchmarkBriefLines`, `competitorBenchmark: report.competitorBenchmark` |
| 13 | Self-serve backlink import audit and import-history tables: live/lost link proof, risky source signals, broken target checks, anchor concentration flags, repair actions. | All 5 signals + history tables | `shared/backlink-audit.js` — `summary?.live`, `summary?.lost`, `riskySourceSignals`, `brokenTargets`, `anchorTextRisks`, `backlinkRepairOpportunities`; migrations — `backlink_edges`, `backlink_import_batches` |
| 14 | Self-serve local SEO audit for supplied business details, Google Business Profile URL, local keywords, and citation URLs, with NAP, LocalBusiness schema, citation consistency, and repair actions. | GBP URL, NAP, LocalBusiness schema, citation consistency | `shared/local-seo-audit.js` — `googleBusinessProfileUrl`, `napFieldsSupplied`, "LocalBusiness schema is missing", `citation`; migrations — `local_seo_input_json` |
| 15 | Self-serve keyword/rank import audit and trend-history tables: low-CTR, page-two, zero-click, decline, cannibalization, intent-match, uncrawled landing-page repair actions; keyword volume imports have a storage path but no live provider yet. | All 7 repair signals + observation table + volume storage without provider | `shared/keyword-rank-audit.js` — `lowCtrOpportunities`, `pageTwoOpportunities`, `zeroClickRows`, `decliningRows`, `cannibalizationGroups`, "Ranking pages do not clearly reflect query intent", "were not crawled in this proof run", "not a keyword volume, rank-tracking, or backlink database"; migrations — `keyword_rank_observations`, `keyword_volume_observations` |
| 16 | Rendered WordPress and ecommerce platform audit: Product schema, BreadcrumbList schema, faceted/variant URLs, WordPress archive links, plugin resource repair actions. | All 5 checks | `shared/platform-seo-audit.js` — `productSchema`, `breadcrumbSchema`, `facetedNavigation`, `wordpressArchiveLinks`, `wordpressPluginResources` |
| 17 | AI Answer Readiness / SEO-GEO readiness checks derived from rendered content depth, helpful schema, canonical/internal-link clarity, question-led structure, sitemap context, and optional `/llms.txt` reachability; no live AI-engine sampling or citation monitoring. | All 5 derivation signals + llms.txt reachability + no-sampling boundary | `shared/ai-answer-readiness.js` — `contentDepth: contentDepthCheck`, `structuredData: structuredDataCheck`, `sourceClarity: sourceClarityCheck`, `answerStructure: answerStructureCheck`, `discoveryFiles: discoveryFilesCheck`, `normalizeDiscoveryFile(options.llmsTxt`, "does not sample AI engines or monitor citations" |
| 18 | Draft-only growth opportunities from verified keyword, competitor, AI-readiness, and crawl gaps; no article-volume autopilot, auto-publishing, or ranking promises. | Draft-only status, no auto-publishing | `shared/growth-opportunities.js` — `status: "draft_only"`, "do not publish content, create CMS drafts, open pull requests, or promise rankings" |
| 19 | False-positive guard section for static-vs-rendered mismatches. | Guard-typed findings | `shared/audit-engine.js` — `type: "guard"` |
| 20 | Generated fix snippets for common SEO repairs (proposed markup the engine builds, never a quote observed on the page). | Title + meta description snippet generators; README never calls them "exact snippets" | `shared/audit-engine.js` — `snippet: \`<title>\``, `snippet: \`<meta name="description"\``; README negative pin against `/Exact fix snippets/` |
| 21 | Copyable developer repair brief: priority, effort, proof, acceptance checks, snippets. | All 5 brief fields | `shared/remediation-brief.js` — `priority: index + 1`, `estimatedEffort`, `proof`, `acceptanceChecks` |
| 22 | Persistent repair queue records: proof snapshots, acceptance checks, status, action mode, rerun state, approval-safe agent action records. | All 6 sub-claims | `shared/repair-queue.js` — `queueItemResponse(`, `acceptance: cleanText(`, `actionMode: cleanActionMode(`; migrations — `proof TEXT`, `rerun_status TEXT`, `status TEXT`, `action_mode TEXT`, `repair_queue_items`, `repair_agent_actions` |
| 23 | Report-level repair agent board: status filters, teammate assignment, notes, safe draft actions, approval/ignore controls, no external publishing side effects. | All 6 sub-claims | `worker/routes/repair-agent.js` — `status`, `draft`, `approve`; `worker/routes/reports.js` — `assignee_email`, `note`; migrations — `team_members`, `issue_collaboration`; `src/App.jsx` — "Drafts are saved for review and do not publish anything." |
| 24 | Private implementation packs: source proof, approved change text, mode-specific handoff steps, acceptance checks, rollback notes, rerun-proof instructions. | All 6 sub-claims | `shared/repair-implementation-pack.js` — `rollbackNote`, `handoff`, `acceptance`, `rerun`, `sourceProof`, "Implementation pack needs an approved proposed change.", "Apply only the approved change above." |
| 25 | Private repair proof receipts after fixed rerun proof, connecting original issue, approved/applied change, and same-host rerun report without claiming SEOFixKit published or guaranteed the repair. | Same-host rerun proof, no-publish disclaimer, no-ranking disclaimer | `shared/repair-proof-receipt.js` — "connects one owner-approved repair action to the same-host rerun proof", "does not mean SEOFixKit published, merged, indexed, ranked, or guaranteed the change", "Rankings, traffic, indexing, AI citations, and revenue are not guaranteed" |
| 26 | Account-level repair agent feed: ranks open repairs, drafted actions awaiting approval, applied repairs needing rerun proof, monitor regressions. | All 4 signals + ranking | `shared/account-repair-summary.js` — `monitorRegressionItem`, `awaitingApproval`, `rank: 0`, `rerun` |
| 27 | Repair proposal records tied to Fix Pack requests, with execution modes, owner approval, delivery state, final rerun proof references, and protected retention for paid proof. | All 5 sub-claims + protected retention migration | `worker/routes/reports.js` — `SET approval_status = ?`; migrations — `repair_proposals`, `repair_proposal_events`, `execution_mode TEXT`, `approval_status TEXT`, `delivery_status TEXT`, paid-Fix-Pack `expires_at = NULL` retention |
| 28 | Server-owned offer catalog and entitlement scaffolding for Proof Monitoring, Repair Sprint, SEO/GEO Repair Agent, and Agency Workspace. Proof Monitoring has a config-gated Dodo subscription checkout path; distinct Repair Sprint checkout, Repair Agent checkout, and paid Agency Workspace checkout are not live yet. | All 4 offers named, Proof Monitoring config-gated, ≥3 paused checkouts | `shared/offers.js` — `name: "Proof Monitoring"`, `name: "Repair Sprint"`, `name: "SEO/GEO Repair Agent"`, `name: "Agency Workspace"`, `statusLabel: "Config gated"`, `checkoutState: "paused"` (≥3) |
| 29 | Founder-friendly React interface. | React root + components | `src/main.jsx` — `createRoot`; `src/App.jsx` — React `useState`/components |
| 30 | Cloudflare Worker target using Workers Static Assets and Browser Run. | Browser binding + Static Assets | `wrangler.jsonc` — `"browser"`, `assets` |
| 31 | Locked private-beta homepage with `/api/waitlist` and `/api/access/request` backed by D1. | Both routes registered, D1 writes | `worker/index.js` — `url.pathname === "/api/waitlist"`, `url.pathname === "/api/access/request"`; `worker/routes/access.js` — `INSERT INTO waitlist_leads`, `access_tokens` |
| 32 | Public anonymous one-page URL check at `/check` and `POST /api/public-check`: real browser rendering of one public page, static-vs-rendered proof, guarded false positives, actionable findings when present, per-network and per-site rate limits with hashed, short-lived counters, no stored report, and a handoff into private beta access with no ranking promise. | Worker routes, maxPages 1, real-browser copy, per-site rate limit, no-ranking boundary, hash-only bucket key | `worker/index.js` — `/check`, `/api/public-check`; `worker/routes/public-check.js` — `maxPages: 1`, real-browser copy, `check:target-day`, "does not guarantee rankings, traffic, indexing, revenue, AI citations"; `worker/routes/audits.js` — `(await sha256Hex(targetHost)).slice(0, 32)`; `worker/routes/public-check.js` — `sha256Hex(String(targetHost…)).slice(0, 32)` |
| 33 | Public `/demo`, `/methodology`, and `/packages` pages showing the proof loop, limits, and package ladder before payment. | Worker routes + public price constant; live spot-check pins copy | `worker/index.js` — `/demo`, `/methodology`, `/packages`; `worker/routes/pages.js` — `FIX_PACK_PUBLIC_PRICE`; `scripts/live-promise-spot-check.mjs` — `/demo`, `/methodology`, `/packages` page expectations |
| 34 | Intent-matching public landing pages at `/small-business-seo-audit`, `/rendered-vs-static-seo-audit`, and `/ai-answer-readiness`, each with unique title and meta, a visible FAQ rendered from the same source as FAQPage JSON-LD, truthful SoftwareApplication schema, and links into `/check` and `/demo`; none claim live AI-engine sampling or AI citation monitoring. | All 5 sub-claims | `shared/promise-audit.test.mjs` — `/small-business-seo-audit`, `/rendered-vs-static-seo-audit`, `/ai-answer-readiness` are Worker routes; `worker/routes/pages.test.mjs` — `ldBlocks.length === 3` (WebPage + SoftwareApplication + FAQPage); `scripts/live-promise-spot-check.mjs` — `SoftwareApplication JSON-LD describes the tool truthfully`, `FAQPage JSON-LD exists`, `visible FAQ matches the FAQPage JSON-LD source`; `worker/routes/pages.js` — per-page title + meta builders |
| 35 | Hidden `/beta` private audit workbench protected by invite code login or a secure one-use email access link. | Worker routes private headers + login routes | `worker/index.js` — `withPrivateHeaders(response)`, `/api/beta/login`, `/api/access/request`, `/api/access/verify` |
| 36 | Expiring beta sessions backed by D1 `beta_sessions`. | `beta_sessions` table with `expires_at` | migrations — `beta_sessions`, `expires_at` |
| 37 | Explicit session access modes for invite, self-serve, and founder override sessions. | All 3 access modes | `worker/routes/access.js` — `accessMode: "invite"`, `accessMode: "self-serve"`, `accessMode: "founder-override"` |
| 38 | Customer workspace summary API and dashboard at `/api/account/summary`. | Route registered, summary builder | `worker/index.js` — `url.pathname === "/api/account/summary"`; `worker/routes/account.js` — `repairAccountSummaryFromItems` |
| 39 | Admin-created beta invite codes backed by D1 `beta_invites`; the shared beta password is only a founder override. | Invite codes table + founder-override password | migrations — `beta_invites`; `worker/routes/access.js` — `BETA_ACCESS_PASSWORD`, `accessMode: "founder-override"` |
| 40 | Single-use self-serve access tokens backed by D1 `access_tokens`. | Access tokens table | migrations — `access_tokens` |
| 41 | Site ownership claims backed by D1 `site_claims`; non-founder audits require a verified host (apex and www count as one site). A homepage-only Lite check (1 page, 3/day) runs without verification. | DNS TXT + HTTPS file verification, apex/www folding, Lite eligibility + 3/day bucket | migrations — `site_claims`; `worker/lib/auth.js` — "A claim on the apex domain also covers www"; `worker/routes/audits.js` — `maxPages <= 1`, `audit:lite-day`, `limit: 3` |
| 42 | Queued audit jobs backed by D1 `audit_jobs`, with status polling before the private report loads. | Polling in UI + endpoint | `src/App.jsx` — `async function pollAuditJob`, `/api/audit/jobs/`; migrations — `audit_jobs` |
| 43 | Weekly self-serve audit monitors backed by D1 `audit_schedules`, with dashboard controls to add or pause monitors for verified hosts. | Add + pause UI, 7-day clamp, schedule table | `src/App.jsx` — "Adding weekly monitor.", `await pauseAuditSchedule(`; `worker/lib/text.js` — `clampScheduleInterval`, `if (parsed <= 7) return 7`; migrations — `audit_schedules` |
| 44 | Self-serve Developer API keys, `/v1/audits` JSON endpoints, project-style verified sites, safe `repair_queue` issue status, separate approved-action implementation-pack and fixed-proof receipt markdown endpoints, and audit/repair-action lifecycle webhooks. | All 6 sub-claims | `worker/routes/developer-api.js` — `projects: "GET /v1/projects"`, `implementation.md`, `proof.md`, `webhook`, "Safe per-issue queue status.", "Draft text is only returned" |
| 45 | Saved private report URLs backed by D1 `audit_reports`, tied to the beta owner email and invite where available. | Report row carries owner email + invite id | `worker/lib/report-data.js` — `INSERT INTO audit_reports` with `owner_email`, `owner_invite_id`; `worker/routes/audits.js` — `owner_invite_id: access.inviteId`; migrations — `audit_reports` |
| 46 | 30-day report retention with cleanup for expired reports, sessions, and quota buckets. | 30-day constant + cleanup of all three | `worker/lib/report-data.js` — `REPORT_RETENTION_DAYS=30`; `worker/lib/db.js` — `cleanupExpiredRows`, `deleteReportRowsWithBlobs`, `DELETE FROM beta_sessions`, `DELETE FROM audit_usage` |
| 47 | D1-backed abuse controls across access links, login, waitlist, network, session, daily, and target-site audit buckets. | All 9 named buckets | `worker/routes/access.js` — `bucket: \`waitlist:ip\``, `bucket: \`login:ip\``, `bucket: \`access:ip\``; `worker/routes/audits.js` — `bucket: \`audit:ip\``, `bucket: \`audit:session\``, `bucket: \`audit:target\``, `bucket: \`audit:lite-day\``; `worker/routes/public-check.js` — `bucket: \`check:ip-hour\``, `bucket: \`check:target-hour\`` |
| 48 | `/beta/admin` ops dashboard for waitlist, invites, audits, repeated issue patterns, and fix requests. | Repeated patterns + fix requests surfaced | `worker/routes/admin.js` — `issuePatterns`, `fix.?request` |
| 49 | Dodo-backed SEO Fix Pack checkout CTA inside reports when real fixes exist. | Fix Pack checkout path + eligibility flag | `src/fix-pack-checkout.js` — `checkout/`; `shared/remediation-brief.js` — `fixPackEligible` |
| 50 | Public `/support`, `/terms`, and `/privacy` pages with no ranking guarantees. | All 3 routes + no-ranking copy on each | `worker/index.js` — `/support`, `/terms`, `/privacy`; `worker/routes/pages.js` — "No ranking or traffic guarantee", "No ranking, traffic, or revenue promise is made", "No ranking, indexing, traffic, revenue, or search-engine outcome is promised"; live spot-check pins |

**Cross-cutting sub-claim pins already on disk:**

| Bullet | Sub-claim | Pin |
|--------|-----------|-----|
| 5      | Robots.txt + sitemap discovery as inventory seed | `shared/crawl-inventory.js` — `sitemapSeeds(start, options.robots, options.sitemap)`, `source: "robots-and-sitemaps"` |
| 6      | Stored frontier/proof/retry state | migrations — `large_crawl_frontier`, `large_crawl_url_proofs`; `shared/large-rendered-crawl.js` — `retryLargeRenderedCrawlFailures` |
| 12     | Competitor-backed repair gaps in reports and briefs | `shared/audit-engine.js` — `competitorBenchmarkBriefLines`, `competitorBenchmark: report.competitorBenchmark` |
| 17     | Optional `/llms.txt` reachability check | `shared/ai-answer-readiness.js` — `normalizeDiscoveryFile(options.llmsTxt`, `discoveryFilesCheck` |
| 22     | Acceptance checks + action mode | `shared/repair-queue.js` — `acceptance: cleanText(`, `actionMode: cleanActionMode(`; migrations — `action_mode TEXT`, `status TEXT` |
| 23     | No external publishing side effects | `src/App.jsx` — "Drafts are saved for review and do not publish anything." |
| 24     | Approved change text requirement | `shared/repair-implementation-pack.js` — "Implementation pack needs an approved proposed change.", "Apply only the approved change above." |
| 27     | Execution modes, owner approval, delivery state | migrations — `execution_mode TEXT`, `approval_status TEXT`, `delivery_status TEXT`; `worker/routes/reports.js` — `SET approval_status = ?` |
| 34     | Visible FAQ rendered from the same source as FAQPage JSON-LD + truthful SoftwareApplication schema | `worker/routes/pages.test.mjs` — `ldBlocks.length, 3` (WebPage + SoftwareApplication + FAQPage); `class="faq-item"`; `scripts/live-promise-spot-check.mjs` — `FAQPage JSON-LD exists`, `visible FAQ matches the FAQPage JSON-LD source`, `SoftwareApplication JSON-LD describes the tool truthfully` |
| 43     | Dashboard add + pause controls | `src/App.jsx` — "Adding weekly monitor.", `await pauseAuditSchedule(` |
| 44     | Safe `repair_queue` issue status | `worker/routes/developer-api.js` — "Safe per-issue queue status.", "Draft text is only returned" |
| 46     | Cleanup of expired reports, sessions, and quota buckets | `worker/lib/db.js` — `cleanupExpiredRows`, `deleteReportRowsWithBlobs`, `SELECT id, report_json FROM audit_reports`, `DELETE FROM beta_sessions`, `DELETE FROM audit_usage` |

## Offline regression results

Re-ran the four pinned audit files against `37edea4`:

```
$ node --test shared/promise-audit.test.mjs
# tests 62
# pass 62
# fail 0
# duration_ms 120.445022

$ node --test scripts/live-promise-spot-check.test.mjs
# tests 18
# pass 18
# fail 0
# duration_ms 254.1122

$ node --test worker/routes/pages.test.mjs
# tests 14
# pass 14
# fail 0
# duration_ms 3756.803902

$ node --test src/app-contract.test.mjs
# tests 14
# pass 14
# fail 0
# duration_ms 115.895154
```

Combined: **108 / 108 tests pass, 0 fail, 0 skipped**.

## Live spot-check results

```
$ SEOFIXKIT_BASE_URL=https://seofixkit.com node scripts/live-promise-spot-check.mjs
Live promise spot-check: https://seofixkit.com
  ok /demo - demo page shows the proof loop before payment
  ok /check - one-page check page shows the anonymous proof entry
  ok /methodology - methodology page states limits up front
  ok /packages - packages page shows the package ladder before payment
  ok /small-business-seo-audit - small-business landing page keeps the proof-first boundary
  ok /rendered-vs-static-seo-audit - rendered-vs-static landing page keeps the false-positive guard boundary
  ok /ai-answer-readiness - AI Answer Readiness landing page keeps the site-proof boundary
  ok /support - support page keeps the no-ranking promise and refund guard
  ok /terms - terms page keeps the no-ranking boundary
  ok /privacy - privacy page keeps retention and no-tracking statements
  ok /llms.txt - llms.txt stays served and lists the public proof surfaces
  ok /sitemap.xml - sitemap stays served and lists the indexable public pages
  ok /robots.txt - robots.txt stays served and points at the sitemap
  ok /api/health - health endpoint answers as a shallow public runtime check
  ok /api/deep-health - deep-health endpoint answers as a public-safe readiness check
  ok /api/public-check - anonymous one-page check route is live and validates input before rendering
  ok /api/public-check - anonymous one-page check route rejects non-http URL schemes instead of mangling them
  ok www.seofixkit.com/ - www.seofixkit.com 301-redirects onto the apex host
  ok www.seofixkit.com/check - www.seofixkit.com deep paths redirect with path and query intact
  ok www.seofixkit.com/favicon.svg - www.seofixkit.com static assets redirect too (no asset-host leakage)
All public-page and machine-surface promises on the live site match the claims.
```

**20 / 20 surfaces pass against the deployed Worker.**

## Findings

- **No drift detected.** Every README bullet and every named sub-claim
  is covered by an offline regression pin, and every public page +
  machine surface + canonical-host redirect the README promises is live
  and matching on `seofixkit.com`.
- **No README edit needed.** The wording of every bullet still matches
  the constants and source lines that back it; the page and
  machine-surface copy still serves the proof-loop / limits /
  package-ladder / no-ranking promise.
- **No new pin needed.** The earlier lane-1 audits (#133, #149, #150,
  #152, #154, #156, #159, #160, #161, #162) already added every
  sub-claim pin a fresh spot-check of the bullets identifies; no
  further gap was found on this re-audit.
- **No live spot-check failure.** No stale-Worker indicator, no missing
  copy, no missing machine surface, no broken canonical redirect. The
  three intent-matching landing pages added by #137 are all live and
  all carry the WebPage + SoftwareApplication + FAQPage JSON-LD proof
  plus the visible FAQ rendered from the same source.

## Files touched

- `.lane/reports/lane1-promise-audit-spotcheck-20260817.md` — this report.
- `lane-1.json` (claim state) — `claims` set to
  `[".lane/reports/lane1-promise-audit-spotcheck-20260817.md"]`.

No source, route, README, or test file was edited. The audit was
performed against `37edea4` and confirmed green.

## How to reproduce

Offline:

```bash
node --test shared/promise-audit.test.mjs
node --test scripts/live-promise-spot-check.test.mjs
node --test worker/routes/pages.test.mjs
node --test src/app-contract.test.mjs
```

Live spot-check:

```bash
SEOFIXKIT_BASE_URL=https://seofixkit.com node scripts/live-promise-spot-check.mjs
```

The spot-check is opt-in live-read evidence (not part of `npm run
check`) and is journaled verbatim by this report on every run.
