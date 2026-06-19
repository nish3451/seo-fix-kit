# SEOFixKit Agent Repair Model Requirements

Created: 2026-06-18

## Summary

SEOFixKit will become a proof-first self-serve SEO repair agent: it proves browser-visible SEO issues, turns them into an approval-safe repair queue, helps draft or open fixes, reruns verification, and only then suggests growth assets backed by verified gaps.

---

## Problem Frame

The Outrank, SEOitis, Okara, and Ahrefs benchmark shows four buyer expectations the product must answer: clear self-serve output, transparent AI-search methodology, agent-assisted execution, and data-backed SEO/AI intelligence. SEOFixKit already has the strongest foundation for proof-backed repair, but the current product surface still feels closer to an audit/report than an active repair agent.

The product must preserve the original wedge: no generic SEO busywork, no unproven ranking promises, no backlink exchange, no Ahrefs-class data-suite replacement claims, no AI visibility claims without sampling or imported evidence, and no risky auto-publishing. The expansion should make the existing proof engine easier to buy and act on.

---

## Actors

- A1. Founder/operator: wants a clear answer, a safe fix path, and visible proof without managing SEO tooling.
- A2. Developer or vibecoder: needs exact snippets, acceptance checks, and PR/CMS-ready instructions.
- A3. Agency/operator: needs white-label reports, team assignment, client-safe status, and repeatable workflows.
- A4. SEOFixKit agent: proposes actions from verified evidence, but never silently publishes risky changes.
- A5. System/admin: enforces auth, quotas, report ownership, payment safety, and product-truth boundaries.

---

## Requirements

### Public Proof And Positioning

- R1. SEOFixKit must show a public proof sample before payment or deep signup so a buyer can see static-vs-rendered proof, a real issue, a false-positive guard, a fix snippet, and a rerun/delta example.
- R2. SEOFixKit must publish a methodology and limits surface explaining rendered audits, evidence windows, severity, confidence, fix generation, reruns, imports, competitor snapshots, and known limits.
- R3. Public copy must position SEOFixKit as the proof-backed repair agent, not a content autopilot, backlink network, or live AI-visibility tracker.

### Self-Serve Proof Audit

- R4. A user must be able to start from a URL and get a limited proof check with clear upgrade paths for verified-site depth, saved reports, imports, monitors, and private data.
- R5. Verified users must keep the current safeguards: site ownership, private report access, report retention, quota controls, and no private target crawling.
- R6. Every report must keep the existing proof model: rendered facts, static-vs-rendered comparison, evidence-backed findings, fix snippets, acceptance checks, and saved rerun deltas.

### Repair Queue

- R7. Report findings and repair-plan items must become a persistent repair queue with statuses beyond the current collaboration board: open, drafted, approved, applied, fixed, ignored, and regressed.
- R8. Each repair item must preserve proof, target page, fix text, snippet when available, effort, confidence, acceptance check, source module, and rerun status.
- R9. The queue must support owner mode selection: self-serve instructions, teammate/developer assignment, Fix Pack handoff, draft-only CMS action, and future GitHub PR action.
- R10. A report with no proven issues must produce a clear "no repair needed" state and monitoring/growth suggestions only when supported by evidence.

### Agent-Assisted Execution

- R11. The agent may draft repair actions from existing proof, snippets, and acceptance checks without requiring new external integrations.
- R12. Drafted actions must require user approval before any publish, apply, PR, or paid handoff state is recorded.
- R13. Initial execution must be safe by default: copy-paste instructions and draft records first; CMS writes, GitHub PRs, and external posting are later capabilities with explicit connection and approval.
- R14. Every agent action must create an activity record that shows source proof, proposed change, approval state, execution state, and rerun result.
- R15. The product must never auto-merge code, silently publish structural changes, expose private credentials, or call provider/admin APIs from the browser.

### AI Answer Readiness

- R16. SEOFixKit may add AI Answer Readiness checks only where they are derived from site proof: rendered content availability, schema, canonical/internal links, robots/AI crawler accessibility, `llms.txt`, and citation-friendly structure.
- R17. SEOFixKit must not claim live ChatGPT/Gemini/Perplexity visibility until engine sampling, raw-response retention, confidence handling, and methodology exist.
- R18. AI Answer Readiness findings must enter the same repair queue and rerun path as other proof-backed findings.

### Gap-Backed Growth Assets

- R19. Growth assets must be generated only from verified gaps such as low CTR imports, competitor repair gaps, missing FAQ/schema, page-two opportunities, or credible community-thread fit.
- R20. Growth outputs must start as briefs or drafts, not auto-published articles.
- R21. Growth suggestions must explain the proof source that justifies them and must not compete on raw article count.

### Monitor And Re-Measure

- R22. Existing weekly monitors and report deltas must feed an agent-style next-action surface: new issues, fixed issues, regressions, competitor gaps, Search Console/import deltas, and next best repair.
- R23. Reruns must close the loop by marking applied fixes as fixed, still open, new, or regressed based on fresh proof.
- R24. The account dashboard must prioritize the next repair or proof-backed action rather than a passive list of reports.

### Packaging And Trust

- R25. The product must expose a simple package ladder: Free Proof Check, Repair Report, Repair Agent, Growth Add-On, Agency/API, and Fix Pack.
- R26. Pricing and checkout copy must stay truthful: Fix Pack remains one proof-backed repair pass plus one rerun until recurring plans are actually wired.
- R27. Agency/API surfaces must preserve owner isolation, white-label controls, API key safety, webhook signing, and client-report privacy.
- R28. SEOFixKit must state that Ahrefs-class keyword, backlink, rank-tracking, crawler, and AI-visibility databases are not native capabilities; external data should enter as optional imports or future connectors, not as replacement claims.
- R29. If SEOFixKit adds patch-style execution, every patch must preserve source proof, approval state, rollback notes, and rerun acceptance before it can be marked fixed.

---

## Key Flows

- F1. Free proof check: A1 enters a URL, sees a limited rendered proof sample, understands one real repair and one avoided false positive, then can request access or verify ownership.
- F2. Verified repair report: A1 verifies a host, runs a deeper audit, and gets a saved private report with a persistent repair queue.
- F3. Agent draft: A1 chooses a queue item, asks the agent to draft the fix, reviews proof and proposed change, then approves, ignores, assigns, or requests Fix Pack handoff.
- F4. Rerun loop: A1 reruns the audit after changes; the queue marks items fixed, still open, new, or regressed from fresh proof.
- F5. Growth from gap: A1 imports keyword rows, backlink rows, Ahrefs/GSC-style exports, or competitor URLs; SEOFixKit suggests a page refresh, FAQ/schema addition, comparison outline, or free-tool idea only when proof supports it.
- F6. Agency/API handoff: A3 shares a client-safe report or uses API/webhooks while repair actions and private owner data stay scoped to the correct account.

---

## Acceptance Examples

- AE1. Given an anonymous visitor opens the public proof sample, when they review the demo, then they can see rendered proof, static-vs-rendered false-positive avoidance, a fix snippet, and a rerun/delta example without seeing private customer data.
- AE2. Given a verified user opens a saved report with findings, when the report loads, then the repair queue shows persistent statuses, proof, fix text, acceptance checks, and the available action modes for each item.
- AE3. Given a user drafts an agent action, when the draft is saved, then no live site change occurs until the user explicitly approves the action.
- AE4. Given a user reruns an audit after applying a fix, when the new report is saved, then prior repair items are marked fixed, still open, new, or regressed based on fresh evidence.
- AE5. Given AI Answer Readiness is shown, when the user reads the finding, then the product explains the site-proof basis and avoids live AI-visibility claims.
- AE6. Given keyword or competitor input exists, when a growth suggestion appears, then it names the input/proof source and remains a draft/brief rather than an auto-published page.
- AE7. Given a client-report share is active, when an agency viewer opens it, then private owner/API/payment/admin information remains hidden.

---

## Scope Boundaries

### Deferred For Later

- Live CMS publishing beyond draft-safe metadata actions.
- GitHub PR creation for code-level fixes.
- Real AI-engine visibility sampling and confidence intervals.
- Native Ahrefs MCP/API connector or Brand Radar import beyond user-supplied rows/exports.
- Reddit/Hacker News/community distribution agents.
- Recurring subscription billing for the full Repair Agent or Growth Add-On package.

### Outside This Product's Identity

- Backlink exchange networks.
- Generic AI article-volume autopilot.
- Private CMS/admin scraping.
- Proprietary backlink discovery or keyword-volume database replacement.
- Ahrefs/Semrush replacement claims.
- Ranking guarantees or unqualified "be cited everywhere" claims.

---

## Dependencies And Assumptions

- Existing reports, report deltas, repair plans, issue collaboration, Developer API, white-label reports, imported keyword/backlink rows, and Fix Pack flows remain the foundation.
- D1 remains the durable store for queue/action status in the first implementation.
- The first implementation should not require external provider credentials beyond what the repo already uses.
- Public proof and methodology pages can ship before provider integrations.

---

## Implementation Checkpoint

Updated: 2026-06-18

The first implementation now covers the public proof pages, durable repair queue, approval-safe action records, account repair feed, proof-derived AI Answer Readiness, draft-only growth briefs, Developer API queue status, repair-action lifecycle webhooks, and Fix Pack selected-repair checkout context. External CMS writes, GitHub PR creation, live AI-engine sampling, and recurring Repair Agent/Growth Add-On billing remain deferred.

Before any PR-ready, merge, release, or deploy path, run CE code review and the installed `autoreview` gate on the exact final diff after the final full check.
