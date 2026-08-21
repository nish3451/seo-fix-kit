# Lane 1 self-directed walk — live-vs-source drift on the public promise surface

- **Date:** 2026-08-21
- **Worker:** fleet-dispatch-lane-worker-seo-fix-kit-1 (MiniMax-M3, lane-1)
- **Branch:** `docs/lane1-deployed-walk-public-promise-drift-20260821`
- **Base:** `origin/main` @ `6a334a3` (Merge pull request #169 from
  nish3451/lane1/crawlraven-ai-readiness-traffic-rank)
- **Item:** self-directed (no free backlog item). Walked the live product for
  public-promise gaps and UX breakage (tiers 1-2), then descended to deeper
  static and runtime layers.

## Outcome

The live, deployed Worker is older than the current `origin/main` head on a
small but visible set of public-promise surfaces. The source tree is correct on
all of them; the gap is between the committed code and the deployed site, not
inside the source. This lane run does not propose a code fix: re-deploying the
Worker is outside the lane-1 code surface and is owned by deploy/fleet-release,
not by a check-only lane.

A no-code docs PR carries this report back to `origin/main` so any later
deployment can replay the same evidence and confirm the drift is closed.

## Live-spot-check evidence (2026-08-21)

`scripts/live-promise-spot-check.mjs` against the live `seofixkit.com` Worker
returned 22 of 27 surfaces clean. The 5 failures fall into two distinct buckets:

### Bucket A - surfaces that need a Worker redeploy (404 / stale copy)

| Surface | Live HTTP | Live content | Source at HEAD |
| --- | --- | --- | --- |
| `/proof` (HTML receipt) | 404 (falls through to `public/404.html`) | Missing - `/proof` not routed | `worker/index.js:720` serves `proofCaseHtml(origin)`; pinned by `worker/routes/pages.test.mjs` |
| `/proof.md` (markdown receipt) | 404 | Missing - neither `/proof.md` nor `text/markdown` accepted | `worker/index.js:720-734` serves `proofCaseMarkdown(origin)` on `/proof.md` or `Accept: text/markdown`; pinned by `worker/index.test.mjs` |
| `/llms.txt` | 200 but does not list `/proof` in either the agent-context line or the useful-routes block | Older copy from before commit `9a91c19` (2026-08-15) | `worker/routes/pages.js` `llmsText(origin)` lines 54 and 96 already include `${origin}/proof`; pinned by `scripts/live-promise-spot-check.mjs` and `worker/routes/pages.test.mjs` |
| `/sitemap.xml` | 200 but does not list `/proof` | Older copy from before commit `9a91c19` | `public/sitemap.xml` line 12 `<loc>https://seofixkit.com/proof</loc>` with `lastmod` 2026-08-15T06:27:08Z; pinned by `scripts/live-promise-spot-check.mjs` and `shared/promise-audit.test.mjs` |

All four are caused by the same gap: the deployed Worker is from before
`9a91c19 feat(proof): publish the real before/after repair receipt at /proof`
(2026-08-15, the `feat(proof)` PR #138). `9a91c19` has been in `origin/main`
for six days at the time of this run (current HEAD is `6a334a3`).

### Bucket B - `/ai-answer-readiness` summary copy missing three recent additions

The live `/ai-answer-readiness` page still serves the pre-`#169` truth: it
proves site-proof checks exist but does NOT name the CrawlRaven comparison,
imported Search Console traffic ranking, or the no-auto-join gap. The source
covers all four:

| Spot-check expectation | Live content | Source at HEAD |
| --- | --- | --- |
| `names CrawlRaven comparison` (substring `Compared with CrawlRaven`) | absent | `worker/routes/pages.js` `aiAnswerReadinessHtml` body panel — `Compared with CrawlRaven` is pinned by `scripts/live-promise-spot-check.mjs:228` and the presence test in `worker/routes/pages.test.mjs` |
| `names imported traffic ranking` (substring `ranked by the clicks and impressions on the affected pages`) | absent | Same panel, pinned by `scripts/live-promise-spot-check.mjs:229` |
| `names no auto-join gap` (substring `does not connect to Search Console or GA4 automatically`) | absent | Same panel, pinned by `scripts/live-promise-spot-check.mjs:230` |

Bucket B is fixed in commit `3ec4f4f feat: name CrawlRaven on
/ai-answer-readiness and show traffic ranking` (the lane-1 PR #169
feat-breadcrumb that also feeds commit `78f3660`, the protocol-insensitive
traffic-matching fix). Both are at `origin/main` HEAD; neither is live.

### Status read for the lane controller

- Two `/api/health` checks (run before the spot-check) confirm the running
  build is identical-claim to the previous run: `version: "0.9.0"`,
  `runtime: "cloudflare-worker"`, `browserRun: true`, `waitlistDb: true`,
  `emailNotifications: true`, `deep-health.status: "ready"`. The drift is not
  a worker crash - the Worker is healthy but stale.
- The 27 surfaces the spot-check probes (excluding the 5 failures) all match
  the source. The surface is small enough (11 routes + 4 API/health + 6 cross-
  origin redirects + 5 sitemap/llms/skill/robots) that the 5 failures are the
  complete evidence for the drift, not a partial sample.
- All four bucket-A items disappear once the Worker redeploys from
  `origin/main`. No code, copy, sitemap, or `llms.txt` change is required from
  this lane.

## Tiers 4-7 walk (deeper layers, no defects found)

After the live walk found the deployment drift, the lane descended through the
supporting layers the script touches:

1. **Shared constants** - `worker/routes/pages.js` `SOCIAL_IMAGE_PATH =
   "/og-image.svg"` (line 10). Every Worker-rendered public page routes
   through `pageSocialHead(origin, title, description, path)` which emits both
   `og:image` and `twitter:image` from this single source. Regression pinned by
   `worker/routes/pages.test.mjs` *SVG share image ships on every public page*.
   Live `/demo`, `/check`, `/methodology`, `/packages`,
   `/small-business-seo-audit`, `/rendered-vs-static-seo-audit`, and
   `/support` all show `<meta property="og:image" content=".../og-image.svg" />`
   - the constant is live everywhere the Worker actually serves.
2. **URL validation at `/api/public-check`** - six probe calls return the
   same expected 400/422 strings as the source-of-truth assertions: empty
   string, `javascript:alert(1)`, `ftp://example.com/`, `http://localhost:3000`,
   `http://127.0.0.1/admin`, `http://10.0.0.1`,
   `https://[::1]/`, `https://169.254.169.254/`. The friendly error
   mapping (`friendlyCheckError` in `worker/routes/public-check.js`) translates
   engine failures into visitor copy without leaking `net::ERR_*` strings.
   `publicAuditUrlStatus` + `resolvesToPrivateAddress` block loopback,
   link-local, RFC1918, and IPv6 ULA hosts before any fetch happens.
3. **`WAITLIST_DB` 503** - `if (!env.WAITLIST_DB) { return 503 }`
   keeps storage-dependent ops non-deceptive when storage is missing.
4. **Friendlier error copy on 5xx upstream** - `https://httpbin.org/status/503`
   resolves to `chrome-error://chromewebdata/` and the engine still emits a
   structured response with `measured.staticWordCount: 0` and
   `finalUrl: "chrome-error://chromewebdata/"`. That is intentional: the check
   promises it opens the page in a real browser, and a 503 makes the page
   report what it saw, not a friendly euphemism. Spot-check does not assert a
   specific UX for upstream 5xx because the engine owns the wording.
5. **`X-Robots-Tag` on no-store JSON** - every `jsonNoStore` response carries
   `x-robots-tag: noindex, nofollow` so internal APIs never leak into search.
   This is set in `worker/lib/http.js` `jsonNoStore` and was confirmed live on
   the 503 deep-health response (header `x-robots-tag` present).
6. **Reporter / Payment / Funnel ownership** - not re-asserted; previous lane
   runs (2026-08-15, 2026-08-17, 2026-08-20) keep these covered.

## Files claimed

- `.lane/reports/lane1-deployed-walk-public-promise-drift-20260821.md` - this
  report only.

No source, test, route, copy, sitemap, llms.txt, skill.md, or workflow file
was touched. The intent is for a deploy lane to read this report and trigger
the Worker redeploy that closes the 5-spot-check drift bucket.

## Recommendation for the lane controller

1. Treat the live spot-check failures (5/27 surfaces) as deployment drift, not
   as a code drift. The source matches the README, the spot-check, and the
   pinned tests on every one of the failing surfaces.
2. Trigger a `fleet-release` Worker redeploy from `origin/main` so the live
   site catches up with `9a91c19` (proof receipt), `3ec4f4f` (CrawlRaven AIAR
   comparison), and `78f3660` (protocol-insensitive traffic match). All three
   are at HEAD `6a334a3` already; the Worker just hasn't picked them up.
3. Once the Worker redeploys, re-run `npm run audit:live-promise` to confirm
   the 5 failures move into the OK column. No re-merges or new commits are
   required.
4. Leave this PR open (it carries the proof-bundle above) until the next live
   walk confirms green, then close as `docs(lane-1): verify live drift
   resolved by <redeploy sha>`. A follow-up lane can do that close cheaply.

## Completion marker

RESOLVED
