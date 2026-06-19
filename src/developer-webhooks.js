export const DEVELOPER_WEBHOOK_EVENTS = [
  "audit.completed",
  "audit.failed",
  "repair_action.drafted",
  "repair_action.approved",
  "repair_action.applied",
  "repair_action.fixed",
  "repair_action.regressed"
];

export function developerWebhookRequest(url) {
  return {
    endpoint: "/api/developer/webhooks",
    init: {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        events: DEVELOPER_WEBHOOK_EVENTS
      })
    }
  };
}
