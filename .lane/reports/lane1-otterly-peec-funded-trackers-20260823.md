# Lane 1 — Otterly.ai + Peec.ai funded tracker competitors on /methodology (2026-08-23)

Item: `36534cb9f0` — Raise Otterly.ai and Peec.ai as funded AI-visibility tracker competitors.

Branch: `lane1-otterly-peec-funded-trackers-20260823`
PR: https://github.com/nish3451/seo-fix-kit/pull/207 (base `main`)

## Direction chosen

Accept the senior verdict: add two live-evidence competitor benchmark docs, add a combined "Why not just use a tracker like Otterly.ai or Peec.ai?" section to `/methodology` between the Juma.ai and agentic sections, add a regression guard block, refresh sitemap lastmod, append `MEMORY.md`, and ship a lane-unique report.

- `docs/research/2026-08-23-otterly-ai-competitor-benchmark.md` — live evidence: 40,000+ marketing pros, $29/mo Lite plan, tracking of 4 AI search engines (ChatGPT, Google AI Overviews, Perplexity, MS Copilot) with Claude, Google AI Mode, and Gemini as paid add-ons.
- `docs/research/2026-08-23-peec-ai-competitor-benchmark.md` — live evidence: 3000+ brands and agencies, $80/mo Starter plan (annual), $21M Series A led by Singular, total funding to $29M.
- `worker/routes/pages.js` (`methodologyHtml`) — new combined tracker section placed between Juma and agentic, naming both truthfully with receipt links, repair queue + rerun proof wedge, no-overclaim boundary.
- `worker/routes/pages.test.mjs` — regression guard block for the new section.
- `shared/audit-engine.js` — refreshed `ROOT_PUBLIC_LASTMODS["/methodology"]`.
- `public/sitemap.xml` — refreshed `/methodology` lastmod to match.
- `MEMORY.md` — session summary bullet.
- `.lane/reports/lane1-otterly-peec-funded-trackers-20260823.md` — this report.

## Live fact verification (fetched 2026-08-23, this run)

- https://otterly.ai/ — "Trusted by 40,000+ Marketing Pros worldwide"; "Get your brand mentioned, and your website cited on ChatGPT, Perplexity, AI Overviews, AI Mode, Gemini, and Copilot"; "Multi-AI Search Engine Coverage — ChatGPT. Gemini. Perplexity. Copilot. AI Overviews. AI Mode. We track them all".
- https://otterly.ai/pricing — "Lite $29/month"; "Tracking of 4 AI Search Engines: ChatGPT, Google AI Overviews, Perplexity, MS Copilot"; "Claude, Google AI-Mode, Gemini as extra Add-ons".
- https://peec.ai/ — "AI search analytics for marketing teams"; "Visibility, Position, and, Sentiment"; "Trusted by 3000+ brands and agencies"; "Peec AI is a top-rated AI search monitoring tool - 4.9/5 on G2 and regularly recommended on Reddit".
- https://peec.ai/pricing — JavaScript-rendered Framer page: "Starter $80 /mo Annual Save $180"; "50 prompts"; "Choose 3 models"; "Daily tracking frequency"; "1 project"; available models include ChatGPT, AI Mode, AI Overviews, Microsoft Copilot, Perplexity, Gemini.
- https://peec.ai/blog/we-raised-21m-series-a-to-help-brands-win-in-ai-search — "$21 million Series A, led by European VC firm Singular"; "The round follows our Seed financing led by 20VC in July 2025 and brings total funding to $29 million"; "1,300+ brands and agencies onboarded since February 2025".

## Test evidence

- `node --test worker/routes/pages.test.mjs`: pass (0 fail).
- `npm run test:product-truth`: `{"ok":true}`.
- Local render check: `methodologyHtml('https://seofixkit.com')` contains the new tracker heading.

## Claims

Published to `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json` `claims` before editing: `docs/research/2026-08-23-otterly-ai-competitor-benchmark.md`, `docs/research/2026-08-23-peec-ai-competitor-benchmark.md`, `worker/routes/pages.js`, `worker/routes/pages.test.mjs`, `shared/audit-engine.js`, `public/sitemap.xml`, `.lane/reports/lane1-otterly-peec-funded-trackers-20260823.md`, `MEMORY.md`. No other lane-record field was modified.
