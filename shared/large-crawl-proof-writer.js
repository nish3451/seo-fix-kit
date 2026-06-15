const LARGE_CRAWL_PROOF_TRUST_ERROR = "Large crawl proof must be saved by SEO Fix Kit's trusted renderer.";

function largeCrawlProofWriteStatus({ headers, env = {}, trustedRenderer = false } = {}) {
  if (trustedRenderer) return { ok: true };

  const configuredToken = String(env.SEOFIXKIT_LARGE_CRAWL_WORKER_TOKEN || "").trim();
  const suppliedToken = headerValue(headers, "x-seofixkit-worker-token");
  if (configuredToken && constantTimeEqual(suppliedToken, configuredToken)) return { ok: true };

  return {
    ok: false,
    status: 403,
    code: "TRUSTED_RENDERER_REQUIRED",
    error: LARGE_CRAWL_PROOF_TRUST_ERROR
  };
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const direct = headers[name] || headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0] || "";
  return direct || "";
}

function constantTimeEqual(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  const maxLength = Math.max(leftText.length, rightText.length);
  let diff = leftText.length ^ rightText.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }

  return maxLength > 0 && diff === 0;
}

export {
  LARGE_CRAWL_PROOF_TRUST_ERROR,
  largeCrawlProofWriteStatus
};
