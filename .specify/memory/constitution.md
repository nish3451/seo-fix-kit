# Nish Product Constitution

## Core Principles

### I. Spec Before Code
For any new product, non-trivial feature, risky refactor, production workflow, payment/auth/data change, or customer-facing UI change, write or update the Spec Kit spec before implementation. The spec must describe the user outcome, non-goals, acceptance checks, data touched, and launch risk in plain English. Tiny typo fixes, copy tweaks, and obvious one-line repairs can skip Spec Kit.

### II. Tests Are Required Proof
Every non-trivial implementation plan must include test cases before code changes. The right test level depends on the risk: unit tests for pure logic, integration tests for server/data boundaries, browser/UI tests for important web flows, and simulator/UI tests for iOS flows. Coverage targets should protect important logic; do not chase fake 95% coverage by testing meaningless lines.

### III. Browser and UI Flows Must Be Exercised
For web apps, critical user flows need rendered browser checks with Playwright or the Codex Browser tooling when practical. These checks should cover the happy path, obvious failure states, and the main responsive viewport. Direct HTTP checks do not replace rendered UI proof when the feature is visual or interactive.

### IV. Client Code Never Owns Platform Secrets
Browser or app client code must not call Cloudflare admin APIs, D1, R2, KV, database admin endpoints, payment secrets, model-provider secrets, or private service credentials directly. Clients may call the app's own public/server API routes. Server code must enforce auth, role checks, rate limits or quota guards, input validation, and safe error responses.

### V. Release Gates Beat Vibes
Before marking work done, run the repo's existing checks first. If the repo has no adequate checks, add the smallest meaningful gate for the touched surface. Any skipped verification must be named plainly with the reason. Do not deploy or declare launch-ready when tests, build, privacy/security basics, or live smoke checks are missing for the changed surface.

## Required Spec Sections

Each Spec Kit spec or plan for meaningful work must answer:

- What user-visible outcome changes?
- What existing behavior must not break?
- What test cases prove this?
- Does this touch auth, billing, user data, storage, Cloudflare, database, email, analytics, or model-provider calls?
- Which parts run in the client, server, worker, database, or native app?
- What is the rollback or safe fallback?

## Testing Standard

Use the repo's native test stack. For current Nish repos this usually means Node test, Vitest, Playwright, Xcode tests, or existing custom gate scripts. A 95% coverage target is useful only for core business logic and shared libraries. For UI-heavy or integration-heavy apps, require coverage of critical journeys and dangerous branches instead of chasing a single global percentage.

## Governance

This constitution is the default for Nish-owned current and future projects. Repo-specific `AGENTS.md`, `MEMORY.md`, `ERRORS.md`, and existing release gates still matter and may add stricter rules. If a Spec Kit instruction conflicts with verified repo truth, preserve repo truth and update the spec/plan to explain the local exception.

**Version**: 1.0.0 | **Ratified**: 2026-05-20 | **Last Amended**: 2026-05-20
