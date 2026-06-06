const DEFAULT_MAX_REDIRECTS = 5;

export function normalizeHttpUrl(input = "") {
  try {
    const trimmed = String(input || "").trim();
    if (!trimmed) return "";
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function publicUrlStatus(value = "") {
  return httpUrlStatus(value, { allowPrivate: false });
}

function httpUrlStatus(value = "", options = {}) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return { ok: false, error: "Enter a valid public website URL." };
  const url = new URL(normalized);
  if (!options.allowPrivate && isPrivateHostname(url.hostname)) {
    return { ok: false, error: "Use a public website URL, not a private or local address." };
  }
  return { ok: true, url: normalized };
}

export function isPrivateHost(value = "") {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return true;
  return isPrivateHostname(new URL(normalized).hostname);
}

export async function fetchPublicUrl(fetcher, url, init = {}, options = {}) {
  const maxRedirects = Math.min(Math.max(Number(options.maxRedirects || DEFAULT_MAX_REDIRECTS), 0), 10);
  const allowPrivate = Boolean(options.allowPrivate);
  let currentUrl = url;
  const redirectChain = [];

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const currentStatus = httpUrlStatus(currentUrl, { allowPrivate });
    if (!currentStatus.ok) throw new Error(currentStatus.error);

    const response = await fetcher(currentStatus.url, {
      ...init,
      redirect: "manual"
    });

    if (!isRedirectStatus(response.status)) {
      return {
        response,
        finalUrl: currentStatus.url,
        redirectChain
      };
    }

    const location = response.headers?.get?.("location") || "";
    if (!location) {
      return {
        response,
        finalUrl: currentStatus.url,
        redirectChain
      };
    }

    const nextUrl = absoluteUrl(location, currentStatus.url);
    const nextStatus = httpUrlStatus(nextUrl, { allowPrivate });
    if (!nextStatus.ok) {
      throw new Error("Redirect target must be a public website URL.");
    }
    redirectChain.push({ status: response.status, from: currentStatus.url, to: nextStatus.url });
    currentUrl = nextStatus.url;
  }

  throw new Error("Too many redirects before reaching a public URL.");
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status || 0));
}

function absoluteUrl(value = "", baseUrl = "") {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
}

function isPrivateHostname(input = "") {
  const host = normalizeHostname(input);
  if (!host) return true;
  if (isPrivateName(host)) return true;

  const ipv4 = parseIpv4(host);
  if (ipv4) return isPrivateIpv4(ipv4);

  if (host.includes(":")) {
    const mappedIpv4 = parseMappedIpv4(host);
    if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
    return isPrivateIpv6(host);
  }

  return false;
}

function normalizeHostname(input = "") {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isPrivateName(host) {
  return (
    host === "localhost" ||
    host === "metadata" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".invalid") ||
    host.endsWith(".home.arpa") ||
    host.endsWith(".cluster.local")
  );
}

function parseIpv4(host) {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part, index) => !/^\d+$/.test(parts[index]) || !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return octets;
}

function parseMappedIpv4(host) {
  const dotted = host.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return parseIpv4(dotted[1]);

  const hex = host.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  if (![high, low].every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)) return null;
  return [high >> 8, high & 255, low >> 8, low & 255];
}

function isPrivateIpv4([first, second, third]) {
  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 192 && second === 0 && third === 0) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
  if (first >= 224) return true;
  return false;
}

function isPrivateIpv6(host) {
  const compact = host.replace(/^0+/, "");
  return (
    compact === "::" ||
    compact === "::1" ||
    compact.startsWith("fe80:") ||
    compact.startsWith("fe9") ||
    compact.startsWith("fea") ||
    compact.startsWith("feb") ||
    compact.startsWith("fc") ||
    compact.startsWith("fd") ||
    compact.startsWith("ff") ||
    compact.startsWith("2001:db8:")
  );
}
