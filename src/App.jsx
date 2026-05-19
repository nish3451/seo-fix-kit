import { useMemo, useState } from "react";

const sampleUrl = "https://aiconverter.app/";

const severityRank = {
  critical: 0,
  warning: 1,
  notice: 2,
  good: 3
};

const filterLabels = {
  all: "All",
  critical: "Critical",
  warning: "Warnings",
  notice: "Notes",
  good: "Passed"
};

export default function App() {
  const [url, setUrl] = useState(sampleUrl);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [copiedKey, setCopiedKey] = useState("");

  async function runAudit(event) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setCopiedKey("");

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, maxPages: 4 })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "The audit failed.");
      }
      setReport(payload);
    } catch (err) {
      setError(err.message || "The audit failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runDemoAudit() {
    setLoading(true);
    setError("");
    setCopiedKey("");

    try {
      const response = await fetch("/api/demo-audit");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "The demo audit failed.");
      }
      setUrl(payload.url);
      setReport(payload);
    } catch (err) {
      setError(err.message || "The demo audit failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copySnippet(key, value) {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          fallbackCopy(value);
        }
      } else {
        fallbackCopy(value);
      }
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1500);
    } catch {
      setCopiedKey("");
    }
  }

  const findings = useMemo(() => {
    if (!report?.findings) return [];
    return [...report.findings]
      .filter(
        (finding) =>
          selectedSeverity === "all" || finding.severity === selectedSeverity
      )
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  }, [report, selectedSeverity]);

  const firstPage = report?.pages?.[0];
  const hostname = report ? new URL(report.url).hostname : "";

  return (
    <main className="app-shell">
      <aside className="left-rail">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span>S</span>
            <span>F</span>
            <span>K</span>
          </span>
          <div>
            <p>SEO Fix Kit</p>
            <span>Audit it. Prove it. Fix it.</span>
          </div>
        </div>

        <form className="audit-form" onSubmit={runAudit}>
          <label htmlFor="url">Website URL</label>
          <div className="input-row">
            <input
              id="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              type="url"
            />
            <button disabled={loading} type="submit">
              {loading ? "Checking" : "Run audit"}
            </button>
          </div>
          <div className="quick-actions">
            <button
              className="text-button"
              disabled={loading}
              onClick={() => setUrl(sampleUrl)}
              type="button"
            >
              Use sample
            </button>
            <button
              className="text-button"
              disabled={loading}
              onClick={runDemoAudit}
              type="button"
            >
              Show false-positive trap
            </button>
          </div>
        </form>

        <section className="promise-block">
          <h1>SEO fixes with receipts.</h1>
          <p>
            A repair report that renders the page, shows the evidence, and gives
            you copy-paste fixes.
          </p>
        </section>

        <section className="receipt-strip" aria-label="Audit path">
          <span>Scan</span>
          <span>Proof</span>
          <span>Fix pack</span>
        </section>

        {loading && <LoadingCard />}
        {error && <div className="error-card">{error}</div>}
        {report && <SummaryPanel report={report} firstPage={firstPage} />}
      </aside>

      <section className="results-area">
        {!report && !loading && (
          <EmptyState onDemo={runDemoAudit} onRun={runAudit} />
        )}

        {report && (
          <>
            <header className="results-header">
              <div className="report-title">
                <span>Repair report</span>
                <h2>{hostname}</h2>
                <p>
                  {report.summary.pagesScanned} pages scanned in{" "}
                  {Math.round(report.durationMs / 100) / 10}s
                </p>
              </div>
              <div className="score-card">
                <strong>{report.score}</strong>
                <span>score</span>
              </div>
            </header>

            <section className="signal-bar" aria-label="Report summary">
              <Signal
                label="Critical"
                tone="critical"
                value={report.summary.critical}
              />
              <Signal
                label="Warnings"
                tone="warning"
                value={report.summary.warnings}
              />
              <Signal
                label="False positives avoided"
                tone="good"
                value={report.summary.guardedFalsePositives}
              />
              <Signal
                label="Fixes ready"
                tone="neutral"
                value={report.fixPack.length}
              />
            </section>

            <div className="filter-row" aria-label="Filter findings">
              {Object.keys(filterLabels).map((item) => (
                <button
                  className={selectedSeverity === item ? "active" : ""}
                  key={item}
                  onClick={() => setSelectedSeverity(item)}
                  type="button"
                >
                  {filterLabels[item]}
                </button>
              ))}
            </div>

            <section className="proof-grid">
              <ProofMetric
                label="Rendered words"
                value={firstPage?.rendered?.wordCount ?? "-"}
                detail="Visible content after JavaScript"
              />
              <ProofMetric
                label="Rendered H1s"
                value={firstPage?.rendered?.h1s?.length ?? "-"}
                detail={firstPage?.rendered?.h1s?.[0] || "None found"}
              />
              <ProofMetric
                label="Internal links"
                value={firstPage?.rendered?.internalLinks?.length ?? "-"}
                detail="Crawlable site paths"
              />
              <ProofMetric
                label="Schema types"
                value={firstPage?.rendered?.schemaTypes?.length ?? "-"}
                detail={
                  firstPage?.rendered?.schemaTypes?.join(", ") || "None found"
                }
              />
            </section>

            <section className="findings-list" aria-label="Findings">
              {findings.map((finding) => (
                <FindingCard
                  copiedKey={copiedKey}
                  finding={finding}
                  key={finding.id}
                  onCopy={copySnippet}
                />
              ))}
              {!findings.length && (
                <div className="clear-state">
                  No findings in this filter.
                </div>
              )}
            </section>

            <section className="fix-pack">
              <div className="section-heading">
                <span>Starter kit</span>
                <h3>Copy-paste fixes</h3>
              </div>
              {report.fixPack.map((fix) => (
                <CodeBlock
                  body={fix.body}
                  copied={copiedKey === fix.title}
                  key={fix.title}
                  onCopy={() => copySnippet(fix.title, fix.snippet)}
                  title={fix.title}
                  value={fix.snippet}
                />
              ))}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function fallbackCopy(value) {
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.left = "-999px";
  document.body.append(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

function EmptyState({ onDemo, onRun }) {
  return (
    <div className="empty-state">
      <div className="empty-copy">
        <h2>A repair report you can ship.</h2>
        <p>
          Start with any public URL. The kit returns the issue, the proof, and a
          clean first fix.
        </p>
        <div className="empty-actions">
          <button onClick={onRun} type="button">
            Audit sample site
          </button>
          <button className="secondary-action" onClick={onDemo} type="button">
            Run demo
          </button>
        </div>
      </div>
      <div className="preview-board" aria-hidden="true">
        <div className="preview-line good" />
        <div className="preview-row">
          <span>H1 exists after render</span>
          <strong>Guarded</strong>
        </div>
        <div className="preview-row">
          <span>Internal links found</span>
          <strong>Guarded</strong>
        </div>
        <div className="preview-row warning">
          <span>Social image incomplete</span>
          <strong>Fix</strong>
        </div>
        <pre>{'<meta property="og:image" content="/og.png" />'}</pre>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="loading-card">
      <div className="spinner" />
      <div>
        <strong>Rendering pages</strong>
        <p>Checking HTML, browser DOM, links, schema, and metadata.</p>
      </div>
    </div>
  );
}

function SummaryPanel({ report, firstPage }) {
  return (
    <div className="summary-panel">
      <div className="summary-top">
        <strong>{report.score}/100</strong>
        <span>{report.summary.totalFindings} findings</span>
      </div>
      <dl>
        <div>
          <dt>Critical</dt>
          <dd>{report.summary.critical}</dd>
        </div>
        <div>
          <dt>Warnings</dt>
          <dd>{report.summary.warnings}</dd>
        </div>
        <div>
          <dt>Guarded</dt>
          <dd>{report.summary.guardedFalsePositives}</dd>
        </div>
      </dl>
      <div className="source-compare">
        <p>Static vs rendered</p>
        <div>
          <span>Static words: {firstPage?.static?.wordCount ?? "-"}</span>
          <span>Rendered words: {firstPage?.rendered?.wordCount ?? "-"}</span>
        </div>
      </div>
    </div>
  );
}

function Signal({ label, tone, value }) {
  return (
    <article className={`signal ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ProofMetric({ label, value, detail }) {
  return (
    <article className="proof-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function FindingCard({ copiedKey, finding, onCopy }) {
  return (
    <article className={`finding-card ${finding.severity}`}>
      <div className="finding-top">
        <div>
          <span>{finding.severity}</span>
          <h3>{finding.title}</h3>
        </div>
        <p>{finding.confidence}</p>
      </div>
      <div className="finding-copy">
        <p>
          <strong>Why it matters:</strong> {finding.why}
        </p>
        <p>
          <strong>Proof:</strong> {finding.evidence}
        </p>
        <p>
          <strong>Fix:</strong> {finding.fix}
        </p>
      </div>
      <div className="finding-actions">
        {finding.source && (
          <a href={finding.source} rel="noreferrer" target="_blank">
            Source guidance
          </a>
        )}
      </div>
      {finding.snippet && (
        <CodeBlock
          copied={copiedKey === finding.id}
          onCopy={() => onCopy(finding.id, finding.snippet)}
          title="Exact fix"
          value={finding.snippet}
        />
      )}
    </article>
  );
}

function CodeBlock({ body, copied, onCopy, title, value }) {
  return (
    <div className="code-block">
      <div className="code-heading">
        <div>
          <strong>{title}</strong>
          {body && <p>{body}</p>}
        </div>
        {onCopy && (
          <button onClick={onCopy} type="button">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}
