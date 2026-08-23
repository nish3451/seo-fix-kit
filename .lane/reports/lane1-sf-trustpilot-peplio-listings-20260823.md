# Lane 1 report — SourceForge / Trustpilot / Peplio discovery venues 2026-08-23

Item: `f5919d0e82` — List SEO Fix Kit on SourceForge, Trustpilot, and Peplio.

## Outcome

Folded **SourceForge** (#24), **Trustpilot** (#25), and **Peplio** (#26) into
the discovery-venues ledger with fresh live absence receipts, policy evidence,
`venue-claim check` gate receipts, dispositions, and paste-ready copy. Per the
fleet `venue-claim` contract (allowlist EMPTY; every venue `unknown (not
reviewed)`), no unattended account creation, browser submission, email send, or
payment occurred. Dispositions: SourceForge **NOT_APPLICABLE**, Trustpilot
**NOT_CURRENTLY_ELIGIBLE**, Peplio **NEEDS_NISH** (submit-packet-ready).

## Live evidence (2026-08-23)

| Probe | Result |
| --- | --- |
| https://seofixkit.com/llms.txt | HTTP 200 |
| https://seofixkit.com/packages | HTTP 200; $99.00 one-time beta Fix Pack stated |
| https://seofixkit.com/check | HTTP 200 |
| https://seofixkit.com/methodology | HTTP 200 |
| https://seofixkit.com/proof | HTTP 404 (do not claim repair receipts live) |
| `venue-claim check sourceforge.net seo-fix-kit` | exit=0; disposition `unknown (not reviewed)` |
| `venue-claim check trustpilot.com seo-fix-kit` | exit=0; disposition `unknown (not reviewed)` |
| `venue-claim check peplio.com seo-fix-kit` | exit=0; disposition `unknown (not reviewed)` |
| `venue-policy.json` allowlist | `{}` (updated 2026-08-08) |
| https://sourceforge.net/ | HTTP 200 |
| https://sourceforge.net/search/?q=%22seo+fix+kit%22 | HTTP 404; 0 `sourceforge.net` links with `seofix` |
| Bing `site:sourceforge.net "seo fix kit"` | HTTP 200; COUNT=0 |
| Bing `site:sourceforge.net seofixkit` | HTTP 200; COUNT=0 |
| DDG lite `site:sourceforge.net "seo fix kit"` | HTTP 202 wall; COUNT=0 |
| DDG lite `site:sourceforge.net seofixkit` | HTTP 202 wall; COUNT=0 |
| SourceForge SOP doc URL | HTTP 404 (no quotable proprietary-listing permission) |
| https://slashdotmedia.com/terms-of-use/ | HTTP 200 |
| SourceForge homepage meta | "free & fast open source software downloads" (HTTP 200) |
| https://www.trustpilot.com/ | HTTP 403 bot wall (live receipt) |
| Bing `site:trustpilot.com seofixkit` | HTTP 200; COUNT=0 |
| Bing `site:trustpilot.com "seo fix kit"` | HTTP 200; COUNT=0 |
| DDG lite Trustpilot queries | HTTP 202 walls; COUNT=0 |
| https://support.trustpilot.com/hc/en-us | HTTP 200 → https://help.trustpilot.com/s/?language=en_US |
| https://legal.trustpilot.com/for-businesses | HTTP 200 (claim policy quotes) |
| https://peplio.com/free-seo-tools/ | HTTP 200; grep `seofix` → 0 |
| Bing `site:peplio.com seofixkit` | HTTP 200; COUNT=0 |
| Bing `site:peplio.com "seo fix kit"` | HTTP 200; COUNT=0 |
| DDG lite Peplio queries | HTTP 202 walls; COUNT=0 |

## Dispositions and why

- **SourceForge — NOT_APPLICABLE (§3.6):** The A4 policy ladder found no
  SourceForge-owned statement affirmatively permitting proprietary (non-open-source)
  software listings. Slashdot Media terms (HTTP 200) scope to "Open Source
  Initiative ("OSI") compliant Code"; homepage meta cites open-source downloads
  only. Row-9 judgement stands refreshed.
- **Trustpilot — NOT_CURRENTLY_ELIGIBLE (§3.7):** `legal.trustpilot.com/for-businesses`
  (HTTP 200) states verbatim: "If your business is reviewed on Trustpilot, you
  can easily claim your business profile page" — zero seofixkit.com reviews
  exist today; claiming now would misrepresent activity. Row-11 judgement stands
  refreshed. Homepage HTTP 403 wall recorded.
- **Peplio — NEEDS_NISH (§3.8, fixed):** Free-tool directory with email-only
  submission (`info@peplio.com`); requirements quoted live; absence confirmed;
  submit-packet-ready copy in the copy file (SEO Fix Kit Check at `/check`; $99
  Fix Pack excluded).

## Change

- `docs/growth/discovery-venues-2026-08-10.md` — 2026-08-23 re-verification
  paragraph, execution ledger, venue rows #24–#26, submitter item 5, suggested
  order item 13.
- `docs/growth/discovery-venues-copy-2026-08-10.txt` — venues #24–#26 header,
  closed lines for SourceForge/Trustpilot, full Peplio email block.
- `MEMORY.md` — one durable bullet for this packet.
- `.lane/reports/lane1-sf-trustpilot-peplio-listings-20260823.md` — this file.

## Not done (correctly)

- No SourceForge, Trustpilot, or Peplio accounts created.
- No browser submission, no email to info@peplio.com, no payment.
- No Camoufox or headless browser.
- No `venue-claim claim` calls; allowlist unchanged.

## Resume path for the account owner

- **SourceForge:** None (NOT_APPLICABLE). Revisit only if the product becomes
  open-source.
- **Trustpilot:** Defer until real customer reviews exist; never fabricate
  reviews. When eligible, follow Trustpilot's business claim flow at
  `https://legal.trustpilot.com/for-businesses` with honesty lines from the
  copy conventions.
- **Peplio:** Email `info@peplio.com` with subject "Free SEO tool submission —
  SEO Fix Kit Check" using the Peplio block in
  `docs/growth/discovery-venues-copy-2026-08-10.txt` (tool URL
  `https://seofixkit.com/check`; parent product disclosed; $99 Fix Pack
  excluded; `/proof` not claimed live).

## Claim publications

Lane record `/home/nish/workspaces/agent-state/lanes/seo-fix-kit/lane-1.json`
`claims` field set to:

- `docs/growth/discovery-venues-2026-08-10.md`
- `docs/growth/discovery-venues-copy-2026-08-10.txt`
- `.lane/reports/lane1-sf-trustpilot-peplio-listings-20260823.md`
- `MEMORY.md`
