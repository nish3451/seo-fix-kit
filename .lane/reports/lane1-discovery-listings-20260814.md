# Lane 1 report — discovery listings re-verification 2026-08-14

Item: Establish truthful discovery listings on high-intent software venues
(research 2026-08-08, rank 3, risk green).

## Outcome

No listing exists anywhere yet. Every venue remains a manual account-owner
step per the `venue-claim` gate (allowlist empty, `venue-claim` binary absent
from this box). The agent-completable half — live-verified absence, dated
ledger, approved copy, resume path — was re-verified live today and the
ledger entry was appended to
`docs/growth/discovery-venues-2026-08-10.md`.

GeoIndex submission from 2026-08-11 remains pending review (not yet a live
listing). All other venues: `NEEDS_NISH_STEP` or not eligible. Paid
placements stay NEEDS-NISH.

## Live evidence (2026-08-14)

| Probe | Result |
| --- | --- |
| https://saashub.com/seo-fix-kit | HTTP 404 (absent) |
| https://www.directree.io/seo-fix-kit | HTTP 404 (absent) |
| https://saashive.com/seo-fix-kit | HTTP 200, generic homepage, 0 `seofixkit` matches (soft-404) |
| https://www.alternativeto.net/software/seo-fix-kit/ | HTTP 403 (bot-walled; prior Camoufox receipts stand) |
| https://www.producthunt.com/products/seo-fix-kit | HTTP 403 (bot-walled; prior Camoufox receipts stand) |
| GeoIndex 80-vendor directory | 0 `seofixkit`, 0 `SEO Fix Kit` matches (pending review) |
| /home/nish/workspaces/agent-state/growth-loop/packets/seo-fix-kit/ | no new venue packets since 2026-08-13 |
| venues.json | zero active claims |
| seofixkit.com /llms.txt /packages /demo /methodology /check /api/health | all HTTP 200 |
| /packages | still states "$99.00 one-time" Fix Pack, "one proof-backed repair pass", "one rerun" — copy inputs current |

## Change

- `docs/growth/discovery-venues-2026-08-10.md` — appended the 2026-08-14
  re-verification ledger entry (21 lines), matching the established daily
  pattern.

## Not done (correctly)

- No account creation, form submission, or browser automation on any venue:
  the fleet `venue-claim` allowlist is empty and every venue resolves to
  unknown/reviewed/prohibited, so unattended submission is not permitted.
- No paid placements (StartupSubmit, boosts): NEEDS-NISH.
- No GitHub awesome-list PRs: no proven track record yet.

## Resume path for the account owner

The 2026-08-11 execution ledger inside the same doc lists the exact next
step per venue; approved paste-ready copy lives in
`docs/growth/discovery-venues-copy-2026-08-10.txt`.
