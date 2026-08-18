# lane 1 — social image verify (2026-08-17)

## Item

> Every worker-rendered public page ships an SVG as `og:image`/`twitter:image`, so shares of /demo, /packages and /c[...] (truncated in dispatch).

Verify pass on `origin/main` (`270dfbb`). The implementation already landed via #132 (see prior verify branch `docs/lane1-social-image-verification`). This lane re-confirms the feature is still live at HEAD and the regression tests still pass.

## What is shipped

A single SVG share image, `public/og-image.svg` (1200x630), is the `og:image`/`twitter:image` for every worker-rendered public page. The constant lives in `worker/routes/pages.js`:

```js
// The SVG share image every worker-rendered public page ships as
// og:image/twitter:image. Single source of truth: public/og-image.svg is the
// 1200x630 file copied into the Worker's asset bundle, and pages.test.mjs
// pins both the tag and the shipped file so shares never point at a dead URL.
const SOCIAL_IMAGE_PATH = "/og-image.svg";
```

The `pageSocialHead({ origin, title, description, path })` helper in the same file emits the canonical link, apple-touch-icon, OG tags, Twitter card (`summary_large_image`), Twitter image, and WebPage JSON-LD using `${origin}${SOCIAL_IMAGE_PATH}` for both image tags. Every worker-rendered page routes through this helper:

- `demoHtml` -> inline `pageSocialHead`
- `checkHtml` (public-check.js) -> inline head with `${origin}${SOCIAL_IMAGE_PATH}`
- `methodologyHtml`, `packagesHtml`, `smallBusinessSeoAuditHtml`, `renderedVsStaticAuditHtml`, `aiAnswerReadinessHtml` -> `publicProductPageHtml` -> `pageSocialHead`
- `privacyHtml` -> inline `pageSocialHead`
- `supportHtml`, `termsHtml` -> `policyPageHtml` -> `pageSocialHead`

The root `/` page is the static SPA shell served from `index.html` and intentionally keeps its jpg waitlist share image (not worker-rendered, so out of scope for this lane).

## Live evidence (HEAD = `270dfbb`)

Rendered each helper with `origin = "https://seofixkit.com"` and read the meta tags:

| Page | `og:image` | `twitter:image` | `twitter:card` |
| --- | --- | --- | --- |
| /demo | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /check | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /methodology | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /packages | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /small-business-seo-audit | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /rendered-vs-static-seo-audit | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /ai-answer-readiness | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /privacy | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /support | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |
| /terms | https://seofixkit.com/og-image.svg | https://seofixkit.com/og-image.svg | summary_large_image |

Asset sanity (read from disk):

```
First line: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="SEO Fix Kit repair report">
viewBox:    viewBox="0 0 1200 630"
Bytes:      3339
Starts with <svg: true
```

## Test runs (HEAD = `270dfbb`, worktree = `seo-fix-kit-lane1-20260817-111539`)

`node --test worker/routes/pages.test.mjs` — 14/14 pass, including:

- `every worker-rendered public page ships the SVG share image as og:image and twitter:image` — ok (1.16 ms)
- `the SVG share image exists and is a real 1200x630 SVG asset` — ok (0.57 ms)

`node --test worker/routes/public-check.test.mjs` — 10/10 pass. No regression in the public-check path that also emits the SOCIAL_IMAGE_PATH.

## Files involved (already on origin/main, no change in this lane)

- `worker/routes/pages.js` — defines `SOCIAL_IMAGE_PATH`, `pageSocialHead`, and routes every public page through them.
- `worker/routes/public-check.js` — `checkHtml` uses `${origin}${SOCIAL_IMAGE_PATH}` for both image tags.
- `worker/routes/pages.test.mjs` — pins the SVG tag and the shipped file.
- `public/og-image.svg` — the 1200x630 share image bundled with the Worker.

## Verdict

The lane 1 social-image check item is in place on `origin/main` at HEAD `270dfbb`. Every worker-rendered public page (`/demo`, `/check`, `/methodology`, `/packages`, `/small-business-seo-audit`, `/rendered-vs-static-seo-audit`, `/ai-answer-readiness`, `/privacy`, `/support`, `/terms`) renders the SVG share image as `og:image` and `twitter:image` with `summary_large_image`, and the regression tests still pass. No code change needed in this lane; this PR is a no-op verify commit on the lane branch.

## Completion marker

LANE1_SOCIAL_IMAGE_VERIFY_COMPLETE
