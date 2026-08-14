// Public anonymous one-page check: the low-friction proof-to-repair entry
// path. Any visitor can paste one public URL and get browser-rendered proof
// without an account, an email, or a stored report.
//
// Truthfulness contract (pinned by worker/routes/public-check.test.mjs):
// - The result is built ONLY from the shared audit engine's live output for
//   the submitted URL. Nothing here is hand-written marketing copy.
// - The page and response never promise rankings, traffic, indexing,
//   revenue, AI citations, or live answer-engine visibility.
// - The check is one page, anonymous, and ephemeral: no report or URL is
//   stored, only short-lived anonymous rate-limit counters (hashed per
//   network and per checked site) that expire with the same cleanup as every
//   other abuse counter. It is rate-limited per network and per target site
//   so the service and the pages it checks stay protected.
// - The engine's `snippet` field is GENERATED repair markup (a proposed
//   change the engine built), never an exact quote from the checked page.
//   The response names it `proposedMarkup` and the page labels the code
//   block as a proposed change, so the anonymous surface never presents
//   generated repair markup as an unlabeled observed snippet.
// - Full multi-page audits, saved proof reports, site verification, and the
//   repair queue remain inside the private beta; this route only measures
//   the handoff into that private access.
// - Engine failures are mapped through friendlyCheckError() into visitor
//   copy; raw browser diagnostics (net::ERR_*) never leak into the response.
import { VERSION, normalizeUrl, publicAuditUrlStatus } from "../../shared/audit-engine.js";
import { resolvesToPrivateAddress } from "../../shared/url-safety.js";
import { jsonNoStore } from "../lib/http.js";
import { checkQuotaSet, requestIpHash, sha256Hex } from "../lib/security.js";
import { dayWindow, hourWindow } from "../lib/text.js";
import { auditUrl } from "./audits.js";

export const CHECK_PAGE_PATH = "/check";
export const PUBLIC_CHECK_API_PATH = "/api/public-check";

// Rate limits for the anonymous surface. Deliberately small: the point is a
// proof preview, not a free full audit. Buckets live in the existing
// `audit_usage` D1 table (see worker/lib/security.js checkQuotaSet) so they
// expire with the same cleanup as every other abuse counter. The checked site
// and the visitor network are stored only as SHA-256 hashes, so the quota
// rows never contain a readable target hostname, URL, or visitor identifier.
export const PUBLIC_CHECK_LIMITS = {
  ipHour: 6,
  ipDay: 15,
  targetHour: 3,
  targetDay: 10
};

const NEXT_STEP_COPY =
  "The full repair workflow runs in the private beta: secure email access, site verification for deeper crawls, a saved proof report, and a repair queue with acceptance checks and one rerun after fixes. No ranking promise is made.";
const BOUNDARY_COPY =
  "This check measured one public page at scan time. It is not a full site audit, and no report or URL is stored: only short-lived anonymous rate-limit counters (a hash of your network and a hash of the checked site) are kept and expire automatically. It does not guarantee rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility.";

// Maps an engine failure into a human-readable /check error. Raw browser
// diagnostics like "net::ERR_NAME_NOT_RESOLVED at https://..." are useful in
// logs but are not visitor copy: the page promises evidence, not protocol
// dumps. Unmatched messages keep the engine's own wording so no failure mode
// is silently hidden.
export function friendlyCheckError(raw) {
  const message = String(raw || "The check failed. Try another public URL.").slice(0, 260);
  if (/ERR_NAME_NOT_RESOLVED|ERR_DNS|DNS_PROBE|getaddrinfo/i.test(message)) {
    return "That address does not resolve to a website. Check the spelling and try again.";
  }
  if (/ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_CLOSED|ERR_TIMED_OUT|ERR_INTERNET_DISCONNECTED|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return "The site did not respond. It may be down, blocking checkers, or the address may be wrong. Try another public URL.";
  }
  if (/ERR_CERT|ERR_SSL|SSL:|TLS|CERT_HAS_EXPIRED/i.test(message)) {
    return "The site has a certificate problem, so the check browser could not open it securely. Try another public URL.";
  }
  if (/ERR_ABORTED/i.test(message)) {
    return "The page did not finish loading. Try again in a moment.";
  }
  if (/net::ERR/i.test(message)) {
    return "The page could not be loaded from that address. Check the URL and try again.";
  }
  return message;
}

export function validatePublicCheckUrl(input) {
  let url = "";
  try {
    url = normalizeUrl(input);
  } catch {
    return { ok: false, error: "Enter a valid public website URL." };
  }
  const check = publicAuditUrlStatus(url);
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, url };
}

export async function publicCheckQuotaChecks(ipHash, targetHost) {
  const now = new Date();
  const hour = hourWindow(now);
  const day = dayWindow(now);
  // The checked site is stored only as a hash (same pattern as the network
  // hash in requestIpHash), so D1 never holds a readable target hostname.
  const targetKey = (await sha256Hex(String(targetHost || "").trim().toLowerCase())).slice(0, 32);
  return [
    {
      bucket: `check:ip-hour:${hour.key}:${ipHash}`,
      limit: PUBLIC_CHECK_LIMITS.ipHour,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "You have checked the limit of pages from this network this hour. Try again later."
    },
    {
      bucket: `check:ip-day:${day.key}:${ipHash}`,
      limit: PUBLIC_CHECK_LIMITS.ipDay,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily one-page check limit reached from this network. Try again tomorrow."
    },
    {
      bucket: `check:target-hour:${hour.key}:${targetKey}`,
      limit: PUBLIC_CHECK_LIMITS.targetHour,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "That site has been checked several times this hour. Try again later."
    },
    {
      bucket: `check:target-day:${day.key}:${targetKey}`,
      limit: PUBLIC_CHECK_LIMITS.targetDay,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "That site has been checked its daily limit. Try again tomorrow."
    }
  ];
}

// Maps one live engine report (maxPages: 1) to the compact public proof
// payload. Only real engine fields are copied; the page renders these
// verbatim, so the public surface cannot drift from what the engine found.
export function buildPublicCheckResponse(report) {
  const page = report?.pages?.[0];
  const guards = (report?.findings || [])
    .filter((finding) => finding?.severity === "good")
    .slice(0, 3)
    .map((finding) => ({
      severity: finding.severity,
      title: finding.title,
      why: finding.why,
      evidence: finding.evidence,
      fix: finding.fix
    }));
  const findings = (report?.findings || [])
    .filter((finding) => finding?.severity && finding.severity !== "good")
    .slice(0, 5)
    .map((finding) => ({
      severity: finding.severity,
      title: finding.title,
      why: finding.why,
      evidence: finding.evidence,
      fix: finding.fix,
      // The engine's snippet is generated repair markup (a proposed change),
      // not an exact quote from the checked page. Named and rendered as such
      // so the anonymous surface cannot pass it off as observed text.
      proposedMarkup: finding.snippet || ""
    }));
  return {
    ok: true,
    mode: "one-page-check",
    checkedUrl: report?.url || "",
    finalUrl: page?.rendered?.finalUrl || page?.finalUrl || report?.url || "",
    scannedAt: report?.scannedAt || "",
    durationMs: report?.durationMs || 0,
    engineVersion: VERSION,
    measured: {
      staticWordCount: page?.static?.wordCount ?? null,
      renderedWordCount: page?.rendered?.wordCount ?? null,
      renderedH1: page?.rendered?.h1s?.[0] || null,
      renderedTitle: page?.rendered?.title || null,
      renderedInternalLinkCount: page?.rendered?.internalLinks?.length ?? null
    },
    issues: {
      critical: report?.summary?.critical ?? 0,
      warnings: report?.summary?.warnings ?? 0,
      notices: report?.summary?.notices ?? 0,
      guardedFalsePositives: report?.summary?.guardedFalsePositives ?? 0
    },
    guards,
    findings,
    nextStep: NEXT_STEP_COPY,
    boundary: BOUNDARY_COPY
  };
}

// Worker handler for POST /api/public-check. Anonymous by design: no beta
// session, no stored report, no owner records. The only D1 writes are the
// rate-limit counters in `audit_usage`, hashed per network and per checked
// site, so the database never holds a readable target hostname, URL, or
// visitor identifier.
export async function runPublicCheck(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = typeof body?.url === "string" ? body.url : "";
  const validated = validatePublicCheckUrl(input);
  if (!validated.ok) {
    return jsonNoStore({ error: validated.error }, 400);
  }

  const hostname = new URL(validated.url).hostname;
  if (await resolvesToPrivateAddress(hostname)) {
    return jsonNoStore({ error: "This URL points at a private or internal address and cannot be checked." }, 400);
  }

  if (!env.WAITLIST_DB) {
    return jsonNoStore({ error: "Check storage is not configured." }, 503);
  }

  const ipHash = await requestIpHash(request);
  const quota = await checkQuotaSet(env, await publicCheckQuotaChecks(ipHash, hostname));
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  try {
    const report = await auditUrl(validated.url, env, {
      maxPages: 1,
      appOrigin: new URL(request.url).origin
    });
    return jsonNoStore(buildPublicCheckResponse(report));
  } catch (error) {
    if (error?.code === "BROWSER_BUSY") {
      return jsonNoStore(
        { error: "Check capacity is busy right now. Wait a moment and try again." },
        503
      );
    }
    const message = friendlyCheckError(error?.message);
    return jsonNoStore({ error: message }, 422);
  }
}

// WebPage and FAQPage JSON-LD for the live /check surface. Every question
// and answer mirrors text a visitor can read on the page itself, and the
// answers keep the same no-ranking boundary the page and the API pin. The
// `\\u003c` escape keeps "</script>" out of the block, same as pages.js.
export function checkJsonLd(origin) {
  const url = `${origin}/check`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        name: "Check One Page for SEO Proof - SEO Fix Kit",
        description:
          "Paste any public page URL and see what a browser-rendered, proof-backed audit finds: static-vs-rendered evidence, guarded false positives, and actionable findings when present. No account, no ranking promises.",
        url,
        isPartOf: { "@type": "WebSite", name: "SEO Fix Kit", url: origin },
        publisher: { "@type": "Organization", name: "SEO Fix Kit", url: origin },
        mainEntity: { "@id": `${url}#faq` }
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: "What does the one-page check measure?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "It opens one public page in a real browser and compares the raw HTML with the rendered page: static vs rendered word count, rendered H1, rendered title, and internal links. It also shows guarded false positives and actionable findings when the shared audit engine finds them. No account, no email, and no stored report."
            }
          },
          {
            "@type": "Question",
            name: "Is anything about my check stored?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. The check is anonymous and ephemeral: nothing about your check is saved. The only records are rate-limit counters hashed per network and per target site."
            }
          },
          {
            "@type": "Question",
            name: "Is this a full site audit?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. This is one public page at one moment, not a full multi-page audit. Full reports, deeper crawls, saved proof reports, and the repair queue run in the private beta after secure email access."
            }
          },
          {
            "@type": "Question",
            name: "Does this check promise rankings or traffic?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. The one-page check does not guarantee rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility, and it does not replace a private multi-page report."
            }
          }
        ]
      }
    ]
  }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${jsonLd}</script>`;
}

export function checkHtml(origin) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Check One Page for SEO Proof - SEO Fix Kit</title>
    <meta name="description" content="Paste any public page URL and see what a browser-rendered, proof-backed audit finds: static-vs-rendered evidence, guarded false positives, and actionable findings when present. No account, no ranking promises." />
    <link rel="canonical" href="${origin}/check" />
    <link rel="apple-touch-icon" href="${origin}/apple-touch-icon.svg" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SEO Fix Kit" />
    <meta property="og:title" content="Check One Page for SEO Proof - SEO Fix Kit" />
    <meta property="og:description" content="Paste any public page URL and see what a browser-rendered, proof-backed audit finds. No account, no ranking promises." />
    <meta property="og:url" content="${origin}/check" />
    <meta property="og:image" content="${origin}/og-image.svg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Check One Page for SEO Proof - SEO Fix Kit" />
    <meta name="twitter:description" content="Paste any public page URL and see browser-rendered SEO proof. No account, no ranking promises." />
    <meta name="twitter:image" content="${origin}/og-image.svg" />
    ${checkJsonLd(origin)}
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070908; color: #fbf8ef; }
      * { box-sizing: border-box; }
      body { margin: 0; }
      main { margin: 0 auto; max-width: 980px; padding: 36px 22px 68px; }
      a { color: #98f0cc; font-weight: 780; text-decoration: none; }
      header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 54px; }
      h1 { font-size: clamp(40px, 8vw, 88px); letter-spacing: 0; line-height: .92; margin: 0 0 18px; max-width: 820px; }
      h2 { font-size: clamp(22px, 3vw, 30px); margin: 0 0 12px; }
      p, li { color: rgba(251,248,239,.75); font-size: 18px; line-height: 1.6; overflow-wrap: anywhere; word-break: break-word; }
      .kicker { color: #98f0cc; font-size: 13px; font-weight: 880; letter-spacing: .08em; text-transform: uppercase; }
      .lead { font-size: clamp(19px, 2.4vw, 24px); max-width: 760px; }
      .check-form { background: rgba(251,248,239,.055); border: 1px solid rgba(152,240,204,.28); border-radius: 10px; display: flex; flex-direction: column; gap: 10px; margin: 30px 0 8px; min-width: 0; padding: 18px; }
      .check-form label { color: #fbf8ef; font-size: 14px; font-weight: 760; }
      .check-form .row { display: flex; gap: 10px; min-width: 0; }
      .check-form input { background: #0c1210; border: 1px solid rgba(251,248,239,.22); border-radius: 8px; color: #fbf8ef; flex: 1; font-size: 16px; min-height: 48px; min-width: 0; padding: 0 14px; }
      .check-form button { background: #98f0cc; border: 0; border-radius: 8px; color: #06100c; cursor: pointer; font-weight: 880; min-height: 48px; padding: 0 20px; }
      .check-form button:disabled { cursor: wait; opacity: .6; }
      .form-note { color: rgba(251,248,239,.6); font-size: 14px; margin: 0; }
      .grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 30px 0; }
      .panel { background: rgba(251,248,239,.055); border: 1px solid rgba(251,248,239,.12); border-radius: 8px; min-width: 0; padding: 20px; }
      .panel strong { color: #98f0cc; display: block; font-size: 13px; font-weight: 860; margin-bottom: 8px; text-transform: uppercase; }
      .proof { border-color: rgba(152,240,204,.28); }
      .band { border-top: 1px solid rgba(251,248,239,.14); padding: 30px 0; }
      .result { display: none; margin: 30px 0 0; }
      .result.show { display: block; }
      .error-box { border: 1px solid rgba(255,150,140,.4); border-radius: 8px; color: #ffb4ad; padding: 14px 16px; }
      .measure-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .measure { background: rgba(7,13,10,.58); border: 1px solid rgba(251,248,239,.1); border-radius: 8px; min-width: 0; padding: 12px 14px; }
      .measure .label { color: rgba(251,248,239,.6); font-size: 12px; text-transform: uppercase; }
      .measure .value { font-size: 16px; margin-top: 4px; overflow-wrap: anywhere; }
      .finding { border-left: 3px solid #dcc062; margin: 12px 0; min-width: 0; padding-left: 12px; }
      .finding.critical { border-left-color: #ff8f7d; }
      .finding.warning { border-left-color: #f4c95d; }
      .finding.notice { border-left-color: #8fd3ff; }
      .finding h3 { font-size: 17px; margin: 0 0 6px; }
      .finding p { font-size: 15px; margin: 0 0 6px; }
      .snippet { background: #0c1210; border: 1px solid rgba(251,248,239,.14); border-radius: 8px; color: #fbf8ef; display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; margin: 8px 0 0; overflow-x: auto; padding: 12px; white-space: pre-wrap; }
      .finding .snippet-label { color: rgba(251,248,239,.6); font-size: 12px; font-weight: 700; letter-spacing: .04em; margin: 10px 0 0; text-transform: uppercase; }
      .cta { align-items: center; background: #98f0cc; border-radius: 8px; color: #06100c; display: inline-flex; font-weight: 880; min-height: 48px; padding: 0 18px; }
      .next-step { border: 1px solid rgba(152,240,204,.28); }
      @media (max-width: 760px) { header { align-items: flex-start; gap: 18px; flex-direction: column; } .grid, .measure-grid { grid-template-columns: 1fr; } .check-form .row { flex-direction: column; } main { padding-top: 26px; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <a href="${origin}/">SEO Fix Kit</a>
        <span class="kicker">Anonymous one-page check</span>
      </header>
      <section>
        <p class="kicker">Proof before access</p>
        <h1>See what a browser-visible audit proves about one page.</h1>
        <p class="lead">Paste a public URL. We open the page in a real browser, compare the raw HTML with the rendered page, and show the evidence — guarded false positives included. No account, no email, no stored report.</p>
      </section>
      <form class="check-form" id="check-form" aria-label="One-page URL check">
        <label for="url-input">Public page URL</label>
        <div class="row">
          <input id="url-input" name="url" type="text" inputmode="url" autocomplete="off" placeholder="https://example.com/about" required />
          <button id="check-button" type="submit">Check this page</button>
        </div>
        <p class="form-note">One page per check. Rate-limited per network and per site to protect the service and the pages it checks. Use only pages you own or are authorized to audit.</p>
      </form>
      <section class="result" id="result" aria-live="polite"></section>
      <section class="grid" aria-label="What the check returns">
        <article class="panel proof">
          <strong>Rendered evidence</strong>
          <p>Measured facts from the browser-visible page: static vs rendered word count, rendered H1, title, and internal links.</p>
        </article>
        <article class="panel proof">
          <strong>Guarded false positives</strong>
          <p>Static-only scanners invent work on app-shell pages. We show which warnings the rendered page disproves.</p>
        </article>
        <article class="panel proof">
          <strong>Findings when present</strong>
          <p>Only real, evidence-backed issues become findings, with a concrete fix and a proposed markup change when the engine has one.</p>
        </article>
        <article class="panel proof">
          <strong>Measured handoff</strong>
          <p>Full reports, deeper crawls, saved proof, and the repair queue run in the private beta after secure email access.</p>
        </article>
      </section>
      <section class="band">
        <h2>What this check does not claim</h2>
        <p>This is one public page at one moment, not a full site audit. No report or URL is stored: only short-lived anonymous rate-limit counters (a hash of your network and a hash of the checked site) are kept, and they expire automatically. It does not guarantee rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility. It does not replace a private multi-page report.</p>
      </section>
      <section class="band" aria-label="Frequently asked questions">
        <h2>Frequently asked questions</h2>
        <h3>What does the one-page check measure?</h3>
        <p>It opens one public page in a real browser and compares the raw HTML with the rendered page: static vs rendered word count, rendered H1, rendered title, and internal links. It also shows guarded false positives and actionable findings when the shared audit engine finds them. No account, no email, and no stored report.</p>
        <h3>Is anything about my check stored?</h3>
        <p>No. The check is anonymous and ephemeral: nothing about your check is saved. The only records are rate-limit counters hashed per network and per target site.</p>
        <h3>Is this a full site audit?</h3>
        <p>No. This is one public page at one moment, not a full multi-page audit. Full reports, deeper crawls, saved proof reports, and the repair queue run in the private beta after secure email access.</p>
        <h3>Does this check promise rankings or traffic?</h3>
        <p>No. The one-page check does not guarantee rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility, and it does not replace a private multi-page report.</p>
      </section>
      <section class="band next-step">
        <h2>After the check</h2>
        <p>To turn proof into a repair workflow, request a secure email access link: verified sessions get saved proof reports, crawl depth up to 1,000 pages per queued audit, and a repair queue with acceptance checks and one rerun after fixes.</p>
        <p><a class="cta" href="${origin}/">Request private access</a></p>
      </section>
      <p><a href="${origin}/demo">View proof sample</a> · <a href="${origin}/methodology">Read methodology and limits</a> · <a href="${origin}/packages">View package ladder</a> · <a href="${origin}/support">Support and refunds</a> · <a href="${origin}/terms">Terms</a> · <a href="${origin}/privacy">Privacy</a></p>
    </main>
    <script>
      (function () {
        const form = document.getElementById("check-form");
        const urlInput = document.getElementById("url-input");
        const button = document.getElementById("check-button");
        const result = document.getElementById("result");

        function el(tag, text, className) {
          const node = document.createElement(tag);
          if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
          if (className) node.className = className;
          return node;
        }

        function measure(label, value) {
          const box = el("div", "", "measure");
          box.appendChild(el("div", label, "label"));
          box.appendChild(el("div", value === null || value === undefined ? "not measured" : value, "value"));
          return box;
        }

        function findingNode(finding) {
          const box = el("div", "", "finding " + finding.severity);
          box.appendChild(el("h3", finding.title));
          if (finding.evidence) box.appendChild(el("p", "Evidence: " + finding.evidence));
          if (finding.why) box.appendChild(el("p", finding.why));
          if (finding.fix) box.appendChild(el("p", "Fix: " + finding.fix));
          if (finding.proposedMarkup) {
            box.appendChild(el("p", "Proposed change — generated repair markup, not a quote from the page", "snippet-label"));
            box.appendChild(el("code", finding.proposedMarkup, "snippet"));
          }
          return box;
        }

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const url = urlInput.value.trim();
          if (!url) return;
          button.disabled = true;
          button.textContent = "Checking...";
          result.classList.remove("show");
          result.replaceChildren();
          result.appendChild(el("p", "Opening " + url + " in a real browser and measuring the rendered page. This can take up to a minute."));
          result.classList.add("show");
          try {
            const response = await fetch("${origin}/api/public-check", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ url })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) {
              result.replaceChildren(el("div", payload.error || "The check failed. Try another public URL.", "error-box"));
              return;
            }
            result.replaceChildren();

            const checked = el("p", "Checked: " + payload.checkedUrl + (payload.finalUrl && payload.finalUrl !== payload.checkedUrl ? " (rendered at " + payload.finalUrl + ")" : ""));
            result.appendChild(checked);
            if (payload.engineVersion) result.appendChild(el("p", "Engine version " + payload.engineVersion + " · scanned " + payload.scannedAt + " · one page"));

            const section = el("section");
            section.appendChild(el("h2", "Rendered proof"));
            const grid = el("div", "", "measure-grid");
            grid.appendChild(measure("Static HTML words", payload.measured.staticWordCount));
            grid.appendChild(measure("Rendered words", payload.measured.renderedWordCount));
            grid.appendChild(measure("Rendered H1", payload.measured.renderedH1));
            grid.appendChild(measure("Rendered title", payload.measured.renderedTitle));
            grid.appendChild(measure("Rendered internal links", payload.measured.renderedInternalLinkCount));
            section.appendChild(grid);
            result.appendChild(section);

            const guardSection = el("section");
            guardSection.appendChild(el("h2", "Guarded false positives"));
            if (payload.guards.length === 0) {
              guardSection.appendChild(el("p", "No static-vs-rendered false positives were found on this page."));
            } else {
              for (const guard of payload.guards) {
                guardSection.appendChild(findingNode(guard));
              }
            }
            result.appendChild(guardSection);

            const findingSection = el("section");
            findingSection.appendChild(el("h2", "Actionable findings"));
            if (payload.findings.length === 0) {
              findingSection.appendChild(el("p", "No actionable findings on this one page from this scan."));
            } else {
              for (const finding of payload.findings) {
                findingSection.appendChild(findingNode(finding));
              }
            }
            result.appendChild(findingSection);

            result.appendChild(el("p", payload.nextStep));
            result.appendChild(el("p", payload.boundary));
            result.appendChild(el("p", ""));
            const cta = el("a", "Continue to private access", "cta");
            cta.href = "${origin}/";
            result.appendChild(cta);
          } catch (error) {
            result.replaceChildren(el("div", "Could not reach the check service. Try again in a moment.", "error-box"));
          } finally {
            button.disabled = false;
            button.textContent = "Check this page";
          }
        });
      })();
    </script>
  </body>
</html>`;
}
