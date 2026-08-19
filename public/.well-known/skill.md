# SEO Fix Kit

SEO Fix Kit is a private-beta SEO audit and paid Fix Pack workflow.

## Live Boundary

- Request access at https://seofixkit.com/.
- Public health surfaces are https://seofixkit.com/api/health and https://seofixkit.com/api/deep-health. Deep health reports safe readiness booleans only, not secrets, provider ids, checkout URLs, customer data, or table counts.
- Public proof pages: https://seofixkit.com/demo, https://seofixkit.com/check, https://seofixkit.com/methodology, https://seofixkit.com/packages, https://seofixkit.com/proof, https://seofixkit.com/small-business-seo-audit, https://seofixkit.com/rendered-vs-static-seo-audit, https://seofixkit.com/ai-answer-readiness, https://seofixkit.com/support, and https://seofixkit.com/terms.
- Anyone can check one public page anonymously at https://seofixkit.com/check via POST https://seofixkit.com/api/public-check; results are ephemeral (no report or URL is stored; only short-lived anonymous rate-limit counters are kept) and rate-limited per network and per site.
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

## Hosted-Only Differentiators vs Free Installable SEO Agent Skills

Free installable SEO agent skills are useful for quick, single-page checks and remain a good complement. SEO Fix Kit's hosted surfaces add the parts that need infrastructure and persistence:

- Hosted rendered crawl scope: self-serve audits up to 1,000 pages per queued audit, robots.txt and sitemap crawl inventory up to 50,000 discovered URLs, and staged large rendered crawl jobs for 50,000-page targets (early access; batches render gradually, never sold as completed 50K rendered validation).
- Persistent repair queue: proven issues stay tracked across saved reports with approval state, acceptance checks, status, and fixed-rerun proof receipts.
- Owner-approved implementation packs: private handoff documents with source proof and approval state for approved repair actions.
- Paid Fix Pack fulfillment: one proof-backed repair pass per report plus one rerun after fixes, with Dodo as the checkout and visible-price source of truth.
- Why not just use a free AI SEO agent skill? The plain answer is on the methodology page: https://seofixkit.com/methodology. The same boundaries apply to both: no live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.

## Agent Action Catalog

- Public context for agents: https://seofixkit.com/llms.txt, https://seofixkit.com/.well-known/skill.md, https://seofixkit.com/demo, https://seofixkit.com/check, https://seofixkit.com/methodology, https://seofixkit.com/packages, https://seofixkit.com/proof, https://seofixkit.com/small-business-seo-audit, https://seofixkit.com/rendered-vs-static-seo-audit, https://seofixkit.com/ai-answer-readiness, https://seofixkit.com/support, and https://seofixkit.com/terms.
- Owner setup starts inside the private beta workspace. Anonymous one-page checks are live at https://seofixkit.com/check; full multi-page audits, saved reports, and unauthenticated repair actions are not live.
- Self-serve API setup is owner-scoped at `GET /api/developer`; API keys are created from `POST /api/developer/tokens`; lifecycle webhooks are created from `POST /api/developer/webhooks`.
- Bearer-token API actions live today: `POST /v1/audits`, `GET /v1/audits/{audit_id}`, `GET /v1/audits/{audit_id}/issues`, `GET /v1/audits/{audit_id}/report`, `GET /v1/audits/{audit_id}/repair-queue`, `PATCH /v1/audits/{audit_id}/repair-queue`, `POST /v1/audits/{audit_id}/repair-actions`, `PATCH /v1/audits/{audit_id}/repair-actions/{action_id}`, `GET /v1/audits/{audit_id}/repair-actions/{action_id}/implementation.md`, `GET /v1/audits/{audit_id}/repair-actions/{action_id}/proof.md`, `GET /v1/projects`, `POST /v1/large-crawls`, and `GET /v1/large-crawls/{large_crawl_id}`.
- Webhook events live today: `audit.completed`, `audit.failed`, `repair_action.drafted`, `repair_action.approved`, `repair_action.applied`, `repair_action.fixed`, and `repair_action.regressed`.
- Worker-only large-crawl batch claim/process/proof endpoints require `x-seofixkit-worker-token`; normal bearer API keys cannot lease or submit rendered proof.
- There is no live SEO Fix Kit MCP endpoint today. Agents should use the documented REST and markdown proof endpoints.
- Agents must not claim SEO Fix Kit publishes CMS changes, opens GitHub pull requests, calls provider admin APIs, runs anonymous multi-page audits, or exposes unauthenticated agent actions. The only anonymous surface is the single-page proof check at https://seofixkit.com/check.
