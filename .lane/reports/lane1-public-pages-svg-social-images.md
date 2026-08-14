# Lane 1 report: SVG share image on every worker-rendered public page

Branch: lane1/public-pages-svg-social-images
PR: https://github.com/nish3451/seo-fix-kit/pull/142

## Item

Every worker-rendered public page ships an SVG as `og:image`/`twitter:image`,
so shares of /demo, /packages and /check render a preview.

## What I found

The meta tags already existed: `pageSocialHead()` in `worker/routes/pages.js`
emits `${origin}/og-image.svg` for every worker-rendered page, and
`worker/routes/public-check.js` did the same for `/check`. `public/og-image.svg`
(1200x630) exists and Vite ships it into `dist/`, the Worker's asset bundle.
What was missing was any machine proof of the item: no test asserted the tags,
the two call sites hard-coded the URL separately, and nothing verified the
referenced asset ships.

## What changed

- `worker/routes/pages.js`: new `SOCIAL_IMAGE_PATH = "/og-image.svg"` constant,
  used by `pageSocialHead()`, exported.
- `worker/routes/public-check.js`: `/check` now imports and reuses
  `SOCIAL_IMAGE_PATH` instead of a second hard-coded URL.
- `worker/routes/pages.test.mjs`: two new tests —
  1. every worker-rendered public page (`/demo`, `/check`, `/methodology`,
     `/packages`, the three intent landing pages, `/privacy`, `/support`,
     `/terms`) ships the SVG as `og:image` + `twitter:image` with the
     `summary_large_image` card;
  2. `public/og-image.svg` exists and is a real 1200x630 SVG asset.

The root `/` is the SPA app shell (not worker-rendered) and intentionally
keeps its jpg waitlist share image — out of scope of this item.

## Verification

- `npm run test:public-pages` — 13/13 pass (2 new).
- `npm run test:public-check` — 9/9 pass.
- `npm run test:worker-dispatch` — 12/12 pass.
- `npm run build` — green; `dist/og-image.svg` present.
