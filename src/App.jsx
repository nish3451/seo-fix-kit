import { useEffect, useMemo, useState } from "react";

const BETA_SESSION_KEY = "seofixkit_beta_unlocked";
const BETA_EMAIL_KEY = "seofixkit_beta_email";
const ADMIN_TOKEN_KEY = "seofixkit_admin_token";

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
  const [formStartedAt] = useState(() => Date.now());

  async function joinWaitlist(event) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          company,
          source: "locked-homepage",
          ...trackingPayload(formStartedAt)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not join the waitlist.");
      }
      setStatus("success");
      setMessage("You're on the list. We'll email you when private beta opens.");
      setEmail("");
      setCompany("");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not join the waitlist.");
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
        <span className="launch-status">Coming soon</span>
      </header>

      <section className="hero-copy" aria-labelledby="page-title">
        <p className="kicker">Private beta</p>
        <h1 id="page-title">SEO Fix Kit</h1>
        <p className="coming-soon">Coming soon.</p>
        <p className="hero-text">
          Evidence-backed SEO audits are locked while we prep the private beta.
          Join the waitlist and we’ll email you when early access opens.
        </p>

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
              {status === "submitting" ? "Joining" : "Join waitlist"}
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
            {message || "We’ll only use this email for SEO Fix Kit outreach."}
          </p>
        </form>

        <div className="report-preview" aria-label="SEO Fix Kit report preview">
          <div>
            <strong>Issue</strong>
            <span>Static crawler says the homepage has no H1.</span>
          </div>
          <div>
            <strong>Proof</strong>
            <span>Rendered DOM shows “AI Converter for private file conversion.”</span>
          </div>
          <div>
            <strong>Fix</strong>
            <span>Do nothing. The finding is a false positive.</span>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <span>Audit it. Prove it. Fix it.</span>
        <a href="/privacy">Privacy</a>
      </footer>
    </main>
  );
}

function BetaApp() {
  const reportId = reportIdFromPath();
  const isAdminRoute = window.location.pathname === "/beta/admin";
  const inviteParams = new URLSearchParams(window.location.search);
  const [ownerEmail, setOwnerEmail] = useState(
    () => inviteParams.get("email") || window.sessionStorage.getItem(BETA_EMAIL_KEY) || ""
  );
  const [loginEmail, setLoginEmail] = useState(ownerEmail || inviteParams.get("email") || "");
  const [inviteCode, setInviteCode] = useState(inviteParams.get("invite") || "");
  const [isAuthed, setIsAuthed] = useState(
    () => window.sessionStorage.getItem(BETA_SESSION_KEY) === "1"
  );
  const [loginStatus, setLoginStatus] = useState("idle");
  const [loginMessage, setLoginMessage] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://aiconverter.app/");
  const [auditStatus, setAuditStatus] = useState(reportId ? "loading" : "idle");
  const [auditMessage, setAuditMessage] = useState("");
  const [report, setReport] = useState(null);
  const [adminToken, setAdminToken] = useState(() => window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || "");
  const [adminData, setAdminData] = useState(null);
  const [adminStatus, setAdminStatus] = useState("idle");
  const [adminMessage, setAdminMessage] = useState("");

  useEffect(() => {
    if (window.sessionStorage.getItem(BETA_SESSION_KEY) === "1" || reportId || isAdminRoute) {
      refreshSession(setIsAuthed, setOwnerEmail);
    }
  }, [reportId, isAdminRoute]);

  useEffect(() => {
    if (!isAuthed || !reportId) return;
    loadReport(reportId, setReport, setAuditStatus, setAuditMessage, () => {
      setIsAuthed(false);
      window.sessionStorage.removeItem(BETA_SESSION_KEY);
      window.sessionStorage.removeItem(BETA_EMAIL_KEY);
    });
  }, [isAuthed, reportId]);

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

  async function runAudit(event) {
    event.preventDefault();
    setAuditStatus("loading");
    setAuditMessage("Rendering the site, crawling same-site links, and collecting proof.");
    setReport(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ url: targetUrl, maxPages: 10 })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "The audit failed.");
      }
      setReport(payload);
      setAuditStatus("success");
      setAuditMessage("Audit saved. Private report URL is ready.");
      if (payload.reportPath) {
        window.history.replaceState(null, "", payload.reportPath);
      }
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
    window.history.replaceState(null, "", "/beta");
  }

  const showingReport = Boolean(report && auditStatus === "success");

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
              {loginMessage || "Public access stays locked until beta opens."}
            </p>
            <a className="gate-link" href="/">
              Need access? Join the waitlist
            </a>
          </form>
        </section>
      </main>
    );
  }

  if (isAdminRoute) {
    return (
      <main className="beta-shell">
        <BetaTop onLock={lock} showOps />
        <AdminDashboard
          adminData={adminData}
          adminMessage={adminMessage}
          adminStatus={adminStatus}
          adminToken={adminToken}
          onLoad={() => loadAdmin(adminToken, setAdminData, setAdminStatus, setAdminMessage)}
          onTokenChange={(value) => {
            setAdminToken(value);
            window.sessionStorage.setItem(ADMIN_TOKEN_KEY, value);
          }}
          onInviteCreated={() => loadAdmin(adminToken, setAdminData, setAdminStatus, setAdminMessage)}
        />
      </main>
    );
  }

  return (
    <main className="beta-shell">
      <BetaTop onLock={lock} showOps />

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
        </form>
      </section>

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

function BetaTop({ onLock, showOps = false }) {
  return (
    <header className="beta-top">
      <a className="brand-lockup" href="/" aria-label="SEO Fix Kit home">
        <LogoMark />
        <span>SEO Fix Kit</span>
      </a>
      <nav>
        <a href="/">Public page</a>
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

function EmptyAuditState() {
  return (
    <div className="empty-state">
      <p className="beta-eyebrow">Ready</p>
      <h2>Start with a homepage or core product page.</h2>
      <p>
        The report will crawl a few same-site pages, compare raw HTML against
        the rendered page, and turn findings into a repair brief.
      </p>
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

      <section className="metric-strip" aria-label="Audit summary">
        <Metric label="Pages" value={`${report.summary?.pagesScanned || 0}/${report.summary?.maxPages || 10}`} />
        <Metric label="Critical" value={report.summary?.critical || 0} />
        <Metric label="Warnings" value={report.summary?.warnings || 0} />
        <Metric label="Notices" value={report.summary?.notices || 0} />
        <Metric label="Proof guards" value={report.summary?.guardedFalsePositives || 0} />
      </section>

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
        <FixQuoteButton report={report} hasPriorityFixes={hasPriorityFixes} />
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
      </section>

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

      <section className="fix-section">
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

function Metric({ label, value }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
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
        </dl>
      )}
    </section>
  );
}

function checkoutMessage(status, checkoutReturned) {
  if (status === "paid") return "Payment is confirmed. Your repair pass is queued.";
  if (status === "in_progress") return "The repair pass is in progress. Delivery notes will appear here.";
  if (status === "delivered") return "Delivery is ready. Use the delivery and rerun links below.";
  if (status === "payment_failed") return "Payment did not complete. You can reopen checkout from this report.";
  if (checkoutReturned) return "Checkout returned. Payment confirmation can take a moment after Dodo finishes processing.";
  return "Checkout has been opened for this report.";
}

function statusLabel(status) {
  const labels = {
    new: "Request saved",
    checkout_created: "Checkout opened",
    paid: "Payment confirmed",
    in_progress: "Repair in progress",
    delivered: "Delivered",
    payment_failed: "Payment failed"
  };
  return labels[status] || labels.new;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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
          <dt>Schema</dt>
          <dd>{facts.schemaTypes?.join(", ") || "none"}</dd>
        </div>
      </dl>
    </article>
  );
}

function PageSummaryTable({ pages }) {
  return (
    <div className="page-table" role="table" aria-label="Crawled pages">
      <div className="page-table-row page-table-head" role="row">
        <span>Page</span>
        <span>Score</span>
        <span>Issues</span>
        <span>H1</span>
        <span>Words</span>
        <span>Links</span>
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
          <span>{page.schemaTypes?.join(", ") || "none"}</span>
        </div>
      ))}
    </div>
  );
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
      score: Math.max(
        0,
        100 -
          pageFindings.reduce((sum, finding) => {
            if (finding.severity === "critical") return sum + 12;
            if (finding.severity === "warning") return sum + 5;
            if (finding.severity === "notice") return sum + 1;
            return sum;
          }, 0)
      ),
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

function FixQuoteButton({ report, hasPriorityFixes }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  if (!hasPriorityFixes) {
    return <button className="action-link" type="button" onClick={() => copyText(report.reportUrl || "")}>Monitor this site</button>;
  }

  return (
    <span className="checkout-action">
      <button
        className="action-link paid-action"
        disabled={status === "submitting" || status === "success"}
        onClick={async () => {
          setStatus("submitting");
          setMessage("");
          const result = await requestFixQuote(report.id);
          if (result.checkoutUrl) {
            setStatus("success");
            setMessage("Opening secure checkout.");
            window.location.assign(result.checkoutUrl);
            return;
          }
          setStatus(result.ok ? "success" : "error");
          setMessage(result.message || result.error || (result.ok ? "Request received." : "Checkout could not open."));
        }}
        type="button"
      >
        {status === "success" ? "Checkout ready" : status === "submitting" ? "Opening checkout" : "Get this fixed"}
      </button>
      {message && <small className={`checkout-message ${status}`}>{message}</small>}
    </span>
  );
}

function FixQuotePanel({ report, hasPriorityFixes }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  return (
    <aside className="paid-panel">
      <div>
        <p className="beta-eyebrow">{hasPriorityFixes ? "SEO Fix Pack" : "Monitoring"}</p>
        <h3>{hasPriorityFixes ? "Open checkout for the paid repair pass." : "No paid fix needed from this scan."}</h3>
        <p>
          {hasPriorityFixes
            ? "One proof-backed repair pass for this report, then one rerun after fixes. No ranking promises, just the proven repair queue."
            : "Keep the private report and rerun after meaningful content or template changes."}
        </p>
      </div>
      {hasPriorityFixes ? (
        <span className="checkout-action">
          <button
            className="action-link paid-action"
            disabled={status === "submitting" || status === "success"}
            onClick={async () => {
              setStatus("submitting");
              setMessage("");
              const result = await requestFixQuote(report.id);
              if (result.checkoutUrl) {
                setStatus("success");
                setMessage("Opening secure checkout.");
                window.location.assign(result.checkoutUrl);
                return;
              }
              setStatus(result.ok ? "success" : "error");
              setMessage(result.message || result.error || (result.ok ? "Request received." : "Checkout could not open."));
            }}
            type="button"
          >
            {status === "success" ? "Checkout ready" : status === "submitting" ? "Opening checkout" : "Get this fixed"}
          </button>
          {message && <small className={`checkout-message ${status}`}>{message}</small>}
        </span>
      ) : (
        <CopyButton label="Copy report URL" value={report.reportUrl || ""} />
      )}
    </aside>
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
          <strong>{adminData?.offer?.priceLabel || "$99 beta"}</strong>
          <p>{adminData?.offer?.description || "One proof-backed repair pass plus one rerun after fixes."}</p>
        </div>
      </section>
    </section>
  );
}

function FixPackQueue({ adminToken, emailConfigured, requests, statusCounts, onUpdated }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  function draftFor(request) {
    return drafts[request.id] || {
      status: request.status || "paid",
      assignedTo: request.assignedTo || "",
      deliveryUrl: request.deliveryUrl || "",
      finalReportId: request.finalReportId || "",
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
          <span>{emailConfigured ? "Email on" : "Email config missing"}</span>
        </div>
      </div>
      {message && <p className={`form-message ${message.includes("Could") ? "error" : "success"}`}>{message}</p>}
      <div className="fix-queue-list">
        {requests.map((request) => {
          const draft = draftFor(request);
          return (
            <article className={`fix-queue-card ${request.status}`} key={request.id}>
              <div className="fix-queue-main">
                <div>
                  <span className="status-pill">{request.statusLabel || statusLabel(request.status)}</span>
                  <h3>{request.targetHost || request.targetUrl}</h3>
                  <p>{request.ownerEmail}</p>
                  <p>{request.issueCount || 0} findings · score {request.score ?? "unknown"}</p>
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
                    <option value="paid">Paid</option>
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
              </div>
              <div className="queue-footer">
                <div>
                  {request.paidAt && <span>Paid {formatDate(request.paidAt)}</span>}
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

async function requestFixQuote(reportId) {
  try {
    const response = await fetch("/api/beta/fix-request", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId })
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      checkoutUrl: response.ok ? payload.checkoutUrl || "" : "",
      mode: payload.mode || "",
      message: payload.message || "",
      error: payload.error || ""
    };
  } catch (error) {
    return { ok: false, error: error.message || "Checkout could not open." };
  }
}

async function loadAdmin(token, setAdminData, setAdminStatus, setAdminMessage) {
  setAdminStatus("loading");
  setAdminMessage("");
  try {
    const response = await fetch("/admin/summary", {
      credentials: "same-origin",
      headers: { authorization: `Bearer ${token}` }
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

async function postAdminInvite(token, body) {
  try {
    const response = await fetch("/admin/invites", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
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
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
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
