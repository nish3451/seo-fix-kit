# SEO Fix Kit — private-beta funnel live-surface walk ledger

Execution ledger for the backlog item **Live-surface walk of the private-beta
funnel** (bootstrap 2026-08-08, risk: green).

- Accept clause: ux-walk of `https://seofixkit.com` home → `/demo` →
  `/packages` → access request (observe mode), console clean, links live, no
  mobile horizontal scroll; defects filed as fresh items.
- Verify clause: walk JSON summarized in journal (this ledger is the journal;
  the walk JSON for each run is recorded verbatim below).
- Runner: `scripts/run-private-beta-funnel-walk.mjs` via
  `npm run audit:funnel-walk` (real-browser Playwright Chromium walk, desktop
  + iPhone-13 mobile viewport; the access request form is inspected in
  observe mode only and never submitted, so no waitlist lead or access token
  is created). Offline regression lock: `npm run test:funnel-walk` (part of
  `npm run check`).

---

## 2026-08-12 — PASS (walkedAt 2026-08-12T05:12:20.534Z, base https://seofixkit.com)

Status: **pass** — all acceptance-clause surfaces green, zero defects to file.

| Stop | Desktop | Mobile |
| --- | --- | --- |
| home `/` | ok — title, canonical, "Private beta access." + "Email access link" copy, access form present | ok — same, no horizontal scroll |
| `/demo` | ok — title, canonical, "false positive" + "sample" copy | ok — same, no horizontal scroll |
| `/packages` | ok — title, canonical, "package ladder" + "No ranking or traffic guarantee" copy | ok — same, no horizontal scroll |

- Console/page errors: **none** (desktop and mobile).
- Non-benign request failures: **none**.
- Internal link liveness: all expected links verified live with HTTP 200,
  zero broken — home → `/demo`, `/methodology`, `/packages`, `/check`;
  `/demo` → `/`, `/packages`, `/check`; `/packages` → `/`, `/check`,
  `/support` (both viewports).
- Mobile horizontal overflow: none (`scrollWidth` == `innerWidth` on every
  mobile stop).
- Access request: observe mode only, form inspected (email input, company
  honeypot, "Email access link" CTA), never submitted — no waitlist lead, no
  access token, no D1 writes.

### Walk JSON (journal record, verbatim)

```json
{
  "status": "pass",
  "baseUrl": "https://seofixkit.com",
  "walkedAt": "2026-08-12T05:12:20.534Z",
  "durationMs": 7992,
  "viewports": [
    "desktop",
    "mobile"
  ],
  "stops": [
    {
      "path": "/",
      "name": "home",
      "viewport": "desktop",
      "httpStatus": 200,
      "finalUrl": "https://seofixkit.com/",
      "title": "SEO Fix Kit - Proof-Backed SEO Repair Beta",
      "canonical": "https://seofixkit.com/",
      "copyChecks": [
        {
          "match": "Private beta access.",
          "present": true
        },
        {
          "match": "Email access link",
          "present": true
        }
      ],
      "expectedLinks": [
        {
          "href": "/demo",
          "present": true
        },
        {
          "href": "/methodology",
          "present": true
        },
        {
          "href": "/packages",
          "present": true
        },
        {
          "href": "/check",
          "present": true
        }
      ],
      "brokenLinks": {
        "checked": [
          {
            "href": "/support",
            "status": 200
          },
          {
            "href": "/check",
            "status": 200
          },
          {
            "href": "/terms",
            "status": 200
          },
          {
            "href": "/",
            "status": 200
          },
          {
            "href": "/demo",
            "status": 200
          },
          {
            "href": "/privacy",
            "status": 200
          },
          {
            "href": "/packages",
            "status": 200
          },
          {
            "href": "/methodology",
            "status": 200
          }
        ],
        "broken": []
      },
      "horizontalOverflow": {
        "scrollWidth": 1280,
        "innerWidth": 1280,
        "overflow": false
      },
      "accessForm": {
        "emailPresent": true,
        "emailType": "email",
        "emailRequired": true,
        "companyPresent": true,
        "companyTabIndex": "-1",
        "companyAutocomplete": "off",
        "submitPresent": true,
        "submitLabel": "Email access link"
      },
      "walkerError": null
    },
    {
      "path": "/demo",
      "name": "demo",
      "viewport": "desktop",
      "httpStatus": 200,
      "finalUrl": "https://seofixkit.com/demo",
      "title": "Proof-Backed SEO Repair Demo - SEO Fix Kit",
      "canonical": "https://seofixkit.com/demo",
      "copyChecks": [
        {
          "match": "false positive",
          "present": true
        },
        {
          "match": "sample",
          "present": true
        }
      ],
      "expectedLinks": [
        {
          "href": "/",
          "present": true
        },
        {
          "href": "/packages",
          "present": true
        },
        {
          "href": "/check",
          "present": true
        }
      ],
      "brokenLinks": {
        "checked": [
          {
            "href": "https://seofixkit.com/support",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/terms",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/packages",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/methodology",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/privacy",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/check",
            "status": 200
          }
        ],
        "broken": []
      },
      "horizontalOverflow": {
        "scrollWidth": 1280,
        "innerWidth": 1280,
        "overflow": false
      },
      "accessForm": null,
      "walkerError": null
    },
    {
      "path": "/packages",
      "name": "packages",
      "viewport": "desktop",
      "httpStatus": 200,
      "finalUrl": "https://seofixkit.com/packages",
      "title": "Packages - SEO Fix Kit",
      "canonical": "https://seofixkit.com/packages",
      "copyChecks": [
        {
          "match": "package ladder",
          "present": true
        },
        {
          "match": "No ranking or traffic guarantee",
          "present": true
        }
      ],
      "expectedLinks": [
        {
          "href": "/",
          "present": true
        },
        {
          "href": "/check",
          "present": true
        },
        {
          "href": "/support",
          "present": true
        }
      ],
      "brokenLinks": {
        "checked": [
          {
            "href": "https://seofixkit.com/packages",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/check",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/support",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/terms",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/methodology",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/privacy",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/demo",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/",
            "status": 200
          }
        ],
        "broken": []
      },
      "horizontalOverflow": {
        "scrollWidth": 1280,
        "innerWidth": 1280,
        "overflow": false
      },
      "accessForm": null,
      "walkerError": null
    },
    {
      "path": "/",
      "name": "home",
      "viewport": "mobile",
      "httpStatus": 200,
      "finalUrl": "https://seofixkit.com/",
      "title": "SEO Fix Kit - Proof-Backed SEO Repair Beta",
      "canonical": "https://seofixkit.com/",
      "copyChecks": [
        {
          "match": "Private beta access.",
          "present": true
        },
        {
          "match": "Email access link",
          "present": true
        }
      ],
      "expectedLinks": [
        {
          "href": "/demo",
          "present": true
        },
        {
          "href": "/methodology",
          "present": true
        },
        {
          "href": "/packages",
          "present": true
        },
        {
          "href": "/check",
          "present": true
        }
      ],
      "brokenLinks": {
        "checked": [
          {
            "href": "/packages",
            "status": 200
          },
          {
            "href": "/check",
            "status": 200
          },
          {
            "href": "/support",
            "status": 200
          },
          {
            "href": "/methodology",
            "status": 200
          },
          {
            "href": "/",
            "status": 200
          },
          {
            "href": "/terms",
            "status": 200
          },
          {
            "href": "/privacy",
            "status": 200
          },
          {
            "href": "/demo",
            "status": 200
          }
        ],
        "broken": []
      },
      "horizontalOverflow": {
        "scrollWidth": 1280,
        "innerWidth": 1280,
        "overflow": false
      },
      "accessForm": {
        "emailPresent": true,
        "emailType": "email",
        "emailRequired": true,
        "companyPresent": true,
        "companyTabIndex": "-1",
        "companyAutocomplete": "off",
        "submitPresent": true,
        "submitLabel": "Email access link"
      },
      "walkerError": null
    },
    {
      "path": "/demo",
      "name": "demo",
      "viewport": "mobile",
      "httpStatus": 200,
      "finalUrl": "https://seofixkit.com/demo",
      "title": "Proof-Backed SEO Repair Demo - SEO Fix Kit",
      "canonical": "https://seofixkit.com/demo",
      "copyChecks": [
        {
          "match": "false positive",
          "present": true
        },
        {
          "match": "sample",
          "present": true
        }
      ],
      "expectedLinks": [
        {
          "href": "/",
          "present": true
        },
        {
          "href": "/packages",
          "present": true
        },
        {
          "href": "/check",
          "present": true
        }
      ],
      "brokenLinks": {
        "checked": [
          {
            "href": "https://seofixkit.com/support",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/packages",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/terms",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/methodology",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/privacy",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/check",
            "status": 200
          }
        ],
        "broken": []
      },
      "horizontalOverflow": {
        "scrollWidth": 1280,
        "innerWidth": 1280,
        "overflow": false
      },
      "accessForm": null,
      "walkerError": null
    },
    {
      "path": "/packages",
      "name": "packages",
      "viewport": "mobile",
      "httpStatus": 200,
      "finalUrl": "https://seofixkit.com/packages",
      "title": "Packages - SEO Fix Kit",
      "canonical": "https://seofixkit.com/packages",
      "copyChecks": [
        {
          "match": "package ladder",
          "present": true
        },
        {
          "match": "No ranking or traffic guarantee",
          "present": true
        }
      ],
      "expectedLinks": [
        {
          "href": "/",
          "present": true
        },
        {
          "href": "/check",
          "present": true
        },
        {
          "href": "/support",
          "present": true
        }
      ],
      "brokenLinks": {
        "checked": [
          {
            "href": "https://seofixkit.com/check",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/support",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/packages",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/terms",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/methodology",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/privacy",
            "status": 200
          },
          {
            "href": "https://seofixkit.com/demo",
            "status": 200
          }
        ],
        "broken": []
      },
      "horizontalOverflow": {
        "scrollWidth": 1280,
        "innerWidth": 1280,
        "overflow": false
      },
      "accessForm": null,
      "walkerError": null
    }
  ],
  "consoleErrors": [],
  "requestFailures": [],
  "accessRequest": {
    "mode": "observe",
    "submitted": false,
    "route": "/",
    "form": true,
    "note": "Access request form inspected but not submitted: observe mode only, no waitlist lead or access token created."
  },
  "failures": []
}
```

### Human summary (journal excerpt)

```
Private-beta funnel walk pass (https://seofixkit.com, walkedAt 2026-08-12T05:12:20.534Z)
  desktop /: ok
  desktop /demo: ok
  desktop /packages: ok
  mobile /: ok
  mobile /demo: ok
  mobile /packages: ok
  access request: observe mode, form inspected (Access request form inspected but not submitted: observe mode only, no waitlist lead or access token created.)
  console/page errors: none
  non-benign request failures: none
  stops: 6 (home → demo → packages) across viewports desktop, mobile
```

### Reproduce

```bash
npm run test:funnel-walk        # offline regression lock (runs in npm run check)
npm run audit:funnel-walk       # live walk against https://seofixkit.com
SEOFIXKIT_BASE_URL=https://seofixkit.com npm run audit:funnel-walk
```
