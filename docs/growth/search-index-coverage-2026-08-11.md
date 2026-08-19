# SEO Fix Kit — full search-index coverage (Google + Bing/DuckDuckGo)

Packet for the lane-1 item: **Establish full search-index coverage: all 7 public
pages indexed on Google plus a Bing/DuckDuckGo presence**
(backlog owner:
`/home/nish/workspaces/agent-state/seo-fix-kit-improvement-loop/backlog.md`,
[scout 2026-08-09, rank: 2, risk: green]).

Status: **agent-completable half shipped, engine half needs owner credentials +
time.** This packet (2026-08-14) re-verified the gap live against current main
(which now has 11 public routes, not the 8 the 2026-08-11 packet tracked),
ported the credential-free IndexNow submission path (key-file routes in the
Worker and local server, submission script, tests, README) that gets Bing —
and therefore DuckDuckGo — crawling all public URLs the moment the release
lands, shipped truthful per-page `<lastmod>` on every sitemap URL (including
the three intent landing pages), and documented the two owner-only legs
(Google Search Console request-indexing, Bing Webmaster ownership) as an exact
manual kit. Search-engine indexing is externally owned and time-dependent; the
acceptance outcome ("all 7 pages on Google, seofixkit.com first on
Bing/DDG") cannot be produced from a lane without credentials, but every lever
that does not need credentials is now built and one command away.

## Re-verified 2026-08-15 (~13:50 IST, lane-1 run) — re-landing on current main

The 2026-08-14 packet (PR #139) never merged — it went CONFLICTING as main
moved past it (25+ commits, including #141/#142/#143/#145/#146/#147/#150
public-page copy/layout changes) and stayed open. This run rebuilt the same
two legs on current `origin/main` (`dc2090e`, 2026-08-15) as PR #157:

- Live re-verification 2026-08-15: `https://seofixkit.com/sitemap.xml` still
  loc-only 11 URLs, zero `<lastmod>`; `/indexnow` and
  `/.well-known/indexnow-key.txt` both HTTP 404 (no key file live); PR #139
  still OPEN/CONFLICTING with green `check`.
- Cherry-picked the 2026-08-14 feat onto fresh main (one conflict in
  `worker/routes/pages.test.mjs` — main's share-image test block — resolved
  by keeping both), then refreshed `ROOT_PUBLIC_LASTMODS` +
  `public/sitemap.xml` to the truthful post-feat page-change times:
  `/demo`, `/methodology`, `/packages`, and all three intent pages now
  `2026-08-15T07:14:01Z` (#150 copy corrections); `/check`
  `2026-08-15T04:27:51Z` (#146 floor removal); `/` unchanged
  (`2026-08-13T03:48:58Z` — the only post-base `src/App.jsx` change, #145,
  touches private-beta report UI only, invisible to public crawlers).
- Same owner-only legs as the 2026-08-14 packet: Google Search Console
  request-indexing and Bing Webmaster ownership remain manual (no
  credentials on this box).

## Re-verified 2026-08-14 (~12:30 IST, lane-1 run) — current live state

The 2026-08-11/12 packet legs (IndexNow path + lastmods) never landed on
`origin/main` (the old branch went CONFLICTING and its work stayed unmerged).
This run re-verified the live gap and rebuilt both legs on current main, which
now serves 11 public URLs after the intent landing pages (#137) and the
`run_worker_first: true` global routing change (#107).

- **Live sitemap is loc-only:** `https://seofixkit.com/sitemap.xml` HTTP 200,
  11 `<loc>` (all of `/`, `/demo`, `/check`, `/methodology`, `/packages`,
  `/small-business-seo-audit`, `/rendered-vs-static-seo-audit`,
  `/ai-answer-readiness`, `/privacy`, `/support`, `/terms`), zero `<lastmod>`.
  lastmod ships with this PR's release.
- **IndexNow key file not live:** both `https://seofixkit.com/{key}.txt` and
  `https://seofixkit.com/.well-known/{key}.txt` return the SPA fallback HTML
  (HTTP 200, body does not match the key). `run_worker_first: true` (already
  live) means the Worker routes added here will serve the key without being
  shadowed by static assets.
- **`node scripts/submit-indexnow.mjs --dry-run` (live, this run):** key file
  check `MISS` on both paths (expected pre-release), sitemap URL set parsed:
  11 URLs, and it would POST to `api.indexnow.org` + `www.bing.com/indexnow`.
  Exit 0 on dry-run. The script refuses a real submission until the key file
  is live (exit 2), so nothing half-baked can be sent.
- **Bing unchanged:** `bing.com/search?q="seofixkit.com"` HTTP 200, ZERO
  `b_algo` organic blocks; the `seofixkit` string hits are query echoes in
  meta/suggestions. No organic presence.
- **DuckDuckGo unchanged, bot-challenged:** `html.duckduckgo.com/?q="seofixkit.com"`
  HTTP 202 with ~80 challenge markers, zero `result__a` links; the 2026-08-09
  real-browser "No results found" evidence still stands (DDG cannot be
  re-sampled from this box; its index is Bing-derived, so IndexNow is the
  lever).
- **Google not re-probed** (direct Google is CAPTCHA-walled from this VPS;
  Startpage proxy receipt from 2026-08-11 stands: homepage only).

## Fresh live evidence (2026-08-11, ~10:40 IST — still the standing Google/Bing/DDG receipts)

- **Google: homepage only.** Startpage (a live Google-index proxy) for
  `site:seofixkit.com` returns exactly one organic result:
  `https://seofixkit.com` "SEO Fix Kit - Proof-Backed SEO Repair Beta". Per-path
  probes `site:seofixkit.com/{terms,demo,methodology,packages,check,privacy,support}`
  all return zero results. Direct Google is CAPTCHA-walled from this VPS
  (`/sorry/index`, screenshot `/tmp/serde2-google_gbv1_site.png`), so Startpage
  is the reproducible Google-index receipt. Backlog evidence (2026-08-09, real
  anti-detection browser) showed `/` + `/terms`; the `/terms` result has since
  dropped out or been consolidated — either way, 10 of 11 public routes remain
  unindexed on Google.
- **Bing: zero presence.** Real-browser `bing.com/search?q=seofixkit.com`
  returns ~82,200 results, none of them seofixkit.com (all unrelated
  "Inn at the Market" hotel pages — Bing is fuzzy-matching the query text).
  Screenshot `/tmp/seo-serde-bing_domain.png`.
- **DuckDuckGo: blocked this run, zero by construction.** DDG html/lite/main
  endpoints all bot-walled this IP (418/error page; screenshots
  `/tmp/serde2-duckduckgo_main.png`). DDG's web index is Bing-derived, and
  prior real-browser evidence (2026-08-09) recorded a zero-results SERP for
  `seofixkit.com`. No change in DDG coverage is possible before Bing crawls.
- **Site surfaces are crawl-ready:** `https://seofixkit.com/robots.txt` HTTP 200
  (`Allow: /`, `Sitemap: https://seofixkit.com/sitemap.xml`);
  `https://seofixkit.com/sitemap.xml` HTTP 200 listing 11 public URLs. Every
  page has unique title/meta/OG/canonical; homepage carries
  Organization/WebSite/SoftwareApplication/FAQPage schema; `/check` carries
  WebPage/FAQ JSON-LD; the three intent landing pages carry
  WebPage/SoftwareApplication/FAQPage JSON-LD.
- **No ownership artifacts observable:** DNS TXT on seofixkit.com carries only
  SPF (`v=spf1 include:_spf.porkbun.com include:_spf.mx.cloudflare.net ~all`);
  no `google-site-verification` meta, no `bing-site-verification` meta, no
  BingSiteAuth.xml, no IndexNow key file live (both candidate paths return the
  SPA fallback HTML — the bug this packet's Worker routes fix).

## What this packet ships

- `shared/index-now.js` — committed IndexNow key (`3219d564f9f914772e178f33ae543e60`),
  key file paths, payload builder, endpoints (`api.indexnow.org`,
  `www.bing.com/indexnow`). Key is world-readable by spec, not a credential.
- `shared/audit-engine.js` — hoisted the canonical route list to
  `ROOT_PUBLIC_PATHS` (11 routes: the original 8 plus the three intent landing
  pages), shared by `rootSitemap()` and IndexNow so the sitemap and the
  submission set can never drift; adds `ROOT_PUBLIC_LASTMODS` so every sitemap
  URL carries a truthful W3C `<lastmod>`.
- `worker/index.js` — serves `GET /{key}.txt` and `GET /.well-known/{key}.txt`
  (text/plain, `x-robots-tag: noindex`), apex-only like every other public
  surface; www requests keep 301ing to apex.
- `server/index.js` — local dev-server parity for both key paths.
- `scripts/submit-indexnow.mjs` + `scripts/submit-indexnow.test.mjs` —
  `node scripts/submit-indexnow.mjs` verifies the key file is live at both
  locations (refuses otherwise, exit 2), parses the live sitemap locs, POSTs
  the payload to both endpoints, and reports per-endpoint accept/reject
  (exit 0/3). `--dry-run` previews with no network writes.
- `package.json` — `submit:indexnow` script + `test:indexnow` wired into the
  canonical `check` gate.
- `worker/index.test.mjs` — apex key file 200 with exact key body + noindex,
  www 301 to apex, for both paths.
- `public/sitemap.xml` — static mirror carries the same lastmods as the
  generated sitemap.
- `worker/routes/pages.test.mjs` — locks the URL set to `ROOT_PUBLIC_PATHS`,
  and that every URL in the generated and static sitemaps carries the exact
  `ROOT_PUBLIC_LASTMODS` value as a parseable UTC W3C datetime.
- `README.md` — documents the IndexNow submission path and the lastmod
  freshness hints.
- `docs/growth/search-index-coverage-2026-08-11.md` — this packet.

Truthful lastmod mapping (W3C UTC commit timestamps of the last change to each
page's rendering code; intent pages carry the #137 timestamp):

| Path | lastmod |
| --- | --- |
| `/` | `2026-08-13T03:48:58Z` (#119, first viewport) |
| `/demo` | `2026-08-13T09:07:01Z` (#122, demo proof wrap) |
| `/check` | `2026-08-12T19:43:36Z` (#116, funnel walk viewport) |
| `/methodology` | `2026-08-13T09:07:01Z` (#122) |
| `/packages` | `2026-08-13T09:07:01Z` (#122) |
| `/small-business-seo-audit` | `2026-08-14T11:07:01Z` (#137) |
| `/rendered-vs-static-seo-audit` | `2026-08-14T11:07:01Z` (#137) |
| `/ai-answer-readiness` | `2026-08-14T11:07:01Z` (#137) |
| `/privacy` | `2026-08-11T12:01:28Z` (#100, footer restore) |
| `/support` | `2026-06-12T14:12:49Z` (meta trim) |
| `/terms` | `2026-06-12T14:12:49Z` (meta trim) |

## Owner manual legs (credentials required — cannot be done by an agent)

Both are one-time, copy-paste steps that materially accelerate the outcome:

1. **Google Search Console — request indexing (accelerates Google re-crawl).**
   - Add property `https://seofixkit.com` (URL-prefix) at
     https://search.google.com/search-console (any Google account).
   - Verify: DNS TXT record `google-site-verification=...` at Porkbun (or the
     HTML meta tag; DNS is preferred and survives redeploys).
   - Submit `https://seofixkit.com/sitemap.xml` in Sitemaps.
   - Open URL Inspection for each of the 11 sitemap URLs and click
     "Request indexing" (spread over a few days; Google throttles).
   - Expected outcome: `site:seofixkit.com` on Google returns all 11 pages.
     Without GSC, Google re-crawls on its own schedule via the sitemap and
     the homepage's internal links (already shipped: `/check` is linked from
     `/`, `/demo`, `/packages`, `/methodology`, `/support`, `/terms`,
     `/privacy`).
2. **Bing Webmaster Tools — ownership + sitemap (long-term Bing health).**
   - Add site at https://www.bing.com/webmasters (Microsoft account).
   - Verify: DNS TXT `ms=...` at Porkbun.
   - Submit `https://seofixkit.com/sitemap.xml`.
   - IndexNow (shipped here) covers the crawl trigger; Webmaster Tools adds
     the dashboard, crawl logs, and index coverage reports.

## Resume path (agent-completable, after this PR is merged AND released)

1. Confirm release landed: `curl -s https://seofixkit.com/{key}.txt` returns
   the key text (not the SPA HTML), and
   `curl -s https://seofixkit.com/sitemap.xml` contains `<lastmod>` for all 11
   URLs.
2. `node scripts/submit-indexnow.mjs` — verify 2x "key matches", 11 URLs
   listed, ACCEPTED on both endpoints. Bing crawls on its schedule (typically
   minutes to hours); DDG follows from Bing's index.
3. Re-run the verification queries from "Fresh live evidence" above; record
   receipts in this file under a "Re-verified" section. Google's leg moves
   only via owner step 1 or its own re-crawl cadence (now helped by lastmod).

## Acceptance / verification mapping

- Bing/DDG first-result presence: owned by IndexNow submission (this packet)
  + crawler schedule; externally observable via
  `bing.com/search?q=seofixkit.com` and `duckduckgo.com/?q=seofixkit.com`.
- All public pages on Google: owned by Search Console request-indexing (owner)
  + sitemap re-crawl (now with truthful lastmod freshness hints, this packet);
  externally observable via `site:seofixkit.com`.
- No index bloat / duplicate-host junk: already enforced — www 301s to apex,
  every emitted URL (canonical, og:url, sitemap, robots, key file) is
  apex-only; submission set is exactly the sitemap set with no query strings.
- Rollback: remove the worker key-file routes, delete
  `shared/index-now.js` + `scripts/submit-indexnow.mjs`, and drop the lastmod
  map from `shared/audit-engine.js`/`public/sitemap.xml`; no product surface
  or public copy changes.

## Files changed in this packet

- `shared/index-now.js` (new), `scripts/submit-indexnow.mjs` (new),
  `scripts/submit-indexnow.test.mjs` (new),
  `docs/growth/search-index-coverage-2026-08-11.md` (this file)
- `shared/audit-engine.js`, `worker/index.js`, `worker/index.test.mjs`,
  `server/index.js`, `package.json`, `README.md`,
  `public/sitemap.xml`, `worker/routes/pages.test.mjs`
