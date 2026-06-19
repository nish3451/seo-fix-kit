# Proof SEO Remediation Brief Plan

Date: 2026-06-18

## Goal

Make Proof SEO more self-serve and agentic by turning every saved report into a structured remediation brief: priority fixes, proof, acceptance checks, delta/history signal, and safe human handoff rules.

## Scope

- Add a deterministic remediation brief builder from existing saved report data.
- Include the brief in private report JSON responses.
- Add an authenticated `/api/reports/:id/remediation-brief.json` endpoint.
- Render a compact agent repair brief inside the report UI.
- Add a smoke test that locks the brief contract and route/UI wiring.

## Non-Goals

- No new model call.
- No autonomous site edits.
- No Fix Pack checkout, billing, migration, or deploy changes.
- No public claim that fixes guarantee rankings, traffic, or revenue.

## Implementation Steps

1. Build `shared/remediation-brief.js` with:
   - mode, report summary, top priority queue, proof history, support/handoff rules, and next actions.
   - acceptance checks for each queued repair.
2. Wire the builder into `worker/routes/reports.js` for normal report JSON and `/remediation-brief.json`.
3. Route `/api/reports/:id/remediation-brief.json` before the generic saved-report handler.
4. Add a report-panel UI section using the already-loaded `report.remediationBrief`.
5. Add `server/remediation-brief-smoke-test.js` and include it in `npm run check`.
6. Run focused test, `npm run check`, `git diff --check`, and the installed autoreview helper before commit.

## Controls

- Use only existing report findings, repair plan, and delta proof.
- Keep all actions human-reviewed; no auto-publish, auto-edit, or ranking promises.
- Preserve existing report authorization.
- Keep output compact enough for agents, support, and developers to consume.
