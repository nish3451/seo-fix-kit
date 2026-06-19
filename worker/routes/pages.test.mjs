import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rootSitemap } from "../../shared/audit-engine.js";
import {
  homeMarkdown,
  llmsText,
  methodologyHtml,
  packagesHtml
} from "./pages.js";

const origin = "https://seofixkit.com";

test("public proof pages expose methodology and package ladder without overclaims", () => {
  const methodology = methodologyHtml(origin);
  const packages = packagesHtml(origin);
  const combined = `${methodology}\n${packages}`;

  assert.match(methodology, /Proof first\. Repairs second\. Claims last\./);
  assert.match(methodology, /proof-derived AI Answer Readiness/);
  assert.match(methodology, /No AI visibility tracking/);
  assert.match(methodology, /draft-only growth briefs/);
  assert.match(methodology, /No hidden site writes/);
  assert.match(packages, /SEO Fix Pack/);
  assert.match(packages, /Dodo shows the actual checkout price/);
  assert.match(packages, /Roadmap/);
  assert.doesNotMatch(combined, /completed 50K rendered validation/i);
  assert.doesNotMatch(combined, /guaranteed rankings/i);
});

test("machine-readable public surfaces list proof pages and limits", () => {
  const llms = llmsText(origin);
  const markdown = homeMarkdown(origin);
  const sitemap = rootSitemap(origin);

  for (const path of ["/demo", "/methodology", "/packages"]) {
    assert.match(llms, new RegExp(`${origin}${path}`));
    assert.match(markdown, new RegExp(`${origin}${path}`));
    assert.match(sitemap, new RegExp(`${origin}${path}`));
  }
  assert.match(llms, /Does not provide live AI-engine visibility tracking/);
  assert.match(llms, /Does not auto-publish growth content/);
  assert.match(llms, /Does not publish CMS changes/);
});

test("static public skill and sitemap files keep buyer-facing boundaries", () => {
  const skill = readFileSync(new URL("../../public/.well-known/skill.md", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");

  for (const path of ["/demo", "/methodology", "/packages", "/support", "/terms"]) {
    assert.match(skill, new RegExp(`${origin}${path}`));
    assert.match(sitemap, new RegExp(`${origin}${path}`));
  }

  assert.match(skill, /not live AI-engine sampling/i);
  assert.match(skill, /not auto-publishing/i);
  assert.match(skill, /roadmap until the required integrations, billing, and proof gates are live/i);
  assert.match(skill, /does not provide live AI-engine visibility tracking or AI citation monitoring/i);
  assert.match(skill, /does not guarantee rankings, traffic, indexing, or revenue/i);
  assert.doesNotMatch(skill, /guaranteed rankings|guarantees rankings|guarantees traffic/i);
  assert.doesNotMatch(skill, /provides live AI-engine visibility tracking/i);
  assert.doesNotMatch(`${skill}\n${sitemap}`, /fixture|127\.0\.0\.1|localhost|private\.example/i);
});
