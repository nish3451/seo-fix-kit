function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("=") || "");
    }
  }
  return "";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: secureHeaders({ "content-type": "application/json; charset=utf-8" })
  });
}

function jsonNoStore(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: secureHeaders({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-robots-tag": "noindex, nofollow"
    })
  });
}

function withPrivateHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow");
  return withSecurityHeaders(new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  }));
}

function withSecurityHeaders(response) {
  const headers = secureHeaders(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function secureHeaders(input = {}) {
  const headers = new Headers(input);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("x-frame-options", "DENY");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  if ((headers.get("content-type") || "").includes("text/html")) {
    headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' https://cloudflareinsights.com",
        "form-action 'self' https://live.dodopayments.com https://test.dodopayments.com",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join("; ")
    );
  }
  return headers;
}

export {
  cookieValue,
  json,
  jsonNoStore,
  secureHeaders,
  withPrivateHeaders,
  withSecurityHeaders
};
