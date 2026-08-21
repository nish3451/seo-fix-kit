# Lane 1 report — SEO Tech List manual listing 2026-08-21

Item: List SEO Fix Kit on SEO Tech List (`https://seotechlist.com`) — curated
SEO/AI-search tool directory with a free Community plan.

## Outcome

On-boarded **SEO Tech List** (seotechlist.com) as venue #18 in the discovery
venues ledger (`docs/growth/discovery-venues-2026-08-10.md`) and appended the
paste-ready copy for the venue
(`docs/growth/discovery-venues-copy-2026-08-10.txt`). Per the fleet
`venue-claim` contract and the existing venue-claim allowlist (still EMPTY;
seotechlist.com resolves to "unknown (not reviewed)"), the lane does NOT
perform unattended account creation, browser submission, or payments. The
agent-completable half — live-verified absence, dated ledger, approved copy,
exact resume path — was completed this run. The Community plan is free, so
the listing is founder-only by choice, not by policy. Premium $39 stays
NEEDS_NISH per the backlog acceptance.

## Live evidence (2026-08-21)

| Probe | Result |
| --- | --- |
| https://seotechlist.com/ | HTTP 200 (homepage) |
| https://seotechlist.com/submit-seo-tool | HTTP 200 (free Community plan + Premium $39) |
| https://seotechlist.com/editorial-policy | HTTP 200 (reviewed 26 July 2026; live JSON-LD `dateModified: 2026-07-26`) |
| https://seotechlist.com/tools | HTTP 200 (directory) |
| https://seotechlist.com/categories/ai-visibility | HTTP 200 (category exists) |
| https://seotechlist.com/categories/technical-seo | HTTP 200 (category exists) |
| https://seotechlist.com/products/seo-fix-kit | HTTP 404 (absent — no listing yet) |
| https://seotechlist.com/api/search?q=seofixkit | `{"results":[]}` (no existing entry) |
| `venue-claim` policy | allowlist EMPTY; seotechlist.com resolves to "unknown (not reviewed)" |
| `venue-claim` binary | absent from this box; authoritative JSON policy/ledger read directly |
| venues.json | zero active claims; no listing has been claimed as live anywhere |
| https://seofixkit.com/llms.txt | HTTP 200 (canonical claim inputs verified live) |
| https://seofixkit.com/packages | HTTP 200; "$99.00 one-time" beta Fix Pack still stated |
| https://seofixkit.com/demo | HTTP 200 (proof link) |
| https://seofixkit.com/methodology | HTTP 200 (proof link) |
| https://seofixkit.com/check | HTTP 200 (free anonymous one-page check) |
| https://seofixkit.com/proof | HTTP 404 (deploy chain stall — DO NOT claim /proof is live in the listing copy) |
| Other venues (GeoIndex, SaaSHub, Directree, SaaS Hive, AlternativeTo, Product Hunt) | unchanged from the 2026-08-14 ledger (all absent) |

## Editorial policy highlights (live 2026-08-21)

- "A submission must identify a functioning product or public project, use a
  reachable official destination and have a clear relationship to SEO,
  search, AI visibility, GEO, AEO or search infrastructure." → SEO Fix Kit
  fits (technical SEO + AI visibility positioning).
- "Listings may combine information supplied by makers with public
  first-party sources." → copy must trace only to the canonical claim
  inputs.
- "Automated refreshes may update stars, releases, licence information" —
  this is SEO Tech List's own automation of public repo data, NOT permission
  for us to automate submissions.
- "We do not promise 'link juice', domain-rating increases, search rankings
  or inclusion in AI answers." → the listing copy must not promise any of
  these.
- "A normal product profile includes an editorial link to the official
  website and, where relevant, a separate public repository link." → link
  `https://seofixkit.com` and (optionally) the public repo
  `https://github.com/nish3451/seo-fix-kit`.
- "Premium... does not purchase a different permanent product link." →
  premium is speed/promotion only; the free Community plan is the correct
  pickup for this lane.
- Verification: "Owners may verify control through GitHub repository
  permissions, DNS, a temporary website badge or a work-email review." → one
  of these is the verification route after submission.

## Submission plan

- Free Community plan via the maker form at
  `https://seotechlist.com/submit` (or `?plan=free`); 2–6 week standard
  queue; permanent URL.
- Categories: AI visibility + Technical SEO.
- Proof links: `https://seofixkit.com/demo`, `https://seofixkit.com/methodology`;
  conversion links: `https://seofixkit.com/check`, `https://seofixkit.com/packages`.
- Pricing: free beta audits + $99.00 one-time beta Fix Pack (Dodo checkout
  is authoritative at payment time).
- DO NOT claim `/proof` is live (returns 404 today; deploy chain stall is
  the rank-1 backlog item).

## Change

- `docs/growth/discovery-venues-2026-08-10.md` — appended the 2026-08-21
  re-verification paragraph, a new 2026-08-21 execution ledger row for
  SEO Tech List, venue #18 in the venue set table, and the venue into the
  "What an authorized submitter must do" and "Suggested order" sections.
- `docs/growth/discovery-venues-copy-2026-08-10.txt` — added a full
  per-venue copy block for SEO Tech List (name, tagline, description,
  links, categories, pricing, honesty lines, verification route, manual-only
  note).
- `MEMORY.md` — added a one-line durable note that SEO Tech List is the
  18th on-boarded venue and stays manual-only.

Other documents (e.g. `README.md`, marketing copy, product source) were
NOT touched; this item is a venue on-boarding, not a product change.

## Not done (correctly)

- No account creation, browser submission, or payment on SEO Tech List:
  the fleet `venue-claim` allowlist is empty and seotechlist.com resolves
  to "unknown (not reviewed)", so unattended submission is not permitted
  by the venue-claim contract. The free Community plan is manual-only by the
  account owner; premium $39 stays NEEDS_NISH.
- No product code changes; no live code path changes; no pricing changes.
- No `venues.json` claim record was created (the contract returns exit 4
  for any venue with the current empty allowlist).

## Resume path for the account owner

1. Sign in at `https://seotechlist.com/owner/login` (or start fresh at
   `https://seotechlist.com/submit?plan=free`).
2. Use the SEO Tech List block in
   `docs/growth/discovery-venues-copy-2026-08-10.txt` verbatim for name,
   tagline, description, links, categories, pricing, and honesty lines.
3. Submit under the Community plan (free, no payment details).
4. After publication, verify ownership via GitHub repo permissions
   (nish3451/seo-fix-kit), DNS, a temporary website badge, or work-email
   review — pick the easiest one.
5. Record the listing URL, indexed title/description, and verification route
   in this report's successor entry; update the venues.md ledger to flip
   the row from "NEEDS_NISH_STEP" to "LIVE".

## Claim publications

Lane record `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json`
`claims` field updated to the four relative paths edited this run:
`docs/growth/discovery-venues-2026-08-10.md`,
`docs/growth/discovery-venues-copy-2026-08-10.txt`,
`.lane/reports/lane1-seotechlist-listing-20260821.md`,
`MEMORY.md`. No other field of the lane record was touched.
