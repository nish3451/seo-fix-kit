import { useMemo, useState } from "react";

const sampleUrl = "https://aiconverter.app/";

const severityRank = {
  critical: 0,
  warning: 1,
  notice: 2,
  good: 3
};

export default function App() {
  const [url, setUrl] = useState(sampleUrl);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("all");

  async function runAudit(event) {
    event?.preventDefault();
    setLoading(true);
    setError("");
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

  return (
    <main className="app-shell">
      <section className="left-rail">
        <div className="brand">
          <span className="brand-mark">P</span>
          <div>
            <p>Proof SEO</p>
            <span>Verified repair reports</span>
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
              {loading ? "Auditing" : "Audit"}
            </button>
          </div>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => setUrl(sampleUrl)}
            type="button"
          >
            Use AI Converter sample
          </button>
          <button
            className="text-button"
            disabled={loading}
            onClick={runDemoAudit}
            type="button"
          >
            Run false-positive demo
          </button>
        </form>

        <div className="promise-block">
          <h1>Find the issue. Prove it. Generate the fix.</h1>
          <p>
            This scanner renders the page before judging it, then separates real
            SEO repairs from crawler false positives.
          </p>
        </div>

        {loading && (
          <div className="loading-card">
            <div className="spinner" />
            <div>
              <strong>Rendering pages</strong>
              <p>
                Checking static HTML, browser-rendered DOM, links, schema, and
                fixable metadata.
              </p>
            </div>
          </div>
        )}

        {error && <div className="error-card">{error}</div>}

        {report && <SummaryPanel report={report} firstPage={firstPage} />}
      </section>

      <section className="results-area">
        {!report && !loading && (
          <EmptyState onDemo={runDemoAudit} onRun={runAudit} />
        )}

        {report && (
          <>
            <div className="results-header">
              <div>
                <p className="eyebrow">Audit report</p>
                <h2>{new URL(report.url).hostname}</h2>
                <span>
                  {report.summary.pagesScanned} pages scanned in{" "}
                  {Math.round(report.durationMs / 100) / 10}s
                </span>
              </div>
              <div className="score-card">
                <span>{report.score}</span>
                <p>repair score</p>
              </div>
            </div>

            <div className="filter-row" aria-label="Filter findings">
              {["all", "critical", "warning", "notice", "good"].map((item) => (
                <button
                  className={selectedSeverity === item ? "active" : ""}
                  key={item}
                  onClick={() => setSelectedSeverity(item)}
                  type="button"
                >
                  {item}
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
                detail="Normal anchor links"
              />
              <ProofMetric
                label="Schema types"
                value={firstPage?.rendered?.schemaTypes?.length ?? "-"}
                detail={
                  firstPage?.rendered?.schemaTypes?.join(", ") || "None found"
                }
              />
            </section>

            <section className="findings-list">
              {findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </section>

            <section className="fix-pack">
              <div>
                <p className="eyebrow">Reusable fixes</p>
                <h3>Starter code pack</h3>
              </div>
              {report.fixPack.map((fix) => (
                <CodeBlock
                  body={fix.body}
                  key={fix.title}
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

function EmptyState({ onDemo, onRun }) {
  return (
    <div className="empty-state">
      <p className="eyebrow">Working MVP</p>
      <h2>No false-positive SEO homework.</h2>
      <p>
        Run the sample to see the core wedge: rendered-page facts, guarded
        crawler mistakes, and exact repair snippets.
      </p>
      <div className="empty-actions">
        <button onClick={onDemo} type="button">
          Run false-positive demo
        </button>
        <button className="secondary-action" onClick={onRun} type="button">
          Audit sample site
        </button>
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
          <dt>False positives guarded</dt>
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

function ProofMetric({ label, value, detail }) {
  return (
    <article className="proof-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function FindingCard({ finding }) {
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
      {finding.source && (
        <a href={finding.source} rel="noreferrer" target="_blank">
          Source guidance
        </a>
      )}
      {finding.snippet && (
        <CodeBlock title="Exact fix" value={finding.snippet} />
      )}
    </article>
  );
}

function CodeBlock({ body, title, value }) {
  return (
    <div className="code-block">
      <div>
        <strong>{title}</strong>
        {body && <p>{body}</p>}
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}
