---
title: "docs: challenge getaisearchscore.com's r=0.009 technical-readiness null finding"
type: docs
date: 2026-08-21
execution: knowledge-work
---

# docs: Challenge getaisearchscore.com's "technical readiness alone predicts nothing (r=0.009)"

## Summary

Raise getaisearchscore.com's published null finding — that its original
26-check technical readiness score correlates at r=0.009 with AI citations —
as a direct, truth-safe challenge. The challenge is a research artifact plus a
public landing-page section on `/ai-answer-readiness`, not an attack on the
study: the null is real but bounded (one vendor's aggregate score, Perplexity
only, cross-sectional), and it confirms SEOFixKit's existing boundary
(proof-derived readiness is a diagnostic, not a citation predictor).

## Problem Frame

getaisearchscore.com's homepage sells a content-relevance score while stating
"technical readiness alone predicts nothing (r=0.009, null finding)" — a
claim that, taken at face value, would make SEOFixKit's proof-derived AI
Answer Readiness checks look meaningless. SEOFixKit's checks are rendered-page
proof (content depth, helpful schema, canonical/internal-link clarity,
question-led structure, sitemap/llms.txt context) and never claim citation
prediction. The challenge must separate the true part (content relevance is
the citation driver; an aggregate technical score is not a citation predictor)
from the over-generalization (technical faults do not matter; unrendered
static-crawl scores stand in for rendered readiness).

## Requirements

- R1. Quote getaisearchscore.com's claims from its official pages (homepage,
  blog, sample report) with links, fetched live this pass.
- R2. Ground the challenge in SEOFixKit repo truth (`shared/ai-answer-readiness.js`,
  `worker/routes/pages.js`, README), not stale memory.
- R3. Concede the true half (content relevance drives citations; the null is
  real) so the challenge is credible, not a strawman.
- R4. Keep public copy truth-safe: no ranking/citation guarantee, no claim
  that readiness predicts citations, no claim about another vendor's
  methodology beyond what its own pages state.
- R5. Follow the house pattern: research doc under `docs/research/`, plan doc
  under `docs/plans/`, public section on `/ai-answer-readiness` next to the
  existing "Compared with CrawlRaven" section.

## Key Decisions

- **Use a docs artifact plus one landing-page section, not code behavior
  changes:** the item is a positioning challenge, and SEOFixKit's readiness
  engine already has the correct boundary. No product logic changes.
- **Challenge the headline, not the study:** the vendor's own FAQ concedes
  its original score did not predict citations and calls the 26 checks a
  "hygiene floor." That is the same floor/ceiling split SEOFixKit publishes.
- **Add test/live-check assertions for the new section:** the promise-audit
  tests and the live-promise spot-check already pin the AI readiness page's
  boundary copy; the new section must be pinned the same way so it cannot
  drift or overclaim later.

## Work Plan

### U1. Gather Current Evidence

- Fetch getaisearchscore.com homepage, `blog/what-is-llm-seo`, and
  sample-report (done this pass).
- Capture the exact claims: r=0.009, p=0.849, 441 domains / 14,550 pairs,
  no threshold effect, within-topic r=−0.010, 62x (5.17% vs 0.08%), AUC
  0.915, Readiness Paradox (1.8% vs 38.8%), Perplexity-only, cross-sectional,
  AI-crawler blocking as "the only structural factor with an unambiguous
  effect".
- Verification: every claim in the research doc links to the source page.

### U2. Write The Challenge Research Doc

- `docs/research/2026-08-21-getaisearchscore-r0009-challenge.md` with:
  executive verdict, source-linked claim table, three reasons the null does
  not generalize (unrendered measurement, aggregate-vs-fault, necessary-vs-
  sufficient), why the Readiness Paradox is a domain-authority confound, what
  SEOFixKit actually claims, the direct challenge stated plainly, draft
  public copy, sources, open questions.
- Verification: the doc's claims match the fetched sources and SEOFixKit's
  published boundary.

### U3. Add The Public Landing-Page Challenge

- `worker/routes/pages.js`: new "On 'technical readiness predicts nothing
  (r=0.009)'" band on `/ai-answer-readiness`, after "Compared with
  CrawlRaven".
- `worker/routes/pages.test.mjs`, `shared/promise-audit.test.mjs`,
  `scripts/live-promise-spot-check.mjs`: assert the section exists and stays
  truth-safe (never claims citation prediction; states the null is bounded).
- Verification: `npm run check` green.

## Scope Boundaries

- This pass does not change the readiness engine, report output, or any
  product behavior.
- This pass does not accuse getaisearchscore.com of fabrication; it challenges
  the generalization of a real null finding.
- This pass does not claim SEOFixKit can predict citations, does not claim
  technical readiness guarantees AI visibility, and does not publish ranking,
  traffic, citation, or revenue promises.

## Deliverable

Save the challenge at `docs/research/2026-08-21-getaisearchscore-r0009-challenge.md`,
the plan at `docs/plans/2026-08-21-001-docs-getaisearchscore-r0009-challenge-plan.md`,
and the public section + pinned tests in `worker/routes/pages.js`,
`worker/routes/pages.test.mjs`, `shared/promise-audit.test.mjs`, and
`scripts/live-promise-spot-check.mjs`.
