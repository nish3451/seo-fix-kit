// Local (dev server + smoke test) instance of the shared production audit
// engine. Same pipeline the Cloudflare Worker ships; only the browser launch
// (Playwright instead of Workers Browser Rendering) and env wiring differ.
// allowLocalAudits lets 127.0.0.1 fixtures be crawled, rendered, and
// resource-checked, mirroring the old local analyzer; production keeps the
// strict public-URL guard.
import { createAuditEngine } from "../../shared/audit-engine.js";
import { launchAuditBrowser } from "./playwright-browser.js";

const engine = createAuditEngine({
  launchBrowser: launchAuditBrowser,
  pagespeedApiKey: process.env.GOOGLE_PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY || "",
  pagespeedDisabled: process.env.SEOFIXKIT_PAGESPEED_DISABLED === "1",
  allowLocalAudits: true
});

export function auditUrl(inputUrl, options = {}) {
  return engine.auditUrl(inputUrl, options);
}
