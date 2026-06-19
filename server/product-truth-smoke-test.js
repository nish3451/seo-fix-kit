import assert from "node:assert/strict";
import { offerCatalog, sellableOffers } from "../shared/offers.js";
import { homeMarkdown, llmsText, supportHtml, termsHtml } from "../worker/routes/pages.js";

const origin = "https://seofixkit.com";
const llms = llmsText(origin);
const home = homeMarkdown(origin);
const support = supportHtml(origin);
const terms = termsHtml(origin);
const offers = offerCatalog({ fixPackCheckoutReady: true });

assert.equal(sellableOffers(offers).map((offer) => offer.key).join(","), "fix_pack");
assert.equal(llms.includes("monthly checkout remains entitlement-gated and not live"), true);
assert.equal(llms.includes("distinct Repair Sprint checkout is not live yet"), true);
assert.equal(llms.includes("paid Agency Workspace checkout is not live yet"), true);
assert.equal(llms.includes("Does not claim llms.txt is required for Google Search"), true);
assert.equal(home.includes("No ranking promise is made."), true);
assert.equal(support.includes("No ranking, traffic, or revenue promise is made."), true);
assert.equal(terms.includes("No ranking, indexing, traffic, revenue, or search-engine outcome is promised"), true);
assert.equal(/\$199-\$399\/mo/.test(llms), false);
assert.equal(/\$299-\$799\/mo/.test(llms), false);

console.log(JSON.stringify({ ok: true, checked: "product truth and offer gates" }));
