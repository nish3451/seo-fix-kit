# CrawlRaven — the direct competitor to the `/ai-answer-readiness` wedge (traffic-ranked prioritization)

Created: 2026-08-22

## Executive Verdict

CrawlRaven (`crawlraven.com`) is the most **direct** current competitor to
SEOFixKit's AI Answer Readiness wedge — closer than Zaatar.ai, which attacks the
proof-repair delivery half. CrawlRaven attacks the readiness half itself:

- **Same category definition.** Its `/ai-search-readiness` page defines the job
  exactly as we do: the technical reasons AI engines cannot reach, render, or
  extract from your pages — "the prerequisite for every GEO tactic."
- **Same boundary discipline.** It states plainly that it does not sample
  prompts and does not track citations, and tells buyers to pair it with a
  tracker (Peec AI, Otterly, Profound). That is verbatim our own
  no-sampling/no-monitoring posture.
- **Same prioritization story — with less friction.** Its headline mechanic is
  readiness faults *ranked by the Search Console and GA4 traffic behind them*,
  connected by one-click OAuth with daily sync and weighted by GA4 sessions and
  engagement. Our equivalent ranks proof-derived faults by imported Search
  Console clicks/impressions (`shared/ai-answer-readiness.js`, `buildTrafficIndex`),
  which requires the owner to bring a CSV.

Our landing page already names CrawlRaven truthfully in a "Compared with
CrawlRaven" section (PR #169, commit `3ec4f4f`). This doc raises CrawlRaven from
a named comparison to a **tracked direct competitor**, records its primary
evidence, and names the gaps on both sides.

## What CrawlRaven is (primary evidence, fetched 2026-08-22)

- **Positioning:** "Every SEO tool tells you what happened. CrawlRaven tells
  you what to do next." It joins four datasets — Google Search Console (one-click
  OAuth, synced daily), GA4 traffic and engagement, imported Ahrefs/Semrush
  keyword CSVs, and a built-in crawl marketed as a 200-point technical audit —
  into "one ranked plan: what to write, what to update, what to fix first."
- **Audience:** agencies and in-house teams first; also founders/solo bloggers.
  Claims 500+ SEO professionals, Product Hunt ★4.5 with 302 upvotes, and a
  MicroLaunch Product-of-the-Day badge. The readiness page separately displays
  "4.8 from 247 reviews."
- **Agent surface:** ships a remote MCP server (`mcp.crawlraven.com/mcp`) —
  OAuth sign-in, read-only, 8 typed tools (performance, queries, pages,
  opportunities, targets, timeline, annotations, workflow-style prompts),
  connectable from Claude, ChatGPT, Codex, and Cursor. Included with every paid
  plan.
- **Pricing:** Free $0 forever (1 website, GSC insights, no credit card). Paid
  tiers are **lifetime one-time licenses sold in batches of 10 with stepping
  prices**: $29/$69/$119 (1/3/10 sites) in the current batch — "2 licenses left"
  — next batch $39/$79/$129. Every paid tier lists MCP access and — notably —
  marks "**Technical SEO audit — coming soon**", even though the homepage leads
  with the 200-point audit. Treat general availability of that audit as
  unconfirmed until it disappears from "coming soon."
- **Builder:** Aditi Chaturvedi ("building CrawlRaven"), LinkedIn company page
  `crawl-raven`.

### The `/ai-search-readiness` wedge page

Headline: **"Your tracker says you are not cited. This tells you why."**
Subhead: it audits "the technical reasons AI engines skip your pages, then
ranks them against your Search Console and GA4 data so you fix the ones that
actually cost you traffic."

- **Framing against trackers:** visibility tools (Peec AI, Otterly, Profound,
  Scrunch, Semrush/Ahrefs add-ons) "read the model's output. None of them reads
  your robots.txt, your rendered HTML, your schema, or your Search Console."
  Its worked example: a tracker says you are uncited; CrawlRaven says the page
  blocks `OAI-SearchBot`, renders its table client-side, and sits at position 8
  organically — "the access is broken."
- **Checks** (run inside the 200-point audit on **every page, not a sample**):
  - AI crawler access in robots.txt checked **per user-agent**, split into
    search crawlers that affect citations (`OAI-SearchBot`, `ChatGPT-User`,
    `Claude-SearchBot`, `Claude-User`, `PerplexityBot`) and training crawlers
    that do not (`GPTBot`, `ClaudeBot`, `Google-Extended`) — with the explicit
    trade that blocking training crawlers costs zero citations.
  - Server-side rendering, because "almost no AI crawler executes JavaScript."
  - Answer-first content structure under each H2.
  - FAQ, Article, and Organization schema validity.
  - First Contentful Paint against AI-crawler timeout behavior.
  - Canonical, noindex, and redirect conflicts that remove a page from retrieval.
  - llms.txt presence — "reported as forward-looking rather than as a ranking
    factor," citing John Mueller that no AI system uses it today.
  - Internal linking depth to priority pages.
- **Traffic ranking as the product:** connect GSC + GA4 (OAuth, daily sync),
  import keyword lists, run the crawl, get one ranked plan — "readiness faults
  are scored by the impressions and revenue sitting behind them, so the page at
  position 8 with a blocked crawler outranks the orphan page with the same
  fault."
- **Boundary:** "CrawlRaven does not sample prompts and does not track whether
  a given model mentions your brand this week… If citation monitoring is what
  you need, pair CrawlRaven with a tracker."
- **Chrome extension:** runs the rendering half in a side panel — raw HTML
  length next to extracted text length, so a JS-only page is visible without a
  crawl.

## How it attacks the `/ai-answer-readiness` wedge

| Dimension | SEOFixKit today | CrawlRaven today |
|---|---|---|
| Category definition | Site-proof readiness from rendered pages, schema, links, sitemap, optional llms.txt | Same job: technical reasons engines cannot reach/render/extract |
| Sampling/citation monitoring | Never (stated everywhere) | Never (stated plainly, pairs with trackers) |
| Rendering evidence | Renders pages in a real browser; judges the final DOM; static-vs-rendered diff guards false positives | Flags client-side rendering as a static-audit fault + FCP timeout heuristic; does not publish a rendered-DOM proof loop |
| AI crawler coverage | Educational framing: GPTBot, ClaudeBot, PerplexityBot, CCBot fetch raw HTML without executing JS | Checks 8 user-agents individually, search vs training split, per-UA robots.txt verdict |
| Traffic-ranked faults | Imported Search Console / rank-tracker rows rank faults by clicks and impressions (`buildTrafficIndex`) | OAuth auto-join of GSC **and** GA4, daily sync, weighted by sessions/engagement/revenue |
| llms.txt stance | Optional signal, never claimed required | Checked and reported as forward-looking, not a fix — same stance |
| Output | Findings + repair queue with severity, effort, proof, acceptance check that can be rerun | Ranked to-do list with recommendations; mark done or dismiss |
| Fix generation | Fix briefs, snippets, implementation packs | None published — it plans, it does not generate repairs |
| Free entry | Anonymous `/check` (no account, nothing stored), `/demo`, `/proof` receipt | Free plan for 1 site, but requires app sign-up |
| Agent surface | Developer API, webhooks, `llms.txt` + `.well-known/skill.md` | Remote read-only MCP server over OAuth |
| Pricing posture | Dodo-priced offers, no ranking guarantees | Lifetime-deal batches with visible scarcity countdown |

**The sharpest risk** is not capability overlap — it is friction asymmetry on
the exact differentiator both sides advertise. "Faults ranked by traffic" is
zero-work on CrawlRaven (OAuth once, synced daily, revenue-weighted) and a
manual export/import on SEOFixKit. An owner asking "why am I not cited and what
do I fix first" gets the traffic-ranked answer out of the box there. Secondary
risk: the per-user-agent robots.txt story (search vs training crawlers, "block
training crawlers for free") is a genuinely sharper narrative than generic
"AI crawlers can't read JavaScript."

## What to copy

- **Per-bot robots.txt literacy.** Wherever we explain AI crawler visibility
  (`/rendered-vs-static-seo-audit` framing), naming the search-vs-training
  crawler split is educational, true, and costs no new product claims.
- **Pair-with-a-tracker narrative.** "A tracker tells you whether the work is
  landing; readiness tells you what to fix when it is not" — we already live
  this boundary; saying it in CrawlRaven's crisp form strengthens our copy.
- **Ranking-language precision.** Describe traffic ranking as clicks *and*
  impressions on the affected pages (we already do); consider surfacing the
  row count in more places, as the brief lines already do.
- **Read-only MCP direction.** Their OAuth'd read-only MCP server validates
  agent-facing surfaces. Our `llms.txt`/`skill.md` cover discovery; an MCP
  endpoint is a candidate for the Developer API roadmap, not a commitment.

## What to beat

- **Rendered-DOM proof.** CrawlRaven infers rendering problems from static
  signals (SSR fault, FCP heuristic, extension side-panel). SEOFixKit renders
  in a real browser and proves findings from the final DOM with a
  static-vs-rendered false-positive guard. Make "proof, not inference" the
  headline difference.
- **Fixes, not homework.** Their output ends at a ranked to-do list. Ours
  continues into fix briefs, snippets, implementation packs, and rerunnable
  acceptance checks with proof receipts. "We rank it AND draft the repair AND
  re-verify" beats "here is a list."
- **No-signup proof.** Anonymous `/check` and the public `/proof` before/after
  receipt need no account; CrawlRaven's free tier gates everything behind app
  sign-up.
- **Honest-capability signaling.** Their pricing page still marks the technical
  audit "coming soon" while the hero sells it. Our methodology page and
  evidence windows are a trust advantage worth keeping loud.

## What to avoid

- **OAuth auto-join scope creep.** Our import-based posture is deliberate
  (no stored Google credentials, no OAuth scopes, owner-controlled data).
  Do not rush a GSC/GA4 connector purely for parity; if it ever happens, it
  must pass the same truth discipline as everything else.
- **Lifetime-deal scarcity theater.** Batch countdowns and "only 2 left" are
  conversion mechanics, not product truth. Our pricing copy stays tied to
  Dodo-priced offers and no-guarantee language.
- **Check-count inflation.** "200-point" is a marketing unit. We count
  proof-derived checks and say what each one proves; do not race to a number.
- **Copy drift onto their claims.** Every statement about CrawlRaven in our
  public copy must remain verifiable against their live pages (the existing
  landing-page section is written this way).

## Recommended moves (in priority order)

1. **Keep the landing-page comparison current.** The "Compared with CrawlRaven"
   section and its FAQ (added in PR #169) are accurate against the pages
   fetched 2026-08-22. Re-verify quarterly or whenever CrawlRaven changes its
   claims.
2. **Close the import-friction gap in the story.** The traffic-ranked wedge is
   credible only if bringing Search Console rows is easy. Treat CSV import UX
   (paste, drag-drop, column mapping) as the highest-leverage product move this
   competitor exposes — no OAuth needed to match their outcome for owners who
   already export.
3. **Upgrade AI-crawler education with the search/training split** on the
   rendered-vs-static and readiness surfaces: name `OAI-SearchBot`,
   `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot` as the
   citation-relevant set versus `GPTBot`/`ClaudeBot`/`Google-Extended` as
   training-only. Grounded, differentiating, zero new claims.
4. **Adopt pair-with-tracker phrasing** in readiness copy so buyers arriving
   from Peec/Otterly/Profound recognize us as the complement, not another
   tracker.
5. **Monitor CrawlRaven monthly:** pricing batch steps, whether the technical
   audit leaves "coming soon," MCP tool growth, and any move into fix
   generation — the last one would collapse their biggest gap against us.

## Bottom line

CrawlRaven is the direct competitor to the `/ai-answer-readiness` wedge: same
job definition, same no-sampling/no-monitoring boundary, and the same
traffic-ranked prioritization story — delivered through automatic GSC+GA4 joins
instead of our imports. It plans but does not repair, infers but does not render
proof, and gates its free tier behind sign-up. SEOFixKit's counters are already
built (rendered-DOM proof, acceptance-checked repairs, anonymous free check);
the exposed gaps are import friction and per-bot robots.txt storytelling. Track
it as the readiness-wedge benchmark alongside Zaatar.ai (delivery-wedge
benchmark, see `docs/research/2026-08-20-zaatar-ai-competitor-benchmark.md`).

## Sources

- CrawlRaven official homepage (fetched 2026-08-22): [crawlraven.com](https://crawlraven.com/)
- CrawlRaven AI Search Readiness page (fetched 2026-08-22): [crawlraven.com/ai-search-readiness](https://crawlraven.com/ai-search-readiness)
- Local repo truth: `worker/routes/pages.js` (`aiAnswerReadinessHtml` — "Compared with CrawlRaven"
  section + FAQ, PR #169 / commit `3ec4f4f`), `shared/ai-answer-readiness.js`
  (`buildAiAnswerReadiness`, `buildTrafficIndex`, traffic-ranked brief lines),
  `shared/audit-engine.js` (`ROOT_PUBLIC_PATHS`)
- Prior benchmarks: `docs/research/2026-08-20-zaatar-ai-competitor-benchmark.md`
  (delivery-wedge competitor), `docs/research/2026-06-18-outrank-seoitis-benchmark.md`
  (broad benchmark)
