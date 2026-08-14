# Lane 1 report — repair PR #114's red check (test-registration gap)

Date: 2026-08-14. Branch: `lane1-repair-pr114-registration` (pushed to
`feat/first-party-funnel-instrumentation-lane1` head).

## Item

Self-directed cycle (no free backlog item). Descended the ladder:

- Tier 1-2 walk of the live product: `npm run audit:live-promise` fully green
  (20/20 checks, incl. www→apex 301s); full mobile 390x844 Playwright walk of
  all 11 public pages — zero horizontal overflow, zero console/page errors,
  zero broken internal links, zero request failures; `/check` FAQ + JSON-LD
  privacy wording truthful (post-#135); all page titles/descriptions/
  canonicals/og tags present and apex-consistent; sitemap + llms.txt truthful
  and 200; deployed build == origin/main (`Dd3Lei8e` / `fa0d6f9`).
- No standalone public-promise gap found; the one red CI check in the fleet
  was PR #114's test-registration gap, flagged lane-ownable by the scout.

## What was broken

PR #114 (`feat/first-party-funnel-instrumentation-lane1`) commits two new
hermetic suites — `worker/lib/access-events.test.mjs` (7 tests) and
`worker/routes/access.test.mjs` (7 tests) — but never wires them into
`package.json`, so `scripts/check-chain-inventory.test.mjs` failed:

> committed Node test worker/lib/access-events.test.mjs is absent from the
> canonical check chain: add a "test:<name>" script and run it from
> "scripts.check"

The PR check (`npm run check`) was red on this.

## Fix (one commit, one file)

`package.json` (+3/-1):

- add `"test:access-events": "node --test worker/lib/access-events.test.mjs"`
- add `"test:access": "node --test worker/routes/access.test.mjs"`
- insert `npm run test:access-events && npm run test:access` into
  `scripts.check` after `test:webhooks`, matching the existing convention for
  hermetic suites.

## Verification

- Local: `test:access-events` 7/7 pass, `test:access` 7/7 pass,
  `test:check-inventory` 2/2 pass.
- Local full `npm run check` red only on `test:canary-dry-run` — proven
  identical on clean `origin/main` (host `/tmp/package.json` ancestor
  contamination documented in ERRORS.md; the CI runner's `/tmp` is clean).
- Pushed to `feat/first-party-funnel-instrumentation-lane1`
  (`55acb1e..4d0da88`). CI run 31800712905: **success** (check pass 2m6s,
  CodeRabbit pass). CI log shows both new suites executing inside the
  canonical chain.

## Scope note

The registration fix belongs on #114's branch (its feature files are there);
a standalone registration PR on main would fail the inventory's
"chain only references committed files" test because the test files are not
on main. Repaired the open red PR directly rather than restarting it.
