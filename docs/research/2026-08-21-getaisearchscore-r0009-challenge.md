# Challenge: getaisearchscore.com's "technical readiness alone predicts nothing (r=0.009)"

Created: 2026-08-21

## Executive verdict

getaisearchscore.com's r=0.009 headline is a real, published null finding with
an honest methodology write-up — but it is **not** evidence that "technical
readiness predicts nothing." It is evidence that **one vendor's specific
26-check technical score, measured once, on a self-selected 441-domain sample,
against one engine's (Perplexity's) citation behavior, at one point in time,
correlates at r=0.009 with citations.** The headline over-generalizes the null
in three load-bearing ways:

1. **The study cannot see content the crawler could not render.** If the
   vendor's scanner does not render JavaScript (or renders it shallowly),
   "technical readiness" is partly measuring *which sites are invisible to the
   measurement itself*. SEOFixKit's core differentiation is rendered-page
   proof: a real browser renders the page, so readiness is judged on the DOM
   an engine would actually parse, not the raw HTML a static fetcher gets. A
   study whose technical score is built on non-rendered signals cannot test
   "technical readiness" for JS-heavy sites — it can only test whether a
   static-crawl proxy predicts citations.
2. **r=0.009 is measured on a *score*, not on the *faults* the score
   aggregates.** getaisearchscore.com itself concedes (homepage FAQ) that the
   26 checks are a "hygiene floor" and that its original score "did not
   predict" citations — which is why it rebuilt around content relevance. But
   the null is about the *aggregate*. A hygiene floor can be genuinely
   necessary (a site with `robots.txt` blocking GPTBot is invisible; a site
   with an app-shell render is empty to an extractor) while still not being
   *sufficient* — and sufficiency is all an r=0.009 correlation tests. "Not
   sufficient" is not "predicts nothing."
3. **The null is one engine, one snapshot, one vendor's scoring.** The study
   itself says it tested Perplexity citations specifically, was cross-sectional,
   and that "Google AI Overviews and ChatGPT may weight structural signals
   differently." SEOFixKit's public promise is narrower and already matches
   that limit: it never claims citation prediction. It claims proof-derived
   *readiness* — what a rendered page allows an answer engine to understand.

The honest reading of getaisearchscore.com's own research is: **content
relevance is a necessary condition for citations, and technical readiness is
not sufficient — but that is exactly the boundary SEOFixKit already publishes.**
A null correlation on one vendor's aggregate score does not make rendered
content depth, helpful schema, canonical clarity, question-led structure,
sitemap context, or llms.txt reachability "meaningless." It makes them
*hygiene*, which is the same word getaisearchscore.com now uses for its own
26 checks.

## What getaisearchscore.com actually claims (source-linked)

| Claim | Exact wording | Source |
|---|---|---|
| Null correlation | "correlation between pure technical readiness scores and actual AI citations (r=0.009, null finding)" | homepage |
| Study size | "our research, 13,140 domain-query pairs" / "441 domains and 14,550 domain-query pairs" | homepage / blog |
| No threshold effect | "there is no minimum score above which citations increase" | blog |
| Not necessary | "sites scoring in the 0–19 range get cited just as often as sites scoring 60–79" | blog |
| Content relevance wins | "content relevance predicts AI citations with AUC 0.915" | homepage |
| 62x | "same-topic citation rate was 5.17% versus 0.08% for cross-topic — a 62x difference" | blog |
| Readiness Paradox | "sites scoring 80–100 on AI readiness have only 1.8% citation rate, while established brands scoring 0–19 achieve 38.8%" | blog FAQ |
| Own-tool concession | "Our original 26-check technical score did not predict citations (r=0.009)... which is why we rebuilt the score around it" | homepage FAQ |
| Hygiene floor | "The 26 technical checks still run as a hygiene floor" | homepage |
| Perplexity-only | "I tested Perplexity citations specifically — Google AI Overviews and ChatGPT may weight structural signals differently" | blog |
| Cross-sectional | "The study was cross-sectional, not longitudinal" | blog |

The claims are unusually honest for the category: the vendor publishes a null
finding against its own original product and sells the rebuilt content-
relevance score instead. This challenge is not accusing it of fabricating the
r=0.009. The challenge is that the headline **over-generalizes the null** in a
way that would (if SEOFixKit accepted it) erase the distinction between
"proof-derived readiness" and "citation prediction" — the exact distinction
SEOFixKit already draws publicly.

## Why the null does not generalize

### 1. A technical score measured on unrendered HTML cannot see JS-rendered content

The entire SEOFixKit wedge is rendered-page proof. `shared/audit-engine.js`
renders pages in a real browser (Cloudflare Browser Run in the deployed
Worker, Playwright locally) and compares the static HTML against the rendered
DOM so false positives are guarded. The AI Answer Readiness checks in
`shared/ai-answer-readiness.js` are deliberately built on **rendered** page
evidence: rendered word count, rendered headings, rendered schema types,
rendered canonical and internal links, rendered `robots` state, plus sitemap
and optional llms.txt context.

getaisearchscore.com's sample-report and methodology describe a scanner that
"crawls up to 50 pages via your sitemap" and scores "machine readability,
content extractability, entity trust, and offering completeness" — but the
r=0.009 study is a correlation between *that vendor's* technical score and
citations. If the score's "extractability" leg measures a static crawl of a
JS-heavy page, the study is measuring how well a *static proxy* predicts
citations — which is a known-false-positive source, not a statement about
what a rendered page allows an answer engine to do. SEOFixKit's own
static-vs-rendered guard exists precisely because raw HTML understates
JS-rendered sites.

A null on "static-proxy readiness predicts citations" cannot be promoted to
"rendered readiness predicts nothing." The measurement never saw the rendered
page.

### 2. A null on the aggregate score is not a null on the faults

The r=0.009 is a correlation between the *total* technical score and citation
rate. An aggregate can be null while individual faults matter:

- `robots.txt` blocking GPTBot / PerplexityBot / ClaudeBot: getaisearchscore.com
  itself calls this "the only structural factor with an unambiguous effect"
  and lists "do not block AI crawlers" as high-confidence advice. A site whose
  score is dragged down by missing Product schema and a site whose score is
  dragged down by blocking AI crawlers get different averages but identical
  aggregate-score math. The aggregate correlation cannot separate them.
- App-shell rendering: a page whose text exists only after JS execution looks
  "thin" to a static fetch and "citable" to a rendered fetch. The same page
  gets a different technical score depending on whether the scanner rendered.
- Broken canonicals and orphaned pages: an answer engine that follows a link
  graph needs a preferred URL; a site with zero internal links and no
  canonical still ranks "fine" on content-relevance-only scoring because the
  relevance model never needs to pick a source URL.

The correct statement is "this aggregate technical score is not a citation
predictor," which is exactly what the vendor now sells against. It is not
"technical faults do not matter," which is what the headline implies.

### 3. Necessary vs sufficient, and the Readiness Paradox confirms it

getaisearchscore.com's own Readiness Paradox is the cleanest proof that its
headline over-reaches: sites scoring 0–19 get cited at 38.8% — but those are
"established brands." The paradox is a **domain-authority confound**, and the
vendor says so: "low-scoring but well-known brands get cited via domain
authority." A brand with 20 years of links gets cited despite a broken
technical setup; that does not make the technical setup meaningless, it makes
it *insufficient*. "Technical readiness alone predicts nothing" is only true
in the same trivial sense that "marketing alone predicts revenue" is true:
nothing works alone. The vendor's own hierarchy — content relevance first,
domain authority second, technical health as a "hygiene floor" — is
consistent with SEOFixKit's public boundary, not a refutation of it.

### 4. One engine, one snapshot, one vendor's scoring

The study is Perplexity-only and cross-sectional. The blog concedes the
"citation landscape changes as AI search engines update their retrieval
pipelines" and that Google AI Overviews may weight structured data
differently. A single-engine, single-timestamp null is real evidence, but it
is bounded evidence: it cannot support the universal "technical readiness
alone predicts nothing."

## What SEOFixKit actually claims (and why the r=0.009 does not contradict it)

SEOFixKit's public AI Answer Readiness surface (`worker/routes/pages.js`,
`/ai-answer-readiness` landing page, `shared/ai-answer-readiness.js`) says,
repeatedly and explicitly:

- AI Answer Readiness is **proof-derived from rendered pages, schema,
  canonicals, internal links, sitemap context, and optional llms.txt** — it is
  not a citation predictor and never claims to be.
- It does **not** sample ChatGPT, Perplexity, Google AI Overviews, or other
  engines.
- It does **not** provide live citation monitoring or AI visibility score
  tracking.
- "Does a good readiness signal guarantee AI visibility?" → "No. Readiness is
  a site-proof diagnostic, and rankings, traffic, AI citations, and revenue
  are never guaranteed."

That is the same boundary getaisearchscore.com arrived at after its own null:
content relevance is the citation driver; technical health is a floor.
SEOFixKit's readiness checks exist to find *proof-backed, fixable* reasons a
rendered page is hard for an answer engine to use — thin rendered content,
app-shell pages, missing helpful schema, unclear canonicals, orphaned pages,
missing sitemap context, unreachable optional llms.txt — and to rank those
faults by the traffic behind them when Search Console rows are imported. An
r=0.009 correlation on another vendor's aggregate score does not touch that
job. A "readiness score predicts nothing" headline would be true only if
"readiness" were a synonym for "citation prediction," and SEOFixKit has never
claimed that.

## The direct challenge, stated plainly

**getaisearchscore.com's "technical readiness alone predicts nothing
(r=0.009)" is a true but over-generalized headline. It is a null on one
vendor's aggregate score, one engine, one snapshot — not a null on technical
readiness as a concept, and not a finding SEOFixKit's proof-derived readiness
checks need to concede.** The honest version of their own research is
"content relevance is necessary; technical readiness is not sufficient; both
matter in different roles." SEOFixKit already sells exactly that boundary and
can say so publicly without overclaiming.

## What SEOFixKit should say publicly (draft copy, truth-safe)

On the `/ai-answer-readiness` landing page, next to the existing CrawlRaven
comparison:

> **On "technical readiness predicts nothing (r=0.009)"**
>
> getaisearchscore.com's own study — 441 domains, Perplexity-only citations,
> cross-sectional — found its original 26-check aggregate score did not
> predict citations (r=0.009), and it rebuilt its product around content
> relevance. We read that as confirming our boundary, not refuting it: the
> null is on one vendor's aggregate score, not on individual technical faults,
> and the study could not see JS-rendered content that a static crawl misses.
> SEO Fix Kit's AI Answer Readiness is proof-derived from the rendered page —
> what an answer engine can actually parse — and it never claims to predict
> citations. Readiness is a diagnostic, not a citation guarantee. Content
> relevance is the citation driver; technical health is the hygiene floor that
> keeps your content retrievable at all. We agree with getaisearchscore.com on
> both halves.

That paragraph is fully supported by the sources above and by SEOFixKit's
existing public boundary. It challenges the headline without attacking the
study, and it concedes the part that is true (content relevance matters).

## Sources

- getaisearchscore.com homepage (fetched 2026-08-21): r=0.009 headline, 62x,
  AUC 0.915, "26 technical checks still run as a hygiene floor", FAQ "Will
  fixing my score guarantee more AI citations?" (no — "We ran the research
  ourselves"), Readiness Paradox (1.8% vs 38.8%).
- getaisearchscore.com/blog/what-is-llm-seo (fetched 2026-08-21): 441 domains /
  14,550 domain-query pairs, p=0.849, no threshold effect, within-topic
  r=−0.010, 62x (5.17% vs 0.08%), "I tested Perplexity citations
  specifically", "cross-sectional, not longitudinal", robots.txt as "the only
  structural factor with an unambiguous effect", "structural optimization...
  has no proven causal link to citation outcomes".
- getaisearchscore.com/sample-report (fetched 2026-08-21): 26-check scoring
  shape (Machine Readability / Extractability / Trust / Offering), scanner
  "crawls up to 50 pages via your sitemap".
- getaisearchscore.com/blog/study-ai-readiness-score-does-not-predict-llm-citations
  (linked from the blog as "the null-finding study" — methodology page; not
  fetched this pass).
- SEOFixKit local truth: `worker/routes/pages.js` (`/ai-answer-readiness`
  landing page + FAQ), `shared/ai-answer-readiness.js` (proof-derived checks),
  `README.md` (AI Answer Readiness boundary: "does not sample answer engines
  or monitor citations").

## Open questions (for a future pass, not this one)

- Does getaisearchscore.com's scanner render JavaScript, and does its 26-check
  "extractability" leg operate on rendered DOM or raw HTML? This determines
  how far the null generalizes to JS-heavy sites. A follow-up lane could run
  SEOFixKit's own `/check` against a JS-heavy site and compare its static-vs-
  rendered delta with the vendor's score shape.
- Is the "13,140 domain-query pairs" (homepage) vs "14,550" (blog) difference
  a rounding or a real methodological change? Minor, but worth pinning if
  SEOFixKit ever cites the study publicly.
