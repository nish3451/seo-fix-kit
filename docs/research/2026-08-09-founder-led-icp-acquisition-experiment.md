# Founder-Led ICP Acquisition Experiment: JS-Heavy SaaS Founders via `/check`

Created: 2026-08-09 (scout 2026-08-09, backlog item "Run a seven-day founder-led ICP acquisition
experiment for JS-heavy SaaS founders via `/check`")
Status: READY FOR FOUNDER EXECUTION — outreach is founder-owned (never unattended spam), so this
file is the written experiment log and kit. The founder sends the invitations and records every
row; the log is the verification artifact.

Execution kit prepared 2026-08-12 (lane run): preconditions re-verified live (see below), 20
qualified prospect candidates researched with live stack evidence
(`docs/research/icp-experiment-prospect-candidates-2026-08-12.md`), and truthful invitation copy
drafted per channel (`docs/research/icp-experiment-invitation-copy-2026-08-12.txt`). The lane
cannot send invitations — the item's acceptance criteria keep external messaging founder-owned —
so the founder starts with the Day-0 checklist below.

## One change this experiment tests

Whether the product's core wedge — rendered proof with guarded false positives, then proven fixes —
creates activation and revenue for one sharp ICP. Without this bounded test, more surface polish
cannot prove the wedge converts a buyer.

## Hypothesis and ICP

> **ICP:** JavaScript-heavy SaaS founder whose site is prone to static-crawler false positives
> (Next.js/React/SPA-heavy marketing sites) and who wants proven fixes, not audit noise.

- Sites in this ICP routinely get "missing content" findings from static crawlers; a rendered
  browser proof that shows the real DOM, plus evidence-backed findings with guarded false positives,
  is the wedge that should matter to them.
- The experiment also decides whether this stays the ICP worth keeping.

## Preconditions (verified by scout 2026-08-09)

- `/check` and `POST /api/public-check` are live (anonymous one-page URL check, rendered proof,
  guarded false positives, rate-limited, nothing stored, handoff to private access).
- Homepage has a primary "Check one page now" CTA beside the email-access form (merged #71).
- `npm run audit:live-promise` spot-check green on all public surfaces.
- Known limitation: public-check false 522/523 criticals and fabricated snippets are owned by a
  separate open backlog item; if a prospect hits a false critical during this window, log it as an
  objection and do not defend it — it is a known defect with an owner.

Re-verified live 2026-08-12 (before this window starts): `npm run audit:live-promise` green on all
16 checks against the deployed site (including `/check`, `POST /api/public-check`, `/demo`,
`/methodology`, `/packages`, `/llms.txt`, `/sitemap.xml`, www→apex 301s); homepage bundle serves
the `a.check-entry-cta` "Check one page now" link to `/check`. Both preconditions hold today.

Re-verified 2026-08-14 (lane-1 run, evidence in `.lane/reports/lane1-icp-precondition-regression-20260814.md`):
**preconditions are NOT green today — do not start the seven-day window yet.** `npm run
audit:live-promise` fails on 9 of 16 surfaces against the deployed site: `/check` no longer
carries the truthful no-storage disclosure ("No report or URL is stored; only short-lived
anonymous rate-limit counters" is absent), `/demo` `/methodology` `/packages` lost their
footer terms/privacy links, `/methodology` lost its clickable CTA into `/check`, `/support`
`/terms` `/privacy` lost their cross-links to `/check`, `POST /api/public-check` returns HTTP
422 instead of 400 for a non-http scheme, and `www.seofixkit.com/favicon.svg` serves 200
instead of the promised 301 onto the apex host. Root cause is outside the repo: the fleet
release deployed a stale Worker + assets bundle on 2026-08-13 22:40 (its own log says
"No updated asset files to upload" while recording `assets/index-Dd3Lei8e.js` as the marker;
the live site serves the older `assets/index-DX7O9nYF.js`). The repo source is correct —
`npm run check` and the offline spot-check lock are green on main — so this is a deploy
machinery regression, not a copy drift. The founder should re-verify (`npm run
audit:live-promise`) after the next successful fleet release that actually swaps the live
Worker, before sending invitation #1. The known-limitation item (false 522/523 criticals,
fabricated snippets) is closed since 2026-08-12 (PR #102 shipped); treat any reappearance as
a fresh objection per the rules below.

Re-verified 2026-08-15 (lane-1 run, evidence in `.lane/reports/lane1-icp-precondition-green-20260815.md`):
**preconditions are GREEN again — the seven-day window may start.** The fleet release that
swapped the live Worker to a current bundle landed 2026-08-15 07:40 UTC (`release-state-seo-fix-kit.json`:
sha `ea6ef33`, marker `assets/index-9gz2OE-i.js`, deployment `fb50029a-26d5-4924-b378-d7598012bae4`),
and `npm run audit:live-promise` is 20/20 green against the deployed site. Every surface that
failed on 2026-08-14 now serves the current copy: `/check` carries the truthful no-storage
disclosure again, `/demo` `/methodology` `/packages` have their footer terms/privacy links,
`/methodology` has its clickable CTA into `/check`, `/support` `/terms` `/privacy` cross-link
to `/check` again, `POST /api/public-check` returns 400 for a non-http scheme, and
`www.seofixkit.com/favicon.svg` 301s onto the apex host; the live homepage serves
`assets/index-9gz2OE-i.js` matching the recorded release marker. The 2026-08-14 root cause
(stale Worker + assets bundle) is resolved. The founder starts the window by sending
invitation #1 and filling `window_start` below — outreach remains founder-owned.

Re-verified 2026-08-17 (lane-1 run, evidence in `.lane/reports/lane1-icp-precondition-reverify-20260817.md`):
**preconditions remain GREEN — the seven-day window is still open to start.** The fleet release
recorded at 2026-08-17 06:40 UTC (`release-state-seo-fix-kit.json`: sha `36fc4e4`, marker
`assets/index-9gz2OE-i.js`, deployment `26c18c1a-f589-4133-b993-46033fb28c3d`,
version `99abe604-c484-41de-ba8f-3d60e6cfeb06`) is the same bundle marker that 2026-08-15
declared current; the live homepage serves `assets/index-9gz2OE-i.js` matching the recorded
release marker, so the no-bundle-drift invariant from 2026-08-14's root cause still holds.
`npm run audit:live-promise` against `https://seofixkit.com` is **20/20 green** (16 public
surfaces + 4 www→apex redirect surfaces); the offline spot-check lock (`npm run
test:live-promise-spot-check`) is 18/18 green on current main. Direct curl confirmation of
every surface that failed the 2026-08-14 check:

| Surface (2026-08-14 failure) | 2026-08-17 live result |
|---|---|
| `/check` no-storage disclosure | "No report or URL is stored: only short-lived anonymous rate-limit counters …" present (3 occurrences) |
| `/demo` footer terms/privacy | `https://seofixkit.com/terms` + `/privacy` links present (2) |
| `/methodology` CTA into `/check` | `/check` link present (3) |
| `/methodology` footer terms/privacy | present |
| `/packages` footer terms/privacy | present (2) |
| `/support` link to `/check` | present |
| `/terms` link to `/check` | present |
| `/privacy` links | present (6) |
| `POST /api/public-check` ftp:// | returns HTTP 400 |
| `www.seofixkit.com/favicon.svg` | 301 → `https://seofixkit.com/favicon.svg` |
| Homepage bundle marker | `assets/index-9gz2OE-i.js` matches |

Outreach remains founder-owned (per the experiment's acceptance criteria the founder sends
invitations and records rows); no invitations were sent by this run. `window_start` stays
unfilled in the experiment log until the founder sends invitation #1. The resume path from
the 2026-08-15 GREEN entry still applies: send invitation #1, then fill `window_start` and
prospect-log row 1.

## Numeric gates (seven-day window)

Window starts on the day the first invitation is sent. Record `window_start` and `window_end`
(dates) below.

| Gate | Threshold | Target by | Count | Met? |
|---|---|---|---|---|
| G1 `/check` visits from invited prospects | >= 10 | window_end | 0 | |
| G2 Completed checks (invited prospect runs own URL) | >= 3 | window_end | 0 | |
| G3 Private-access requests (because of the check) | >= 1 | window_end | 0 | |
| G4 Eligible Fix Pack conversation or purchase | >= 1 | window_end | 0 | |

`window_start:` `window_end:` (fill in)

## Channel plan (permission-safe, founder-sent)

Source: scout last30days + web sweep 2026-08-09 18:46 IST named these as live places where founders
post or accept free URL audits — use as venue candidates, **never as unattended promotion**:

1. **Direct 1:1 invitations** (primary): founder-to-founder email/LinkedIn DM/Reddit DM to founders
   of JS-heavy SaaS products the founder already knows or can contact with a real, non-sales reason.
   The invitation must be personal, specific to their site, and offer the anonymous `/check` run.
2. **r/SEO, r/micro_saas, r/SaaSMarketing** (secondary): only where a founder has publicly asked for
   an audit or accepted tool suggestions; reply with a check of their URL and the personal
   invitation. No posting of the tool itself as promotion; no upvote solicitation.
3. **Warm communities** (optional): existing founder groups/Discords where the founder has standing
   and where an explicit ask for an audit is present.

Rule: 20 invitations total max. Every invitation must be permission-safe (a person who can opt out,
an existing relationship or public ask, no scraping of private contacts, no mass DMs).

## Day 0 — founder start checklist (prepared 2026-08-12)

The kit is ready; the window starts the day the first invitation is sent. Steps:

1. Open `docs/research/icp-experiment-prospect-candidates-2026-08-12.md`; pick the first 5–10
   candidates where a real relationship or a public ask exists (the "Known to founder?" column).
2. Personalize one template from `docs/research/icp-experiment-invitation-copy-2026-08-12.txt`
   per prospect — email, LinkedIn DM, or Reddit reply (Reddit only inside a thread where a
   founder publicly asked for an audit).
3. Send invitation #1, then fill `window_start` (below) and prospect-log row 1 (channel, invited
   date).
4. Daily during the window: update "Counts vs gates" (G1–G4), prospect-log rows, and the Day-N
   channel note. Log objections verbatim.
5. At window_end: fill the ICP keep/kill decision, then commit this log (docs-only PR) so the
   loop can verify the four gates.

## Invitation copy rules (truthfulness)

- Invite them to run **their own public URL** through the anonymous `/check` — no account, no email,
  nothing stored, one page.
- State the proof boundary truthfully: rendered DOM proof, findings only when present, guarded false
  positives, rate limits.
- No unsupported ranking claims. No AI-citation/monitoring claims (live answer-engine sampling and
  citation monitoring are not live; `/llms.txt` is a file on the site, not a monitored signal).
- If they ask about private access or Fix Pack: private access is invite/email-link gated; Fix Pack
  is the $99.00 one-time package with Dodo checkout, final at payment time, offered when real fixes
  exist.

## Prospect log (20 rows)

Record every invitation: channel, whether they visited `/check`, whether they completed a check of
their own URL, whether they requested private access, whether a Fix Pack conversation or purchase
happened, their objection (if any), and the outcome.

| # | Prospect / site | Channel | Invited (date) | G1 /check visit | G2 completed check | G3 private-access request | G4 Fix Pack conv/purchase | Objection | Outcome |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
| 4 | | | | | | | | | |
| 5 | | | | | | | | | |
| 6 | | | | | | | | | |
| 7 | | | | | | | | | |
| 8 | | | | | | | | | |
| 9 | | | | | | | | | |
| 10 | | | | | | | | | |
| 11 | | | | | | | | | |
| 12 | | | | | | | | | |
| 13 | | | | | | | | | |
| 14 | | | | | | | | | |
| 15 | | | | | | | | | |
| 16 | | | | | | | | | |
| 17 | | | | | | | | | |
| 18 | | | | | | | | | |
| 19 | | | | | | | | | |
| 20 | | | | | | | | | |

Counts vs gates (update daily): G1 / G2 / G3 / G4.

## Channel notes (fill in per day)

- Day 1:
- Day 2:
- Day 3:
- Day 4:
- Day 5:
- Day 6:
- Day 7:

## Reconciliation

- G1–G4 counts above must reconcile with the prospect log rows (first-party or manual counts are
  acceptable; the funnel instrumentation item separately owns automated events).
- If a prospect is known only by site (no name), the site URL is the row key.

## ICP keep/kill decision (fill in at window_end)

- **Keep** if: at least one prospect completes a check of their own URL AND requests private access
  or discusses a Fix Pack because of the proof — with G1–G4 thresholds met or a named near-miss that
  points to a fixable message problem.
- **Kill** if: invitations get no engagement or objections show the wedge does not matter to
  JS-heavy SaaS founders ("I already use X", "scores are noise", "I do not care about crawler
  false positives") — then the ICP needs sharpening or the wedge needs proving elsewhere.
- Decision (keep/kill + one-line reason):
- What changed in the ICP definition (if anything):

## Rollback

Stop outreach at any time; leave product surfaces unchanged; retain this log. The log is the
durable record either way.

## Ownership

- Outreach (20 invitations): founder-sent, personally, permission-safe.
- This log: maintained in this repo under `docs/research/`; the loop reads it as the written
  experiment log with the four numeric gates, channel notes, and the ICP keep/kill decision.
