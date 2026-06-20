import { safeDodoCheckoutUrl } from "./dodo-checkout-url.js";

function monitoringCheckoutDisabled({ checkoutReady = false, status = "idle", hasEligibleSite = true } = {}) {
  return status === "submitting" || !checkoutReady || !hasEligibleSite;
}

function monitoringCheckoutOutcome(payload = {}) {
  const checkoutUrl = safeDodoCheckoutUrl(payload.checkoutUrl || "");
  if (checkoutUrl) {
    return {
      status: "redirecting",
      message: payload.message || "Opening Dodo checkout.",
      checkoutUrl
    };
  }
  if (payload.checkoutUrl) {
    return {
      status: "error",
      message: "Checkout returned an invalid provider URL.",
      checkoutUrl: ""
    };
  }
  if (payload.mode === "active") {
    return {
      status: "success",
      message: payload.message || "Proof Monitoring is already active.",
      checkoutUrl: ""
    };
  }
  return {
    status: payload.checkoutAvailable === false ? "unavailable" : "error",
    message: payload.message || payload.error || "Proof Monitoring checkout is unavailable.",
    checkoutUrl: ""
  };
}

function monitoringCheckoutErrorOutcome(error) {
  return {
    status: "error",
    message: error?.message || "Proof Monitoring checkout is unavailable.",
    checkoutUrl: ""
  };
}

export {
  monitoringCheckoutDisabled,
  monitoringCheckoutErrorOutcome,
  monitoringCheckoutOutcome
};
