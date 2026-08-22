# SEO Fix Kit — search-index coverage freshness refresh (lane 1, 2026-08-20)

Packet for the lane-1 item: **Establish full search-index coverage: all
public pages indexed on Google plus a Bing/DuckDuckGo presence**
(backlog owner: `/home/nish/workspaces/agent-state/seo-fix-kit-improvement-loop/backlog.md`,
[scout 2026-08-09, rank: 2, risk: green]).

Status: **freshness discipline pinned; eight stale lastmods refreshed.**
The credential-free IndexNow submission path (Bing + Bing-derived
DuckDuckGo) and the truthful per-page `<lastmod>` on every sitemap URL
shipped in PR #157 (commit `6c6054b`) are still in place on current main
(`7783adc`, 2026-08-20), but eight of the twelve sitemap paths had gone
stale again as the intervening page-renderer commits landed. This packet
re-validates the freshness leg, refreshes the stale entries against the
actual last commit touching each renderer, and adds a CI discipline pin
so future page edits cannot ship without refreshing the matching lastmod.

## Re-verified 2026-08-20 (lane-1 run) — current live state

- **IndexNow path intact:** `shared/index-now.js`,
  `scripts/submit-indexnow.mjs`, `scripts/submit-indexnow.test.mjs`, the
  Worker key-file routes at `/{key}.txt` and `/.well-known/{key}.txt`
  (apex-only, `x-robots-tag: noindex`), and `npm run submit:indexnow`
  (verifies key file live, then POSTs to `api.indexnow.org` +
  `www.bing.com/indexnow`) all still shipped via PR #157 (no code
  change since; the Worker route is the only consumer and the script is
  the only writer).
- **Sitemap and IndexNow submission set still share `ROOT_PUBLIC_PATHS`:**
  12 apex-only public URLs (homepage, 3 demo/methodology/packages
  proof-loop pages, 3 intent landing pages, proof, support, terms,
  privacy, /proof.md). No drift; no `www.`; no query strings; no
  `llms.txt` (intentional — `/llms.txt` is an agent-readable protocol
  surface, not an indexing target).
- **`robots.txt` still apex-only with the sitemap pointer.**
- **Sitemap lastmod gap (the bug this packet closes):** before this run,
  nine of twelve `ROOT_PUBLIC_LASTMODS` values were older than the most
  recent commit that actually touched the page's renderer code:
  - `/` was `2026-08-13T03:48:58Z` (SPA homepage hero copy); last
    meaningful App.jsx commit was `2c396c2` on `2026-08-19T13:24:24Z`
    (first-party funnel instrumentation).
  - `/check` was `2026-08-15T04:27:51Z` (320px floor removal); last
    `checkHtml` change was `67e4fe8` on `2026-08-19T12:56:07Z`
    (friendly validation + client-side `publicUrlError` short-circuit).
  - `/small-business-seo-audit`, `/rendered-vs-static-seo-audit`,
    `/ai-answer-readiness` were `2026-08-15T07:14:01Z`; the shared
    `publicProductPageHtml` got its `h3` FAQ style in `d6bb022` on
    `2026-08-19T13:36:30Z`, which is the last meaningful change to
    all three.
  - `/privacy` was `2026-08-11T12:01:28Z` (footer restore); the
    320px-collapse in `62d2f82` on `2026-08-15T03:44:50Z` touched
    `privacyHtml` and was missed by the previous refresh.
  - `/proof` was `2026-08-15T06:27:08Z`; `proofCaseHtml` shipped in
    `9a91c19` on `2026-08-15T10:43:48Z`.
  - `/support` and `/terms` were `2026-06-12T14:12:49Z`; both were
    touched by `dcb2554` on `2026-08-11T01:11:38Z` (policy-page
    un-dead-end + cross-link to `/check`).

  The discipline test now refuses any future re-occurrence.

## What this packet ships

- `shared/audit-engine.js` — refreshed nine `ROOT_PUBLIC_LASTMODS`
  entries to the actual last commit that touched each page's renderer
  (SPA `src/App.jsx` for `/`, `worker/routes/pages.js` generator
  functions for every worker-rendered page, `worker/routes/public-check.js`
  for `/check`). Tightened the comment block to document the IST-with-Z
  convention and to point future contributors at the freshness discipline
  pin before they edit a page renderer.
- `public/sitemap.xml` — mirror the refreshed lastmods so the static
  mirror stays in lock-step with the generated sitemap (the discipline
  test would have caught any drift here too, but the mirror is the file
  shipped to the engine on first paint).
- `worker/routes/pages.test.mjs` — new
  "sitemap lastmod stays truthful relative to the page renderer
  (freshness discipline)" test. Maps every `ROOT_PUBLIC_PATH` to the
  `(file, line-range)` of its renderer, runs
  `git log -1 --format=%aI -L <start>,<end>:<file>` for each range,
  converts the result to the existing IST-with-Z convention, and refuses
  any path whose lastmod is older than the latest commit. Failures
  accumulate into a single assertion so the next stale path is named in
  the same failure rather than hidden behind an early short-circuit.
  Refresh `PUBLIC_PAGE_RENDERERS` in this file when a new public path
  is added.
- `docs/growth/search-index-coverage-2026-08-20.md` — this packet.

## Why the IST-with-Z convention (and why the discipline pin does not redefine it)

The existing sitemap uses each commit's local IST timestamp formatted
with a `Z` suffix. Strictly that is not real UTC, but every consumer
(`rootSitemap`, `IndexNow` payload, this discipline test) agrees on
the convention, so a discipline pin that compared lastmod to true UTC
would always look 5h30m stale and produce false positives. The pin
follows the convention; the comment above `ROOT_PUBLIC_LASTMODS` now
states the convention explicitly so a future cleanup to real UTC can
land in one coordinated commit (sitemap, IndexNow payload, the pin).

## Owner manual legs (credentials required — cannot be done by an agent)

Both are one-time, copy-paste steps that materially accelerate the outcome:

1. **Google Search Console — request indexing (accelerates Google re-crawl).**
   - Add property `https://seofixkit.com` (URL-prefix) at
     https://search.google.com/search-console (any Google account).
   - Verify: DNS TXT record `google-site-verification=...` at Porkbun
     (or HTML meta tag; DNS is preferred and survives redeploys).
   - Submit `https://seofixkit.com/sitemap.xml` in Sitemaps.
   - Open URL Inspection for each of the 12 sitemap URLs and click
     "Request indexing" (spread over a few days; Google throttles).
   - Expected outcome: `site:seofixkit.com` on Google returns all 12
     pages. Without GSC, Google re-crawls on its own schedule via the
     sitemap (now with truthful lastmod freshness hints, refreshed in
     this PR) and the homepage's internal links (already shipped:
     `/check` is linked from `/`, `/demo`, `/packages`, `/methodology`,
     `/support`, `/terms`, `/privacy`).
2. **Bing Webmaster Tools — ownership + sitemap (long-term Bing health).**
   - Add site at https://www.bing.com/webmasters (Microsoft account).
   - Verify: DNS TXT `ms=...` at Porkbun.
   - Submit `https://seofixkit.com/sitemap.xml`.
   - IndexNow (shipped in PR #157, intact here) covers the crawl
     trigger; Webmaster Tools adds the dashboard, crawl logs, and
     index coverage reports.

## Resume path (agent-completable, after this PR is merged AND released)

1. Confirm release landed: `curl -s https://seofixkit.com/{key}.txt`
   returns the key text (not the SPA HTML), and
   `curl -s https://seofixkit.com/sitemap.xml` returns the refreshed
   lastmods for the 12 URLs.
2. `node scripts/submit-indexnow.mjs` — verify 2x "key matches",
   12 URLs listed, ACCEPTED on both endpoints. Bing crawls on its
   schedule (typically minutes to hours); DDG follows from Bing's
   index.
3. Re-run the verification queries in the 2026-08-11 packet ("Fresh
   live evidence" section); record receipts in this file under a
   "Re-verified" section. Google's leg moves only via owner step 1 or
   its own re-crawl cadence (now helped by the refreshed lastmods).

## Acceptance / verification mapping

- Bing/DDG first-result presence: owned by IndexNow submission
  (PR #157, intact here) + crawler schedule; externally observable
  via `bing.com/search?q=seofixkit.com` and
  `duckduckgo.com/?q=seofixkit.com`.
- All public pages on Google: owned by Search Console request-indexing
  (owner) + sitemap re-crawl (now with truthful lastmod freshness
  hints, refreshed in this PR); externally observable via
  `site:seofixkit.com`.
- No index bloat / duplicate-host junk: already enforced — www 301s to
  apex, every emitted URL (canonical, og:url, sitemap, robots, key
  file) is apex-only; submission set is exactly the sitemap set with
  no query strings.
- Lastmod freshness discipline: pinned by
  `worker/routes/pages.test.mjs` "sitemap lastmod stays truthful
  relative to the page renderer"; CI fails before merge if any
  `ROOT_PUBLIC_PATH` is added without a matching entry in
  `PUBLIC_PAGE_RENDERERS` or any lastmod goes stale.
- Rollback: revert this PR; no product surface or public copy changes.

## Files changed in this packet

- `shared/audit-engine.js` (refreshed `ROOT_PUBLIC_LASTMODS`,
  tightened comment block)
- `public/sitemap.xml` (mirror the refreshed lastmods)
- `worker/routes/pages.test.mjs` (freshness discipline pin +
  `PUBLIC_PAGE_RENDERERS` map)
- `docs/growth/search-index-coverage-2026-08-20.md` (this file)

## Re-verified 2026-08-22 (lane-1 run) — CI gate repaired, lastmods re-aligned to git truth

PR #174 sat red since 2026-08-22 02:32 UTC: its own freshness-discipline
test reported every one of the twelve paths stale against a single
timestamp (`2026-08-22T08:01:54 IST`) that equaled the branch-head merge
commit's author time. Root cause was environmental, not data drift:
`.github/workflows/pr-check.yml` used `actions/checkout@v4` defaults,
which is a **depth-1 shallow clone**. Under depth 1, `git log -L` can
only see the head commit, so every renderer range resolves to "last
touched by the head commit itself" — newer than any committed lastmod by
construction. The gate was unwinnable on CI while main stayed green only
because the test ships in this PR, not on main.

Fixes on the branch (still PR #174, no new PR):

- `.github/workflows/pr-check.yml` checkout step now sets
  `fetch-depth: 0`, so the discipline test sees real renderer history.
  Job name, triggers, and pins unchanged.
- With full history restored, two stored values were ahead of their
  true renderer commits (left over from conflict-resolution merges) and
  were aligned down to what `git log -L` actually reports:
  `/methodology` → `2026-08-13T03:48:58Z`,
  `/rendered-vs-static-seo-audit` → `2026-08-21T05:10:13Z`; mirrored in
  `public/sitemap.xml`. All ten other values verified exact.
- Local verification at branch tip with full history:
  `node --test worker/routes/pages.test.mjs` → 17 pass / 0 fail
  (freshness discipline included); `npm run test:audit-engine` → 38
  pass / 0 fail; `npm run test:indexnow` → 8 pass / 0 fail.

Live-state receipts (2026-08-22, this run):

- `https://seofixkit.com/sitemap.xml` still loc-only, zero `<lastmod>`
  (production predates #157's release).
- Both IndexNow key-file paths return HTTP 404 HTML (proper SPA 404
  page now, not the old SPA-fallback 200): the deployed Worker build
  predates the key-file routes. `node scripts/submit-indexnow.mjs`
  would exit 2 (key file not live) — submission remains correctly
  blocked until the next production deploy of merged main.
- Bing/DDG presence therefore unchanged; Google leg unchanged
  (Search Console is owner-only).

Resume path after #174 merges and the release deploys: unchanged from
the 2026-08-20 packet — confirm key file + lastmods live, then
`node scripts/submit-indexnow.mjs` for the real Bing/IndexNow POST.
