# Spec: Audit Job Queue

## Goal

Make self-serve audits reliable enough for real customers by turning long-running audits into saved background jobs with visible progress and retry-safe status polling.

## Requirements

- A verified beta user can submit an audit and get an immediate queued-job response.
- The app shows clear queued/running/completed/failed progress instead of waiting on one long request.
- A user can only see jobs created by their own account.
- Completed jobs link to the saved private report.
- Failed jobs preserve a safe error message so the user is not left guessing.
- Existing site verification, access session, and audit quota rules still run before a job is accepted.
- Duplicate submissions for the same account and target reuse the active job instead of starting another browser run.
- A user can have at most 3 queued/running audits at a time.
- The local development server mirrors the production job flow for browser testing.
- Expired audit jobs are cleaned up with the rest of private beta data.

## Non-Goals

- No multi-worker distributed scheduler in this slice.
- No customer-visible retry button in this slice.
- No changes to demo audit behavior.
