# Lane 1 report — full search-index coverage (Google + Bing/DuckDuckGo)

Branch: `lane1/search-index-coverage-20260814` (off fresh `origin/main` de0fa20)
PR: https://github.com/nish3451/seo-fix-kit/pull/139

## Outcome

The item's **agent-completable half is shipped**; the acceptance outcome (all
public pages on Google plus a Bing/DDG presence) is **externally owned and
cannot be finished from a lane without account credentials**. The prior
2026-08-11/12 packet work had never merged (old branch CONFLICTING), so this
run rebuilt both legs on current main — which now has **11 public URLs** (the
3 intent landing pages from #137 landed after the original packet).

Shipped:
- Credential-free IndexNow path: Worker serves `/{key}.txt` +
  `/.well-known/{key}.txt` apex-only with `noindex`; local server parity;
  `npm run submit:indexnow` verifies the key file live before POSTing the
  live sitemap URL set to `api.indexnow.org` + `www.bing.com/indexnow`
  (refuses otherwise, exit 2). This is the Bing + Bing-derived DuckDuckGo
  crawl trigger.
- Truthful per-page `<lastmod>` on all 11 sitemap URLs (generated + static
  mirror), from `ROOT_PUBLIC_LASTMODS` (W3C UTC commit timestamps).
- Single canonical route list `ROOT_PUBLIC_PATHS` shared by sitemap and
  IndexNow; tests lock URL set + every lastmod; `test:indexnow` wired into
  the canonical `npm run check` gate.
- Packet doc `docs/growth/search-index-coverage-2026-08-11.md` with the
  2026-08-14 live re-verification receipts.

## Live evidence (2026-08-14)

- `https://seofixkit.com/sitemap.xml` HTTP 200, 11 locs, zero lastmod (loc-only pre-release).
- Both key-file paths return SPA fallback (HTTP 404 body mismatch) — pre-release, expected.
- `node scripts/submit-indexnow.mjs --dry-run`: 2x key MISS, 11 sitemap URLs parsed, would POST both endpoints, exit 0.
- Bing: zero organic blocks for `"seofixkit.com"` (query echoes only). DDG: bot-challenged (HTTP 202, ~80 challenge markers); Bing-derived index. Google: CAPTCHA-walled from this box (Startpage proxy 2026-08-11 receipt: homepage only).
- No ownership artifacts observable (no google/bing site-verification, no key file live).

## Owner-only legs (documented manual kit in the packet doc)

1. Google Search Console: add property, DNS TXT verify, submit sitemap, request-indexing per URL.
2. Bing Webmaster Tools: add site, DNS TXT verify, submit sitemap.

## Verification

- `npm run check` green: 23 suites, 0 fail (includes new `test:indexnow`,
  `test:check-inventory` gate, vite build).
- `node --test` for submit-indexnow (8/8), pages (11/11), worker dispatch (13/13), audit-engine (29/29) all pass.

## Files changed

- `shared/index-now.js` (new) — key, paths, payload builder, endpoints
- `scripts/submit-indexnow.mjs` (new) — live-key-gated submission script
- `scripts/submit-indexnow.test.mjs` (new) — 8 hermetic tests
- `shared/audit-engine.js` — `ROOT_PUBLIC_PATHS` (11) + `ROOT_PUBLIC_LASTMODS`; `rootSitemap()` emits lastmod
- `worker/index.js` — key-file routes (apex-only, noindex)
- `worker/index.test.mjs` — key-file 200/noindex + www 301 test
- `server/index.js` — local key-file parity
- `public/sitemap.xml` — static mirror with lastmods
- `worker/routes/pages.test.mjs` — URL set + lastmod locks
- `package.json` — `test:indexnow` + `submit:indexnow` + check-chain wiring
- `README.md` — IndexNow submission + lastmod documentation
- `docs/growth/search-index-coverage-2026-08-11.md` (new) — packet doc
