/* ==================================================================
   EVERY BRAND WITH 20+ PRODUCTS HAS ITS LANDING (#443 c.6585655315 P2).

   LEGO (708), Barbie, Hot Wheels, Play-Doh, Nerf, Fisher-Price,
   Pokémon, L'Oréal, Maybelline... had no brand page: Walmart's rows
   carry no brand field, so the brand index (which, unlike search, did
   not read the brand off the title) never counted them, and a search
   fell to a department or the grid. Maison Kitsuné's page sat under the
   misspelled slug maisonkitsun. The search placeholder suggested LEGO,
   whose brand file 404'd.

   The landing is the Adidas pattern (_brand-core.js buildRails): the
   brand's Ofertas (everything of the brand on sale, every store) first,
   then one rail per store that carries it, most products first.

   RUNNING IT
     node scripts/test/brand-landing-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { brandKeyOf } from "../../netlify/functions/_brand-core.js";
import { STATIC_MIN, BRAND_PAGE_MIN } from "../build-brand-index.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const readJSON = (rel) => JSON.parse(readFileSync(ROOT + rel, "utf8"));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const DEST = readJSON("assets/search/destinations.json");
const head = (key) => readJSON(`assets/sections/marca/${key}.json`);

await check(`every brand with ${BRAND_PAGE_MIN}+ products in search has a brand page and a search destination`, () => {
  assert.ok(STATIC_MIN <= BRAND_PAGE_MIN, "the static-head threshold is above the landing rule");
  const idx = readJSON("assets/search/catalog-index.json");
  const bi = idx.fields.indexOf("brand");
  const n = {}, label = {};
  for (const r of idx.rows) { const k = brandKeyOf(r[bi]); if (!k) continue; n[k] = (n[k] || 0) + 1; label[k] = r[bi]; }
  const missing = Object.keys(n).filter((k) => n[k] >= BRAND_PAGE_MIN && (!existsSync(`${ROOT}assets/sections/marca/${k}.json`) || !DEST.brands[k]))
    .sort((a, b) => n[b] - n[a]).map((k) => `${label[k]} (${n[k]})`);
  assert.deepEqual(missing, [], `${missing.length} brands with ${BRAND_PAGE_MIN}+ products have no landing`);
});

const NAMED = [["lego", "LEGO"], ["barbie", "Barbie"], ["hotwheels", "Hot Wheels"], ["playdoh", "Play-Doh"], ["nerf", "Nerf"],
  ["fisherprice", "Fisher-Price"], ["pokemon", null], ["maisonkitsune", "Maison Kitsuné"], ["loreal", null], ["alaia", "ALAÏA"], ["maybelline", "Maybelline"]];

await check("Danny's list: LEGO, Barbie, Hot Wheels, Play-Doh, Nerf, Fisher-Price, Pokémon, Maison Kitsuné, L'Oréal, Alaïa, Maybelline each have the landing", () => {
  for (const [key, label] of NAMED) {
    assert.ok(existsSync(`${ROOT}assets/sections/marca/${key}.json`), `${key}.json missing`);
    const h = head(key);
    if (label) assert.equal(h.label, label, key);
    assert.ok(h.count >= BRAND_PAGE_MIN, `${key}: ${h.count}`);
    assert.ok(DEST.brands[key], `${key} is not a search destination`);
  }
});

await check("the Adidas pattern on each: Ofertas of the brand first (when anything is on sale), then one rail per store, most products first", () => {
  for (const [key] of [...NAMED, ["adidas"]]) {
    const h = head(key);
    const rails = h.rails.slice();
    const anySale = rails.some((r) => r.cards.some((c) => c.s > 0));
    if (anySale) {
      assert.equal(rails[0].title, "Ofertas de " + h.label, `${key}: the first rail is «${rails[0].title}»`);
      assert.ok(!rails[0].store, key);
      rails.shift();
    }
    assert.ok(rails.length >= 1, `${key}: no store rail`);
    for (const r of rails) {
      assert.ok(r.store, `${key}: «${r.title}» is not a store rail`);
      assert.ok(r.title.startsWith(h.label + " en "), `${key}: «${r.title}»`);
    }
    for (let i = 1; i < rails.length; i++) assert.ok(rails[i - 1].count >= rails[i].count, `${key}: store rails out of order`);
    for (const r of h.rails) for (const c of r.cards) assert.ok(c.i, `${key}: a card with no photo`);
  }
});

await check("the search placeholder's brand (LEGO) opens a live brand page", () => {
  const html = readFileSync(ROOT + "index.html", "utf8");
  const ph = /id="salesSearchInput"[^>]*placeholder="([^"]*)"/.exec(html);
  assert.ok(ph, "no sales search placeholder");
  for (const word of ph[1].replace(/^[^:]*:/, "").split(/[,…]/).map((w) => w.trim()).filter(Boolean)) {
    const key = brandKeyOf(word);
    if (!/^[A-Z]{2,}$/.test(word)) continue;   /* the brand names, written as brands */
    assert.ok(existsSync(`${ROOT}assets/sections/marca/${key}.json`), `the placeholder suggests ${word}; ${key}.json does not exist`);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL  " + f + "\n");
process.exit(failures.length ? 1 : 0);
