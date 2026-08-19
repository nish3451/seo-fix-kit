# Lane 1 report: ICP experiment precondition regression 2026-08-14

Branch: lane1/icp-precondition-regression-20260814

## Status

Deliverable: the seven-day founder-led ICP acquisition experiment cannot start yet —
its `/check` free-entry surface is live-regressed. This report records the evidence
and the exact resume condition. No invitations were sent (outreach stays founder-owned);
the window has not started (`window_start` remains unfilled in the experiment log).

## What was checked (live, 2026-08-14)

`npm run audit:live-promise` against https://seofixkit.com — 9 of 16 surfaces fail:

| Surface | Failure |
|---|---|
| `/demo` | missing footer links to terms + privacy (pre-#100 copy) |
| `/check` | missing "short-lived anonymous rate-limit counters" no-storage disclosure (pre-#88 copy) |
| `/methodology` | missing clickable CTA into `/check` (pre-#90) + footer terms/privacy (pre-#100) |
| `/packages` | missing footer terms/privacy links (pre-#100) |
| `/support` | missing link to `/check` (pre-#85) |
| `/terms` | missing link to `/check` (pre-#85) |
| `/privacy` | no links at all (pre-#85) |
| `POST /api/public-check` `ftp://` scheme | returns HTTP 422 instead of 400 (pre-#83) |
| `www.seofixkit.com/favicon.svg` | serves 200 instead of 301 onto apex (pre-#107) |

Direct curl confirmation (same hour):

- `curl -s https://seofixkit.com/check` — contains "No account, no email, no stored
  report" and "nothing about your check" (old wording); no "No report or URL is stored".
- `curl -s https://seofixkit.com/demo` — zero `href` to `/terms` or `/privacy`.
- `curl -s https://seofixkit.com/privacy` — zero `href` to anything.
- `curl -s https://seofixkit.com/` — serves `assets/index-DX7O9nYF.js`.
- Local build of current main (7fcbf2b / d2f75f7) produces `assets/index-Dd3Lei8e.js`.

## Root cause (fleet release machinery, outside this repo)

The last recorded release `c0c8e2e` (2026-08-13 22:40) claims marker
`assets/index-Dd3Lei8e.js` in `agent-state/lanes/release-state-seo-fix-kit.json`, and
`fleet-release-seo-fix-kit-last-deploy.log` shows the build produced exactly that hash —
but Wrangler then logged **"No updated asset files to upload. Proceeding with
deployment..."** and the live site still serves the older `assets/index-DX7O9nYF.js`.
The worker routes copy is also pre-#85/#88/#90/#100. The fleet-release checkout
`/home/nish/workspaces/products/proof-seo` sits on a stale branch
(`ci/vps-verify-runners` at `1a57293`) with uncommitted changes to
`worker/routes/pages.js` and a gitignored `dist/`; the detached deploy worktree
symlinks `node_modules` from that checkout, so the "clean worktree of c0c8e2e" build
did not actually build c0c8e2e's source. Fleet-release is additionally refusing to
publish since 2026-08-14 02:37: "provider deployment identity lookup failed before
publish (cloudflare_account_id missing on config)".

This is a deploy-machinery regression, not repo copy drift: `npm run check` and the
offline spot-check lock (`scripts/live-promise-spot-check.test.mjs`, 14/14 pass) are
green on current main.

## Resume condition (for the founder)

Do not send invitation #1 until a fleet release actually swaps the live Worker/asset
bundle and `npm run audit:live-promise` is green again (all 16 surfaces). The
experiment log (`docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md`)
carries this as a dated precondition note.

## Files touched

- `docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md` — dated
  2026-08-14 precondition re-verification: NOT green, resume condition stated.
- `.lane/reports/lane1-icp-precondition-regression-20260814.md` — this evidence report.
