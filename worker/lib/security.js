function workerLargeCrawlId(prefix = "lc") {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function checkQuotaSet(env, checks) {
  const updatedAt = new Date().toISOString();
  for (const check of checks) {
    const update = await env.WAITLIST_DB.prepare(
      `INSERT INTO audit_usage (bucket, count, window_start, updated_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(bucket) DO UPDATE SET
        count = audit_usage.count + 1,
        updated_at = excluded.updated_at
       WHERE audit_usage.count < ?`
    )
      .bind(check.bucket, check.windowStart, updatedAt, check.limit)
      .run();

    if (Number(update?.meta?.changes || 0) !== 1) {
      return {
        ok: false,
        error: check.error,
        resetAt: check.resetAt.toISOString()
      };
    }
  }

  return { ok: true };
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestIpHash(request) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return (await sha256Hex(ip)).slice(0, 32);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || ""))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ""));
  const rightBytes = new TextEncoder().encode(String(right || ""));
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return maxLength > 0 && diff === 0;
}

function csvCell(value) {
  let text = String(value ?? "");
  // Neutralize spreadsheet formula triggers in attacker-supplied fields
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export {
  checkQuotaSet,
  constantTimeEqual,
  csvCell,
  hmacSha256Hex,
  randomToken,
  requestIpHash,
  sha256Hex,
  workerLargeCrawlId
};
