import { escapeHtml } from "../../shared/audit-engine.js";

const FIX_PACK_PUBLIC_PRICE = "$99.00 one-time";

function llmsText(origin) {
  return `# SEO Fix Kit

SEO Fix Kit is a private-beta, self-serve SEO audit and paid Fix Pack workflow.

Live product claims:
- Visitors can request a secure email access link.
- Anyone can anonymously check one public page URL at /check and see rendered proof, guarded false positives, and actionable findings when present, with no account and no stored report.
- Verified sessions can run rate-limited private audits and save owner-only reports.
- Verified sessions can choose self-serve crawl depth up to 1,000 pages per queued audit.
- Reports include robots.txt and sitemap crawl inventory up to 50,000 discovered URLs.
- Large rendered crawl jobs (staged 50,000-page plans) are early access: they store frontier, batch, retry, proof, and merge-readiness state, and batches render gradually in the background over days to weeks.
- Reports include rendered crawl intelligence for internal link depth, low-inbound pages, sitemap-sample orphan candidates, duplicate metadata/content, parameterized URLs, and keyword-cannibalization heuristics.
- Saved reruns include audit-history deltas for fixed, new, and still-open proven issues.
- Reports include rendered browser resource-waterfall proof with slow, heavy, and render-blocking repair actions.
- Verified sessions can import backlink rows for live/lost link proof, repair actions, and import-backed link-edge history.
- Verified sessions can supply local business details, keywords, and citation URLs for local SEO proof and repair actions.
- Verified sessions can import Search Console or rank-tracker keyword rows for low-CTR, page-two, decline, cannibalization, intent-match, uncrawled landing-page repair actions, and rank observation history.
- Reports include rendered WordPress and ecommerce platform proof for Product schema, breadcrumbs, faceted links, archives, and plugin resource impact.
- Reports include proof-derived AI Answer Readiness checks for rendered content depth, helpful schema, canonical/internal-link clarity, question-led structure, sitemap context, and optional llms.txt reachability.
- Reports include draft-only growth briefs from verified keyword, competitor, AI-readiness, and crawl gaps.
- Reports include a private repair queue with proof, acceptance checks, status, safe draft action records, approval state, owner-approved implementation packs, and proof receipts after fixed rerun proof.
- The account dashboard includes a repair-agent feed that ranks open repairs, drafted actions, applied items needing rerun proof, and monitor regressions.
- Developer API issue/report responses include safe repair_queue status. Approved-action implementation packs are fetched from /v1/audits/{audit_id}/repair-actions/{action_id}/implementation.md; fixed-action proof receipts are fetched from /v1/audits/{audit_id}/repair-actions/{action_id}/proof.md; repair-action lifecycle webhooks are supported.
- Reports include SEO/GEO readiness checks for crawlable answer content, entity clarity, useful schema, internal context, and optional llms.txt boundaries.
- Dodo is the source of truth for visible Fix Pack pricing and checkout.
- Paid Fix Pack fulfillment includes owner-approved repair proposals, status, delivery notes, and one rerun after fixes.
- Proof Monitoring checkout is config-gated behind the Dodo subscription product and webhook entitlement sync; access activates from subscription webhooks, not redirects.
- The private billing portal lists the staged offer ladder for monitoring, Repair Sprint, SEO/GEO repair agent, and agency workspace.
- Repair Sprint eligibility can be shown from approved proposal state, but distinct Repair Sprint checkout is not live yet.
- Agency Workspace features run under beta limits; paid Agency Workspace checkout is not live yet.

Agent-readable acquisition and action surfaces:
- Public context for agents: ${origin}/llms.txt, ${origin}/.well-known/skill.md, ${origin}/demo, ${origin}/methodology, ${origin}/packages, ${origin}/support, and ${origin}/terms.
- Intent-matching landing pages at ${origin}/small-business-seo-audit, ${origin}/rendered-vs-static-seo-audit, and ${origin}/ai-answer-readiness describe the proof-backed small-business audit, rendered-vs-static proof loop, and site-proof AI Answer Readiness boundary; none claim live answer-engine sampling or AI citation monitoring.
- Owner setup starts inside the private beta workspace; anonymous one-page checks are live at ${origin}/check, while full multi-page audits and unauthenticated repair actions are not live.
- Self-serve API setup is owner-scoped at ${origin}/api/developer, with API keys from ${origin}/api/developer/tokens and lifecycle webhooks from ${origin}/api/developer/webhooks.
- Bearer-token API actions agents can use today: POST /v1/audits, GET /v1/audits/{audit_id}, GET /v1/audits/{audit_id}/issues, GET /v1/audits/{audit_id}/report, GET/PATCH /v1/audits/{audit_id}/repair-queue, POST /v1/audits/{audit_id}/repair-actions, PATCH /v1/audits/{audit_id}/repair-actions/{action_id}, GET /v1/audits/{audit_id}/repair-actions/{action_id}/implementation.md, GET /v1/audits/{audit_id}/repair-actions/{action_id}/proof.md, GET /v1/projects, POST /v1/large-crawls, and GET /v1/large-crawls/{large_crawl_id}.
- Webhook events agents can subscribe to today: audit.completed, audit.failed, repair_action.drafted, repair_action.approved, repair_action.applied, repair_action.fixed, and repair_action.regressed.
- Worker-only large-crawl batch claim/process/proof endpoints require x-seofixkit-worker-token and are not available to normal bearer API keys.
- There is no live SEO Fix Kit MCP endpoint today; agents should use the documented REST and markdown proof endpoints.

Current product boundary:
- Public methodology and package pages describe the live proof loop, limits, and package ladder; they are not a public anonymous audit.
- Does not sell or claim completed 50,000-page rendered validation; large crawls are early-access staged plans until every batch has page-level proof and merge readiness is clear.
- 100,000+ enterprise rendered crawls and browser-container fleet autoscaling are not live yet.
- Does not provide full-site rank, index, or orphan discovery beyond rendered crawl proof and sitemap inventory samples.
- Does not provide proprietary backlink discovery beyond supplied/imported link-edge history.
- Does not provide live keyword volume providers, traffic estimates, or continuous rank tracking yet.
- Does not provide live AI-engine visibility tracking, AI citation monitoring, or answer-engine sampling. AI Answer Readiness is site-proof only.
- Does not auto-publish growth content, create CMS drafts, open pull requests, or promise rankings/traffic from growth briefs.
- Does not claim paid Proof Monitoring is active unless Dodo subscription checkout and webhook entitlement sync are configured.
- Does not sell live recurring repair agent or agency workspace subscriptions until entitlement billing is wired.
- Does not claim llms.txt is required for Google Search or Google generative search surfaces.
- Does not scrape private Google Business Profile data or discover every citation automatically.
- Does not log into WordPress, Shopify, WooCommerce, Magento, or private CMS/plugin admin settings.
- Implementation packs and repair proof receipts are private handoff/proof documents only; SEO Fix Kit does not publish CMS changes, open GitHub pull requests, merge code, or call provider admin APIs from the browser.
- Does not replace Ahrefs or Semrush.
- Does not provide anonymous multi-page audits; the anonymous surface is a single-page proof check with per-network and per-site rate limits.
- Does not expose unauthenticated agent actions.
- Does not guarantee rankings, traffic, indexing, or revenue.

Useful routes:
- ${origin}/
- ${origin}/check
- ${origin}/api/public-check
- ${origin}/api/health
- ${origin}/api/deep-health
- ${origin}/llms.txt
- ${origin}/privacy
- ${origin}/support
- ${origin}/terms
- ${origin}/demo
- ${origin}/methodology
- ${origin}/packages
- ${origin}/small-business-seo-audit
- ${origin}/rendered-vs-static-seo-audit
- ${origin}/ai-answer-readiness
`;
}

function homeMarkdown(origin) {
  return `# SEO Fix Kit

Proof-backed SEO audits, self-serve repair queue, private implementation packs, and approval-safe repair-agent workflow.

Request a secure email access link to run a rate-limited private audit. The paid Fix Pack is one proof-backed repair pass for one report plus one rerun after fixes. No ranking promise is made.

Public proof before payment:
- Anonymous one-page check: ${origin}/check
- Sample proof report: ${origin}/demo
- Methodology and limits: ${origin}/methodology
- Package ladder: ${origin}/packages
- Intent pages: small-business SEO audit at ${origin}/small-business-seo-audit, rendered-vs-static audits at ${origin}/rendered-vs-static-seo-audit, and site-proof AI Answer Readiness at ${origin}/ai-answer-readiness

Start at ${origin}/.
`;
}

// Serialize a JSON-LD block safely inside a <script> tag.
function ldBlock(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

function pageSocialHead({ origin, title, description, path = "/" }) {
  const url = `${origin}${path}`;
  const image = `${origin}/og-image.svg`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
    isPartOf: { "@type": "WebSite", name: "SEO Fix Kit", url: origin },
    publisher: { "@type": "Organization", name: "SEO Fix Kit", url: origin }
  }).replace(/</g, "\\u003c");
  return `
    <link rel="canonical" href="${url}" />
    <link rel="apple-touch-icon" href="${origin}/apple-touch-icon.svg" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SEO Fix Kit" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${image}" />
    <script type="application/ld+json">${jsonLd}</script>`;
}

function demoHtml(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proof-Backed SEO Repair Demo - SEO Fix Kit</title>
    <meta name="description" content="A public sample showing how SEO Fix Kit refuses static crawler false positives and turns verified issues into repair briefs." />
${pageSocialHead({ origin, title: "Proof-Backed SEO Repair Demo - SEO Fix Kit", description: "A public sample showing how SEO Fix Kit refuses static crawler false positives and turns verified issues into repair briefs.", path: "/demo" })}
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      body { margin: 0; min-width: 320px; }
      main { margin: 0 auto; max-width: 980px; padding: 36px 22px 60px; }
      a { color: #98f0cc; font-weight: 780; text-decoration: none; }
      header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 54px; }
      h1 { font-size: clamp(44px, 9vw, 104px); letter-spacing: 0; line-height: .9; margin: 0 0 18px; max-width: 780px; }
      h2 { font-size: clamp(24px, 3vw, 34px); margin: 0; }
      p, li { color: rgba(251,248,239,.75); font-size: 18px; line-height: 1.6; }
      .kicker { color: #98f0cc; font-size: 13px; font-weight: 880; letter-spacing: .08em; text-transform: uppercase; }
      .grid { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 34px 0; }
      .panel { background: rgba(251,248,239,.055); border: 1px solid rgba(251,248,239,.12); border-radius: 8px; padding: 20px; }
      .panel strong { color: #dcc062; display: block; font-size: 14px; margin-bottom: 10px; text-transform: uppercase; }
      .proof { border-color: rgba(152,240,204,.28); }
      .proof strong { color: #98f0cc; }
      .cta { align-items: center; background: #98f0cc; border-radius: 8px; color: #06100c; display: inline-flex; font-weight: 880; min-height: 48px; padding: 0 18px; }
      code { color: #fbf8ef; white-space: pre-wrap; }
      @media (max-width: 760px) { header { align-items: flex-start; gap: 18px; flex-direction: column; } .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <a href="${origin}/">SEO Fix Kit</a>
        <span class="kicker">Public sample</span>
      </header>
      <section>
        <p class="kicker">Proof loop</p>
        <h1>Do not fix what is not broken.</h1>
        <p>Weak SEO scanners read the raw app shell and invent work. SEO Fix Kit compares raw HTML with the rendered page, shows the proof, and only creates a repair when the browser-visible page is actually wrong.</p>
      </section>
      <section class="grid" aria-label="Sample audit outcome">
        <article class="panel">
          <strong>Static scanner</strong>
          <p>No H1. No internal links. Thin content. Needs cleanup.</p>
        </article>
        <article class="panel proof">
          <strong>Rendered proof</strong>
          <p>Browser render shows a real H1, normal internal links, and substantial page content.</p>
        </article>
        <article class="panel">
          <strong>Repair brief</strong>
          <p>No duplicate H1. No fake internal links. No busywork. Keep monitoring and rerun after real content changes.</p>
        </article>
      </section>
      <section class="panel proof">
        <h2>Sample developer brief</h2>
        <p>The paid beta turns verified findings into a repair queue with acceptance checks and one rerun after fixes.</p>
        <code>- Finding: False positive guarded. H1 exists after render.
- Evidence: Rendered H1 is visible in the final DOM.
- Action: Do not add another H1.
- Acceptance: Re-run audit; finding stays guarded, not queued as a fix.</code>
      </section>
      <section>
        <h2>What this sample proves</h2>
        <p>A useful SEO repair report has to separate a crawler limitation from a real customer problem. The sample shows that SEO Fix Kit does not stop at the first HTML response. It opens the page in a browser, reads the rendered title, description, headings, internal links, schema, social tags, images, and body copy, then records which static warnings should be guarded as false positives.</p>
        <p>That distinction matters for agentic repair work. If a scanner says "add an H1" when the rendered page already has one, an agent could make the site worse by adding duplicate headings. SEO Fix Kit keeps that item out of the repair queue, explains why it was rejected, and points the user toward a rerun instead of fake busywork.</p>
      </section>
      <section class="grid" aria-label="What a paid Fix Pack uses from the sample">
        <article class="panel proof">
          <strong>Buyer proof</strong>
          <p>The report shows the observed page URL, rendered facts, issue evidence, and whether the finding is actionable or guarded.</p>
        </article>
        <article class="panel proof">
          <strong>Repair scope</strong>
          <p>Only proven issues become queue items. Each item has a suggested fix, estimated effort, confidence, and acceptance check.</p>
        </article>
        <article class="panel proof">
          <strong>Rerun standard</strong>
          <p>After a change ships, the same audit path checks whether the issue is fixed, still open, new, or regressed.</p>
        </article>
      </section>
      <section>
        <h2>What this sample does not claim</h2>
        <p>This page is a sample, not an audit of your site. Anonymous one-page checks are live at ${origin}/check: paste a public URL and get rendered proof, guarded false positives, and actionable findings when present — with no account and nothing stored. Full reports still run inside the private beta after secure email access and, for deeper crawls, site verification. Neither the sample nor the one-page check promises rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility. The product standard is the same everywhere: prove the issue, avoid false positives, ask for approval, then rerun the same measurement after the fix.</p>
      </section>
      <p><a class="cta" href="${origin}/check">Check one page now</a></p>
      <p><a href="${origin}/">Request private access</a> · <a href="${origin}/methodology">Read methodology and limits</a> · <a href="${origin}/packages">View package ladder</a> · <a href="${origin}/support">Support and refunds</a></p>
    </main>
  </body>
</html>`;
}

function methodologyHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/methodology",
    title: "Methodology",
    description: "How SEO Fix Kit turns rendered proof into a self-serve repair queue, what it can verify today, and what it does not claim.",
    eyebrow: "Methodology and limits",
    heading: "Proof first. Repairs second. Claims last.",
    lead: "SEO Fix Kit starts with what a browser, sitemap, supplied data, and rerun can prove. The repair agent is a queue and approval system, not an autopilot that edits your site behind your back.",
    body: `
      <section class="band">
        <h2>The proof loop</h2>
        <div class="grid three">
          <article class="panel proof"><strong>1. Render</strong><p>We compare raw HTML with the browser-rendered page, then keep false positives out when the final DOM already has the expected content.</p></article>
          <article class="panel proof"><strong>2. Queue</strong><p>Only proven findings become repair queue items with severity, source proof, suggested action, and an acceptance check.</p></article>
          <article class="panel proof"><strong>3. Re-measure</strong><p>Reruns and weekly monitors are the authority for fixed, still-open, new, or regressed status.</p></article>
        </div>
      </section>
      <section class="band">
        <h2>What is live today</h2>
        <ul class="check-list">
          <li>Anonymous one-page checks at ${origin}/check: paste a public URL and get rendered proof, guarded false positives, and actionable findings when present, with no account and nothing stored.</li>
          <li>Private self-serve audits for authorized sites, with 1-page Lite checks and verified-host crawl depths up to 1,000 pages.</li>
          <li>Rendered page proof, sitemap inventory up to 50,000 discovered URLs, crawl intelligence, resource waterfall proof, platform SEO checks, proof-derived AI Answer Readiness, draft-only growth briefs, competitor homepage benchmarks, and supplied backlink/local/keyword imports.</li>
          <li>Private report repair queues with proof, status, safe drafts, approval state, owner-approved implementation packs, proof receipts after fixed reruns, teammate assignment, account-level next actions, and one Fix Pack checkout path when real fixes exist.</li>
          <li>Developer API and webhook surfaces for owner-scoped audit workflows, including safe repair queue status, separate implementation-pack and proof-receipt endpoints, and repair-action lifecycle events.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Limits we state up front</h2>
        <div class="grid two">
          <article class="panel"><strong>No fake scale claim</strong><p>Large 50,000-page rendered crawls are early-access staged jobs. We do not call them complete until every batch has page-level proof and merge readiness is clear.</p></article>
          <article class="panel"><strong>No AI visibility tracking</strong><p>AI Answer Readiness is proof-derived from rendered pages, schema, canonicals, links, sitemap context, and optional llms.txt. Live answer-engine sampling, AI citation monitoring, and AI visibility score tracking are not live.</p></article>
          <article class="panel"><strong>No backlink database claim</strong><p>Backlink proof starts with supplied/imported rows and link-edge history. SEO Fix Kit does not replace Ahrefs, Semrush, or proprietary backlink discovery.</p></article>
          <article class="panel"><strong>No hidden site writes</strong><p>Agent actions, implementation packs, proof receipts, and growth briefs are records, handoffs, proof artifacts, and reviewable drafts. The browser does not call CMS admin APIs, publish pages, merge code, or use private provider credentials.</p></article>
        </div>
      </section>
      <section class="band">
        <h2>Acceptance standard</h2>
        <p>A repair is treated as proof-backed only when the report names the issue, shows source evidence, gives a concrete fix, and includes an acceptance check that can be rerun. Rankings, traffic, indexing, citations, and revenue are never guaranteed.</p>
      </section>
    `
  });
}

function packagesHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/packages",
    title: "Packages",
    description: "The current SEO Fix Kit package ladder, including free beta audits, one-time Fix Pack checkout, and clearly marked roadmap packages.",
    eyebrow: "Package ladder",
    heading: "Start with proof. Pay only when there is work to do.",
    lead: `The live paid offer is intentionally narrow: one proof-backed repair pass tied to one report, plus one rerun after fixes. Current beta price is ${FIX_PACK_PUBLIC_PRICE}; Dodo checkout remains the final price source at payment time.`,
    body: `
      <section class="package-grid" aria-label="SEO Fix Kit package ladder">
        <article class="package-card live">
          <span>Live beta</span>
          <h2>Private audit</h2>
          <p>Run a rate-limited proof audit from a secure access link. Verified hosts unlock normal self-serve crawl depth. New: check one public page anonymously with no account.</p>
          <ul>
            <li>Rendered proof report</li>
            <li>Repair queue when issues are proven</li>
            <li>Account next actions</li>
          </ul>
          <a href="${origin}/">Request access</a>
          <a href="${origin}/check">Check one page now</a>
        </article>
        <article class="package-card live">
          <span>Live checkout when eligible</span>
          <h2>SEO Fix Pack</h2>
          <p class="package-price"><strong>${FIX_PACK_PUBLIC_PRICE}</strong><br />For one eligible report in beta; Dodo checkout is final at payment time.</p>
          <p>One proof-backed repair pass tied to the report queue, plus one rerun after fixes. Offered only from a report with real fixes.</p>
          <ul>
            <li>Public price is visible before checkout</li>
            <li>Dodo shows the final checkout price</li>
            <li>No ranking or traffic guarantee</li>
            <li>Refund guard if payment succeeds but the queue cannot start</li>
          </ul>
          <a href="${origin}/support">Read support terms</a>
        </article>
        <article class="package-card">
          <span>Config-gated subscription</span>
          <h2>Proof Monitoring</h2>
          <p class="package-price"><strong>$49-$99/mo target</strong><br />Only appears in private billing when the Dodo subscription product and webhook entitlement sync are configured.</p>
          <p>Weekly proof reruns, report deltas, and change alerts for verified sites. Monitoring does not include repair execution.</p>
          <ul>
            <li>Verified sites only</li>
            <li>Access activates after Dodo webhook entitlement</li>
            <li>No CMS writes or GitHub pull requests</li>
          </ul>
          <a href="${origin}/methodology">See monitoring limits</a>
        </article>
        <article class="package-card">
          <span>Roadmap</span>
          <h2>Repair Agent</h2>
          <p>Private implementation packs are live as handoffs for approved actions, and proof receipts are live after fixed rerun proof. Recurring subscription workflow, CMS writes, and GitHub PR creation remain roadmap until explicit integrations exist.</p>
          <ul>
            <li>No live subscription yet</li>
            <li>No CMS writes yet</li>
            <li>No GitHub PR creation yet</li>
          </ul>
          <a href="${origin}/methodology">See limits</a>
        </article>
        <article class="package-card">
          <span>Roadmap</span>
          <h2>Growth Add-On</h2>
          <p>Reports now include draft-only opportunities from verified gaps such as low CTR imports, competitor gaps, structured content, and crawl proof. The paid package remains roadmap until billing and integrations are live.</p>
          <ul>
            <li>No article-volume autopilot</li>
            <li>No auto-publishing or CMS drafts</li>
            <li>No backlink exchange network</li>
            <li>No unqualified AI citation claims</li>
          </ul>
          <a href="${origin}/demo">View proof sample</a>
        </article>
      </section>
      <section class="band">
        <h2>Why this ladder exists</h2>
        <p>The product is built to avoid audit noise and over-automation. The first paid step is a small, inspectable repair pass. Future packages only become live when proof, approval controls, billing, and provider safety are implemented.</p>
      </section>
    `
  });
}

function smallBusinessSeoAuditHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/small-business-seo-audit",
    title: "Small Business SEO Audit",
    description: "A proof-backed SEO audit for small businesses: check one public page free, see the rendered evidence behind each finding, and only pay for a repair pass when real fixes exist.",
    eyebrow: "Small-business SEO audit",
    heading: "An SEO audit that shows proof, not homework.",
    lead: "Small businesses lose hours to audit tools that dump red flags and generic checklists. SEO Fix Kit checks one page free, shows the rendered proof behind each finding, and only queues a repair when the browser-visible page is actually wrong.",
    softwareDescription: "Private-beta SEO repair software for small businesses that turns rendered proof into safe repair queues, approval records, and rerun checks.",
    body: `
      <section class="band">
        <h2>What a small-business audit should actually show</h2>
        <ul class="check-list">
          <li>The earliest failure stage on each URL, with page-level evidence you can open and re-check.</li>
          <li>Which findings are real and which are static-crawler false positives on JavaScript-rendered pages.</li>
          <li>A plain-language repair brief with priority, effort, and an acceptance check you can rerun after a change ships.</li>
          <li>Fixed, still-open, new, and regressed status on reruns instead of a one-time red-flag dump.</li>
        </ul>
      </section>
      <section class="grid three" aria-label="How to start">
        <article class="panel proof"><strong>Free one-page check</strong><p>Paste a public URL at ${origin}/check. You get rendered proof, guarded false positives, and actionable findings when present — no account, no email, nothing stored.</p></article>
        <article class="panel"><strong>Private audit for your site</strong><p>Request a secure email access link for rate-limited private audits. Verified hosts unlock self-serve crawl depth up to 1,000 pages per queued audit.</p></article>
        <article class="panel"><strong>Fix Pack only when fixes exist</strong><p>The paid offer is one proof-backed repair pass tied to one report, plus one rerun after fixes. Dodo shows the checkout price before payment.</p></article>
      </section>
      <section class="band">
        <h2>Why proof beats a checklist</h2>
        <p>A generic audit can say "add an H1" to a page whose rendered version already has one. SEO Fix Kit opens the page in a real browser, compares raw HTML with the rendered DOM, and keeps that item out of the repair queue. The same standard applies to every report: render, prove, queue, re-measure.</p>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>This page is a landing page, not an audit of your site. The free check covers one public page at one moment; full multi-page reports run inside the private beta. SEO Fix Kit does not replace Ahrefs or Semrush, does not provide live AI citation monitoring or answer-engine sampling, and never guarantees rankings, traffic, indexing, or revenue.</p>
      </section>
      <section class="band">
        <h2>Start with proof</h2>
        <p><a class="cta" href="${origin}/check">Check one page now</a></p>
        <p><a href="${origin}/demo">View the proof sample</a> · <a href="${origin}/methodology">Read methodology and limits</a> · <a href="${origin}/packages">View package ladder</a></p>
      </section>
    `,
    faq: [
      { q: "Is there a free way to check my site before requesting access?", a: "Yes. The one-page check at /check accepts one public URL, renders it in a real browser, and returns proof fields and findings when present, with no account, no email, and nothing stored." },
      { q: "What does the paid Fix Pack include?", a: "One proof-backed repair pass tied to one saved report, plus one rerun after fixes. Dodo shows the checkout price before payment, and no ranking, traffic, or revenue promise is made." },
      { q: "Do I need to verify my site to start?", a: "A one-page Lite check runs before verification. Verified hosts unlock normal self-serve crawl depth up to 1,000 pages per queued audit." },
      { q: "Will SEO Fix Kit guarantee my rankings?", a: "No. Reports are diagnostic and reflect what the crawl and browser render could observe at scan time. Rankings, traffic, indexing, and revenue are never guaranteed." }
    ]
  });
}

function renderedVsStaticAuditHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/rendered-vs-static-seo-audit",
    title: "Rendered vs Static SEO Audit",
    description: "Why static crawlers invent SEO problems on JavaScript-rendered pages, and how SEO Fix Kit compares raw HTML with the rendered DOM to keep false positives out of the repair queue.",
    eyebrow: "Rendered vs static audit",
    heading: "Static crawlers invent work. Rendered proof does not.",
    lead: "JavaScript-heavy sites fail static scanners that read the raw app shell. SEO Fix Kit opens the page in a real browser, compares raw HTML with the rendered DOM, and only creates a repair when the browser-visible page is actually wrong.",
    softwareDescription: "Private-beta SEO repair software that renders pages in a real browser to compare static HTML with the final DOM and guard static-crawler false positives.",
    body: `
      <section class="grid three" aria-label="Static scanner vs rendered proof">
        <article class="panel"><strong>Static scanner</strong><p>No H1. No internal links. Thin content. Needs cleanup.</p></article>
        <article class="panel proof"><strong>Rendered proof</strong><p>Browser render shows a real H1, normal internal links, and substantial page content.</p></article>
        <article class="panel"><strong>Repair brief</strong><p>No duplicate H1. No fake internal links. No busywork. Keep monitoring and rerun after real content changes.</p></article>
      </section>
      <section class="band">
        <h2>Why this matters for repair work</h2>
        <p>An agent that trusts a static crawl can make a site worse: if a scanner says "add an H1" when the rendered page already has one, the suggested repair is a duplicate heading, not a fix. Rendered-vs-static comparison separates a crawler limitation from a real customer problem, so the repair queue only receives proven findings.</p>
      </section>
      <section class="band">
        <h2>Where you can see it live</h2>
        <ul class="check-list">
          <li>${origin}/demo: the public sample shows a static scanner's false positive against the rendered proof, step by step.</li>
          <li>${origin}/check: paste any public URL and get rendered proof, guarded false positives, and actionable findings when present — no account and nothing stored.</li>
          <li>Private reports for verified sites include rendered crawl intelligence, resource waterfall proof, and rerun deltas.</li>
        </ul>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>The one-page check covers a single public URL, not a full site audit. Full multi-page reports run inside the private beta. Rendered proof does not guarantee rankings, traffic, indexing, revenue, or AI citations, and SEO Fix Kit does not provide live answer-engine sampling or citation monitoring.</p>
      </section>
      <section class="band">
        <h2>Start with proof</h2>
        <p><a class="cta" href="${origin}/check">Check one page now</a></p>
        <p><a href="${origin}/demo">View the proof sample</a> · <a href="${origin}/methodology">Read methodology and limits</a> · <a href="${origin}/packages">View package ladder</a></p>
      </section>
    `,
    faq: [
      { q: "Why does my static SEO tool report problems I cannot see in the browser?", a: "Static scanners read the raw HTML response and miss content rendered by JavaScript. SEO Fix Kit renders the page in a real browser and only reports what the final DOM actually shows." },
      { q: "Can I see a rendered-vs-static example before signing up?", a: "Yes. The public sample at /demo shows a static scanner false positive against the rendered proof, and the free one-page check at /check runs the same proof loop on any public URL." },
      { q: "Does rendered proof mean guaranteed fixes or rankings?", a: "No. Every report is diagnostic and reflects what the crawl could observe at scan time. Rankings, traffic, indexing, revenue, and AI citations are never guaranteed." },
      { q: "How does the repair queue use rendered proof?", a: "Only proven findings become queue items. Each item keeps its source proof, suggested action, effort estimate, and an acceptance check that can be rerun after a change ships." }
    ]
  });
}

function aiAnswerReadinessHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/ai-answer-readiness",
    title: "AI Answer Readiness Check",
    description: "A site-proof AI Answer Readiness check: rendered content depth, helpful schema, canonical and internal-link clarity, question-led structure, sitemap context, and optional llms.txt reachability — no live citation monitoring.",
    eyebrow: "AI Answer Readiness",
    heading: "A site-proof AI readiness check, not a citation tracker.",
    lead: "AI search visibility starts with content and markup answer engines can actually use. SEO Fix Kit derives AI Answer Readiness from your rendered pages, schema, links, sitemap context, and optional llms.txt — it does not sample live answer engines or monitor citations.",
    softwareDescription: "Private-beta SEO repair software with proof-derived AI Answer Readiness checks built from rendered content, schema, canonical and internal-link clarity, sitemap context, and optional llms.txt reachability.",
    body: `
      <section class="band">
        <h2>What the readiness check measures</h2>
        <ul class="check-list">
          <li>Rendered content depth: whether the browser-visible page carries substantive, crawlable text.</li>
          <li>Helpful schema: Organization, WebSite, SoftwareApplication, WebPage, FAQPage, and product markup that names entities clearly.</li>
          <li>Canonical and internal-link clarity: one canonical per URL and a link graph an engine can follow.</li>
          <li>Question-led structure: headings and copy that answer the questions searchers and answer engines ask.</li>
          <li>Sitemap context and coverage, plus optional llms.txt reachability when present.</li>
        </ul>
      </section>
      <section class="grid two" aria-label="Readiness boundaries">
        <article class="panel"><strong>No live answer-engine sampling</strong><p>SEO Fix Kit does not query ChatGPT, Perplexity, Google AI Overview, or other engines to see what they answer about your site.</p></article>
        <article class="panel"><strong>No AI citation monitoring</strong><p>There is no live tracking of citations, mentions, or visibility scores across AI engines.</p></article>
        <article class="panel"><strong>llms.txt stays optional</strong><p>llms.txt reachability is an optional signal. SEO Fix Kit does not claim llms.txt is required for Google Search or generative search surfaces.</p></article>
        <article class="panel"><strong>Site-proof only</strong><p>Readiness is derived from your rendered pages, schema, links, sitemap, and optional llms.txt — not from any engine's internal behavior.</p></article>
      </section>
      <section class="band">
        <h2>How to get the check</h2>
        <ul class="check-list">
          <li>Free: paste a public URL at ${origin}/check for rendered proof, guarded false positives, and actionable findings when present — no account and nothing stored.</li>
          <li>Private reports for verified sites include proof-derived AI Answer Readiness checks beside the rendered crawl evidence.</li>
          <li>Read the exact boundaries on ${origin}/methodology before relying on any readiness signal.</li>
        </ul>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>This page is a landing page, not a readiness report for your site. AI Answer Readiness does not guarantee rankings, traffic, AI citations, or revenue, and it does not replace live AI visibility tracking, which is not part of the product.</p>
      </section>
      <section class="band">
        <h2>Start with proof</h2>
        <p><a class="cta" href="${origin}/check">Check one page now</a></p>
        <p><a href="${origin}/demo">View the proof sample</a> · <a href="${origin}/methodology">Read methodology and limits</a> · <a href="${origin}/packages">View package ladder</a></p>
      </section>
    `,
    faq: [
      { q: "Is AI Answer Readiness the same as monitoring citations in ChatGPT or Perplexity?", a: "No. Readiness is site-proof: it evaluates what your rendered pages, schema, links, sitemap context, and optional llms.txt allow an answer engine to understand. Live answer-engine sampling, AI citation monitoring, and AI visibility score tracking are not live." },
      { q: "Do I need an llms.txt file to pass the check?", a: "No. llms.txt reachability is an optional signal. SEO Fix Kit does not claim llms.txt is required for Google Search or generative search surfaces." },
      { q: "Can I check my site's AI readiness for free?", a: "The anonymous one-page check at /check renders one public URL and returns proof fields and findings when present. Full proof-derived AI Answer Readiness checks appear in private reports for verified sites." },
      { q: "Does a good readiness signal guarantee AI visibility?", a: "No. Readiness is a site-proof diagnostic, and rankings, traffic, AI citations, and revenue are never guaranteed." }
    ]
  });
}

// Shared public product page shell. `faq` is an array of { q, a } pairs that is
// rendered as a visible section AND emitted as FAQPage JSON-LD, so machine
// schema can never drift from the visible copy. `softwareDescription`, when
// provided, adds a truthful SoftwareApplication block for the tool itself.
function publicProductPageHtml({ origin, path, title, description, eyebrow, heading, lead, body, faq = [], softwareDescription = null }) {
  const extraLd = [];
  if (softwareDescription) {
    extraLd.push(
      ldBlock({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "SEO Fix Kit",
        applicationCategory: "SEO software",
        operatingSystem: "Web",
        url: origin,
        provider: { "@type": "Organization", name: "SEO Fix Kit", url: origin },
        description: softwareDescription
      })
    );
  }
  if (faq.length > 0) {
    extraLd.push(
      ldBlock({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a }
        }))
      })
    );
  }
  const faqSection = faq.length > 0
    ? `
      <section class="band" aria-label="Frequently asked questions">
        <h2>Frequently asked questions</h2>
        <div class="faq-list">
          ${faq.map(({ q, a }) => `<article class="faq-item"><h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p></article>`).join("")}
        </div>
      </section>
    `
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - SEO Fix Kit</title>
    <meta name="description" content="${escapeHtml(description)}" />
${pageSocialHead({ origin, title: `${title} - SEO Fix Kit`, description, path })}
${extraLd.join("\n")}
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; }
      main { margin: 0 auto; max-width: 1120px; padding: 36px 22px 68px; }
      a { color: #98f0cc; font-weight: 780; text-decoration: none; }
      header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 72px; }
      nav { display: flex; flex-wrap: wrap; gap: 16px; justify-content: flex-end; }
      h1 { font-size: clamp(46px, 8vw, 108px); letter-spacing: 0; line-height: .88; margin: 0; max-width: 820px; }
      h2 { font-size: clamp(24px, 3vw, 34px); line-height: 1.08; margin: 0 0 14px; }
      h3 { font-size: 17px; line-height: 1.4; margin: 0 0 8px; }
      p, li { color: rgba(251,248,239,.76); font-size: 17px; line-height: 1.62; }
      ul { margin: 0; padding-left: 22px; }
      .eyebrow { color: #98f0cc; font-size: 13px; font-weight: 880; letter-spacing: 0; margin: 0 0 18px; text-transform: uppercase; }
      .lead { font-size: clamp(19px, 2.4vw, 25px); max-width: 760px; }
      .hero { margin-bottom: 48px; }
      .band { border-top: 1px solid rgba(251,248,239,.14); padding: 32px 0; }
      .grid, .package-grid { display: grid; gap: 14px; }
      .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .grid.two, .package-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .panel, .package-card { background: rgba(251,248,239,.055); border: 1px solid rgba(251,248,239,.12); border-radius: 8px; display: grid; gap: 10px; padding: 20px; }
      .panel.proof, .package-card.live { border-color: rgba(152,240,204,.28); }
      .panel strong, .package-card span { color: #98f0cc; font-size: 12px; font-weight: 860; text-transform: uppercase; }
      .package-card h2 { margin: 0; }
      .package-price { border-left: 3px solid #dcc062; color: #fbf8ef; margin: 2px 0; padding-left: 12px; }
      .package-price strong { color: #dcc062; font-size: 22px; }
      .package-card a { align-items: center; border: 1px solid rgba(152,240,204,.32); border-radius: 8px; display: inline-flex; justify-content: center; min-height: 44px; padding: 0 14px; width: fit-content; }
      .cta { align-items: center; background: #98f0cc; border-radius: 8px; color: #06100c; display: inline-flex; font-weight: 880; min-height: 48px; padding: 0 18px; }
      .check-list { display: grid; gap: 12px; list-style: none; padding-left: 0; }
      .check-list li { background: rgba(7,13,10,.58); border: 1px solid rgba(251,248,239,.1); border-radius: 8px; padding: 14px 16px; }
      .faq-list { display: grid; gap: 14px; }
      .faq-item { background: rgba(251,248,239,.055); border: 1px solid rgba(251,248,239,.12); border-radius: 8px; padding: 18px 20px; }
      @media (max-width: 760px) { header { align-items: flex-start; flex-direction: column; gap: 18px; margin-bottom: 44px; } nav { justify-content: flex-start; } .grid.three, .grid.two, .package-grid { grid-template-columns: 1fr; } main { padding-top: 26px; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <a href="${origin}/">SEO Fix Kit</a>
        <nav aria-label="Public pages">
          <a href="${origin}/demo">Demo</a>
          <a href="${origin}/methodology">Methodology</a>
          <a href="${origin}/packages">Packages</a>
        </nav>
      </header>
      <section class="hero">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(heading)}</h1>
        <p class="lead">${escapeHtml(lead)}</p>
      </section>
      ${body}
      ${faqSection}
    </main>
  </body>
</html>`;
}

function privacyHtml(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy - SEO Fix Kit</title>
    <meta name="description" content="SEO Fix Kit privacy note for access requests, private beta audits, payments, and fulfillment." />
${pageSocialHead({ origin, title: "Privacy - SEO Fix Kit", description: "SEO Fix Kit privacy note for access requests, private beta audits, payments, and fulfillment.", path: "/privacy" })}
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      body { margin: 0; min-width: 320px; }
      main { margin: 0 auto; max-width: 760px; padding: 48px 22px; }
      a { color: #98f0cc; font-weight: 760; text-decoration: none; }
      h1 { font-size: clamp(42px, 8vw, 76px); letter-spacing: 0; line-height: .92; margin: 0 0 24px; }
      p, li { color: rgba(251,248,239,.76); font-size: 18px; line-height: 1.62; }
      ul { padding-left: 22px; }
    </style>
  </head>
  <body>
    <main>
      <a href="${origin}/">SEO Fix Kit</a>
      <h1>Privacy</h1>
      <p>SEO Fix Kit ("we") collects the information needed to run self-serve access, create proof-backed SEO reports, process paid Fix Pack checkout, and deliver repair updates. We are the data controller for this information; reach us at <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</p>
      <ul>
        <li>We store your email address, signup source, UTM fields, landing path, referrer, browser user agent, country code when Cloudflare provides it, signup timestamps, and short-lived access-link records.</li>
        <li>Private audits store the website URL, rendered-page audit findings, screenshots or extracted page facts when available, report owner, beta session reference, target host, and report expiry timestamp.</li>
        <li>Fix Pack records store checkout status, Dodo payment identifiers, payment amount and currency, fulfillment notes, final rerun report links, delivery notifications, and admin audit events. We never see or store your card details; Dodo Payments processes payment as merchant of record under its own privacy policy.</li>
        <li>Cookies and local browser storage: we set only essential, HttpOnly session cookies (beta login, admin login, and report-unlock state), and the beta dashboard may keep your access email and dashboard state in sessionStorage on your device. No advertising, analytics, or cross-site tracking cookies are set.</li>
        <li>Processors: Cloudflare (hosting, database, email delivery, browser rendering — data may be processed on Cloudflare's global network) and Dodo Payments (checkout and payment webhooks).</li>
        <li>Retention: reports expire after 30 days, except reports tied to a paid Fix Pack, which stay available while we operate the service. Admin logs, payment records, and notification logs are kept for operating, support, abuse prevention, and payment reconciliation. Rate-limit counters expire automatically.</li>
        <li>We do not sell your personal data and do not send unrelated promotions.</li>
        <li>Deletion and access: email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> (or reply to any email we send) to request a copy or deletion of your beta data. We honor verified requests within 30 days, except records we must keep for payment reconciliation or abuse prevention.</li>
      </ul>
      <p>Last updated: June 15, 2026.</p>
    </main>
  </body>
</html>`;
}

function supportHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Support",
    path: "/support",
    description: "Get help with SEO Fix Kit: contact support for Fix Pack delivery, billing, and refund questions, or security reports. We reply from support@seofixkit.com.",
    body: `
      <p>Email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> for any question, billing issue, or problem — including when an expected email never arrived. You can also reply to any SEO Fix Kit email; we use that thread to verify account ownership.</p>

      <h2>What to include</h2>
      <p>For the fastest answer, include the account email, audited domain, report link or report id, checkout email if different, and the exact repair queue item you are asking about. If the question is about a rerun, include what changed on the site and when it shipped. If the question is about billing, include the Dodo receipt email, payment date, and whether the Fix Pack repair pass has already started.</p>

      <h2>Fix Pack support</h2>
      <ul>
        <li>Fix Pack covers one proof-backed repair pass for one report plus one rerun after fixes.</li>
        <li>No ranking, traffic, or revenue promise is made.</li>
        <li>If payment succeeds but the repair queue cannot start, you are entitled to a full refund.</li>
        <li>Refunds: full refund on request within 14 days of payment if the repair pass has not started. After work starts or delivery, requests are reviewed against the Dodo payment record, report proof, and fulfillment state.</li>
        <li>Security or abuse reports should include the affected URL, account email, and timestamp.</li>
      </ul>

      <h2>Delivery expectations</h2>
      <p>The paid beta is deliberately narrow. We review the saved report, confirm which findings are supported by proof, prepare repair proposals, and keep delivery notes tied to that report. Some fixes are handled as human-readable implementation guidance, some as safe draft actions, and some may be marked unsupported when the product cannot safely execute them yet. We do not log into private CMS accounts, publish changes, merge code, or call provider admin APIs from the browser.</p>

      <h2>Security and abuse</h2>
      <p>Security reports should include the affected route, account email if relevant, timestamp, browser details, and clear reproduction steps. Do not send secrets, private keys, passwords, payment card numbers, or production credentials by email. If you believe a report exposes data from a site or account you do not own, stop using the data and contact support immediately so we can investigate and lock down the affected report.</p>

      <h2>Ownership and deletion</h2>
      <p>SEO Fix Kit is for sites you own or are authorized to audit. We may pause audits, delete reports, or revoke access when ownership is unclear, the target appears abusive, or the crawl could overload a third-party site. To request deletion or a copy of beta data, email from the account address or reply to a SEO Fix Kit email thread so ownership can be verified.</p>
      <p>Last updated: June 19, 2026.</p>
      <p><a href="${origin}/privacy">Privacy</a> · <a href="${origin}/terms">Terms</a> · <a href="${origin}/methodology">Methodology</a> · <a href="${origin}/packages">Packages</a></p>
    `
  });
}

function termsHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Terms",
    path: "/terms",
    description: "SEO Fix Kit product terms for audits, Fix Pack checkout, refunds, and fulfillment.",
    body: `
      <p>These terms govern your use of SEO Fix Kit at seofixkit.com ("the service", "we", "us"). By requesting access, running an audit, or purchasing a Fix Pack you agree to them. Contact: <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</p>

      <h2>The service</h2>
      <ul>
        <li>SEO Fix Kit provides proof-backed SEO audits and a paid Fix Pack repair service for proven findings in one report plus one rerun after fixes.</li>
        <li>Reports are diagnostic. They reflect what the crawl and browser render could observe at scan time and may miss issues outside that scope.</li>
        <li>No ranking, indexing, traffic, revenue, or search-engine outcome is promised or implied, before or after repairs.</li>
        <li>The service is in active development; features may change, and beta access may be adjusted or revoked for abuse.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Audit only sites you own or are explicitly authorized to audit. Site verification exists to enforce this.</li>
        <li>Self-serve audits are rate-limited and may be paused for abuse, excessive load, security concerns, or unsupported sites.</li>
        <li>Do not use the service to probe, attack, or overload third-party sites or infrastructure.</li>
      </ul>

      <h2>Payments and refunds</h2>
      <ul>
        <li>Checkout, payment processing, currency handling, refunds, and disputes are processed by Dodo Payments as merchant of record. The price shown at checkout is the price charged.</li>
        <li>If your Fix Pack repair pass has not started, you may request a full refund within 14 days of payment by emailing <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</li>
        <li>After repair work has started or been delivered, refund requests are reviewed against the payment record, the report proof, and the fulfillment state, and may be granted in full, in part, or declined.</li>
        <li>If payment succeeds but the repair queue cannot start, you are entitled to a full refund.</li>
      </ul>

      <h2>Liability</h2>
      <ul>
        <li>The service is provided "as is" without warranties of any kind to the extent permitted by law.</li>
        <li>You remain responsible for changes you (or your developers) make to your site, including changes based on our reports and briefs.</li>
        <li>To the extent permitted by law, our total liability for any claim related to the service is limited to the amount you paid us in the three months before the claim, and we are not liable for indirect, incidental, or consequential damages, including lost profits or lost rankings.</li>
      </ul>

      <h2>General</h2>
      <ul>
        <li>We may update these terms; material changes will be reflected on this page with a new date. Continued use after a change means acceptance.</li>
        <li>These terms are governed by the laws of India, without regard to conflict-of-law rules.</li>
        <li>Questions about these terms or your account: <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</li>
      </ul>
      <p>Last updated: June 12, 2026.</p>
      <p><a href="${origin}/privacy">Privacy</a> · <a href="${origin}/support">Support</a></p>
    `
  });
}

function policyPageHtml({ origin, title, description, body, path = "/" }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - SEO Fix Kit</title>
    <meta name="description" content="${escapeHtml(description)}" />
${pageSocialHead({ origin, title: `${title} - SEO Fix Kit`, description, path })}
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      body { margin: 0; min-width: 320px; }
      main { margin: 0 auto; max-width: 760px; padding: 48px 22px; }
      a { color: #98f0cc; font-weight: 760; text-decoration: none; }
      h1 { font-size: clamp(42px, 8vw, 76px); letter-spacing: 0; line-height: .92; margin: 0 0 24px; }
      h2 { font-size: clamp(22px, 3vw, 28px); margin: 32px 0 8px; }
      p, li { color: rgba(251,248,239,.76); font-size: 18px; line-height: 1.62; }
      ul { padding-left: 22px; }
    </style>
  </head>
  <body>
    <main>
      <a href="${origin}/">SEO Fix Kit</a>
      <h1>${escapeHtml(title)}</h1>
      ${body}
    </main>
  </body>
</html>`;
}

export {
  aiAnswerReadinessHtml,
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  packagesHtml,
  policyPageHtml,
  privacyHtml,
  renderedVsStaticAuditHtml,
  smallBusinessSeoAuditHtml,
  supportHtml,
  termsHtml
};
