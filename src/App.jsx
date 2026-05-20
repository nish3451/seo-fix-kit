import { useEffect, useMemo, useState } from "react";

const BETA_PASSWORD_KEY = "seofixkit_beta_password";

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
  const [password, setPassword] = useState(
    () => window.sessionStorage.getItem(BETA_PASSWORD_KEY) || ""
  );
  const [loginPassword, setLoginPassword] = useState(password);
  const [isAuthed, setIsAuthed] = useState(Boolean(password));
  const [loginStatus, setLoginStatus] = useState("idle");
  const [loginMessage, setLoginMessage] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://aiconverter.app/");
  const [auditStatus, setAuditStatus] = useState(reportId ? "loading" : "idle");
  const [auditMessage, setAuditMessage] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!isAuthed || !reportId) return;
    loadReport(reportId, password, setReport, setAuditStatus, setAuditMessage, () => {
      setIsAuthed(false);
      window.sessionStorage.removeItem(BETA_PASSWORD_KEY);
    });
  }, [isAuthed, password, reportId]);

  async function login(event) {
    event.preventDefault();
    setLoginStatus("submitting");
    setLoginMessage("");

    try {
      const response = await fetch("/api/beta/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: loginPassword })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Private beta password required.");
      }
      window.sessionStorage.setItem(BETA_PASSWORD_KEY, loginPassword);
      setPassword(loginPassword);
      setIsAuthed(true);
      setLoginStatus("success");
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
        headers: {
          "content-type": "application/json",
          "x-beta-password": password
        },
        body: JSON.stringify({ url: targetUrl, maxPages: 4 })
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
      if (error.message.toLowerCase().includes("password")) {
        setIsAuthed(false);
        window.sessionStorage.removeItem(BETA_PASSWORD_KEY);
      }
      setAuditStatus("error");
      setAuditMessage(error.message || "The audit failed. Try another URL.");
    }
  }

  function lock() {
    window.sessionStorage.removeItem(BETA_PASSWORD_KEY);
    setPassword("");
    setLoginPassword("");
    setIsAuthed(false);
    setReport(null);
    window.history.replaceState(null, "", "/beta");
  }

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

      <section className="beta-hero" aria-labelledby="beta-workspace-title">
        <div>
          <p className="beta-eyebrow">Audit workspace</p>
          <h1 id="beta-workspace-title">Find the SEO problem. Prove it. Generate the fix.</h1>
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
          <ReportView report={report} password={password} />
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

function ReportView({ report, password }) {
  const issues = useMemo(
    () => (report.findings || []).filter((finding) => finding.severity !== "good"),
    [report]
  );
  const guarded = useMemo(
    () => (report.findings || []).filter((finding) => finding.severity === "good"),
    [report]
  );
  const topFixes = report.repairPlan || [];
  const shareUrl = report.reportUrl || `${window.location.origin}${report.reportPath || window.location.pathname}`;

  return (
    <div className="report-layout">
      <section className="score-panel">
        <div>
          <p className="beta-eyebrow">Saved report</p>
          <h2>{new URL(report.url).hostname}</h2>
          <p>{report.url}</p>
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
        <Metric label="Pages" value={report.summary?.pagesScanned || 0} />
        <Metric label="Critical" value={report.summary?.critical || 0} />
        <Metric label="Warnings" value={report.summary?.warnings || 0} />
        <Metric label="Proof guards" value={report.summary?.guardedFalsePositives || 0} />
      </section>

      <section className="report-actions">
        <CopyButton label="Copy report URL" value={shareUrl} />
        <CopyButton label="Copy developer brief" value={report.repairBrief || ""} />
        <a
          className="action-link"
          href={`/api/reports/${report.id}/brief.md`}
          onClick={(event) => {
            event.preventDefault();
            fetchBrief(report.id, password);
          }}
        >
          Download brief
        </a>
      </section>

      <section className="findings-section">
        <div className="section-heading">
          <p className="beta-eyebrow">What is wrong</p>
          <h2>{issues.length ? "Fix these first" : "No priority repairs found"}</h2>
        </div>
        <div className="finding-list">
          {(issues.length ? issues : guarded).slice(0, 8).map((finding) => (
            <FindingItem key={finding.id} finding={finding} />
          ))}
        </div>
      </section>

      <section className="fix-section">
        <div className="section-heading">
          <p className="beta-eyebrow">Generate the fix</p>
          <h2>Developer repair plan</h2>
        </div>
        <div className="fix-list">
          {topFixes.slice(0, 6).map((fix) => (
            <FixItem key={`${fix.priority}-${fix.title}`} fix={fix} />
          ))}
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

function FindingItem({ finding }) {
  return (
    <article className={`finding-item ${finding.severity}`}>
      <div>
        <span>{finding.severity}</span>
        <h3>{finding.title}</h3>
      </div>
      <p>{finding.why}</p>
      <dl>
        <div>
          <dt>Proof</dt>
          <dd>{finding.evidence}</dd>
        </div>
        <div>
          <dt>Fix</dt>
          <dd>{finding.fix}</dd>
        </div>
      </dl>
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
      <p>{fix.fix}</p>
      <p className="proof-line">Proof: {fix.proof}</p>
      <p className="proof-line">Acceptance: {fix.acceptance}</p>
      {fix.snippet && <CodeBlock code={fix.snippet} />}
    </article>
  );
}

function PageProof({ page }) {
  const facts = page.rendered || {};
  return (
    <article className="page-proof">
      <p className="beta-eyebrow">Rendered proof</p>
      <h3>{page.url}</h3>
      <dl>
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
          <dd>{facts.wordCount ?? "unknown"}</dd>
        </div>
        <div>
          <dt>Internal links</dt>
          <dd>{facts.internalLinks?.length ?? 0}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{facts.schemaTypes?.join(", ") || "none"}</dd>
        </div>
      </dl>
    </article>
  );
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

async function loadReport(id, password, setReport, setStatus, setMessage, onUnauthorized) {
  setStatus("loading");
  setMessage("Loading saved report.");
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
      headers: { "x-beta-password": password }
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

async function fetchBrief(id, password) {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}/brief.md`, {
    headers: { "x-beta-password": password }
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
