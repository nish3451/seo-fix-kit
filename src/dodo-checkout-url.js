function safeDodoCheckoutUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

export { safeDodoCheckoutUrl };
