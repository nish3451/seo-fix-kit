export function buildReportDelta(currentReport = {}, previousReport = null) {
  if (!previousReport?.id) {
    return {
      status: "first_run",
      source: "saved-report-history",
      note: "No earlier saved report was available for this owner and host.",
      previous: null,
      summary: {
        scoreNow: numberOrZero(currentReport.score),
        issuesNow: issueRows(currentReport).length,
        pagesScannedNow: numberOrZero(currentReport.summary?.pagesScanned || currentReport.pages?.length)
      },
      fixedIssues: [],
      newIssues: [],
      persistentIssues: []
    };
  }

  const currentIssues = issueRows(currentReport);
  const previousIssues = issueRows(previousReport);
  const currentByKey = mapByIssueKey(currentIssues);
  const previousByKey = mapByIssueKey(previousIssues);
  const fixedIssues = previousIssues.filter((issue) => !currentByKey.has(issue.key)).map(deltaIssue);
  const newIssues = currentIssues.filter((issue) => !previousByKey.has(issue.key)).map(deltaIssue);
  const persistentIssues = currentIssues.filter((issue) => previousByKey.has(issue.key)).map((issue) => {
    const before = previousByKey.get(issue.key);
    return deltaIssue({
      ...issue,
      previousSeverity: before?.severity || "",
      previousEvidence: before?.evidence || ""
    });
  });

  const scoreBefore = numberOrZero(previousReport.score);
  const scoreNow = numberOrZero(currentReport.score);
  const issuesBefore = previousIssues.length;
  const issuesNow = currentIssues.length;
  const pagesBefore = numberOrZero(previousReport.summary?.pagesScanned || previousReport.pages?.length);
  const pagesNow = numberOrZero(currentReport.summary?.pagesScanned || currentReport.pages?.length);

  return {
    status: "ready",
    source: "saved-report-history",
    note: "Compares this saved report with the most recent earlier report for the same owner and host.",
    previous: {
      id: previousReport.id || "",
      url: previousReport.url || "",
      reportPath: previousReport.reportPath || (previousReport.id ? `/beta/reports/${previousReport.id}` : ""),
      scannedAt: previousReport.scannedAt || previousReport.createdAt || "",
      score: scoreBefore,
      issues: issuesBefore,
      pagesScanned: pagesBefore
    },
    summary: {
      scoreBefore,
      scoreNow,
      scoreDelta: scoreNow - scoreBefore,
      issuesBefore,
      issuesNow,
      issuesDelta: issuesNow - issuesBefore,
      pagesScannedBefore: pagesBefore,
      pagesScannedNow: pagesNow,
      pagesScannedDelta: pagesNow - pagesBefore,
      fixedIssuesCount: fixedIssues.length,
      newIssuesCount: newIssues.length,
      persistentIssuesCount: persistentIssues.length,
      criticalDelta: severityCount(currentIssues, "critical") - severityCount(previousIssues, "critical"),
      warningDelta: severityCount(currentIssues, "warning") - severityCount(previousIssues, "warning"),
      noticeDelta: severityCount(currentIssues, "notice") - severityCount(previousIssues, "notice")
    },
    fixedIssues: fixedIssues.slice(0, 20),
    newIssues: newIssues.slice(0, 20),
    persistentIssues: persistentIssues.slice(0, 20)
  };
}

export function reportDeltaBriefLines(delta = {}) {
  if (!["ready", "first_run"].includes(delta.status)) return [];
  const summary = delta.summary || {};
  if (delta.status === "first_run") {
    return [
      "## Audit history delta",
      "",
      "This is the first saved report for this owner and host, so there is no previous run to compare yet.",
      ""
    ];
  }

  const lines = [
    "## Audit history delta",
    "",
    `Previous report: ${delta.previous?.reportPath || delta.previous?.id || "available"}`,
    `Score change: ${signed(summary.scoreDelta || 0)} (${summary.scoreBefore || 0} -> ${summary.scoreNow || 0})`,
    `Issue change: ${signed(summary.issuesDelta || 0)} (${summary.issuesBefore || 0} -> ${summary.issuesNow || 0})`,
    `Fixed issues: ${summary.fixedIssuesCount || 0}`,
    `New issues: ${summary.newIssuesCount || 0}`,
    `Still open: ${summary.persistentIssuesCount || 0}`,
    ""
  ];

  if (delta.fixedIssues?.length) {
    lines.push("### Fixed since previous run", "");
    for (const issue of delta.fixedIssues.slice(0, 8)) {
      lines.push(`- ${issue.title}${issue.pageLabel ? ` (${issue.pageLabel})` : ""}`);
    }
    lines.push("");
  }
  if (delta.newIssues?.length) {
    lines.push("### New since previous run", "");
    for (const issue of delta.newIssues.slice(0, 8)) {
      lines.push(`- [${issue.severity}] ${issue.title}${issue.pageLabel ? ` (${issue.pageLabel})` : ""}`);
    }
    lines.push("");
  }
  return lines;
}

export function appendReportDeltaBrief(brief = "", delta = {}) {
  const lines = reportDeltaBriefLines(delta);
  if (!lines.length) return brief || "";
  const section = lines.join("\n");
  const closing = "Re-run SEO Fix Kit after shipping changes and keep only fixes that match visible page content.";
  const text = String(brief || "");
  if (text.includes("## Audit history delta")) return text;
  if (!text.includes(closing)) return `${text.trim()}\n\n${section}`.trim();
  return text.replace(closing, `${section}\n${closing}`);
}

function issueRows(report = {}) {
  return (report.findings || [])
    .filter((finding) => finding?.severity && finding.severity !== "good")
    .map((finding) => {
      const row = {
        key: issueKey(finding),
        severity: finding.severity || "notice",
        title: cleanText(finding.title || "Issue"),
        pageUrl: finding.pageUrl || "",
        pageLabel: finding.pageLabel || pageLabel(finding.pageUrl || report.url || ""),
        evidence: cleanText(finding.evidence || ""),
        fix: cleanText(finding.fix || ""),
        confidence: finding.confidence || "verified",
        source: finding.source || "",
        type: finding.type || ""
      };
      return row;
    });
}

function mapByIssueKey(issues = []) {
  const map = new Map();
  for (const issue of issues) {
    if (!map.has(issue.key)) map.set(issue.key, issue);
  }
  return map;
}

function deltaIssue(issue = {}) {
  return {
    severity: issue.severity || "notice",
    previousSeverity: issue.previousSeverity || "",
    title: issue.title || "Issue",
    pageUrl: issue.pageUrl || "",
    pageLabel: issue.pageLabel || "",
    evidence: issue.evidence || "",
    previousEvidence: issue.previousEvidence || "",
    fix: issue.fix || "",
    confidence: issue.confidence || "verified",
    source: issue.source || "",
    type: issue.type || ""
  };
}

function issueKey(finding = {}) {
  return [
    finding.type || "",
    normalizeText(finding.title || ""),
    normalizeUrlKey(finding.pageUrl || ""),
    normalizeText(finding.source || "")
  ].join("|");
}

function severityCount(issues = [], severity = "") {
  return issues.filter((issue) => issue.severity === severity).length;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function signed(value) {
  const number = Number(value || 0);
  if (number > 0) return `+${number}`;
  return String(number);
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeUrlKey(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return normalizeText(value);
  }
}

function pageLabel(value = "") {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? "home" : url.pathname.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function cleanText(value = "", max = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
