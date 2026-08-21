# Lane 1 report — outreach geo listicles batch 2 (2026-08-22)

Packet item `c499fa990c`: Reach out to five new Aug 2026 "best GEO/AI SEO
audit tools" listicles where SEO Fix Kit is absent (second batch).
Branch: `lane1/outreach-geo-listicles-b2-20260822` (from origin/main
82c89ac). Docs-only change: no product code, no pricing, no migration.

## What this run did

- Loaded batch-1 artifacts (`docs/growth/ai-seo-tools-listicle-outreach-2026-08-20.{md,txt}`)
  so this batch's five venues are NEW and distinct from Unite.AI, OneLittleWeb,
  That Marketing Buddy, and The Rank Masters.
- Researched 2026 "best GEO / AI SEO audit tools" listicles and verified five
  live (HTTP 200 on 2026-08-22):
  1. Citeme — "17 best AI visibility tools in 2026" — edited 2026-08-18.
     Route: contact@citeme.fr (published on /contact, 24h human reply).
  2. Superlines — "Best GEO tools in 2026" — updated 2026-08-10.
     Route: contact-us form + founder Jere Meriluoto (LinkedIn, on-page).
  3. Ryze (get-ryze.ai) — "9 Best AI SEO Audit Tools for 2026" — 2026-06-03.
     Route: hello@get-ryze.ai (site footer).
  4. Writesonic — "Best GEO Tools 2026" — 2026-05-23.
     Route: writesonic.com/contact (timed out once during prep; retry) +
     author LinkedIn.
  5. Dageno — "20 Best GEO Tools for 2026" — updated 2026-04-20.
     Route: co-founder Tim (LinkedIn /in/tim-geo/, X @tim_geo_seo, on-page).
- Absence evidence for each venue (2026-08-22):
  - Full tool list read from the live page — SEO Fix Kit not on any list
    (Citeme 17 tools, Superlines 8, Ryze 9, Writesonic 10, Dageno 20).
  - Site-scoped search `site:<domain> seofixkit` → zero SEO Fix Kit results
    on all five domains.
  - No prior outreach to any of the five in repo history (batch-1 ledger,
    discovery-venues ledger, repo search). No duplicate outreach.
- Re-verified canonical product facts live (seofixkit.com/llms.txt,
  /packages) so the prepared copy carries only traceable claims, keeps the
  $99.00 Fix Pack wording, the one-page /check boundary, and the honesty
  lines (no ranking/traffic/citation guarantees, no live AI-engine sampling,
  not a Semrush/Ahrefs replacement).

## Artifacts

- `docs/growth/ai-seo-tools-listicle-outreach-2026-08-22.md` — research
  ledger + execution kit (venue table, absence evidence, canonical copy
  inputs, next steps, suggested order, empty replies ledger).
- `docs/growth/ai-seo-tools-listicle-outreach-copy-2026-08-22.txt` —
  paste-ready copy: master facts, short pitch, five per-venue messages,
  common rules.
- This report (`.lane/reports/lane1-outreach-geo-listicles-b2-20260822.md`).

## Validation

- Docs-only change; nothing sent (founder-owned outreach, same rule as
  batch 1 / discovery venues); no live system touched; no pricing change.
- Every venue claim (title, URL, update date, tool roster, contact route)
  recorded as verified live on 2026-08-22 in the ledger.
- `git status` clean except node_modules symlink (untracked, not committed);
  branch pushed, PR opened (see below).

## Claim publications

Lane record `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json`
`claims` field updated (atomically, temp file + rename) to:
`docs/growth/ai-seo-tools-listicle-outreach-2026-08-22.md`,
`docs/growth/ai-seo-tools-listicle-outreach-copy-2026-08-22.txt`,
`.lane/reports/lane1-outreach-geo-listicles-b2-20260822.md`.
No other field of the lane record was touched; no other control-plane file
was written.

## Outcome

Branch `lane1/outreach-geo-listicles-b2-20260822` pushed to origin, PR
opened: docs-only second-batch outreach preparation.