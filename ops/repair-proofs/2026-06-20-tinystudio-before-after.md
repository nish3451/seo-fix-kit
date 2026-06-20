# TinyStudio Before/After Repair Proof

- Date: 2026-06-20
- Site: https://tinystudio.in/
- Customer-style source: SEOFixKit production audit and Fix Pack flow
- Repair target: Tiny Studio portfolio

## Before

- Report: https://seofixkit.com/beta/reports/tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b
- Score: 85
- Pages audited: 2
- Findings: 7
- Findings included:
  - Render-blocking resources on home
  - Apple touch icon missing on home
  - Render-blocking resources on /support
  - Heading hierarchy needs cleanup on /support
  - Apple touch icon missing on /support
  - Structured data opportunity on /support
  - Optional /llms.txt advisory
- Fix Pack proof:
  - Checkout host: checkout.dodopayments.com
  - Request: ccbc580e-280d-44dd-82f2-df23566c6971
  - Webhook drill: processed
  - Post-webhook request status: paid
  - Proposal summary: ready, 11 total, 11 executable

## Repair

- TinyStudio PR #4: https://github.com/nish3451/tinystudio-in/pull/4
- Merged commit: 07acd07b3e11ee7504a0d95292a42cdd6f8a1ba1
- Cloudflare Pages deploy: https://9561c6c0.tiny-studio-3f5.pages.dev
- Changes:
  - Added tracked static Pages bundle under public/
  - Removed Google Fonts from the render path
  - Loaded styles with non-blocking preload
  - Added apple-touch-icon
  - Added /llms.txt
  - Added support ContactPage JSON-LD
  - Fixed /support heading hierarchy
  - Replaced Cloudflare email-obfuscation dependency with direct mailto links
  - Added all referenced social preview images
  - Expanded Promptly privacy copy to match the product data-handling surface

## Intermediate After

- Report: https://seofixkit.com/beta/reports/tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50
- Score: 99
- Pages audited: 2
- Findings: 2
- Result: original 7 findings were resolved; only HSTS header notices remained.

## HSTS Follow-Up

- TinyStudio PR #5: https://github.com/nish3451/tinystudio-in/pull/5
- Merged commit: a83e0e2
- Cloudflare Pages deploy: https://1b112337.tiny-studio-3f5.pages.dev
- Change:
  - Added public/_headers with Strict-Transport-Security: max-age=31536000

## Final After

- Report: https://seofixkit.com/beta/reports/tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961
- Score: 100
- Pages audited: 2
- Findings: 0
- Guarded false positives: 0
- Final audit artifact:
  - /tmp/seofixkit-live-proof-20260620T112507Z/2026-06-20T11-25-08-760Z-owned-project-audit-batch.md
  - /tmp/seofixkit-live-proof-20260620T112507Z/2026-06-20T11-25-08-760Z-owned-project-audit-batch.json

## Verification Used

- TinyStudio:
  - npm run site:prepare
  - npm run ci
  - local route and asset sweep for all sitemap pages and static assets
  - Playwright/SEOFixKit resource-waterfall check on home, /support, and /promptly/privacy
  - autoreview --mode local --no-web-search --stream-engine-output
- Production:
  - curl -I https://tinystudio.in/
  - curl -I https://tinystudio.in/support/
  - SEOFixKit production audit batch against https://tinystudio.in/

## Notes

- The final audit correctly skipped a new Fix Pack checkout because no actionable findings remained.
- This proof supports the claim that SEOFixKit can find, route, package, and re-audit a real issue after an operator-applied repair. It does not prove automated CMS/GitHub execution, product-owned deploys, or arbitrary customer-site publishing yet.
