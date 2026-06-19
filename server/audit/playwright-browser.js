// Playwright adapter for the shared audit engine.
//
// The engine was written against @cloudflare/puppeteer and uses exactly this
// browser surface:
//   - browser.newPage()
//   - browser.close()
//   - page.goto(url, { waitUntil: "networkidle0", timeout })
//   - page.evaluate(pageFunction)
//   - page.close()
//   - response.status() on the goto() result
// Playwright matches all of it except puppeteer's waitUntil vocabulary
// ("networkidle0"/"networkidle2" vs playwright's "networkidle") and
// page.setUserAgent (puppeteer-only; playwright fixes the UA when the
// context is created). This wrapper presents the puppeteer-shaped facade.
import { chromium } from "playwright";

const WAIT_UNTIL_MAP = {
  networkidle0: "networkidle",
  networkidle2: "networkidle",
  domcontentloaded: "domcontentloaded",
  load: "load"
};

export async function launchAuditBrowser() {
  const browser = await chromium.launch({ headless: true });
  return {
    async newPage() {
      const page = await browser.newPage();
      return wrapPage(page);
    },
    close: () => browser.close()
  };
}

function wrapPage(page) {
  return {
    goto: (url, options = {}) =>
      page.goto(url, {
        ...options,
        waitUntil: WAIT_UNTIL_MAP[options.waitUntil] || options.waitUntil || "load"
      }),
    route: (pattern, handler) => page.route(pattern, handler),
    evaluate: (pageFunction, ...args) => page.evaluate(pageFunction, ...args),
    // puppeteer-only; playwright sets the user agent at context creation.
    setUserAgent: async () => {},
    close: () => page.close()
  };
}
