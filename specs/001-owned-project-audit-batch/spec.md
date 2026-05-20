# Owned Project Audit Batch

## Outcome

Run SEO Fix Kit against Nish-owned public web projects, save the reports in the live beta system, and produce a concise evidence summary that tells us which first paid SEO Fix Pack offer is justified.

## Non-Goals

- Do not audit private dashboards as if they are marketing SEO targets.
- Do not create payment or pricing claims until the audit evidence supports the offer.
- Do not store admin tokens, invite codes, beta passwords, or session cookies in the repo.

## Acceptance Checks

- Target inventory separates SEO-relevant public sites from operational app/API surfaces.
- Batch runner creates a one-use beta invite, logs in, audits targets sequentially, and writes a local summary artifact.
- Live report URLs are saved for each successful audit.
- Repeated findings are grouped across projects.
- Existing repo checks still pass.

## Data Touched

- Live SEO Fix Kit admin invite API.
- Live beta audit/report API.
- Public pages for Nish-owned domains.
- Local summary files under `ops/audit-batches/`.

## Risk And Fallback

- If a target is rate-limited or unavailable, record it as skipped or failed and continue sequentially.
- If the admin token is missing, stop before making live writes.
- If a report fails, do not fake a score; keep the failure in the batch artifact.
