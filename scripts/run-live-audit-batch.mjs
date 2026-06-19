import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BASE_URL = process.env.SEOFIXKIT_BASE_URL || "https://seofixkit.com";
const TARGETS_PATH =
  process.env.SEOFIXKIT_TARGETS_PATH || "ops/audit-batches/owned-project-targets.json";
const OUT_DIR = process.env.SEOFIXKIT_AUDIT_OUT_DIR || "ops/audit-batches";
const MAX_PAGES = Number(process.env.SEOFIXKIT_MAX_PAGES || 6);
const PREFLIGHT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_PREFLIGHT_TIMEOUT_MS || 15000);
const AUDIT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_AUDIT_TIMEOUT_MS || 180000);
const AUDIT_POLL_INTERVAL_MS = Number(process.env.SEOFIXKIT_AUDIT_POLL_INTERVAL_MS || 5000);
const AUDIT_POLL_TIMEOUT_MS = Number(process.env.SEOFIXKIT_AUDIT_POLL_TIMEOUT_MS || 10 * 60 * 1000);

const runId = new Date().toISOString().replace(/[:.]/g, "-");

if (isDirectRun()) {
  await main();
}

async function main() {
  const ownerEmail = `nish.audit.${Date.now()}@seofixkit.com`;
  const adminToken = readAdminToken();
  const targets = JSON.parse(await readFile(TARGETS_PATH, "utf8"));

  await mkdir(OUT_DIR, { recursive: true });

  const result = {
    runId,
    createdAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    ownerEmail,
    maxPages: MAX_PAGES,
    targets: [],
    repeatedIssues: [],
    recommendation: null
  };

  const invite = await createInvite(ownerEmail, adminToken);
  const cookie = await login(ownerEmail, invite.code);

  for (const target of targets) {
    console.error(`[audit-batch] checking ${target.project}: ${target.url}`);
    const entry = {
      project: target.project,
      url: target.url,
      kind: target.kind,
      audit: Boolean(target.audit),
      source: target.source,
      note: target.note || "",
      preflight: await preflight(target.url)
    };

    if (!target.audit) {
      entry.status = "skipped";
      entry.reason = target.note || "Not marked as an SEO target.";
      result.targets.push(entry);
      continue;
    }

    if (!entry.preflight.ok) {
      entry.status = "failed";
      entry.reason = "Preflight failed.";
      result.targets.push(entry);
      continue;
    }

    try {
      const report = await audit(target.url, cookie);
      entry.status = "audited";
      entry.report = summarizeReport(report);
      if (fixPackProofEnabled()) {
        entry.fixPack = await proveFixPackForReport(report, cookie);
      }
    } catch (error) {
      entry.status = "failed";
      entry.reason = error.message || "Audit failed.";
    }

    result.targets.push(entry);
  }

  result.repeatedIssues = summarizeRepeatedIssues(result.targets);
  result.recommendation = recommendOffer(result);

  const jsonPath = path.join(OUT_DIR, `${runId}-owned-project-audit-batch.json`);
  const mdPath = path.join(OUT_DIR, `${runId}-owned-project-audit-batch.md`);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(result));

  console.log(
    JSON.stringify(
      {
        ok: true,
        audited: result.targets.filter((target) => target.status === "audited").length,
        failed: result.targets.filter((target) => target.status === "failed").length,
        skipped: result.targets.filter((target) => target.status === "skipped").length,
        jsonPath,
        mdPath,
        recommendation: result.recommendation
      },
      null,
      2
    )
  );
}

function isDirectRun() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}

function readAdminToken() {
  const envToken = process.env.SEOFIXKIT_ADMIN_TOKEN || process.env.ADMIN_EXPORT_TOKEN;
  if (envToken) return envToken.trim();

  try {
    return execFileSync("security", [
      "find-generic-password",
      "-a",
      "nish",
      "-s",
      "seofixkit-admin-token",
      "-w"
    ])
      .toString("utf8")
      .trim();
  } catch {
    throw new Error(
      "Missing admin token. Set SEOFIXKIT_ADMIN_TOKEN or store seofixkit-admin-token in Keychain."
    );
  }
}

async function createInvite(email, adminToken) {
  const response = await fetchWithTimeout(`${BASE_URL}/admin/invites`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ownerEmail: email,
      label: `Owned project audit batch ${runId}`,
      maxUses: 1,
      ttlDays: 1
    })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.invite?.code) {
    throw new Error(`Could not create invite: ${payload.error || response.status}`);
  }
  return payload.invite;
}

async function login(email, inviteCode) {
  const response = await fetchWithTimeout(`${BASE_URL}/api/beta/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, inviteCode })
  }, 30000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new Error(`Could not start beta session: ${payload.error || response.status}`);
  }
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  if (!cookie) throw new Error("Beta login did not return a session cookie.");
  return cookie;
}

async function preflight(url) {
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(url, {
      headers: { "user-agent": `SEOFixKitBatch/0.1 (+${BASE_URL})` },
      redirect: "follow"
    }, PREFLIGHT_TIMEOUT_MS);
    const text = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || "",
      bytes: text.length,
      title: titleFromHtml(text),
      ms: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Fetch failed.",
      ms: Date.now() - startedAt
    };
  }
}

async function audit(url, cookie, options = {}) {
  const baseUrl = options.baseUrl || BASE_URL;
  const fetcher = options.fetcher || fetch;
  const response = await fetchWithTimeout(`${baseUrl}/api/audit`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({ url, maxPages: MAX_PAGES })
  }, options.auditTimeoutMs || AUDIT_TIMEOUT_MS, fetcher);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Audit failed with ${response.status}`);
  }
  if (isAuditReportPayload(payload)) return payload.report || payload;
  if (payload.mode === "queued") {
    return waitForQueuedAuditReport(payload, cookie, {
      baseUrl,
      fetcher,
      auditTimeoutMs: options.auditTimeoutMs || AUDIT_TIMEOUT_MS,
      pollIntervalMs: options.pollIntervalMs ?? AUDIT_POLL_INTERVAL_MS,
      pollTimeoutMs: options.pollTimeoutMs ?? AUDIT_POLL_TIMEOUT_MS
    });
  }
  throw new Error("Audit response did not include a completed report or queued job.");
}

async function proveFixPackForReport(report, cookie, options = {}) {
  const summary = summarizeReport(report);
  if (!summary.findings) {
    return {
      status: "skipped",
      reason: "No actionable findings; Fix Pack proof was not requested."
    };
  }
  return requestFixPack(report.id, cookie, options);
}

async function requestFixPack(reportId, cookie, options = {}) {
  const baseUrl = options.baseUrl || BASE_URL;
  const fetcher = options.fetcher || fetch;
  const response = await fetchWithTimeout(`${baseUrl}/api/beta/fix-request`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({ reportId })
  }, options.timeoutMs || AUDIT_TIMEOUT_MS, fetcher);
  const payload = await response.json().catch(() => ({}));
  return summarizeFixPackProof(payload, response.status, response.ok);
}

function summarizeFixPackProof(payload = {}, httpStatus = 0, responseOk = false) {
  const checkoutHost = safeUrl(payload.checkoutUrl)?.hostname || "";
  return {
    ok: responseOk && payload.ok === true,
    status: payload.mode || (responseOk ? "ok" : "failed"),
    httpStatus,
    checkoutAvailable: payload.checkoutAvailable ?? Boolean(payload.checkoutUrl),
    checkoutUrlPresent: Boolean(payload.checkoutUrl),
    checkoutHost,
    request: payload.request ? {
      id: payload.request.id || "",
      status: payload.request.status || "",
      checkoutSessionIdPresent: Boolean(payload.request.checkoutSessionId),
      checkoutCreatedAt: payload.request.checkoutCreatedAt || "",
      proposalSummary: payload.request.repairProposalSummary || null
    } : null,
    selectedRepair: payload.selectedRepair ? {
      id: payload.selectedRepair.id || "",
      title: payload.selectedRepair.title || "",
      severity: payload.selectedRepair.severity || ""
    } : null,
    code: payload.code || "",
    message: payload.message || "",
    error: payload.error || ""
  };
}

function isAuditReportPayload(payload = {}) {
  const report = payload.report || payload;
  return Boolean(report?.id && Array.isArray(report.findings) && Array.isArray(report.pages));
}

async function waitForQueuedAuditReport(payload, cookie, options = {}) {
  const statusUrl = payload.statusUrl || payload.status_url || payload.job?.statusUrl || payload.job?.status_url || "";
  if (!statusUrl) throw new Error("Queued audit did not return a status URL.");
  const deadline = Date.now() + Math.max(Number(options.pollTimeoutMs || AUDIT_POLL_TIMEOUT_MS), 1);
  const pollIntervalMs = Math.max(Number(options.pollIntervalMs || AUDIT_POLL_INTERVAL_MS), 250);
  const maxRequestTimeoutMs = Math.max(Number(options.auditTimeoutMs || AUDIT_TIMEOUT_MS), 1);
  let lastStatus = payload.job?.status || "queued";

  while (Date.now() < deadline) {
    const remainingMs = Math.max(deadline - Date.now(), 1);
    const jobPayload = await fetchJson(resolveUrl(statusUrl, options.baseUrl || BASE_URL), {
      headers: { cookie }
    }, options.fetcher || fetch, Math.min(maxRequestTimeoutMs, remainingMs));
    const job = jobPayload.job || {};
    lastStatus = job.status || lastStatus;
    if (lastStatus === "failed") {
      throw new Error(job.error || "Audit job failed.");
    }
    if (lastStatus === "completed" || lastStatus === "complete") {
      const reportId = job.reportId || job.report_id || "";
      if (!reportId) throw new Error("Completed audit job did not include a report ID.");
      const remainingMs = Math.max(deadline - Date.now(), 1);
      const reportPayload = await fetchJson(resolveUrl(`/api/reports/${encodeURIComponent(reportId)}`, options.baseUrl || BASE_URL), {
        headers: { cookie }
      }, options.fetcher || fetch, Math.min(maxRequestTimeoutMs, remainingMs));
      if (!isAuditReportPayload(reportPayload)) throw new Error("Completed audit report payload was missing report fields.");
      return reportPayload.report || reportPayload;
    }
    const sleepMs = Math.min(pollIntervalMs, Math.max(deadline - Date.now(), 0));
    if (sleepMs > 0) await sleep(sleepMs);
  }

  throw new Error(`Audit job timed out while ${lastStatus}.`);
}

async function fetchJson(url, options, fetcher, timeoutMs) {
  const response = await fetchWithTimeout(url, options, timeoutMs, fetcher);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function resolveUrl(value, baseUrl) {
  return new URL(value, baseUrl).href;
}

function safeUrl(value = "") {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeReport(report) {
  const actionable = (report.findings || []).filter((finding) => finding.severity !== "good");
  const guarded = (report.findings || []).filter((finding) => finding.severity === "good");
  return {
    id: report.id,
    reportUrl: report.reportUrl,
    url: report.url,
    score: report.score,
    pages: report.pages?.length || 0,
    findings: actionable.length,
    guardedFalsePositives: guarded.length,
    severityCounts: countBy(actionable, "severity"),
    topIssues: actionable.slice(0, 8).map((finding) => ({
      severity: finding.severity,
      title: finding.title,
      page: finding.page || "",
      evidence: finding.evidence || "",
      fix: finding.fix || ""
    }))
  };
}

function summarizeRepeatedIssues(targets) {
  const counts = new Map();
  for (const target of targets) {
    for (const issue of target.report?.topIssues || []) {
      const key = normalizeIssueTitle(issue.title);
      const current = counts.get(key) || {
        issue: key,
        count: 0,
        projects: [],
        severities: {}
      };
      current.count += 1;
      if (!current.projects.includes(target.project)) current.projects.push(target.project);
      current.severities[issue.severity] = (current.severities[issue.severity] || 0) + 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()]
    .filter((issue) => issue.projects.length > 1 || issue.count > 1)
    .sort((a, b) => b.projects.length - a.projects.length || b.count - a.count)
    .slice(0, 12);
}

function recommendOffer(batch) {
  const audited = batch.targets.filter((target) => target.status === "audited");
  const totalFindings = audited.reduce((sum, target) => sum + (target.report?.findings || 0), 0);
  const priorityPatterns = batch.repeatedIssues.filter((issue) =>
    /canonical|social share image|meta description|title|structured data|apple touch icon/i.test(
      issue.issue
    )
  );

  if (!audited.length) {
    return {
      offer: "No paid offer yet",
      reason: "No live project audits completed."
    };
  }

  if (totalFindings === 0) {
    return {
      offer: "No paid offer yet",
      reason: `${audited.length} projects produced 0 actionable findings. Do not sell a Fix Pack until a live audit proves repair work.`
    };
  }

  return {
    offer: "SEO Fix Pack",
    price: "Dodo checkout price",
    scope:
      "Fix the top proven metadata, canonical, social preview, schema, and crawlability issues on one site.",
    reason: `${audited.length} projects produced ${totalFindings} actionable findings. ${priorityPatterns.length} repeated revenue-relevant issue patterns appeared across the batch.`
  };
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function normalizeIssueTitle(title) {
  return String(title || "")
    .replace(/\s+on\s+.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]).replace(/\s+/g, " ").trim() : "";
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function fixPackProofEnabled() {
  return /^(1|true|yes)$/i.test(process.env.SEOFIXKIT_FIX_PACK_PROOF || "");
}

function renderMarkdown(batch) {
  const audited = batch.targets.filter((target) => target.status === "audited");
  const failed = batch.targets.filter((target) => target.status === "failed");
  const skipped = batch.targets.filter((target) => target.status === "skipped");

  return `# Owned Project SEO Audit Batch

- Run: ${batch.runId}
- Created: ${batch.createdAt}
- Base: ${batch.baseUrl}
- Audited: ${audited.length}
- Failed: ${failed.length}
- Skipped: ${skipped.length}
- Max pages per target: ${batch.maxPages}

## Recommendation

${batch.recommendation ? `**${batch.recommendation.offer}** (${batch.recommendation.price || "n/a"})

${batch.recommendation.scope || ""}

Reason: ${batch.recommendation.reason}` : "No recommendation generated."}

## Audited Targets

${audited
  .map(
    (target) => `### ${target.project}

- URL: ${target.url}
- Live title: ${target.preflight.title || "missing"}
- Score: ${target.report.score}
- Pages: ${target.report.pages}
- Findings: ${target.report.findings}
- Guarded false positives: ${target.report.guardedFalsePositives}
- Report: ${target.report.reportUrl}
${target.fixPack ? `
Fix Pack proof:
- Status: ${target.fixPack.status}
- Checkout available: ${target.fixPack.checkoutAvailable ? "yes" : "no"}
- Checkout URL returned: ${target.fixPack.checkoutUrlPresent ? "yes" : "no"}
- Checkout host: ${target.fixPack.checkoutHost || "n/a"}
- Request: ${target.fixPack.request?.id || "n/a"} (${target.fixPack.request?.status || "n/a"})
- Selected repair: ${target.fixPack.selectedRepair?.title || "n/a"}
- Note: ${target.fixPack.reason || target.fixPack.error || target.fixPack.message || "n/a"}
` : ""}

Top issues:
${target.report.topIssues
  .slice(0, 5)
  .map((issue) => `- ${issue.severity}: ${issue.title}${issue.fix ? ` - ${issue.fix}` : ""}`)
  .join("\n")}`
  )
  .join("\n\n")}

## Repeated Issues

${batch.repeatedIssues.length ? batch.repeatedIssues
  .map((issue) => `- ${issue.issue}: ${issue.count} findings across ${issue.projects.join(", ")}`)
  .join("\n") : "- No repeated issues found."}

## Failed Targets

${failed.length ? failed.map((target) => `- ${target.project} (${target.url}): ${target.reason}`).join("\n") : "- None."}

## Skipped Targets

${skipped.length ? skipped.map((target) => `- ${target.project} (${target.url}): ${target.reason}`).join("\n") : "- None."}
`;
}

async function fetchWithTimeout(url, options, timeoutMs, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export {
  audit,
  fetchWithTimeout,
  isAuditReportPayload,
  proveFixPackForReport,
  recommendOffer,
  requestFixPack,
  resolveUrl,
  summarizeFixPackProof,
  waitForQueuedAuditReport
};
