# Functional Spec

## User

Founder, solo builder, or small SaaS operator who wants a clear answer:
"What is wrong with my site, how do you know, and what exact fix should I apply?"

## Core flow

1. User enters a URL.
2. App crawls the first page and a few same-site links.
3. App compares static HTML against rendered DOM.
4. App returns verified findings, not guesses.
5. User sees exact snippets for high-value fixes.

## Required states

- Empty state with sample URL.
- Loading state that explains the page is being rendered.
- Success state with score, crawl facts, findings, proof, and fixes.
- Error state with plain-English recovery.

## MVP checks

- Title and meta description.
- H1 and heading structure.
- Rendered word count.
- Internal and external links.
- Canonical URL.
- Robots and sitemap.
- Open Graph and Twitter image tags.
- Structured data presence and types.
- Image alt text when images exist.
- Static-vs-rendered drift that can cause false positives.

