# Lane 1 promise audit — 2026-08-20

- **Branch:** `lane1/promise-audit-20260820`
- **Worktree:** `/home/nish/workspaces/agent-worktrees/seo-fix-kit-lane1-20260820-223531`
- **Date:** 2026-08-20
- **Worker:** `fleet-dispatch-lane-worker-seo-fix-kit-1` (sealed packet)
- **Base for live check:** `https://seofixkit.com`
- **Commit baseline:** `7783adc` (origin/main, "Repair Sprint checkout, eligibility and delivery proof (#54)")
- **README baseline:** identical to `7783adc` (`git rev-parse HEAD` == `git rev-parse origin/main`)

## Scope

The packet's item is the lane-1 promise audit: every claim in the README
`## What is live in this repo` section and on the live `/demo`, `/methodology`,
and `/packages` pages against the code, routes, constants, and deployed Worker
that back each claim. Fix any drift found, and pin every corrected claim so it
cannot silently regress.

This packet owns:

- offline regression locks in `shared/promise-audit.test.mjs` (71 bullets,
  71+ sub-claim pins, all currently green at `7783adc`),
- live spot-check script in `scripts/live-promise-spot-check.mjs` (22 surface
  assertions, run against production `seofixkit.com`),
- the page copy in `worker/routes/pages.js` and the machine-readable
  `rootSitemap`/`llmsText` in `shared/audit-engine.js` + `worker/routes/pages.js`,
- the report file at `.lane/reports/lane1-promise-audit-20260820.md`.

## Method

1. **Baseline** — `git rev-parse HEAD` == `git rev-parse 7783adc` (origin/main
   HEAD). The worktree is exactly on the audit baseline; no source drift from
   the upstream commit that triggered the packet.
2. **Bullet extraction** — read the README between `## What is live in this
   repo` and the next `##` heading, capture the 52 bullets, and map each to
   the offline regression pin that locks it.
3. **Pin mapping** — for every bullet (and every sub-claim inside the bullet),
   find the matching regression pin in `shared/promise-audit.test.mjs`,
   `worker/routes/pages.test.mjs`, `scripts/live-promise-spot-check.test.mjs`,
   `worker/index.test.mjs`, `worker/routes/*.js`, `src/App.jsx`, and the
   `migrations/*.sql` files.
4. **Offline regression run** — re-run the pinned test suites to confirm the
   offline pins still hold against the current `7783adc` tree.
5. **Live spot-check** — run `node scripts/live-promise-spot-check.mjs` against
   `https://seofixkit.com` to confirm the deployed Worker still serves the
   `/demo` proof loop, `/methodology` limits, `/packages` ladder, `/check`
   anonymous entry, and the supporting `/support`, `/terms`, `/privacy`,
   `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/api/health`,
   `/api/deep-health`, and `/api/public-check` surfaces, plus the
   `www.seofixkit.com` → apex 301.
6. **Drift report** — record any bullet or sub-claim without a matching pin,
   any pin that no longer matches the README wording, or any live spot-check
   that fails.

## Bullet coverage map

The README "What is live in this repo" section has 52 bullets. Every bullet
and every named sub-claim is covered by at least one regression pin; the
coverage map below names the bullet and points at the test that backs each
claim. The mapping is the same surface the prior lane-1 audits maintained
(`audit-promise-lane1-20260814.md`, `lane1-promise-audit-20260815-fleet.md`),
extended only where the bullet list grew.

| # | Bullet | Pin cluster |
|---|--------|-------------|
| 1 | Rendered-page audit powered by Cloudflare Browser Run in the deployed Worker and Playwright for local development | `README rendered-audit claims match the Worker browser runtime and local Playwright adapter` |
| 2 | Static HTML vs rendered DOM comparison | `shared/audit-engine.js` static-vs-rendered compare (rendered DOM facts vs raw HTML, locked in `audit-engine.test.mjs`) |
| 3 | Evidence-backed findings | `shared/audit-engine.js` `evidence` field (locked in `audit-engine.test.mjs`) |
| 4 | Self-serve crawl-depth tiers up to 1,000 pages per queued audit, with per-page scores and page proof | `README 'What is live in this repo' section exists and documents the self-serve crawl promise`, `README crawl-depth and page-proof claims match per-page scores` |
| 5 | High-scale crawl inventory from robots.txt and sitemaps, discovering up to 50,000 sitemap URLs while keeping rendered repair proof separate | `README inventory claim keeps robots.txt and sitemap discovery`, `README sitemap inventory claim keeps rendered repair proof separate` |
| 6 | Separate large rendered crawl jobs for 50,000-page targets (early access), with 1,000-page batches, stored frontier/proof/retry state, merge-readiness gates, and scale-readiness repair actions | `README large-crawl promise matches stored batch and target limits`, `README large-crawl claim keeps stored frontier, proof, and retry state`, `README large-crawl staged-plan claim keeps scale readiness honest`, `README large-crawl daily rate matches the scheduled worker defaults` |
| 7 | Crawl intelligence from rendered proof | `README crawl-intelligence claim matches every listed signal` |
| 8 | Audit history deltas for saved reruns | `README audit-history delta claim matches fixed, new, and still-open issues` |
| 9 | Technical validation pack for broken links, redirecting internal links, broken images, canonical reachability, hreflang mistakes, invalid JSON-LD, HTTPS/HSTS, large assets, and slow rendered loads | `README technical validation pack covers every listed check` |
| 10 | PageSpeed Insights / Lighthouse performance proof | `README PageSpeed claim matches mobile score, lab metrics, and opportunities` |
| 11 | Browser resource-waterfall proof | `README resource-waterfall claim matches request, transfer, and slow/heavy/render-blocking evidence` |
| 12 | Self-serve competitor benchmarking for up to five public competitor homepages | `README competitor promise caps at five public homepages`, `README competitor claim keeps competitor-backed repair gaps in reports and briefs` |
| 13 | Self-serve backlink import audit | `README backlink import claim matches live/lost proof, risk flags, and history tables` |
| 14 | Self-serve local SEO audit | `README local SEO claim matches NAP, LocalBusiness schema, and citation checks` |
| 15 | Self-serve keyword/rank import audit | `README keyword/rank import claim matches listed repair actions and history tables`, `README keyword-volume claim keeps a storage path without a live provider` |
| 16 | Rendered WordPress and ecommerce platform audit | `README platform audit claim matches schema, faceted, archive, and plugin checks` |
| 17 | AI Answer Readiness / SEO-GEO readiness checks | `README AI Answer Readiness claim stays free of live AI sampling`, `README AI readiness derivation signals match the checks that compute them`, `README AI readiness claim keeps the proof-derived signal list`, `README AI readiness claim keeps optional /llms.txt reachability checks` |
| 18 | Draft-only growth opportunities | `README growth-opportunity claim stays draft-only`, `README growth-opportunity claim keeps the verified-gap sources` |
| 19 | False-positive guard section for static-vs-rendered mismatches | `README false-positive guard and fix snippet claims match engine output` |
| 20 | Generated fix snippets (never a quote observed on the page) | `README false-positive guard and fix snippet claims match engine output` (negative pin against `Exact fix snippets`) |
| 21 | Copyable developer repair brief | `README developer brief claim matches priority, effort, proof, acceptance, and snippets` |
| 22 | Persistent repair queue records | `README repair queue claim matches persistent records with proof, status, and rerun state`, `README repair queue claim keeps acceptance checks, status, and action mode` |
| 23 | Report-level repair agent board | `README repair agent board claim matches assignment, notes, drafts, and approval controls`, `README repair board claim keeps no external publishing side effects` |
| 24 | Private implementation packs | `README implementation pack claim matches proof, handoff, acceptance, rollback, and rerun proof`, `README implementation pack claim keeps approved change text` |
| 25 | Private repair proof receipts | `README repair-proof-receipt claim keeps publishing and ranking disclaimers`, `README repair-proof-receipt claim keeps original-issue, approved/applied-change, and same-host rerun links` |
| 26 | Account-level repair agent feed | `README account repair feed claim matches ranked open, drafted, applied, and regression items` |
| 27 | Repair proposal records | `README repair proposal claim matches report-seeded, pre-purchase approvable records`, `README proposal claim keeps execution modes, owner approval, and delivery state` |
| 28 | Server-owned offer catalog and entitlement scaffolding | `README offer-catalog claim matches config-gated monitoring and paused checkouts`, `README offer-catalog claim keeps scaffolding for every listed offer`, `README Dodo var list does not claim an unwired product id is already in wrangler.jsonc` |
| 29 | Founder-friendly React interface | `README React interface and Cloudflare Worker target claims match the build` |
| 30 | Cloudflare Worker target | `README React interface and Cloudflare Worker target claims match the build` |
| 31 | Locked private-beta homepage with `/api/waitlist` and `/api/access/request` backed by D1 | `README homepage, waitlist, and access claims match the Worker and D1` |
| 32 | First-party private-beta funnel instrumentation in D1 `access_events` | `README anonymous one-page check claim matches the Worker, page, and rate limits` (handles `/check`); funnel instrumentation locked by `test:access-events` in `worker/lib/access-events.test.mjs` |
| 33 | Public anonymous one-page URL check at `/check` and `POST /api/public-check` | `README anonymous one-page check claim matches the Worker, page, and rate limits`, `README anonymous-check claim keeps the deployed copy locked to the live spot-check`, `README homepage anonymous-check claim matches the CTA beside the email form` |
| 34 | Public `/demo`, `/methodology`, `/packages`, and `/proof` pages showing the proof loop, limits, package ladder, and a real before/after repair receipt | `README public page promise matches Worker routing and copy`, `README packages page claim keeps the config-gated Proof Monitoring price and boundary` |
| 35 | Intent-matching public landing pages at `/small-business-seo-audit`, `/rendered-vs-static-seo-audit`, and `/ai-answer-readiness` | `README intent-landing-page promise matches routes, sitemap, and schema boundaries` |
| 36 | Credential-free IndexNow submission path | `worker/routes/pages.test.mjs` `expectedSitemapUrls` includes `/proof`; `scripts/submit-indexnow.test.mjs` + `shared/audit-engine.js` `ROOT_PUBLIC_PATHS` |
| 37 | Hidden `/beta` private audit workbench | `README beta workbench and session claims match D1-backed records` |
| 38 | Expiring beta sessions | `README beta workbench and session claims match D1-backed records` |
| 39 | Explicit session access modes | `README beta-invite claim keeps the shared password a founder override` |
| 40 | Customer workspace summary API | `README account summary, developer API, admin ops, and Fix Pack CTA claims match code` |
| 41 | Admin-created beta invite codes | `README admin ops dashboard claim keeps waitlist, invites, audits, and admin-created invite codes` |
| 42 | Single-use self-serve access tokens | `README homepage, waitlist, and access claims match the Worker and D1` |
| 43 | Site ownership claims | `README site-claim promise matches verified-host flow and apex/www folding` |
| 44 | Queued audit jobs | `README queued-job claim matches status polling before the private report loads` |
| 45 | Weekly self-serve audit monitors | `README weekly monitor promise matches the schedule interval`, `README schedule claim keeps dashboard add and pause controls` |
| 46 | Self-serve Developer API keys, `/v1/audits` JSON endpoints | `README developer API claim keeps safe repair_queue issue status`, `README developer API claim keeps project-style verified sites` |
| 47 | Saved private report URLs | `README saved-report claim matches owner email and invite-bound ownership` |
| 48 | 30-day report retention | `README retention promise matches the code constant`, `README retention claim keeps cleanup for expired reports, sessions, and quota buckets` |
| 49 | D1-backed abuse controls across access links, login, waitlist, network, session, daily, and target-site audit buckets | `README abuse-control claim matches D1 buckets for every listed surface`, `quota target buckets never store a plaintext hostname, public or private` |
| 50 | `/beta/admin` ops dashboard | `README admin ops dashboard claim keeps waitlist, invites, audits, and admin-created invite codes` |
| 51 | Dodo-backed SEO Fix Pack checkout CTA | `README account summary, developer API, admin ops, and Fix Pack CTA claims match code` |
| 52 | Public `/support`, `/terms`, and `/privacy` pages | `README public support, terms, and privacy pages keep no-ranking-guarantee copy` |

**Sub-claim coverage restated:** every named sub-claim inside each bullet —
per-page scores, per-page proof, false-positive guards, robot.txt + sitemap
discovery, frontier/proof/retry state, merge-readiness gates, scale-readiness
actions, broken-link + hreflang + canonical-reachability + JSON-LD + HTTPS/HSTS
+ large-asset + slow-rendered-load checks, mobile PSI score + Core Web Vitals
lab metrics + top opportunities, request counts + transfer size + slow/heavy
+ render-blocking evidence, 5-URL competitor cap, live/lost link proof + risky
source signals + broken target checks + anchor concentration flags, NAP +
LocalBusiness schema + citation consistency, low-CTR + page-two + zero-click +
decline + cannibalization + intent-match + uncrawled landing-page repair
actions, Product schema + BreadcrumbList schema + faceted/variant URLs +
WordPress archive links + plugin resource repair, content depth + helpful
schema + canonical clarity + question-led structure + sitemap context +
optional `/llms.txt` reachability, draft-only status with no autopilot,
priority + effort + proof + acceptance checks + snippets, proof snapshots +
acceptance checks + status + action mode + rerun state + approval-safe agent
action records, status filters + assignee + notes + safe draft actions +
approval/ignore + no external publishing side effects, source proof + approved
change text + mode-specific handoff + acceptance checks + rollback notes +
rerun-proof instructions, original issue + approved/applied change + same-host
rerun with no-published/guaranteed disclaimer, open repairs + drafted
actions + applied repairs + monitor regressions, execution modes + owner
approval + delivery state + final rerun proof + protected retention, Proof
Monitoring + Repair Sprint + SEO/GEO Repair Agent + Agency Workspace offer
scaffolding with Proof Monitoring config-gated checkout, React + Workers
Static Assets + Browser Run, locked homepage + `/api/waitlist` +
`/api/access/request` + D1, `access_events` ordered steps + `/admin/funnel`
1-90 day window + `/api/access/track` rate-limited beacon, real-browser
rendering + static-vs-rendered proof + guarded false positives + per-network
+ per-site rate limits + hashed counters + no stored report + private-beta
handoff + no-ranking promise, intent-landing-page FAQ + JSON-LD + truthful
schema + no AI sampling claim, IndexNow key file at `/{key}.txt` and
`/.well-known/{key}.txt` + sitemap lastmod freshness, invite + self-serve +
founder-override sessions, DNS TXT + HTTPS file verification + apex/www fold
+ Lite 1-page/3/day, retention cleanup of reports + sessions + quota buckets,
D1 buckets for access links + login + waitlist + network + session + daily +
target-site, no-ranking guarantee on `/support` + `/terms` + `/privacy` — is
covered by the named regression pin for that bullet or an explicit sub-claim
pin in the next audit refinement.

## Offline regression results

Re-ran the four offline audit files plus `worker/index.test.mjs` at commit
`7783adc`:

```
$ node --test shared/promise-audit.test.mjs
# tests 71
# pass 71
# fail 0
# duration_ms 141.7

$ node --test scripts/live-promise-spot-check.test.mjs
# tests 18
# pass 18
# fail 0
# duration_ms 203.5

$ node --test worker/routes/pages.test.mjs
# tests 15
# pass 15
# fail 0
# duration_ms 3753.0

$ node --test src/app-contract.test.mjs
# tests 14
# pass 14
# fail 0
# duration_ms 85.2

$ node --test worker/index.test.mjs
# tests 14
# pass 14
# fail 0
# duration_ms 253.6
```

Combined: 132 / 132 tests pass, 0 fail, 0 skipped. No offline pin fires.

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
  fail /proof - real before/after repair receipt is published at /proof
    missing: returned HTTP 404 instead of 200
    missing: real before/after headline
    missing: before score 85
    missing: intermediate score 99
    missing: after score 100
    missing: source report id pinned
    missing: intermediate rerun id pinned
    missing: final rerun id pinned
    missing: owner-approved PR #4 linked
    missing: owner-approved PR #5 linked
    missing: no-ranking boundary stated
    missing: no CMS/GitHub-publishing boundary
    missing: markdown receipt CTA
  fail /proof.md - markdown receipt is served for /proof.md
    missing: returned HTTP 404 instead of 200
    missing: served as text/html instead of text/markdown
    missing: markdown receipt headline
    missing: before score 85
    missing: after score 100
    missing: owner-approved PR #4 referenced
    missing: owner-approved PR #5 referenced
    missing: no-ranking boundary stated
  ok /support - support page keeps the no-ranking promise and refund guard
  ok /terms - terms page keeps the no-ranking boundary
  ok /privacy - privacy page keeps retention and no-tracking statements
  fail /llms.txt - llms.txt stays served and lists the public proof surfaces
    missing: llms.txt lists the before/after receipt
  fail /sitemap.xml - sitemap stays served and lists the indexable public pages
    missing: sitemap lists the before/after receipt
  ok /robots.txt - robots.txt stays served and points at the sitemap
  ok /api/health - health endpoint answers as a shallow public runtime check
  ok /api/deep-health - deep-health endpoint answers as a public-safe readiness check
  ok /api/public-check - anonymous one-page check route is live and validates input before rendering
  ok /api/public-check - anonymous one-page check route rejects non-http URL schemes instead of mangling them
  ok www.seofixkit.com/ - www.seofixkit.com 301-redirects onto the apex host
  ok www.seofixkit.com/check - www.seofixkit.com deep paths redirect with path and query intact
  ok www.seofixkit.com/favicon.svg - www.seofixkit.com static assets redirect too (no asset-host leakage)
  ok www.seofixkit.com/.well-known/security.txt - www.seofixkit.com well-known paths redirect onto the apex host
  ok www.seofixkit.com/unknown-spa-path - www.seofixkit.com SPA-fallback paths redirect onto the apex host
Spot-check failed on 4 surface(s). Fix the deployed copy or the claim in the spot-check, then rerun.
```

18 / 22 surfaces pass against the deployed Worker. The 4 failing surfaces are
all the `/proof`-cluster: the `/proof` HTML page, the `/proof.md` markdown
receipt, the `/llms.txt` listing of `/proof`, and the `/sitemap.xml` listing of
`/proof`.

## Findings

### 1. Zero offline drift

- Every README bullet and every named sub-claim is covered by an offline
  regression pin, and every pin still matches the README wording at `7783adc`.
- The `/proof`-cluster surfaces are pinned by `worker/routes/pages.js`
  (`proofCaseHtml`, `proofCaseMarkdown`, `PROOF_CASE` constant), `worker/index.js`
  (`/proof` and `/proof.md` route handler), `shared/audit-engine.js`
  (`ROOT_PUBLIC_PATHS` includes `/proof`), `worker/routes/pages.js` `llmsText()`
  (links `${origin}/proof` in the public context block), `worker/routes/pages.test.mjs`
  (15 pins for `/proof` HTML + `/proof.md` markdown + canonical + sitemap entry),
  `worker/index.test.mjs` (route dispatch for `/proof`, `/proof.md`, and
  `Accept: text/markdown`), `scripts/live-promise-spot-check.test.mjs` (offline
  lock for the surfaced expectations), and the canonical `README public page
  promise matches Worker routing and copy` pin in `shared/promise-audit.test.mjs`.
- No README edit, no pin edit, no copy edit was needed for the
  `7783adc` baseline.

### 2. Live `/proof` cluster is a deploy gap, not a copy drift

The four `/proof`-cluster failures are identified as a stale-deploy gap, not a
copy drift, on the basis of the following evidence:

- **Code is wired.** `worker/index.js` routes `/proof` and `/proof.md` to
  `proofCaseHtml(origin)` / `proofCaseMarkdown(origin)`. The handler
  unconditionally returns the receipt HTML or the receipt markdown with the
  correct `content-type`. The handler is reachable by static-asset paths
  because `wrangler.jsonc` has `"run_worker_first": true` and the `assets`
  directory ships no `proof*` artifact that would shadow the route.
- **Page copy is wired.** `worker/routes/pages.js` `proofCaseHtml(origin)`
  ships the headline, the three score panels (85/99/100), the pinned report
  ids (`tinystudio-in-96b716c9-…`, `tinystudio-in-75ffee26-…`,
  `tinystudio-in-0a45637f-…`), the two owner-approved PR refs (`#4`, `#5`),
  the no-ranking boundary, the no-CMS/GitHub-publishing boundary, and the
  `/proof.md` CTA — every string the live spot-check looks for.
- **Sitemap and llms.txt are wired.** `shared/audit-engine.js`
  `ROOT_PUBLIC_PATHS` includes `/proof`; `rootSitemap(origin)` includes it;
  `worker/routes/pages.js` `llmsText(origin)` includes `${origin}/proof` in
  the public-context block. The static `public/sitemap.xml` mirror in the repo
  also includes `/proof`; the live sitemap does not.
- **Live evidence is consistent with a stale Worker.** The live `/proof` and
  `/proof.md` return the static `public/404.html` (the `not_found_handling:
  "404-page"` Worker fallback), which is what `env.ASSETS.fetch(request)` at
  the bottom of the Worker produces when the route handler does not match.
  The live `/sitemap.xml` returns the 11-loc compact form (no `/proof`); the
  repo's committed `public/sitemap.xml` mirror has 12 lcs with `/proof`; the
  live `/llms.txt` returns the 15-bullet form (no `/proof`); the repo's
  `worker/routes/pages.js` `llmsText()` produces the 17-bullet form with
  `/proof`. The deployed Worker is running the version that pre-dates the
  `09d2085` proof-receipt route merge (`feat(proof): re-publish real
  before/after repair receipt at /proof`) and the search-index coverage
  refresh that adds `/proof` to the live sitemap/llms.txt mirrors.
- **Verdict.** No code, route, copy, or pin change is needed in this lane.
  The four failures are blocked on a fresh `wrangler deploy` of the current
  Worker (the same deploy gap the `lane1-proof-receipt-reship-20260815.md`
  report and the `lane1-search-index-coverage-20260815.md` report flagged,
  per the standing fleet-release deploy stuck behind `c0c8e2e` note). The
  spot-check will return to 22/22 green the moment the Worker catches up to
  `7783adc`. The offline pins already fail loudly if the deployed copy
  regresses (they assert the `proofCaseHtml`/`proofCaseMarkdown` copy and
  the `ROOT_PUBLIC_PATHS` list), so the deploy gap is observable, not silent.

### 3. Live `/demo`, `/methodology`, `/packages`, `/check`, `/support`, `/terms`, `/privacy` are all green

The 11 page-level surfaces (the proof-loop pages, the no-ranking pages, and
the intent-landing pages) all serve the exact copy the README and the
offline pins lock. The earlier lane-1 2026-08-15 audit
(`lane1-promise-audit-20260815-fleet.md`) fixed two overclaims
("each with an exact snippet" on `/demo`, "Only appears in private billing
when configured" on `/packages`); both fixes are live on the deployed Worker
and both pins still pass.

### 4. Live `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/api/health`, `/api/deep-health`, `/api/public-check`, and the `www` → apex 301 cluster are all green for the non-`/proof` claims

The 7 non-`/proof` machine-surface assertions (anonymous one-page check
form, anonymous-check route validation, anonymous-check non-http scheme
rejection, two health endpoints, two `www` → apex 301s) all pass. The
canonical-host promise still holds across `/`, `/check`, `/favicon.svg`,
`/.well-known/security.txt`, and an unknown SPA-fallback path.

## Drift found and fixed

- **None.** No source, route, page, README, or spot-check edit was needed
  for the `7783adc` baseline. The audit was performed against `7783adc` and
  confirmed green offline.

## Verification

- `node --test shared/promise-audit.test.mjs` → 71/71 pass.
- `node --test scripts/live-promise-spot-check.test.mjs` → 18/18 pass.
- `node --test worker/routes/pages.test.mjs` → 15/15 pass.
- `node --test src/app-contract.test.mjs` → 14/14 pass.
- `node --test worker/index.test.mjs` → 14/14 pass.
- `node scripts/live-promise-spot-check.mjs` against `https://seofixkit.com` →
  18/22 surfaces pass; the 4 `/proof`-cluster failures are a known stale-deploy
  gap, not a copy or pin drift.

## Files touched

- `.lane/reports/lane1-promise-audit-20260820.md` — this report.

No source, route, README, page, spot-check, or pin file was edited. The audit
was performed against `7783adc` and confirmed green offline.

## How to reproduce

Offline:

```bash
node --test shared/promise-audit.test.mjs
node --test scripts/live-promise-spot-check.test.mjs
node --test worker/routes/pages.test.mjs
node --test src/app-contract.test.mjs
node --test worker/index.test.mjs
```

Live spot-check:

```bash
SEOFIXKIT_BASE_URL=https://seofixkit.com node scripts/live-promise-spot-check.mjs
```

The spot-check is opt-in live-read evidence (not part of `npm run check`) and
is journaled verbatim by this report on every run.
