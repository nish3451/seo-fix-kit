import { escapeHtml } from "../../shared/audit-engine.js";

function llmsText(origin) {
  return `# SEO Fix Kit

SEO Fix Kit is a private-beta, self-serve SEO audit and paid Fix Pack workflow.

Live product claims:
- Visitors can request a secure email access link.
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
- Dodo is the source of truth for visible Fix Pack pricing and checkout.
- Paid Fix Pack fulfillment includes status, delivery notes, and one rerun after fixes.

Current product boundary:
- Does not sell or claim completed 50,000-page rendered validation; large crawls are early-access staged plans until every batch has page-level proof and merge readiness is clear.
- 100,000+ enterprise rendered crawls and browser-container fleet autoscaling are not live yet.
- Does not provide full-site rank, index, or orphan discovery beyond rendered crawl proof and sitemap inventory samples.
- Does not provide proprietary backlink discovery beyond supplied/imported link-edge history.
- Does not provide live keyword volume providers, traffic estimates, or continuous rank tracking yet.
- Does not scrape private Google Business Profile data or discover every citation automatically.
- Does not log into WordPress, Shopify, WooCommerce, Magento, or private CMS/plugin admin settings.
- Does not replace Ahrefs or Semrush.
- Does not provide anonymous public audits.
- Does not guarantee rankings, traffic, indexing, or revenue.

Useful routes:
- ${origin}/
- ${origin}/api/health
- ${origin}/llms.txt
- ${origin}/privacy
- ${origin}/support
- ${origin}/terms
- ${origin}/demo
`;
}

function homeMarkdown(origin) {
  return `# SEO Fix Kit

Proof-backed SEO audits and paid repair queue.

Request a secure email access link to run a rate-limited private audit. The paid Fix Pack is one proof-backed repair pass for one report plus one rerun after fixes. No ranking promise is made.

Start at ${origin}/.
`;
}

function demoHtml(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SEO Fix Kit Demo - Proof-Backed SEO Repair</title>
    <meta name="description" content="A public sample showing how SEO Fix Kit refuses static crawler false positives and turns verified issues into repair briefs." />
    <link rel="canonical" href="${origin}/demo" />
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
      <p><a class="cta" href="${origin}/">Join waitlist</a></p>
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
    <meta name="description" content="SEO Fix Kit privacy note for waitlist, private beta audits, payments, and fulfillment." />
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
        <li>Cookies: we set only essential, HttpOnly session cookies (beta login, admin login, and report-unlock state). No advertising, analytics, or cross-site tracking cookies are set.</li>
        <li>Processors: Cloudflare (hosting, database, email delivery, browser rendering — data may be processed on Cloudflare's global network) and Dodo Payments (checkout and payment webhooks).</li>
        <li>Retention: reports expire after 30 days, except reports tied to a paid Fix Pack, which stay available while we operate the service. Admin logs, payment records, and notification logs are kept for operating, support, abuse prevention, and payment reconciliation. Rate-limit counters expire automatically.</li>
        <li>We do not sell your personal data and do not send unrelated promotions.</li>
        <li>Deletion and access: email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> (or reply to any email we send) to request a copy or deletion of your beta data. We honor verified requests within 30 days, except records we must keep for payment reconciliation or abuse prevention.</li>
      </ul>
      <p>Last updated: June 12, 2026.</p>
    </main>
  </body>
</html>`;
}

function supportHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Support",
    description: "SEO Fix Kit support, refunds, and repair delivery notes.",
    body: `
      <p>Email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> for any question, billing issue, or problem — including when an expected email never arrived. You can also reply to any SEO Fix Kit email; we use that thread to verify account ownership.</p>
      <ul>
        <li>Fix Pack covers one proof-backed repair pass for one report plus one rerun after fixes.</li>
        <li>No ranking, traffic, or revenue promise is made.</li>
        <li>If payment succeeds but the repair queue cannot start, you are entitled to a full refund.</li>
        <li>Refunds: full refund on request within 14 days of payment if the repair pass has not started. After work starts or delivery, requests are reviewed against the Dodo payment record, report proof, and fulfillment state.</li>
        <li>Security or abuse reports should include the affected URL, account email, and timestamp.</li>
      </ul>
      <p>Last updated: June 12, 2026.</p>
      <p><a href="${origin}/privacy">Privacy</a> · <a href="${origin}/terms">Terms</a></p>
    `
  });
}

function termsHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Terms",
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

function policyPageHtml({ origin, title, description, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - SEO Fix Kit</title>
    <meta name="description" content="${escapeHtml(description)}" />
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
  demoHtml,
  homeMarkdown,
  llmsText,
  policyPageHtml,
  privacyHtml,
  supportHtml,
  termsHtml
};
