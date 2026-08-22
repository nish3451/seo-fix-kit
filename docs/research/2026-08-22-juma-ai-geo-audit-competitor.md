# Juma.ai GEO Audit — live fetch receipt (2026-08-22)

Fetch date: 2026-08-22. User-Agent: `SEOFixKit-lane1-verification/1.0`.
Only live pages below. Backlog figures were not used as sources.

## 1. https://geo.juma.ai/

- Request: `GET https://geo.juma.ai/`
- Final URL: `https://geo.juma.ai/`
- HTTP: 200
- Server: Vercel (`x-matched-path: /`)
- Fetched: 2026-08-22

Verbatim quotes:

- "Free · No Signup · Open Methodology"
- "No signup"
- "Free"
- "Paste your website address above. No signup, no install, no credit card. We start analyzing immediately."
- "Yes — completely free, no credit card, no trial period, no upsell."
- "The only free GEO audit with open methodology."
- "We publish every sub-check, every weight, every rubric — so you can verify the results yourself."
- "Published open methodology" / comparison table cell "Yes Fully public"
- "ranks every fix by impact and effort"
- "a ranked list of fixes sorted by impact vs. effort"
- "Prioritized fix list Yes Impact × effort matrix"
- "an impact/effort matrix of every fix ranked by priority"
- "Yes — every score is produced by the same published rubric, with ten weighted dimensions and every sub-check documented publicly."
- "Our audit breaks down exactly which of 6 dimensions are failing — and ranks every fix by impact and effort."
- "6 dimensions. Every signal AI engines use."
- "Tested against ChatGPT Google AI Overviews Perplexity Gemini Claude"
- "AI engines tested per audit 5"

Landing-page dimension count ("6 dimensions") disagrees with the methodology page ("ten weighted dimensions") and with the landing FAQ's own "ten weighted dimensions" sentence. Per spec, shipped copy uses the methodology-page figure only.

## 2. https://juma.ai/methodology

- Request: `GET https://juma.ai/methodology`
- Final URL: `https://juma.ai/methodology`
- HTTP: 404
- Fetched: 2026-08-22

This URL does not serve the methodology page. Fallback used.

## 3. https://geo.juma.ai/methodology (fallback; used as the methodology URL)

- Request: `GET https://geo.juma.ai/methodology`
- Final URL: `https://geo.juma.ai/methodology`
- HTTP: 200
- Server: Vercel (`x-matched-path: /methodology`)
- Fetched: 2026-08-22

Verbatim quotes:

- "Every score a Juma audit produces comes from the rubric on this page — ten weighted dimensions, every sub-check documented, every weight versioned."
- "Every score uses the same published rubric. No paywall, no login."
- "Last updated 2026-05-14"
- "v3.0 · 2026-05-14"
- "v1.0 · 2026-04-15 — Initial published methodology. Six weighted dimensions."
- "Data source — Fetches /robots.txt directly"
- "ChatGPT-User (live browsing) 17 Allowed in robots.txt"
- "Data source — Cheerio parse of the Firecrawl rawHtml"
- "Data source — DataForSEO SERP API"
- "v3 also extracts AI Overview citations from the same SERP responses we already pay for — directly observing whether Google's Gemini-powered overview already cites the brand"
- "Extracted Google AI Overview citations from the existing SERP responses for Brand Presence (zero-cost DataForSEO leverage)."

Live-engine-sampling reading from this page: the published data sources are robots.txt, Cheerio/HTML, Firecrawl-rendered HTML, and DataForSEO SERP (including Google AI Overview citation extraction). Sub-checks such as "ChatGPT-User (live browsing)" award points for being *allowed in robots.txt*, not for querying ChatGPT during a run. The methodology does not document sampling ChatGPT, Claude, Gemini, or Perplexity live.

## 4. https://juma.ai/mcp

- Request: `GET https://juma.ai/mcp`
- Final URL: `https://juma.ai/mcp`
- HTTP: 200
- Fetched: 2026-08-22

Verbatim quotes:

- "MCP (Model Context Protocol) is an open standard that lets AI agents connect to external tools and data. Juma MCP turns your Juma workspace into a set of callable tools"
- "run SEO and GEO audits"
- "run_geo_audit Score a page's AI-answer citability as a report."
- "Each one uses the same server URL: https://mcp.juma.ai/mcp"
- "Juma MCP is included in your existing Juma seat."

## Differentiator checklist (from these fetches only)

| Brief claim | Live result |
| --- | --- |
| Free | Confirmed (`https://geo.juma.ai/`, 2026-08-22) |
| No signup | Confirmed (`https://geo.juma.ai/`, 2026-08-22) |
| Published / open methodology | Confirmed at `https://geo.juma.ai/methodology` (`https://juma.ai/methodology` is 404) |
| Impact × effort ranking | Confirmed (`Impact × effort matrix` on `https://geo.juma.ai/`, 2026-08-22) |
| MCP server / tools | Confirmed (`https://juma.ai/mcp`, 2026-08-22), including `run_geo_audit` |
| Samples ChatGPT/Claude/Gemini/Perplexity live during a run | Not shown by the methodology data sources. Landing page says "Tested against" those engines; methodology scores crawler-access, HTML, Firecrawl, and SERP/AI Overview citations. |
