# Lane 1 report: social-image check verification (item 47d8d4db3f)

Branch: none (verified against origin/main @ d82db0c)

## Status

Already fixed on origin/main by merged PR #132
(commit 7fcbf2b, "fix: verify social images load instead of trusting tag
presence alone", merged 2026-08-14). No new code change was needed; this run
verifies the shipped state and proves it with the existing test suite.

## What the item asked for

1. The engine's social-image check must not be presence-only: a declared
   og:image/twitter:image must actually load as an image, or be reported broken.
2. The generated snippet must not blindly point at `${origin}/og-image.png`
   (a guessed path that often does not exist — seo-fix-kit itself ships
   og-image.svg).

## What is landed in origin/main

- `shared/audit-engine.js`
  - `checkSocialImages(pages)` fetches each declared og:image/twitter:image
    through the same `checkResource` pipeline as other resources (HEAD with GET
    fallback, redirects, SSRF/private-DNS guards, timeouts). A declared image
    is `ok` only when the response returns an image content-type, or a
    recognized image extension when the server sends no content-type at all.
    A 200 that is text/html is not a working social image.
  - `buildFindings` emits a "Social share image is not loadable" finding with
    the specific broken URL/status/content-type as evidence when a declared
    tag fails.
  - `buildSocialSnippet(url, facts, socialImages)` only references a verified
    live same-origin image; otherwise it names `${origin}/og-image.png` as an
    explicit placeholder the customer must create, with an HTML comment saying
    so.
  - `buildFixPack` passes `socialImages` through so the fix-pack "Social
    preview tags" snippet uses the same verified-live logic.
- `worker/routes/demo-proof.js` keeps the public sample truthful by storing
  the new placeholder comment.
- `shared/audit-engine.test.mjs` regression tests cover all three aspects.

## Proof

Ran the full audit-engine suite on this worktree (HEAD == origin/main d82db0c):

```
node --test shared/audit-engine.test.mjs
# tests 33
# pass 33
# fail 0
```

The social-image tests specifically verify:

- declared-but-not-loadable social images produce a broken-preview finding
  (200 with content-type text/html is not treated as a working image);
- declared-and-loadable images are not reported broken;
- the snippet never guesses an unverified og-image path when no working social
  image exists — it names the placeholder with a "Create ... (1200x630)"
  comment;
- the snippet uses the verified live og:image URL when one exists, and the
  fix-pack social preview snippet matches it and never falls back to
  og-image.png.

## Files touched by this run

- `.lane/reports/lane1-social-image-check-verification.md` (this report)
