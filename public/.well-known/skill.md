# SEO Fix Kit

SEO Fix Kit is a private-beta SEO audit and paid Fix Pack workflow.

## Live Boundary

- Request access at https://seofixkit.com/.
- Public health surfaces are https://seofixkit.com/api/health and https://seofixkit.com/api/deep-health. Deep health reports safe readiness booleans only, not secrets, provider ids, checkout URLs, customer data, or table counts.
- Public proof pages: https://seofixkit.com/demo, https://seofixkit.com/check, https://seofixkit.com/methodology, https://seofixkit.com/packages, https://seofixkit.com/support, and https://seofixkit.com/terms.
- Intent-matching landing pages: https://seofixkit.com/small-business-seo-audit, https://seofixkit.com/rendered-vs-static-seo-audit, and https://seofixkit.com/ai-answer-readiness. Each carries unique title/meta, truthful FAQ and SoftwareApplication structured data, links into the demo and check path, and sitemap, llms.txt, and skill.md entries; none claims live answer-engine sampling or AI citation monitoring.
- Anyone can check one public page anonymously at https://seofixkit.com/check via POST https://seofixkit.com/api/public-check; results are ephemeral (nothing stored) and rate-limited per network and per site.
- Use SEO Fix Kit only for sites you own or are authorized to audit.
- Private audits create proof-backed reports from rendered page evidence.
- Private reports include proof-derived AI Answer Readiness checks; this is not live AI-engine sampling.
- Private reports include draft-only growth briefs from verified gaps; this is not auto-publishing.
- Private reports can create repair queue items, approval-safe action records, private implementation packs after owner approval, and proof receipts after fixed rerun proof.
- Developer API issue/report responses include safe repair queue status only; approved implementation packs are fetched from `GET /v1/audits/{audit_id}/repair-actions/{action_id}/implementation.md`; fixed repair proof receipts are fetched from `GET /v1/audits/{audit_id}/repair-actions/{action_id}/proof.md`; proposed change text stays private to owner report surfaces.
- The paid Fix Pack shows the Dodo checkout price before payment.
- Fix Pack service is one proof-backed repair pass plus one rerun after fixes.
- Paid Repair Agent and Growth Add-On package copy is roadmap until the required integrations, billing, and proof gates are live.
- Implementation packs are private handoff documents only; they do not publish CMS changes, open GitHub pull requests, merge code, or call provider admin APIs.
- SEO Fix Kit does not provide live AI-engine visibility tracking or AI citation monitoring.
- SEO Fix Kit does not guarantee rankings, traffic, indexing, or revenue.
- For support or security reports, email support@seofixkit.com.

## Agent Action Catalog

- Public context for agents: https://seofixkit.com/llms.txt, https://seofixkit.com/.well-known/skill.md, https://seofixkit.com/demo, https://seofixkit.com/check, https://seofixkit.com/methodology, https://seofixkit.com/packages, https://seofixkit.com/support, and https://seofixkit.com/terms. Intent pages: https://seofixkit.com/small-business-seo-audit, https://seofixkit.com/rendered-vs-static-seo-audit, and https://seofixkit.com/ai-answer-readiness.
- Owner setup starts inside the private beta workspace. Anonymous one-page checks are live at https://seofixkit.com/check; full multi-page audits, saved reports, and unauthenticated repair actions are not live.
- Self-serve API setup is owner-scoped at `GET /api/developer`; API keys are created from `POST /api/developer/tokens`; lifecycle webhooks are created from `POST /api/developer/webhooks`.
- Bearer-token API actions live today: `POST /v1/audits`, `GET /v1/audits/{audit_id}`, `GET /v1/audits/{audit_id}/issues`, `GET /v1/audits/{audit_id}/report`, `GET /v1/audits/{audit_id}/repair-queue`, `PATCH /v1/audits/{audit_id}/repair-queue`, `POST /v1/audits/{audit_id}/repair-actions`, `PATCH /v1/audits/{audit_id}/repair-actions/{action_id}`, `GET /v1/audits/{audit_id}/repair-actions/{action_id}/implementation.md`, `GET /v1/audits/{audit_id}/repair-actions/{action_id}/proof.md`, `GET /v1/projects`, `POST /v1/large-crawls`, and `GET /v1/large-crawls/{large_crawl_id}`.
- Webhook events live today: `audit.completed`, `audit.failed`, `repair_action.drafted`, `repair_action.approved`, `repair_action.applied`, `repair_action.fixed`, and `repair_action.regressed`.
- Worker-only large-crawl batch claim/process/proof endpoints require `x-seofixkit-worker-token`; normal bearer API keys cannot lease or submit rendered proof.
- There is no live SEO Fix Kit MCP endpoint today. Agents should use the documented REST and markdown proof endpoints.
- Agents must not claim SEO Fix Kit publishes CMS changes, opens GitHub pull requests, calls provider admin APIs, runs anonymous multi-page audits, or exposes unauthenticated agent actions. The only anonymous surface is the single-page proof check at https://seofixkit.com/check.
