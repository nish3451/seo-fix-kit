// Real engine-captured proof output for the public /demo page.
//
// Every field here is verbatim output from the shared audit engine running
// against SEO Fix Kit's own public test page (/fixture/rendered-page), the
// same page and the same options the private demo audit endpoint uses
// (worker/routes/audits.js runPrivateDemoAudit). Nothing in this module is
// hand-written marketing copy: pages.test.mjs runs the real engine against
// the real fixture and fails when any stored field drifts from live output,
// so the public sample stays truthful as the engine changes.
//
// Origin-dependent strings (canonical URLs, snippet URLs) use the {ORIGIN}
// placeholder and are substituted at render time.
import { VERSION } from "../../shared/audit-engine.js";

export const DEMO_FIXTURE_PATH = "/fixture/rendered-page";

export const DEMO_PROOF = {
  engineVersion: VERSION,
  fixturePath: DEMO_FIXTURE_PATH,
  measured: {
    staticWordCount: 3,
    renderedWordCount: 277,
    renderedH1: "Rendered SaaS page with real content",
    renderedInternalLinkCount: 3,
    renderedTitle: "Proof Demo App Shell"
  },
  guards: [
    {
      severity: "good",
      title: "False positive guarded on home: H1 exists after render",
      why: "A static-only crawler would report a missing H1, but the rendered page contains one.",
      evidence: 'Rendered H1: "Rendered SaaS page with real content"',
      fix: "Do not add another H1 just to satisfy a static crawler."
    },
    {
      severity: "good",
      title: "False positive guarded on home: internal links exist after render",
      why: "Static HTML did not expose links, but the browser-rendered DOM did.",
      evidence: "3 rendered internal links found.",
      fix: "Keep the rendered links crawlable as real anchor tags."
    },
    {
      severity: "good",
      title: "False positive guarded on home: rendered content is not thin",
      why: "The static HTML looks thin, but users and modern crawlers see substantial rendered content.",
      evidence: "277 rendered words found.",
      fix: "No thin-content fix is needed for this page based on rendered text."
    }
  ],
  repairPlan: [
    {
      severity: "critical",
      title: "Canonical conflicts with noindex on home",
      fix: "If the page should rank, remove noindex. If it should not rank, remove misleading canonical consolidation.",
      snippet: ""
    },
    {
      severity: "critical",
      title: "Noindex found on home",
      fix: "Remove noindex if this page should appear in search.",
      snippet: ""
    },
    {
      severity: "warning",
      title: "Social share image incomplete on home",
      fix: "Add 1200x630 Open Graph and Twitter images.",
      snippet: `<!-- The audited page had no working og:image. Create {ORIGIN}/og-image.png (1200x630) or replace it with your real share image. -->
<meta property="og:title" content="Proof Demo App Shell" />
<meta property="og:description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
<meta property="og:image" content="{ORIGIN}/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Proof Demo App Shell" />
<meta name="twitter:description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
<meta name="twitter:image" content="{ORIGIN}/og-image.png" />`
    },
    {
      severity: "notice",
      title: "Apple touch icon missing on home",
      fix: "Add an Apple touch icon.",
      snippet: `<!-- No icon file loaded at {ORIGIN}/apple-touch-icon.png during this audit. Create a square 180x180 PNG there, or point href at your real icon file, before shipping this tag. -->
<link rel="apple-touch-icon" href="{ORIGIN}/apple-touch-icon.png" />`
    },
    {
      severity: "notice",
      title: "Structured data opportunity on home",
      fix: "Add truthful schema that matches visible content.",
      snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Proof Demo App Shell",
  "url": "{ORIGIN}",
  "description": "A JavaScript-rendered demo page for proving false-positive SEO audit behavior."
}
</script>`
    },
    {
      severity: "notice",
      title: "Add answer-ready sections for buyer questions",
      fix: "Add concise sections that answer the buyer's real questions using visible, crawlable HTML. Keep claims specific and support them with proof.",
      snippet: ""
    },
    {
      severity: "notice",
      title: "Add truthful entity schema where useful",
      fix: "Add Organization, WebSite, Product, Service, LocalBusiness, or FAQ schema only when it matches visible page content.",
      snippet: ""
    }
  ]
};

export function demoProofSnippet(snippet, origin) {
  return String(snippet || "").replaceAll("{ORIGIN}", origin);
}
