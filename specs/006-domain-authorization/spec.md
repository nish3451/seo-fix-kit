# Spec: Domain Authorization Gate

## Goal

Move SEO Fix Kit closer to safe self-serve by requiring non-founder users to prove control of a site before running audits against that host.

## Requirements

- A beta user can create a site claim for a public host.
- The app shows two verification options: DNS TXT and HTTPS well-known file.
- The Worker can verify a claim through DNS TXT or HTTPS file proof.
- Self-serve and invite users can only audit a host after that exact host is verified for their account.
- Founder override sessions can still audit any public host for controlled manual testing.
- Account summary includes verified/pending sites so the dashboard can guide the user.
- Audit error copy clearly explains that site verification is required.
- No Cloudflare admin APIs or private provider secrets are exposed to the browser.

## Non-Goals

- No automatic DNS changes.
- No domain registrar integrations.
- No wildcard/subdomain inheritance until we add a stricter public-suffix parser.
