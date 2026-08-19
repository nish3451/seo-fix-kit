# Lane 1 — first-party private-beta activation instrumentation

## Item

- Scout 2026-08-08, rank 2, risk green: "Add first-party activation
  instrumentation for the private-beta funnel."

## What landed

### Storage
- New D1 migration `migrations/0090_activation_events.sql` adds an
  append-only `access_events` table. The schema records ordered funnel
  steps with `funnel_key`, owner email, source, landing path, referrer,
  user-agent, country, hashed IP, structured metadata, and timestamp;
  indexes cover `(step, created_at)`, `(funnel_key, created_at)`,
  `(owner_email, created_at)`, and `created_at` for fast windowed
  aggregation. The table is intentionally append-only — events are
  never updated or deleted by the app.

### Funnel steps (ordered)
- `beta_view` — homepage / beta gate mounted
- `beta_input` — first keystroke in the access form
- `beta_submit` — locked-homepage form submission
- `access_requested` — self-serve access request validated
- `access_link_sent` — access email handed to the email binding
- `access_link_verified` — single-use token consumed
- `session_created` — beta session created (self-serve, invite, or founder override)
- `audit_started` — first private audit job queued in the same session

### Server wiring (`worker/`)
- `worker/lib/access-events.js` exposes `recordAccessEvent` (best-effort,
  never throws, returns `{ ok, reason }`) and `summarizeAccessEvents`
  (per-step counts + conversion percentages + unique funnel key / email
  counts in a window).
- `worker/routes/access.js` calls the helper from the locked-homepage
  waitlist (`beta_submit`), self-serve access request
  (`access_requested`, `access_link_sent`), self-serve access verify
  (`access_link_verified`, `session_created`), and invite/founder login
  (`session_created`). It also exposes a new `recordAccessBeacon`
  handler for the SPA, rate-limited at 240 beacons / IP / hour via the
  existing `audit_usage` quota system.
- `worker/routes/audits.js` records `audit_started` for every new
  private-audit job, with the funnel key forwarded from the client.
- `worker/routes/admin.js` adds `getFunnelSummary`, which returns
  `{ steps, conversionPct, totals, order, windowDays }` for any 1-90 day
  window. Every read is logged in `admin_audit_log` with action
  `view-funnel`, matching the other admin reads.
- `worker/index.js` routes `POST /api/access/track` to the beacon
  handler and `GET /admin/funnel` (admin token required) to the funnel
  summary.

### Client wiring (`src/App.jsx`)
- A new `FUNNEL_KEY` session-storage value is generated on first paint
  (`fk_<16 hex>`) and reused across requests so the founder can join a
  view to a verified session.
- `WaitlistPage` fires a `beta_view` beacon on mount and a `beta_input`
  beacon on the first non-empty keystroke in the email field. The
  homepage and beta-gate access requests now forward `funnelKey` in
  both the JSON body and the `x-seofixkit-funnel-key` header.
- The token-verify effect on the beta gate reads the funnel key from
  session storage so the eventual `access_link_verified` event joins
  the same funnel key as the originating `beta_view` / `beta_input`
  beacons.
- The send path prefers `navigator.sendBeacon` and falls back to
  `fetch(..., { keepalive: true })` so the beacon never blocks the
  page or survives a tab close mid-submit.

### Tests
- `worker/lib/access-events.test.mjs` — 7 tests covering step validation,
  insert path, no-storage degradation, insert failures, normalization
  (email lower-cased, funnel key sanitized), summarize happy path, and
  summarize without storage.
- `worker/routes/access.test.mjs` — 7 tests covering the beacon
  accept/reject behavior, the requestAccessLink event ordering
  (`access_requested` then `access_link_sent`), email-required rejection,
  the admin funnel summary happy path (20% conversion from
  `beta_view` → `session_created`), and the admin 401 rejection.
- `src/app-contract.test.mjs` — already green; no JSX contract changed.
- `node --test` across the touched suites reports 212 / 212 passing,
  including the existing worker, account, billing, developer-api,
  email, pages, public-check, and repair-agent suites.

### Docs
- README "What is live in this repo" now lists the funnel
  instrumentation and the `/admin/funnel` endpoint.
- README "Related routes" notes that `/admin/funnel` is the ordered
  activation funnel.

## Out of scope (deliberate)
- No client-side session-replay or clickmap (instrumentation is
  event-step only, never PII-rich).
- No third-party analytics: storage and aggregation are entirely
  first-party in D1 `access_events`.
- No exposed `audit_completed` step yet: completion is signalled in
  the existing `audit_jobs.status` flow, not the activation funnel.
- No `audit_completed` beacon from the SPA — that is a follow-up item
  for a separate lane if the founder wants the explicit step.

## Verification commands run
- `node --test worker/lib/access-events.test.mjs` — 7/7 pass
- `node --test worker/routes/access.test.mjs` — 7/7 pass
- `node --test worker/index.test.mjs` — 12/12 pass
- `node --test src/app-contract.test.mjs` — 14/14 pass
- Combined `node --test` of touched + adjacent suites — 212/212 pass
- `npx vite build` — green, 24 modules transformed, no JSX errors

## Branch and PR
- Branch: `feat/first-party-funnel-instrumentation-lane1`
- Base: `origin/main` (rebased; old remote branch was force-replaced)
- PR: will be opened after the final commit lands on the branch.
