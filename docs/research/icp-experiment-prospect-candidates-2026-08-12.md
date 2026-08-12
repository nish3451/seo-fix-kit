# ICP Experiment — Prospect Candidate Kit (researched 2026-08-12)

Part of the founder-led seven-day ICP acquisition experiment
(`docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md`). This file is
**research only — nothing here is sent by anyone but the founder.** Every row is a
qualified candidate: a JavaScript-heavy SaaS product whose marketing site is prone to
static-crawler false positives, with a verified public contact route and a
personalization hook. The founder picks, personalizes, and sends at most 20
permission-safe invitations (existing relationship or public ask; no cold scraping, no
mass DMs), then records each row in the experiment log.

All stack evidence below was re-probed live on **2026-08-12** (homepage HTML fetched
directly; markers are literal strings found in the served markup). Contact routes were
HTTP-checked live the same day (`200` = path served).

## Verified-live stack evidence, per candidate

Marker meaning: `/_next/` + `__NEXT_DATA__` = Next.js (SSR + hydration); `react-dom` /
`createRoot` = client-rendered React; `framerusercontent` / `framer.com/edit` = Framer
(client-rendered React runtime — sites render most content only after JS executes);
`_astro` = Astro; `vite` = Vite bundle.

| # | Site | Live stack evidence (2026-08-12) | Verdict |
|---|---|---|---|
| 1 | https://dub.co | `/_next/` chunked JS (webpack + `dpl=` params) | Next.js, JS-heavy |
| 2 | https://linear.app | `/_next/` + `react-dom` + `createRoot` in shell | Next.js + client render |
| 3 | https://retool.com | `/_next/` + `vite` | Next.js, JS-heavy |
| 4 | https://beehiiv.com | `/_next/` chunked JS | Next.js, JS-heavy |
| 5 | https://langfuse.com | `/_next/` chunked JS | Next.js, JS-heavy |
| 6 | https://loops.so | `framerusercontent.com/...rolldown-runtime` + `framer.com/edit` | Framer (client-rendered) |
| 7 | https://cal.com | Framer runtime (`framer.com/edit/beta/init.mjs`) + `dubcdn.com/analytics` | Framer (client-rendered) |
| 8 | https://resend.com | `/_next/` chunked JS | Next.js, JS-heavy |
| 9 | https://plane.so | `/_next/` + `vite` | Next.js, JS-heavy |
| 10 | https://formbricks.com | `__NEXT_DATA__` + `/_next/` | Next.js, JS-heavy |
| 11 | https://novu.co | `/_next/` chunked JS | Next.js, JS-heavy |
| 12 | https://paddle.com | `/_next/` chunked JS | Next.js, JS-heavy |
| 13 | https://buttondown.com | `/_next/` chunked JS | Next.js, JS-heavy |
| 14 | https://mem0.ai | Framer runtime (`framerusercontent.com/...rolldown-runtime`) | Framer (client-rendered) |
| 15 | https://docsbot.ai | `__NEXT_DATA__` + `/_next/` | Next.js, JS-heavy |
| 16 | https://vapi.ai | `/_next/` chunked JS | Next.js, JS-heavy |
| 17 | https://helicone.ai | `/_next/` chunked JS | Next.js, JS-heavy |
| 18 | https://highlight.io | `__NEXT_DATA__` + `/_next/` | Next.js, JS-heavy |
| 19 | https://super.so | `/_next/` chunked JS | Next.js, JS-heavy |
| 20 | https://posthog.com | `app-*.js` SPA bundle (`/app-7dc7...js`) + Astro partial | Vite SPA, JS-heavy |

## The 20 candidate rows

For each row: **founder** is named only where verified on a live public page today
(see "verified" marks); otherwise it says "verify on site" — never guess a name or
email. **Channel** is the permission-safe route. **Hook** is the personalization the
founder can build on. The final "Known to founder?" column is for the founder to fill
(existing relationship beats everything — the experiment's primary channel is founders
the founder already knows).

| # | Prospect / site | Founder (verified 2026-08-12) | Channel (verified live) | Personalization hook | Known to founder? |
|---|---|---|---|---|---|
| 1 | dub.co | Steven Tey (live JSON-LD "founder") | /contact (200) or public X | Open-source link-attribution product; Next.js marketing site; founder is publicly active | |
| 2 | linear.app | Karri Saarinen, Co-founder & CEO (live /about) | /contact (200) or LinkedIn | Developer-first product; client-rendered Next.js shell is a classic static-crawler false-positive case | |
| 3 | retool.com | David Hsu, CEO (live page) | /about (200) → team/contact | Internal-tools SaaS, JS-heavy site; large doc surface | |
| 4 | beehiiv.com | Tyler Denk, founder & CEO (live JSON-LD) | /about (200) | Newsletter platform; Next.js site with big content surface | |
| 5 | langfuse.com | Marc Klingen, Co-Founder & CEO (live team table, X handle on page) | /about (200) → team table | LLM-observability OSS; founder posts publicly; Next.js site | |
| 6 | loops.so | Chris, one of two founders (live copy on /about) | /about (200) → contact | Email-marketing SaaS; Framer site (client-rendered — strong false-positive candidate); YC-backed | |
| 7 | cal.com | Peer Richelsen (publicly active; verify on site before send) | /contact (200) | Scheduling SaaS, huge open-source audience; marketing site moved to Framer — static crawlers see little | |
| 8 | resend.com | Zeno Rocha (publicly active; verify) | /contact (200) | Dev-email SaaS; Next.js site; founder very public (books, talks) | |
| 9 | plane.so | Vamsi Kurama (verify on site) | /contact (200) | Open-source project management; Next.js marketing site | |
| 10 | formbricks.com | Founders named on site (verify) | /about (200) → contact | Open-source experience-data SaaS; `__NEXT_DATA__` site; founder posts in OSS/indie circles | |
| 11 | novu.co | Tomer Barnea (verify) | /contact-us (200) | Open-source notification infra; Next.js site; founder active on X/LinkedIn | |
| 12 | paddle.com | Christian Owens (verify) | /contact (200) | SaaS payments; Next.js marketing site; large content surface | |
| 13 | buttondown.com | Justin Duke (verify) | /contact (200) | Indie newsletter SaaS; Next.js site; founder writes publicly about indie SaaS | |
| 14 | mem0.ai | Tushar Agarwal (verify) | /about-us (200) → contact | AI-memory OSS with fast-growing audience; Framer site (client-rendered) | |
| 15 | docsbot.ai | Verify on site | /docs (200); site contact in footer | AI-docs SaaS; `__NEXT_DATA__` site | |
| 16 | vapi.ai | Verify on site | /support (200) | Voice-AI API, fast-growing; Next.js site | |
| 17 | helicone.ai | Verify on site | /contact (200) | LLM-gateway OSS; Next.js site; open-source community | |
| 18 | highlight.io | Verify on site | /docs (200); site contact | Open-source monitoring; `__NEXT_DATA__` site | |
| 19 | super.so | Verify on site | Site footer contact (no /contact path) | Notion-website builder; Next.js site | |
| 20 | posthog.com | James Hawkins (publicly active; verify) | Site contact (docs/site) | Dev-analytics SaaS; Vite SPA marketing site; founders famously public | |

## Community-channel watchlist (secondary, permission-safe only)

The scout (2026-08-09 18:46 IST) named these as live places where founders post or
accept free URL audits. Use them **only where a founder has publicly asked for an audit
or accepted tool suggestions**; reply with a check of their URL and the personal
invitation. Never post the tool itself as promotion; never solicit upvotes.

| Venue | How to use (founder does this personally) |
|---|---|
| r/SEO | Search: `audit my site`, `site audit feedback`, `check my website`, `review my site` — reply to founders' public asks with a run of their URL through /check and the personal invitation |
| r/micro_saas | Same search pattern (`site`, `landing page`, `seo`). Micropreneur founders; strongest ICP overlap |
| r/SaaSMarketing | Same pattern; look for audit/feedback requests about marketing sites |
| Warm founder groups/Discords | Only where the founder has standing and an explicit audit ask exists |

## Rules that bind every row (from the experiment doc)

- 20 invitations total max. Every invitation must be permission-safe: existing
  relationship, public ask, or a real non-sales reason. No scraping of private
  contacts, no mass DMs.
- If a prospect hits the known public-check false 522/523 critical or fabricated
  snippet during the window: **log it as an objection, do not defend it** — it is a
  known defect with a separate owner.
- No unsupported ranking claims. No AI-citation/monitoring claims.
- Private access is invite/email-link gated; Fix Pack is $99.00 one-time, Dodo checkout
  final at payment time, offered only when real fixes exist.
- Objections are data: record verbatim in the prospect log; they feed the keep/kill
  decision.
