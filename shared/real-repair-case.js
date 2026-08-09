// Real completed beta repair published at /proof.
//
// Facts are sourced from ops/repair-proofs/2026-06-20-tinystudio-before-after.md
// (merged in PR #50) and were re-verified live for this publication:
// - Before report tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b, intermediate
//   rerun tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50, and final rerun
//   tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961 all resolve on the live
//   site (HTTP 200 on /beta/reports/...).
// - TinyStudio pull requests #4 ("Add TinyStudio static SEO repair bundle",
//   merged 07acd07b3e11ee7504a0d95292a42cdd6f8a1ba1) and #5 ("Add TinyStudio HSTS
//   Pages header", merged a83e0e2ade3085725779a17b3837355f9abb02f7) are merged.
// - Cloudflare Pages deploys 9561c6c0.tiny-studio-3f5.pages.dev and
//   1b112337.tiny-studio-3f5.pages.dev and https://tinystudio.in/ all return 200.
//
// This is the founder's own site (listed in ops/audit-batches/owned-project-targets.json
// as "Tiny Studio portfolio"), repaired through the production audit and Fix Pack flow.
// It is published with consent and redaction as one reproducible case; it is not a
// third-party paying customer outcome. Nothing here claims rankings, traffic,
// indexing, revenue, AI citations, or that SEOFixKit published or merged the changes.

const REAL_REPAIR_CASE = {
  id: "tinystudio-2026-06-20",
  siteLabel: "Tiny Studio portfolio",
  siteUrl: "https://tinystudio.in/",
  host: "tinystudio.in",
  captured: "2026-06-20",
  before: {
    reportId: "tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b",
    reportUrl:
      "https://seofixkit.com/beta/reports/tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b",
    score: 85,
    pages: 2,
    findings: 7,
    issues: [
      { title: "Render-blocking resources on home", page: "home" },
      { title: "Apple touch icon missing on home", page: "home" },
      { title: "Render-blocking resources on /support", page: "/support" },
      { title: "Heading hierarchy needs cleanup on /support", page: "/support" },
      { title: "Apple touch icon missing on /support", page: "/support" },
      { title: "Structured data opportunity on /support", page: "/support" },
      { title: "Optional /llms.txt advisory", page: "site-wide" }
    ]
  },
  repair: {
    summary:
      "An owner-approved static SEO repair bundle plus an HSTS header follow-up, merged into the Tiny Studio portfolio repository and deployed to Cloudflare Pages.",
    appliedBy: "the site owner (operator of the audited site)",
    pullRequests: [
      {
        id: "nish3451/tinystudio-in#4",
        label: "Add TinyStudio static SEO repair bundle",
        mergedCommit: "07acd07b3e11ee7504a0d95292a42cdd6f8a1ba1",
        deployUrl: "https://9561c6c0.tiny-studio-3f5.pages.dev"
      },
      {
        id: "nish3451/tinystudio-in#5",
        label: "Add TinyStudio HSTS Pages header",
        mergedCommit: "a83e0e2ade3085725779a17b3837355f9abb02f7",
        deployUrl: "https://1b112337.tiny-studio-3f5.pages.dev"
      }
    ],
    changes: [
      "Added tracked static Pages bundle under public/",
      "Removed Google Fonts from the render path",
      "Loaded styles with non-blocking preload",
      "Added apple-touch-icon",
      "Added /llms.txt",
      "Added support ContactPage JSON-LD",
      "Fixed /support heading hierarchy",
      "Replaced Cloudflare email-obfuscation dependency with direct mailto links",
      "Added all referenced social preview images",
      "Expanded Promptly privacy copy to match the product data-handling surface",
      "Added Strict-Transport-Security: max-age=31536000 via public/_headers (HSTS follow-up)"
    ],
    effort:
      "One proof-backed Fix Pack pass: 2 pages audited, 7 proven findings, 2 merged pull requests, 2 Cloudflare Pages deploys."
  },
  reruns: [
    {
      label: "Intermediate after",
      reportId: "tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50",
      reportUrl:
        "https://seofixkit.com/beta/reports/tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50",
      score: 99,
      findings: 2,
      note: "All 7 original findings were resolved; only HSTS header notices remained."
    },
    {
      label: "Final after",
      reportId: "tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961",
      reportUrl:
        "https://seofixkit.com/beta/reports/tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961",
      score: 100,
      findings: 0,
      guardedFalsePositives: 0,
      note: "Final same-host rerun after the HSTS follow-up: 0 findings, 0 guarded false positives."
    }
  ],
  outcome: {
    status: "fixed",
    scoreBefore: 85,
    scoreAfter: 100,
    findingsBefore: 7,
    findingsAfter: 0,
    timeToProof:
      "Before capture, repair merge, and the final same-host rerun all happened on 2026-06-20; the final rerun artifact was captured at 2026-06-20T11:25:08Z."
  },
  boundaries: [
    "This is a real completed repair on the founder's own site, not a third-party paying customer outcome. It is published with consent and redaction.",
    "The repair ran through the production audit and Fix Pack flow; the Fix Pack payment webhook was a test drill, so this case does not prove a real card payment, Dodo-originated webhook delivery, or third-party repair delivery.",
    "SEO Fix Kit did not publish to a CMS, open or merge a GitHub pull request, or call provider admin APIs for this repair; the site owner applied and merged the changes.",
    "Report links open the private owner reports in production; they require the report owner's beta session.",
    "Rankings, traffic, indexing, AI citations, and revenue are not guaranteed before or after this repair.",
    "This receipt is only as current as the final rerun capture on 2026-06-20. If the site changed after that capture, rerun the audit before using it as current proof."
  ]
};

export { REAL_REPAIR_CASE };
