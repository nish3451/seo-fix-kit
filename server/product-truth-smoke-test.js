import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offerCatalog, sellableOffers } from "../shared/offers.js";
import { homeMarkdown, llmsText, supportHtml, termsHtml } from "../worker/routes/pages.js";

const origin = "https://seofixkit.com";
const llms = llmsText(origin);
const home = homeMarkdown(origin);
const support = supportHtml(origin);
const terms = termsHtml(origin);
const offers = offerCatalog({ fixPackCheckoutReady: true });
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const schema = homepageSchema(index);
const schemaTypes = schemaTypesFromGraph(schema);

assert.equal(sellableOffers(offers).map((offer) => offer.key).join(","), "fix_pack");
assert.equal(llms.includes("monthly checkout remains entitlement-gated and not live"), true);
assert.equal(llms.includes("distinct Repair Sprint checkout is not live yet"), true);
assert.equal(llms.includes("paid Agency Workspace checkout is not live yet"), true);
assert.equal(llms.includes("Does not claim llms.txt is required for Google Search"), true);
assert.equal(llms.includes("owner-approved implementation packs"), true);
assert.equal(llms.includes("proof receipts after fixed rerun proof"), true);
assert.equal(llms.includes("Implementation packs and repair proof receipts are private handoff/proof documents only"), true);
assert.equal(home.includes("No ranking promise is made."), true);
assert.equal(support.includes("No ranking, traffic, or revenue promise is made."), true);
assert.equal(terms.includes("No ranking, indexing, traffic, revenue, or search-engine outcome is promised"), true);
assert.equal(/\$199-\$399\/mo/.test(llms), false);
assert.equal(/\$299-\$799\/mo/.test(llms), false);
assert.equal(app.includes("What happens after I enter a URL?"), true);
assert.equal(app.includes("What does the paid Fix Pack include?"), true);
assert.equal(app.includes("How is AI or GEO readiness handled?"), true);
assert.equal(app.includes("What is not live yet?"), true);
assert.equal(app.includes("does not auto-publish content"), true);
assert.equal(app.includes("guarantee rankings, traffic, indexing, AI citations, or revenue"), true);
for (const type of ["Organization", "WebSite", "SoftwareApplication", "FAQPage"]) {
  assert.equal(schemaTypes.has(type), true, `homepage schema should include ${type}`);
}
assert.equal(JSON.stringify(schema).includes("\"price\""), false);
assert.equal(/guaranteed rankings|guarantees rankings|guarantees traffic/i.test(JSON.stringify(schema)), false);

console.log(JSON.stringify({ ok: true, checked: "product truth and offer gates" }));

function homepageSchema(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "homepage JSON-LD script is present");
  return JSON.parse(match[1]);
}

function schemaTypesFromGraph(schema) {
  const nodes = Array.isArray(schema?.["@graph"]) ? schema["@graph"] : [schema];
  return new Set(nodes.map((node) => node?.["@type"]).filter(Boolean));
}
