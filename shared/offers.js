const OFFER_KEYS = {
  FIX_PACK: "fix_pack",
  MONITORING: "proof_monitoring",
  REPAIR_SPRINT: "repair_sprint",
  SEO_GEO_AGENT: "seo_geo_repair_agent",
  AGENCY_WORKSPACE: "agency_workspace"
};

const OFFER_CATALOG = [
  {
    key: OFFER_KEYS.FIX_PACK,
    name: "SEO Fix Pack",
    type: "one_time",
    stage: "live_beta",
    statusLabel: "Live beta",
    priceRange: "Dodo checkout price",
    checkoutState: "report_checkout",
    description: "One proof-backed repair pass for one saved report plus one rerun after fixes.",
    availability: "Starts from a saved report with proven issues.",
    requirements: ["Saved report", "Proven findings", "Dodo checkout config", "No ranking promises"],
    limits: { reports: 1, reruns: 1 }
  },
  {
    key: OFFER_KEYS.MONITORING,
    name: "Proof Monitoring",
    type: "subscription",
    stage: "beta_gated",
    statusLabel: "Entitlement not live",
    priceRange: "$49-$99/mo target",
    checkoutState: "paused",
    description: "Recurring proof monitoring, report deltas, and change alerts for verified sites.",
    availability: "Can be packaged after subscription entitlements are wired to audit schedules.",
    requirements: ["Verified site", "Audit schedules", "Report deltas", "Billing entitlement"],
    limits: { monitoredSites: 1, cadenceDays: 7 }
  },
  {
    key: OFFER_KEYS.REPAIR_SPRINT,
    name: "Repair Sprint",
    type: "one_time",
    stage: "beta_gated",
    statusLabel: "Needs approved execution",
    priceRange: "$249-$499 one-time target",
    checkoutState: "paused",
    description: "A scoped repair queue, owner approval, delivery notes, and final rerun proof.",
    availability: "Can be sold after executable proposal queues are reliable.",
    requirements: ["Saved report", "Executable proposals", "Owner approval", "Final rerun proof"],
    limits: { proposalQueue: 1, reruns: 1 }
  },
  {
    key: OFFER_KEYS.SEO_GEO_AGENT,
    name: "SEO/GEO Repair Agent",
    type: "subscription",
    stage: "planned",
    statusLabel: "Planned",
    priceRange: "$199-$399/mo target",
    checkoutState: "paused",
    description: "Recurring SEO and AI-search readiness repair proposals from live proof.",
    availability: "Can be sold after recurring prioritization and approval workflows exist.",
    requirements: ["Verified site", "Recurring monitors", "Keyword or opportunity inputs", "Owner approval"],
    limits: { monitoredSites: 1, monthlyProposalBatches: 1 }
  },
  {
    key: OFFER_KEYS.AGENCY_WORKSPACE,
    name: "Agency Workspace",
    type: "subscription",
    stage: "planned",
    statusLabel: "Planned",
    priceRange: "$299-$799/mo target",
    checkoutState: "paused",
    description: "Multi-client branded proof, client links, team assignment, and repair status.",
    availability: "Can be sold after workspace limits and client-safe proof are coherent.",
    requirements: ["Branding", "Client share links", "Team members", "Workspace entitlements"],
    limits: { clientSites: 5, teamSeats: 3 }
  }
];

const BETA_MONITOR_LIMIT = 5;
const BETA_AGENCY_LIMITS = {
  clientLinksPerReport: 10,
  teamSeats: 10,
  reportDomains: 1,
  clientSites: 5
};

function offerCatalog({ fixPackCheckoutReady = false, entitlements = [] } = {}) {
  const entitlementMap = new Map((entitlements || []).map((row) => [row.offer_key || row.offerKey, row]));
  return OFFER_CATALOG.map((offer) => {
    const entitlement = entitlementMap.get(offer.key) || null;
    const liveCheckout =
      offer.key === OFFER_KEYS.FIX_PACK ? fixPackCheckoutReady && offer.checkoutState === "report_checkout" : false;
    return {
      ...offer,
      checkoutLive: liveCheckout,
      entitlementStatus: entitlement?.status || "inactive",
      entitlementSource: entitlement?.source || "",
      currentPeriodEnd: entitlement?.current_period_end || entitlement?.currentPeriodEnd || "",
      limits: {
        ...offer.limits,
        ...parseLimits(entitlement?.limits_json || entitlement?.limitsJson)
      }
    };
  });
}

function monitoringAccessFromEntitlements(entitlements = [], activeCount = 0) {
  const entitlement = (entitlements || []).find(
    (row) => (row.offer_key || row.offerKey) === OFFER_KEYS.MONITORING && row.status === "active"
  );
  const limits = parseLimits(entitlement?.limits_json || entitlement?.limitsJson);
  const limit = entitlement ? Number(limits.monitoredSites || limits.monitors || 1) : BETA_MONITOR_LIMIT;
  return {
    offerKey: OFFER_KEYS.MONITORING,
    status: entitlement ? "active" : "beta_allowance",
    activeCount: Number(activeCount || 0),
    limit,
    remaining: Math.max(0, limit - Number(activeCount || 0)),
    cadenceDays: Number(limits.cadenceDays || 7),
    checkoutLive: false,
    message: entitlement
      ? "Proof Monitoring entitlement is active for this workspace."
      : "Private beta includes weekly proof monitoring while paid monitoring checkout is gated."
  };
}

function repairSprintEligibilityFromProposals(proposals = [], fixRequest = null) {
  const executable = (proposals || []).filter((proposal) => (proposal.executionMode || proposal.execution_mode) !== "unsupported");
  const approved = executable.filter((proposal) => (proposal.approvalStatus || proposal.approval_status) === "approved");
  const delivered = executable.filter((proposal) => (proposal.deliveryStatus || proposal.delivery_status) === "delivered");
  const paidStatus = fixRequest?.status || "";
  const hasPaidRequest = ["paid", "in_progress", "delivered"].includes(paidStatus);
  const status = !executable.length
    ? "unsupported"
    : approved.length
      ? hasPaidRequest
        ? "active"
        : "approval_ready"
      : "needs_owner_approval";
  return {
    offerKey: OFFER_KEYS.REPAIR_SPRINT,
    status,
    checkoutLive: false,
    priceRange: "$249-$499 one-time target",
    executable: executable.length,
    approved: approved.length,
    delivered: delivered.length,
    hasPaidRequest,
    message:
      status === "unsupported"
        ? "This report does not have enough executable proposal proof for a Repair Sprint."
        : status === "needs_owner_approval"
          ? "Approve at least one executable proposal before packaging this as a Repair Sprint."
          : hasPaidRequest
            ? "Repair Sprint execution can use the paid Fix Pack fulfillment path for this report."
            : "Proposal approval is ready; a distinct Repair Sprint checkout remains gated until product billing is wired."
  };
}

function agencyWorkspaceAccessFromEntitlements(entitlements = [], usage = {}) {
  const entitlement = (entitlements || []).find(
    (row) => (row.offer_key || row.offerKey) === OFFER_KEYS.AGENCY_WORKSPACE && row.status === "active"
  );
  const limits = {
    ...BETA_AGENCY_LIMITS,
    ...parseLimits(entitlement?.limits_json || entitlement?.limitsJson)
  };
  return {
    offerKey: OFFER_KEYS.AGENCY_WORKSPACE,
    status: entitlement ? "active" : "beta_allowance",
    checkoutLive: false,
    limits,
    usage: {
      clientLinks: Number(usage.clientLinks || 0),
      teamSeats: Number(usage.teamSeats || 0),
      reportDomains: Number(usage.reportDomains || 0),
      clientSites: Number(usage.clientSites || 0)
    },
    message: entitlement
      ? "Agency Workspace entitlement is active for this workspace."
      : "Private beta includes white-label proof tools while Agency Workspace checkout is gated."
  };
}

function sellableOffers(offers = []) {
  return offers.filter((offer) => offer.checkoutLive || offer.entitlementStatus === "active");
}

function parseLimits(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export {
  OFFER_KEYS,
  OFFER_CATALOG,
  BETA_AGENCY_LIMITS,
  BETA_MONITOR_LIMIT,
  agencyWorkspaceAccessFromEntitlements,
  offerCatalog,
  monitoringAccessFromEntitlements,
  repairSprintEligibilityFromProposals,
  sellableOffers
};
