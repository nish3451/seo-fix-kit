import { useEffect, useMemo, useState } from "react";

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
  const [ownerEmail, setOwnerEmail] = useState(
    () => window.sessionStorage.getItem(BETA_EMAIL_KEY) || ""
  );
  const [loginEmail, setLoginEmail] = useState(ownerEmail);
  const [loginPassword, setLoginPassword] = useState("");
  const [isAuthed, setIsAuthed] = useState(
    () => window.sessionStorage.getItem(BETA_SESSION_KEY) === "1"
  );
  const [loginStatus, setLoginStatus] = useState("idle");
  const [loginMessage, setLoginMessage] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://aiconverter.app/");
  const [auditStatus, setAuditStatus] = useState(reportId ? "loading" : "idle");
  const [auditMessage, setAuditMessage] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (window.sessionStorage.getItem(BETA_SESSION_KEY) === "1" || reportId) {
      refreshSession(setIsAuthed, setOwnerEmail);
    }
  }, [reportId]);

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
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Private beta password required.");
      }
      window.sessionStorage.setItem(BETA_SESSION_KEY, "1");
      window.sessionStorage.setItem(BETA_EMAIL_KEY, payload.ownerEmail || loginEmail);
      setOwnerEmail(payload.ownerEmail || loginEmail);
      setIsAuthed(true);
      setLoginStatus("success");
      setLoginPassword("");
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
      if (error.message.toLowerCase().includes("session") || error.message.toLowerCase().includes("password")) {
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
    setLoginPassword("");
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
          <h1 id="beta-title">Unlock SEO Fix Kit</h1>
          <p>
            Run evidence-backed audits, save private reports, and generate the
            repair brief a developer can ship from.
          </p>
          <form className="gate-form" onSubmit={login}>
            <label htmlFor="beta-email">Email</label>
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
            <label htmlFor="beta-password">Password</label>
            <div className="gate-row">
              <input
                autoComplete="current-password"
                id="beta-password"
                onChange={(event) => setLoginPassword(event.target.value)}
                required
                type="password"
                value={loginPassword}
              />
              <button disabled={loginStatus === "submitting"} type="submit">
                {loginStatus === "submitting" ? "Checking" : "Enter"}
              </button>
            </div>
            <p className={`form-message ${loginStatus}`} aria-live="polite">
              {loginMessage || "Public access stays locked until beta opens."}
            </p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="beta-shell">
      <BetaTop onLock={lock} />

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

function BetaTop({ onLock }) {
  return (
    <header className="beta-top">
      <a className="brand-lockup" href="/" aria-label="SEO Fix Kit home">
        <LogoMark />
        <span>SEO Fix Kit</span>
      </a>
      <nav>
        <a href="/">Public page</a>
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
