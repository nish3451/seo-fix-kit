const MAX_RESOURCE_ROWS = 50;
const SLOW_RESOURCE_MS = 1000;
const HEAVY_RESOURCE_BYTES = 250 * 1024;
const HEAVY_SCRIPT_BYTES = 300 * 1024;
const HEAVY_IMAGE_BYTES = 700 * 1024;
const HEAVY_TOTAL_BYTES = 2 * 1024 * 1024;

export function buildResourceWaterfall(page = {}) {
  const rendered = page.rendered || {};
  const rawResources = Array.isArray(rendered.resourceTimings)
    ? rendered.resourceTimings
    : [];
  const navigation = rendered.navigationTiming || {};
  const pageUrl = rendered.finalUrl || page.finalUrl || page.url || "";
  const pageOrigin = safeOrigin(pageUrl);
  const resources = rawResources
    .map((resource) => normalizeResource(resource, pageOrigin))
    .filter(Boolean)
    .sort((a, b) => a.startTimeMs - b.startTimeMs || b.durationMs - a.durationMs);

  if (!resources.length) {
    return {
      status: "empty",
      source: "browser-resource-timing",
      reason: rendered.source === "static-fallback"
        ? "Rendered browser timing was unavailable for this page."
        : "The browser did not expose resource timing rows for this page.",
      summary: emptySummary(),
      navigation,
      resources: [],
      slowResources: [],
      heavyResources: [],
      renderBlockingCandidates: [],
      thirdPartyHosts: [],
      repairOpportunities: []
    };
  }

  const renderBlockingCandidates = resources.filter((resource) =>
    isRenderBlockingCandidate(resource, navigation)
  );
  const slowResources = resources
    .filter((resource) => resource.durationMs >= SLOW_RESOURCE_MS)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);
  const heavyResources = resources
    .filter((resource) => resource.sizeBytes >= HEAVY_RESOURCE_BYTES)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 10);
  const summary = buildSummary(resources, {
    capturedRows: resources.length,
    totalRows: rendered.resourceTimingsTotal || resources.length,
    slowResources,
    renderBlockingCandidates
  });
  const waterfall = {
    status: "ready",
    source: "browser-resource-timing",
    summary,
    navigation,
    resources: resources.slice(0, MAX_RESOURCE_ROWS),
    slowResources,
    heavyResources,
    renderBlockingCandidates: renderBlockingCandidates.slice(0, 10),
    thirdPartyHosts: summarizeThirdPartyHosts(resources),
    repairOpportunities: []
  };
  waterfall.repairOpportunities = buildRepairOpportunities(waterfall);
  return waterfall;
}

export function resourceWaterfallFindings(waterfall = {}, pageLabel = "home", source = "") {
  if (waterfall.status !== "ready") return [];
  const summary = waterfall.summary || {};
  const findings = [];
  const add = (finding) => findings.push({
    type: "performance",
    source,
    confidence: "needs-review",
    ...finding
  });

  if ((waterfall.renderBlockingCandidates || []).length >= 2) {
    add({
      severity: "warning",
      title: `Render-blocking resources on ${pageLabel}`,
      why: "Early scripts and stylesheets can delay the first useful render and make Core Web Vitals harder to pass.",
      evidence: formatResourceList(waterfall.renderBlockingCandidates, "duration"),
      fix: "Inline only critical CSS, defer non-critical JavaScript, and load secondary styles after the page can render."
    });
  }

  if (summary.scriptBytes >= HEAVY_SCRIPT_BYTES) {
    add({
      severity: "warning",
      title: `Heavy JavaScript payload on ${pageLabel}`,
      why: "Large JavaScript bundles increase download, parse, and execution cost before users can interact.",
      evidence: `Browser resource timing observed ${formatWaterfallBytes(summary.scriptBytes)} of JavaScript across ${summary.scriptRequests} request${summary.scriptRequests === 1 ? "" : "s"}.`,
      fix: "Split critical and non-critical bundles, remove unused packages, and defer scripts that are not needed for the first view."
    });
  }

  if (summary.imageBytes >= HEAVY_IMAGE_BYTES) {
    add({
      severity: "notice",
      title: `Heavy image payload on ${pageLabel}`,
      why: "Large image transfers are common Largest Contentful Paint and mobile bandwidth risks.",
      evidence: `Browser resource timing observed ${formatWaterfallBytes(summary.imageBytes)} of image payload.`,
      fix: "Compress large images, serve responsive sizes, and use modern formats for the first viewport."
    });
  }

  if ((waterfall.slowResources || []).length) {
    add({
      severity: "notice",
      title: `Slow resource requests on ${pageLabel}`,
      why: "Slow individual resources can hold the page open even when the HTML response is fast.",
      evidence: formatResourceList(waterfall.slowResources, "duration"),
      fix: "Preload the critical resource if it is needed early, move non-critical requests later, or replace slow third-party assets."
    });
  }

  if (summary.totalTransferBytes >= HEAVY_TOTAL_BYTES) {
    add({
      severity: "notice",
      title: `Large total page payload on ${pageLabel}`,
      why: "Large total transfer size slows repeat crawls and mobile users.",
      evidence: `Browser resource timing observed ${formatWaterfallBytes(summary.totalTransferBytes)} across ${summary.totalRequests} requests.`,
      fix: "Set a page-weight budget, remove unused assets, compress text resources, and lazy-load below-the-fold media."
    });
  }

  if (summary.thirdPartyRequests >= 12) {
    add({
      severity: "notice",
      title: `Many third-party resources on ${pageLabel}`,
      why: "Third-party scripts and pixels can add latency outside the site's direct control.",
      evidence: `${summary.thirdPartyRequests} third-party requests were observed, led by ${formatThirdPartyHosts(waterfall.thirdPartyHosts)}.`,
      fix: "Remove unused tags, consolidate vendors, and delay non-essential third-party scripts until after the main content loads."
    });
  }

  return findings;
}

export function resourceWaterfallBriefLines(waterfall = {}) {
  if (!waterfall || !["ready", "empty"].includes(waterfall.status)) return [];
  if (waterfall.status === "empty") {
    return [
      "## Resource waterfall proof snapshot",
      "",
      `- Source: ${waterfall.source || "browser-resource-timing"}`,
      `- Note: ${waterfall.reason || "No browser resource timing rows were available."}`,
      ""
    ];
  }

  const summary = waterfall.summary || {};
  const lines = [
    "## Resource waterfall proof snapshot",
    "",
    `- Source: ${waterfall.source || "browser-resource-timing"}`,
    `- Requests captured: ${summary.totalRequests}${summary.totalRows > summary.capturedRows ? ` of ${summary.totalRows}` : ""}`,
    `- Transfer observed: ${formatWaterfallBytes(summary.totalTransferBytes)}`,
    `- JavaScript: ${formatWaterfallBytes(summary.scriptBytes)} across ${summary.scriptRequests} request${summary.scriptRequests === 1 ? "" : "s"}`,
    `- CSS: ${formatWaterfallBytes(summary.stylesheetBytes)}; images: ${formatWaterfallBytes(summary.imageBytes)}; fonts: ${formatWaterfallBytes(summary.fontBytes)}`,
    `- Third-party requests: ${summary.thirdPartyRequests}`,
    `- Slow resources: ${summary.slowRequests}; render-blocking candidates: ${summary.renderBlockingCandidates}`,
  ];

  if (waterfall.heavyResources?.length) {
    lines.push(`- Heaviest resource: ${resourceLabel(waterfall.heavyResources[0])} (${formatWaterfallBytes(waterfall.heavyResources[0].sizeBytes)})`);
  }
  if (waterfall.slowResources?.length) {
    lines.push(`- Slowest resource: ${resourceLabel(waterfall.slowResources[0])} (${Math.round(waterfall.slowResources[0].durationMs)}ms)`);
  }
  if (waterfall.repairOpportunities?.length) {
    lines.push(`- Top waterfall repair: ${waterfall.repairOpportunities[0].title}`);
  }
  lines.push("");
  return lines;
}

export function resourceWaterfallSummaryCopy(waterfall = {}) {
  if (waterfall.status !== "ready") {
    return waterfall.reason || "Browser resource timing rows were not available for this page.";
  }
  const summary = waterfall.summary || {};
  return `${summary.totalRequests} browser-loaded resources were captured with ${formatWaterfallBytes(summary.totalTransferBytes)} observed transfer, including ${summary.renderBlockingCandidates} render-blocking candidate${summary.renderBlockingCandidates === 1 ? "" : "s"} and ${summary.slowRequests} slow request${summary.slowRequests === 1 ? "" : "s"}.`;
}

export function formatWaterfallBytes(bytes = 0) {
  const number = Number(bytes);
  if (!Number.isFinite(number) || number <= 0) return "0 B";
  if (number < 1024) return `${Math.round(number)} B`;
  if (number < 1024 * 1024) return `${Math.round(number / 1024)} KB`;
  return `${(number / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeResource(resource = {}, pageOrigin = "") {
  const name = String(resource.name || resource.url || "").trim();
  if (!name) return null;
  const url = safeUrl(name);
  const host = url?.hostname || "";
  const type = classifyResource(resource.initiatorType, url?.pathname || name);
  const sizeBytes = positiveNumber(resource.transferSize) ||
    positiveNumber(resource.encodedBodySize) ||
    positiveNumber(resource.decodedBodySize);
  const startTimeMs = rounded(resource.startTime ?? resource.startTimeMs);
  const durationMs = rounded(resource.duration ?? resource.durationMs);
  const responseEndMs = rounded(resource.responseEnd ?? startTimeMs + durationMs);

  return {
    url: url?.href || name,
    host,
    label: resourceLabelFromUrl(url, name),
    type,
    initiatorType: String(resource.initiatorType || "other"),
    firstParty: pageOrigin && url?.origin ? url.origin === pageOrigin : true,
    startTimeMs,
    durationMs,
    responseEndMs,
    transferSize: positiveNumber(resource.transferSize),
    encodedBodySize: positiveNumber(resource.encodedBodySize),
    decodedBodySize: positiveNumber(resource.decodedBodySize),
    sizeBytes,
    renderBlockingStatus: String(resource.renderBlockingStatus || ""),
    protocol: String(resource.nextHopProtocol || resource.protocol || "")
  };
}

function buildSummary(resources, details = {}) {
  const byType = (type) => resources.filter((resource) => resource.type === type);
  const scriptResources = byType("script");
  const stylesheetResources = byType("stylesheet");
  const imageResources = byType("image");
  const fontResources = byType("font");
  const totalTransferBytes = sum(resources.map((resource) => resource.sizeBytes));
  const summary = {
    totalRequests: resources.length,
    capturedRows: details.capturedRows || resources.length,
    totalRows: details.totalRows || resources.length,
    totalTransferBytes,
    totalTransferDisplay: formatWaterfallBytes(totalTransferBytes),
    scriptRequests: scriptResources.length,
    scriptBytes: sum(scriptResources.map((resource) => resource.sizeBytes)),
    stylesheetRequests: stylesheetResources.length,
    stylesheetBytes: sum(stylesheetResources.map((resource) => resource.sizeBytes)),
    imageRequests: imageResources.length,
    imageBytes: sum(imageResources.map((resource) => resource.sizeBytes)),
    fontRequests: fontResources.length,
    fontBytes: sum(fontResources.map((resource) => resource.sizeBytes)),
    thirdPartyRequests: resources.filter((resource) => !resource.firstParty).length,
    slowRequests: details.slowResources?.length || 0,
    renderBlockingCandidates: details.renderBlockingCandidates?.length || 0,
    largestResourceBytes: Math.max(0, ...resources.map((resource) => resource.sizeBytes || 0)),
    longestDurationMs: Math.max(0, ...resources.map((resource) => resource.durationMs || 0)),
    sizeCoverage: totalTransferBytes > 0 ? "bytes-observed" : "bytes-unavailable"
  };
  summary.scriptBytesDisplay = formatWaterfallBytes(summary.scriptBytes);
  summary.stylesheetBytesDisplay = formatWaterfallBytes(summary.stylesheetBytes);
  summary.imageBytesDisplay = formatWaterfallBytes(summary.imageBytes);
  summary.fontBytesDisplay = formatWaterfallBytes(summary.fontBytes);
  return summary;
}

function emptySummary() {
  return {
    totalRequests: 0,
    capturedRows: 0,
    totalRows: 0,
    totalTransferBytes: 0,
    totalTransferDisplay: "0 B",
    scriptRequests: 0,
    scriptBytes: 0,
    scriptBytesDisplay: "0 B",
    stylesheetRequests: 0,
    stylesheetBytes: 0,
    stylesheetBytesDisplay: "0 B",
    imageRequests: 0,
    imageBytes: 0,
    imageBytesDisplay: "0 B",
    fontRequests: 0,
    fontBytes: 0,
    fontBytesDisplay: "0 B",
    thirdPartyRequests: 0,
    slowRequests: 0,
    renderBlockingCandidates: 0,
    largestResourceBytes: 0,
    longestDurationMs: 0,
    sizeCoverage: "bytes-unavailable"
  };
}

function buildRepairOpportunities(waterfall) {
  return resourceWaterfallFindings(waterfall, "home", "")
    .map((finding, index) => ({
      id: `waterfall-${index + 1}`,
      title: finding.title.replace(/ on home$/, ""),
      severity: finding.severity,
      proof: finding.evidence,
      fix: finding.fix,
      estimatedEffort: finding.severity === "warning" ? "1-3 hours" : "30-90 min",
      workType: "performance"
    }))
    .slice(0, 6);
}

function isRenderBlockingCandidate(resource, navigation = {}) {
  if (resource.renderBlockingStatus === "blocking") return true;
  if (!["script", "stylesheet"].includes(resource.type)) return false;
  const cutoff = positiveNumber(navigation.domContentLoadedMs) ||
    positiveNumber(navigation.loadEventMs) ||
    1500;
  return resource.startTimeMs <= Math.max(1500, cutoff);
}

function summarizeThirdPartyHosts(resources) {
  const hosts = new Map();
  for (const resource of resources) {
    if (resource.firstParty || !resource.host) continue;
    const current = hosts.get(resource.host) || {
      host: resource.host,
      requests: 0,
      transferBytes: 0,
      slowRequests: 0
    };
    current.requests += 1;
    current.transferBytes += resource.sizeBytes || 0;
    if (resource.durationMs >= SLOW_RESOURCE_MS) current.slowRequests += 1;
    hosts.set(resource.host, current);
  }
  return [...hosts.values()]
    .sort((a, b) => b.requests - a.requests || b.transferBytes - a.transferBytes)
    .slice(0, 10)
    .map((host) => ({
      ...host,
      transferDisplay: formatWaterfallBytes(host.transferBytes)
    }));
}

function classifyResource(initiatorType = "", pathname = "") {
  const type = String(initiatorType || "").toLowerCase();
  if (["script"].includes(type)) return "script";
  if (["css", "link"].includes(type) || /\.(css)(?:[?#]|$)/i.test(pathname)) return "stylesheet";
  if (["img", "image"].includes(type) || /\.(png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i.test(pathname)) return "image";
  if (["font"].includes(type) || /\.(woff2?|ttf|otf|eot)(?:[?#]|$)/i.test(pathname)) return "font";
  if (["fetch", "xmlhttprequest", "beacon"].includes(type)) return "fetch";
  if (["iframe", "frame"].includes(type)) return "frame";
  if (["navigation"].includes(type)) return "document";
  return type || "other";
}

function formatResourceList(resources = [], mode = "size") {
  return resources.slice(0, 3).map((resource) => {
    const value = mode === "duration"
      ? `${Math.round(resource.durationMs)}ms`
      : formatWaterfallBytes(resource.sizeBytes);
    return `${resourceLabel(resource)} (${value})`;
  }).join("; ");
}

function formatThirdPartyHosts(hosts = []) {
  return hosts.slice(0, 3).map((host) => `${host.host} (${host.requests})`).join(", ") || "third-party hosts";
}

function resourceLabel(resource = {}) {
  return resource.label || resource.host || resource.url || "resource";
}

function resourceLabelFromUrl(url, fallback = "") {
  if (!url) return fallback.slice(0, 120);
  const path = url.pathname.split("/").filter(Boolean).pop() || url.hostname;
  return path.slice(0, 120);
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function rounded(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}
