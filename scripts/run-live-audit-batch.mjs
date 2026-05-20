import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.SEOFIXKIT_BASE_URL || "https://seofixkit.com";
const TARGETS_PATH =
  process.env.SEOFIXKIT_TARGETS_PATH || "ops/audit-batches/owned-project-targets.json";
const OUT_DIR = process.env.SEOFIXKIT_AUDIT_OUT_DIR || "ops/audit-batches";
const MAX_PAGES = Number(process.env.SEOFIXKIT_MAX_PAGES || 6);
const PREFLIGHT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_PREFLIGHT_TIMEOUT_MS || 15000);
const AUDIT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_AUDIT_TIMEOUT_MS || 180000);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
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

const invite = await createInvite(ownerEmail);
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

async function createInvite(email) {
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

async function audit(url, cookie) {
  const response = await fetchWithTimeout(`${BASE_URL}/api/audit`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({ url, maxPages: MAX_PAGES })
  }, AUDIT_TIMEOUT_MS);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Audit failed with ${response.status}`);
  }
  return payload;
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

  return {
    offer: "SEO Fix Pack",
    price: "$99 beta",
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
