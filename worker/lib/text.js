import { normalizeUrl, publicAuditUrlStatus } from "../../shared/audit-engine.js";

function normalizeDnsTxt(value) {
  return String(value || "")
    .replace(/\\"/g, '"')
    .replaceAll('" "', "")
    .replaceAll('"', "")
    .trim();
}

function normalizeDnsHost(value) {
  return cleanReportDomain(String(value || "").replace(/\.$/, ""));
}

function cleanReportDomain(input) {
  let value = String(input || "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^https?:\/\//, "").split("/")[0].split("?")[0].split("#")[0].replace(/\.$/, "");
  value = value.split(":")[0];
  if (value.length < 4 || value.length > 253) return "";
  if (!value.includes(".")) return "";
  if (/[^a-z0-9.-]/.test(value)) return "";
  if (value.includes("..") || value.startsWith(".") || value.endsWith(".")) return "";
  if (value === "localhost" || value.endsWith(".localhost")) return "";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return "";
  if (value.endsWith(".internal") || value.endsWith(".invalid")) return "";
  return value;
}

function workerAppHost(host = "", env = {}) {
  const clean = cleanReportDomain(host);
  if (!clean) return true;
  const appHosts = new Set(
    [
      "seofixkit.com",
      "www.seofixkit.com",
      ...String(env.SEOFIXKIT_APP_HOSTS || "")
        .split(",")
        .map((value) => cleanReportDomain(value))
        .filter(Boolean)
    ]
  );
  return appHosts.has(clean) || clean.endsWith(".workers.dev");
}

function claimHostFromInput(input) {
  try {
    const url = new URL(normalizeUrl(String(input || "").trim()));
    const check = publicAuditUrlStatus(url.href);
    if (!check.ok) return "";
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function normalizeEmail(input) {
  const email = String(input || "").trim().toLowerCase();
  if (email.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function cleanInviteCode(input) {
  const code = String(input || "").trim();
  if (code.length < 8 || code.length > 120) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return "";
  return code;
}

function cleanAccessToken(input) {
  const token = String(input || "").trim();
  if (token.length < 32 || token.length > 160) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return "";
  return token;
}

function cleanAccessMode(input) {
  const mode = String(input || "").trim().toLowerCase();
  if (mode === "invite" || mode === "self-serve" || mode === "founder-override") return mode;
  if (mode === "api") return "api";
  return "invite";
}

function randomHex(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clampScheduleInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  if (parsed <= 7) return 7;
  if (parsed <= 14) return 14;
  return 30;
}

function scheduleCadenceLabel(value) {
  const days = clampScheduleInterval(value);
  if (days === 7) return "Weekly";
  if (days === 14) return "Every 2 weeks";
  return "Monthly";
}

function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanUrlText(input, maxLength) {
  const value = cleanText(input, maxLength);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href.slice(0, maxLength);
  } catch {
    return "";
  }
}

function cleanIsoDateText(input) {
  const value = cleanText(input, 80);
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function safeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSafeUuid(input) {
  return /^[a-f0-9-]{32,40}$/i.test(String(input || ""));
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function hourWindow(now) {
  const resetAt = new Date(now);
  resetAt.setUTCMinutes(0, 0, 0);
  resetAt.setUTCHours(resetAt.getUTCHours() + 1);
  return {
    key: now.toISOString().slice(0, 13),
    resetAt
  };
}

function dayWindow(now) {
  const resetAt = new Date(now);
  resetAt.setUTCHours(0, 0, 0, 0);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);
  return {
    key: now.toISOString().slice(0, 10),
    resetAt
  };
}

function isoSecondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isoDaysFromNow(days) {
  return isoSecondsFromNow(days * 24 * 60 * 60);
}

function isoDaysFromDate(value, days) {
  const start = new Date(value);
  const base = Number.isNaN(start.getTime()) ? Date.now() : start.getTime();
  return new Date(base + Number(days || 0) * 24 * 60 * 60 * 1000).toISOString();
}

function isSafeReportId(value) {
  return /^[a-z0-9][a-z0-9.-]{12,120}$/i.test(value);
}

export {
  claimHostFromInput,
  clampScheduleInterval,
  cleanAccessMode,
  cleanAccessToken,
  cleanInviteCode,
  cleanIsoDateText,
  cleanReportDomain,
  cleanText,
  cleanUrlText,
  dayWindow,
  hourWindow,
  isSafeReportId,
  isSafeUuid,
  isoDaysFromDate,
  isoDaysFromNow,
  isoSecondsFromNow,
  normalizeDnsHost,
  normalizeDnsTxt,
  normalizeEmail,
  parseJson,
  randomHex,
  safeHostname,
  scheduleCadenceLabel,
  workerAppHost
};
