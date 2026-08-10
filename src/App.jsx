import { useEffect, useMemo, useState } from "react";
import { CRAWL_DEPTH_TIERS, DEFAULT_CRAWL_PAGES, SELF_SERVE_MAX_CRAWL_PAGES } from "../shared/crawl-depth.js";
import { RENDERED_CRAWL_TARGETS } from "../shared/rendered-crawl-scale.js";
import { developerWebhookRequest } from "./developer-webhooks.js";
import { deliveryReadinessLabel, deliveryReadinessText } from "./delivery-readiness-copy.js";
import {
  fixPackCheckoutBody,
  fixPackCheckoutDisabled,
  fixPackCheckoutErrorOutcome,
  fixPackCheckoutOutcome,
  fixPackRepairTarget
} from "./fix-pack-checkout.js";
import {
  monitoringCheckoutDisabled,
  monitoringCheckoutErrorOutcome,
  monitoringCheckoutOutcome
} from "./monitoring-checkout.js";
import {
  repairActionApplyPatch,
  repairActionApprovalPatch,
  repairActionIgnorePatch,
  repairActionImplementationPackAvailable,
  repairActionImplementationPackUrl,
  repairActionProofReceiptAvailable,
  repairActionProofReceiptUrl,
  repairActionRerunPatch,
  repairActionUpdateRequest
} from "./repair-action-requests.js";
import { funnelEvent } from "./funnel-events.js";

const BETA_SESSION_KEY = "seofixkit_beta_unlocked";
const BETA_EMAIL_KEY = "seofixkit_beta_email";

export default function App() {
  if (window.location.pathname.startsWith("/beta")) {
    return <BetaApp />;
  }

  return <WaitlistPage />;
}

function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [accessUrl, setAccessUrl] = useState("");
  const [formStartedAt] = useState(() => Date.now());

  useEffect(() => {
    document.title = "SEO Fix Kit - Proof-Backed SEO Repair Beta";
    // First-party funnel events for the public private-beta funnel: the page
    // view and the email access form being shown are the top of the funnel.
    // Access-request success/failure is recorded server-side.
    funnelEvent("page_view", "/");
    funnelEvent("access_form_shown", "/");
  }, []);

  async function joinWaitlist(event) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const payload = await postAccessRequest({
        email,
        company,
        source: "homepage-access",
        formStartedAt
      });
      setStatus("success");
      setMessage(payload.message || "Check your email for a secure access link.");
      setAccessUrl(payload.accessUrl || "");
      setEmail("");
      setCompany("");
    } catch (error) {
      setStatus("error");
      setAccessUrl("");
      setMessage(error.message || "Could not send the access link.");
    }
  }

  return (
    <main className="waitlist-shell">
      <img
        alt=""
        aria-hidden="true"
        className="hero-art"
        src="/assets/waitlist-hero.jpg"
      />
      <div className="hero-shade" />

      <header className="site-top">
        <a className="brand-lockup" href="/" aria-label="SEO Fix Kit home">
          <LogoMark />
          <span>SEO Fix Kit</span>
        </a>
        <span className="launch-status">Private beta</span>
      </header>

      <section className="hero-copy" aria-labelledby="page-title">
        <p className="kicker">Private beta</p>
        <h1 id="page-title">SEO Fix Kit</h1>
        <p className="coming-soon">Private beta access.</p>
        <p className="hero-text">
          Evidence-backed SEO audits are opening by secure email link. Join the
          private beta, run a proof audit, and only pay when the report finds
          repairs worth doing.
        </p>
        <p className="hero-pricing">
          Audits are free in the beta. The paid SEO Fix Pack shows the Dodo checkout
          price before payment — one proof-backed repair pass plus one rerun, only
          offered when real fixes exist.
        </p>
        <nav className="public-proof-links" aria-label="Public proof pages">
          <a href="/demo" onClick={() => funnelEvent("cta_activation", "/demo")}>Sample proof report</a>
          <a href="/methodology" onClick={() => funnelEvent("cta_activation", "/methodology")}>Methodology and limits</a>
          <a href="/packages" onClick={() => funnelEvent("cta_activation", "/packages")}>Package ladder</a>
        </nav>

        <div className="access-entry">
          <form className="waitlist-form" onSubmit={joinWaitlist}>
            <label htmlFor="email">Email address</label>
            <div className="email-row">
              <input
                autoComplete="email"
                id="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
              <button disabled={status === "submitting"} type="submit">
                {status === "submitting" ? "Sending" : "Email access link"}
              </button>
            </div>
            <label className="honeypot" htmlFor="company">
              Company
              <input
                autoComplete="off"
                id="company"
                onChange={(event) => setCompany(event.target.value)}
                tabIndex="-1"
                type="text"
                value={company}
              />
            </label>
            <p className={`form-message ${status}`} aria-live="polite">
              {message || "We’ll only use this email for SEO Fix Kit access and outreach."}
              {accessUrl && (
                <>
                  <br />
                  <a className="inline-link" href={accessUrl}>
                    Open local access link
                  </a>
                </>
              )}
            </p>
          </form>

          <div className="check-entry" aria-label="Anonymous one-page check">
            <p className="check-entry-note">No account, no email</p>
            <a className="check-entry-cta" href="/check" onClick={() => funnelEvent("cta_activation", "/check")}>
              Check one page now
            </a>
            <p className="check-entry-note">
              Live rendered proof for one public page. No report or URL is stored.
            </p>
          </div>
        </div>

        <div className="report-preview" aria-label="SEO Fix Kit report preview">
          <div>
            <strong>Issue</strong>
            <span>Static crawler says the homepage has no H1.</span>
          </div>
          <div>
            <strong>Proof</strong>
            <span>Rendered DOM shows the SEO Fix Kit H1 and private-beta access copy.</span>
          </div>
          <div>
            <strong>Fix</strong>
            <span>Do nothing. The finding is a false positive.</span>
          </div>
        </div>
      </section>

      <section className="homepage-proof-band" aria-labelledby="proof-loop-title">
        <div className="proof-band-copy">
          <p className="kicker">Proof-backed repair agent</p>
          <h2 id="proof-loop-title">The audit is useful only if it leads to a safe fix.</h2>
          <p>
            SEO Fix Kit renders the site like a browser, compares the visible page
            with the raw app shell, and keeps false positives out of the repair
            queue. When a real issue is proven, the report keeps the page, source
            evidence, suggested fix, effort, confidence, and acceptance check in one
            place so a founder, teammate, or developer can act without guessing.
          </p>
        </div>
        <div className="proof-step-grid" aria-label="Proof-backed repair steps">
          <article>
            <strong>1. Prove</strong>
            <p>Run a private audit, verify site ownership for deeper crawls, and see rendered proof before paying for repairs.</p>
          </article>
          <article>
            <strong>2. Approve</strong>
            <p>Review the repair queue, ignore noise, approve safe drafts, or start the paid Fix Pack from a report with real fixes.</p>
          </article>
          <article>
            <strong>3. Re-measure</strong>
            <p>After changes ship, rerun the audit. Fresh proof marks repairs fixed, still open, new, or regressed.</p>
          </article>
        </div>
      </section>

      <section className="homepage-faq" aria-labelledby="homepage-faq-title">
        <p className="kicker">Buyer questions</p>
        <h2 id="homepage-faq-title">What can I trust SEO Fix Kit to do today?</h2>
        <div className="faq-grid">
          <article>
            <h3>What happens after I enter a URL?</h3>
            <p>
              You get a rate-limited private audit. A one-page Lite check can run
              before verification; verified sites unlock deeper self-serve crawls,
              imports, saved reports, monitoring controls, and owner-scoped repair
              queues.
            </p>
          </article>
          <article>
            <h3>What does the paid Fix Pack include?</h3>
            <p>
              The live paid offer is one proof-backed repair pass tied to one saved
              report, plus one rerun after fixes. Dodo shows the checkout price, and
              the support policy covers refund handling if payment succeeds but the
              repair queue cannot start.
            </p>
          </article>
          <article>
            <h3>How is AI or GEO readiness handled?</h3>
            <p>
              AI Answer Readiness is proof-derived from rendered content, schema,
              canonical and internal-link clarity, sitemap context, question-led
              sections, and optional llms.txt boundaries. It is not live
              answer-engine sampling or AI citation monitoring.
            </p>
          </article>
          <article>
            <h3>What is not live yet?</h3>
            <p>
              SEO Fix Kit does not auto-publish content, call CMS admin APIs, open
              GitHub pull requests, sell recurring repair-agent subscriptions, or
              guarantee rankings, traffic, indexing, AI citations, or revenue.
            </p>
          </article>
        </div>
      </section>

      <footer className="site-footer">
        <span>Audit it. Prove it. Fix it.</span>
        <a href="/demo">Demo</a>
        <a href="/methodology">Methodology</a>
        <a href="/packages">Packages</a>
        <a href="/support">Support</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>
      </footer>
    </main>
  );
}

function BetaApp() {
  const reportId = reportIdFromPath();
  const isAdminRoute = window.location.pathname === "/beta/admin";
  const isBillingRoute = window.location.pathname.startsWith("/beta/billing");
  const inviteParams = new URLSearchParams(window.location.search);
  const accessToken = inviteParams.get("access") || "";
  const [ownerEmail, setOwnerEmail] = useState(
    () => inviteParams.get("email") || window.sessionStorage.getItem(BETA_EMAIL_KEY) || ""
  );
  const [loginEmail, setLoginEmail] = useState(ownerEmail || inviteParams.get("email") || "");
  const [inviteCode, setInviteCode] = useState(inviteParams.get("invite") || "");
  const [isAuthed, setIsAuthed] = useState(
    () => window.sessionStorage.getItem(BETA_SESSION_KEY) === "1"
  );
  const [loginStatus, setLoginStatus] = useState(accessToken ? "submitting" : "idle");
  const [loginMessage, setLoginMessage] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [maxPages, setMaxPages] = useState(String(DEFAULT_CRAWL_PAGES));
  const [renderedCrawlTarget, setRenderedCrawlTarget] = useState("0");
  const [competitorUrls, setCompetitorUrls] = useState("");
  const [backlinkRows, setBacklinkRows] = useState("");
  const [keywordRows, setKeywordRows] = useState("");
  const [localBusinessName, setLocalBusinessName] = useState("");
  const [localPhone, setLocalPhone] = useState("");
  const [localAddress, setLocalAddress] = useState("");
  const [googleBusinessProfileUrl, setGoogleBusinessProfileUrl] = useState("");
  const [localKeywords, setLocalKeywords] = useState("");
  const [localCitations, setLocalCitations] = useState("");
  const [auditStatus, setAuditStatus] = useState(reportId ? "loading" : "idle");
  const [auditMessage, setAuditMessage] = useState("");
  const [report, setReport] = useState(null);
  const [accountData, setAccountData] = useState(null);
  const [accountStatus, setAccountStatus] = useState("idle");
  const [accountMessage, setAccountMessage] = useState("");
  const [siteHost, setSiteHost] = useState("");
  const [siteStatus, setSiteStatus] = useState("idle");
  const [siteMessage, setSiteMessage] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState("idle");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [developerData, setDeveloperData] = useState(null);
  const [developerStatus, setDeveloperStatus] = useState("idle");
  const [developerMessage, setDeveloperMessage] = useState("");
  const [apiTokenSecret, setApiTokenSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [adminData, setAdminData] = useState(null);
  const [adminStatus, setAdminStatus] = useState("idle");
  const [adminMessage, setAdminMessage] = useState("");
  const [accessFormStartedAt] = useState(() => Date.now());

  useEffect(() => {
    if (isAdminRoute) {
      document.title = "SEO Fix Kit Ops";
      return;
    }
    if (isBillingRoute) {
      document.title = "SEO Fix Kit Billing";
      return;
    }
    if (report?.url) {
      document.title = `SEO Fix Kit report - ${safeHostnameLabel(report.url)}`;
      return;
    }
    document.title = "SEO Fix Kit Beta";
  }, [isAdminRoute, isBillingRoute, report?.url]);

  useEffect(() => {
    if (window.sessionStorage.getItem(BETA_SESSION_KEY) === "1" || reportId || isAdminRoute || isBillingRoute) {
      refreshSession(setIsAuthed, setOwnerEmail);
    }
  }, [reportId, isAdminRoute, isBillingRoute]);

  useEffect(() => {
    if (!inviteParams.get("invite")) return;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("invite");
    window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoginStatus("submitting");
    setLoginMessage("Opening secure access link.");
    verifyAccessToken(accessToken)
      .then((payload) => {
        if (cancelled) return;
        window.sessionStorage.setItem(BETA_SESSION_KEY, "1");
        window.sessionStorage.setItem(BETA_EMAIL_KEY, payload.ownerEmail || loginEmail);
        setOwnerEmail(payload.ownerEmail || loginEmail);
        setIsAuthed(true);
        setLoginStatus("success");
        setLoginMessage("Access unlocked.");
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("access");
        cleanUrl.searchParams.delete("email");
        window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoginStatus("error");
        setLoginMessage(error.message || "Access link is expired or already used.");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!isAuthed || !reportId) return;
    loadReport(reportId, setReport, setAuditStatus, setAuditMessage, () => {
      setIsAuthed(false);
      window.sessionStorage.removeItem(BETA_SESSION_KEY);
      window.sessionStorage.removeItem(BETA_EMAIL_KEY);
    });
  }, [isAuthed, reportId]);

  useEffect(() => {
    if (!isAuthed || reportId || isAdminRoute || isBillingRoute) return;
    loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
  }, [isAuthed, reportId, isAdminRoute, isBillingRoute]);

  useEffect(() => {
    if (!isAuthed || reportId || isAdminRoute || isBillingRoute) return;
    if (!Number(accountData?.metrics?.runningAudits || 0)) return;
    const interval = window.setInterval(() => {
      loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [isAuthed, reportId, isAdminRoute, isBillingRoute, accountData?.metrics?.runningAudits]);

  async function login(event) {
    event.preventDefault();
    setLoginStatus("submitting");
    setLoginMessage("");

    try {
      const response = await fetch("/api/beta/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: loginEmail, inviteCode })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Private beta invite code required.");
      }
      window.sessionStorage.setItem(BETA_SESSION_KEY, "1");
      window.sessionStorage.setItem(BETA_EMAIL_KEY, payload.ownerEmail || loginEmail);
      setOwnerEmail(payload.ownerEmail || loginEmail);
      setIsAuthed(true);
      setLoginStatus("success");
      setInviteCode("");
    } catch (error) {
      setLoginStatus("error");
      setLoginMessage(error.message || "Could not unlock private beta.");
    }
  }

  async function requestGateAccess() {
    setLoginStatus("submitting");
    setLoginMessage("");
    try {
      const payload = await postAccessRequest({
        email: loginEmail,
        source: "beta-gate-access",
        formStartedAt: accessFormStartedAt,
        returnTo: window.location.pathname.startsWith("/beta") ? window.location.pathname : ""
      });
      setLoginStatus("success");
      setLoginMessage(
        payload.accessUrl
          ? "Local access link created."
          : payload.message ||
            (reportId
              ? "Check your email — the link will bring you straight back to this report."
              : "Check your email for a secure access link.")
      );
      if (payload.accessUrl) window.location.assign(payload.accessUrl);
    } catch (error) {
      setLoginStatus("error");
      setLoginMessage(error.message || "Could not send the access link.");
    }
  }

  async function claimSite(event) {
    event.preventDefault();
    setSiteStatus("loading");
    setSiteMessage("Creating verification challenge.");
    try {
      const payload = await postSiteClaim(siteHost);
      setSiteStatus("success");
      setSiteMessage(`Verification challenge ready for ${payload.site?.host || siteHost}.`);
      setSiteHost("");
      await loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    } catch (error) {
      setSiteStatus("error");
      setSiteMessage(error.message || "Could not create site verification.");
    }
  }

  async function verifySite(claimId) {
    setSiteStatus("loading");
    setSiteMessage("Checking DNS and HTTPS proof.");
    try {
      const payload = await postSiteVerify(claimId);
      setSiteStatus(payload.verified ? "success" : "error");
      setSiteMessage(payload.verified ? `${payload.site.host} is verified.` : payload.message || "Verification proof was not found yet.");
      await loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    } catch (error) {
      setSiteStatus("error");
      setSiteMessage(error.message || "Could not verify site.");
    }
  }

  async function createSchedule(url) {
    setScheduleStatus("loading");
    setScheduleMessage("Adding weekly monitor.");
    try {
      const payload = await postAuditSchedule(url, { intervalDays: 7, maxPages: DEFAULT_CRAWL_PAGES });
      setScheduleStatus("success");
      setScheduleMessage(`${payload.schedule?.targetHost || safeHostnameLabel(url)} will be checked weekly.`);
      await loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    } catch (error) {
      setScheduleStatus("error");
      setScheduleMessage(error.message || "Could not add monitor.");
    }
  }

  async function deleteSchedule(scheduleId) {
    setScheduleStatus("loading");
    setScheduleMessage("Pausing monitor.");
    try {
      await pauseAuditSchedule(scheduleId);
      setScheduleStatus("success");
      setScheduleMessage("Monitor paused.");
      await loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    } catch (error) {
      setScheduleStatus("error");
      setScheduleMessage(error.message || "Could not pause monitor.");
    }
  }

  async function createApiToken() {
    setDeveloperStatus("loading");
    setDeveloperMessage("Creating API key.");
    setApiTokenSecret("");
    try {
      const payload = await postDeveloperToken();
      setApiTokenSecret(payload.tokenSecret || "");
      setDeveloperStatus("success");
      setDeveloperMessage(payload.message || "API key created.");
      await loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
    } catch (error) {
      setDeveloperStatus("error");
      setDeveloperMessage(error.message || "Could not create API key.");
    }
  }

  async function revokeApiToken(tokenId) {
    setDeveloperStatus("loading");
    setDeveloperMessage("Revoking API key.");
    try {
      await deleteDeveloperToken(tokenId);
      setDeveloperStatus("success");
      setDeveloperMessage("API key revoked.");
      await loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
    } catch (error) {
      setDeveloperStatus("error");
      setDeveloperMessage(error.message || "Could not revoke API key.");
    }
  }

  async function createWebhook(event) {
    event.preventDefault();
    setDeveloperStatus("loading");
    setDeveloperMessage("Adding webhook.");
    setWebhookSecret("");
    try {
      const payload = await postDeveloperWebhook(webhookUrl);
      setWebhookUrl("");
      setWebhookSecret(payload.signingSecret || "");
      setDeveloperStatus("success");
      setDeveloperMessage("Webhook added.");
      await loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
    } catch (error) {
      setDeveloperStatus("error");
      setDeveloperMessage(error.message || "Could not add webhook.");
    }
  }

  async function revokeWebhook(webhookId) {
    setDeveloperStatus("loading");
    setDeveloperMessage("Revoking webhook.");
    try {
      await deleteDeveloperWebhook(webhookId);
      setDeveloperStatus("success");
      setDeveloperMessage("Webhook revoked.");
      await loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
    } catch (error) {
      setDeveloperStatus("error");
      setDeveloperMessage(error.message || "Could not revoke webhook.");
    }
  }

  async function runAudit(event) {
    event.preventDefault();
    setAuditStatus("loading");
    const localSeo = {
      businessName: localBusinessName,
      phone: localPhone,
      address: localAddress,
      googleBusinessProfileUrl,
      localKeywords,
      citations: localCitations
    };
    setAuditMessage(
      competitorUrls.trim() || backlinkRows.trim() || keywordRows.trim() || Object.values(localSeo).some((value) => String(value || "").trim())
        ? "Rendering the site, checking comparison inputs, and collecting proof."
        : "Rendering the site, crawling same-site links, and collecting proof."
    );
    setReport(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ url: targetUrl, maxPages: Number(maxPages), renderedCrawlTarget: Number(renderedCrawlTarget), competitorUrls, backlinkRows, keywordRows, localSeo })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "The audit failed.");
      }
      if (payload.mode === "queued" && (payload.jobId || payload.job?.id)) {
        const jobId = payload.jobId || payload.job.id;
        setAuditMessage("Audit queued. Waiting for proof collection to start.");
        const job = await pollAuditJob(jobId, setAuditMessage);
        if (!job.reportId) {
          throw new Error("Audit finished without a saved report.");
        }
        if (job.reportPath) {
          window.history.replaceState(null, "", job.reportPath);
        }
        await loadReport(job.reportId, setReport, setAuditStatus, setAuditMessage, () => {
          setIsAuthed(false);
          window.sessionStorage.removeItem(BETA_SESSION_KEY);
          window.sessionStorage.removeItem(BETA_EMAIL_KEY);
        });
        loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
        window.requestAnimationFrame(() => window.scrollTo(0, 0));
        return;
      }
      setReport(payload);
      setAuditStatus("success");
      setAuditMessage("Audit saved. Private report URL is ready.");
      loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
      if (payload.reportPath) {
        window.history.replaceState(null, "", payload.reportPath);
      }
      window.requestAnimationFrame(() => window.scrollTo(0, 0));
    } catch (error) {
      if (
        error.message.toLowerCase().includes("session") ||
        error.message.toLowerCase().includes("password") ||
        error.message.toLowerCase().includes("invite")
      ) {
        setIsAuthed(false);
        window.sessionStorage.removeItem(BETA_SESSION_KEY);
        window.sessionStorage.removeItem(BETA_EMAIL_KEY);
      }
      setAuditStatus("error");
      setAuditMessage(error.message || "The audit failed. Try another URL.");
    }
  }

  function lock() {
    fetch("/api/beta/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    window.sessionStorage.removeItem(BETA_SESSION_KEY);
    window.sessionStorage.removeItem(BETA_EMAIL_KEY);
    setOwnerEmail("");
    setLoginEmail("");
    setInviteCode("");
    setIsAuthed(false);
    setReport(null);
    setAccountData(null);
    window.history.replaceState(null, "", "/beta");
  }

  const showingReport = Boolean(report && auditStatus === "success");

  if (isAdminRoute) {
    return (
      <main className="beta-shell">
        <BetaTop onLock={lock} showBilling showOps />
        <AdminDashboard
          adminData={adminData}
          adminMessage={adminMessage}
          adminStatus={adminStatus}
          adminToken={adminToken}
          onLoad={() => loadAdmin(adminToken, setAdminData, setAdminStatus, setAdminMessage, () => setAdminToken(""))}
          onTokenChange={(value) => {
            setAdminToken(value);
          }}
          onInviteCreated={() => loadAdmin("", setAdminData, setAdminStatus, setAdminMessage)}
        />
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main className="beta-shell beta-gate">
        <BetaTop />
        <section className="gate-panel" aria-labelledby="beta-title">
          <p className="beta-eyebrow">Private beta</p>
          <h1 id="beta-title">Enter your beta invite</h1>
          <p>
            Run evidence-backed audits, save private reports, and generate the
            repair brief a developer can ship from.
          </p>
          <form className="gate-form" onSubmit={login}>
            <label htmlFor="beta-email">Invite email</label>
            <input
              autoComplete="email"
              id="beta-email"
              inputMode="email"
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={loginEmail}
            />
            <label htmlFor="beta-password">Invite code</label>
            <div className="gate-row">
              <input
                autoComplete="current-password"
                id="beta-password"
                onChange={(event) => setInviteCode(event.target.value)}
                required
                type="password"
                value={inviteCode}
              />
              <button disabled={loginStatus === "submitting"} type="submit">
                {loginStatus === "submitting" ? "Checking" : "Enter"}
              </button>
            </div>
            <p className={`form-message ${loginStatus}`} aria-live="polite">
              {loginMessage || "Use an invite code, or email yourself a secure one-use link."}
            </p>
            <div className="access-request-row">
              <span>Need access?</span>
              <button
                className="text-button accent-text"
                disabled={loginStatus === "submitting" || !loginEmail}
                onClick={requestGateAccess}
                type="button"
              >
                Email access link
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  if (isBillingRoute) {
    return (
      <main className="beta-shell">
        <BetaTop onLock={lock} showBilling />
        <BillingPortal ownerEmail={ownerEmail} />
      </main>
    );
  }

  return (
    <main className="beta-shell">
      <BetaTop onLock={lock} showBilling />

      <section
        className={`beta-hero ${showingReport ? "beta-hero-compact" : ""}`}
        aria-labelledby="beta-workspace-title"
      >
        <div>
          <p className="beta-eyebrow">Audit workspace</p>
          <h1 id="beta-workspace-title">
            {showingReport ? "Proof-backed SEO audit" : "Find the SEO problem. Prove it. Generate the fix."}
          </h1>
          {ownerEmail && <p className="session-note">Private beta session: {ownerEmail}</p>}
        </div>
        <form className="audit-form" onSubmit={runAudit}>
          <label htmlFor="audit-url">Website URL</label>
          <div className="audit-row">
            <input
              id="audit-url"
              inputMode="url"
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://example.com"
              required
              type="url"
              value={targetUrl}
            />
            <button disabled={auditStatus === "loading"} type="submit">
              {auditStatus === "loading" ? "Auditing" : "Run audit"}
            </button>
          </div>
          <label htmlFor="crawl-depth">Crawl depth</label>
          <select
            id="crawl-depth"
            onChange={(event) => setMaxPages(event.target.value)}
            value={maxPages}
          >
            {CRAWL_DEPTH_TIERS.map((tier) => (
              <option key={tier.id} value={tier.pages}>
                {tier.label} - {tier.pages} pages
              </option>
            ))}
          </select>
          <p className="field-note">Self-serve deep crawls currently run up to {SELF_SERVE_MAX_CRAWL_PAGES.toLocaleString()} pages.</p>
          <label htmlFor="rendered-crawl-target">Rendered scale target</label>
          <select
            id="rendered-crawl-target"
            onChange={(event) => setRenderedCrawlTarget(event.target.value)}
            value={renderedCrawlTarget}
          >
            <option value="0">No staged target</option>
            {RENDERED_CRAWL_TARGETS.slice(1).map((tier) => (
              <option key={tier.id} value={tier.pages}>
                {tier.label} - {tier.pages.toLocaleString()} pages
              </option>
            ))}
          </select>
          <p className="field-note">Early access: large targets create a staged batch plan that renders gradually in the background over days to weeks. No full-coverage claim is made until every batch completes.</p>
          <label htmlFor="competitor-urls">Competitors</label>
          <textarea
            id="competitor-urls"
            onChange={(event) => setCompetitorUrls(event.target.value)}
            placeholder="https://competitor.com"
            rows="3"
            value={competitorUrls}
          />
          <label htmlFor="backlink-rows">Backlinks</label>
          <textarea
            id="backlink-rows"
            onChange={(event) => setBacklinkRows(event.target.value)}
            placeholder="https://source.com/page,https://example.com/page,anchor text"
            rows="4"
            value={backlinkRows}
          />
          <label htmlFor="keyword-rows">Keyword rows</label>
          <textarea
            id="keyword-rows"
            onChange={(event) => setKeywordRows(event.target.value)}
            placeholder="query,page,clicks,impressions,ctr,position,previous_clicks,previous_position"
            rows="4"
            value={keywordRows}
          />
          <div className="local-seo-fields">
            <label htmlFor="local-business-name">Local business</label>
            <input
              id="local-business-name"
              onChange={(event) => setLocalBusinessName(event.target.value)}
              placeholder="Bright Dental Austin"
              type="text"
              value={localBusinessName}
            />
            <label htmlFor="local-phone">Phone</label>
            <input
              id="local-phone"
              onChange={(event) => setLocalPhone(event.target.value)}
              placeholder="+1 512 555 0199"
              type="tel"
              value={localPhone}
            />
            <label htmlFor="local-address">Address</label>
            <textarea
              id="local-address"
              onChange={(event) => setLocalAddress(event.target.value)}
              placeholder="123 Main St, Austin, TX 78701"
              rows="2"
              value={localAddress}
            />
            <label htmlFor="google-business-profile-url">Google Business Profile</label>
            <input
              id="google-business-profile-url"
              inputMode="url"
              onChange={(event) => setGoogleBusinessProfileUrl(event.target.value)}
              placeholder="https://maps.google.com/?cid=..."
              type="url"
              value={googleBusinessProfileUrl}
            />
            <label htmlFor="local-keywords">Local keywords</label>
            <textarea
              id="local-keywords"
              onChange={(event) => setLocalKeywords(event.target.value)}
              placeholder="dentist Austin"
              rows="3"
              value={localKeywords}
            />
            <label htmlFor="local-citations">Citations</label>
            <textarea
              id="local-citations"
              onChange={(event) => setLocalCitations(event.target.value)}
              placeholder="https://directory.com/profile,Bright Dental Austin,+1 512 555 0199,123 Main St Austin TX"
              rows="3"
              value={localCitations}
            />
          </div>
        </form>
      </section>

      {!showingReport && (
        <CustomerDashboard
          accountData={accountData}
          developerData={developerData}
          developerMessage={developerMessage}
          developerStatus={developerStatus}
          apiTokenSecret={apiTokenSecret}
          webhookSecret={webhookSecret}
          webhookUrl={webhookUrl}
          onApiTokenCreate={createApiToken}
          onApiTokenRevoke={revokeApiToken}
          onScheduleCreate={createSchedule}
          onScheduleDelete={deleteSchedule}
          onSiteClaim={claimSite}
          onSiteHostChange={setSiteHost}
          onSiteVerify={verifySite}
          onWebhookCreate={createWebhook}
          onWebhookRevoke={revokeWebhook}
          onWebhookUrlChange={setWebhookUrl}
          message={accountMessage}
          scheduleMessage={scheduleMessage}
          scheduleStatus={scheduleStatus}
          siteHost={siteHost}
          siteMessage={siteMessage}
          siteStatus={siteStatus}
          status={accountStatus}
        />
      )}

      <section className="audit-stage" aria-live="polite">
        {auditStatus === "idle" && <EmptyAuditState />}
        {auditStatus === "loading" && <LoadingAuditState message={auditMessage} />}
        {auditStatus === "error" && <ErrorAuditState message={auditMessage} />}
        {report && auditStatus === "success" && (
          <ReportView report={report} />
        )}
      </section>
    </main>
  );
}

function BetaTop({ onLock, showBilling = false, showOps = false }) {
  return (
    <header className="beta-top">
      <a className="brand-lockup" href="/" aria-label="SEO Fix Kit home">
        <LogoMark />
        <span>SEO Fix Kit</span>
      </a>
      <nav>
        <a href="/">Public page</a>
        {showBilling && <a href="/beta/billing">Billing</a>}
        {showOps && <a href="/beta/admin">Ops</a>}
        {onLock && (
          <button className="text-button" onClick={onLock} type="button">
            Lock
          </button>
        )}
      </nav>
    </header>
  );
}

function CustomerDashboard({
  accountData,
  developerData,
  developerMessage,
  developerStatus,
  apiTokenSecret,
  webhookSecret,
  webhookUrl,
  onApiTokenCreate,
  onApiTokenRevoke,
  message,
  onScheduleCreate,
  onScheduleDelete,
  onSiteClaim,
  onSiteHostChange,
  onSiteVerify,
  onWebhookCreate,
  onWebhookRevoke,
  onWebhookUrlChange,
  scheduleMessage,
  scheduleStatus,
  siteHost,
  siteMessage,
  siteStatus,
  status
}) {
  const metrics = accountData?.metrics || {};
  const reports = accountData?.recentReports || [];
  const auditJobs = accountData?.recentAuditJobs || [];
  const fixRequests = accountData?.fixRequests || [];
  const nextActions = accountData?.nextActions || [];
  const primaryAction = nextActions[0] || null;
  const repairAgent = accountData?.repairAgent || {};
  const repairCounts = repairAgent.counts || {};
  const repairItems = repairAgent.nextItems || [];
  const sites = accountData?.sites || [];
  const schedules = accountData?.schedules || [];
  const monitoring = accountData?.monitoring || {};
  const verifiedSites = sites.filter((site) => site.status === "verified");
  const pendingSites = sites.filter((site) => site.status !== "verified");

  return (
    <section className="account-dashboard" aria-label="Account overview">
      <div className="section-heading">
        <p className="beta-eyebrow">Your workspace</p>
        <h2>{verifiedSites.length ? "Recent proof audits" : "Verify a site first"}</h2>
        {message && status !== "success" && <p className={`form-message ${status}`}>{message}</p>}
      </div>
      <section className="metric-strip account-metrics" aria-label="Account summary">
        <Metric label="Reports" value={metrics.reports || 0} />
        <Metric label="Running" value={metrics.runningAudits || 0} />
        <Metric label="Fix Packs" value={metrics.fixRequests || 0} />
        <Metric label="Verified sites" value={metrics.verifiedSites || verifiedSites.length || 0} />
        <Metric label="Monitors" value={`${metrics.monitors || schedules.length || 0}/${metrics.monitorLimit || monitoring.limit || 5}`} />
        <Metric label="Open repairs" value={metrics.openRepairs || repairCounts.active || 0} />
        <Metric label="Drafts" value={metrics.draftedActions || repairCounts.awaitingApproval || 0} />
        <Metric label="Regressed" value={metrics.regressedRepairs || 0} />
      </section>
      <section className="account-panel monitoring-offer-panel">
        <div className="section-heading">
          <p className="beta-eyebrow">Proof Monitoring</p>
          <h3>
            {monitoring.status === "active"
              ? "Monitoring entitlement active"
              : monitoring.checkoutLive
                ? "Paid monitoring checkout available"
                : "Beta monitoring allowance"}
          </h3>
        </div>
        <p>{monitoring.message || "Weekly monitoring watches verified sites and reports proof deltas without claiming to fix issues."}</p>
      </section>
      <RepairAgentFeed items={repairItems} nextAction={primaryAction} reports={reports} />
      <div className="site-verification-panel">
        <div>
          <p className="beta-eyebrow">Site verification</p>
          <h3>Prove you own the host before self-serve audits run.</h3>
          <p>Founder override can still test manually. Customer sessions need an exact verified host.</p>
        </div>
        <form className="site-claim-form" onSubmit={onSiteClaim}>
          <label htmlFor="site-host">Website host</label>
          <div className="audit-row">
            <input
              id="site-host"
              inputMode="url"
              onChange={(event) => onSiteHostChange(event.target.value)}
              placeholder="example.com"
              required
              type="text"
              value={siteHost}
            />
            <button disabled={siteStatus === "loading"} type="submit">
              {siteStatus === "loading" ? "Checking" : "Add site"}
            </button>
          </div>
          {siteMessage && <p className={`form-message ${siteStatus}`}>{siteMessage}</p>}
        </form>
      </div>
      {scheduleMessage && <p className={`form-message ${scheduleStatus}`}>{scheduleMessage}</p>}
      {Boolean(sites.length) && (
        <div className="site-claim-list">
          {sites.map((site) => {
            const monitor = schedules.find((schedule) => hostKey(schedule.targetHost || schedule.targetUrl) === hostKey(site.host));
            return (
              <article className={`site-claim-card ${site.status}`} key={site.id || site.host}>
                <div>
                  <span className="status-pill">{site.status}</span>
                  <h3>{site.host}</h3>
                  {site.status === "verified" ? (
                    <p>{monitor ? `Monitoring ${monitor.cadenceLabel?.toLowerCase() || "weekly"}.` : `Verified by ${site.verificationMethod || "site proof"}.`}</p>
                  ) : (
                    <div className="verification-instructions">
                      <p>Add either proof, then click verify.</p>
                      <code>TXT {site.dnsName}: {site.dnsValue}</code>
                      <code>{site.filePath}: {site.fileContents}</code>
                    </div>
                  )}
                </div>
                {site.status === "verified" ? (
                  monitor ? (
                    <button
                      className="action-link"
                      disabled={scheduleStatus === "loading"}
                      onClick={() => onScheduleDelete(monitor.id)}
                      type="button"
                    >
                      Pause monitor
                    </button>
                  ) : (
                    <button
                      className="action-link"
                      disabled={scheduleStatus === "loading"}
                      onClick={() => onScheduleCreate(`https://${site.host}/`)}
                      type="button"
                    >
                      Monitor weekly
                    </button>
                  )
                ) : (
                  <button
                    className="action-link"
                    disabled={siteStatus === "loading"}
                    onClick={() => onSiteVerify(site.id)}
                    type="button"
                  >
                    Verify now
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {Boolean(schedules.length) && (
        <div className="audit-schedule-list">
          {schedules.map((schedule) => (
            <article className={`audit-schedule-card ${schedule.lastError ? "failed" : "active"}`} key={schedule.id}>
              <div>
                <span className="status-pill">{schedule.cadenceLabel || "Weekly"}</span>
                <h3>{schedule.targetHost || safeHostnameLabel(schedule.targetUrl)}</h3>
                <p>{auditScheduleDetail(schedule)}</p>
                {schedule.lastError && <p className="quiet-note">{schedule.lastError}</p>}
              </div>
              <div className="schedule-actions">
                {schedule.lastReportPath ? (
                  <a className="action-link" href={schedule.lastReportPath}>Latest report</a>
                ) : (
                  <span className="quiet-note">Waiting for first run</span>
                )}
                <button
                  className="action-link"
                  disabled={scheduleStatus === "loading"}
                  onClick={() => onScheduleDelete(schedule.id)}
                  type="button"
                >
                  Pause
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {Boolean(auditJobs.length) && (
        <div className="audit-job-list">
          {auditJobs.slice(0, 5).map((job) => (
            <article className={`audit-job-card ${job.status}`} key={job.id}>
              <div>
                <span className="status-pill">{statusLabel(job.status)}</span>
                <h3>{job.targetHost || safeHostnameLabel(job.targetUrl)}</h3>
                <p>{auditJobDetail(job)}</p>
              </div>
              {job.reportPath ? (
                <a className="action-link" href={job.reportPath}>Open report</a>
              ) : (
                <span className="quiet-note">{job.status === "failed" ? "Needs rerun" : "Working"}</span>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="account-grid">
        <div className="account-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Next</p>
            <h3>{primaryAction?.label || "Start with a page that matters"}</h3>
          </div>
          <p>{primaryAction?.detail || "Paste your homepage, pricing page, or highest-value product page."}</p>
          {primaryAction?.href && <a className="action-link" href={primaryAction.href}>Open next action</a>}
        </div>
        <div className="account-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Reports</p>
            <h3>{reports.length ? "Latest scans" : "No reports yet"}</h3>
          </div>
          <div className="account-list">
            {reports.slice(0, 4).map((item) => (
              <a href={item.reportPath} key={item.id}>
                <span>{item.targetHost || safeHostnameLabel(item.url)}</span>
                <strong>{item.score}/100</strong>
              </a>
            ))}
            {!reports.length && <p className="quiet-note">Your saved reports will appear here after the first audit.</p>}
          </div>
        </div>
        <div className="account-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Repair queue</p>
            <h3>{fixRequests.length ? "Fix Pack status" : "Nothing paid yet"}</h3>
          </div>
          <div className="account-list">
            {fixRequests.slice(0, 3).map((request) => (
              <a href={request.reportPath || "/beta/billing"} key={request.id}>
                <span>{request.targetHost || request.targetUrl || "Fix Pack"}</span>
                <strong>{request.statusLabel || statusLabel(request.status)}</strong>
              </a>
            ))}
            {!fixRequests.length && (
              <p className="quiet-note">
                Checkout starts from a report with proven fixes.
              </p>
            )}
          </div>
        </div>
      </div>
      <DeveloperApiPanel
        apiTokenSecret={apiTokenSecret}
        developerData={developerData}
        developerMessage={developerMessage}
        developerStatus={developerStatus}
        onApiTokenCreate={onApiTokenCreate}
        onApiTokenRevoke={onApiTokenRevoke}
        onWebhookCreate={onWebhookCreate}
        onWebhookRevoke={onWebhookRevoke}
        onWebhookUrlChange={onWebhookUrlChange}
        webhookSecret={webhookSecret}
        webhookUrl={webhookUrl}
      />
    </section>
  );
}

function RepairAgentFeed({ items = [], nextAction = null, reports = [] }) {
  const hasReports = reports.length > 0;
  return (
    <section className="repair-agent-panel" aria-label="Repair agent feed">
      <div className="repair-agent-heading">
        <div>
          <p className="beta-eyebrow">Repair agent</p>
          <h3>{items.length ? nextAction?.label || "Proof-backed next actions" : "Waiting for repair proof"}</h3>
          <p>
            {items.length
              ? nextAction?.detail || "Review the highest-priority repair work across your saved reports."
              : hasReports
                ? "Open a report with proven issues to start the repair queue."
                : "Run the first audit to create a queue."}
          </p>
        </div>
        {nextAction?.href && <a className="action-link" href={nextAction.href}>Open action</a>}
      </div>
      <div className="repair-agent-list">
        {items.slice(0, 4).map((item) => (
          <a className={`repair-agent-card ${item.status || "open"}`} href={item.reportPath || nextAction?.href || "/beta"} key={item.id}>
            <div className="repair-agent-card-head">
              <span className={`status-pill ${item.severity || "notice"}`}>{item.severity || "notice"}</span>
              <span className="status-pill">{repairStatusLabel(item.status)}</span>
            </div>
            <h4>{item.nextActionLabel || item.title}</h4>
            <p>{item.nextActionDetail || item.proof || item.acceptance}</p>
            <div className="repair-agent-meta">
              <span>{item.targetHost || "Saved report"}</span>
              <span>{repairActionModeLabel(item.actionMode)}</span>
            </div>
          </a>
        ))}
        {!items.length && (
          <div className="repair-agent-empty">
            <strong>{hasReports ? "No active repair queue yet." : "No reports yet."}</strong>
            <span>{hasReports ? "Latest reports and drafts will appear here once issues are queued." : "Verify a site and run an audit first."}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function DeveloperApiPanel({
  apiTokenSecret,
  developerData,
  developerMessage,
  developerStatus,
  onApiTokenCreate,
  onApiTokenRevoke,
  onWebhookCreate,
  onWebhookRevoke,
  onWebhookUrlChange,
  webhookSecret,
  webhookUrl
}) {
  const tokens = developerData?.tokens || [];
  const webhooks = developerData?.webhooks || [];
  return (
    <section className="developer-api-panel" aria-label="Developer API">
      <div className="section-heading">
        <p className="beta-eyebrow">Developer API</p>
        <h3>Run proof audits from your own tools.</h3>
        {developerMessage && <p className={`form-message ${developerStatus}`}>{developerMessage}</p>}
      </div>
      <div className="developer-api-grid">
        <div className="developer-api-column">
          <div className="developer-api-header">
            <div>
              <span>API keys</span>
              <strong>{tokens.length}/5 active</strong>
            </div>
            <button
              className="action-link"
              disabled={developerStatus === "loading"}
              onClick={onApiTokenCreate}
              type="button"
            >
              Create API key
            </button>
          </div>
          {apiTokenSecret && (
            <div className="secret-box">
              <span>Copy now</span>
              <code>{apiTokenSecret}</code>
              <button className="text-button accent-text" onClick={() => copyText(apiTokenSecret)} type="button">
                Copy
              </button>
            </div>
          )}
          <div className="developer-api-list">
            {tokens.map((token) => (
              <div className="developer-api-row" key={token.id}>
                <div>
                  <strong>{token.label || "API key"}</strong>
                  <span>{token.tokenPrefix || "hidden"}{token.lastUsedAt ? ` · used ${formatDate(token.lastUsedAt)}` : ""}</span>
                </div>
                <button
                  className="text-button"
                  disabled={developerStatus === "loading"}
                  onClick={() => onApiTokenRevoke(token.id)}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            ))}
            {!tokens.length && <p className="quiet-note">No active API keys.</p>}
          </div>
        </div>
        <div className="developer-api-column">
          <form className="developer-webhook-form" onSubmit={onWebhookCreate}>
            <label htmlFor="webhook-url">Webhook URL</label>
            <div className="audit-row">
              <input
                id="webhook-url"
                inputMode="url"
                onChange={(event) => onWebhookUrlChange(event.target.value)}
                placeholder="https://example.com/seofixkit-webhook"
                required
                type="url"
                value={webhookUrl}
              />
              <button disabled={developerStatus === "loading"} type="submit">
                Add webhook
              </button>
            </div>
          </form>
          {webhookSecret && (
            <div className="secret-box">
              <span>Signing secret</span>
              <code>{webhookSecret}</code>
              <button className="text-button accent-text" onClick={() => copyText(webhookSecret)} type="button">
                Copy
              </button>
            </div>
          )}
          <div className="developer-api-list">
            {webhooks.map((webhook) => (
              <div className="developer-api-row" key={webhook.id}>
                <div>
                  <strong>{safeUrlLabel(webhook.url)}</strong>
                  <span>{(webhook.events || []).join(", ")}{webhook.lastDeliveryStatus ? ` · ${webhook.lastDeliveryStatus}` : ""}</span>
                </div>
                <button
                  className="text-button"
                  disabled={developerStatus === "loading"}
                  onClick={() => onWebhookRevoke(webhook.id)}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            ))}
            {!webhooks.length && <p className="quiet-note">No active webhooks.</p>}
          </div>
        </div>
      </div>
      <div className="api-command-strip">
        <code>POST /v1/audits</code>
        <code>GET /v1/audits/{"{audit_id}"}</code>
        <code>GET /v1/audits/{"{audit_id}"}/issues</code>
        <code>GET /v1/projects</code>
      </div>
    </section>
  );
}

function EmptyAuditState() {
  return (
    <div className="empty-state">
      <p className="beta-eyebrow">First audit</p>
      <h2>Start with one page your customers actually land on.</h2>
      <div className="onboarding-steps">
        <article>
          <strong>1</strong>
          <span>Verify the exact host with a DNS TXT record or HTTPS file.</span>
        </article>
        <article>
          <strong>2</strong>
          <span>Paste your homepage, pricing page, or highest-value product page.</span>
        </article>
        <article>
          <strong>3</strong>
          <span>SEO Fix Kit renders the site and only queues proven repairs.</span>
        </article>
      </div>
    </div>
  );
}

function LoadingAuditState({ message }) {
  return (
    <div className="loading-state">
      <div className="scan-orbit" aria-hidden="true" />
      <div>
        <p className="beta-eyebrow">Running audit</p>
        <h2>{message || "Rendering and collecting proof."}</h2>
        <p>Most runs take a short moment. JavaScript-heavy sites can take longer.</p>
      </div>
    </div>
  );
}

function ErrorAuditState({ message }) {
  return (
    <div className="empty-state error-state">
      <p className="beta-eyebrow">Needs another try</p>
      <h2>{message}</h2>
      <p>Check the URL and run again. Some sites block automated browsers.</p>
    </div>
  );
}

function ReportView({ report }) {
  const issues = useMemo(
    () => (report.findings || []).filter((finding) => finding.severity !== "good"),
    [report]
  );
  const guarded = useMemo(
    () => (report.findings || []).filter((finding) => finding.severity === "good"),
    [report]
  );
  const topFixes = report.repairPlan || [];
  const competitorBenchmark = report.competitorBenchmark || null;
  const crawlInventory = report.crawlInventory || report.crawl_inventory || null;
  const renderedCrawlScale = report.renderedCrawlScale || report.rendered_crawl_scale || null;
  const crawlIntelligence = report.crawlIntelligence || report.crawl_intelligence || null;
  const reportDelta = report.reportDelta || report.report_delta || null;
  const resourceWaterfall =
    report.resourceWaterfall ||
    report.resource_waterfall ||
    report.pages?.[0]?.resourceWaterfall ||
    null;
  const backlinkAudit = report.backlinkAudit || null;
  const localSeoAudit = report.localSeoAudit || null;
  const keywordRankAudit = report.keywordRankAudit || report.keyword_rank_audit || null;
  const platformSeoAudit = report.platformSeoAudit || report.platform_seo_audit || null;
  const aiAnswerReadiness = report.aiAnswerReadiness || report.ai_answer_readiness || null;
  const growthOpportunities = report.growthOpportunities || report.growth_opportunities || null;
  const geoReadiness = report.geoReadiness || report.geo_readiness || null;
  const remediationBrief = report.remediationBrief || report.remediation_brief || null;
  const pageSummaries = report.pageSummaries || summarizePages(report.pages || [], report.findings || [], report.url);
  const shareUrl = report.reportUrl || `${window.location.origin}${report.reportPath || window.location.pathname}`;
  const topThree = topFixes.slice(0, 3);
  const scannedAt = report.scannedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(report.scannedAt))
    : "just now";
  const expiresAt = report.retention?.expiresAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(report.retention.expiresAt))
    : "";
  const hasPriorityFixes = topFixes.length > 0;
  const checkoutReturned = new URLSearchParams(window.location.search).get("checkout") === "return";

  return (
    <div className="report-layout">
      <section className="score-panel">
        <div>
          <p className="beta-eyebrow">Saved report</p>
          <h2>{new URL(report.url).hostname}</h2>
          <p>{report.url}</p>
          <div className="score-meta">
            <span>{scannedAt}</span>
            <span>Rendered browser scan</span>
            <span>{report.summary?.crawlLimitHit ? "Crawl limit reached" : "Crawl completed"}</span>
            {report.owner?.email && <span>Owner: {report.owner.email}</span>}
            {expiresAt && <span>Expires: {expiresAt}</span>}
            {report.storageNote && <span>{report.storageNote}</span>}
          </div>
        </div>
        <div
          className="score-ring"
          style={{ "--score": report.score }}
          aria-label={`SEO score ${report.score} out of 100`}
        >
          <strong>{report.score}</strong>
          <span>/100</span>
        </div>
      </section>

      {(checkoutReturned || report.fixRequest) && (
        <FixRequestStatusPanel fixRequest={report.fixRequest} checkoutReturned={checkoutReturned} />
      )}

      {(report.repairProposals || []).length > 0 && (
        <RepairProposalPanel
          initialProposals={report.repairProposals || []}
          repairSprint={report.repairSprint || null}
          reportId={report.id}
        />
      )}

      <section className="metric-strip" aria-label="Audit summary">
        <Metric label="Pages" value={`${formatCount(report.summary?.pagesScanned || 0)}/${formatCount(report.summary?.maxPages || DEFAULT_CRAWL_PAGES)}`} />
        <Metric label="Critical" value={report.summary?.critical || 0} />
        <Metric label="Warnings" value={report.summary?.warnings || 0} />
        <Metric label="Notices" value={report.summary?.notices || 0} />
        <Metric label="Proof guards" value={report.summary?.guardedFalsePositives || 0} />
      </section>

      {competitorBenchmark?.status === "ready" && <CompetitorBenchmarkPanel benchmark={competitorBenchmark} />}

      {["ready", "empty"].includes(crawlInventory?.status) && <CrawlInventoryPanel inventory={crawlInventory} />}

      {renderedCrawlScale?.status === "ready" && <RenderedCrawlScalePanel plan={renderedCrawlScale} />}

      {crawlIntelligence?.status === "ready" && <CrawlIntelligencePanel audit={crawlIntelligence} />}

      {["ready", "first_run"].includes(reportDelta?.status) && <ReportDeltaPanel delta={reportDelta} />}

      {remediationBrief && <RemediationBriefPanel brief={remediationBrief} reportId={report.id} />}

      {backlinkAudit?.status === "ready" && <BacklinkAuditPanel audit={backlinkAudit} />}

      {localSeoAudit?.status === "ready" && <LocalSeoAuditPanel audit={localSeoAudit} />}

      {keywordRankAudit?.status === "ready" && <KeywordRankAuditPanel audit={keywordRankAudit} />}

      {platformSeoAudit?.status === "ready" && <PlatformSeoAuditPanel audit={platformSeoAudit} />}

      {aiAnswerReadiness?.status === "ready" && <AiAnswerReadinessPanel audit={aiAnswerReadiness} />}

      {growthOpportunities?.status === "ready" && <GrowthOpportunitiesPanel growth={growthOpportunities} />}

      {geoReadiness?.status === "ready" && <GeoReadinessPanel audit={geoReadiness} />}

      {report.performance && <PerformancePanel performance={report.performance} />}

      {["ready", "empty"].includes(resourceWaterfall?.status) && (
        <ResourceWaterfallPanel waterfall={resourceWaterfall} />
      )}

      <section className="verdict-panel">
        <div>
          <p className="beta-eyebrow">Verified repair brief</p>
          <h2>{topFixes.length ? "Fix the proven issues first." : "No priority repairs found."}</h2>
          <p>
            SEO Fix Kit compares raw HTML with the rendered page, then only queues fixes with visible proof.
            This is the anti-noise layer: no duplicate H1s, no busywork, no static-crawler panic.
          </p>
        </div>
        <ol>
          {(topThree.length ? topThree : [{ title: "Keep monitoring", fix: "Re-run after content or template changes.", estimatedEffort: "5 min" }]).map((fix) => (
            <li key={`${fix.priority || "ok"}-${fix.title}`}>
              <strong>{fix.title}</strong>
              <span>{fix.estimatedEffort || "15-30 min"} · {fix.workType || "review"}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="report-actions">
        <CopyButton label="Copy report URL" value={shareUrl} />
        <CopyButton label="Copy developer brief" value={report.repairBrief || ""} />
        {hasPriorityFixes && (
          <a className="action-link paid-action" href="#fix-pack">
            View Fix Pack checkout
          </a>
        )}
        <a
          className="action-link"
          href={`/api/reports/${report.id}/brief.md`}
          onClick={(event) => {
            event.preventDefault();
            fetchBrief(report.id);
          }}
        >
          Download brief
        </a>
        <a className="action-link" href={`/api/reports/${report.id}/client.pdf`}>
          Download branded PDF
        </a>
      </section>

      <ClientReportPanel report={report} />

      <TeamRepairBoard report={report} />

      <section className="guard-section">
        <div className="section-heading">
          <p className="beta-eyebrow">Proof guards</p>
          <h2>False positives we refused to create</h2>
        </div>
        {guarded.length ? (
          <div className="guard-list">
            {guarded.slice(0, 6).map((finding) => (
              <FindingItem key={finding.id} finding={finding} compact />
            ))}
          </div>
        ) : (
          <p className="quiet-note">No static-vs-rendered false positives were detected in this crawl.</p>
        )}
      </section>

      <section className="page-table-section">
        <div className="section-heading">
          <p className="beta-eyebrow">Site-wide crawl</p>
          <h2>Every page we checked</h2>
        </div>
        <PageSummaryTable pages={pageSummaries} />
      </section>

      <section className="findings-section">
        <div className="section-heading">
          <p className="beta-eyebrow">What is wrong</p>
          <h2>{issues.length ? "Fix these first" : "No priority repairs found"}</h2>
        </div>
        <div className="finding-list">
          {issues.slice(0, 10).map((finding) => (
            <FindingItem
              key={finding.id}
              finding={finding}
              plan={topFixes.find((fix) => fix.title === finding.title)}
            />
          ))}
          {!issues.length && <p className="quiet-note">No critical or warning issues found in this crawl.</p>}
        </div>
      </section>

      <section className="fix-section" id="fix-pack">
        <div className="section-heading">
          <p className="beta-eyebrow">Repair queue</p>
          <h2>Copy the fix, ship it, rerun</h2>
        </div>
        <div className="fix-list">
          {topFixes.slice(0, 8).map((fix) => (
            <FixItem key={`${fix.priority}-${fix.title}`} fix={fix} />
          ))}
          {!topFixes.length && <p className="quiet-note">Nothing needs a repair snippet right now.</p>}
        </div>
        <FixQuotePanel report={report} hasPriorityFixes={hasPriorityFixes} />
      </section>

      <section className="proof-grid">
        {(report.pages || []).map((page) => (
          <PageProof key={page.url} page={page} />
        ))}
      </section>
    </div>
  );
}

function ReportDeltaPanel({ delta }) {
  const summary = delta.summary || {};
  const firstRun = delta.status === "first_run";
  const scoreDelta = Number(summary.scoreDelta || 0);
  const issueDelta = Number(summary.issuesDelta || 0);
  const fixedIssues = delta.fixedIssues || [];
  const newIssues = delta.newIssues || [];

  return (
    <section className="report-delta-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Audit history</p>
        <h2>
          {firstRun
            ? "First saved audit for this host."
            : scoreDelta > 0
              ? `Score improved by ${scoreDelta} points.`
              : scoreDelta < 0
                ? `Score dropped by ${Math.abs(scoreDelta)} points.`
                : "Score held steady since the last audit."}
        </h2>
        <p>{firstRun ? "Future reruns will show fixed, new, and still-open issues here." : "Compares this report with the previous saved audit for the same owner and host."}</p>
      </div>

      <div className="report-delta-metrics" aria-label="Audit history delta">
        <Metric label="Score change" value={firstRun ? "New" : signedNumber(scoreDelta)} />
        <Metric label="Issue change" value={firstRun ? summary.issuesNow || 0 : signedNumber(issueDelta)} />
        <Metric label="Fixed" value={summary.fixedIssuesCount || 0} />
        <Metric label="New" value={summary.newIssuesCount || 0} />
        <Metric label="Still open" value={summary.persistentIssuesCount || 0} />
      </div>

      {!firstRun && (
        <div className="report-delta-grid">
          <DeltaIssueColumn title="Fixed since last audit" empty="No proven issues disappeared yet." issues={fixedIssues} tone="fixed" />
          <DeltaIssueColumn title="New since last audit" empty="No new proven issues appeared." issues={newIssues} tone="new" />
        </div>
      )}
    </section>
  );
}

function RemediationBriefPanel({ brief, reportId }) {
  const queue = brief.priorityQueue || [];
  const history = brief.proofHistory || {};
  return (
    <section className="remediation-brief-panel" aria-label="Agent remediation brief">
      <div className="section-heading">
        <p className="beta-eyebrow">Agent repair brief</p>
        <h2>{queue.length ? "Turn proven issues into a repair queue" : "No priority repair queue"}</h2>
        <p>{brief.support?.safeHandoff || "Use the report proof and acceptance checks before closing repairs."}</p>
      </div>
      <div className="remediation-brief-grid">
        <div className="remediation-next-actions">
          <strong>Next actions</strong>
          <ol>
            {(brief.nextActions || []).map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
        <div className="remediation-proof-history">
          <Metric label="Fixed" value={history.fixedIssues || 0} />
          <Metric label="New" value={history.newIssues || 0} />
          <Metric label="Persistent" value={history.persistentIssues || 0} />
        </div>
      </div>
      {queue.length ? (
        <div className="remediation-queue">
          {queue.slice(0, 4).map((item) => (
            <article key={item.id}>
              <span className={`status-pill ${item.severity}`}>{item.severity}</span>
              <h3>{item.title}</h3>
              <p>{item.proof || item.fix}</p>
              <ul>
                {(item.acceptanceChecks || []).slice(0, 2).map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <p className="quiet-note">Keep monitoring and rerun after meaningful site changes.</p>
      )}
      {reportId && (
        <a className="action-link" href={`/api/reports/${encodeURIComponent(reportId)}/remediation-brief.json`}>
          Download remediation JSON
        </a>
      )}
    </section>
  );
}

function DeltaIssueColumn({ title, empty, issues, tone }) {
  return (
    <article className={`report-delta-column ${tone}`}>
      <strong>{title}</strong>
      {issues.slice(0, 5).map((issue) => (
        <div className="report-delta-issue" key={`${issue.title}-${issue.pageUrl}-${issue.severity}`}>
          <span>{issue.severity || "notice"}</span>
          <b>{issue.title}</b>
          <small>{issue.pageLabel || safeHostnameLabel(issue.pageUrl || "")}</small>
        </div>
      ))}
      {!issues.length && <p>{empty}</p>}
    </article>
  );
}

function CrawlInventoryPanel({ inventory }) {
  const summary = inventory.summary || {};
  const sampleUrls = inventory.sampleUrls || [];
  const warnings = inventory.warnings || [];

  return (
    <section className="crawl-inventory-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Crawl inventory</p>
        <h2>
          {summary.urlsDiscovered
            ? `${formatCount(summary.urlsDiscovered)} sitemap ${summary.urlsDiscovered === 1 ? "URL" : "URLs"} discovered.`
            : "No sitemap inventory URLs were discovered."}
        </h2>
        <p>Sitemap inventory proof up to CrawlRaven public scale. Rendered repairs still use the selected crawl depth.</p>
      </div>

      <div className="crawl-inventory-metrics" aria-label="Crawl inventory summary">
        <Metric label="Inventory URLs" value={formatCount(summary.urlsDiscovered || 0)} />
        <Metric label="Rendered proof" value={`${formatCount(summary.renderedPagesCovered || 0)}/${formatCount(summary.renderedPagesScanned || 0)}`} />
        <Metric label="Coverage" value={`${summary.coveragePercent || 0}%`} />
        <Metric label="Sitemaps" value={formatCount(summary.sitemapsFetched || 0)} />
        <Metric label="Inventory cap" value={formatCount(summary.inventoryLimit || 50000)} />
      </div>

      {sampleUrls.length > 0 && (
        <div className="crawl-inventory-grid">
          {sampleUrls.slice(0, 8).map((item) => (
            <article className="crawl-inventory-row" key={item.url}>
              <span>Discovered</span>
              <strong>{safeHostnameLabel(item.url)}</strong>
              <small>{item.url}</small>
              {item.lastmod && <p>Last updated {item.lastmod}</p>}
            </article>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="crawl-inventory-warnings">
          {warnings.slice(0, 4).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
    </section>
  );
}

function RenderedCrawlScalePanel({ plan }) {
  const summary = plan.summary || {};
  const batches = plan.batches || [];
  const repairs = plan.repairOpportunities || [];
  const highestPriority = repairs[0];

  return (
    <section className="rendered-crawl-scale-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Rendered crawl scale</p>
        <h2>{formatCount(summary.plannedUrlCount || summary.requestedTargetPages || 0)} URLs staged for rendered crawl proof.</h2>
        <p>Large-crawl manifest for CrawlRaven-scale parity. This is a plan, not a completed 50K rendered crawl claim.</p>
      </div>

      <div className="rendered-crawl-scale-metrics" aria-label="Rendered crawl scale summary">
        <Metric label="Rendered now" value={formatCount(summary.renderedPages || 0)} />
        <Metric label="Target" value={formatCount(summary.requestedTargetPages || 0)} />
        <Metric label="Inventory" value={formatCount(summary.inventoryUrlsAvailable || 0)} />
        <Metric label="Batches" value={formatCount(summary.plannedBatches || 0)} />
        <Metric label="Coverage" value={`${summary.renderedCoveragePercent || 0}%`} />
        <Metric label="Batch size" value={formatCount(summary.batchSize || 1000)} />
      </div>

      {highestPriority && (
        <article className="rendered-crawl-scale-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>{highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "technical"}</small>
        </article>
      )}

      <div className="rendered-crawl-scale-grid">
        {batches.slice(0, 5).map((batch) => (
          <article className={`rendered-crawl-scale-row ${batch.status === "rendered" ? "is-live" : "is-lost"}`} key={batch.batch}>
            <div>
              <span>{batch.status}</span>
              <strong>Batch {batch.batch}</strong>
              <small>{formatCount(batch.startIndex)}-{formatCount(batch.endIndex)} of staged URLs</small>
            </div>
            <p>{batch.sampleUrls?.length ? batch.sampleUrls.slice(0, 3).join(", ") : `${formatCount(batch.plannedUrlCount)} planned rendered URLs.`}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CrawlIntelligencePanel({ audit }) {
  const summary = audit.summary || {};
  const checks = audit.checks || {};
  const repairs = audit.repairOpportunities || [];
  const highestPriority = repairs[0];

  return (
    <section className="crawl-intelligence-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Crawl intelligence</p>
        <h2>Rendered link graph with duplicate and orphan proof.</h2>
        <p>Self-serve crawl-budget, orphan, duplicate-content, parameter, and cannibalization checks from rendered pages.</p>
      </div>

      <div className="crawl-intelligence-metrics" aria-label="Crawl intelligence summary">
        <Metric label="Edges" value={summary.linkedEdges || 0} />
        <Metric label="Max depth" value={summary.maxDepth || 0} />
        <Metric label="Orphans" value={summary.orphanInventoryCandidates || 0} />
        <Metric label="Duplicate pairs" value={summary.duplicateContentPairs || 0} />
        <Metric label="Cannibalization" value={summary.cannibalizationGroups || 0} />
        <Metric label="URL params" value={summary.parameterizedLinks || 0} />
      </div>

      {highestPriority && (
        <article className="crawl-intelligence-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>{highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "technical"}</small>
        </article>
      )}

      <div className="crawl-intelligence-grid">
        {(checks.orphanInventoryCandidates || []).slice(0, 3).map((item) => (
          <article className="crawl-intelligence-row is-lost" key={`orphan-${item.url}`}>
            <div>
              <span>Orphan candidate</span>
              <strong>{item.label || item.url}</strong>
              <small>{item.lastmod || "Sitemap URL"}</small>
            </div>
            <p>{item.url}</p>
          </article>
        ))}
        {(checks.duplicateTitles || []).slice(0, 3).map((group) => (
          <article className="crawl-intelligence-row is-lost" key={`title-${group.value}`}>
            <div>
              <span>Duplicate title</span>
              <strong>{group.value}</strong>
              <small>{group.pages.length} pages</small>
            </div>
            <p>{group.pages.map((page) => page.label).join(", ")}</p>
          </article>
        ))}
        {(checks.duplicateContentPairs || []).slice(0, 3).map((pair) => (
          <article className="crawl-intelligence-row is-lost" key={`content-${pair.left.url}-${pair.right.url}`}>
            <div>
              <span>Duplicate content</span>
              <strong>{pair.similarityPercent}% similar</strong>
              <small>{pair.left.label} and {pair.right.label}</small>
            </div>
            <p>{pair.left.title || pair.right.title || "Rendered content overlap"}</p>
          </article>
        ))}
        {(checks.cannibalizationGroups || []).slice(0, 3).map((group) => (
          <article className="crawl-intelligence-row is-lost" key={`cannibal-${group.keyword}`}>
            <div>
              <span>Cannibalization</span>
              <strong>{group.keyword}</strong>
              <small>{group.pages.length} pages</small>
            </div>
            <p>{group.pages.map((page) => page.label).join(", ")}</p>
          </article>
        ))}
        {(checks.parameterizedLinks || []).slice(0, 3).map((link) => (
          <article className="crawl-intelligence-row is-lost" key={`param-${link.href}`}>
            <div>
              <span>URL parameter</span>
              <strong>{link.pageLabel || "page"}</strong>
              <small>{link.text || "Rendered internal link"}</small>
            </div>
            <p>{link.href}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CompetitorBenchmarkPanel({ benchmark }) {
  const summary = benchmark.summary || {};
  const target = benchmark.target || {};
  const competitors = benchmark.competitors || [];
  const repairs = benchmark.repairOpportunities || [];

  return (
    <section className="competitor-benchmark-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Competitor benchmark</p>
        <h2>
          {summary.scoreGapToBest > 0
            ? `${summary.bestCompetitorHost} is ${summary.scoreGapToBest} points ahead.`
            : "You match or beat the strongest competitor snapshot."}
        </h2>
        <p>Homepage proof snapshot. This is not backlink, keyword-volume, or rank-tracking data.</p>
      </div>

      <div className="benchmark-metrics" aria-label="Competitor benchmark summary">
        <Metric label="Your rank" value={`${summary.targetRank || 1}/${summary.totalSitesRanked || competitors.length + 1}`} />
        <Metric label="Your score" value={target.score || 0} />
        <Metric label="Best rival" value={summary.bestCompetitorScore || 0} />
        <Metric label="Avg rival" value={summary.competitorAverageScore || 0} />
        <Metric label="Gap repairs" value={repairs.length} />
      </div>

      <div className="benchmark-grid">
        <article className="benchmark-site benchmark-target">
          <div>
            <span>Your site</span>
            <strong>{target.host || safeHostnameLabel(target.url)}</strong>
          </div>
          <b>{target.score || 0}/100</b>
        </article>
        {competitors.map((site) => (
          <article className="benchmark-site" key={site.url}>
            <div>
              <span>Competitor</span>
              <strong>{site.host || safeHostnameLabel(site.url)}</strong>
              <small>
                {site.strengths?.length
                  ? `Avoids: ${site.strengths.slice(0, 3).join(", ")}`
                  : `${site.issueCount || 0} issues in snapshot`}
              </small>
            </div>
            <b>{site.score || 0}/100</b>
          </article>
        ))}
      </div>

      <div className="benchmark-repairs">
        {repairs.slice(0, 5).map((repair) => (
          <article className="benchmark-repair" key={`${repair.priority}-${repair.title}`}>
            <span>{repair.severity}</span>
            <strong>{repair.title}</strong>
            <p>{repair.proof}</p>
            <small>{repair.estimatedEffort || "15-30 min"} - {repair.workType || "review"}</small>
          </article>
        ))}
        {!repairs.length && <p className="quiet-note">No competitor-backed repair gaps were found in this snapshot.</p>}
      </div>
    </section>
  );
}

function BacklinkAuditPanel({ audit }) {
  const summary = audit.summary || {};
  const rows = audit.rows || [];
  const repairs = audit.repairOpportunities || [];
  const highestPriority = repairs[0];

  return (
    <section className="backlink-audit-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Backlink audit</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} link repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found.`
            : "Imported backlinks are clean in this proof pass."}
        </h2>
        <p>Self-serve backlink import with live source-page proof and link-edge history. This is not proprietary backlink discovery.</p>
      </div>

      <div className="backlink-metrics" aria-label="Backlink audit summary">
        <Metric label="Imported" value={summary.imported || rows.length} />
        <Metric label="Live" value={summary.live || 0} />
        <Metric label="Lost" value={summary.lost || 0} />
        <Metric label="Risky" value={summary.toxicRisk || 0} />
        <Metric label="Broken" value={summary.brokenTargets || 0} />
      </div>

      {highestPriority && (
        <article className="backlink-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>{highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "review"}</small>
        </article>
      )}

      <div className="backlink-grid">
        {rows.slice(0, 6).map((row) => (
          <article className={`backlink-row ${row.live ? "is-live" : "is-lost"}`} key={row.id || `${row.sourceUrl}-${row.targetUrl}`}>
            <div>
              <span>{row.live ? "Live" : "Lost"}</span>
              <strong>{safeHostnameLabel(row.sourceUrl)}</strong>
              <small>{row.discoveredAnchorText || row.anchorText || "No anchor text captured"}</small>
            </div>
            <p>{row.proof}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LocalSeoAuditPanel({ audit }) {
  const summary = audit.summary || {};
  const repairs = audit.repairOpportunities || [];
  const citations = audit.citationRows || [];
  const keywords = audit.keywordChecks || [];
  const highestPriority = repairs[0];

  return (
    <section className="local-seo-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Local SEO audit</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} local repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found.`
            : "Local SEO proof passed for the supplied inputs."}
        </h2>
        <p>Self-serve NAP, citation, schema, profile-link, and local keyword checks.</p>
      </div>

      <div className="local-seo-metrics" aria-label="Local SEO audit summary">
        <Metric label="NAP found" value={`${summary.napFieldsFoundOnSite || 0}/${summary.napFieldsSupplied || 0}`} />
        <Metric label="Schema" value={summary.localSchemaFound ? "Yes" : "No"} />
        <Metric label="GBP link" value={summary.googleBusinessProfileLinked ? "Yes" : "No"} />
        <Metric label="Citations" value={`${summary.citationRowsPassed || 0}/${summary.citationRowsChecked || 0}`} />
        <Metric label="Keywords" value={`${summary.localKeywordsCovered || 0}/${summary.localKeywordsChecked || 0}`} />
      </div>

      {highestPriority && (
        <article className="local-seo-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>{highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "review"}</small>
        </article>
      )}

      <div className="local-seo-grid">
        {citations.slice(0, 4).map((row) => (
          <article className={`local-seo-row ${row.ok ? "is-live" : "is-lost"}`} key={row.id || row.sourceUrl}>
            <div>
              <span>{row.ok ? "Consistent" : "Mismatch"}</span>
              <strong>{safeHostnameLabel(row.sourceUrl)}</strong>
              <small>{row.mismatches?.length ? `Missing ${row.mismatches.join(", ")}` : "NAP matched"}</small>
            </div>
            <p>{row.proof}</p>
          </article>
        ))}
        {keywords.slice(0, 4).map((item) => (
          <article className={`local-seo-row ${item.found ? "is-live" : "is-lost"}`} key={item.keyword}>
            <div>
              <span>{item.found ? "Covered" : "Missing"}</span>
              <strong>{item.keyword}</strong>
              <small>{item.pages?.length ? item.pages.map((page) => page.label).join(", ") : "No rendered page match"}</small>
            </div>
            <p>{item.found ? "Keyword appears naturally in rendered page content." : "Keyword was not found in the rendered pages crawled."}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function KeywordRankAuditPanel({ audit }) {
  const summary = audit.summary || {};
  const checks = audit.checks || {};
  const repairs = audit.repairOpportunities || [];
  const highestPriority = repairs[0];

  return (
    <section className="keyword-rank-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Keyword audit</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} keyword repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found.`
            : "Imported keyword rows are clean in this proof pass."}
        </h2>
        <p>Self-serve Search Console or rank-tracker import with rendered landing-page proof and trend history. This is not live volume or continuous rank tracking.</p>
      </div>

      <div className="keyword-rank-metrics" aria-label="Keyword audit summary">
        <Metric label="Rows" value={summary.imported || 0} />
        <Metric label="Queries" value={summary.queries || 0} />
        <Metric label="Clicks" value={formatCount(summary.totalClicks || 0)} />
        <Metric label="Impressions" value={formatCount(summary.totalImpressions || 0)} />
        <Metric label="CTR" value={formatPercent(summary.averageCtr || 0)} />
        <Metric label="Avg pos" value={formatPosition(summary.averagePosition || 0)} />
      </div>

      {highestPriority && (
        <article className="keyword-rank-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>{highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "content"}</small>
        </article>
      )}

      <div className="keyword-rank-grid">
        {(checks.lowCtrRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`ctr-${row.id}`}
            label="Low CTR"
            title={row.query}
            detail={`${row.pageLabel} - ${formatPercent(row.ctr)} CTR at position ${formatPosition(row.position)}`}
            proof={`${formatCount(row.impressions)} impressions and ${formatCount(row.clicks)} clicks.`}
          />
        ))}
        {(checks.pageTwoRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`page-two-${row.id}`}
            label="Page two"
            title={row.query}
            detail={`${row.pageLabel} - position ${formatPosition(row.position)}`}
            proof={`${formatCount(row.impressions)} impressions from a query close to traffic.`}
          />
        ))}
        {(checks.decliningRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`decline-${row.id}`}
            label="Declining"
            title={row.query}
            detail={`${formatCount(row.previousClicks)} to ${formatCount(row.clicks)} clicks`}
            proof={`${row.pageLabel} changed from position ${formatPosition(row.previousPosition)} to ${formatPosition(row.position)}.`}
          />
        ))}
        {(checks.cannibalizationGroups || []).slice(0, 3).map((group) => (
          <KeywordRankRow
            key={`cannibal-${group.normalizedKeyword || group.keyword}`}
            label="Cannibalization"
            title={group.keyword}
            detail={`${group.pages.length} landing pages`}
            proof={group.pages.map((page) => page.pageLabel || page.pageUrl).join(", ")}
          />
        ))}
        {(checks.landingMismatchRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`mismatch-${row.id}`}
            label="Intent mismatch"
            title={row.query}
            detail={row.pageLabel}
            proof="Rendered title, H1, and description do not clearly cover the imported query."
          />
        ))}
        {(checks.missingLandingPageRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`missing-${row.id}`}
            label="Not crawled"
            title={row.query}
            detail={row.pageLabel}
            proof="Imported landing page was not present in the rendered crawl proof."
          />
        ))}
      </div>
    </section>
  );
}

function KeywordRankRow({ label, title, detail, proof }) {
  return (
    <article className="keyword-rank-row is-lost">
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <p>{proof}</p>
    </article>
  );
}

function PlatformSeoAuditPanel({ audit }) {
  const summary = audit.summary || {};
  const repairs = audit.repairOpportunities || [];
  const checks = audit.checks || {};
  const highestPriority = repairs[0];
  const platformNames = summary.detectedPlatformNames?.length
    ? summary.detectedPlatformNames.join(", ")
    : "Platform";

  return (
    <section className="platform-seo-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Platform SEO audit</p>
        <h2>{platformNames} proof with platform-specific repairs.</h2>
        <p>Rendered WordPress and ecommerce checks for product schema, faceted links, archives, and plugin resource impact.</p>
      </div>

      <div className="platform-seo-metrics" aria-label="Platform SEO audit summary">
        <Metric label="Platforms" value={summary.detectedPlatforms || 0} />
        <Metric label="Products" value={summary.productLikePages || 0} />
        <Metric label="Product schema" value={`${summary.productSchemaCoveragePercent || 0}%`} />
        <Metric label="Faceted links" value={summary.facetedLinks || 0} />
        <Metric label="WP plugins" value={summary.wordpressPlugins || 0} />
        <Metric label="Repairs" value={summary.repairOpportunityCount || repairs.length} />
      </div>

      {highestPriority && (
        <article className="platform-seo-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>{highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "technical"}</small>
        </article>
      )}

      <div className="platform-seo-grid">
        {(audit.detectedPlatforms || []).slice(0, 4).map((platform) => (
          <article className="platform-seo-row is-live" key={platform.id}>
            <div>
              <span>{platform.category}</span>
              <strong>{platform.name}</strong>
              <small>{platform.confidence || "medium"} confidence</small>
            </div>
            <p>{platform.signals?.[0] || "Rendered platform signal detected."}</p>
          </article>
        ))}
        {(checks.productSchema?.missingPages || []).slice(0, 3).map((page) => (
          <article className="platform-seo-row is-lost" key={`product-${page.url}`}>
            <div>
              <span>Product schema</span>
              <strong>{page.label || page.url}</strong>
              <small>{page.wordCount || 0} rendered words</small>
            </div>
            <p>Product-like page lacks rendered Product schema.</p>
          </article>
        ))}
        {(checks.facetedNavigation?.links || []).slice(0, 3).map((link) => (
          <article className="platform-seo-row is-lost" key={`facet-${link.href}`}>
            <div>
              <span>Faceted URL</span>
              <strong>{link.pageLabel || "page"}</strong>
              <small>{link.text || "Rendered link"}</small>
            </div>
            <p>{link.href}</p>
          </article>
        ))}
        {(checks.wordpressArchives?.links || []).slice(0, 3).map((link) => (
          <article className="platform-seo-row is-lost" key={`archive-${link.href}`}>
            <div>
              <span>WP archive</span>
              <strong>{link.pageLabel || "page"}</strong>
              <small>{link.text || "Archive link"}</small>
            </div>
            <p>{link.href}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AiAnswerReadinessPanel({ audit }) {
  const summary = audit.summary || {};
  const checks = audit.checks || {};
  const repairs = audit.repairOpportunities || [];
  const highestPriority = repairs[0];
  const lowContentPages = checks.contentDepth?.lowContentPages || [];
  const schemaMissingPages = checks.structuredData?.missingPages || [];
  const sourcePages = [
    ...(checks.sourceClarity?.missingCanonicalPages || []),
    ...(checks.sourceClarity?.isolatedPages || [])
  ];

  return (
    <section className="ai-readiness-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">AI Answer Readiness</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} proof-derived readiness ${summary.repairOpportunityCount === 1 ? "repair" : "repairs"} found.`
            : "Rendered proof is ready for machine-readable answers."}
        </h2>
        <p>Site-proof checks for extractable content, helpful schema, canonical/source clarity, answer structure, and optional llms.txt. This is not AI visibility tracking or citation monitoring.</p>
      </div>

      <div className="ai-readiness-metrics" aria-label="AI Answer Readiness summary">
        <Metric label="Readiness" value={`${summary.readinessScore || 0}/100`} />
        <Metric label="Enough text" value={`${summary.pagesWithEnoughText || 0}/${summary.pagesChecked || 0}`} />
        <Metric label="Schema pages" value={summary.pagesWithHelpfulSchema || 0} />
        <Metric label="Question structure" value={summary.pagesWithQuestionStructure || 0} />
        <Metric label="llms.txt" value={summary.llmsTxtStatus === "reachable" ? "Yes" : "No"} />
      </div>

      {highestPriority && (
        <article className="ai-readiness-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>{highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "content"}</small>
        </article>
      )}

      <div className="ai-readiness-grid">
        {lowContentPages.slice(0, 3).map((page) => (
          <AiReadinessRow
            key={`content-${page.url}`}
            state="lost"
            label="Extractable text"
            title={page.label || page.url}
            detail={`${page.wordCount || 0} rendered words`}
            proof="Add visible proof, examples, FAQs, comparisons, and next steps."
          />
        ))}
        {schemaMissingPages.slice(0, 3).map((page) => (
          <AiReadinessRow
            key={`schema-${page.url}`}
            state="lost"
            label="Helpful schema"
            title={page.label || page.url}
            detail={page.title || "No helpful schema proven"}
            proof="Add truthful schema only when it matches visible content."
          />
        ))}
        {sourcePages.slice(0, 3).map((page, index) => (
          <AiReadinessRow
            key={`source-${page.url}-${page.label}-${index}`}
            state="lost"
            label="Source clarity"
            title={page.label || page.url}
            detail={page.title || "Canonical or internal links need review"}
            proof="Keep one preferred URL and rendered links to related context."
          />
        ))}
        {summary.llmsTxtStatus === "reachable" ? (
          <AiReadinessRow
            state="live"
            label="llms.txt"
            title="Optional context file reachable"
            detail="Public agent context"
            proof="This supports public context discovery but does not prove AI visibility."
          />
        ) : (
          <AiReadinessRow
            state="lost"
            label="llms.txt"
            title="Optional context file not reachable"
            detail="Advisory"
            proof="This is not a ranking, visibility, or citation failure."
          />
        )}
      </div>
    </section>
  );
}

function AiReadinessRow({ state = "lost", label, title, detail, proof }) {
  return (
    <article className={`ai-readiness-row is-${state}`}>
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <p>{proof}</p>
    </article>
  );
}

function GrowthOpportunitiesPanel({ growth }) {
  const summary = growth.summary || {};
  const opportunities = growth.opportunities || [];
  const topOpportunity = opportunities[0];

  return (
    <section className="growth-opportunities-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Draft-only growth</p>
        <h2>
          {summary.opportunityCount
            ? `${summary.opportunityCount} proof-backed growth ${summary.opportunityCount === 1 ? "brief" : "briefs"} ready.`
            : "No growth briefs were created from this report."}
        </h2>
        <p>Drafts from verified keyword, competitor, AI-readiness, or crawl gaps. These do not publish content, open pull requests, or promise rankings, traffic, citations, or revenue.</p>
      </div>

      <div className="growth-opportunities-metrics" aria-label="Growth opportunity summary">
        <Metric label="Keyword" value={summary.keywordBacked || 0} />
        <Metric label="Competitor" value={summary.competitorBacked || 0} />
        <Metric label="AI-ready" value={summary.aiReadinessBacked || 0} />
        <Metric label="Crawl" value={summary.crawlBacked || 0} />
        <Metric label="Mode" value="Draft" />
      </div>

      {topOpportunity && (
        <article className="growth-opportunities-priority">
          <span>{growthTypeLabel(topOpportunity.type)}</span>
          <strong>{topOpportunity.title}</strong>
          <p>{topOpportunity.proof}</p>
          <small>{topOpportunity.estimatedEffort || "30-90 min"} - {topOpportunity.workType || "content"}</small>
        </article>
      )}

      <div className="growth-opportunities-grid">
        {opportunities.slice(0, 6).map((item) => (
          <article className="growth-opportunities-row is-live" key={item.id || item.title}>
            <div>
              <span>{growthTypeLabel(item.type)}</span>
              <strong>{item.draftBrief?.summary || item.suggestedAction || item.title}</strong>
              <small>{item.sourceKind || "proof"} - draft only</small>
            </div>
            <p>{item.draftBrief?.sections?.length ? item.draftBrief.sections.join(" | ") : item.guardrail || item.proof}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function GeoReadinessPanel({ audit }) {
  const checks = audit.checks || {};
  const summary = audit.summary || {};
  const repairs = audit.repairOpportunities || [];
  const topRepair = repairs[0];

  return (
    <section className="geo-readiness-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">SEO/GEO readiness</p>
        <h2>Repair signals for answer-ready search surfaces.</h2>
        <p>{audit.guidance?.llmsTxt || "AI-search readiness starts with crawlable content, entity clarity, and truthful schema."}</p>
      </div>
      <div className="geo-readiness-metrics" aria-label="SEO and GEO readiness summary">
        <Metric label="Checks" value={`${summary.passed || 0}/${summary.total || 0}`} />
        <Metric label="Repairs" value={summary.repairOpportunityCount || repairs.length} />
        <Metric label="Crawlable" value={checks.crawlableContent ? "Yes" : "Needs work"} />
        <Metric label="Schema" value={checks.usefulSchema ? "Useful" : "Missing"} />
      </div>
      {topRepair && (
        <article className="geo-readiness-priority">
          <span>{topRepair.severity}</span>
          <strong>{topRepair.title}</strong>
          <p>{topRepair.proof}</p>
          <small>{topRepair.estimatedEffort || "30-90 min"} - {topRepair.workType || "content"}</small>
        </article>
      )}
      <div className="geo-check-grid">
        {Object.entries(checks).map(([key, passed]) => (
          <article className={`geo-check ${passed ? "passed" : "needs-work"}`} key={key}>
            <span>{passed ? "Ready" : "Needs work"}</span>
            <strong>{geoCheckLabel(key)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function growthTypeLabel(type = "") {
  const labels = {
    comparison_outline: "Comparison",
    faq_block: "FAQ brief",
    free_tool_idea: "Free tool",
    internal_link_hub: "Hub",
    page_refresh: "Page refresh"
  };
  return labels[type] || "Draft";
}

function geoCheckLabel(key) {
  const labels = {
    crawlableContent: "Crawlable content",
    entityClarity: "Entity clarity",
    answerReadySections: "Answer-ready sections",
    usefulSchema: "Useful schema",
    internalContext: "Internal context"
  };
  return labels[key] || key;
}

function ClientReportPanel({ report }) {
  const agencyWorkspace = report.agencyWorkspace || {};
  const [branding, setBranding] = useState({
    agencyName: "",
    logoUrl: "",
    brandColor: "#163f5f",
    accentColor: "#0f9f6e",
    customDomain: "",
    footerText: ""
  });
  const [shares, setShares] = useState([]);
  const [domains, setDomains] = useState([]);
  const [domainName, setDomainName] = useState("");
  const [clientName, setClientName] = useState(() => safeHostnameLabel(report.url));
  const [password, setPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!report.id) return;
    let cancelled = false;
    setStatus("loading");
    setMessage("Loading client report tools.");
    Promise.all([loadReportBranding(), loadReportShares(report.id), loadReportDomains()])
      .then(([brandingPayload, sharesPayload, domainsPayload]) => {
        if (cancelled) return;
        setBranding((current) => ({ ...current, ...(brandingPayload.branding || {}) }));
        setShares(sharesPayload.shares || []);
        setDomains(domainsPayload.domains || []);
        setClientName((current) => current || safeHostnameLabel(report.url));
        setStatus("success");
        setMessage("Client reports ready.");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(error.message || "Could not load client report tools.");
      });
    return () => {
      cancelled = true;
    };
  }, [report.id, report.url]);

  function updateBranding(field, value) {
    setBranding((current) => ({ ...current, [field]: value }));
  }

  async function onBrandingSave(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Saving branding.");
    try {
      const payload = await saveReportBranding(branding);
      setBranding((current) => ({ ...current, ...(payload.branding || {}) }));
      setStatus("success");
      setMessage("Branding saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not save branding.");
    }
  }

  async function onShareCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Creating client link.");
    try {
      const payload = await createReportShare(report.id, {
        clientName,
        password,
        passwordHint,
        expiresDays: expiresDays ? Number(expiresDays) : 0
      });
      setShares((current) => [payload.share, ...current.filter((share) => share.id !== payload.share.id)]);
      setPassword("");
      setStatus("success");
      setMessage("Client link created.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not create client link.");
    }
  }

  async function onShareRevoke(id) {
    setStatus("loading");
    setMessage("Revoking client link.");
    try {
      await revokeReportShare(id);
      setShares((current) => current.filter((share) => share.id !== id));
      setStatus("success");
      setMessage("Client link revoked.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not revoke client link.");
    }
  }

  async function onDomainCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Creating report domain proof.");
    try {
      const payload = await createReportDomain(domainName);
      setDomains((current) => [payload.domain, ...current.filter((domain) => domain.id !== payload.domain.id)]);
      setDomainName("");
      setStatus("success");
      setMessage("Report domain proof is ready.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not create report domain.");
    }
  }

  async function onDomainVerify(id) {
    setStatus("loading");
    setMessage("Checking report domain proof.");
    try {
      const payload = await verifyReportDomain(id);
      setDomains((current) => [payload.domain, ...current.filter((domain) => domain.id !== payload.domain.id)]);
      setStatus("success");
      setMessage("Report domain verified.");
      const sharesPayload = await loadReportShares(report.id);
      setShares(sharesPayload.shares || []);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not verify report domain.");
    }
  }

  async function onDomainRevoke(id) {
    setStatus("loading");
    setMessage("Removing report domain.");
    try {
      await revokeReportDomain(id);
      setDomains((current) => current.filter((domain) => domain.id !== id));
      setStatus("success");
      setMessage("Report domain removed.");
      const sharesPayload = await loadReportShares(report.id);
      setShares(sharesPayload.shares || []);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not remove report domain.");
    }
  }

  return (
    <section className="client-report-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Client reports</p>
        <h2>White-label report links</h2>
        {message && <p className={`form-message ${status}`}>{message}</p>}
      </div>
      <div className={`agency-workspace-strip ${agencyWorkspace.status || "beta_allowance"}`}>
        <div>
          <span className="status-pill">Agency Workspace</span>
          <strong>{agencyWorkspace.status === "active" ? "Entitlement active" : "Beta allowance"}</strong>
        </div>
        <p>
          {agencyWorkspace.message ||
            "White-label proof, client links, report domains, and team assignment are beta-gated until Agency Workspace checkout is live."}
        </p>
        {agencyWorkspace.limits && (
          <div className="agency-limit-list">
            <span>{agencyWorkspace.limits.clientLinksPerReport || 10} links/report</span>
            <span>{agencyWorkspace.limits.teamSeats || 10} seats</span>
            <span>{agencyWorkspace.limits.reportDomains || 1} domain</span>
          </div>
        )}
      </div>

      <div className="client-report-grid">
        <form className="client-report-card" onSubmit={onBrandingSave}>
          <div className="client-report-card-head">
            <strong>Branding</strong>
            <button disabled={status === "loading"} type="submit">Save</button>
          </div>
          <label htmlFor="agency-name">Agency name</label>
          <input
            id="agency-name"
            onChange={(event) => updateBranding("agencyName", event.target.value)}
            required
            value={branding.agencyName || ""}
          />
          <label htmlFor="logo-url">Logo URL</label>
          <input
            id="logo-url"
            inputMode="url"
            onChange={(event) => updateBranding("logoUrl", event.target.value)}
            placeholder="https://example.com/logo.png"
            type="url"
            value={branding.logoUrl || ""}
          />
          <div className="color-row">
            <label htmlFor="brand-color">
              Brand
              <input
                id="brand-color"
                onChange={(event) => updateBranding("brandColor", event.target.value)}
                type="color"
                value={branding.brandColor || "#163f5f"}
              />
            </label>
            <label htmlFor="accent-color">
              Accent
              <input
                id="accent-color"
                onChange={(event) => updateBranding("accentColor", event.target.value)}
                type="color"
                value={branding.accentColor || "#0f9f6e"}
              />
            </label>
          </div>
          <label htmlFor="custom-domain">Display domain</label>
          <input
            id="custom-domain"
            onChange={(event) => updateBranding("customDomain", event.target.value)}
            placeholder="reports.example.com"
            value={branding.customDomain || ""}
          />
          <label htmlFor="footer-text">Footer</label>
          <input
            id="footer-text"
            onChange={(event) => updateBranding("footerText", event.target.value)}
            value={branding.footerText || ""}
          />
        </form>

        <form className="client-report-card" onSubmit={onDomainCreate}>
          <div className="client-report-card-head">
            <strong>Custom domain</strong>
            <button disabled={status === "loading"} type="submit">Add</button>
          </div>
          <label htmlFor="report-domain">Report subdomain</label>
          <input
            id="report-domain"
            onChange={(event) => setDomainName(event.target.value)}
            placeholder="reports.example.com"
            required
            value={domainName}
          />
          <div className="domain-list">
            {domains.map((domain) => (
              <article className={`domain-row ${domain.status}`} key={domain.id}>
                <div>
                  <strong>{domain.domain}</strong>
                  <span>{domain.status === "verified" ? "Verified" : "Pending verification"}</span>
                  {domain.cnameTarget && <code>CNAME {domain.cnameTarget}</code>}
                  {domain.dnsName ? (
                    <code>{domain.dnsType || "TXT"} {domain.dnsName}{" -> "}{domain.dnsValue || domain.verificationToken}</code>
                  ) : (
                    <code>{domain.verificationPath}{" -> "}{domain.verificationToken}</code>
                  )}
                  {domain.lastError && <small>{domain.lastError}</small>}
                </div>
                <div className="domain-actions">
                  {domain.status !== "verified" && (
                    <button className="text-button accent-text" disabled={status === "loading"} onClick={() => onDomainVerify(domain.id)} type="button">
                      Verify
                    </button>
                  )}
                  <button className="text-button" disabled={status === "loading"} onClick={() => onDomainRevoke(domain.id)} type="button">
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {!domains.length && <p className="quiet-note">No report domain connected yet.</p>}
          </div>
        </form>

        <form className="client-report-card" onSubmit={onShareCreate}>
          <div className="client-report-card-head">
            <strong>Create link</strong>
            <button disabled={status === "loading"} type="submit">Create</button>
          </div>
          <label htmlFor="client-name">Client name</label>
          <input
            id="client-name"
            onChange={(event) => setClientName(event.target.value)}
            required
            value={clientName}
          />
          <label htmlFor="client-password">Password</label>
          <input
            id="client-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Optional"
            type="password"
            value={password}
          />
          <label htmlFor="client-password-hint">Password hint</label>
          <input
            id="client-password-hint"
            onChange={(event) => setPasswordHint(event.target.value)}
            placeholder="Optional"
            value={passwordHint}
          />
          <label htmlFor="expires-days">Expires after days</label>
          <input
            id="expires-days"
            inputMode="numeric"
            min="1"
            max="180"
            onChange={(event) => setExpiresDays(event.target.value)}
            placeholder="Never"
            type="number"
            value={expiresDays}
          />
        </form>
      </div>

      <div className="client-share-list">
        {shares.map((share) => (
          <article className="client-share-row" key={share.id}>
            <div>
              <strong>{share.clientName || safeHostnameLabel(report.url)}</strong>
              <span>
                {share.passwordProtected ? "Password protected" : "Open link"}
                {share.expiresAt ? ` · Expires ${formatDate(share.expiresAt)}` : ""}
                {share.lastViewedAt ? ` · Viewed ${formatDate(share.lastViewedAt)}` : ""}
              </span>
              <code>{share.shareUrl}</code>
            </div>
            <div className="client-share-actions">
              <button className="text-button accent-text" onClick={() => copyText(share.shareUrl)} type="button">
                Copy
              </button>
              <a className="text-button accent-text" href={share.sharePath} target="_blank" rel="noreferrer">
                Open
              </a>
              <a className="text-button accent-text" href={share.pdfPath || `${share.sharePath}.pdf`}>
                PDF
              </a>
              <button className="text-button" disabled={status === "loading"} onClick={() => onShareRevoke(share.id)} type="button">
                Revoke
              </button>
            </div>
          </article>
        ))}
        {!shares.length && <p className="quiet-note">No active client links for this report.</p>}
      </div>
    </section>
  );
}

function TeamRepairBoard({ report }) {
  const [members, setMembers] = useState([]);
  const [issues, setIssues] = useState([]);
  const [draftMember, setDraftMember] = useState({ email: "", name: "", role: "editor" });
  const [statusFilter, setStatusFilter] = useState("active");
  const [savingIssueId, setSavingIssueId] = useState("");
  const [actingIssueId, setActingIssueId] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!report.id) return;
    let cancelled = false;
    setStatus("loading");
    setMessage("Loading repair board.");
    Promise.all([
      loadReportCollaboration(report.id),
      loadRepairQueue(report.id)
    ])
      .then(([collaborationPayload, queuePayload]) => {
        if (cancelled) return;
        setMembers(collaborationPayload.members || []);
        setIssues(mergeRepairQueueWithCollaboration(queuePayload.items || [], collaborationPayload.issues || []));
        setStatus("success");
        setMessage("Repair queue ready.");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(error.message || "Could not load repair queue.");
      });
    return () => {
      cancelled = true;
    };
  }, [report.id]);

  const boardCounts = useMemo(() => repairBoardCounts(issues), [issues]);
  const visibleIssues = useMemo(() => {
    if (statusFilter === "all") return issues;
    if (statusFilter === "active") {
      return issues.filter((issue) => !["fixed", "ignored"].includes(issue.status));
    }
    return issues.filter((issue) => issue.status === statusFilter);
  }, [issues, statusFilter]);

  function updateIssue(issueId, patch) {
    const nextPatch = { ...patch };
    if (patch.status && !["fixed", "regressed"].includes(patch.status)) {
      nextPatch.rerunStatus = "not_run";
    }
    setIssues((current) =>
      current.map((issue) => (issue.issueId === issueId ? { ...issue, ...nextPatch } : issue))
    );
  }

  async function reloadBoard(nextMessage = "Repair board updated.") {
    const [collaborationPayload, queuePayload] = await Promise.all([
      loadReportCollaboration(report.id),
      loadRepairQueue(report.id)
    ]);
    setMembers(collaborationPayload.members || []);
    setIssues(mergeRepairQueueWithCollaboration(queuePayload.items || [], collaborationPayload.issues || []));
    setStatus("success");
    setMessage(nextMessage);
  }

  async function onMemberCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Adding teammate.");
    try {
      await createTeamMember(draftMember);
      setDraftMember({ email: "", name: "", role: "editor" });
      await reloadBoard("Teammate added.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not add teammate.");
    }
  }

  async function onMemberRevoke(id) {
    setStatus("loading");
    setMessage("Removing teammate.");
    try {
      await revokeTeamMember(id);
      await reloadBoard("Teammate removed.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not remove teammate.");
    }
  }

  async function onIssueSave(issue) {
    setSavingIssueId(issue.issueId);
    setStatus("loading");
    setMessage("Saving repair item.");
    try {
      const queueItem = {
        issueId: issue.issueId,
        actionMode: issue.actionMode
      };
      if (manualRepairQueueStatus(issue.status)) {
        queueItem.status = issue.status;
        queueItem.rerunStatus = "not_run";
        queueItem.lastRerunReportId = "";
      }
      const writes = [
        saveRepairQueue(report.id, {
          items: [queueItem]
        })
      ];
      if (issue.sourceKind !== "repair_plan") {
        writes.push(saveReportCollaboration(report.id, {
          items: [{
            issueId: issue.issueId,
            status: collaborationStatusForQueueStatus(issue.status),
            assigneeEmail: issue.assigneeEmail,
            note: issue.note
          }]
        }));
      }
      await Promise.all(writes);
      await reloadBoard("Repair item saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not save repair item.");
    } finally {
      setSavingIssueId("");
    }
  }

  async function onActionDraft(issue) {
    setActingIssueId(issue.issueId);
    setStatus("loading");
    setMessage("Drafting agent action.");
    try {
      const payload = await createRepairAction(report.id, {
        issueId: issue.issueId,
        actionMode: issue.actionMode || "self_serve",
        actionType: actionTypeForMode(issue.actionMode),
        proposedChange: issue.proposedChange || ""
      });
      if (payload.queue?.items) {
        const collaborationPayload = await loadReportCollaboration(report.id);
        setIssues(mergeRepairQueueWithCollaboration(payload.queue.items, collaborationPayload.issues || []));
      } else {
        await reloadBoard("Agent action drafted.");
      }
      setStatus("success");
      setMessage("Agent action drafted for review.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not draft agent action.");
    } finally {
      setActingIssueId("");
    }
  }

  async function onActionUpdate(issue, patch, options = {}) {
    if (!issue.latestAction?.id) return;
    setActingIssueId(issue.issueId);
    setStatus("loading");
    setMessage(options.pendingMessage || "Updating agent action.");
    try {
      const payload = await updateRepairAction(report.id, issue.latestAction.id, patch);
      if (payload.queue?.items) {
        const collaborationPayload = await loadReportCollaboration(report.id);
        setIssues(mergeRepairQueueWithCollaboration(payload.queue.items, collaborationPayload.issues || []));
      } else {
        await reloadBoard("Agent action updated.");
      }
      setStatus("success");
      setMessage(options.successMessage || "Agent action updated.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not update agent action.");
    } finally {
      setActingIssueId("");
    }
  }

  async function onActionRerun(issue, rerunState) {
    const rerunReportId = issue.lastRerunReportId || issue.rerunReportId || "";
    if (!rerunReportId) {
      setStatus("error");
      setMessage("Enter the rerun report ID before closing proof.");
      return;
    }
    await onActionUpdate(issue, repairActionRerunPatch(rerunState, rerunReportId), {
      pendingMessage: "Attaching rerun proof.",
      successMessage: rerunState === "fixed" ? "Repair marked fixed from rerun proof." : "Rerun proof recorded."
    });
  }

  return (
    <section className="team-repair-panel">
      <div className="section-heading queue-heading">
        <div>
          <p className="beta-eyebrow">Repair agent</p>
          <h2>Proof-backed queue and safe action drafts</h2>
          {message && <p className={`form-message ${status}`}>{message}</p>}
        </div>
        <label className="repair-filter">
          View
          <select
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="drafted">Drafted</option>
            <option value="approved">Approved</option>
            <option value="applied">Applied</option>
            <option value="fixed">Fixed</option>
            <option value="ignored">Ignored</option>
            <option value="regressed">Regressed</option>
          </select>
        </label>
      </div>

      <div className="team-board-summary">
        <Metric label="Issues" value={boardCounts.total} />
        <Metric label="Drafted" value={boardCounts.drafted} />
        <Metric label="Approved" value={boardCounts.approved} />
        <Metric label="Fixed" value={boardCounts.fixed} />
      </div>

      <div className="team-collab-grid">
        <form className="team-member-card" onSubmit={onMemberCreate}>
          <div className="client-report-card-head">
            <strong>Teammates</strong>
            <button disabled={status === "loading"} type="submit">Add</button>
          </div>
          <label htmlFor="team-email">Email</label>
          <input
            id="team-email"
            inputMode="email"
            onChange={(event) => setDraftMember((current) => ({ ...current, email: event.target.value }))}
            placeholder="teammate@example.com"
            required
            type="email"
            value={draftMember.email}
          />
          <label htmlFor="team-name">Name</label>
          <input
            id="team-name"
            onChange={(event) => setDraftMember((current) => ({ ...current, name: event.target.value }))}
            placeholder="Optional"
            value={draftMember.name}
          />
          <label htmlFor="team-role">Role</label>
          <select
            id="team-role"
            onChange={(event) => setDraftMember((current) => ({ ...current, role: event.target.value }))}
            value={draftMember.role}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>

          <div className="team-member-list">
            {members.map((member) => (
              <div className="team-member-row" key={member.id}>
                <div>
                  <strong>{member.name || member.email}</strong>
                  <span>{member.email} · {teamRoleLabel(member.role)}</span>
                </div>
                <button className="text-button" disabled={status === "loading"} onClick={() => onMemberRevoke(member.id)} type="button">
                  Remove
                </button>
              </div>
            ))}
            {!members.length && <p className="quiet-note">Add teammates to assign proven issues.</p>}
          </div>
        </form>

        <div className="issue-board-list">
          {visibleIssues.slice(0, 12).map((issue) => (
            <article className={`issue-board-card ${issue.status}`} key={issue.issueId}>
              <div className="issue-board-head">
                <div>
                  <div className="repair-pill-row">
                    <span className={`status-pill ${issue.severity}`}>{issue.severity}</span>
                    <span className={`status-pill ${issue.status}`}>{repairStatusLabel(issue.status)}</span>
                    {issue.latestAction && <span className="status-pill">{repairApprovalLabel(issue.latestAction.approvalState)}</span>}
                  </div>
                  <h3>{issue.title}</h3>
                  <p>{issue.pageLabel || safeUrlLabel(issue.pageUrl)} - {issue.fix}</p>
                </div>
                <button
                  className="action-link"
                  disabled={savingIssueId === issue.issueId || status === "loading"}
                  onClick={() => onIssueSave(issue)}
                  type="button"
                >
                  Save
                </button>
              </div>
              <div className="repair-proof-block">
                <div>
                  <span>Proof</span>
                  <p>{issue.proof || "Proof was stored with the report finding."}</p>
                </div>
                <div>
                  <span>Acceptance</span>
                  <p>{issue.acceptance || "Rerun the audit and confirm the finding no longer appears."}</p>
                </div>
                {issue.snippet && <CodeBlock code={issue.snippet} />}
              </div>
              <div className="issue-board-controls">
                <label>
                  Status
                  <select
                    onChange={(event) => updateIssue(issue.issueId, { status: event.target.value || issue.status || "open" })}
                    value={manualRepairQueueStatus(issue.status)}
                  >
                    <option value="">Managed by action</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </label>
                <label>
                  Action mode
                  <select
                    onChange={(event) => updateIssue(issue.issueId, { actionMode: event.target.value })}
                    value={issue.actionMode || "self_serve"}
                  >
                    <option value="self_serve">Self serve</option>
                    <option value="teammate">Teammate</option>
                    <option value="fix_pack">Fix Pack</option>
                    <option value="cms_draft">CMS draft</option>
                    <option value="github_pr">Future PR</option>
                  </select>
                </label>
                {issue.sourceKind !== "repair_plan" && (
                  <label>
                    Assignee
                    <select
                      onChange={(event) => updateIssue(issue.issueId, { assigneeEmail: event.target.value })}
                      value={issue.assigneeEmail || ""}
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.email}>
                          {member.name || member.email}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {issue.latestAction?.executionState === "applied" && (
                  <label>
                    Rerun report ID
                    <input
                      onChange={(event) => updateIssue(issue.issueId, { lastRerunReportId: event.target.value })}
                      placeholder="Paste rerun report ID"
                      value={issue.lastRerunReportId || ""}
                    />
                  </label>
                )}
                {issue.sourceKind !== "repair_plan" && (
                  <label>
                    Note
                    <textarea
                      onChange={(event) => updateIssue(issue.issueId, { note: event.target.value })}
                      placeholder="Internal note or next repair step"
                      value={issue.note || ""}
                    />
                  </label>
                )}
              </div>
              <div className="repair-action-strip">
                <div>
                  <strong>{issue.latestAction ? "Latest agent action" : "No agent action drafted"}</strong>
                  <span>
                    {issue.latestAction
                      ? `${repairActionModeLabel(issue.latestAction.actionMode)} - ${repairApprovalLabel(issue.latestAction.approvalState)} - ${repairExecutionLabel(issue.latestAction.executionState)}`
                      : "Drafts are saved for review and do not publish anything."}
                  </span>
                  {issue.latestAction?.proposedChange && <p>{issue.latestAction.proposedChange}</p>}
                </div>
                <div className="repair-action-buttons">
                  {repairActionImplementationPackAvailable(issue.latestAction) && (
                    <a
                      className="action-link"
                      href={repairActionImplementationPackUrl(report.id, issue.latestAction.id)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Implementation pack
                    </a>
                  )}
                  {issue.rerunStatus === "fixed" && repairActionProofReceiptAvailable(issue.latestAction) && (
                    <a
                      className="action-link"
                      href={repairActionProofReceiptUrl(report.id, issue.latestAction.id)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Proof receipt
                    </a>
                  )}
                  <button
                    className="action-link"
                    disabled={actingIssueId === issue.issueId || status === "loading"}
                    onClick={() => onActionDraft(issue)}
                    type="button"
                  >
                    Draft action
                  </button>
                  {issue.latestAction?.approvalState === "drafted" && (
                    <>
                      <button
                        className="action-link paid-action"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionUpdate(issue, repairActionApprovalPatch(), {
                          pendingMessage: "Approving agent action.",
                          successMessage: "Agent action approved."
                        })}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionUpdate(issue, repairActionIgnorePatch(), {
                          pendingMessage: "Ignoring agent action.",
                          successMessage: "Agent action ignored."
                        })}
                        type="button"
                      >
                        Ignore
                      </button>
	                    </>
	                  )}
                  {issue.latestAction?.approvalState === "approved" && issue.latestAction?.executionState !== "applied" && (
                    <button
                      className="action-link paid-action"
                      disabled={actingIssueId === issue.issueId || status === "loading"}
                      onClick={() => onActionUpdate(issue, repairActionApplyPatch(), {
                        pendingMessage: "Marking approved action applied.",
                        successMessage: "Agent action marked applied."
                      })}
                      type="button"
                    >
                      Apply
                    </button>
                  )}
                  {issue.latestAction?.executionState === "applied" && (
                    <>
                      <button
                        className="action-link paid-action"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionRerun(issue, "fixed")}
                        type="button"
                      >
                        Fixed
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionRerun(issue, "still_open")}
                        type="button"
                      >
                        Still open
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionRerun(issue, "regressed")}
                        type="button"
                      >
                        Regressed
                      </button>
                    </>
                  )}
                </div>
              </div>
              {issue.updatedAt && (
                <p className="quiet-note">Updated {formatDate(issue.updatedAt)}{issue.updatedByEmail ? ` by ${issue.updatedByEmail}` : ""}</p>
              )}
            </article>
          ))}
          {!visibleIssues.length && <p className="quiet-note">No repair items match this filter.</p>}
        </div>
      </div>
    </section>
  );
}

function mergeRepairQueueWithCollaboration(queueItems = [], collaborationIssues = []) {
  const collaborationByIssue = new Map(collaborationIssues.map((issue) => [issue.issueId, issue]));
  return queueItems.map((item) => {
    const collaboration = collaborationByIssue.get(item.issueId) || {};
    return {
      ...item,
      assigneeEmail: collaboration.assigneeEmail || "",
      note: collaboration.note || "",
      collaborationStatus: collaboration.status || "",
      collaborationUpdatedAt: collaboration.updatedAt || "",
      collaborationUpdatedByEmail: collaboration.updatedByEmail || "",
      proposedChange: item.latestAction?.proposedChange || ""
    };
  });
}

function repairBoardCounts(issues = []) {
  return issues.reduce((counts, issue) => {
    counts.total += 1;
    if (issue.status === "drafted") counts.drafted += 1;
    if (issue.status === "approved") counts.approved += 1;
    if (issue.status === "fixed") counts.fixed += 1;
    return counts;
  }, { total: 0, drafted: 0, approved: 0, fixed: 0 });
}

function collaborationStatusForQueueStatus(status) {
  if (status === "fixed") return "fixed";
  if (status === "ignored") return "ignored";
  if (["drafted", "approved", "applied", "in_progress"].includes(status)) return "in_progress";
  return "open";
}

function manualRepairQueueStatus(status) {
  return ["open", "in_progress", "ignored"].includes(status) ? status : "";
}

function actionTypeForMode(mode) {
  const types = {
    cms_draft: "cms_draft",
    fix_pack: "fix_pack_handoff",
    github_pr: "github_pr_draft"
  };
  return types[mode] || "draft_fix";
}

function repairStatusLabel(status) {
  const labels = {
    open: "Open",
    in_progress: "In progress",
    drafted: "Drafted",
    approved: "Approved",
    applied: "Applied",
    fixed: "Fixed",
    ignored: "Ignored",
    regressed: "Regressed"
  };
  return labels[status] || "Open";
}

function repairApprovalLabel(state) {
  const labels = {
    drafted: "Drafted",
    approved: "Approved",
    ignored: "Ignored"
  };
  return labels[state] || "Drafted";
}

function repairExecutionLabel(state) {
  const labels = {
    not_started: "Not started",
    recorded: "Recorded",
    applied: "Applied",
    blocked: "Blocked"
  };
  return labels[state] || "Not started";
}

function repairActionModeLabel(mode) {
  const labels = {
    self_serve: "Self serve",
    teammate: "Teammate",
    fix_pack: "Fix Pack",
    cms_draft: "CMS draft",
    github_pr: "Future PR"
  };
  return labels[mode] || "Self serve";
}

function Metric({ label, value }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PerformancePanel({ performance }) {
  const metrics = performance.labMetrics || {};
  const opportunities = performance.opportunities || [];
  const score =
    Number.isFinite(Number(performance.performanceScore)) ? `${performance.performanceScore}/100` : "local proof";
  return (
    <section className="performance-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Performance proof</p>
        <h2>{performance.status === "success" ? "PageSpeed lab data" : "Rendered load snapshot"}</h2>
        <p>
          {performance.status === "success"
            ? "Mobile Lighthouse metrics from PageSpeed Insights are converted into repair-ready findings."
            : performance.reason || "The rendered browser audit still captured local load proof."}
        </p>
      </div>
      <div className="performance-grid">
        <Metric label="Mobile score" value={score} />
        <Metric label="LCP" value={metricDisplay(metrics.largestContentfulPaint)} />
        <Metric label="TBT" value={metricDisplay(metrics.totalBlockingTime)} />
        <Metric label="CLS" value={metricDisplay(metrics.cumulativeLayoutShift)} />
        <Metric label="Speed Index" value={metricDisplay(metrics.speedIndex)} />
      </div>
      {(performance.fieldData?.overallCategory || opportunities.length > 0) && (
        <div className="performance-details">
          {performance.fieldData?.overallCategory && (
            <p>
              Field data: <strong>{performance.fieldData.overallCategory}</strong>
              {performance.fieldData.originFallback ? " via origin fallback" : ""}
            </p>
          )}
          {opportunities.length > 0 && (
            <ul>
              {opportunities.slice(0, 3).map((item) => (
                <li key={item.id || item.title}>
                  <strong>{item.title}</strong>
                  <span>{performanceOpportunityLabel(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ResourceWaterfallPanel({ waterfall }) {
  const summary = waterfall.summary || {};
  const slowResources = waterfall.slowResources || [];
  const heavyResources = waterfall.heavyResources || [];
  const blockers = waterfall.renderBlockingCandidates || [];
  const thirdPartyHosts = waterfall.thirdPartyHosts || [];
  const rows = [
    { label: "Requests", value: summary.totalRequests || 0 },
    { label: "Transfer", value: formatBytes(summary.totalTransferBytes || 0) },
    { label: "JavaScript", value: formatBytes(summary.scriptBytes || 0) },
    { label: "CSS", value: formatBytes(summary.stylesheetBytes || 0) },
    { label: "Images", value: formatBytes(summary.imageBytes || 0) },
    { label: "Slow", value: summary.slowRequests || 0 },
    { label: "Blocking", value: summary.renderBlockingCandidates || 0 }
  ];

  if (waterfall.status === "empty") {
    return (
      <section className="resource-waterfall-panel">
        <div className="section-heading">
          <p className="beta-eyebrow">Resource waterfall</p>
          <h2>Browser resource timing was unavailable.</h2>
          <p>{waterfall.reason || "The rendered scan did not expose request-level timing rows."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="resource-waterfall-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Resource waterfall</p>
        <h2>Browser-loaded resources with repair proof.</h2>
        <p>
          Request timing, transfer size, and early render-blocking candidates from the rendered browser pass.
        </p>
      </div>
      <div className="resource-waterfall-metrics">
        {rows.map((row) => (
          <Metric key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
      <div className="resource-waterfall-grid">
        <ResourceTimingList
          title="Slow requests"
          empty="No slow resource requests captured."
          resources={slowResources}
          value={(resource) => formatMs(resource.durationMs)}
        />
        <ResourceTimingList
          title="Heavy resources"
          empty="No heavy resources crossed the review threshold."
          resources={heavyResources}
          value={(resource) => formatBytes(resource.sizeBytes || 0)}
        />
        <ResourceTimingList
          title="Render blockers"
          empty="No early script or stylesheet blockers captured."
          resources={blockers}
          value={(resource) => formatMs(resource.durationMs)}
        />
        <div className="resource-waterfall-list">
          <strong>Third-party hosts</strong>
          {thirdPartyHosts.length ? (
            thirdPartyHosts.slice(0, 5).map((host) => (
              <div className="resource-row" key={host.host}>
                <span>{host.host}</span>
                <small>{host.requests} requests · {formatBytes(host.transferBytes || 0)}</small>
              </div>
            ))
          ) : (
            <p>No third-party resource hosts captured.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ResourceTimingList({ title, empty, resources, value }) {
  return (
    <div className="resource-waterfall-list">
      <strong>{title}</strong>
      {resources.length ? (
        resources.slice(0, 5).map((resource) => (
          <div className="resource-row" key={`${title}-${resource.url}`}>
            <span>{resource.label || resource.host || resource.url}</span>
            <small>{resource.type || "resource"} · {value(resource)}</small>
          </div>
        ))
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function metricDisplay(metric) {
  return metric?.display || "unknown";
}

function performanceOpportunityLabel(item) {
  const parts = [];
  if (item.savingsMs) parts.push(`${Math.round(item.savingsMs)}ms`);
  if (item.savingsBytes) parts.push(formatBytes(item.savingsBytes));
  if (item.displayValue) parts.push(item.displayValue);
  if (item.score !== null && item.score !== undefined) parts.push(`${item.score}/100`);
  return parts.join(" · ") || "needs review";
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "0 B";
  if (number < 1024) return `${Math.round(number)} B`;
  if (number < 1024 * 1024) return `${Math.round(number / 1024)} KB`;
  return `${(number / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "0ms";
  if (number < 1000) return `${Math.round(number)}ms`;
  return `${(number / 1000).toFixed(1)}s`;
}

function FixRequestStatusPanel({ fixRequest, checkoutReturned }) {
  const status = fixRequest?.status || (checkoutReturned ? "checkout_created" : "new");
  const label = fixRequest?.statusLabel || statusLabel(status);
  const message = checkoutMessage(status, checkoutReturned);

  return (
    <section className={`fix-status-panel ${status}`}>
      <div>
        <p className="beta-eyebrow">SEO Fix Pack</p>
        <h2>{label}</h2>
        <p>{message}</p>
      </div>
      {fixRequest && (
        <dl>
          {fixRequest.paidAt && (
            <div>
              <dt>Paid</dt>
              <dd>{formatDate(fixRequest.paidAt)}</dd>
            </div>
          )}
          {fixRequest.inProgressAt && (
            <div>
              <dt>Started</dt>
              <dd>{formatDate(fixRequest.inProgressAt)}</dd>
            </div>
          )}
          {fixRequest.deliveredAt && (
            <div>
              <dt>Delivered</dt>
              <dd>{formatDate(fixRequest.deliveredAt)}</dd>
            </div>
          )}
          {fixRequest.dueAt && (
            <div>
              <dt>Expected by</dt>
              <dd>{formatDate(fixRequest.dueAt)}</dd>
            </div>
          )}
          {fixRequest.nextUpdateAt && (
            <div>
              <dt>Next update</dt>
              <dd>{formatDate(fixRequest.nextUpdateAt)}</dd>
            </div>
          )}
          {fixRequest.customerNote && (
            <div>
              <dt>Note</dt>
              <dd>{fixRequest.customerNote}</dd>
            </div>
          )}
          {fixRequest.deliveryUrl && (
            <div>
              <dt>Delivery</dt>
              <dd><a href={fixRequest.deliveryUrl} target="_blank" rel="noreferrer">Open delivery link</a></dd>
            </div>
          )}
          {fixRequest.finalReportPath && (
            <div>
              <dt>Final rerun</dt>
              <dd><a href={fixRequest.finalReportPath}>Open rerun report</a></dd>
            </div>
          )}
          {fixRequest.beforeAfterSummary && (
            <div>
              <dt>Rerun proof</dt>
              <dd>{beforeAfterText(fixRequest.beforeAfterSummary)}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

function RepairProposalPanel({ reportId, initialProposals = [], repairSprint = null }) {
  const [proposals, setProposals] = useState(initialProposals);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setProposals(initialProposals);
  }, [initialProposals]);

  async function updateProposal(proposal, action) {
    setSavingId(proposal.id);
    setMessage("");
    const result = await patchRepairProposalApproval(reportId, proposal.id, { action });
    setSavingId("");
    if (!result.ok) {
      setMessage(result.error || "Could not update repair proposal.");
      return;
    }
    setProposals((current) => current.map((item) => (item.id === proposal.id ? result.proposal : item)));
    setMessage(action === "approve" ? "Repair approved." : "Repair dismissed.");
  }

  const approvedCount = proposals.filter((proposal) => proposal.approvalStatus === "approved").length;
  const executableCount = proposals.filter((proposal) => proposal.executionMode !== "unsupported").length;
  const currentRepairSprint = repairSprint
    ? {
        ...repairSprint,
        approved: approvedCount,
        executable: executableCount,
        status: executableCount
          ? approvedCount
            ? repairSprint.hasPaidRequest
              ? "active"
              : "approval_ready"
            : "needs_owner_approval"
          : "unsupported",
        message: executableCount
          ? approvedCount
            ? repairSprint.hasPaidRequest
              ? "Repair Sprint execution can use the paid Fix Pack fulfillment path for this report."
              : "Proposal approval is ready; a distinct Repair Sprint checkout remains gated until product billing is wired."
            : "Approve at least one executable proposal before packaging this as a Repair Sprint."
          : "This report does not have enough executable proposal proof for a Repair Sprint."
      }
    : null;

  return (
    <section className="repair-proposal-panel">
      <div className="section-heading">
        <div>
          <p className="beta-eyebrow">Repair execution</p>
          <h2>Approve the scoped fixes.</h2>
        </div>
        <div className="proposal-summary">
          <span>{approvedCount} approved</span>
          <span>{executableCount} executable</span>
          <span>{proposals.length} total</span>
        </div>
      </div>
      {currentRepairSprint && (
        <div className={`repair-sprint-strip ${currentRepairSprint.status}`}>
          <div>
            <span className="status-pill">Repair Sprint</span>
            <strong>{currentRepairSprint.priceRange}</strong>
          </div>
          <p>{currentRepairSprint.message}</p>
        </div>
      )}
      {message && <p className={`form-message ${message.includes("Could") ? "error" : "success"}`}>{message}</p>}
      <div className="repair-proposal-list">
        {proposals.map((proposal) => (
          <article className={`repair-proposal-card ${proposal.approvalStatus}`} key={proposal.id}>
            <div className="proposal-card-main">
              <div>
                <span className="status-pill">{proposal.executionModeLabel || proposal.executionMode}</span>
                <span className="status-pill">{proposalStatusLabel(proposal.approvalStatus)}</span>
                {proposal.deliveryStatus && <span className="status-pill">{proposalStatusLabel(proposal.deliveryStatus)}</span>}
                <h3>{proposal.generatedTitle || proposal.issueTitle}</h3>
                <p>{proposal.generatedSummary || proposal.proposal?.fix}</p>
              </div>
              <div className="proposal-actions">
                <button
                  className="action-link paid-action"
                  disabled={savingId === proposal.id || proposal.approvalStatus === "approved" || proposal.executionMode === "unsupported"}
                  onClick={() => updateProposal(proposal, "approve")}
                  type="button"
                >
                  {savingId === proposal.id ? "Saving" : "Approve"}
                </button>
                <button
                  className="action-link"
                  disabled={savingId === proposal.id || proposal.approvalStatus === "dismissed"}
                  onClick={() => updateProposal(proposal, "dismiss")}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <dl className="proposal-proof">
              {proposal.proof?.evidence && (
                <div>
                  <dt>Proof</dt>
                  <dd>{proposal.proof.evidence}</dd>
                </div>
              )}
              {proposal.acceptance?.length > 0 && (
                <div>
                  <dt>Acceptance</dt>
                  <dd>{proposal.acceptance[0]}</dd>
                </div>
              )}
              {proposal.proposal?.snippet && (
                <div>
                  <dt>Snippet</dt>
                  <dd><code>{proposal.proposal.snippet}</code></dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function proposalStatusLabel(status = "") {
  const labels = {
    pending: "Pending",
    approved: "Approved",
    dismissed: "Dismissed",
    draft: "Draft",
    in_progress: "In progress",
    delivered: "Delivered"
  };
  return labels[status] || status || "Pending";
}

function checkoutMessage(status, checkoutReturned) {
  if (status === "paid") return "Payment is confirmed. Your repair pass is queued.";
  if (status === "in_progress") return "The repair pass is in progress. Delivery notes will appear here.";
  if (status === "delivered") return "Delivery is ready. Use the delivery and rerun links below.";
  if (status === "payment_failed") return "Payment did not complete. You can reopen checkout from this report.";
  if (status === "refunded") return "This Fix Pack was refunded.";
  if (status === "disputed") return "This payment needs manual support review.";
  if (checkoutReturned) return "Checkout returned. Payment confirmation can take a moment after Dodo finishes processing.";
  return "Checkout has been opened for this report.";
}

function statusLabel(status) {
  const labels = {
    new: "Request saved",
    checkout_created: "Checkout opened",
    queued: "Queued",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    paid: "Payment confirmed",
    in_progress: "Repair in progress",
    delivered: "Delivered",
    payment_failed: "Payment failed",
    refunded: "Refunded",
    refund_failed: "Refund failed",
    disputed: "Disputed"
  };
  return labels[status] || labels.new;
}

function auditJobDetail(job = {}) {
  if (job.status === "completed") {
    return `Report saved${job.completedAt ? ` ${formatDate(job.completedAt)}` : ""}.`;
  }
  if (job.status === "failed") {
    return job.error || "Audit failed. Try another URL.";
  }
  if (job.status === "running") {
    return "Rendering the site and collecting proof.";
  }
  return "Waiting for proof collection to start.";
}

function auditScheduleDetail(schedule = {}) {
  const next = schedule.nextRunAt ? formatDate(schedule.nextRunAt) : "";
  const last = schedule.lastRunAt ? formatDate(schedule.lastRunAt) : "";
  if (schedule.lastReportPath && last) return `Last checked ${last}. Next check ${next || "soon"}.`;
  if (last) return `Last checked ${last}. Next check ${next || "soon"}.`;
  return `First check ${next || "queued"}.`;
}

function hostKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function beforeAfterText(summary) {
  if (!summary) return "";
  const beforeScore = Number(summary.beforeScore || 0);
  const afterScore = Number(summary.afterScore || 0);
  const beforeFindings = Number(summary.beforeFindings || 0);
  const afterFindings = Number(summary.afterFindings || 0);
  const scoreDelta = afterScore - beforeScore;
  const fixed = Math.max(0, beforeFindings - afterFindings);
  return `Score ${beforeScore} to ${afterScore} (${scoreDelta >= 0 ? "+" : ""}${scoreDelta}); findings ${beforeFindings} to ${afterFindings} (${fixed} reduced).`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(number);
}

function formatPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${Math.round(number * 1000) / 10}%`;
}

function formatPosition(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "n/a";
  return String(Math.round(number * 10) / 10);
}

function signedNumber(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${formatCount(number)}` : formatCount(number);
}

function teamRoleLabel(role) {
  const labels = {
    admin: "Admin",
    editor: "Editor",
    viewer: "Viewer"
  };
  return labels[role] || "Editor";
}

function datetimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function FindingItem({ finding, plan, compact = false }) {
  return (
    <article className={`finding-item ${finding.severity} ${compact ? "compact" : ""}`}>
      <div>
        <span>{finding.severity}</span>
        <h3>{finding.title}</h3>
      </div>
      {!compact && <p>{finding.why}</p>}
      <dl>
        {finding.pageLabel && (
          <div>
            <dt>Page</dt>
            <dd>{finding.pageLabel}</dd>
          </div>
        )}
        <div>
          <dt>Confidence</dt>
          <dd>{finding.confidence || "verified"}</dd>
        </div>
        <div>
          <dt>Proof</dt>
          <dd>{finding.evidence}</dd>
        </div>
        <div>
          <dt>Fix</dt>
          <dd>{finding.fix}</dd>
        </div>
        {plan?.acceptance && (
          <div>
            <dt>Acceptance</dt>
            <dd>{plan.acceptance}</dd>
          </div>
        )}
      </dl>
      {finding.source && (
        <a className="source-link" href={finding.source} target="_blank" rel="noreferrer">
          Google source
        </a>
      )}
      {finding.snippet && <CodeBlock code={finding.snippet} />}
    </article>
  );
}

function FixItem({ fix }) {
  return (
    <article className="fix-item">
      <div>
        <span>#{fix.priority}</span>
        <h3>{fix.title}</h3>
      </div>
      <div className="fix-tags">
        <small>{fix.estimatedEffort || "15-30 min"}</small>
        <small>{fix.workType || "review"}</small>
        <small>{fix.confidence || "verified"}</small>
      </div>
      <p>{fix.fix}</p>
      {fix.pageLabel && <p className="proof-line">Page: {fix.pageLabel}</p>}
      <p className="proof-line">Proof: {fix.proof}</p>
      <p className="proof-line">Acceptance: {fix.acceptance}</p>
      {fix.snippet && <CodeBlock code={fix.snippet} />}
    </article>
  );
}

function PageProof({ page }) {
  const facts = page.rendered || {};
  const staticFacts = page.static || {};
  return (
    <article className="page-proof">
      <p className="beta-eyebrow">Static vs rendered proof</p>
      <h3>{page.url}</h3>
      <dl>
        <div>
          <dt>Status</dt>
          <dd>{page.status || "unknown"} {page.redirected ? `· final ${facts.finalUrl || page.finalUrl}` : ""}</dd>
        </div>
        <div>
          <dt>Title</dt>
          <dd>{facts.title || "missing"}</dd>
        </div>
        <div>
          <dt>H1</dt>
          <dd>{facts.h1s?.join(" | ") || "missing"}</dd>
        </div>
        <div>
          <dt>Words</dt>
          <dd>{staticFacts.wordCount ?? "unknown"} static → {facts.wordCount ?? "unknown"} rendered</dd>
        </div>
        <div>
          <dt>Internal links</dt>
          <dd>{staticFacts.internalLinks?.length ?? 0} static → {facts.internalLinks?.length ?? 0} rendered</dd>
        </div>
        <div>
          <dt>Broken links</dt>
          <dd>{page.linkChecks?.filter((check) => !check.ok || !check.status || check.status >= 400).length ?? 0}</dd>
        </div>
        <div>
          <dt>Broken images</dt>
          <dd>{page.imageChecks?.filter((check) => !check.ok || !check.status || check.status >= 400).length ?? 0}</dd>
        </div>
        <div>
          <dt>Rendered load</dt>
          <dd>{formatLoadMs(facts.loadDurationMs)}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{facts.schemaTypes?.join(", ") || "none"}</dd>
        </div>
      </dl>
    </article>
  );
}

function PageSummaryTable({ pages }) {
  return (
    <>
      <div className="page-table" role="table" aria-label="Crawled pages">
        <div className="page-table-row page-table-head" role="row">
          <span>Page</span>
          <span>Score</span>
          <span>Issues</span>
          <span>H1</span>
          <span>Words</span>
          <span>Links</span>
          <span>Broken</span>
          <span>Load</span>
          <span>Schema</span>
        </div>
        {pages.map((page) => (
          <div className="page-table-row" role="row" key={page.url}>
            <span title={page.url}>{page.path || new URL(page.url).pathname || "/"}</span>
            <strong>{page.score}</strong>
            <span>{page.critical + page.warnings + page.notices}</span>
            <span>{page.h1 || "missing"}</span>
            <span>{page.wordCount}</span>
            <span>{page.internalLinks}</span>
            <span>{(page.brokenLinks || 0) + (page.brokenImages || 0)}</span>
            <span>{formatLoadMs(page.loadDurationMs)}</span>
            <span>{page.schemaTypes?.join(", ") || "none"}</span>
          </div>
        ))}
      </div>
      <div className="page-card-list" aria-label="Crawled pages mobile summary">
        {pages.map((page) => (
          <article className="page-summary-card" key={`card-${page.url}`}>
            <div>
              <span>{page.path || new URL(page.url).pathname || "/"}</span>
              <strong>{page.score}/100</strong>
            </div>
            <dl>
              <div>
                <dt>Issues</dt>
                <dd>{page.critical + page.warnings + page.notices}</dd>
              </div>
              <div>
                <dt>H1</dt>
                <dd>{page.h1 || "missing"}</dd>
              </div>
              <div>
                <dt>Words</dt>
                <dd>{page.wordCount}</dd>
              </div>
              <div>
                <dt>Links</dt>
                <dd>{page.internalLinks}</dd>
              </div>
              <div>
                <dt>Broken</dt>
                <dd>{(page.brokenLinks || 0) + (page.brokenImages || 0)}</dd>
              </div>
              <div>
                <dt>Load</dt>
                <dd>{formatLoadMs(page.loadDurationMs)}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>{page.schemaTypes?.join(", ") || "none"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function formatLoadMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "unknown";
  if (number < 1000) return `${Math.round(number)}ms`;
  return `${(number / 1000).toFixed(1)}s`;
}

function safeHostnameLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "saved audit";
  }
}

function safeUrlLabel(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "webhook";
  }
}

function summarizePages(pages, findings, startUrl) {
  return pages.map((page) => {
    const pageFindings = findings.filter(
      (finding) => finding.pageUrl === page.url && finding.severity !== "good"
    );
    const facts = page.rendered || {};
    const staticFacts = page.static || {};
    return {
      url: page.url,
      path: pathLabel(page.url, startUrl),
      score: scorePageFindings(pageFindings),
      critical: pageFindings.filter((finding) => finding.severity === "critical").length,
      warnings: pageFindings.filter((finding) => finding.severity === "warning").length,
      notices: pageFindings.filter((finding) => finding.severity === "notice").length,
      h1: facts.h1s?.[0] || "",
      wordCount: facts.wordCount || 0,
      internalLinks: facts.internalLinks?.length || 0,
      schemaTypes: facts.schemaTypes || [],
      staticWordCount: staticFacts.wordCount || 0
    };
  });
}

function scorePageFindings(findings = []) {
  const groups = new Map();
  for (const finding of findings) {
    const key = String(finding.title || "unknown issue")
      .replace(/\son\s(home|\/[^\s]+)/i, "")
      .replace(/\sneeds cleanup.*/i, " needs cleanup")
      .trim();
    const current = groups.get(key) || { critical: 0, warning: 0, notice: 0 };
    if (finding.severity === "critical") current.critical += 1;
    if (finding.severity === "warning") current.warning += 1;
    if (finding.severity === "notice") current.notice += 1;
    groups.set(key, current);
  }

  let penalty = 0;
  for (const group of groups.values()) {
    penalty += scorePenalty(group.critical, "critical");
    penalty += scorePenalty(group.warning, "warning");
    penalty += scorePenalty(group.notice, "notice");
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function scorePenalty(count, severity) {
  if (!count) return 0;
  const first = { critical: 12, warning: 5, notice: 1 }[severity] || 0;
  const repeat = { critical: 4, warning: 1.5, notice: 0.25 }[severity] || 0;
  const cap = { critical: 28, warning: 10, notice: 3 }[severity] || first;
  return Math.min(cap, first + Math.max(0, count - 1) * repeat);
}

function pathLabel(url, startUrl) {
  try {
    const parsed = new URL(url);
    if (startUrl && new URL(startUrl).pathname === parsed.pathname) return "home";
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

function CodeBlock({ code }) {
  return (
    <div className="code-block">
      <button type="button" onClick={() => copyText(code)}>
        Copy
      </button>
      <pre>{code}</pre>
    </div>
  );
}

function CopyButton({ label, value }) {
  return (
    <button className="action-link" onClick={() => copyText(value)} type="button">
      {label}
    </button>
  );
}

function usePricingPreview(enabled) {
  const [pricing, setPricing] = useState({
    status: enabled ? "loading" : "idle",
    displayPrice: "",
    message: ""
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setPricing({ status: "idle", displayPrice: "", message: "" });
      return;
    }

    let cancelled = false;
    setPricing({ status: "loading", displayPrice: "", message: "" });
    fetch("/api/pricing-preview", {
      credentials: "include",
      headers: { accept: "application/json" }
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Pricing unavailable.");
        }
        return payload.pricing || {};
      })
      .then((nextPricing) => {
        if (cancelled) return;
        setPricing({
          status: nextPricing.displayPrice ? "available" : "error",
          displayPrice: nextPricing.displayPrice || "",
          message: nextPricing.displayPrice ? "Dodo checkout price" : "Pricing unavailable."
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setPricing({
          status: "error",
          displayPrice: "",
          message: error?.message || "Pricing unavailable."
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  return { ...pricing, reload: () => setAttempt((value) => value + 1) };
}

function FixQuotePanel({ report, hasPriorityFixes }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [repairQueue, setRepairQueue] = useState({ status: "idle", items: [] });
  const pricing = usePricingPreview(hasPriorityFixes);
  useEffect(() => {
    if (!hasPriorityFixes || !report.id) {
      setRepairQueue({ status: "idle", items: [] });
      return undefined;
    }
    let cancelled = false;
    setRepairQueue((current) => ({ ...current, status: "loading" }));
    loadRepairQueue(report.id)
      .then((payload) => {
        if (cancelled) return;
        setRepairQueue({ status: "success", items: payload.items || [] });
      })
      .catch(() => {
        if (cancelled) return;
        setRepairQueue({ status: "error", items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [hasPriorityFixes, report.id]);
  const selectedRepair = fixPackRepairTarget(report, repairQueue.items);
  const selectedRepairIsLive = selectedRepair?.source === "repair_queue";
  const checkoutDisabled = fixPackCheckoutDisabled({
    hasPriorityFixes,
    pricingStatus: pricing.status,
    status
  });
  const priceLabel =
    pricing.status === "available"
      ? pricing.displayPrice
      : pricing.status === "loading"
        ? "Loading Dodo price"
        : "Pricing unavailable";

  return (
    <aside className="paid-panel">
      <div>
        <p className="beta-eyebrow">{hasPriorityFixes ? "SEO Fix Pack" : "Monitoring"}</p>
        <h3>{hasPriorityFixes ? "Open checkout for the paid repair pass." : "No paid fix needed from this scan."}</h3>
        {hasPriorityFixes && (
          <div className={`price-preview ${pricing.status}`}>
            <strong>{priceLabel}</strong>
            <span>
              {pricing.status === "available"
                ? "Pulled from Dodo before checkout."
                : pricing.status === "loading"
                  ? "Checking the live payment source."
                  : "Checkout is paused until Dodo pricing loads."}
            </span>
          </div>
        )}
        <p>
          {hasPriorityFixes
            ? "One proof-backed repair pass for this report, then one rerun after fixes. No ranking promises, just the proven repair queue."
            : "Keep the private report and rerun after meaningful content or template changes."}
        </p>
        {hasPriorityFixes && selectedRepair?.title && (
          <p className="quiet-note">
            {selectedRepairIsLive ? "Checkout repair target" : "Top report repair"}: {selectedRepair.title}
          </p>
        )}
        {hasPriorityFixes && repairQueue.status === "loading" && (
          <p className="quiet-note">Checking the live repair queue before checkout.</p>
        )}
        {hasPriorityFixes && repairQueue.status === "error" && (
          <p className="quiet-note">Checkout will ask the server for the first active repair target.</p>
        )}
      </div>
      {hasPriorityFixes ? (
        <span className="checkout-action">
          <button
            className="action-link paid-action"
            disabled={checkoutDisabled}
            onClick={async () => {
              setStatus("submitting");
              setMessage("");
              try {
                const result = await requestFixQuote(report.id, selectedRepairIsLive ? selectedRepair : null);
                const outcome = fixPackCheckoutOutcome(result);
                setStatus(outcome.status);
                setMessage(outcome.message);
                if (outcome.checkoutUrl) {
                  window.location.assign(outcome.checkoutUrl);
                }
              } catch (error) {
                const outcome = fixPackCheckoutErrorOutcome(error);
                setStatus(outcome.status);
                setMessage(outcome.message);
              }
            }}
            type="button"
          >
            {status === "success" ? "Checkout ready" : status === "submitting" ? "Opening checkout" : "Start paid Fix Pack"}
          </button>
          {(message || pricing.status === "error") && (
            <small className={`checkout-message ${status === "error" || pricing.status === "error" ? "error" : status}`}>
              {message || pricing.message}
            </small>
          )}
          {pricing.status === "error" && (
            <small className="checkout-message">
              <button className="action-link" onClick={() => pricing.reload()} type="button">
                Retry price
              </button>{" "}
              or email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>
            </small>
          )}
        </span>
      ) : (
        <CopyButton label="Copy report URL" value={report.reportUrl || ""} />
      )}
    </aside>
  );
}

function BillingPortal({ ownerEmail }) {
  const [billing, setBilling] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Loading billing.");
  const [monitoringCheckoutStatus, setMonitoringCheckoutStatus] = useState("idle");
  const [monitoringCheckoutMessage, setMonitoringCheckoutMessage] = useState("");

  useEffect(() => {
    loadBillingSummary(setBilling, setStatus, setMessage);
  }, []);

  const requests = billing?.requests || [];
  const payments = billing?.payments || [];
  const pricing = billing?.pricing || {};
  const subscription = billing?.subscriptionState || {};
  const monitoring = billing?.monitoring || {};
  const monitoringOffer = monitoring.offer || {};
  const priceLabel =
    pricing.status === "available"
      ? pricing.displayPrice
      : status === "loading"
        ? "Loading Dodo price"
        : "Pricing unavailable";
  const monitoringDisabled = monitoringCheckoutDisabled({
    checkoutReady: Boolean(monitoring.checkoutReady),
    status: monitoringCheckoutStatus,
    hasEligibleSite: monitoring.hasEligibleSite !== false
  });

  async function startMonitoringCheckout() {
    setMonitoringCheckoutStatus("submitting");
    setMonitoringCheckoutMessage("");
    try {
      const response = await fetch("/api/beta/monitoring-checkout", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && payload.checkoutAvailable !== false) {
        throw new Error(payload.error || payload.message || "Proof Monitoring checkout is unavailable.");
      }
      const outcome = monitoringCheckoutOutcome(payload);
      setMonitoringCheckoutStatus(outcome.status === "redirecting" ? "success" : outcome.status);
      setMonitoringCheckoutMessage(outcome.message);
      if (outcome.checkoutUrl) {
        window.location.href = outcome.checkoutUrl;
      }
    } catch (error) {
      const outcome = monitoringCheckoutErrorOutcome(error);
      setMonitoringCheckoutStatus(outcome.status);
      setMonitoringCheckoutMessage(outcome.message);
    }
  }

  return (
    <section className="billing-shell">
      <div className="section-heading billing-heading">
        <div>
          <p className="beta-eyebrow">Billing</p>
          <h1>Fix Pack billing</h1>
          <p className="session-note">Private beta session: {billing?.owner?.email || ownerEmail || "active"}</p>
        </div>
        <button
          className="action-link"
          disabled={status === "loading"}
          onClick={() => loadBillingSummary(setBilling, setStatus, setMessage)}
          type="button"
        >
          {status === "loading" ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {message && <p className={`form-message ${status}`}>{message}</p>}

      <section className="metric-strip billing-metrics" aria-label="Billing summary">
        <Metric label="Product" value={billing?.product?.name || "Fix Pack"} />
        <Metric label="Requests" value={requests.length} />
        <Metric label="Payments" value={payments.length} />
        <Metric label="Subscription" value={subscription.status === "not_live" ? "None" : subscription.label || "Active"} />
      </section>

      <section className="billing-grid">
        <div className="billing-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Dodo checkout</p>
            <h2>{billing?.product?.name || "SEO Fix Pack"}</h2>
          </div>
          <div className={`price-preview ${pricing.status === "available" ? "available" : "error"}`}>
            <strong>{priceLabel}</strong>
            <span>
              {pricing.status === "available"
                ? "Pulled from Dodo before checkout."
                : pricing.message || "Checkout waits until Dodo pricing is available."}
            </span>
          </div>
          <p>{billing?.product?.description || "One proof-backed repair pass plus one rerun after fixes."}</p>
          <p className="quiet-note">
            {billing?.product?.checkoutNote || "Checkout starts from a report with proven fixes."}
          </p>
        </div>

        <div className="billing-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Subscription</p>
            <h2>{subscription.label || "No recurring subscription"}</h2>
          </div>
          <p>{subscription.message || "SEO Fix Kit currently sells one-time Fix Pack requests. Repair Agent and Growth Add-On subscriptions remain roadmap."}</p>
          <p className="quiet-note">Provider: {billing?.provider?.name || "Dodo Payments"}</p>
        </div>

        <div className="billing-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Proof Monitoring</p>
            <h2>{monitoring.status === "active" ? "Monitoring active" : monitoring.checkoutReady ? "Start weekly monitoring" : "Monitoring checkout gated"}</h2>
          </div>
          <p>{monitoring.message || monitoringOffer.description || "Weekly proof monitoring watches verified sites and reports deltas."}</p>
          <button
            className="action-link paid-action"
            disabled={monitoringDisabled}
            onClick={startMonitoringCheckout}
            type="button"
          >
            {monitoringCheckoutStatus === "submitting" ? "Opening checkout" : "Start monitoring checkout"}
          </button>
          {monitoringCheckoutMessage && (
            <p className={`form-message ${monitoringCheckoutStatus}`}>{monitoringCheckoutMessage}</p>
          )}
          <p className="quiet-note">
            Entitlement activates only after Dodo sends the subscription webhook. This does not execute repairs.
          </p>
        </div>
      </section>

      <OfferLadder offers={billing?.offers || []} />

      <section className="billing-panel billing-list-panel">
        <div className="section-heading">
          <p className="beta-eyebrow">Requests</p>
          <h2>Fix Pack status</h2>
        </div>
        <div className="billing-list">
          {requests.map((request) => {
            const readiness = request.deliveryReadiness || {};
            return (
              <article className={`billing-row ${request.status}`} key={request.id}>
                <div>
                  <span className="status-pill">{request.statusLabel || statusLabel(request.status)}</span>
                  <h3>{request.targetHost || request.targetUrl}</h3>
                  <p>{request.issueCount || 0} findings · score {request.score ?? "unknown"}</p>
                  {readiness.status && (
                    <div className={`delivery-readiness ${readiness.status}`}>
                      <strong>{deliveryReadinessLabel(readiness)}</strong>
                      <span>{deliveryReadinessText(readiness)}</span>
                    </div>
                  )}
                </div>
                <div className="billing-row-meta">
                  {request.paidAt && <span>Paid {formatDate(request.paidAt)}</span>}
                  {request.dueAt && <span>Due {formatDate(request.dueAt)}</span>}
                  {request.nextUpdateAt && <span>Next update {formatDate(request.nextUpdateAt)}</span>}
                  {request.deliveredAt && <span>Delivered {formatDate(request.deliveredAt)}</span>}
                </div>
                <div className="queue-links">
                  {request.reportPath && <a href={request.reportPath}>Report</a>}
                  {request.briefPath && <a href={request.briefPath}>Brief</a>}
                  {request.deliveryUrl && <a href={request.deliveryUrl} target="_blank" rel="noreferrer">Delivery</a>}
                </div>
              </article>
            );
          })}
          {!requests.length && (
            <p className="quiet-note">
              No Fix Pack requests yet. Run an audit, open a report with proven fixes, then start checkout from that report.
              <a className="inline-link" href="/beta"> Run an audit</a>
            </p>
          )}
        </div>
      </section>

      <section className="billing-panel billing-list-panel">
        <div className="section-heading">
          <p className="beta-eyebrow">Payment history</p>
          <h2>Dodo records</h2>
        </div>
        <div className="billing-list">
          {payments.map((payment) => (
            <article className={`billing-row ${payment.type}`} key={`${payment.id}-${payment.type}`}>
              <div>
                <span className="status-pill">{payment.type.replaceAll("_", " ")}</span>
                <h3>{payment.targetHost || "Dodo payment"}</h3>
                <p>{payment.displayReference || payment.statusLabel || "Payment record"}</p>
              </div>
              <div className="billing-row-meta">
                {payment.displayAmount && <span>{payment.displayAmount}</span>}
                {payment.displayRefundAmount && <span>Refund {payment.displayRefundAmount}</span>}
                {payment.paidAt && <span>Paid {formatDate(payment.paidAt)}</span>}
                {payment.refundedAt && <span>Refunded {formatDate(payment.refundedAt)}</span>}
                {payment.disputedAt && <span>Disputed {formatDate(payment.disputedAt)}</span>}
              </div>
              <div className="queue-links">
                {payment.reportPath && <a href={payment.reportPath}>Report</a>}
              </div>
            </article>
          ))}
          {!payments.length && <p className="quiet-note">No paid Dodo records for this beta account yet.</p>}
        </div>
      </section>
    </section>
  );
}

function OfferLadder({ offers = [] }) {
  if (!offers.length) return null;
  return (
    <section className="billing-panel offer-ladder">
      <div className="section-heading">
        <p className="beta-eyebrow">Offer ladder</p>
        <h2>Current and gated products</h2>
      </div>
      <div className="offer-card-grid">
        {offers.map((offer) => (
          <article className={`offer-card ${offer.stage}`} key={offer.key}>
            <div>
              <span className="status-pill">{offer.statusLabel}</span>
              <h3>{offer.name}</h3>
              <strong>{offer.priceRange}</strong>
              <p>{offer.description}</p>
            </div>
            <p className="quiet-note">{offer.availability}</p>
            <div className="offer-requirements">
              {(offer.requirements || []).slice(0, 4).map((requirement) => (
                <span key={requirement}>{requirement}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminDashboard({
  adminData,
  adminMessage,
  adminStatus,
  adminToken,
  onInviteCreated,
  onLoad,
  onTokenChange
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const metrics = adminData?.metrics || {};

  async function createInvite(event) {
    event.preventDefault();
    setInviteResult(null);
    const result = await postAdminInvite(adminToken, {
      email: inviteEmail,
      label: inviteLabel || "Private beta invite"
    });
    setInviteResult(result);
    if (result?.ok) {
      setInviteEmail("");
      setInviteLabel("");
      onInviteCreated();
    }
  }

  return (
    <section className="admin-shell">
      <div className="section-heading admin-heading">
        <div>
          <p className="beta-eyebrow">Admin</p>
          <h1>Beta ops</h1>
        </div>
        <form className="admin-token-form" onSubmit={(event) => { event.preventDefault(); onLoad(); }}>
          <label htmlFor="admin-token">Admin token</label>
          <input
            id="admin-token"
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder="Bearer token"
            type="password"
            value={adminToken}
          />
          <button className="action-link" type="submit">
            {adminStatus === "loading" ? "Loading" : "Load ops"}
          </button>
        </form>
      </div>

      {adminMessage && <p className={`form-message ${adminStatus}`}>{adminMessage}</p>}

      <section className="metric-strip admin-metrics" aria-label="Beta ops summary">
        <Metric label="Waitlist" value={metrics.waitlist || 0} />
        <Metric label="Invites" value={metrics.invites || 0} />
        <Metric label="Audits today" value={metrics.auditsToday || 0} />
        <Metric label="Expiring" value={metrics.reportsExpiringSoon || 0} />
        <Metric label="Fix requests" value={metrics.fixRequests || 0} />
      </section>

      <FixPackQueue
        adminToken={adminToken}
        emailConfigured={Boolean(metrics.emailNotificationsConfigured)}
        requests={adminData?.fixQueue || []}
        opsHealth={adminData?.opsHealth || {}}
        statusCounts={metrics.fixRequestStatuses || {}}
        onUpdated={onLoad}
      />

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Recent audits</p>
            <h2>What people are running</h2>
          </div>
          <div className="ops-table">
            {(adminData?.recentAudits || []).map((audit) => (
              <a className="ops-row" href={audit.reportPath} key={audit.id}>
                <span>{audit.targetHost || new URL(audit.url).hostname}</span>
                <span>{audit.ownerEmail || "unknown"}</span>
                <strong>{audit.score}</strong>
                <span>{audit.totalFindings} findings</span>
              </a>
            ))}
            {!adminData?.recentAudits?.length && <p className="quiet-note">Load ops to see recent audits.</p>}
          </div>
        </div>

        <div className="admin-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Invite codes</p>
            <h2>Create a beta invite</h2>
          </div>
          <form className="invite-form" onSubmit={createInvite}>
            <input
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="founder@example.com"
              required
              type="email"
              value={inviteEmail}
            />
            <input
              onChange={(event) => setInviteLabel(event.target.value)}
              placeholder="Label"
              value={inviteLabel}
            />
            <button className="action-link paid-action" type="submit">
              Create invite
            </button>
          </form>
          {inviteResult?.invite?.url && (
            <div className="invite-result">
              <strong>Invite ready</strong>
              <button type="button" onClick={() => copyText(inviteResult.invite.url)}>
                Copy invite link
              </button>
              <code>{inviteResult.invite.url}</code>
            </div>
          )}
          {inviteResult?.error && <p className="form-message error">{inviteResult.error}</p>}
          <div className="invite-list">
            {(adminData?.invites || []).slice(0, 6).map((invite) => (
              <div key={invite.id}>
                <strong>{invite.ownerEmail}</strong>
                <span>{invite.status} · {invite.usedCount}/{invite.maxUses}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Repeated issue patterns</p>
            <h2>What the product keeps finding</h2>
          </div>
          <div className="pattern-list">
            {(adminData?.issuePatterns || []).map((pattern) => (
              <div key={pattern.title}>
                <strong>{pattern.title}</strong>
                <span>{pattern.count} reports</span>
              </div>
            ))}
            {!adminData?.issuePatterns?.length && <p className="quiet-note">No issue pattern data yet.</p>}
          </div>
        </div>
        <div className="admin-panel paid-ops-panel">
          <p className="beta-eyebrow">First paid offer</p>
          <h2>{adminData?.offer?.name || "SEO Fix Pack"}</h2>
          <strong>
            {adminData?.paymentHealth?.dodo?.checkoutReady ? "Dodo checkout ready" : "Dodo checkout paused"}
          </strong>
          <p>{adminData?.offer?.description || "One proof-backed repair pass plus one rerun after fixes."}</p>
          {adminData?.paymentHealth?.dodo?.missing?.length > 0 && (
            <p className="quiet-note">Missing: {adminData.paymentHealth.dodo.missing.join(", ")}</p>
          )}
        </div>
      </section>
    </section>
  );
}

function FixPackQueue({ adminToken, emailConfigured, requests, opsHealth, statusCounts, onUpdated }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  function draftFor(request) {
    return drafts[request.id] || {
      status: request.status || "checkout_created",
      assignedTo: request.assignedTo || "",
      deliveryUrl: request.deliveryUrl || "",
      finalReportId: request.finalReportId || "",
      dueAt: request.dueAt || "",
      nextUpdateAt: request.nextUpdateAt || "",
      statusReason: request.statusReason || "",
      customerNote: request.customerNote || "",
      adminNote: request.adminNote || ""
    };
  }

  function updateDraft(id, patch) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        ...patch
      }
    }));
  }

  async function save(request) {
    setSavingId(request.id);
    setMessage("");
    const result = await patchAdminFixRequest(adminToken, request.id, draftFor(request));
    setSavingId("");
    if (!result.ok) {
      setMessage(result.error || "Could not update the Fix Pack request.");
      return;
    }
    setMessage("Fix Pack queue updated.");
    onUpdated();
  }

  return (
    <section className="admin-panel fix-queue-panel">
      <div className="section-heading queue-heading">
        <div>
          <p className="beta-eyebrow">Paid fulfillment</p>
          <h2>SEO Fix Pack queue</h2>
        </div>
        <div className="queue-summary">
          <span>Checkout {statusCounts.checkout_created || 0}</span>
          <span>Paid {statusCounts.paid || 0}</span>
          <span>In progress {statusCounts.in_progress || 0}</span>
          <span>Delivered {statusCounts.delivered || 0}</span>
          <span>Overdue {opsHealth.overdue || 0}</span>
          <span>{emailConfigured ? "Email on" : "Email config missing"}</span>
        </div>
      </div>
      {message && <p className={`form-message ${message.includes("Could") ? "error" : "success"}`}>{message}</p>}
      <div className="fix-queue-list">
        {requests.map((request) => {
          const draft = draftFor(request);
          const proposalSummary = request.repairProposalSummary || {};
          return (
            <article className={`fix-queue-card ${request.status}`} key={request.id}>
              <div className="fix-queue-main">
                <div>
                  <span className="status-pill">{request.statusLabel || statusLabel(request.status)}</span>
                  {request.isTest && <span className="status-pill test-pill">Test</span>}
                  <h3>{request.targetHost || request.targetUrl}</h3>
                  <p>{request.ownerEmail}</p>
                  <p>{request.issueCount || 0} findings · score {request.score ?? "unknown"}</p>
                  {proposalSummary.status === "ready" && (
                    <p>
                      {proposalSummary.approved || 0}/{proposalSummary.executable || 0} executable proposals approved
                      {proposalSummary.delivered ? ` · ${proposalSummary.delivered} delivered` : ""}
                    </p>
                  )}
                </div>
                <div className="queue-links">
                  <a href={request.reportPath}>Report</a>
                  <a href={request.briefPath}>Brief</a>
                  {request.checkoutUrl && <a href={request.checkoutUrl} target="_blank" rel="noreferrer">Checkout</a>}
                </div>
              </div>
              <div className="fulfillment-grid">
                <label>
                  Status
                  <select
                    onChange={(event) => updateDraft(request.id, { status: event.target.value })}
                    value={draft.status}
                  >
                    <option value="checkout_created">Checkout opened</option>
                    {request.status === "paid" && <option value="paid" disabled>Dodo paid</option>}
                    <option value="in_progress">In progress</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </label>
                <label>
                  Assigned
                  <input
                    onChange={(event) => updateDraft(request.id, { assignedTo: event.target.value })}
                    placeholder="Owner"
                    value={draft.assignedTo}
                  />
                </label>
                <label>
                  Delivery URL
                  <input
                    onChange={(event) => updateDraft(request.id, { deliveryUrl: event.target.value })}
                    placeholder="https://..."
                    value={draft.deliveryUrl}
                  />
                </label>
                <label>
                  Final rerun report ID
                  <input
                    onChange={(event) => updateDraft(request.id, { finalReportId: event.target.value })}
                    placeholder="report id"
                    value={draft.finalReportId}
                  />
                </label>
                <label>
                  Due
                  <input
                    onChange={(event) => updateDraft(request.id, { dueAt: event.target.value })}
                    type="datetime-local"
                    value={datetimeLocalValue(draft.dueAt)}
                  />
                </label>
                <label>
                  Next update
                  <input
                    onChange={(event) => updateDraft(request.id, { nextUpdateAt: event.target.value })}
                    type="datetime-local"
                    value={datetimeLocalValue(draft.nextUpdateAt)}
                  />
                </label>
                <label>
                  Customer note
                  <textarea
                    onChange={(event) => updateDraft(request.id, { customerNote: event.target.value })}
                    placeholder="Visible on customer report"
                    value={draft.customerNote}
                  />
                </label>
                <label>
                  Admin note
                  <textarea
                    onChange={(event) => updateDraft(request.id, { adminNote: event.target.value })}
                    placeholder="Internal"
                    value={draft.adminNote}
                  />
                </label>
                <label>
                  Status reason
                  <input
                    onChange={(event) => updateDraft(request.id, { statusReason: event.target.value })}
                    placeholder="Why this moved"
                    value={draft.statusReason}
                  />
                </label>
              </div>
              <div className="queue-footer">
                <div>
                  {request.paidAt && <span>Paid {formatDate(request.paidAt)}</span>}
                  {request.dueAt && <span> · Due {formatDate(request.dueAt)}</span>}
                  {request.beforeAfterSummary && <span> · {beforeAfterText(request.beforeAfterSummary)}</span>}
                  {request.lastNotificationAt && <span> · Notified {formatDate(request.lastNotificationAt)}</span>}
                  {request.notificationError && <span> · {request.notificationError}</span>}
                </div>
                <button
                  className="action-link paid-action"
                  disabled={savingId === request.id}
                  onClick={() => save(request)}
                  type="button"
                >
                  {savingId === request.id ? "Saving" : "Save"}
                </button>
              </div>
            </article>
          );
        })}
        {!requests.length && <p className="quiet-note">No Fix Pack requests yet.</p>}
      </div>
    </section>
  );
}

async function refreshSession(setIsAuthed, setOwnerEmail) {
  try {
    const response = await fetch("/api/beta/session", {
      credentials: "same-origin"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      window.sessionStorage.removeItem(BETA_SESSION_KEY);
      window.sessionStorage.removeItem(BETA_EMAIL_KEY);
      setOwnerEmail("");
      setIsAuthed(false);
      return;
    }
    window.sessionStorage.setItem(BETA_SESSION_KEY, "1");
    window.sessionStorage.setItem(BETA_EMAIL_KEY, payload.ownerEmail || "");
    setOwnerEmail(payload.ownerEmail || "");
    setIsAuthed(true);
  } catch {
    window.sessionStorage.removeItem(BETA_SESSION_KEY);
    window.sessionStorage.removeItem(BETA_EMAIL_KEY);
    setOwnerEmail("");
    setIsAuthed(false);
  }
}

async function postAccessRequest({ email, company = "", source, formStartedAt, returnTo = "" }) {
  const response = await fetch("/api/access/request", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      company,
      source,
      ...(returnTo ? { returnTo } : {}),
      ...trackingPayload(formStartedAt)
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Could not send the access link.");
  }
  return payload;
}

async function verifyAccessToken(token) {
  const response = await fetch("/api/access/verify", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Access link is expired or already used.");
  }
  return payload;
}

async function loadAccountSummary(setAccountData, setStatus, setMessage) {
  setStatus("loading");
  setMessage("Loading your workspace.");
  try {
    const response = await fetch("/api/account/summary", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error || "Could not load your workspace.");
    }
    setAccountData(payload);
    setStatus("success");
    setMessage("");
  } catch (error) {
    setStatus("error");
    setMessage(error.message || "Could not load your workspace.");
  }
}

async function loadDeveloperSummary(setDeveloperData, setStatus, setMessage) {
  setStatus("loading");
  setMessage("Loading developer API.");
  try {
    const response = await fetch("/api/developer", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error || "Could not load developer API.");
    }
    setDeveloperData(payload);
    setStatus("success");
    setMessage("");
  } catch (error) {
    setStatus("error");
    setMessage(error.message || "Could not load developer API.");
  }
}

async function postSiteClaim(host) {
  const response = await fetch("/api/sites/claim", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not create site verification.");
  }
  return payload;
}

async function postSiteVerify(claimId) {
  const response = await fetch("/api/sites/verify", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claimId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not verify site.");
  }
  return payload;
}

async function postAuditSchedule(url, options = {}) {
  const response = await fetch("/api/audit/schedules", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      intervalDays: options.intervalDays || 7,
      maxPages: options.maxPages || DEFAULT_CRAWL_PAGES
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not add monitor.");
  }
  return payload;
}

async function pauseAuditSchedule(scheduleId) {
  const response = await fetch(`/api/audit/schedules/${encodeURIComponent(scheduleId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not pause monitor.");
  }
  return payload;
}

async function postDeveloperToken() {
  const response = await fetch("/api/developer/tokens", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "Default API key" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not create API key.");
  }
  return payload;
}

async function deleteDeveloperToken(tokenId) {
  const response = await fetch(`/api/developer/tokens/${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not revoke API key.");
  }
  return payload;
}

async function postDeveloperWebhook(url) {
  const request = developerWebhookRequest(url);
  const response = await fetch(request.endpoint, request.init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not add webhook.");
  }
  return payload;
}

async function deleteDeveloperWebhook(webhookId) {
  const response = await fetch(`/api/developer/webhooks/${encodeURIComponent(webhookId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not revoke webhook.");
  }
  return payload;
}

async function loadReportBranding() {
  const response = await fetch("/api/branding", {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not load report branding.");
  }
  return payload;
}

async function saveReportBranding(branding) {
  const response = await fetch("/api/branding", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(branding)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not save report branding.");
  }
  return payload;
}

async function loadReportDomains() {
  const response = await fetch("/api/report-domains", {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not load report domains.");
  }
  return payload;
}

async function createReportDomain(domain) {
  const response = await fetch("/api/report-domains", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ domain })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not create report domain.");
  }
  return payload;
}

async function verifyReportDomain(domainId) {
  const response = await fetch(`/api/report-domains/${encodeURIComponent(domainId)}/verify`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not verify report domain.");
  }
  return payload;
}

async function revokeReportDomain(domainId) {
  const response = await fetch(`/api/report-domains/${encodeURIComponent(domainId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not remove report domain.");
  }
  return payload;
}

async function loadReportShares(reportId) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/shares`, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not load client links.");
  }
  return payload;
}

async function createReportShare(reportId, body) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/share`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not create client link.");
  }
  return payload;
}

async function revokeReportShare(shareId) {
  const response = await fetch(`/api/report-shares/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not revoke client link.");
  }
  return payload;
}

async function loadReportCollaboration(reportId) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/collaboration`, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not load repair board.");
  }
  return payload;
}

async function saveReportCollaboration(reportId, body) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/collaboration`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not save repair board.");
  }
  return payload;
}

async function loadRepairQueue(reportId) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/repair-queue`, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not load repair queue.");
  }
  return payload;
}

async function saveRepairQueue(reportId, body) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/repair-queue`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not save repair queue.");
  }
  return payload;
}

async function createRepairAction(reportId, body) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/repair-actions`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not draft agent action.");
  }
  return payload;
}

async function updateRepairAction(reportId, actionId, body) {
  const request = repairActionUpdateRequest(reportId, actionId, body);
  const response = await fetch(request.endpoint, request.init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not update agent action.");
  }
  return payload;
}

async function createTeamMember(member) {
  const response = await fetch("/api/team/members", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(member)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not add teammate.");
  }
  return payload;
}

async function revokeTeamMember(memberId) {
  const response = await fetch(`/api/team/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "Could not remove teammate.");
  }
  return payload;
}

async function loadReport(id, setReport, setStatus, setMessage, onUnauthorized) {
  setStatus("loading");
  setMessage("Loading saved report.");
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
      credentials: "same-origin"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      throw new Error(payload.error || "Could not load report.");
    }
    setReport(payload);
    setStatus("success");
    setMessage("Report loaded.");
  } catch (error) {
    setStatus("error");
    setMessage(error.message || "Could not load report.");
  }
}

async function pollAuditJob(jobId, setMessage) {
  const attempts = 80;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`/api/audit/jobs/${encodeURIComponent(jobId)}`, {
      credentials: "same-origin"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error || "Could not check audit progress.");
    }

    const job = payload.job || {};
    if (job.status === "completed") {
      setMessage("Audit complete. Loading private report.");
      return job;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "The audit failed. Try another URL.");
    }

    setMessage(
      job.status === "queued"
        ? "Audit queued. Waiting for proof collection to start."
        : "Rendering the site, crawling same-site links, and collecting proof."
    );
    await delay(Math.min(1500 + attempt * 100, 3500));
  }

  throw new Error("The audit is still running. Refresh this page in a moment.");
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchBrief(id) {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}/brief.md`, {
    credentials: "same-origin"
  });
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `seofixkit-${id}.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function requestFixQuote(reportId, selectedRepair = null) {
  try {
    const response = await fetch("/api/beta/fix-request", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixPackCheckoutBody(reportId, selectedRepair))
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      checkoutUrl: response.ok ? payload.checkoutUrl || "" : "",
      mode: payload.mode || "",
      message: payload.message || "",
      error: payload.error || "",
      selectedRepair: payload.selectedRepair || null
    };
  } catch (error) {
    return { ok: false, error: error.message || "Checkout could not open." };
  }
}

async function patchRepairProposalApproval(reportId, proposalId, body) {
  try {
    const response = await fetch(
      `/api/reports/${encodeURIComponent(reportId)}/repair-proposals/${encodeURIComponent(proposalId)}`,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      return { ok: false, error: payload.error || "Could not update repair proposal." };
    }
    return payload;
  } catch (error) {
    return { ok: false, error: error.message || "Could not update repair proposal." };
  }
}

async function loadBillingSummary(setBilling, setStatus, setMessage) {
  setStatus("loading");
  setMessage("Loading billing.");
  try {
    const response = await fetch("/api/billing/summary", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error || "Could not load billing.");
    }
    setBilling(payload);
    setStatus("success");
    setMessage("Billing loaded.");
  } catch (error) {
    setStatus("error");
    setMessage(error.message || "Could not load billing.");
  }
}

async function loadAdmin(token, setAdminData, setAdminStatus, setAdminMessage, onSessionReady = null) {
  setAdminStatus("loading");
  setAdminMessage("");
  try {
    if (token) {
      const session = await createAdminSession(token);
      if (!session.ok) throw new Error(session.error || "Could not unlock admin session.");
      onSessionReady?.();
    }
    const response = await fetch("/admin/summary", {
      credentials: "same-origin",
      headers: adminRequestHeaders("")
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || "Could not load ops.");
    setAdminData(payload);
    setAdminStatus("success");
    setAdminMessage("Ops loaded.");
  } catch (error) {
    setAdminStatus("error");
    setAdminMessage(error.message || "Could not load ops.");
  }
}

async function createAdminSession(token) {
  try {
    const response = await fetch("/admin/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) return { ok: false, error: payload.error || "Could not unlock admin session." };
    return payload;
  } catch (error) {
    return { ok: false, error: error.message || "Could not unlock admin session." };
  }
}

async function postAdminInvite(token, body) {
  try {
    const response = await fetch("/admin/invites", {
      method: "POST",
      credentials: "same-origin",
      headers: adminRequestHeaders(token, true),
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) return { ok: false, error: payload.error || "Could not create invite." };
    return payload;
  } catch (error) {
    return { ok: false, error: error.message || "Could not create invite." };
  }
}

async function patchAdminFixRequest(token, id, body) {
  try {
    const response = await fetch(`/admin/fix-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: adminRequestHeaders(token, true),
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      return { ok: false, error: payload.error || "Could not update Fix Pack request." };
    }
    return payload;
  } catch (error) {
    return { ok: false, error: error.message || "Could not update Fix Pack request." };
  }
}

function adminRequestHeaders(token, json = false) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json) headers["content-type"] = "application/json";
  return headers;
}

function reportIdFromPath() {
  const match = window.location.pathname.match(/^\/beta\/reports\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function copyText(value) {
  if (!value) return;
  navigator.clipboard?.writeText(value);
}

function trackingPayload(formStartedAt) {
  const params = new URLSearchParams(window.location.search);
  return {
    landingPath: `${window.location.pathname}${window.location.search}` || "/",
    timeToSubmitMs: Date.now() - formStartedAt,
    utm: {
      source: params.get("utm_source") || "",
      medium: params.get("utm_medium") || "",
      campaign: params.get("utm_campaign") || "",
      term: params.get("utm_term") || "",
      content: params.get("utm_content") || ""
    }
  };
}

function LogoMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      fill="none"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="mark-tile" height="48" rx="10" width="48" />
      <path
        className="mark-ring"
        d="M20.5 29.5a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
      />
      <path className="mark-handle" d="m27.2 27.2 8 8" />
      <path className="mark-check" d="m16.2 20.8 3.1 3.1 6.2-7.1" />
      <path className="mark-receipt" d="M12 34.5h13.5M12 39h22" />
    </svg>
  );
}
