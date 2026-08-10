# SEO Fix Kit — truthful discovery listings on high-intent software venues

Packet for the lane-1 item: **Establish truthful discovery listings on high-intent
software venues** (backlog owner:
`/home/nish/workspaces/agent-state/seo-fix-kit-improvement-loop/backlog.md`,
[research 2026-08-08, rank: 3, risk: green]).

Status: **prepared. Agent-execution is blocked by venue policy on every venue in
the set** — the fleet `venue-claim` allowlist is empty, every venue here resolves
to `unknown`, `reviewed (unknown)`, or `prohibited`, so the venue-claim contract
permits zero unattended account creation or browser submission work. Per that
contract and the item's own acceptance criteria, every listing is the account
owner's manual step; paid placements stay NEEDS-NISH. The agent-completable half
is done here: live-verified absence on every venue, official policy/submission
evidence collected with receipts, exact approved copy finalized
(`docs/growth/discovery-venues-copy-2026-08-10.txt`), machine gate receipts
captured, and the exact resume path per venue documented.

Re-verified 2026-08-11 (lane-1 packet run): `venue-policy.json` allowlist still
EMPTY (updated 2026-08-08) and `venues.json` still has zero active claims, so
the block stands unchanged. Live absence re-confirmed for the pending venues
folded in from the backlog still-seen note (2026-08-10 15:30 IST): GeoIndex
(geodes.ai) 80-vendor directory fetched live — no SEO Fix Kit entry; Primary
Position GEO list fetched live — no SEO Fix Kit entry. Direct probes: SaaSHub
`/seo-fix-kit` HTTP 404; SaaS Hive `/seo-fix-kit` soft-404 (returns generic
homepage, zero `seofixkit` string). AlternativeTo and Product Hunt return HTTP
403 to plain curl (bot-walled; prior Camoufox receipts from 2026-08-10 stand).
Fleet-infra note: `/home/nish/.local/bin/venue-claim` was NOT present on this
box on 2026-08-11 (its contract test suite errors with FileNotFoundError), so
fresh `venue-claim check` gate receipts could not be produced here; the
authoritative JSON policy/ledger files above were read directly instead.

Canonical copy inputs (everything in the copy file traces to the live site,
`https://seofixkit.com/llms.txt`, or `https://seofixkit.com/packages`; see
"Canonical copy inputs" below).

---

## Venue set and receipts

Gate receipts (`venue-claim check <venue> seo-fix-kit`, run 2026-08-10):
every venue returned `exit=0` (no active claim record). `venue-claim claim`
is blocked for all of them (allowlist empty; disposition unknown/prohibited)
and would exit 4, so **no browser submission was attempted anywhere** — see
`/home/nish/.local/bin/venue-claim --help` and
`/home/nish/workspaces/agent-state/growth-loop/venue-claim.md` for the contract.

| # | Venue | Absence receipt (live, 2026-08-10) | Official submission route / policy evidence | Automation disposition | Owner action |
| --- | --- | --- | --- | --- | --- |
| 1 | AlternativeTo | On-platform search `seo fix kit` → "Sorry, no apps was found" (Camoufox); `site:alternativeto.net seofixkit` → no results (DuckDuckGo) | FAQ re-verified live: "Suggest new application" via User icon → "You need to verify your email address before you can submit a new app"; submissions go into a review backlog (https://alternativeto.net/faq/) | reviewed (unknown) → manual-only | Manual signup + "Suggest new application" with copy file; keep submission/review status as receipt |
| 2 | SaaSHub | On-platform search `seo fix kit` → fuzzy keyword matches only (B2B SEO Kit, Fast SEO Fix, …), no SEO Fix Kit product, zero `seofixkit` string in results (HTTP 200 fetch); `site:saashub.com seofixkit` → no results | Official submit page re-verified live: "Our free tool that helps you to promote your product." plus a free Submit flow (https://saashub.com/submit) | unknown (not reviewed) → manual-only | Manual submit at saashub.com/submit with copy file; record listing URL + indexed title/description |
| 3 | Product Hunt | `https://www.producthunt.com/products/seo-fix-kit` → HTTP 404 "We seem to have lost this page" (Camoufox); `site:producthunt.com seofixkit` → no results | Terms of Service prohibit crawling/scraping; no unattended automation permitted (https://www.producthunt.com/legal, reviewed 2026-08-08, recorded in `agent-state/growth-loop/venue-policy.json`); live fetch bot-walled 403 this run | reviewed (prohibited) | Manual only; a real launch is a founder decision (NEEDS-NISH if promoted), never automated |
| 4 | G2 | On-platform search `seo fix kit` → 5271 fuzzy keyword hits, no SEO Fix Kit product, zero `seofixkit` string (Camoufox); `site:g2.com seofixkit` → no results | `https://www.g2.com/products/new` → redirects to `https://www.g2.com/authorize` with "You must be validated through LinkedIn or business email to access this page." (Camoufox, live) | reviewed (unknown) → manual-only | Manual vendor profile claim (business email / LinkedIn validation) with copy file |
| 5 | Capterra | On-platform search `SEO Fix Kit` → only "Fast SEO Fix" (an automated blog-posting tool, unrelated); zero `seofixkit` string (Camoufox); `site:capterra.com seofixkit` → no results | Official footer vendor path: "For Vendors" → https://www.capterra.com/vendors/, vendor login at https://app.g2digitalmarkets.com/login (G2 Digital Markets family; `/vendors/` Cloudflare-challenge-walled for curl and headless this run) | reviewed (unknown) → manual-only | Manual vendor profile via G2 Digital Markets account with copy file |
| 6 | GetApp | `site:getapp.com seofixkit` → no results; only Fast SEO Fix (unrelated) surfaces for the query (DuckDuckGo via Camoufox); site search UI is Cloudflare-gated | Official footer: "Get listed" → https://www.g2digitalmarkets.com/, "Your account" → https://app.g2digitalmarkets.com/login (same G2 Digital Markets family as Capterra) | unknown (not reviewed) → manual-only | Manual vendor profile via G2 Digital Markets account with copy file |
| 7 | SaaSHub-alternative venue: StartupSubmit | n/a — this is a paid directory-submission *service*, not a listing venue with product pages | Official homepage (HTTP 200, live): "100% manual directory submission service … 220+ high-authority startup directories … from $99"; plans $99 (60+), $199 (150+), $299 (220+) | paid | **NEEDS-NISH** — the backlog acceptance says paid placements remain NEEDS-NISH |
| 8 | Crunchbase | `site:crunchbase.com seofixkit` → no results; only Fast SEO Fix (unrelated) (DuckDuckGo via Camoufox) | Free organization profile via account; not re-verified live this run (login-walled) | unknown (not reviewed) → manual-only | Optional manual free profile; low priority (database entry, not buyer-intent listing) |
| 9 | SourceForge | `site:sourceforge.net seofixkit` → no results (DuckDuckGo via Camoufox) | SourceForge hosts open-source software; SEO Fix Kit is a proprietary SaaS (repo is public, product is not open source) | unknown → **not applicable / low fit** | Skip unless the repo becomes an open-source project; do not file a misleading listing |
| 10 | StackShare | `site:stackshare.io seofixkit` → no results (DuckDuckGo via Camoufox) | Dev-stack oriented directory; tool pages added via account (not re-verified live this run) | unknown (not reviewed) → manual-only | Optional manual add; low fit (developer stacks, not SEO tool buyers) |
| 11 | Trustpilot | `site:trustpilot.com seofixkit` → no results; only smallseokit.com (unrelated) (DuckDuckGo via Camoufox) | Review platform, not a discovery listing; business profile claim requires a verified business account | unknown (not reviewed) → manual-only | Optional; claim only when there are real customer reviews to anchor (no fake reviews, ever) |
| 12 | SaaS Hive | `site:saashive.com seofixkit` → no results; only FreeViralKit (unrelated) (DuckDuckGo via Camoufox) | Official "Launch Your Product" → https://saashive.com/launch-product redirects to https://saashive.com/join-as-founder ("Become a Founder on SaaS Hive"); site JSON-LD says "Free to browse. Founders can list products on free or paid plans." Permanent structured product pages (live, 2026-08-10) | unknown (not reviewed) → manual-only | Manual founder signup + product launch with copy file |
| 13 | GitHub `Suganthan-Mohanadasan/awesome-seo-tools` | Official README (fetched live, 2026-08-10): no `seofixkit` / `SEO Fix Kit` entry; has "Technical SEO and Site Auditing", "LLM Visibility Tracking", "AI SEO Tools" categories | Official README contribution policy: fork + pull request; "Only submit tools with a proven track record, real users, and decent reviews"; rejects self-promotional submissions without genuine utility (re-verified in fleet packet `growth-loop/packets/seo-fix-kit/awesome-seo-tools-manual-listing-20260809.md`, checked 2026-08-09) | manual-only (PR workflow) | Owner-authored fork + PR **only** with proven-track-record evidence; no unattended account/fork/PR activity |
| 14 | GitHub `best-of-ai/awesome-ai-seo` | Official README (fetched live, 2026-08-10): no `seofixkit` / `SEO Fix Kit` entry | PR-based curated list; same manual-only contributor workflow | manual-only (PR workflow) | Owner-authored fork + PR **only**; no unattended activity |
| 15 | GeoIndex (Geodes) | 80-vendor GEO/AEO/AI-search directory fetched live 2026-08-11 (`https://www.geodes.ai/geo-aeo-and-ai-search-vendor-directory`): no SEO Fix Kit entry | Official "Add a vendor or request an edit" page (`https://www.geodes.ai/geo-index-listing`, live 2026-08-11) exposes a contact form plus email/WhatsApp ("Reach us directly"); ToS (live, 2026-08-11) grants no unattended-automation permission — submissions are evaluated/accepted/declined at Geodes' sole discretion (§4 "Inquiries and Services") | unknown (not reviewed) → manual-only | Manual vendor submission via the contact form/email with copy file; record listing URL + indexed title/description when accepted |
| 16 | Primary Position GEO tools list | Editorial list fetched live 2026-08-11 (`https://primaryposition.com/blog/geo-visibility-tools/`): no SEO Fix Kit entry | Editorial blog post by an SEO agency (David Quaid, 2026-02-27); no submission route, no "add your tool" path, no vendor form | unknown → **not applicable as a listing venue** (editorial coverage, not a directory) | Optional manual editorial outreach via the site's contact form; treat as buyer-discovery evidence, not a submission target |

Prior fleet packets for this product already cover #1, #2, and #13 in detail and
are incorporated here by reference (do not duplicate submissions):
`agent-state/growth-loop/packets/seo-fix-kit/done/alternativeto-manual-listing-20260808.md`,
`agent-state/growth-loop/packets/seo-fix-kit/done/saashub-manual-listing-20260809.md`,
`agent-state/growth-loop/packets/seo-fix-kit/awesome-seo-tools-manual-listing-20260809.md`.

---

## Canonical copy inputs

Only claims already visible on the product's own surfaces. Source of truth:
`https://seofixkit.com/llms.txt`, `https://seofixkit.com/packages`,
`https://seofixkit.com/demo`, `https://seofixkit.com/methodology` (all live
checked 2026-08-10).

- **What it is:** "SEO Fix Kit is a proof-backed SEO repair tool for sites that
  need clear fixes, not generic audit homework." (homepage/llms.txt). Private
  beta, self-serve SEO audit and paid Fix Pack workflow (llms.txt).
- **Free public entry:** anyone can anonymously check one public page URL at
  `https://seofixkit.com/check` — real-browser rendering, static-vs-rendered
  proof, guarded false positives, actionable findings when present, no account,
  no stored report; per-network and per-site rate limits.
- **Private beta limits:** full multi-page audits, saved reports, repair queue,
  crawl-depth tiers up to 1,000 pages, sitemap inventory up to 50,000 URLs, and
  the large rendered-crawl plans are behind secure email-link access; large
  crawls are staged early access, never sold as completed 50K rendered
  validation.
- **Paid offer (exact):** "one proof-backed repair pass tied to one report, plus
  one rerun after fixes. Current beta price is $99.00 one-time; Dodo checkout
  remains the final price source at payment time." (live /packages). Fix Pack is
  offered only from a report with real fixes; "No ranking or traffic guarantee".
- **Public proof surfaces to link:** `https://seofixkit.com/demo` (public sample
  of the proof loop) and `https://seofixkit.com/methodology` (how proof is
  produced and its limits) — the item's acceptance criteria require these two
  links; `https://seofixkit.com/check` and `/packages` are the conversion
  surfaces.
- **Hard boundaries (never claim):** no ranking, traffic, indexing, revenue, or
  AI-citation guarantees; no live AI-engine sampling or citation monitoring (AI
  Answer Readiness is site-proof only); no auto-publishing, CMS writes, or
  GitHub PR creation by the product; no completed 50,000-page rendered
  validation claim; not a replacement for Ahrefs or Semrush; no proprietary
  backlink discovery or keyword-volume provider.

---

## What an authorized submitter must do

Every venue above is manual-only this run:

1. **Free listing venues (manual, no payment):** AlternativeTo (sign up, verify
   email, "Suggest new application"), SaaSHub (submit form), SaaS Hive (founder
   signup + launch), GeoIndex (contact-form vendor request, no account),
   G2/Capterra/GetApp (vendor profile via G2 Digital Markets with
   business-email validation), Product Hunt (only as a real founder-led
   launch — manual, never automated; PH ToS bars crawling/scraping). Use the
   exact copy in `docs/growth/discovery-venues-copy-2026-08-10.txt`; each listing
   must link to `https://seofixkit.com/demo` and `/methodology`, state
   private-beta limits and the $99.00 one-time beta offer accurately, and carry
   zero unsupported ranking/AI-citation claims.
2. **GitHub awesome-lists (manual PR/issue only, no spam):** only fork + PR with
   proven track-record evidence (real users, decent reviews) once the beta has
   any; never unattended.
3. **Paid placements (NEEDS-NISH):** StartupSubmit ($99–$299) and any paid
   boost/priority options (e.g. AlternativeTo priority review) are the founder's
   paid decision — the item's acceptance criteria keep paid placements
   NEEDS-NISH.
4. **Record receipts:** after each submission, save the venue listing URL, the
   indexed title/description, and any referral-source tag next to this packet
   (see Acceptance/rollback).

## Acceptance and rollback

- **Verify (after each manual submission):** the live listing URL returns a real
  SEO Fix Kit page; indexed title/description match the approved copy; the
  listing links to `https://seofixkit.com/demo` and `/methodology`; private-beta
  limits and the $99.00 one-time offer are stated accurately; referral source
  tagging is present where the venue supports it; zero unsupported
  ranking/AI-citation claims.
- **Rollback:** remove or correct any listing that overstates live capability;
  request removal/correction from the venue via the submitting account; never
  create duplicate profiles. No product code changes are needed for listings.
- Under the recorded dispositions no `venue-claim` claim record can exist
  (`claim` exits 4 on every venue in this set), so the live-page check plus this
  packet is the durable receipt until a venue is allowlisted by an explicit
  policy change.

## Suggested order

1. AlternativeTo (review backlog — submit first, it is the slowest gate).
2. SaaSHub (free submit flow).
3. SaaS Hive (free founder listing; AI-search-oriented, matches GEO positioning).
4. GeoIndex (free "add a vendor" contact form; GEO/AEO directory that matches
   the site-proof AI Answer Readiness positioning; low friction, no account
   signup needed).
5. G2 → Capterra → GetApp vendor profiles (business-email validation; one G2
   Digital Markets account covers all three).
6. GitHub awesome-lists only after real-user evidence exists.
7. Product Hunt only as a planned founder-led launch.
8. Crunchbase / StackShare / Trustpilot: optional, low fit.
9. Primary Position: editorial outreach only (optional, manual contact form).
10. StartupSubmit and any paid boosts: NEEDS-NISH.
