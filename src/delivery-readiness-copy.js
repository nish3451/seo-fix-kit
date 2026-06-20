const CUSTOMER_DELIVERY_BLOCKER_TEXT = {
  payment_unconfirmed: "Payment confirmation is still pending.",
  status_not_deliverable: "The repair pass has not reached the delivery stage yet.",
  proposal_state_unavailable: "Repair proposal status is temporarily unavailable.",
  approved_proposal_missing: "A repair proposal still needs your approval.",
  customer_note_missing: "We are preparing your delivery update.",
  delivery_link_missing: "We are preparing the delivery link.",
  final_rerun_missing: "Final rerun proof is not attached yet."
};

export function deliveryReadinessLabel(readiness = {}) {
  if (readiness.status === "delivered") return "Delivered";
  if (readiness.readyForDelivery) return "Ready for delivery";
  if (readiness.status === "blocked") return "Waiting on repair proof";
  if (readiness.readyForStart) return "Repair can start";
  return "Waiting to start";
}

export function deliveryReadinessText(readiness = {}) {
  if (readiness.status === "delivered") return "Delivery and rerun proof are attached.";
  if (readiness.readyForDelivery) {
    return "Delivery note, delivery link, approval, and rerun proof are ready.";
  }
  const blockers = (readiness.blockers || [])
    .map((blocker) => CUSTOMER_DELIVERY_BLOCKER_TEXT[blocker.id] || "We are still preparing this repair pass.")
    .filter(Boolean);
  const uniqueBlockers = [...new Set(blockers)];
  if (uniqueBlockers.length) return uniqueBlockers.slice(0, 3).join(" ");
  return "We are waiting for payment confirmation and repair proof.";
}
